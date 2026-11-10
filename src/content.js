import { config } from './config.js';

const c = config.commerce;
const s = config.store;

/** Static pages. Have counsel review policies before launch — vape laws vary by state and change often. */
export const pages = {
  about: {
    title: `About ${s.name}`,
    description: `${s.name} is an adult-only online vape shop selling authentic devices and lab-tested e-liquids.`,
    md: `${s.name} is an independent online vape shop based in ${s.address.city}, ${s.address.region}. We sell authentic disposables, pod systems, vape kits and e-liquids to adults ${c.minAge}+ who have chosen to vape.

## What we stand for

- **Authenticity.** Every device is sourced from the manufacturer or an authorized distributor.
- **Responsible retail.** Age verification at checkout and adult signature on delivery, every time.
- **Straight answers.** Our [guides](/blog) explain devices and nicotine without hype.`,
  },
  faq: {
    title: 'Frequently Asked Questions',
    description: 'Answers about age verification, shipping, returns, nicotine strengths and payment.',
    md: `## FAQ

### How old do I need to be to order?
You must be ${c.minAge} or older. We verify your date of birth at checkout and an adult signature is required on delivery.

### How much does shipping cost?
Shipping is free on orders over $${c.freeShippingThreshold}. Otherwise it is a flat $${c.flatShipping}.

### How fast will my order ship?
Orders placed before 2pm CT on business days ship the same day. Most orders arrive in 2–5 business days.

### Which states can't you ship to?
We currently cannot ship to ${c.restrictedStates.join(', ')}. Some cities and counties also restrict delivery.

### What payment methods do you accept?
Visa, Mastercard, American Express and Discover through our secure hosted payment page.

### Can I return an item?
Unopened hardware can be returned within 30 days. Opened e-liquids and disposables cannot be returned for health and safety reasons.

### Do you have a discount for first orders?
Yes — sign up to our email list for ${c.leadDiscountPct}% off your first order.`,
  },
  'shipping-policy': {
    title: 'Shipping Policy',
    description: `Shipping rates, delivery times, adult signature requirements and restricted states for ${s.name}.`,
    md: `## Rates

- Free shipping on orders over $${c.freeShippingThreshold}
- Flat $${c.flatShipping} on all other orders

## Processing time

Orders placed before 2pm CT Monday–Friday ship the same business day.

## Adult signature required

As required by the federal PACT Act, all packages containing vapor products require an adult (${c.minAge}+) signature and ID check on delivery.

## Restricted destinations

We do not ship to ${c.restrictedStates.join(', ')}, P.O. boxes, APO/FPO addresses, or outside the United States.`,
  },
  returns: {
    title: 'Returns & Refunds',
    description: '30-day returns on unopened hardware. Defective device warranty details.',
    md: `## 30-day returns

Unopened hardware in original packaging can be returned within 30 days of delivery for a full refund.

## Defective products

Devices that arrive defective (dead on arrival) are replaced free within 14 days. Contact ${s.email} with your order number.

## Non-returnable items

For health and safety reasons, opened e-liquids, disposables, pods and coils cannot be returned.`,
  },
  'age-policy': {
    title: 'Age Verification Policy',
    description: `We sell only to adults ${c.minAge}+. Learn how we verify age at checkout and delivery.`,
    md: `## Adults ${c.minAge}+ only

It is illegal under U.S. federal law to sell tobacco and nicotine products, including e-cigarettes and e-liquids, to anyone under ${c.minAge}.

## How we verify

1. An age confirmation is required to enter the site.
2. Your date of birth is collected at checkout and checked against public records.
3. An adult signature with ID check is required at delivery.

Orders that cannot be verified are cancelled and refunded. Attempting to purchase while under age may be reported.`,
  },
  privacy: {
    title: 'Privacy Policy',
    description: `How ${s.name} collects, uses and protects your personal information.`,
    md: `## What we collect

Contact details, shipping address, date of birth (for age verification), order history and, if you opt in, marketing preferences. Card details are entered on our payment processor's hosted page; we never see or store full card numbers.

## How we use it

To fulfil orders, verify age as required by law, provide support and — only with your consent — send marketing emails or texts.

## Your choices

Unsubscribe from any email using the link in the footer, or email ${s.email} to access or delete your data.`,
  },
  terms: {
    title: 'Terms of Service',
    description: `Terms governing purchases from ${s.name}.`,
    md: `## Eligibility

By using this site you confirm you are at least ${c.minAge} years old and of legal age to purchase vapor products where you live.

## Orders

We may cancel any order that fails age verification, ships to a restricted location or appears fraudulent. Prices and availability may change without notice.

## Product use

Our products are for adult use only and are not smoking-cessation products. Keep out of reach of children and pets.`,
  },
};
