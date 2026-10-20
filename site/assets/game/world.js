import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { WORLD, LANDMARKS, heightAt, fbm, mulberry32 } from '../terrain.js';

const _tni = THREE.BufferGeometry.prototype.toNonIndexed;
THREE.BufferGeometry.prototype.toNonIndexed = function () { return this.index ? _tni.call(this) : this; };

export const SKY_TOP = new THREE.Color('#3f9fe0');
export const SKY_HOR = new THREE.Color('#c9eef0');
export const SUN_DIR = new THREE.Vector3(0.45, 0.62, -0.64).normalize();

// colliders: simple circles on XZ
export const colliders = [];
const addCol = (x, z, r, top = 99) => colliders.push({ x, z, r, top });

function paint(geo, color) {
  const n = geo.attributes.position.count, c = new Float32Array(n * 3), col = new THREE.Color(color);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  geo.setAttribute('color', new THREE.BufferAttribute(c, 3)); return geo;
}
function jitter(geo, amt, rng) {
  const p = geo.attributes.position; const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!map.has(k)) map.set(k, [(rng() - .5) * amt, (rng() - .5) * amt, (rng() - .5) * amt]);
    const d = map.get(k); p.setXYZ(i, p.getX(i) + d[0], p.getY(i) + d[1], p.getZ(i) + d[2]);
  }
  geo.computeVertexNormals(); return geo;
}
const flatMat = (opts = {}) => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: .9, metalness: 0, ...opts });

export function buildWorld(scene, renderer) {
  const rng = mulberry32(7);
  const updaters = [];

  // ---------- sky ----------
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: SKY_TOP }, hor: { value: SKY_HOR }, sun: { value: SUN_DIR } },
    vertexShader: `varying vec3 vD0; void main(){ vD0 = position; vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.); gl_Position = p.xyww; }`,
    fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 sun; varying vec3 vD0;
      void main(){ vec3 vD = normalize(vD0); float h = max(vD.y, 0.); vec3 c = mix(hor, top, pow(smoothstep(0.,.55,h), .7));
        float s = max(dot(vD, sun), 0.); c += vec3(1.,.86,.62)*pow(s, 8.)*.35 + vec3(1.,.95,.8)*smoothstep(.9975,.999,s)*2.2;
        if (vD.y < 0.) c = hor;
        gl_FragColor = vec4(c,1.); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), skyMat); sky.frustumCulled = false; sky.renderOrder = -1; scene.add(sky);
  scene.fog = new THREE.Fog(SKY_HOR.clone(), 170, 700);

  // clouds
  const cloudG = []; for (let i = 0; i < 18; i++) {
    const parts = []; const n = 3 + Math.floor(rng() * 4);
    for (let j = 0; j < n; j++) { const g = new THREE.IcosahedronGeometry(8 + rng() * 10, 0); g.scale(1, .55, 1); g.translate(j * 11 - n * 5, rng() * 3, (rng() - .5) * 8); parts.push(g); }
    const g = mergeGeometries(parts); const a = rng() * Math.PI * 2, r = 380 + rng() * 300; g.translate(Math.cos(a) * r, 90 + rng() * 60, Math.sin(a) * r); cloudG.push(g);
  }
  const clouds = new THREE.Mesh(mergeGeometries(cloudG), new THREE.MeshStandardMaterial({ color: 0xffffff, flatShading: true, emissive: 0xc8e8ff, emissiveIntensity: .45, roughness: 1, fog: false }));
  scene.add(clouds); updaters.push(dt => clouds.rotation.y += dt * .004);

  // ---------- lights ----------
  scene.add(new THREE.HemisphereLight(0xcfefff, 0x5a7a45, 1.05));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.6);
  sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 400;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);

  // ---------- terrain ----------
  const S = WORLD.size, SEG = 170;
  let tg = new THREE.PlaneGeometry(S, S, SEG, SEG); tg.rotateX(-Math.PI / 2);
  const tp = tg.attributes.position;
  for (let i = 0; i < tp.count; i++) tp.setY(i, heightAt(tp.getX(i), tp.getZ(i)));
  tg = tg.toNonIndexed(); tg.computeVertexNormals();
  const P = tg.attributes.position, N = tg.attributes.normal, cols = new Float32Array(P.count * 3);
  const C = { wet: new THREE.Color('#cdb27a'), sand: new THREE.Color('#f0d9a2'), grassL: new THREE.Color('#8fd86a'), grass: new THREE.Color('#5cbd5c'), grassD: new THREE.Color('#3e9a55'), rock: new THREE.Color('#9b968a'), rockD: new THREE.Color('#6f6d66'), snow: new THREE.Color('#e9e4d6'), sea: new THREE.Color('#d8c38c'), plaza: new THREE.Color('#d9cfb6') };
  const tmp = new THREE.Color();
  for (let i = 0; i < P.count; i += 3) {
    const y = (P.getY(i) + P.getY(i + 1) + P.getY(i + 2)) / 3, x = (P.getX(i) + P.getX(i + 1) + P.getX(i + 2)) / 3, z = (P.getZ(i) + P.getZ(i + 1) + P.getZ(i + 2)) / 3;
    const ny = N.getY(i); const v = fbm(x * .05, z * .05, 2);
    if (y < -0.3) tmp.copy(C.sea).lerp(C.wet, .4);
    else if (y < 0.9) tmp.copy(C.wet).lerp(C.sand, (y + .3) / 1.2);
    else if (y < 2.4 + v * 1.5) tmp.copy(C.sand);
    else if (ny < 0.72) tmp.copy(C.rock).lerp(C.rockD, v);
    else if (y > 40) tmp.copy(C.snow);
    else if (y > 30) tmp.copy(C.rock).lerp(C.grassD, .25);
    else tmp.copy(C.grassL).lerp(C.grass, Math.min(1, y / 14)).lerp(C.grassD, Math.max(0, (y - 14) / 16) + v * .25);
    const pd = Math.hypot(x, z);
    if (pd < WORLD.plaza.r + 4 && Math.abs(y - WORLD.plaza.h) < .5) tmp.lerp(C.grassL, .3);
    const k = .94 + (rng() * .1);
    for (let j = 0; j < 3; j++) { cols[(i + j) * 3] = tmp.r * k; cols[(i + j) * 3 + 1] = tmp.g * k; cols[(i + j) * 3 + 2] = tmp.b * k; }
  }
  tg.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  const terrain = new THREE.Mesh(tg, flatMat()); terrain.receiveShadow = true; scene.add(terrain);

  // ---------- water ----------
  const HT = 256, hdata = new Uint8Array(HT * HT * 4);
  for (let j = 0; j < HT; j++) for (let i = 0; i < HT; i++) {
    const x = (i / (HT - 1) - .5) * S, z = (j / (HT - 1) - .5) * S;
    const d = Math.max(0, Math.min(1, -heightAt(x, z) / 9));
    const o = (j * HT + i) * 4; hdata[o] = d * 255; hdata[o + 1] = 0; hdata[o + 2] = 0; hdata[o + 3] = 255;
  }
  const htex = new THREE.DataTexture(hdata, HT, HT, THREE.RGBAFormat); htex.magFilter = htex.minFilter = THREE.LinearFilter; htex.needsUpdate = true;
  const waterMat = new THREE.ShaderMaterial({
    transparent: true, fog: true,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { t: { value: 0 }, depthTex: { value: null }, size: { value: S }, sun: { value: SUN_DIR }, skyc: { value: SKY_HOR } }]),
    vertexShader: `uniform float t; varying vec3 vW;
#include <fog_pars_vertex>
      void main(){ vec3 p = position; vec4 w = modelMatrix*vec4(p,1.);
        w.y += sin(w.x*.08+t*1.1)*.18 + sin(w.z*.11-t*.9)*.14;
        vW = w.xyz; vec4 mvPosition = viewMatrix*w; gl_Position = projectionMatrix*mvPosition;
#include <fog_vertex>
      }`,
    fragmentShader: `uniform float t; uniform sampler2D depthTex; uniform float size; uniform vec3 sun; uniform vec3 skyc; varying vec3 vW;
#include <fog_pars_fragment>
      float n2(vec2 p){ return sin(p.x)*sin(p.y); }
      void main(){
        vec2 uv = vW.xz/size + .5; float inside = step(0.,uv.x)*step(uv.x,1.)*step(0.,uv.y)*step(uv.y,1.);
        float d = mix(1., texture2D(depthTex, uv).r, inside);
        vec3 shallow = vec3(.36,.93,.86), mid = vec3(.09,.62,.72), deep = vec3(.03,.32,.52);
        vec3 c = mix(shallow, mid, smoothstep(0.,.35,d)); c = mix(c, deep, smoothstep(.35,1.,d));
        // procedural normal
        vec2 q = vW.xz*.18; float e = .5;
        float hx = n2(q*1.3+vec2(t*.7,0.)) + .5*n2(q*2.7+vec2(0.,t*1.1)) + .25*n2(q*5.1-t*.8);
        vec3 nrm = normalize(vec3(cos(q.x*1.3+t*.7)*.25, 1., cos(q.y*2.7+t*1.1)*.25));
        vec3 V = normalize(cameraPosition - vW);
        float fres = pow(1.-max(dot(V, vec3(0.,1.,0.)),0.), 3.);
        c = mix(c, skyc, fres*.55);
        vec3 H = normalize(V + sun); float spec = pow(max(dot(nrm, H), 0.), 180.);
        c += vec3(1.,.95,.85)*spec*1.4;
        c += vec3(.8,1.,.95)*smoothstep(.55,1.,hx*.5+.5)*.08*(1.-d);
        // shore foam bands
        float f = smoothstep(.09,.0,d) * (.55+.45*sin(d*90.-t*2.2 + hx*2.));
        f += smoothstep(.025,.0,d);
        c = mix(c, vec3(.97,1.,.98), clamp(f,0.,1.)*inside);
        float a = mix(.62, .96, smoothstep(0.,.4,d)); a = max(a, clamp(f,0.,1.)*.9);
        gl_FragColor = vec4(c, a);
#include <fog_fragment>
      }`,
  });
  waterMat.uniforms.depthTex.value = htex;
  const water = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000, 160, 160), waterMat);
  water.rotation.x = -Math.PI / 2; water.position.y = WORLD.water; scene.add(water);
  updaters.push((dt, t) => { waterMat.uniforms.t.value = t; });

  // ---------- vegetation ----------
  const palmTrunk = (() => {
    const parts = []; for (let i = 0; i < 7; i++) { const g = new THREE.CylinderGeometry(.32 - i * .025, .38 - i * .025, 1.25, 6); g.rotateZ(-i * .045); g.translate(i * i * .045, .62 + i * 1.15, 0); parts.push(paint(g, i % 2 ? '#9a7048' : '#86603c').toNonIndexed()); }
    return mergeGeometries(parts);
  })();
  const palmLeaves = (() => {
    const parts = []; for (let i = 0; i < 8; i++) {
      const g = new THREE.ConeGeometry(.55, 4.6, 4, 1); g.translate(0, 2.3, 0); g.scale(1, 1, .22); g.rotateZ(-1.95 + (i % 2) * .25); g.rotateY(i / 8 * Math.PI * 2); g.translate(2.2, 8.4, 0); parts.push(paint(g, i % 2 ? '#2fa856' : '#46c266').toNonIndexed());
    }
    const coco = new THREE.IcosahedronGeometry(.35, 0); coco.translate(2.2, 7.9, .3); parts.push(paint(coco, '#6b4a2a'));
    return mergeGeometries(parts);
  })();
  const roundTree = (() => {
    const t = paint(new THREE.CylinderGeometry(.35, .5, 3.4, 6).translate(0, 1.7, 0), '#7a5634');
    const a = jitter(new THREE.IcosahedronGeometry(2.6, 0).translate(0, 4.6, 0), .6, rng); paint(a, '#3fa65a');
    const b = jitter(new THREE.IcosahedronGeometry(1.9, 0).translate(1.2, 5.8, .5), .5, rng); paint(b, '#58c06a');
    return mergeGeometries([t.toNonIndexed(), a.toNonIndexed(), b.toNonIndexed()]);
  })();
  const pineTree = (() => {
    const t = paint(new THREE.CylinderGeometry(.25, .35, 2, 5).translate(0, 1, 0), '#6b4a2a');
    const parts = [t.toNonIndexed()];
    for (let i = 0; i < 3; i++) parts.push(paint(new THREE.ConeGeometry(2.4 - i * .6, 2.8, 7).translate(0, 2.6 + i * 1.6, 0), i % 2 ? '#2f8a53' : '#26784a').toNonIndexed());
    return mergeGeometries(parts);
  })();
  const rockGeo = jitter(new THREE.IcosahedronGeometry(1, 0), .35, rng); paint(rockGeo, '#a7a196');
  const bushGeo = jitter(new THREE.IcosahedronGeometry(1, 0), .3, rng); paint(bushGeo, '#4cb35e');
  const flowerGeo = (() => { const s = paint(new THREE.CylinderGeometry(.04, .04, .6, 3).translate(0, .3, 0), '#3d8a3d').toNonIndexed(); const h = paint(new THREE.OctahedronGeometry(.16, 0).translate(0, .65, 0), '#ffffff').toNonIndexed(); return mergeGeometries([s, h]); })();
  const grassGeo = (() => { const parts = []; for (let i = 0; i < 3; i++) { const g = new THREE.ConeGeometry(.12, .9, 3); g.translate(0, .45, 0); g.rotateZ((i - 1) * .35); g.rotateY(i * 2.1); parts.push(paint(g, '#6ccf5f').toNonIndexed()); } return mergeGeometries(parts); })();

  const place = (geo, count, filter, scaleFn, opts = {}) => {
    const mat = flatMat(opts.mat || {});
    const mesh = new THREE.InstancedMesh(geo, mat, count); mesh.castShadow = opts.shadow !== false; mesh.receiveShadow = true;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), e = new THREE.Euler();
    const color = new THREE.Color(); let k = 0, tries = 0;
    while (k < count && tries++ < count * 60) {
      const x = (rng() - .5) * 520, z = (rng() - .5) * 520, h = heightAt(x, z);
      if (!filter(x, z, h)) continue;
      if (Math.hypot(x, z) < WORLD.plaza.r + 6 && !opts.allowPlaza) continue;
      if (LANDMARKS.some(L => Math.hypot(x - L.x, z - L.z) < 14)) continue;
      const sc = scaleFn(); e.set(opts.tilt ? (rng() - .5) * .3 : 0, rng() * Math.PI * 2, opts.tilt ? (rng() - .5) * .3 : 0); q.setFromEuler(e);
      s.set(sc, sc * (opts.squash ? .5 + rng() * .6 : 1), sc); p.set(x, h - (opts.sink || 0) * sc, z); m.compose(p, q, s); mesh.setMatrixAt(k, m);
      if (opts.tint) { color.setHSL(...opts.tint(rng)); mesh.setColorAt(k, color); }
      if (opts.col) addCol(x, z, opts.col * sc);
      k++;
    }
    mesh.count = k; scene.add(mesh); return mesh;
  };
  const palmAll = mergeGeometries([palmTrunk, palmLeaves]);
  place(palmAll, 170, (x, z, h) => h > 1.4 && h < 9, () => .8 + rng() * .45, { col: .45, mat: { side: THREE.DoubleSide } });
  place(roundTree, 130, (x, z, h) => h > 8 && h < 26, () => .9 + rng() * .7, { col: .6 });
  place(pineTree, 150, (x, z, h) => h > 18 && h < 36, () => .9 + rng() * .8, { col: .5 });
  place(rockGeo, 140, (x, z, h) => h > -2, () => .6 + Math.pow(rng(), 3) * 4.5, { col: .9, tilt: true, squash: true, sink: .3 });
  place(bushGeo, 220, (x, z, h) => h > 3 && h < 28, () => .6 + rng() * .8, { shadow: false, squash: true, sink: .3, tint: r => [.3 + r() * .06, .5, .4 + r() * .12] });
  place(flowerGeo, 700, (x, z, h) => h > 3 && h < 24, () => .8 + rng() * .6, { shadow: false, tint: r => [[.95, .12, .55, .6][Math.floor(r() * 4)], .85, .7] , allowPlaza: false });
  place(grassGeo, 2600, (x, z, h) => h > 2.6 && h < 30, () => .7 + rng() * .9, { shadow: false, tint: r => [.27 + r() * .06, .55, .45 + r() * .12] });

  // ---------- spawn plaza ----------
  const stone = flatMat({ roughness: .85 });
  const P0 = WORLD.plaza;
  const plaza = new THREE.Group(); plaza.position.set(P0.x, P0.h, P0.z); scene.add(plaza);
  const disc = new THREE.Mesh(paint(new THREE.CylinderGeometry(P0.r, P0.r + 1, .6, 40), '#d8cfb8'), stone); disc.position.y = -.2; disc.receiveShadow = true; plaza.add(disc);
  const inner = new THREE.Mesh(paint(new THREE.CylinderGeometry(9, 9.4, .7, 32), '#c7bda3'), stone); inner.position.y = -.12; inner.receiveShadow = true; plaza.add(inner);
  // inlay ring (glowing)
  const ring = new THREE.Mesh(new THREE.RingGeometry(10.2, 10.8, 64), new THREE.MeshBasicMaterial({ color: 0x7dffc1, toneMapped: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = .13; plaza.add(ring);
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(P0.r - 1.6, P0.r - 1.2, 80), new THREE.MeshBasicMaterial({ color: 0xffc94a, toneMapped: false, transparent: true, opacity: .8 })); ring2.rotation.x = -Math.PI / 2; ring2.position.y = .12; plaza.add(ring2);
  // tiles pattern spokes
  for (let i = 0; i < 16; i++) { const g = new THREE.Mesh(paint(new THREE.BoxGeometry(.25, .05, P0.r - 12), '#b9ae93'), stone); const a = i / 16 * Math.PI * 2; g.position.set(Math.cos(a) * (P0.r / 2 + 5.5), .12, Math.sin(a) * (P0.r / 2 + 5.5)); g.rotation.y = -a + Math.PI / 2; plaza.add(g); }
  // pillars
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * Math.PI * 2 + .13; const broken = i % 3 === 1; const h = broken ? 2.5 + rng() * 2 : 7.5;
    const col = new THREE.Group(); col.position.set(Math.cos(a) * (P0.r - 3.5), 0, Math.sin(a) * (P0.r - 3.5)); plaza.add(col);
    const base = new THREE.Mesh(paint(new THREE.BoxGeometry(2, .7, 2), '#cfc5ac'), stone); base.position.y = .35; col.add(base);
    const sh = new THREE.Mesh(paint(new THREE.CylinderGeometry(.6, .7, h, 8), '#e6dec9'), stone); sh.position.y = .7 + h / 2; if (broken) sh.rotation.z = (rng() - .5) * .2; col.add(sh);
    if (!broken) { const cap = new THREE.Mesh(paint(new THREE.BoxGeometry(1.8, .55, 1.8), '#cfc5ac'), stone); cap.position.y = .7 + h + .27; col.add(cap);
      const gem = new THREE.Mesh(new THREE.OctahedronGeometry(.32), new THREE.MeshBasicMaterial({ color: 0x7dffc1, toneMapped: false })); gem.position.y = .7 + h + 1.05; col.add(gem); updaters.push((dt, t) => { gem.rotation.y = t * 1.5 + i; gem.position.y = .7 + h + 1.05 + Math.sin(t * 2 + i) * .12; }); }
    col.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    addCol(P0.x + col.position.x, P0.z + col.position.z, 1.2);
  }
  // central Pack Altar: pedestal + floating pack + rotating reticle rings
  const ped = new THREE.Mesh(paint(new THREE.CylinderGeometry(2.2, 3, 1.6, 8), '#bdb397'), stone); ped.position.y = .8; ped.castShadow = ped.receiveShadow = true; plaza.add(ped);
  const ped2 = new THREE.Mesh(paint(new THREE.CylinderGeometry(1.6, 2, .8, 8), '#e6dec9'), stone); ped2.position.y = 2; ped2.castShadow = true; plaza.add(ped2);
  addCol(P0.x, P0.z, 3.2, P0.h + 2.4);
  const packMat = new THREE.MeshStandardMaterial({ color: 0x7dffc1, emissive: 0x2bd38c, emissiveIntensity: .9, flatShading: true, roughness: .3, metalness: .2 });
  const packG = new THREE.Group(); packG.position.y = 6.2; plaza.add(packG);
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.6, 3.6, .5), packMat); packG.add(body);
  for (const sy of [-1, 1]) for (let i = 0; i < 6; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(.24, .35, 4), packMat); c.position.set(-1.1 + i * .44, sy * 1.95, 0); if (sy < 0) c.rotation.z = Math.PI; packG.add(c); }
  const goldM = new THREE.MeshBasicMaterial({ color: 0xffc94a, toneMapped: false });
  const ret = new THREE.Mesh(new THREE.TorusGeometry(1.0, .12, 8, 40), goldM); ret.position.z = .3; packG.add(ret);
  const ret2 = ret.clone(); ret2.position.z = -.3; packG.add(ret2);
  const ringA = new THREE.Mesh(new THREE.TorusGeometry(3.4, .07, 6, 80), goldM); packG.add(ringA);
  const ringB = new THREE.Mesh(new THREE.TorusGeometry(4.0, .05, 6, 80), new THREE.MeshBasicMaterial({ color: 0x7dffc1, toneMapped: false })); packG.add(ringB);
  const altarLight = new THREE.PointLight(0x7dffc1, 40, 22, 1.6); altarLight.position.y = 6; plaza.add(altarLight);
  updaters.push((dt, t) => { packG.rotation.y = t * .6; packG.position.y = 6.2 + Math.sin(t * 1.3) * .35; ringA.rotation.x = t * .7; ringA.rotation.y = t * .3; ringB.rotation.x = -t * .4 + 1; ringB.rotation.z = t * .5; });

  // ---------- landmarks ----------
  const lm = {};
  for (const L of LANDMARKS) { const g = new THREE.Group(); g.position.set(L.x, heightAt(L.x, L.z), L.z); scene.add(g); lm[L.id] = g; }
  // Genesis Obelisk
  { const g = lm.obelisk; const ob = new THREE.Mesh(paint(new THREE.CylinderGeometry(.9, 2.4, 22, 4), '#3b3f45'), flatMat({ roughness: .5 })); ob.position.y = 11; ob.rotation.y = Math.PI / 4; ob.castShadow = true; g.add(ob);
    const tip = new THREE.Mesh(new THREE.OctahedronGeometry(1.4), new THREE.MeshBasicMaterial({ color: 0xffc94a, toneMapped: false })); tip.position.y = 24; g.add(tip);
    for (let i = 0; i < 6; i++) { const r = new THREE.Mesh(new THREE.BoxGeometry(.5, .5, .06), new THREE.MeshBasicMaterial({ color: 0x7dffc1, toneMapped: false })); r.position.set(0, 4 + i * 2.6, 1.6 - i * .11); r.rotation.y = 0; g.add(r); }
    const base = new THREE.Mesh(paint(new THREE.CylinderGeometry(5, 6, 1.2, 6), '#8f8a7e'), stone); base.position.y = .3; base.receiveShadow = true; g.add(base);
    addCol(L(g).x, L(g).z, 2.6);
    updaters.push((dt, t) => { tip.rotation.y = t; tip.position.y = 24 + Math.sin(t) * .4; }); }
  // Broken Arch
  { const g = lm.arch; const m = flatMat(); const c = '#d7ccb2';
    const l = new THREE.Mesh(paint(new THREE.BoxGeometry(2.2, 12, 2.2), c), m); l.position.set(-5, 6, 0); const r = new THREE.Mesh(paint(new THREE.BoxGeometry(2.2, 8, 2.2), c), m); r.position.set(5, 4, 0);
    const top = new THREE.Mesh(paint(new THREE.BoxGeometry(8, 2, 2.4), c), m); top.position.set(-1.4, 12.6, 0); top.rotation.z = -.08;
    const fallen = new THREE.Mesh(paint(new THREE.BoxGeometry(5, 2, 2.2), '#c9bea4'), m); fallen.position.set(6, 1, 4); fallen.rotation.set(.1, .6, .2);
    [l, r, top, fallen].forEach(o => { o.castShadow = o.receiveShadow = true; g.add(o); });
    addCol(g.position.x - 5, g.position.z, 1.6); addCol(g.position.x + 5, g.position.z, 1.6); addCol(g.position.x + 6, g.position.z + 4, 2.4); }
  // Signal Tower
  { const g = lm.tower; const m = flatMat({ metalness: .3, roughness: .5 });
    for (let i = 0; i < 4; i++) { const a = i / 4 * Math.PI * 2 + Math.PI / 4; const leg = new THREE.Mesh(paint(new THREE.CylinderGeometry(.18, .3, 20, 5), '#e8e3d6'), m); leg.position.set(Math.cos(a) * 1.8, 10, Math.sin(a) * 1.8); leg.rotation.set(Math.sin(a) * .09, 0, -Math.cos(a) * .09); leg.castShadow = true; g.add(leg); }
    for (let k = 0; k < 5; k++) { const ring = new THREE.Mesh(paint(new THREE.TorusGeometry(2.1 - k * .28, .1, 4, 4), '#ff7a59'), m); ring.rotation.x = Math.PI / 2; ring.rotation.z = Math.PI / 4; ring.position.y = 3 + k * 4; g.add(ring); }
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(.7, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff7a59, toneMapped: false })); lamp.position.y = 21; g.add(lamp);
    addCol(g.position.x, g.position.z, 2.6);
    updaters.push((dt, t) => { lamp.material.color.setScalar(0).setRGB(1, .48, .35).multiplyScalar(.4 + .6 * (Math.sin(t * 3) > 0 ? 1.6 : .3)); }); }
  // Sunken Vault
  { const g = lm.vault; const m = flatMat();
    const box = new THREE.Mesh(paint(new THREE.BoxGeometry(12, 8, 12), '#857d6c'), m); box.position.y = 1.2; box.rotation.set(.12, .5, -.08); box.castShadow = box.receiveShadow = true; g.add(box);
    const door = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, .5, 24), new THREE.MeshStandardMaterial({ color: 0xffc94a, metalness: .8, roughness: .3, emissive: 0x6b4a00, emissiveIntensity: .4 }));
    door.rotation.x = Math.PI / 2; door.position.set(0, 1.5, 6.1); const dg = new THREE.Group(); dg.add(door); dg.rotation.set(.12, .5, -.08); dg.position.y = 1.2 - 1.2; g.add(dg);
    for (let i = 0; i < 6; i++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(.25, 3.6, .25), new THREE.MeshStandardMaterial({ color: 0xb98a20, metalness: .8, roughness: .3 })); sp.position.set(0, 1.5, 6.4); sp.rotation.z = i / 6 * Math.PI; dg.add(sp); }
    addCol(g.position.x, g.position.z, 8); }
  // Oracle Ring
  { const g = lm.henge; const m = flatMat();
    for (let i = 0; i < 9; i++) { const a = i / 9 * Math.PI * 2; const h = 4 + rng() * 3; const s = new THREE.Mesh(jitter(paint(new THREE.BoxGeometry(1.6, h, 1), '#a8a294'), .25, rng), m); s.position.set(Math.cos(a) * 8, h / 2 - .3, Math.sin(a) * 8); s.rotation.y = -a; s.castShadow = true; g.add(s); addCol(g.position.x + s.position.x, g.position.z + s.position.z, 1.1); }
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 1), new THREE.MeshBasicMaterial({ color: 0xa98bff, toneMapped: false, wireframe: true })); orb.position.y = 3.5; g.add(orb);
    const orb2 = new THREE.Mesh(new THREE.IcosahedronGeometry(.7, 0), new THREE.MeshBasicMaterial({ color: 0xd9ccff, toneMapped: false })); orb2.position.y = 3.5; g.add(orb2);
    updaters.push((dt, t) => { orb.rotation.y = t * .5; orb.rotation.x = t * .3; orb2.rotation.y = -t; }); }

  // ---------- floating motes over plaza ----------
  { const n = 300, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const a = rng() * Math.PI * 2, r = rng() * 40; p[i * 3] = Math.cos(a) * r; p[i * 3 + 1] = P0.h + 1 + rng() * 14; p[i * 3 + 2] = Math.sin(a) * r; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xeaffb0, size: .22, transparent: true, opacity: .8, depthWrite: false, blending: THREE.AdditiveBlending })); scene.add(pts);
    updaters.push((dt, t) => { pts.rotation.y = t * .02; pts.position.y = Math.sin(t * .5) * .5; }); }

  function L(g) { return g.position; }
  return {
    sun, terrain, water,
    update(dt, t, focus) {
      for (const u of updaters) u(dt, t);
      // shadow camera follows the player
      sun.position.set(focus.x + SUN_DIR.x * 150, focus.y + SUN_DIR.y * 150, focus.z + SUN_DIR.z * 150);
      sun.target.position.copy(focus);
    },
  };
}

export function groundAt(x, z) { return heightAt(x, z); }
