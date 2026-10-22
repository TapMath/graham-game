// Debug / test API. Always created as game.debug; exposed as window.__grahan when ?debug=1.
//
// Extending it from a system (do this in init):
//   game.debug.addState('setu', () => ({ health: setu.health }));   // appears as state().setu
//   game.debug.addSetter('rays', (game, v) => { game.player.rays = v; });   // __grahan.set('rays', 5)
//   game.debug.addAction('spawnDog', (game, x, z) => ...);          // __grahan.do('spawnDog', 1, 2)
//
// window.__grahan:
//   game                       the Game object
//   state()                    plain JSON snapshot (position, level, rays, flags, render stats, + providers)
//   teleport(x,y,z,yawDeg?)    place the player (also resets motion and the last safe position)
//   look(yawDeg, pitchDeg)     yaw 0 faces -Z, +90 faces -X, -90 faces +X; pitch + looks up
//   setTime(hour)              forwards to the 'time' setter (Phase 3 clock registers one)
//   set(key, value)            registered setters; built-in: rays, freeze, speed, hour; unknown keys go to game.flags
//   do(name, ...args)          registered actions
//   run(keys, seconds)         SYNCHRONOUS: hold key code(s) for N simulated seconds, returns {state,minY,maxY,...}
//   press(code, ms)            ASYNC (Promise): hold a real KeyboardEvent key for ms of simulated time
//   hold(code) / release(code) manual key down / up
//   step(seconds)              advance the simulation without keys
//   events(type?) / clearEvents()   recent event log (for asserting player:fall etc.)
//   walk(points, opts)         SYNCHRONOUS route follower for connectivity tests: steers toward each [x,z] by
//                              holding forward (sidesteps small obstacles), also accepts 'E' (press interact),
//                              {step:s} (advance s seconds), {say:'tag'} (log the position). Returns {ok, log[]}.
//   ray(origin, dir, max)      physics raycast, handy for line-of-sight checks
//   fps()                      measured frames per second (not meaningful in headless SwiftShader)
//
// Phase 3 setters (set(key, value)):  rays (via the health system, emits health:changed), invulnerable (no damage, no
// darkness drain), view ('first'|'third'), jacket (Mithi's blue Metro jacket), viewOrbit (degrees, third-person test aid),
// setuFollowing (true = Setu is found and follows, false = back on his timeline), setuHealth, clockRate (total real minutes),
// hour (the clock). Any other key lands in game.flags, so cityWarned, bridgePermit, breachKnown, ... work as flags.
// Phase 3 actions (do(name, ...)):  setuFind, setuSetHealth(v), setuTeleportToPlayer(dist), tpToSetu(dist), tpVendor(id),
// vendorOpen(id), vendorRoll(id, {potency,hours,risk}), dialogChoose(id), ending(type), endingReset, clockAdvance(hours),
// damage(n), heal(n), hudGlitch. state() gains clock, health, setu, vendors, view, hud, objective, dialog, ending, messages.
import { STEP } from './game.js';

const r3 = (v) => Math.round(v * 1000) / 1000;

export class DebugApi {
  constructor(game) {
    this.game = game;
    this.providers = new Map();
    this.setters = new Map();
    this.actions = new Map();
    this.log = [];
    this._frames = [];
    game.events.on('*', (data, type) => {
      this.log.push({ t: r3(game.time), type, data });
      if (this.log.length > 300) this.log.shift();
    });
    this.addSetter('rays', (g, v) => { g.player.rays = Math.max(0, Math.min(g.player.maxRays, v)); });
    this.addSetter('freeze', (g, v) => { g.player.frozen = !!v; });
    this.addSetter('speed', (g, v) => { g.player.speedScale = v; });
    this.addAction('pause', (g, on) => { g.setMode(on ? 'ending' : 'playing'); return g.mode; });   // tests: freeze the simulation for a screenshot ('ending' hides the pause overlay)
    this.addSetter('hour', (g, v) => { g.flags.debugHour = v; g.events.emit('debug:setTime', { hour: v }); });
  }

  addState(name, fn) { this.providers.set(name, fn); }
  addSetter(key, fn) { this.setters.set(key, fn); }
  addAction(name, fn) { this.actions.set(name, fn); }

  /** Called by the main loop every rendered frame. */
  tick(nowMs) {
    this._frames.push(nowMs);
    if (this._frames.length > 60) this._frames.shift();
  }

  state() {
    const g = this.game, p = g.player;
    const s = {
      t: r3(g.time), frame: g.frame, mode: g.mode, seed: g.params.seed, world: g.world?.name ?? null,
      pos: { x: r3(p.pos.x), y: r3(p.pos.y), z: r3(p.pos.z) },
      level: p.level, rays: p.rays,
      onGround: p.onGround, sprinting: p.sprinting,
      yaw: r3(p.yaw * 180 / Math.PI), pitch: r3(p.pitch * 180 / Math.PI),
      vel: { x: r3(p.vel.x), y: r3(p.vel.y), z: r3(p.vel.z) },
      groundTag: p.ground?.tag ?? null,
      lastSafe: { x: r3(p.lastSafe.x), y: r3(p.lastSafe.y), z: r3(p.lastSafe.z) },
      setu: null, clock: null,         // Phase 3 providers replace these
      flags: { ...g.flags },
      lifts: g.lifts ? g.lifts.lifts.map((l) => l.snapshot()) : [],
      colliders: g.physics.count,
      render: g.renderStats(),
    };
    for (const [name, fn] of this.providers) s[name] = fn(g);
    return s;
  }

  teleport(x, y, z, yawDeg) {
    this.game.player.teleport(x, y, z, yawDeg === undefined ? undefined : yawDeg * Math.PI / 180);
    return this.state();
  }

  look(yawDeg, pitchDeg = 0) {
    this.game.player.setLook(yawDeg * Math.PI / 180, pitchDeg * Math.PI / 180);
  }

  setTime(hour) { return this.set('hour', hour); }

  set(key, value) {
    const fn = this.setters.get(key);
    if (fn) fn(this.game, value); else this.game.flags[key] = value;
  }

  do(name, ...args) {
    const fn = this.actions.get(name);
    if (!fn) throw new Error('no debug action ' + name);
    return fn(this.game, ...args);
  }

  hold(code) { window.dispatchEvent(new KeyboardEvent('keydown', { code, bubbles: true })); }
  release(code) { window.dispatchEvent(new KeyboardEvent('keyup', { code, bubbles: true })); }

  async press(code, ms = 300) {
    this.hold(code);
    await this.game.wait(ms / 1000);
    this.release(code);
    return this.state();
  }

  /** Synchronous: hold keys for `seconds` of simulated time, stepping the game directly. */
  run(keys, seconds) {
    const g = this.game, input = g.input, p = g.player;
    const list = keys ? [].concat(keys) : [];
    const start = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
    let minY = p.pos.y, maxY = p.pos.y;
    for (const k of list) input.setKey(k, true);
    const n = Math.max(1, Math.round(seconds / STEP));
    for (let i = 0; i < n; i++) {
      g.update(STEP);
      if (p.pos.y < minY) minY = p.pos.y;
      if (p.pos.y > maxY) maxY = p.pos.y;
    }
    for (const k of list) input.setKey(k, false);
    return {
      state: this.state(), minY: r3(minY), maxY: r3(maxY),
      moved: { x: r3(p.pos.x - start.x), y: r3(p.pos.y - start.y), z: r3(p.pos.z - start.z) },
    };
  }

  step(seconds) { return this.run(null, seconds).state; }

  /**
   * Walk the player along a route using only keyboard-style input (so it proves a route is really
   * traversable). points: [x, z] | 'E' | { step: seconds } | { say: 'label' }.
   */
  walk(points, { tol = 0.9, maxDetours = 14 } = {}) {
    const p = this.game.player, log = [];
    const snap = (tag) => { log.push(`${tag}: (${p.pos.x.toFixed(1)}, ${p.pos.y.toFixed(2)}, ${p.pos.z.toFixed(1)}) ${p.level} rays=${p.rays}`); };
    for (const pt of points) {
      if (pt === 'E') { this.run('KeyE', 0.1); continue; }
      if (pt && pt.step) { this.step(pt.step); continue; }
      if (pt && pt.say) { snap(pt.say); continue; }
      const [tx, tz] = pt;
      let guard = 0, last = Infinity, stall = 0, detours = 0;
      while (guard++ < 1500) {
        const dx = tx - p.pos.x, dz = tz - p.pos.z, d = Math.hypot(dx, dz);
        if (d < tol) break;
        const yaw = Math.atan2(-dx, -dz) * 180 / Math.PI;
        if (stall > 5) {                         // blocked: sidestep around the obstacle for a moment
          const side = (detours++ % 2 ? 1 : -1) * (60 + 15 * Math.min(4, detours >> 1));
          this.look(yaw + side, 0); this.run('KeyW', 0.7); stall = 0; last = Infinity;
          if (detours > maxDetours) { snap('STUCK going to ' + JSON.stringify(pt)); return { ok: false, log }; }
          continue;
        }
        this.look(yaw, 0);
        this.run('KeyW', Math.min(0.2, d / 4.2));
        if (d > last - 0.03) stall++; else stall = 0;
        last = Math.min(last, d);
      }
      if (guard >= 1500) { snap('TIMEOUT ' + JSON.stringify(pt)); return { ok: false, log }; }
    }
    snap('end');
    return { ok: true, log };
  }

  events(type) {
    const l = type ? this.log.filter((e) => e.type === type) : this.log;
    return l.slice(-50);
  }
  clearEvents() { this.log.length = 0; }

  ray(origin, dir, max = 100) {
    const len = Math.hypot(dir.x, dir.y, dir.z) || 1;
    const hit = this.game.physics.raycast(origin, { x: dir.x / len, y: dir.y / len, z: dir.z / len }, max);
    return hit ? { dist: r3(hit.dist), tag: hit.collider.tag, id: hit.collider.id, point: hit.point } : null;
  }

  fps() {
    const f = this._frames;
    if (f.length < 2) return 0;
    return Math.round((f.length - 1) / ((f[f.length - 1] - f[0]) / 1000) * 10) / 10;
  }

  /** Build the object published as window.__grahan. */
  api() {
    const d = this;
    return {
      game: d.game, debug: d,
      state: () => d.state(), teleport: (...a) => d.teleport(...a), look: (...a) => d.look(...a),
      setTime: (h) => d.setTime(h), set: (k, v) => d.set(k, v), do: (...a) => d.do(...a),
      press: (...a) => d.press(...a), hold: (c) => d.hold(c), release: (c) => d.release(c),
      run: (...a) => d.run(...a), step: (s) => d.step(s), walk: (...a) => d.walk(...a),
      events: (t) => d.events(t), clearEvents: () => d.clearEvents(),
      ray: (...a) => d.ray(...a), fps: () => d.fps(),
    };
  }
}
