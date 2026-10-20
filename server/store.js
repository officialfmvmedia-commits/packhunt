// Tiny persistent store: one JSON document, atomic writes (tmp + fsync + rename), debounced.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export function openStore(dir) {
  fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
  const file = path.join(dir, 'world.json');
  const fresh = () => ({
    version: 1,
    drops: {},          // dropId -> live (unclaimed) drop
    packs: [],          // { id, name, costSol, tx, at, cards }
    finds: [],          // { id, dropId, card, wallet, name, at, status, note, statusAt }
    removed: [],        // admin-removed drops (audit)
    events: [],         // public feed (latest last)
    vault: { newestSig: null, sigs: {}, totalReceivedLamports: 0, balanceLamports: null, updatedAt: null, lastError: null, txCount: 0 },
    secret: crypto.randomBytes(32).toString('hex'),
    seq: 0,
  });
  let db = fresh();
  for (const f of [file, file + '.bak']) {
    if (!fs.existsSync(f)) continue;
    try { db = { ...fresh(), ...JSON.parse(fs.readFileSync(f, 'utf8')) }; break; }
    catch (e) { console.error(`[store] could not parse ${f}: ${e.message}`); }
  }
  let timer = null, dirty = false;
  function writeNow() {
    clearTimeout(timer); timer = null;
    if (!dirty && fs.existsSync(file)) return;
    dirty = false;
    const tmp = file + '.tmp';
    const fd = fs.openSync(tmp, 'w');
    try { fs.writeSync(fd, JSON.stringify(db)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    if (fs.existsSync(file)) { try { fs.copyFileSync(file, file + '.bak'); } catch {} }
    fs.renameSync(tmp, file);
  }
  const save = () => { dirty = true; if (!timer) timer = setTimeout(writeNow, 400); };
  const id = prefix => `${prefix}${Date.now().toString(36)}${(++db.seq).toString(36)}${crypto.randomBytes(2).toString('hex')}`;
  const event = e => { db.events.push({ ...e, at: Date.now() }); if (db.events.length > 300) db.events.splice(0, db.events.length - 300); save(); return db.events[db.events.length - 1]; };
  writeNow();
  return { get db() { return db; }, save, flush: () => { dirty = true; writeNow(); }, id, event, mediaDir: path.join(dir, 'media'), file };
}
