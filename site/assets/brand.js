// Code-drawn logo mark (pure string SVG, works in browser + node).
import { BRAND } from './config.js';

// crimped pack outline path, centered in a 100x100 box
function packPath() {
  const x0 = 30, x1 = 70, y0 = 18, y1 = 82, n = 6, d = 4;
  let p = `M${x0},${y0 + d}`;
  for (let i = 0; i < n; i++) { const a = x0 + (x1 - x0) * (i + 0.5) / n, b = x0 + (x1 - x0) * (i + 1) / n; p += ` L${a.toFixed(2)},${y0} L${b.toFixed(2)},${y0 + d}`; }
  p += ` L${x1},${y1 - d}`;
  for (let i = n - 1; i >= 0; i--) { const a = x0 + (x1 - x0) * (i + 0.5) / n, b = x0 + (x1 - x0) * i / n; p += ` L${a.toFixed(2)},${y1} L${b.toFixed(2)},${y1 - d}`; }
  return p + ' Z';
}

export function logoSVG({ size = 512, bg = true, uid = 'ph' } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100" role="img" aria-label="${BRAND.name}">
<defs>
  <radialGradient id="${uid}bg" cx="35%" cy="25%" r="90%"><stop offset="0" stop-color="#16443a"/><stop offset=".55" stop-color="#0a1f1b"/><stop offset="1" stop-color="#040b09"/></radialGradient>
  <linearGradient id="${uid}pk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9fff0"/><stop offset=".45" stop-color="#7dffc1"/><stop offset="1" stop-color="#22a874"/></linearGradient>
  <linearGradient id="${uid}au" gradientUnits="userSpaceOnUse" x1="25" y1="25" x2="75" y2="75"><stop offset="0" stop-color="#fff1b0"/><stop offset=".5" stop-color="#ffc94a"/><stop offset="1" stop-color="#c98a12"/></linearGradient>
  <filter id="${uid}gl" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>
${bg ? `<rect width="100" height="100" rx="22" fill="url(#${uid}bg)"/>
<g opacity=".18" stroke="#7dffc1" stroke-width=".4">${Array.from({ length: 9 }, (_, i) => `<line x1="${10 + i * 10}" y1="0" x2="${10 + i * 10}" y2="100"/>`).join('')}</g>
<rect x="1" y="1" width="98" height="98" rx="21" fill="none" stroke="#7dffc1" stroke-opacity=".35" stroke-width="1"/>` : ''}
<g transform="rotate(-12 50 50)" filter="url(#${uid}gl)">
  <path d="${packPath()}" fill="url(#${uid}pk)"/>
  <path d="${packPath()}" fill="none" stroke="#04140f" stroke-opacity=".35" stroke-width="1"/>
  <rect x="30" y="27" width="40" height="3" fill="#04140f" opacity=".35"/>
  <rect x="30" y="70" width="40" height="3" fill="#04140f" opacity=".35"/>
</g>
<g fill="none" stroke="url(#${uid}au)" stroke-width="5" stroke-linecap="round">
  <circle cx="50" cy="50" r="17"/>
  <line x1="50" y1="22" x2="50" y2="31"/><line x1="50" y1="69" x2="50" y2="78"/>
  <line x1="22" y1="50" x2="31" y2="50"/><line x1="69" y1="50" x2="78" y2="50"/>
</g>
<circle cx="50" cy="50" r="5" fill="#04140f"/><circle cx="50" cy="50" r="2.6" fill="url(#${uid}au)"/>
</svg>`;
}

export function setFavicon() {
  const url = 'data:image/svg+xml,' + encodeURIComponent(logoSVG({ size: 64, uid: 'fv' }));
  let l = document.querySelector('link[rel="icon"]');
  if (!l) { l = document.createElement('link'); l.rel = 'icon'; document.head.appendChild(l); }
  l.type = 'image/svg+xml'; l.href = url;
}
