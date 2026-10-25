// The Harbour Line (Phase 8B): moving, rideable, scheduled suburban trains along the z = -60 street, west to east through the whole map.
// The static line (tracks, platforms, fence, level-crossing masts) is built by src/world/rail.js; this system owns everything that moves.
//
//   game.transit = {
//     line {id,name,dev,x0,x1,tracks, stations[], crossings[]}
//     stations[]      {id,name,dev,x,x0,x1,terminus, eta:{east, west}, next:{east:{eta,train,dest}, west:{...}}, platforms:{north,south}}
//     trains[]        {id, index, x, z, v, dir:+1|-1, state, doorsOpen:'north'|'south'|null, at (station id), next (station id), active,
//                      passengers, riding}  (state: parked | dwell | closing | run | turn | slide)
//     ride            null | {train, boardedAt, from, next, legs, minutesSpent}   while the player stands on a carriage floor
//     crossings[]     {id, x, state:'open'|'warn'|'closed', angle, blocked, playerInside}
//     inService(hour) / servedTrains(hour)     the timetable by game hour: 3 trains by day, 1 at night, none 01:00 to 04:00
//     nextArrival(stationId, 'east'|'west')    seconds until the next train stops there (Infinity if none)
//     board(stationId?) / alight()             E-style helpers (also what the E prompt does)
//     state()                                  a plain snapshot for the map and tests
//   }
// Events: transit:board {train, station}, transit:alight {train, station}, transit:arrive {train, station, dir}, transit:depart {train, station, dir},
//         transit:ride {train, from, to, hours}, transit:strike {train}, crossing:closed {id}, crossing:open {id}.
//
// Physics: each carriage floor is a DYNAMIC walkable collider (the player is carried by Phase 1's platform rule); the side walls are
// dynamic solids that open on the platform side while the doors are open. Trains are axis-aligned boxes sliding along x.
// Sound: sound:loop kind 'train' (the rattle) and 'crossing' (the bell), sound:emit 'train-horn', 'train-brake', 'train-door' (sounds.js).
import * as THREE from '../../../vendor/three.module.js';
import './sounds.js';
import { LAYOUT, buildRakeGeometry, makeTrainMeshes, riderSlots, spinFans } from './train-model.js';
import { Glows } from '../hazards/render.js';
import { IndicatorBoards } from './boards.js';
import { mergeGeometries } from '../../../vendor/addons/utils/BufferGeometryUtils.js';

export const TRANSIT = Object.freeze({
  vmax: 15, vturn: 7, accel: 1.3, decel: 1.35, dwell: 14, dwellTerminus: 18, closeTime: 2.6, turnWait: 4, slideSpeed: 1.5,
  boomUp: 1.45, boomRate: 0.85, warnTime: 3, clearTime: 1.2, lookahead: 4.5, headway: 80,
  rideHoursBase: 0.03, rideHoursPerMetre: 0.0006,          // game hours added when a leg ends with the player aboard
  strikeDamage: 1,
});
const T = TRANSIT;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmtEta = (s) => (!isFinite(s) ? 'no service' : s < 5 ? 'arriving' : s < 60 ? `${Math.round(s)} s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);

/** Time to cover D metres stopping at both ends (trapezoid or triangle speed profile). */
export function legTime(D, vm = T.vmax) {
  if (D <= 0) return 0;
  const a = T.accel, full = vm * vm / a;
  return D >= full ? 2 * vm / a + (D - full) / vm : 2 * Math.sqrt(D / a);
}

/** How many trains run at this hour of the day. */
export function servedTrains(hour) {
  if (hour >= 1 && hour < 4) return 0;
  if (hour >= 22 || hour < 1 || (hour >= 4 && hour < 5.5)) return 1;
  return 3;
}

class Train {
  constructor(sys, index, geo) {
    this.sys = sys; const game = sys.game;
    this.index = index; this.id = `harbour-${index + 1}`;
    this.group = makeTrainMeshes(game, geo);
    this.group.name = this.id; this.group.visible = false;
    game.scene.add(this.group);
    this.slots = riderSlots(11 + index * 7);
    this.x = 0; this.z = 0; this.v = 0; this.dir = 1; this.state = 'parked'; this.timer = 0;
    this.stopIdx = 0; this.at = null; this.doorsOpen = null; this.retire = false;
    this.legStart = 0; this.horned = false; this.braked = false; this.loop = false; this.slideFrom = 0; this.slideTo = 0; this.heldBy = null;
    this.carried = 0;                       // 1 while the player stands on the floor
    this._makeColliders();
  }

  _makeColliders() {
    const w = this.sys.game.physics, L = LAYOUT, mk = (min, max, o) => w.addBox(min, max, { dynamic: true, userData: { train: this }, ...o });
    this.floor = mk([-L.L / 2 + 0.05, 0.3, -1.3], [L.L / 2 - 0.05, L.floorTop, 1.3], { tag: 'train-floor', solid: true, walkable: true });
    this.roof = mk([-L.L / 2, L.roofY + 0.02, -1.4], [L.L / 2, L.roofY + 0.3, 1.4], { tag: 'train-roof', walkable: false });
    this.ends = [-1, 1].map((e) => mk([e * L.L / 2 - 0.1, 0.5, -1.4], [e * L.L / 2 + 0.1, L.roofY, 1.4], { tag: 'train-end', walkable: false }));
    this.closed = {}; this.open = {};
    for (const [name, s] of [['north', -1], ['south', 1]]) {
      const z0 = s < 0 ? -1.4 : 1.3, z1 = s < 0 ? -1.3 : 1.4;
      this.closed[name] = mk([-L.L / 2, 0.5, z0], [L.L / 2, L.roofY, z1], { tag: 'train-wall', walkable: false });
      this.open[name] = L.segs.map(([a, b]) => mk([a, 0.5, z0], [b, L.roofY, z1], { tag: 'train-wall', walkable: false }));
    }
    this.all = [this.floor, this.roof, ...this.ends, ...Object.values(this.closed), ...Object.values(this.open).flat()];
    this._enabledAll(false);
  }
  _enabledAll(on) { for (const c of this.all) this.sys.game.physics.setEnabled(c, on); if (on) this._syncDoors(); }
  _syncDoors() {
    const w = this.sys.game.physics;
    for (const side of ['north', 'south']) {
      const open = this.doorsOpen === side;
      w.setEnabled(this.closed[side], !open);
      for (const c of this.open[side]) w.setEnabled(c, open);
    }
  }
  place() {
    const w = this.sys.game.physics;
    this.group.position.set(this.x, 0, this.z);
    for (const c of this.all) w.setOffset(c, this.x, 0, this.z);
  }

  get active() { return this.state !== 'parked'; }
  get speed() { return Math.abs(this.v); }
  get track() { return this.sys.R.tracks.east.z === this._trackZ ? 'east' : 'west'; }
  nose() { return this.x + this.dir * LAYOUT.L / 2; }
  tail() { return this.x - this.dir * LAYOUT.L / 2; }
}

export class TransitSystem {
  init(game) {
    this.game = game;
    const world = game.world, map = world.map, R = this.R = map.rail;
    this.stations = R.stations.map((st) => ({ ...st, eta: { east: Infinity, west: Infinity }, next: { east: null, west: null }, platforms: {} }));
    for (const rec of world.rail?.stations ?? []) { const s = this.stations.find((q) => q.id === rec.id); if (s) s.platforms = rec.platforms; }
    this.routes = { 1: [...this.stations.map((st, i) => ({ kind: 'station', i, x: st.x, st })), { kind: 'turn', x: R.turnEast }], '-1': [...this.stations.map((st, i) => ({ kind: 'station', i, x: st.x, st })).reverse(), { kind: 'turn', x: R.turnWest }] };
    this.geo = buildRakeGeometry();
    this.trains = [0, 1, 2].map((i) => new Train(this, i, this.geo));
    this.ride = null; this.rideLegStart = null; this.enabled = true; this.stats = { arrivals: 0, strikes: 0, rides: 0, crossingsClosed: 0 };
    this.lights = new Glows(game, 64);
    this._buildCrossings(world);
    this._registerInteractables();
    this._etaT = 0; this._servedHour = -1; this.lastStrike = -99; this._announced = new Set();
    this.trackZ = { 1: R.tracks.east.z, '-1': R.tracks.west.z };
    this._fastForward();
    game.transit = this;
    this._updateEtas();
    this.boards = new IndicatorBoards(game, this);
    const render0 = game.render.bind(game);
    game.render = () => { this._cullTrains(); render0(); };
    const d = game.debug;
    d?.addState('transit', () => this.state());
    d?.addSetter('trains', (g, v) => this.setEnabled(!!v));
    d?.addAction('transitWait', (g, stationId, dir = 'east', seconds = 240) => this.debugWait(stationId, dir, seconds));
    d?.addAction('transitBoard', (g, stationId) => this.board(stationId));
    d?.addAction('transitTp', (g, stationId, side = 'north') => this.debugTeleport(stationId, side));
    d?.addAction('transitRideTo', (g, stationId, maxSeconds = 240) => this.debugRideTo(stationId, maxSeconds));
    d?.addAction('transitService', (g, n) => { this.forcedServed = n; return n; });
  }

  // ------------------------------------------------------------------ the timetable
  setEnabled(on) {
    this.enabled = on;
    for (const t of this.trains) if (!on && t.active) this._park(t, true); else if (on && !t.active) { /* the service count brings them back */ }
  }

  served() { return this.forcedServed ?? servedTrains(this.game.clock ? this.game.clock.hour : 8); }

  _routeOf(t) { return this.routes[t.dir]; }
  _platformSide(dir) { return dir > 0 ? 'north' : 'south'; }

  _launch(t, x = null) {
    const R = this.R, w = this.game.physics;
    t.dir = 1; t.x = x ?? this.stations[0].x; t.z = R.tracks.east.z; t.v = 0; t.stopIdx = 0;
    t.retire = false; t.group.visible = true; t._enabledAll(true);
    this._arrive(t, true);
    t.timer = 6 + t.index * 2;
    t.place();
    void w;
  }

  _park(t, force = false) {
    if (!t.active) return;
    if (t.sys.ride?.train === t && !force) return;
    this._stopLoop(t);
    t.state = 'parked'; t.v = 0; t.doorsOpen = null; t.group.visible = false; t._enabledAll(false); t.at = null;
  }

  _fastForward() {
    // stagger the trains: launch them 55 s apart and run the timetable for a while before the game starts, so the line is already alive
    const dt = 0.1; let clock = 0; const serve = this.served();
    this._ff = true;
    const starts = [0, 52, 104];
    for (let step = 0; step < 1500; step++) {
      clock += dt;
      this.trains.forEach((t, i) => { if (i < serve && t.state === 'parked' && clock >= starts[i]) this._launch(t); });
      for (const t of this.trains) if (t.active) this._stepTrain(t, dt, true);
    }
    this._ff = false;
    for (const t of this.trains) if (t.active) { t.place(); t._syncDoors(); }
  }

  // ------------------------------------------------------------------ motion
  _arrive(t, silent = false) {
    const stop = this._routeOf(t)[t.stopIdx];
    if (stop.kind === 'turn') { t.state = 'turn'; t.timer = T.turnWait; t.doorsOpen = null; t._syncDoors(); return; }
    const st = stop.st;
    t.at = st.id; t.state = 'dwell'; t.v = 0; t.x = stop.x;
    t.timer = st.terminus ? T.dwellTerminus : T.dwell;
    t.doorsOpen = this._platformSide(t.dir); t._syncDoors();
    t.braked = false; t.horned = false;
    this._stopLoop(t);
    if (!silent) {
      this.stats.arrivals++;
      this.game.events.emit('transit:arrive', { train: t.id, station: st.id, dir: t.dir > 0 ? 'east' : 'west' });
      if (this._near(t, 40)) this.game.events.emit('sound:emit', { x: t.x, y: 1.5, z: t.z, kind: 'train-door', loudness: 0.55 });
      this._announceArrival(t, st);
      this._rideLegEnd(t, st);
    }
  }

  _near(t, r) { const p = this.game.player.pos; return Math.hypot(p.x - t.x, p.z - t.z) < r + LAYOUT.L / 2; }

  _nextStation(t) {
    const route = this._routeOf(t);
    for (let i = (t.state === 'dwell' ? t.stopIdx + 1 : t.stopIdx); i < route.length; i++) if (route[i].kind === 'station') return route[i].st;
    return null;
  }

  _announceArrival(t, st) {
    const g = this.game, aboard = this.ride?.train === t;
    if (!aboard && !this._near(t, 18)) return;
    const next = this._nextStation(t), side = t.dir > 0 ? 'north' : 'south';
    void side;
    const text = st.terminus
      ? `${st.name}. ${st.dev}. This train terminates here. All passengers please alight. Mind the gap.`
      : `${st.name}. ${st.dev}. Harbour Line, for ${t.dir > 0 ? this.stations[this.stations.length - 1].name : this.stations[0].name}. Mind the gap.${next ? ` Next station: ${next.name}.` : ''}`;
    g.pa?.say?.(text, { force: true }) ?? g.messages?.say(text, { kind: 'pa', ttl: 7 });
  }

  _blockAhead(t) {
    // the nearest train on this track going the same way, ahead of us (its tail position in our direction)
    let best = Infinity;
    for (const o of this.trains) {
      if (o === t || !o.active) continue;
      if (Math.abs(o.z - t.z) > 2.5) continue;
      if (o.dir !== t.dir && o.state !== 'slide' && o.state !== 'turn') continue;
      const gap = (o.x - t.x) * t.dir - LAYOUT.L;
      if (gap > -1 && gap < best) best = gap;
    }
    return best;
  }
  _trackBusy(z, x, span = 50, except = null) {
    return this.trains.some((o) => o !== except && o.active && Math.abs(o.z - z) < 2.5 && Math.abs(o.x - x) < span + LAYOUT.L / 2);
  }

  _stepTrain(t, dt, quiet = false) {
    const route = this._routeOf(t), stop = route[t.stopIdx];
    switch (t.state) {
      case 'dwell': {
        t.timer -= dt;
        if (t.timer <= 0) {
          const gap = this._blockAhead(t);
          if (gap < T.headway && gap > 0) { t.heldBy = 'signal'; t.timer = 0.5; break; }
          t.heldBy = null; t.state = 'closing'; t.timer = T.closeTime;
          if (!quiet && this._near(t, 40)) this.game.events.emit('sound:emit', { x: t.x, y: 1.5, z: t.z, kind: 'train-door', loudness: 0.6 });
          if (this.ride?.train === t) this.game.messages?.say('The doors are closing. Hold on to something.', { kind: 'system', ttl: 3 });
        }
        break;
      }
      case 'closing': {
        t.timer -= dt;
        if (t.timer <= 0) {
          if (!quiet) this._clearDoorway(t);
          t.doorsOpen = null; t._syncDoors(); t.state = 'run'; t.stopIdx++; t.legStart = t.x;
          const st = t.at; t.at = null;
          this.game.events.emit('transit:depart', { train: t.id, station: st, dir: t.dir > 0 ? 'east' : 'west' });
          if (!quiet && this._near(t, 80)) this.game.events.emit('sound:emit', { x: t.nose(), y: 1.5, z: t.z, kind: 'train-horn', loudness: 0.8 });
          this._beginRideLeg(t);
        }
        break;
      }
      case 'run': {
        const dist = (stop.x - t.x) * t.dir;
        const vm = stop.kind === 'turn' ? T.vturn : T.vmax;
        let want = dist <= 0.05 ? 0 : Math.min(vm, Math.sqrt(2 * T.decel * Math.max(0, dist - 0.05)));
        const gap = this._blockAhead(t);
        if (gap < Infinity) want = Math.min(want, Math.sqrt(2 * T.decel * Math.max(0, gap - 12)));
        const a = want > t.v ? T.accel : T.decel;
        t.v = want > t.v ? Math.min(want, t.v + a * dt) : Math.max(want, t.v - a * dt * 1.4);
        t.x += t.dir * t.v * dt;
        if (!quiet) {
          if (!t.braked && stop.kind === 'station' && dist < t.v * t.v / (2 * T.decel) + 30 && t.v > 6) {
            t.braked = true;
            if (this._near(t, 90)) this.game.events.emit('sound:emit', { x: t.x, y: 1, z: t.z, kind: 'train-brake', loudness: 0.7 });
          }
          if (!t.horned && stop.kind === 'station' && dist < 90 && t.v > 8) {
            t.horned = true;
            if (this._near(t, 130)) this.game.events.emit('sound:emit', { x: t.nose(), y: 1.5, z: t.z, kind: 'train-horn', loudness: 0.85 });
          }
        }
        if (dist <= 0.25 && t.v < 0.5) { t.x = stop.x; t.v = 0; this._arrive(t, quiet); }
        else if (t.v < 0.01 && want === 0 && dist > 0.5 && gap < Infinity) { /* waiting behind a train ahead */ }
        break;
      }
      case 'turn': {
        t.timer -= dt;
        if (t.timer <= 0) {
          if (t.retire && this.ride?.train !== t) { this._park(t); break; }
          const toZ = this.trackZ[-t.dir];
          if (this._trackBusy(toZ, t.x, 55, t)) { t.timer = 1; t.heldBy = 'signal'; break; }
          t.heldBy = null; t.state = 'slide'; t.slideFrom = t.z; t.slideTo = toZ;
        }
        break;
      }
      case 'slide': {
        const d = t.slideTo - t.z, step = T.slideSpeed * dt;
        if (Math.abs(d) <= step) {
          t.z = t.slideTo; t.dir = -t.dir; t.stopIdx = 0; t.state = 'run'; t.v = 0; t.legStart = t.x;
          if (t.retire && this.ride?.train !== t) { /* parks at the next turn */ }
        } else t.z += Math.sign(d) * step;
        break;
      }
      default: break;
    }
  }

  // ------------------------------------------------------------------ the ride (the player on a carriage floor)
  _ridingTrain() {
    const p = this.game.player;
    if (p.onGround && p.ground && p.ground.userData?.train) return p.ground.userData.train;
    return null;
  }

  _updateRide() {
    const g = this.game, t = this._ridingTrain();
    if (t && !this.ride) {
      this.ride = { train: t, boardedAt: t.at ?? this._lastStation(t), from: t.at ?? null, next: null, legs: 0, hours: 0, t0: g.time };
      this.stats.rides++;
      g.events.emit('transit:board', { train: t.id, station: this.ride.boardedAt });
      const st = this.stations.find((s) => s.id === this.ride.boardedAt);
      g.messages?.say(`The Harbour Line ${t.dir > 0 ? 'to Sewri' : 'to Mahim Jn'}. ${st ? st.name + '. ' : ''}You are inside, in a crush of damp shoulders.`, { kind: 'story', ttl: 5 });
      this._beginRideLeg(t);
    } else if (!t && this.ride && g.player.pos.y < this.ride.train.floor.max.y + 0.2) {
      // stepped off (onto a platform or the ground)
      const r = this.ride; this.ride = null;
      g.events.emit('transit:alight', { train: r.train.id, station: r.train.at });
    } else if (this.ride && t && t !== this.ride.train) this.ride.train = t;
  }
  _lastStation(t) { const route = this._routeOf(t); for (let i = Math.min(t.stopIdx, route.length - 1); i >= 0; i--) if (route[i].kind === 'station') return route[i].st.id; return null; }
  _beginRideLeg(t) { if (this.ride?.train === t) this.rideLegStart = t.x; }
  _rideLegEnd(t, st) {
    const r = this.ride;
    if (!r || r.train !== t || this.rideLegStart == null) return;
    const dist = Math.abs(t.x - this.rideLegStart); this.rideLegStart = null;
    if (dist < 5) return;
    const hours = T.rideHoursBase + dist * T.rideHoursPerMetre;
    r.legs++; r.hours += hours;
    this.game.clock?.advance?.(hours, 'ride');
    this.game.events.emit('transit:ride', { train: t.id, from: r.boardedAt, to: st.id, hours });
    this.game.messages?.say(`${st.name}. The ride took ${Math.max(1, Math.round(hours * 60))} minutes of your day.`, { kind: 'system', ttl: 4 });
  }

  /** The doors are about to close: anyone standing in a doorway is pushed in by the crowd. */
  _clearDoorway(t) {
    const p = this.game.player, R = LAYOUT;
    if (!t.doorsOpen || this._ridingTrain() === t) return;
    const s = t.doorsOpen === 'north' ? -1 : 1, wallZ = t.z + s * R.half;
    if (Math.abs(p.pos.z - wallZ) < 0.75 && Math.abs(p.pos.x - t.x) < R.L / 2 + 0.3 && p.pos.y < 1.2) {
      p.pos.z = t.z - s * 0.7; p.pos.y = Math.max(p.pos.y, 0.5); p.onGround = false; p.ground = null;
      this.game.messages?.say('The crowd behind you shoves. You are in the train.', { kind: 'story', ttl: 4 });
    }
  }

  /** Setu and Jeetu ride with her: while she is aboard they are carried by the same carriage (the trail-following AI would run back down the track). */
  _followers() {
    const g = this.game, out = [];
    if (g.setu?.following && !g.setu.dead && g.setu.follower) out.push({ id: 'setu', f: g.setu.follower, actor: g.setu });
    const P = g.party;
    if (P?.jeetu?.follower && P.active === 'mithi') out.push({ id: 'jeetu', f: P.jeetu.follower, actor: P.jeetu });
    else if (P?.active === 'jeetu' && P.bodies?.mithi?.follower) out.push({ id: 'mithi', f: P.bodies.mithi.follower, actor: P.bodies.mithi });
    return out;
  }
  _carryFollowers() {
    const g = this.game, r = this.ride, p = g.player.pos;
    if (!r) {
      if (this._riding?.length) {                           // she got off: they step off beside her
        for (const e of this._riding) { e.f.enabled = true; try { e.f.reset(); e.f.teleportBehind('alight'); } catch { /* ok */ } }
        this._riding = null;
      }
      return;
    }
    const t = r.train;
    if (!this._riding) {
      this._riding = this._followers().map((e, i) => ({ ...e, off: i === 0 ? [0.85, 0.7] : [-0.85, 0.8] }));
      for (const e of this._riding) e.f.enabled = false;
    }
    for (const [i, e] of this._riding.entries()) {
      const a = e.f.actor.pos, s = Math.sign(p.z - t.z) || 1;
      // keep them inside the car, on the floor, a step from her (carried by the train: the same delta it just moved)
      const tx = Math.max(t.x - LAYOUT.L / 2 + 1, Math.min(t.x + LAYOUT.L / 2 - 1, p.x + e.off[0])), tz = Math.max(t.z - 0.95, Math.min(t.z + 0.95, p.z - s * e.off[1] * 0.7 + (i ? 0.2 : 0)));
      a.x += (t.dx ?? 0); a.z += (t.dz ?? 0);
      a.x += (tx + (t.dx ?? 0) - a.x) * 0.2; a.z += (tz + (t.dz ?? 0) - a.z) * 0.2; a.y = t.floor.max.y;
      e.f.vy = 0; e.f.onGround = true; e.f.ground = null; e.f.speed = 0;
      if (e.f.actor.yaw !== undefined) e.f.actor.yaw = Math.atan2(-(p.x - a.x), -(p.z - a.z));
    }
  }

  // ------------------------------------------------------------------ crossings
  _buildCrossings(world) {
    const game = this.game;
    this.crossings = [];
    const recs = world.rail?.crossings ?? [];
    for (const rec of recs) {
      this.crossings.push({
        id: rec.id, x: rec.x, x0: rec.x0, x1: rec.x1, w: rec.w, colliders: rec.colliders, masts: rec.masts,
        state: 'open', angle: T.boomUp, warnT: 0, clearT: 0, blocked: false, playerInside: false, loop: false, need: false,
      });
    }
    // booms: 4 per crossing, one instanced mesh (a 1 x 1 x 1 box in ten red and white bands, scaled to 9.7 m, pivot at x = 0)
    const bands = 10, parts = [];
    for (let i = 0; i < bands; i++) {
      const g = new THREE.BoxGeometry(1 / bands, 1, 1).toNonIndexed(); g.translate((i + 0.5) / bands, 0, 0);
      const c = new THREE.Color(i % 2 ? 0xf2efe6 : 0xd02e24), n = g.attributes.position.count, a = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) { a[k * 3] = c.r; a[k * 3 + 1] = c.g; a[k * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.deleteAttribute('uv'); parts.push(g);
    }
    const geo = mergeGeometries(parts, false); parts.forEach((g) => g.dispose());
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    game.materials.all.push(mat);
    this.boomMesh = new THREE.InstancedMesh(geo, mat, Math.max(1, this.crossings.length * 4));
    this.boomMesh.name = 'crossing-booms'; this.boomMesh.frustumCulled = false; this.boomMesh.count = 0;
    game.scene.add(this.boomMesh);
    this._boomDummy = new THREE.Object3D();
  }

  _trainNeedsCrossing(cr) {
    for (const t of this.trains) {
      if (!t.active) continue;
      const stopped = t.v < 0.3 && t.state !== 'run';
      const stop = this._routeOf(t)[t.stopIdx];
      let lead;
      if (t.state === 'dwell') lead = t.timer < 4 + T.closeTime ? 8 : 0.6;
      else if (t.state === 'closing') lead = 8;
      else if (t.state === 'run') lead = Math.min(1 + t.v * T.lookahead, Math.max(0, (stop.x - t.x) * t.dir));
      else if (t.state === 'turn' || t.state === 'slide') lead = 0.6;
      else lead = 0.6;
      if (stopped && t.state !== 'dwell' && t.state !== 'closing' && t.state !== 'turn' && t.state !== 'slide') lead = 0.6;
      const noseEdge = t.x + t.dir * (LAYOUT.L / 2 + lead), tailEdge = t.x - t.dir * (LAYOUT.L / 2 + 0.6);
      const a = Math.min(noseEdge, tailEdge), b = Math.max(noseEdge, tailEdge);
      if (b > cr.x0 - 0.2 && a < cr.x1 + 0.2) return true;
    }
    return false;
  }

  _updateCrossings(dt) {
    const g = this.game, p = g.player.pos, R = this.R, phys = g.physics;
    for (const cr of this.crossings) {
      cr.playerInside = p.z > R.corridor.z0 - 0.5 && p.z < R.corridor.z1 + 0.5 && p.x > cr.x0 - 0.3 && p.x < cr.x1 + 0.3 && p.y < 1.2;
      const need = this._trainNeedsCrossing(cr);
      cr.need = need;
      if (need) { cr.clearT = 0; cr.warnT += dt; } else { cr.clearT += dt; if (cr.state !== 'closed') cr.warnT = Math.max(0, cr.warnT - dt); }
      const prev = cr.state;
      if (cr.state === 'open' && need) cr.state = 'warn';
      else if (cr.state === 'warn' && !need && cr.clearT > T.clearTime) cr.state = 'open';
      else if (cr.state === 'warn' && need && cr.warnT >= T.warnTime) cr.state = 'closed';
      else if (cr.state === 'closed' && !need && cr.clearT > T.clearTime) cr.state = 'open';
      if (cr.state !== prev) {
        if (cr.state === 'closed') { this.stats.crossingsClosed++; g.events.emit('crossing:closed', { id: cr.id }); }
        if (cr.state === 'open') g.events.emit('crossing:open', { id: cr.id });
      }
      const target = cr.state === 'closed' ? 0 : T.boomUp;
      cr.angle += clamp(target - cr.angle, -T.boomRate * dt, T.boomRate * dt);
      const block = cr.angle < 0.75 && !cr.playerInside;
      if (block !== cr.blocked) { cr.blocked = block; for (const c of cr.colliders) phys.setEnabled(c, block); }
      const ring = cr.state !== 'open';
      if (ring !== cr.loop) {
        cr.loop = ring;
        if (ring) g.events.emit('sound:loop', { id: 'crossing:' + cr.id, kind: 'crossing', loudness: 0.4, getPos: () => ({ x: cr.x, y: 2, z: R.zc }) });
        else g.events.emit('sound:loopStop', { id: 'crossing:' + cr.id });
      }
    }
  }

  _drawCrossings(time) {
    if (!this.boomMesh) return;
    const d = this._boomDummy, R = this.R;
    let n = 0;
    for (const cr of this.crossings) {
      for (const m of cr.masts) {
        d.position.set(m.x, 1.05, m.z);
        const left = m.x < cr.x;                       // the mast at x0 swings its boom to +x, the one at x1 to -x
        d.rotation.set(0, 0, left ? cr.angle : -cr.angle);
        d.scale.set(left ? 9.7 : -9.7, 0.2, 0.12);
        d.updateMatrix(); this.boomMesh.setMatrixAt(n++, d.matrix);
      }
      // flashing red lamps on the masts while it rings
      if (cr.state !== 'open') {
        const k = Math.floor(time * 3.4) % 2;
        cr.masts.forEach((m, i) => { if ((i + k) % 2 === 0) this.lights.add(m.x, 3.3, m.z, 1.6, 2.0, 0.18, 0.1); });
      } else for (const m of cr.masts) this.lights.add(m.x, 3.3, m.z, 0.5, 0.35, 0.03, 0.02);
    }
    this.boomMesh.count = n; this.boomMesh.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------ strikes and sound
  _strikeCheck(t) {
    const g = this.game, p = g.player, pos = p.pos;
    if (t.speed < 1.2 || t.state !== 'run') return;
    if (g.time - this.lastStrike < 4 || pos.y > 1.2) return;
    if (this._ridingTrain()) return;
    const noseX = t.nose(), dx = (pos.x - noseX) * t.dir;
    if (dx > -1.2 && dx < 1.6 && Math.abs(pos.z - t.z) < 1.75) {
      this.lastStrike = g.time; this.stats.strikes++;
      const toward = Math.sign(this.R.zc - t.z) || 1;
      g.physics.slideMove(pos, 0, toward * (Math.abs(pos.z - t.z) < 1.75 ? 2.2 - toward * (pos.z - t.z) : 0), pos.y);
      pos.x += t.dir * 1.5;
      g.health?.setRays?.(Math.max(1, p.rays - T.strikeDamage));
      g.screenfx?.flash?.('#ffffff', 220, 0.3);
      g.hazards?.shake?.(0.5, 0.5);
      g.messages?.say('A wall of steel clips you and throws you clear. The horn is still screaming.', { kind: 'story', ttl: 5 });
      g.events.emit('transit:strike', { train: t.id });
      g.events.emit('sound:emit', { x: pos.x, y: 1, z: pos.z, kind: 'train-horn', loudness: 1, long: true });
    }
  }

  _startLoop(t) {
    if (t.loop) return; t.loop = true;
    this.game.events.emit('sound:loop', { id: 'train:' + t.id, kind: 'train', loudness: 0.62, getPos: () => ({ x: t.x, y: 1.2, z: t.z }) });
  }
  _stopLoop(t) { if (!t.loop) return; t.loop = false; this.game.events.emit('sound:loopStop', { id: 'train:' + t.id }); }

  // ------------------------------------------------------------------ interactables
  _registerInteractables() {
    const game = this.game;
    for (const st of this.stations) {
      for (const side of ['north', 'south']) {
        const pl = st.platforms[side]; if (!pl) continue;
        const dir = side === 'north' ? 'east' : 'west';
        game.interactables.add({
          id: `rail:${st.id}:${side}`, pos: { x: st.x + 5, y: pl.top, z: pl.zMid }, radius: 4.5, height: 3,
          prompt: () => `Indicator: ${dir === 'east' ? 'Sewri' : 'Mahim Jn'} train ${fmtEta(st.eta[dir])}`,
          onInteract: () => this.announceBoard(st),
        });
      }
    }
    // E at an open door: board; aboard at a standing train: get off
    game.interactables.add({
      id: 'rail:door', pos: { x: 0, y: 0, z: 0 }, radius: 4, height: 3, priority: 1,
      enabled: () => !!this._door,
      prompt: () => (this._door?.alight ? `Get off at ${this._door.name}` : `Board the Harbour Line to ${this._door?.dest ?? ''}`),
      onInteract: () => { if (this._door) this._door.alight ? this.alight() : this.board(); },
    });
  }

  announceBoard(st) {
    const g = this.game;
    const line = (dir, label) => `${label}: ${fmtEta(st.eta[dir])}${st.next[dir] ? ` (train ${st.next[dir].train.slice(-1)})` : ''}`;
    g.messages?.say(`${st.dev}  ${st.name.toUpperCase()}. ${line('east', 'For Sewri')}  ·  ${line('west', 'For Mahim Jn')}`, { kind: 'system', ttl: 7 });
  }

  _updateDoorInteractable() {
    const p = this.game.player.pos, riding = this._ridingTrain();
    let best = null, bd = 4.2;
    for (const t of this.trains) {
      if (!t.active || !t.doorsOpen) continue;
      const s = t.doorsOpen === 'north' ? -1 : 1, wz = t.z + s * LAYOUT.half;
      const near = riding === t || Math.abs(p.x - t.x) < LAYOUT.L / 2 + 2;
      if (!near) continue;
      for (const dx of LAYOUT.doors) {
        const wx = t.x + dx, d = Math.hypot(p.x - wx, p.z - wz);
        if (d < bd) { bd = d; best = { t, wx, wz, s, alight: riding === t, name: this.stations.find((q) => q.id === t.at)?.name ?? '', dest: t.dir > 0 ? 'Sewri' : 'Mahim Jn' }; }
      }
    }
    this._door = best;
    const it = this.game.interactables.get('rail:door');
    if (best) { it.pos.x = best.wx; it.pos.z = best.wz; it.pos.y = best.alight ? 0.5 : (best.t.floor.max.y); }
  }

  board(stationId = null) {
    const g = this.game, p = g.player;
    let d = this._door && !this._door.alight ? this._door : null;
    if (!d) {      // debug / helper: board the train dwelling at that station (or the nearest one)
      const t = this.trains.find((q) => q.active && q.state === 'dwell' && (!stationId || q.at === stationId));
      if (!t) return false;
      const s = t.doorsOpen === 'north' ? -1 : 1;
      d = { t, wx: t.x + LAYOUT.doors[3], wz: t.z + s * LAYOUT.half, s };
    }
    const t = d.t;
    if (!t.doorsOpen) return false;
    p.teleport(d.wx, t.floor.max.y + 0.02, t.z - d.s * 0.55, p.yaw);
    g.messages?.say('You push in between two strangers. The floor is already moving under someone else\'s feet.', { kind: 'story', ttl: 4 });
    return true;
  }
  alight() {
    const g = this.game, p = g.player, t = this._ridingTrain() ?? this.ride?.train;
    if (!t || !t.doorsOpen) return false;
    const s = t.doorsOpen === 'north' ? -1 : 1, P = this.R.platforms[t.doorsOpen];
    const dx = LAYOUT.doors.reduce((b, d) => (Math.abs(t.x + d - p.pos.x) < Math.abs(t.x + b - p.pos.x) ? d : b), LAYOUT.doors[0]);
    p.teleport(t.x + dx, this.R.platformTop + 0.02, (P.z0 + P.z1) / 2 + (s < 0 ? 0.8 : -0.8), p.yaw);
    return true;
  }

  // ------------------------------------------------------------------ ETA
  /** Seconds until train `t` stops at station `stId` heading `dirWanted` (+1 east, -1 west), following its route. */
  _eta(t, stId, dirWanted) {
    if (!t.active) return Infinity;
    let dir = t.dir, idx = t.stopIdx, time = 0, x = t.x;
    let route = this.routes[dir];
    if (t.state === 'dwell') {
      const st = route[idx].st;
      if (st.id === stId && dir === dirWanted) return 0;
      time += Math.max(0, t.timer) + T.closeTime; idx++;
    } else if (t.state === 'closing') { time += Math.max(0, t.timer); idx++; }
    else if (t.state === 'turn') { time += Math.max(0, t.timer) + 5.2; dir = -dir; route = this.routes[dir]; idx = 0; x = route === this.routes[1] ? this.R.turnWest : this.R.turnEast; x = t.x; }
    else if (t.state === 'slide') { time += Math.abs(t.slideTo - t.z) / T.slideSpeed; dir = -dir; route = this.routes[dir]; idx = 0; x = t.x; }
    for (let guard = 0; guard < 24; guard++) {
      if (idx >= route.length) { dir = -dir; route = this.routes[dir]; idx = 0; time += T.turnWait + 5.2; continue; }
      const stop = route[idx];
      const D = Math.abs(stop.x - x);
      time += t.state === 'run' && guard === 0 ? Math.max(0, legTime(D) - (t.v / T.accel) * 0.5) : legTime(D, stop.kind === 'turn' ? T.vturn : T.vmax);
      x = stop.x;
      if (stop.kind === 'station') {
        if (stop.st.id === stId && dir === dirWanted) return time;
        time += stop.st.terminus ? T.dwellTerminus + T.closeTime : T.dwell + T.closeTime;
      } else time += T.turnWait + 5.2 + 0;
      idx++;
    }
    return Infinity;
  }

  nextArrival(stationId, dir = 'east') {
    const d = dir === 'east' ? 1 : -1;
    let best = Infinity, who = null;
    for (const t of this.trains) { const e = this._eta(t, stationId, d); if (e < best) { best = e; who = t; } }
    return { eta: best, train: who?.id ?? null };
  }

  _updateEtas() {
    for (const st of this.stations) for (const dir of ['east', 'west']) {
      const r = this.nextArrival(st.id, dir);
      st.eta[dir] = r.eta;
      st.next[dir] = r.train ? { eta: r.eta, train: r.train, dest: dir === 'east' ? 'Sewri' : 'Mahim Jn' } : null;
    }
  }

  /**
   * For a careful walker (the bot, or a hint for touch players): true when (pos) is about to step into a level crossing that is warning
   * or closed. `ux, uz` is the unit direction of travel.
   */
  holdPath(pos, ux, uz) {
    const R = this.R;
    for (const cr of this.crossings) {
      if (pos.x < cr.x0 - 1.2 || pos.x > cr.x1 + 1.2) continue;
      if (cr.state === 'open' && !cr.need) continue;
      if (uz > 0.15 && pos.z < R.corridor.z0 + 0.2 && pos.z > R.corridor.z0 - 7) return true;
      if (uz < -0.15 && pos.z > R.corridor.z1 - 0.2 && pos.z < R.corridor.z1 + 7) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ the frame
  update(dt, game) {
    if (!this.enabled) { this._drawCrossings(game.time); return; }
    // service level by the hour (a train is only withdrawn when it reaches a terminus, and never with the player aboard)
    const serve = this.served();
    if (serve !== this._servedNow) {
      this._servedNow = serve;
      this.trains.forEach((t, i) => { t.retire = i >= serve && t.active; });
    }
    for (const [i, t] of this.trains.entries()) {
      if (t.state === 'parked' && i < serve && !this._trackBusy(this.R.tracks.east.z, this.stations[0].x, 45)) this._launch(t);
    }
    for (const t of this.trains) {
      if (!t.active) continue;
      const px = t.x, pz = t.z;
      this._stepTrain(t, dt);
      t.dx = t.x - px; t.dz = t.z - pz;
      t.place();
      const moving = t.speed > 1.5;
      if (moving) this._startLoop(t); else if (t.speed < 0.6) this._stopLoop(t);
    }
    this._updateRide();
    this._carryFollowers();
    for (const t of this.trains) if (t.active) this._strikeCheck(t);
    this._updateCrossings(dt);
    this._updateDoorInteractable();
    this._etaT -= dt; if (this._etaT <= 0) { this._etaT = 0.5; this._updateEtas(); this._stationLoops(); }
    this.boards?.update(dt);
    this._drawLights(game.time);
    this._drawCrossings(game.time);
    this._drawAbort = false;
  }

  /** A train beyond the fog (plus its half length) is not drawn: that is two draw calls saved per far train. */
  _cullTrains() {
    const g = this.game, c = g.camera.position, D = Math.max(66, (g.scene.fog?.far ?? 60) + 8) + 8;
    const free = g.visionSystem?.active;
    for (const t of this.trains) {
      if (!t.active) { t.group.visible = false; continue; }
      const d = Math.hypot(t.x - c.x, t.z - c.z);
      t.group.visible = free || d - LAYOUT.L / 2 < D;
      if (t.group.visible && d < 70) spinFans(t.group, g.time);
    }
  }

  /** The murmur of a platform, while you are within earshot of it (the audio engine plays the nearest few loops). */
  _stationLoops() {
    const g = this.game, p = g.player.pos;
    for (const st of this.stations) {
      const near = Math.hypot(p.x - st.x, p.z - this.R.zc) < 70 && Math.abs(p.y) < 6;
      if (near && !st._loop) { st._loop = true; g.events.emit('sound:loop', { id: 'crowd:' + st.id, kind: 'crowd', loudness: 0.5, getPos: () => ({ x: st.x, y: 1.5, z: this.R.zc }) }); }
      else if (!near && st._loop) { st._loop = false; g.events.emit('sound:loopStop', { id: 'crowd:' + st.id }); }
    }
  }

  _drawLights(time) {
    const L = LAYOUT.L / 2, cam = this.game.camera.position;
    this.lights.begin();
    for (const t of this.trains) {
      if (!t.active) continue;
      const dx = cam.x - t.x, dz = cam.z - t.z;
      if (dx * dx + dz * dz > 150 * 150) continue;
      const hx = t.x + t.dir * (L + 0.15), tx = t.x - t.dir * (L + 0.15);
      this.lights.add(hx, 1.0, t.z, 2.6, 1.6, 1.5, 1.1);               // the headlamp
      this.lights.add(hx, 2.55, t.z, 1.0, 1.2, 0.8, 0.3);              // the route board
      if (t.speed > 0.5 || t.state === 'closing') for (const k of [5, 12, 24]) this.lights.add(hx + t.dir * k, 1.3, t.z, 2.6 + k * 0.32, 0.2, 0.19, 0.13);   // the beam, hazed by the rain
      this.lights.add(tx, 0.95, t.z - 0.55, 0.9, 1.6, 0.1, 0.06); this.lights.add(tx, 0.95, t.z + 0.55, 0.9, 1.6, 0.1, 0.06);   // tail lamps
      if (t.doorsOpen) {                                                // an open door glows: a lit doorway of bodies
        const s = t.doorsOpen === 'north' ? -1 : 1;
        for (const dx2 of LAYOUT.doors) this.lights.add(t.x + dx2, 1.6, t.z + s * (LAYOUT.half + 0.1), 1.9, 0.5, 0.42, 0.22);
      }
    }
    this.lights.end();
    void time;
  }

  // ------------------------------------------------------------------ debug and state
  _stationOf(id) { return this.stations.find((s) => s.id === id); }
  debugTeleport(stationId, side = 'north') {
    const st = this._stationOf(stationId), P = st.platforms[side];
    this.game.player.teleport(st.x + 2, this.R.platformTop, P.zMid, side === 'north' ? 0 : Math.PI);
    return { x: st.x + 2, z: P.zMid };
  }
  /** Step the simulation until a train is dwelling at the station on the given side's track (east = north platform). */
  debugWait(stationId, dir = 'east', seconds = 240) {
    const want = dir === 'east' ? 1 : -1, g = this.game;
    const dwelling = () => this.trains.find((t) => t.active && t.state === 'dwell' && t.at === stationId && t.dir === want && t.timer > 5);
    let n = Math.round(seconds / (1 / 60));
    while (n-- > 0 && !dwelling()) g.debug.step(1 / 60);
    const t = dwelling();
    return t ? { train: t.id, x: +t.x.toFixed(1), timer: +t.timer.toFixed(1), t: +g.time.toFixed(1) } : null;
  }
  /** Step the simulation until the riding player is at a station (doors open) or give up. */
  debugRideTo(stationId, maxSeconds = 240) {
    const g = this.game; let n = Math.round(maxSeconds * 60);
    while (n-- > 0) { g.debug.step(1 / 60); const t = this.ride?.train; if (t && t.state === 'dwell' && t.at === stationId) break; if (!this.ride) break; }
    return this.state().ride;
  }

  state() {
    const r3 = (v) => Math.round(v * 100) / 100;
    return {
      enabled: this.enabled, served: this.served(), stats: { ...this.stats },
      trains: this.trains.map((t) => ({
        id: t.id, active: t.active, state: t.state, dir: t.dir, x: r3(t.x), z: r3(t.z), v: r3(t.v), at: t.at, doors: t.doorsOpen, timer: r3(t.timer),
        next: t.active ? this._nextStation(t)?.id ?? null : null, held: t.heldBy,
        riders: this.ride?.train === t,
      })),
      stations: this.stations.map((s) => ({ id: s.id, name: s.name, x: s.x, eta: { east: isFinite(s.eta.east) ? r3(s.eta.east) : null, west: isFinite(s.eta.west) ? r3(s.eta.west) : null } })),
      ride: this.ride ? { train: this.ride.train.id, boardedAt: this.ride.boardedAt, legs: this.ride.legs, hours: r3(this.ride.hours), at: this.ride.train.at, state: this.ride.train.state, x: r3(this.ride.train.x) } : null,
      crossings: this.crossings.map((c) => ({ id: c.id, x: c.x, state: c.state, angle: r3(c.angle), blocked: c.blocked, inside: c.playerInside })),
    };
  }
}
