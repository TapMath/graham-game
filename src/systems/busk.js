// Busking: the player sings into the device's microphone as Mithi, and the people around her drop coins.
//
//   K (keyboard) or the mic button (touch) turns the microphone on and off. It works on iPad and iPhone (Safari 15+): the
//   request is made inside the tap, the page's audio session switches to play-and-record while the mic is open (and back to
//   playback after, so the silent switch rule of the audio keeper still holds), and the mic only feeds an analyser (it is
//   never played back, so there is no feedback). The browser needs a secure page (https or localhost) to offer the mic.
//
// What counts as singing: a voiced, pitched sound (normalised autocorrelation, 75-1100 Hz) loud enough above the room's
// noise floor, held on one note for a quarter of a second or more. Talking glides and stops too often to count, so it earns
// little; humming and singing earn. While Mithi sings, the passers-by within 14 m on her level listen: every few seconds of
// song one of them drops a coin (about one every 4.5 s, faster in a crowd; ₹1-₹10, more for a song that moves between several notes and for a bigger crowd). Each
// person gives at most once every 90 s, so a street runs dry and she has to move on. Jeetu cannot sing, so he earns nothing.
// A long, steady song also sends a soft wave of sound out, the way Q does (without the alarm: it is quiet enough that the
// police do not hear it as a song).
//
//   game.busk.on / starting / error      the mic state            game.busk.toggle() / start() / stop(why)
//   game.busk.level / f0 / note          the live reading (dBFS, Hz, note name) while on
//   game.busk.stats                      {songSec, notes, tips, rupees}
// Events: 'busk:mic' {on, why}, 'busk:tip' {rupees, x, y, z, listeners}.
// Debug: __grahan.do('buskSim', hz|null, db = -24) feeds a synthetic voice through the same detector (headless has no mic),
//        state().busk.
import { analysePitch, noteName } from './audio/pitch.js';

const LISTEN_R = 14, LEVEL_DY = 3, TIP_EVERY = 4.5, CROWD_MAX = 1.8, GIVE_GAP = 90, PULSE_EVERY = 9;   // a coin every 4.5 s of song (2.5 s in a big crowd)
const HOLD = 0.25, SEMI = 0.6, FRAME = 1 / 20;
const COINS = [1, 2, 5, 10];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const MIC_ICON = '<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11 a6.5 6.5 0 0 0 13 0 M12 17.5 V21 M8.5 21 H15.5"/></svg>';

export class BuskSystem {
  init(game) {
    this.game = game;
    game.busk = this;
    this.rng = game.rng.fork('busk');
    this.on = false; this.starting = false; this.error = null;
    this.stream = null; this.nodes = null; this.buf = null; this.sim = null;
    this.level = -120; this.f0 = 0; this.clarity = 0; this.note = ''; this.voiced = false;
    this.floor = -60; this.acc = 0;
    this._resetSong();
    this.stats = { songSec: 0, notes: 0, tips: 0, rupees: 0 };
    this.given = new Map();     // crowd agent -> game time it last gave
    this._hintAt = -99;

    // K toggles, from a real key press (a gesture, which iOS wants for the mic and the audio context); the touch button sends K too
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'KeyK' || e.repeat) return;
      if (game.mode !== 'playing' || game.modal) return;
      e.preventDefault();
      this.toggle();
    });
    game.events.on('mode:changed', ({ mode } = {}) => { const m = mode ?? game.mode; if (m === 'menu' || m === 'ending') this.stop('mode'); });
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stop('hidden'); });

    this._buildUi();
    game.debug?.addAction('buskSim', (g, hz, db = -24) => {
      if (hz == null || hz === false) { this.sim = null; this.on = false; this._ui(); return false; }
      this.sim = { hz, db, t: 0 }; this.on = true; this.error = null; this._ui(); return true;
    });
    game.debug?.addAction('buskReset', () => { this.given.clear(); this.stats = { songSec: 0, notes: 0, tips: 0, rupees: 0 }; this._resetSong(); return true; });
    game.debug?.addState('busk', () => ({
      on: this.on, starting: this.starting, error: this.error, sim: !!this.sim, level: Math.round(this.level), floor: Math.round(this.floor), f0: Math.round(this.f0),
      clarity: +this.clarity.toFixed(2), voiced: this.voiced, note: this.note, held: +this.held.toFixed(2), singing: this.singing, listeners: this.listeners,
      ...this.stats, songSec: +this.stats.songSec.toFixed(1),
    }));
  }

  reset() { this.stop('reset'); this.given.clear(); this.stats = { songSec: 0, notes: 0, tips: 0, rupees: 0 }; }

  _resetSong() { this.held = 0; this.noteMidi = null; this.singing = false; this.tipMeter = 0; this.songRun = 0; this.recent = []; this.listeners = 0; }

  toggle() { if (this.on || this.starting) this.stop('off'); else this.start(); }

  // ------------------------------------------------------------------------------------------------ the microphone
  async start() {
    const g = this.game;
    if (this.on || this.starting) return;
    this.sim = null;
    const md = navigator.mediaDevices;
    if (!window.isSecureContext || !md?.getUserMedia) { this._fail('insecure', 'The microphone needs the game opened over https.'); return; }
    this.starting = true; this.error = null; this._ui();
    g.audio?.ensure();                                  // inside the gesture: create or resume the audio context
    this._session('play-and-record');
    let stream;
    try {
      stream = await md.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    } catch (e) {
      this.starting = false; this._session('playback');
      const n = e?.name;
      if (n === 'NotAllowedError' || n === 'SecurityError') this._fail('denied', 'The microphone is blocked. Allow it for this site (on iPad: Settings, Safari, Microphone), then press the mic again.');
      else if (n === 'NotFoundError' || n === 'OverconstrainedError') this._fail('none', 'No microphone found on this device.');
      else this._fail('error', 'The microphone could not start.');
      return;
    }
    if (!this.starting) { stream.getTracks().forEach((t) => t.stop()); return; }   // turned off while the browser was asking
    const ctx = g.audio?.ctx;
    if (!ctx) { stream.getTracks().forEach((t) => t.stop()); this.starting = false; this._session('playback'); this._fail('noaudio', 'Sound is off on this device, so the microphone cannot be heard.'); return; }
    try {
      const src = ctx.createMediaStreamSource(stream);
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 70;
      const an = ctx.createAnalyser(); an.fftSize = 2048; an.smoothingTimeConstant = 0;
      const sink = ctx.createGain(); sink.gain.value = 0;   // silent: WebKit only runs nodes that reach the destination
      src.connect(hp); hp.connect(an); an.connect(sink); sink.connect(ctx.destination);
      this.nodes = { src, hp, an, sink, sr: ctx.sampleRate };
      this.buf = new Float32Array(an.fftSize);
    } catch {
      stream.getTracks().forEach((t) => t.stop()); this.starting = false; this._session('playback'); this._fail('error', 'The microphone could not start.'); return;
    }
    this.stream = stream; this.starting = false; this.on = true; this.floor = -60; this._resetSong();
    stream.getTracks().forEach((t) => t.addEventListener('ended', () => this.stop('ended')));
    if (ctx.state !== 'running') ctx.resume?.().catch?.(() => {});
    g.audioKeeper?.kick?.('mic');
    g.events.emit('busk:mic', { on: true, why: 'start' });
    if (!this._told) { this._told = true; g.messages?.say('The mic is on. Sing to the people around you: a steady tune earns coins. K or the mic button stops it.', { kind: 'hint', ttl: 9 }); }
    this._ui();
  }

  stop(why = 'off') {
    const wasOn = this.on || this.starting;
    this.starting = false; this.on = false; this.sim = null;
    if (this.nodes) { for (const n of ['src', 'hp', 'an', 'sink']) { try { this.nodes[n].disconnect(); } catch { /* gone */ } } this.nodes = null; }
    if (this.stream) { this.stream.getTracks().forEach((t) => { try { t.stop(); } catch { /* gone */ } }); this.stream = null; this._session('playback'); }
    this.level = -120; this.voiced = false; this.note = ''; this._resetSong();
    if (wasOn) this.game.events.emit('busk:mic', { on: false, why });
    this._ui();
  }

  _fail(code, text) { this.error = code; this.game.messages?.say(text, { kind: 'system', ttl: 8 }); this.game.events.emit('busk:mic', { on: false, why: code }); this._ui(); }

  /** iOS 17+: capture needs play-and-record; the audio keeper's playback comes back when the mic closes. */
  _session(type) {
    try { if (navigator.audioSession) navigator.audioSession.type = type; } catch { /* not supported */ }
    if (type === 'playback' && this.game.audioKeeper) setTimeout(() => this.game.audioKeeper.kick?.('mic-off'), 60);
  }

  // ------------------------------------------------------------------------------------------------ listening
  _read() {
    if (this.sim) {
      const S = this.sim, sr = 48000, N = 2048, buf = this.buf?.length === N ? this.buf : (this.buf = new Float32Array(N)), a = Math.pow(10, S.db / 20) * Math.SQRT2;
      for (let i = 0; i < N; i++) {
        const t = S.t + i / sr;
        buf[i] = S.hz ? a * (Math.sin(2 * Math.PI * S.hz * t) + 0.35 * Math.sin(4 * Math.PI * S.hz * t)) + (Math.random() - 0.5) * 0.002 : (Math.random() - 0.5) * 0.002;
      }
      S.t += FRAME;
      return analysePitch(buf, sr);
    }
    if (!this.nodes) return null;
    this.nodes.an.getFloatTimeDomainData(this.buf);
    return analysePitch(this.buf, this.nodes.sr);
  }

  update(dt, game) {
    if (!this.on || game.mode !== 'playing') return;
    this.acc += dt;
    if (this.acc < FRAME) return;
    const fdt = this.acc; this.acc = 0;
    const r = this._read(); if (!r) return;
    this.level = r.db; this.f0 = r.f0; this.clarity = r.clarity;
    const pitched = r.f0 >= 75 && r.f0 <= 1100 && r.clarity >= 0.75;
    // the room's noise floor follows quiet frames quickly and loud unpitched ones slowly
    if (!pitched) this.floor += (r.db - this.floor) * (r.db < this.floor ? 0.3 : 0.02);
    this.floor = clamp(this.floor, -90, -35);
    this.voiced = pitched && r.db > Math.max(-55, this.floor + 9);
    const p = game.player;
    if (this.voiced) {
      const midi = 69 + 12 * Math.log2(r.f0 / 440);
      this.note = noteName(midi);
      if (this.noteMidi != null && Math.abs(midi - this.noteMidi) < SEMI) { this.held += fdt; this.noteMidi += (midi - this.noteMidi) * 0.2; }
      else { if (this.held >= HOLD) this._noteDone(game); this.noteMidi = midi; this.held = 0; }
      if ((this._ripT = (this._ripT ?? 0) - fdt) <= 0) {
        this._ripT = 0.55;
        game.ripples?.add({ x: p.pos.x, y: p.pos.y + 0.05, z: p.pos.z, loud: clamp((r.db + 55) / 40, 0.25, 0.8), tone: 'voice', flat: true, self: true, scale: 0.7 });
      }
    } else {
      if (this.held >= HOLD) this._noteDone(game);
      this.held = 0; this.noteMidi = null;
      this._gap = (this._gap ?? 0) + fdt;
      if (this._gap > 1.2) { this.songRun = 0; this.note = ''; }
    }
    if (this.voiced) this._gap = 0;
    const canSing = !(game.canSing && game.canSing() === false) && !game.health?.dead;
    this.singing = this.voiced && this.held >= HOLD && canSing;
    this.listeners = this._listeners(game).length;
    if (this.singing) {
      this.stats.songSec += fdt; this.songRun += fdt;
      const fresh = this._listeners(game, true);
      if (fresh.length) {
        this.tipMeter += fdt * Math.min(CROWD_MAX, 1 + 0.1 * (fresh.length - 1));
        if (this.tipMeter >= TIP_EVERY) { this.tipMeter = 0; this._tip(game, fresh); }
      } else this._hint(game, this.listeners ? 'The people here have already given. Try another street.' : 'Nobody is near enough to hear. Sing where there are people.');
      if (this.songRun >= PULSE_EVERY && game.sing && !game.sing.busy?.()) {
        this.songRun = 0;
        game.sing.startPulse('sing', { x: p.pos.x, y: p.eyeY, z: p.pos.z }, { strength: 0.55, maxR: 36 });
      }
    } else if (this.voiced && !canSing) this._hint(game, 'Jeetu cannot sing. Switch back to Mithi.');
    this._ui();
  }

  _noteDone() {
    this.stats.notes++;
    const n = Math.round(this.noteMidi) % 12;
    this.recent.push({ n, t: this.game.time });
    while (this.recent.length && this.game.time - this.recent[0].t > 12) this.recent.shift();
  }

  _listeners(game, freshOnly = false) {
    const p = game.player, all = game.crowds?.near?.(p.pos.x, p.pos.z, LISTEN_R) ?? [];
    return all.filter((a) => Math.abs((a.y ?? p.pos.y) - p.pos.y) < LEVEL_DY && (!freshOnly || game.time - (this.given.get(a) ?? -1e9) >= GIVE_GAP));
  }

  _tip(game, fresh) {
    const p = game.player;
    let a = fresh[0], best = Infinity;
    for (const c of fresh) { const d = Math.hypot(c.x - p.pos.x, c.z - p.pos.z) + this.rng.range(0, 4); if (d < best) { best = d; a = c; } }
    this.given.set(a, game.time);
    if (this.given.size > 300) for (const [k, t] of this.given) if (game.time - t >= GIVE_GAP) this.given.delete(k);
    const tune = new Set(this.recent.map((r) => r.n)).size;                  // distinct notes in the last 12 s: a tune, not a drone
    let k = this.rng.int(0, 1) + (tune >= 3 ? 1 : 0) + (tune >= 5 ? 1 : 0) + (fresh.length >= 6 && this.rng.chance(0.4) ? 1 : 0);
    const rupees = COINS[clamp(k, 0, COINS.length - 1)];
    game.wallet?.add(rupees, 'busking');
    this.stats.tips++; this.stats.rupees += rupees;
    const pos = { x: a.x, y: (a.y ?? p.pos.y) + 1.0, z: a.z };
    game.audio?.play('coin', pos, { loud: 0.45 });
    game.ripples?.add({ x: pos.x, y: pos.y, z: pos.z, loud: 0.5, tone: 'setu', soft: true });
    game.events.emit('busk:tip', { rupees, ...pos, listeners: fresh.length });
    if (this.stats.tips === 1) game.messages?.say(`Someone stops to listen, and a coin rings on the ground at your feet. ₹${rupees}.`, { kind: 'story', ttl: 7 });
  }

  _hint(game, text) {
    if (game.time - this._hintAt < 20) return;
    this._hintAt = game.time;
    game.messages?.say(text, { kind: 'hint', ttl: 6 });
  }

  // ------------------------------------------------------------------------------------------------ the pill under the HUD
  _buildUi() {
    const el = this.el = document.createElement('div');
    el.id = 'busk'; el.hidden = true;
    el.innerHTML = `<span class="bk-ic">${MIC_ICON}</span><span class="bk-meter">${'<i></i>'.repeat(8)}</span><b class="bk-note"></b><span class="bk-state"></span>`;
    document.body.appendChild(el);
    this.ui = { bars: [...el.querySelectorAll('.bk-meter i')], note: el.querySelector('.bk-note'), state: el.querySelector('.bk-state'), key: '' };
  }

  _ui() {
    const u = this.ui; if (!u) return;
    const show = this.on || this.starting;
    if (this.el.hidden === show) this.el.hidden = !show;
    if (!show) return;
    const lit = this.on ? clamp(Math.round((this.level + 60) / 45 * 8), 0, 8) : 0;
    const state = this.starting ? 'asking for the mic' : this.singing ? (this.listeners ? `${this.listeners} listening` : 'no one near') : this.voiced ? 'hold the note' : 'sing';
    const key = `${lit}|${this.voiced ? this.note : ''}|${state}|${this.singing}`;
    if (key === u.key) return;
    u.key = key;
    u.bars.forEach((b, i) => b.classList.toggle('on', i < lit));
    u.note.textContent = this.voiced ? this.note : '';
    u.state.textContent = state;
    this.el.classList.toggle('singing', this.singing);
  }
}
