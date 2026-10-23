// Setu (PLAN 1b step 5, section 6). An asthmatic eight-year-old somewhere in the city, on his own timeline,
// whose health is his breath.
//
//   game.setu.pos {x,y,z}          where he is (feet)            .yaw
//   game.setu.health               0..100 (breath)               .found  .following  .dead
//   game.setu.windowId             the timeline spot he is at ('liftWreck', 'catacombs', ... 'bridge')
//   game.setu.schedule             the jittered timeline [{id, level, x,y,z, from, to}] (game hours, absolute)
//   game.setu.find(opts)           give the pill and inhaler: health 100, decay at a third, he follows Mithi
//   game.setu.setHealth(v) / hurt(n, source)     hooks for debug and for Phase 4 dangers
//   game.setu.setFollowing(bool)   force follow on/off (debug / story)
//   game.setu.setDecayMul(id, mul) extra breath-rate multipliers (Phase 4 smog/dust/flood plug in here)
//   game.setu.follower             the Follower (src/systems/follower.js); game.setu.model the Character
//   game.setu.teleportTo(x,y,z)    place him (clears follow progress)
//
// Events: 'setu:story' {pct, index, text} (the 100% line reveals the HUD meter), 'setu:moved' {from, to},
// 'setu:clue' {id, text}, 'setu:doctor' {health}, 'setu:found' {health}, 'setu:following' {following},
// 'setu:health' {health} (when it crosses a whole percent), 'setu:died' {}.
// Flags written: setuFound, setuFollowing. The endings system listens for 'setu:died' (ending 3).
//
// Timeline: while not found, Setu stands at the spot of the current window. When a window ends he moves
// to the next spot while the player cannot see him (more than 28 m away or behind a wall), but never later
// than 0.4 game hours after the window ended. Leaving a spot leaves a clue there for a couple of hours.
import * as THREE from '../../vendor/three.module.js';
import { buildSetu } from '../characters/humanoid.js';
import { Follower, turnToward } from './follower.js';
import { buildSchedule, windowAt, breathRate, BREATH } from './setu-schedule.js';

const LINES = {
  100: ['Setu. Setu, where are you?'],
  75: ['Somewhere below, a cough echoes off the pillars. Setu.', 'That cough again, thinner now. It is him.'],
  50: ['The coughing has changed. Shorter. Wetter. Hurry, Mithi.', 'His breath whistles in your memory. Half of him is gone already.'],
  25: ['You can barely hear him breathe. It sounds like a kettle far away.', 'The whistle in his chest is the only sound you can find.'],
  10: ['Quiet. Too quiet. Then one small wheeze, and nothing.', 'Setu... please. One more breath. One more.'],
};
const CLUES = {
  liftWreck: 'Small footprints in the grit beside the wrecked lift, already cold. "The boy went west," a voice says. "Coughing."',
  catacombs: 'The alcove still smells of a snuffed diya. "He left an hour ago," someone whispers. "Coughing. They took the children toward the big machine."',
  boringSite: 'The cutter head ticks as it cools. "The little one? The contractor took him down the long tunnel, south. To the doctor."',
  clinic: '"He slipped out while I was busy," the doctor says, tired. "Asked about a vent. He is small enough to fit."',
  ventExit: 'A grille hangs open on the stack, bent from the inside. Something small crawled out here, coughing.',
  triageTents: '"A boy asked for his sister," a volunteer says without looking up. "We sent him toward the bodies. Then I think he walked east."',
};
const OBSERVED_DIST = 28, MAX_DEFER = 0.4, CLUE_RANGE = 11, CLUE_WINDOW = 2.5;
const _o = { x: 0, y: 0, z: 0 }, _d = { x: 0, y: 0, z: 0 };

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,240,200,1)'); gr.addColorStop(0.35, 'rgba(255,200,120,.35)'); gr.addColorStop(1, 'rgba(255,180,90,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class SetuSystem {
  init(game) {
    this.game = game;
    game.setu = this;
    this.rng = game.rng.fork('setu');
    this.schedule = buildSchedule(game.world.setuTimeline, this.rng);
    this.pos = { x: 0, y: 0, z: 0 };
    this.yaw = Math.PI;
    this.mods = new Map();
    this.model = buildSetu(game);
    this.model.group.name = 'setu';
    game.scene.add(this.model.group);
    this.glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffe0a8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.4 });
    this.glow = new THREE.Sprite(this.glowMat);
    this.glow.scale.setScalar(1.8);
    game.scene.add(this.glow);
    this.follower = new Follower(game, this, game.player, { label: 'setu', speed: 4.3, maxSpeed: 7.6, followDist: 1.9 });

    game.interactables.add({
      id: 'setu', pos: this.pos, radius: 2.5, height: 2.6, priority: 2,      // Phase 7b: the pill beats any clue lying beside him
      prompt: () => (this.health < 30 ? 'Quick. Give Setu his pill and inhaler' : 'Give Setu his pill and inhaler'),
      enabled: () => !this.dead && !this.found,
      onInteract: () => this.find({ via: 'interact' }),
    });

    game.events.on('clock:advanced', ({ from, to }) => this._integrate(from, to, true));
    game.events.on('clock:set', ({ to }) => { this._lastT = to; this._place(true); });

    const dbg = game.debug;
    dbg?.addState('setu', () => this.snapshot());
    dbg?.addSetter('setuFollowing', (g, v) => this.setFollowing(!!v));
    dbg?.addSetter('setuHealth', (g, v) => this.setHealth(v));
    dbg?.addAction('setuFind', () => { this.find({ via: 'debug' }); return this.snapshot(); });
    dbg?.addAction('setuSetHealth', (g, v) => { this.setHealth(v); return this.health; });
    dbg?.addAction('setuTeleportToPlayer', (g, dist = 2) => { this.teleportToPlayer(dist); return this.snapshot(); });
    dbg?.addAction('tpToSetu', (g, dist = 3) => {            // put the player near Setu, looking at him
      const p = game.player, s = this.pos;
      p.teleport(s.x + 0, s.y, s.z + dist, 0);
      p.setLook(0, 0);
      return this.snapshot();
    });
    this.reset();
  }

  reset() {
    this.health = 100; this.found = false; this.following = false; this.dead = false;
    this.boosted = false; this.idx = -1; this.pending = null; this.speed = 0;
    this.firedPct = new Set(); this.lineCount = {};
    this.abandoned = []; this.shownClues = new Set(); this._cough = 3; this._coughT = 0; this._intro = false; this._pulse = 0;
    this._lastT = this.game.clock?.t ?? 5.667; this._wholePct = 100; this.diedAt = null; this._tNow = this._lastT;
    this.game.flags.setuFound = false; this.game.flags.setuFollowing = false;
    this.model.group.rotation.set(0, 0, 0);
    this._place(true);
  }

  get windowId() { return this.schedule[Math.max(0, this.idx)]?.id ?? null; }
  get dist() { const p = this.game.player.pos; return Math.hypot(p.x - this.pos.x, p.z - this.pos.z); }

  // ------------------------------------------------------------------ place / move
  teleportTo(x, y, z) {
    this.pos.x = x; this.pos.y = y; this.pos.z = z;
    this.follower.vy = 0; this.follower.ground = null; this.follower.reset();
    this._sync();
  }

  teleportToPlayer(dist = 2) {
    const p = this.game.player, w = this.game.physics;
    for (const ang of [0, 0.8, -0.8, 1.6, -1.6, 2.4, -2.4, Math.PI]) {
      const x = p.pos.x - Math.sin(p.yaw + ang) * dist, z = p.pos.z - Math.cos(p.yaw + ang) * dist;
      const g = w.groundHeightAt(x, z, p.pos.y, 0.6);
      if (g > -Infinity && Math.abs(g - p.pos.y) < 0.7) { this.teleportTo(x, g, z); this.yaw = p.yaw + Math.PI; return; }
    }
    this.teleportTo(p.pos.x, p.pos.y, p.pos.z);
  }

  /** Put him at the spot of the window for the current clock time (immediately if `force`, else when unobserved). */
  _place(force = false) {
    const clock = this.game.clock; if (!clock) return;
    const idx = windowAt(this.schedule, clock.t);
    if (idx === this.idx) { this.pending = null; return; }
    const w = this.schedule[idx];
    if (this.following || this.found) { this.idx = idx; return; }
    if (this.idx >= 0 && !force) {
      if (!this.pending) this.pending = { idx, since: clock.t };
      this.pending.idx = idx;
      if (this._observed() && clock.t - this.pending.since < MAX_DEFER) return;
    }
    const from = this.idx >= 0 ? this.schedule[this.idx] : null;
    if (from && !force) this.abandoned.push({ id: from.id, x: from.x, y: from.y, z: from.z, at: clock.t });
    this.idx = idx; this.pending = null;
    this.teleportTo(w.x, w.y, w.z);
    this.yaw = Math.PI * 0.5 + this.rng.range(-1, 1);
    this.game.events.emit('setu:moved', { from: from?.id ?? null, to: w.id });
  }

  _observed() {
    const g = this.game, p = g.player;
    const dx = this.pos.x - p.pos.x, dz = this.pos.z - p.pos.z, dy = this.pos.y - p.pos.y;
    const d = Math.hypot(dx, dz, dy);
    if (d > OBSERVED_DIST) return false;
    _o.x = p.pos.x; _o.y = p.eyeY; _o.z = p.pos.z;
    const tx = this.pos.x, ty = this.pos.y + 0.8, tz = this.pos.z;
    const len = Math.hypot(tx - _o.x, ty - _o.y, tz - _o.z) || 1;
    _d.x = (tx - _o.x) / len; _d.y = (ty - _o.y) / len; _d.z = (tz - _o.z) / len;
    return !g.physics.raycast(_o, _d, len, (c) => c.solid);
  }

  // ------------------------------------------------------------------ breath
  setDecayMul(id, mul) { if (mul == null || mul === 1) this.mods.delete(id); else this.mods.set(id, mul); }
  decayMul() { let m = 1; for (const v of this.mods.values()) m *= v; return m; }

  setHealth(v) {
    this._tNow = this.game.clock.t;
    this.health = Math.max(0, Math.min(100, v));
    // re-arm story lines above the new value so they can fire again on the way down
    for (const k of [...this.firedPct]) if (k !== 100 && this.health > k + 4) this.firedPct.delete(k);
    this._afterHealth();
  }

  hurt(n, source = 'hazard') {
    if (this.dead || n <= 0) return;
    this._tNow = this.game.clock.t;
    this.health = Math.max(0, this.health - n);
    this.game.events.emit('setu:hurt', { n, source, health: this.health });
    this._afterHealth();
  }

  /** Current environment for breath: where he really is when following, else the spot of his window. */
  _env(t) {
    const g = this.game;
    let pos = this.pos, level;
    if (!this.following && !this.found) { const w = this.schedule[windowAt(this.schedule, t)]; pos = w; level = w.level; }
    else level = g.world.levelAt(pos);
    const air = g.air ? g.air.at(pos) : { smog: 0, dust: 0 };
    let nearVent = false;
    for (const v of g.world.ventSpots ?? []) {
      if (Math.hypot(pos.x - v.g.x, pos.z - v.g.z) < 5 && Math.abs(pos.y - v.g.y) < 3) nearVent = true;
      else if (Math.hypot(pos.x - v.u.x, pos.z - v.u.z) < 5 && Math.abs(pos.y - v.u.y) < 3) nearVent = true;
    }
    return { level, smog: air.smog, dust: air.dust, tunnel: level === 'U', nearVent, found: this.found };
  }

  /** Integrate breath over game time [t0, t1] (hours). `jump`: a clock penalty skipped this span. */
  _integrate(t0, t1, jump = false) {
    if (this.dead || t1 <= t0) { this._lastT = Math.max(this._lastT, t1); return; }
    const g = this.game;
    const clinic = this.schedule.find((w) => w.id === 'clinic');
    const n = Math.max(1, Math.ceil((t1 - t0) / 0.05));
    const dh = (t1 - t0) / n;
    for (let i = 0; i < n && !this.dead; i++) {
      const t = t0 + dh * (i + 0.5);
      this._tNow = t;
      if (!this.boosted && !this.found && clinic && t >= clinic.from) {          // the doctor's visit buys him time
        this.boosted = true;
        this.health = Math.min(100, this.health + BREATH.doctorBoost);
        for (const k of [...this.firedPct]) if (k !== 100 && this.health > k + 4) this.firedPct.delete(k);
        g.events.emit('setu:doctor', { health: this.health });
      }
      const rate = breathRate(this._env(t)) * this.decayMul();
      this.health = Math.max(0, this.health - rate * dh);
      this._afterHealth();
    }
    this._lastT = Math.max(this._lastT, t1);
    void jump;
  }

  _afterHealth() {
    const g = this.game;
    if (this.health <= 0 && !this.dead) {
      this.dead = true; this.health = 0; this.following = false;
      g.flags.setuFollowing = false;
      this.diedAt = this._tNow;
      g.events.emit('setu:died', { t: this.diedAt, hhmm: g.clock.fmt(this.diedAt) });
      return;
    }
    const whole = Math.ceil(this.health);
    if (whole !== this._wholePct) { this._wholePct = whole; g.events.emit('setu:health', { health: this.health }); }
    if (!this.found && !this.dead) {
      for (const pct of [75, 50, 25, 10]) {
        if (this.health <= pct && !this.firedPct.has(pct)) this._line(pct);
      }
    }
  }

  _line(pct) {
    this.firedPct.add(pct);
    const arr = LINES[pct], n = this.lineCount[pct] = (this.lineCount[pct] ?? 0) + 1;
    const text = arr[Math.min(n - 1, arr.length - 1)];
    this.game.messages?.say(text, { kind: 'story', ttl: 9 });
    this.game.events.emit('setu:story', { pct, index: n, text });
  }

  // ------------------------------------------------------------------ finding him
  find(opts = {}) {
    if (this.dead || this.found) return false;
    const g = this.game;
    this.found = true; this.following = true; this.health = 100; this._wholePct = 100;
    this.pending = null;
    g.flags.setuFound = true; g.flags.setuFollowing = true;
    this.follower.reset();
    g.messages?.say('You press the pill into his palm and the inhaler to his lips. He breathes. "Didi... you came."', { kind: 'story', ttl: 9 });
    g.events.emit('setu:found', { health: this.health, via: opts.via ?? 'interact', window: this.windowId });
    g.events.emit('setu:following', { following: true });
    return true;
  }

  setFollowing(on) {
    const g = this.game;
    if (on) {
      if (this.dead) return;
      if (!this.found) { this.found = true; this.health = Math.max(this.health, 100); g.flags.setuFound = true; }
      if (this.dist > 6) this.teleportToPlayer(2.5);
      this.following = true; g.flags.setuFollowing = true;
      this.follower.reset();
      g.events.emit('setu:following', { following: true });
    } else {
      this.following = false; this.found = false; g.flags.setuFollowing = false; g.flags.setuFound = false;
      this.idx = -1; this._place(true);
      g.events.emit('setu:following', { following: false });
    }
  }

  // ------------------------------------------------------------------ clues
  _clues() {
    const g = this.game, p = g.player, t = g.clock.t;
    for (const a of this.abandoned) {
      if (this.shownClues.has(a.id) || t - a.at > CLUE_WINDOW || !CLUES[a.id]) continue;
      if (Math.abs(p.pos.y - a.y) > 4 || Math.hypot(p.pos.x - a.x, p.pos.z - a.z) > CLUE_RANGE) continue;
      this.shownClues.add(a.id);
      g.messages?.say(CLUES[a.id], { kind: 'clue', ttl: 11 });
      g.events.emit('setu:clue', { id: a.id, text: CLUES[a.id] });
    }
  }

  // ------------------------------------------------------------------ frame
  update(dt, game) {
    const clock = game.clock;
    if (!this._intro && game.time > 2.0) {
      this._intro = true;
      this._line(100); this.firedPct.add(100);
    }
    if (clock.t > this._lastT) this._integrate(this._lastT, clock.t);
    if (this.dead) { this._sync(); this._animate(dt); return; }

    if (this.following) {
      this.follower.update(dt);
      this.speed = this.follower.speed;
    } else {
      this.speed = 0;
      const pp = game.player.pos;
      if (!this.dead && this.dist < 12) this.yaw = turnToward(this.yaw, Math.atan2(-(pp.x - this.pos.x), -(pp.z - this.pos.z)), 2.5 * dt);   // he turns to the sound of Mithi
      const idx = windowAt(this.schedule, clock.t);
      if (idx !== this.idx) this._place(false);
      if (!this.found) this._clues();
    }
    this._sync();
    this._animate(dt);
  }

  _sync() {
    const it = this.game.interactables.get('setu');
    if (it) { it.pos.x = this.pos.x; it.pos.y = this.pos.y; it.pos.z = this.pos.z; }
  }

  _animate(dt) {
    const m = this.model, g = this.game;
    m.group.position.set(this.pos.x, this.pos.y, this.pos.z);
    if (this.dead) { m.group.rotation.set(-Math.PI / 2, this.yaw, 0, 'YXZ'); m.group.position.y += 0.12; }
    else m.group.rotation.set(0, this.yaw, 0);
    const onGround = this.following ? this.follower.onGround : true;
    m.update(dt, this.dead ? 0 : this.speed, { onGround });
    if (!this.dead && !this.found && this.health < 45) {                // hunched, coughing
      this._cough -= dt;
      if (this._cough <= 0) { this._coughT = 0.9; this._cough = 2.5 + (this.health / 100) * 6 + this.rng.range(0, 3); }
      this._coughT = Math.max(0, this._coughT - dt);
      const k = this._coughT > 0 ? Math.sin(this._coughT * 38) * 0.06 : 0;
      m.rig.rotation.x = -0.28 - (45 - this.health) * 0.004 + k;
      m.rig.position.y -= 0.03;
    }
    // heartbeat glow: faster and fainter as he fades
    this._pulse += dt * (1.2 + (1 - this.health / 100) * 2.4);
    const near = this.dist < 70 && !this.dead && !this.found;
    this.glow.visible = near;
    if (near) {
      this.glow.position.set(this.pos.x, this.pos.y + 0.75, this.pos.z);
      const beat = Math.max(0, Math.sin(this._pulse * 4)) ** 4;
      this.glowMat.opacity = (0.16 + 0.3 * beat) * (0.4 + 0.6 * this.health / 100);
    }
    const cam = g.camera.position;
    m.group.visible = Math.hypot(this.pos.x - cam.x, this.pos.z - cam.z) < 150;
  }

  snapshot() {
    const r = (v) => Math.round(v * 100) / 100;
    return {
      x: r(this.pos.x), y: r(this.pos.y), z: r(this.pos.z), health: r(this.health), window: this.windowId, level: this.game.world.levelAt(this.pos),
      found: this.found, following: this.following, dead: this.dead, diedAt: this.diedAt == null ? null : this.game.clock.fmt(this.diedAt), boosted: this.boosted, dist: r(this.dist), speed: r(this.speed),
      follower: { state: this.follower.state, teleports: this.follower.teleports, lastTeleport: this.follower.lastTeleport },
      pending: this.pending ? this.pending.idx : null,
      schedule: this.schedule.map((w) => ({ id: w.id, from: r(w.from), to: r(w.to) })),
    };
  }
}
