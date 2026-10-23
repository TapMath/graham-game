// Cinematics (PLAN 1b, 7): `game.cinematics.play(name, opts)` -> Promise. Letterbox bars, camera paths, captions, input locked
// (`game.modal`), skippable with Esc or Enter. The scenes themselves are in scenes.js; this file is the director's toolkit.
//
//   game.cinematics.play('opening')    the collapse (05:30 vision, waking, the flyover falls, the title card, then play at 05:40)
//   game.cinematics.play('reunion', {type})   the bridge reunion at sunrise (ending 1 city warned / 2 not warned), then endings.show(type)
//   game.cinematics.play('setuLost') / ('mithiDies')   the short sequences before ending cards 3 and 4
//   game.cinematics.play('warning', {via})    sirens across the city and the evacuation PA (after game.story.warnCity)
//   game.cinematics.active / current / skip() / names / snapshot()
// Events: `cinematic:start {name}`, `cinematic:end {name, skipped}`.
// Opening: played on the first entry into 'playing' unless `?autostart=1` (then only with `?intro=1`). Ending handlers are registered
// with `game.endings.register`: 1 and 2 play the reunion when Mithi reached the bridge (debug and 'dawnMissed' endings use the plain
// card), 3 and 4 play their sequences (except for the debug endings).
//
// The sequencer. A scene is an async function `scene(cx, opts)`; cx.wait(s) waits in SIMULATION seconds (so `__grahan.step(s)`
// scrubs a scene deterministically). When the viewer skips, every wait resolves at once and the visual helpers become no-ops, so a
// scene runs straight through to its closing lines; keep state changes that must always happen in the scene's `finally`-style
// tail (after the last wait) or inside cx.always(fn).
import * as THREE from '../../../vendor/three.module.js';
import { buildMithi, buildSetu, buildNpc } from '../../characters/humanoid.js';
import { ensureStyles, esc } from './ui.js';
import { SCENES } from './scenes.js';
import { STEP } from '../../game.js';

const ease = {
  lin: (t) => t, inout: (t) => t * t * (3 - 2 * t), out: (t) => 1 - (1 - t) * (1 - t), in: (t) => t * t,
  soft: (t) => t * t * t * (t * (6 * t - 15) + 10),
};
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _up = new THREE.Vector3(0, 1, 0);
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const lerp = (a, b, t) => a + (b - a) * t;

export class Cine {
  constructor(sys, name, opts) {
    this.sys = sys; this.game = sys.game; this.name = name; this.opts = opts;
    this.t = 0; this.skipped = false; this.done = false;
    this.timers = []; this.tweens = []; this.actors = []; this.props = []; this.frameFns = [];
    this.rig = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 75, roll: 0, on: false };
    this.camTween = null; this.camFn = null; this.shakeAmp = 0; this.shakeT = 0; this.shakeDur = 1;
    this.capUntil = 0; this.cleanups = [];
  }

  // ------------------------------------------------------------------ time
  wait(s) {
    if (this.skipped || s <= 0) return Promise.resolve();
    return new Promise((res) => this.timers.push({ at: this.t + s, res }));
  }
  /** Run `fn` only when not skipped. */
  do(fn) { if (!this.skipped) return fn(); }
  /** Run `fn` even when skipped. */
  always(fn) { return fn(); }
  onCleanup(fn) { this.cleanups.push(fn); }
  frame(fn) { this.frameFns.push(fn); return fn; }
  unframe(fn) { this.frameFns = this.frameFns.filter((f) => f !== fn); }

  // ------------------------------------------------------------------ scalar tweens (sim time)
  tween(from, to, secs, fn, e = 'inout') {
    if (this.skipped || secs <= 0) { fn(to); return Promise.resolve(); }
    return new Promise((res) => this.tweens.push({ from, to, t: 0, dur: secs, fn, e: ease[e] ?? ease.inout, res }));
  }

  // ------------------------------------------------------------------ camera
  /** Hold the camera at p looking at l. */
  camSet(p, l, fov = 75, roll = 0) {
    const r = this.rig; r.pos.copy(V(p)); r.look.copy(V(l)); r.fov = fov; r.roll = roll; r.on = true; this.camTween = null; this.camFn = null;
  }
  /** Ease the camera to p/l (optionally fov, roll) over dur seconds. Returns a promise. */
  cam({ p, l, fov, roll, dur = 2, e = 'inout' }) {
    const r = this.rig;
    if (!r.on) this.camSet([this.game.camera.position.x, this.game.camera.position.y, this.game.camera.position.z], [0, 0, 0], this.game.camera.fov);
    if (this.skipped || dur <= 0) { if (p) r.pos.copy(V(p)); if (l) r.look.copy(V(l)); if (fov) r.fov = fov; if (roll !== undefined) r.roll = roll; return Promise.resolve(); }
    this.camFn = null;
    return new Promise((res) => {
      this.camTween = { t: 0, dur, e: ease[e] ?? ease.inout, from: { p: r.pos.clone(), l: r.look.clone(), fov: r.fov, roll: r.roll }, to: { p: p ? V(p) : null, l: l ? V(l) : null, fov, roll }, res };
    });
  }
  /** Drive the camera from a function of progress k (0..1): fn(k) -> {p, l, fov?, roll?}. */
  camPath(fn, dur, e = 'inout') {
    const r = this.rig; r.on = true;
    if (this.skipped) { this._applyPath(fn(1)); return Promise.resolve(); }
    this.camTween = null;
    return new Promise((res) => { this.camFn = { t: 0, dur, fn, e: ease[e] ?? ease.inout, res }; });
  }
  _applyPath(o) { const r = this.rig; if (o.p) r.pos.copy(Array.isArray(o.p) ? V(o.p) : o.p); if (o.l) r.look.copy(Array.isArray(o.l) ? V(o.l) : o.l); if (o.fov) r.fov = o.fov; if (o.roll !== undefined) r.roll = o.roll; }
  shake(amp, secs = 1) { if (this.skipped) return; this.shakeAmp = amp; this.shakeT = this.shakeDur = secs; }

  /** Record the scene time of a beat (state().story6b.cine.marks), handy for tuning. */
  mark(name) { this.sys.marks[name] = +this.t.toFixed(2); }

  // ------------------------------------------------------------------ screen layers
  _layer(id) { return this.sys.layers[id]; }
  /** Fade one of the overlay layers (black, white, bloom, vig, title, stamp) to alpha over secs. */
  fade(id, alpha, secs = 1, e = 'inout') {
    const el = this._layer(id);
    const from = parseFloat(el.dataset.a ?? '0') || 0;
    return this.tween(from, alpha, secs, (v) => { el.dataset.a = String(v); el.style.opacity = String(v); }, e);
  }
  black(alpha, secs = 1) { return this.fade('blink', alpha, secs); }
  white(alpha, secs = 1) { return this.fade('white', alpha, secs); }
  setWhiteColor(c) { this._layer('white').style.background = c; }
  /** Place the gold bloom at screen % (x, y). */
  bloomAt(x, y) { const el = this._layer('bloom'); el.style.setProperty('--bx', x + '%'); el.style.setProperty('--by', y + '%'); }
  bloom(alpha, secs = 1) { return this.fade('bloom', alpha, secs); }
  vignette(alpha, secs = 1) { return this.fade('vig', alpha, secs); }
  /** Title card: big word and a scrawled subtitle. */
  title(big, sub, on = true) {
    const el = this._layer('title');
    if (on) { el.innerHTML = `<h1>${esc(big)}</h1><div class="rule"></div><p>${esc(sub)}</p>`; void el.offsetWidth; el.classList.add('on'); } else el.classList.remove('on');
  }
  /** A centred stamp (time, place) fading in over the picture. */
  stamp(main, sub, on = true) {
    const el = this._layer('stamp');
    if (on) { el.innerHTML = `${esc(main)}${sub ? `<small>${esc(sub)}</small>` : ''}`; void el.offsetWidth; el.classList.add('on'); } else el.classList.remove('on');
  }
  letterbox(on = true) { document.body.classList.toggle('cine', !!on); }

  /** A caption line under the picture. kind: 'say' (default), 'pa', 'scrawl'. */
  cap(text, { who = '', ttl = 3.5, kind = 'say' } = {}) {
    if (this.skipped) return;
    const el = this.sys.capEl;
    el.className = kind === 'say' ? '' : kind;
    el.innerHTML = (who ? `<span class="who">${esc(who)}</span>` : '') + esc(text);
    void el.offsetWidth; el.classList.add('on');
    this.capUntil = this.t + ttl; this.sys.lastCaption = (who ? who + ': ' : '') + text;
    this.game.events.emit('cinematic:caption', { text, who, kind });
  }
  capOff() { this.sys.capEl.classList.remove('on'); this.capUntil = 0; }
  /** Caption and wait for it. */
  async say(text, o = {}) { this.cap(text, o); await this.wait(o.ttl ?? 3.5); }

  // ------------------------------------------------------------------ actors and props
  actor(kind, x, y, z, yaw = 0) {
    const g = this.game;
    const char = kind === 'mithi' ? buildMithi(g) : kind === 'setu' ? buildSetu(g) : buildNpc(kind, g);
    g.scene.add(char.group);
    g.senses?.patchObject?.(char.group);
    const a = { kind, char, pos: { x, y, z }, yaw, speed: 0, goal: null, visible: true };
    this.actors.push(a);
    this._syncActor(a);
    return a;
  }
  _syncActor(a) {
    const gr = a.char.group;
    gr.position.set(a.pos.x, a.pos.y, a.pos.z);
    gr.rotation.set(0, a.yaw, 0);
    gr.visible = a.visible;
  }
  /** Walk an actor to (x, z) at `speed` m/s; resolves on arrival. */
  walk(a, x, z, speed = 1.5, { face = true } = {}) {
    if (this.skipped) { a.pos.x = x; a.pos.z = z; a.speed = 0; return Promise.resolve(); }
    return new Promise((res) => { a.goal = { x, z, speed, face, res }; });
  }
  /** Face a direction (world point). */
  faceTo(a, x, z) { a.yaw = Math.atan2(-(x - a.pos.x), -(z - a.pos.z)); this._syncActor(a); }
  prop(obj) { this.game.scene.add(obj); this.props.push(obj); return obj; }
  removeProp(obj) { this.game.scene.remove(obj); this.props = this.props.filter((p) => p !== obj); }

  // ------------------------------------------------------------------ per step
  step(dt) {
    this.t += dt;
    // timers
    if (this.timers.length) {
      const due = this.timers.filter((x) => x.at <= this.t);
      if (due.length) { this.timers = this.timers.filter((x) => x.at > this.t); due.forEach((x) => x.res()); }
    }
    // scalar tweens
    for (const tw of this.tweens) {
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(lerp(tw.from, tw.to, tw.e(k)));
    }
    if (this.tweens.length) { const fin = this.tweens.filter((tw) => tw.t >= tw.dur); if (fin.length) { this.tweens = this.tweens.filter((tw) => tw.t < tw.dur); fin.forEach((tw) => tw.res()); } }
    // caption timeout
    if (this.capUntil && this.t >= this.capUntil) this.capOff();
    // actors
    for (const a of this.actors) {
      if (a.goal) {
        const gl = a.goal, dx = gl.x - a.pos.x, dz = gl.z - a.pos.z, d = Math.hypot(dx, dz), stp = gl.speed * dt;
        if (d <= stp) { a.pos.x = gl.x; a.pos.z = gl.z; a.speed = 0; a.goal = null; gl.res(); }
        else {
          a.pos.x += dx / d * stp; a.pos.z += dz / d * stp; a.speed = gl.speed;
          if (gl.face) a.yaw = turn(a.yaw, Math.atan2(-dx, -dz), 9 * dt);
        }
      } else a.speed = 0;
      a.char.update(dt, a.speed, { onGround: true });
      this._syncActor(a);
    }
    for (const f of this.frameFns) f(dt, this);
    this._stepCamera(dt);
  }

  _stepCamera(dt) {
    const r = this.rig;
    if (!r.on) return;
    const ct = this.camTween;
    if (ct) {
      ct.t += dt;
      const k = ct.e(Math.min(1, ct.t / ct.dur));
      if (ct.to.p) r.pos.lerpVectors(ct.from.p, ct.to.p, k);
      if (ct.to.l) r.look.lerpVectors(ct.from.l, ct.to.l, k);
      if (ct.to.fov !== undefined) r.fov = lerp(ct.from.fov, ct.to.fov, k);
      if (ct.to.roll !== undefined) r.roll = lerp(ct.from.roll, ct.to.roll, k);
      if (ct.t >= ct.dur) { this.camTween = null; ct.res(); }
    }
    const cf = this.camFn;
    if (cf) {
      cf.t += dt;
      const kk = Math.min(1, cf.t / cf.dur);
      this._applyPath(cf.fn(cf.e(kk), kk));
      if (cf.t >= cf.dur) { this.camFn = null; cf.res(); }
    }
    this.apply(dt);
  }

  /** Write the rig to the game camera (with shake). */
  apply(dt) {
    const r = this.rig, cam = this.game.camera;
    cam.position.copy(r.pos);
    let sx = 0, sy = 0, sr = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const f = Math.max(0, this.shakeT / this.shakeDur), a = this.shakeAmp * f * f, tt = this.game.time;
      sx = Math.sin(tt * 47.3) * 0.09 * a; sy = Math.sin(tt * 61.1 + 1.3) * 0.12 * a; sr = Math.sin(tt * 29.1) * 0.03 * a;
      cam.position.x += sx; cam.position.y += sy; cam.position.z += Math.cos(tt * 39.7) * 0.09 * a;
    }
    cam.up.set(0, 1, 0);
    cam.lookAt(r.look);
    if (r.roll || sr) cam.rotateZ(r.roll + sr);
    if (Math.abs(cam.fov - r.fov) > 1e-3) { cam.fov = r.fov; cam.updateProjectionMatrix(); }
  }

  /** Remove the actors and props (the scene carries on). */
  clearProps() {
    const g = this.game;
    for (const a of this.actors) { g.scene.remove(a.char.group); try { a.char.dispose?.(); } catch { /* ok */ } }
    for (const p of this.props) { g.scene.remove(p); p.geometry?.dispose?.(); }
    this.actors.length = 0; this.props.length = 0;
  }

  /** Remove everything this scene added. */
  cleanup() {
    this.clearProps();
    for (const f of this.cleanups) { try { f(); } catch { /* ok */ } }
    this.cleanups.length = 0;
    this.capOff();
  }
}

function turn(cur, want, maxStep) {
  let d = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
  d = Math.max(-maxStep, Math.min(maxStep, d));
  return cur + d;
}

// ====================================================================================================== system
export class CinematicSystem {
  init(game) {
    this.game = game;
    game.cinematics = this;
    ensureStyles();
    this.current = null; this.last = null; this.played = {}; this.lastCaption = ''; this.marks = {};
    this._buildDom();
    this.names = Object.keys(SCENES);
    this.openingPlayed = false; this.bridgeFind = false;

    const q = new URLSearchParams(location.search);
    this.introWanted = !game.params.autostart || (q.has('intro') && q.get('intro') !== '0');
    window.addEventListener('keydown', (e) => {
      if (!this.current || e.repeat) return;
      if ((e.code === 'Escape' || e.code === 'Enter') && this.current.t > 0.5 && !this.current.opts.noSkip) this.skip();
    }, true);

    const ev = game.events;
    ev.on('mode:changed', ({ mode }) => {
      if (mode === 'playing' && !this.openingPlayed && this.introWanted && !game.params.arena) { this.openingPlayed = true; setTimeout(() => this.play('opening').catch((e) => console.error(e)), 30); }
      if (mode === 'playing' && !this.openingPlayed && !this.introWanted) this.openingPlayed = true;
      if (mode === 'playing' && !this.current && this._endLayers) this._clearLayers();
    });
    ev.on('setu:found', ({ via }) => { if (via === 'bridge') this.bridgeFind = true; });

    // ending presentations (PLAN 7): the reunion for 1 and 2 when she reached the bridge; the short sequences for 3 and 4
    const E = game.endings;
    if (E) {
      const reunion = (type) => (g, info, endings) => {
        if (info?.reason !== 'bridge') return false;
        this.play('reunion', { type, info, endings }).catch((e) => { console.error(e); endings.show(type, info); });
        return true;
      };
      E.register(1, reunion(1)); E.register(2, reunion(2));
      E.register(3, (g, info, endings) => {
        if (!info || info.reason === 'debug') return false;
        this.play('setuLost', { info, endings }).catch((e) => { console.error(e); endings.show(3, info); });
        return true;
      });
      E.register(4, (g, info, endings) => {
        if (!info || info.reason === 'debug') return false;
        this.play('mithiDies', { info, endings }).catch((e) => { console.error(e); endings.show(4, info); });
        return true;
      });
    }
    game.debug?.addAction('cine', (g, name = 'opening', opts = {}) => { this.play(name, opts).catch((e) => console.error(e)); return name; });
    game.debug?.addAction('cineSkip', () => { this.skip(); return true; });
    // test aid: advance the simulation for `s` seconds yielding to the microtask queue every step, so a scene's awaits progress
    // in step with its clock (plain __grahan.step() is synchronous: a scene would only advance one beat per call)
    game.debug?.addAction('cineAdvance', async (g, s = 1) => { const n = Math.max(1, Math.round(s / STEP)); for (let i = 0; i < n; i++) { g.update(STEP); await Promise.resolve(); } return this.snapshot(); });
    game.debug?.addSetter('introWanted', (g, v) => { this.introWanted = !!v; });
  }

  _buildDom() {
    const mk = (tag, id, cls, parent = document.body) => { const e = document.createElement(tag); if (id) e.id = id; if (cls) e.className = cls; parent.appendChild(e); return e; };
    mk('div', null, 'cine-bar top'); mk('div', null, 'cine-bar bot');
    this.capEl = mk('div', 'cine-cap');
    const skip = mk('div', 'cine-skip'); skip.innerHTML = '<kbd>Esc</kbd> or <kbd>Enter</kbd> to skip';
    this.layers = {
      blink: mk('div', 'cine-blink'), white: mk('div', 'cine-white'), bloom: mk('div', 'cine-bloom'), vig: mk('div', 'cine-vig'),
      title: mk('div', 'cine-title'), stamp: mk('div', 'cine-stamp'),
    };
  }

  get active() { return !!this.current; }

  /** Play a scene. Resolves when it has finished (or been skipped). */
  async play(name, opts = {}) {
    const scene = SCENES[name];
    if (!scene) throw new Error('no cinematic ' + name);
    const game = this.game;
    if (this.current) { if (name === 'warning') return; this.skip(); await Promise.resolve(); }
    const cx = new Cine(this, name, opts);
    this.current = cx; this.played[name] = (this.played[name] ?? 0) + 1;
    this.saved = { yaw: game.player.yaw, pitch: game.player.pitch, view: game.view?.mode, perceive: game.senses?.perceive, fov: game.camera.fov };
    game.fragments?.close?.(true);
    game.modal = true;
    document.body.classList.add('cine-active');
    game.events.emit('cinematic:start', { name });
    try {
      await scene(cx, opts);
    } finally {
      this._end(cx);
    }
  }

  _end(cx) {
    const game = this.game;
    cx.done = true;
    cx.cleanup();
    for (const el of Object.values(this.layers)) { if (el.id === 'cine-title' || el.id === 'cine-stamp') el.classList.remove('on'); }
    if (!cx.opts.keepLayers) for (const id of ['white', 'bloom', 'vig']) { this.layers[id].style.opacity = '0'; this.layers[id].dataset.a = '0'; }
    if (!cx.opts.keepBlack) { this.layers.blink.style.opacity = '0'; this.layers.blink.dataset.a = '0'; }
    if (cx.opts.keepLayers || cx.opts.keepBlack) this._endLayers = true;
    if (!cx.opts.keepLayers && game.senses && this.saved.perceive !== undefined) game.senses.perceive = this.saved.perceive;
    cx.letterbox(false);
    document.body.classList.remove('cine-active');
    game.camera.fov = this.saved.fov; game.camera.updateProjectionMatrix();
    game.player.syncCamera();
    if (game.sky?.disc) game.sky.disc.visible = true;
    if (!game.endings?.current) game.modal = false;
    game.events.emit('cinematic:end', { name: cx.name, skipped: cx.skipped });
    this.last = { name: cx.name, skipped: cx.skipped, t: +cx.t.toFixed(1) };
    if (this.current === cx) this.current = null;
  }

  _clearLayers() {
    this._endLayers = false;
    for (const id of ['white', 'bloom', 'vig', 'blink']) { this.layers[id].style.opacity = '0'; this.layers[id].dataset.a = '0'; }
  }

  skip() {
    const cx = this.current; if (!cx || cx.skipped) return;
    cx.skipped = true;
    for (const t of cx.timers.splice(0)) t.res();
    for (const tw of cx.tweens.splice(0)) { tw.fn(tw.to); tw.res(); }
    for (const a of cx.actors) { if (a.goal) { a.pos.x = a.goal.x; a.pos.z = a.goal.z; const r = a.goal.res; a.goal = null; r(); } }
    if (cx.camTween) { const ct = cx.camTween; cx.camTween = null; ct.res(); }
    if (cx.camFn) { const cf = cx.camFn; cx.camFn = null; cf.res(); }
    cx.capOff();
  }

  update(dt, game) {
    const cx = this.current;
    if (!cx) return;
    game.modal = true;
    if (game.hazards) game.hazards.grace = Math.max(game.hazards.grace, 6);
    cx.step(dt);
    // keep the world's own cameras out of the shot
    if (game.view?.mithi) game.view.mithi.group.visible = false;
    if (game.setu && cx.hideSetu) game.setu.model.group.visible = false;
    if (cx.hideSky && game.sky?.disc) game.sky.disc.visible = false;
    if (cx.skyHour !== undefined) game.sky?.setTimeOfDay(cx.skyHour);
    if (cx.hemiBoost && game.sky) game.sky.hemi.intensity *= cx.hemiBoost;
  }

  snapshot() {
    const cx = this.current;
    return {
      active: !!cx, name: cx ? cx.name : null, t: cx ? +cx.t.toFixed(2) : null, skipped: cx ? cx.skipped : null, caption: this.lastCaption,
      last: this.last, marks: this.marks, played: { ...this.played }, openingPlayed: this.openingPlayed, introWanted: this.introWanted,
      actors: cx ? cx.actors.map((a) => ({ k: a.kind, x: +a.pos.x.toFixed(1), z: +a.pos.z.toFixed(1), v: +a.speed.toFixed(1) })) : [],
    };
  }
}
