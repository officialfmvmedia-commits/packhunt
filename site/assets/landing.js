import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { BRAND, RARITY, TREASURY, SOLSCAN, applyBrand } from './config.js';
import { logoSVG, setFavicon } from './brand.js';
import { realCardCanvas, backCanvas } from './cards.js';
import { createHeroIsland } from './heroIsland.js';

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
      vec3 sd3 = normalize(vec3(.62,.045,-1.)); float sdot = max(0.,dot(vP, sd3)); float sun = smoothstep(.99935,.9997,sdot); c += vec3(1.,.78,.5)*sun*.75;
      c += vec3(1.,.62,.35)*pow(sdot,60.)*.22 + vec3(1.,.6,.35)*pow(sdot,8.)*.05;
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

// lights: warm key sun (shadows) + low warm rim from the horizon sun + teal sky fill
const WATER_Y = -0.7;
scene.add(new THREE.HemisphereLight(0xb8f4ff, 0x1a4a3a, 1.5));
const sun = new THREE.DirectionalLight(0xffdcb0, 3.2); sun.position.set(10.5 - 9, 14, 10); sun.target.position.set(10.5, 0, 0); scene.add(sun, sun.target);
sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024); Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -9, near: 1, far: 40 }); sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.03;
const rim = new THREE.DirectionalLight(0xffa860, 1.6); rim.position.set(10.5 + 8, 4, -14); rim.target.position.set(10.5, 0, 0); scene.add(rim, rim.target);
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
ocean.position.y = WATER_Y;

// hero island (stylized low-poly, see heroIsland.js)
const backTex = (() => { const t = new THREE.CanvasTexture(backCanvas(512)); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; })();
const hero = createHeroIsland(scene, { backTex, waterY: WATER_Y }); hero.root.position.set(10.5, WATER_Y, 1); hero.root.scale.setScalar(1.12);

// motes
const motes = new THREE.Points(new THREE.BufferGeometry(), new THREE.PointsMaterial({ size: .06, color: 0xd4ff4f, transparent: true, opacity: .6, blending: THREE.AdditiveBlending, depthWrite: false }));
{ const n = 160, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { p[i * 3] = 10.5 + (Math.random() - .5) * 18; p[i * 3 + 1] = Math.random() * 10 + .5; p[i * 3 + 2] = (Math.random() - .5) * 14; } motes.geometry.setAttribute('position', new THREE.BufferAttribute(p, 3)); }
scene.add(motes);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.45, 0.5, 0.92); composer.addPass(bloom);
composer.addPass(new OutputPass());

// camera framing: desktop keeps the island to the right of the copy; narrow/portrait screens pull back and centre it low
let frame;
function framing(w, h) {
  if (w >= 900) return { x: 0, y: 4.2, z: 22, look: new THREE.Vector3(5.5, 3.4, 0), par: 1 };
  const portrait = h > w;
  return portrait ? { x: 10.5, y: 5.6, z: 44, look: new THREE.Vector3(10.5, 10.8, 0), par: .3 } : { x: 6, y: 4.2, z: 24, look: new THREE.Vector3(7.5, 3.4, 0), par: .5 };
}
function resize() {
  const w = canvas.clientWidth, h = canvas.clientHeight;
  renderer.setSize(w, h, false); composer.setSize(w, h); camera.aspect = w / h;
  frame = framing(w, h); camera.position.set(frame.x, frame.y, frame.z); camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();
const mouse = { x: 0, y: 0 }; addEventListener('pointermove', e => { mouse.x = e.clientX / innerWidth - .5; mouse.y = e.clientY / innerHeight - .5; });
const clock = new THREE.Clock(); let visible = true;
new IntersectionObserver(([e]) => visible = e.isIntersecting).observe(canvas);
function loop() {
  requestAnimationFrame(loop); if (!visible) return;
  const t = clock.getElapsedTime();
  ocean.material.uniforms.t.value = t;
  hero.update(t, camera);
  motes.rotation.y = t * .03; motes.position.y = Math.sin(t * .3) * .3;
  camera.position.y += ((frame.y - mouse.y * 1.6 * frame.par) - camera.position.y) * .04;
  camera.position.x += ((frame.x + mouse.x * 2.2 * frame.par) - camera.position.x) * .04;
  camera.lookAt(frame.look);
  composer.render();
}
loop();
