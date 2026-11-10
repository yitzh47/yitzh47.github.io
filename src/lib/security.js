import { config } from '../config.js';
import { hmac, timingSafeEq } from './util.js';

export function adminCookie(hours = 12) {
  const exp = Date.now() + hours * 3600 * 1000;
  return `${exp}.${hmac(config.sessionSecret, `admin.${exp}`)}`;
}

export function verifyAdminCookie(v) {
  if (!v) return false;
  const [exp, sig] = String(v).split('.');
  return Number(exp) > Date.now() && !!sig && timingSafeEq(sig, hmac(config.sessionSecret, `admin.${exp}`));
}

/** Tiny fixed-window rate limiter (per IP + key). Swap for Redis-backed limiter if you run multiple instances. */
const hits = new Map();
export function rateLimit(key, max, windowMs) {
  return (req, res, next) => {
    const k = `${key}:${req.ip}`; const now = Date.now();
    const h = hits.get(k);
    if (!h || h.reset < now) hits.set(k, { n: 1, reset: now + windowMs });
    else if (++h.n > max) return res.status(429).send('Too many requests. Please wait a moment and try again.');
    if (hits.size > 10000) for (const [kk, vv] of hits) if (vv.reset < now) hits.delete(kk);
    next();
  };
}
