import { config } from '../config.js';
import { esc, money, safeJson } from '../lib/util.js';

const NAV = [['/admin', 'Dashboard'], ['/admin/orders', 'Orders'], ['/admin/products', 'Products'], ['/admin/leads', 'Leads'], ['/admin/carts', 'Abandoned carts'], ['/admin/reviews', 'Reviews'], ['/admin/discounts', 'Discounts'], ['/admin/posts', 'Blog']];

export function adminLayout({ title, body, ctx, active = '' }) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>${esc(title)} · Admin · ${esc(config.store.name)}</title>
<link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/admin.css"></head>
<body class="admin">
${ctx.admin ? `<header class="admin-header"><a href="/admin" class="logo"><img src="/logo.svg" alt="" width="24" height="24"> ${esc(config.store.name)} Admin</a>
<nav>${NAV.map(([h, l]) => `<a href="${h}" ${active === h ? 'aria-current="page"' : ''}>${l}</a>`).join('')}</nav>
<form method="post" action="/admin/logout"><input type="hidden" name="_csrf" value="${esc(ctx.csrf)}"><button class="btn btn-sm btn-ghost">Log out</button></form></header>` : ''}
<main class="admin-main">${ctx.flash ? `<p class="alert ok">${esc(ctx.flash)}</p>` : ''}${body}</main>
<script src="/app.js" defer></script></body></html>`;
}

const csrf = (ctx) => `<input type="hidden" name="_csrf" value="${esc(ctx.csrf)}">`;
const badge = (s) => `<span class="status status-${esc(s)}">${esc(s)}</span>`;

export function loginPage({ ctx, error }) {
  return adminLayout({ title: 'Log in', ctx, body: `<form method="post" action="/admin/login" class="card login stack">
  <h1>Admin login</h1>${error ? `<p class="alert">${esc(error)}</p>` : ''}${csrf(ctx)}
  <label>Email <input type="email" name="email" required autocomplete="username"></label>
  <label>Password <input type="password" name="password" required autocomplete="current-password"></label>
  <button class="btn">Log in</button></form>` });
}

export function dashboardPage({ ctx, stats, recentOrders, recentLeads, sources, lowStock, daily }) {
  const max = Math.max(1, ...daily.map((d) => d.revenue));
  return adminLayout({ title: 'Dashboard', active: '/admin', ctx, body: `<h1>Dashboard</h1>
<div class="kpis">
  <div class="kpi"><span>Revenue (30d)</span><strong>${money(stats.revenue30)}</strong></div>
  <div class="kpi"><span>Paid orders (30d)</span><strong>${stats.orders30}</strong></div>
  <div class="kpi"><span>Avg. order value</span><strong>${money(stats.aov)}</strong></div>
  <div class="kpi"><span>New leads (30d)</span><strong>${stats.leads30}</strong></div>
  <div class="kpi"><span>Lead → customer</span><strong>${stats.conversion}%</strong></div>
  <div class="kpi"><span>Abandoned carts (7d)</span><strong>${stats.abandoned7}</strong></div>
</div>
<section class="card"><h2 class="h4">Revenue, last 14 days</h2>
<div class="bars" role="img" aria-label="Daily revenue chart">${daily.map((d) => `<div class="bar" style="--h:${Math.round((d.revenue / max) * 100)}%" title="${esc(d.day)}: ${money(d.revenue)}"><span>${esc(d.day.slice(5))}</span></div>`).join('')}</div></section>
<div class="admin-grid">
<section class="card"><h2 class="h4">Recent orders</h2>${ordersTable(recentOrders)}</section>
<section class="card"><h2 class="h4">Lead sources</h2><table><thead><tr><th>Source</th><th>Leads</th><th>Customers</th></tr></thead><tbody>${sources.map((s) => `<tr><td>${esc(s.source)}</td><td>${s.n}</td><td>${s.customers}</td></tr>`).join('')}</tbody></table></section>
<section class="card"><h2 class="h4">Newest leads</h2><table><tbody>${recentLeads.map((l) => `<tr><td>${esc(l.email)}</td><td>${esc(l.source)}</td><td>${esc(l.created_at.slice(0, 10))}</td></tr>`).join('')}</tbody></table></section>
<section class="card"><h2 class="h4">Low stock</h2><table><tbody>${lowStock.map((p) => `<tr><td><a href="/admin/products/${p.id}">${esc(p.name)}</a></td><td>${p.stock}</td></tr>`).join('') || '<tr><td>All good.</td></tr>'}</tbody></table></section>
</div>` });
}

function ordersTable(orders) {
  return `<table><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>Status</th><th>Date</th></tr></thead><tbody>
${orders.map((o) => `<tr><td><a href="/admin/orders/${o.id}">${esc(o.number)}</a></td><td>${esc(o.email)}</td><td>${money(o.total_cents)}</td><td>${badge(o.status)}</td><td>${esc(o.created_at.slice(0, 16))}</td></tr>`).join('') || '<tr><td colspan="5">No orders yet.</td></tr>'}</tbody></table>`;
}

export function ordersPage({ ctx, orders, status }) {
  const statuses = ['', 'pending', 'paid', 'fulfilled', 'shipped', 'failed', 'cancelled', 'refunded'];
  return adminLayout({ title: 'Orders', active: '/admin/orders', ctx, body: `<h1>Orders</h1>
<form class="toolbar" method="get"><label>Status <select name="status" data-autosubmit>${statuses.map((s) => `<option value="${s}" ${s === status ? 'selected' : ''}>${s || 'All'}</option>`).join('')}</select></label></form>
<div class="card">${ordersTable(orders)}</div>` });
}

export function orderDetailPage({ ctx, order }) {
  const items = safeJson(order.items, []);
  const statuses = ['pending', 'paid', 'fulfilled', 'shipped', 'cancelled', 'refunded'];
  return adminLayout({ title: `Order ${order.number}`, active: '/admin/orders', ctx, body: `<h1>Order ${esc(order.number)} ${badge(order.status)}</h1>
<div class="admin-grid">
<section class="card"><h2 class="h4">Items</h2><table><tbody>${items.map((i) => `<tr><td>${esc(i.name)} <small>${esc(i.sku)}</small></td><td>× ${i.qty}</td><td>${money(i.line_cents)}</td></tr>`).join('')}</tbody></table>
<dl class="totals"><dt>Subtotal</dt><dd>${money(order.subtotal_cents)}</dd><dt>Discount ${esc(order.discount_code)}</dt><dd>−${money(order.discount_cents)}</dd><dt>Shipping</dt><dd>${money(order.shipping_cents)}</dd><dt>Tax</dt><dd>${money(order.tax_cents)}</dd><dt class="total">Total</dt><dd class="total">${money(order.total_cents)}</dd></dl></section>
<section class="card"><h2 class="h4">Customer</h2>
<p>${esc(order.first_name)} ${esc(order.last_name)}<br>${esc(order.email)}<br>${esc(order.phone)}</p>
<p>${esc(order.address1)} ${esc(order.address2)}<br>${esc(order.city)}, ${esc(order.state)} ${esc(order.postal)}</p>
<p>DOB: ${esc(order.dob)} · Age check: ${order.age_verified ? '✅ passed' : '⚠️ not verified'}</p>
<p>Payment: ${esc(order.payment_provider)} ${esc(order.payment_ref)}</p></section>
<section class="card"><h2 class="h4">Update</h2><form method="post" action="/admin/orders/${order.id}" class="stack">${csrf(ctx)}
<label>Status <select name="status">${statuses.map((s) => `<option ${s === order.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
<label>Tracking number <input name="tracking_number" value="${esc(order.tracking_number)}"></label>
<label>Internal notes <textarea name="notes" rows="3">${esc(order.notes)}</textarea></label>
<label class="check"><input type="checkbox" name="notify" value="1"> Email customer when marked shipped</label>
<button class="btn">Save</button></form></section>
</div>` });
}

export function productsPage({ ctx, products }) {
  return adminLayout({ title: 'Products', active: '/admin/products', ctx, body: `<div class="section-head"><h1>Products</h1><a class="btn" href="/admin/products/new">New product</a></div>
<div class="card"><table><thead><tr><th>Name</th><th>SKU</th><th>Category</th><th>Price</th><th>Stock</th><th>Active</th></tr></thead><tbody>
${products.map((p) => `<tr><td><a href="/admin/products/${p.id}">${esc(p.name)}</a></td><td>${esc(p.sku)}</td><td>${esc(p.category_name)}</td><td>${money(p.price_cents)}</td><td>${p.stock}</td><td>${p.active ? 'Yes' : 'No'}</td></tr>`).join('')}
</tbody></table></div>` });
}

export function productFormPage({ ctx, p = {}, categories, error }) {
  const v = (k) => esc(p[k] ?? '');
  const specs = p.specs ? JSON.stringify(safeJson(p.specs, {}), null, 2) : '{}';
  const faqs = p.faqs ? JSON.stringify(safeJson(p.faqs, []), null, 2) : '[]';
  return adminLayout({ title: p.id ? `Edit ${p.name}` : 'New product', active: '/admin/products', ctx, body: `<h1>${p.id ? `Edit ${esc(p.name)}` : 'New product'}</h1>
${error ? `<p class="alert">${esc(error)}</p>` : ''}
<form method="post" action="/admin/products/${p.id || 'new'}" class="card stack product-form">${csrf(ctx)}
<div class="row"><label>Name <input name="name" required value="${v('name')}"></label><label>Slug <input name="slug" value="${v('slug')}" placeholder="auto from name"></label></div>
<div class="row"><label>Brand <input name="brand" value="${v('brand')}"></label><label>SKU <input name="sku" value="${v('sku')}"></label>
<label>Category <select name="category_id">${categories.map((c) => `<option value="${c.id}" ${c.id === p.category_id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label></div>
<div class="row"><label>Price ($) <input name="price" type="number" step="0.01" min="0" required value="${p.price_cents != null ? (p.price_cents / 100).toFixed(2) : ''}"></label>
<label>Compare-at ($) <input name="compare_at" type="number" step="0.01" min="0" value="${p.compare_at_cents ? (p.compare_at_cents / 100).toFixed(2) : ''}"></label>
<label>Stock <input name="stock" type="number" min="0" value="${v('stock') || 0}"></label></div>
<div class="row"><label>Nicotine <input name="nicotine_mg" value="${v('nicotine_mg')}"></label><label>Flavor profile <input name="flavor_profile" value="${v('flavor_profile')}"></label></div>
<label>Short description <input name="short_description" maxlength="300" value="${v('short_description')}"></label>
<label>Description (Markdown) <textarea name="description" rows="8">${v('description')}</textarea></label>
<div class="row"><label>Specs (JSON object) <textarea name="specs" rows="6" class="mono">${esc(specs)}</textarea></label>
<label>FAQs (JSON: [{"q","a"}]) <textarea name="faqs" rows="6" class="mono">${esc(faqs)}</textarea></label></div>
<fieldset><legend>SEO</legend>
<label>SEO title <input name="seo_title" maxlength="70" value="${v('seo_title')}" data-counter="60"></label>
<label>Meta description <textarea name="seo_description" maxlength="200" rows="2" data-counter="155">${v('seo_description')}</textarea></label></fieldset>
<div class="row"><label class="check"><input type="checkbox" name="contains_nicotine" value="1" ${p.contains_nicotine ?? 1 ? 'checked' : ''}> Contains nicotine</label>
<label class="check"><input type="checkbox" name="featured" value="1" ${p.featured ? 'checked' : ''}> Featured</label>
<label class="check"><input type="checkbox" name="active" value="1" ${p.active ?? 1 ? 'checked' : ''}> Active</label></div>
<button class="btn">Save product</button>
</form>
${p.id ? `<form method="post" action="/admin/products/${p.id}/delete" data-confirm="Delete this product?">${csrf(ctx)}<button class="btn btn-ghost danger">Delete product</button></form>` : ''}` });
}

export function leadsPage({ ctx, leads, q, status }) {
  const statuses = ['', 'new', 'contacted', 'customer', 'unsubscribed'];
  return adminLayout({ title: 'Leads', active: '/admin/leads', ctx, body: `<div class="section-head"><h1>Leads</h1><a class="btn" href="/admin/leads.csv">Export CSV</a></div>
<form class="toolbar" method="get"><input type="search" name="q" value="${esc(q)}" placeholder="Search email or name"><select name="status">${statuses.map((s) => `<option value="${s}" ${s === status ? 'selected' : ''}>${s || 'All statuses'}</option>`).join('')}</select><button class="btn btn-sm">Filter</button></form>
<div class="card"><table><thead><tr><th>Email</th><th>Name</th><th>Source</th><th>UTM</th><th>Score</th><th>Status</th><th>Created</th></tr></thead><tbody>
${leads.map((l) => `<tr><td><a href="/admin/leads/${l.id}">${esc(l.email)}</a></td><td>${esc(l.name)}</td><td>${esc(l.source)}</td><td>${esc([l.utm_source, l.utm_medium, l.utm_campaign].filter(Boolean).join(' / '))}</td><td>${l.score}</td><td>${badge(l.status)}</td><td>${esc(l.created_at.slice(0, 10))}</td></tr>`).join('') || '<tr><td colspan="7">No leads.</td></tr>'}
</tbody></table></div>` });
}

export function leadDetailPage({ ctx, lead, events, orders }) {
  return adminLayout({ title: lead.email, active: '/admin/leads', ctx, body: `<h1>${esc(lead.email)} ${badge(lead.status)}</h1>
<div class="admin-grid">
<section class="card"><h2 class="h4">Profile</h2><p>Name: ${esc(lead.name) || '—'}<br>Phone: ${esc(lead.phone) || '—'}<br>Source: ${esc(lead.source)}<br>UTM: ${esc([lead.utm_source, lead.utm_medium, lead.utm_campaign].filter(Boolean).join(' / ') || '—')}<br>Landing page: ${esc(lead.landing_page) || '—'}<br>Email consent: ${lead.consent_email ? 'Yes' : 'No'} · SMS consent: ${lead.consent_sms ? 'Yes' : 'No'}<br>Score: ${lead.score}</p>
<form method="post" action="/admin/leads/${lead.id}" class="stack">${csrf(ctx)}
<label>Status <select name="status">${['new', 'contacted', 'customer', 'unsubscribed'].map((s) => `<option ${s === lead.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
<label>Notes <textarea name="notes" rows="4">${esc(lead.notes)}</textarea></label><button class="btn">Save</button></form></section>
<section class="card"><h2 class="h4">Activity</h2><table><tbody>${events.map((e) => `<tr><td>${esc(e.created_at.slice(0, 16))}</td><td>${esc(e.type)}</td><td><code>${esc(e.data)}</code></td></tr>`).join('')}</tbody></table></section>
<section class="card"><h2 class="h4">Orders</h2>${ordersTable(orders)}</section>
</div>` });
}

export function cartsPage({ ctx, carts }) {
  return adminLayout({ title: 'Abandoned carts', active: '/admin/carts', ctx, body: `<div class="section-head"><h1>Abandoned carts</h1>
<form method="post" action="/admin/carts/recover">${csrf(ctx)}<button class="btn">Send recovery emails now</button></form></div>
<p class="hint">Carts with an email, idle for more than 1 hour, not converted. Recovery emails also run automatically every 15 minutes.</p>
<div class="card"><table><thead><tr><th>Email</th><th>Items</th><th>Last activity</th><th>Email sent</th></tr></thead><tbody>
${carts.map((c) => `<tr><td>${esc(c.email)}</td><td>${safeJson(c.items, []).reduce((s, i) => s + i.qty, 0)}</td><td>${esc(c.updated_at)}</td><td>${c.recovered_email_sent ? 'Yes' : 'No'}</td></tr>`).join('') || '<tr><td colspan="4">None.</td></tr>'}
</tbody></table></div>` });
}

export function reviewsPage({ ctx, reviews }) {
  return adminLayout({ title: 'Reviews', active: '/admin/reviews', ctx, body: `<h1>Reviews</h1><div class="card"><table><thead><tr><th>Product</th><th>Author</th><th>Rating</th><th>Review</th><th>Status</th><th></th></tr></thead><tbody>
${reviews.map((r) => `<tr><td>${esc(r.product_name)}</td><td>${esc(r.author)}</td><td>${r.rating}</td><td>${esc(r.body)}</td><td>${r.approved ? 'Approved' : 'Pending'}</td>
<td><form method="post" action="/admin/reviews/${r.id}">${csrf(ctx)}${r.approved ? '' : '<button class="btn btn-sm" name="action" value="approve">Approve</button>'} <button class="btn btn-sm btn-ghost" name="action" value="delete">Delete</button></form></td></tr>`).join('') || '<tr><td colspan="6">No reviews.</td></tr>'}
</tbody></table></div>` });
}

export function discountsPage({ ctx, discounts }) {
  return adminLayout({ title: 'Discounts', active: '/admin/discounts', ctx, body: `<h1>Discount codes</h1>
<div class="card"><table><thead><tr><th>Code</th><th>% off</th><th>$ off</th><th>Min subtotal</th><th>Uses</th><th>Active</th><th></th></tr></thead><tbody>
${discounts.map((d) => `<tr><td><code>${esc(d.code)}</code></td><td>${d.percent_off}%</td><td>${money(d.amount_off_cents)}</td><td>${money(d.min_subtotal_cents)}</td><td>${d.uses}${d.max_uses != null ? ` / ${d.max_uses}` : ''}</td><td>${d.active ? 'Yes' : 'No'}</td>
<td><form method="post" action="/admin/discounts/${d.id}/toggle">${csrf(ctx)}<button class="btn btn-sm btn-ghost">${d.active ? 'Disable' : 'Enable'}</button></form></td></tr>`).join('')}
</tbody></table></div>
<form method="post" action="/admin/discounts" class="card stack"><h2 class="h4">New code</h2>${csrf(ctx)}
<div class="row"><label>Code <input name="code" required pattern="[A-Za-z0-9_-]+"></label><label>% off <input name="percent_off" type="number" min="0" max="100" value="0"></label>
<label>$ off <input name="amount_off" type="number" step="0.01" min="0" value="0"></label><label>Min subtotal ($) <input name="min_subtotal" type="number" step="0.01" min="0" value="0"></label><label>Max uses <input name="max_uses" type="number" min="1"></label></div>
<button class="btn">Create</button></form>` });
}

export function postsPage({ ctx, posts }) {
  return adminLayout({ title: 'Blog', active: '/admin/posts', ctx, body: `<div class="section-head"><h1>Blog posts</h1><a class="btn" href="/admin/posts/new">New post</a></div>
<div class="card"><table><thead><tr><th>Title</th><th>Published</th><th>Updated</th></tr></thead><tbody>
${posts.map((p) => `<tr><td><a href="/admin/posts/${p.id}">${esc(p.title)}</a></td><td>${p.published ? 'Yes' : 'Draft'}</td><td>${esc(p.updated_at.slice(0, 10))}</td></tr>`).join('')}
</tbody></table></div>` });
}

export function postFormPage({ ctx, post = {} }) {
  const v = (k) => esc(post[k] ?? '');
  return adminLayout({ title: post.id ? 'Edit post' : 'New post', active: '/admin/posts', ctx, body: `<h1>${post.id ? 'Edit post' : 'New post'}</h1>
<form method="post" action="/admin/posts/${post.id || 'new'}" class="card stack">${csrf(ctx)}
<div class="row"><label>Title <input name="title" required value="${v('title')}"></label><label>Slug <input name="slug" value="${v('slug')}" placeholder="auto from title"></label></div>
<label>Excerpt / TL;DR (shown in search &amp; AI answers) <textarea name="excerpt" rows="2" maxlength="300">${v('excerpt')}</textarea></label>
<label>Body (Markdown; add a "## FAQ" section with "### Question" headings to get FAQ rich results) <textarea name="body" rows="18" class="mono">${v('body')}</textarea></label>
<label>Meta description <textarea name="seo_description" rows="2" maxlength="200" data-counter="155">${v('seo_description')}</textarea></label>
<label class="check"><input type="checkbox" name="published" value="1" ${post.published ?? 1 ? 'checked' : ''}> Published</label>
<button class="btn">Save post</button></form>` });
}
