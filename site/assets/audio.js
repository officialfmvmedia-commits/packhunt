// Quiet, warm ambient (off by default). Everything runs through a low lowpass + low gain.
let ctx, master, lp, on = false, padNodes = [];
function init() {
  if (ctx) return;
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900; lp.Q.value = 0.3;
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -24; comp.ratio.value = 4;
  master = ctx.createGain(); master.gain.value = 0;
  lp.connect(comp); comp.connect(master); master.connect(ctx.destination);
}
function startPad() {
  const notes = [110, 164.81, 220, 277.18]; // A2 E3 A3 C#4 — warm and low
  notes.forEach((f, i) => {
    const o = ctx.createOscillator(); o.type = i % 2 ? 'sine' : 'triangle'; o.frequency.value = f;
    o.detune.value = (i - 1.5) * 4;
    const g = ctx.createGain(); g.gain.value = 0.05 / (i + 1);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.05 + i * 0.03;
    const lg = ctx.createGain(); lg.gain.value = 0.02 / (i + 1);
    lfo.connect(lg); lg.connect(g.gain); lfo.start();
    o.connect(g); g.connect(lp); o.start();
    padNodes.push(o, lfo);
  });
}
export function isOn() { return on; }
export function toggle() {
  init();
  if (ctx.state === 'suspended') ctx.resume();
  if (!padNodes.length) startPad();
  on = !on;
  master.gain.cancelScheduledValues(ctx.currentTime);
  master.gain.linearRampToValueAtTime(on ? 0.22 : 0, ctx.currentTime + 1.2);
  return on;
}
// soft low "bloop" blips for UI moments (only when sound is on)
export function blip(kind = 'pick') {
  if (!on || !ctx) return;
  const seq = { pick: [220, 277.18, 329.63, 440], talk: [196, 246.94], rare: [220, 277.18, 329.63, 415.3, 554.37] }[kind] || [220];
  seq.forEach((f, i) => {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    const g = ctx.createGain(); const t = ctx.currentTime + i * 0.09;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.12, t + 0.03); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
    o.connect(g); g.connect(lp); o.start(t); o.stop(t + 1);
  });
}
