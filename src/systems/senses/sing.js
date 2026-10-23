// Sing (Q): Mithi's voice, and the echolocation wave it sends out.
//
//   game.sing.tryStart({force})   sing a phrase of Raga Bhairav if the 6 s cooldown allows. Emits sing:start {x,y,z,
//                                 index, dur} (Phase 4 hazards react: dogs and the deranged within 20 m are calmed, drones,
//                                 cameras and guards within 40 m are alerted) and later sing:end {x,y,z}.
//   game.sing.readyAt / cooldown  game seconds
//   game.sing.pulse               the live wave {kind, t0, dur, maxR, strength, band, origin}
//   game.sing.startPulse(kind, origin, opts)   any system can send a wave (the cane's small ping uses this)
//
// Controls: tap Q to sing. Hold Q for 2 s for second sight (a vision; see vision.js). While a vision is available the
// song fires on release of a short press (so a hold can become a vision instead); while it is not, on press.
//
// The wave drives the shared shader uniforms (uPulseOrigin / uPulseRadius / uPulseStrength / uPulseBand): a band of
// cool white sweeping over every patched material out to ~60 m in 2.5 s, lighting edges and a 2 m scan grid, with a
// fading wake. As it passes hazards (`game.hazards?.list?.()`, read defensively) and Setu it spawns ripples there.
import * as THREE from 'three';
import { RAGA } from '../audio/synth.js';

const COOLDOWN = 6;
const PULSE = { sing: { dur: 2.5, maxR: 60, strength: 1.0, band: 2.0 }, cane: { dur: 0.7, maxR: 7.5, strength: 0.2, band: 0.55 } };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export class Sing {
  init(game) {
    this.game = game;
    game.sing = this;
    this.cooldown = COOLDOWN; this.readyAt = 0;
    this.singing = false; this.singEnds = 0; this.count = 0; this.lastIndex = -1; this.last = null;
    this.hold = 0; this.holding = false; this.fired = false;
    this.pulse = { active: false, kind: 'sing', t0: 0, dur: 2.5, maxR: 60, strength: 1, band: 2, origin: new THREE.Vector3(), holdAge: null };
    this.echoes = []; this.denied = 0;
    this.rng = game.rng.fork('sing');
    this.U = game.materials.sense;
    this.ui = null;
    game.debug?.addAction('sing', (g, index) => { const r = this.tryStart({ force: true, index }); return { ok: !!r, index: r ? r.index : null, dur: r ? +r.dur.toFixed(2) : null, readyIn: +Math.max(0, this.readyAt - g.time).toFixed(2) }; });
    game.debug?.addAction('singReset', () => { this.readyAt = 0; return true; });
    game.debug?.addAction('pulseHold', (g, age) => { this.pulse.holdAge = age == null ? null : age; return this.pulse.holdAge; });   // tests: freeze the wave at an age (seconds)
    game.debug?.addState('sing', () => ({
      singing: this.singing, count: this.count, readyIn: +Math.max(0, this.readyAt - game.time).toFixed(2), pulse: this.pulse.active ? { kind: this.pulse.kind, radius: +this.U.uPulseRadius.value.toFixed(1), strength: +this.U.uPulseStrength.value.toFixed(2) } : null,
      hold: +this.hold.toFixed(2), phrase: this.lastIndex,
    }));
    this._buildUi();
  }

  reset() { this.readyAt = 0; this.singing = false; this.pulse.active = false; this.U.uPulseStrength.value = 0; }

  canSing() {
    const g = this.game;
    if (g.mode !== 'playing' || g.modal) return false;
    if (g.health?.dead || g.setu?.dead) return false;
    if (g.canSing && g.canSing() === false) return false;       // Phase 6: Jeetu cannot sing
    return true;
  }

  ready() { return this.game.time >= this.readyAt; }

  /** Sing now. Returns {index, dur, ...} or null (cooldown, modal, dead). */
  tryStart(opts = {}) {
    const g = this.game, p = g.player;
    if (!opts.force && !this.canSing()) return null;
    if (!opts.force && !this.ready()) { this.denied++; g.events.emit('sing:denied', { readyIn: this.readyAt - g.time }); return null; }
    const index = opts.index != null ? opts.index % RAGA.phrases.length : this._pick();
    const voice = g.audio ? g.audio.sing(index) : { dur: 4, phrase: RAGA.phrases[index], notes: [], index };
    this.lastIndex = index; this.count++;
    this.readyAt = g.time + this.cooldown;
    this.singing = true; this.singEnds = g.time + voice.dur;
    const o = { x: p.pos.x, y: p.eyeY, z: p.pos.z };
    this.last = { ...o, index, dur: voice.dur, phrase: voice.phrase, at: g.time };
    g.events.emit('sing:start', { x: o.x, y: o.y, z: o.z, index, dur: voice.dur, phrase: voice.phrase });
    this.startPulse('sing', o);
    g.ripples?.add({ x: p.pos.x, y: p.pos.y + 0.05, z: p.pos.z, loud: 0.8, tone: 'voice', flat: true, self: true, scale: 1 });
    g.screenfx?.flash('#bfe6ff', 700, 0.07);
    this._collectEchoes(o);
    return { index, dur: voice.dur, ...voice };
  }

  _pick() {
    let i = this.rng.int(0, RAGA.phrases.length - 1);
    if (i === this.lastIndex) i = (i + 1) % RAGA.phrases.length;
    return i;
  }

  startPulse(kind, origin, opts = {}) {
    const P = this.pulse, d = { ...PULSE[kind], ...opts };
    P.active = true; P.kind = kind; P.t0 = this.game.time; P.dur = d.dur; P.maxR = d.maxR; P.strength = d.strength; P.band = d.band;
    P.origin.set(origin.x, origin.y, origin.z);
    if (kind === 'sing') this.U.uPulseColor.value.setRGB(0.62, 0.86, 1.0); else this.U.uPulseColor.value.setRGB(0.5, 0.78, 0.95);
  }
  busy() { return this.pulse.active && this.pulse.kind === 'sing' && (this.game.time - this.pulse.t0) < this.pulse.dur * 0.7; }

  /** Everything the wave will touch: hazards and Setu, with the radius at which it gets there. */
  _collectEchoes(o) {
    const g = this.game; this.echoes.length = 0;
    let list = [];
    try { list = g.hazards?.list?.() ?? []; } catch { list = []; }
    for (const h of list) {
      const p = h.pos ?? h; if (!p || p.x === undefined) continue;
      const d = Math.hypot(p.x - o.x, p.y - o.y, p.z - o.z);
      if (d <= PULSE.sing.maxR) this.echoes.push({ x: p.x, y: p.y + 0.8, z: p.z, d, tone: h.alert ? 'threat' : 'echo', done: false });
    }
    const s = g.setu;
    if (s && !s.dead && !s.found) {
      const d = Math.hypot(s.pos.x - o.x, s.pos.y - o.y, s.pos.z - o.z);
      if (d <= PULSE.sing.maxR) this.echoes.push({ x: s.pos.x, y: s.pos.y + 0.8, z: s.pos.z, d, tone: 'setu', done: false, soft: true });
    }
  }

  // ------------------------------------------------------------------ the hold-Q logic and the ring UI
  _input(dt) {
    const g = this.game, input = g.input, down = input.action('sing'), vis = g.visionSystem;
    if (input.pressed('sing')) {
      this.holding = true; this.hold = 0; this.fired = false;
      if (!(vis && vis.available())) { this.holding = down; this.fired = true; this.tryStart(); }
      else if (!down) { this.holding = false; this.tryStart(); this.fired = true; }              // a tap too quick to see as held
    }
    if (this.holding) {
      if (down) {
        this.hold += dt;
        if (!this.fired && this.hold >= 2.0 && vis && vis.available()) { this.fired = true; vis.start({ reason: 'demand' }); }
      } else {
        this.holding = false;
        if (!this.fired) { this.fired = true; this.tryStart(); }
      }
    }
    if (!down && !this.holding) this.hold = 0;
  }

  _buildUi() {
    const ns = 'http://www.w3.org/2000/svg';
    const wrap = document.createElement('div'); wrap.id = 'sense-ring';
    wrap.innerHTML = `<svg viewBox="-20 -20 40 40" width="40" height="40"><circle class="bg" r="15"/><circle class="cd" r="15" transform="rotate(-90)"/><circle class="vc" r="18" transform="rotate(-90)"/></svg>`;
    document.body.appendChild(wrap);
    this.ui = { wrap, cd: wrap.querySelector('.cd'), vc: wrap.querySelector('.vc'), lastCd: -1, lastVc: -1 };
    void ns;
    const st = document.createElement('style');
    st.textContent = `#sense-ring{position:fixed;left:50%;top:50%;width:40px;height:40px;margin:-20px 0 0 -20px;pointer-events:none;z-index:7;opacity:0;transition:opacity .35s}
#sense-ring.on{opacity:1}#sense-ring svg{display:block;overflow:visible}
#sense-ring circle{fill:none;stroke-linecap:round}#sense-ring .bg{stroke:rgba(190,225,255,.12);stroke-width:1}
#sense-ring .cd{stroke:rgba(190,230,255,.75);stroke-width:1.6}#sense-ring .vc{stroke:rgba(255,205,120,.9);stroke-width:2.2;filter:drop-shadow(0 0 4px rgba(255,190,90,.8))}`;
    document.head.appendChild(st);
  }
  _ui() {
    const g = this.game, u = this.ui; if (!u) return;
    const cdLeft = Math.max(0, this.readyAt - g.time), cdFrac = cdLeft > 0 ? 1 - cdLeft / this.cooldown : 1;
    const vc = this.holding && this.hold > 0.3 ? clamp(this.hold / 2, 0, 1) : 0;
    const circ = 2 * Math.PI * 15, circ2 = 2 * Math.PI * 18;
    const cdKey = Math.round(cdFrac * 60), vcKey = Math.round(vc * 60);
    if (cdKey !== u.lastCd) { u.lastCd = cdKey; u.cd.setAttribute('stroke-dasharray', `${(circ * cdFrac).toFixed(1)} ${circ.toFixed(1)}`); }
    if (vcKey !== u.lastVc) { u.lastVc = vcKey; u.vc.setAttribute('stroke-dasharray', `${(circ2 * vc).toFixed(1)} ${circ2.toFixed(1)}`); }
    u.wrap.classList.toggle('on', cdLeft > 0 || vc > 0);
  }

  // ------------------------------------------------------------------ frame
  update(dt, game) {
    this._input(dt);
    if (!this.hinted && game.time > 16 && this.count === 0 && game.mode === 'playing') {
      this.hinted = true;
      game.messages?.say('Q to sing: a pulse of sound that shows you the shape of the world. Hold Q for second sight.', { kind: 'hint', ttl: 10 });
    }
    if (this.singing && game.time >= this.singEnds) {
      this.singing = false;
      const o = this.last; game.events.emit('sing:end', { x: o.x, y: o.y, z: o.z, index: o.index });
    }
    const P = this.pulse, U = this.U;
    if (P.active) {
      const age = P.holdAge != null ? P.holdAge : game.time - P.t0, u = age / P.dur;
      if (u > 1.35 && P.holdAge == null) { P.active = false; U.uPulseStrength.value = 0; }
      else {
        const e = clamp(u, 0, 1), radius = P.maxR * (1 - Math.pow(1 - e, 1.8));
        U.uPulseOrigin.value.copy(P.origin);
        U.uPulseRadius.value = radius;
        U.uPulseBand.value = P.band + radius * 0.035;
        U.uPulseStrength.value = P.strength * (1 - smooth(0.7, 1.35, u)) * smooth(0, 0.04, u);
        if (P.kind === 'sing') {
          for (const c of this.echoes) if (!c.done && radius >= c.d) {
            c.done = true;
            game.ripples?.add({ x: c.x, y: c.y, z: c.z, loud: c.soft ? 0.5 : 0.45, tone: c.tone, dist: c.d, soft: !!c.soft });
          }
        }
      }
    } else if (U.uPulseStrength.value !== 0) U.uPulseStrength.value = 0;
    this._ui();
  }
}
