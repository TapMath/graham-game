// Turns world description calls into merged meshes + physics colliders.
//
//   const b = new Builder(game);
//   b.box([x0,y0,z0], [x1,y1,z1], { color, mat:'lit', solid:true, walkable:true, visual:true, tag });
//   b.ramp({ x0,z0,x1,z1, dir:'-z', yLow, yHigh, bottom, color });
//   b.stairs({ x, z, y, dir:'-z', steps, rise, run, width, color });
//   const group = b.finish();          // merges per material, adds to game.scene
//
// Geometry is merged per material (one draw call each). Colliders are registered immediately
// in game.physics. Phase 2 extends this (instancing for repeated props); keep the call style.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TILE_METRES, WINDOW_TILE_METRES } from './materials.js';

const _c = new THREE.Color();

/** Non-indexed box with world-space-scaled UVs and a uniform vertex colour. */
export function makeBoxGeometry(min, max, color = 0x888888, mat = 'lit') {
  const g = new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]).toNonIndexed();
  g.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  return finishGeometry(g, color, mat);
}

/** Non-indexed wedge for a ramp. */
export function makeRampGeometry({ x0, z0, x1, z1, dir, yLow, yHigh, bottom }, color = 0x888888, mat = 'lit') {
  const axis = dir[1], sign = dir[0] === '-' ? -1 : 1;
  const [xa, xb] = [Math.min(x0, x1), Math.max(x0, x1)], [za, zb] = [Math.min(z0, z1), Math.max(z0, z1)];
  const bot = bottom ?? Math.min(yLow, yHigh);
  // u = along the ramp (low end -> high end), w = across.
  const uLo = axis === 'z' ? (sign > 0 ? za : zb) : (sign > 0 ? xa : xb);
  const uHi = axis === 'z' ? (sign > 0 ? zb : za) : (sign > 0 ? xb : xa);
  const wA = axis === 'z' ? xa : za, wB = axis === 'z' ? xb : zb;
  const P = (u, w, y) => (axis === 'z' ? [w, y, u] : [u, y, w]);
  const pos = [];
  const quad = (a, b, c, d, out) => {
    // wind so the face normal points along `out`
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    const flip = n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0;
    const t = flip ? [a, c, b, a, d, c] : [a, b, c, a, c, d];
    for (const v of t) pos.push(v[0], v[1], v[2]);
  };
  const uDir = (axis === 'z' ? [0, 0, 1] : [1, 0, 0]).map((v) => v * (uHi >= uLo ? 1 : -1));
  const wDir = axis === 'z' ? [1, 0, 0] : [0, 0, 1];
  const neg = (v) => v.map((x) => -x);
  const lowTop = P(uLo, wA, yLow), lowTop2 = P(uLo, wB, yLow), hiTop = P(uHi, wA, yHigh), hiTop2 = P(uHi, wB, yHigh);
  quad(lowTop, lowTop2, hiTop2, hiTop, [0, 1, 0]);                                      // surface
  quad(P(uLo, wA, bot), P(uLo, wB, bot), P(uHi, wB, bot), P(uHi, wA, bot), [0, -1, 0]); // underside
  quad(hiTop, hiTop2, P(uHi, wB, bot), P(uHi, wA, bot), uDir);                          // high end wall
  if (yLow > bot + 1e-6) quad(lowTop, lowTop2, P(uLo, wB, bot), P(uLo, wA, bot), neg(uDir)); // low end wall
  quad(lowTop, hiTop, P(uHi, wA, bot), P(uLo, wA, bot), neg(wDir));                     // side A
  quad(lowTop2, hiTop2, P(uHi, wB, bot), P(uLo, wB, bot), wDir);                        // side B
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return finishGeometry(g, color, mat);
}

function finishGeometry(g, color, mat) {
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2), col = new Float32Array(p.count * 3);
  const scale = mat === 'building' ? 1 / WINDOW_TILE_METRES : 1 / TILE_METRES;
  _c.set(color);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    if (mat === 'building' && ay > 0.5) { u = 0; v = 0; } // roofs: no windows
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
    col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b;
  }
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/** Slightly vary a colour per object so big flat areas are not dead uniform. Deterministic. */
export function tint(hex, amount, key) {
  _c.set(hex);
  const h = Math.sin(key * 12.9898 + 4.1) * 43758.5453; const r = h - Math.floor(h) - 0.5;
  _c.offsetHSL(0, 0, r * amount);
  return _c.getHex();
}

export class Builder {
  constructor(game) {
    this.game = game;
    this.world = game.physics;
    this.parts = { lit: [], emissive: [], building: [] };
    this.counter = 0;
  }

  /**
   * AABB. opts: color, mat ('lit'|'emissive'|'building'), solid, walkable, visual (false = collision
   * only), tag. Visual-only decoration: {solid:false, walkable:false}. Returns the collider or null.
   */
  box(min, max, opts = {}) {
    const { color = 0x6b7370, mat = 'lit', visual = true, solid = true, walkable = true, tag = '' } = opts;
    if (visual) this.parts[mat].push(makeBoxGeometry(min, max, tint(color, 0.06, ++this.counter), mat));
    if (!solid && !walkable) return null;
    return this.world.addBox(min, max, { solid, walkable, tag });
  }

  /** Box from centre + size. */
  boxC(c, s, opts) { return this.box([c[0] - s[0] / 2, c[1] - s[1] / 2, c[2] - s[2] / 2], [c[0] + s[0] / 2, c[1] + s[1] / 2, c[2] + s[2] / 2], opts); }

  /** Ramp, see PhysicsWorld.addRamp for the parameters. */
  ramp(r, opts = {}) {
    const { color = 0x8a7a55, mat = 'lit', tag = '' } = opts;
    this.parts[mat].push(makeRampGeometry(r, tint(color, 0.05, ++this.counter), mat));
    return this.world.addRamp(r, { tag });
  }

  /**
   * Staircase of box steps. (x,z) = centre of the low edge, y = floor height there, dir = '+x'|'-x'|'+z'|'-z'.
   * Step i spans [i*run, (i+1)*run] ahead and is (i+1)*rise tall. Returns {top, end:{x,z}}.
   */
  stairs({ x, z, y, dir, steps, rise = 0.3, run = 0.5, width = 4, bottom = y, color = 0x7d7468 }) {
    const axis = dir[1], s = dir[0] === '-' ? -1 : 1;
    for (let i = 0; i < steps; i++) {
      const a = i * run * s, b = (i + 1) * run * s;
      const lo = Math.min(a, b), hi = Math.max(a, b);
      const top = y + rise * (i + 1);
      const min = axis === 'z' ? [x - width / 2, bottom, z + lo] : [x + lo, bottom, z - width / 2];
      const max = axis === 'z' ? [x + width / 2, top, z + hi] : [x + hi, top, z + width / 2];
      this.box(min, max, { color: tint(color, 0.1, i), tag: 'stairs' });
    }
    return { top: y + rise * steps, end: axis === 'z' ? { x, z: z + steps * run * s } : { x: x + steps * run * s, z } };
  }

  /** Merge everything added so far (one mesh per material), add it to the scene, and reset. */
  finish(name = 'static') {
    const group = new THREE.Group(); group.name = name;
    for (const key of Object.keys(this.parts)) {
      const list = this.parts[key];
      if (!list.length) continue;
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, this.game.materials[key]);
      mesh.name = `${name}:${key}`;
      group.add(mesh);
      this.parts[key] = [];
    }
    this.game.scene.add(group);
    return group;
  }
}
