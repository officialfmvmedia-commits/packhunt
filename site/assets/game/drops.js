import * as THREE from 'three';
import { RARITY } from '../config.js';
import { cardCanvas, backCanvas, loadImage } from '../cards.js';
import { heightAt } from '../terrain.js';

const BEAM_H = { common: 16, rare: 30, epic: 46, legendary: 80 };
const beamVS = `varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }`;
const beamFS = `uniform vec3 c; uniform float t; uniform float k; varying vec2 vU;
  void main(){ float a = pow(1.-vU.y, 1.6) * (.55 + .45*sin(vU.y*60. - t*5.)); float edge = 1.-abs(vU.x*2.-1.);
    gl_FragColor = vec4(c, a*k*(.25+.75*edge*edge)); }`;

let backTex = null;
// Face texture: procedural first, upgraded in place once the real card photo loads.
function faceTex(card) {
  const c = cardCanvas(card, 320); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  if (card.image) loadImage(card.image).then(img => { if (!img) return; const n = cardCanvas(card, 320, img); c.getContext('2d').drawImage(n, 0, 0); t.needsUpdate = true; });
  return t;
}
const sparkTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'); const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.25, 'rgba(255,255,255,.6)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); const t = new THREE.CanvasTexture(c); return t; })();

export class Drops {
  constructor(scene) { this.scene = scene; this.map = new Map(); this.geo = new THREE.PlaneGeometry(1.9, 2.66); }
  has(id) { return this.map.has(id); }
  add(d) {
    if (this.map.has(d.dropId)) return;
    if (!backTex) { backTex = new THREE.CanvasTexture(backCanvas(320)); backTex.colorSpace = THREE.SRGBColorSpace; }
    const card = d.card; if (!card || !RARITY[card.rarity]) return;
    const R = RARITY[card.rarity]; const col = new THREE.Color(R.glow);
    const g = new THREE.Group(); const y = Math.max(heightAt(d.x, d.z), 0.2);
    g.position.set(d.x, y, d.z);
    const holder = new THREE.Group(); holder.position.y = 2.2; g.add(holder);
    const front = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ map: faceTex(card), transparent: true, toneMapped: false, fog: true }));
    const back = new THREE.Mesh(this.geo, new THREE.MeshBasicMaterial({ map: backTex, transparent: true, toneMapped: false })); back.rotation.y = Math.PI;
    holder.add(front, back);
    // glow card halo
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: sparkTex, color: col, transparent: true, opacity: .38, depthWrite: false, blending: THREE.AdditiveBlending })); halo.scale.set(3.8, 3.8, 1); halo.position.z = -.05; holder.add(halo);
    // beam
    const H = BEAM_H[card.rarity];
    const beamM = new THREE.ShaderMaterial({ uniforms: { c: { value: col }, t: { value: 0 }, k: { value: card.rarity === 'common' ? .4 : card.rarity === 'rare' ? .55 : .75 } }, vertexShader: beamVS, fragmentShader: beamFS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const beamG = new THREE.CylinderGeometry(.55, .9, H, 16, 1, true); beamG.translate(0, H / 2, 0);
    const beam = new THREE.Mesh(beamG, beamM); g.add(beam);
    // ground ring
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.1, 1.45, 40), new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: .8, toneMapped: false, depthWrite: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = .08; g.add(ring);
    // sparkles
    const n = card.rarity === 'legendary' ? 60 : card.rarity === 'epic' ? 40 : 24;
    const pp = new Float32Array(n * 3), seeds = new Float32Array(n);
    for (let i = 0; i < n; i++) { seeds[i] = Math.random() * 100; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pp, 3));
    const sparks = new THREE.Points(sg, new THREE.PointsMaterial({ map: sparkTex, color: col, size: .35, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    g.add(sparks);
    this.scene.add(g);
    this.map.set(d.dropId, { d, card, g, holder, beamM, sparks, seeds, ring, phase: Math.random() * 10 });
  }
  clear() { for (const id of [...this.map.keys()]) this.remove(id); }
  remove(id, animate = false) {
    const o = this.map.get(id); if (!o) return null;
    this.map.delete(id);
    if (!animate) { this.dispose(o); return o; }
    o.dying = 0; this.dying = this.dying || []; this.dying.push(o); return o;
  }
  dispose(o) {
    this.scene.remove(o.g);
    o.g.traverse(m => {
      if (m.material) { const t = m.material.map; if (t && t !== backTex && t !== sparkTex) t.dispose(); m.material.dispose(); }
      if (m.geometry && m.geometry !== this.geo) m.geometry.dispose();
    });
  }
  nearest(pos, r = 2.4) {
    let best = null, bd = r;
    for (const o of this.map.values()) { const d = Math.hypot(o.d.x - pos.x, o.d.z - pos.z); if (d < bd && Math.abs(o.g.position.y - pos.y) < 6) { bd = d; best = o; } }
    return best;
  }
  closestTo(pos) { let best = null, bd = Infinity; for (const o of this.map.values()) { const d = Math.hypot(o.d.x - pos.x, o.d.z - pos.z); if (d < bd) { bd = d; best = o; } } return best ? { o: best, d: bd } : null; }
  update(dt, t, camPos) {
    for (const o of this.map.values()) {
      const dist = o.g.position.distanceTo(camPos);
      o.holder.rotation.y = Math.atan2(camPos.x - o.g.position.x, camPos.z - o.g.position.z) + Math.sin(t * 1.3 + o.phase) * .55; o.holder.position.y = 2.2 + Math.sin(t * 2 + o.phase) * .25;
      o.beamM.uniforms.t.value = t;
      o.ring.scale.setScalar(1 + Math.sin(t * 3 + o.phase) * .08);
      o.sparks.visible = dist < 90;
      if (o.sparks.visible) {
        const a = o.sparks.geometry.attributes.position.array;
        for (let i = 0; i < o.seeds.length; i++) { const s = o.seeds[i]; const k = (t * .35 + s) % 1; const ang = s * 7 + t * .6; const r = .7 + (s % 1.3); a[i * 3] = Math.cos(ang) * r; a[i * 3 + 1] = .2 + k * 4.5; a[i * 3 + 2] = Math.sin(ang) * r; }
        o.sparks.geometry.attributes.position.needsUpdate = true;
      }
    }
    if (this.dying) this.dying = this.dying.filter(o => {
      o.dying += dt; const k = o.dying / .6;
      o.holder.position.y += dt * 8; o.holder.scale.setScalar(Math.max(0.01, 1 - k)); o.beamM.uniforms.k.value *= .9;
      if (k >= 1) { this.dispose(o); return false; } return true;
    });
  }
}
