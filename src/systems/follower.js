// Reusable follower AI (Setu now, Jeetu in Phase 6, Tab-switching later). Not a system: create one per
// follower and call `update(dt)` from the owner's update.
//
//   const f = new Follower(game, actor, target, opts);
//     actor  : { pos:{x,y,z}, yaw }              the body being moved (Follower writes pos/yaw and `speed`, `onGround`)
//     target : { pos:{x,y,z} }                    usually game.player (feet position)
//     opts   : { speed:4.2, maxSpeed:7.4, followDist:1.9, teleportDist:25, stuckSeconds:4, climbMax:4,
//                radius, canTeleport:(f)=>bool, label:'setu' }
//   f.update(dt)      -> moves the actor toward the target along the target's breadcrumb trail
//   f.reset()         -> forget the trail progress (after a manual teleport of the actor)
//   f.teleportBehind()-> put the actor about 3.5 m behind the target on its trail (also used when stuck)
//   f.state           'idle' | 'walk' | 'stuck' ; f.speed (m/s, for animation) ; f.teleports (count)
//   events: 'follower:teleport' {label, reason, x, y, z}
//
// How it works. The target drops a breadcrumb every ~0.6 m (shared per target, see Trail.for). The
// follower walks to the oldest crumb it has not reached, skipping ahead to any later crumb it can see
// (two ray casts at knee and waist height), so it takes corners and stairs the way the target did, and
// stands on lifts the target rode (it is carried by dynamic platforms like the player). It slows to a
// stop within `followDist` of the target and sprints up to `maxSpeed` when left behind. It teleports to
// a crumb about 3.5 m behind the target when more than `teleportDist` metres away, when stuck for
// `stuckSeconds` (a closed door, a gap), when it is more than `climbMax` metres above/below the
// target and not catching up (the target took a lift), or when it falls out of the world.
import { PLAYER } from '../core/physics.js';

const GRAVITY = 22;
const _o = { x: 0, y: 0, z: 0 }, _d = { x: 0, y: 0, z: 0 };

export class Trail {
  static for(game, target) {
    if (!game._trails) game._trails = new WeakMap();
    let t = game._trails.get(target);
    if (!t) { t = new Trail(game, target); game._trails.set(target, t); }
    return t;
  }

  constructor(game, target, { spacing = 0.6, max = 90 } = {}) {
    this.game = game; this.target = target; this.spacing = spacing; this.max = max;
    this.crumbs = []; this.nextId = 1; this._frame = -1;
    this.push(true);
  }

  push(force = false) {
    const p = this.target.pos, last = this.crumbs[this.crumbs.length - 1];
    if (!force && last) {
      const d = Math.hypot(p.x - last.x, p.z - last.z);
      if (d < this.spacing && Math.abs(p.y - last.y) < 0.25) return;
      // jumping/falling would litter the trail with mid-air points: only record when grounded (or far from the last one)
      if (this.target.onGround === false && d < 3) return;
    }
    // the target jumped (debug teleport, respawn, a long fall): the old trail leads nowhere, start a new one
    if (last && Math.hypot(p.x - last.x, p.y - last.y, p.z - last.z) > 8) this.crumbs.length = 0;
    this.crumbs.push({ id: this.nextId++, x: p.x, y: p.y, z: p.z });
    if (this.crumbs.length > this.max) this.crumbs.shift();
  }

  /** Call once per simulation step (idempotent within a step). */
  update() {
    if (this._frame === this.game.frame) return;
    this._frame = this.game.frame;
    this.push();
  }

  /** The crumb whose path distance behind the target is at least `dist` (falls back to the oldest). */
  behind(dist) {
    let acc = 0;
    if (!this.crumbs.length) this.push(true);
    for (let i = this.crumbs.length - 1; i > 0; i--) {
      const a = this.crumbs[i], b = this.crumbs[i - 1];
      acc += Math.hypot(a.x - b.x, a.z - b.z);
      if (acc >= dist) return b;
    }
    return this.crumbs[0];
  }
}

export class Follower {
  constructor(game, actor, target, opts = {}) {
    this.game = game; this.actor = actor; this.target = target;
    this.o = { speed: 4.2, maxSpeed: 7.4, followDist: 1.9, teleportDist: 25, stuckSeconds: 4, climbMax: 4, label: 'follower', ...opts };
    this.trail = Trail.for(game, target);
    this.state = 'idle'; this.speed = 0; this.teleports = 0;
    this.vy = 0; this.onGround = true; this.ground = null;
    this.lastId = 0; this._skipT = 0; this._stuck = 0; this._ref = { x: actor.pos.x, z: actor.pos.z }; this._refT = 0; this._vert = 0;
    this._gpos = { x: 0, y: 0, z: 0 };
    this.enabled = true;
    this.lastTeleport = null;
  }

  reset() {
    this.lastId = this.trail.crumbs.length ? this.trail.crumbs[this.trail.crumbs.length - 1].id - 3 : 0;
    this.vy = 0; this._stuck = 0; this._vert = 0; this.ground = null;
    this._ref.x = this.actor.pos.x; this._ref.z = this.actor.pos.z; this._refT = 0;
  }

  teleportBehind(reason = 'manual') {
    const c = this.trail.behind(3.5), a = this.actor.pos, tp = this.target.pos;
    let x = c.x, y = c.y, z = c.z;
    if (Math.hypot(x - tp.x, z - tp.z) < 1.4) {          // the trail was just reset: stand a little behind the target instead
      const yaw = this.target.yaw ?? 0;
      search: for (const r of [1.9, 1.4, 1.0]) {
        for (const ang of [Math.PI, Math.PI * 0.75, -Math.PI * 0.75, Math.PI * 0.5, -Math.PI * 0.5, 0, Math.PI * 0.25, -Math.PI * 0.25]) {
          const px = tp.x - Math.sin(yaw + ang) * r, pz = tp.z - Math.cos(yaw + ang) * r;
          const gh = this.game.physics.groundHeightAt(px, pz, tp.y, 0.6);
          if (gh > -Infinity && Math.abs(gh - tp.y) < 0.7 && this._clear(tp.x, tp.y + 1, tp.z, px, gh + 1, pz)) { x = px; y = gh; z = pz; break search; }
        }
      }
    }
    a.x = x; a.y = y + 0.02; a.z = z;
    this.vy = 0; this.ground = null; this.onGround = false; this._stuck = 0; this._vert = 0;
    this.lastId = c.id; this._ref.x = a.x; this._ref.z = a.z; this._refT = 0;
    this.teleports++;
    this.lastTeleport = { reason, t: this.game.time };
    this.game.events.emit('follower:teleport', { label: this.o.label, reason, x: a.x, y: a.y, z: a.z });
  }

  _clear(x0, y0, z0, x1, y1, z1) {
    const dx = x1 - x0, dy = y1 - y0, dz = z1 - z0, len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return true;
    _o.x = x0; _o.y = y0; _o.z = z0; _d.x = dx / len; _d.y = dy / len; _d.z = dz / len;
    const hit = this.game.physics.raycast(_o, _d, len, (c) => c.solid);
    return !hit;
  }

  update(dt) {
    if (!this.enabled) return;
    const g = this.game, w = g.physics, a = this.actor.pos, tp = this.target.pos, o = this.o;
    this.trail.update();

    // ---- carried by a dynamic platform (lifts)
    if (this.onGround && this.ground && this.ground.dynamic && this.ground.enabled) {
      const gp = this.ground.pos, q = this._gpos;
      const cx = gp.x - q.x, cy = gp.y - q.y, cz = gp.z - q.z;
      if (cx || cz) w.slideMove(a, cx, cz, a.y, PLAYER.stepHeight);
      a.y += cy; q.x = gp.x; q.y = gp.y; q.z = gp.z;
    }

    const dx = tp.x - a.x, dz = tp.z - a.z, dist = Math.hypot(dx, dz), dy = tp.y - a.y;
    const held = !!this.hold;     // Phase 9A: waiting for the next capsule (src/systems/lifts/capacity.js): stands still, falls and is carried like anybody, never teleports

    // ---- teleport rules
    const can = !held && (!o.canTeleport || o.canTeleport(this));
    if (can) {
      if (dist > o.teleportDist) return this.teleportBehind('far');
      if (a.y < w.killY + 5) return this.teleportBehind('fell');
      if (Math.abs(dy) > o.climbMax) { this._vert += dt; if (this._vert > 1.6 && dist > 3) return this.teleportBehind('other-level'); } else this._vert = 0;
    }

    // ---- choose a goal: the oldest unreached crumb, skipping ahead to any crumb in clear sight
    const cr = this.trail.crumbs;
    let gx = tp.x, gy = tp.y, gz = tp.z, chasing = false;
    if (dist > o.followDist || Math.abs(dy) > 1.5) {
      let i = 0;
      while (i < cr.length && cr[i].id <= this.lastId) i++;
      if (i < cr.length) {
        this._skipT -= dt;
        if (this._skipT <= 0) {
          this._skipT = 0.2;
          for (let j = cr.length - 1; j > i && j > cr.length - 14; j--) {
            const c = cr[j];
            if (Math.abs(c.y - a.y) > 0.9 || Math.hypot(c.x - a.x, c.z - a.z) > 9) continue;
            if (this._clear(a.x, a.y + 0.45, a.z, c.x, c.y + 0.45, c.z) && this._clear(a.x, a.y + 1.0, a.z, c.x, c.y + 1.0, c.z)) { i = j; break; }
          }
        }
        gx = cr[i].x; gy = cr[i].y; gz = cr[i].z; chasing = true;
        if (Math.hypot(gx - a.x, gz - a.z) < 0.6 && Math.abs(gy - a.y) < 1.5) this.lastId = cr[i].id;
      }
    }

    // ---- steer
    const hx = gx - a.x, hz = gz - a.z, hd = Math.hypot(hx, hz);
    const stopped = held || (!chasing && dist <= o.followDist);
    let sp = 0;
    if (!stopped && hd > 0.05) {
      sp = Math.min(o.maxSpeed, o.speed + Math.max(0, dist - 6) * 0.5);
      if (dist < o.followDist + 1.5 && !chasing) sp *= 0.6;
      sp = Math.min(sp, hd / dt);
      w.slideMove(a, (hx / hd) * sp * dt, (hz / hd) * sp * dt, a.y, this.onGround ? PLAYER.stepHeight : PLAYER.airStep);
      const want = Math.atan2(-hx, -hz);
      this.actor.yaw = turnToward(this.actor.yaw ?? want, want, 10 * dt);
    } else if (dist > 0.3 && !(held && this.hold.walking)) {
      this.actor.yaw = turnToward(this.actor.yaw ?? 0, Math.atan2(-dx, -dz), 6 * dt);     // face Mithi while waiting
    }

    // ---- vertical: glued to the ground, falling otherwise
    const step = this.onGround ? PLAYER.stepHeight : PLAYER.airStep;
    const gh = w.groundHeightAt(a.x, a.z, a.y, step);
    const gc = w.groundCollider;
    this.vy = Math.max(-40, this.vy - GRAVITY * dt);
    const ny = a.y + this.vy * dt;
    if (gh > -Infinity && ny <= gh + 1e-6) {
      a.y = gh; this.vy = 0; this.onGround = true; this.ground = gc;
      if (gc && gc.dynamic) { const p = gc.pos; this._gpos.x = p.x; this._gpos.y = p.y; this._gpos.z = p.z; }
    } else if (this.onGround && gh > -Infinity && a.y - gh <= PLAYER.stepHeight) {
      a.y = gh; this.vy = 0; this.ground = gc;
      if (gc && gc.dynamic) { const p = gc.pos; this._gpos.x = p.x; this._gpos.y = p.y; this._gpos.z = p.z; }
    } else { a.y = ny; this.onGround = false; this.ground = null; }

    // ---- bookkeeping: animation speed and stuck detection
    this.speed += ((held && this.hold.walking ? 2.6 : sp) - this.speed) * Math.min(1, dt * 12);
    this.state = stopped ? 'idle' : sp > 0 ? 'walk' : 'idle';
    if (!stopped) {
      this._refT += dt;
      if (this._refT >= 0.5) {
        const moved = Math.hypot(a.x - this._ref.x, a.z - this._ref.z);
        this._stuck = moved < 0.25 ? this._stuck + this._refT : 0;
        this._ref.x = a.x; this._ref.z = a.z; this._refT = 0;
      }
      if (this._stuck > 1.0) this.state = 'stuck';
      if (can && this._stuck >= o.stuckSeconds) this.teleportBehind('stuck');
    } else { this._stuck = 0; this._refT = 0; this._ref.x = a.x; this._ref.z = a.z; }
  }
}

export function turnToward(cur, want, maxStep) {
  let d = want - cur;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return cur + Math.max(-maxStep, Math.min(maxStep, d));
}
