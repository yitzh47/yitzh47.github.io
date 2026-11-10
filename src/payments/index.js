/**
 * Payment provider abstraction.
 *
 * IMPORTANT: Stripe, PayPal and Square prohibit e-cigarette / vape sales in their terms of service.
 * Vape merchants need a high-risk merchant account. Authorize.net is the most common gateway those
 * accounts run on, so it is implemented here. Add other gateways (NMI, etc.) by implementing:
 *
 *   createPayment(order, { returnUrl, cancelUrl }) -> { type: 'redirect', url } | { type: 'form_post', action, fields }
 *   handleWebhook(rawBody, headers) -> { orderNumber, status: 'paid'|'failed'|'refunded', ref } | null
 */
import { config } from '../config.js';
import * as demo from './demo.js';
import * as authorizenet from './authorizenet.js';

const providers = { demo, authorizenet };

export function getProvider(name = config.payments.provider) {
  const p = providers[name];
  if (!p) throw new Error(`Unknown payment provider: ${name}`);
  if (name === 'demo' && config.isProd && process.env.ALLOW_DEMO_PAYMENTS !== 'true') {
    throw new Error('Demo payments are disabled in production. Configure PAYMENT_PROVIDER=authorizenet.');
  }
  return { name, ...p };
}
