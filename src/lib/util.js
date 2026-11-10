import crypto from 'node:crypto';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
export const money = (cents) => `$${(Number(cents || 0) / 100).toFixed(2)}`;
export const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_]+/g, '-').replace(/-+/g, '-');
export const randomId = (bytes = 18) => crypto.randomBytes(bytes).toString('base64url');
export const isEmail = (s) => typeof s === 'string' && s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
export const safeJson = (s, fallback) => { try { return JSON.parse(s); } catch { return fallback; } };
/** JSON for embedding inside <script type="application/ld+json">. */
export const jsonLd = (obj) => JSON.stringify(obj).replace(/</g, '\\u003c');

export function hmac(secret, value) {
  return crypto.createHmac('sha256', secret).update(value).digest('base64url');
}
export function timingSafeEq(a, b) {
  const ab = Buffer.from(String(a)); const bb = Buffer.from(String(b));
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return `${salt}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`;
}
export function verifyPassword(pw, stored) {
  const [salt, hash] = String(stored).split(':');
  return !!salt && timingSafeEq(hashPassword(pw, salt).split(':')[1], hash);
}

export function ageFromDob(dob, now = new Date()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dob || '');
  if (!m) return -1;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const birth = new Date(Date.UTC(y, mo - 1, d));
  if (birth.getUTCMonth() !== mo - 1 || birth.getUTCDate() !== d) return -1;
  let age = now.getUTCFullYear() - y;
  const before = now.getUTCMonth() < mo - 1 || (now.getUTCMonth() === mo - 1 && now.getUTCDate() < d);
  if (before) age--;
  return age;
}

const inline = (s) => esc(s)
  .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  .replace(/\*(.+?)\*/g, '<em>$1</em>')
  .replace(/`(.+?)`/g, '<code>$1</code>')
  .replace(/\[(.+?)\]\(((?:https?:\/\/|\/)[^\s)]+)\)/g, '<a href="$2">$1</a>');

/** Minimal, safe Markdown → HTML (headings, lists, tables, paragraphs). Input is escaped first. */
export function markdown(src) {
  const lines = String(src || '').replace(/\r/g, '').split('\n');
  const out = []; let i = 0;
  const isBlockStart = (l) => /^(#{2,4}\s|\s*[-*]\s|\s*\d+\.\s|\|)/.test(l);
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    let m;
    if ((m = /^(#{2,4})\s+(.*)$/.exec(line))) {
      const lvl = m[1].length;
      out.push(`<h${lvl} id="${esc(slugify(m[2]))}">${inline(m[2])}</h${lvl}>`); i++; continue;
    }
    if (/^\s*[-*]\s+/.test(line)) {
      const items = []; while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*[-*]\s+/, ''));
      out.push(`<ul>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ul>`); continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = []; while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*\d+\.\s+/, ''));
      out.push(`<ol>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</ol>`); continue;
    }
    if (/^\|/.test(line)) {
      const rows = []; while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const [head, , ...body] = rows;
      out.push(`<div class="table-wrap"><table><thead><tr>${cells(head).map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${body.map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
      continue;
    }
    const para = []; while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) para.push(lines[i++]);
    out.push(`<p>${inline(para.join(' '))}</p>`);
  }
  return out.join('\n');
}

/** Extract Q/A pairs from a "## FAQ" section with "### question" headings (for FAQPage schema). */
export function extractFaqs(src) {
  const text = String(src || '');
  const idx = text.search(/^##\s+FAQ\s*$/m);
  if (idx < 0) return [];
  const faqs = [];
  for (const p of text.slice(idx).split(/^###\s+/m).slice(1)) {
    const [q, ...rest] = p.split('\n');
    const a = rest.join('\n').split(/^##\s/m)[0].replace(/\s+/g, ' ').trim();
    if (q && a) faqs.push({ q: q.trim(), a });
  }
  return faqs;
}

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('='); if (i < 0) continue;
    const k = part.slice(0, i).trim(); if (!k) continue;
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { /* ignore malformed */ }
  }
  return out;
}

export const stripMd = (s) => String(s || '').replace(/[#*`|>]/g, '').replace(/\[(.+?)\]\(.+?\)/g, '$1').replace(/\s+/g, ' ').trim();
