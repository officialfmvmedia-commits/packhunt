// Authenticated admin API: drop real cards, list/remove drops, update fulfilment.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { placeCard, findLandmark, nearestPlace } from './placement.js';

const RARITIES = ['common', 'rare', 'epic', 'legendary'];
const STATUSES = ['pending', 'contacted', 'shipped', 'sent', 'delivered', 'cancelled'];
const MAX_IMAGE = 8 * 1024 * 1024;
const RLABEL = { common: 'COMMON', rare: 'RARE', epic: 'EPIC', legendary: 'LEGENDARY' };

export function tokenOk(header, token) {
  if (!token) return false;
  const m = /^Bearer\s+(.+)$/i.exec(header || ''); if (!m) return false;
  const a = crypto.createHash('sha256').update(m[1]).digest(), b = crypto.createHash('sha256').update(token).digest();
  return crypto.timingSafeEqual(a, b);
}
const str = (v, n) => (v == null ? '' : String(v).replace(/[\u0000-\u001f]/g, '').trim().slice(0, n));
const num = v => (v === undefined || v === null || v === '' || !Number.isFinite(+v) ? null : +v);

function sniff(buf) {
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return 'png';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'webp';
  if (buf.slice(0, 3).toString() === 'GIF') return 'gif';
  return null;
}
async function saveImage(store, { image, imageData }) {
  let buf = null;
  if (imageData) buf = Buffer.from(String(imageData), 'base64');
  else if (image) {
    if (!/^https?:\/\//i.test(image)) throw new Error('image must be an http(s) URL (or pass a local path to the CLI)');
    const r = await fetch(image, { redirect: 'follow', signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`image fetch failed: HTTP ${r.status}`);
    const len = +r.headers.get('content-length'); if (len > MAX_IMAGE) throw new Error('image too large (max 8MB)');
    buf = Buffer.from(await r.arrayBuffer());
  }
  if (!buf) return null;
  if (buf.length > MAX_IMAGE) throw new Error('image too large (max 8MB)');
  const ext = sniff(buf); if (!ext) throw new Error('image must be PNG, JPEG, WEBP or GIF');
  const name = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 24) + '.' + ext;
  const f = path.join(store.mediaDir, name);
  if (!fs.existsSync(f)) fs.writeFileSync(f, buf);
  return '/media/' + name;
}
export const publicCard = c => ({ name: c.name, set: c.set, rarity: c.rarity, image: c.image, pack: c.pack, serial: c.serial, valueUsd: c.valueUsd, proof: c.proof });
export const publicDrop = d => ({ dropId: d.dropId, x: d.x, z: d.z, card: publicCard(d.card), droppedAt: d.droppedAt, place: d.place });
export const shortWallet = w => (w ? w.slice(0, 4) + '…' + w.slice(-4) : '');
export const publicFind = f => ({ id: f.id, card: publicCard(f.card), wallet: shortWallet(f.wallet), name: f.name, at: f.at, status: f.status, statusAt: f.statusAt });

function readJson(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(Object.assign(new Error('payload too large'), { code: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(Object.assign(new Error('invalid JSON'), { code: 400 })); } });
    req.on('error', reject);
  });
}

const art = (r, cap) => (r === 'epic' ? (cap ? 'An' : 'an') : (cap ? 'A' : 'a'));
export function adminRouter({ store, token, world, log }) {
  const send = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
  return async function handle(req, res, url) {
    if (!url.pathname.startsWith('/admin/')) return false;
    if (!token) { send(res, 503, { error: 'admin disabled: ADMIN_TOKEN not set on the server' }); return true; }
    if (!tokenOk(req.headers.authorization, token)) { await new Promise(r => setTimeout(r, 400)); send(res, 401, { error: 'unauthorized' }); return true; }
    const db = store.db;
    try {
      // POST /admin/drop  { pack, costSol, tx, near, cards:[{ name,set,rarity,image|imageData,qty,serial,valueUsd }] }
      if (req.method === 'POST' && url.pathname === '/admin/drop') {
        const b = await readJson(req, 40 * 1024 * 1024);
        const cards = Array.isArray(b.cards) ? b.cards : [b];
        if (!cards.length || cards.length > 50) return send(res, 400, { error: 'cards: 1..50 required' }), true;
        const near = b.near ? findLandmark(b.near) : null;
        if (b.near && !near) return send(res, 400, { error: `unknown landmark "${b.near}"` }), true;
        const costSol = num(b.costSol); if (costSol !== null && (costSol < 0 || costSol > 1e6)) return send(res, 400, { error: 'bad costSol' }), true;
        const prepared = [];
        for (const c of cards) {
          const name = str(c.name, 80); if (!name) return send(res, 400, { error: 'card name required' }), true;
          const rarity = str(c.rarity, 20).toLowerCase(); if (!RARITIES.includes(rarity)) return send(res, 400, { error: `rarity must be one of ${RARITIES.join(', ')}` }), true;
          const qty = Math.max(1, Math.min(50, Math.floor(num(c.qty) || 1)));
          const image = await saveImage(store, c);
          prepared.push({ card: { name, set: str(c.set, 80), rarity, image, pack: str(b.pack || c.pack, 80), serial: str(c.serial, 80), valueUsd: num(c.valueUsd), proof: str(b.tx || c.tx, 300) }, qty });
        }
        const pack = { id: store.id('pk'), name: str(b.pack, 80) || 'Single', costSol: costSol || 0, tx: str(b.tx, 300), at: Date.now(), cards: 0 };
        const dropped = [];
        for (const { card, qty } of prepared) for (let i = 0; i < qty; i++) {
          const spot = placeCard(db.drops, near);
          const place = nearestPlace(spot.x, spot.z).name;
          const d = { dropId: store.id('d'), packId: pack.id, card, x: spot.x, z: spot.z, place, droppedAt: Date.now() };
          db.drops[d.dropId] = d; dropped.push(d); pack.cards++;
        }
        db.packs.push(pack);
        const order = { legendary: 3, epic: 2, rare: 1, common: 0 };
        const top = dropped.slice().sort((a, b2) => order[b2.card.rarity] - order[a.card.rarity])[0];
        const announce = dropped.length === 1
          ? `${art(top.card.rarity, true)} ${RLABEL[top.card.rarity]} just dropped near ${top.place}!`
          : `${dropped.length} cards just dropped! Best pull: ${art(top.card.rarity)} ${RLABEL[top.card.rarity]} near ${top.place}.`;
        const ev = store.event({ type: 'drop', text: announce, rarity: top.card.rarity, count: dropped.length, pack: pack.name, costSol: pack.costSol, tx: pack.tx, cards: dropped.map(d => ({ name: d.card.name, rarity: d.card.rarity, place: d.place })) });
        store.save();
        world.broadcastDrop(dropped.map(publicDrop), ev);
        log(`[admin] dropped ${dropped.length} card(s) from "${pack.name}" (${pack.costSol} SOL): ${announce}`);
        send(res, 200, { ok: true, pack, announce, drops: dropped.map(d => ({ dropId: d.dropId, name: d.card.name, rarity: d.card.rarity, x: d.x, z: d.z, place: d.place, image: d.card.image })) });
        return true;
      }
      if (req.method === 'GET' && url.pathname === '/admin/drops') {
        send(res, 200, { open: Object.values(db.drops), found: db.finds.map(f => ({ dropId: f.dropId, name: f.card.name, wallet: f.wallet, at: f.at })), removed: db.removed });
        return true;
      }
      const rm = /^\/admin\/drops\/([\w-]+)$/.exec(url.pathname);
      if (req.method === 'DELETE' && rm) {
        const d = db.drops[rm[1]]; if (!d) return send(res, 404, { error: 'no open drop with that id (already found or removed?)' }), true;
        delete db.drops[d.dropId]; db.removed.push({ ...d, removedAt: Date.now() }); store.save();
        world.broadcastRemoved(d.dropId);
        log(`[admin] removed drop ${d.dropId} (${d.card.name})`);
        send(res, 200, { ok: true, removed: d.dropId }); return true;
      }
      if (req.method === 'GET' && url.pathname === '/admin/finds') { send(res, 200, { finds: db.finds }); return true; }
      const fm = /^\/admin\/finds\/([\w-]+)$/.exec(url.pathname);
      if (req.method === 'POST' && fm) {
        const b = await readJson(req, 64 * 1024);
        const f = db.finds.find(x => x.id === fm[1] || x.dropId === fm[1]); if (!f) return send(res, 404, { error: 'find not found' }), true;
        const status = str(b.status, 20).toLowerCase(); if (!STATUSES.includes(status)) return send(res, 400, { error: `status must be one of ${STATUSES.join(', ')}` }), true;
        f.status = status; f.statusAt = Date.now(); if (b.note !== undefined) f.note = str(b.note, 500);
        store.save(); world.broadcastFulfil(publicFind(f));
        log(`[admin] find ${f.id} -> ${status}`);
        send(res, 200, { ok: true, find: f }); return true;
      }
      send(res, 404, { error: 'unknown admin route' }); return true;
    } catch (e) { send(res, e.code === 413 ? 413 : e.code === 400 ? 400 : 500, { error: e.message }); return true; }
  };
}
