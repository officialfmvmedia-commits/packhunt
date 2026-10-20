// Live world connection with auto-reconnect (exponential backoff + jitter). No offline simulation.
import { NET } from '../config.js';

export class Net {
  constructor() { this.handlers = {}; this.pending = new Map(); this.status = 'connecting'; this.attempt = 0; this.hello = null; this.ws = null; this.id = null; }
  on(ev, f) { (this.handlers[ev] ||= []).push(f); }
  emit(ev, ...a) { (this.handlers[ev] || []).forEach(f => f(...a)); }
  url() { return NET.wsUrl || `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`; }
  setStatus(s, extra) { this.status = s; this.emit('status', s, extra); }
  start(hello) { this.hello = hello; this.connect(); }
  connect() {
    clearTimeout(this.retryT);
    this.setStatus(this.attempt ? 'reconnecting' : 'connecting');
    let ws; try { ws = new WebSocket(this.url()); } catch { return this.retry(); }
    this.ws = ws; let opened = false;
    ws.onopen = () => { opened = true; this.attempt = 0; ws.send(JSON.stringify({ t: 'hello', ...this.hello() })); };
    ws.onmessage = e => {
      let m; try { m = JSON.parse(e.data); } catch { return; }
      if (m.t === 'welcome') { this.id = m.id; this.setStatus('live'); }
      if (m.t === 'full') { this.full = true; this.setStatus('full', m.text); }
      if (m.t === 'claimResult') { const p = this.pending.get(m.dropId); if (p) { this.pending.delete(m.dropId); p(m); } return; }
      this.emit(m.t, m);
    };
    ws.onclose = () => { if (this.ws !== ws) return; this.ws = null; this.emit('disconnected'); for (const [, p] of this.pending) p({ ok: false, reason: 'disconnected' }); this.pending.clear(); this.retry(opened); };
    ws.onerror = () => {};
  }
  retry() {
    this.attempt++;
    const base = this.full ? 15000 : 1000;
    const delay = Math.min(30000, base * 2 ** Math.min(this.attempt - 1, 5)) * (0.7 + Math.random() * 0.6);
    this.full = false;
    this.setStatus('reconnecting', Math.round(delay / 1000));
    this.retryT = setTimeout(() => this.connect(), delay);
  }
  get live() { return this.ws?.readyState === 1 && this.status === 'live'; }
  send(m) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m)); }
  sendPos(p) { if (this.live) this.send({ t: 'pos', ...p }); }
  auth(pubkey, signature) { this.send({ t: 'auth', pubkey, signature }); }
  logout() { this.send({ t: 'logout' }); }
  claim(dropId) {
    if (!this.live) return Promise.resolve({ ok: false, reason: 'offline' });
    return new Promise(res => { this.pending.set(dropId, res); this.send({ t: 'claim', dropId }); setTimeout(() => { if (this.pending.has(dropId)) { this.pending.delete(dropId); res({ ok: false, reason: 'timeout' }); } }, 5000); });
  }
}
