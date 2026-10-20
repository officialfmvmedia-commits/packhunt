import * as THREE from 'three';

const PALETTE = [0x7dffc1, 0xffc94a, 0xff7a59, 0xa98bff, 0x9fe7ff, 0xd4ff4f, 0xff8fc8];
export const randomColor = () => PALETTE[Math.floor(Math.random() * PALETTE.length)];

function nameTag(text, color = '#7dffc1') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
  x.font = '700 26px "Geist Mono", monospace'; const w = Math.min(240, x.measureText(text).width + 34);
  x.fillStyle = 'rgba(7,17,15,.72)'; x.beginPath(); x.roundRect(128 - w / 2, 12, w, 40, 20); x.fill();
  x.strokeStyle = color; x.globalAlpha = .7; x.lineWidth = 2; x.stroke(); x.globalAlpha = 1;
  x.fillStyle = '#f4f1e6'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 128, 33);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthWrite: false, transparent: true, fog: false })); s.scale.set(3.2, .8, 1); s.renderOrder = 10;
  return s;
}

// Original low-poly explorer with a card-pack backpack.
export function makeAvatar(color = 0x7dffc1, name = null) {
  const root = new THREE.Group();
  const body = new THREE.Group(); root.add(body);
  const suit = new THREE.MeshStandardMaterial({ color, flatShading: true, roughness: .6 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b2b28, flatShading: true, roughness: .7 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xf4f1e6, flatShading: true, roughness: .8 });
  const visorM = new THREE.MeshBasicMaterial({ color: 0x7dffc1, toneMapped: false });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.42, .55, 3, 8), suit); torso.position.y = 1.25; body.add(torso);
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(.45, .45, .12, 10), dark); belt.position.y = 1.0; body.add(belt);
  const head = new THREE.Mesh(new THREE.IcosahedronGeometry(.42, 1), skin); head.position.y = 2.12; body.add(head);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(.56, .16, .2), visorM); visor.position.set(0, 2.15, .33); body.add(visor);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(.45, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), suit); cap.position.y = 2.2; body.add(cap);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(.5, .05, .32), suit); brim.position.set(0, 2.24, .45); body.add(brim);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .4, 4), dark); antenna.position.set(.2, 2.7, -.05); body.add(antenna);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc94a, toneMapped: false })); bulb.position.set(.2, 2.92, -.05); body.add(bulb);
  // backpack = a card pack
  const pack = new THREE.Group(); pack.position.set(0, 1.35, -.48); body.add(pack);
  const pk = new THREE.Mesh(new THREE.BoxGeometry(.66, .86, .26), new THREE.MeshStandardMaterial({ color: 0xffc94a, flatShading: true, metalness: .3, roughness: .4 })); pack.add(pk);
  const ret = new THREE.Mesh(new THREE.TorusGeometry(.16, .035, 6, 20), new THREE.MeshBasicMaterial({ color: 0x07110f })); ret.position.z = -.14; pack.add(ret);
  const limb = (r, h) => new THREE.CapsuleGeometry(r, h, 2, 6);
  const mkLimb = (x, y, geo, mat) => { const g = new THREE.Group(); g.position.set(x, y, 0); const m = new THREE.Mesh(geo, mat); m.position.y = -geo.parameters.length / 2 - geo.parameters.radius * .5; g.add(m); body.add(g); return g; };
  const armL = mkLimb(-.55, 1.55, limb(.12, .5), suit), armR = mkLimb(.55, 1.55, limb(.12, .5), suit);
  const legL = mkLimb(-.2, .95, limb(.15, .5), dark), legR = mkLimb(.2, .95, limb(.15, .5), dark);
  root.traverse(o => { if (o.isMesh) { o.castShadow = true; } });
  let tag = null;
  if (name) { tag = nameTag(name); tag.position.y = 3.45; root.add(tag); }
  let phase = 0;
  root.userData = {
    setName(n) { if (tag) root.remove(tag); tag = nameTag(n); tag.position.y = 3.45; root.add(tag); },
    animate(dt, speed, airborne) {
      phase += dt * (4 + speed * 1.4);
      const amp = Math.min(1, speed / 6) * .9;
      const s = Math.sin(phase) * amp;
      legL.rotation.x = s; legR.rotation.x = -s; armL.rotation.x = -s * .8; armR.rotation.x = s * .8;
      body.position.y = Math.abs(Math.cos(phase)) * amp * .12;
      if (airborne) { legL.rotation.x = -.6; legR.rotation.x = .3; armL.rotation.x = -2.4; armR.rotation.x = -2.4; armL.rotation.z = -.3; armR.rotation.z = .3; }
      else { armL.rotation.z = 0; armR.rotation.z = 0; }
      pack.rotation.x = -s * .08;
    },
    celebrate(t) { armL.rotation.x = -2.8 + Math.sin(t * 12) * .3; armR.rotation.x = -2.8 - Math.sin(t * 12) * .3; },
  };
  return root;
}
