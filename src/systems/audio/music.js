// Generative music: slow, sad analogue-synth pads (Vangelis, Blade Runner) with now and then a detuned electric-piano
// arpeggio or a mellotron line (OK Computer). It never loops: each chord is chosen from the mood of the moment.
//
// Mood inputs: the hour of day (dawn lifts, dusk warms, night goes low and dark), the level (muffled below, open above),
// Setu's breath (under 25 % the harmony sours and the arpeggios thin out; under 10 % only a low throb remains; once he is
// found the music lifts). All of it is built from a handful of oscillators per chord and cleaned up when each chord ends.
import { gainNode, osc, filt } from './synth.js';

const D3 = 146.83;
const hz = (semi) => D3 * Math.pow(2, semi / 12);

// voicings: semitones above the root (open, pad-like). 'e' = extra colour notes for the arpeggio
const TYPES = {
  m7: { v: [0, 7, 10, 15, 19], arp: [0, 7, 10, 14, 15, 19, 22] },
  maj7: { v: [0, 7, 11, 16, 19], arp: [0, 4, 7, 11, 14, 16, 19] },
  sus2: { v: [0, 7, 14, 19], arp: [0, 2, 7, 9, 14, 19] },
  add9: { v: [0, 7, 14, 16, 19], arp: [0, 4, 7, 9, 14, 16, 19] },
  sus4: { v: [0, 5, 10, 17, 19], arp: [0, 5, 7, 10, 12, 17] },
  bad: { v: [0, 6, 10, 15, 18], arp: [0, 3, 6, 10, 13] },          // the sour one: tritone and b9 colour
};
const NAME = { m7: 'm7', maj7: 'maj7', sus2: 'sus2', add9: 'add9', sus4: 'sus4', bad: 'm7b5' };
const ROOT_NAME = { 0: 'D', '-1': 'C#', '-4': 'Bb', '-7': 'G', '-5': 'A', '-2': 'C', '-9': 'F', 5: 'G', '-3': 'B' };

const SETS = {
  dawn: [[0, 'sus2'], [-4, 'maj7'], [-9, 'add9'], [-2, 'sus2']],
  day: [[0, 'm7'], [-4, 'maj7'], [-9, 'add9'], [-5, 'm7'], [-7, 'm7'], [-4, 'maj7']],
  dusk: [[0, 'm7'], [-7, 'm7'], [-4, 'maj7'], [-5, 'sus4']],
  night: [[0, 'm7'], [-4, 'maj7'], [-7, 'm7'], [-5, 'm7'], [-2, 'sus2']],
  hope: [[0, 'sus2'], [5, 'add9'], [-4, 'maj7'], [-9, 'add9']],
  sour: [[0, 'bad'], [-7, 'm7'], [-1, 'bad'], [0, 'm7']],
};

export class Music {
  constructor(engine) {
    this.e = engine; this.ctx = engine.ctx; this.game = engine.game;
    const ctx = this.ctx;
    this.level = gainNode(ctx, 1); this.level.connect(engine.buses.music);
    this.pads = gainNode(ctx, 1); this.pads.connect(this.level);
    this.ep = gainNode(ctx, 0.6); this.ep.connect(this.level);
    // echo and reverb for the keys: a dark feedback delay
    const dly = ctx.createDelay(1.5); dly.delayTime.value = 0.47;
    const fb = gainNode(ctx, 0.38), dlp = filt(ctx, 'lowpass', 1800, 0.5), dg = gainNode(ctx, 0.5);
    this.ep.connect(dly); dly.connect(dlp); dlp.connect(fb); fb.connect(dly); dlp.connect(dg); dg.connect(this.level);
    const send = gainNode(ctx, 0.45); this.ep.connect(send); send.connect(engine.reverbIn);
    const psend = gainNode(ctx, 0.3); this.pads.connect(psend); psend.connect(engine.reverbIn);
    this.chordIdx = 0; this.mood = 'day'; this.chordName = '-'; this.chordLen = 15;
    this.nextChordAt = ctx.currentTime + 0.3; this.chords = []; this.arps = 0; this.lines = 0; this.nextLine = ctx.currentTime + 40;
    this._set = null; this._forced = null;
    this.game.events.on('setu:found', () => { this._forced = 'hope'; this.nextChordAt = Math.min(this.nextChordAt, ctx.currentTime + 2); });
    this.game.events.on('setu:story', ({ pct }) => { if (pct <= 25) this.nextChordAt = Math.min(this.nextChordAt, ctx.currentTime + 3); });
  }

  /** Current mood name from the world. */
  _moodNow() {
    const g = this.game, s = g.setu, sky = g.sky;
    if (s && !s.dead && s.found) return 'hope';
    if (s && !s.found && !s.dead && s.health < 25) return 'sour';
    const h = sky ? sky.hour : 8;
    if (h >= 4.5 && h < 7.5) return 'dawn';
    if (h >= 17.5 && h < 20.5) return 'dusk';
    if (h >= 20.5 || h < 4.5) return 'night';
    return 'day';
  }

  _brightness() {
    const g = this.game, y = g.player.pos.y, sky = g.sky;
    const day = sky ? sky.dayFactor : 0.7;
    const lvl = y < -4 ? 0.65 : y < 6 ? 0.8 : y < 18 ? 0.95 : 1.1;
    return (0.55 + 0.5 * day) * lvl;
  }

  update(dt) {
    const ctx = this.ctx, now = ctx.currentTime;
    // the music bed is quieter underground and open on top
    const y = this.game.player.pos.y;
    this.level.gain.setTargetAtTime(y < -4 ? 0.7 : y < 6 ? 0.95 : 1.0, now, 1.0);
    if (this.game.mode !== 'playing') return;
    if (now >= this.nextChordAt - 0.6) this._chord(Math.max(now + 0.05, this.nextChordAt));
    this.chords = this.chords.filter((c) => now < c.endAt);
  }

  _chord(t0) {
    const ctx = this.ctx, g = this.game, s = g.setu;
    const mood = this._forced ?? this._moodNow(); this._forced = null; this.mood = mood;
    const set = SETS[mood], [rootSemi, type] = set[this.chordIdx++ % set.length];
    const tp = TYPES[type];
    const breath = s && !s.found ? s.health : 100;
    const throb = breath < 10 && !(s && s.found);
    const len = (throb ? 20 : mood === 'sour' ? 18 : 14) + Math.random() * 3;
    this.chordLen = len; this.nextChordAt = t0 + len - 3.5;
    const bright = this._brightness();
    const night = mood === 'night';
    const rootHz = hz(rootSemi + (night ? -7 : 0)), mul = 1;

    const att = 4.0, rel = 6.0, endAt = t0 + len + rel;
    const out = gainNode(ctx, 0);
    out.gain.setValueAtTime(0, t0); out.gain.linearRampToValueAtTime(0.9, t0 + att); out.gain.setValueAtTime(0.9, t0 + len - 1); out.gain.setTargetAtTime(0, t0 + len - 1, rel / 4);
    const lp = filt(ctx, 'lowpass', 520 + 900 * bright, 0.9);
    const lfo = osc(ctx, 'sine', 0.05 + Math.random() * 0.04), lg = gainNode(ctx, 260 * bright);
    lfo.connect(lg); lg.connect(lp.frequency);
    let pan = null;
    if (ctx.createStereoPanner) { pan = ctx.createStereoPanner(); pan.pan.value = (Math.random() - 0.5) * 0.6; lp.connect(pan); pan.connect(out); } else lp.connect(out);
    out.connect(this.pads);
    const nodes = [lfo];
    const notes = throb ? [0, 7] : tp.v;
    const per = 0.11 / Math.sqrt(notes.length);
    for (const n of notes) {
      const f = rootHz * Math.pow(2, n / 12);
      for (const [type2, cents, gain] of [['sawtooth', -9, 1], ['sawtooth', 8, 1], ['triangle', 0, 1.1]]) {
        const o = osc(ctx, type2, f * mul, cents), og = gainNode(ctx, per * gain);
        o.connect(og); og.connect(lp); o.start(t0); nodes.push(o);
      }
    }
    // a sub under it
    const sub = osc(ctx, 'sine', rootHz / 2), sg = gainNode(ctx, throb ? 0.22 : 0.12); sub.connect(sg); sg.connect(out); sub.start(t0); nodes.push(sub);
    if (throb) { const tl = osc(ctx, 'sine', 0.9), tg2 = gainNode(ctx, 0.1); tl.connect(tg2); tg2.connect(sg.gain); tl.start(t0); nodes.push(tl); }
    if (mood === 'sour') {                                         // a minor-ninth shiver on top
      const f = rootHz * Math.pow(2, 25 / 12), o = osc(ctx, 'sine', f), og = gainNode(ctx, 0.02), tr = osc(ctx, 'sine', 5.5), tg3 = gainNode(ctx, 0.018);
      tr.connect(tg3); tg3.connect(og.gain); o.connect(og); og.connect(out); o.start(t0); tr.start(t0); nodes.push(o, tr);
    }
    lfo.start(t0);
    for (const n of nodes) { try { n.stop(endAt + 0.2); } catch { /* ok */ } }
    this.chordName = (ROOT_NAME[String(rootSemi)] ?? '?') + NAME[type];
    this.chords.push({ endAt, name: this.chordName });

    // an arpeggio of electric piano on some chords (rarer when it hurts)
    const pArp = throb ? 0 : mood === 'sour' ? 0.18 : mood === 'night' ? 0.4 : 0.55;
    if (Math.random() < pArp) this._arp(t0 + 5 + Math.random() * 3, rootHz, tp, mood, bright);
    // a mellotron line now and then
    if (!throb && t0 >= this.nextLine && Math.random() < 0.6) { this.nextLine = t0 + 55 + Math.random() * 60; this._line(t0 + 3 + Math.random() * 2, rootHz, tp, mood); }
  }

  /** Electric piano: sine FM with a decaying index and a faint tine; played slightly out of tune (a tired Rhodes). */
  _ep(t, f, vel = 0.6) {
    const ctx = this.ctx, car = osc(ctx, 'sine', f, (Math.random() - 0.5) * 12), mod = osc(ctx, 'sine', f * 1.0, 3), mg = gainNode(ctx, f * 1.4 * vel);
    const tine = osc(ctx, 'sine', f * 7.02), tg = gainNode(ctx, 0);
    mod.connect(mg); mg.connect(car.frequency);
    mg.gain.setValueAtTime(f * 1.4 * vel, t); mg.gain.setTargetAtTime(f * 0.12, t, 0.22);
    const amp = gainNode(ctx, 0);
    amp.gain.setValueAtTime(0, t); amp.gain.linearRampToValueAtTime(0.28 * vel, t + 0.006); amp.gain.setTargetAtTime(0, t + 0.02, 0.55);
    tg.gain.setValueAtTime(0.05 * vel, t); tg.gain.setTargetAtTime(0, t, 0.04);
    car.connect(amp); tine.connect(tg); tg.connect(amp); amp.connect(this.ep);
    for (const o of [car, mod, tine]) { o.start(t); o.stop(t + 3.2); }
  }

  _arp(t0, rootHz, tp, mood, bright) {
    this.arps++;
    const pat = [[0, 1, 2, 3, 2, 1, 0, 2], [0, 2, 1, 3, 2, 4, 3, 1], [3, 2, 1, 0, 1, 2, 3, 4]][Math.floor(Math.random() * 3)];
    const step = mood === 'sour' ? 0.62 : 0.46 + Math.random() * 0.08, notes = tp.arp, top = Math.min(notes.length - 1, 6);
    let k = 0;
    for (const idx of pat) {
      if (Math.random() < 0.18) { k++; continue; }           // rests
      const semi = notes[Math.min(top, idx % notes.length)] + 12;
      this._ep(t0 + k * step, rootHz * Math.pow(2, semi / 12) * (mood === 'sour' && Math.random() < 0.25 ? 1.0595 : 1), 0.45 + Math.random() * 0.4);
      k++;
    }
    void bright;
  }

  /** A mellotron flute-ish line: saw through a band-pass with tape wobble, long soft notes. */
  _line(t0, rootHz, tp, mood) {
    const ctx = this.ctx; this.lines++;
    const notes = tp.arp.filter((_, i) => i % 2 === 0).slice(0, 4);
    let t = t0;
    const o = osc(ctx, 'sawtooth', rootHz * 4), o2 = osc(ctx, 'sawtooth', rootHz * 4, 11);
    const bp = filt(ctx, 'bandpass', 780, 0.9), lp = filt(ctx, 'lowpass', 2100, 0.7), amp = gainNode(ctx, 0);
    const vib = osc(ctx, 'sine', 5.4), vg = gainNode(ctx, 14), wob = osc(ctx, 'sine', 0.6), wg = gainNode(ctx, 9);
    vib.connect(vg); vg.connect(o.detune); vg.connect(o2.detune); wob.connect(wg); wg.connect(o.detune); wg.connect(o2.detune);
    o.connect(bp); o2.connect(bp); bp.connect(lp); lp.connect(amp); amp.connect(this.ep);
    amp.gain.setValueAtTime(0, t);
    const seq = mood === 'sour' ? [notes[0], notes[1], notes[0]] : notes;
    seq.forEach((semi, i) => {
      const f = rootHz * Math.pow(2, (semi + 12) / 12), dur = 2.6;
      o.frequency.setValueAtTime(f, t); o2.frequency.setValueAtTime(f, t);
      amp.gain.setValueAtTime(0.0, t); amp.gain.linearRampToValueAtTime(0.07, t + 0.35); amp.gain.setValueAtTime(0.07, t + dur - 0.9); amp.gain.setTargetAtTime(0, t + dur - 0.9, 0.35);
      t += dur - (i === seq.length - 1 ? 0 : 0.4);
    });
    const end = t + 1.5;
    for (const n of [o, o2, vib, wob]) { n.start(t0); n.stop(end); }
  }

  state() {
    const now = this.ctx.currentTime;
    return { mood: this.mood, chord: this.chordName, nextChordIn: Math.max(0, +(this.nextChordAt - now).toFixed(1)), chordsPlaying: this.chords.length, arps: this.arps, lines: this.lines };
  }
}
