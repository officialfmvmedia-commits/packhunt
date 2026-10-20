// Rename the game everywhere:  node tools/rename-brand.mjs "New Name" [WORD1 WORD2]
// Runtime text comes from site/assets/config.js (BRAND). This also rewrites the static
// fallbacks in HTML <title>/<meta>/og tags so link previews match, then re-renders favicon.svg.
import fs from 'fs';
const [name, w1, w2] = process.argv.slice(2);
if (!name) { console.error('usage: node tools/rename-brand.mjs "New Name" [WORD1 WORD2]'); process.exit(1); }
const words = w1 ? [w1, w2 || ''] : (name.toUpperCase().split(/\s+/).length > 1 ? [name.toUpperCase().split(/\s+/)[0], name.toUpperCase().split(/\s+/).slice(1).join(' ')] : [name.toUpperCase(), '']);
const short = name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
const root = new URL('../site/', import.meta.url);
const cfg = new URL('assets/config.js', root);
const old = (await import(cfg.href)).BRAND;
let c = fs.readFileSync(cfg, 'utf8');
c = c.replace(/name: '[^']*'/, `name: '${name}'`).replace(/wordmark: \[[^\]]*\]/, `wordmark: ['${words[0]}', '${words[1]}']`).replace(/short: '[^']*'/, `short: '${short}'`);
fs.writeFileSync(cfg, c);
for (const f of ['index.html', 'play.html']) {
  const p = new URL(f, root); let h = fs.readFileSync(p, 'utf8');
  h = h.split(old.name).join(name).split(old.name.toUpperCase()).join(name.toUpperCase());
  fs.writeFileSync(p, h);
}
const { logoSVG } = await import(new URL('assets/brand.js?x=' + Date.now(), root).href);
fs.writeFileSync(new URL('favicon.svg', root), logoSVG({ size: 512 }));
console.log(`Renamed "${old.name}" -> "${name}" (wordmark ${words.join(' / ')}). Re-run tools/render-brand.cjs to refresh og.png/logo-512.png.`);
