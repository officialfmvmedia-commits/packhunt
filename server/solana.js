// Treasury watcher: polls Solana JSON-RPC for balance + total SOL received (incremental, persisted).
const LAMPORTS = 1e9;
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function startVault({ rpcUrl, treasury, store, intervalMs, onUpdate, log = console.log }) {
  let lastCall = 0, running = false, stopped = false;
  async function rpc(method, params, attempt = 0) {
    const gap = 150 - (Date.now() - lastCall); if (gap > 0) await sleep(gap);
    lastCall = Date.now();
    let res, body;
    try {
      res = await fetch(rpcUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }), signal: AbortSignal.timeout(20000) });
      if (res.status === 429 || res.status >= 500) throw Object.assign(new Error(`HTTP ${res.status}`), { retryAfter: +res.headers.get('retry-after') || 0 });
      body = await res.json();
      if (body.error) { if (body.error.code === 429 || /rate|limit/i.test(body.error.message)) throw new Error('rate limited'); throw Object.assign(new Error(body.error.message), { fatal: true }); }
      return body.result;
    } catch (e) {
      if (e.fatal || attempt >= 6) throw e;
      const wait = Math.min(60000, (e.retryAfter ? e.retryAfter * 1000 : 1000 * 2 ** attempt) + Math.random() * 500);
      await sleep(wait);
      return rpc(method, params, attempt + 1);
    }
  }
  async function poll() {
    if (running || stopped) return; running = true;
    const v = store.db.vault;
    if (v.treasury !== treasury) { // treasury changed: start totals fresh for the new wallet
      Object.assign(v, { treasury, balanceLamports: null, totalReceivedLamports: 0, txCount: 0, newestSig: null, sigs: {} });
      store.save(); log(`[vault] tracking treasury ${treasury}`);
    }
    try {
      const bal = await rpc('getBalance', [treasury, { commitment: 'confirmed' }]);
      v.balanceLamports = bal.value;
      // collect signatures newer than what we've processed (newest-first pages)
      const all = []; let before;
      for (;;) {
        const opts = { limit: 1000, commitment: 'confirmed' }; if (v.newestSig) opts.until = v.newestSig; if (before) opts.before = before;
        const page = await rpc('getSignaturesForAddress', [treasury, opts]);
        all.push(...page);
        if (page.length < 1000 || all.length >= 20000) break;
        before = page[page.length - 1].signature;
      }
      let added = 0;
      for (const s of all.reverse()) { // oldest -> newest so newestSig advances safely
        if (v.sigs[s.signature] !== undefined) { v.newestSig = s.signature; continue; }
        if (s.err) { v.sigs[s.signature] = 0; v.newestSig = s.signature; continue; }
        const tx = await rpc('getTransaction', [s.signature, { encoding: 'json', maxSupportedTransactionVersion: 0, commitment: 'confirmed' }]);
        if (!tx) break; // not indexed yet; retry next poll
        const keys = [...tx.transaction.message.accountKeys, ...(tx.meta?.loadedAddresses?.writable || []), ...(tx.meta?.loadedAddresses?.readonly || [])].map(k => (typeof k === 'string' ? k : k.pubkey));
        const i = keys.indexOf(treasury);
        const delta = i >= 0 && tx.meta ? tx.meta.postBalances[i] - tx.meta.preBalances[i] : 0;
        const inc = delta > 0 ? delta : 0;
        v.sigs[s.signature] = inc; v.totalReceivedLamports += inc; v.txCount++; v.newestSig = s.signature; added += inc;
        store.save();
      }
      v.updatedAt = Date.now(); v.lastError = null; store.save();
      if (added) log(`[vault] +${(added / LAMPORTS).toFixed(4)} SOL received`);
      onUpdate?.();
    } catch (e) {
      v.lastError = e.message; v.lastErrorAt = Date.now(); store.save();
      log(`[vault] RPC error: ${e.message}`);
    } finally { running = false; if (!stopped) setTimeout(poll, intervalMs); }
  }
  setTimeout(poll, 500);
  return { stop() { stopped = true; }, poll };
}
export const toSol = l => (l == null ? null : +(l / LAMPORTS).toFixed(6));
