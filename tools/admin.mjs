#!/usr/bin/env node
// node tools/admin.mjs drops            # list open drops (with coordinates)
// node tools/admin.mjs remove <dropId>  # remove an unclaimed drop from the island
// node tools/admin.mjs vault            # public vault numbers
import { parseArgs, api } from './_admin-client.mjs';
const a = parseArgs(process.argv.slice(2)); const [cmd, id] = a._;
if (cmd === 'drops') {
  const r = await api('GET', '/admin/drops');
  console.log(`${r.open.length} open, ${r.found.length} found, ${r.removed.length} removed`);
  for (const d of r.open) console.log(`  ${d.dropId}  ${d.card.rarity.padEnd(9)} ${d.card.name}  @ (${d.x}, ${d.z}) near ${d.place}`);
} else if (cmd === 'remove' && id) {
  const r = await api('DELETE', `/admin/drops/${encodeURIComponent(id)}`); console.log(`✓ removed ${r.removed}`);
} else if (cmd === 'vault') {
  const base = (process.env.PACKHUNT_URL || 'http://localhost:8787').replace(/\/$/, '');
  console.log(await (await fetch(base + '/api/vault')).json());
} else { console.log('usage: admin.mjs drops | remove <dropId> | vault'); process.exit(1); }
