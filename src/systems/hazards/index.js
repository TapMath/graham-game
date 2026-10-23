// Phase 4: Perils. The hazard system owns every danger in the city and the services they share.
//
//   game.hazards                         this system
//   game.hazards.list()                  [{ id, kind, pos:{x,y,z}, alert (0..1), state }] of everything awake near the player
//                                        (kinds: dog, drone, camera, guard, deranged, slab, smog, water) for the senses system
//   game.hazards.enabled / setEnabled(b) master switch (__grahan.set('hazards', false); also ?hazards=0)
//   game.hazards.dogs | drones | guards | deranged | slabs | smog | flood    the modules (see their files for tuning)
//   game.hazards.detain(by, info)        fade, +1 h, release at the nearest checkpoint (also used by drones and guards)
//   game.hazards.releaseAt = (info) => ({x,y,z,yaw,name})   Phase 6 hook (e.g. the police station for Gautam's subplot)
//   game.hazards.guards.distract(s)      Phase 6 hook: guards look away
//
// Events consumed:  sing:start {x,y,z}  (dogs and wanderers within 20 m calm for 25 s; drones, cameras, guards within 40 m alerted)
// Events emitted:   sound:emit {x,y,z,kind,loudness}, sound:loop {id,kind,loudness,getPos}, sound:loopStop {id}  (PLAN event contract)
//                   hazard:detained {by, checkpoint, hours}, hazard:bite, hazard:grab (see the modules)
// Everything is seeded from game.rng.fork('hazards:*'); only hazards within ~120 m of the player are simulated and drawn.
import * as THREE from '../../../vendor/three.module.js';
import { SIM_RADIUS, clamp, hdist, dist3, LEVEL_Y, levelOfY, yawDir } from './util.js';
import { Glows, Beams, Puffs } from './render.js';
import { Dogs } from './dogs.js';
import { Drones } from './drones.js';
import { Guards } from './guards.js';
import { Deranged } from './deranged.js';
import { Slabs } from './slabs.js';
import { Smog } from './smog.js';
import { Flood } from './flood.js';

const DETAIN = Object.freeze({ fadeOut: 0.5, release: 0.8, fadeIn: 1.2, done: 2.1, hours: 1, grace: 9 });
const RELEASE_LINES = ['Thank you for your cooperation. Sunlight is a privilege, not a right. Have a pleasant day.', 'You have been processed. Please proceed to the nearest permitted corridor.'];
const _su = { x: 0, y: 0, z: 0, moving: false, kind: 'setu' };

export class HazardSystem {
  init(game) {
    this.game = game;
    game.hazards = this;
    this.rng = game.rng.fork('hazards');
    this.enabled = new URLSearchParams(location.search).get('hazards') !== '0';
    this.t = 0; this.grace = 0; this.detaining = null; this.detentions = 0;
    this.pp = game.player.pos; this.playerSpeed = 0;
    this.lastPlayerHit = -99; this.guardWarnT = -99; this.releaseAt = null;
    this.speedMods = new Map(); this._baseScale = 1; this._lastScale = null;
    this.shakeAmp = 0; this.shakeT = 0; this.shakeDur = 1; this.kickV = null; this.holdT = 0;
    this.dustList = []; this.dustAt = null; this.dustUntil = -1;
    this._said = new Map(); this._capT = new Map();

    this.vis = { glows: new Glows(game), beams: new Beams(game), puffs: new Puffs(game) };
    this.dogs = new Dogs(this); this.drones = new Drones(this); this.guards = new Guards(this); this.deranged = new Deranged(this);
    this.slabs = new Slabs(this); this.smog = new Smog(this); this.flood = new Flood(this);
    this.modules = [this.dogs, this.drones, this.guards, this.deranged, this.slabs, this.smog, this.flood];
    for (const m of this.modules) m.init();
    if (game.air) game.air.hazardSmog = this.smog;

    game.events.on('sing:start', (pos) => this.onSing(pos ?? this.pp));
    this._debug();
    if (!this.enabled) this.setEnabled(false);
  }

  reset() { /* a fresh run reloads the page ("Play again"), so the seeded population stays */ this.grace = 0; this.detaining = null; this.game.modal = false; }

  // ------------------------------------------------------------------------------------------------ switches
  setEnabled(on) {
    on = !!on;
    this.enabled = on;
    for (const m of this.modules) m.setEnabled?.(on);
    if (!on) {
      for (const v of Object.values(this.vis)) { v.begin(); v.end(); }
      this.speedMods.clear(); this._applySpeed(); this.kickV = null; this.holdT = 0; this.shakeAmp = 0;
    }
    return on;
  }

  // ------------------------------------------------------------------------------------------------ services
  pick(arr) { return arr[Math.floor(this.rng.next() * arr.length)]; }
  hasJacket() { const g = this.game; return !!g.flags.jacket || g.view?.mithi?.variant === 'jacket'; }
  hdistPlayer(o) { return hdist(o, this.pp); }

  /** Following Setu as a target {x,y,z,moving,kind:'setu'} or null. */
  setuTarget() {
    const s = this.game.setu;
    if (!s || !s.following || s.dead) return null;
    _su.x = s.pos.x; _su.y = s.pos.y; _su.z = s.pos.z; _su.moving = (s.follower?.speed ?? 0) > 0.6;
    return _su;
  }

  /** A sound for the audio system (PLAN event contract). `pos` needs x,y,z. */
  sound(kind, pos, loudness = 0.6) {
    this.game.events.emit('sound:emit', { x: pos.x, y: pos.y ?? 0, z: pos.z, kind, loudness });
  }

  /** Feed line (throttled per text). kind: story | system | caption | hint | pa */
  say(text, kind = 'story', ttl = 5, speaker) {
    const g = this.game, last = this._said.get(text) ?? -99;
    if (g.time - last < 6) return;
    this._said.set(text, g.time);
    g.messages?.say(text, { kind, ttl, speaker });
  }
  pa(text, ttl = 6) { this.say(text, 'pa', ttl); }
  /** A bracketed sound caption, only when the source is within `range` of the player; at most one per 3.5 s per text. */
  nearCaption(pos, text, range = 30) {
    const g = this.game;
    if (hdist(pos, this.pp) > range || g.time - (this._capT.get(text) ?? -99) < 3.5) return;
    this._capT.set(text, g.time);
    g.messages?.say(text, { kind: 'caption', ttl: 3 });
  }

  hurt(n, source) {
    const g = this.game;
    if (this.detaining) return;                              // nothing touches you while you are being processed
    g.health?.damage(n, source);
    g.screenfx?.flash('#ff2a1a', 280, 0.34);
    g.events.emit('hazard:hurt', { n, source });
  }

  shake(amp, secs = 0.4) { if (amp >= this.shakeAmp * (this.shakeT / this.shakeDur)) { this.shakeAmp = amp; this.shakeT = this.shakeDur = Math.max(0.05, secs); } }
  /** Shove the player away from (x,z) at `speed` m/s for `secs`. */
  kick(x, z, speed, secs = 0.3) {
    const p = this.pp; let dx = p.x - x, dz = p.z - z; const l = Math.hypot(dx, dz) || 1;
    this.kickV = { x: dx / l * speed, z: dz / l * speed, t: secs, dur: secs };
  }
  holdPlayer(secs) { this.holdT = Math.max(this.holdT, secs); }
  setSpeedMod(id, mul) { if (mul == null || mul >= 0.999) this.speedMods.delete(id); else this.speedMods.set(id, mul); }

  /** Puffs of dust that drift, grow and fade (collapses, aftershocks). */
  dust(x, y, z, n = 8, spread = 2, { size = 3, up = 0.8, life = 3, color = [0.15, 0.13, 0.10] } = {}) {
    for (let i = 0; i < n; i++) {
      if (this.dustList.length >= 90) this.dustList.shift();
      const a = this.rng.next() * 6.283, r = Math.sqrt(this.rng.next()) * spread, l = life * this.rng.range(0.7, 1.2);
      this.dustList.push({ x: x + Math.cos(a) * r, y: y + this.rng.range(-0.2, 0.6), z: z + Math.sin(a) * r, vx: Math.cos(a) * r * 0.25, vy: up * this.rng.range(0.4, 1), vz: Math.sin(a) * r * 0.25,
        s0: size * this.rng.range(0.5, 0.8), s1: size * this.rng.range(1.1, 1.6), age: 0, life: l, c: color, spin: this.rng.range(0, 6) });
    }
  }

  // ------------------------------------------------------------------------------------------------ detention
  nearestCheckpoint() {
    const p = this.pp, cps = this.game.world.checkpoints ?? [];
    let best = null, bd = Infinity;
    for (const c of cps) { const d = hdist(c, p); if (d < bd) { bd = d; best = c; } }
    return best ?? { x: p.x, y: 0, z: p.z, yaw: 0, name: 'the nearest checkpoint' };
  }

  /** Fade out, +1 game hour, release at the nearest G checkpoint (or `releaseAt`). */
  detain(by = 'drone', info = {}) {
    const g = this.game;
    if (this.detaining || !this.enabled || g.mode !== 'playing' || g.health?.dead || g.modal) return false;
    this.detaining = { by, info, t: 0, phase: 0, cp: null };
    g.modal = true;
    g.screenfx?.fade(1, DETAIN.fadeOut);
    this.detentions++;
    const lines = {
      drone: 'Unregistered citizen detained. You will be escorted to a permitted corridor. Thank you for your patience.',
      guard: 'Station access restricted. Please accompany the officer. Remain calm.',
      camera: 'Your presence has been logged. Please remain calm.',
    };
    g.messages?.say(lines[by] ?? lines.drone, { kind: 'pa', ttl: 7 });
    g.events.emit('hazard:detain', { by, ...info });
    this.drones.stats.detained += by === 'drone' ? 1 : 0;
    return true;
  }

  _detentionStep(dt) {
    const d = this.detaining, g = this.game;
    d.t += dt;
    if (d.phase === 0 && d.t >= DETAIN.release) {
      d.phase = 1;
      const cp = (this.releaseAt && this.releaseAt(d)) ?? this.nearestCheckpoint();
      d.cp = cp;
      g.clock?.advance(DETAIN.hours, 'detained');
      g.player.teleport(cp.x, cp.y, cp.z, cp.yaw ?? 0);
      if (g.setu?.following) g.setu.teleportToPlayer(2.2);
      this.grace = DETAIN.grace;
      for (const m of this.modules) m.stand_down?.();
      this.kickV = null; this.holdT = 0;
      g.events.emit('hazard:detained', { by: d.by, checkpoint: cp.id ?? null, hours: DETAIN.hours, x: cp.x, y: cp.y, z: cp.z });
      g.messages?.say(`Released at ${cp.name ?? 'a checkpoint'}. One hour of your day is gone.`, { kind: 'system', ttl: 7 });
      g.messages?.say(this.pick(RELEASE_LINES), { kind: 'pa', ttl: 7 });
    }
    if (d.phase === 1 && d.t >= DETAIN.fadeIn) { d.phase = 2; g.screenfx?.fade(0, 0.9); }
    if (d.phase === 2 && d.t >= DETAIN.done) { this.detaining = null; g.modal = false; }
  }

  // ------------------------------------------------------------------------------------------------ singing
  onSing(pos) {
    if (!this.enabled) return;
    for (const m of [this.dogs, this.deranged, this.drones, this.guards]) m.onSing?.(pos);
  }

  // ------------------------------------------------------------------------------------------------ frame
  _applySpeed() {
    const p = this.game.player;
    if (this._lastScale !== null && p.speedScale !== this._lastScale) this._baseScale = p.speedScale;   // someone else (debug) set it
    let m = 1; for (const v of this.speedMods.values()) m *= v;
    p.speedScale = this._baseScale * m; this._lastScale = p.speedScale;
  }

  update(dt, game) {
    if (!this.enabled) return;
    if (this.detaining) this._detentionStep(dt);
    else if (game.modal) return;                                // a dialog is open: the world holds its breath
    this.t += dt;
    const p = this.pp, pl = game.player;
    this.playerSpeed = Math.hypot(pl.vel.x, pl.vel.z);
    this.grace = Math.max(0, this.grace - dt);

    // the player is shoved or held
    if (this.holdT > 0) { this.holdT -= dt; this.setSpeedMod('grab', 0); } else this.setSpeedMod('grab', 1);
    const k = this.kickV;
    if (k) {
      const f = clamp(k.t / k.dur, 0, 1);
      game.physics.slideMove(p, k.x * f * dt, k.z * f * dt, p.y, 0.3);
      k.t -= dt; if (k.t <= 0) this.kickV = null;
    }

    const v = this.vis;
    v.glows.begin(); v.beams.begin(); v.puffs.begin();
    for (const m of this.modules) m.update(dt);
    this._dust(dt);
    v.glows.end(); v.beams.end(); v.puffs.end();
    this._applySpeed();
    this._applyShake(dt);
  }

  _dust(dt) {
    const puffs = this.vis.puffs, cam = this.game.camera.position;
    for (let i = this.dustList.length - 1; i >= 0; i--) {
      const q = this.dustList[i];
      q.age += dt;
      if (q.age >= q.life) { this.dustList.splice(i, 1); continue; }
      const u = q.age / q.life;
      q.x += q.vx * dt; q.y += q.vy * dt; q.z += q.vz * dt; q.vy *= 1 - dt * 0.6; q.vx *= 1 - dt * 0.5; q.vz *= 1 - dt * 0.5;
      const a = Math.pow(1 - u, 1.3) * Math.min(1, u * 8) * 0.9;
      const d = Math.hypot(q.x - cam.x, q.y - cam.y, q.z - cam.z);
      const f = a * clamp((d - 0.6) / 4, 0, 1) * (1 - clamp((d - 70) / 50, 0, 1));
      if (f > 0.01) puffs.add(q.x, q.y, q.z, q.s0 + (q.s1 - q.s0) * u, q.c[0] * f, q.c[1] * f, q.c[2] * f, q.spin + u);
    }
  }

  _applyShake(dt) {
    if (this.shakeT <= 0) return;
    this.shakeT -= dt;
    const cam = this.game.camera, f = clamp(this.shakeT / this.shakeDur, 0, 1), a = this.shakeAmp * f * f, t = this.game.time;
    cam.position.x += Math.sin(t * 47.3) * 0.045 * a; cam.position.y += Math.sin(t * 61.1 + 1.3) * 0.06 * a; cam.position.z += Math.cos(t * 39.7) * 0.045 * a;
    cam.rotation.z += Math.sin(t * 29.1) * 0.025 * a; cam.rotation.x += Math.sin(t * 53.9 + 2.1) * 0.014 * a;
    if (this.shakeT <= 0) this.shakeAmp = 0;
  }

  // ------------------------------------------------------------------------------------------------ queries
  list() {
    const out = [];
    if (!this.enabled) return out;
    for (const m of this.modules) m.list?.(out);
    return out;
  }

  /** The most threatening awake hazard near the player: {kind,id,dist,alert,state} or null. */
  nearestThreat() {
    const p = this.pp; let best = null, bd = Infinity;
    for (const e of this.list()) {
      if (e.kind === 'smog' || e.kind === 'water') continue;
      const d = dist3(e.pos, p) / (1 + e.alert * 0.5);
      if (d < bd) { bd = d; best = { kind: e.kind, id: e.id, dist: +dist3(e.pos, p).toFixed(1), alert: e.alert, state: e.state }; }
    }
    return best;
  }

  snapshot() {
    const list = this.list(), counts = {};
    for (const e of list) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    const total = { dogs: this.dogs.dogs.length, drones: this.drones.drones.length, cameras: this.drones.cams.length, guards: this.guards.guards.length, deranged: this.deranged.list_.length, smogZones: this.smog.zones.length, slabsUnstable: this.slabs.unstable.length };
    const alerts = list.filter((e) => e.alert >= 0.5 && e.kind !== 'smog' && e.kind !== 'water').length;
    return {
      enabled: this.enabled, total, awake: counts, alerts, nearest: this.nearestThreat(), detentions: this.detentions, detaining: this.detaining ? this.detaining.by : null,
      grace: +this.grace.toFixed(1), speedMul: +[...this.speedMods.values()].reduce((a, b) => a * b, 1).toFixed(2), shake: +this.shakeAmp.toFixed(2),
      dogs: this.dogs.snapshot(), drones: this.drones.snapshot(), guards: this.guards.snapshot(), deranged: this.deranged.snapshot(),
      slabs: this.slabs.snapshot(), smog: this.smog.snapshot(), flood: this.flood.snapshot(),
    };
  }

  // ------------------------------------------------------------------------------------------------ debug
  _ahead(dist) {
    const g = this.game, p = this.pp, pl = g.player;
    for (const ang of [0, 0.5, -0.5, 1.0, -1.0, 2.2, -2.2, Math.PI]) {
      const f = yawDir(pl.yaw + ang), x = p.x + f.x * dist, z = p.z + f.z * dist;
      const gh = g.physics.groundHeightAt(x, z, p.y + 0.5, 1.0);
      if (gh > -Infinity && Math.abs(gh - p.y) < 1.2) return { x, y: gh, z };
    }
    return { x: p.x, y: p.y, z: p.z };
  }

  _debug() {
    const d = this.game.debug; if (!d) return;
    const g = this.game, self = this;
    d.addSetter('hazards', (gg, v) => { self.setEnabled(!(v === false || v === 0 || v === 'false' || v === '0' || v === 'off')); });
    d.addState('hazards', () => self.snapshot());
    d.addAction('hazardList', () => self.list());
    d.addAction('singEmit', (gg, radius) => { const p = self.pp; g.events.emit('sing:start', { x: p.x, y: p.y, z: p.z, radius }); return self.snapshot().dogs.calm; });
    d.addAction('spawnDogs', (gg, n = 3, dist = 14, mode = 'wander') => {
      const p = self.pp, at = self._ahead(dist), homeY = p.y < -4 ? -8 : 0;
      const pack = self.dogs.addPack(at.x, at.z, 5, homeY, n, { state: 'wander' });
      for (const dog of pack.dogs) { if (mode === 'chase') { dog.target = { kind: 'player', x: p.x, y: p.y, z: p.z, d: dist }; dog.reaction = 0.2; self.dogs.setState(dog, 'notice'); } }
      return pack.dogs.map((x) => x.id);
    });
    d.addAction('spawnDeranged', (gg, dist = 9, mode = 'wander') => {
      const p = self.pp, at = self._ahead(dist), w = self.deranged.add(at.x, at.z, 4, {});
      if (w && mode === 'approach') { w.target = { kind: 'player', x: p.x, y: p.y, z: p.z, d: dist }; self.deranged.setState(w, 'approach'); }
      return w?.id ?? null;
    });
    d.addAction('spawnDrone', (gg, opts = {}) => {
      const p = self.pp, f = yawDir(g.player.yaw), rx = -f.z, rz = f.x, alt = opts.altitude ?? 5, ahead = opts.ahead ?? 7, half = opts.span ?? 12;
      const cx = p.x + f.x * ahead, cz = p.z + f.z * ahead;
      const route = { id: `dbg-drone-${self.drones.drones.length}`, level: levelOfY(p.y), altitude: alt, loop: 'pingpong', waypoints: [[cx - rx * half, cz - rz * half], [cx + rx * half, cz + rz * half]] };
      const dr = self.drones.addDrone(route, 0, 1, { baseY: p.y, altitude: alt, speed: opts.speed ?? 2.2 });
      return dr.id;
    });
    d.addAction('tpHazard', (gg, kind, id, dist) => {
      const p = self.pp; let tgt = null;
      const pool = { dog: self.dogs.dogs, drone: self.drones.drones, camera: self.drones.cams, guard: self.guards.guards, deranged: self.deranged.list_ }[kind];
      if (kind === 'smog') { const z = self.smog.zones.find((q) => !id || q.id === id) ?? self.smog.zones[0]; g.player.teleport(z.cx, z.def.y0, z.cz, 0); return z.id; }
      if (kind === 'slab') { const u = (id && self.slabs.byId.get(id)) ?? self.slabs.unstable[0]; g.player.teleport(u.cx, u.slab.y, u.cz, 0); return u.slab.id; }
      if (kind === 'water') { const z = self.flood.zones.find((q) => !id || q.id === id); if (id === 'u' || !z) g.player.teleport(-118, -8, -20, 0); else g.player.teleport((z.rect.x0 + z.rect.x1) / 2, 0, (z.rect.z0 + z.rect.z1) / 2, 0); return 'ok'; }
      if (!pool) throw new Error('unknown hazard kind ' + kind);
      tgt = (id && pool.find((q) => q.id === id)) ?? (typeof id === 'number' ? pool[id] : null) ?? pool.slice().sort((a, b) => dist3(a, p) - dist3(b, p))[0];
      if (!tgt) return null;
      if (kind === 'dog' || kind === 'deranged') {
        const homeY = tgt.homeY ?? 0, back = yawDir(0);
        // put the player 13 m away, facing the dog
        for (const ang of [0, 0.7, -0.7, 1.4, -1.4, 2.1, -2.1, 3.1]) {
          const x = tgt.x + Math.sin(ang) * (dist ?? 13), z = tgt.z + Math.cos(ang) * (dist ?? 13), gh = g.physics.groundHeightAt(x, z, homeY + 0.5, 1);
          if (gh > -Infinity && Math.abs(gh - homeY) < 0.5) { g.player.teleport(x, gh, z, Math.atan2(-(tgt.x - x), -(tgt.z - z))); void back; return tgt.id; }
        }
        g.player.teleport(tgt.x, tgt.y, tgt.z + 6, 0); return tgt.id;
      }
      if (kind === 'drone') {
        const floor = tgt.baseY - tgt.route.altitude, f = yawDir(tgt.yaw), x = tgt.x + f.x * (dist ?? 9), z = tgt.z + f.z * (dist ?? 9);
        const gh = g.physics.groundHeightAt(x, z, floor + 0.5, 1);
        if (gh > -Infinity) g.player.teleport(x, gh, z, Math.atan2(-(tgt.x - x), -(tgt.z - z))); else g.player.teleport(tgt.x, floor, tgt.z, 0);
        return tgt.id;
      }
      if (kind === 'camera') {
        const f = yawDir(tgt.yaw0), l = 1, floor = g.world.gate?.(tgt.gate)?.y ?? tgt.y - 3.9;
        for (const dd of [dist ?? 5, 4, 6, 7, 8, 3]) {
          const x = tgt.x + f.x / l * dd, z = tgt.z + f.z / l * dd, gh = g.physics.groundHeightAt(x, z, floor + 0.6, 1.2);
          if (gh > -Infinity && Math.abs(gh - floor) < 1.2) { g.player.teleport(x, gh, z, Math.atan2(-(tgt.x - x), -(tgt.z - z))); return tgt.id; }
        }
        g.player.teleport(tgt.x, floor, tgt.z, 0); return tgt.id;
      }
      if (kind === 'guard') {
        const f = yawDir(tgt.baseYaw);
        for (const dd of [dist ?? 7, 6, 8, 5, 9]) {
          const x = tgt.x + f.x * dd, z = tgt.z + f.z * dd, gh = g.physics.groundHeightAt(x, z, tgt.y + 0.5, 1);
          if (gh > -Infinity && Math.abs(gh - tgt.y) < 0.6) { g.player.teleport(x, gh, z, Math.atan2(-(tgt.x - x), -(tgt.z - z))); return tgt.id; }
        }
        g.player.teleport(tgt.x, tgt.y, tgt.z + 6, 0); return tgt.id;
      }
      return null;
    });
    d.addAction('collapseSlab', (gg, id) => self.slabs.collapseNow(id ?? self.slabs.unstable[0].slab.id));
    d.addAction('unstableSlabs', () => self.slabs.unstable.map((u) => u.slab.id));
    d.addAction('aftershock', () => { self.slabs.aftershock(); return self.slabs.stats.aftershocks; });
    d.addAction('floodSet', (gg, u, gd) => { self.flood.setOverride(u == null && gd == null ? null : { u, g: gd }); return self.flood.snapshot(); });
    d.addAction('detain', (gg, by = 'drone') => self.detain(by, { debug: true }));
    d.addAction('guardDistract', (gg, s = 30) => { self.guards.distract(s); return s; });
    d.addAction('hazardsClear', (gg, kind) => { for (const m of kind ? [self[kind]] : [self.dogs, self.deranged]) m?.clear?.(); return self.snapshot().total; });
    d.addAction('hazardGrace', (gg, s = 0) => { self.grace = s; return s; });
  }
}

void THREE; void LEVEL_Y; void SIM_RADIUS;
