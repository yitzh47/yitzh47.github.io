import { openDb, tx } from './db.js';
import { config } from './config.js';
import { pathToFileURL } from 'node:url';

const categories = [
  ['disposable-vapes', 'Disposable Vapes', 'Pre-filled, pre-charged disposable vapes. No refills, no coils — just open and go.', 1],
  ['pod-systems', 'Pod Systems', 'Compact refillable pod kits that pair perfectly with nicotine salt e-liquids.', 2],
  ['vape-kits', 'Vape Kits & Mods', 'Box mods and starter kits for sub-ohm clouds and full control over wattage and airflow.', 3],
  ['e-liquids', 'E-Liquids', 'Freebase e-juice in 60ml and 100ml bottles for sub-ohm and MTL devices.', 4],
  ['nicotine-salts', 'Nicotine Salts', 'Smooth, fast-absorbing salt nic e-liquids designed for pod systems.', 5],
  ['coils-pods', 'Coils & Replacement Pods', 'Replacement coils and pods to keep your device tasting fresh.', 6],
  ['accessories', 'Accessories', 'Batteries, chargers, cases and everything else your setup needs.', 7],
];

// [slug, name, brand, cat, price, compareAt, stock, short, nic, flavor, featured, containsNic, specs, faqs]
const products = [
  ['nimbus-5000-blue-razz', 'Nimbus 5000 Disposable — Blue Razz Ice', 'Nimbus', 'disposable-vapes', 19.99, 24.99, 140,
    'Up to 5,000 puffs of sweet blue raspberry with a cool menthol finish.', '50mg (5%)', 'Fruity · Icy', 1, 1,
    { Puffs: 'Up to 5,000', 'E-liquid': '13ml', Battery: '650mAh rechargeable (USB-C)', Nicotine: '5% salt nicotine', 'Draw activation': 'Yes' }],
  ['nimbus-5000-mango-peach', 'Nimbus 5000 Disposable — Mango Peach', 'Nimbus', 'disposable-vapes', 19.99, null, 95,
    'Ripe mango and juicy peach in a draw-activated disposable.', '50mg (5%)', 'Tropical · Sweet', 0, 1,
    { Puffs: 'Up to 5,000', 'E-liquid': '13ml', Battery: '650mAh rechargeable (USB-C)', Nicotine: '5% salt nicotine' }],
  ['nimbus-5000-cool-mint', 'Nimbus 5000 Disposable — Cool Mint', 'Nimbus', 'disposable-vapes', 19.99, null, 120,
    'Crisp spearmint with a clean, icy exhale.', '50mg (5%)', 'Mint · Icy', 0, 1,
    { Puffs: 'Up to 5,000', 'E-liquid': '13ml', Battery: '650mAh rechargeable (USB-C)', Nicotine: '5% salt nicotine' }],
  ['driftpod-mini-kit', 'DriftPod Mini Pod Kit', 'Driftwood Labs', 'pod-systems', 29.99, 34.99, 60,
    'Pocket-sized refillable pod kit with adjustable airflow and 1000mAh battery.', 'N/A (device)', '', 1, 0,
    { Battery: '1000mAh', Output: '5–25W', 'Pod capacity': '2ml', Charging: 'USB-C fast charge', Airflow: 'Adjustable' }],
  ['driftpod-pro-kit', 'DriftPod Pro Pod Mod Kit', 'Driftwood Labs', 'pod-systems', 44.99, null, 35,
    'Pod-mod hybrid with a color screen, 5–40W output and interchangeable coils.', 'N/A (device)', '', 0, 0,
    { Battery: '1500mAh', Output: '5–40W', 'Pod capacity': '4ml', Coils: '0.4Ω & 0.8Ω mesh', Display: '0.96" TFT' }],
  ['vortex-200-kit', 'Vortex 200W Box Mod Kit', 'Vortex', 'vape-kits', 79.99, 89.99, 20,
    'Dual-18650 200W box mod with a 5ml mesh sub-ohm tank for huge flavor and clouds.', 'N/A (device)', '', 1, 0,
    { Output: '5–200W', Batteries: '2× 18650 (sold separately)', Tank: '5ml sub-ohm, top fill', Modes: 'VW / TC / Bypass' }],
  ['vortex-80-starter', 'Vortex 80W Starter Kit', 'Vortex', 'vape-kits', 49.99, null, 28,
    'Single-battery 80W starter kit — the easiest step up from pods.', 'N/A (device)', '', 0, 0,
    { Output: '5–80W', Battery: '1× 18650 (sold separately)', Tank: '3.5ml mesh' }],
  ['harbor-tobacco-100ml', 'Harbor Reserve Tobacco — 100ml', 'Harbor Reserve', 'e-liquids', 21.99, null, 70,
    'Smooth Virginia tobacco with hints of caramel and toasted almond.', '0mg / 3mg / 6mg', 'Tobacco · Nutty', 0, 1,
    { Size: '100ml', 'VG/PG': '70/30', Nicotine: 'Freebase 0, 3 or 6mg' }],
  ['orchard-strawberry-kiwi-100ml', 'Orchard Strawberry Kiwi — 100ml', 'Orchard Juice Co.', 'e-liquids', 19.99, 22.99, 85,
    'Sun-ripened strawberries and tangy kiwi — an all-day fruit vape.', '0mg / 3mg / 6mg', 'Fruity · Tart', 1, 1,
    { Size: '100ml', 'VG/PG': '70/30', Nicotine: 'Freebase 0, 3 or 6mg' }],
  ['bakehouse-custard-60ml', 'Bakehouse Vanilla Custard — 60ml', 'Bakehouse', 'e-liquids', 17.99, null, 50,
    'Rich vanilla bean custard with a buttery, creamy finish.', '0mg / 3mg / 6mg', 'Dessert · Creamy', 0, 1,
    { Size: '60ml', 'VG/PG': '70/30', Nicotine: 'Freebase 0, 3 or 6mg' }],
  ['saltline-watermelon-30ml', 'Saltline Watermelon Ice Salt — 30ml', 'Saltline', 'nicotine-salts', 15.99, null, 110,
    'Juicy watermelon over a cool menthol base, made for pod systems.', '35mg / 50mg', 'Fruity · Icy', 1, 1,
    { Size: '30ml', 'VG/PG': '50/50', Nicotine: 'Salt nicotine 35 or 50mg' }],
  ['saltline-classic-tobacco-30ml', 'Saltline Classic Tobacco Salt — 30ml', 'Saltline', 'nicotine-salts', 15.99, null, 90,
    'A clean, smooth tobacco salt for adults switching from cigarettes.', '35mg / 50mg', 'Tobacco', 0, 1,
    { Size: '30ml', 'VG/PG': '50/50', Nicotine: 'Salt nicotine 35 or 50mg' }],
  ['saltline-menthol-30ml', 'Saltline Arctic Menthol Salt — 30ml', 'Saltline', 'nicotine-salts', 15.99, null, 75,
    'Bold, cooling menthol with zero sweetness.', '35mg / 50mg', 'Menthol', 0, 1,
    { Size: '30ml', 'VG/PG': '50/50', Nicotine: 'Salt nicotine 35 or 50mg' }],
  ['driftpod-replacement-pods-3pk', 'DriftPod Replacement Pods (3-Pack)', 'Driftwood Labs', 'coils-pods', 11.99, null, 200,
    '0.8Ω mesh replacement pods for DriftPod Mini and Pro.', 'N/A', '', 0, 0,
    { Resistance: '0.8Ω mesh', Capacity: '2ml', Quantity: '3 pods' }],
  ['vortex-mesh-coils-5pk', 'Vortex Mesh Coils 0.15Ω (5-Pack)', 'Vortex', 'coils-pods', 14.99, null, 150,
    'High-wattage mesh coils for the Vortex tank series.', 'N/A', '', 0, 0,
    { Resistance: '0.15Ω', 'Wattage range': '60–90W', Quantity: '5 coils' }],
  ['18650-battery-2pk', '18650 3000mAh Battery (2-Pack) + Case', 'Volt', 'accessories', 18.99, null, 80,
    'High-drain 18650 cells with a protective carry case.', 'N/A', '', 0, 0,
    { Capacity: '3000mAh', 'Continuous discharge': '20A', Quantity: '2 + case' }],
  ['dual-bay-charger', 'Dual-Bay Smart Charger', 'Volt', 'accessories', 16.99, null, 45,
    'USB-C smart charger with LCD for 18650/21700 cells.', 'N/A', '', 0, 0,
    { Bays: '2', Input: 'USB-C 5V/2A', Compatible: '18650, 20700, 21700' }],
];

const posts = [
  ['best-disposable-vapes-guide', 'How to Choose the Best Disposable Vape (2026 Buyer’s Guide)',
    'Puff count, nicotine strength, battery and flavor — everything adults should compare before buying a disposable.',
    `## What actually matters in a disposable vape

**Puff count** is an estimate based on short, consistent draws. Real-world counts vary by how long you inhale.

**Nicotine strength** is usually listed as a percentage. 5% (50mg/ml) is the most common for disposables; if you are new to salt nicotine or used to lighter cigarettes, look for 2–3%.

**Rechargeability** matters more than people expect. A USB-C rechargeable disposable will almost always use all of its e-liquid, while a non-rechargeable one can die with juice left inside.

## Quick checklist

- Choose a puff count that matches how much you vape in a week.
- Pick a nicotine strength you are comfortable with.
- Prefer USB-C rechargeable models.
- Buy only from age-verified retailers that ship to your state legally.

## FAQ

### How long does a 5,000-puff disposable last?
For most adults, between one and two weeks of regular use.

### Can I recycle a disposable vape?
Disposables contain lithium batteries. Take them to a battery or e-waste drop-off — never put them in household trash.`],
  ['nicotine-salt-vs-freebase', 'Nicotine Salt vs. Freebase E-Liquid: What’s the Difference?',
    'Salt nic and freebase nicotine feel very different. Here’s how to pick the right one for your device.',
    `## The short answer

**Nicotine salts** are smoother at high strengths (20–50mg) and are designed for low-wattage **pod systems**.

**Freebase nicotine** is harsher at high strengths, so it's used at low strengths (0–6mg) in higher-wattage **sub-ohm** devices.

## Which should you choose?

| If you use… | Choose |
|---|---|
| A pod system (5–25W) | Nicotine salts, 20–50mg |
| A box mod / sub-ohm tank (40W+) | Freebase, 0–6mg |

## FAQ

### Can I put nicotine salts in a sub-ohm tank?
It's not recommended — high wattage plus high-strength salt nicotine can deliver far more nicotine than intended.`],
  ['vape-coil-lifespan', 'How Long Do Vape Coils Last? Signs It’s Time to Replace',
    'Burnt taste, gurgling and weak vapor are classic signs of a dying coil. Learn how to extend coil life.',
    `## Typical coil lifespan

Most coils last **1–2 weeks**. Sweet, dark e-liquids gunk up coils faster than clear fruit or menthol flavors.

## Signs your coil is done

1. Burnt or muted flavor
2. Gurgling or spitting
3. Less vapor at the same wattage

## How to make coils last longer

- Prime new coils: saturate the cotton and wait 5 minutes before vaping.
- Start at the low end of the wattage range.
- Don't chain vape — give the wick time to re-saturate.`],
  ['shipping-vapes-age-verification', 'Why We Verify Age and Where We Can Ship',
    'Federal and state law requires adult signature and age verification for vape deliveries. Here’s how our process works.',
    `## Adults 21+ only

Under U.S. federal law, it is illegal to sell tobacco and nicotine products, including e-cigarettes, to anyone under 21. Every order is age-verified before it ships, and an adult signature is required on delivery.

## Where we ship

Some states and cities restrict or ban delivery of vapor products. If your shipping address is in a restricted area, checkout will let you know before you pay.

## FAQ

### Why do you need my date of birth?
To verify you are of legal age as required by law. We never use it for marketing.`],
];

const reviews = [
  ['nimbus-5000-blue-razz', 'Jordan M.', 5, 'Best blue razz I’ve had. Still going strong after a week.'],
  ['nimbus-5000-blue-razz', 'Alex R.', 4, 'Great flavor, ice is a little strong for me.'],
  ['driftpod-mini-kit', 'Sam T.', 5, 'Tiny, great battery life, pods don’t leak.'],
  ['vortex-200-kit', 'Chris P.', 5, 'Massive clouds, solid build. Screen is easy to read.'],
  ['orchard-strawberry-kiwi-100ml', 'Taylor B.', 5, 'My all-day vape now.'],
  ['saltline-watermelon-30ml', 'Morgan K.', 4, 'Smooth hit at 35mg, tastes like real watermelon.'],
];

export function seed(db, { reset = false } = {}) {
  if (reset) {
    db.exec('DELETE FROM reviews; DELETE FROM products; DELETE FROM categories; DELETE FROM posts; DELETE FROM discounts;');
  }
  const has = db.prepare('SELECT COUNT(*) AS n FROM products').get().n;
  if (has > 0) return false;

  tx(db, () => {
    const insCat = db.prepare('INSERT INTO categories (slug, name, description, sort, seo_title, seo_description) VALUES (?,?,?,?,?,?)');
    for (const [slug, name, desc, sort] of categories) {
      insCat.run(slug, name, desc, sort, `${name} | Shop Online | ${config.store.name}`, `${desc} Fast shipping to adults 21+.`);
    }
    const catId = (slug) => db.prepare('SELECT id FROM categories WHERE slug = ?').get(slug).id;
    const insProd = db.prepare(`INSERT INTO products (slug, name, brand, category_id, price_cents, compare_at_cents, sku, stock,
      short_description, description, specs, faqs, nicotine_mg, flavor_profile, featured, contains_nicotine, seo_title, seo_description)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
    products.forEach(([slug, name, brand, cat, price, cmp, stock, short, nic, flavor, featured, cn, specs], i) => {
      const faqs = [
        { q: `Who can buy the ${name}?`, a: `Only adults ${config.commerce.minAge}+ with a verified date of birth. An adult signature may be required on delivery.` },
        { q: 'How fast does it ship?', a: `Orders placed before 2pm CT ship the same business day. Free shipping on orders over $${config.commerce.freeShippingThreshold}.` },
      ];
      if (cn) faqs.push({ q: `How much nicotine is in the ${name}?`, a: `Available nicotine strength: ${nic}.` });
      const description = `${short}\n\n${name} by ${brand} is part of our ${cat.replace(/-/g, ' ')} collection, chosen for consistent quality and authentic, lab-tested ingredients. ${flavor ? `Flavor profile: ${flavor}.` : ''}`;
      insProd.run(slug, name, brand, catId(cat), Math.round(price * 100), cmp ? Math.round(cmp * 100) : null,
        `SKU-${1000 + i}`, stock, short, description, JSON.stringify(specs), JSON.stringify(faqs), nic, flavor, featured, cn,
        `${name} | ${brand} | ${config.store.name}`, `${short} ${cn ? 'Adults 21+. ' : ''}Free shipping over $${config.commerce.freeShippingThreshold}.`);
    });
    const insPost = db.prepare('INSERT INTO posts (slug, title, excerpt, body, author, seo_description) VALUES (?,?,?,?,?,?)');
    for (const [slug, title, excerpt, body] of posts) insPost.run(slug, title, excerpt, body, `${config.store.name} Team`, excerpt);
    const insRev = db.prepare('INSERT INTO reviews (product_id, author, rating, body, approved) SELECT id, ?, ?, ?, 1 FROM products WHERE slug = ?');
    for (const [slug, author, rating, body] of reviews) insRev.run(author, rating, body, slug);
    const insDisc = db.prepare('INSERT INTO discounts (code, percent_off, amount_off_cents, min_subtotal_cents) VALUES (?,?,?,?)');
    insDisc.run(config.commerce.leadDiscountCode, config.commerce.leadDiscountPct, 0, 0);
    insDisc.run('COMEBACK10', 10, 0, 0);
    insDisc.run('SAVE10', 0, 1000, 5000);
  });
  return true;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const db = openDb();
  const did = seed(db, { reset: process.argv.includes('--reset') });
  console.log(did ? 'Seeded database.' : 'Database already has products; use --reset to reseed.');
}
