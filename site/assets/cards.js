// Card catalog + procedural canvas card faces. Original art, no external IP.
import { BRAND, RARITY } from './config.js';

// Island critters ("Packlings"). Used by cards AND the in-world creatures.
export const SPECIES = {
  bitbun:  { name: 'Bitbun',   body: '#7dffc1', belly: '#e9fff4', accent: '#0f5c45', eye: '#0a1d18', kind: 'bun',  line: 'Ears pick up price ticks from a mile away.' },
  gpupup:  { name: 'Gpupup',   body: '#ff8a65', belly: '#ffe0cf', accent: '#5a2414', eye: '#200b05', kind: 'pup',  line: 'Runs hot. Heatsink fins on its back hum when happy.' },
  mintmoth:{ name: 'Mintmoth', body: '#ffd166', belly: '#fff6d6', accent: '#7a5200', eye: '#2a1d00', kind: 'moth', line: 'Wings are stamped like fresh coins.' },
  hashowl: { name: 'Hashowl',  body: '#a98bff', belly: '#eee8ff', accent: '#3a2582', eye: '#140b33', kind: 'owl',  line: 'Never forgets a block. Never sleeps either.' },
  ledgetoad:{ name: 'Ledgetoad',body: '#c8f25a', belly: '#f6ffd9', accent: '#41530c', eye: '#141a03', kind: 'toad', line: 'Keeps a perfect ledger in the stripes on its back.' },
  tokkit:  { name: 'Tokkit',   body: '#8fdcff', belly: '#eaf9ff', accent: '#164d66', eye: '#06202b', kind: 'kit',  line: 'Its tail curls into a coin when it sleeps.' },
};

// ---------- drawing ----------
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function seeded(str) { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 10000) / 10000; }; }

export function drawCreature(ctx, speciesId, cx, cy, s, opts = {}) {
  const sp = SPECIES[speciesId];
  const body = opts.body || sp.body, belly = sp.belly, acc = sp.accent;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(s, s);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(0, 62, 46, 10, 0, 0, Math.PI * 2); ctx.fill();
  const shade = (c) => { const g = ctx.createRadialGradient(-18, -24, 6, 0, 0, 70); g.addColorStop(0, '#ffffff'); g.addColorStop(0.18, c); g.addColorStop(1, acc); return g; };
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  const k = sp.kind;
  // back features
  if (k === 'moth') { // coin wings
    for (const sx of [-1, 1]) {
      ctx.save(); ctx.scale(sx, 1);
      ctx.fillStyle = shade(body); ctx.beginPath(); ctx.ellipse(48, -6, 34, 40, 0.4, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = acc; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(50, -6, 18, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = acc; ctx.font = 'bold 20px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('◆', 50, -6);
      ctx.restore();
    }
  }
  if (k === 'pup') { // heatsink fins
    ctx.fillStyle = '#5b6b75';
    for (let i = -2; i <= 2; i++) { rr(ctx, i * 12 - 4, -64, 8, 26, 3); ctx.fill(); }
  }
  if (k === 'kit') { // coin tail
    ctx.fillStyle = shade(body); ctx.beginPath(); ctx.ellipse(52, 30, 26, 16, -0.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(70, 14, 13, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#7a5200'; ctx.stroke();
  }
  // ears / crests
  ctx.fillStyle = shade(body); ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  if (k === 'bun') { for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * 20, -62, 11, 30, sx * 0.25, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.strokeStyle = acc; ctx.beginPath(); ctx.moveTo(sx * 20, -82); ctx.lineTo(sx * 20, -50); ctx.lineTo(sx * 26, -46); ctx.stroke(); ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(sx * 20, -84, 3.5, 0, 7); ctx.fill(); ctx.fillStyle = shade(body); ctx.strokeStyle = 'rgba(0,0,0,0.35)'; } }
  if (k === 'pup' || k === 'kit') { for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * 14, -36); ctx.lineTo(sx * 40, -66); ctx.lineTo(sx * 42, -26); ctx.closePath(); ctx.fill(); ctx.stroke(); } }
  if (k === 'owl') { for (const sx of [-1, 1]) { ctx.beginPath(); ctx.moveTo(sx * 18, -40); ctx.lineTo(sx * 40, -64); ctx.lineTo(sx * 44, -30); ctx.closePath(); ctx.fill(); ctx.stroke(); } }
  if (k === 'moth') { for (const sx of [-1, 1]) { ctx.strokeStyle = acc; ctx.beginPath(); ctx.moveTo(sx * 8, -40); ctx.quadraticCurveTo(sx * 20, -80, sx * 34, -70); ctx.stroke(); ctx.fillStyle = acc; ctx.beginPath(); ctx.arc(sx * 34, -70, 4, 0, 7); ctx.fill(); } ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.fillStyle = shade(body); }
  // body
  ctx.beginPath();
  if (k === 'toad') ctx.ellipse(0, 12, 56, 44, 0, 0, Math.PI * 2); else ctx.ellipse(0, 6, 46, 54, 0, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  // belly
  ctx.fillStyle = belly; ctx.globalAlpha = 0.9; ctx.beginPath(); ctx.ellipse(0, 26, k === 'toad' ? 36 : 28, 28, 0, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
  if (k === 'toad') { ctx.strokeStyle = acc; ctx.lineWidth = 2; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(i * 10, -26); ctx.lineTo(i * 10, -14); ctx.stroke(); } }
  if (k === 'owl') { ctx.fillStyle = acc; ctx.globalAlpha = 0.25; for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.arc(-14 + (i % 3) * 14, 22 + Math.floor(i / 3) * 12, 5, 0, Math.PI); ctx.fill(); } ctx.globalAlpha = 1; }
  // eyes
  const ey = k === 'toad' ? -16 : -12, ex = k === 'owl' ? 19 : 17, er = k === 'owl' ? 14 : 10;
  for (const sx of [-1, 1]) {
    if (k === 'owl' || k === 'toad') { ctx.fillStyle = '#fff'; ctx.beginPath(); if (k === 'owl') { for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; ctx.lineTo(sx * ex + Math.cos(a) * er, ey + Math.sin(a) * er); } } else ctx.arc(sx * ex, ey - 8, er + 2, 0, 7); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = sp.eye; ctx.beginPath(); ctx.ellipse(sx * ex, ey + (k === 'toad' ? -8 : 0), er * 0.62, er * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx * ex - 3, ey - 4 + (k === 'toad' ? -8 : 0), er * 0.26, 0, 7); ctx.fill();
  }
  // cheeks + mouth
  ctx.fillStyle = 'rgba(255,110,140,0.45)'; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * 30, 6, 7, 4.5, 0, 0, 7); ctx.fill(); }
  ctx.strokeStyle = sp.eye; ctx.lineWidth = 2.5; ctx.beginPath();
  if (k === 'owl') { ctx.fillStyle = '#ffb347'; ctx.moveTo(-6, 2); ctx.lineTo(6, 2); ctx.lineTo(0, 12); ctx.closePath(); ctx.fill(); }
  else { ctx.moveTo(-6, 6); ctx.quadraticCurveTo(-3, 10, 0, 6); ctx.quadraticCurveTo(3, 10, 6, 6); ctx.stroke(); }
  // feet
  ctx.fillStyle = acc; for (const sx of [-1, 1]) { ctx.beginPath(); ctx.ellipse(sx * 20, 58, 12, 6, 0, 0, 7); ctx.fill(); }
  ctx.restore();
}

export function drawCardBack(ctx, W, H) {
  const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#0b1f1c'); g.addColorStop(1, '#03100c');
  rr(ctx, 0, 0, W, H, W * 0.06); ctx.fillStyle = g; ctx.fill();
  ctx.save(); rr(ctx, 0, 0, W, H, W * 0.06); ctx.clip();
  ctx.strokeStyle = 'rgba(125,255,193,0.10)'; ctx.lineWidth = 1;
  for (let i = -H; i < W + H; i += W * 0.06) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + H, H); ctx.stroke(); ctx.beginPath(); ctx.moveTo(i, H); ctx.lineTo(i + H, 0); ctx.stroke(); }
  ctx.restore();
  ctx.strokeStyle = '#7dffc1'; ctx.lineWidth = W * 0.012; rr(ctx, W * 0.05, W * 0.05, W * 0.9, H - W * 0.1, W * 0.04); ctx.stroke();
  // reticle
  const cx = W / 2, cy = H / 2, r = W * 0.24;
  ctx.strokeStyle = '#ffc94a'; ctx.lineWidth = W * 0.018;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.45, 0, Math.PI * 2); ctx.stroke();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.beginPath(); ctx.moveTo(cx + dx * r * 0.7, cy + dy * r * 0.7); ctx.lineTo(cx + dx * r * 1.35, cy + dy * r * 1.35); ctx.stroke(); }
  ctx.fillStyle = '#7dffc1'; ctx.font = `800 ${W * 0.1}px Syne, sans-serif`; ctx.textAlign = 'center';
  ctx.fillText(BRAND.wordmark[0], cx, H * 0.2); ctx.fillText(BRAND.wordmark[1], cx, H * 0.88);
}

const RANK = { common: 1, rare: 2, epic: 3, legendary: 4 };
function frameGradient(ctx, rarity, W, H) {
  const fg = ctx.createLinearGradient(0, 0, W, H);
  if (rarity === 'legendary') { fg.addColorStop(0, '#fff2b8'); fg.addColorStop(0.35, '#ffc94a'); fg.addColorStop(0.65, '#b97a10'); fg.addColorStop(1, '#ffe08a'); }
  else if (rarity === 'epic') { fg.addColorStop(0, '#e0d4ff'); fg.addColorStop(0.5, '#8f6bff'); fg.addColorStop(1, '#4a2fb0'); }
  else if (rarity === 'rare') { fg.addColorStop(0, '#d9fff0'); fg.addColorStop(0.5, '#3fdc98'); fg.addColorStop(1, '#0f6b4a'); }
  else { fg.addColorStop(0, '#e6f8ff'); fg.addColorStop(0.5, '#7cc8e6'); fg.addColorStop(1, '#2f6d86'); }
  return fg;
}
const speciesFor = name => { const ids = Object.keys(SPECIES); let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return ids[h % ids.length]; };
function fitText(ctx, text, maxW, size, weight, family) { let fs = size; ctx.font = `${weight} ${fs}px ${family}`; while (ctx.measureText(text).width > maxW && fs > size * 0.45) { fs -= size * 0.04; ctx.font = `${weight} ${fs}px ${family}`; } return fs; }

// Real card face. With `img`: the card photo fills the window. Without: procedural art + details.
export function drawRealCardFace(ctx, card, W, H, img = null) {
  const R = RARITY[card.rarity] || RARITY.common; const rad = W * 0.06; const u = W / 100; const p = 4.5 * u;
  ctx.clearRect(0, 0, W, H);
  rr(ctx, 0, 0, W, H, rad); ctx.fillStyle = frameGradient(ctx, card.rarity, W, H); ctx.fill();
  const ig = ctx.createLinearGradient(0, 0, 0, H); ig.addColorStop(0, '#0d2420'); ig.addColorStop(1, '#06120f');
  rr(ctx, p, p, W - 2 * p, H - 2 * p, rad * 0.7); ctx.fillStyle = ig; ctx.fill();
  const ax = p + 3 * u, ay = p + 3 * u, aw = W - 2 * p - 6 * u, ah = img ? H - 2 * p - 6 * u - 24 * u : H * 0.5;
  ctx.save(); rr(ctx, ax, ay, aw, ah, 3 * u); ctx.clip();
  if (img) {
    // blurred cover background + contained photo
    const cs = Math.max(aw / img.width, ah / img.height);
    ctx.filter = 'blur(12px) brightness(.55)'; ctx.drawImage(img, ax + (aw - img.width * cs) / 2, ay + (ah - img.height * cs) / 2, img.width * cs, img.height * cs); ctx.filter = 'none';
    const s = Math.min(aw / img.width, ah / img.height);
    ctx.drawImage(img, ax + (aw - img.width * s) / 2, ay + (ah - img.height * s) / 2, img.width * s, img.height * s);
  } else {
    const bg = ctx.createRadialGradient(ax + aw / 2, ay + ah * 0.45, 4, ax + aw / 2, ay + ah / 2, aw * 0.8);
    bg.addColorStop(0, R.color); bg.addColorStop(0.45, '#123a33'); bg.addColorStop(1, '#061310'); ctx.fillStyle = bg; ctx.fillRect(ax, ay, aw, ah);
    if (RANK[card.rarity] >= 3) { ctx.save(); ctx.translate(ax + aw / 2, ay + ah * 0.48); ctx.globalAlpha = 0.18; ctx.fillStyle = '#fff'; for (let i = 0; i < 16; i++) { ctx.rotate(Math.PI / 8); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(aw, -5 * u); ctx.lineTo(aw, 5 * u); ctx.fill(); } ctx.restore(); }
    drawCreature(ctx, speciesFor(card.name), ax + aw / 2, ay + ah * 0.52, ah / 200);
    ctx.fillStyle = 'rgba(244,241,230,.5)'; ctx.font = `700 ${3 * u}px "Geist Mono", monospace`; ctx.textAlign = 'center'; ctx.fillText('PHOTO COMING SOON', ax + aw / 2, ay + ah - 3 * u);
  }
  if (RANK[card.rarity] >= 2) { const hg = ctx.createLinearGradient(ax, ay, ax + aw, ay + ah); hg.addColorStop(0.3, 'rgba(125,255,193,0)'); hg.addColorStop(0.5, 'rgba(255,255,255,0.16)'); hg.addColorStop(0.7, 'rgba(169,139,255,0)'); ctx.globalCompositeOperation = 'screen'; ctx.fillStyle = hg; ctx.fillRect(ax, ay, aw, ah); ctx.globalCompositeOperation = 'source-over'; }
  ctx.restore();
  ctx.strokeStyle = R.color; ctx.lineWidth = 0.6 * u; rr(ctx, ax, ay, aw, ah, 3 * u); ctx.stroke();
  // rarity badge
  ctx.font = `800 ${3.6 * u}px "Geist Mono", monospace`; const bl = R.label + ' ' + '◆'.repeat(RANK[card.rarity] || 1); const bw = ctx.measureText(bl).width + 5 * u;
  ctx.fillStyle = R.color; rr(ctx, ax + 2 * u, ay + 2 * u, bw, 6.5 * u, 3.2 * u); ctx.fill();
  ctx.fillStyle = '#07110f'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillText(bl, ax + 4.5 * u, ay + 5.35 * u); ctx.textBaseline = 'alphabetic';
  // text block
  let y = ay + ah + 9 * u;
  ctx.fillStyle = '#f4f1e6'; ctx.textAlign = 'left';
  fitText(ctx, card.name.toUpperCase(), aw, 7 * u, 800, 'Syne, sans-serif'); ctx.fillText(card.name.toUpperCase(), ax, y);
  y += 6 * u;
  ctx.fillStyle = 'rgba(244,241,230,.7)'; fitText(ctx, [card.set, card.serial].filter(Boolean).join(' · ') || 'Real card', aw, 3.8 * u, 600, '"Geist Mono", monospace');
  ctx.fillText([card.set, card.serial].filter(Boolean).join(' · ') || 'Real card', ax, y);
  if (!img) {
    y += 9 * u; ctx.font = `600 ${3.6 * u}px "Geist Mono", monospace`;
    const rows = [['PACK', card.pack], ['VALUE', card.valueUsd ? '$' + card.valueUsd : ''], ['STATUS', 'REAL CARD · FIND IT, KEEP IT']].filter(r => r[1]);
    for (const [k, v] of rows) { ctx.fillStyle = 'rgba(244,241,230,.5)'; ctx.fillText(k, ax, y); ctx.fillStyle = '#f4f1e6'; ctx.textAlign = 'right'; ctx.fillText(String(v).slice(0, 34), ax + aw, y); ctx.textAlign = 'left'; y += 6 * u; }
  }
  ctx.fillStyle = 'rgba(244,241,230,.42)'; ctx.font = `700 ${3 * u}px "Geist Mono", monospace`; ctx.textAlign = 'left';
  ctx.fillText(BRAND.name.toUpperCase() + ' · REAL CARD', ax, H - p - 3 * u);
  if (card.valueUsd && img) { ctx.textAlign = 'right'; ctx.fillText('~$' + card.valueUsd, ax + aw, H - p - 3 * u); }
  const gl = ctx.createLinearGradient(0, 0, W, H * 0.6); gl.addColorStop(0, 'rgba(255,255,255,0.14)'); gl.addColorStop(0.4, 'rgba(255,255,255,0)');
  rr(ctx, 0, 0, W, H, rad); ctx.fillStyle = gl; ctx.fill();
}

const imgCache = new Map();
export function loadImage(src) {
  if (!src) return Promise.resolve(null);
  if (!imgCache.has(src)) imgCache.set(src, new Promise(res => { const i = new Image(); i.decoding = 'async'; i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }));
  return imgCache.get(src);
}
export function cardCanvas(card, W = 400, img = null) {
  const c = document.createElement('canvas'); c.width = W; c.height = Math.round(W * 1.4);
  drawRealCardFace(c.getContext('2d'), card, W, c.height, img); return c;
}
export async function realCardCanvas(card, W = 400) { return cardCanvas(card, W, await loadImage(card.image)); }
export function backCanvas(W = 400) {
  const c = document.createElement('canvas'); c.width = W; c.height = Math.round(W * 1.4);
  drawCardBack(c.getContext('2d'), W, c.height); return c;
}
