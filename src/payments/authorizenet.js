/**
 * Authorize.net "Accept Hosted" integration (PCI SAQ-A: card data never touches this server).
 *
 * Flow:
 *  1. getHostedPaymentPageRequest -> token
 *  2. Browser auto-POSTs the token to Authorize.net's hosted payment form
 *  3. Shopper returns to /checkout/complete/:number (shows "processing" until confirmed)
 *  4. Authorize.net webhook (net.authorize.payment.authcapture.created) hits /webhooks/payments/authorizenet;
 *     we verify the HMAC-SHA512 signature, then re-fetch the transaction to confirm amount + invoice.
 */
import crypto from 'node:crypto';
import { config } from '../config.js';

const cfg = () => config.payments.authorizeNet;
const apiUrl = () => (cfg().sandbox ? 'https://apitest.authorize.net/xml/v1/request.api' : 'https://api.authorize.net/xml/v1/request.api');
const formUrl = () => (cfg().sandbox ? 'https://test.authorize.net/payment/payment' : 'https://accept.authorize.net/payment/payment');
const auth = () => ({ name: cfg().apiLoginId, transactionKey: cfg().transactionKey });

async function call(body) {
  const res = await fetch(apiUrl(), { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const text = (await res.text()).replace(/^﻿/, ''); // Authorize.net prefixes a BOM
  const json = JSON.parse(text);
  if (json.messages?.resultCode !== 'Ok') {
    throw new Error(`Authorize.net error: ${json.messages?.message?.map((m) => `${m.code} ${m.text}`).join('; ')}`);
  }
  return json;
}

export async function createPayment(order, { returnUrl, cancelUrl }) {
  if (!cfg().apiLoginId || !cfg().transactionKey) throw new Error('Authorize.net credentials are not configured');
  const json = await call({
    getHostedPaymentPageRequest: {
      merchantAuthentication: auth(),
      transactionRequest: {
        transactionType: 'authCaptureTransaction',
        amount: (order.total_cents / 100).toFixed(2),
        order: { invoiceNumber: order.number, description: `${config.store.name} order ${order.number}`.slice(0, 255) },
        customer: { email: order.email },
        billTo: {
          firstName: order.first_name, lastName: order.last_name, address: order.address1,
          city: order.city, state: order.state, zip: order.postal, country: order.country,
        },
      },
      hostedPaymentSettings: {
        setting: [
          { settingName: 'hostedPaymentReturnOptions', settingValue: JSON.stringify({ showReceipt: false, url: returnUrl, urlText: 'Continue', cancelUrl, cancelUrlText: 'Cancel' }) },
          { settingName: 'hostedPaymentButtonOptions', settingValue: JSON.stringify({ text: 'Pay now' }) },
          { settingName: 'hostedPaymentOrderOptions', settingValue: JSON.stringify({ show: true, merchantName: config.store.name }) },
          { settingName: 'hostedPaymentBillingAddressOptions', settingValue: JSON.stringify({ show: true, required: true }) },
        ],
      },
    },
  });
  return { type: 'form_post', action: formUrl(), fields: { token: json.token } };
}

export function verifySignature(rawBody, header) {
  const key = cfg().signatureKey;
  if (!key || !header) return false;
  const expected = crypto.createHmac('sha512', key).update(rawBody).digest('hex').toUpperCase();
  const got = String(header).replace(/^sha512=/i, '').toUpperCase();
  return got.length === expected.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(expected));
}

export async function handleWebhook(rawBody, headers) {
  if (!verifySignature(rawBody, headers['x-anet-signature'])) throw new Error('Invalid webhook signature');
  const evt = JSON.parse(rawBody.toString('utf8'));
  const transId = evt?.payload?.id;
  if (!transId) return null;
  const details = await call({ getTransactionDetailsRequest: { merchantAuthentication: auth(), transId } });
  const t = details.transaction;
  const statusMap = {
    'net.authorize.payment.authcapture.created': t.responseCode === 1 ? 'paid' : 'failed',
    'net.authorize.payment.refund.created': 'refunded',
    'net.authorize.payment.void.created': 'refunded',
  };
  const status = statusMap[evt.eventType];
  if (!status) return null;
  return { orderNumber: t.order?.invoiceNumber, status, ref: String(transId), amountCents: Math.round(Number(t.settleAmount ?? t.authAmount) * 100) };
}
