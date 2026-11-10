import { config } from '../config.js';
import { esc, money, markdown, safeJson } from '../lib/util.js';
import { US_STATES } from '../lib/commerce.js';
import { layout, productCard, breadcrumbs, leadForm, stars } from './layout.js';
import { breadcrumbLd, productLd, faqLd, itemListLd, articleLd } from '../seo.js';

export function homePage({ featured, categories, posts, ctx }) {
  const faqs = [
    { q: 'Do you verify age?', a: `Yes. All customers must be ${config.commerce.minAge}+; we verify date of birth at checkout and an adult signature is required on delivery.` },
    { q: 'How much is shipping?', a: `Free over $${config.commerce.freeShippingThreshold}; otherwise a flat $${config.commerce.flatShipping}. Orders before 2pm CT ship same day.` },
    { q: 'Which states do you ship to?', a: `All U.S. states except ${config.commerce.restrictedStates.join(', ')}, where vapor product delivery is restricted.` },
  ];
  const body = `
<section class="hero">
  <div class="container hero-inner">
    <div>
      <p class="eyebrow">Authentic devices · Lab-tested e-liquids</p>
      <h1>Premium vapes &amp; e-liquids, delivered fast.</h1>
      <p class="lead">Disposables, pod systems, sub-ohm kits and 100+ flavors from trusted brands. Free shipping over $${config.commerce.freeShippingThreshold}.</p>
      <div class="hero-cta"><a class="btn btn-lg" href="/shop">Shop all</a><a class="btn btn-lg btn-ghost" href="/category/disposable-vapes">Best-selling disposables</a></div>
    </div>
    <div class="hero-lead card">
      <h2 class="h3">${config.commerce.leadDiscountPct}% off your first order</h2>
      ${leadForm({ source: 'hero', ctx, button: 'Send my code' })}
    </div>
  </div>
</section>
<section class="container">
  <h2>Shop by category</h2>
  <div class="cat-grid">${categories.map((c) => `<a class="cat-tile" href="/category/${esc(c.slug)}"><strong>${esc(c.name)}</strong><span>${c.n} products</span></a>`).join('')}</div>
</section>
<section class="container">
  <div class="section-head"><h2>Featured</h2><a href="/shop">View all →</a></div>
  <div class="grid">${featured.map(productCard).join('')}</div>
</section>
<section class="container trust">
  <div><strong>100% authentic</strong><span>Sourced direct from manufacturers.</span></div>
  <div><strong>Age-verified checkout</strong><span>Responsible retail, ${config.commerce.minAge}+ only.</span></div>
  <div><strong>Same-day dispatch</strong><span>Order before 2pm CT.</span></div>
  <div><strong>30-day returns</strong><span>On unopened hardware.</span></div>
</section>
<section class="container">
  <div class="section-head"><h2>Vape guides</h2><a href="/blog">All guides →</a></div>
  <div class="grid grid-3">${posts.map(postCard).join('')}</div>
</section>
<section class="container faq">
  <h2>Frequently asked questions</h2>
  ${faqs.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}
</section>`;
  return layout({ title: `${config.store.name} — Online Vape Shop | Disposables, Pods & E-Liquids`, description: `${config.store.tagline}. Shop disposables, pod kits, e-liquids & nicotine salts. Free shipping over $${config.commerce.freeShippingThreshold}.`, canonical: '/', body, ld: [faqLd(faqs), itemListLd(featured)], ctx });
}

const postCard = (p) => `<article class="card post-card"><div class="card-body"><h3 class="card-title"><a href="/blog/${esc(p.slug)}">${esc(p.title)}</a></h3><p>${esc(p.excerpt)}</p><a href="/blog/${esc(p.slug)}">Read guide →</a></div></article>`;

export function listingPage({ title, h1, intro, products, categories, current, q, sort, canonical, crumbs, description, ctx, page = 1, pages = 1 }) {
  const sorts = [['featured', 'Featured'], ['price-asc', 'Price: low to high'], ['price-desc', 'Price: high to low'], ['newest', 'Newest'], ['rating', 'Top rated']];
  const qs = (extra) => { const u = new URLSearchParams({ ...(q ? { q } : {}), ...(sort && sort !== 'featured' ? { sort } : {}), ...extra }); const s = u.toString(); return s ? `?${s}` : ''; };
  const body = `${breadcrumbs(crumbs)}
<section class="container">
  <h1>${esc(h1)}</h1>
  ${intro ? `<p class="lead">${esc(intro)}</p>` : ''}
  <div class="listing">
    <aside class="filters" aria-label="Categories">
      <h2 class="h4">Categories</h2>
      <a href="/shop" ${!current ? 'aria-current="page"' : ''}>All products</a>
      ${categories.map((c) => `<a href="/category/${esc(c.slug)}" ${current === c.slug ? 'aria-current="page"' : ''}>${esc(c.name)}</a>`).join('')}
    </aside>
    <div>
      <form class="toolbar" method="get">
        ${q ? `<input type="hidden" name="q" value="${esc(q)}">` : ''}
        <p>${products.length ? `${products.length} product${products.length === 1 ? '' : 's'}${q ? ` for “${esc(q)}”` : ''}` : `No products found${q ? ` for “${esc(q)}”` : ''}.`}</p>
        <label>Sort <select name="sort" data-autosubmit>${sorts.map(([v, l]) => `<option value="${v}" ${sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </form>
      <div class="grid">${products.map(productCard).join('')}</div>
      ${pages > 1 ? `<nav class="pager" aria-label="Pagination">${Array.from({ length: pages }, (_, i) => i + 1).map((n) => (n === page ? `<span aria-current="page">${n}</span>` : `<a href="${esc(qs(n > 1 ? { page: n } : {}))}">${n}</a>`)).join('')}</nav>` : ''}
    </div>
  </div>
</section>`;
  return layout({ title, description, canonical, body, ld: [breadcrumbLd(crumbs), products.length ? itemListLd(products) : null], noindex: !!q, ctx });
}

export function productPage({ p, reviews, rating, related, ctx }) {
  const specs = safeJson(p.specs, {});
  const faqs = safeJson(p.faqs, []);
  const crumbs = [['Home', '/'], ['Shop', '/shop'], [p.category_name, `/category/${p.category_slug}`], [p.name, `/products/${p.slug}`]];
  const onSale = p.compare_at_cents && p.compare_at_cents > p.price_cents;
  const body = `${breadcrumbs(crumbs)}
<section class="container product">
  <div class="product-media"><img src="/img/products/${esc(p.slug)}.svg" alt="${esc(p.name)}" width="600" height="600"></div>
  <div class="product-info">
    <p class="brand">${esc(p.brand)}</p>
    <h1>${esc(p.name)}</h1>
    ${rating.count ? `<p class="stars"><a href="#reviews">${stars(rating.avg)} ${rating.avg.toFixed(1)} (${rating.count} review${rating.count === 1 ? '' : 's'})</a></p>` : ''}
    <p class="price price-lg">${money(p.price_cents)} ${onSale ? `<s>${money(p.compare_at_cents)}</s> <span class="tag sale">Save ${money(p.compare_at_cents - p.price_cents)}</span>` : ''}</p>
    <p class="summary">${esc(p.short_description)}</p>
    <ul class="facts">
      ${p.nicotine_mg ? `<li><strong>Nicotine:</strong> ${esc(p.nicotine_mg)}</li>` : ''}
      ${p.flavor_profile ? `<li><strong>Flavor:</strong> ${esc(p.flavor_profile)}</li>` : ''}
      <li><strong>Availability:</strong> ${p.stock > 0 ? (p.stock < 10 ? `Only ${p.stock} left` : 'In stock') : 'Sold out'}</li>
      <li><strong>SKU:</strong> ${esc(p.sku)}</li>
    </ul>
    ${p.stock > 0 ? `<form class="buy" data-add-form>
      <label>Qty <input type="number" name="qty" min="1" max="${Math.min(10, p.stock)}" value="1"></label>
      <button class="btn btn-lg" data-add-to-cart="${p.id}">Add to cart</button>
    </form>` : `<div id="notify" class="card notify"><h2 class="h4">Get notified when it's back</h2>${leadForm({ source: 'back_in_stock', ctx, button: 'Notify me', compact: true })}</div>`}
    ${p.contains_nicotine ? '<p class="nic-box">WARNING: This product contains nicotine. Nicotine is an addictive chemical.</p>' : ''}
    <p class="fine">Ships to adults ${config.commerce.minAge}+ only. Adult signature required. Free shipping over $${config.commerce.freeShippingThreshold}.</p>
  </div>
</section>
<section class="container product-details">
  <div>
    <h2>Description</h2>
    ${markdown(p.description)}
    ${Object.keys(specs).length ? `<h2>Specifications</h2><table class="specs"><tbody>${Object.entries(specs).map(([k, v]) => `<tr><th scope="row">${esc(k)}</th><td>${esc(v)}</td></tr>`).join('')}</tbody></table>` : ''}
    ${faqs.length ? `<h2>FAQ</h2>${faqs.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}` : ''}
  </div>
  <div id="reviews">
    <h2>Reviews</h2>
    ${reviews.length ? reviews.map((r) => `<blockquote class="review"><p class="stars">${stars(r.rating)}</p><p>${esc(r.body)}</p><cite>— ${esc(r.author)}, ${esc(r.created_at.slice(0, 10))}</cite></blockquote>`).join('') : '<p>No reviews yet.</p>'}
    <details class="card review-form"><summary>Write a review</summary>
      <form method="post" action="/products/${esc(p.slug)}/reviews">
        <input type="hidden" name="_csrf" value="${esc(ctx.csrf)}">
        <label>Name <input name="author" required maxlength="60"></label>
        <label>Rating <select name="rating">${[5, 4, 3, 2, 1].map((n) => `<option>${n}</option>`).join('')}</select></label>
        <label>Review <textarea name="body" required maxlength="2000" rows="4"></textarea></label>
        <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
        <button class="btn">Submit review</button>
        <p class="fine">Reviews are moderated before they appear.</p>
      </form>
    </details>
  </div>
</section>
${related.length ? `<section class="container"><h2>You may also like</h2><div class="grid">${related.map(productCard).join('')}</div></section>` : ''}`;
  return layout({ title: p.seo_title || p.name, description: p.seo_description || p.short_description, canonical: `/products/${p.slug}`, body, ogType: 'product', ld: [productLd(p, { reviews, rating }), breadcrumbLd(crumbs), faqLd(faqs)], ctx });
}

export function cartPage({ priced, ctx }) {
  const body = `<section class="container narrow">
  <h1>Your cart</h1>
  ${priced.lines.length === 0 ? '<p>Your cart is empty. <a href="/shop">Continue shopping →</a></p>' : `
  <table class="cart-table">
    <thead><tr><th>Product</th><th>Price</th><th>Qty</th><th>Total</th></tr></thead>
    <tbody>${priced.lines.map((l) => `<tr>
      <td><a href="/products/${esc(l.slug)}">${esc(l.name)}</a></td><td>${money(l.unit_cents)}</td>
      <td><input type="number" min="0" max="10" value="${l.qty}" data-cart-qty="${l.productId}" aria-label="Quantity for ${esc(l.name)}"></td>
      <td>${money(l.line_cents)}</td></tr>`).join('')}</tbody>
  </table>
  <form class="discount-form" method="post" action="/cart/discount">
    <input type="hidden" name="_csrf" value="${esc(ctx.csrf)}">
    <label>Discount code <input name="code" value="${esc(priced.discountCode)}" placeholder="WELCOME15"></label><button class="btn btn-ghost">Apply</button>
  </form>
  ${totals(priced)}
  ${priced.subtotal - priced.discount < config.commerce.freeShippingThreshold * 100 ? `<p class="hint">Add ${money(config.commerce.freeShippingThreshold * 100 - (priced.subtotal - priced.discount))} more for free shipping.</p>` : ''}
  <a class="btn btn-lg btn-block" href="/checkout">Checkout</a>`}
</section>`;
  return layout({ title: 'Cart', body, noindex: true, ctx });
}

export function totals(p) {
  return `<dl class="totals">
  <dt>Subtotal</dt><dd>${money(p.subtotal)}</dd>
  ${p.discount ? `<dt>Discount (${esc(p.discountCode)})</dt><dd>−${money(p.discount)}</dd>` : ''}
  <dt>Shipping</dt><dd>${p.shipping ? money(p.shipping) : 'Free'}</dd>
  <dt>Est. tax</dt><dd>${money(p.tax)}</dd>
  <dt class="total">Total</dt><dd class="total">${money(p.total)}</dd>
</dl>`;
}

export function checkoutPage({ priced, form = {}, error, ctx }) {
  const f = (k) => esc(form[k] || '');
  const body = `<section class="container checkout">
  <form method="post" action="/checkout" class="checkout-form" novalidate>
    <h1>Checkout</h1>
    ${error ? `<p class="alert" role="alert">${esc(error)}</p>` : ''}
    <input type="hidden" name="_csrf" value="${esc(ctx.csrf)}">
    <fieldset><legend>Contact</legend>
      <label>Email <input type="email" name="email" required autocomplete="email" value="${f('email')}" data-capture-email></label>
      <label>Phone <input type="tel" name="phone" autocomplete="tel" value="${f('phone')}"></label>
      <label class="check"><input type="checkbox" name="marketing" value="1" ${form.marketing ? 'checked' : ''}> Email me new drops &amp; deals</label>
    </fieldset>
    <fieldset><legend>Age verification (${config.commerce.minAge}+)</legend>
      <label>Date of birth <input type="date" name="dob" required value="${f('dob')}" max="${new Date().toISOString().slice(0, 10)}"></label>
      <p class="fine">Required by law. We verify your age against public records; an adult signature is required on delivery.</p>
    </fieldset>
    <fieldset><legend>Shipping address</legend>
      <div class="row"><label>First name <input name="first_name" required autocomplete="given-name" value="${f('first_name')}"></label>
      <label>Last name <input name="last_name" required autocomplete="family-name" value="${f('last_name')}"></label></div>
      <label>Address <input name="address1" required autocomplete="address-line1" value="${f('address1')}"></label>
      <label>Apt, suite (optional) <input name="address2" autocomplete="address-line2" value="${f('address2')}"></label>
      <div class="row"><label>City <input name="city" required autocomplete="address-level2" value="${f('city')}"></label>
      <label>State <select name="state" required autocomplete="address-level1"><option value="">—</option>${US_STATES.map((s) => `<option ${form.state === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
      <label>ZIP <input name="postal" required pattern="\\d{5}(-\\d{4})?" autocomplete="postal-code" value="${f('postal')}"></label></div>
      <p class="fine">We cannot ship to: ${config.commerce.restrictedStates.join(', ')}.</p>
    </fieldset>
    <label class="check"><input type="checkbox" name="attest" value="1" required> I certify that I am ${config.commerce.minAge} or older and agree to the <a href="/terms" target="_blank">Terms</a> and <a href="/age-policy" target="_blank">Age Verification Policy</a>.</label>
    <button class="btn btn-lg btn-block">Continue to secure payment</button>
    <p class="fine">Payments are processed on a PCI-compliant hosted page. We never see or store your card number.</p>
  </form>
  <aside class="card summary-box">
    <h2 class="h4">Order summary</h2>
    <ul class="mini-lines">${priced.lines.map((l) => `<li><span>${esc(l.name)} × ${l.qty}</span><span>${money(l.line_cents)}</span></li>`).join('')}</ul>
    ${totals(priced)}
  </aside>
</section>`;
  return layout({ title: 'Checkout', body, noindex: true, ctx });
}

export function paymentRedirectPage({ payment, ctx }) {
  const body = `<section class="container narrow center">
  <h1>Redirecting to secure payment…</h1>
  <form id="pay-form" method="post" action="${esc(payment.action)}">
    ${Object.entries(payment.fields).map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`).join('')}
    <button class="btn btn-lg">Continue to payment</button>
  </form>
  <script>document.getElementById('pay-form').submit()</script>
</section>`;
  return layout({ title: 'Payment', body, noindex: true, ctx: { ...ctx, ageVerified: true } });
}

export function demoPayPage({ order, ctx }) {
  const body = `<section class="container narrow">
  <h1>Demo payment</h1>
  <p class="alert">Demo mode — no real card is charged. Configure <code>PAYMENT_PROVIDER=authorizenet</code> for live payments.</p>
  <p>Order <strong>${esc(order.number)}</strong> · Total <strong>${money(order.total_cents)}</strong></p>
  <form method="post" action="/checkout/demo-pay/${esc(order.number)}" class="row">
    <input type="hidden" name="_csrf" value="${esc(ctx.csrf)}">
    <button class="btn btn-lg" name="result" value="approve">Approve payment</button>
    <button class="btn btn-lg btn-ghost" name="result" value="decline">Decline</button>
  </form>
</section>`;
  return layout({ title: 'Demo payment', body, noindex: true, ctx });
}

export function orderCompletePage({ order, items, ctx }) {
  const paid = order.status === 'paid' || order.status === 'fulfilled' || order.status === 'shipped';
  const failed = order.status === 'failed' || order.status === 'cancelled';
  const body = `<section class="container narrow" ${!paid && !failed ? 'data-poll-order="' + esc(order.number) + '"' : ''}>
  <h1>${paid ? 'Thank you — order confirmed!' : failed ? 'Payment not completed' : 'Processing your payment…'}</h1>
  <p>Order <strong>${esc(order.number)}</strong>${paid ? ` · A confirmation was sent to ${esc(order.email)}.` : ''}</p>
  ${failed ? '<p>Your payment was declined or cancelled. <a href="/checkout">Try again</a>.</p>' : ''}
  ${!paid && !failed ? '<p class="hint">This page will update automatically once your payment is confirmed.</p>' : ''}
  <ul class="mini-lines">${items.map((l) => `<li><span>${esc(l.name)} × ${l.qty}</span><span>${money(l.line_cents)}</span></li>`).join('')}</ul>
  <p><strong>Total: ${money(order.total_cents)}</strong></p>
  <p><a class="btn" href="/shop">Continue shopping</a></p>
</section>
${paid ? `<script>window.gtag&&gtag('event','purchase',{transaction_id:${JSON.stringify(order.number)},value:${(order.total_cents / 100).toFixed(2)},currency:'USD'});</script>` : ''}`;
  return layout({ title: 'Order status', body, noindex: true, ctx });
}

export function blogIndexPage({ posts, ctx }) {
  const crumbs = [['Home', '/'], ['Guides', '/blog']];
  const body = `${breadcrumbs(crumbs)}<section class="container"><h1>Vape guides &amp; news</h1><p class="lead">Straight answers about devices, e-liquids, nicotine and shipping.</p><div class="grid grid-3">${posts.map(postCard).join('')}</div></section>`;
  return layout({ title: 'Vape Guides & Buying Advice', description: 'Expert vape guides: choosing a disposable, nicotine salt vs freebase, coil care and more.', canonical: '/blog', body, ld: [breadcrumbLd(crumbs)], ctx });
}

export function postPage({ post, faqs, products, ctx }) {
  const crumbs = [['Home', '/'], ['Guides', '/blog'], [post.title, `/blog/${post.slug}`]];
  const body = `${breadcrumbs(crumbs)}
<article class="container narrow prose">
  <h1>${esc(post.title)}</h1>
  <p class="meta">By ${esc(post.author)} · <time datetime="${esc(post.published_at)}">${esc(post.published_at.slice(0, 10))}</time> · Updated <time datetime="${esc(post.updated_at)}">${esc(post.updated_at.slice(0, 10))}</time></p>
  <p class="tldr"><strong>TL;DR:</strong> ${esc(post.excerpt)}</p>
  ${markdown(post.body)}
  <aside class="card cta">${leadForm({ source: 'blog', ctx, button: `Get ${config.commerce.leadDiscountPct}% off` })}</aside>
</article>
${products.length ? `<section class="container"><h2>Shop related products</h2><div class="grid">${products.map(productCard).join('')}</div></section>` : ''}`;
  return layout({ title: post.title, description: post.seo_description || post.excerpt, canonical: `/blog/${post.slug}`, body, ogType: 'article', ld: [articleLd(post), breadcrumbLd(crumbs), faqLd(faqs)], ctx });
}

export function staticPage({ slug, title, description, md, ctx, extra = '', ld = [] }) {
  const crumbs = [['Home', '/'], [title, `/${slug}`]];
  const body = `${breadcrumbs(crumbs)}<article class="container narrow prose"><h1>${esc(title)}</h1>${markdown(md)}${extra}</article>`;
  return layout({ title, description, canonical: `/${slug}`, body, ld: [breadcrumbLd(crumbs), ...ld], ctx });
}

export function contactExtra(ctx, sent) {
  return sent ? '<p class="alert ok">Thanks! We’ll get back to you within one business day.</p>' : `<form method="post" action="/contact" class="card stack">
  <input type="hidden" name="_csrf" value="${esc(ctx.csrf)}">
  <label>Name <input name="name" required maxlength="120"></label>
  <label>Email <input type="email" name="email" required></label>
  <label>Phone (optional) <input type="tel" name="phone"></label>
  <label>Message <textarea name="message" required rows="5" maxlength="5000"></textarea></label>
  <label class="check"><input type="checkbox" name="sms" value="1"> Text me order &amp; restock updates (msg &amp; data rates may apply)</label>
  <input type="text" name="website" class="hp" tabindex="-1" autocomplete="off" aria-hidden="true">
  <button class="btn">Send message</button>
</form>`;
}

export function notFoundPage(ctx) {
  return layout({ title: 'Page not found', body: '<section class="container narrow center"><h1>Page not found</h1><p>That page doesn’t exist. <a href="/shop">Browse the shop →</a></p></section>', noindex: true, ctx });
}
