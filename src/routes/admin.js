import { Router } from 'express';
import { config } from '../config.js';
import { adminCookie, rateLimit } from '../lib/security.js';
import { leadsCsv } from '../lib/leads.js';
import { recoverAbandonedCarts, markOrder } from '../lib/orders.js';
import { sendEmail, emails } from '../lib/email.js';
import { slugify, safeJson, timingSafeEq } from '../lib/util.js';
import * as A from '../views/admin.js';

export function adminRoutes(db) {
  const r = Router();
  const ctx = (req, res) => ({ ...res.locals.ctx, flash: req.query.saved ? 'Saved.' : '' });
  r.use((req, res, next) => { res.set('Cache-Control', 'no-store'); res.set('X-Robots-Tag', 'noindex, nofollow'); next(); });

  r.get('/login', (req, res) => res.send(A.loginPage({ ctx: ctx(req, res) })));
  r.post('/login', rateLimit('login', 10, 900e3), (req, res) => {
    const ok = timingSafeEq(String(req.body.email || '').toLowerCase(), config.admin.email.toLowerCase())
      & timingSafeEq(String(req.body.password || ''), config.admin.password);
    if (!ok) return res.status(401).send(A.loginPage({ ctx: ctx(req, res), error: 'Invalid email or password.' }));
    res.setCookie('adm', adminCookie(), { maxAge: 12 * 3600e3, sameSite: 'strict' });
    res.redirect(303, '/admin');
  });
  r.post('/logout', (req, res) => { res.clearCookie('adm', { path: '/' }); res.redirect(303, '/admin/login'); });

  r.use((req, res, next) => (req.isAdmin ? next() : res.redirect(303, '/admin/login')));

  // ---------- Dashboard ----------
  r.get('/', (req, res) => {
    const paid = "status IN ('paid','fulfilled','shipped')";
    const o30 = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(total_cents),0) s FROM orders WHERE ${paid} AND created_at > datetime('now','-30 days')`).get();
    const leads30 = db.prepare("SELECT COUNT(*) n FROM leads WHERE created_at > datetime('now','-30 days')").get().n;
    const totLeads = db.prepare('SELECT COUNT(*) n FROM leads').get().n;
    const customers = db.prepare("SELECT COUNT(*) n FROM leads WHERE status = 'customer'").get().n;
    const abandoned7 = db.prepare("SELECT COUNT(*) n FROM carts WHERE items != '[]' AND converted = 0 AND updated_at < datetime('now','-1 hour') AND updated_at > datetime('now','-7 days')").get().n;
    const byDay = new Map(db.prepare(`SELECT date(created_at) d, SUM(total_cents) s FROM orders WHERE ${paid} AND created_at > datetime('now','-14 days') GROUP BY d`).all().map((x) => [x.d, x.s]));
    const daily = Array.from({ length: 14 }, (_, i) => { const d = new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10); return { day: d, revenue: byDay.get(d) || 0 }; });
    res.send(A.dashboardPage({
      ctx: ctx(req, res), daily,
      stats: { revenue30: o30.s, orders30: o30.n, aov: o30.n ? Math.round(o30.s / o30.n) : 0, leads30, abandoned7, conversion: totLeads ? ((customers / totLeads) * 100).toFixed(1) : '0.0' },
      recentOrders: db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 8').all(),
      recentLeads: db.prepare('SELECT * FROM leads ORDER BY id DESC LIMIT 8').all(),
      sources: db.prepare("SELECT source, COUNT(*) n, SUM(status = 'customer') customers FROM leads GROUP BY source ORDER BY n DESC").all(),
      lowStock: db.prepare('SELECT id, name, stock FROM products WHERE active = 1 AND stock < 15 ORDER BY stock LIMIT 10').all(),
    }));
  });

  // ---------- Orders ----------
  r.get('/orders', (req, res) => {
    const status = String(req.query.status || '');
    const orders = status ? db.prepare('SELECT * FROM orders WHERE status = ? ORDER BY id DESC LIMIT 500').all(status) : db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 500').all();
    res.send(A.ordersPage({ ctx: ctx(req, res), orders, status }));
  });
  r.get('/orders/:id', (req, res, next) => {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(req.params.id));
    if (!order) return next();
    res.send(A.orderDetailPage({ ctx: ctx(req, res), order }));
  });
  r.post('/orders/:id', async (req, res, next) => {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(Number(req.params.id));
    if (!order) return next();
    const status = String(req.body.status);
    if (status === 'paid' && order.status !== 'paid') await markOrder(db, order.number, 'paid', { ref: order.payment_ref || 'manual' });
    db.prepare("UPDATE orders SET status = ?, tracking_number = ?, notes = ?, updated_at = datetime('now') WHERE id = ?")
      .run(status, String(req.body.tracking_number || '').slice(0, 100), String(req.body.notes || '').slice(0, 5000), order.id);
    if (status === 'shipped' && req.body.notify) {
      sendEmail(emails.shipped(db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id))).catch((e) => console.error('[email]', e.message));
    }
    res.redirect(303, `/admin/orders/${order.id}?saved=1`);
  });

  // ---------- Products ----------
  const categories = () => db.prepare('SELECT * FROM categories ORDER BY sort').all();
  r.get('/products', (req, res) => {
    res.send(A.productsPage({ ctx: ctx(req, res), products: db.prepare('SELECT p.*, c.name category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id ORDER BY p.id DESC').all() }));
  });
  r.get('/products/new', (req, res) => res.send(A.productFormPage({ ctx: ctx(req, res), categories: categories() })));
  r.get('/products/:id', (req, res, next) => {
    const p = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(req.params.id));
    if (!p) return next();
    res.send(A.productFormPage({ ctx: ctx(req, res), p, categories: categories() }));
  });
  r.post('/products/:id', (req, res) => {
    const b = req.body; const isNew = req.params.id === 'new';
    const specs = safeJson(b.specs || '{}', null); const faqs = safeJson(b.faqs || '[]', null);
    const row = {
      name: String(b.name || '').trim(), slug: slugify(b.slug || b.name || ''), brand: b.brand || '', category_id: Number(b.category_id),
      price_cents: Math.round(Number(b.price) * 100), compare_at_cents: b.compare_at ? Math.round(Number(b.compare_at) * 100) : null,
      sku: b.sku || null, stock: Math.max(0, Math.floor(Number(b.stock) || 0)), short_description: b.short_description || '', description: b.description || '',
      specs: JSON.stringify(specs || {}), faqs: JSON.stringify(faqs || []), nicotine_mg: b.nicotine_mg || '', flavor_profile: b.flavor_profile || '',
      seo_title: b.seo_title || '', seo_description: b.seo_description || '',
      contains_nicotine: b.contains_nicotine ? 1 : 0, featured: b.featured ? 1 : 0, active: b.active ? 1 : 0,
    };
    const fail = (error) => res.status(400).send(A.productFormPage({ ctx: ctx(req, res), p: { ...row, id: isNew ? undefined : Number(req.params.id) }, categories: categories(), error }));
    if (!row.name || !row.slug) return fail('Name is required.');
    if (!Number.isFinite(row.price_cents) || row.price_cents < 0) return fail('Price is invalid.');
    if (specs === null || typeof specs !== 'object' || Array.isArray(specs)) return fail('Specs must be a JSON object.');
    if (!Array.isArray(faqs)) return fail('FAQs must be a JSON array.');
    const cols = Object.keys(row);
    try {
      if (isNew) {
        const info = db.prepare(`INSERT INTO products (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map((c) => row[c]));
        return res.redirect(303, `/admin/products/${info.lastInsertRowid}?saved=1`);
      }
      db.prepare(`UPDATE products SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...cols.map((c) => row[c]), Number(req.params.id));
      res.redirect(303, `/admin/products/${req.params.id}?saved=1`);
    } catch (e) {
      if (/UNIQUE/.test(e.message)) return fail('Slug or SKU already in use.');
      throw e;
    }
  });
  r.post('/products/:id/delete', (req, res) => {
    db.prepare('DELETE FROM products WHERE id = ?').run(Number(req.params.id));
    res.redirect(303, '/admin/products?saved=1');
  });

  // ---------- Leads ----------
  function findLeads(q, status, limit = 1000) {
    const where = []; const args = [];
    if (q) { where.push('(email LIKE ? OR name LIKE ?)'); args.push(`%${q}%`, `%${q}%`); }
    if (status) { where.push('status = ?'); args.push(status); }
    return db.prepare(`SELECT * FROM leads ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY id DESC LIMIT ${limit}`).all(...args);
  }
  r.get('/leads', (req, res) => {
    const q = String(req.query.q || ''); const status = String(req.query.status || '');
    res.send(A.leadsPage({ ctx: ctx(req, res), leads: findLeads(q, status, 500), q, status }));
  });
  r.get('/leads.csv', (req, res) => {
    res.set('Content-Disposition', `attachment; filename="leads-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.type('text/csv').send(leadsCsv(findLeads('', '', 100000)));
  });
  r.get('/leads/:id', (req, res, next) => {
    const lead = db.prepare('SELECT * FROM leads WHERE id = ?').get(Number(req.params.id));
    if (!lead) return next();
    res.send(A.leadDetailPage({
      ctx: ctx(req, res), lead,
      events: db.prepare('SELECT * FROM lead_events WHERE lead_id = ? ORDER BY id DESC LIMIT 100').all(lead.id),
      orders: db.prepare('SELECT * FROM orders WHERE email = ? ORDER BY id DESC').all(lead.email),
    }));
  });
  r.post('/leads/:id', (req, res) => {
    db.prepare("UPDATE leads SET status = ?, notes = ?, updated_at = datetime('now') WHERE id = ?").run(String(req.body.status), String(req.body.notes || '').slice(0, 5000), Number(req.params.id));
    res.redirect(303, `/admin/leads/${req.params.id}?saved=1`);
  });

  // ---------- Abandoned carts ----------
  r.get('/carts', (req, res) => {
    res.send(A.cartsPage({ ctx: ctx(req, res), carts: db.prepare("SELECT * FROM carts WHERE email != '' AND items != '[]' AND converted = 0 ORDER BY updated_at DESC LIMIT 300").all() }));
  });
  r.post('/carts/recover', async (req, res) => { await recoverAbandonedCarts(db); res.redirect(303, '/admin/carts?saved=1'); });

  // ---------- Reviews ----------
  r.get('/reviews', (req, res) => {
    res.send(A.reviewsPage({ ctx: ctx(req, res), reviews: db.prepare('SELECT r.*, p.name product_name FROM reviews r JOIN products p ON p.id = r.product_id ORDER BY r.approved, r.id DESC').all() }));
  });
  r.post('/reviews/:id', (req, res) => {
    if (req.body.action === 'approve') db.prepare('UPDATE reviews SET approved = 1 WHERE id = ?').run(Number(req.params.id));
    if (req.body.action === 'delete') db.prepare('DELETE FROM reviews WHERE id = ?').run(Number(req.params.id));
    res.redirect(303, '/admin/reviews?saved=1');
  });

  // ---------- Discounts ----------
  r.get('/discounts', (req, res) => res.send(A.discountsPage({ ctx: ctx(req, res), discounts: db.prepare('SELECT * FROM discounts ORDER BY id DESC').all() })));
  r.post('/discounts', (req, res) => {
    const code = String(req.body.code || '').trim().toUpperCase();
    if (!/^[A-Z0-9_-]{2,40}$/.test(code)) return res.status(400).send('Invalid code');
    try {
      db.prepare('INSERT INTO discounts (code, percent_off, amount_off_cents, min_subtotal_cents, max_uses) VALUES (?,?,?,?,?)').run(
        code, Math.min(100, Math.max(0, Number(req.body.percent_off) || 0)), Math.round((Number(req.body.amount_off) || 0) * 100),
        Math.round((Number(req.body.min_subtotal) || 0) * 100), req.body.max_uses ? Number(req.body.max_uses) : null);
    } catch { return res.status(400).send('Code already exists'); }
    res.redirect(303, '/admin/discounts?saved=1');
  });
  r.post('/discounts/:id/toggle', (req, res) => {
    db.prepare('UPDATE discounts SET active = 1 - active WHERE id = ?').run(Number(req.params.id));
    res.redirect(303, '/admin/discounts?saved=1');
  });

  // ---------- Blog ----------
  r.get('/posts', (req, res) => res.send(A.postsPage({ ctx: ctx(req, res), posts: db.prepare('SELECT * FROM posts ORDER BY id DESC').all() })));
  r.get('/posts/new', (req, res) => res.send(A.postFormPage({ ctx: ctx(req, res) })));
  r.get('/posts/:id', (req, res, next) => {
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(Number(req.params.id));
    if (!post) return next();
    res.send(A.postFormPage({ ctx: ctx(req, res), post }));
  });
  r.post('/posts/:id', (req, res) => {
    const b = req.body; const slug = slugify(b.slug || b.title || '');
    if (!b.title || !slug) return res.status(400).send('Title is required');
    const vals = [slug, b.title, b.excerpt || '', b.body || '', b.seo_description || '', b.published ? 1 : 0];
    try {
      if (req.params.id === 'new') {
        const info = db.prepare('INSERT INTO posts (slug, title, excerpt, body, seo_description, published, author) VALUES (?,?,?,?,?,?,?)').run(...vals, `${config.store.name} Team`);
        return res.redirect(303, `/admin/posts/${info.lastInsertRowid}?saved=1`);
      }
      db.prepare("UPDATE posts SET slug=?, title=?, excerpt=?, body=?, seo_description=?, published=?, updated_at=datetime('now') WHERE id=?").run(...vals, Number(req.params.id));
    } catch { return res.status(400).send('Slug already in use'); }
    res.redirect(303, `/admin/posts/${req.params.id}?saved=1`);
  });

  return r;
}
