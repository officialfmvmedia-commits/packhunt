// Shared helpers for admin CLIs. Env: PACKHUNT_URL (default http://localhost:8787), ADMIN_TOKEN (required).
export function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) { const [k, v] = a.slice(2).split('='); const key = k.replace(/-([a-z])/g, (_, c) => c.toUpperCase()); if (v !== undefined) o[key] = v; else if (argv[i + 1] && !argv[i + 1].startsWith('--')) o[key] = argv[++i]; else o[key] = true; }
    else o._.push(a);
  }
  return o;
}
export async function api(method, path, body) {
  const base = (process.env.PACKHUNT_URL || 'http://localhost:8787').replace(/\/$/, '');
  const token = process.env.ADMIN_TOKEN;
  if (!token) { console.error('ADMIN_TOKEN env var is required (same value as on the server).'); process.exit(2); }
  const r = await fetch(base + path, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const j = await r.json().catch(() => ({ error: `HTTP ${r.status}` }));
  if (!r.ok) { console.error(`✗ ${method} ${path}: ${j.error || r.status}`); process.exit(1); }
  return j;
}
