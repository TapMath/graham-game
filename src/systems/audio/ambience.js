// The ambient soundscape, one bed per level, cross-faded by altitude (so the mix glides on stairs and lifts).
//
//   U   dripping, distant machinery, the air-vent howl
//   G   rain, traffic rumble from above, far sirens, rescue crowd and chatter near the collapse site
//   L1  market murmur, neon buzz, vendors calling
//   L2  traffic whoosh, wind
//   L3  wind, birds (crickets at night), calm
//
// Beds are looping filtered noise (4 s buffers) and a few oscillators, ~10 nodes per level; a bed whose weight stays at
// zero is disconnected so it costs nothing. One-shots (drips, birds, distant voices) go through `sound:emit` so they get
// the full spatial treatment and a ripple where that makes sense.
import { gainNode, osc, filt, noiseSrc } from './synth.js';

const LEVEL_Y = { U: -8, G: 0, L1: 12, L2: 24, L3: 38 };
const NAMES = ['U', 'G', 'L1', 'L2', 'L3'];
const COLLAPSE = { x: -44, z: -30 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

export class Ambience {
  constructor(engine) {
    this.e = engine; this.ctx = engine.ctx; this.game = engine.game;
    this.beds = {}; this.weights = { U: 0, G: 0, L1: 0, L2: 0, L3: 0 }; this.target = { ...this.weights };
    this.timers = {}; this.siteGain = null; this._lastY = null;
    const ctx = this.ctx;
    // per-level trims (dB), measured offline: every bed lands near -26 dBFS RMS at full weight
    const TRIM = { U: -14, G: -9, L1: -3.5, L2: -7, L3: -3.5 };
    for (const n of NAMES) {
      const out = gainNode(ctx, 0), trim = gainNode(ctx, Math.pow(10, TRIM[n] / 20));
      out.connect(trim);
      this.beds[n] = { out, trim, connected: false, idle: 0, nodes: [] };
    }
    this._buildU(); this._buildG(); this._buildL1(); this._buildL2(); this._buildL3();
    this._sirenAt = this.game.time + rand(12, 30);
  }

  // ---- helpers
  _bed(name) { return this.beds[name]; }
  _src(name, type) { const s = noiseSrc(this.ctx, type); s.start(0, s.__off); this.beds[name].nodes.push(s); return s; }
  _osc(name, type, f) { const o = osc(this.ctx, type, f); o.start(); this.beds[name].nodes.push(o); return o; }
  _lfo(name, f, depth, param, type = 'sine') { const o = this._osc(name, type, f), g = gainNode(this.ctx, depth); o.connect(g); g.connect(param); return o; }
  _chain(name, src, filters, gain) {
    const ctx = this.ctx; let node = src;
    for (const [type, f, q] of filters) { const b = filt(ctx, type, f, q); node.connect(b); node = b; }
    const g = gainNode(ctx, gain); node.connect(g); g.connect(this.beds[name].out);
    return g;
  }

  // ---- the beds
  _buildU() {
    const ctx = this.ctx;
    const pink = this._src('U', 'pink');
    // the air-vent howl: two narrow resonances drifting slowly
    const bpA = filt(ctx, 'bandpass', 380, 14), bpB = filt(ctx, 'bandpass', 560, 16), hg = gainNode(ctx, 3.2);
    pink.connect(bpA); pink.connect(bpB); bpA.connect(hg); bpB.connect(hg); hg.connect(this.beds.U.out);
    this._lfo('U', 0.07, 130, bpA.frequency); this._lfo('U', 0.05, 180, bpB.frequency);
    const brown = this._src('U', 'brown');
    this._chain('U', brown, [['lowpass', 130, 0.7]], 0.55);                  // room tone
    const m1 = this._osc('U', 'sine', 48), m2 = this._osc('U', 'sawtooth', 24);
    const mg = this._chain('U', m1, [['lowpass', 150, 0.8]], 0.22);          // distant machinery
    const m2f = filt(ctx, 'lowpass', 120, 0.8); m2.connect(m2f); m2f.connect(mg);
    this._lfo('U', 0.9, 0.12, mg.gain);
    this.timers.drip = this.game.time + rand(0.4, 1.2);
    this.timers.clank = this.game.time + rand(8, 16);
  }

  _buildG() {
    const ctx = this.ctx;
    const pink = this._src('G', 'pink');
    this._chain('G', pink, [['highpass', 900, 0.6], ['lowpass', 7500, 0.6]], 0.3);                            // rain
    const white = this._src('G', 'white');
    const rg = this._chain('G', white, [['bandpass', 3600, 0.5]], 0.035); this._lfo('G', 0.11, 0.015, rg.gain);  // patter
    const brown = this._src('G', 'brown');
    const tg = this._chain('G', brown, [['lowpass', 170, 0.7]], 0.55); this._lfo('G', 0.07, 0.18, tg.gain);   // traffic above
    // crowd and rescue chatter, fed by proximity to the collapse site
    const crowd = this._src('G', 'pink');
    const site = gainNode(ctx, 0); this.siteGain = site; site.connect(this.beds.G.out);
    [[650, 0.8, 4.1], [1350, 1.0, 5.3], [420, 0.7, 2.9], [2000, 1.2, 6.7]].forEach(([f, q, lf]) => {
      const bp = filt(ctx, 'bandpass', f, q), vg = gainNode(ctx, 0.4);
      crowd.connect(bp); bp.connect(vg); vg.connect(site); this._lfo('G', lf, 0.3, vg.gain);
    });
    // a siren, far away: a triangle wail through a heavy low-pass (switched on and off in update)
    const s = this._osc('G', 'triangle', 760), sf = filt(ctx, 'lowpass', 900, 0.8), sg = gainNode(ctx, 0);
    this._lfo('G', 0.2, 170, s.frequency);
    s.connect(sf); sf.connect(sg); sg.connect(this.beds.G.out); this.sirenGain = sg;
    this.timers.mutter = this.game.time + rand(2, 6);
  }

  _buildL1() {
    const ctx = this.ctx;
    const pink = this._src('L1', 'pink');
    const g = gainNode(ctx, 1); g.connect(this.beds.L1.out);
    [[600, 0.7, 3.7], [1250, 0.9, 5.1], [330, 0.6, 2.3], [1900, 1.1, 6.2]].forEach(([f, q, lf]) => {
      const bp = filt(ctx, 'bandpass', f, q), vg = gainNode(ctx, 0.28);
      pink.connect(bp); bp.connect(vg); vg.connect(g); this._lfo('L1', lf, 0.2, vg.gain);
    });
    // neon buzz
    const a = this._osc('L1', 'sawtooth', 100), b = this._osc('L1', 'sawtooth', 100.7);
    const lp = filt(ctx, 'lowpass', 1400, 2), pk = filt(ctx, 'peaking', 1100, 3, 8), ng = gainNode(ctx, 0.028);
    a.connect(lp); b.connect(lp); lp.connect(pk); pk.connect(ng); ng.connect(this.beds.L1.out);
    this._lfo('L1', 6.9, 0.012, ng.gain);
    this.timers.vendor = this.game.time + rand(3, 9);
  }

  _buildL2() {
    const ctx = this.ctx;
    const brown = this._src('L2', 'brown');
    this._chain('L2', brown, [['lowpass', 320, 0.7]], 0.6);                                // road hum
    const pink = this._src('L2', 'pink');
    const wg = this._chain('L2', pink, [['bandpass', 520, 0.7]], 0.4); this._lfo('L2', 0.14, 0.18, wg.gain);   // wind
    const wh = this._src('L2', 'white');
    this._chain('L2', wh, [['highpass', 4200, 0.7]], 0.012);
    this.timers.whoosh = this.game.time + rand(1, 3);
  }

  _buildL3() {
    const ctx = this.ctx;
    const pink = this._src('L3', 'pink');
    const wg = this._chain('L3', pink, [['bandpass', 420, 0.6], ['lowpass', 1400, 0.5]], 0.5); this._lfo('L3', 0.09, 0.2, wg.gain);   // wind
    const sh = this._src('L3', 'pink');
    this._chain('L3', sh, [['highpass', 2600, 0.6]], 0.03);                               // airy shimmer
    // crickets for the night: a high tone chopped by a fast square
    const c = this._osc('L3', 'sine', 4350), cg = gainNode(ctx, 0);
    this._lfo('L3', 16, 0.5, cg.gain, 'square');
    const cEnv = gainNode(ctx, 0); c.connect(cg); cg.connect(cEnv); cEnv.connect(this.beds.L3.out); this.cricketEnv = cEnv;
    this.timers.bird = this.game.time + rand(2, 6);
  }

  // ---- frame
  _levelWeights() {
    const y = this.game.player.pos.y;
    const w = { U: 0, G: 0, L1: 0, L2: 0, L3: 0 };
    const ys = NAMES.map((n) => LEVEL_Y[n]);
    if (y <= ys[0]) w.U = 1;
    else if (y >= ys[4]) w.L3 = 1;
    else for (let i = 0; i < 4; i++) if (y <= ys[i + 1]) { const t = (y - ys[i]) / (ys[i + 1] - ys[i]); w[NAMES[i]] = 1 - t; w[NAMES[i + 1]] = t; break; }
    return w;
  }

  update(dt) {
    const g = this.game, ctx = this.ctx, now = ctx.currentTime;
    const tw = this._levelWeights();
    const k = 1 - Math.exp(-dt / 1.1);                                  // about a 2.5 s cross-fade
    for (const n of NAMES) {
      this.weights[n] += (tw[n] - this.weights[n]) * k;
      const bed = this.beds[n], w = this.weights[n];
      if (w > 0.01 && !bed.connected) { bed.trim.connect(this.e.buses.amb); bed.connected = true; }
      bed.out.gain.setTargetAtTime(w * w * 1.05 + w * 0.0, now, 0.15);
      if (w < 0.004) { bed.idle += dt; if (bed.connected && bed.idle > 3) { try { bed.trim.disconnect(); } catch { /* ok */ } bed.connected = false; } } else bed.idle = 0;
    }
    // crowd near the collapse site (on the ground)
    if (this.siteGain) {
      const p = g.player.pos, d = Math.hypot(p.x - COLLAPSE.x, p.z - COLLAPSE.z);
      const near = this.weights.G > 0.05 ? clamp(1 - (d - 12) / 70, 0, 1) : 0;
      this.siteGain.gain.setTargetAtTime(near * 0.75, now, 0.4);
    }
    // timed one-shots
    const t = g.time, p = g.player.pos;
    const around = (rmin, rmax, dy = 0.4) => { const a = Math.random() * Math.PI * 2, r = rand(rmin, rmax); return { x: p.x + Math.cos(a) * r, y: p.y + dy, z: p.z + Math.sin(a) * r }; };
    const emit = (kind, pos, loud, extra) => g.events.emit('sound:emit', { x: pos.x, y: pos.y, z: pos.z, kind, loudness: loud, ambient: true, ...extra });
    if (this.weights.U > 0.2 && t >= this.timers.drip) { this.timers.drip = t + rand(0.5, 2.6); emit('drip', around(3, 22, -0.2), 0.12 + Math.random() * 0.08); }
    if (this.weights.U > 0.2 && t >= this.timers.clank) { this.timers.clank = t + rand(9, 22); emit('clank', around(40, 70), 0.18); }
    if (this.weights.G > 0.2 && t >= this.timers.mutter) {
      this.timers.mutter = t + rand(2.5, 7);
      const d = Math.hypot(p.x - COLLAPSE.x, p.z - COLLAPSE.z);
      if (d < 80) emit(Math.random() < 0.25 ? 'cough' : 'mutter', { x: COLLAPSE.x + rand(-14, 14), y: 0.8, z: COLLAPSE.z + rand(-10, 10) }, 0.3);
    }
    if (this.weights.L1 > 0.2 && t >= this.timers.vendor) { this.timers.vendor = t + rand(8, 18); emit('vendor-call', around(14, 40, 0.8), 0.32); }
    if (this.weights.L3 > 0.2 && t >= this.timers.bird) {
      this.timers.bird = t + rand(3, 9);
      const day = g.sky ? g.sky.dayFactor : 1;
      if (day > 0.25) emit('bird', around(10, 40, 3), 0.25);
    }
    if (this.cricketEnv) { const day = g.sky ? g.sky.dayFactor : 1; this.cricketEnv.gain.setTargetAtTime((1 - day) * 0.018, now, 1.5); }
    if (this.weights.L2 > 0.2 && t >= this.timers.whoosh) { this.timers.whoosh = t + rand(2.2, 6); this._whoosh(); }
    // sirens on the ground and walkways: on for ~15 s every minute or so
    if (this.sirenGain) {
      if (t >= this._sirenAt) {
        const on = this._sirenOn = !this._sirenOn;
        this._sirenAt = t + (on ? rand(10, 18) : rand(35, 80));
        this.sirenGain.gain.setTargetAtTime(on ? 0.05 : 0, now, 1.2);
      }
    }
  }

  /** A car passes on the flyover: filtered noise sweeps and pans across. */
  _whoosh() {
    const ctx = this.ctx, now = ctx.currentTime, n = noiseSrc(ctx, 'pink'), bp = filt(ctx, 'bandpass', 300, 1.2), g = gainNode(ctx, 0);
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const dir = Math.random() < 0.5 ? -1 : 1, dur = rand(1.6, 2.8);
    bp.frequency.setValueAtTime(260, now); bp.frequency.exponentialRampToValueAtTime(1300, now + dur * 0.5); bp.frequency.exponentialRampToValueAtTime(380, now + dur);
    g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(0.5 * rand(0.5, 1), now + dur * 0.5); g.gain.linearRampToValueAtTime(0, now + dur);
    n.connect(bp); bp.connect(g);
    if (pan) { pan.pan.setValueAtTime(-0.9 * dir, now); pan.pan.linearRampToValueAtTime(0.9 * dir, now + dur); g.connect(pan); pan.connect(this.beds.L2.out); } else g.connect(this.beds.L2.out);
    n.start(now, n.__off); n.stop(now + dur + 0.1);
  }

  state() {
    const r = (v) => Math.round(v * 100) / 100;
    return { weights: Object.fromEntries(NAMES.map((n) => [n, r(this.weights[n])])), connected: NAMES.filter((n) => this.beds[n].connected), siren: !!this._sirenOn };
  }
}
