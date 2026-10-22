// Phase 6b sound design for the story layer: the sounds the Phase 5 recipes do not cover (sirens, rumbles, a roar,
// car alarms, fireworks, tinnitus, a heartbeat that stops, paper). Everything is synthesised with Web Audio into the
// Phase 5 buses (non-spatial), and every call is a harmless no-op when the context cannot run (headless, muted, no
// audio system). Nothing here may throw into the game loop.
//
//   const sfx = new StorySfx(game);
//   sfx.siren(seconds, {gain, far})      two-tone municipal siren, swelling in and out
//   sfx.rumble(seconds, gain)           low earth rumble
//   sfx.roar(seconds, gain)             the collapse: a rising roar, cracks, a long low boom
//   sfx.crash(gain)                     one heavy impact
//   sfx.carAlarm(seconds, gain)         the whoop of a car alarm, far off
//   sfx.cries(seconds, gain)            distant voices crying out (formant sweeps)
//   sfx.ring(seconds, gain)             tinnitus after the blast
//   sfx.heartbeat(bpm, beats, gain)     lub-dub; `stop` ends it on a held silence
//   sfx.paper(gain) / sfx.tick(gain) / sfx.static(seconds, gain)
//   sfx.firework(distance, muffled)     a launch whistle, a boom after the light, then crackle
//   sfx.wind(seconds, gain)             a clean sea wind for the dawn
//   sfx.swell(seconds, gain, root)      a warm pad swell (the sunrise)
import { filt, gainNode, noiseSrc, osc } from '../audio/synth.js';

const rnd = (a, b) => a + Math.random() * (b - a);

export class StorySfx {
  constructor(game) { this.game = game; }

  get ctx() { const a = this.game.audio; return a && a.running() && !a.muted ? a.ctx : null; }
  _out() { return this.game.audio.selfIn; }
  _verb() { return this.game.audio.reverbIn; }

  /** run `fn(ctx, out, t)` guarded; returns true if it ran */
  _do(fn) {
    const ctx = this.ctx;
    if (!ctx) return false;
    try { fn(ctx, this._out(), ctx.currentTime + 0.02); return true; } catch { return false; }
  }

  /** attack-hold-release gain node */
  _env(ctx, t, peak, a, hold, r, out) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.setTargetAtTime(0, t + a + hold, r / 5);
    g.connect(out);
    return g;
  }
  _stop(nodes, t) { for (const n of nodes) { try { n.stop(t); } catch { /* ok */ } } }

  siren(seconds = 8, { gain = 0.22, far = true } = {}) {
    return this._do((ctx, out, t) => {
      const o1 = osc(ctx, 'sawtooth', 640), o2 = osc(ctx, 'square', 642);
      const lp = filt(ctx, 'lowpass', far ? 1700 : 3200, 0.6), g = this._env(ctx, t, gain, 1.2, Math.max(0, seconds - 3.2), 2.0, out);
      // wail: slow triangle sweep 520..900 Hz, a second voice a fourth away on a different period
      for (const [o, base] of [[o1, 1], [o2, 1.003]]) {
        const lfo = osc(ctx, 'triangle', 0.32 * base), lg = gainNode(ctx, 190);
        lfo.connect(lg); lg.connect(o.frequency); lfo.start(t); lfo.stop(t + seconds + 1);
        o.frequency.value = 700;
      }
      const sum = gainNode(ctx, 0.5); o1.connect(sum); o2.connect(sum); sum.connect(lp); lp.connect(g);
      const send = gainNode(ctx, 0.6); lp.connect(send); send.connect(this._verb());
      o1.start(t); o2.start(t); this._stop([o1, o2], t + seconds + 1.2);
    });
  }

  rumble(seconds = 4, gain = 0.5) {
    return this._do((ctx, out, t) => {
      const n = noiseSrc(ctx, 'brown'), lp = filt(ctx, 'lowpass', 140, 0.7), g = this._env(ctx, t, gain, 0.6, Math.max(0, seconds - 1.8), 1.6, out);
      const sub = osc(ctx, 'sine', 34), sg = gainNode(ctx, 0.5);
      n.connect(lp); lp.connect(g); sub.connect(sg); sg.connect(g);
      n.start(t, n.__off); sub.start(t); this._stop([n, sub], t + seconds + 0.5);
    });
  }

  crash(gain = 0.8) {
    return this._do((ctx, out, t) => {
      const n = noiseSrc(ctx, 'white'), bp = filt(ctx, 'lowpass', 2400, 0.5), g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.008); g.gain.setTargetAtTime(0, t + 0.01, 0.16);
      bp.frequency.setValueAtTime(3200, t); bp.frequency.setTargetAtTime(240, t, 0.2);
      n.connect(bp); bp.connect(g); g.connect(out);
      const send = gainNode(ctx, 0.5); g.connect(send); send.connect(this._verb());
      const thump = osc(ctx, 'sine', 90), tg = ctx.createGain();
      thump.frequency.setValueAtTime(95, t); thump.frequency.exponentialRampToValueAtTime(28, t + 0.6);
      tg.gain.setValueAtTime(0, t); tg.gain.linearRampToValueAtTime(gain * 1.1, t + 0.01); tg.gain.setTargetAtTime(0, t + 0.02, 0.28);
      thump.connect(tg); tg.connect(out);
      n.start(t, n.__off); thump.start(t); this._stop([n, thump], t + 2.4);
    });
  }

  roar(seconds = 6, gain = 0.8) {
    this.rumble(seconds + 1, gain * 0.9);
    return this._do((ctx, out, t) => {
      // the groan of tearing steel and concrete: noise through a band-pass sweeping down, plus a low saw falling
      const n = noiseSrc(ctx, 'pink'), bp = filt(ctx, 'bandpass', 900, 0.8), g = this._env(ctx, t, gain * 0.7, seconds * 0.35, seconds * 0.35, seconds * 0.4, out);
      bp.frequency.setValueAtTime(1400, t); bp.frequency.exponentialRampToValueAtTime(180, t + seconds);
      const sw = osc(ctx, 'sawtooth', 70), sg = gainNode(ctx, 0.25), swlp = filt(ctx, 'lowpass', 220, 0.8);
      sw.frequency.setValueAtTime(78, t); sw.frequency.exponentialRampToValueAtTime(34, t + seconds);
      n.connect(bp); bp.connect(g); sw.connect(swlp); swlp.connect(sg); sg.connect(g);
      const send = gainNode(ctx, 0.55); g.connect(send); send.connect(this._verb());
      n.start(t, n.__off); sw.start(t); this._stop([n, sw], t + seconds + 1.5);
      // crack-and-fall impacts scattered through it
      const hits = Math.floor(seconds * 2.2);
      for (let i = 0; i < hits; i++) setTimeout(() => this.crash(rnd(0.25, 0.6)), 150 + (i / hits) * seconds * 900 + rnd(0, 250));
    });
  }

  carAlarm(seconds = 8, gain = 0.1) {
    return this._do((ctx, out, t) => {
      const o = osc(ctx, 'square', 880), lp = filt(ctx, 'lowpass', 2600, 0.7), g = this._env(ctx, t, gain, 0.05, seconds - 0.4, 0.8, out);
      const lfo = osc(ctx, 'sawtooth', 2.1), lg = gainNode(ctx, 330);
      lfo.connect(lg); lg.connect(o.frequency); o.connect(lp); lp.connect(g);
      const send = gainNode(ctx, 0.7); lp.connect(send); send.connect(this._verb());
      o.start(t); lfo.start(t); this._stop([o, lfo], t + seconds + 1);
    });
  }

  cries(seconds = 6, gain = 0.2) {
    return this._do((ctx, out, t) => {
      const n = Math.max(3, Math.floor(seconds * 1.4));
      for (let i = 0; i < n; i++) {
        const t0 = t + (i / n) * seconds + rnd(0, 0.5), f0 = rnd(280, 520), d = rnd(0.7, 1.5);
        const s = osc(ctx, 'sawtooth', f0), g = this._env(ctx, t0, gain * rnd(0.4, 1), 0.08, d * 0.5, d * 0.5, out);
        s.frequency.setValueAtTime(f0, t0); s.frequency.linearRampToValueAtTime(f0 * rnd(1.2, 1.6), t0 + d * 0.5); s.frequency.linearRampToValueAtTime(f0 * 0.8, t0 + d);
        const sum = gainNode(ctx, 1);
        for (const [f, q, gg] of [[800, 6, 1], [1250, 8, 0.7], [2800, 6, 0.25]]) { const b = filt(ctx, 'bandpass', f, q), bg = gainNode(ctx, gg); s.connect(b); b.connect(bg); bg.connect(sum); }
        sum.connect(g);
        const send = gainNode(ctx, 0.8); g.connect(send); send.connect(this._verb());
        s.start(t0); s.stop(t0 + d + 0.4);
      }
    });
  }

  ring(seconds = 5, gain = 0.07) {
    return this._do((ctx, out, t) => {
      const a = osc(ctx, 'sine', 4300), b = osc(ctx, 'sine', 5120), g = this._env(ctx, t, gain, 0.05, Math.max(0, seconds - 2.5), 2.4, out);
      a.connect(g); b.connect(g); a.start(t); b.start(t); this._stop([a, b], t + seconds + 1);
    });
  }

  heartbeat(bpm = 70, beats = 6, gain = 0.7) {
    const period = 60 / bpm;
    for (let i = 0; i < beats; i++) {
      setTimeout(() => this._do((ctx, out, t) => this._thump(ctx, out, t, gain)), i * period * 1000);
      setTimeout(() => this._do((ctx, out, t) => this._thump(ctx, out, t, gain * 0.7)), (i * period + period * 0.28) * 1000);
    }
  }
  _thump(ctx, out, t, gain) {
    const o = osc(ctx, 'sine', 62), g = ctx.createGain();
    o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(38, t + 0.14);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.012); g.gain.setTargetAtTime(0, t + 0.02, 0.07);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + 0.6);
  }

  paper(gain = 0.35) {
    return this._do((ctx, out, t) => {
      const n = noiseSrc(ctx, 'white'), hp = filt(ctx, 'highpass', 2500, 0.6), g = ctx.createGain();
      g.gain.setValueAtTime(0, t);
      for (let i = 0; i < 6; i++) { const c = t + i * 0.05 + rnd(0, 0.03); g.gain.setValueAtTime(0.001, c); g.gain.linearRampToValueAtTime(gain * rnd(0.3, 1), c + 0.008); g.gain.setTargetAtTime(0.001, c + 0.01, 0.025); }
      n.connect(hp); hp.connect(g); g.connect(out); n.start(t, n.__off); n.stop(t + 0.5);
    });
  }

  tick(gain = 0.25) {
    return this._do((ctx, out, t) => {
      const o = osc(ctx, 'square', 1500), g = ctx.createGain();
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.002); g.gain.setTargetAtTime(0, t + 0.004, 0.012);
      const bp = filt(ctx, 'bandpass', 1500, 4); o.connect(bp); bp.connect(g); g.connect(out); o.start(t); o.stop(t + 0.15);
    });
  }

  static(seconds = 1.5, gain = 0.2) {
    return this._do((ctx, out, t) => {
      const n = noiseSrc(ctx, 'white'), bp = filt(ctx, 'bandpass', 2200, 0.5), g = this._env(ctx, t, gain, 0.05, Math.max(0, seconds - 0.3), 0.3, out);
      for (let k = 0; k < seconds * 12; k++) { const c = t + rnd(0, seconds); g.gain.setValueAtTime(gain * 0.3, c); g.gain.linearRampToValueAtTime(gain, c + 0.01); }
      n.connect(bp); bp.connect(g); n.start(t, n.__off); n.stop(t + seconds + 0.5);
    });
  }

  /** `distance` in metres (delays the boom by distance / 340 s, capped), `muffled` for the ground level. */
  firework(distance = 120, muffled = false, gain = 0.5) {
    const delay = Math.min(1.1, distance / 340);
    return this._do((ctx, out, t) => {
      const lpHz = muffled ? 420 : 5200, vol = gain * (muffled ? 0.55 : 1) / (1 + distance / 220);
      // launch whistle
      const w = osc(ctx, 'sine', 700), wg = ctx.createGain();
      w.frequency.setValueAtTime(600, t); w.frequency.exponentialRampToValueAtTime(2100, t + 0.7);
      wg.gain.setValueAtTime(0, t); wg.gain.linearRampToValueAtTime(vol * 0.12, t + 0.08); wg.gain.setTargetAtTime(0, t + 0.5, 0.1);
      const wl = filt(ctx, 'lowpass', muffled ? 700 : 4200, 0.5); w.connect(wl); wl.connect(wg); wg.connect(out); w.start(t); w.stop(t + 1.2);
      // the boom
      const tb = t + 0.75 + delay;
      const n = noiseSrc(ctx, 'white'), lp = filt(ctx, 'lowpass', lpHz, 0.5), g = ctx.createGain();
      lp.frequency.setValueAtTime(lpHz, tb); lp.frequency.setTargetAtTime(Math.min(lpHz, 260), tb, 0.25);
      g.gain.setValueAtTime(0, tb); g.gain.linearRampToValueAtTime(vol, tb + 0.006); g.gain.setTargetAtTime(0, tb + 0.01, 0.18);
      n.connect(lp); lp.connect(g); g.connect(out);
      const send = gainNode(ctx, muffled ? 0.8 : 0.6); g.connect(send); send.connect(this._verb());
      const th = osc(ctx, 'sine', 80), tg = ctx.createGain();
      th.frequency.setValueAtTime(90, tb); th.frequency.exponentialRampToValueAtTime(36, tb + 0.4);
      tg.gain.setValueAtTime(0, tb); tg.gain.linearRampToValueAtTime(vol * 0.9, tb + 0.01); tg.gain.setTargetAtTime(0, tb + 0.02, 0.18);
      th.connect(tg); tg.connect(out);
      n.start(tb, n.__off); th.start(tb); this._stop([n, th], tb + 2.4);
      // crackle: a scatter of tiny ticks
      if (!muffled) {
        const hp = filt(ctx, 'highpass', 3500, 0.6), cg = ctx.createGain(); cg.gain.setValueAtTime(0, tb);
        const c = noiseSrc(ctx, 'white'); c.connect(hp); hp.connect(cg); cg.connect(out);
        const cn = 14 + Math.floor(Math.random() * 14);
        for (let i = 0; i < cn; i++) { const ct = tb + 0.1 + Math.pow(Math.random(), 1.4) * 1.5; cg.gain.setValueAtTime(0.001, ct); cg.gain.linearRampToValueAtTime(vol * rnd(0.12, 0.38), ct + 0.003); cg.gain.setTargetAtTime(0.001, ct + 0.004, 0.012); }
        c.start(tb, c.__off); c.stop(tb + 2);
      }
    });
  }

  wind(seconds = 12, gain = 0.2) {
    return this._do((ctx, out, t) => {
      const n = noiseSrc(ctx, 'pink'), bp = filt(ctx, 'bandpass', 520, 0.6), g = this._env(ctx, t, gain, seconds * 0.3, seconds * 0.4, seconds * 0.3, out);
      const lfo = osc(ctx, 'sine', 0.13), lg = gainNode(ctx, 180); lfo.connect(lg); lg.connect(bp.frequency);
      n.connect(bp); bp.connect(g); n.start(t, n.__off); lfo.start(t); this._stop([n, lfo], t + seconds + 1);
    });
  }

  /** The sunrise swell: a warm open chord of detuned triangles that blooms and lingers. */
  swell(seconds = 10, gain = 0.2, root = 196) {
    return this._do((ctx, out, t) => {
      const lp = filt(ctx, 'lowpass', 600, 0.5), g = this._env(ctx, t, gain, seconds * 0.55, seconds * 0.15, seconds * 0.3, out);
      lp.frequency.setValueAtTime(500, t); lp.frequency.linearRampToValueAtTime(3600, t + seconds * 0.6);
      const nodes = [];
      for (const [mult, det] of [[1, -6], [1, 7], [1.5, 3], [2, -4], [2.5, 5], [3, 0], [4, 8]]) {
        const o = osc(ctx, 'triangle', root * mult, det), og = gainNode(ctx, 0.2 / Math.sqrt(mult));
        o.connect(og); og.connect(lp); o.start(t); nodes.push(o);
      }
      lp.connect(g);
      const send = gainNode(ctx, 0.9); g.connect(send); send.connect(this._verb());
      this._stop(nodes, t + seconds + 1);
    });
  }

  /** A rising mouth-organ-like reed tone that rides under the reunion (not Setu's own: that one is the Phase 5 recipe). */
  breath(gain = 0.25) {
    return this._do((ctx, out, t) => {
      const n = noiseSrc(ctx, 'white'), bp = filt(ctx, 'bandpass', 1200, 0.7), g = this._env(ctx, t, gain, 0.4, 0.2, 0.9, out);
      n.connect(bp); bp.connect(g); n.start(t, n.__off); n.stop(t + 2);
    });
  }
}
