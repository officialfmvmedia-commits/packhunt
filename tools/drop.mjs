#!/usr/bin/env node
// Drop REAL cards into the live island.
//   ADMIN_TOKEN=... PACKHUNT_URL=https://huntpacks.fun node tools/drop.mjs \
//     --name "Charizard ex" --set "Obsidian Flames" --rarity legendary --image ./zard.jpg \
//     --qty 1 --pack "Obsidian Flames Booster" --cost-sol 0.5 --tx <purchase proof> \
//     [--serial PSA-12345] [--value-usd 120] [--near "Signal Tower"]
//   Batch (one pack, many cards):  node tools/drop.mjs --file pack.json
//     pack.json = { "pack": "...", "costSol": 0.5, "tx": "...", "near": null,
//                   "cards": [ { "name": "...", "set": "...", "rarity": "rare", "image": "url-or-path", "qty": 1, "serial": "", "valueUsd": 12 } ] }
// Rarity: common | rare | epic | legendary.  Landmarks: plaza, obelisk, arch, tower, vault, henge (or full names).
import fs from 'fs';
import path from 'path';
import { parseArgs, api } from './_admin-client.mjs';

const a = parseArgs(process.argv.slice(2));
if (a.help || (!a.file && !a.name)) { console.log(fs.readFileSync(new URL(import.meta.url)).toString().split("\n").slice(1, 10).join('\n').replace(/^\/\/ ?/gm, '')); process.exit(a.help ? 0 : 1); }
function imageField(img, baseDir = process.cwd()) {
  if (!img) return {};
  if (/^https?:\/\//i.test(img)) return { image: img };
  const f = path.resolve(baseDir, img);
  if (!fs.existsSync(f)) { console.error(`image not found: ${f}`); process.exit(1); }
  return { imageData: fs.readFileSync(f).toString('base64') };
}
let body;
if (a.file) {
  const f = path.resolve(a.file); const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  body = { pack: j.pack, costSol: j.costSol, tx: j.tx, near: j.near, cards: (j.cards || []).map(c => ({ ...c, image: undefined, ...imageField(c.image, path.dirname(f)) })) };
} else {
  body = { pack: a.pack, costSol: a.costSol, tx: a.tx, near: a.near, cards: [{ name: a.name, set: a.set, rarity: a.rarity, qty: a.qty, serial: a.serial || a.cert, valueUsd: a.valueUsd, ...imageField(a.image) }] };
}
if (a.dryRun) { console.log(JSON.stringify({ ...body, cards: body.cards.map(c => ({ ...c, imageData: c.imageData ? `<${c.imageData.length} b64 chars>` : undefined })) }, null, 2)); process.exit(0); }
const r = await api('POST', '/admin/drop', body);
console.log(`✓ ${r.announce}`);
for (const d of r.drops) console.log(`  ${d.dropId}  ${d.rarity.padEnd(9)} ${d.name}  @ (${d.x}, ${d.z}) near ${d.place}${d.image ? '  img ' + d.image : ''}`);
console.log(`  pack ${r.pack.id} "${r.pack.name}" cost ${r.pack.costSol} SOL`);
