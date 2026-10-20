// Static file serving with ETag, cache headers and gzip (compressed bodies cached in memory).
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.svg', '.ttf', '.txt']);
const cache = new Map(); // file -> { mtime, size, raw, gz, etag }

function load(file) {
  const st = fs.statSync(file);
  const c = cache.get(file);
  if (c && c.mtime === st.mtimeMs && c.size === st.size) return c;
  const raw = fs.readFileSync(file);
  const ext = path.extname(file).toLowerCase();
  const e = { mtime: st.mtimeMs, size: st.size, raw, gz: COMPRESSIBLE.has(ext) && raw.length > 1024 ? zlib.gzipSync(raw, { level: 9 }) : null, etag: `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`, ext };
  if (raw.length < 4 * 1024 * 1024) cache.set(file, e);
  return e;
}
function cacheControl(rel, ext, immutable) {
  if (immutable) return 'public, max-age=31536000, immutable';
  if (ext === '.html') return 'no-cache';
  if (rel.startsWith('/vendor/') || rel.startsWith('/assets/fonts/')) return 'public, max-age=604800';
  if (['.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico'].includes(ext)) return 'public, max-age=86400';
  return 'public, max-age=300, must-revalidate';
}
export function serveFile(req, res, root, rel, { immutable = false } = {}) {
  const file = path.join(root, path.normalize(rel).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(root + path.sep) && file !== root) { res.writeHead(403); res.end(); return true; }
  let e;
  try { if (!fs.statSync(file).isFile()) return false; e = load(file); } catch { return false; }
  const headers = { 'content-type': MIME[e.ext] || 'application/octet-stream', 'cache-control': cacheControl(rel, e.ext, immutable), etag: e.etag, vary: 'accept-encoding' };
  if (req.headers['if-none-match'] === e.etag) { res.writeHead(304, headers); res.end(); return true; }
  const gzipOk = e.gz && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
  const body = gzipOk ? e.gz : e.raw;
  if (gzipOk) headers['content-encoding'] = 'gzip';
  headers['content-length'] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
  return true;
}
