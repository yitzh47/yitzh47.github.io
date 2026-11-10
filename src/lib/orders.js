import { config } from '../config.js';
import { tx } from '../db.js';
import { priceCart, isRestrictedState, orderNumber, US_STATES } from './commerce.js';
import { ageFromDob, isEmail, safeJson } from './util.js';
import { captureLead } from './leads.js';
import { sendEmail, emails } from './email.js';

const REQUIRED = ['email', 'first_name', 'last_name', 'address1', 'city', 'state', 'postal', 'dob'];

/** Validate checkout form + cart and create a pending order. Throws Error with a user-facing message. */
export function createOrder(db, cart, form, { utm = {}, provider }) {
  for (const k of REQUIRED) if (!String(form[k] || '').trim()) throw new Error('Please fill in all required fields.');
  const email = String(form.email).trim().toLowerCase();
  if (!isEmail(email)) throw new Error('Please enter a valid email address.');
  if (!form.attest) throw new Error(`You must confirm you are ${config.commerce.minAge} or older.`);
  const age = ageFromDob(form.dob);
  if (age < 0) throw new Error('Please enter a valid date of birth.');
  if (age < config.commerce.minAge) throw new Error(`You must be ${config.commerce.minAge} or older to purchase from this store.`);
  const state = String(form.state).toUpperCase();
  if (!US_STATES.includes(state)) throw new Error('Please choose a valid U.S. state.');
  if (isRestrictedState(state)) throw new Error(`Sorry — we cannot ship vapor products to ${state}.`);
  if (!/^\d{5}(-\d{4})?$/.test(String(form.postal).trim())) throw new Error('Please enter a valid ZIP code.');
  if (/\bp\.?\s*o\.?\s*box\b/i.test(`${form.address1} ${form.address2 || ''}`)) throw new Error('We cannot ship to P.O. boxes (adult signature required).');

  const priced = priceCart(db, cart, { state });
  if (!priced.lines.length) throw new Error('Your cart is empty.');

  const { lead, created } = captureLead(db, {
    email, name: `${form.first_name} ${form.last_name}`, phone: form.phone || '', source: 'checkout', utm,
    landingPage: utm.landing || '', event: 'checkout_started', data: { total: priced.total },
  });
  if (created && !form.marketing) {
    db.prepare('UPDATE leads SET consent_email = 0 WHERE id = ?').run(lead.id);
  }

  const number = orderNumber();
  const clip = (v, n = 120) => String(v || '').trim().slice(0, n);
  db.prepare(`INSERT INTO orders (number, cart_id, email, phone, first_name, last_name, dob, address1, address2, city, state, postal, country,
    items, subtotal_cents, discount_cents, shipping_cents, tax_cents, total_cents, discount_code, status, payment_provider, age_verified, lead_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'US',?,?,?,?,?,?,?,'pending',?,?,?)`).run(
    number, cart.id, email, clip(form.phone, 40), clip(form.first_name), clip(form.last_name), form.dob,
    clip(form.address1, 200), clip(form.address2, 200), clip(form.city), state, clip(form.postal, 10),
    JSON.stringify(priced.lines), priced.subtotal, priced.discount, priced.shipping, priced.tax, priced.total, priced.discountCode,
    provider, 1, lead.id,
  );
  // NOTE: age_verified=1 reflects DOB self-attestation. For production, integrate a third-party age verification
  // service (e.g. AgeChecker.net, Veratad, Persona) here and only set this flag on a successful match.
  db.prepare("UPDATE carts SET email = ?, updated_at = datetime('now') WHERE id = ?").run(email, cart.id);
  return db.prepare('SELECT * FROM orders WHERE number = ?').get(number);
}

/**
 * Apply a payment result to an order. Idempotent. On first transition to "paid":
 * decrements stock, counts the discount use, marks the cart converted, records the lead event and emails a receipt.
 */
export async function markOrder(db, number, status, { ref = '', amountCents } = {}) {
  const order = db.prepare('SELECT * FROM orders WHERE number = ?').get(number);
  if (!order) return null;
  if (status === 'paid') {
    if (['paid', 'fulfilled', 'shipped'].includes(order.status)) return order;
    if (amountCents != null && amountCents !== order.total_cents) {
      db.prepare("UPDATE orders SET status = 'review', payment_ref = ?, notes = notes || ?, updated_at = datetime('now') WHERE id = ?")
        .run(ref, `\nAmount mismatch: paid ${amountCents} vs total ${order.total_cents}`, order.id);
      return db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
    }
    const items = safeJson(order.items, []);
    tx(db, () => {
      db.prepare("UPDATE orders SET status = 'paid', payment_ref = ?, updated_at = datetime('now') WHERE id = ?").run(ref, order.id);
      const dec = db.prepare('UPDATE products SET stock = MAX(0, stock - ?) WHERE id = ?');
      for (const i of items) dec.run(i.qty, i.productId);
      if (order.discount_code) db.prepare('UPDATE discounts SET uses = uses + 1 WHERE code = ?').run(order.discount_code);
      db.prepare("UPDATE carts SET converted = 1, items = '[]', discount_code = '' WHERE id = ?").run(order.cart_id);
      captureLead(db, { email: order.email, source: 'checkout', event: 'order', data: { order: order.number, total: order.total_cents } });
    });
    const updated = db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
    sendEmail(emails.orderConfirmation(updated, items)).catch((e) => console.error('[email]', e.message));
    return updated;
  }
  if (['failed', 'cancelled', 'refunded'].includes(status)) {
    if (status === 'failed' && order.status !== 'pending') return order;
    db.prepare("UPDATE orders SET status = ?, payment_ref = COALESCE(NULLIF(?, ''), payment_ref), updated_at = datetime('now') WHERE id = ?").run(status, ref, order.id);
  }
  return db.prepare('SELECT * FROM orders WHERE id = ?').get(order.id);
}

/** Email shoppers who left an identified cart idle for > 1 hour (once per cart, only with email consent). */
export async function recoverAbandonedCarts(db) {
  const carts = db.prepare(`SELECT c.* FROM carts c LEFT JOIN leads l ON l.email = c.email
    WHERE c.email != '' AND c.items != '[]' AND c.converted = 0 AND c.recovered_email_sent = 0
    AND c.updated_at < datetime('now', '-1 hour') AND c.updated_at > datetime('now', '-3 days')
    AND (l.id IS NULL OR l.consent_email = 1)`).all();
  for (const c of carts) {
    try {
      await sendEmail(emails.abandonedCart(c.email, c.id));
      db.prepare('UPDATE carts SET recovered_email_sent = 1 WHERE id = ?').run(c.id);
      try { captureLead(db, { email: c.email, source: 'checkout', event: 'cart_abandoned', data: { cart: c.id } }); } catch { /* ignore */ }
    } catch (e) { console.error('[abandoned-cart]', e.message); }
  }
  return carts.length;
}
