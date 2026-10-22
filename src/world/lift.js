// Moving platforms. A Lift owns a dynamic collider (carries the player, see Player.update) and a mesh.
//
//   const lift = game.lifts.add({ id:'lift-a', center:[x,z], size:[3,3], yBottom:0.1, yTop:4.8,
//                                 speed:2.5, dwell:3, auto:true });
//   lift.goTo('top') | lift.goTo('bottom') | lift.goTo(y) | lift.toggle()   // E-interaction calls toggle()
//
// `y` is the height of the walking surface. Events: lift:moving {id, target}, lift:arrived {id, y}.
// game.lifts is the LiftSystem; register it BEFORE the player so platforms move first.
import * as THREE from 'three';
import { makeBoxGeometry } from './builder.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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
    this.mesh.position.set(cx, this.y, cz);
    game.scene.add(this.mesh);
  }

  /** 'top' | 'bottom' | a surface height. */
  goTo(where) {
    const y = where === 'top' ? this.yTop : where === 'bottom' ? this.yBottom : where;
    this.target = Math.min(this.yTop, Math.max(this.yBottom, y));
    this.moving = Math.abs(this.target - this.y) > 1e-4;
    if (this.moving) this.game.events.emit('lift:moving', { id: this.id, target: this.target });
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
    } else if (this.auto) {
      this.timer -= dt;
      if (this.timer <= 0) this.toggle();
    }
  }

  snapshot() { return { id: this.id, y: +this.y.toFixed(3), target: +this.target.toFixed(3), moving: this.moving }; }
}

export class LiftSystem {
  init(game) { this.game = game; this.lifts = []; }
  add(opts) { const l = new Lift(this.game, opts); this.lifts.push(l); return l; }
  get(id) { return this.lifts.find((l) => l.id === id); }
  update(dt) { for (const l of this.lifts) l.update(dt); }
}
