import { config } from '../config.js';
import { esc, money } from './util.js';

/** Send a transactional/marketing email. Providers: console (dev) or Resend (HTTP API). */
export async function sendEmail({ to, subject, html }) {
  if (config.email.provider === 'resend' && config.email.resendApiKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.email.resendApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.email.from, to, subject, html }),
    });
    if (!res.ok) throw new Error(`Email send failed: ${res.status} ${await res.text()}`);
    return;
  }
  if (process.env.NODE_ENV !== 'test') console.log(`[email] to=${to} subject="${subject}"`);
}

const wrap = (body) => `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:auto;color:#111">
<h2 style="margin:0 0 16px">${esc(config.store.name)}</h2>${body}
<p style="font-size:12px;color:#666;margin-top:32px">WARNING: Nicotine products contain nicotine, an addictive chemical. For adults ${config.commerce.minAge}+ only.<br>
${esc(config.store.address.street)}, ${esc(config.store.address.city)}, ${esc(config.store.address.region)} ${esc(config.store.address.postal)} ·
<a href="${config.baseUrl}/unsubscribe?email={{email}}">Unsubscribe</a></p></div>`;

const personalize = (html, email) => html.replace('{{email}}', encodeURIComponent(email));

export const emails = {
  welcome: (email) => ({
    to: email,
    subject: `Your ${config.commerce.leadDiscountPct}% off code is inside`,
    html: personalize(wrap(`<p>Thanks for joining! Here's ${config.commerce.leadDiscountPct}% off your first order:</p>
      <p style="font-size:24px;font-weight:700;letter-spacing:2px">${esc(config.commerce.leadDiscountCode)}</p>
      <p><a href="${config.baseUrl}/shop">Start shopping →</a></p>`), email),
  }),
  orderConfirmation: (order, items) => ({
    to: order.email,
    subject: `Order ${order.number} confirmed`,
    html: personalize(wrap(`<p>Hi ${esc(order.first_name)}, thanks for your order!</p>
      <table style="width:100%;border-collapse:collapse">${items.map((i) => `<tr><td>${esc(i.name)} × ${i.qty}</td><td style="text-align:right">${money(i.line_cents)}</td></tr>`).join('')}
      <tr><td><strong>Total</strong></td><td style="text-align:right"><strong>${money(order.total_cents)}</strong></td></tr></table>
      <p>An adult signature (${config.commerce.minAge}+) is required on delivery.</p>`), order.email),
  }),
  abandonedCart: (email, cartId) => ({
    to: email,
    subject: 'You left something in your cart',
    html: personalize(wrap(`<p>Your cart is saved. Complete your order and take 10% off with code <strong>COMEBACK10</strong>.</p>
      <p><a href="${config.baseUrl}/cart/restore/${encodeURIComponent(cartId)}">Return to my cart →</a></p>`), email),
  }),
  shipped: (order) => ({
    to: order.email,
    subject: `Order ${order.number} has shipped`,
    html: personalize(wrap(`<p>Your order is on its way. Tracking number: <strong>${esc(order.tracking_number)}</strong></p>`), order.email),
  }),
};
