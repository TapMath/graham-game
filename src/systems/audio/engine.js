// The audio engine (Phase 5). Everything is synthesised procedurally with Web Audio; there are no audio files.
//
//   game.audio.ensure()                 create / resume the AudioContext (done on the first user gesture, and at once
//                                       with ?autostart=1; any failure is swallowed: headless may refuse)
//   game.audio.play(kind, pos, opts)    one-shot at a world position ({x,y,z}) or non-spatial (pos = null). Returns the
//                                       voice record or null (too far to hear, throttled, over the cap). `opts`: loud,
//                                       pitch, notes (mouthorgan), weak, surface (footstep)
//   game.audio.loopStart(id, kind, loud, getPos) / loopStop(id)      continuous sources (contract loop kinds)
//   game.audio.sing(phraseIndex)        Mithi's voice (non-spatial). Returns {dur, notes, phrase}
//   game.audio.setVolume('master'|'music'|'sfx'|'voice'|'amb', 0..1) / volumes / setMuted(bool)   (Phase 7 settings use these)
//   game.audio.duck(amount, seconds)    dip the music bed (PA, voice) for a while
//   game.audio.state()                  snapshot: context state, voices, loops, ambience level mix, music chord
//
// Graph: sources -> per-voice chain (low-pass for distance and walls -> HRTF PannerNode) -> sfx bus; ambience -> amb bus;
// pads -> music bus; voices (Mithi, PA) -> voice bus; every bus -> master -> compressor -> out, with a shared convolution
// reverb (a generated cathedral impulse response) fed by sends. The listener follows the player's head and the camera's
// orientation. Panner chains are pooled (at most MAX_CHAINS in use) and each kind has a concurrency cap.
//
// Events consumed: sound:emit {x,y,z,kind,loudness}, sound:loop {id,kind,loudness,getPos}, sound:loopStop {id},
// player:jump, player:land, lift:moving / lift:arrived, gate:denied / gate:opened, health:damage / health:heal, setu:found.
//
// Voices exist as *records* even when the context cannot run (headless, suspended): the logic, counts and ripples all
// work, only the nodes are skipped. That keeps `state().audio.voices` meaningful in tests.
import * as THREE from 'three';
import { ONESHOT, LOOPS, singPhrase, RAGA } from './synth.js';
import { KINDS, LOOP_KINDS, audibleRange } from './kinds.js';
import { Ambience } from './ambience.js';
import { Music } from './music.js';

const MAX_CHAINS = 18, MAX_VOICES = 40, MAX_LOOPS = 5;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const _f = new THREE.Vector3(), _u = new THREE.Vector3(), _o = { x: 0, y: 0, z: 0 }, _d = { x: 0, y: 0, z: 0 };

/** A generated reverb impulse response: exponentially decaying filtered noise, a little darker in the tail. */
function makeImpulse(ctx, seconds = 2.8, decay = 3.2) {
  const len = Math.floor(ctx.sampleRate * seconds), buf = ctx.createBuffer(2, len, ctx.sampleRate);
  let seed = 99;
  const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c); let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len, k = 0.55 - 0.45 * t;                       // the tail loses its highs
      lp += (rnd() - lp) * k;
      d[i] = lp * Math.pow(1 - t, decay) * (i < 400 ? i / 400 : 1);
    }
  }
  return buf;
}

export class AudioSystem {
  init(game) {
    this.game = game;
    game.audio = this;
    this.ctx = null; this.failed = null; this.started = false;
    this.volumes = { master: 0.9, music: 0.5, sfx: 0.95, voice: 0.95, amb: 0.8 };
    this.muted = !!game.params.mute;
    this.captionSounds = true;
    this.voices = []; this.loops = new Map(); this.chainPool = []; this.chainsInUse = 0;
    this._id = 0; this._fails = {}; this._lastKind = {}; this._captionAt = {};
    this.stats = { played: 0, dropped: 0, stolen: 0, throttled: 0, tooFar: 0, errors: 0, lastError: null, byKind: {} };
    this._loopTick = 0; this._stride = 0; this._sprintT = 0; this._recover = 0; this._breathAt = 0; this._tapSide = 0; this._beatAt = 0; this._healAt = -9;
    this.ambience = null; this.music = null;

    const ev = game.events;
    ev.on('sound:emit', (d) => this._onEmit(d));
    ev.on('sound:loop', (d) => { if (d && d.id != null) this.loopStart(d.id, d.kind, d.loudness ?? d.loud ?? 0.5, d.getPos); });
    ev.on('sound:loopStop', (d) => { if (d && d.id != null) this.loopStop(d.id); });
    ev.on('player:jump', () => this.play('jump', null));
    ev.on('player:land', (d) => { const k = clamp(d.speed / 18, 0.15, 1); this.play('land', null, { loud: k }); this._rippleAtFeet(0.3 + k * 0.5, 'step'); });
    ev.on('lift:moving', ({ id }) => {
      const lift = game.lifts?.get(id); if (!lift) return;
      this.loopStart('lift:' + id, 'lift', 0.45, () => { _o.x = lift.center[0]; _o.y = lift.y + 0.5; _o.z = lift.center[1]; return _o; });
    });
    ev.on('lift:arrived', ({ id }) => this.loopStop('lift:' + id));
    ev.on('gate:denied', ({ id }) => this.play('gate-buzz', this._gatePos(id)));
    ev.on('gate:opened', ({ id }) => this.play('gate-chime', this._gatePos(id)));
    ev.on('health:damage', () => this.play('hurt', null));
    ev.on('health:heal', () => { if (game.time - this._healAt > 2.5) { this._healAt = game.time; this.play('heal', null); } });
    ev.on('mode:changed', ({ mode }) => this._onMode(mode));
    ev.on('vision:start', () => { this.play('vision-sting', null); this.duck(0.7, 3.2); });
    ev.on('ending:shown', () => { if (this.ctx) this.duck(0.5, 8); });

    game.debug?.addState('audio', () => this.state());
    game.debug?.addAction('sound', (g, kind = 'bark', dx = 8, dz = 0, loud) => {
      const p = g.player.pos;
      g.events.emit('sound:emit', { x: p.x + dx, y: p.y + 0.6, z: p.z + dz, kind, loudness: loud ?? KINDS[kind]?.loud ?? 0.6 });
      return { kind, voices: this.voices.length, ripples: g.ripples?.activeCount() ?? 0, ctx: this.ctx?.state ?? 'none' };
    });
    game.debug?.addAction('audioStart', () => ({ ok: this.ensure(), state: this.ctx?.state ?? 'none', failed: this.failed }));
    game.debug?.addSetter('volume', (g, v) => { for (const [k, x] of Object.entries(v || {})) this.setVolume(k, x); });

    // first user gesture creates / resumes the context
    const kick = () => { this.ensure(); if (this.started) for (const n of ['pointerdown', 'keydown', 'touchstart', 'click']) window.removeEventListener(n, kick, true); };
    for (const n of ['pointerdown', 'keydown', 'touchstart', 'click']) window.addEventListener(n, kick, true);
    if (game.params.autostart) this.ensure();
  }

  // ------------------------------------------------------------------ context
  running() { return !!this.ctx && this.ctx.state === 'running'; }

  /** Create (once) and resume the context. Never throws. */
  ensure() {
    try {
      if (!this.ctx && !this.failed) this._build();
      if (this.ctx && this.ctx.state === 'suspended') { const p = this.ctx.resume(); if (p && p.catch) p.catch(() => {}); }
      if (this.ctx && this.ctx.state === 'running') this.started = true;
      if (this.failed) this.started = true;
    } catch (e) {
      this.failed = String(e && e.message ? e.message : e); this.ctx = null;
    }
    return !!this.ctx;
  }

  _build() {
    const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
    if (!AC) { this.failed = 'no Web Audio'; return; }
    const ctx = new AC({ latencyHint: 'interactive' });
    this.ctx = ctx;
    const g = (v) => { const n = ctx.createGain(); n.gain.value = v; return n; };
    this.master = g(this.muted ? 0 : this.volumes.master);
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -16; this.comp.knee.value = 18; this.comp.ratio.value = 5; this.comp.attack.value = 0.005; this.comp.release.value = 0.28;
    this.pre = g(1);
    this.pre.connect(this.comp); this.comp.connect(this.master); this.master.connect(ctx.destination);
    this.analyser = ctx.createAnalyser(); this.analyser.fftSize = 2048; this.comp.connect(this.analyser);      // a meter for tests: state().audio.level
    this._meter = new Float32Array(2048);
    this.buses = { music: g(this.volumes.music), sfx: g(this.volumes.sfx), voice: g(this.volumes.voice), amb: g(this.volumes.amb) };
    this.musicDuck = g(1);
    this.buses.music.connect(this.musicDuck); this.musicDuck.connect(this.pre);
    for (const k of ['sfx', 'voice', 'amb']) this.buses[k].connect(this.pre);
    // shared reverb
    this.reverb = ctx.createConvolver(); this.reverb.buffer = makeImpulse(ctx);
    this.reverbOut = g(0.55); this.reverb.connect(this.reverbOut); this.reverbOut.connect(this.pre);
    this.reverbIn = g(1); this.reverbIn.connect(this.reverb);
    // non-spatial chain for the player's own sounds (footsteps, breath, voice)
    this.selfIn = g(1); this.selfIn.connect(this.buses.sfx);
    const selfSend = g(0.18); this.selfIn.connect(selfSend); selfSend.connect(this.reverbIn);
    this.voiceIn = g(1); this.voiceIn.connect(this.buses.voice);
    const vSend = g(0.4); this.voiceIn.connect(vSend); vSend.connect(this.reverbIn);

    this.ambience = new Ambience(this);
    this.music = new Music(this);
    ctx.onstatechange = () => { if (ctx.state === 'running') this.started = true; };
    this.game.events.emit('audio:ready', { state: ctx.state });
  }

  _onMode(mode) {
    if (!this.ctx) return;
    try {
      if (mode === 'paused' || mode === 'menu') { if (this.ctx.state === 'running') this.ctx.suspend(); }
      else if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    } catch { /* ignore */ }
  }

  setVolume(bus, v) {
    v = clamp(Number(v) || 0, 0, 1);
    this.volumes[bus] = v;
    if (!this.ctx) return;
    const node = bus === 'master' ? this.master : this.buses[bus];
    if (node && !(bus === 'master' && this.muted)) node.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }
  setMuted(m) {
    this.muted = !!m;
    if (this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : this.volumes.master, this.ctx.currentTime, 0.05);
  }
  /** Dip the music bed to (1 - amount) for `seconds`. */
  duck(amount = 0.6, seconds = 3) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicDuck.gain.cancelScheduledValues(t);
    this.musicDuck.gain.setTargetAtTime(1 - amount, t, 0.2);
    this.musicDuck.gain.setTargetAtTime(1, t + seconds, 0.8);
  }

  // ------------------------------------------------------------------ listener
  _listener() {
    const g = this.game, p = g.player, L = this.ctx.listener, cam = g.camera;
    _f.set(0, 0, -1).applyQuaternion(cam.quaternion); _u.set(0, 1, 0).applyQuaternion(cam.quaternion);
    const x = p.pos.x, y = p.eyeY, z = p.pos.z;
    if (L.positionX) {
      L.positionX.value = x; L.positionY.value = y; L.positionZ.value = z;
      L.forwardX.value = _f.x; L.forwardY.value = _f.y; L.forwardZ.value = _f.z;
      L.upX.value = _u.x; L.upY.value = _u.y; L.upZ.value = _u.z;
    } else { L.setPosition(x, y, z); L.setOrientation(_f.x, _f.y, _f.z, _u.x, _u.y, _u.z); }
  }
  /** The listener's position (the player's head). */
  head() { const p = this.game.player; return { x: p.pos.x, y: p.eyeY, z: p.pos.z }; }

  _gatePos(id) { const gt = this.game.world?.gates?.find((x) => x.id === id); return gt ? { x: gt.x, y: gt.y + 1, z: gt.z } : null; }

  // ------------------------------------------------------------------ panner chains (pooled)
  _makeChain() {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 16000; lp.Q.value = 0.5;
    const pan = ctx.createPanner();
    pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 4; pan.rolloffFactor = 1; pan.maxDistance = 10000;
    pan.coneInnerAngle = 360; pan.coneOuterAngle = 0; pan.coneOuterGain = 0;
    const send = ctx.createGain(); send.gain.value = 0.2;
    lp.connect(pan); pan.connect(this.buses.sfx); pan.connect(send); send.connect(this.reverbIn);
    return { lp, pan, send, busy: false };
  }
  _acquire() {
    if (this.chainsInUse >= MAX_CHAINS) return null;
    const c = this.chainPool.pop() || this._makeChain();
    c.busy = true; this.chainsInUse++;
    return c;
  }
  _release(c, vg) {
    if (!c || !c.busy) return;
    c.busy = false; this.chainsInUse = Math.max(0, this.chainsInUse - 1);
    try { vg.disconnect(); } catch { /* already */ }
    this.chainPool.push(c);
  }
  _setPos(pan, p) {
    if (pan.positionX) { pan.positionX.value = p.x; pan.positionY.value = p.y; pan.positionZ.value = p.z; } else pan.setPosition(p.x, p.y, p.z);
  }

  /** Line of sight from the listener's head to a point: false when a solid is in the way. */
  _clear(p) {
    const h = this.head(); _o.x = h.x; _o.y = h.y; _o.z = h.z;
    const dx = p.x - h.x, dy = p.y - h.y, dz = p.z - h.z, len = Math.hypot(dx, dy, dz);
    if (len < 1.5) return true;
    _d.x = dx / len; _d.y = dy / len; _d.z = dz / len;
    return !this.game.physics.raycast(_o, _d, len - 0.4, (c) => c.solid);
  }

  /** Distance + wall low-pass and a wet amount for a source at `p`. */
  _shape(chain, p, dist) {
    const clear = this._clear(p);
    const cut = clear ? clamp(17000 / (1 + dist / 22), 1500, 17000) : clamp(1200 / (1 + dist / 60), 380, 1100);
    chain.lp.frequency.value = cut;
    chain.send.gain.value = clamp(0.1 + dist / 220, 0.1, 0.55) * (clear ? 1 : 1.3);
    return clear;
  }

  // ------------------------------------------------------------------ one-shots
  _onEmit(d) {
    if (!d || !d.kind) return;
    const spec = KINDS[d.kind];
    const loud = clamp(d.loudness ?? d.loud ?? spec?.loud ?? 0.5, 0, 1);
    const pos = d.x === undefined ? null : { x: d.x, y: d.y ?? 0, z: d.z ?? 0 };
    const v = this.play(d.kind, pos, { loud, notes: d.notes, weak: d.weak, pitch: d.pitch, who: d.who, _event: true });
    if (v && spec?.caption && this.captionSounds && !d.ambient && this.game.messages) {
      const now = this.game.time;
      if (now - (this._captionAt[d.kind] ?? -99) > 14 && (!pos || v.d < 70 || d.kind === 'mouthorgan' || d.kind === 'collapse')) {
        this._captionAt[d.kind] = now;
        this.game.messages.caption(spec.caption, 3.5);
      }
    }
    return v;
  }

  /**
   * Play a one-shot. Returns the voice record, or null when it is out of earshot, throttled or over the cap.
   * `pos` null = non-spatial (the player's own sounds, UI).
   */
  play(kind, pos, o = {}) {
    const g = this.game, spec = KINDS[kind] ?? { gain: 0.6, loud: 0.4, gap: 0.2, max: 3, dur: 1 };
    const loud = clamp(o.loud ?? spec.loud, 0, 1);
    const h = this.head();
    const dist = pos ? Math.hypot(pos.x - h.x, pos.y - h.y, pos.z - h.z) : 0;
    const range = audibleRange(g, loud);
    if (pos && dist > range) { this.stats.tooFar++; return null; }
    const now = g.time;
    if (now - (this._lastKind[kind] ?? -99) < (spec.gap ?? 0.1)) { this.stats.throttled++; return null; }
    let ofKind = 0; for (const v of this.voices) if (v.kind === kind) ofKind++;
    if (ofKind >= (spec.max ?? 4)) { this.stats.throttled++; return null; }
    if (this.voices.length >= MAX_VOICES) { this.stats.dropped++; return null; }
    this._lastKind[kind] = now;

    const rec = { id: ++this._id, kind, loud, d: dist, born: now, until: now + (spec.dur ?? 1), chain: null, vg: null, endCtx: 0, spatial: !!pos };
    this.voices.push(rec);
    this.stats.played++; this.stats.byKind[kind] = (this.stats.byKind[kind] ?? 0) + 1;

    if (this.running() && ONESHOT[kind]) {
      try { this._build1(rec, kind, pos, loud, dist, range, spec, o); } catch (e) { /* synthesis must never break the game */ rec.error = String(e && e.message); this.stats.errors++; this.stats.lastError = kind + ': ' + rec.error; this._kill(rec); }
    }
    return rec;
  }

  _build1(rec, kind, pos, loud, dist, range, spec, o) {
    const ctx = this.ctx;
    let chain = null, dest;
    const vg = ctx.createGain();
    vg.gain.value = spec.gain * (0.35 + 0.65 * loud) * (o.gain ?? 1);
    if (pos) {
      chain = this._acquire();
      if (!chain) {                                   // all chains busy: steal the quietest, farthest spatial voice if this one matters more
        const victim = this._weakest();
        const score = (r) => r.loud / (1 + r.d / 30);
        if (victim && score(victim) < loud / (1 + dist / 30)) { this._kill(victim); chain = this._acquire(); this.stats.stolen++; }
        if (!chain) { this.stats.dropped++; return; }
      }
      chain.pan.refDistance = clamp(range * 0.06, 1.5, 14);
      this._setPos(chain.pan, pos);
      this._shape(chain, pos, dist);
      dest = chain.lp;
    } else dest = kind.startsWith('pa-') ? this.voiceIn : this.selfIn;
    vg.connect(dest);
    rec.chain = chain; rec.vg = vg; rec.endCtx = ctx.currentTime + (spec.dur || 1) + 0.5;   // set before the recipe runs, so a throw can release them
    const t = ctx.currentTime + 0.012;
    const dur = ONESHOT[kind](ctx, vg, t, { loud, pitch: o.pitch, notes: o.notes, weak: o.weak, surface: o.surface, rnd: Math.random, syllables: o.syllables, dur: o.dur });
    rec.endCtx = t + (dur || spec.dur || 1) + 0.3;
    rec.until = this.game.time + (dur || spec.dur || 1);
  }

  _weakest() {
    let w = null, ws = Infinity;
    for (const r of this.voices) { if (!r.chain) continue; const s = r.loud / (1 + r.d / 30); if (s < ws) { ws = s; w = r; } }
    return w;
  }
  _kill(r) {
    if (r.vg) { try { r.vg.gain.cancelScheduledValues(0); r.vg.gain.value = 0; } catch { /* ok */ } }
    this._release(r.chain, r.vg); r.chain = null; r.vg = null; r.until = 0;
  }

  // ------------------------------------------------------------------ loops
  loopStart(id, kind, loud, getPos) {
    if (!LOOP_KINDS.includes(kind)) return false;
    const old = this.loops.get(id); if (old) this._loopFree(old);
    this.loops.set(id, { id, kind, loud: clamp(loud ?? 0.5, 0, 1), getPos: typeof getPos === 'function' ? getPos : null, nodes: null, d: 0, pos: { x: 0, y: 0, z: 0 }, audible: false, nextRipple: this.game.time + 0.5 + Math.random() });
    this._loopTick = 0;
    return true;
  }
  loopStop(id) { const l = this.loops.get(id); if (l) { this._loopFree(l); this.loops.delete(id); } }
  _loopFree(l) {
    if (!l.nodes) return;
    try { l.nodes.handle.stop(); } catch { /* ok */ }
    const n = l.nodes;
    setTimeout(() => this._release(n.chain, n.vg), 800);      // let the fade-out finish before the chain is reused
    l.nodes = null;
  }

  _updateLoops(dt) {
    this._loopTick -= dt; if (this._loopTick > 0) return; this._loopTick = 0.1;
    const g = this.game, h = this.head(), list = [];
    for (const l of this.loops.values()) {
      let p = null; try { p = l.getPos ? l.getPos() : null; } catch { p = null; }
      if (p) { l.pos.x = p.x; l.pos.y = p.y; l.pos.z = p.z; }
      l.d = Math.hypot(l.pos.x - h.x, l.pos.y - h.y, l.pos.z - h.z);
      l.audible = !!p && l.d <= audibleRange(g, l.loud);
      if (l.audible) list.push(l);
    }
    list.sort((a, b) => a.d - b.d);
    const keep = new Set(list.slice(0, MAX_LOOPS));
    for (const l of this.loops.values()) {
      if (keep.has(l)) {
        if (!l.nodes && this.running()) this._loopMake(l);
        if (l.nodes) {
          this._setPos(l.nodes.chain.pan, l.pos);
          this._shape(l.nodes.chain, l.pos, l.d);
          l.nodes.chain.pan.refDistance = clamp(audibleRange(g, l.loud) * 0.06, 1.5, 14);
        }
        if (g.time >= l.nextRipple) { l.nextRipple = g.time + 1.4 + Math.random() * 1.4; g.ripples?.fromLoop(l); }
      } else if (l.nodes) this._loopFree(l);
    }
  }
  _loopMake(l) {
    const chain = this._acquire(); if (!chain) return;
    try {
      const vg = this.ctx.createGain(); vg.gain.value = 0.9 * (0.35 + 0.65 * l.loud);
      vg.connect(chain.lp);
      const handle = LOOPS[l.kind](this.ctx, vg, {});
      l.nodes = { chain, vg, vgDummy: vg, handle };
    } catch (e) { this._release(chain, null); l.error = String(e && e.message); this.stats.errors++; this.stats.lastError = 'loop ' + l.kind + ': ' + l.error; }
  }

  // ------------------------------------------------------------------ the player's own sounds
  _rippleAtFeet(loud, tone) {
    const p = this.game.player.pos;
    this.game.ripples?.add({ x: p.x, y: p.y + 0.04, z: p.z, loud, tone, flat: true, self: true });
  }

  _walk(dt) {
    const g = this.game, p = g.player;
    if (!p || g.mode !== 'playing') return;
    const speed = Math.hypot(p.vel.x, p.vel.z), moving = p.onGround && speed > 0.6 && !g.modal;
    if (moving) {
      this._stride += speed * dt;
      const stride = p.sprinting ? 2.6 : 1.85;
      if (this._stride >= stride) {
        this._stride -= stride;
        const lvl = p.level, tag = p.ground?.tag ?? '';
        const surface = tag === 'lift' ? 'metal' : (lvl === 'U' || lvl === 'G') ? 'wet' : 'stone';
        this.play('footstep', null, { loud: p.sprinting ? 0.5 : 0.28, surface });
        this._rippleAtFeet(p.sprinting ? 0.34 : 0.2, 'step');
        this._tapSide ^= 1;
        if (this._tapSide) this._caneTap();
      }
    } else this._stride = Math.min(this._stride, 1.0);
    // breathing: sprinting builds it, stopping lets it recover
    if (p.sprinting && moving) this._sprintT += dt; else { if (this._sprintT > 3.5 && this._recover <= 0) this._recover = 2.5; this._sprintT = Math.max(0, this._sprintT - dt * 1.6); }
    if (this._recover > 0) this._recover -= dt;
    const breathing = (this._sprintT > 1.8) || this._recover > 0;
    if (breathing && g.time >= this._breathAt) {
      this._breathAt = g.time + (this._recover > 0 ? 1.15 : clamp(1.0 - (this._sprintT - 1.8) * 0.06, 0.5, 1.0));
      this.play('breath', null, { loud: clamp(0.25 + (this._sprintT - 1.8) * 0.1, 0.2, 0.9) });
    }
    // a heartbeat when she is nearly out of light
    if (p.rays <= 2 && g.mode === 'playing' && g.time >= this._beatAt) { this._beatAt = g.time + (p.rays <= 1 ? 0.72 : 1.0); this.play('heartbeat', null, { loud: p.rays <= 1 ? 0.8 : 0.5 }); }
  }

  /** Her white cane: a dry tick one step ahead, and a small sonar ping. */
  _caneTap() {
    const g = this.game, p = g.player;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), tip = { x: p.pos.x + fx * 1.5, y: p.pos.y + 0.05, z: p.pos.z + fz * 1.5 };
    this.play('caneTap', tip, { loud: 0.2 });
    g.senses?.caneTap(tip);
  }

  // ------------------------------------------------------------------ Mithi's voice
  /** Sing a phrase of Raga Bhairav (non-spatial, on the voice bus). Returns {dur, notes, phrase}; works without a context. */
  sing(index = 0) {
    const phrase = RAGA.phrases[index % RAGA.phrases.length];
    let beats = 0; for (const [, b] of phrase) beats += b;
    const out = { dur: beats * (60 / RAGA.bpm) + 0.5, phrase, index: index % RAGA.phrases.length, notes: [] };
    this.stats.sung = (this.stats.sung ?? 0) + 1;
    this.voices.push({ id: ++this._id, kind: 'sing', loud: 0.6, d: 0, born: this.game.time, until: this.game.time + out.dur, chain: null, vg: null, endCtx: 0, spatial: false });
    if (this.running()) {
      try {
        const ctx = this.ctx, vg = ctx.createGain(); vg.gain.value = 1; vg.connect(this.voiceIn);
        const r = singPhrase(ctx, vg, ctx.currentTime + 0.03, { phrase, level: 0.8 });
        out.notes = r.notes; out.dur = r.dur;
        this.duck(0.45, r.dur + 0.5);
        setTimeout(() => { try { vg.disconnect(); } catch { /* ok */ } }, (r.dur + 1.5) * 1000);
      } catch (e) { out.error = String(e && e.message); this.stats.errors++; this.stats.lastError = 'sing: ' + out.error; }
    }
    return out;
  }

  // ------------------------------------------------------------------ frame
  update(dt, game) {
    // voice bookkeeping on game time (works without a context)
    const now = game.time;
    for (let i = this.voices.length - 1; i >= 0; i--) {
      const v = this.voices[i];
      const ended = v.chain ? (this.ctx && this.ctx.currentTime > v.endCtx) : now > v.until;
      if (ended) { if (v.chain) this._release(v.chain, v.vg); this.voices.splice(i, 1); }
    }
    const safe = (name, fn) => {            // audio must never take the game loop down with it
      try { fn(); } catch (e) {
        this.stats.errors++; this.stats.lastError = name + ': ' + (e && e.message ? e.message : e);
        this._fails[name] = (this._fails[name] ?? 0) + 1;
        if (this._fails[name] > 30 && (name === 'ambience' || name === 'music')) this[name] = null;
      }
    };
    if (game.mode === 'playing') safe('walk', () => this._walk(dt));      // footsteps, cane taps and their ripples work even with no running context
    safe('loops', () => this._updateLoops(dt));
    if (this.running()) {
      safe('listener', () => this._listener());
      if (this.ambience) safe('ambience', () => this.ambience.update(dt));
      if (this.music) safe('music', () => this.music.update(dt));
    }
  }

  /** Master output level (post compressor, pre master volume) over the last ~46 ms, in dBFS. */
  level() {
    if (!this.analyser || !this.running()) return null;
    this.analyser.getFloatTimeDomainData(this._meter);
    let peak = 0, sum = 0;
    for (let i = 0; i < this._meter.length; i++) { const v = this._meter[i]; const a = Math.abs(v); if (a > peak) peak = a; sum += v * v; }
    const db = (x) => (x > 1e-6 ? Math.round(20 * Math.log10(x) * 10) / 10 : -120);
    return { rmsDb: db(Math.sqrt(sum / this._meter.length)), peakDb: db(peak) };
  }

  state() {
    const kinds = {};
    for (const v of this.voices) kinds[v.kind] = (kinds[v.kind] ?? 0) + 1;
    return {
      context: this.ctx ? this.ctx.state : (this.failed ? 'failed' : 'none'), failed: this.failed, started: this.started, muted: this.muted,
      sampleRate: this.ctx ? this.ctx.sampleRate : null,
      voices: this.voices.length, voiceKinds: kinds, chainsInUse: this.chainsInUse, chainsPooled: this.chainPool.length,
      loops: [...this.loops.values()].map((l) => ({ id: l.id, kind: l.kind, d: Math.round(l.d), audible: l.audible, active: !!l.nodes })),
      played: this.stats.played, dropped: this.stats.dropped, stolen: this.stats.stolen, throttled: this.stats.throttled, tooFar: this.stats.tooFar, byKind: { ...this.stats.byKind },
      sung: this.stats.sung ?? 0, errors: this.stats.errors, lastError: this.stats.lastError, level: this.level(),
      volumes: { ...this.volumes },
      ambience: this.ambience ? this.ambience.state() : null,
      music: this.music ? this.music.state() : null,
      ripples: this.game.ripples ? this.game.ripples.activeCount() : 0,
    };
  }
}
