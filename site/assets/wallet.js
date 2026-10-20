// Phantom wallet: connect + sign a server-issued sign-in message. Never requests transactions.
const SESSION = 'ph.session';
export const wallet = { pubkey: null, verified: false, listeners: new Set() };
export function getProvider() { const p = window.phantom?.solana || window.solana; return p && p.isPhantom ? p : null; }
const emit = () => wallet.listeners.forEach(f => f(wallet));
export function onWallet(f) { wallet.listeners.add(f); f(wallet); return () => wallet.listeners.delete(f); }
export const short = pk => (pk ? pk.slice(0, 4) + '…' + pk.slice(-4) : '');
export function getSession() { try { return JSON.parse(localStorage.getItem(SESSION) || 'null'); } catch { return null; } }
export function setVerified(pubkey, session) {
  wallet.pubkey = pubkey; wallet.verified = !!pubkey;
  if (pubkey && session) localStorage.setItem(SESSION, JSON.stringify({ pubkey, session }));
  if (!pubkey) localStorage.removeItem(SESSION);
  emit();
}
function b58(bytes) {
  const A = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  let n = 0n; for (const b of bytes) n = n * 256n + BigInt(b);
  let s = ''; while (n > 0n) { s = A[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b === 0) s = '1' + s; else break; }
  return s;
}
// connect + sign the given message; returns { pubkey, signature } (base58) or { error }
export async function connectAndSign(message) {
  const p = getProvider(); if (!p) return { error: 'no-phantom' };
  try {
    const r = await p.connect();
    const pubkey = r.publicKey.toString();
    if (!p.signMessage) return { error: 'no-sign' };
    const res = await p.signMessage(new TextEncoder().encode(message), 'utf8');
    return { pubkey, signature: b58(new Uint8Array(res?.signature || res)) };
  } catch (e) { return { error: e?.message || 'rejected' }; }
}
export async function disconnect() { try { await getProvider()?.disconnect(); } catch {} setVerified(null); }
