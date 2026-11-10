import { isEmail } from './util.js';

const SOURCE_SCORES = { popup: 10, footer: 5, exit_intent: 10, contact: 20, checkout: 30, quiz: 25, back_in_stock: 15, blog: 8 };
const EVENT_SCORES = { order: 50, cart_abandoned: 15, contact_message: 20, signup: 0 };

/**
 * Create or update a lead and record an event. Returns { lead, created }.
 * UTM attribution is first-touch: it is only written when the lead is created.
 */
export function captureLead(db, { email, name = '', phone = '', source = 'unknown', utm = {}, landingPage = '', consentSms = false, event = 'signup', data = {} }) {
  email = String(email || '').trim().toLowerCase();
  if (!isEmail(email)) throw new Error('Please enter a valid email address.');
  let lead = db.prepare('SELECT * FROM leads WHERE email = ?').get(email);
  let created = false;
  if (!lead) {
    db.prepare(`INSERT INTO leads (email, name, phone, source, utm_source, utm_medium, utm_campaign, landing_page, consent_sms, score)
      VALUES (?,?,?,?,?,?,?,?,?,?)`).run(email, String(name).slice(0, 120), String(phone).slice(0, 40), source,
      String(utm.source || '').slice(0, 100), String(utm.medium || '').slice(0, 100), String(utm.campaign || '').slice(0, 100),
      String(landingPage).slice(0, 300), consentSms ? 1 : 0, SOURCE_SCORES[source] ?? 5);
    lead = db.prepare('SELECT * FROM leads WHERE email = ?').get(email);
    created = true;
  } else {
    db.prepare(`UPDATE leads SET name = COALESCE(NULLIF(?, ''), name), phone = COALESCE(NULLIF(?, ''), phone),
      consent_sms = MAX(consent_sms, ?), consent_email = 1, score = score + ?, updated_at = datetime('now') WHERE id = ?`)
      .run(String(name).slice(0, 120), String(phone).slice(0, 40), consentSms ? 1 : 0, EVENT_SCORES[event] ?? 2, lead.id);
  }
  db.prepare('INSERT INTO lead_events (lead_id, type, data) VALUES (?,?,?)').run(lead.id, event, JSON.stringify({ source, ...data }));
  if (event === 'order') db.prepare("UPDATE leads SET status = 'customer' WHERE id = ?").run(lead.id);
  return { lead: db.prepare('SELECT * FROM leads WHERE id = ?').get(lead.id), created };
}

export function unsubscribe(db, email) {
  db.prepare("UPDATE leads SET consent_email = 0, consent_sms = 0, status = 'unsubscribed', updated_at = datetime('now') WHERE email = ?")
    .run(String(email || '').trim().toLowerCase());
}

export function leadsCsv(rows) {
  const cols = ['id', 'email', 'name', 'phone', 'source', 'utm_source', 'utm_medium', 'utm_campaign', 'landing_page', 'consent_email', 'consent_sms', 'status', 'score', 'created_at'];
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // prevent CSV formula injection
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
}
