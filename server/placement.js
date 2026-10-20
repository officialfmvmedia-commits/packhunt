// Server-side card placement on valid land.
import { heightAt, LANDMARKS, WORLD } from '../site/assets/terrain.js';

const PLAZA = { name: 'the Spawn Plaza', x: WORLD.plaza.x, z: WORLD.plaza.z };
export const PLACES = [PLAZA, ...LANDMARKS];

function valid(x, z, open) {
  const h = heightAt(x, z);
  if (!(h > 1.6 && h < 42)) return false;                          // dry land, not peaks
  if (Math.hypot(x - PLAZA.x, z - PLAZA.z) < WORLD.plaza.r + 10) return false; // not on spawn plaza
  if (LANDMARKS.some(L => Math.hypot(x - L.x, z - L.z) < (L.id === 'vault' ? 13 : 11))) return false; // not inside landmarks
  // slope check: avoid cliffs
  const s = Math.max(Math.abs(heightAt(x + 2, z) - h), Math.abs(heightAt(x, z + 2) - h));
  if (s > 2.4) return false;
  void open; return true;
}
export function findLandmark(q) {
  if (!q) return null;
  const s = String(q).toLowerCase().replace(/[^a-z]/g, '');
  return PLACES.find(L => (L.id || 'plaza') === s || L.name.toLowerCase().replace(/[^a-z]/g, '').includes(s)) || null;
}
export function nearestPlace(x, z) {
  let best = PLACES[0], bd = Infinity;
  for (const L of PLACES) { const d = Math.hypot(x - L.x, z - L.z); if (d < bd) { bd = d; best = L; } }
  return best;
}
// Pick a spot: valid land, spread from other open drops (relax spacing if crowded).
export function placeCard(openDrops, near = null) {
  const others = Object.values(openDrops);
  for (const minGap of [40, 28, 18, 10, 0]) {
    for (let i = 0; i < 500; i++) {
      let x, z;
      if (near) { const a = Math.random() * Math.PI * 2, r = 16 + Math.random() * 34; x = near.x + Math.cos(a) * r; z = near.z + Math.sin(a) * r; }
      else { const a = Math.random() * Math.PI * 2, r = 40 + Math.sqrt(Math.random()) * 190; x = Math.cos(a) * r; z = Math.sin(a) * r; }
      if (!valid(x, z)) continue;
      if (minGap && others.some(o => Math.hypot(o.x - x, o.z - z) < minGap)) continue;
      return { x: +x.toFixed(2), z: +z.toFixed(2) };
    }
  }
  throw new Error('no valid land spot found');
}
