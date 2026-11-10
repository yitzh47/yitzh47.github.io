import { Router } from 'express';
import { config } from '../config.js';
import { getCart, saveCart, setItem, priceCart, lookupDiscount } from '../lib/commerce.js';
import { captureLead, unsubscribe } from '../lib/leads.js';
import { createOrder, markOrder } from '../lib/orders.js';
import { sendEmail, emails } from '../lib/email.js';
import { getProvider } from '../payments/index.js';
import { extractFaqs, hmac, safeJson, timingSafeEq, isEmail } from '../lib/util.js';
import { pages } from '../content.js';
import { faqLd } from '../seo.js';
import { rateLimit } from '../lib/security.js';
import * as V from '../views/store.js';

const PER_PAGE = 24;
const PRODUCT_SELECT = `SELECT p.*, c.name AS category_name, c.slug AS category_slug,
  (SELECT AVG(rating) FROM reviews r WHERE r.product_id = p.id AND r.approved = 1) AS rating_avg,
  (SELECT COUNT(*) FROM reviews r WHERE r.product_id = p.id AND r.approved = 1) AS rating_count
  FROM products p LEFT JOIN categories c ON c.id = p.category_id`;
const SORTS = {
  featured: 'p.featured DESC, p.stock > 0 DESC, p.id', 'price-asc': 'p.price_cents ASC', 'price-desc': 'p.price_cents DESC',
  newest: 'p.created_at DESC, p.id DESC', rating: 'rating_avg DESC NULLS LAST, rating_count DESC',
};

export function storeRoutes(db) {
  const r = Router();
  const ctx = (res, extra = {}) => ({ ...res.locals.ctx, ...extra });
  const utmOf = (req) => safeJson(req.cookies.utm || '{}', {});
  const orderCookieSig = (n) => hmac(config.sessionSecret, `order.${n}`);
  const canViewOrder = (req, n) => req.isAdmin || (req.cookies[`o_${n}`] && timingSafeEq(req.cookies[`o_${n}`], orderCookieSig(n)));

  const categories = () => db.prepare('SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.active = 1) AS n FROM categories c ORDER BY sort').all();

  function listProducts({ categoryId, q, sort, page }) {
    const where = ['p.active = 1']; const args = [];
    if (categoryId) { where.push('p.category_id = ?'); args.push(categoryId); }
    if (q) {
      for (const term of q.split(/\s+/).filter(Boolean).slice(0, 6)) {
        where.push("(p.name LIKE ? ESCAPE '\\' OR p.brand LIKE ? ESCAPE '\\' OR p.flavor_profile LIKE ? ESCAPE '\\' OR p.short_description LIKE ? ESCAPE '\\' OR c.name LIKE ? ESCAPE '\\')");
        const like = `%${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`;
        args.push(like, like, like, like, like);
      }
    }
    const sql = `${PRODUCT_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${SORTS[sort] || SORTS.featured}`;
    const all = db.prepare(sql).all(...args);
    const pages = Math.max(1, Math.ceil(all.length / PER_PAGE));
    const p = Math.min(Math.max(1, Number(page) || 1), pages);
    return { products: all.slice((p - 1) * PER_PAGE, p * PER_PAGE), page: p, pages };
  }

  // ---------- Catalog ----------
  r.get('/', (req, res) => {
    const featured = db.prepare(`${PRODUCT_SELECT} WHERE p.active = 1 AND p.featured = 1 ORDER BY p.id LIMIT 8`).all();
    const posts = db.prepare('SELECT * FROM posts WHERE published = 1 ORDER BY published_at DESC LIMIT 3').all();
    res.send(V.homePage({ featured, categories: categories(), posts, ctx: ctx(res) }));
  });

  r.get('/shop', (req, res) => {
    const q = String(req.query.q || '').trim().slice(0, 100);
    const sort = String(req.query.sort || 'featured');
    const { products, page, pages } = listProducts({ q, sort, page: req.query.page });
    res.send(V.listingPage({
      title: q ? `Search: ${q}` : 'Shop All Vapes, E-Liquids & Accessories', h1: q ? `Search results` : 'Shop all',
      description: 'Shop disposable vapes, pod systems, vape kits, e-liquids, nicotine salts and accessories. Adults 21+.',
      intro: q ? '' : 'Every device, flavor and accessory we carry — authentic and shipped fast.',
      products, categories: categories(), q, sort, canonical: page > 1 ? `/shop?page=${page}` : '/shop', page, pages,
      crumbs: [['Home', '/'], ['Shop', '/shop']], ctx: ctx(res, { q }),
    }));
  });

  r.get('/category/:slug', (req, res, next) => {
    const cat = db.prepare('SELECT * FROM categories WHERE slug = ?').get(req.params.slug);
    if (!cat) return next();
    const sort = String(req.query.sort || 'featured');
    const { products, page, pages } = listProducts({ categoryId: cat.id, sort, page: req.query.page });
    res.send(V.listingPage({
      title: cat.seo_title || cat.name, h1: cat.name, intro: cat.description, description: cat.seo_description || cat.description,
      products, categories: categories(), current: cat.slug, sort, canonical: `/category/${cat.slug}${page > 1 ? `?page=${page}` : ''}`, page, pages,
      crumbs: [['Home', '/'], ['Shop', '/shop'], [cat.name, `/category/${cat.slug}`]], ctx: ctx(res),
    }));
  });

  r.get('/products/:slug', (req, res, next) => {
    const p = db.prepare(`${PRODUCT_SELECT} WHERE p.slug = ? AND p.active = 1`).get(req.params.slug);
    if (!p) return next();
    const reviews = db.prepare('SELECT * FROM reviews WHERE product_id = ? AND approved = 1 ORDER BY created_at DESC LIMIT 20').all(p.id);
    const rating = { avg: Number(p.rating_avg || 0), count: Number(p.rating_count || 0) };
    const related = db.prepare(`${PRODUCT_SELECT} WHERE p.category_id = ? AND p.id != ? AND p.active = 1 ORDER BY p.featured DESC LIMIT 4`).all(p.category_id, p.id);
    res.send(V.productPage({ p, reviews, rating, related, ctx: ctx(res) }));
  });

  r.post('/products/:slug/reviews', rateLimit('review', 5, 3600e3), (req, res, next) => {
    const p = db.prepare('SELECT id, slug FROM products WHERE slug = ?').get(req.params.slug);
    if (!p) return next();
    if (req.body.website) return res.redirect(303, `/products/${p.slug}#reviews`); // honeypot
    const rating = Math.min(5, Math.max(1, Number(req.body.rating) || 5));
    const author = String(req.body.author || '').trim().slice(0, 60);
    const body = String(req.body.body || '').trim().slice(0, 2000);
    if (author && body) db.prepare('INSERT INTO reviews (product_id, author, rating, body, approved) VALUES (?,?,?,?,0)').run(p.id, author, rating, body);
    res.redirect(303, `/products/${p.slug}?review=thanks#reviews`);
  });

  // ---------- Blog ----------
  r.get('/blog', (req, res) => {
    res.send(V.blogIndexPage({ posts: db.prepare('SELECT * FROM posts WHERE published = 1 ORDER BY published_at DESC').all(), ctx: ctx(res) }));
  });
  r.get('/blog/:slug', (req, res, next) => {
    const post = db.prepare('SELECT * FROM posts WHERE slug = ? AND published = 1').get(req.params.slug);
    if (!post) return next();
    const products = db.prepare(`${PRODUCT_SELECT} WHERE p.active = 1 AND p.featured = 1 LIMIT 4`).all();
    res.send(V.postPage({ post, faqs: extractFaqs(post.body), products, ctx: ctx(res) }));
  });

  // ---------- Static / policy pages ----------
  for (const [slug, pg] of Object.entries(pages)) {
    r.get(`/${slug}`, (req, res) => res.send(V.staticPage({ slug, ...pg, ld: [faqLd(extractFaqs(pg.md))], ctx: ctx(res) })));
  }
  r.get('/contact', (req, res) => res.send(V.staticPage({
    slug: 'contact', title: 'Contact Us', description: `Contact ${config.store.name} customer support.`,
    md: `Email **${config.store.email}** or call **${config.store.phone}** (Mon–Fri, 9am–5pm CT). Or send us a message below.`,
    extra: V.contactExtra(res.locals.ctx, req.query.sent === '1'), ctx: ctx(res),
  })));
  r.post('/contact', rateLimit('contact', 5, 3600e3), (req, res) => {
    if (req.body.website) return res.redirect(303, '/contact?sent=1');
    try {
      captureLead(db, {
        email: req.body.email, name: req.body.name, phone: req.body.phone, source: 'contact', consentSms: req.body.sms === '1',
        utm: utmOf(req), event: 'contact_message', data: { message: String(req.body.message || '').slice(0, 5000) },
      });
      sendEmail({ to: config.store.email, subject: `Contact form: ${String(req.body.name || '').slice(0, 80)}`, html: `<p>From ${String(req.body.email).replace(/</g, '&lt;')}</p><pre>${String(req.body.message || '').replace(/</g, '&lt;')}</pre>` }).catch(() => {});
    } catch (e) { return res.status(400).send(e.message); }
    res.redirect(303, '/contact?sent=1');
  });

  // ---------- Lead generation ----------
  r.post('/leads', rateLimit('lead', 10, 600e3), (req, res) => {
    const wantsJson = req.is('json') || req.accepts(['html', 'json']) === 'json';
    if (req.body.website) return wantsJson ? res.json({ ok: true }) : res.redirect(303, '/?subscribed=1'); // honeypot: pretend success
    try {
      const utm = utmOf(req);
      const { created } = captureLead(db, { email: req.body.email, name: req.body.name, source: String(req.body.source || 'unknown').slice(0, 30), utm, landingPage: utm.landing || req.get('referer') || '' });
      if (created) sendEmail(emails.welcome(String(req.body.email).trim().toLowerCase())).catch((e) => console.error('[email]', e.message));
      res.setCookie('lead', '1', { httpOnly: false });
      const msg = `You're in! Use code ${config.commerce.leadDiscountCode} for ${config.commerce.leadDiscountPct}% off — we also emailed it to you.`;
      return wantsJson ? res.json({ ok: true, message: msg, code: config.commerce.leadDiscountCode }) : res.redirect(303, '/?subscribed=1');
    } catch (e) {
      return wantsJson ? res.status(400).json({ ok: false, message: e.message }) : res.status(400).send(e.message);
    }
  });

  r.get('/unsubscribe', (req, res) => {
    if (req.query.email) unsubscribe(db, req.query.email);
    res.send(V.staticPage({ slug: 'unsubscribe', title: 'Unsubscribed', md: 'You have been unsubscribed from marketing emails. Order updates will still be sent.', ctx: ctx(res) }));
  });

  r.post('/age-verify', (req, res) => { res.setCookie('age_ok', '1', { httpOnly: false, maxAge: 30 * 24 * 3600e3 }); res.json({ ok: true }); });

  // ---------- Cart ----------
  r.get('/cart', (req, res) => res.send(V.cartPage({ priced: priceCart(db, getCart(db, req.cartId)), ctx: ctx(res) })));

  r.post('/api/cart', (req, res) => {
    const cart = getCart(db, req.cartId);
    try { setItem(db, cart, req.body.productId, req.body.qty ?? 1, { add: !!req.body.add }); } catch (e) { return res.status(400).json({ ok: false, message: e.message }); }
    saveCart(db, cart);
    const priced = priceCart(db, cart);
    res.json({ ok: true, count: priced.count, subtotal: priced.subtotal, total: priced.total });
  });

  r.post('/api/cart/email', rateLimit('cartemail', 20, 600e3), (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!isEmail(email)) return res.status(400).json({ ok: false });
    const cart = getCart(db, req.cartId);
    cart.email = email; saveCart(db, cart);
    res.json({ ok: true });
  });

  r.post('/cart/discount', (req, res) => {
    const cart = getCart(db, req.cartId);
    const d = lookupDiscount(db, req.body.code);
    cart.discount_code = d ? d.code : '';
    saveCart(db, cart);
    res.redirect(303, '/cart');
  });

  r.get('/cart/restore/:id', (req, res) => {
    const c = db.prepare('SELECT id FROM carts WHERE id = ? AND converted = 0').get(req.params.id);
    if (c) res.setCookie('cid', c.id, { maxAge: 30 * 24 * 3600e3 });
    const cart = c && getCart(db, c.id);
    if (cart && !cart.discount_code) { cart.discount_code = 'COMEBACK10'; saveCart(db, cart); }
    res.redirect(303, '/cart');
  });

  // ---------- Checkout & payments ----------
  r.get('/checkout', (req, res) => {
    const cart = getCart(db, req.cartId);
    const priced = priceCart(db, cart);
    if (!priced.lines.length) return res.redirect(303, '/cart');
    res.send(V.checkoutPage({ priced, form: { email: cart.email }, ctx: ctx(res) }));
  });

  r.post('/checkout', rateLimit('checkout', 20, 600e3), async (req, res, next) => {
    const cart = getCart(db, req.cartId);
    let order;
    let provider;
    try {
      provider = getProvider();
      order = createOrder(db, cart, req.body, { utm: utmOf(req), provider: provider.name });
    } catch (e) {
      return res.status(400).send(V.checkoutPage({ priced: priceCart(db, cart, { state: req.body.state }), form: req.body, error: e.message, ctx: ctx(res) }));
    }
    try {
      res.setCookie(`o_${order.number}`, orderCookieSig(order.number), { maxAge: 30 * 24 * 3600e3 });
      const payment = await provider.createPayment(order, {
        returnUrl: `${config.baseUrl}/checkout/complete/${order.number}`,
        cancelUrl: `${config.baseUrl}/checkout?cancelled=1`,
      });
      if (payment.type === 'redirect') return res.redirect(303, payment.url);
      return res.send(V.paymentRedirectPage({ payment, ctx: ctx(res) }));
    } catch (e) { next(e); }
  });

  r.get('/checkout/demo-pay/:number', (req, res, next) => {
    if (config.payments.provider !== 'demo') return next();
    const order = db.prepare('SELECT * FROM orders WHERE number = ?').get(req.params.number);
    if (!order || !canViewOrder(req, order.number)) return next();
    res.send(V.demoPayPage({ order, ctx: ctx(res) }));
  });
  r.post('/checkout/demo-pay/:number', async (req, res, next) => {
    if (config.payments.provider !== 'demo') return next();
    getProvider(); // throws in production unless explicitly allowed
    const order = db.prepare('SELECT * FROM orders WHERE number = ?').get(req.params.number);
    if (!order || !canViewOrder(req, order.number)) return next();
    await markOrder(db, order.number, req.body.result === 'approve' ? 'paid' : 'failed', { ref: `demo_${Date.now()}`, amountCents: order.total_cents });
    res.redirect(303, `/checkout/complete/${order.number}`);
  });

  r.get('/checkout/complete/:number', (req, res, next) => {
    const order = db.prepare('SELECT * FROM orders WHERE number = ?').get(req.params.number);
    if (!order || !canViewOrder(req, order.number)) return next();
    res.send(V.orderCompletePage({ order, items: safeJson(order.items, []), ctx: ctx(res, { cartCount: 0 }) }));
  });

  r.get('/api/orders/:number/status', (req, res) => {
    const order = db.prepare('SELECT number, status FROM orders WHERE number = ?').get(req.params.number);
    if (!order || !canViewOrder(req, order.number)) return res.status(404).json({ ok: false });
    res.json({ ok: true, status: order.status });
  });

  r.post('/webhooks/payments/:provider', async (req, res) => {
    try {
      const provider = getProvider(req.params.provider);
      const result = await provider.handleWebhook(req.body, req.headers);
      if (result?.orderNumber) await markOrder(db, result.orderNumber, result.status, { ref: result.ref, amountCents: result.status === 'paid' ? result.amountCents : undefined });
      res.json({ ok: true });
    } catch (e) {
      console.error('[webhook]', e.message);
      res.status(400).json({ ok: false });
    }
  });

  return r;
}
