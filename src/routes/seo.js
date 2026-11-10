import { Router } from 'express';
import { sitemapXml, robotsTxt, llmsTxt, llmsFullTxt, catalogJson, googleFeedXml } from '../seo.js';
import { productSvg } from '../lib/images.js';
import { config } from '../config.js';

export function seoRoutes(db) {
  const r = Router();
  const cache = (res, secs = 3600) => res.set('Cache-Control', `public, max-age=${secs}`);

  r.get('/robots.txt', (req, res) => cache(res).type('text/plain').send(robotsTxt()));
  r.get('/sitemap.xml', (req, res) => cache(res).type('application/xml').send(sitemapXml(db)));
  r.get('/llms.txt', (req, res) => cache(res).type('text/markdown; charset=utf-8').send(llmsTxt(db)));
  r.get('/llms-full.txt', (req, res) => cache(res).type('text/markdown; charset=utf-8').send(llmsFullTxt(db)));
  r.get('/api/catalog.json', (req, res) => cache(res, 600).set('Access-Control-Allow-Origin', '*').json(catalogJson(db)));
  r.get('/feeds/google.xml', (req, res) => cache(res).type('application/xml').send(googleFeedXml(db)));
  r.get('/.well-known/security.txt', (req, res) => res.type('text/plain').send(`Contact: mailto:${config.store.email}\nExpires: ${new Date(Date.now() + 365 * 864e5).toISOString()}\n`));

  r.get('/img/products/:slug.svg', (req, res) => {
    const p = db.prepare('SELECT p.name, p.brand, c.slug AS cat FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.slug = ?').get(req.params.slug);
    if (!p) return res.status(404).end();
    cache(res, 86400).type('image/svg+xml').send(productSvg(p));
  });
  return r;
}
