// ─────────────────────────────────────────────────────────────
//  PACK HUNT — single source of truth for branding + settings.
//  Rename the project by editing BRAND below; every page, title,
//  logo, card face and UI string reads from here.
// ─────────────────────────────────────────────────────────────
// Official X account (links in nav, footer, game HUD, start screen; twitter:site meta).
export const X_URL = 'https://x.com/trypackhunt';
export const X_HANDLE = '@trypackhunt';

// Token contract address (CA).
export const CA = 'FpebfxSyVgfnQwTtUFiWX9gu9Vojnx7jLTV7yGBapump';
export const PUMP_URL = 'https://pump.fun/coin/FpebfxSyVgfnQwTtUFiWX9gu9Vojnx7jLTV7yGBapump';

export const BRAND = {
  name: 'Pack Hunt',            // display name
  wordmark: ['PACK', 'HUNT'],   // two-line logo lettering
  short: 'PH',                  // favicon / monogram letters
  tagline: 'Creator fees rip packs. Packs hit the island. Find it, keep it.',
  token: 'the token',           // how the token is referred to in copy
  x: X_URL,                     // official X account (blank = hidden)
  year: 2026,
};

// Public treasury that receives creator fees. Public address only, never a key.
export const TREASURY = '4uz4p6vjb2MbLh5rVAF4fdEuAduRvEx7GBWbbTRr9dnQ';
export const SOLSCAN = (addr = TREASURY) => `https://solscan.io/account/${addr}`;
export const SOLSCAN_TX = sig => `https://solscan.io/tx/${sig}`;

// How winners claim their physical/real card. Shown in the reveal + Found log.
// Set CLAIM.contact to your official channel (e.g. 'https://x.com/yourhandle').
export const CLAIM = {
  contact: X_URL,       // official contact URL; blank -> generic copy
  contactLabel: 'our official X account ' + X_HANDLE,
};

export const NET = {
  // World server URL. null = same origin (ws:// on http, wss:// on https).
  wsUrl: null,
};

export const PALETTE = {
  ink: '#07110f',
  deep: '#0b1f1c',
  mint: '#7dffc1',
  lime: '#d4ff4f',
  gold: '#ffc94a',
  coral: '#ff7a59',
  violet: '#a98bff',
  sky: '#9fe7ff',
  paper: '#f4f1e6',
};

export const RARITY = {
  common:    { label: 'COMMON',    color: '#9fe7ff', glow: 0x9fe7ff, weight: 60 },
  rare:      { label: 'RARE',      color: '#7dffc1', glow: 0x7dffc1, weight: 28 },
  epic:      { label: 'EPIC',      color: '#b69bff', glow: 0xa98bff, weight: 10 },
  legendary: { label: 'LEGENDARY', color: '#ffc94a', glow: 0xffc94a, weight: 2 },
};

export function applyBrand(root = document) {
  root.querySelectorAll('[data-brand]').forEach(el => { el.textContent = BRAND.name; });
  root.querySelectorAll('[data-brand-upper]').forEach(el => { el.textContent = BRAND.name.toUpperCase(); });
  root.querySelectorAll('[data-tagline]').forEach(el => { el.textContent = BRAND.tagline; });
  root.querySelectorAll('[data-token]').forEach(el => { el.textContent = BRAND.token; });
  root.querySelectorAll('[data-brand-x]').forEach(el => {
    if (BRAND.x) { el.href = BRAND.x; el.target = '_blank'; el.rel = 'noopener'; } else el.style.display = 'none';
  });
  const t = document.querySelector('title');
  if (t) t.textContent = t.textContent.replace(/\{BRAND\}/g, BRAND.name);
}
