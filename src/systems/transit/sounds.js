// Sound recipes for the Harbour Line and the lifts' cousins (Phase 8B): the train horn, brake squeal, door buzzer, a level
// crossing's bell, and two loops (the rattle of a running train, the crossing bell). They register themselves into the audio
// engine's tables (KINDS, LOOP_KINDS, ONESHOT, LOOPS) when this module is imported, so `sound:emit {kind:'train-horn'}` and
// `sound:loop {kind:'train'}` just work and show up as ripples. Every recipe is written against a generic BaseAudioContext
// like the rest of synth.js, and all sources have explicit stop times.
import { KINDS, LOOP_KINDS } from '../audio/kinds.js';
import { ONESHOT, LOOPS, osc, gainNode, filt, noiseSrc } from '../audio/synth.js';

const R = (o) => (o && o.rnd) || Math.random;
const stopAt = (nodes, t) => { for (const n of nodes) { try { n.stop(t); } catch { /* already stopped */ } } };

/** A two-tone EMU horn: a 5th apart, a slow swell, a slightly flat second note. */
function trainHorn(ctx, out, t, o) {
  const long = (o && o.long) ? 1.5 : 1.0, base = 392 * (o?.pitch ?? 1);
  const g = gainNode(ctx, 0); g.connect(out);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.55, t + 0.07); g.gain.setValueAtTime(0.55, t + 0.07 + long * 0.55); g.gain.setTargetAtTime(0, t + 0.07 + long * 0.55, 0.09);
  const lp = filt(ctx, 'lowpass', 1900, 0.7); lp.connect(g);
  const nodes = [];
  for (const [f, w] of [[base, 'sawtooth'], [base * 1.5, 'sawtooth'], [base * 0.5, 'square']]) {
    const s = osc(ctx, w, f), sg = gainNode(ctx, w === 'square' ? 0.18 : 0.4);
    s.connect(sg); sg.connect(lp); s.start(t); nodes.push(s);
  }
  stopAt(nodes, t + long + 0.5);
  return long + 0.5;
}

/** Steel on steel: a falling squeal with a bed of hiss. */
function trainBrake(ctx, out, t, o) {
  const r = R(o), dur = 1.7;
  const g = gainNode(ctx, 0); g.connect(out);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.28, t + 0.25); g.gain.setTargetAtTime(0, t + dur * 0.7, 0.18);
  const s = osc(ctx, 'sawtooth', 2900 + r() * 400), bp = filt(ctx, 'bandpass', 2400, 6);
  s.frequency.setValueAtTime(3100 + r() * 300, t); s.frequency.exponentialRampToValueAtTime(1500 + r() * 300, t + dur);
  s.connect(bp); bp.connect(g);
  const n = noiseSrc(ctx, 'white', r), nb = filt(ctx, 'bandpass', 4200, 1.2), ng = gainNode(ctx, 0.25);
  n.connect(nb); nb.connect(ng); ng.connect(g);
  s.start(t); n.start(t, n.__off); stopAt([s, n], t + dur + 0.4);
  return dur + 0.4;
}

/** The door buzzer: three flat beeps. */
function trainDoor(ctx, out, t) {
  const nodes = [];
  for (let i = 0; i < 3; i++) {
    const s = osc(ctx, 'square', 1020), g = gainNode(ctx, 0), lp = filt(ctx, 'lowpass', 2600, 0.7);
    const k = t + i * 0.22;
    g.gain.setValueAtTime(0, k); g.gain.linearRampToValueAtTime(0.16, k + 0.01); g.gain.setValueAtTime(0.16, k + 0.11); g.gain.linearRampToValueAtTime(0, k + 0.125);
    s.connect(lp); lp.connect(g); g.connect(out); s.start(k); nodes.push(s);
  }
  stopAt(nodes, t + 0.9);
  return 0.9;
}

/** A crossing bell: a bright struck tone with a short tail (the loop below repeats it). */
function crossingBell(ctx, out, t) {
  const nodes = [];
  for (const [m, a] of [[1, 0.5], [2.4, 0.22], [4.1, 0.1]]) {
    const s = osc(ctx, 'sine', 1560 * m), g = gainNode(ctx, 0);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a, t + 0.004); g.gain.setTargetAtTime(0, t + 0.004, 0.09 / m);
    s.connect(g); g.connect(out); s.start(t); nodes.push(s);
  }
  stopAt(nodes, t + 0.8);
  return 0.8;
}

/** A taxi horn: one flat, nasal honk. */
function carHorn(ctx, out, t, o) {
  const r = R(o), f = 330 + r() * 70, nodes = [], g = gainNode(ctx, 0); g.connect(out);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.4, t + 0.02); g.gain.setValueAtTime(0.4, t + 0.2); g.gain.setTargetAtTime(0, t + 0.2, 0.03);
  const bp = filt(ctx, 'bandpass', 1100, 1.6); bp.connect(g);
  for (const m of [1, 1.26]) { const s = osc(ctx, 'square', f * m); s.connect(bp); s.start(t); nodes.push(s); }
  stopAt(nodes, t + 0.5);
  return 0.5;
}

// ---------------------------------------------------------------------------------------------------------------- loops
function loopBase(ctx, out) {
  const g = gainNode(ctx, 0), srcs = [];
  g.connect(out); g.gain.setTargetAtTime(1, ctx.currentTime, 0.2);
  return {
    g, srcs, add(n) { srcs.push(n); return n; },
    stop() {
      const now = ctx.currentTime;
      g.gain.cancelScheduledValues(now); g.gain.setTargetAtTime(0, now, 0.18);
      setTimeout(() => { for (const s of srcs) { try { s.stop(); } catch { /* ok */ } } try { g.disconnect(); } catch { /* ok */ } }, 900);
    },
  };
}
const lfo = (ctx, b, f, depth, param, type = 'sine') => { const l = osc(ctx, type, f), lg = gainNode(ctx, depth); l.connect(lg); lg.connect(param); l.start(); b.add(l); return l; };

/** A running EMU: a low rolling rumble, the clack of wheels over rail joints (about 7 a second), a motor whine under it. */
function trainLoop(ctx, out) {
  const b = loopBase(ctx, out);
  const m = b.add(noiseSrc(ctx, 'brown')), mg = gainNode(ctx, 0.9), mlp = filt(ctx, 'lowpass', 220, 0.8);
  m.connect(mlp); mlp.connect(mg); mg.connect(b.g);
  const c = b.add(noiseSrc(ctx, 'white')), cb = filt(ctx, 'bandpass', 1400, 1.3), cg = gainNode(ctx, 0.0);
  c.connect(cb); cb.connect(cg); cg.connect(b.g);
  lfo(ctx, b, 6.8, 0.22, cg.gain, 'square');
  lfo(ctx, b, 0.9, 140, cb.frequency);
  const w = b.add(osc(ctx, 'sawtooth', 190)), wg = gainNode(ctx, 0.035), wlp = filt(ctx, 'lowpass', 900, 0.8);
  w.connect(wlp); wlp.connect(wg); wg.connect(b.g); lfo(ctx, b, 0.3, 24, w.frequency);
  m.start(0, m.__off); c.start(0, c.__off); w.start();
  return b;
}

/** A level crossing's bell: one strike at about 2.4 Hz. */
function crossingLoop(ctx, out) {
  const b = loopBase(ctx, out);
  const s = b.add(osc(ctx, 'sine', 1560)), s2 = b.add(osc(ctx, 'sine', 3750)), g = gainNode(ctx, 0), g2 = gainNode(ctx, 0.35);
  s.connect(g); s2.connect(g2); g2.connect(g); g.connect(b.g);
  lfo(ctx, b, 2.4, 0.34, g.gain, 'square');
  s.start(); s2.start();
  return b;
}

// ---------------------------------------------------------------------------------------------------------------- registration
Object.assign(KINDS, {
  'train-horn': { gain: 0.9, loud: 0.9, gap: 2, max: 2, tone: 'machine', caption: 'A train horn blares', dur: 1.6 },
  'train-brake': { gain: 0.7, loud: 0.7, gap: 3, max: 2, tone: 'machine', dur: 2.1 },
  'train-door': { gain: 0.6, loud: 0.5, gap: 1, max: 2, tone: 'machine', dur: 0.9 },
  'car-horn': { gain: 0.6, loud: 0.5, gap: 1.5, max: 2, tone: 'machine', dur: 0.5 },
  'crossing-bell': { gain: 0.6, loud: 0.5, gap: 0.5, max: 2, tone: 'machine', dur: 0.8 },
});
ONESHOT['train-horn'] = trainHorn;
ONESHOT['train-brake'] = trainBrake;
ONESHOT['train-door'] = trainDoor;
ONESHOT['crossing-bell'] = crossingBell;
ONESHOT['car-horn'] = carHorn;
for (const k of ['train', 'crossing']) if (!LOOP_KINDS.includes(k)) LOOP_KINDS.push(k);
LOOPS.train = (ctx, out, o) => { const g = gainNode(ctx, 0.5); g.connect(out); const h = trainLoop(ctx, g); const stop = h.stop; h.stop = function () { stop.call(this); setTimeout(() => { try { g.disconnect(); } catch { /* ok */ } }, 1000); }; return h; };
LOOPS.crossing = (ctx, out, o) => { const g = gainNode(ctx, 0.22); g.connect(out); const h = crossingLoop(ctx, g); const stop = h.stop; h.stop = function () { stop.call(this); setTimeout(() => { try { g.disconnect(); } catch { /* ok */ } }, 1000); }; return h; };

export const TRANSIT_SOUNDS = true;
