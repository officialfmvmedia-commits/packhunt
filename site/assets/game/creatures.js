import * as THREE from 'three';
import { SPECIES } from '../cards.js';
import { heightAt, mulberry32, randomLandSpot } from '../terrain.js';

const LINES = {
  bitbun: ['Bzzt! My ears are picking up a drop nearby.', 'I hop to the beat of the order book.', 'Shh. I can hear a pack being ripped.'],
  gpupup: ['Woof! I am SO warm right now.', 'I fetched a whole batch for you. Kidding. But one’s nearby.', 'Pet me, my fans spin faster.'],
  mintmoth: ['I flutter toward anything freshly minted…', 'There’s gold dust on the breeze. Follow it.', 'Shiny! Somewhere over there!'],
  hashowl: ['Hoo. Every block, accounted for.', 'I watched a card fall from the sky. I always watch.', 'Patience. Patterns. Packs.'],
  ledgetoad: ['Croak. Balance: confirmed.', 'My stripes say a card landed near here.', 'Ribbit. Yield is a state of mind.'],
  tokkit: ['I buried a coin here once. Or there. Or…', 'Psst. I saw something glowing.', 'Wanna race? Last one to the drop is a common.'],
};
const EMOTES = ['♥', '!', '♪', '✦', '?'];

function mat(c, extra = {}) { return new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: .7, ...extra }); }

export function makeCreatureMesh(id) {
  const sp = SPECIES[id];
  const g = new THREE.Group(); const b = new THREE.Group(); g.add(b);
  const bodyM = mat(sp.body), bellyM = mat(sp.belly), accM = mat(sp.accent), eyeM = new THREE.MeshBasicMaterial({ color: 0x0a1310 }), wM = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const k = sp.kind;
  const body = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), bodyM); body.scale.set(1, k === 'toad' ? .75 : .95, .95); body.position.y = 1; b.add(body);
  const belly = new THREE.Mesh(new THREE.IcosahedronGeometry(.7, 1), bellyM); belly.scale.set(1, .9, .5); belly.position.set(0, .85, .55); b.add(belly);
  for (const sx of [-1, 1]) {
    const e = new THREE.Mesh(new THREE.SphereGeometry(k === 'owl' ? .2 : .15, 10, 8), eyeM); e.position.set(sx * .34, k === 'toad' ? 1.5 : 1.25, .82); e.scale.z = .6; b.add(e);
    const h = new THREE.Mesh(new THREE.SphereGeometry(.05, 6, 4), wM); h.position.set(sx * .34 - .05, (k === 'toad' ? 1.5 : 1.25) + .07, .92); b.add(h);
    if (k === 'owl') { const ring = new THREE.Mesh(new THREE.TorusGeometry(.26, .05, 4, 6), new THREE.MeshBasicMaterial({ color: 0xd9ccff, toneMapped: false })); ring.position.copy(e.position); ring.position.z += .03; b.add(ring); }
    if (k === 'toad') { const bump = new THREE.Mesh(new THREE.IcosahedronGeometry(.28, 0), bodyM); bump.position.set(sx * .34, 1.45, .62); b.add(bump); }
    const cheek = new THREE.Mesh(new THREE.SphereGeometry(.09, 6, 4), new THREE.MeshBasicMaterial({ color: 0xff8fa8 })); cheek.position.set(sx * .58, 1.0, .72); cheek.scale.z = .4; b.add(cheek);
    const foot = new THREE.Mesh(new THREE.SphereGeometry(.25, 6, 4), accM); foot.scale.set(1, .5, 1.3); foot.position.set(sx * .45, .12, .2); b.add(foot);
    if (k === 'bun') { const ear = new THREE.Mesh(new THREE.CapsuleGeometry(.14, .9, 2, 6), bodyM); ear.position.set(sx * .35, 2.25, -.1); ear.rotation.z = -sx * .2; b.add(ear);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(.09, 6, 4), new THREE.MeshBasicMaterial({ color: 0x7dffc1, toneMapped: false })); tip.position.set(sx * .45, 2.85, -.1); b.add(tip); }
    if (k === 'pup' || k === 'kit' || k === 'owl') { const ear = new THREE.Mesh(new THREE.ConeGeometry(.24, .6, 4), k === 'owl' ? accM : bodyM); ear.position.set(sx * .5, 1.85, 0); ear.rotation.z = -sx * .45; b.add(ear); }
    if (k === 'moth') { const w = new THREE.Mesh(new THREE.CylinderGeometry(.75, .75, .06, 10), new THREE.MeshStandardMaterial({ color: 0xffd166, metalness: .6, roughness: .3, flatShading: true, emissive: 0x6b4a00, emissiveIntensity: .3 })); w.rotation.z = Math.PI / 2 - sx * .35; w.rotation.y = .3 * sx; w.position.set(sx * 1.05, 1.35, -.25); w.userData.wing = sx; b.add(w);
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .7, 4), accM); ant.position.set(sx * .25, 2.1, .3); ant.rotation.z = -sx * .4; b.add(ant); }
  }
  if (k === 'pup') for (let i = -2; i <= 2; i++) { const f = new THREE.Mesh(new THREE.BoxGeometry(.08, .45, .5), mat(0x5b6b75, { metalness: .6, roughness: .35 })); f.position.set(i * .18, 1.85, -.25); b.add(f); }
  if (k === 'kit') { const tail = new THREE.Mesh(new THREE.CapsuleGeometry(.2, .7, 2, 6), bodyM); tail.position.set(0, .8, -1); tail.rotation.x = -1; b.add(tail);
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(.3, .3, .08, 14), new THREE.MeshStandardMaterial({ color: 0xffc94a, metalness: .8, roughness: .3 })); coin.rotation.x = Math.PI / 2; coin.position.set(0, 1.3, -1.35); b.add(coin); }
  if (k === 'toad') for (let i = -2; i <= 2; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(.08, .05, .9), accM); st.position.set(i * .22, 1.72, -.15); b.add(st); }
  if (k === 'owl') { const beak = new THREE.Mesh(new THREE.ConeGeometry(.1, .25, 4), mat(0xffb347)); beak.rotation.x = Math.PI / 2 + .3; beak.position.set(0, 1.05, .98); b.add(beak); }
  g.traverse(o => { if (o.isMesh) o.castShadow = true; });
  g.scale.setScalar(.9);
  return g;
}

function emoteSprite(ch) {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#f4f1e6'; x.beginPath(); x.arc(64, 58, 46, 0, 7); x.fill(); x.beginPath(); x.moveTo(50, 96); x.lineTo(64, 122); x.lineTo(78, 96); x.fill();
  x.fillStyle = ch === '♥' ? '#ff5d8f' : ch === '✦' ? '#e0a400' : '#0b1f1c'; x.font = '800 60px Syne, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(ch, 64, 62);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, fog: false })); s.scale.set(1.6, 1.6, 1); return s;
}

export class Creatures {
  constructor(scene, count = 34) {
    this.list = []; const rng = mulberry32(99); const ids = Object.keys(SPECIES);
    for (let i = 0; i < count; i++) {
      const id = ids[i % ids.length];
      // first 6 hang around the spawn plaza so new players meet them immediately
      let home = i < 6 ? { x: Math.cos(i) * 18, z: Math.sin(i) * 18 } : randomLandSpot(rng, 1.5, 34);
      const mesh = makeCreatureMesh(id); scene.add(mesh);
      mesh.position.set(home.x, heightAt(home.x, home.z), home.z);
      this.list.push({ id, sp: SPECIES[id], mesh, home, target: { ...home }, wait: rng() * 3, hop: rng() * 6, talking: 0, emote: null, emoteT: 0, spin: 0, speed: 1.6 + rng() * 1.2, rng });
    }
  }
  nearest(pos, maxD = 4.2) {
    let best = null, bd = maxD;
    for (const c of this.list) { const d = Math.hypot(c.mesh.position.x - pos.x, c.mesh.position.z - pos.z); if (d < bd) { bd = d; best = c; } }
    return best;
  }
  interact(c, playerPos) {
    c.talking = 6; c.spin = 1;
    const ch = EMOTES[Math.floor(Math.random() * EMOTES.length)];
    if (c.emote) c.mesh.remove(c.emote);
    c.emote = emoteSprite(ch); c.emote.position.y = 3.3; c.mesh.add(c.emote); c.emoteT = 2.6;
    const lines = LINES[c.id];
    return { name: c.sp.name, line: lines[Math.floor(Math.random() * lines.length)], blurb: c.sp.line };
  }
  update(dt, t, playerPos) {
    for (const c of this.list) {
      const m = c.mesh, p = m.position;
      if (c.talking > 0) {
        c.talking -= dt;
        const yaw = Math.atan2(playerPos.x - p.x, playerPos.z - p.z);
        { const d = yaw - m.rotation.y; m.rotation.y += Math.atan2(Math.sin(d), Math.cos(d)) * Math.min(1, dt * 8); }
        if (c.spin > 0) { c.spin -= dt * 1.4; m.children[0].rotation.y = (1 - Math.max(0, c.spin)) * Math.PI * 2; m.children[0].position.y = Math.sin(Math.max(0, c.spin) * Math.PI) * 1.2; }
        else { m.children[0].rotation.y = 0; m.children[0].position.y = Math.abs(Math.sin(t * 6)) * .15; }
      } else if (c.wait > 0) { c.wait -= dt; m.children[0].position.y = 0; m.children[0].scale.y = 1 + Math.sin(t * 3 + c.hop) * .03; }
      else {
        const dx = c.target.x - p.x, dz = c.target.z - p.z, d = Math.hypot(dx, dz);
        if (d < .6) { c.wait = 1.5 + c.rng() * 4; const r = 4 + c.rng() * 10, a = c.rng() * Math.PI * 2; const tx = c.home.x + Math.cos(a) * r, tz = c.home.z + Math.sin(a) * r; if (heightAt(tx, tz) > 1) c.target = { x: tx, z: tz }; }
        else {
          const sp = c.speed * dt; p.x += dx / d * sp; p.z += dz / d * sp;
          const yaw = Math.atan2(dx, dz); { const dd = yaw - m.rotation.y; m.rotation.y += Math.atan2(Math.sin(dd), Math.cos(dd)) * Math.min(1, dt * 6); }
          c.hop += dt * 9; m.children[0].position.y = Math.abs(Math.sin(c.hop)) * .45; m.children[0].scale.y = 1 - Math.abs(Math.cos(c.hop)) * .08;
        }
      }
      p.y = heightAt(p.x, p.z);
      m.children[0].children.forEach(o => { if (o.userData.wing) o.rotation.x = Math.sin(t * 14 + c.hop) * .5; });
      if (c.emote) { c.emoteT -= dt; c.emote.position.y = 3.3 + Math.sin(t * 4) * .1; c.emote.material.opacity = Math.min(1, c.emoteT); if (c.emoteT <= 0) { m.remove(c.emote); c.emote = null; } }
    }
  }
}
