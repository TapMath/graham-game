// Moving platforms. A Lift owns a dynamic collider (carries the player, see Player.update) and a mesh.
//
//   const lift = game.lifts.add({ id:'lift-a', center:[x,z], size:[3,3], yBottom:0.1, yTop:4.8,
//                                 speed:2.5, dwell:3, auto:true });
//   lift.goTo('top') | lift.goTo('bottom') | lift.goTo(y) | lift.toggle()   // E-interaction calls toggle()
//
// `y` is the height of the walking surface. Events: lift:moving {id, target}, lift:arrived {id, y}.
// Optional `exits: { bottom:'-x', top:'+z' }` (sides of the car you walk on/off at each stop): the
// car then has thin door colliders on every named side that are closed while moving and on the
// stops' non-exit sides, so riders cannot step off mid-ride. Without `exits` the car is open.
// game.lifts is the LiftSystem; register it BEFORE the player so platforms move first.
import * as THREE from '../../vendor/three.module.js';
import { makeBoxGeometry } from './builder.js';
import { mergeGeometries } from '../../vendor/addons/utils/BufferGeometryUtils.js';

export class Lift {
  constructor(game, o) {
    this.game = game;
    this.id = o.id;
    this.center = o.center; this.size = o.size ?? [3, 3];
    this.yBottom = o.yBottom; this.yTop = o.yTop;
    this.speed = o.speed ?? 2.5;
    this.dwell = o.dwell ?? 3;
    this.auto = o.auto ?? false;
    this.thickness = o.thickness ?? 0.4;
    this.y = o.startAt === 'top' ? this.yTop : this.yBottom;
    this.target = this.y;
    this.timer = this.dwell;
    this.moving = false;
    this.exits = o.exits ?? null;
    this.doors = [];

    const [cx, cz] = this.center, [w, d] = this.size, t = this.thickness;
    // collider is created at surface height 0 and offset up to the current surface height
    this.collider = game.physics.addBox([cx - w / 2, -t, cz - d / 2], [cx + w / 2, 0, cz + d / 2], { dynamic: true, tag: 'lift', userData: this });
    game.physics.setOffset(this.collider, 0, this.y, 0);

    // visual: slab + glowing amber edge strips (origin at the surface centre so mesh.y = surface y)
    const slab = makeBoxGeometry([-w / 2, -t, -d / 2], [w / 2, 0, d / 2], 0x58606a);
    const strip = (a, b) => makeBoxGeometry(a, b, 0xffb347, 'emissive');
    const e = 0.12;
    this.mesh = new THREE.Group();
    this.mesh.add(new THREE.Mesh(slab, game.materials.lit));
    const strips = mergeGeometries([
      strip([-w / 2, 0.005, -d / 2], [w / 2, 0.03, -d / 2 + e]), strip([-w / 2, 0.005, d / 2 - e], [w / 2, 0.03, d / 2]),
      strip([-w / 2, 0.005, -d / 2 + e], [-w / 2 + e, 0.03, d / 2 - e]), strip([w / 2 - e, 0.005, -d / 2 + e], [w / 2, 0.03, d / 2 - e]),
    ], false);
    this.mesh.add(new THREE.Mesh(strips, game.materials.emissive));
    if (this.exits) this._makeDoors();
    this.mesh.position.set(cx, this.y, cz);
    game.scene.add(this.mesh);
  }

  /** Door colliders (dynamic, ride with the car) + a glowing bar for each side that can be an exit. */
  _makeDoors() {
    const [w, d] = this.size, h = 1.5, t = 0.16;
    const sides = [...new Set([this.exits.bottom, this.exits.top])];
    for (const side of sides) {
      const ax = side[1], sg = side[0] === '-' ? -1 : 1;
      const half = ax === 'x' ? w / 2 : d / 2, span = ax === 'x' ? d : w;
      const mn = ax === 'x' ? [sg * half - (sg > 0 ? t : 0), 0, -span / 2] : [-span / 2, 0, sg * half - (sg > 0 ? t : 0)];
      const mx = ax === 'x' ? [mn[0] + t, h, span / 2] : [span / 2, h, mn[2] + t];
      const door = this.game.physics.addBox([this.center[0] + mn[0], mn[1], this.center[1] + mn[2]],
        [this.center[0] + mx[0], mx[1], this.center[1] + mx[2]], { dynamic: true, walkable: false, tag: 'lift-door' });
      const bar = makeBoxGeometry(mn.map((v, i) => (i === 1 ? 1.1 : v)), mx.map((v, i) => (i === 1 ? 1.2 : v)), 0xffb347, 'emissive');
      const rail = makeBoxGeometry(mn.map((v, i) => (i === 1 ? 0.2 : v)), mx.map((v, i) => (i === 1 ? 0.3 : v)), 0xffb347, 'emissive');
      const m = new THREE.Mesh(mergeGeometries([bar, rail], false), this.game.materials.emissive);
      m.visible = false;
      this.mesh.add(m);
      this.doors.push({ side, collider: door, mesh: m });
    }
    this._syncDoors();
  }

  /** Which side is open right now (null while moving). */
  openSide() {
    if (!this.exits || this.moving) return null;
    if (Math.abs(this.y - this.yBottom) < 1e-3) return this.exits.bottom;
    if (Math.abs(this.y - this.yTop) < 1e-3) return this.exits.top;
    return null;
  }

  _syncDoors() {
    const open = this.openSide();
    for (const d of this.doors) {
      const closed = d.side !== open;
      d.collider.enabled = closed;
      d.mesh.visible = closed;
      this.game.physics.setOffset(d.collider, 0, this.y, 0);
    }
  }

  /** 'top' | 'bottom' | a surface height. */
  goTo(where) {
    const y = where === 'top' ? this.yTop : where === 'bottom' ? this.yBottom : where;
    this.target = Math.min(this.yTop, Math.max(this.yBottom, y));
    this.moving = Math.abs(this.target - this.y) > 1e-4;
    if (this.moving) { this.game.events.emit('lift:moving', { id: this.id, target: this.target }); if (this.doors.length) this._syncDoors(); }
  }

  toggle() { this.goTo(Math.abs(this.y - this.yTop) < Math.abs(this.y - this.yBottom) ? 'bottom' : 'top'); }

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
    }
  }

  /** 'top' | 'bottom' | null: which stop the car is parked at. */
  stop() {
    if (this.moving) return null;
    if (Math.abs(this.y - this.yBottom) < 1e-3) return 'bottom';
    if (Math.abs(this.y - this.yTop) < 1e-3) return 'top';
    return null;
  }

  snapshot() { return { id: this.id, y: +this.y.toFixed(3), target: +this.target.toFixed(3), moving: this.moving, stop: this.stop() }; }
}

export class LiftSystem {
  init(game) { this.game = game; this.lifts = []; }
  add(opts) { const l = new Lift(this.game, opts); this.lifts.push(l); return l; }
  get(id) { return this.lifts.find((l) => l.id === id); }
  update(dt) { for (const l of this.lifts) l.update(dt); }
}
