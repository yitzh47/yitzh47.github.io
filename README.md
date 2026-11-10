# Cloudline Vapor — online vape store

A full-stack online vape store with a catalog, cart, checkout through a high-risk payment gateway, age verification and shipping compliance, lead generation, SEO and AI-search optimization, and an admin backend.

**Stack:** Node.js 22 + Express 5, with Node's built-in SQLite (`node:sqlite`). Pages are rendered on the server, so crawlers get full HTML. Express is the only runtime dependency, and there is no build step.

```bash
npm install
npm run dev          # http://localhost:3000  (seeds a demo catalog on first run)
npm test             # end-to-end test suite
```

Admin: `/admin`. The development login is `admin@example.com` / `admin123`. Production refuses to start until you change it.

---

## Features

### Storefront
- Home, shop with search, sorting and pagination, category pages, product pages with specs, FAQs and reviews, a blog, and policy pages
- Cart stored on the server. Every price is recalculated from the database, and quantities are capped by stock
- Discount codes (percent off, fixed amount off, minimum subtotal, maximum uses)
- Free-shipping threshold, flat shipping rate and an estimated tax
- Responsive, with light and dark mode and accessible markup

### Payments
> **Stripe, PayPal and Square prohibit vape sales.** Using them risks a frozen account and held funds. You need a **high-risk merchant account**, and most of those run on **Authorize.net**.

- `PAYMENT_PROVIDER=authorizenet` uses **Accept Hosted**. Card data goes only to Authorize.net's hosted form, which keeps you at PCI SAQ-A
- The order is marked paid **only by the webhook** after its HMAC-SHA512 signature checks out. The server then re-fetches the transaction and checks the amount and invoice number
- `PAYMENT_PROVIDER=demo` uses a local approve/decline page for development. It is blocked in production
- Gateways sit behind a small interface (`src/payments/index.js`), so you can add NMI or another gateway

**Authorize.net setup:** in Merchant Interface → Account → Webhooks, add `https://YOURDOMAIN/webhooks/payments/authorizenet` for `authcapture.created`, `refund.created` and `void.created`. Then copy the Signature Key into `AUTHNET_SIGNATURE_KEY`.

### Compliance
- Age gate when a visitor enters the site, plus a date-of-birth check at checkout against `MIN_AGE` (default 21) and a required age attestation
- Blocks restricted states (`RESTRICTED_STATES`) and P.O. boxes, since an adult signature is required on delivery
- FDA nicotine warning shown site-wide and on each product, Prop 65 notice, and PACT Act signature messaging
- ⚠️ **Before you launch:** the age check is a date-of-birth self-attestation. Connect a real age-verification service (AgeChecker.net, Veratad or similar) at the marked spot in `src/lib/orders.js`. Replace the flat tax rate with a tax API that also handles state vape excise taxes. Have counsel review the shipping restrictions and policies.

### Lead generation
- Email capture in the hero, the footer, blog posts and back-in-stock forms, plus a popup that opens on a timer or on exit intent. It is suppressed for subscribers and on the cart and checkout pages
- Welcome email with a first-order discount code
- First-touch UTM attribution (source, medium, campaign, landing page)
- Lead scoring and an activity timeline (signup, contact, checkout started, cart abandoned, order). A lead becomes a "customer" automatically when they buy
- **Abandoned-cart recovery:** the email is captured when the shopper leaves the checkout email field. A recovery email with a one-click cart restore and the `COMEBACK10` code goes out after the cart is idle for 1 hour, and only to shoppers who allow marketing email
- Contact form with SMS opt-in, honeypot spam traps, rate limiting, unsubscribe, and CSV export (protected against formula injection)
- GA4 / Meta events: `generate_lead`, `add_to_cart`, `begin_checkout`, `purchase`

### SEO
- Unique titles and meta descriptions, canonical URLs, Open Graph and Twitter tags. Search results are `noindex`
- JSON-LD: `OnlineStore`, `WebSite` + `SearchAction`, `Product` + `Offer` (with shipping and return policy) + `AggregateRating` + `Review`, `BreadcrumbList`, `FAQPage`, `BlogPosting`, `ItemList`
- `/sitemap.xml`, `/robots.txt` and a Google Merchant feed at `/feeds/google.xml`
- Clean URLs, semantic HTML and visible breadcrumbs. The admin editor shows a character counter for SEO titles and meta descriptions

### AI SEO (getting the store into ChatGPT, Claude, Perplexity and Google AI answers)
- `robots.txt` **explicitly allows** AI crawlers: GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot, Google-Extended and others
- `/llms.txt` gives a short markdown summary of the store: key facts, categories, guides and policies. `/llms-full.txt` adds the full catalog with prices, specs and stock
- `/api/catalog.json` is a public, machine-readable catalog with live prices and availability
- Content written to be quoted: a TL;DR on every guide, question-style FAQ headings (which also produce FAQPage schema automatically), spec tables and published/updated dates

### Admin backend (`/admin`)
- Dashboard with 30-day revenue, orders, average order value, leads, lead-to-customer rate, a 14-day revenue chart, lead sources and low-stock alerts
- Orders: filter by status, view details including the age check, update status and tracking, and email a "shipped" notice
- Products: create, edit and delete, with Markdown descriptions, JSON specs and FAQs, SEO fields, and featured/active flags
- Leads: search, filter, view the timeline, set status, add notes and export CSV
- Abandoned carts (with a manual "send now" button), review moderation, discount codes, and a blog editor

### Security
CSRF tokens on every POST, signed HttpOnly cookies, scrypt and timing-safe comparisons, parameterized SQL, HTML-escaped output everywhere, security headers, rate limits on login, leads, checkout and reviews, and webhook signature checks.

---

## Project layout
```
src/
  server.js            entry point and abandoned-cart scheduler
  app.js               middleware (cookies, CSRF, UTM, headers)
  config.js            all settings come from the environment (.env.example)
  db.js / seed.js      schema and demo catalog
  seo.js               JSON-LD, sitemap, robots, llms.txt, feeds
  content.js           policy and FAQ page copy
  lib/                 commerce, orders, leads, email, security, utils, images
  payments/            provider interface, Authorize.net, demo
  routes/              store, admin, seo
  views/               HTML templates (layout, store, admin)
public/                CSS, JS, logo
test/                  end-to-end tests (node:test)
```

## Deploying
1. `cp .env.example .env` and fill it in. You need at least `BASE_URL`, `SESSION_SECRET`, the `ADMIN_*` values, the Authorize.net keys and an email provider.
2. `docker build -t vape-store . && docker run -p 3000:3000 --env-file .env -v $PWD/data:/app/data vape-store`
   (or `npm ci --omit=dev && npm start` behind any HTTPS reverse proxy). Keep `data/` on a persistent volume, because it holds the SQLite database.
3. Submit `/sitemap.xml` in Google Search Console and Bing Webmaster Tools.
4. Replace the generated SVG product art with real photos and update the product images in the templates.

Running more than one instance? Move the rate limiter in `src/lib/security.js` to Redis, and either move the database to Postgres or keep a single writer.
