// Moving platforms. A Lift owns a dynamic collider (carries the player, see Player.update) and a mesh.
//
//   const lift = game.lifts.add({ id:'lift-a', center:[x,z], size:[3,3], yBottom:0.1, yTop:4.8,
//                                 speed:2.5, dwell:3, auto:true });
//   lift.goTo('top') | lift.goTo('bottom') | lift.goTo(y) | lift.goTo('L2') | lift.toggle()   // free moves (tests, the arena)
//
// `y` is the height of the walking surface. Events: lift:moving {id, target}, lift:arrived {id, y}.
// Optional `exits: { bottom:'-x', top:'+z' }` (sides of the car you walk on/off at each stop): the
// car then has thin door colliders on every named side that are closed while moving and on the
// stops' non-exit sides, so riders cannot step off mid-ride. Without `exits` the car is open.
//
// Phase 8B: lifts can have more than two stops (`stops: [{id, y, exit, name, level, min}]`, lowest first; a two-stop lift has the
// ids 'bottom' and 'top') and run on a SOLAR BATTERY. A ride costs `costPerM` units of charge per metre (a call of the empty car half
// of that); the battery (`charge`, 0..`capacity`) recharges from sunlight, fast by day when the lift's panel is lit, slowly by day
// when it is shaded, hardly at all at night. `lift.ride(stopId, {call})` is the charged move (the E-panel uses it); `goTo` stays free.
//   game.lifts.lifts[i].charge / .chargePct / .rechargeRate() / .cost(toY) / .snapshot()     game.lifts.state()
// Events: lift:ride {id, from, to, cost, charge}, lift:drained {id}, lift:topup {id, charge}.
// Phase 9A: a lift is a capsule of a class (`cls`: solo 1 / family 4 / public 12 / freight 24 riders, see lift-classes.js). The class sets the
// seats (`seats`), the speed, the price of a ride (units = metres x costPerM x class cost) and the solar cell's size. A `capsule` lift has no
// meshes of its own (src/systems/lifts/fleet.js draws every car in three instanced meshes), dynamic side walls on every side that is never a
// door, and a landing door at each stop that shuts while the car is elsewhere. `lift.crowd` is the number of seats the public is using.
// game.lifts is the LiftSystem; register it BEFORE the player so platforms move first.
import * as THREE from '../../vendor/three.module.js';
import { makeBoxGeometry } from './builder.js';
import { mergeGeometries } from '../../vendor/addons/utils/BufferGeometryUtils.js';
import { liftClass } from './lift-classes.js';

const LEVEL_NAMES = { U: 'Underground', G: 'Ground', L1: 'Walkways', L2: 'Flyovers', L3: 'Upper Decks' };
const levelOf = (y) => (y < -4 ? 'U' : y < 6 ? 'G' : y < 18 ? 'L1' : y < 31 ? 'L2' : 'L3');

export const LIFT_TUNING = Object.freeze({
  capacity: 100, costPerM: 1.5, callFactor: 0.5,
  rateLit: 1.7, rateShade: 0.28, rateNight: 0.015,      // units per second of real time at full sun (lit panel / shaded panel) and the floor value at night
  palmRays: 1,
});

export class Lift {
  constructor(game, o) {
    this.game = game;
    this.id = o.id;
    this.center = o.center; this.size = o.size ?? [3, 3];
    this.stops = (o.stops ?? [
      { id: 'bottom', y: o.yBottom, exit: o.exits?.bottom ?? null, ...(o.stopMeta?.bottom ?? {}) },
      { id: 'top', y: o.yTop, exit: o.exits?.top ?? null, ...(o.stopMeta?.top ?? {}) },
    ]).map((s) => ({ ...s })).sort((a, b) => a.y - b.y);
    for (const s of this.stops) { s.level = s.level ?? levelOf(s.y); s.name = s.name ?? LEVEL_NAMES[s.level]; }
    this.yBottom = this.stops[0].y; this.yTop = this.stops[this.stops.length - 1].y;
    this.cls = liftClass(o.cls ?? 'family');
    this.capsule = !!o.capsule;
    this.seats = this.cls.cap; this.crowd = 0;
    this.speed = o.speed ?? 2.5;
    this.dwell = o.dwell ?? 3;
    if (this.capsule) { this.speed = this.cls.speed; this.dwell = this.cls.dwell; }
    this.auto = o.auto ?? false;
    this.thickness = o.thickness ?? 0.4;
    this.y = o.startAt === 'top' ? this.yTop : this.yBottom;
    this.target = this.y;
    this.timer = this.dwell;
    this.moving = false;
    this.exits = this.stops.some((s) => s.exit) ? true : null;
    this.doors = [];
    this.label = o.label ?? '';
    // the solar battery
    this.capacity = o.capacity ?? LIFT_TUNING.capacity;
    this.costPerM = o.costPerM ?? LIFT_TUNING.costPerM * (this.capsule ? this.cls.cost : 1);
    this.panel = o.panel ?? 'sun';                          // 'sun': the cell on the shaft cap is above the haze; 'shade': it is not
    this.charge = this.capacity * (o.start ?? 1);
    this.rides = 0; this.palmed = 0;

    const [cx, cz] = this.center, [w, d] = this.size, t = this.thickness;
    // collider is created at surface height 0 and offset up to the current surface height
    this.collider = game.physics.addBox([cx - w / 2, -t, cz - d / 2], [cx + w / 2, 0, cz + d / 2], { dynamic: true, tag: 'lift', userData: this });
    game.physics.setOffset(this.collider, 0, this.y, 0);

    // visual: slab + glowing amber edge strips (origin at the surface centre so mesh.y = surface y). A capsule has none: the fleet draws it.
    this.mesh = new THREE.Group();
    if (!this.capsule) {
      const slab = makeBoxGeometry([-w / 2, -t, -d / 2], [w / 2, 0, d / 2], 0x58606a);
      const strip = (a, b) => makeBoxGeometry(a, b, 0xffb347, 'emissive');
      const e = 0.12;
      this.mesh.add(new THREE.Mesh(slab, game.materials.lit));
      const strips = mergeGeometries([
        strip([-w / 2, 0.005, -d / 2], [w / 2, 0.03, -d / 2 + e]), strip([-w / 2, 0.005, d / 2 - e], [w / 2, 0.03, d / 2]),
        strip([-w / 2, 0.005, -d / 2 + e], [-w / 2 + e, 0.03, d / 2 - e]), strip([w / 2 - e, 0.005, -d / 2 + e], [w / 2, 0.03, d / 2 - e]),
      ], false);
      this.mesh.add(new THREE.Mesh(strips, game.materials.emissive));
    }
    this.walls = []; this.landing = [];
    if (this.exits) this._makeDoors();
    if (this.capsule) { this._makeWalls(); this._makeLanding(); }
    this.mesh.position.set(cx, this.y, cz);
    game.scene.add(this.mesh);
  }

  get multi() { return this.stops.length > 2; }
  get chargePct() { return Math.round(100 * this.charge / this.capacity); }
  stopById(id) { return this.stops.find((s) => s.id === id) ?? null; }
  /** The stop whose surface is at (or within `tol` of) y. */
  stopAtY(y, tol = 1e-3) { return this.stops.find((s) => Math.abs(s.y - y) < tol) ?? null; }

  /** Door colliders (dynamic, ride with the car) + a glowing bar for each side that can be an exit. */
  _makeDoors() {
    const [w, d] = this.size, h = 1.5, t = 0.16;
    const sides = [...new Set(this.stops.map((s) => s.exit).filter(Boolean))];
    for (const side of sides) {
      const ax = side[1], sg = side[0] === '-' ? -1 : 1;
      const half = ax === 'x' ? w / 2 : d / 2, span = ax === 'x' ? d : w;
      const mn = ax === 'x' ? [sg * half - (sg > 0 ? t : 0), 0, -span / 2] : [-span / 2, 0, sg * half - (sg > 0 ? t : 0)];
      const mx = ax === 'x' ? [mn[0] + t, h, span / 2] : [span / 2, h, mn[2] + t];
      const door = this.game.physics.addBox([this.center[0] + mn[0], mn[1], this.center[1] + mn[2]],
        [this.center[0] + mx[0], mx[1], this.center[1] + mx[2]], { dynamic: true, walkable: false, tag: 'lift-door' });
      let m = null;
      if (!this.capsule) {
        const bar = makeBoxGeometry(mn.map((v, i) => (i === 1 ? 1.1 : v)), mx.map((v, i) => (i === 1 ? 1.2 : v)), 0xffb347, 'emissive');
        const rail = makeBoxGeometry(mn.map((v, i) => (i === 1 ? 0.2 : v)), mx.map((v, i) => (i === 1 ? 0.3 : v)), 0xffb347, 'emissive');
        m = new THREE.Mesh(mergeGeometries([bar, rail], false), this.game.materials.emissive);
        m.visible = false;
        this.mesh.add(m);
      }
      this.doors.push({ side, collider: door, mesh: m });
    }
    this._syncDoors();
  }

  /** Which side is open right now (null while moving). */
  openSide() {
    if (!this.exits || this.moving) return null;
    return this.stopAtY(this.y)?.exit ?? null;
  }

  _syncDoors() {
    const open = this.openSide();
    for (const d of this.doors) {
      const closed = d.side !== open;
      d.collider.enabled = closed;
      d.closed = closed;
      if (d.mesh) d.mesh.visible = closed;
      this.game.physics.setOffset(d.collider, 0, this.y, 0);
    }
    if (this.capsule) { this._syncWalls(); this._syncLanding(); }
  }

  /** A capsule's fixed side walls (every side that is never a door): dynamic colliders that ride with the car. */
  _makeWalls() {
    const [cx, cz] = this.center, [w, d] = this.size, h = 2.7, t = 0.2, used = new Set(this.stops.map((s) => s.exit).filter(Boolean));
    for (const side of ['-x', '+x', '-z', '+z']) {
      if (used.has(side)) continue;
      const ax = side[1], sg = side[0] === '-' ? -1 : 1;
      const mn = ax === 'x' ? [cx + (sg > 0 ? w / 2 - t : -w / 2), 0, cz - d / 2] : [cx - w / 2, 0, cz + (sg > 0 ? d / 2 - t : -d / 2)];
      const mx = ax === 'x' ? [mn[0] + t, h, cz + d / 2] : [cx + w / 2, h, mn[2] + t];
      this.walls.push({ side, collider: this.game.physics.addBox(mn, mx, { dynamic: true, walkable: false, tag: 'lift-wall' }) });
    }
    this._syncWalls();
  }
  _syncWalls() { for (const wl of this.walls) this.game.physics.setOffset(wl.collider, 0, this.y, 0); }

  /** The landing door of each stop: a static barrier across the exit that is shut whenever the car is not at that stop (nobody steps into an empty shaft). */
  _makeLanding() {
    const [cx, cz] = this.center, [w, d] = this.size, t = 0.14;
    for (const st of this.stops) {
      if (!st.exit) continue;
      const ax = st.exit[1], sg = st.exit[0] === '-' ? -1 : 1;
      const e = ax === 'x' ? cx + sg * w / 2 : cz + sg * d / 2, lo = Math.min(e, e + sg * t), hi = Math.max(e, e + sg * t);
      const mn = ax === 'x' ? [lo, st.y, cz - d / 2] : [cx - w / 2, st.y, lo], mx = ax === 'x' ? [hi, st.y + 1.5, cz + d / 2] : [cx + w / 2, st.y + 1.5, hi];
      this.landing.push({ stop: st.id, y: st.y, side: st.exit, collider: this.game.physics.addBox(mn, mx, { solid: true, walkable: false, tag: 'lift-landing' }), closed: true });
    }
    this._syncLanding();
  }
  _syncLanding() {
    const here = this.moving ? null : this.stopAtY(this.y)?.id;
    for (const l of this.landing) { l.closed = l.stop !== here; l.collider.enabled = l.closed; }
  }

  /** The surface height for 'top' | 'bottom' | a stop id | a number. */
  _yOf(where) {
    if (where === 'top') return this.yTop;
    if (where === 'bottom') return this.yBottom;
    if (typeof where === 'string') { const s = this.stopById(where); if (!s) throw new Error(`lift ${this.id} has no stop ${where}`); return s.y; }
    return where;
  }

  /** Free move: 'top' | 'bottom' | a stop id | a surface height. Tests and the arena use this; the player's rides go through ride(). */
  goTo(where) {
    const y = this._yOf(where);
    this.target = Math.min(this.yTop, Math.max(this.yBottom, y));
    this.moving = Math.abs(this.target - this.y) > 1e-4;
    if (this.moving) { this.game.events.emit('lift:moving', { id: this.id, target: this.target }); if (this.doors.length) this._syncDoors(); }
  }

  toggle() { this.goTo(Math.abs(this.y - this.yTop) < Math.abs(this.y - this.yBottom) ? 'bottom' : 'top'); }

  // ------------------------------------------------------------------ the solar battery
  /** Charge a move to `where` would use (an empty-car `call` costs half). */
  cost(where, { call = false } = {}) {
    return Math.abs(this._yOf(where) - this.y) * this.costPerM * (call ? LIFT_TUNING.callFactor : 1);
  }
  canAfford(where, opts) { return this.charge + 1e-6 >= this.cost(where, opts); }
  /** Units per second right now (sun 0..1 is the daylight on the shafts). */
  rechargeRate(sun = this.game.world?.sunShafts?.intensity ?? 0) {
    const T = LIFT_TUNING;
    return ((this.panel === 'sun' ? T.rateLit : T.rateShade) * sun + T.rateNight) * (this.capsule ? this.cls.rate : 1);
  }
  /** Seconds until the battery holds `need` units at the present rate (Infinity if it never will). */
  secondsToCharge(need) {
    const missing = need - this.charge;
    if (missing <= 0) return 0;
    const r = this.rechargeRate();
    return r > 1e-4 ? missing / r : Infinity;
  }
  /** The charged move. Returns {ok, cost} or {ok:false, reason:'drained'|'moving'|'here', cost, missing}. */
  ride(where, { call = false, free: freeIn = false } = {}) {
    let free = freeIn;
    if (this.moving) return { ok: false, reason: 'moving' };
    const y = this._yOf(where), cost = this.cost(y, { call });
    if (Math.abs(y - this.y) < 1e-3) return { ok: false, reason: 'here', cost: 0 };
    free = free || !!this.game.lifts?.free;
    if (!free && this.charge + 1e-6 < cost) { this.game.events.emit('lift:drained', { id: this.id, charge: this.charge, cost }); return { ok: false, reason: 'drained', cost, missing: cost - this.charge }; }
    if (!free) this.charge = Math.max(0, this.charge - cost);
    this.rides++;
    const from = this.y;
    this.goTo(y);
    this.game.events.emit('lift:ride', { id: this.id, from, to: y, cost: free ? 0 : cost, charge: this.charge, call });
    return { ok: true, cost: free ? 0 : cost };
  }
  /** Press a palm to the panel: top the battery up by `units` (the panel UI charges the player a ray for it). */
  topUp(units) {
    this.charge = Math.min(this.capacity, this.charge + units); this.palmed++;
    this.game.events.emit('lift:topup', { id: this.id, charge: this.charge });
  }

  update(dt) {
    if (this.moving) {
      const dy = this.target - this.y, step = this.speed * dt;
      if (Math.abs(dy) <= step) {
        this.y = this.target; this.moving = false; this.timer = this.dwell;
        this.game.events.emit('lift:arrived', { id: this.id, y: this.y });
      } else this.y += Math.sign(dy) * step;
      this.game.physics.setOffset(this.collider, 0, this.y, 0);
      this.mesh.position.y = this.y;
      if (this.doors.length) this._syncDoors();
    } else if (this.auto) {
      this.timer -= dt;
      if (this.timer <= 0) this.toggle();
    } else if (this.charge < this.capacity) {
      this.charge = Math.min(this.capacity, this.charge + this.rechargeRate() * dt);
    }
  }

  /** 'top' | 'bottom' | a middle stop's id | null: which stop the car is parked at. */
  stop() {
    if (this.moving) return null;
    return this.stopAtY(this.y)?.id ?? null;
  }

  snapshot() {
    return {
      id: this.id, y: +this.y.toFixed(3), target: +this.target.toFixed(3), moving: this.moving, stop: this.stop(),
      charge: +this.charge.toFixed(1), chargePct: this.chargePct, rate: +this.rechargeRate().toFixed(3), panel: this.panel,
      stops: this.stops.map((s) => s.id), rides: this.rides, cls: this.cls.id, seats: this.seats, crowd: this.crowd,
    };
  }
}

export class LiftSystem {
  init(game) { this.game = game; this.lifts = []; game.events.on('game:reset', () => { for (const l of this.lifts) l.charge = l.capacity; }); }
  add(opts) { const l = new Lift(this.game, opts); this.lifts.push(l); return l; }
  get(id) { return this.lifts.find((l) => l.id === id); }
  update(dt) { for (const l of this.lifts) l.update(dt); }
  /** A plain snapshot of every lift's battery, for the map: [{id, center, stops:[{id,level,y,name,min}], charge, chargePct, rate, panel, moving, y}]. */
  state() {
    return this.lifts.map((l) => ({
      id: l.id, label: l.label, center: l.center.slice(), y: +l.y.toFixed(2), moving: l.moving, stop: l.stop(), panel: l.panel,
      charge: +l.charge.toFixed(1), chargePct: l.chargePct, capacity: l.capacity, rate: +l.rechargeRate().toFixed(3), cls: l.cls.id, seats: l.seats, crowd: l.crowd, cost1m: +(l.costPerM).toFixed(2),
      stops: l.stops.map((s) => ({ id: s.id, level: s.level, y: s.y, name: s.name, min: s.min ?? 0 })),
    }));
  }
}
