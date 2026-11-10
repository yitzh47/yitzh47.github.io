process.env.NODE_ENV = 'test';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { openDb } from '../src/db.js';
import { seed } from '../src/seed.js';
import { createApp } from '../src/app.js';
import { config } from '../src/config.js';
import { ageFromDob, markdown, extractFaqs } from '../src/lib/util.js';
import { verifySignature } from '../src/payments/authorizenet.js';
import { recoverAbandonedCarts } from '../src/lib/orders.js';

let server; let base; let db;

before(async () => {
  config.payments.authorizeNet.signatureKey = 'TESTKEY123';
  db = openDb(':memory:');
  seed(db);
  server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

/** Minimal browser: keeps cookies, extracts CSRF token. */
function browser() {
  const jar = new Map();
  let csrf = '';
  const req = async (path, opts = {}) => {
    const headers = { ...(opts.headers || {}), cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') };
    const res = await fetch(base + path, { redirect: 'manual', ...opts, headers });
    for (const c of res.headers.getSetCookie()) { const [kv] = c.split(';'); const i = kv.indexOf('='); jar.set(kv.slice(0, i), kv.slice(i + 1)); }
    const text = await res.text();
    const m = /name="csrf-token" content="([^"]+)"/.exec(text) || /name="_csrf" value="([^"]+)"/.exec(text);
    if (m) csrf = m[1];
    return { status: res.status, text, headers: res.headers, json: () => JSON.parse(text) };
  };
  return {
    jar, get: (p) => req(p),
    form: (p, data) => req(p, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ _csrf: csrf, ...data }).toString() }),
    json: (p, data) => req(p, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, Accept: 'application/json' }, body: JSON.stringify(data) }),
  };
}

const adultDob = '1990-05-20';
const validCheckout = { email: 'buyer@example.com', first_name: 'Pat', last_name: 'Doe', address1: '1 Elm St', city: 'Austin', state: 'TX', postal: '78701', dob: adultDob, attest: '1' };

test('utilities: age calculation, markdown escaping, FAQ extraction', () => {
  const now = new Date(Date.UTC(2026, 10, 8));
  assert.equal(ageFromDob('2005-11-08', now), 21);
  assert.equal(ageFromDob('2005-11-09', now), 20);
  assert.equal(ageFromDob('2005-02-30', now), -1);
  assert.ok(!markdown('<script>alert(1)</script>').includes('<script>'));
  assert.deepEqual(extractFaqs('## FAQ\n\n### Q1?\nA1.\n\n### Q2?\nA2.'), [{ q: 'Q1?', a: 'A1.' }, { q: 'Q2?', a: 'A2.' }]);
});

test('SEO: product page has canonical, Product + Breadcrumb JSON-LD, nicotine warning', async () => {
  const b = browser();
  const r = await b.get('/products/nimbus-5000-blue-razz');
  assert.equal(r.status, 200);
  assert.match(r.text, /<link rel="canonical" href="http:\/\/localhost:3000\/products\/nimbus-5000-blue-razz">/);
  const lds = [...r.text.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
  const product = lds.find((x) => x['@type'] === 'Product');
  assert.equal(product.offers.price, '19.99');
  assert.ok(product.aggregateRating);
  assert.ok(lds.some((x) => x['@type'] === 'BreadcrumbList'));
  assert.ok(lds.some((x) => x['@type'] === 'FAQPage'));
  assert.match(r.text, /WARNING: This product contains nicotine/);
});

test('AI-SEO: robots allows AI crawlers, llms.txt, sitemap and catalog', async () => {
  const b = browser();
  const robots = (await b.get('/robots.txt')).text;
  assert.match(robots, /User-agent: GPTBot/); assert.match(robots, /User-agent: ClaudeBot/); assert.match(robots, /Disallow: \/admin/);
  assert.match((await b.get('/llms.txt')).text, /^# Cloudline Vapor/);
  assert.match((await b.get('/llms-full.txt')).text, /## Vortex 200W Box Mod Kit/);
  assert.match((await b.get('/sitemap.xml')).text, /\/products\/driftpod-mini-kit/);
  const cat = (await b.get('/api/catalog.json')).json();
  assert.ok(cat.products.length >= 15);
});

test('search page is noindex; search finds products', async () => {
  const r = await browser().get('/shop?q=watermelon');
  assert.match(r.text, /noindex/);
  assert.match(r.text, /Saltline Watermelon/);
});

test('CSRF: POST without token is rejected', async () => {
  const r = await fetch(`${base}/leads`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'x@example.com' }) });
  assert.equal(r.status, 403);
});

test('lead capture: creates lead with UTM attribution, dedupes, honeypot ignored', async () => {
  const b = browser();
  await b.get('/?utm_source=tiktok&utm_medium=social&utm_campaign=launch');
  const r = await b.json('/leads', { email: 'Lead@Example.com', source: 'popup' });
  assert.equal(r.json().ok, true);
  assert.equal(r.json().code, config.commerce.leadDiscountCode);
  await b.json('/leads', { email: 'lead@example.com', source: 'footer' });
  const leads = db.prepare("SELECT * FROM leads WHERE email = 'lead@example.com'").all();
  assert.equal(leads.length, 1);
  assert.equal(leads[0].utm_source, 'tiktok');
  assert.equal(leads[0].source, 'popup');
  await b.json('/leads', { email: 'bot@example.com', website: 'spam' });
  assert.equal(db.prepare("SELECT COUNT(*) n FROM leads WHERE email = 'bot@example.com'").get().n, 0);
  const bad = await b.json('/leads', { email: 'not-an-email' });
  assert.equal(bad.status, 400);
});

test('checkout: rejects underage, restricted state and P.O. boxes', async () => {
  const b = browser();
  await b.get('/');
  const pid = db.prepare("SELECT id FROM products WHERE slug = 'nimbus-5000-cool-mint'").get().id;
  await b.json('/api/cart', { productId: pid, qty: 1, add: true });
  await b.get('/checkout');
  const minor = await b.form('/checkout', { ...validCheckout, dob: `${new Date().getUTCFullYear() - 18}-01-01` });
  assert.equal(minor.status, 400); assert.match(minor.text, /must be 21 or older/);
  const ma = await b.form('/checkout', { ...validCheckout, state: 'MA' });
  assert.equal(ma.status, 400); assert.match(ma.text, /cannot ship vapor products to MA/);
  const po = await b.form('/checkout', { ...validCheckout, address1: 'PO Box 12' });
  assert.match(po.text, /P\.O\. boxes/);
  const noAttest = await b.form('/checkout', { ...validCheckout, attest: '' });
  assert.match(noAttest.text, /confirm you are 21/);
});

test('full purchase: cart → discount → checkout → demo payment → stock, discount use, lead customer', async () => {
  const b = browser();
  await b.get('/');
  const p = db.prepare("SELECT id, stock, price_cents FROM products WHERE slug = 'vortex-200-kit'").get();
  const add = await b.json('/api/cart', { productId: p.id, qty: 2, add: true });
  assert.equal(add.json().count, 2);
  await b.get('/cart');
  await b.form('/cart/discount', { code: 'welcome15' });
  const cartPage = await b.get('/cart');
  assert.match(cartPage.text, /Discount \(WELCOME15\)/);
  await b.get('/checkout');
  const r = await b.form('/checkout', { ...validCheckout, email: 'buyer2@example.com', marketing: '1' });
  assert.equal(r.status, 303);
  const number = r.headers.get('location').split('/').pop();
  const order = db.prepare('SELECT * FROM orders WHERE number = ?').get(number);
  const sub = p.price_cents * 2; const disc = Math.round(sub * 0.15);
  assert.equal(order.subtotal_cents, sub);
  assert.equal(order.discount_cents, disc);
  assert.equal(order.shipping_cents, 0);
  assert.equal(order.total_cents, sub - disc + Math.round((sub - disc) * config.commerce.taxRate));
  assert.equal(order.status, 'pending');

  // another visitor can't see or pay this order
  assert.equal((await browser().get(`/checkout/complete/${number}`)).status, 404);

  await b.get(`/checkout/demo-pay/${number}`);
  const pay = await b.form(`/checkout/demo-pay/${number}`, { result: 'approve' });
  assert.equal(pay.status, 303);
  const done = await b.get(`/checkout/complete/${number}`);
  assert.match(done.text, /order confirmed/);
  assert.equal(db.prepare('SELECT stock FROM products WHERE id = ?').get(p.id).stock, p.stock - 2);
  assert.equal(db.prepare("SELECT uses FROM discounts WHERE code = 'WELCOME15'").get().uses, 1);
  assert.equal(db.prepare("SELECT status FROM leads WHERE email = 'buyer2@example.com'").get().status, 'customer');
  // idempotent: paying twice does not double-decrement
  await b.form(`/checkout/demo-pay/${number}`, { result: 'approve' });
  assert.equal(db.prepare('SELECT stock FROM products WHERE id = ?').get(p.id).stock, p.stock - 2);
});

test('cart pricing ignores client prices and clamps quantity', async () => {
  const b = browser(); await b.get('/');
  const p = db.prepare("SELECT id FROM products WHERE slug = 'saltline-menthol-30ml'").get();
  const r = await b.json('/api/cart', { productId: p.id, qty: 999, price: 1 });
  assert.equal(r.json().count, 10);
  const bad = await b.json('/api/cart', { productId: 999999, qty: 1 });
  assert.equal(bad.status, 400);
});

test('abandoned cart recovery emails idle carts once', async () => {
  const b = browser(); await b.get('/');
  const p = db.prepare("SELECT id FROM products WHERE slug = 'dual-bay-charger'").get();
  await b.json('/api/cart', { productId: p.id, qty: 1, add: true });
  await b.json('/api/cart/email', { email: 'abandoner@example.com' });
  db.prepare("UPDATE carts SET updated_at = datetime('now', '-2 hours') WHERE email = 'abandoner@example.com'").run();
  assert.equal(await recoverAbandonedCarts(db), 1);
  assert.equal(await recoverAbandonedCarts(db), 0);
  const cid = db.prepare("SELECT id FROM carts WHERE email = 'abandoner@example.com'").get().id;
  const b2 = browser(); await b2.get(`/cart/restore/${cid}`);
  assert.match((await b2.get('/cart')).text, /COMEBACK10/);
});

test('Authorize.net webhook signature verification', () => {
  const body = Buffer.from('{"eventType":"x"}');
  const sig = crypto.createHmac('sha512', 'TESTKEY123').update(body).digest('hex').toUpperCase();
  assert.equal(verifySignature(body, `sha512=${sig}`), true);
  assert.equal(verifySignature(body, `sha512=${'0'.repeat(128)}`), false);
  assert.equal(verifySignature(body, undefined), false);
});

test('admin: requires login, dashboard, CSV export, product edit', async () => {
  const b = browser();
  assert.equal((await b.get('/admin')).status, 303);
  await b.get('/admin/login');
  assert.equal((await b.form('/admin/login', { email: 'admin@example.com', password: 'wrong' })).status, 401);
  assert.equal((await b.form('/admin/login', { email: config.admin.email, password: config.admin.password })).status, 303);
  const dash = await b.get('/admin');
  assert.equal(dash.status, 200); assert.match(dash.text, /Revenue \(30d\)/);
  const csv = await b.get('/admin/leads.csv');
  assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(csv.text, /lead@example.com/);
  const p = db.prepare("SELECT * FROM products WHERE slug = 'dual-bay-charger'").get();
  await b.get(`/admin/products/${p.id}`);
  const save = await b.form(`/admin/products/${p.id}`, { name: p.name, slug: p.slug, brand: p.brand, sku: p.sku, category_id: String(p.category_id), price: '12.50', stock: '7', specs: '{}', faqs: '[]', active: '1' });
  assert.equal(save.status, 303);
  assert.equal(db.prepare('SELECT price_cents FROM products WHERE id = ?').get(p.id).price_cents, 1250);
  const badJson = await b.form(`/admin/products/${p.id}`, { name: p.name, price: '1', specs: '[1', faqs: '[]' });
  assert.equal(badJson.status, 400);
});

test('reviews are moderated before display', async () => {
  const b = browser();
  await b.get('/products/bakehouse-custard-60ml');
  await b.form('/products/bakehouse-custard-60ml/reviews', { author: 'Rev', rating: '5', body: 'Unique moderated text' });
  assert.doesNotMatch((await b.get('/products/bakehouse-custard-60ml')).text, /Unique moderated text/);
  db.prepare("UPDATE reviews SET approved = 1 WHERE body = 'Unique moderated text'").run();
  assert.match((await b.get('/products/bakehouse-custard-60ml')).text, /Unique moderated text/);
});
