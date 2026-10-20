// Stylized low-poly hero island for the landing page (landing only; the game world lives in game/world.js).
import * as THREE from 'three';

const rnd = (() => { let s = 1337; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;

// irregular coastline
const R0 = 4.7;
const outline = th => R0 * (1 + .13 * Math.sin(2 * th + .6) + .08 * Math.sin(3 * th + 1.9) + .05 * Math.sin(5 * th + .4) + .025 * Math.sin(9 * th + 2.2));
// terrain height for polar coords (rho normalised to the coastline)
function heightAt(rho, th) {
  const hills = .32 * Math.sin(th * 2 + 1.1) * Math.cos(rho * 5.2) + .22 * Math.sin(th * 3 - .7 + rho * 3) + .55 * Math.exp(-((th - 4.3) ** 2) * 1.2) * (1 - rho * 1.2);
  const plateau = 1.05 + hills * sstep(.75, .1, rho);
  const beach = lerp(.32, .03, sstep(.8, 1.0, rho));
  let h = lerp(plateau, beach, sstep(.56, .8, rho));
  h = lerp(h, -1.4, sstep(1.0, 1.28, rho));
  return h;
}
const C = {
  grass: new THREE.Color('#62d777'), grass2: new THREE.Color('#4cbc68'), grassHi: new THREE.Color('#8fe07a'),
  slope: new THREE.Color('#3d9a5a'), sand: new THREE.Color('#f3dca4'), sand2: new THREE.Color('#e6c98c'),
  wet: new THREE.Color('#bfae80'), under: new THREE.Color('#3fb7a6'),
};
function terrainColor(rho, h, th) {
  const n = Math.sin(th * 13.1 + rho * 17.3) * .5 + .5;
  if (rho > 1.0) return C.under.clone().lerp(C.wet, .25);
  if (rho > .95 || h < .1) return C.wet.clone().lerp(C.sand2, .4);
  if (rho > .72) return C.sand.clone().lerp(C.sand2, n * .6);
  if (rho > .65) return C.slope.clone().lerp(C.grass2, n * .5);
  const c = C.grass.clone().lerp(C.grass2, n * .7);
  return h > 1.25 ? c.lerp(C.grassHi, .35) : c;
}

function buildTerrain() {
  const NS = 64, rings = [0, .08, .17, .26, .35, .44, .52, .6, .66, .72, .78, .84, .9, .95, 1.0, 1.06, 1.16, 1.3];
  const P = [], pos = [], col = [];
  for (let r = 0; r < rings.length; r++) { P[r] = [];
    for (let s = 0; s < NS; s++) {
      const th = (s + (r % 2) * .5) / NS * Math.PI * 2, rho = rings[r];
      const R = outline(th) * rho * (1 + (r > 0 && r < rings.length - 1 ? (rnd() - .5) * .015 : 0));
      P[r][s] = new THREE.Vector3(Math.cos(th) * R, heightAt(rho, th) + (rho > .05 && rho < .9 ? (rnd() - .5) * .04 : 0), Math.sin(th) * R);
      P[r][s].rho = rho; P[r][s].th = th;
    } }
  const tri = (a, b, c) => { pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    const rho = Math.min(a.rho, b.rho, c.rho) + .001, h = (a.y + b.y + c.y) / 3, th = Math.atan2(a.z + b.z + c.z, a.x + b.x + c.x);
    const k = terrainColor(rho, h, th); for (let i = 0; i < 3; i++) col.push(k.r, k.g, k.b); };
  const center = new THREE.Vector3(0, heightAt(0, 0), 0); center.rho = 0;
  for (let s = 0; s < NS; s++) tri(center, P[1][(s + 1) % NS], P[1][s]);
  for (let r = 1; r < rings.length - 1; r++) for (let s = 0; s < NS; s++) {
    const a = P[r][s], b = P[r][(s + 1) % NS], c = P[r + 1][s], d = P[r + 1][(s + 1) % NS];
    if (r % 2) { tri(a, b, d); tri(a, d, c); } else { tri(a, b, c); tri(b, d, c); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .9 }));
  m.receiveShadow = true; m.castShadow = true; return m;
}
const surfaceY = (x, z) => { const th = Math.atan2(z, x); return heightAt(Math.hypot(x, z) / outline(th), th); };
const polar = (rho, th) => { const R = outline(th) * rho; return [Math.cos(th) * R, Math.sin(th) * R]; };

// shallow lagoon + animated foam ring hugging the coastline
function buildShore() {
  const NS = 96, mk = (r0, r1, steps) => { const pos = [], v = [], a = [], idx = [];
    for (let i = 0; i <= steps; i++) { const k = i / steps, rho = lerp(r0, r1, k);
      for (let s = 0; s <= NS; s++) { const th = s / NS * Math.PI * 2, R = outline(th) * rho; pos.push(Math.cos(th) * R, 0, Math.sin(th) * R); v.push(k); a.push(th); } }
    for (let i = 0; i < steps; i++) for (let s = 0; s < NS; s++) { const p = i * (NS + 1) + s, q = p + NS + 1; idx.push(p, q, p + 1, p + 1, q, q + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('k', new THREE.Float32BufferAttribute(v, 1)); g.setAttribute('ang', new THREE.Float32BufferAttribute(a, 1)); g.setIndex(idx); return g; };
  const vs = `attribute float k; attribute float ang; varying float vk; varying float va; void main(){ vk=k; va=ang; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
  const lagoon = new THREE.Mesh(mk(.96, 1.75, 8), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { t: { value: 0 } }, vertexShader: vs,
    fragmentShader: `varying float vk; varying float va; uniform float t; void main(){ float a = pow(1.-vk, 1.6)*.72; vec3 c = mix(vec3(.36,.95,.86), vec3(.08,.45,.45), vk);
      c += .05*sin(va*20.+t*1.3+vk*9.); gl_FragColor = vec4(c, a); }` }));
  lagoon.position.y = .01;
  const foam = new THREE.Mesh(mk(.97, 1.07, 3), new THREE.ShaderMaterial({ transparent: true, depthWrite: false, uniforms: { t: { value: 0 } }, vertexShader: vs,
    fragmentShader: `varying float vk; varying float va; uniform float t; void main(){ float band = smoothstep(0.,.25,vk)*smoothstep(1.,.45,vk);
      float w = .55+.45*sin(va*14.-t*1.6)*sin(va*5.+t*.7); float edge = smoothstep(.5+.25*sin(va*9.+t*1.2),.2,vk);
      gl_FragColor = vec4(vec3(.93,1.,.97), band*(.35+.55*w)*max(edge,.35)); }` }));
  foam.position.y = .025;
  return { lagoon, foam };
}

function frondGeo(L, W, droop) {
  const N = 9, pos = [];
  const pt = (k, side) => { const s = k / N, x = s * L, y = .55 * s * L * .5 - droop * s * s * L * .5;
    const w = W * Math.pow(Math.sin(Math.PI * Math.min(1, s * 1.05 + .02)), .7) * (1 - s * .35);
    return side === 0 ? [x, y + w * .05, 0] : [x - w * .15, y - w * .45, side * w]; };
  for (let k = 0; k < N; k++) for (const side of [-1, 1]) {
    const a = pt(k, 0), b = pt(k + 1, 0), c = pt(k, side), d = pt(k + 1, side);
    if (side > 0) pos.push(...a, ...c, ...b, ...b, ...c, ...d); else pos.push(...a, ...b, ...c, ...b, ...d, ...c);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals(); return g;
}
const M = {
  trunkA: new THREE.MeshStandardMaterial({ color: 0x9a7048, flatShading: true, roughness: .95 }),
  trunkB: new THREE.MeshStandardMaterial({ color: 0x7c5734, flatShading: true, roughness: .95 }),
  frondA: new THREE.MeshStandardMaterial({ color: 0x3fbf5f, flatShading: true, side: THREE.DoubleSide, roughness: .8 }),
  frondB: new THREE.MeshStandardMaterial({ color: 0x2ea052, flatShading: true, side: THREE.DoubleSide, roughness: .8 }),
  nut: new THREE.MeshStandardMaterial({ color: 0x5b3b20, flatShading: true }),
  rock: new THREE.MeshStandardMaterial({ color: 0x7d8c86, flatShading: true, roughness: .95 }),
  rock2: new THREE.MeshStandardMaterial({ color: 0x5e6e6a, flatShading: true, roughness: .95 }),
  bush: new THREE.MeshStandardMaterial({ color: 0x2f9a55, flatShading: true }),
  bush2: new THREE.MeshStandardMaterial({ color: 0x48b866, flatShading: true }),
  wood: new THREE.MeshStandardMaterial({ color: 0xa57a4f, flatShading: true, roughness: .9 }),
  wood2: new THREE.MeshStandardMaterial({ color: 0x7a5636, flatShading: true, roughness: .9 }),
};
function palm(h, lean, yaw) {
  const g = new THREE.Group(); g.rotation.y = yaw;
  const p0 = new THREE.Vector3(0, 0, 0), p1 = new THREE.Vector3(lean * .15, h * .55, 0), p2 = new THREE.Vector3(lean, h, 0);
  const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2), N = 10, up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < N; i++) { const a = curve.getPoint(i / N), b = curve.getPoint((i + 1) / N), len = a.distanceTo(b);
    const r = lerp(.24, .13, i / N);
    const seg = new THREE.Mesh(new THREE.CylinderGeometry(r * .92, r * 1.08, len * 1.04, 7), i % 2 ? M.trunkA : M.trunkB);
    seg.position.copy(a).lerp(b, .5); seg.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize()); seg.castShadow = true; g.add(seg); }
  const crown = new THREE.Group(); crown.position.copy(p2); g.add(crown);
  const nF = 9;
  for (let i = 0; i < nF; i++) { const f = new THREE.Mesh(frondGeo(2.1 + rnd() * .45, .4, 1.5 + rnd() * .6), i % 2 ? M.frondA : M.frondB);
    f.rotation.set(0, i / nF * Math.PI * 2 + rnd() * .3, (rnd() - .3) * .25); f.castShadow = true; crown.add(f); }
  for (let i = 0; i < 3; i++) { const n = new THREE.Mesh(new THREE.IcosahedronGeometry(.16, 0), M.nut); const a = i / 3 * Math.PI * 2; n.position.set(Math.cos(a) * .2, -.18, Math.sin(a) * .2); crown.add(n); }
  g.userData.crown = crown; return g;
}
function rock(s, mat) { const geo = new THREE.DodecahedronGeometry(s, 0); const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * (1 + (rnd() - .5) * .35), p.getY(i) * (.7 + rnd() * .3), p.getZ(i) * (1 + (rnd() - .5) * .35));
  geo.computeVertexNormals(); const m = new THREE.Mesh(geo, mat); m.rotation.y = rnd() * 6; m.castShadow = m.receiveShadow = true; return m; }

function creature() {
  const g = new THREE.Group();
  const mint = new THREE.MeshStandardMaterial({ color: 0x7dffc1, flatShading: true, roughness: .6, emissive: 0x1d6b4a, emissiveIntensity: .7 });
  const belly = new THREE.MeshStandardMaterial({ color: 0xe9fff3, flatShading: true });
  const dark = new THREE.MeshBasicMaterial({ color: 0x07110f }), white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(.5, 1), mint); body.scale.set(1, .9, .95); body.position.y = .45; body.castShadow = true; g.add(body);
  const b2 = new THREE.Mesh(new THREE.IcosahedronGeometry(.32, 1), belly); b2.position.set(0, .38, .26); b2.scale.set(1, .9, .5); g.add(b2);
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(.085, 10, 8), dark); e.position.set(sx * .17, .58, .43); g.add(e);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(.03, 6, 6), white); hl.position.set(sx * .17 + .03, .62, .5); g.add(hl);
    const ear = new THREE.Mesh(new THREE.ConeGeometry(.13, .55, 5), mint); ear.position.set(sx * .24, .98, -.02); ear.rotation.z = -sx * .35; ear.castShadow = true; g.add(ear);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(.07, .2, 5), new THREE.MeshStandardMaterial({ color: 0xffc94a, flatShading: true })); tip.position.set(sx * .3, 1.2, -.02); tip.rotation.z = -sx * .35; g.add(tip);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(.13, 8, 6), mint); foot.scale.set(1, .6, 1.3); foot.position.set(sx * .22, .06, .1); g.add(foot);
    const ch = new THREE.Mesh(new THREE.CircleGeometry(.06, 10), new THREE.MeshBasicMaterial({ color: 0xff8fa8, transparent: true, opacity: .7 })); ch.position.set(sx * .3, .48, .44); ch.rotation.y = sx * .5; g.add(ch);
  }
  const tail = new THREE.Mesh(new THREE.ConeGeometry(.12, .5, 5), mint); tail.position.set(0, .35, -.5); tail.rotation.x = -1.1; g.add(tail);
  return g;
}

function glowTex(inner, outer) { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  const gr = x.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, inner); gr.addColorStop(.35, outer); gr.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = gr; x.fillRect(0, 0, 128, 128); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }

export function createHeroIsland(scene, { backTex, waterY }) {
  const root = new THREE.Group(); root.position.y = waterY; scene.add(root);
  const island = new THREE.Group(); root.add(island);
  island.add(buildTerrain());
  const { lagoon, foam } = buildShore(); root.add(lagoon); root.add(foam);

  const palms = [];
  for (const [rho, th, h, lean, yaw] of [[.58, 3.75, 3.3, 1.0, .25], [.66, 3.15, 2.6, .9, -.3], [.66, .1, 2.9, 1.0, .15]]) {
    const [x, z] = polar(rho, th); const p = palm(h, lean, -th + yaw); p.position.set(x, surfaceY(x, z) - .05, z); island.add(p); palms.push(p); }
  // rocks: shoreline + a little stack in the water
  for (const [rho, th, s, m] of [[.93, 1.2, .55, 0], [.98, 1.45, .35, 1], [1.05, 5.4, .7, 0], [1.12, 5.65, .4, 1], [.88, 4.7, .5, 1], [1.1, 4.45, .45, 0], [.66, 5.0, .6, 0], [.6, 5.25, .4, 1], [1.4, .9, .6, 0], [1.46, 1.05, .35, 1]]) {
    const [x, z] = polar(rho, th); const r = rock(s, m ? M.rock2 : M.rock); r.position.set(x, Math.max(surfaceY(x, z), -.15) + s * .25, z); island.add(r); }
  // bushes + flowers on the grass
  for (const [rho, th] of [[.55, .55], [.5, 4.2], [.3, 5.4], [.55, 2.6], [.35, 3.4]]) {
    const [x, z] = polar(rho, th); const cl = new THREE.Group(); cl.position.set(x, surfaceY(x, z), z); island.add(cl);
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.IcosahedronGeometry(.3 + rnd() * .2, 0), i % 2 ? M.bush : M.bush2); b.position.set((rnd() - .5) * .6, .2, (rnd() - .5) * .6); b.scale.y = .8; b.castShadow = true; cl.add(b); }
    for (let i = 0; i < 2; i++) { const f = new THREE.Mesh(new THREE.IcosahedronGeometry(.07, 0), new THREE.MeshBasicMaterial({ color: i ? 0xffc94a : 0xff9fbf })); f.position.set((rnd() - .5) * .9, .42, (rnd() - .5) * .9); cl.add(f); }
  }
  // little dock
  { const th = 2.35, [x0, z0] = polar(.82, th), dock = new THREE.Group(); dock.position.set(x0, .3, z0); dock.rotation.y = -th; island.add(dock);
    for (let i = 0; i < 9; i++) { const pl = new THREE.Mesh(new THREE.BoxGeometry(.32, .08, 1.2), i % 2 ? M.wood : M.wood2); pl.position.set(i * .36, 0, 0); pl.rotation.y = (rnd() - .5) * .05; pl.castShadow = pl.receiveShadow = true; dock.add(pl); }
    for (const px of [.6, 1.7, 2.8]) for (const pz of [-.55, .55]) { const po = new THREE.Mesh(new THREE.CylinderGeometry(.07, .08, 1.2, 6), M.wood2); po.position.set(px, -.35, pz); dock.add(po); }
    const lamp = new THREE.Mesh(new THREE.IcosahedronGeometry(.1, 1), new THREE.MeshBasicMaterial({ color: 0xffd47a, toneMapped: false })); lamp.position.set(2.8, .75, .55); dock.add(lamp);
    const lp = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .7, 5), M.wood2); lp.position.set(2.8, .35, .55); dock.add(lp); }
  // creature
  const crit = creature(); { const [x, z] = polar(.46, 1.95); crit.position.set(x, surfaceY(x, z), z); crit.userData.y0 = crit.position.y; crit.rotation.y = Math.PI / 2 - 1.95; crit.scale.setScalar(1.15); island.add(crit); }

  // hovering pack
  const pack = new THREE.Group(); root.add(pack);
  const gold = new THREE.MeshStandardMaterial({ color: 0xffc94a, metalness: .7, roughness: .3, emissive: 0x6a4a10, emissiveIntensity: .6 });
  const face = new THREE.MeshBasicMaterial({ map: backTex, toneMapped: false });
  const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 2.38, .2), [gold, gold, gold, gold, face, face]); pack.add(body);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.84, 2.52, .14), new THREE.MeshBasicMaterial({ color: 0xffd36a, toneMapped: false })); pack.add(frame);
  for (const sy of [-1, 1]) { const cr = new THREE.Mesh(new THREE.BoxGeometry(1.78, .2, .1, 14, 1, 1), gold); const p = cr.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) if (p.getY(i) * sy > 0) p.setY(i, p.getY(i) + (Math.round((p.getX(i) + .89) / 1.78 * 14) % 2 ? .05 : -.02) * sy);
    cr.geometry.computeVertexNormals(); cr.position.y = sy * 1.27; pack.add(cr); }
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex('rgba(255,225,140,1)', 'rgba(255,190,70,.35)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .55, fog: false }));
  glow.scale.set(6.5, 6.5, 1); root.add(glow);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32), new THREE.MeshBasicMaterial({ map: glowTex('rgba(255,210,110,.9)', 'rgba(255,190,70,.25)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: .45 }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = heightAt(0, 0) + .06; island.add(pool);
  const packLight = new THREE.PointLight(0xffc56a, 14, 9, 1.6); root.add(packLight);
  // sparkles orbiting the pack
  const sp = new THREE.BufferGeometry(); { const n = 60, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const a = rnd() * 6.283, r = 1.3 + rnd() * 1.4; p[i * 3] = Math.cos(a) * r; p[i * 3 + 1] = (rnd() - .5) * 2.6; p[i * 3 + 2] = Math.sin(a) * r; } sp.setAttribute('position', new THREE.BufferAttribute(p, 3)); }
  const sparkles = new THREE.Points(sp, new THREE.PointsMaterial({ size: .07, color: 0xffe08a, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, depthWrite: false })); root.add(sparkles);

  const PACK_Y = 4.6;
  const tmp = new THREE.Vector3();
  function update(t, camera) {
    island.rotation.y = Math.sin(t * .12) * .35 - .1;
    lagoon.rotation.y = foam.rotation.y = island.rotation.y;
    lagoon.material.uniforms.t.value = foam.material.uniforms.t.value = t;
    const y = PACK_Y + Math.sin(t * 1.1) * .22;
    pack.position.set(0, y, 0); glow.position.set(0, y, -.3); packLight.position.set(0, y - 1.2, .6); sparkles.position.set(0, y, 0);
    tmp.copy(camera.position); root.worldToLocal(tmp); tmp.y = y;
    pack.lookAt(tmp); pack.rotateY(Math.sin(t * .6) * .45); pack.rotateZ(Math.sin(t * .8) * .06);
    sparkles.rotation.y = t * .3; glow.material.opacity = .45 + Math.sin(t * 2) * .08;
    pool.material.opacity = .35 + Math.sin(t * 1.1) * .08;
    crit.position.y = crit.userData.y0 + Math.abs(Math.sin(t * 2.6)) * .28; crit.scale.y = 1.15 - Math.max(0, -Math.sin(t * 2.6 * 2)) * .04;
    palms.forEach((p, i) => { p.userData.crown.rotation.z = Math.sin(t * 1.3 + i) * .04; p.userData.crown.rotation.x = Math.sin(t * 1.1 + i * 2) * .03; });
  }
  return { root, update };
}
