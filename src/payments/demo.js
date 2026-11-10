/** Demo provider: sends the shopper to a local fake payment page. Never enable in production. */
export async function createPayment(order) {
  return { type: 'redirect', url: `/checkout/demo-pay/${encodeURIComponent(order.number)}` };
}

export async function handleWebhook() {
  return null;
}
