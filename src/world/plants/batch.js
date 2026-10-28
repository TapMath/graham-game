// PlantBatch: the geometry accumulator for all greenery. Plants are emitted as flat-shaded triangles in WORLD space into
// per-layer, per-cell, per-LOD buckets; finish() concatenates them into ONE geometry per layer, sorted by cell and LOD, so the
// renderer can draw any set of (cell, lod) ranges by recomposing the index buffer (see greenery.js): the whole city's plant life is
// one draw call per layer, with distance culling and two levels of detail.
//
// Vertex attributes: position, normal (flat, from the winding; the material is double sided so any winding lights correctly),
// color (linear, already tinted by height), uv, aMisc = (sway weight, wind phase, glow kind):
//   glow 0 none, 1 emissive (irrigation lines, lamps: shows by day, blazes at night), 2 uplit foliage (warm at night only), 3 textured panel.
// Everything is one layer (one draw call): glow kind 3 marks the leaf-textured green-wall panels, which the shader texture-maps.
import * as THREE from '../../../vendor/three.module.js';
import { shadeAt } from '../builder.js';

export const CELL = 64;
const _t = new THREE.Color(), _s = new THREE.Color();

export class Bucket {
  constructor() { this.pos = []; this.nor = []; this.col = []; this.uv = []; this.misc = []; }
  get verts() { return this.pos.length / 3; }
}

export class PlantBatch {
  constructor() {
    this.layers = { A: new Map(), B: new Map() };
    this.layer = 'A'; this.lod = 0; this.glow = 0; this.phase = 0; this.tintK = 0.45; this.boost = 1.05;
    this.xf = { x: 0, y: 0, z: 0, c: 1, s: 0, k: 1 };
    this.cell = null; this.bucket = null;
    this.tris = [0, 0];
  }

  /** Start a plant at world (x,y,z): picks the cell bucket, sets the local->world transform and the height tint. */
  at(x, y, z, yaw = 0, scale = 1, { layer = 'A', lod = 0, phase } = {}) {
    this.xf.x = x; this.xf.y = y; this.xf.z = z; this.xf.c = Math.cos(yaw); this.xf.s = Math.sin(yaw); this.xf.k = scale;
    this.layer = layer; this.lod = lod;
    this.phase = phase ?? (Math.abs(Math.sin(x * 12.9898 + z * 78.233) * 43758.5453) % 6.2832);
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL), key = cx * 4096 + cz;
    this.glow = layer === 'B' ? 3 : 0;          // panel vertices carry glow kind 3: the shader samples the leaf texture there only
    const m = this.layers.A;
    let cell = m.get(key);
    if (!cell) m.set(key, (cell = { cx, cz, b: [new Bucket(), new Bucket()] }));
    this.cell = cell; this.bucket = cell.b[lod];
    shadeAt(y + 1.2, _s);
    _s.lerp(_t.setRGB(1, 1, 1), 1 - this.tintK);
    this.tint = _s.clone();
    return this;
  }

  /** local point -> world */
  P(lx, ly, lz) {
    const f = this.xf, k = f.k;
    return [f.x + (lx * f.c + lz * f.s) * k, f.y + ly * k, f.z + (-lx * f.s + lz * f.c) * k];
  }

  _vert(p, c, w, uv) {
    const b = this.bucket;
    b.pos.push(p[0], p[1], p[2]);
    const g = this.glow === 1;
    const k = this.boost;
    b.col.push(g ? c[0] : c[0] * this.tint.r * k, g ? c[1] : c[1] * this.tint.g * k, g ? c[2] : c[2] * this.tint.b * k);
    b.misc.push(w, this.phase, this.glow);
    b.uv.push(uv ? uv[0] : 0.5, uv ? uv[1] : 0.5);
  }

  /** a, b, c = [x, y, z, r, g, b, w?] in local space (w = wind sway weight 0..1). Optional uvs [[u,v],..]. */
  tri(a, b, c, uvs) {
    const pa = this.P(a[0], a[1], a[2]), pb = this.P(b[0], b[1], b[2]), pc = this.P(c[0], c[1], c[2]);
    const ux = pb[0] - pa[0], uy = pb[1] - pa[1], uz = pb[2] - pa[2], vx = pc[0] - pa[0], vy = pc[1] - pa[1], vz = pc[2] - pa[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const bk = this.bucket;
    bk.nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz);
    this._vert(pa, a.slice(3, 6), a[6] ?? 0, uvs && uvs[0]);
    this._vert(pb, b.slice(3, 6), b[6] ?? 0, uvs && uvs[1]);
    this._vert(pc, c.slice(3, 6), c[6] ?? 0, uvs && uvs[2]);
    this.tris[this.lod]++;
  }

  quad(a, b, c, d, uvs) {
    this.tri(a, b, c, uvs && [uvs[0], uvs[1], uvs[2]]);
    this.tri(a, c, d, uvs && [uvs[0], uvs[2], uvs[3]]);
  }

  /** concatenate everything into typed arrays: [{ layer, geometry, cells:[{cx,cz,ranges:[{start,count},{start,count}],sphere}] }] */
  finish() {
    const out = [];
    for (const layer of ['A']) {
      const m = this.layers[layer];
      const cells = [...m.values()].sort((p, q) => p.cx - q.cx || p.cz - q.cz);
      let total = 0;
      for (const c of cells) for (const b of c.b) total += b.verts;
      if (!total) continue;
      const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), col = new Float32Array(total * 3), uv = new Float32Array(total * 2), misc = new Float32Array(total * 3);
      let v = 0;
      const info = [];
      for (const c of cells) {
        const ranges = [];
        const lo = new THREE.Vector3(1e9, 1e9, 1e9), hi = new THREE.Vector3(-1e9, -1e9, -1e9);
        for (const b of c.b) {
          const start = v, n = b.verts;
          pos.set(b.pos, v * 3); nor.set(b.nor, v * 3); col.set(b.col, v * 3); uv.set(b.uv, v * 2); misc.set(b.misc, v * 3);
          for (let i = 0; i < b.pos.length; i += 3) { lo.x = Math.min(lo.x, b.pos[i]); hi.x = Math.max(hi.x, b.pos[i]); lo.y = Math.min(lo.y, b.pos[i + 1]); hi.y = Math.max(hi.y, b.pos[i + 1]); lo.z = Math.min(lo.z, b.pos[i + 2]); hi.z = Math.max(hi.z, b.pos[i + 2]); }
          ranges.push({ start, count: n });
          v += n;
          b.pos = b.nor = b.col = b.uv = b.misc = null;
        }
        const ctr = lo.clone().add(hi).multiplyScalar(0.5);
        info.push({ cx: c.cx, cz: c.cz, ranges, center: ctr, radius: ctr.distanceTo(hi) + 1, lo, hi });
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.BufferAttribute(col, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setAttribute('aMisc', new THREE.BufferAttribute(misc, 3));
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
      out.push({ layer, geometry: g, cells: info, total });
    }
    return out;
  }
}
