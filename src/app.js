import express from 'express';
import path from 'node:path';
import { config } from './config.js';
import { hmac, timingSafeEq, parseCookies, randomId } from './lib/util.js';
import { verifyAdminCookie } from './lib/security.js';
import { getCart } from './lib/commerce.js';
import { storeRoutes } from './routes/store.js';
import { adminRoutes } from './routes/admin.js';
import { seoRoutes } from './routes/seo.js';
import { notFoundPage } from './views/store.js';

const YEAR = 365 * 24 * 3600 * 1000;

export function createApp(db) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.locals.db = db;

  // Security headers
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (config.isProd) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    next();
  });

  // Payment webhooks need the raw body for signature verification — mount before body parsers.
  app.use('/webhooks', express.raw({ type: '*/*', limit: '256kb' }));
  app.use(express.urlencoded({ extended: false, limit: '200kb' }));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.static(path.resolve('public'), { maxAge: config.isProd ? '7d' : 0 }));

  // Cookies, visitor id, CSRF token, cart, age gate, admin session, UTM attribution
  app.use((req, res, next) => {
    req.cookies = parseCookies(req.headers.cookie);
    const cookieOpts = { httpOnly: true, sameSite: 'lax', secure: config.isProd, path: '/' };
    res.setCookie = (name, value, opts = {}) => res.cookie(name, value, { ...cookieOpts, maxAge: YEAR, ...opts });

    let vid = req.cookies.vid;
    if (!vid || !/^[\w-]{16,64}$/.test(vid)) { vid = randomId(); res.setCookie('vid', vid); }
    req.vid = vid;
    req.csrf = hmac(config.sessionSecret, `csrf.${vid}`);

    let cid = req.cookies.cid;
    if (!cid || !/^[\w-]{16,64}$/.test(cid)) { cid = randomId(); res.setCookie('cid', cid, { maxAge: 30 * 24 * 3600 * 1000 }); }
    req.cartId = cid;

    req.isAdmin = verifyAdminCookie(req.cookies.adm);

    if (req.method === 'GET' && req.query.utm_source && !req.cookies.utm) {
      const utm = { source: req.query.utm_source, medium: req.query.utm_medium || '', campaign: req.query.utm_campaign || '', landing: req.path };
      res.setCookie('utm', JSON.stringify(utm).slice(0, 600), { maxAge: 30 * 24 * 3600 * 1000 });
      req.cookies.utm = JSON.stringify(utm);
    }

    res.locals.ctx = {
      path: req.path, csrf: req.csrf, admin: req.isAdmin,
      ageVerified: req.cookies.age_ok === '1',
      cartCount: getCart(db, cid).items.reduce((s, i) => s + i.qty, 0),
    };
    next();
  });

  // CSRF check for state-changing requests (webhooks are signature-verified instead).
  app.use((req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path.startsWith('/webhooks/')) return next();
    const token = req.body?._csrf || req.get('x-csrf-token');
    if (!token || !timingSafeEq(token, req.csrf)) return res.status(403).send('Invalid or expired form. Please go back, refresh and try again.');
    next();
  });

  app.use(seoRoutes(db));
  app.use(storeRoutes(db));
  app.use('/admin', adminRoutes(db));

  app.use((req, res) => res.status(404).send(notFoundPage(res.locals.ctx)));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send('Something went wrong. Please try again.');
  });
  return app;
}
