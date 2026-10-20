// End-to-end launch test (headless). Needs a running server started with ADMIN_TOKEN and MAX_CONN_PER_IP>=60.
//   ADMIN_TOKEN=... PACKHUNT_URL=http://localhost:8787 NODE_PATH=<dir with puppeteer-core> node tests/e2e.mjs [shotsDir] [bots=50]
// Uses throwaway ed25519 keys to mock Phantom's signMessage. Never touches real wallets.
import crypto from 'crypto';
import { createRequire } from 'module';
import { execFileSync } from 'child_process';
import WebSocket from 'ws';
import { heightAt } from '../site/assets/terrain.js';
const require = createRequire(import.meta.url);
const puppeteer = require(require.resolve('puppeteer-core', { paths: [...(process.env.NODE_PATH || '').split(':'), process.cwd()] }));
const BASE = process.env.PACKHUNT_URL || 'http://localhost:8787';
const WSURL = BASE.replace(/^http/, 'ws');
const SHOTS = process.argv[2] || 'shots';
const NBOTS = +(process.argv[3] || 50);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = []; const ok = (name, pass, info = '') => { results.push({ name, pass }); console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${info ? '  · ' + info : ''}`); };
const A58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const b58 = buf => { let n = BigInt('0x' + Buffer.from(buf).toString('hex')), s = ''; while (n > 0n) { s = A58[Number(n % 58n)] + s; n /= 58n; } for (const b of buf) { if (b === 0) s = '1' + s; else break; } return s; };
function keypair() { const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519'); return { pk: b58(publicKey.export({ format: 'der', type: 'spki' }).subarray(12)), sign: m => crypto.sign(null, Buffer.from(m), privateKey) }; }
const api = p => fetch(BASE + p).then(r => r.json());
const drop = args => execFileSync('node', ['tools/drop.mjs', ...args], { env: process.env }).toString();

// ---------- ws bot ----------
function bot(name, { wallet } = {}) {
  const b = { name, msgs: [], drops: new Map(), events: [], ws: new WebSocket(WSURL, { headers: { origin: BASE } }), x: 0, y: 0, z: 0, corrections: 0 };
  b.ready = new Promise((res, rej) => {
    b.ws.on('open', () => b.ws.send(JSON.stringify({ t: 'hello', name, color: 0x55aaff })));
    b.ws.on('message', raw => {
      const m = JSON.parse(raw);
      if (m.t === 'welcome') { Object.assign(b, m.spawn); b.id = m.id; b.authMsg = m.authMsg; m.drops.forEach(d => b.drops.set(d.dropId, d)); if (!wallet) res(b); else b.ws.send(JSON.stringify({ t: 'auth', pubkey: wallet.pk, signature: b58(wallet.sign(m.authMsg)) })); }
      if (m.t === 'authOk') { b.wallet = m.wallet; res(b); }
      if (m.t === 'authFail') rej(new Error('authFail ' + m.reason));
      if (m.t === 'drop') { m.drops.forEach(d => b.drops.set(d.dropId, d)); b.events.push({ at: Date.now(), m }); }
      if (m.t === 'found') b.drops.delete(m.dropId);
      if (m.t === 'correct') { b.corrections++; Object.assign(b, { x: m.x, y: m.y, z: m.z }); }
      if (m.t === 'claimResult') b.onClaim?.(m);
      if (m.t === 'full' || m.t === 'error') b.err = m;
    });
    b.ws.on('error', rej);
  });
  b.pos = () => b.ws.send(JSON.stringify({ t: 'pos', x: +b.x.toFixed(2), y: +b.y.toFixed(2), z: +b.z.toFixed(2), ry: 0, a: 1 }));
  b.claim = id => new Promise(r => { b.onClaim = r; b.ws.send(JSON.stringify({ t: 'claim', dropId: id })); });
  // walk toward (tx,tz) at ~11 u/s, sending 10 pos/s (well inside the server's speed limit)
  b.walkTo = async (tx, tz, stop = 1) => { for (;;) { const dx = tx - b.x, dz = tz - b.z, d = Math.hypot(dx, dz); if (d <= stop) return; const s = Math.min(d, 1.1); b.x += dx / d * s; b.z += dz / d * s; b.y = Math.max(heightAt(b.x, b.z), 0) + 0.05; b.pos(); await sleep(100); } };
  return b;
}

// ---------- browser client ----------
async function client(browser, label, kp) { const t0 = Date.now();
  const p = await browser.newPage(); await p.setViewport({ width: 1280, height: 800 });
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') { errs.push(m.text()); console.log(`[${label} console.error]`, m.text()); } });
  p.on('pageerror', e => { errs.push(e.message); console.log(`[${label} pageerror]`, e.message); });
  await p.exposeFunction('__testSign', bytes => [...kp.sign(Buffer.from(bytes))]);
  await p.evaluateOnNewDocument(pk => {
    const prov = { isPhantom: true, publicKey: null, on() {}, async connect() { this.publicKey = { toString: () => pk }; return { publicKey: this.publicKey }; }, async disconnect() {}, async signMessage(m) { return { signature: new Uint8Array(await window.__testSign([...m])) }; } };
    window.phantom = { solana: prov }; window.solana = prov;
  }, kp.pk);
  await p.goto(BASE + '/play', { waitUntil: 'networkidle2', timeout: 120000 });
  await p.waitForFunction(() => !document.getElementById('enterBtn').disabled && window.__ph?.status === 'live', { timeout: 120000 });
  console.log(`· ${label} live in ${Date.now() - t0}ms`); return { p, errs, label, kp };
}
async function enter(c, name) { await c.p.evaluate(n => { document.getElementById('nameIn').value = n; }, name); await c.p.click('#enterBtn'); await sleep(500); }
async function verify(c) { await c.p.click('#walletBtn'); await c.p.waitForFunction(() => document.getElementById('walletBtn').classList.contains('on'), { timeout: 20000 }); }
// steer the camera so "forward" points at the target, hold Shift+W until the card is claimed or someone else got it
async function runTo(c, dropId, maxMs = 240000) {
  const t0 = Date.now(); await c.p.keyboard.down('Shift'); await c.p.keyboard.down('KeyW');
  try {
    while (Date.now() - t0 < maxMs) {
      const st = await c.p.evaluate(id => { const d = window.__ph.drops().find(x => x.dropId === id); const q = window.__ph.player.position; if (!d) return { gone: true }; const dx = d.x - q.x, dz = d.z - q.z; window.__ph.look(Math.atan2(-dx, -dz), 0.38, 14); return { d: Math.hypot(dx, dz) }; }, dropId);
      if (st.gone) return Date.now() - t0;
      await sleep(st.d < 6 ? 60 : 250);
    }
  } finally { await c.p.keyboard.up('KeyW'); await c.p.keyboard.up('Shift'); }
  return -1;
}

(async () => {
  const h = await api('/healthz'); ok('healthz', h.ok === true);
  const v0 = await api('/api/vault');
  ok('vault reads Solana mainnet', v0.rpcOk === true && v0.treasury === 'HXjDKgKuHghBx52coJmYLbH83g7KkKSWrHce5zkDkgJj', `balance ${v0.balanceSol} SOL · received ${v0.totalReceivedSol} SOL · ${v0.incomingTxCount} incoming tx`);
  ok('island starts empty', v0.cardsOnIsland === 0 && v0.packsOpened === 0);
  const unauth = await fetch(BASE + '/admin/drops', { headers: { authorization: 'Bearer nope' } }); ok('admin rejects bad token', unauth.status === 401);
  const badOrigin = await new Promise(r => { const w = new WebSocket(WSURL, { headers: { origin: 'https://evil.example' } }); w.on('open', () => r('open')); w.on('error', () => r('rejected')); w.on('unexpected-response', () => r('rejected')); });
  ok('ws rejects foreign origin', badOrigin === 'rejected');

  const launch = () => puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', protocolTimeout: 300000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const browser = await launch(), browser2 = await launch();
  const kA = keypair(), kB = keypair();
  const A = await client(browser, 'A', kA), B = await client(browser2, 'B', kB);
  console.log('· both clients loaded'); await enter(A, 'Alice'); await enter(B, 'Bob'); console.log('· entered');
  await verify(A); await verify(B);
  ok('Phantom sign-in verified server-side (2 clients)', true);
  await sleep(1500);
  await A.p.screenshot({ path: `${SHOTS}/launch-empty-vault.png` });

  // ~50 ws bots wandering around the plaza
  const bots = []; for (let i = 0; i < NBOTS; i++) bots.push(bot('bot' + i));
  await Promise.all(bots.map(b => b.ready));
  let wander = true; (async () => { while (wander) { for (const b of bots) { b.x += (Math.random() - .5) * 1.2; b.z += (Math.random() - .5) * 1.2; b.y = Math.max(heightAt(b.x, b.z), 0) + .05; b.pos(); } await sleep(200); } })();
  await sleep(1500);
  const onlineA = await A.p.evaluate(() => +document.getElementById('online').textContent);
  ok(`${NBOTS} bots connected`, (await api('/healthz')).players >= NBOTS + 2, `A sees ${onlineA} online`);

  // real drops via the admin CLI
  const tDrop = Date.now();
  console.log(drop(['--name', 'Test Legendary', '--set', 'E2E Set', '--rarity', 'legendary', '--image', '/tmp/testcard.png', '--qty', '1', '--pack', 'E2E Pack A', '--cost-sol', '0.25', '--tx', 'TEST-PROOF-A', '--serial', 'PSA-0001', '--value-usd', '100', '--near', 'Signal Tower']).trim());
  await sleep(300);
  const lat = bots.map(b => b.events[0] ? b.events[0].at - tDrop : Infinity);
  ok('all bots got the drop announcement', lat.every(Number.isFinite), `max ${Math.max(...lat)} ms after CLI start`);
  await A.p.waitForFunction(() => !document.getElementById('announce').classList.contains('hidden'), { timeout: 10000 });
  const anText = await A.p.evaluate(() => document.getElementById('anT').textContent);
  ok('browser shows the live announcement', /LEGENDARY just dropped near Signal Tower/.test(anText), anText);
  await sleep(600);
  await A.p.screenshot({ path: `${SHOTS}/launch-drop-announcement.png` });
  console.log(drop(['--name', 'Test Rare', '--set', 'E2E Set', '--rarity', 'rare', '--qty', '1', '--pack', 'E2E Pack B', '--cost-sol', '0.1', '--tx', 'TEST-PROOF-B']).trim());
  console.log(drop(['--name', 'Test Epic', '--set', 'E2E Set', '--rarity', 'epic', '--qty', '1', '--pack', 'E2E Pack C', '--cost-sol', '0.1', '--tx', 'TEST-PROOF-C', '--near', 'plaza']).trim());
  await sleep(500);
  const ds = (await api('/api/drops')).drops; ok('3 cards on island', ds.length === 3);
  const v1 = await api('/api/vault'); ok('vault counts packs + spend', v1.packsOpened === 3 && Math.abs(v1.spentOnPacksSol - 0.45) < 1e-9 && v1.cardsOnIsland === 3, `${v1.packsOpened} packs · ${v1.spentOnPacksSol} SOL spent`);

  // anti-cheat: a bot without wallet can't claim; a teleport gets corrected; a far claim is refused
  const legendary = [...bots[0].drops.values()].find(d => d.card.rarity === 'legendary');
  const rare = [...bots[0].drops.values()].find(d => d.card.rarity === 'rare');
  const epic = [...bots[0].drops.values()].find(d => d.card.rarity === 'epic');
  ok('claim without wallet refused', (await bots[0].claim(legendary.dropId)).reason === 'wallet-required');
  const cheat = bots[1]; const c0 = cheat.corrections; cheat.x = legendary.x; cheat.z = legendary.z; cheat.y = heightAt(cheat.x, cheat.z); cheat.pos(); await sleep(400);
  ok('teleport is corrected by the server', cheat.corrections > c0);
  const kW1 = keypair(), kW2 = keypair();
  const r1 = bot('racer1', { wallet: kW1 }), r2 = bot('racer2', { wallet: kW2 });
  await Promise.all([r1.ready, r2.ready]); ok('ws wallet auth (nonce + ed25519)', r1.wallet === kW1.pk && r2.wallet === kW2.pk);
  ok('far claim refused', (await r1.claim(legendary.dropId)).reason === 'too-far');
  // forged signature
  const forged = await new Promise(res => { const w = new WebSocket(WSURL, { headers: { origin: BASE } }); w.on('open', () => w.send(JSON.stringify({ t: 'hello', name: 'forger' }))); w.on('message', raw => { const m = JSON.parse(raw); if (m.t === 'welcome') w.send(JSON.stringify({ t: 'auth', pubkey: kW1.pk, signature: b58(kW2.sign(m.authMsg)) })); if (m.t === 'authFail') { w.close(); res('fail'); } if (m.t === 'authOk') { w.close(); res('ok'); } }); });
  ok('forged signature rejected', forged === 'fail');
  // ws race on the rare: both walk legitimately to it and claim at the same instant
  await sleep(1600);
  await Promise.all([r1.walkTo(rare.x, rare.z, 1.5), r2.walkTo(rare.x, rare.z, 1.5)]);
  const [c1, c2] = await Promise.all([r1.claim(rare.dropId), r2.claim(rare.dropId)]);
  ok('ws claim race: exactly one winner', [c1, c2].filter(c => c.ok).length === 1, `${c1.ok ? 'racer1' : 'racer2'} won · loser: ${(c1.ok ? c2 : c1).reason}`);

  // browser race on the epic near the plaza
  console.log('browser race to', epic.card.name, `@ (${epic.x.toFixed(1)}, ${epic.z.toFixed(1)})`);
  const tR = Date.now();
  const [ta, tb] = await Promise.all([runTo(A, epic.dropId), runTo(B, epic.dropId)]);
  const finds = (await api('/api/finds')).finds;
  const ef = finds.find(f => f.card.name === 'Test Epic');
  const winner = ef && (ef.name === 'Alice' ? A : ef.name === 'Bob' ? B : null);
  ok('browser race: card claimed by one of the two', !!winner, ef ? `${ef.name} (${ef.wallet}) after ${((Date.now() - tR) / 1000).toFixed(0)}s · A ${ta}ms B ${tb}ms` : 'no find');
  if (winner) {
    await winner.p.waitForFunction(() => !document.getElementById('reveal').classList.contains('hidden'), { timeout: 15000 }).catch(() => {});
    await sleep(2500);
    await winner.p.screenshot({ path: `${SHOTS}/launch-reveal.png` });
    const binder = await api('/api/binder?wallet=' + winner.kp.pk); ok('binder from server by wallet', binder.finds.length === 1 && binder.finds[0].card.name === 'Test Epic');
    const loser = winner === A ? B : A;
    ok('loser no longer sees the card', await loser.p.evaluate(id => !window.__ph.drops().some(d => d.dropId === id), epic.dropId));
  }
  // fulfilment update → public log
  const fid = finds[0]?.id;
  if (fid) { console.log(execFileSync('node', ['tools/fulfil.mjs', fid, 'shipped', '--note', 'E2E test'], { env: process.env }).toString().trim()); }
  const f2 = (await api('/api/finds')).finds; ok('fulfilment status updated', f2.some(f => f.status === 'shipped'));
  ok('public found log truncates wallets', f2.every(f => /^.{4}….{4}$/.test(f.wallet)));
  const viewer = winner ? (winner === A ? B : A) : A;
  await viewer.p.evaluate(() => document.getElementById('rvOk').click());
  await viewer.p.keyboard.press('KeyF'); await sleep(2500);
  await viewer.p.screenshot({ path: `${SHOTS}/launch-found-log.png` });
  const v2 = await api('/api/vault'); ok('vault after claims', v2.cardsFound === 2 && v2.cardsOnIsland === 1, JSON.stringify({ found: v2.cardsFound, left: v2.cardsOnIsland, balance: v2.balanceSol, received: v2.totalReceivedSol }));

  // landing page reads live state
  const L = await browser.newPage(); const lerr = []; L.on('console', m => m.type() === 'error' && lerr.push(m.text())); L.on('pageerror', e => lerr.push(e.message));
  await L.setViewport({ width: 1440, height: 900 }); await L.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 120000 }); await sleep(2500);
  const lv = await L.evaluate(() => ({ packs: document.getElementById('vPacks').textContent, found: document.getElementById('vFound').textContent, flist: document.querySelectorAll('.fitem').length }));
  ok('landing shows live vault + found log', lv.packs === '3' && lv.found === '2' && lv.flist === 2, JSON.stringify(lv));
  await L.evaluate(() => document.getElementById('vault').scrollIntoView()); await sleep(1200); await L.screenshot({ path: `${SHOTS}/launch-landing-vault.png` });
  await L.evaluate(() => document.getElementById('found').scrollIntoView()); await sleep(800); await L.screenshot({ path: `${SHOTS}/launch-landing-found.png` });

  wander = false; bots.forEach(b => b.ws.close()); r1.ws.close(); r2.ws.close();
  const allErrs = [...A.errs, ...B.errs, ...lerr];
  ok('no console errors', allErrs.length === 0, allErrs.slice(0, 5).join(' | '));
  await browser.close(); await browser2.close();
  const failed = results.filter(r => !r.pass); console.log(`\n${results.length - failed.length}/${results.length} passed`); process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
