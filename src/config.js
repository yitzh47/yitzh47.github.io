import fs from 'node:fs';
import path from 'node:path';

if (fs.existsSync('.env')) process.loadEnvFile('.env');

const env = process.env;
const num = (v, d) => (v === undefined || v === '' ? d : Number(v));

export const config = {
  port: num(env.PORT, 3000),
  baseUrl: (env.BASE_URL || 'http://localhost:3000').replace(/\/$/, ''),
  isProd: env.NODE_ENV === 'production',
  dbPath: env.DB_PATH || path.resolve('data/store.db'),
  sessionSecret: env.SESSION_SECRET || 'dev-insecure-secret-change-me',

  store: {
    name: env.STORE_NAME || 'Cloudline Vapor',
    tagline: env.STORE_TAGLINE || 'Premium vapes, e-liquids & hardware — shipped fast to adults 21+',
    email: env.STORE_EMAIL || 'support@example.com',
    phone: env.STORE_PHONE || '+1-555-010-0100',
    address: {
      street: env.STORE_STREET || '100 Main St',
      city: env.STORE_CITY || 'Austin',
      region: env.STORE_REGION || 'TX',
      postal: env.STORE_POSTAL || '78701',
      country: env.STORE_COUNTRY || 'US',
    },
    social: (env.STORE_SOCIAL || '').split(',').map((s) => s.trim()).filter(Boolean),
    currency: 'USD',
  },

  commerce: {
    minAge: num(env.MIN_AGE, 21),
    freeShippingThreshold: num(env.FREE_SHIPPING_THRESHOLD, 75),
    flatShipping: num(env.FLAT_SHIPPING, 7.95),
    taxRate: num(env.TAX_RATE, 0.0825),
    // States you cannot (or choose not to) ship to. Keep this up to date with your counsel.
    restrictedStates: (env.RESTRICTED_STATES || 'MA,ME,UT,VT,OR,AR,SD,ND,NM,DC')
      .split(',').map((s) => s.trim().toUpperCase()).filter(Boolean),
    leadDiscountCode: env.LEAD_DISCOUNT_CODE || 'WELCOME15',
    leadDiscountPct: num(env.LEAD_DISCOUNT_PCT, 15),
  },

  payments: {
    provider: env.PAYMENT_PROVIDER || 'demo', // demo | authorizenet
    authorizeNet: {
      apiLoginId: env.AUTHNET_API_LOGIN_ID || '',
      transactionKey: env.AUTHNET_TRANSACTION_KEY || '',
      signatureKey: env.AUTHNET_SIGNATURE_KEY || '',
      sandbox: env.AUTHNET_SANDBOX !== 'false',
    },
  },

  email: {
    provider: env.EMAIL_PROVIDER || 'console', // console | resend
    resendApiKey: env.RESEND_API_KEY || '',
    from: env.EMAIL_FROM || 'Cloudline Vapor <hello@example.com>',
  },

  admin: {
    email: env.ADMIN_EMAIL || 'admin@example.com',
    password: env.ADMIN_PASSWORD || 'admin123',
  },

  analytics: {
    gaId: env.GA_MEASUREMENT_ID || '',
    metaPixelId: env.META_PIXEL_ID || '',
  },
};

if (config.isProd) {
  if (config.sessionSecret.startsWith('dev-')) throw new Error('SESSION_SECRET must be set in production');
  if (config.admin.password === 'admin123') throw new Error('ADMIN_PASSWORD must be changed in production');
}
