// Real-time world: positions, wallet auth (server-issued nonce), server-authoritative claims, anti-cheat.
import crypto from 'crypto';
import { WebSocketServer } from 'ws';
import { BRAND } from '../site/assets/config.js';
import { heightAt, WORLD } from '../site/assets/terrain.js';
import { publicDrop, publicFind, publicCard, shortWallet } from './admin.js';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58decode(s) {
  if (typeof s !== 'string' || s.length > 120) throw new Error('b58');
  let n = 0n; for (const ch of s) { const i = B58.indexOf(ch); if (i < 0) throw new Error('b58'); n = n * 58n + BigInt(i); }
  const out = []; while (n > 0n) { out.unshift(Number(n & 255n)); n >>= 8n; }
  for (const ch of s) { if (ch === '1') out.unshift(0); else break; }
  return Buffer.from(out);
}
const validPubkey = pk => typeof pk === 'string' && /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(pk);
function verifySig(pubkey, message, sigB58) {
  try {
    const pk = b58decode(pubkey); if (pk.length !== 32) return false;
    const sig = b58decode(sigB58); if (sig.length !== 64) return false;
    const key = crypto.createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), pk]), format: 'der', type: 'spki' });
    return crypto.verify(null, Buffer.from(message, 'utf8'), key, sig);
  } catch { return false; }
}
const clean = (s, n) => String(s || '').replace(/[^\w .\-#@]/g, '').slice(0, n).trim();
const fin = (...v) => v.every(Number.isFinite);

export function createWorld({ server, store, env, log }) {
  const secret = Buffer.from(store.db.secret, 'hex');
  const sign = payload => { const body = Buffer.from(JSON.stringify(payload)).toString('base64url'); return body + '.' + crypto.createHmac('sha256', secret).update(body).digest('base64url'); };
  const unsign = tok => {
    if (typeof tok !== 'string' || tok.length > 400) return null;
    const [body, mac] = tok.split('.'); if (!body || !mac) return null;
    const want = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    if (want.length !== mac.length || !crypto.timingSafeEqual(Buffer.from(want), Buffer.from(mac))) return null;
    try { const p = JSON.parse(Buffer.from(body, 'base64url').toString()); return p.exp > Date.now() ? p : null; } catch { return null; }
  };
  const originOk = o => !o || env.ALLOWED_ORIGINS.includes(o) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o);
  const ipOf = req => (env.TRUST_PROXY && req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress) || '?';

  const wss = new WebSocketServer({ server, maxPayload: 4096, perMessageDeflate: false,
    verifyClient: (info, cb) => { if (!originOk(info.origin)) { log(`[ws] rejected origin ${info.origin}`); return cb(false, 403, 'origin not allowed'); } cb(true); } });
  const clients = new Map(); // ws -> player
  const perIp = new Map();
  const walletLastClaim = new Map();
  let nextId = 1;
  const send = (ws, m) => { if (ws.readyState === 1) ws.send(typeof m === 'string' ? m : JSON.stringify(m)); };
  const broadcast = (m, except) => { const s = JSON.stringify(m); for (const ws of clients.keys()) if (ws !== except) send(ws, s); };
  const meta = p => ({ id: p.id, name: p.name, color: p.color, wallet: p.wallet ? shortWallet(p.wallet) : null });
  const newMessage = (p) => { p.nonce = crypto.randomBytes(16).toString('hex'); p.authMsg = `${BRAND.name} sign-in\n\nSign this message to prove you own this wallet. It is NOT a transaction and costs nothing.\n\nDomain: ${p.host}\nNonce: ${p.nonce}\nIssued: ${new Date().toISOString()}`; return p.authMsg; };

  wss.on('connection', (ws, req) => {
    const ip = ipOf(req);
    if ((perIp.get(ip) || 0) >= env.MAX_CONN_PER_IP) { send(ws, { t: 'error', code: 'too-many', text: 'Too many connections from your network.' }); return ws.close(4002, 'too many'); }
    if (clients.size >= env.MAX_PLAYERS) { send(ws, { t: 'full', text: `The island is full (${env.MAX_PLAYERS} hunters). Retrying shortly…` }); return ws.close(4001, 'full'); }
    perIp.set(ip, (perIp.get(ip) || 0) + 1);
    const a = Math.random() * Math.PI * 2, r = 11 + Math.random() * 5;
    const p = { id: 'p' + (nextId++).toString(36), ip, name: 'hunter', color: 0x7dffc1, x: Math.cos(a) * r, y: WORLD.plaza.h + 0.1, z: Math.sin(a) * r, ry: 0, anim: 0, lastPos: Date.now(), wallet: null, joined: false, alive: true, tokens: 40, tokenT: Date.now(), floods: 0, strikes: 0, lastClaim: 0, host: String(req.headers.host || 'huntpacks.fun').slice(0, 80) };
    clients.set(ws, p);
    ws.on('pong', () => { p.alive = true; });
    ws.on('message', (raw, isBinary) => {
      // token bucket rate limit: 25 msg/s sustained, 40 burst
      const now = Date.now(); p.tokens = Math.min(40, p.tokens + (now - p.tokenT) / 40); p.tokenT = now;
      if (p.tokens < 1) { if (++p.floods > 300) ws.close(1008, 'rate'); return; }
      p.tokens--;
      if (isBinary) return;
      let m; try { m = JSON.parse(raw); } catch { return; }
      if (!m || typeof m.t !== 'string') return;
      handle(ws, p, m, now);
    });
    ws.on('close', () => {
      clients.delete(ws); const n = (perIp.get(ip) || 1) - 1; if (n > 0) perIp.set(ip, n); else perIp.delete(ip);
      if (p.joined) broadcast({ t: 'leave', id: p.id });
    });
    ws.on('error', () => {});
  });

  function handle(ws, p, m, now) {
    switch (m.t) {
      case 'hello': {
        if (p.joined) return;
        p.name = clean(m.name, 18) || 'hunter'; p.color = Number.isInteger(m.color) ? m.color & 0xffffff : p.color; p.joined = true;
        // resume a previous wallet session (signed token issued by this server)
        const s = unsign(m.session); if (s && validPubkey(s.pk)) p.wallet = s.pk;
        const others = []; for (const q of clients.values()) if (q !== p && q.joined) others.push(meta(q));
        send(ws, { t: 'welcome', id: p.id, spawn: { x: p.x, y: p.y, z: p.z }, players: others, online: countOnline(), drops: Object.values(store.db.drops).map(publicDrop), authMsg: newMessage(p), wallet: p.wallet, brand: BRAND.name });
        broadcast({ t: 'pm', p: meta(p) }, ws);
        return;
      }
      case 'auth': { // { pubkey, signature } over the server-issued message
        if (!validPubkey(m.pubkey) || typeof m.signature !== 'string') return send(ws, { t: 'authFail', reason: 'bad-request' });
        const msg = p.authMsg;
        newMessage(p); // nonce is single-use either way
        if (!msg || !verifySig(m.pubkey, msg, m.signature)) return send(ws, { t: 'authFail', reason: 'bad-signature', authMsg: p.authMsg });
        p.wallet = m.pubkey;
        const token = sign({ pk: m.pubkey, exp: Date.now() + env.SESSION_DAYS * 864e5 });
        send(ws, { t: 'authOk', wallet: p.wallet, session: token, authMsg: p.authMsg });
        broadcast({ t: 'pm', p: meta(p) }, ws);
        return;
      }
      case 'logout': p.wallet = null; send(ws, { t: 'authOut', authMsg: newMessage(p) }); broadcast({ t: 'pm', p: meta(p) }, ws); return;
      case 'pos': {
        if (!p.joined || !fin(m.x, m.y, m.z, m.ry)) return;
        const dt = Math.max(0.05, (now - p.lastPos) / 1000);
        const d = Math.hypot(m.x - p.x, m.z - p.z);
        const allowed = 15 * dt + 2.5; // sprint is 13 u/s
        const R = Math.hypot(m.x, m.z);
        const g = heightAt(m.x, m.z);
        if (d > allowed || R > 305 || m.y > Math.max(g, WORLD.plaza.h) + 9) {
          p.strikes++; p.lastPos = now;
          send(ws, { t: 'correct', x: p.x, y: p.y, z: p.z });
          if (p.strikes > 60) { log(`[anticheat] closing ${p.id} (${p.ip}) after repeated invalid movement`); ws.close(1008, 'movement'); }
          return;
        }
        p.strikes = Math.max(0, p.strikes - 0.02);
        p.x = m.x; p.y = Math.max(-3, m.y); p.z = m.z; p.ry = m.ry; p.anim = m.a | 0; p.lastPos = now;
        return;
      }
      case 'claim': {
        const fail = reason => send(ws, { t: 'claimResult', ok: false, dropId: String(m.dropId).slice(0, 40), reason });
        if (typeof m.dropId !== 'string') return;
        if (!p.wallet) return fail('wallet-required');
        if (now - p.lastClaim < 1500 || now - (walletLastClaim.get(p.wallet) || 0) < 1500) return fail('cooldown');
        p.lastClaim = now;
        const d = store.db.drops[m.dropId];
        if (!d) return fail(store.db.finds.some(f => f.dropId === m.dropId) ? 'already-claimed' : 'unknown-drop');
        if (Math.hypot(p.x - d.x, p.z - d.z) > env.CLAIM_RADIUS) return fail('too-far');
        walletLastClaim.set(p.wallet, now);
        delete store.db.drops[d.dropId];
        const f = { id: store.id('f'), dropId: d.dropId, packId: d.packId, card: d.card, wallet: p.wallet, name: p.name, at: now, status: 'pending', statusAt: now, note: '' };
        store.db.finds.push(f);
        const ev = store.event({ type: 'found', text: `${p.name} (${shortWallet(p.wallet)}) found ${d.card.name}!`, rarity: d.card.rarity, card: d.card.name, wallet: shortWallet(p.wallet), place: d.place });
        store.flush(); // claims are written immediately
        send(ws, { t: 'claimResult', ok: true, dropId: d.dropId, find: { ...publicFind(f), wallet: f.wallet }, card: publicCard(d.card) });
        broadcast({ t: 'found', dropId: d.dropId, by: p.id, name: p.name, wallet: shortWallet(p.wallet), card: publicCard(d.card), event: ev }, ws);
        log(`[claim] ${p.name} ${p.wallet} found "${d.card.name}" (${d.dropId})`);
        return;
      }
      case 'name': {
        if (!p.joined || now - (p.lastName || 0) < 2000) return; p.lastName = now;
        p.name = clean(m.name, 18) || p.name; if (Number.isInteger(m.color)) p.color = m.color & 0xffffff;
        broadcast({ t: 'pm', p: meta(p) }, ws); return;
      }
      case 'ping': return send(ws, { t: 'pong', ts: m.ts });
    }
  }
  const countOnline = () => { let n = 0; for (const p of clients.values()) if (p.joined) n++; return n; };

  // 10 Hz interest-managed snapshots: each client only gets nearby players (capped).
  let tick = 0;
  setInterval(() => {
    tick++;
    const list = []; for (const p of clients.values()) if (p.joined) list.push(p);
    if (!list.length) return;
    const rows = new Map(list.map(p => [p, [p.id, Math.round(p.x * 10) / 10, Math.round(p.y * 10) / 10, Math.round(p.z * 10) / 10, Math.round(p.ry * 100) / 100, p.anim]]));
    const online = tick % 10 === 0 ? list.length : undefined;
    const V2 = env.VIEW_RADIUS * env.VIEW_RADIUS;
    for (const [ws, me] of clients) {
      if (!me.joined || ws.readyState !== 1 || ws.bufferedAmount > 256 * 1024) continue; // skip slow consumers
      let near = [];
      for (const q of list) { if (q === me) continue; const dx = q.x - me.x, dz = q.z - me.z, d2 = dx * dx + dz * dz; if (d2 < V2) near.push([d2, q]); }
      if (near.length > env.MAX_VISIBLE) { near.sort((a, b) => a[0] - b[0]); near = near.slice(0, env.MAX_VISIBLE); }
      ws.send(JSON.stringify({ t: 's', p: near.map(([, q]) => rows.get(q)), n: online }));
    }
  }, 100);
  // heartbeat
  setInterval(() => { for (const [ws, p] of clients) { if (!p.alive) { ws.terminate(); continue; } p.alive = false; try { ws.ping(); } catch {} } }, 20000);

  return {
    online: countOnline,
    broadcastDrop(drops, event) { broadcast({ t: 'drop', drops, event }); },
    broadcastRemoved(dropId) { broadcast({ t: 'removed', dropId }); },
    broadcastFulfil(find) { broadcast({ t: 'fulfil', find }); },
    broadcastVault(v) { broadcast({ t: 'vault', vault: v }); },
    close() { for (const ws of clients.keys()) ws.close(1001, 'restart'); wss.close(); },
  };
}
