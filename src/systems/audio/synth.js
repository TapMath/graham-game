// Procedural sound recipes (no audio files anywhere). Every recipe is written against the generic Web Audio
// BaseAudioContext, so the same code plays live and renders offline (tools/audio-check.mjs uses an
// OfflineAudioContext to measure levels).
//
//   ONESHOT[kind](ctx, out, t, o) -> duration in seconds       o = { loud 0..1, pitch (size factor), rnd() }
//   LOOPS[kind](ctx, out, o)      -> { stop(), nodes }          continuous beds for the loop kinds
//   singPhrase(ctx, out, t, o)    -> { dur, notes[] }           Mithi's voice (Raga Bhairav)
//   mouthOrgan(ctx, out, t, o)    -> { dur, notes[] }           Setu's reed
//   RAGA                          Bhairav scale and phrases
//
// Conventions: `out` is a node the recipe connects its (mono) result to; all sources are created with explicit
// start/stop times so nothing leaks; envelopes use setTargetAtTime (no exponential-ramp-to-zero errors).

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------------------------------------------
// building blocks
const noiseCache = new WeakMap();

export function noiseBuffer(ctx, type = 'white') {
  let m = noiseCache.get(ctx);
  if (!m) noiseCache.set(ctx, (m = {}));
  if (m[type]) return m[type];
  const len = Math.floor(ctx.sampleRate * 4);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let seed = type === 'pink' ? 777 : type === 'brown' ? 4242 : 12345;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  if (type === 'pink') {
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < len; i++) {
      const w = rnd();
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
    }
  } else if (type === 'brown') {
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * rnd()) / 1.02; d[i] = last * 3.2; }
  } else {
    for (let i = 0; i < len; i++) d[i] = rnd();
  }
  // seamless loop: cross-fade the tail into the head
  const xf = Math.floor(ctx.sampleRate * 0.05);
  for (let i = 0; i < xf; i++) { const a = i / xf; d[i] = d[i] * a + d[len - xf + i] * (1 - a); }
  return (m[type] = buf);
}

export const gainNode = (ctx, v = 1) => { const g = ctx.createGain(); g.gain.value = v; return g; };
export const osc = (ctx, type, f, detune = 0) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; if (detune) o.detune.value = detune; return o; };
export const filt = (ctx, type, f, q = 1, gain) => {
  const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q;
  if (gain !== undefined) b.gain.value = gain;
  return b;
};
/** A looping noise source starting at a random offset (so two sources never phase-lock). */
export function noiseSrc(ctx, type = 'white', rnd = Math.random) {
  const s = ctx.createBufferSource(); s.buffer = noiseBuffer(ctx, type); s.loop = true; s.__off = rnd() * 3; return s;
}
const startNoise = (s, t, dur) => { s.start(t, s.__off); if (dur !== undefined) s.stop(t + dur); };

/** Percussive amplitude envelope: instant-ish attack, exponential-ish decay (time constant `tau`). Returns the node. */
function burst(ctx, t, peak, attack, tau, out) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setTargetAtTime(0, t + attack, tau);
  if (out) g.connect(out);
  return g;
}
/** Swell envelope: attack, hold, release. */
function swell(ctx, t, peak, a, hold, r, out) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, t + a + hold);
  g.gain.setTargetAtTime(0, t + a + hold, r / 5);
  if (out) g.connect(out);
  return g;
}
const stopAt = (nodes, t) => { for (const n of nodes) { try { n.stop(t); } catch { /* already stopped */ } } };
const semis = (f, st) => f * Math.pow(2, st / 12);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/** Formant bank: parallel band-pass filters fed by `src`, summed into `sum`. Returns the filters (to morph). */
function formants(ctx, src, sum, list) {
  return list.map(([f, g, q]) => {
    const bp = filt(ctx, 'bandpass', f, q), bg = gainNode(ctx, g);
    src.connect(bp); bp.connect(bg); bg.connect(sum);
    return bp;
  });
}
export const VOWEL = {
  a: [[850, 1, 8], [1220, 0.5, 10], [2810, 0.25, 12]],
  o: [[500, 1, 8], [800, 0.5, 9], [2830, 0.15, 12]],
  u: [[350, 1, 8], [640, 0.4, 9], [2700, 0.1, 12]],
  i: [[300, 1, 8], [2300, 0.5, 10], [3000, 0.25, 12]],
  e: [[550, 1, 8], [1900, 0.5, 10], [2700, 0.25, 12]],
};
const morphFormants = (filters, vowel, t, dur) => {
  VOWEL[vowel].forEach(([f], i) => { if (filters[i]) { filters[i].frequency.setValueAtTime(filters[i].frequency.value, t); filters[i].frequency.linearRampToValueAtTime(f, t + dur); } });
};

// ---------------------------------------------------------------------------------------------------------------
// Raga Bhairav (a dawn raga): Sa re(komal) Ga ma Pa dha(komal) Ni Sa'. Semitones from the tonic.
export const RAGA = {
  name: 'Bhairav',
  scale: [0, 1, 4, 5, 7, 8, 11, 12],
  // phrases as [semitone, beats]; 160 bpm (0.375 s a beat), about 4 s each
  bpm: 160,
  phrases: [
    [[0, 1.2], [1, 0.8], [4, 0.8], [5, 0.6], [7, 1.6], [8, 0.8], [7, 0.6], [5, 0.6], [4, 0.6], [1, 0.7], [0, 2.2]],
    [[7, 1], [8, 0.8], [7, 0.8], [5, 0.7], [4, 1.2], [1, 0.8], [4, 0.6], [5, 0.6], [4, 0.6], [1, 0.8], [0, 2.4]],
    [[0, 1], [4, 0.8], [5, 0.8], [7, 1.2], [11, 1.0], [12, 1.6], [11, 0.6], [8, 0.8], [7, 0.8], [5, 0.6], [4, 0.6], [0, 2.2]],
  ],
  tonicVoice: 293.66,    // D4: Mithi
  tonicReed: 587.33,     // D5: Setu's mouth organ, an octave up
};

/**
 * Mithi's voice: a breathy sung phrase with vibrato and a flute-like layer. One graph for the whole phrase, pitch and
 * vowel automated. o = { phrase: [[st, beats]...], tonic, bpm, level }.
 */
export function singPhrase(ctx, out, t0, o = {}) {
  const phrase = o.phrase ?? RAGA.phrases[0], tonic = o.tonic ?? RAGA.tonicVoice, beat = 60 / (o.bpm ?? RAGA.bpm);
  const notes = []; let t = t0 + 0.05;
  for (const [st, b] of phrase) { notes.push({ st, f: semis(tonic, st), t0: t, t1: t + b * beat }); t += b * beat; }
  const end = t + 0.35;
  const dur = end - t0;
  const level = o.level ?? 0.8;

  const sched = (param, mult) => {
    notes.forEach((n, i) => {
      if (i === 0) param.setValueAtTime(n.f * mult * 0.97, n.t0), param.exponentialRampToValueAtTime(n.f * mult, n.t0 + 0.12);
      else {
        const prev = notes[i - 1], slide = Math.abs(n.st - prev.st) <= 1 ? 0.16 : 0.09;     // meend: a longer slide on the small steps
        param.setValueAtTime(prev.f * mult, n.t0 - 0.005);
        param.exponentialRampToValueAtTime(n.f * mult, n.t0 + slide);
      }
    });
  };

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(level, t0 + 0.28);
  notes.forEach((n, i) => { if (i) { amp.gain.setValueAtTime(level * 0.72, n.t0 - 0.02); amp.gain.linearRampToValueAtTime(level, n.t0 + 0.07); } });
  amp.gain.setValueAtTime(level, end - 0.5);
  amp.gain.setTargetAtTime(0, end - 0.5, 0.16);
  const tone = filt(ctx, 'lowpass', 6800, 0.5), hp = filt(ctx, 'highpass', 140, 0.5);
  amp.connect(tone); tone.connect(hp); hp.connect(out);

  // glottal source: saw through three vowel formants
  const src = osc(ctx, 'sawtooth', notes[0].f);
  sched(src.frequency, 1);
  const srcG = gainNode(ctx, 0.5);
  src.connect(srcG);
  const sum = gainNode(ctx, 1.1);
  const fm = formants(ctx, srcG, sum, VOWEL.a);
  const last = notes[notes.length - 1];
  morphFormants(fm, 'o', last.t0 - 0.2, 0.9);                       // the phrase closes on an open "o"
  sum.connect(amp);

  // vibrato (arrives after the first beat, like a real singer settling)
  const lfo = osc(ctx, 'sine', 5.3), lfoG = gainNode(ctx, 0);
  lfo.connect(lfoG); lfoG.connect(src.detune);
  lfoG.gain.setValueAtTime(0, t0); lfoG.gain.linearRampToValueAtTime(20, t0 + 1.1);

  // flute-like layer: pure partials at f, 2f, 3f (a bansuri doubling her)
  const fl = gainNode(ctx, 0.2); fl.connect(amp);
  const flOsc = [[1, 'sine', 0.7], [2, 'sine', 0.3], [3, 'triangle', 0.08]].map(([m, ty, g]) => {
    const oo = osc(ctx, ty, notes[0].f * m); sched(oo.frequency, m);
    const gg = gainNode(ctx, g); oo.connect(gg); gg.connect(fl);
    lfoG.connect(oo.detune);
    return oo;
  });

  // breath: band-passed noise that blooms on each note
  const br = noiseSrc(ctx, 'white'), brBp = filt(ctx, 'bandpass', 3300, 0.7), brG = gainNode(ctx, 0.02);
  br.connect(brBp); brBp.connect(brG); brG.connect(amp);
  notes.forEach((n) => { brG.gain.setValueAtTime(0.02, n.t0 - 0.01); brG.gain.linearRampToValueAtTime(0.075, n.t0 + 0.04); brG.gain.setTargetAtTime(0.02, n.t0 + 0.05, 0.12); });

  const all = [src, lfo, br, ...flOsc];
  src.start(t0); lfo.start(t0); br.start(t0, br.__off); flOsc.forEach((x) => x.start(t0));
  stopAt(all, end + 0.5);
  return { dur, notes, end };
}

/**
 * A child's mouth organ: a few detuned square/saw reeds through a band-pass, a hand-wah and a breath layer.
 * o = { notes: [[hz, seconds]...], weak: 0..1, level }. Weak = wobbly, thinner, ends early on a short wheeze.
 */
export function mouthOrgan(ctx, out, t0, o = {}) {
  const list = o.notes ?? RAGA.phrases[0].slice(0, 6).map(([st, b]) => [semis(RAGA.tonicReed, st), b * 0.42]);
  const weak = o.weak ?? 0, level = o.level ?? 0.5;
  const notes = []; let t = t0 + 0.05;
  for (const [f, d] of list) { notes.push({ f, t0: t, t1: t + d, d }); t += d + 0.03; }
  const end = t + 0.25, dur = end - t0;

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0, t0);
  const reed = filt(ctx, 'bandpass', notes[0].f * 2.2, 0.9), body = filt(ctx, 'peaking', 1900, 1.1, 4), lp = filt(ctx, 'lowpass', 5200, 0.6);
  reed.connect(body); body.connect(lp); lp.connect(amp); amp.connect(out);

  const mk = (type, mult, detuneCents, g) => {
    const oo = osc(ctx, type, notes[0].f * mult, detuneCents), gg = gainNode(ctx, g);
    notes.forEach((n, i) => {
      if (i === 0) oo.frequency.setValueAtTime(n.f * mult, n.t0);
      else { oo.frequency.setValueAtTime(notes[i - 1].f * mult, n.t0 - 0.004); oo.frequency.exponentialRampToValueAtTime(n.f * mult, n.t0 + 0.035); }
    });
    oo.connect(gg); gg.connect(reed);
    return oo;
  };
  const parts = [mk('square', 1, 0, 0.32), mk('square', 1, 9 + weak * 14, 0.28), mk('sawtooth', 1, -7, 0.22), mk('square', 2, 4, 0.1)];

  // hand wah (amplitude 6.2 Hz) and weak pitch wobble
  const wah = osc(ctx, 'sine', 6.2), wahG = gainNode(ctx, 0.12 + weak * 0.12);
  wah.connect(wahG); wahG.connect(amp.gain);
  const wob = osc(ctx, 'sine', 0.55 + weak), wobG = gainNode(ctx, 6 + weak * 40);
  wob.connect(wobG); parts.forEach((p) => wobG.connect(p.detune));

  // per-note articulation
  notes.forEach((n, i) => {
    const peak = level * (1 - weak * 0.35) * (i === notes.length - 1 ? 0.85 : 1);
    amp.gain.setValueAtTime(0, n.t0);
    amp.gain.linearRampToValueAtTime(peak, n.t0 + 0.03);
    amp.gain.setValueAtTime(peak * 0.9, Math.max(n.t0 + 0.04, n.t1 - 0.05));
    amp.gain.setTargetAtTime(0, n.t1 - 0.03, 0.035);
    reed.frequency.setValueAtTime(n.f * 2.2, n.t0);
  });

  // breath noise under every note
  const br = noiseSrc(ctx, 'white'), brBp = filt(ctx, 'bandpass', 2800, 1.1), brG = gainNode(ctx, 0);
  br.connect(brBp); brBp.connect(brG); brG.connect(out);
  notes.forEach((n) => { brG.gain.setValueAtTime(0, n.t0); brG.gain.linearRampToValueAtTime(level * (0.12 + weak * 0.22), n.t0 + 0.03); brG.gain.setTargetAtTime(level * 0.04, n.t0 + 0.05, 0.08); brG.gain.setTargetAtTime(0, n.t1, 0.03); });

  const all = [...parts, wah, wob, br];
  parts.forEach((p) => p.start(t0)); wah.start(t0); wob.start(t0); br.start(t0, br.__off);
  stopAt(all, end + 0.3);
  return { dur, notes, end };
}

// ---------------------------------------------------------------------------------------------------------------
// one-shots
const R = (o) => (o && o.rnd) || Math.random;

function dogBark(ctx, out, t, o, big = 1) {
  const r = R(o), pitch = (o.pitch ?? 1) / big;
  const f0 = 205 * pitch * (0.9 + r() * 0.2);
  const s = osc(ctx, 'sawtooth', f0);
  s.frequency.setValueAtTime(f0, t); s.frequency.exponentialRampToValueAtTime(f0 * 0.58, t + 0.17);
  const n = noiseSrc(ctx, 'white', r), nb = filt(ctx, 'bandpass', 1500, 0.8), ng = gainNode(ctx, 0.35);
  n.connect(nb); nb.connect(ng);
  const mix = gainNode(ctx, 0.55); s.connect(mix);
  const sum = gainNode(ctx, 1);
  const fm = formants(ctx, mix, sum, [[640 * pitch, 1, 5], [1250 * pitch, 0.8, 7], [2400, 0.2, 6]]);
  fm[0].frequency.setValueAtTime(680 * pitch, t); fm[0].frequency.linearRampToValueAtTime(480 * pitch, t + 0.16);
  fm[1].frequency.setValueAtTime(1350 * pitch, t); fm[1].frequency.linearRampToValueAtTime(950 * pitch, t + 0.16);
  ng.connect(sum);
  const e = burst(ctx, t, 1.0, 0.006, 0.07);
  sum.connect(e); e.connect(out);
  s.start(t); startNoise(n, t);
  stopAt([s, n], t + 0.4);
  return 0.35;
}
const bark = (ctx, out, t, o) => {
  const r = R(o), count = 1 + (r() < 0.55 ? 1 : 0) + (r() < 0.25 ? 1 : 0);
  let d = 0;
  for (let i = 0; i < count; i++) { dogBark(ctx, out, t + i * 0.27, { ...o, pitch: (o.pitch ?? 1) * (0.96 + r() * 0.08) }); d = i * 0.27 + 0.35; }
  return d;
};

function growl(ctx, out, t, o) {
  const dur = 1.1 + (o.loud ?? 0.5) * 0.7, pitch = o.pitch ?? 1;
  const s = osc(ctx, 'sawtooth', 62 * pitch), s2 = osc(ctx, 'sawtooth', 65 * pitch);
  const lp = filt(ctx, 'lowpass', 420, 0.8);
  const am = gainNode(ctx, 0.55), lfo = osc(ctx, 'sine', 27), lfoG = gainNode(ctx, 0.45);
  s.connect(lp); s2.connect(lp); lp.connect(am); lfo.connect(lfoG); lfoG.connect(am.gain);
  const n = noiseSrc(ctx, 'brown', R(o)), nb = filt(ctx, 'bandpass', 320, 1.2), ng = gainNode(ctx, 0.5);
  n.connect(nb); nb.connect(ng); ng.connect(am);
  const form = filt(ctx, 'peaking', 700, 2, 9);
  am.connect(form);
  const e = swell(ctx, t, 0.9, 0.18, dur * 0.6, dur * 0.4, out);
  form.connect(e);
  [s, s2, lfo].forEach((x) => x.start(t)); startNoise(n, t);
  stopAt([s, s2, lfo, n], t + dur + 0.2);
  return dur;
}

function whimper(ctx, out, t, o) {
  const pitch = o.pitch ?? 1;
  const s = osc(ctx, 'triangle', 520 * pitch);
  s.frequency.setValueAtTime(520 * pitch, t); s.frequency.linearRampToValueAtTime(880 * pitch, t + 0.25);
  s.frequency.linearRampToValueAtTime(620 * pitch, t + 0.7); s.frequency.linearRampToValueAtTime(900 * pitch, t + 0.95); s.frequency.linearRampToValueAtTime(480 * pitch, t + 1.3);
  const vib = osc(ctx, 'sine', 7), vibG = gainNode(ctx, 25); vib.connect(vibG); vibG.connect(s.detune);
  const f = filt(ctx, 'bandpass', 1100, 1.5);
  const e = swell(ctx, t, 0.7, 0.12, 0.9, 0.35, out);
  s.connect(f); f.connect(e);
  s.start(t); vib.start(t); stopAt([s, vib], t + 1.7);
  return 1.6;
}

function bite(ctx, out, t, o) {
  const n = noiseSrc(ctx, 'white', R(o)), bp = filt(ctx, 'bandpass', 1900, 0.9);
  const e = burst(ctx, t, 0.8, 0.003, 0.03, out);
  n.connect(bp); bp.connect(e);
  const th = osc(ctx, 'sine', 120); th.frequency.setValueAtTime(120, t); th.frequency.exponentialRampToValueAtTime(52, t + 0.14);
  const te = burst(ctx, t, 0.7, 0.004, 0.06, out); th.connect(te);
  startNoise(n, t); th.start(t); stopAt([n, th], t + 0.4);
  growl(ctx, out, t + 0.05, { ...o, loud: 0.4 });
  return 0.9;
}

function droneAlert(ctx, out, t, o) {
  const a = osc(ctx, 'square', 1180), b = osc(ctx, 'square', 1580), lp = filt(ctx, 'lowpass', 3200, 0.7);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  for (let i = 0; i < 4; i++) { const k = t + i * 0.16; g.gain.setValueAtTime(0.35, k); g.gain.setValueAtTime(0, k + 0.1); }
  a.frequency.setValueAtTime(1180, t); a.frequency.setValueAtTime(1580, t + 0.32);
  a.connect(lp); b.connect(lp); lp.connect(g); g.connect(out);
  b.frequency.setValueAtTime(1180 * 1.005, t); b.frequency.setValueAtTime(1580 * 1.005, t + 0.32);
  a.start(t); b.start(t); stopAt([a, b], t + 0.8);
  droneWhirr(ctx, out, t, { ...o, loud: 0.5 });
  return 0.8;
}

function droneWhirr(ctx, out, t, o) {
  const dur = 1.0;
  const a = osc(ctx, 'sawtooth', 176), b = osc(ctx, 'sawtooth', 181);
  a.frequency.setValueAtTime(176, t); a.frequency.linearRampToValueAtTime(205, t + dur * 0.5); a.frequency.linearRampToValueAtTime(170, t + dur);
  const bp = filt(ctx, 'bandpass', 780, 1.1), am = gainNode(ctx, 0.5), lfo = osc(ctx, 'sine', 44), lg = gainNode(ctx, 0.4);
  a.connect(bp); b.connect(bp); bp.connect(am); lfo.connect(lg); lg.connect(am.gain);
  const n = noiseSrc(ctx, 'white', R(o)), nb = filt(ctx, 'bandpass', 2600, 1.4), ng = gainNode(ctx, 0.12);
  n.connect(nb); nb.connect(ng); ng.connect(am);
  const e = swell(ctx, t, 0.55, 0.25, dur * 0.35, dur * 0.4, out);
  am.connect(e);
  [a, b, lfo].forEach((x) => x.start(t)); startNoise(n, t);
  stopAt([a, b, lfo, n], t + dur + 0.3);
  return dur + 0.2;
}

function cameraAlert(ctx, out, t) {
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
  const s = osc(ctx, 'sine', 2480);
  for (let i = 0; i < 3; i++) { const k = t + 0.12 + i * 0.14; g.gain.setValueAtTime(0, k); g.gain.linearRampToValueAtTime(0.55, k + 0.006); g.gain.setTargetAtTime(0, k + 0.05, 0.012); }
  s.connect(g); g.connect(out);
  const servo = osc(ctx, 'sawtooth', 420); servo.frequency.setValueAtTime(420, t); servo.frequency.linearRampToValueAtTime(900, t + 0.18);
  const sb = filt(ctx, 'bandpass', 900, 3), se = swell(ctx, t, 0.22, 0.02, 0.1, 0.1, out);
  servo.connect(sb); sb.connect(se);
  s.start(t); servo.start(t); stopAt([s, servo], t + 0.7);
  return 0.65;
}

function crack(ctx, out, t, o) {
  const r = R(o), n = noiseSrc(ctx, 'white', r), hp = filt(ctx, 'highpass', 1400, 0.7);
  const e = burst(ctx, t, 0.9, 0.002, 0.045, out); n.connect(hp); hp.connect(e);
  startNoise(n, t); stopAt([n], t + 0.4);
  const th = osc(ctx, 'sine', 90); th.frequency.setValueAtTime(90, t); th.frequency.exponentialRampToValueAtTime(38, t + 0.3);
  const te = burst(ctx, t + 0.01, 0.8, 0.005, 0.12, out); th.connect(te); th.start(t); stopAt([th], t + 0.7);
  for (let i = 0; i < 5; i++) {                                 // grit: a spray of small ticks
    const k = t + 0.06 + i * (0.05 + r() * 0.06), tn = noiseSrc(ctx, 'white', r), tb = filt(ctx, 'bandpass', 2200 + r() * 3000, 2);
    const te2 = burst(ctx, k, 0.3 * (1 - i * 0.12), 0.002, 0.012, out); tn.connect(tb); tb.connect(te2); startNoise(tn, k); stopAt([tn], k + 0.1);
  }
  return 0.8;
}

function collapse(ctx, out, t, o) {
  const dur = 3.4, r = R(o);
  const n = noiseSrc(ctx, 'brown', r), lp = filt(ctx, 'lowpass', 220, 0.8);
  lp.frequency.setValueAtTime(260, t); lp.frequency.linearRampToValueAtTime(110, t + dur);
  const e = swell(ctx, t, 1.0, 0.5, 1.2, 1.7, out); n.connect(lp); lp.connect(e);
  const sub = osc(ctx, 'sine', 42); sub.frequency.setValueAtTime(46, t); sub.frequency.linearRampToValueAtTime(30, t + dur);
  const se = swell(ctx, t, 0.9, 0.35, 1.3, 1.7, out); sub.connect(se);
  startNoise(n, t); sub.start(t); stopAt([n, sub], t + dur + 0.3);
  for (let i = 0; i < 14; i++) {                                // masonry clatter
    const k = t + 0.2 + r() * 2.4, tn = noiseSrc(ctx, 'white', r), tb = filt(ctx, 'bandpass', 500 + r() * 2600, 1.2);
    const te = burst(ctx, k, 0.35 * (1 - (k - t) / 3.2), 0.003, 0.03 + r() * 0.05, out); tn.connect(tb); tb.connect(te); startNoise(tn, k); stopAt([tn], k + 0.3);
  }
  return dur + 0.3;
}

/** Voiced mumble: pitched buzz with wobbling pitch, formants hopping between syllables. */
function mutter(ctx, out, t, o) {
  const r = R(o), syl = 4 + Math.floor(r() * 3), base = (o.pitch ?? 1) * (105 + r() * 35);
  const dur = syl * 0.2 + 0.2;
  const s = osc(ctx, 'sawtooth', base), vib = osc(ctx, 'sine', 4.5 + r() * 2), vg = gainNode(ctx, base * 0.07);
  vib.connect(vg); vg.connect(s.frequency);
  const sum = gainNode(ctx, 1), src = gainNode(ctx, 0.5); s.connect(src);
  const fm = formants(ctx, src, sum, [[500, 1, 6], [1200, 0.6, 8], [2500, 0.15, 8]]);
  const amp = ctx.createGain(); amp.gain.setValueAtTime(0, t);
  for (let i = 0; i < syl; i++) {
    const k = t + 0.05 + i * 0.2, v = [[420, 900], [650, 1100], [500, 1700], [380, 800], [700, 1250]][Math.floor(r() * 5)];
    fm[0].frequency.setValueAtTime(v[0], k); fm[1].frequency.setValueAtTime(v[1], k);
    amp.gain.setValueAtTime(0.05, k); amp.gain.linearRampToValueAtTime(0.7 * (0.6 + r() * 0.4), k + 0.05); amp.gain.setTargetAtTime(0.05, k + 0.1, 0.04);
    s.frequency.setValueAtTime(base * (0.92 + r() * 0.2), k);
  }
  amp.gain.setTargetAtTime(0, t + dur - 0.1, 0.05);
  const n = noiseSrc(ctx, 'white', r), nb = filt(ctx, 'bandpass', 1300, 0.9), ng = gainNode(ctx, 0.07);
  n.connect(nb); nb.connect(ng); ng.connect(amp);
  sum.connect(amp); amp.connect(out);
  s.start(t); vib.start(t); startNoise(n, t); stopAt([s, vib, n], t + dur + 0.3);
  return dur + 0.2;
}

function grab(ctx, out, t, o) {
  const r = R(o), n = noiseSrc(ctx, 'white', r), bp = filt(ctx, 'bandpass', 1700, 0.7);
  const e = swell(ctx, t, 0.5, 0.05, 0.12, 0.2, out); n.connect(bp); bp.connect(e);
  const th = osc(ctx, 'sine', 95); th.frequency.exponentialRampToValueAtTime(55, t + 0.2);
  const te = burst(ctx, t + 0.05, 0.6, 0.005, 0.07, out); th.connect(te);
  startNoise(n, t); th.start(t); stopAt([n, th], t + 0.6);
  mutter(ctx, out, t + 0.1, { ...o, pitch: 1.1 });
  return 1.1;
}

/** A cough, 2 to 3 hacks. pitch > 1 is a child. */
function cough(ctx, out, t, o) {
  const r = R(o), pitch = o.pitch ?? 1, hacks = 2 + (r() < 0.5 ? 1 : 0);
  let k = t;
  for (let i = 0; i < hacks; i++) {
    const d = 0.13 + r() * 0.04;
    const s = osc(ctx, 'sawtooth', 170 * pitch), n = noiseSrc(ctx, 'white', r), sg = gainNode(ctx, 0.5), ng = gainNode(ctx, 0.9);
    s.frequency.setValueAtTime(190 * pitch, k); s.frequency.exponentialRampToValueAtTime(110 * pitch, k + d);
    const sum = gainNode(ctx, 1); s.connect(sg); sg.connect(sum); n.connect(ng); ng.connect(sum);
    const fm = filt(ctx, 'bandpass', 950 * Math.sqrt(pitch), 1.1); sum.connect(fm);
    const e = burst(ctx, k, 0.75 * (1 - i * 0.12), 0.01, d * 0.5, out); fm.connect(e);
    s.start(k); startNoise(n, k); stopAt([s, n], k + d + 0.2);
    k += d + 0.1 + r() * 0.05;
  }
  return k - t + 0.2;
}

function wheeze(ctx, out, t, o) {
  const pitch = o.pitch ?? 1.3, dur = 1.5;
  const n = noiseSrc(ctx, 'white', R(o)), bp = filt(ctx, 'bandpass', 1500 * pitch, 6), lfo = osc(ctx, 'sine', 0.9);
  const g = swell(ctx, t, 0.4, 0.5, 0.2, 0.7, out), mod = gainNode(ctx, 0.5), lg = gainNode(ctx, 0.2);
  n.connect(bp); bp.connect(mod); mod.connect(g); lfo.connect(lg); lg.connect(mod.gain);
  const s = osc(ctx, 'sine', 1150 * pitch); s.frequency.linearRampToValueAtTime(1450 * pitch, t + dur);
  const sg = swell(ctx, t + 0.1, 0.05, 0.4, 0.4, 0.5, out); s.connect(sg);
  startNoise(n, t); lfo.start(t); s.start(t); stopAt([n, lfo, s], t + dur + 0.3);
  return dur + 0.2;
}

function splash(ctx, out, t, o) {
  const r = R(o), n = noiseSrc(ctx, 'white', r), bp = filt(ctx, 'bandpass', 3200, 0.9);
  bp.frequency.setValueAtTime(3200, t); bp.frequency.exponentialRampToValueAtTime(700, t + 0.45);
  const e = burst(ctx, t, 0.85, 0.004, 0.12, out); n.connect(bp); bp.connect(e);
  startNoise(n, t); stopAt([n], t + 0.8);
  for (let i = 0; i < 5; i++) {                                 // bubbles
    const k = t + 0.05 + r() * 0.5, f = 380 + r() * 700, b = osc(ctx, 'sine', f);
    b.frequency.setValueAtTime(f, k); b.frequency.exponentialRampToValueAtTime(f * 2.2, k + 0.05);
    const be = burst(ctx, k, 0.22, 0.003, 0.02, out); b.connect(be); b.start(k); stopAt([b], k + 0.2);
  }
  return 0.9;
}

function waterRush(ctx, out, t, o) {
  const dur = 3.0, n = noiseSrc(ctx, 'pink', R(o)), bp = filt(ctx, 'bandpass', 520, 0.6);
  bp.frequency.setValueAtTime(380, t); bp.frequency.linearRampToValueAtTime(900, t + dur * 0.5); bp.frequency.linearRampToValueAtTime(420, t + dur);
  const lo = noiseSrc(ctx, 'brown', R(o)), lg = gainNode(ctx, 0.9);
  const e = swell(ctx, t, 0.9, 0.9, 1.0, 1.1, out); n.connect(bp); bp.connect(e); lo.connect(lg); lg.connect(e);
  startNoise(n, t); startNoise(lo, t); stopAt([n, lo], t + dur + 0.3);
  return dur + 0.3;
}

function guardShout(ctx, out, t, o) {
  const r = R(o), base = 118 + r() * 18;
  const s = osc(ctx, 'sawtooth', base);
  const seq = [[0, 0.22, 1.12, 'a'], [0.3, 0.32, 0.85, 'e']];     // "HEY!" ... "-Ruk!"
  s.frequency.setValueAtTime(base * 1.05, t); s.frequency.linearRampToValueAtTime(base * 1.3, t + 0.2); s.frequency.setValueAtTime(base * 1.15, t + 0.3); s.frequency.linearRampToValueAtTime(base * 0.8, t + 0.62);
  const sum = gainNode(ctx, 1), src = gainNode(ctx, 0.6); s.connect(src);
  const fm = formants(ctx, src, sum, [[780, 1, 7], [1150, 0.7, 9], [2600, 0.25, 9]]);
  fm[0].frequency.setValueAtTime(780, t); fm[0].frequency.setValueAtTime(520, t + 0.3);
  fm[1].frequency.setValueAtTime(1150, t); fm[1].frequency.setValueAtTime(1750, t + 0.3);
  void seq;
  const ws = ctx.createWaveShaper(); const c = new Float32Array(256); for (let i = 0; i < 256; i++) { const x = i / 127.5 - 1; c[i] = Math.tanh(x * 2.6); } ws.curve = c;
  const amp = ctx.createGain(); amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(0.9, t + 0.03); amp.gain.setTargetAtTime(0.35, t + 0.1, 0.05); amp.gain.setValueAtTime(0.1, t + 0.25);
  amp.gain.linearRampToValueAtTime(0.9, t + 0.32); amp.gain.setTargetAtTime(0, t + 0.45, 0.07);
  const n = noiseSrc(ctx, 'white', r), nb = filt(ctx, 'bandpass', 1600, 0.9), ng = gainNode(ctx, 0.14); n.connect(nb); nb.connect(ng); ng.connect(sum);
  const radio = filt(ctx, 'bandpass', 1500, 0.35);
  sum.connect(ws); ws.connect(amp); amp.connect(radio); radio.connect(out);
  s.start(t); startNoise(n, t); stopAt([s, n], t + 0.9);
  return 0.9;
}

/** Wet-ground footstep: a soft thud plus a tiny splash tick. `o.surface`: 'wet' | 'stone' | 'metal'. */
function footstep(ctx, out, t, o) {
  const r = R(o), surf = o.surface ?? 'wet', loud = clamp(o.loud ?? 0.3, 0.05, 1);
  const n = noiseSrc(ctx, 'brown', r), lp = filt(ctx, 'lowpass', 520 + r() * 260, 0.9);
  const e = burst(ctx, t, 1.1 * loud + 0.15, 0.003, 0.028, out); n.connect(lp); lp.connect(e);
  const th = osc(ctx, 'sine', 95 + r() * 25); th.frequency.exponentialRampToValueAtTime(48, t + 0.1);
  const te = burst(ctx, t, 0.55 * loud + 0.1, 0.003, 0.04, out); th.connect(te);
  startNoise(n, t); th.start(t); stopAt([n, th], t + 0.35);
  if (surf !== 'wet' || r() < 0.7) {
    const w = noiseSrc(ctx, 'white', r), wb = filt(ctx, 'bandpass', surf === 'metal' ? 3600 : surf === 'stone' ? 2200 : 2900, 1.4);
    const we = burst(ctx, t + 0.012, (surf === 'wet' ? 0.2 : 0.3) * loud + 0.03, 0.002, 0.014, out); w.connect(wb); wb.connect(we); startNoise(w, t + 0.012); stopAt([w], t + 0.2);
    if (surf === 'metal') { const ring = osc(ctx, 'sine', 780 + r() * 200), re = burst(ctx, t, 0.08 * loud, 0.002, 0.07, out); ring.connect(re); ring.start(t); stopAt([ring], t + 0.4); }
  }
  return 0.35;
}

/** A vendor's sung call: two pitched syllables, "D-shot!" */
function vendorCall(ctx, out, t, o) {
  const r = R(o), base = 150 + r() * 40;
  const s = osc(ctx, 'sawtooth', base);
  s.frequency.setValueAtTime(base, t); s.frequency.linearRampToValueAtTime(base * 1.12, t + 0.28);
  s.frequency.setValueAtTime(base * 1.5, t + 0.4); s.frequency.linearRampToValueAtTime(base * 1.28, t + 0.95);
  const vib = osc(ctx, 'sine', 5.5), vg = gainNode(ctx, 18); vib.connect(vg); vg.connect(s.detune);
  const sum = gainNode(ctx, 1), src = gainNode(ctx, 0.55); s.connect(src);
  const fm = formants(ctx, src, sum, [[320, 1, 7], [2200, 0.5, 9], [3000, 0.2, 9]]);
  fm[0].frequency.setValueAtTime(320, t); fm[0].frequency.setValueAtTime(560, t + 0.4); fm[0].frequency.linearRampToValueAtTime(420, t + 1.0);
  fm[1].frequency.setValueAtTime(2200, t); fm[1].frequency.setValueAtTime(950, t + 0.4); fm[1].frequency.linearRampToValueAtTime(800, t + 1.0);
  const amp = ctx.createGain(); amp.gain.setValueAtTime(0, t);
  amp.gain.linearRampToValueAtTime(0.8, t + 0.04); amp.gain.setTargetAtTime(0.3, t + 0.18, 0.05); amp.gain.setValueAtTime(0.15, t + 0.34);
  amp.gain.linearRampToValueAtTime(0.85, t + 0.43); amp.gain.setValueAtTime(0.7, t + 0.8); amp.gain.setTargetAtTime(0, t + 0.85, 0.07);
  const nz = filt(ctx, 'peaking', 1000, 1.2, 5);
  sum.connect(amp); amp.connect(nz); nz.connect(out);
  const n = noiseSrc(ctx, 'white', r), nb = filt(ctx, 'bandpass', 2500, 1), ng = burst(ctx, t + 0.38, 0.18, 0.004, 0.04, out);
  n.connect(nb); nb.connect(ng); startNoise(n, t + 0.38);
  s.start(t); vib.start(t); stopAt([s, vib, n], t + 1.3);
  return 1.2;
}

function drip(ctx, out, t, o) {
  const r = R(o), f = 1400 + r() * 1500, s = osc(ctx, 'sine', f);
  s.frequency.setValueAtTime(f * 0.8, t); s.frequency.exponentialRampToValueAtTime(f * 1.25, t + 0.025);
  const e = burst(ctx, t, 0.5, 0.002, 0.03, out); s.connect(e); s.start(t); stopAt([s], t + 0.3);
  const n = noiseSrc(ctx, 'white', r), nb = filt(ctx, 'bandpass', 4200, 2), ne = burst(ctx, t, 0.08, 0.001, 0.008, out); n.connect(nb); nb.connect(ne); startNoise(n, t); stopAt([n], t + 0.1);
  return 0.4;
}

function bird(ctx, out, t, o) {
  const r = R(o), count = 2 + Math.floor(r() * 4), base = 2300 + r() * 1400;
  let k = t;
  for (let i = 0; i < count; i++) {
    const f = base * (0.9 + r() * 0.25), s = osc(ctx, 'sine', f), d = 0.07 + r() * 0.07;
    s.frequency.setValueAtTime(f, k); s.frequency.exponentialRampToValueAtTime(f * (r() < 0.5 ? 1.35 : 0.75), k + d);
    const e = burst(ctx, k, 0.35, 0.008, d * 0.5, out); s.connect(e); s.start(k); stopAt([s], k + d + 0.2);
    k += d + 0.05 + r() * 0.08;
  }
  return k - t + 0.2;
}

/** A distant metal clank: a struck pipe, inharmonic partials ringing out. */
function clank(ctx, out, t, o) {
  const r = R(o), f = 180 + r() * 120;
  [[1, 1], [2.76, 0.6], [5.4, 0.35], [8.93, 0.18]].forEach(([m, g], i) => {
    const s = osc(ctx, 'sine', f * m), e = burst(ctx, t, 0.22 * g, 0.002, 0.25 / (1 + i * 0.7), out);
    s.connect(e); s.start(t); stopAt([s], t + 1.6);
  });
  const n = noiseSrc(ctx, 'white', r), nb = filt(ctx, 'bandpass', 2400, 1.5), ne = burst(ctx, t, 0.3, 0.001, 0.01, out);
  n.connect(nb); nb.connect(ne); startNoise(n, t); stopAt([n], t + 0.1);
  return 1.5;
}

/** Cane tap: a short, dry wooden tick. */
function caneTap(ctx, out, t, o) {
  const r = R(o), f = 1500 + r() * 400;
  const s = osc(ctx, 'triangle', f); s.frequency.exponentialRampToValueAtTime(f * 0.55, t + 0.03);
  const e = burst(ctx, t, 0.5, 0.001, 0.016, out); s.connect(e); s.start(t); stopAt([s], t + 0.15);
  const n = noiseSrc(ctx, 'white', r), nb = filt(ctx, 'bandpass', 3000, 1.5), ne = burst(ctx, t, 0.35, 0.001, 0.007, out); n.connect(nb); nb.connect(ne); startNoise(n, t); stopAt([n], t + 0.1);
  return 0.2;
}

function jump(ctx, out, t, o) {
  const n = noiseSrc(ctx, 'pink', R(o)), bp = filt(ctx, 'bandpass', 1100, 0.8), e = swell(ctx, t, 0.35, 0.02, 0.05, 0.1, out);
  n.connect(bp); bp.connect(e); startNoise(n, t); stopAt([n], t + 0.3);
  return 0.25;
}
function land(ctx, out, t, o) {
  const k = clamp(o.loud ?? 0.4, 0.1, 1);
  const n = noiseSrc(ctx, 'brown', R(o)), lp = filt(ctx, 'lowpass', 380, 0.8), e = burst(ctx, t, 1.0 * k + 0.2, 0.004, 0.06, out);
  n.connect(lp); lp.connect(e);
  const th = osc(ctx, 'sine', 80); th.frequency.exponentialRampToValueAtTime(36, t + 0.18);
  const te = burst(ctx, t, 0.85 * k + 0.1, 0.004, 0.09, out); th.connect(te);
  startNoise(n, t); th.start(t); stopAt([n, th], t + 0.6);
  return 0.55;
}
function breath(ctx, out, t, o) {
  const k = clamp(o.loud ?? 0.4, 0.05, 1), n = noiseSrc(ctx, 'pink', R(o)), bp = filt(ctx, 'bandpass', 1500, 0.9), e = swell(ctx, t, 0.26 * k, 0.18, 0.1, 0.28, out);
  n.connect(bp); bp.connect(e); startNoise(n, t); stopAt([n], t + 0.8);
  return 0.7;
}

function gateBuzz(ctx, out, t) {
  const a = osc(ctx, 'square', 110), b = osc(ctx, 'square', 117), lp = filt(ctx, 'lowpass', 1800, 1);
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.5, t + 0.01); g.gain.setValueAtTime(0.5, t + 0.42); g.gain.setTargetAtTime(0, t + 0.45, 0.03);
  a.connect(lp); b.connect(lp); lp.connect(g); g.connect(out);
  a.start(t); b.start(t); stopAt([a, b], t + 0.7);
  return 0.65;
}
function gateChime(ctx, out, t) {
  [[880, 0], [1318.5, 0.18]].forEach(([f, d]) => {
    const s = osc(ctx, 'sine', f), s2 = osc(ctx, 'sine', f * 2.01), e = burst(ctx, t + d, 0.45, 0.004, 0.18, out), g2 = gainNode(ctx, 0.2);
    s.connect(e); s2.connect(g2); g2.connect(e); s.start(t + d); s2.start(t + d); stopAt([s, s2], t + d + 1.2);
  });
  return 1.3;
}
function heal(ctx, out, t) {
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    const s = osc(ctx, 'sine', f), e = burst(ctx, t + i * 0.07, 0.22, 0.01, 0.2, out);
    s.connect(e); s.start(t + i * 0.07); stopAt([s], t + i * 0.07 + 1.1);
  });
  return 1.4;
}
function hurt(ctx, out, t, o) {
  const th = osc(ctx, 'sine', 140); th.frequency.exponentialRampToValueAtTime(55, t + 0.22);
  const te = burst(ctx, t, 0.9, 0.004, 0.09, out); th.connect(te); th.start(t); stopAt([th], t + 0.6);
  const n = noiseSrc(ctx, 'white', R(o)), nb = filt(ctx, 'bandpass', 900, 0.8), ne = burst(ctx, t, 0.4, 0.004, 0.06, out); n.connect(nb); nb.connect(ne); startNoise(n, t); stopAt([n], t + 0.4);
  return 0.5;
}
function heartbeat(ctx, out, t, o) {
  const k = clamp(o.loud ?? 0.4, 0.1, 1);
  [[0, 1], [0.2, 0.75]].forEach(([d, g]) => {
    const s = osc(ctx, 'sine', 62); s.frequency.exponentialRampToValueAtTime(40, t + d + 0.12);
    const e = burst(ctx, t + d, 0.8 * g * k, 0.006, 0.05, out); s.connect(e); s.start(t + d); stopAt([s], t + d + 0.5);
  });
  return 0.7;
}

/** The vision sting: a rushing reversed swell, a falling sine and static. */
function visionSting(ctx, out, t, o) {
  const dur = o.dur ?? 2.6, r = R(o);
  const n = noiseSrc(ctx, 'white', r), bp = filt(ctx, 'bandpass', 400, 1.4);
  bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(5200, t + 0.5); bp.frequency.exponentialRampToValueAtTime(600, t + dur);
  const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(0.7, t + 0.45); e.gain.setTargetAtTime(0.12, t + 0.5, 0.5); e.gain.setTargetAtTime(0, t + dur - 0.5, 0.18);
  n.connect(bp); bp.connect(e); e.connect(out);
  const s = osc(ctx, 'sine', 880); s.frequency.setValueAtTime(880, t + 0.5); s.frequency.exponentialRampToValueAtTime(110, t + dur);
  const s2 = osc(ctx, 'sine', 887); s2.frequency.setValueAtTime(887, t + 0.5); s2.frequency.exponentialRampToValueAtTime(106, t + dur);
  const se = swell(ctx, t + 0.5, 0.28, 0.3, dur * 0.4, dur * 0.4, out); s.connect(se); s2.connect(se);
  for (let i = 0; i < 6; i++) {                                  // digital stutter
    const k = t + 0.5 + r() * (dur - 0.8), gl = osc(ctx, 'square', 200 + Math.floor(r() * 12) * 90), ge = burst(ctx, k, 0.18, 0.001, 0.012, out);
    gl.connect(ge); gl.start(k); stopAt([gl], k + 0.1);
  }
  startNoise(n, t); s.start(t + 0.5); s2.start(t + 0.5); stopAt([n, s, s2], t + dur + 0.3);
  return dur + 0.3;
}

/** PA chime: two soft descending notes through a radio band-pass. */
function paChime(ctx, out, t) {
  const radio = filt(ctx, 'bandpass', 1800, 0.55); radio.connect(out);
  [[783.99, 0], [622.25, 0.34]].forEach(([f, d]) => {
    const s = osc(ctx, 'sine', f), h = osc(ctx, 'sine', f * 2), e = burst(ctx, t + d, 0.55, 0.01, 0.28, radio), hg = gainNode(ctx, 0.25);
    s.connect(e); h.connect(hg); hg.connect(e); s.start(t + d); h.start(t + d); stopAt([s, h], t + d + 1.6);
  });
  return 1.5;
}
/** Radio squelch click (start/end of a transmission). */
function paSquelch(ctx, out, t) {
  const n = noiseSrc(ctx, 'white'), bp = filt(ctx, 'bandpass', 2400, 0.8), e = burst(ctx, t, 0.4, 0.002, 0.03, out);
  n.connect(bp); bp.connect(e); startNoise(n, t); stopAt([n], t + 0.25);
  return 0.2;
}
/** Sterile synthetic babble, the fallback voice when speechSynthesis is missing: flat pitch, one syllable per ~0.19 s. */
function paBabble(ctx, out, t, o) {
  const syl = o.syllables ?? 20, r = R(o), base = 118;
  const s = osc(ctx, 'sawtooth', base), sum = gainNode(ctx, 1), src = gainNode(ctx, 0.5); s.connect(src);
  const fm = formants(ctx, src, sum, [[500, 1, 7], [1400, 0.6, 9], [2500, 0.15, 9]]);
  const amp = ctx.createGain(); amp.gain.setValueAtTime(0, t);
  for (let i = 0; i < syl; i++) {
    const k = t + i * 0.19, v = [[430, 1000], [650, 1150], [500, 1750], [350, 800], [700, 1300], [320, 2200]][Math.floor(r() * 6)];
    fm[0].frequency.setValueAtTime(v[0], k); fm[1].frequency.setValueAtTime(v[1], k);
    if (i % 5 !== 4) { amp.gain.setValueAtTime(0.1, k); amp.gain.linearRampToValueAtTime(0.5, k + 0.04); amp.gain.setTargetAtTime(0.1, k + 0.1, 0.03); } else amp.gain.setTargetAtTime(0, k, 0.02);
    s.frequency.setValueAtTime(base * (1 + (r() - 0.5) * 0.06), k);
  }
  amp.gain.setTargetAtTime(0, t + syl * 0.19, 0.03);
  const radio = filt(ctx, 'bandpass', 1500, 0.4);
  sum.connect(amp); amp.connect(radio); radio.connect(out);
  s.start(t); stopAt([s], t + syl * 0.19 + 0.3);
  return syl * 0.19 + 0.3;
}

/** A coin tossed at a busker's feet: a bright inharmonic ring, a bounce, and a smaller second ring. */
function coin(ctx, out, t) {
  [[0, 1], [0.13, 0.55]].forEach(([d, g]) => {
    [[2793, 1, 0.5], [4186 * 1.012, 0.55, 0.32], [6150, 0.3, 0.18]].forEach(([f, a, dec]) => {
      const s = osc(ctx, 'sine', f * (d ? 1.006 : 1)), e = burst(ctx, t + d, 0.32 * a * g, 0.002, dec * (d ? 0.6 : 1), out);
      s.connect(e); s.start(t + d); stopAt([s], t + d + 1.0);
    });
    const n = noiseSrc(ctx, 'white'), hp = filt(ctx, 'highpass', 5000, 0.7), ne = burst(ctx, t + d, 0.25 * g, 0.001, 0.012, out);
    n.connect(hp); hp.connect(ne); startNoise(n, t + d); stopAt([n], t + d + 0.1);
  });
  return 0.9;
}

const ONESHOT_RAW = {
  bark, growl, bite, whimper,
  drone: droneWhirr, 'drone-alert': droneAlert, 'camera-alert': cameraAlert,
  crack, collapse, mutter, grab, cough, wheeze, splash, 'water-rush': waterRush,
  'guard-shout': guardShout, footstep, 'vendor-call': vendorCall,
  mouthorgan: (ctx, out, t, o) => mouthOrgan(ctx, out, t, { weak: o.weak ?? 0, level: 0.5, notes: o.notes }).dur,
  drip, bird, clank, caneTap, jump, land, breath, 'gate-buzz': gateBuzz, 'gate-chime': gateChime, heal, hurt, heartbeat,
  'vision-sting': visionSting, 'pa-chime': paChime, 'pa-squelch': paSquelch, 'pa-babble': paBabble, coin,
};

// ---------------------------------------------------------------------------------------------------------------
// loops: continuous beds. Each returns { stop(), nodes } and runs until stopped.
function loopBase(ctx, out) {
  const g = gainNode(ctx, 0), srcs = [];
  g.connect(out);
  g.gain.setTargetAtTime(1, ctx.currentTime, 0.15);
  const add = (n) => { srcs.push(n); return n; };
  return {
    g, add, srcs,
    stop() {
      const now = ctx.currentTime;
      g.gain.cancelScheduledValues(now); g.gain.setTargetAtTime(0, now, 0.12);
      setTimeout(() => { for (const s of srcs) { try { s.stop(); } catch { /* ok */ } } try { g.disconnect(); } catch { /* ok */ } }, 700);
    },
  };
}
const lfoTo = (ctx, base, freq, depth, param, type = 'sine') => { const l = osc(ctx, type, freq), lg = gainNode(ctx, depth); l.connect(lg); lg.connect(param); l.start(); base.add(l); return l; };

const LOOPS_RAW = {
  drone(ctx, out) {
    const b = loopBase(ctx, out);
    const a = b.add(osc(ctx, 'sawtooth', 168)), c = b.add(osc(ctx, 'sawtooth', 173));
    const bp = filt(ctx, 'bandpass', 760, 1.0), am = gainNode(ctx, 0.5);
    a.connect(bp); c.connect(bp); bp.connect(am);
    lfoTo(ctx, b, 43, 0.35, am.gain);
    lfoTo(ctx, b, 0.6, 9, a.frequency); lfoTo(ctx, b, 0.6, 9, c.frequency);
    const n = b.add(noiseSrc(ctx, 'white')), nb = filt(ctx, 'bandpass', 2600, 1.4), ng = gainNode(ctx, 0.1);
    n.connect(nb); nb.connect(ng); ng.connect(am); am.connect(b.g);
    a.start(); c.start(); n.start(0, n.__off);
    return b;
  },
  water(ctx, out) {
    const b = loopBase(ctx, out);
    const n = b.add(noiseSrc(ctx, 'pink')), bp = filt(ctx, 'bandpass', 700, 0.5), ng = gainNode(ctx, 0.9);
    n.connect(bp); bp.connect(ng); ng.connect(b.g);
    const m = b.add(noiseSrc(ctx, 'brown')), mg = gainNode(ctx, 0.8); m.connect(mg); mg.connect(b.g);
    lfoTo(ctx, b, 0.31, 0.12, ng.gain); lfoTo(ctx, b, 0.17, 140, bp.frequency);
    n.start(0, n.__off); m.start(0, m.__off);
    return b;
  },
  'smog-wind'(ctx, out) {
    const b = loopBase(ctx, out);
    const n = b.add(noiseSrc(ctx, 'pink')), bp = filt(ctx, 'bandpass', 360, 5), bp2 = filt(ctx, 'bandpass', 900, 3), ng = gainNode(ctx, 1.1);
    n.connect(bp); n.connect(bp2); bp.connect(ng); bp2.connect(ng); ng.connect(b.g);
    lfoTo(ctx, b, 0.13, 150, bp.frequency); lfoTo(ctx, b, 0.09, 260, bp2.frequency); lfoTo(ctx, b, 0.21, 0.25, ng.gain);
    n.start(0, n.__off);
    return b;
  },
  machine(ctx, out) {
    const b = loopBase(ctx, out);
    const a = b.add(osc(ctx, 'sine', 55)), c = b.add(osc(ctx, 'sawtooth', 27.5)), lp = filt(ctx, 'lowpass', 230, 0.8), am = gainNode(ctx, 0.5);
    a.connect(lp); c.connect(lp); lp.connect(am);
    lfoTo(ctx, b, 2.2, 0.4, am.gain, 'square');
    const n = b.add(noiseSrc(ctx, 'white')), nb = filt(ctx, 'bandpass', 900, 2), ng = gainNode(ctx, 0.0);
    n.connect(nb); nb.connect(ng); ng.connect(am); lfoTo(ctx, b, 4.4, 0.05, ng.gain, 'square');
    am.connect(b.g); a.start(); c.start(); n.start(0, n.__off);
    return b;
  },
  crowd(ctx, out) {
    const b = loopBase(ctx, out);
    const n = b.add(noiseSrc(ctx, 'pink')), g = gainNode(ctx, 1);
    [[650, 0.8, 4.1], [1350, 1.0, 5.3], [420, 0.7, 2.9]].forEach(([f, q, lf]) => {
      const bp = filt(ctx, 'bandpass', f, q), vg = gainNode(ctx, 0.5);
      n.connect(bp); bp.connect(vg); vg.connect(g); lfoTo(ctx, b, lf, 0.35, vg.gain);
    });
    g.connect(b.g); n.start(0, n.__off);
    return b;
  },
  'dog-pant'(ctx, out) {
    const b = loopBase(ctx, out);
    const n = b.add(noiseSrc(ctx, 'white')), bp = filt(ctx, 'bandpass', 1500, 1.2), ng = gainNode(ctx, 0.5);
    n.connect(bp); bp.connect(ng); ng.connect(b.g); lfoTo(ctx, b, 3.2, 0.45, ng.gain);
    n.start(0, n.__off);
    return b;
  },
  lift(ctx, out) {
    const b = loopBase(ctx, out);
    const a = b.add(osc(ctx, 'sawtooth', 58)), c = b.add(osc(ctx, 'sawtooth', 116.5)), w = b.add(osc(ctx, 'sine', 310));
    const lp = filt(ctx, 'lowpass', 520, 0.9), wg = gainNode(ctx, 0.05);
    a.connect(lp); c.connect(lp); w.connect(wg); wg.connect(lp); lp.connect(b.g);
    lfoTo(ctx, b, 1.1, 4, w.frequency);
    a.start(); c.start(); w.start();
    return b;
  },
  /** A neon sign's buzz. */
  neon(ctx, out) {
    const b = loopBase(ctx, out);
    const a = b.add(osc(ctx, 'sawtooth', 100)), c = b.add(osc(ctx, 'sawtooth', 100.7)), lp = filt(ctx, 'lowpass', 1500, 2), pk = filt(ctx, 'peaking', 1200, 3, 8);
    a.connect(lp); c.connect(lp); lp.connect(pk); pk.connect(b.g);
    lfoTo(ctx, b, 7.3, 0.2, b.g.gain);
    a.start(); c.start();
    return b;
  },
};

// ---------------------------------------------------------------------------------------------------------------
// Level trims (dB), measured offline with tools/audio-check.mjs: one-shots peak around -6 dBFS at loudness 0.6, beds sit
// near -26 dBFS RMS, so the music (-28), the voice (-21) and the events all land where a mix should.
const TRIM_DB = {
  growl: -14, bite: -13, 'drone-alert': -9, crack: -13, collapse: -9, grab: -9, wheeze: -8, 'gate-buzz': -12, hurt: -7,
  land: -5, whimper: -6, 'camera-alert': -3, coin: -8, bark: 4, mutter: 8, jump: 6, breath: 8, 'pa-babble': 9, 'pa-squelch': 4,
};
const LOOP_TRIM_DB = { drone: -10, water: -8, 'smog-wind': -4, machine: -20, crowd: -6, 'dog-pant': -6, lift: -22, neon: -24 };
const db = (x) => Math.pow(10, x / 20);

export const ONESHOT = {};
for (const [k, fn] of Object.entries(ONESHOT_RAW)) {
  const trim = TRIM_DB[k];
  ONESHOT[k] = trim ? (ctx, out, t, o) => { const g = gainNode(ctx, db(trim)); g.connect(out); return fn(ctx, g, t, o); } : fn;
}
export const LOOPS = {};
for (const [k, fn] of Object.entries(LOOPS_RAW)) {
  const trim = LOOP_TRIM_DB[k] ?? 0;
  LOOPS[k] = (ctx, out, o) => { const g = gainNode(ctx, db(trim)); g.connect(out); const h = fn(ctx, g, o); const stop = h.stop; h.stop = function () { stop.call(this); setTimeout(() => { try { g.disconnect(); } catch { /* ok */ } }, 800); }; return h; };
}
