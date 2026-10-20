#!/usr/bin/env node
// Fulfilment for found cards.
//   node tools/fulfil.mjs list                         # all finds with full winner wallets
//   node tools/fulfil.mjs <findId|dropId> shipped --note "USPS 9400..."
// Statuses: pending | contacted | shipped | sent | delivered | cancelled
import { parseArgs, api } from './_admin-client.mjs';
const a = parseArgs(process.argv.slice(2));
const [id, status] = a._;
if (!id || id === 'list') {
  const { finds } = await api('GET', '/admin/finds');
  if (!finds.length) console.log('No finds yet.');
  for (const f of finds) console.log(`${f.id}  ${new Date(f.at).toISOString()}  ${f.status.padEnd(9)} ${f.card.rarity.padEnd(9)} ${f.card.name}  winner ${f.wallet} (${f.name})${f.note ? '  note: ' + f.note : ''}`);
  process.exit(0);
}
if (!status) { console.error('usage: node tools/fulfil.mjs <findId> <status> [--note "..."]'); process.exit(1); }
const r = await api('POST', `/admin/finds/${encodeURIComponent(id)}`, { status, note: a.note });
console.log(`✓ ${r.find.id} "${r.find.card.name}" -> ${r.find.status}${r.find.note ? ' (' + r.find.note + ')' : ''}`);
