import { esc } from './util.js';

const PALETTES = {
  'disposable-vapes': ['#6366f1', '#ec4899'], 'pod-systems': ['#0ea5e9', '#6366f1'], 'vape-kits': ['#0f172a', '#475569'],
  'e-liquids': ['#f97316', '#e11d48'], 'nicotine-salts': ['#10b981', '#0ea5e9'], 'coils-pods': ['#64748b', '#0f172a'], accessories: ['#eab308', '#f97316'],
};

const SHAPES = {
  'disposable-vapes': '<rect x="170" y="70" width="60" height="260" rx="22" fill="#fff" opacity=".92"/><rect x="186" y="50" width="28" height="34" rx="8" fill="#fff" opacity=".7"/>',
  'pod-systems': '<rect x="150" y="110" width="100" height="200" rx="34" fill="#fff" opacity=".92"/><rect x="172" y="80" width="56" height="50" rx="12" fill="#fff" opacity=".7"/>',
  'vape-kits': '<rect x="135" y="170" width="130" height="160" rx="14" fill="#fff" opacity=".92"/><rect x="165" y="80" width="70" height="95" rx="10" fill="#fff" opacity=".7"/>',
  'e-liquids': '<rect x="150" y="130" width="100" height="190" rx="16" fill="#fff" opacity=".92"/><rect x="178" y="80" width="44" height="56" rx="8" fill="#fff" opacity=".7"/>',
  'nicotine-salts': '<rect x="160" y="140" width="80" height="170" rx="14" fill="#fff" opacity=".92"/><rect x="183" y="96" width="34" height="50" rx="8" fill="#fff" opacity=".7"/>',
  'coils-pods': '<circle cx="200" cy="200" r="90" fill="#fff" opacity=".92"/><circle cx="200" cy="200" r="40" fill="none" stroke-width="10" stroke="currentColor"/>',
  accessories: '<rect x="120" y="140" width="160" height="120" rx="18" fill="#fff" opacity=".92"/>',
};

/** Generated placeholder product art (swap for real photography via /public/img/products/<slug>.webp in production). */
export function productSvg(p) {
  const [a, b] = PALETTES[p.cat] || ['#334155', '#0f172a'];
  const shape = SHAPES[p.cat] || SHAPES.accessories;
  const label = p.name.split('—')[0].trim();
  const sub = (p.name.split('—')[1] || '').trim();
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img" aria-label="${esc(p.name)}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs>
<rect width="400" height="400" fill="url(#g)"/><g color="${a}">${shape}</g>
<text x="200" y="362" text-anchor="middle" font-family="system-ui,sans-serif" font-size="20" font-weight="700" fill="#fff">${esc(label.slice(0, 32))}</text>
${sub ? `<text x="200" y="386" text-anchor="middle" font-family="system-ui,sans-serif" font-size="14" fill="#fff" opacity=".85">${esc(sub.slice(0, 40))}</text>` : ''}
<text x="20" y="34" font-family="system-ui,sans-serif" font-size="14" font-weight="600" fill="#fff" opacity=".85">${esc(p.brand)}</text>
</svg>`;
}
