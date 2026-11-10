import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  description TEXT DEFAULT '', seo_title TEXT DEFAULT '', seo_description TEXT DEFAULT '', sort INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, name TEXT NOT NULL, brand TEXT DEFAULT '',
  category_id INTEGER REFERENCES categories(id), price_cents INTEGER NOT NULL, compare_at_cents INTEGER,
  sku TEXT UNIQUE, stock INTEGER DEFAULT 0, short_description TEXT DEFAULT '', description TEXT DEFAULT '',
  specs TEXT DEFAULT '{}', faqs TEXT DEFAULT '[]', nicotine_mg TEXT DEFAULT '', flavor_profile TEXT DEFAULT '',
  image TEXT DEFAULT '', seo_title TEXT DEFAULT '', seo_description TEXT DEFAULT '',
  contains_nicotine INTEGER DEFAULT 1, active INTEGER DEFAULT 1, featured INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY, product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  author TEXT NOT NULL, rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5), body TEXT DEFAULT '',
  approved INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS posts (
  id INTEGER PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, excerpt TEXT DEFAULT '',
  body TEXT DEFAULT '', author TEXT DEFAULT '', seo_description TEXT DEFAULT '', published INTEGER DEFAULT 1,
  published_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS leads (
  id INTEGER PRIMARY KEY, email TEXT UNIQUE NOT NULL, name TEXT DEFAULT '', phone TEXT DEFAULT '',
  source TEXT DEFAULT '', utm_source TEXT DEFAULT '', utm_medium TEXT DEFAULT '', utm_campaign TEXT DEFAULT '',
  landing_page TEXT DEFAULT '', consent_email INTEGER DEFAULT 1, consent_sms INTEGER DEFAULT 0,
  status TEXT DEFAULT 'new', score INTEGER DEFAULT 0, notes TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS lead_events (
  id INTEGER PRIMARY KEY, lead_id INTEGER REFERENCES leads(id) ON DELETE CASCADE, type TEXT NOT NULL,
  data TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS carts (
  id TEXT PRIMARY KEY, items TEXT DEFAULT '[]', email TEXT DEFAULT '', discount_code TEXT DEFAULT '',
  recovered_email_sent INTEGER DEFAULT 0, converted INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY, number TEXT UNIQUE NOT NULL, cart_id TEXT, email TEXT NOT NULL, phone TEXT DEFAULT '',
  first_name TEXT, last_name TEXT, dob TEXT, address1 TEXT, address2 TEXT DEFAULT '', city TEXT, state TEXT, postal TEXT,
  country TEXT DEFAULT 'US', items TEXT NOT NULL, subtotal_cents INTEGER, discount_cents INTEGER DEFAULT 0,
  shipping_cents INTEGER, tax_cents INTEGER, total_cents INTEGER, discount_code TEXT DEFAULT '',
  status TEXT DEFAULT 'pending', payment_provider TEXT, payment_ref TEXT DEFAULT '', age_verified INTEGER DEFAULT 0,
  tracking_number TEXT DEFAULT '', notes TEXT DEFAULT '', lead_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS discounts (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, percent_off INTEGER DEFAULT 0, amount_off_cents INTEGER DEFAULT 0,
  min_subtotal_cents INTEGER DEFAULT 0, active INTEGER DEFAULT 1, uses INTEGER DEFAULT 0, max_uses INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, data TEXT DEFAULT '{}', expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
`;

export function openDb(file = config.dbPath) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

/** Run fn inside a transaction. */
export function tx(db, fn) {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
