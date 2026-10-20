import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BRAND, RARITY, TREASURY, SOLSCAN, CLAIM, applyBrand } from '../config.js';
import { logoSVG, setFavicon } from '../brand.js';
import { cardCanvas, realCardCanvas, backCanvas, drawCreature } from '../cards.js';
import { WORLD, LANDMARKS, heightAt } from '../terrain.js';
import { wallet, getSession, setVerified, connectAndSign, disconnect as disconnectWallet, getProvider, onWallet, short } from '../wallet.js';
import * as audio from '../audio.js';
import { buildWorld, colliders } from './world.js';
import { makeAvatar, randomColor } from './avatar.js';
import { Creatures } from './creatures.js';
import { Drops } from './drops.js';
import { Net } from './net.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
applyBrand(); setFavicon();
$('hudMark').innerHTML = logoSVG({ size: 40, uid: 'hm' });
$('startMark').innerHTML = logoSVG({ size: 92, uid: 'sm' });
document.querySelector('.start h1').innerHTML = `<span>${esc(BRAND.wordmark[0])}</span><span class="g">${esc(BRAND.wordmark[1])}</span>`;
document.title = `Play · ${BRAND.name}`;
const isTouch = matchMedia('(pointer: coarse)').matches;
const claimHowHTML = () => CLAIM.contact
  ? `To get your card, message <a href="${esc(CLAIM.contact)}" target="_blank" rel="noopener">${esc(CLAIM.contactLabel)}</a> with your shipping or delivery details. We confirm it's you by asking you to sign a message with this same wallet. We will never ask for your seed phrase or a transaction.`
  : `We'll post claim instructions on ${esc(CLAIM.contactLabel)}. To confirm it's you, we'll ask you to sign a message with this same wallet. We will never ask for your seed phrase or a transaction. You can track the status in the Found log.`;

// ---------- identity ----------
const NAME_KEY = 'ph.name', COLOR_KEY = 'ph.color';
let myName = localStorage.getItem(NAME_KEY) || ('hunter' + Math.floor(1000 + Math.random() * 9000));
let myColor = +(localStorage.getItem(COLOR_KEY) || randomColor());
$('nameIn').value = myName;
const net = new Net();
let authMsg = null;

// ---------- renderer ----------
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
let pixelRatio = Math.min(devicePixelRatio, 1.5);
renderer.setPixelRatio(pixelRatio);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.3, 2500);
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.55, 0.45, 0.86);
composer.addPass(bloom); composer.addPass(new OutputPass());
function resize() { renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight); bloom.resolution.set(innerWidth / 2, innerHeight / 2); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();

// ---------- loading ----------
const setLoad = (p, t) => { $('loadBar').style.width = p + '%'; $('loadText').textContent = t; };
const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
$('enterBtn').disabled = true;
await Promise.all([document.fonts.load('800 40px Syne'), document.fonts.load('600 20px "Geist Mono"')]).catch(() => {});
setLoad(15, 'Raising the island…'); await frame();
const world = buildWorld(scene, renderer);
setLoad(55, 'Waking up the Packlings…'); await frame();
const creatures = new Creatures(scene, 34);
const drops = new Drops(scene);
const player = makeAvatar(myColor); scene.add(player);
player.position.set(12, WORLD.plaza.h + 0.1, 0);
setLoad(85, 'Compiling shaders…'); await frame();
renderer.compile(scene, camera);
setLoad(100, 'Ready.'); $('enterBtn').disabled = false; $('loading').style.opacity = .5;

// ---------- toasts / announcements ----------
function toast(html, color) {
  const el = document.createElement('div'); el.className = 'toast'; el.innerHTML = html; if (color) el.style.setProperty('--c', color);
  $('toasts').prepend(el); setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 450); }, 5200);
  while ($('toasts').children.length > 5) $('toasts').lastChild.remove();
}
let annT = null;
function announce(kicker, text, color) {
  const a = $('announce'); a.style.setProperty('--c', color || '#7dffc1'); $('anK').textContent = kicker; $('anT').textContent = text;
  a.classList.remove('hidden'); a.style.animation = 'none'; void a.offsetWidth; a.style.animation = '';
  clearTimeout(annT); annT = setTimeout(() => a.classList.add('hidden'), 7000);
}

// ---------- wallet ----------
let myFinds = null, binderMode = 'mine';
onWallet(w => {
  const t = w.pubkey ? short(w.pubkey) + ' ✓' : 'Connect Phantom';
  $('walletText').textContent = t; $('startWalletText').textContent = t;
  $('walletBtn').classList.toggle('on', !!w.pubkey); $('startWallet').classList.toggle('on', !!w.pubkey);
  refreshBinderCount();
});
async function walletClick() {
  if (wallet.pubkey) { if (!confirm(`Disconnect ${short(wallet.pubkey)}?`)) return; net.logout(); await disconnectWallet(); toast('Wallet disconnected'); return; }
  if (!getProvider()) { $('noPhantom').classList.remove('hidden'); return; }
  if (!net.live || !authMsg) { toast('Connecting to the island first. Try again in a second.', '#ff7a59'); return; }
  const r = await connectAndSign(authMsg);
  if (r.error) { toast(r.error === 'no-sign' ? 'This wallet can’t sign messages.' : 'Wallet sign-in cancelled', '#ff7a59'); return; }
  net.auth(r.pubkey, r.signature);
}
$('walletBtn').onclick = walletClick; $('startWallet').onclick = walletClick;
$('npClose').onclick = () => $('noPhantom').classList.add('hidden');

// ---------- vault + feed ----------
const fmtSol = v => (v == null ? '—' : (v >= 100 ? v.toFixed(1) : v >= 1 ? v.toFixed(3) : v.toFixed(4)).replace(/\.?0+$/, '') + ' SOL');
let vault = null;
$('vTreasury').textContent = short(TREASURY); $('vTreasury').href = SOLSCAN();
function renderVault() {
  if (!vault) return;
  $('vBal').textContent = fmtSol(vault.balanceSol); $('vFees').textContent = fmtSol(vault.totalReceivedSol);
  $('vSpent').textContent = fmtSol(vault.spentOnPacksSol); $('vPacks').textContent = vault.packsOpened;
  $('vLeft').textContent = drops.map.size; $('vFound').textContent = vault.cardsFound;
  $('vUpdated').textContent = vault.updatedAt ? `Read from Solana mainnet · updated ${new Date(vault.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : (vault.rpcError || 'Reading from Solana mainnet…');
}
async function fetchVault() { try { const r = await fetch('/api/vault', { cache: 'no-store' }); if (r.ok) { vault = await r.json(); renderVault(); } } catch {} }
const feedEl = $('vFeed');
function feedItem(ev, isNew) {
  feedEl.querySelector('.empty')?.remove();
  const li = document.createElement('li'); if (isNew) li.className = 'new';
  const c = RARITY[ev.rarity]?.color || '#7dffc1'; li.style.setProperty('--c', c);
  li.innerHTML = `<span class="dotr"></span><span class="ev">${ev.type === 'found' ? '★ ' : '⬇ '}${esc(ev.text)}</span>`;
  feedEl.prepend(li); while (feedEl.children.length > 8) feedEl.lastChild.remove();
}
function feedEmpty() { if (!feedEl.children.length) feedEl.innerHTML = '<li class="empty">First drop incoming. Real cards land here the moment they’re pulled.</li>'; }
async function fetchFeed() { try { const r = await fetch('/api/feed'); const j = await r.json(); feedEl.innerHTML = ''; j.feed.slice(0, 8).reverse().forEach(e => feedItem(e, false)); } catch {} feedEmpty(); }
$('vaultToggle').onclick = () => { $('vaultPanel').classList.toggle('collapsed'); $('vaultToggle').textContent = $('vaultPanel').classList.contains('collapsed') ? '+' : '–'; };
if (isTouch) $('vaultPanel').classList.add('collapsed');
setInterval(fetchVault, 60000);

// ---------- network ----------
const remotes = new Map();
function addRemote(p) {
  if (remotes.has(p.id)) { const r = remotes.get(p.id); if (p.name && p.name !== r.name) { r.name = p.name; r.av.userData.setName(p.name); } return r; }
  const av = makeAvatar(p.color ?? 0x9fe7ff, p.name || 'hunter'); av.visible = false; scene.add(av);
  const r = { id: p.id, name: p.name, av, tgt: new THREE.Vector3(), ry: 0, anim: 0, seen: 0, fresh: true }; remotes.set(p.id, r); return r;
}
function removeRemote(id) { const r = remotes.get(id); if (!r) return; scene.remove(r.av); remotes.delete(id); }
let online = 1;
const STATUS = { connecting: ['CONNECTING…', ''], live: ['LIVE', 'live'], reconnecting: ['RECONNECTING…', 'warn'], full: ['ISLAND FULL', 'warn'] };
net.on('status', (s, extra) => {
  const [txt, cls] = STATUS[s] || [s, ''];
  $('netText').textContent = txt; $('netDot').className = 'dot ' + cls;
  const showConn = started && s !== 'live';
  $('conn').classList.toggle('hidden', !showConn);
  if (s === 'reconnecting') $('connText').textContent = `Connection lost. Reconnecting${extra ? ' in ' + extra + 's' : ''}…`;
  if (s === 'full') $('connText').textContent = extra || 'Island is full. Retrying…';
  if (s === 'connecting') $('connText').textContent = 'Connecting to the island…';
});
net.on('welcome', m => {
  for (const id of [...remotes.keys()]) removeRemote(id);
  m.players.forEach(addRemote); online = m.online; $('online').textContent = online;
  drops.clear(); m.drops.forEach(d => drops.add(d));
  authMsg = m.authMsg;
  if (m.wallet) setVerified(m.wallet); else if (wallet.pubkey) setVerified(null);
  if (!spawned) { spawned = true; player.position.set(m.spawn.x, m.spawn.y, m.spawn.z); camTarget.copy(player.position); }
  else net.sendPos(posMsg());
  fetchVault(); fetchFeed(); renderVault();
  if (!welcomed) { welcomed = true; toast(drops.map.size ? `<b>${drops.map.size} real card${drops.map.size > 1 ? 's are' : ' is'}</b> hidden on the island. Follow the beams.` : 'No cards on the island yet. <b>First drop incoming</b>. Stay tuned.'); }
});
let spawned = false, welcomed = false;
net.on('s', m => {
  const now = performance.now();
  for (const [id, x, y, z, ry, anim] of m.p) { const r = remotes.get(id) || addRemote({ id, name: 'hunter' }); r.tgt.set(x, y, z); r.ry = ry; r.anim = anim; if (r.fresh || !r.av.visible) { r.av.position.set(x, y, z); r.fresh = false; } r.av.visible = true; r.seen = now; }
  if (m.n !== undefined) { online = m.n; $('online').textContent = online; }
});
net.on('pm', m => addRemote(m.p));
net.on('leave', m => removeRemote(m.id));
net.on('correct', m => { player.position.set(m.x, m.y, m.z); vel.set(0, 0, 0); });
net.on('authOk', m => { authMsg = m.authMsg; setVerified(m.wallet, m.session); toast(`Wallet <b>${short(m.wallet)}</b> verified. You can claim cards now.`, '#ab9ff2'); });
net.on('authFail', m => { if (m.authMsg) authMsg = m.authMsg; toast('Wallet verification failed. Please try again.', '#ff7a59'); });
net.on('authOut', m => { authMsg = m.authMsg; });
net.on('drop', m => {
  m.drops.forEach(d => drops.add(d));
  const c = RARITY[m.event.rarity]?.color;
  announce(m.drops.length > 1 ? 'PACK OPENED · NEW DROPS' : 'NEW DROP', m.event.text, c);
  feedItem(m.event, true); renderVault(); fetchVault(); audio.blip('rare');
  // point the compass at the best new drop
  const best = drops.map.get(m.drops[0].dropId); if (best) { hintTarget = best; hintUntil = performance.now() + 120000; }
});
net.on('found', m => {
  const o = drops.remove(m.dropId, true);
  if (hintTarget?.d.dropId === m.dropId) hintTarget = null;
  feedItem(m.event, true); fetchVault();
  if (o) { const c = RARITY[m.card.rarity]; toast(`<b>${esc(m.name)}</b> (${esc(m.wallet)}) found <b style="color:${c.color}">${esc(m.card.name)}</b>`, c.color); }
  renderVault();
});
net.on('removed', m => { drops.remove(m.dropId, true); renderVault(); });
net.on('vault', m => { vault = m.vault; renderVault(); });
net.on('fulfil', () => { if (!$('binder').classList.contains('hidden')) renderBinderView(binderMode); });
const posMsg = () => ({ x: +player.position.x.toFixed(2), y: +player.position.y.toFixed(2), z: +player.position.z.toFixed(2), ry: +player.rotation.y.toFixed(3), a: Math.hypot(vel.x, vel.z) > .5 ? 1 : 0 });

// ---------- start ----------
let started = false;
net.start(() => ({ name: myName, color: myColor, session: getSession()?.session }));
$('enterBtn').onclick = () => {
  myName = ($('nameIn').value || '').replace(/[^\w .\-#@]/g, '').slice(0, 18).trim() || myName;
  localStorage.setItem(NAME_KEY, myName); localStorage.setItem(COLOR_KEY, myColor);
  $('start').classList.add('hidden'); $('hud').classList.remove('hidden'); started = true;
  if (net.status !== 'live') net.emit('status', net.status);
  net.send({ t: 'name', name: myName, color: myColor });
};
$('nameIn').addEventListener('keydown', e => { if (e.key === 'Enter') $('enterBtn').click(); e.stopPropagation(); });

// ---------- input ----------
const keys = new Set();
const cam = { yaw: Math.PI, pitch: 0.32, dist: 13, tYaw: Math.PI, tPitch: 0.32, tDist: 13 };
const uiOpen = () => !$('reveal').classList.contains('hidden') || !$('binder').classList.contains('hidden') || !$('start').classList.contains('hidden');
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  const k = e.key.toLowerCase();
  if (k === 'tab' || k === 'i') { e.preventDefault(); toggleBinder('mine'); return; }
  if (k === 'f') { toggleBinder('found'); return; }
  if (k === 'escape') { closeDialog(); $('binder').classList.add('hidden'); $('bdZoom').classList.add('hidden'); if (!$('reveal').classList.contains('hidden')) closeReveal(); return; }
  if (!$('reveal').classList.contains('hidden') && (k === ' ' || k === 'enter' || k === 'e')) { e.preventDefault(); closeReveal(); return; }
  if (k === 'm') { soundToggle(); return; }
  if (k === 'e') { interact(); return; }
  if (k === ' ') e.preventDefault();
  keys.add(k);
});
addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
let drag = null;
canvas.addEventListener('pointerdown', e => { if (isTouch && e.clientX < innerWidth * .45) return; drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); canvas.classList.add('drag'); });
canvas.addEventListener('pointermove', e => { if (!drag || drag.id !== e.pointerId) return; cam.tYaw -= (e.clientX - drag.x) * .005; cam.tPitch = Math.max(-.15, Math.min(1.25, cam.tPitch + (e.clientY - drag.y) * .004)); drag.x = e.clientX; drag.y = e.clientY; });
const endDrag = e => { if (drag && drag.id === e.pointerId) { drag = null; canvas.classList.remove('drag'); } };
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('wheel', e => { cam.tDist = Math.max(5, Math.min(30, cam.tDist + e.deltaY * .01)); e.preventDefault(); }, { passive: false });
const stick = { x: 0, y: 0, id: null };
if (isTouch) {
  const st = $('stick'), kn = $('knob');
  const move = e => { const r = st.getBoundingClientRect(); let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2); const l = Math.hypot(dx, dy), m = 50; if (l > m) { dx *= m / l; dy *= m / l; } stick.x = dx / m; stick.y = dy / m; kn.style.transform = `translate(${dx}px,${dy}px)`; };
  st.addEventListener('pointerdown', e => { stick.id = e.pointerId; st.setPointerCapture(e.pointerId); move(e); });
  st.addEventListener('pointermove', e => { if (e.pointerId === stick.id) move(e); });
  const end = () => { stick.id = null; stick.x = stick.y = 0; kn.style.transform = ''; };
  st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
  $('tJump').addEventListener('pointerdown', () => { keys.add(' '); setTimeout(() => keys.delete(' '), 120); });
  $('tAct').addEventListener('pointerdown', () => interact());
}
function soundToggle() { const on = audio.toggle(); $('soundBtn').innerHTML = `♪<i>${on ? 'ON' : 'OFF'}</i>`; }
$('soundBtn').onclick = soundToggle;
$('binderBtn').onclick = () => toggleBinder('mine');
$('foundBtn').onclick = () => toggleBinder('found');

// ---------- player physics ----------
const vel = new THREE.Vector3(); let onGround = true, swimming = false, coyote = 0;
function groundHeight(x, z, y) {
  let g = heightAt(x, z);
  if (Math.hypot(x - WORLD.plaza.x, z - WORLD.plaza.z) < WORLD.plaza.r) g = Math.max(g, WORLD.plaza.h + 0.1);
  for (const c of colliders) if (c.top < 99 && Math.hypot(x - c.x, z - c.z) < c.r && y >= c.top - .4) g = Math.max(g, c.top);
  return g;
}
function collide(p) {
  for (const c of colliders) {
    if (c.top < 99 && p.y >= c.top - .4) continue;
    const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), r = c.r + .45;
    if (d < r && d > 1e-4) { p.x = c.x + dx / d * r; p.z = c.z + dz / d * r; }
  }
  const R = Math.hypot(p.x, p.z); if (R > 300) { p.x *= 300 / R; p.z *= 300 / R; }
}
function updatePlayer(dt) {
  let ix = 0, iz = 0;
  if (!uiOpen() && !dialogOpen) {
    if (keys.has('w') || keys.has('arrowup')) iz += 1; if (keys.has('s') || keys.has('arrowdown')) iz -= 1;
    if (keys.has('a') || keys.has('arrowleft')) ix -= 1; if (keys.has('d') || keys.has('arrowright')) ix += 1;
    if (stick.id !== null) { ix += stick.x; iz -= stick.y; }
  }
  const len = Math.hypot(ix, iz); if (len > 1) { ix /= len; iz /= len; }
  const fwd = new THREE.Vector3(-Math.sin(cam.yaw), 0, -Math.cos(cam.yaw)), right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  const sprint = keys.has('shift') || (stick.id !== null && Math.hypot(stick.x, stick.y) > .92);
  const maxS = swimming ? 4.2 : sprint ? 13 : 7.5;
  const want = fwd.multiplyScalar(iz).add(right.multiplyScalar(ix)).multiplyScalar(maxS);
  const acc = onGround || swimming ? 12 : 3;
  vel.x += (want.x - vel.x) * Math.min(1, acc * dt); vel.z += (want.z - vel.z) * Math.min(1, acc * dt);
  const p = player.position;
  if (keys.has(' ') && (onGround || coyote > 0) && !swimming) { vel.y = 10.5; onGround = false; coyote = 0; }
  vel.y -= 26 * dt;
  p.x += vel.x * dt; p.z += vel.z * dt; p.y += vel.y * dt;
  collide(p);
  const g = groundHeight(p.x, p.z, p.y);
  swimming = g < -1.1;
  if (swimming) { const sy = -1.05 + Math.sin(performance.now() / 400) * .08; if (p.y < sy) { p.y = sy; vel.y = Math.max(0, vel.y); } onGround = false; }
  else if (p.y <= g) { p.y = g; vel.y = 0; onGround = true; coyote = .12; }
  else { if (onGround && p.y - g < .6 && vel.y <= 0) { p.y = g; vel.y = 0; } else { onGround = false; coyote -= dt; } }
  const sp = Math.hypot(vel.x, vel.z);
  if (sp > .3) { const yaw = Math.atan2(vel.x, vel.z); let d = yaw - player.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); player.rotation.y += d * Math.min(1, dt * 12); }
  player.userData.animate(dt, sp, !onGround && !swimming);
  if (celebrateT > 0) { celebrateT -= dt; player.userData.celebrate(performance.now() / 1000); }
}
let celebrateT = 0;

// ---------- camera ----------
const camTarget = new THREE.Vector3();
function updateCamera(dt) {
  const k = 1 - Math.exp(-dt * 10);
  cam.yaw += (cam.tYaw - cam.yaw) * k; cam.pitch += (cam.tPitch - cam.pitch) * k; cam.dist += (cam.tDist - cam.dist) * k;
  camTarget.lerp(new THREE.Vector3(player.position.x, player.position.y + 2.2, player.position.z), 1 - Math.exp(-dt * 14));
  const cp = Math.cos(cam.pitch);
  const pos = new THREE.Vector3(camTarget.x + Math.sin(cam.yaw) * cp * cam.dist, camTarget.y + Math.sin(cam.pitch) * cam.dist, camTarget.z + Math.cos(cam.yaw) * cp * cam.dist);
  const gh = Math.max(heightAt(pos.x, pos.z), 0) + 1.2; if (pos.y < gh) pos.y = gh;
  camera.position.copy(pos); camera.lookAt(camTarget);
}


// ---------- interaction ----------
let dialogOpen = false, hintTarget = null, hintUntil = 0;
const dirName = a => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI / 4)) % 8];
function bearing(from, to) { return Math.atan2(to.x - from.x, -(to.z - from.z)); }
function interact() {
  if (!started || uiOpen()) return;
  if (dialogOpen) { closeDialog(); return; }
  const near = drops.nearest(player.position, 2.6);
  if (near) { tryClaim(near); return; }
  const c = creatures.nearest(player.position, 4.5);
  if (c) openDialog(c);
}
function openDialog(c) {
  const r = creatures.interact(c, player.position);
  dialogOpen = true; audio.blip('talk');
  const pc = $('dlgPortrait'), x = pc.getContext('2d'); x.clearRect(0, 0, 180, 180); drawCreature(x, c.id, 90, 92, .95);
  $('dlgName').textContent = r.name;
  const close = drops.closestTo(c.mesh.position);
  let sub = drops.map.size ? r.blurb : 'No cards on the island right now. When the vault opens a pack, the cards land here instantly.';
  if (close) {
    const dir = dirName(bearing(c.mesh.position, close.o.d)); const m = Math.max(5, Math.round(close.d / 5) * 5);
    sub = `✦ Tip: I saw a ${RARITY[close.o.card.rarity].label.toLowerCase()} card land about ${m}m ${dir} of here. I marked it on your compass.`;
    hintTarget = close.o; hintUntil = performance.now() + 90000;
  }
  $('dlgSub').textContent = sub; typeLine(r.line);
  $('dialog').classList.remove('hidden');
}
let typeTimer = null;
function typeLine(s) { clearInterval(typeTimer); let i = 0; $('dlgLine').textContent = ''; typeTimer = setInterval(() => { $('dlgLine').textContent = s.slice(0, ++i); if (i >= s.length) clearInterval(typeTimer); }, 18); }
function closeDialog() { dialogOpen = false; $('dialog').classList.add('hidden'); }
const claiming = new Set(); let lastWalletNag = 0;
async function tryClaim(o) {
  if (claiming.has(o.d.dropId)) return;
  if (!wallet.pubkey) { if (performance.now() - lastWalletNag > 4000) { lastWalletNag = performance.now(); toast('Connect and verify <b>Phantom</b> to claim this card', '#ab9ff2'); } return; }
  claiming.add(o.d.dropId);
  const res = await net.claim(o.d.dropId);
  setTimeout(() => claiming.delete(o.d.dropId), 1600);
  if (res.ok) {
    drops.remove(o.d.dropId, true); renderVault();
    if (hintTarget?.d.dropId === o.d.dropId) hintTarget = null;
    myFinds = null; refreshBinderCount();
    showReveal(res.card, res.find);
  } else {
    const why = { 'already-claimed': 'Someone got there first!', 'wallet-required': 'Verify your wallet to claim.', 'too-far': 'Get a little closer to the card.', cooldown: null, timeout: 'The server didn’t respond. Try again.', offline: 'You’re offline. Reconnecting…', disconnected: 'Connection dropped. Reconnecting…', 'unknown-drop': 'That card is gone.' }[res.reason];
    if (why) toast(why, '#ff7a59');
    if (res.reason === 'already-claimed' || res.reason === 'unknown-drop') drops.remove(o.d.dropId, true);
  }
}

// ---------- reveal ----------
async function showReveal(card, find) {
  const R = RARITY[card.rarity]; const el = $('reveal');
  el.style.setProperty('--rc', R.color);
  $('rvRarity').textContent = R.label; $('rvName').textContent = card.name;
  $('rvSub').textContent = `Winner: ${short(find.wallet)} · Fulfilment: ${find.status}`;
  $('rvHow').innerHTML = `This is a <b>real card</b>, and your wallet is now on record as the finder. ${claimHowHTML()}`;
  $('rvBack').innerHTML = ''; $('rvFront').innerHTML = '';
  $('rvBack').appendChild(backCanvas(600));
  const f = await realCardCanvas(card, 600); $('rvFront').appendChild(f);
  const flip = $('flip'); flip.style.animation = 'none'; void flip.offsetWidth; flip.style.animation = '';
  el.classList.remove('hidden'); closeDialog(); celebrateT = 2.5;
  audio.blip(card.rarity === 'common' ? 'pick' : 'rare');
  setTimeout(() => confetti(R.color, card.rarity), 1050);
}
function confetti(color, rarity) {
  const n = { common: 30, rare: 50, epic: 80, legendary: 140 }[rarity];
  const cols = [color, '#f4f1e6', '#ffc94a', '#7dffc1'];
  for (let i = 0; i < n; i++) {
    const d = document.createElement('div'); d.className = 'burst'; d.style.background = cols[i % cols.length];
    d.style.left = innerWidth / 2 + 'px'; d.style.top = innerHeight * .45 + 'px'; document.body.appendChild(d);
    const a = Math.random() * Math.PI * 2, v = 200 + Math.random() * 420;
    d.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 }, { transform: `translate(${Math.cos(a) * v}px, ${Math.sin(a) * v + 160}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }], { duration: 1200 + Math.random() * 900, easing: 'cubic-bezier(.1,.8,.3,1)' }).onfinish = () => d.remove();
  }
}
function closeReveal() { $('reveal').classList.add('hidden'); }
$('rvOk').onclick = closeReveal;

// ---------- binder (my finds) + public found log ----------
async function loadMyFinds() {
  if (!wallet.pubkey) return [];
  try { const r = await fetch('/api/binder?wallet=' + encodeURIComponent(wallet.pubkey), { cache: 'no-store' }); myFinds = r.ok ? (await r.json()).finds : []; } catch { myFinds = []; }
  return myFinds;
}
async function refreshBinderCount() { $('binderCount').textContent = (await loadMyFinds()).length; }
function toggleBinder(mode) {
  const el = $('binder');
  if (!el.classList.contains('hidden') && binderMode === mode) { el.classList.add('hidden'); return; }
  if (!$('start').classList.contains('hidden')) return;
  binderMode = mode; el.classList.remove('hidden'); closeDialog(); renderBinderView(mode);
}
const statusLabel = s => ({ pending: 'Pending', contacted: 'Contacted', shipped: 'Shipped', sent: 'Sent', delivered: 'Delivered', cancelled: 'Cancelled' }[s] || s);
async function renderBinderView(mode) {
  const grid = $('bdGrid'); grid.innerHTML = '';
  if (mode === 'found') {
    $('bdKicker').textContent = 'PUBLIC FOUND LOG'; $('bdTitle').textContent = 'Found cards';
    $('bdOwner').textContent = 'Every real card that’s been found, with the finder’s wallet (shortened) and fulfilment status.';
    $('bdHow').innerHTML = `How it works: the first verified wallet to reach a card wins it. The server records the claim. ${claimHowHTML()}`;
    let finds = []; try { finds = (await (await fetch('/api/finds', { cache: 'no-store' })).json()).finds; } catch {}
    if (!finds.length) { grid.innerHTML = '<div class="bd-empty"><b>No finds yet</b>The first real card is still waiting for its hunter.</div>'; return; }
    const t = document.createElement('table'); t.className = 'flog'; t.style.gridColumn = '1 / -1';
    t.innerHTML = '<tr><th>Card</th><th>Rarity</th><th>Finder</th><th>When</th><th>Fulfilment</th></tr>' + finds.map(f => `<tr><td>${f.card.image ? `<img class="thumb" src="${esc(f.card.image)}" alt="">` : ''}<b>${esc(f.card.name)}</b>${f.card.set ? `<br><span style="opacity:.55">${esc(f.card.set)}</span>` : ''}</td><td class="r" style="--c:${RARITY[f.card.rarity].color}">${RARITY[f.card.rarity].label}</td><td>${esc(f.name)}<br><span style="opacity:.55">${esc(f.wallet)}</span></td><td>${new Date(f.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td><td class="stt">${statusLabel(f.status)}</td></tr>`).join('');
    grid.appendChild(t); return;
  }
  $('bdKicker').textContent = 'MY FINDS'; $('bdTitle').textContent = 'Your binder';
  $('bdHow').innerHTML = wallet.pubkey ? claimHowHTML() : '';
  if (!wallet.pubkey) { $('bdOwner').textContent = ''; grid.innerHTML = '<div class="bd-empty"><b>Connect Phantom</b>Your finds are tied to your verified wallet. Connect to see them.</div>'; return; }
  $('bdOwner').textContent = `Wallet ${short(wallet.pubkey)} · verified by signature · records kept by the ${BRAND.name} server`;
  const finds = await loadMyFinds(); $('binderCount').textContent = finds.length;
  if (!finds.length) { grid.innerHTML = `<div class="bd-empty"><b>No finds yet</b>${drops.map.size ? `${drops.map.size} real card${drops.map.size > 1 ? 's are' : ' is'} on the island right now. Go get one.` : 'No cards on the island right now. First drop incoming.'}</div>`; return; }
  for (const f of finds) {
    const R = RARITY[f.card.rarity]; const s = document.createElement('div'); s.className = 'slot owned'; s.style.setProperty('--c', R.color);
    const cv = await realCardCanvas(f.card, 320); s.appendChild(cv);
    const st = document.createElement('span'); st.className = 'st ' + f.status; st.textContent = statusLabel(f.status); s.appendChild(st);
    s.title = f.note || '';
    s.onclick = async () => { const z = $('bdZoom'); z.innerHTML = ''; z.style.setProperty('--c', R.color); z.appendChild(await realCardCanvas(f.card, 600)); z.classList.remove('hidden'); z.onclick = () => z.classList.add('hidden'); };
    grid.appendChild(s);
  }
}
$('bdClose').onclick = () => $('binder').classList.add('hidden');

// ---------- compass ----------
function updateCompass() {
  const W = Math.min(420, $('compass').clientWidth || 420), ppr = 260;
  const fwdB = Math.atan2(-Math.sin(cam.yaw), Math.cos(cam.yaw));
  const items = [];
  [['N', 0], ['NE', Math.PI / 4], ['E', Math.PI / 2], ['SE', 3 * Math.PI / 4], ['S', Math.PI], ['SW', -3 * Math.PI / 4], ['W', -Math.PI / 2], ['NW', -Math.PI / 4]].forEach(([t, b]) => items.push({ t, b, cls: '' }));
  LANDMARKS.forEach(L => items.push({ t: '▲ ' + L.name.split(' ').pop().toUpperCase(), b: bearing(player.position, L), cls: 'lm' }));
  if (hintTarget && performance.now() < hintUntil && drops.has(hintTarget.d.dropId)) {
    const d = Math.hypot(hintTarget.d.x - player.position.x, hintTarget.d.z - player.position.z);
    items.push({ t: `◆ ${Math.round(d)}m`, b: bearing(player.position, hintTarget.d), cls: 'card', c: RARITY[hintTarget.card.rarity].color });
  }
  $('ctrack').innerHTML = items.map(it => { let d = it.b - fwdB; d = Math.atan2(Math.sin(d), Math.cos(d)); if (Math.abs(d) > 1) return ''; return `<span class="${it.cls}" style="left:${W / 2 + d * ppr}px;${it.c ? '--c:' + it.c : ''}">${it.t}</span>`; }).join('');
}

// ---------- minimap ----------
const mm = $('minimap'), mx = mm.getContext('2d'); const MM = 220, MR = 270;
const mmBase = (() => {
  const c = document.createElement('canvas'); c.width = c.height = MM; const x = c.getContext('2d'); const img = x.createImageData(MM, MM);
  for (let j = 0; j < MM; j++) for (let i = 0; i < MM; i++) {
    const wx = (i / MM - .5) * 2 * MR, wz = (j / MM - .5) * 2 * MR, h = heightAt(wx, wz); const o = (j * MM + i) * 4;
    let r, g, b;
    if (h < -6) [r, g, b] = [14, 70, 98]; else if (h < 0) [r, g, b] = [40, 150, 160]; else if (h < 2.2) [r, g, b] = [230, 210, 160]; else if (h < 28) { const k = h / 28; [r, g, b] = [100 - k * 40, 190 - k * 50, 100 - k * 20]; } else [r, g, b] = [160, 156, 145];
    const sh = h > 0 ? (heightAt(wx - 2, wz - 2) - h) * 6 : 0; img.data[o] = r - sh; img.data[o + 1] = g - sh; img.data[o + 2] = b - sh; img.data[o + 3] = 255;
  }
  x.putImageData(img, 0, 0); return c;
})();
const w2m = (x, z) => [(x / MR / 2 + .5) * MM, (z / MR / 2 + .5) * MM];
function drawMinimap(t) {
  mx.clearRect(0, 0, MM, MM); mx.save(); mx.beginPath(); mx.arc(MM / 2, MM / 2, MM / 2, 0, 7); mx.clip();
  mx.drawImage(mmBase, 0, 0);
  // plaza
  let [px, pz] = w2m(0, 0); mx.strokeStyle = '#ffc94a'; mx.lineWidth = 2; mx.beginPath(); mx.arc(px, pz, 5, 0, 7); mx.stroke();
  mx.fillStyle = 'rgba(7,17,15,.8)'; LANDMARKS.forEach(L => { const [a, b] = w2m(L.x, L.z); mx.beginPath(); mx.moveTo(a, b - 5); mx.lineTo(a + 4, b + 3); mx.lineTo(a - 4, b + 3); mx.fill(); });
  remotes.forEach(r => { if (!r.av.visible) return; const [a, b] = w2m(r.av.position.x, r.av.position.z); mx.fillStyle = '#fff'; mx.beginPath(); mx.arc(a, b, 3, 0, 7); mx.fill(); });
  creatures.list.forEach(c => { const [a, b] = w2m(c.mesh.position.x, c.mesh.position.z); mx.fillStyle = c.sp.body; mx.fillRect(a - 1.5, b - 1.5, 3, 3); });
  if (hintTarget && drops.has(hintTarget.d.dropId) && performance.now() < hintUntil) { const [a, b] = w2m(hintTarget.d.x, hintTarget.d.z); mx.strokeStyle = RARITY[hintTarget.card.rarity].color; mx.lineWidth = 2; mx.beginPath(); mx.arc(a, b, 4 + (t * 8 % 8), 0, 7); mx.stroke(); }
  [px, pz] = w2m(player.position.x, player.position.z);
  mx.translate(px, pz); mx.rotate(-player.rotation.y + Math.PI);
  mx.fillStyle = '#7dffc1'; mx.strokeStyle = '#07110f'; mx.lineWidth = 2; mx.beginPath(); mx.moveTo(0, -8); mx.lineTo(6, 6); mx.lineTo(0, 3); mx.lineTo(-6, 6); mx.closePath(); mx.stroke(); mx.fill();
  mx.restore();
  // view cone ring
  mx.strokeStyle = 'rgba(125,255,193,.5)'; mx.lineWidth = 2; mx.beginPath(); mx.arc(MM / 2, MM / 2, MM / 2 - 1, 0, 7); mx.stroke();
  mx.fillStyle = '#f4f1e6'; mx.font = '700 12px "Geist Mono"'; mx.textAlign = 'center'; mx.fillText('N', MM / 2, 16);
}


// ---------- prompt ----------
function updatePrompt() {
  const p = $('prompt');
  if (!started || uiOpen() || dialogOpen) { p.classList.add('hidden'); return; }
  const d = drops.nearest(player.position, 2.6);
  if (d) {
    if (wallet.pubkey) { tryClaim(d); p.classList.add('hidden'); return; }
    $('promptText').innerHTML = `Real <b style="color:${RARITY[d.card.rarity].color}">${RARITY[d.card.rarity].label}</b> card · connect Phantom to claim it`; p.classList.remove('hidden'); return;
  }
  const c = creatures.nearest(player.position, 4.5);
  if (c) { $('promptText').innerHTML = `Talk to <b>${c.sp.name}</b>`; p.classList.remove('hidden'); return; }
  p.classList.add('hidden');
}

// ---------- remote interpolation ----------
function updateRemotes(dt) {
  remotes.forEach(r => {
    if (!r.av.visible) return;
    const p = r.av.position; const before = p.clone();
    p.lerp(r.tgt, 1 - Math.exp(-dt * 10));
    let d = r.ry - r.av.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); r.av.rotation.y += d * Math.min(1, dt * 10);
    const sp = before.distanceTo(p) / Math.max(dt, 1e-3);
    r.av.userData.animate(dt, sp, p.y - heightAt(p.x, p.z) > .8 && p.y > .5);
    if (r.av.visible && performance.now() - r.seen > 1500) r.av.visible = false; // out of interest range
  });
}

// ---------- perf: adaptive resolution ----------
let fpsAcc = 0, fpsN = 0, fpsT = 0;
function adapt(dt) {
  fpsAcc += dt; fpsN++; fpsT += dt;
  if (fpsT > 2) { const fps = fpsN / fpsAcc; fpsAcc = fpsN = fpsT = 0;
    if (fps < 45 && pixelRatio > .75) { pixelRatio = Math.max(.75, pixelRatio - .25); renderer.setPixelRatio(pixelRatio); composer.setPixelRatio(pixelRatio); }
    else if (fps > 58 && pixelRatio < Math.min(devicePixelRatio, 1.5)) { pixelRatio = Math.min(Math.min(devicePixelRatio, 1.5), pixelRatio + .25); renderer.setPixelRatio(pixelRatio); composer.setPixelRatio(pixelRatio); }
  }
}


// ---------- loop ----------
const clock = new THREE.Clock(); let sendT = 0, uiT = 0;
function idleCam(t) { const a = t * .06; camera.position.set(Math.cos(a) * 60, 34, Math.sin(a) * 60); camera.lookAt(0, 8, 0); }
function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 1 / 20), t = clock.elapsedTime;
  if (started) { updatePlayer(dt); updateCamera(dt); } else idleCam(t);
  world.update(dt, t, player.position);
  creatures.update(dt, t, player.position);
  drops.update(dt, t, camera.position);
  updateRemotes(dt);
  sendT += dt; if (started && sendT > .1) { sendT = 0; net.sendPos(posMsg()); }
  uiT += dt; if (started && uiT > 1 / 20) { uiT = 0; updateCompass(); drawMinimap(t); updatePrompt(); $('coords').textContent = `${Math.round(player.position.x)} · ${Math.round(player.position.z)} · ${drops.map.size ? drops.map.size + (drops.map.size === 1 ? ' CARD' : ' CARDS') + ' ON ISLAND' : 'FIRST DROP INCOMING'}`; }
  composer.render();
  adapt(dt);
}
loop();
fetchVault(); fetchFeed();

// debug hooks (read-only helpers + camera control; movement is still validated by the server)
window.__ph = {
  look(yaw, pitch, dist) { cam.yaw = cam.tYaw = yaw; if (pitch != null) cam.pitch = cam.tPitch = pitch; if (dist) cam.dist = cam.tDist = dist; },
  drops: () => [...drops.map.values()].map(o => o.d), creatures: () => creatures.list.map(c => ({ id: c.id, x: c.mesh.position.x, z: c.mesh.position.z })),
  h: heightAt, interact, toggleBinder, get status() { return net.status; }, player, keys,
};
