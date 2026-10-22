// Low-poly hazard models: a feral dog (body + one leg, legs are separate instances so they can swing), the police
// drone, the camera head, and `Crowd`, which draws many people with 5 InstancedMesh draw calls in total (built from
// the Phase 3 character parts, so guards and deranged wanderers look like the rest of the cast).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Character } from '../../characters/humanoid.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

/** Tiny geometry assembler: primitives positioned/rotated, flat vertex colours, merged to one non-indexed geometry. */
export class Parts {
  constructor() { this.list = []; }
  _add(g, x, y, z, color, o = {}) {
    _e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
    _q.setFromEuler(_e); _v.set(x, y, z); _s.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    _m.compose(_v, _q, _s);
    g = g.index ? g.toNonIndexed() : g;
    g.applyMatrix4(_m); g.deleteAttribute('uv');
    const n = g.attributes.position.count, c = new THREE.Color(color), a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    g.computeVertexNormals();
    this.list.push(g);
    return this;
  }
  box(w, h, d, x, y, z, color, o) { return this._add(new THREE.BoxGeometry(w, h, d), x, y, z, color, o); }
  cyl(rt, rb, h, x, y, z, color, o = {}) { return this._add(new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 6, 1), x, y, z, color, o); }
  ball(r, x, y, z, color, o = {}) { return this._add(new THREE.IcosahedronGeometry(r, o.detail ?? 0), x, y, z, color, o); }
  build() { const g = mergeGeometries(this.list, false); this.list.forEach((x) => x.dispose()); g.computeBoundingSphere(); return g; }
}

// ------------------------------------------------------------------------------------------ dog
export const DOG = Object.freeze({ hipY: 0.40, frontZ: -0.27, backZ: 0.27, sideX: 0.095, legLen: 0.40, length: 1.25 });

/** The dog without legs. Faces -Z, feet at y = 0 (the legs are drawn separately, hanging from y = hipY). */
export function dogBodyGeometry() {
  const P = new Parts(), fur = 0xc9b9a0, dark = 0x70645a, snout = 0x3a322c;
  P.box(0.30, 0.27, 0.58, 0, 0.51, 0.03, fur);                           // torso
  P.box(0.33, 0.31, 0.26, 0, 0.52, -0.20, fur);                          // chest
  P.box(0.27, 0.25, 0.22, 0, 0.50, 0.30, dark);                          // rump
  P.box(0.15, 0.23, 0.14, 0, 0.63, -0.37, fur, { rx: 0.4 });             // neck
  P.box(0.19, 0.17, 0.20, 0, 0.71, -0.49, fur);                          // head
  P.box(0.105, 0.085, 0.17, 0, 0.675, -0.63, snout);                     // snout
  P.box(0.05, 0.035, 0.03, 0, 0.69, -0.72, 0x0a0a0a);                    // nose
  P.box(0.05, 0.11, 0.05, -0.065, 0.83, -0.46, dark, { rz: 0.25 });      // ears
  P.box(0.05, 0.11, 0.05, 0.065, 0.83, -0.46, dark, { rz: -0.25 });
  P.box(0.05, 0.05, 0.30, 0, 0.60, 0.50, dark, { rx: 0.9 });             // tail
  P.box(0.28, 0.06, 0.40, 0, 0.64, -0.02, dark);                         // mangy back ridge
  return P.build();
}
export function dogLegGeometry() {
  const P = new Parts(), fur = 0xc9b9a0, dark = 0x70645a;
  P.box(0.085, 0.24, 0.095, 0, -0.12, 0, fur);
  P.box(0.065, 0.17, 0.065, 0, -0.30, 0.005, dark);
  P.box(0.075, 0.04, 0.11, 0, -0.38, -0.02, 0x2a2420);
  return P.build();
}

// ------------------------------------------------------------------------------------------ drone and camera
export function droneGeometry() {
  const P = new Parts(), hull = 0x3c4452, panel = 0x59626f, dark = 0x1b2028;
  P.ball(0.34, 0, 0, 0, hull, { sy: 0.52, detail: 1 });
  P.box(0.22, 0.05, 0.5, 0, 0.1, 0, panel);
  for (const a of [0.78, 2.36, 3.93, 5.5]) {
    const x = Math.cos(a) * 0.6, z = Math.sin(a) * 0.6;
    P.box(0.07, 0.05, 0.62, Math.cos(a) * 0.32, 0.03, Math.sin(a) * 0.32, hull, { ry: -a + Math.PI / 2 });
    P.cyl(0.26, 0.26, 0.025, x, 0.1, z, dark, { seg: 10 });
    P.cyl(0.04, 0.04, 0.1, x, 0.05, z, panel, { seg: 5 });
  }
  P.ball(0.14, 0, -0.2, -0.08, dark, { detail: 1 });                    // camera pod
  P.box(0.5, 0.05, 0.05, 0, -0.14, 0.18, panel);                        // sensor bar
  return P.build();
}
export function cameraGeometry() {
  const P = new Parts(), body = 0x3a424e, dark = 0x14181e;
  P.box(0.16, 0.34, 0.1, 0, 0, 0.38, 0x2c323a);                          // wall bracket (behind the pivot: +Z)
  P.box(0.1, 0.1, 0.34, 0, -0.04, 0.18, 0x2c323a);
  P.box(0.3, 0.26, 0.5, 0, 0, -0.08, body);                              // housing
  P.box(0.34, 0.05, 0.54, 0, 0.15, -0.08, 0x252b33);                     // sun visor
  P.cyl(0.1, 0.1, 0.08, 0, -0.01, -0.36, dark, { rx: Math.PI / 2, seg: 8 });   // lens
  return P.build();
}

// ------------------------------------------------------------------------------------------ crowd (instanced people)
/**
 * Draw up to `cap` people from one Character spec with 5 InstancedMesh draw calls (body, two arms, two legs).
 *   crowd.begin(); crowd.set({x,y,z,yaw, speed, phase, lean, armUp, armSwing, scale, tilt}); crowd.end();
 * Poses are procedural: `phase` is the walk-cycle angle, `speed` scales the swing, `armUp` raises both arms (a grab),
 * `lean` pitches the body (negative = forward, like Character.update).
 */
export class Crowd {
  constructor(game, spec, cap, material) {
    this.game = game; this.cap = cap; this.n = 0;
    const ch = new Character(spec, game), s = ch.sets.default, d = ch.dims;
    this.dims = d;
    const mat = material ?? ch.mat;
    const mk = (geo, name) => {
      const m = new THREE.InstancedMesh(geo, mat, cap);
      m.frustumCulled = false; m.count = 0; m.visible = false; m.name = `crowd-${spec.name}-${name}`;
      game.scene.add(m); return m;
    };
    this.meshes = { body: mk(s.body, 'body'), armL: mk(s.armL, 'armL'), armR: mk(s.armR, 'armR'), legL: mk(s.legL, 'legL'), legR: mk(s.legR, 'legR') };
    this.pivot = {
      armL: [-d.sw * 1.02, d.shoulderY - 0.02, 0], armR: [d.sw * 1.02, d.shoulderY - 0.02, 0],
      legL: [-d.hipW * 0.55, d.hipY, 0], legR: [d.hipW * 0.55, d.hipY, 0],
    };
    this.base = new THREE.Matrix4(); this.rig = new THREE.Matrix4(); this.loc = new THREE.Matrix4(); this.out = new THREE.Matrix4();
  }

  begin() { this.n = 0; }

  set(o) {
    if (this.n >= this.cap) return;
    const i = this.n++, M = this.meshes, d = this.dims;
    const sc = o.scale ?? 1, lean = o.lean ?? 0, sp = Math.min(o.speed ?? 0, 9), ph = o.phase ?? 0;
    _v.set(o.x, o.y, o.z); _e.set(lean, o.yaw ?? 0, 0, 'YXZ'); _q.setFromEuler(_e); _s.set(sc, sc, sc);
    this.base.compose(_v, _q, _s);
    const swing = Math.min(0.7, 0.19 * sp), arm = swing * 0.8 * (o.armSwing ?? 1), sw = Math.sin(ph);
    const bob = sp > 0.3 ? Math.abs(Math.sin(ph)) * 0.02 * d.H : 0;
    // body
    this.loc.makeTranslation(0, bob, 0); this.out.multiplyMatrices(this.base, this.loc); M.body.setMatrixAt(i, this.out);
    // arms: hang and swing, or lift forward for a grab
    for (const side of ['armL', 'armR']) {
      const k = side === 'armL' ? 1 : -1, p = this.pivot[side];
      const up = (side === 'armL' ? o.armUpL : o.armUpR) ?? o.armUp ?? 0;
      const rx = up * 1.35 + (1 - up) * (-k * sw * arm) + (o.armDrop ?? 0), rz = (side === 'armL' ? -1 : 1) * (0.05 + up * 0.18);
      _e.set(rx, 0, rz, 'YXZ'); _q.setFromEuler(_e); _v.set(p[0], p[1] + bob, p[2]); _s.set(1, 1, 1);
      this.loc.compose(_v, _q, _s); this.out.multiplyMatrices(this.base, this.loc); M[side].setMatrixAt(i, this.out);
    }
    for (const side of ['legL', 'legR']) {
      const k = side === 'legL' ? 1 : -1, p = this.pivot[side];
      _e.set(k * sw * swing, 0, 0, 'YXZ'); _q.setFromEuler(_e); _v.set(p[0], p[1], p[2]); _s.set(1, 1, 1);
      this.loc.compose(_v, _q, _s); this.out.multiplyMatrices(this.base, this.loc); M[side].setMatrixAt(i, this.out);
    }
  }

  end() {
    for (const m of Object.values(this.meshes)) { m.count = this.n; m.visible = this.n > 0; if (this.n) m.instanceMatrix.needsUpdate = true; }
  }
}
