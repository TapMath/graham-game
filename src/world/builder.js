// Turns world description calls into merged meshes + physics colliders.
//
//   const b = new Builder(game, { shade: true, chunk: 96 });
//   b.box([x0,y0,z0], [x1,y1,z1], { color, mat:'lit', solid:true, walkable:true, visual:true, tag });
//   b.ramp({ x0,z0,x1,z1, dir:'-z', yLow, yHigh, bottom, color });
//   b.stairs({ x, z, y, dir:'-z', steps, rise, run, width, color, hollow:0.7 });
//   b.geometry(threeGeometry, { color, mat, matrix })       // arbitrary visual-only geometry (rotated bits, cylinders)
//   b.kind('pillar', geometry, 'lit'); b.instance('pillar', { x, y, z, yaw, sx, sy, sz, color })  // InstancedMesh props
//   const group = b.finish();          // merges per material (+ per spatial chunk), adds to game.scene
//
// Geometry is merged per material and per spatial chunk (so frustum culling still works for a big
// city; `chunk` is the chunk edge in metres, Infinity = one mesh per material like the arena).
// Colliders are registered immediately in game.physics.
// `shade:true` bakes a height-dependent tint into the vertex colours: dark teal gloom low down,
// warm ochre up high (the deck's look), so the world needs no per-level lighting.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TILE_METRES, WINDOW_TILE_METRES } from './materials.js';

const _c = new THREE.Color();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const _lowTint = new THREE.Color(0.72, 1.0, 0.96), _highTint = new THREE.Color(1.18, 0.97, 0.72);

const clamp01 = (t) => Math.max(0, Math.min(1, t));
const smooth = (t) => t * t * (3 - 2 * t);

/** Brightness + hue multiplier for a surface at height y (see PLAN section 3 lighting notes). */
export function shadeAt(y, out = new THREE.Color()) {
  const t = smooth(clamp01((y + 2) / 44));
  const b = y < -2 ? 0.3 + 0.1 * clamp01((y + 10) / 8) : 0.46 + 0.54 * t;
  const k = Math.pow(t, 0.8);
  out.r = b * (_lowTint.r + (_highTint.r - _lowTint.r) * k);
  out.g = b * (_lowTint.g + (_highTint.g - _lowTint.g) * k);
  out.b = b * (_lowTint.b + (_highTint.b - _lowTint.b) * k);
  return out;
}

/** Non-indexed box with world-space-scaled UVs and a uniform vertex colour. */
export function makeBoxGeometry(min, max, color = 0x888888, mat = 'lit', opts) {
  const g = new THREE.BoxGeometry(max[0] - min[0], max[1] - min[1], max[2] - min[2]).toNonIndexed();
  g.translate((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
  return finishGeometry(g, color, mat, opts);
}

/** Non-indexed wedge for a ramp. */
export function makeRampGeometry({ x0, z0, x1, z1, dir, yLow, yHigh, bottom }, color = 0x888888, mat = 'lit', opts) {
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
  return finishGeometry(g, color, mat, opts);
}

/**
 * A box sheared along its length so its top/bottom follow a slope: used for stair balustrades.
 * axis 'x'|'z' = the length axis, u0..u1 = extent along it, yTop0/yTop1 = top height at each end,
 * thick = vertical thickness, w0..w1 = extent across.
 */
export function makeShearedBox({ axis, u0, u1, w0, w1, yTop0, yTop1, thick }, color, mat = 'lit', opts) {
  const len = u1 - u0, wid = w1 - w0;
  const g = (axis === 'x' ? new THREE.BoxGeometry(len, thick, wid) : new THREE.BoxGeometry(wid, thick, len)).toNonIndexed();
  const k = (yTop1 - yTop0) / len;
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = axis === 'x' ? p.getX(i) : p.getZ(i);   // -len/2 .. len/2
    p.setY(i, p.getY(i) + (yTop0 + yTop1) / 2 - thick / 2 + k * u);
    if (axis === 'x') { p.setX(i, u + (u0 + u1) / 2); p.setZ(i, p.getZ(i) + (w0 + w1) / 2); }
    else { p.setZ(i, u + (u0 + u1) / 2); p.setX(i, p.getX(i) + (w0 + w1) / 2); }
  }
  g.computeVertexNormals();
  return finishGeometry(g, color, mat, opts);
}

/** Bakes world-scaled UVs, a uniform colour and (optionally) height shading into a geometry. */
export function finishGeometry(g, color, mat, opts = {}) {
  if (!g.attributes.normal) g.computeVertexNormals();
  const p = g.attributes.position, n = g.attributes.normal;
  const uv = new Float32Array(p.count * 2), col = new Float32Array(p.count * 3);
  const isBuilding = mat.startsWith('building');
  const scale = isBuilding ? 1 / WINDOW_TILE_METRES : mat === 'glass' ? 1 / 6 : 1 / TILE_METRES;
  const [uo, vo] = opts.uvOffset ?? [0, 0];
  _c.set(color);
  const sh = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ay >= ax && ay >= az) { u = p.getX(i); v = p.getZ(i); }
    else if (ax >= az) { u = p.getZ(i); v = p.getY(i); }
    else { u = p.getX(i); v = p.getY(i); }
    if (isBuilding && ay > 0.5) { u = 0; v = 0; } // roofs: no windows
    uv[i * 2] = u * scale + uo; uv[i * 2 + 1] = v * scale + vo;
    if (opts.shade && mat !== 'emissive' && mat !== 'glass') {
      shadeAt(p.getY(i), sh);
      col[i * 3] = _c.r * sh.r; col[i * 3 + 1] = _c.g * sh.g; col[i * 3 + 2] = _c.b * sh.b;
    } else { col[i * 3] = _c.r; col[i * 3 + 1] = _c.g; col[i * 3 + 2] = _c.b; }
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

const MAX_VISUAL_LEN = 64;

export class Builder {
  /** opts: { shade:false, chunk:Infinity } */
  constructor(game, opts = {}) {
    this.game = game;
    this.world = game.physics;
    this.shade = !!opts.shade;
    this.chunk = opts.chunk ?? Infinity;
    this.parts = new Map();      // `${mat}|${cx},${cz}` -> BufferGeometry[]
    this.kinds = new Map();      // name -> { geometry, mat, items:[] }
    this.counter = 0;
    this.stats = { boxes: 0, instances: 0 };
  }

  _push(mat, g, cx, cz) {
    const k = this.chunk === Infinity ? `${mat}|0` : `${mat}|${Math.floor(cx / this.chunk)},${Math.floor(cz / this.chunk)}`;
    let list = this.parts.get(k);
    if (!list) this.parts.set(k, (list = []));
    list.push(g);
  }

  /**
   * AABB. opts: color, mat ('lit'|'emissive'|'building'), solid, walkable, visual (false = collision
   * only), tag, shade (override), uvOffset. Visual-only decoration: {solid:false, walkable:false}.
   * Returns the collider or null.
   */
  box(min, max, opts = {}) {
    const { color = 0x6b7370, mat = 'lit', visual = true, solid = true, walkable = true, tag = '' } = opts;
    if (visual) this._visualBox(min, max, color, mat, opts);
    this.stats.boxes++;
    if (!solid && !walkable) return null;
    return this.world.addBox(min, max, { solid, walkable, tag, userData: opts.userData });
  }

  _visualBox(min, max, color, mat, opts) {
    const o = { shade: opts.shade ?? this.shade, uvOffset: opts.uvOffset };
    const key = ++this.counter;
    const tc = opts.noTint ? color : tint(color, 0.06, key);
    // split very long boxes so spatial chunking/culling stays effective
    const ax = max[0] - min[0] > MAX_VISUAL_LEN ? 0 : max[2] - min[2] > MAX_VISUAL_LEN ? 2 : -1;
    if (ax < 0 || this.chunk === Infinity) {
      this._push(mat, makeBoxGeometry(min, max, tc, mat, o), (min[0] + max[0]) / 2, (min[2] + max[2]) / 2);
      return;
    }
    const n = Math.ceil((max[ax] - min[ax]) / MAX_VISUAL_LEN), len = (max[ax] - min[ax]) / n;
    for (let i = 0; i < n; i++) {
      const a = min.slice(), b = max.slice();
      a[ax] = min[ax] + i * len; b[ax] = min[ax] + (i + 1) * len;
      this._push(mat, makeBoxGeometry(a, b, tc, mat, o), (a[0] + b[0]) / 2, (a[2] + b[2]) / 2);
    }
  }

  /** Box from centre + size. */
  boxC(c, s, opts) { return this.box([c[0] - s[0] / 2, c[1] - s[1] / 2, c[2] - s[2] / 2], [c[0] + s[0] / 2, c[1] + s[1] / 2, c[2] + s[2] / 2], opts); }

  /** Ramp, see PhysicsWorld.addRamp for the parameters. opts.visual === false: collision only. */
  ramp(r, opts = {}) {
    const { color = 0x8a7a55, mat = 'lit', tag = '', visual = true } = opts;
    if (visual) {
      this._push(mat, makeRampGeometry(r, tint(color, 0.05, ++this.counter), mat, { shade: opts.shade ?? this.shade }),
        (r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
    }
    return this.world.addRamp(r, { tag, solid: opts.solid, walkable: opts.walkable });
  }

  /** Arbitrary visual-only geometry (rotated boxes, cylinders...). Cloned, so the input is reusable. */
  geometry(geo, opts = {}) {
    const { color = 0x6b7370, mat = 'lit', matrix } = opts;
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    g.computeBoundingBox();
    const c = g.boundingBox.getCenter(_p);
    finishGeometry(g, opts.noTint ? color : tint(color, 0.05, ++this.counter), mat, { shade: opts.shade ?? this.shade });
    this._push(mat, g, c.x, c.z);
  }

  /** Visual sheared box (see makeShearedBox). */
  sheared(spec, opts = {}) {
    const { color = 0x6b7370, mat = 'lit' } = opts;
    const g = makeShearedBox(spec, opts.noTint ? color : tint(color, 0.05, ++this.counter), mat, { shade: opts.shade ?? this.shade });
    this._push(mat, g, (spec.axis === 'x' ? (spec.u0 + spec.u1) / 2 : (spec.w0 + spec.w1) / 2), (spec.axis === 'x' ? (spec.w0 + spec.w1) / 2 : (spec.u0 + spec.u1) / 2));
  }

  /**
   * Staircase of box steps. (x,z) = centre of the low edge, y = floor height there, dir = '+x'|'-x'|'+z'|'-z'.
   * Step i spans [i*run, (i+1)*run] ahead and is (i+1)*rise tall. Returns {top, end:{x,z}}.
   * `hollow` (thickness in m): each step is only that thick (a floating flight) instead of a solid
   * block down to `bottom`. `visual:false` for collision only.
   */
  stairs({ x, z, y, dir, steps, rise = 0.3, run = 0.5, width = 4, bottom = y, color = 0x7d7468, hollow = 0, tag = 'stairs', visual = true }) {
    const axis = dir[1], s = dir[0] === '-' ? -1 : 1;
    for (let i = 0; i < steps; i++) {
      const a = i * run * s, b = (i + 1) * run * s;
      const lo = Math.min(a, b), hi = Math.max(a, b);
      const top = y + rise * (i + 1);
      const bot = hollow ? Math.max(bottom, top - hollow) : bottom;
      const min = axis === 'z' ? [x - width / 2, bot, z + lo] : [x + lo, bot, z - width / 2];
      const max = axis === 'z' ? [x + width / 2, top, z + hi] : [x + hi, top, z + width / 2];
      this.box(min, max, { color: tint(color, 0.1, i), tag, visual });
    }
    return { top: y + rise * steps, end: axis === 'z' ? { x, z: z + steps * run * s } : { x: x + steps * run * s, z } };
  }

  // ------------------------------------------------------------------ instancing

  /** Register a repeated prop: one InstancedMesh (one draw call). `geometry` should be ~unit sized. */
  kind(name, geometry, mat = 'lit') {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (!g.attributes.uv || !g.attributes.color) finishGeometry(g, 0xffffff, mat, {});
    this.kinds.set(name, { geometry: g, mat, items: [] });
  }

  /** Queue an instance. Colour is multiplied with the geometry's colour (shaded by height if enabled). */
  instance(name, { x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1, color = 0xffffff, shade }) {
    const k = this.kinds.get(name);
    if (!k) throw new Error('unknown instance kind ' + name);
    _c.set(color);
    if ((shade ?? this.shade) && k.mat !== 'emissive' && k.mat !== 'pool') { shadeAt(y + sy * 0.5, _p2); _c.multiply(_p2); }
    k.items.push([x, y, z, yaw, sx, sy, sz, _c.r, _c.g, _c.b]);
    this.stats.instances++;
  }

  /** Merge everything added so far (one mesh per material+chunk), add it to the scene, and reset. */
  finish(name = 'static') {
    const group = new THREE.Group(); group.name = name;
    for (const [key, list] of this.parts) {
      const [mat, ck] = key.split('|');
      const merged = mergeGeometries(list, false);
      list.forEach((g) => g.dispose());
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, this.game.materials[mat]);
      mesh.name = `${name}:${mat}:${ck}`;
      group.add(mesh);
    }
    this.parts.clear();
    for (const [kname, k] of this.kinds) {
      if (!k.items.length) continue;
      const mesh = new THREE.InstancedMesh(k.geometry, this.game.materials[k.mat], k.items.length);
      mesh.name = `${name}:inst:${kname}`;
      const col = new THREE.Color();
      k.items.forEach((it, i) => {
        _e.set(0, it[3], 0);
        _q.setFromEuler(_e);
        _p.set(it[0], it[1], it[2]); _s.set(it[4], it[5], it[6]);
        _m.compose(_p, _q, _s);
        mesh.setMatrixAt(i, _m);
        mesh.setColorAt(i, col.setRGB(it[7], it[8], it[9]));
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
      k.items.length = 0;
    }
    this.game.scene.add(group);
    return group;
  }
}

const _p2 = new THREE.Color();
