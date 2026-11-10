import { config } from './config.js';
import { openDb } from './db.js';
import { seed } from './seed.js';
import { createApp } from './app.js';
import { recoverAbandonedCarts } from './lib/orders.js';

const db = openDb();
if (seed(db)) console.log('Seeded demo catalog.');

const app = createApp(db);
app.listen(config.port, () => {
  console.log(`${config.store.name} running at ${config.baseUrl} (port ${config.port})`);
  console.log(`Admin: ${config.baseUrl}/admin  · Payments: ${config.payments.provider} · Email: ${config.email.provider}`);
});

// Abandoned-cart recovery every 15 minutes.
setInterval(() => recoverAbandonedCarts(db).catch((e) => console.error('[abandoned-cart]', e)), 15 * 60 * 1000).unref();
