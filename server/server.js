// Pack Hunt production server: static site + JSON API + admin API + WebSocket world.
import http from 'http';
import path from 'path';
import { ENV } from './env.js';
import { BRAND, TREASURY } from '../site/assets/config.js';
import { openStore } from './store.js';
import { startVault, toSol } from './solana.js';
import { serveFile } from './static.js';
import { adminRouter, publicDrop, publicFind, publicCard } from './admin.js';
import { createWorld } from './game.js';

const log = (...a) => console.log(new Date().toISOString(), ...a);
const store = openStore(ENV.DATA_DIR);
const started = Date.now();

function vaultView() {
  const db = store.db, v = db.vault;
  return {
    treasury: TREASURY,
    balanceSol: toSol(v.balanceLamports),
    totalReceivedSol: toSol(v.totalReceivedLamports),
    incomingTxCount: v.txCount,
    spentOnPacksSol: +db.packs.reduce((a, p) => a + (p.costSol || 0), 0).toFixed(6),
    packsOpened: db.packs.length,
    cardsOnIsland: Object.keys(db.drops).length,
    cardsFound: db.finds.length,
    updatedAt: v.updatedAt, rpcOk: !v.lastError, rpcError: v.lastError ? 'Solana RPC temporarily unavailable' : null,
  };
}
const feed = (n = 40) => store.db.events.slice(-n).reverse();

// --- per-IP rate limit for public API ---
const buckets = new Map();
function limited(ip, cost = 1) {
  const now = Date.now(); let b = buckets.get(ip);
  if (!b) { b = { t: now, tokens: 60 }; buckets.set(ip, b); }
  b.tokens = Math.min(60, b.tokens + (now - b.t) / 500); b.t = now; // 2 req/s sustained, 60 burst
  if (b.tokens < cost) return true; b.tokens -= cost; return false;
}
setInterval(() => { const cut = Date.now() - 120000; for (const [k, b] of buckets) if (b.t < cut) buckets.delete(k); }, 60000);
const ipOf = req => (ENV.TRUST_PROXY && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress) || '?';

const json = (res, code, obj, cache = 'no-store') => { const b = JSON.stringify(obj); res.writeHead(code, { 'content-type': 'application/json', 'cache-control': cache, 'content-length': Buffer.byteLength(b) }); res.end(b); };
let world, admin;
const server = http.createServer(async (req, res) => {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('referrer-policy', 'strict-origin-when-cross-origin');
  res.setHeader('x-frame-options', 'SAMEORIGIN');
  let url; try { url = new URL(req.url, 'http://x'); } catch { res.writeHead(400); return res.end(); }
  const p = url.pathname;
  try {
    if (p === '/healthz') return json(res, 200, { ok: true, uptime: Math.round((Date.now() - started) / 1000), players: world.online(), drops: Object.keys(store.db.drops).length, vaultUpdatedAt: store.db.vault.updatedAt });
    if (p.startsWith('/admin/')) return void (await admin(req, res, url));
    if (p.startsWith('/api/')) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'method not allowed' });
      if (limited(ipOf(req))) return json(res, 429, { error: 'slow down' });
      if (p === '/api/vault') return json(res, 200, vaultView(), 'public, max-age=10');
      if (p === '/api/state') return json(res, 200, { brand: BRAND.name, vault: vaultView(), online: world.online(), feed: feed(30), recent: Object.values(store.db.drops).slice(-8).reverse().map(d => ({ card: publicCard(d.card), droppedAt: d.droppedAt, place: d.place })) }, 'public, max-age=5');
      if (p === '/api/feed') return json(res, 200, { feed: feed(60) }, 'public, max-age=5');
      if (p === '/api/finds') return json(res, 200, { finds: store.db.finds.slice(-200).reverse().map(publicFind) }, 'public, max-age=10');
      if (p === '/api/drops') return json(res, 200, { drops: Object.values(store.db.drops).map(publicDrop) }, 'public, max-age=5');
      if (p === '/api/binder') {
        const w = url.searchParams.get('wallet') || '';
        if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(w)) return json(res, 400, { error: 'wallet required' });
        return json(res, 200, { wallet: w, finds: store.db.finds.filter(f => f.wallet === w).reverse().map(f => ({ ...publicFind(f), note: f.note })) });
      }
      return json(res, 404, { error: 'not found' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    if (p.startsWith('/media/')) { if (/^\/media\/[a-f0-9]{24}\.(png|jpg|webp|gif)$/.test(p) && serveFile(req, res, store.mediaDir, p.slice(6), { immutable: true })) return; res.writeHead(404); return res.end(); }
    let rel = decodeURIComponent(p);
    if (rel === '/play' || rel === '/play/') rel = '/play.html';
    if (rel.endsWith('/')) rel += 'index.html';
    if (rel.startsWith('/tools-render/')) { res.writeHead(404); return res.end(); }
    if (serveFile(req, res, ENV.SITE_DIR, rel)) return;
    res.writeHead(404, { 'content-type': 'text/plain' }); res.end('not found');
  } catch (e) { log('[http] error', e); if (!res.headersSent) json(res, 500, { error: 'server error' }); else res.end(); }
});
server.headersTimeout = 20000; server.requestTimeout = 120000; server.keepAliveTimeout = 65000;

world = createWorld({ server, store, env: ENV, log });
admin = adminRouter({ store, token: ENV.ADMIN_TOKEN, world, log });
if (!ENV.ADMIN_TOKEN) log('[admin] ADMIN_TOKEN is not set, so admin routes are DISABLED (drops/fulfilment unavailable).');
else if (ENV.ADMIN_TOKEN.length < 24) log('[admin] WARNING: ADMIN_TOKEN is short; use at least 32 random characters.');

let lastVaultJson = '';
const vault = startVault({ rpcUrl: ENV.RPC_URL, treasury: TREASURY, store, intervalMs: ENV.VAULT_POLL_MS, log,
  onUpdate: () => { const v = vaultView(), s = JSON.stringify(v); if (s !== lastVaultJson) { lastVaultJson = s; world.broadcastVault(v); } } });

server.listen(ENV.PORT, () => log(`[${BRAND.name}] listening on :${ENV.PORT} · data ${ENV.DATA_DIR} · RPC ${new URL(ENV.RPC_URL).host} · ${Object.keys(store.db.drops).length} cards on island`));

function shutdown(sig) {
  log(`[${BRAND.name}] ${sig}: saving and shutting down`);
  vault.stop(); try { store.flush(); } catch (e) { log('flush failed', e); }
  world.close(); server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM')); process.on('SIGINT', () => shutdown('SIGINT'));
void path;
