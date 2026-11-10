/**
 * SEO + AI-SEO (GEO: generative engine optimization).
 *  - Structured data (JSON-LD) for Organization/Store, WebSite+SearchAction, Product+Offer+AggregateRating,
 *    BreadcrumbList, FAQPage, BlogPosting, ItemList.
 *  - sitemap.xml, robots.txt (explicitly welcoming AI crawlers), llms.txt + llms-full.txt,
 *    a public machine-readable catalog (/api/catalog.json) and Google Merchant feed (/feeds/google.xml).
 */
import { config } from './config.js';
import { esc, safeJson, stripMd } from './lib/util.js';

const abs = (p) => `${config.baseUrl}${p}`;
const price = (c) => (c / 100).toFixed(2);

export function organizationLd() {
  const s = config.store;
  return {
    '@context': 'https://schema.org', '@type': 'OnlineStore', '@id': abs('/#org'), name: s.name, url: abs('/'),
    logo: abs('/logo.svg'), description: s.tagline, email: s.email, telephone: s.phone,
    address: { '@type': 'PostalAddress', streetAddress: s.address.street, addressLocality: s.address.city, addressRegion: s.address.region, postalCode: s.address.postal, addressCountry: s.address.country },
    sameAs: s.social,
    hasMerchantReturnPolicy: { '@type': 'MerchantReturnPolicy', applicableCountry: 'US', returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow', merchantReturnDays: 30, returnMethod: 'https://schema.org/ReturnByMail', returnFees: 'https://schema.org/FreeReturn' },
  };
}

export function websiteLd() {
  return {
    '@context': 'https://schema.org', '@type': 'WebSite', '@id': abs('/#website'), name: config.store.name, url: abs('/'), publisher: { '@id': abs('/#org') },
    potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: abs('/shop?q={search_term_string}') }, 'query-input': 'required name=search_term_string' },
  };
}

export function breadcrumbLd(crumbs) {
  return {
    '@context': 'https://schema.org', '@type': 'BreadcrumbList',
    itemListElement: crumbs.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: abs(path) })),
  };
}

export function faqLd(faqs) {
  if (!faqs?.length) return null;
  return { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) };
}

export function productLd(p, { reviews = [], rating } = {}) {
  const specs = safeJson(p.specs, {});
  const ld = {
    '@context': 'https://schema.org', '@type': 'Product', '@id': abs(`/products/${p.slug}#product`),
    name: p.name, description: stripMd(p.description || p.short_description), sku: p.sku, image: abs(`/img/products/${p.slug}.svg`),
    brand: { '@type': 'Brand', name: p.brand }, category: p.category_name,
    additionalProperty: Object.entries(specs).map(([name, value]) => ({ '@type': 'PropertyValue', name, value: String(value) })),
    audience: { '@type': 'PeopleAudience', suggestedMinAge: config.commerce.minAge },
    offers: {
      '@type': 'Offer', url: abs(`/products/${p.slug}`), priceCurrency: config.store.currency, price: price(p.price_cents),
      availability: p.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
      itemCondition: 'https://schema.org/NewCondition', seller: { '@id': abs('/#org') },
      shippingDetails: {
        '@type': 'OfferShippingDetails',
        shippingRate: { '@type': 'MonetaryAmount', value: p.price_cents >= config.commerce.freeShippingThreshold * 100 ? '0' : String(config.commerce.flatShipping), currency: 'USD' },
        shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'US' },
        deliveryTime: { '@type': 'ShippingDeliveryTime', handlingTime: { '@type': 'QuantitativeValue', minValue: 0, maxValue: 1, unitCode: 'DAY' }, transitTime: { '@type': 'QuantitativeValue', minValue: 2, maxValue: 5, unitCode: 'DAY' } },
      },
    },
  };
  if (rating && rating.count > 0) {
    ld.aggregateRating = { '@type': 'AggregateRating', ratingValue: rating.avg.toFixed(1), reviewCount: rating.count };
    ld.review = reviews.slice(0, 5).map((r) => ({ '@type': 'Review', author: { '@type': 'Person', name: r.author }, reviewRating: { '@type': 'Rating', ratingValue: r.rating }, reviewBody: r.body, datePublished: r.created_at.slice(0, 10) }));
  }
  return ld;
}

export function itemListLd(products) {
  return {
    '@context': 'https://schema.org', '@type': 'ItemList',
    itemListElement: products.map((p, i) => ({ '@type': 'ListItem', position: i + 1, url: abs(`/products/${p.slug}`), name: p.name })),
  };
}

export function articleLd(post) {
  return {
    '@context': 'https://schema.org', '@type': 'BlogPosting', headline: post.title, description: post.excerpt,
    datePublished: post.published_at, dateModified: post.updated_at, author: { '@type': 'Organization', name: post.author || config.store.name },
    publisher: { '@id': abs('/#org') }, mainEntityOfPage: abs(`/blog/${post.slug}`), image: abs('/og.svg'),
  };
}

const STATIC_PAGES = ['/', '/shop', '/blog', '/about', '/contact', '/faq', '/shipping-policy', '/returns', '/privacy', '/terms', '/age-policy'];

export function sitemapXml(db) {
  const urls = [
    ...STATIC_PAGES.map((p) => ({ loc: abs(p) })),
    ...db.prepare('SELECT slug FROM categories ORDER BY sort').all().map((c) => ({ loc: abs(`/category/${c.slug}`) })),
    ...db.prepare('SELECT slug, updated_at FROM products WHERE active = 1').all().map((p) => ({ loc: abs(`/products/${p.slug}`), lastmod: p.updated_at })),
    ...db.prepare('SELECT slug, updated_at FROM posts WHERE published = 1').all().map((p) => ({ loc: abs(`/blog/${p.slug}`), lastmod: p.updated_at })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${esc(u.loc)}</loc>${u.lastmod ? `<lastmod>${esc(u.lastmod.slice(0, 10))}</lastmod>` : ''}</url>`).join('\n')}\n</urlset>\n`;
}

/** robots.txt: index the storefront, keep private areas out, and explicitly allow AI search/answer crawlers. */
export function robotsTxt() {
  const aiBots = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'Bingbot', 'DuckAssistBot', 'meta-externalagent', 'CCBot'];
  const disallow = ['/admin', '/cart', '/checkout', '/api/cart', '/account'];
  return [
    'User-agent: *', ...disallow.map((d) => `Disallow: ${d}`), 'Allow: /', '',
    ...aiBots.flatMap((b) => [`User-agent: ${b}`, ...disallow.map((d) => `Disallow: ${d}`), 'Allow: /', '']),
    `Sitemap: ${abs('/sitemap.xml')}`, `# AI-readable summary: ${abs('/llms.txt')}`, '',
  ].join('\n');
}

/** llms.txt (https://llmstxt.org): a concise, link-rich markdown map of the site for LLMs. */
export function llmsTxt(db) {
  const s = config.store;
  const cats = db.prepare('SELECT * FROM categories ORDER BY sort').all();
  const posts = db.prepare('SELECT slug, title, excerpt FROM posts WHERE published = 1 ORDER BY published_at DESC').all();
  return `# ${s.name}

> ${s.tagline}. Online retailer of disposable vapes, pod systems, vape kits, e-liquids, nicotine salts, coils and accessories. U.S. shipping only, to adults ${config.commerce.minAge}+ with age verification at checkout.

Key facts:
- Free shipping on orders over $${config.commerce.freeShippingThreshold}; flat $${config.commerce.flatShipping} otherwise. Orders before 2pm CT ship same business day.
- 30-day returns on unopened hardware. E-liquids and disposables are final sale once opened.
- We do not ship to: ${config.commerce.restrictedStates.join(', ')}.
- Contact: ${s.email} · ${s.phone}
- Full machine-readable catalog with live prices and stock: ${abs('/api/catalog.json')}
- Full product details as markdown: ${abs('/llms-full.txt')}

## Product categories
${cats.map((c) => `- [${c.name}](${abs(`/category/${c.slug}`)}): ${c.description}`).join('\n')}

## Guides
${posts.map((p) => `- [${p.title}](${abs(`/blog/${p.slug}`)}): ${p.excerpt}`).join('\n')}

## Policies
- [Shipping policy](${abs('/shipping-policy')})
- [Returns](${abs('/returns')})
- [Age verification policy](${abs('/age-policy')})
- [FAQ](${abs('/faq')})
`;
}

export function llmsFullTxt(db) {
  const products = db.prepare(`SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.active = 1 ORDER BY c.sort, p.name`).all();
  const body = products.map((p) => {
    const specs = safeJson(p.specs, {});
    return `## ${p.name}
- URL: ${abs(`/products/${p.slug}`)}
- Brand: ${p.brand} · Category: ${p.category_name} · SKU: ${p.sku}
- Price: $${price(p.price_cents)} USD${p.compare_at_cents ? ` (was $${price(p.compare_at_cents)})` : ''} · ${p.stock > 0 ? 'In stock' : 'Out of stock'}
${p.nicotine_mg && p.nicotine_mg !== 'N/A' ? `- Nicotine: ${p.nicotine_mg}\n` : ''}${p.flavor_profile ? `- Flavor: ${p.flavor_profile}\n` : ''}${Object.entries(specs).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

${stripMd(p.description)}`;
  }).join('\n\n');
  return `${llmsTxt(db)}\n# Full product catalog\n\n${body}\n`;
}

export function catalogJson(db) {
  const products = db.prepare(`SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.active = 1`).all();
  return {
    store: config.store.name, url: abs('/'), currency: 'USD', minimumAge: config.commerce.minAge, updated: new Date().toISOString(),
    products: products.map((p) => ({
      name: p.name, url: abs(`/products/${p.slug}`), sku: p.sku, brand: p.brand, category: p.category_name,
      price: Number(price(p.price_cents)), compareAtPrice: p.compare_at_cents ? Number(price(p.compare_at_cents)) : null,
      inStock: p.stock > 0, nicotine: p.nicotine_mg, flavor: p.flavor_profile, summary: p.short_description, specs: safeJson(p.specs, {}),
    })),
  };
}

/** Google Merchant Center RSS feed. Note: Google Shopping restricts tobacco/vape ads; useful for free listings where permitted and for other feed consumers. */
export function googleFeedXml(db) {
  const products = db.prepare(`SELECT p.*, c.name AS category_name FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.active = 1`).all();
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>
<title>${esc(config.store.name)}</title><link>${esc(abs('/'))}</link><description>${esc(config.store.tagline)}</description>
${products.map((p) => `<item><g:id>${esc(p.sku)}</g:id><title>${esc(p.name)}</title><description>${esc(stripMd(p.short_description))}</description>
<link>${esc(abs(`/products/${p.slug}`))}</link><g:image_link>${esc(abs(`/img/products/${p.slug}.svg`))}</g:image_link>
<g:availability>${p.stock > 0 ? 'in_stock' : 'out_of_stock'}</g:availability><g:price>${price(p.price_cents)} USD</g:price>
<g:brand>${esc(p.brand)}</g:brand><g:condition>new</g:condition><g:product_type>${esc(p.category_name)}</g:product_type><g:age_group>adult</g:age_group></item>`).join('\n')}
</channel></rss>`;
}
