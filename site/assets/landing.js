import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BRAND, RARITY, TREASURY, SOLSCAN, applyBrand } from './config.js';
import { logoSVG, setFavicon } from './brand.js';
import { realCardCanvas, backCanvas } from './cards.js';

applyBrand(); setFavicon();
document.getElementById('navMark').innerHTML = logoSVG({ size: 38, uid: 'nm' });
document.getElementById('footMark').innerHTML = logoSVG({ size: 22, uid: 'fm' });
document.getElementById('yr').textContent = BRAND.year;
{ const w1 = document.querySelector('.hero-word .w1'), w2 = document.querySelector('.hero-word .w2');
  w1.textContent = BRAND.wordmark[0]; w2.lastChild.textContent = BRAND.wordmark[1]; }

await Promise.all([document.fonts.load('800 40px Syne'), document.fonts.load('600 20px "Geist Mono"')]).catch(() => {});

// ---------- live data (same-origin API) ----------
const esc = x => String(x ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shortA = a => a.slice(0, 4) + '…' + a.slice(-4);
const fmtSol = v => (v == null ? '—' : (v >= 100 ? v.toFixed(1) : v >= 1 ? v.toFixed(3) : v.toFixed(4)).replace(/\.?0+$/, '') + ' SOL');
document.getElementById('tAddr').textContent = shortA(TREASURY);
document.getElementById('treasury').href = SOLSCAN();
const $ = id => document.getElementById(id);
async function getJSON(u) { try { const r = await fetch(u, { cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; } }
let fanKey = '';
async function refresh() {
  const st = await getJSON('/api/state');
  const v = st?.vault;
  if (v) {
    $('vBal').textContent = fmtSol(v.balanceSol); $('vFees').textContent = fmtSol(v.totalReceivedSol); $('vSpent').textContent = fmtSol(v.spentOnPacksSol);
    $('vPacks').textContent = v.packsOpened; $('vLeft').textContent = v.cardsOnIsland; $('vFound').textContent = v.cardsFound;
    $('sCards').textContent = v.cardsOnIsland; $('sPacks').textContent = v.packsOpened; $('sFound').textContent = v.cardsFound;
    $('vUpd').textContent = v.updatedAt ? `Read from Solana mainnet · updated ${new Date(v.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : (v.rpcError || 'Reading from Solana mainnet…');
  } else $('vUpd').textContent = 'Live data unavailable right now.';
  // feed + ticker (real events only)
  const feed = st?.feed || [];
  const fl = $('feed');
  fl.innerHTML = feed.length ? feed.slice(0, 10).map(e => `<li style="--c:${RARITY[e.rarity]?.color || '#7dffc1'}"><span class="pk ${e.type}"></span><span class="meta"><b>${esc(e.text)}</b><span>${e.type === 'drop' ? `${esc(e.pack || 'Pack')}${e.costSol ? ' · ' + e.costSol + ' SOL' : ''}` : 'Found'} · ${new Date(e.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></span></li>`).join('')
    : '<li class="empty"><span class="meta"><b>First drop incoming</b><span>When the first real pack is opened, its cards show up here and on the island at the same moment.</span></span></li>';
  const items = feed.length ? feed.slice(0, 14).map(e => `<span><i>${e.type === 'found' ? 'FOUND' : 'DROPPED'}</i> <b>${esc(e.text)}</b></span>`).join('')
    : '<span><b>FIRST DROP INCOMING</b> <i>· real cards · one island · find it, keep it</i></span>'.repeat(4);
  $('ticker').innerHTML = items + items;
  // fan of live cards
  const recent = st?.recent || []; const key = recent.map(r => r.card.name + r.droppedAt).join('|');
  if (key !== fanKey || !fan.children.length) { fanKey = key; await renderFan(recent); }
  $('fanNote').textContent = recent.length ? `${v?.cardsOnIsland ?? recent.length} real card${(v?.cardsOnIsland ?? recent.length) === 1 ? '' : 's'} hidden on the island right now.` : 'First drop incoming. No cards on the island yet. When we open a pack, the cards land live.';
  // found log
  const fj = await getJSON('/api/finds'); const finds = fj?.finds || [];
  $('flist').innerHTML = finds.length ? finds.slice(0, 12).map(f => `<div class="fitem" style="--c:${RARITY[f.card.rarity].color}">${f.card.image ? `<img src="${esc(f.card.image)}" alt="">` : '<span class="ph"></span>'}<div><b>${esc(f.card.name)}</b><span>${RARITY[f.card.rarity].label}${f.card.set ? ' · ' + esc(f.card.set) : ''}</span><span>Found by ${esc(f.name)} · ${esc(f.wallet)}</span></div><em class="st">${esc(f.status)}</em></div>`).join('')
    : '<div class="fempty"><b>No finds yet</b><span>The first real card is still out there.</span></div>';
}
const fan = document.getElementById('fan');
async function renderFan(recent) {
  fan.innerHTML = '';
  const list = recent.length ? await Promise.all(recent.slice(0, 5).map(r => realCardCanvas(r.card, 520).then(c => ({ c, color: RARITY[r.card.rarity].color })))) : [0, 1, 2].map(() => ({ c: backCanvas(520), color: '#7dffc1' }));
  const n = list.length, mid = (n - 1) / 2;
  list.forEach(({ c, color }, i) => {
    const k = i - mid;
    const base = `translateX(${k * 190}px) translateY(${Math.abs(k) * 26}px) rotate(${k * 7}deg)`;
    c.style.transform = base; c.style.zIndex = 10 - Math.abs(k) * 2; c.style.setProperty('--g', color);
    c.onmouseenter = () => c.style.transform = `translateX(${k * 190}px) translateY(${Math.abs(k) * 26 - 40}px) rotate(${k * 4}deg) scale(1.06)`;
    c.onmouseleave = () => c.style.transform = base;
    fan.appendChild(c);
  });
}
await refresh();
setInterval(refresh, 30000);

// ---------- hero 3D ----------
const canvas = document.getElementById('heroGL');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
const scene = new THREE.Scene();
const fogC = new THREE.Color('#0a2524');
scene.fog = new THREE.FogExp2(fogC, 0.014);
const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 400);
camera.position.set(0, 4.2, 22);

// sky dome
const sky = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 16), new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { t: { value: 0 } },
  vertexShader: `varying vec3 vP0; void main(){ vP0 = position; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
  fragmentShader: `varying vec3 vP0; uniform float t;
    void main(){ vec3 vP = normalize(vP0); float h = vP.y; vec3 top = vec3(.02,.06,.07); vec3 mid = vec3(.05,.2,.2); vec3 fogc = vec3(.039,.145,.141);
      float sd = max(0., dot(normalize(vec3(vP.x,0.,vP.z)), normalize(vec3(.55,0.,-1.))));
      vec3 hor = mix(fogc, vec3(.55,.36,.22), pow(sd, 6.));
      vec3 c = mix(mid, top, smoothstep(.05,.6,h)); c = mix(hor, c, smoothstep(0.,.25,h)); if (h < 0.) c = fogc;
      float sun = smoothstep(.985,1.,dot(vP, normalize(vec3(.55,.12,-1.)))); c += vec3(1.,.8,.5)*sun*.9;
      c += vec3(1.,.7,.4)*pow(max(0.,dot(vP, normalize(vec3(.55,.12,-1.)))),18.)*.18;
      gl_FragColor = vec4(c,1.); }`
}));
scene.add(sky);

// stars
{ const g = new THREE.BufferGeometry(); const n = 700, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, y = 0.25 + Math.random() * 0.75, r = 180; p[i * 3] = Math.cos(a) * r * Math.sqrt(1 - y * y); p[i * 3 + 1] = y * r; p[i * 3 + 2] = Math.sin(a) * r * Math.sqrt(1 - y * y); }
  g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 0.9, color: 0xcff, transparent: true, opacity: .7, fog: false }))); }

// ocean
const ocean = new THREE.Mesh(new THREE.PlaneGeometry(400, 400, 1, 1), new THREE.ShaderMaterial({
  transparent: false, fog: true,
  uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { t: { value: 0 } }]),
  vertexShader: `varying vec3 vW;
#include <fog_pars_vertex>
    void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = w.xyz; vec4 mvPosition = viewMatrix*w; gl_Position = projectionMatrix*mvPosition;
#include <fog_vertex>
    }`,
  fragmentShader: `uniform float t; varying vec3 vW;
#include <fog_pars_fragment>
    float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5); }
    void main(){ vec2 p = vW.xz*.35; float w = sin(p.x*1.3+t*.8)*.5+sin(p.y*1.7-t*.6+p.x*.4)*.5;
      vec3 c = mix(vec3(.01,.08,.09), vec3(.03,.2,.2), w*.5+.5);
      vec2 g = abs(fract(vW.xz*.5)-.5); float grid = smoothstep(.48,.5,max(g.x,g.y));
      c += vec3(.25,1.,.75)*grid*.08;
      float glint = pow(max(0., sin(p.x*3.+t*1.7)*sin(p.y*2.3-t*1.1)), 24.);
      c += vec3(1.,.75,.45)*glint*smoothstep(-40.,-120.,vW.z)*.9;
      gl_FragColor = vec4(c,1.);
#include <fog_fragment>
    }`,
}));
ocean.rotation.x = -Math.PI / 2; ocean.position.y = -2; scene.add(ocean);

// lights
scene.add(new THREE.HemisphereLight(0x9fe7ff, 0x0b1f1c, 0.9));
const sun = new THREE.DirectionalLight(0xffd2a0, 2.2); sun.position.set(10, 12, -10); scene.add(sun);
const rim = new THREE.PointLight(0x7dffc1, 30, 30); rim.position.set(6, 3, 4); scene.add(rim);

// floating island chunk (right side)
const island = new THREE.Group(); island.position.set(10.5, -0.3, 0); scene.add(island);
{ const rockG = new THREE.ConeGeometry(4.2, 5.5, 9, 3); rockG.rotateX(Math.PI); const pa = rockG.attributes.position;
  for (let i = 0; i < pa.count; i++) { pa.setXYZ(i, pa.getX(i) * (1 + (Math.random() - .5) * .25), pa.getY(i) + (Math.random() - .5) * .3, pa.getZ(i) * (1 + (Math.random() - .5) * .25)); }
  rockG.computeVertexNormals();
  const rock = new THREE.Mesh(rockG, new THREE.MeshStandardMaterial({ color: 0x3a3f3a, flatShading: true, roughness: .95 })); rock.position.y = -2.75; island.add(rock);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(4.3, 4.2, .6, 9), new THREE.MeshStandardMaterial({ color: 0x4fbf6a, flatShading: true })); island.add(top);
  const sand = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.4, .25, 9), new THREE.MeshStandardMaterial({ color: 0xf2d9a0, flatShading: true })); sand.position.y = -.3; island.add(sand);
  // palm
  const palm = new THREE.Group(); palm.position.set(-1.6, .3, -.6); island.add(palm);
  for (let i = 0; i < 7; i++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(.16 - i * .01, .19 - i * .01, .6, 6), new THREE.MeshStandardMaterial({ color: 0x8a6440, flatShading: true })); s.position.set(i * i * .02, .3 + i * .55, 0); s.rotation.z = -i * .05; palm.add(s); }
  for (let i = 0; i < 7; i++) { const f = new THREE.Mesh(new THREE.ConeGeometry(.35, 2.6, 4), new THREE.MeshStandardMaterial({ color: 0x2fae5a, flatShading: true })); f.geometry.translate(0, 1.3, 0); f.scale.z = .25; const a = i / 7 * Math.PI * 2; f.position.set(.75, 3.9, 0); f.rotation.set(0, a, 1.9); palm.add(f); }
  // ruin pillars
  for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + .4; const h = 1 + Math.random() * 1.4; const pl = new THREE.Mesh(new THREE.BoxGeometry(.45, h, .45), new THREE.MeshStandardMaterial({ color: 0xd8d2bf, flatShading: true })); pl.position.set(Math.cos(a) * 2.6 + .8, h / 2 + .3, Math.sin(a) * 2.6); island.add(pl); }
  // a little Packling
  const crit = new THREE.Mesh(new THREE.IcosahedronGeometry(.55, 1), new THREE.MeshStandardMaterial({ color: 0x7dffc1, flatShading: true })); crit.position.set(1.2, .85, 1.8); crit.scale.y = .9; island.add(crit);
  for (const sx of [-1, 1]) { const e = new THREE.Mesh(new THREE.SphereGeometry(.09, 8, 8), new THREE.MeshBasicMaterial({ color: 0x07110f })); e.position.set(1.2 + sx * .2, .98, 2.3); island.add(e);
    const ear = new THREE.Mesh(new THREE.ConeGeometry(.12, .7, 5), new THREE.MeshStandardMaterial({ color: 0x7dffc1, flatShading: true })); ear.position.set(1.2 + sx * .22, 1.6, 1.8); ear.rotation.z = -sx * .2; island.add(ear); }
  island.userData.crit = crit;
}

// hero cards with beams
const heroCards = [];
const texOf = c => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
const backTex = texOf(backCanvas(512));
const heroColors = [0xffc94a, 0xa98bff, 0x7dffc1];
heroColors.forEach((col, i) => {
  const g = new THREE.Group();
  const geo = new THREE.PlaneGeometry(2.2, 3.08);
  const front = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: backTex, transparent: true, side: THREE.DoubleSide, fog: false, toneMapped: false }));
  g.add(front);
  const edge = new THREE.Mesh(new THREE.PlaneGeometry(2.32, 3.2), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .9, side: THREE.DoubleSide, fog: false, toneMapped: false })); edge.position.z = -0.01; g.add(edge);
  scene.add(g);
  heroCards.push({ g, i, base: new THREE.Vector3(10.5 + Math.cos(i * 2.1) * 3.4, 4.2 + i * .9, Math.sin(i * 2.1) * 2.4) });
});
// beam from island
const beam = new THREE.Mesh(new THREE.CylinderGeometry(.6, .6, 40, 24, 1, true), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  uniforms: { t: { value: 0 } },
  vertexShader: `varying vec2 u; void main(){u=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
  fragmentShader: `varying vec2 u; uniform float t; void main(){ float a = (1.-u.y)*.35 + .05; a *= .6+.4*sin(u.y*40.-t*4.); gl_FragColor = vec4(1.,.8,.3, a*(1.-u.y)); }` }));
beam.position.set(10.5, 20, 0); scene.add(beam);

// motes
const motes = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: .08, color: 0xd4ff4f, transparent: true, opacity: .85, blending: THREE.AdditiveBlending, depthWrite: false }));
{ const n = 260, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { p[i * 3] = 10.5 + (Math.random() - .5) * 18; p[i * 3 + 1] = Math.random() * 12 - 1; p[i * 3 + 2] = (Math.random() - .5) * 14; } motes.geometry.setAttribute('position', new THREE.BufferAttribute(p, 3)); }
scene.add(motes);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.45, 0.5, 0.92); composer.addPass(bloom);
composer.addPass(new OutputPass());

function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h;
  camera.position.x = w < 900 ? 6 : 0; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
const mouse = { x: 0, y: 0 }; addEventListener('pointermove', e => { mouse.x = e.clientX / innerWidth - .5; mouse.y = e.clientY / innerHeight - .5; });
const clock = new THREE.Clock(); let visible = true;
new IntersectionObserver(([e]) => visible = e.isIntersecting).observe(canvas);
function loop() {
  requestAnimationFrame(loop); if (!visible) return;
  const t = clock.getElapsedTime();
  ocean.material.uniforms.t.value = t; beam.material.uniforms.t.value = t;
  heroCards.forEach(({ g, i, base }) => {
    const a = t * .25 + i * 2.1;
    g.position.set(10.5 + Math.cos(a) * 3.6, base.y + Math.sin(t * 1.2 + i) * .25, Math.sin(a) * 2.6);
    g.rotation.y = -a + Math.PI / 2 + Math.sin(t * .7 + i) * .3; g.rotation.z = Math.sin(t * .9 + i) * .08;
  });
  island.position.y = -0.3 + Math.sin(t * .6) * .15; island.rotation.y = t * .05;
  island.userData.crit.position.y = .85 + Math.abs(Math.sin(t * 3)) * .25;
  motes.rotation.y = t * .03; motes.position.y = Math.sin(t * .3) * .3;
  camera.position.y += ((4.2 - mouse.y * 1.6) - camera.position.y) * .04;
  const tx = (canvas.clientWidth < 900 ? 6 : 0) + mouse.x * 2.2; camera.position.x += (tx - camera.position.x) * .04;
  camera.lookAt(5.5, 3.4, 0);
  composer.render();
}
loop();
