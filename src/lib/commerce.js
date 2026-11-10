import { config } from '../config.js';
import { safeJson } from './util.js';

export const MAX_QTY = 10;

export function getCart(db, cartId) {
  const row = db.prepare('SELECT * FROM carts WHERE id = ?').get(cartId);
  if (!row) return { id: cartId, items: [], email: '', discount_code: '' };
  return { ...row, items: safeJson(row.items, []) };
}

export function saveCart(db, cart) {
  db.prepare(`INSERT INTO carts (id, items, email, discount_code) VALUES (?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET items = excluded.items, email = excluded.email,
    discount_code = excluded.discount_code, updated_at = datetime('now')`)
    .run(cart.id, JSON.stringify(cart.items), cart.email || '', cart.discount_code || '');
}

/** Mutate cart items: set quantity (0 removes). Validates product & stock. */
export function setItem(db, cart, productId, qty, { add = false } = {}) {
  const p = db.prepare('SELECT id, stock, active FROM products WHERE id = ?').get(Number(productId));
  if (!p || !p.active) throw new Error('Product not available');
  const existing = cart.items.find((i) => i.productId === p.id);
  let next = Math.floor(Number(qty) || 0) + (add && existing ? existing.qty : 0);
  next = Math.max(0, Math.min(next, MAX_QTY, p.stock));
  if (existing) existing.qty = next; else if (next > 0) cart.items.push({ productId: p.id, qty: next });
  cart.items = cart.items.filter((i) => i.qty > 0);
  return cart;
}

export function lookupDiscount(db, code) {
  if (!code) return null;
  const d = db.prepare('SELECT * FROM discounts WHERE code = ? COLLATE NOCASE AND active = 1').get(String(code).trim());
  if (!d || (d.max_uses != null && d.uses >= d.max_uses)) return null;
  return d;
}

/**
 * Price a cart from the database (never trust client prices).
 * Returns line items, subtotal, discount, shipping, tax, total (all cents).
 */
export function priceCart(db, cart, { state } = {}) {
  const lines = [];
  for (const item of cart.items) {
    const p = db.prepare('SELECT id, slug, name, brand, price_cents, stock, active, contains_nicotine, sku FROM products WHERE id = ?').get(item.productId);
    if (!p || !p.active) continue;
    const qty = Math.min(item.qty, p.stock, MAX_QTY);
    if (qty <= 0) continue;
    lines.push({ productId: p.id, slug: p.slug, name: p.name, brand: p.brand, sku: p.sku, unit_cents: p.price_cents, qty, line_cents: p.price_cents * qty, contains_nicotine: !!p.contains_nicotine });
  }
  const subtotal = lines.reduce((s, l) => s + l.line_cents, 0);
  const d = lookupDiscount(db, cart.discount_code);
  let discount = 0; let discountCode = '';
  if (d && subtotal >= d.min_subtotal_cents) {
    discount = Math.min(subtotal, Math.round(subtotal * (d.percent_off / 100)) + d.amount_off_cents);
    discountCode = d.code;
  }
  const afterDiscount = subtotal - discount;
  const shipping = lines.length === 0 || afterDiscount >= config.commerce.freeShippingThreshold * 100 ? 0 : Math.round(config.commerce.flatShipping * 100);
  // Simplified: single store-wide rate. Replace with a tax API (TaxJar/Avalara) + state excise taxes for production.
  const tax = Math.round(afterDiscount * config.commerce.taxRate);
  return {
    lines, subtotal, discount, discountCode, shipping, tax,
    total: afterDiscount + shipping + tax,
    count: lines.reduce((s, l) => s + l.qty, 0),
    containsNicotine: lines.some((l) => l.contains_nicotine),
    restricted: state ? isRestrictedState(state) : false,
  };
}

export const isRestrictedState = (state) => config.commerce.restrictedStates.includes(String(state || '').toUpperCase());

export function orderNumber() {
  const d = new Date();
  const ymd = `${d.getUTCFullYear() % 100}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;
  return `CV${ymd}-${Math.floor(Math.random() * 1e6).toString().padStart(6, '0')}`;
}

export const US_STATES = 'AL,AK,AZ,AR,CA,CO,CT,DE,DC,FL,GA,HI,ID,IL,IN,IA,KS,KY,LA,ME,MD,MA,MI,MN,MS,MO,MT,NE,NV,NH,NJ,NM,NY,NC,ND,OH,OK,OR,PA,RI,SC,SD,TN,TX,UT,VT,VA,WA,WV,WI,WY'.split(',');
