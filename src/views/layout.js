import { config } from '../config.js';
import { esc, jsonLd, money } from '../lib/util.js';
import { organizationLd, websiteLd } from '../seo.js';

const NIC_WARNING = 'WARNING: This product contains nicotine. Nicotine is an addictive chemical.';

export function layout({ title, description, canonical, body, ld = [], noindex = false, ogType = 'website', ogImage = '/og.svg', ctx = {} }) {
  const s = config.store;
  const fullTitle = title ? (title.includes(s.name) ? title : `${title} | ${s.name}`) : `${s.name} — ${s.tagline}`;
  const desc = description || s.tagline;
  const url = `${config.baseUrl}${canonical ?? ctx.path ?? '/'}`;
  const ga = config.analytics.gaId;
  const lds = [organizationLd(), websiteLd(), ...ld].filter(Boolean);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
${noindex ? '<meta name="robots" content="noindex, nofollow">' : '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">'}
<meta property="og:type" content="${ogType}">
<meta property="og:site_name" content="${esc(s.name)}">
<meta property="og:title" content="${esc(fullTitle)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(config.baseUrl + ogImage)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0f172a">
<meta name="csrf-token" content="${esc(ctx.csrf || '')}">
<link rel="icon" href="/logo.svg" type="image/svg+xml">
<link rel="alternate" type="text/markdown" title="LLM summary" href="/llms.txt">
<link rel="sitemap" type="application/xml" href="/sitemap.xml">
<link rel="stylesheet" href="/styles.css">
${lds.map((o) => `<script type="application/ld+json">${jsonLd(o)}</script>`).join('\n')}
${ga ? `<script async src="https://www.googletagmanager.com/gtag/js?id=${esc(ga)}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${esc(ga)}');</script>` : ''}
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
<div class="nic-warning" role="note">${NIC_WARNING}</div>
<header class="site-header">
  <div class="container header-row">
    <a class="logo" href="/" aria-label="${esc(s.name)} home"><img src="/logo.svg" alt="" width="32" height="32"><span>${esc(s.name)}</span></a>
    <form class="search" action="/shop" method="get" role="search"><input type="search" name="q" placeholder="Search vapes, flavors, brands…" aria-label="Search products" value="${esc(ctx.q || '')}"></form>
    <nav class="main-nav" aria-label="Main">
      <a href="/shop">Shop</a><a href="/category/disposable-vapes">Disposables</a><a href="/category/e-liquids">E-Liquids</a><a href="/blog">Guides</a>
      <a class="cart-link" href="/cart">Cart <span class="badge" data-cart-count>${ctx.cartCount || 0}</span></a>
    </nav>
  </div>
  <div class="promo-bar">Free shipping over $${config.commerce.freeShippingThreshold} · Same-day dispatch before 2pm CT · Adults ${config.commerce.minAge}+ only</div>
</header>
<main id="main">${body}</main>
<footer class="site-footer">
  <div class="container footer-grid">
    <section>
      <h2 class="h4">Get ${config.commerce.leadDiscountPct}% off your first order</h2>
      <p>New drops, restocks and member-only deals. Adults ${config.commerce.minAge}+.</p>
      ${leadForm({ source: 'footer', ctx })}
    </section>
    <nav aria-label="Shop"><h2 class="h4">Shop</h2><a href="/category/disposable-vapes">Disposable Vapes</a><a href="/category/pod-systems">Pod Systems</a><a href="/category/vape-kits">Vape Kits</a><a href="/category/e-liquids">E-Liquids</a><a href="/category/nicotine-salts">Nicotine Salts</a><a href="/category/coils-pods">Coils &amp; Pods</a></nav>
    <nav aria-label="Help"><h2 class="h4">Help</h2><a href="/faq">FAQ</a><a href="/shipping-policy">Shipping</a><a href="/returns">Returns</a><a href="/contact">Contact</a><a href="/age-policy">Age Verification</a></nav>
    <nav aria-label="Company"><h2 class="h4">Company</h2><a href="/about">About</a><a href="/blog">Guides</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a></nav>
  </div>
  <div class="container legal">
    <p><strong>${NIC_WARNING}</strong> Products on this site are intended for adults ${config.commerce.minAge}+ only. Not for sale to minors, pregnant or breastfeeding women, or persons with heart disease or high blood pressure. Not intended to diagnose, treat or cure any disease, or as a smoking-cessation product.</p>
    <p>California Proposition 65 WARNING: Some products can expose you to chemicals including nicotine, known to the State of California to cause birth defects or other reproductive harm. See www.P65Warnings.ca.gov.</p>
    <p>© ${new Date().getFullYear()} ${esc(s.name)} · ${esc(s.address.street)}, ${esc(s.address.city)}, ${esc(s.address.region)} ${esc(s.address.postal)}</p>
  </div>
</footer>
${ctx.ageVerified ? '' : ageGate()}
${leadPopup(ctx)}
<script src="/app.js" defer></script>
</body>
</html>`;
}

export function leadForm({ source, ctx = {}, button = 'Get my code', compact = false }) {
  return `<form class="lead-form${compact ? ' compact' : ''}" action="/leads" method="post" data-lead-form>
  <input type="hidden" name="_csrf" value="${esc(ctx.csrf || '')}">
  <input type="hidden" name="source" value="${esc(source)}">
  <label class="sr-only" for="lead-email-${source}">Email</label>
  <input id="lead-email-${source}" type="email" name="email" required placeholder="you@example.com" autocomplete="email">
  <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
  <button class="btn" type="submit">${esc(button)}</button>
  <p class="fine">By signing up you confirm you are ${config.commerce.minAge}+ and agree to receive marketing emails. Unsubscribe anytime.</p>
  <p class="form-msg" role="status" aria-live="polite"></p>
</form>`;
}

function ageGate() {
  const n = config.commerce.minAge;
  return `<div class="age-gate" id="age-gate" role="dialog" aria-modal="true" aria-labelledby="age-title" hidden>
  <div class="age-card">
    <img src="/logo.svg" alt="" width="48" height="48">
    <h2 id="age-title">Are you ${n} or older?</h2>
    <p>You must be of legal smoking age (${n}+) to enter this site. Your age will be verified again at checkout.</p>
    <div class="age-actions"><button class="btn" data-age-yes>Yes, I'm ${n}+</button><a class="btn btn-ghost" href="https://www.google.com" rel="nofollow">No, exit</a></div>
    <p class="fine">${NIC_WARNING}</p>
  </div>
</div>`;
}

function leadPopup(ctx) {
  return `<div class="lead-popup" id="lead-popup" role="dialog" aria-modal="true" aria-labelledby="lp-title" hidden>
  <div class="lead-card">
    <button class="close" data-close-popup aria-label="Close">×</button>
    <p class="eyebrow">Members save more</p>
    <h2 id="lp-title">Take ${config.commerce.leadDiscountPct}% off your first order</h2>
    <p>Join the list for restock alerts, new flavors and exclusive drops.</p>
    ${leadForm({ source: 'popup', ctx, button: 'Unlock my discount' })}
  </div>
</div>`;
}

export function productCard(p) {
  const onSale = p.compare_at_cents && p.compare_at_cents > p.price_cents;
  return `<article class="card product-card">
  <a href="/products/${esc(p.slug)}" class="card-img"><img src="/img/products/${esc(p.slug)}.svg" alt="${esc(p.name)}" width="400" height="400" loading="lazy">${onSale ? '<span class="tag sale">Sale</span>' : ''}${p.stock <= 0 ? '<span class="tag oos">Sold out</span>' : ''}</a>
  <div class="card-body">
    <p class="brand">${esc(p.brand)}</p>
    <h3 class="card-title"><a href="/products/${esc(p.slug)}">${esc(p.name)}</a></h3>
    ${p.rating_count ? `<p class="stars" aria-label="Rated ${Number(p.rating_avg).toFixed(1)} out of 5">${stars(p.rating_avg)} <span>(${p.rating_count})</span></p>` : ''}
    <p class="price">${money(p.price_cents)} ${onSale ? `<s>${money(p.compare_at_cents)}</s>` : ''}</p>
    ${p.stock > 0 ? `<button class="btn btn-sm" data-add-to-cart="${p.id}">Add to cart</button>` : `<a class="btn btn-sm btn-ghost" href="/products/${esc(p.slug)}#notify">Notify me</a>`}
  </div>
</article>`;
}

export const stars = (avg) => {
  const r = Math.round(Number(avg) || 0);
  return `<span class="star-row">${'★'.repeat(r)}${'☆'.repeat(5 - r)}</span>`;
};

export function breadcrumbs(crumbs) {
  return `<nav class="crumbs container" aria-label="Breadcrumb"><ol>${crumbs.map(([n, p], i) => (i === crumbs.length - 1 ? `<li aria-current="page">${esc(n)}</li>` : `<li><a href="${esc(p)}">${esc(n)}</a></li>`)).join('')}</ol></nav>`;
}
