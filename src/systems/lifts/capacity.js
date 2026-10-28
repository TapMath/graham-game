// Capsule capacity (Phase 9A): who fits in the car is a rule of the world, not a number on a label.
//
//   solo (1)      only Mithi rides. Setu and Jeetu wait at the lobby; the car goes up, turns round, comes back for them and takes them up on
//                 the next cycle (they arrive after her). The same car, the same charge: the second trip costs a call and a ride.
//   family (4)    the party fits.
//   public (12)   shared with the crowd. `lift.crowd` seats are taken by strangers: the car is full at rush hour (06:30 to 09:30 and 17:00
//                 to 20:30), half empty by day, nearly empty at night. A full car cannot be boarded; the next cycle (`cls.cycle` seconds)
//                 turns the crowd over. With only some seats free, Mithi goes first and the others wait for the next cycle.
//   freight (24)  as public, with a bigger crowd; the slowest, dearest car.
//
//   game.capsules.plan(lift)               what boarding now would do: {ok, free, board[], left[], full}
//   game.capsules.depart(lift, plan, from, to)    called after the ride started: the ones left behind wait, the car comes back for them
//   game.capsules.status(lift)             {seats, crowd, free, full, nextIn, rush}
//   game.capsules.riders(camPos, maxD2)    the strangers in the visible public cars, as crowd look-agents (the crowd draws them)
//   game.capsules.members()                the party that follows Mithi: [{id, name, f (Follower), pos}]
// Events: capsule:full {id}, capsule:left {id, who[]}, capsule:rejoined {id, who}.   Debug: do('capsules'), do('capsuleCrowd', id, n).
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const DIRS = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };
export const isRush = (h) => (h >= 6.4 && h < 9.6) || (h >= 17 && h < 20.6);
/** How busy the public capsules are, 0..1, at a game hour: the commuters' two peaks, a steady day, a quiet night. */
export function demand(h) {
  if (isRush(h)) return 0.95;
  if (h >= 9.6 && h < 17) return 0.36;
  if (h >= 20.6 && h < 23) return 0.2;
  return 0.04;
}

export class CapsuleSystem {
  init(game) {
    this.game = game; game.capsules = this;
    this.rng = game.rng.fork('capsules');
    this.cars = game.lifts.lifts.filter((l) => l.capsule);
    this.st = new Map();
    for (const l of this.cars) this.st.set(l.id, { rollAt: 4 + this.rng.next() * l.cls.cycle, looks: null, lastFull: false });
    for (const l of this.cars) if (l.seats >= 12) this._roll(l, true);
    this.jobs = [];
    this._warned = false;
    // a soft chime at the car as it sets off (only the ones the player could hear)
    game.events.on('lift:moving', ({ id }) => {
      const l = game.lifts.get(id); if (!l?.capsule) return;
      const p = game.player?.pos; if (!p || Math.hypot(p.x - l.center[0], p.z - l.center[1]) > 45) return;
      game.events.emit('sound:emit', { x: l.center[0], y: l.y + 1.2, z: l.center[1], kind: 'gate-chime', loudness: l.seats >= 12 ? 0.3 : 0.2 });
    });
    const dbg = game.debug;
    dbg?.addAction('capsules', () => this.cars.map((l) => ({ id: l.id, ...this.status(l) })));
    dbg?.addAction('capsuleCrowd', (g, id, n) => { const l = g.lifts.get(id); l.crowd = Math.max(0, Math.min(l.seats, n)); this.st.get(id).rollAt = g.time + 1e6; return this.status(l); });
    dbg?.addAction('capsulePlan', (g, id) => { const p = this.plan(g.lifts.get(id)); return { ok: p.ok, free: p.free, board: p.board.map((m) => m.name), left: p.left.map((m) => m.name) }; });
    dbg?.addState('capsules', () => ({ jobs: this.jobs.map((j) => ({ who: j.m.name, lift: j.lift.id, phase: j.phase, t: +j.t.toFixed(1) })), cars: this.cars.length }));
  }

  hour() { return this.game.sky?.hour ?? 10; }

  /** Re-roll the strangers in a public car: full at rush hour more often than not, rarely full by day. */
  _roll(l, first = false) {
    const g = this.game, d = demand(this.hour()), st = this.st.get(l.id), r = this.rng;
    const pFull = d > 0.9 ? 0.58 : d > 0.3 ? 0.08 : 0;
    let n = r.next() < pFull ? l.seats : Math.round(clamp(d * l.seats + (r.next() - 0.5) * l.seats * 0.5, 0, l.seats - (d > 0.9 ? 1 : 0)));
    if (l.seats < 12) n = 0;
    const was = l.crowd; l.crowd = n;
    if (l.cls.id === 'freight') st.cargo = r.next() < (d > 0.3 ? 0.75 : 0.4) ? { type: r.next() < 0.55 ? 'bus' : r.next() < 0.5 ? 'taxi' : 'auto', k: r.next() } : null;      // freight cars carry a vehicle
    st.rollAt = g.time + l.cls.cycle * (0.85 + r.next() * 0.5);
    if (!first && n >= l.seats && was < l.seats) g.events.emit('capsule:full', { id: l.id });
    return n;
  }

  status(l) {
    const st = this.st.get(l.id), free = Math.max(0, l.seats - l.crowd);
    return { cls: l.cls.id, seats: l.seats, crowd: l.crowd, free, full: free < 1, nextIn: Math.max(0, Math.min(l.cls.cycle * 1.35, Math.round((st.rollAt - this.game.time) * 10) / 10)), rush: isRush(this.hour()) };
  }

  /** The party that follows the controlled character: Setu once found, and Jeetu (or Mithi, when you are Jeetu). */
  members() {
    const g = this.game, out = [];
    if (g.setu?.following && g.setu.follower) out.push({ id: 'setu', name: 'Setu', f: g.setu.follower, pos: g.setu.pos });
    const P = g.party;
    if (P?.jeetu) {
      const b = P.active === 'mithi' ? P.jeetu : P.bodies?.mithi;
      if (b?.follower?.enabled) out.push({ id: P.active === 'mithi' ? 'jeetu' : 'mithi', name: P.active === 'mithi' ? 'Jeetu' : 'Mithi', f: b.follower, pos: b.pos });
    }
    return out;
  }

  /** Who is close enough to the car to ride with Mithi (within 6 m on this floor). */
  _near(l) {
    const [cx, cz] = l.center, out = [];
    for (const m of this.members()) {
      const p = m.pos; if (!p || m.f.hold) continue;
      const d = Math.hypot(p.x - cx, p.z - cz);
      if (d < 7 && Math.abs(p.y - l.y) < 2.5) out.push({ ...m, d });
    }
    return out.sort((a, b) => a.d - b.d);
  }

  plan(l) {
    const free = l.seats - l.crowd;
    if (free < 1) return { ok: false, full: true, free: 0, board: [], left: [] };
    const near = this._near(l), room = Math.max(0, free - 1);
    return { ok: true, full: false, free, board: near.slice(0, room), left: near.slice(room) };
  }

  /** Mithi pressed a floor: if the car cannot take everybody, say so, and send the car back for the rest after it has set her down. */
  depart(l, plan, fromId, toId) {
    const g = this.game, left = plan?.left ?? [];
    if (!left.length) return;
    const st = l.stopById(fromId), v = DIRS[st.exit] ?? [0, 1], [cx, cz] = l.center, [w, d] = l.size;
    left.forEach((m, i) => {
      const lat = (i - (left.length - 1) / 2) * 1.2, px = cx + v[0] * (w / 2 + 1.8) + (v[0] ? 0 : lat), pz = cz + v[1] * (d / 2 + 1.8) + (v[1] ? 0 : lat);
      const a = m.f.actor.pos, gh = g.physics.groundHeightAt(px, pz, st.y + 0.5, 0.6, 0.3);
      if (Math.hypot(a.x - cx, a.z - cz) < Math.max(w, d) / 2 + 0.6) { a.x = px; a.z = pz; if (gh > -Infinity) a.y = gh; m.f.vy = 0; m.f.ground = null; m.f.onGround = false; }
      m.f.hold = { lift: l.id };
      this.jobs.push({ m, lift: l, from: fromId, to: toId, phase: 'wait', t: 0, retry: 0, lobby: { x: px, z: pz } });
    });
    g.events.emit('capsule:left', { id: l.id, who: left.map((m) => m.id) });
  }

  update(dt, game) {
    // the strangers in the public cars turn over every cycle, and whenever a car has just arrived and sat a moment
    for (const l of this.cars) {
      const st = this.st.get(l.id);
      if (l.seats >= 12 && game.time >= st.rollAt && !l.moving) this._roll(l);
    }
    for (let i = this.jobs.length - 1; i >= 0; i--) if (this._job(this.jobs[i], dt)) this.jobs.splice(i, 1);
  }

  _release(j, how) {
    const m = j.m;
    m.f.hold = null;
    if (how === 'teleport') m.f.teleportBehind('lift');
    else m.f.reset();
    this.game.events.emit('capsule:rejoined', { id: j.lift.id, who: m.id, how });
  }

  /** One follower's trip: wait for the car to come back, step in, ride, step out. Returns true when done. */
  _job(j, dt) {
    const g = this.game, l = j.lift, a = j.m.f.actor.pos, p = g.player.pos;
    j.t += dt;
    if (j.m.f.hold) j.m.f.hold.walking = j.phase === 'board' || j.phase === 'exit';
    if (j.t > 70 || Math.hypot(p.x - a.x, p.z - a.z) > 90 || !j.m.f.hold) { this._release(j, 'teleport'); return true; }
    const [cx, cz] = l.center, stF = l.stopById(j.from), stT = l.stopById(j.to);
    const go = (tx, tz, sp) => { const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz), s = Math.min(d, sp * dt); if (d > 1e-3) { a.x += dx / d * s; a.z += dz / d * s; j.m.f.actor.yaw = Math.atan2(-dx, -dz); } return d - s; };
    switch (j.phase) {
      case 'wait': {                                   // the car is away with Mithi: when it has settled at her floor, send it back for them
        const lead = this.jobs.find((q) => q !== j && q.lift === l && (q.phase === 'call' || q.phase === 'board'));
        if (lead) { j.phase = lead.phase; break; }          // the car is already coming for the other one: wait for it with them
        const [w, d] = l.size, onCar = Math.abs(p.x - cx) < w / 2 + 0.4 && Math.abs(p.z - cz) < d / 2 + 0.4 && Math.abs(p.y - l.y) < 1.8;
        j.arrived = (l.stop() === j.to && !onCar) ? (j.arrived ?? 0) + dt : 0;      // (never while she is still standing on the car: she would be carried back down)
        if (l.stop() === j.to && j.arrived > l.dwell * 0.6 + 1.0) {
          j.retry -= dt;
          if (j.retry <= 0) { const r = l.ride(j.from, { call: true }); if (r.ok) { for (const q of this.jobs) if (q.lift === l && q.phase === 'wait') q.phase = 'call'; } else j.retry = 3; }
        }
        j.m.f.speed = 0; break;
      }
      case 'call': if (!l.moving && l.stop() === j.from) { j.phase = 'board'; j.arrived = 0; } j.m.f.speed = 0; break;
      case 'board': {                                  // step in (the car is open at their floor); it leaves when everybody who is waiting is aboard
        const v = DIRS[stF.exit] ?? [0, 1], slot = (j.m.id === 'setu' ? -0.5 : 0.5);
        const rest = go(cx - v[1] * slot * 0.6, cz + v[0] * slot * 0.6, 2.6); j.m.f.speed = 2.6; j.ready = rest < 0.3;
        const group = this.jobs.filter((q) => q.lift === l && q.phase === 'board');
        if (l.stop() === j.from && group.every((q) => q.ready)) {
          j.retry -= dt;
          if (j.retry <= 0) { const r = l.ride(j.to); if (r.ok) { for (const q of group) q.phase = 'ride'; } else j.retry = 3; }
        }
        break;
      }
      case 'ride': j.m.f.speed = 0; if (!l.moving && l.stop() === j.to) { j.phase = 'exit'; } break;
      case 'exit': {
        const v = DIRS[stT.exit] ?? [0, 1], [w, d] = l.size, tx = cx + v[0] * (w / 2 + 1.6), tz = cz + v[1] * (d / 2 + 1.6);
        const rest = go(tx, tz, 2.6); j.m.f.speed = 2.6;
        if (rest < 0.3 || j.t > 60) { this._release(j, 'arrived'); return true; }
        break;
      }
      default: break;
    }
    return false;
  }

  // ------------------------------------------------------------------ the vehicle in a freight car
  /** The vehicles standing in the freight cars near the camera, shaped like the crowd's own vehicles (the crowd draws them with the traffic). */
  cargo(cp, maxD2) {
    const out = this._cargo ?? (this._cargo = []); out.length = 0;
    const crowds = this.game.crowds;
    if (!crowds?.vm) return out;
    for (const l of this.cars) {
      const st = this.st.get(l.id);
      if (!st.cargo) continue;
      const [cx, cz] = l.center, dx = cx - cp.x, dz = cz - cp.z;
      if (dx * dx + dz * dz > maxD2) continue;
      const def = crowds.vm[st.cargo.type]?.def; if (!def) continue;
      const alongX = l.size[0] >= l.size[1];
      let v = st.cargoObj;
      if (!v || v.type !== st.cargo.type) v = st.cargoObj = { type: st.cargo.type, len: def.len, width: def.width, tint: def.tints[Math.floor(st.cargo.k * def.tints.length) % def.tints.length], _L: null };
      v._L = alongX ? { ux: 1, uz: 0, px: 0, pz: 1 } : { ux: 0, uz: 1, px: -1, pz: 0 };
      v.x = cx; v.y = l.y + 0.05; v.z = cz;
      out.push(v);
    }
    return out;
  }

  // ------------------------------------------------------------------ the strangers in the car
  /** Look-agents for the crowd's draw: n strangers standing in each public car near the camera. */
  riders(cp, maxD2) {
    const out = this._out ?? (this._out = []); out.length = 0;
    const crowds = this.game.crowds;
    if (!crowds?.look) return out;
    for (const l of this.cars) {
      if (l.crowd < 1) continue;
      const [cx, cz] = l.center, dx = cx - cp.x, dz = cz - cp.z;
      if (dx * dx + dz * dz > maxD2) continue;
      const st = this.st.get(l.id);
      if (!st.looks) st.looks = [];
      const [w, d] = l.size, cols = Math.max(1, Math.floor((w - 0.5) / 0.85)), rows = Math.max(1, Math.floor((d - 0.5) / 0.85)), cargo = st.cargo;
      let shown = 0;
      for (let i = 0; i < Math.min(l.crowd, cols * rows, 28) && shown < (cargo ? 5 : 28); i++) {
        let a = st.looks[i];
        if (!a) {
          a = { woman: this.rng.next() < 0.4, phase: this.rng.next() * 6, amp: 0.03, level: 'G', mode: 'rider', pose: 0, talk: this.rng.next() < 0.1, jx: (this.rng.next() - 0.5) * 0.25, jz: (this.rng.next() - 0.5) * 0.25, yawJ: this.rng.next() * 6.28 };
          crowds.look(a, { woman: a.woman, umbrella: 0 });
          st.looks[i] = a;
        }
        const c = i % cols, r = Math.floor(i / cols);
        a.x = cx + (c - (cols - 1) / 2) * (w - 0.6) / Math.max(1, cols) * (cols > 1 ? 1 : 0) + a.jx; a.z = cz + (r - (rows - 1) / 2) * (d - 0.6) / Math.max(1, rows) + a.jz; a.y = l.y; a.yaw = a.yawJ;
        a.cap = l;
        if (cargo) { const along = w >= d ? a.x - cx : a.z - cz, half = (w >= d ? w : d) / 2; if (Math.abs(along) < half - 1.0) continue; }     // the vehicle takes the middle of a freight car
        shown++;
        out.push(a);
      }
    }
    return out;
  }
}
