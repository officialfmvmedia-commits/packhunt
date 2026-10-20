// Shared deterministic island terrain (used by browser client AND Node server).
export const WORLD = {
  size: 640,          // terrain square edge (units)
  islandRadius: 230,
  water: 0,           // water level
  plaza: { x: 0, z: 0, r: 26, h: 7 },
};

// --- tiny seeded value-noise (no deps) ---
function hash(x, z) {
  let h = (x | 0) * 374761393 + (z | 0) * 668265263;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}
const fade = t => t * t * (3 - 2 * t);
export function vnoise(x, z) {
  const xi = Math.floor(x), zi = Math.floor(z);
  const xf = x - xi, zf = z - zi;
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  const u = fade(xf), v = fade(zf);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}
export function fbm(x, z, oct = 4) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, z * f); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}
const smooth = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// Landmarks (shared so server/client agree on where hills/ruins are)
export const LANDMARKS = [
  { id: 'obelisk', name: 'Genesis Obelisk', x: -95, z: -70 },
  { id: 'arch',    name: 'Broken Arch',     x: 110, z: -40 },
  { id: 'tower',   name: 'Signal Tower',    x: 40,  z: 150 },
  { id: 'vault',   name: 'Sunken Vault',    x: -120, z: 95 },
  { id: 'henge',   name: 'Oracle Ring',     x: 150, z: 95 },
];

export function heightAt(x, z) {
  const d = Math.hypot(x, z);
  const ang = Math.atan2(z, x);
  // wobbly coastline
  const coast = WORLD.islandRadius * (0.82 + 0.22 * fbm(Math.cos(ang) * 2.2 + 10, Math.sin(ang) * 2.2 + 10, 3));
  const land = 1 - smooth(coast * 0.68, coast, d);           // 1 inland -> 0 sea
  let h = -13 + land * 22.5;                                    // base plateau
  h += land * (fbm(x * 0.012 + 3, z * 0.012 - 7, 5) - 0.45) * 40; // rolling hills
  // a big volcano-ish peak NW
  const pk = Math.hypot(x + 95, z + 70);
  h += land * 34 * Math.exp(-(pk * pk) / (2 * 55 * 55));
  // ridge NE
  const rk = Math.hypot(x - 120, z + 20);
  h += land * 16 * Math.exp(-(rk * rk) / (2 * 40 * 40));
  // flatten spawn plaza
  const p = WORLD.plaza;
  const pd = Math.hypot(x - p.x, z - p.z);
  const pf = smooth(p.r + 22, p.r, pd);
  h = h * (1 - pf) + p.h * pf;
  // gentle flats at landmarks
  for (const L of LANDMARKS) {
    const ld = Math.hypot(x - L.x, z - L.z);
    const lf = smooth(16, 7, ld) * 0.85;
    if (lf > 0) { const target = h; h = h * (1 - lf) + Math.max(target, 2.5) * lf; }
  }
  return h;
}

// deterministic RNG
export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// pick a random dry-land spot (not on plaza)
export function randomLandSpot(rng, minH = 1.2, maxH = 60) {
  for (let i = 0; i < 400; i++) {
    const a = rng() * Math.PI * 2, r = 30 + rng() * 200;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const h = heightAt(x, z);
    if (h > minH && h < maxH) return { x: +x.toFixed(2), z: +z.toFixed(2) };
  }
  return { x: 40, z: 40 };
}
