// Geometry toolkit for the people (Phase 8C): smooth lofted tubes, ellipsoids and ribbons that carry vertex colours and skin
// weights, merged into ONE indexed BufferGeometry. No textures here (the face is its own patch, see face.js).
//
//   const mb = new MeshBuilder(wf)                  wf(x, y, z) -> [[bone, weight], ...]  default skin weights
//   mb.tube(rings, {seg, cap0, cap1, wf, a0, a1})   rings: [{ y, x, z, rx, rz, c, p, wf }]; c = colour (hex | THREE.Color)
//   mb.blob({ x, y, z, rx, ry, rz, c, rot:[x,y,z], seg, rings, wf })     an ellipsoid
//   mb.ribbon(rows, cols, fn(u, v) -> [x, y, z], colour(u, v), wf)       a cloth sheet (render it double sided)
//   mb.build() -> BufferGeometry { position, normal, color, skinIndex, skinWeight }
//
// Angles around a ring: phi = 0 is the FRONT (-Z), phi = PI/2 is +X (the person's right), PI the back.
import * as THREE from '../../vendor/three.module.js';

const _c = new THREE.Color();
const colorOf = (c) => (c && c.isColor ? c : _c.set(c ?? 0xff00ff));
const _e = new THREE.Euler(), _q = new THREE.Quaternion(), _p = new THREE.Vector3();

/** Smooth interpolation of a table [[y, a, b, ...], ...] (sorted by y) at y: Catmull-Rom on each column. */
export function spline(tbl, y) {
  const n = tbl.length;
  if (y <= tbl[0][0]) return tbl[0].slice(1);
  if (y >= tbl[n - 1][0]) return tbl[n - 1].slice(1);
  let i = 0;
  while (i < n - 2 && y > tbl[i + 1][0]) i++;
  const p0 = tbl[Math.max(0, i - 1)], p1 = tbl[i], p2 = tbl[i + 1], p3 = tbl[Math.min(n - 1, i + 2)];
  const t = (y - p1[0]) / (p2[0] - p1[0]), t2 = t * t, t3 = t2 * t;
  const out = [];
  for (let k = 1; k < p1.length; k++) {
    out.push(0.5 * ((2 * p1[k]) + (-p0[k] + p2[k]) * t + (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 + (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3));
  }
  return out;
}

export class MeshBuilder {
  constructor(wf) {
    this.wf = wf ?? (() => [[0, 1]]);
    this.pos = []; this.col = []; this.idx = []; this.si = []; this.sw = [];
  }

  get vertexCount() { return this.pos.length / 3; }

  _vert(x, y, z, c, wf) {
    const i = this.pos.length / 3;
    this.pos.push(x, y, z);
    const k = colorOf(c);
    this.col.push(k.r, k.g, k.b);
    let w = (wf ?? this.wf)(x, y, z);
    if (w.length > 4) w = w.slice().sort((a, b) => b[1] - a[1]).slice(0, 4);
    let sum = 0; for (const e of w) sum += e[1];
    if (sum <= 0) { w = [[0, 1]]; sum = 1; }
    for (let k2 = 0; k2 < 4; k2++) {
      this.si.push(w[k2] ? w[k2][0] : 0);
      this.sw.push(w[k2] ? w[k2][1] / sum : 0);
    }
    return i;
  }

  /** A lofted tube through `rings` (each a horizontal ellipse). Auto-orients its faces outward. */
  tube(rings, o = {}) {
    const seg = o.seg ?? 10, n = rings.length;
    const open = o.a0 !== undefined || rings.some((r) => r.a0 !== undefined);
    const cols = open ? seg + 1 : seg;
    const base = this.pos.length / 3;
    for (let i = 0; i < n; i++) {
      const r = rings[i], px = r.p ?? o.p ?? 2, e = 2 / px;
      const a0 = r.a0 ?? o.a0 ?? 0, a1 = r.a1 ?? o.a1 ?? Math.PI * 2;
      const wf = r.wf ?? o.wf;
      for (let j = 0; j < cols; j++) {
        const phi = open ? a0 + (a1 - a0) * (j / seg) : (j / seg) * Math.PI * 2;
        const s = Math.sin(phi), c = Math.cos(phi);
        const sx = Math.sign(s) * Math.pow(Math.abs(s), e), sz = -Math.sign(c) * Math.pow(Math.abs(c), e);
        const col = r.cf ? r.cf(phi, j) : r.c;
        this._vert((r.x ?? 0) + r.rx * sx, r.y, (r.z ?? 0) + r.rz * sz, col, wf);
      }
    }
    // orientation: compare the first quad's normal with the radial direction
    let flip = o.flip ?? false;
    if (n >= 2) {
      const a = base, b = base + cols, c = base + 1;     // (ring0,j0) (ring1,j0) (ring0,j1)
      const P = this.pos, ax = P[a * 3], ay = P[a * 3 + 1], az = P[a * 3 + 2];
      const ux = P[b * 3] - ax, uy = P[b * 3 + 1] - ay, uz = P[b * 3 + 2] - az, vx = P[c * 3] - ax, vy = P[c * 3 + 1] - ay, vz = P[c * 3 + 2] - az;
      const nx = uy * vz - uz * vy, nz = ux * vy - uy * vx, ny = uz * vx - ux * vz;
      const r0 = rings[0], rx = ax - (r0.x ?? 0), rz = az - (r0.z ?? 0);
      if (nx * rx + nz * rz < 0) flip = !flip;
    }
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < (open ? cols - 1 : cols); j++) {
        const j2 = open ? j + 1 : (j + 1) % cols;
        const a = base + i * cols + j, b = base + (i + 1) * cols + j, c = base + (i + 1) * cols + j2, d = base + i * cols + j2;
        if (!flip) this.idx.push(a, b, d, b, c, d); else this.idx.push(a, d, b, b, d, c);
      }
    }
    const cap = (ri, dirSign) => {
      const r = rings[ri], ci = this._vert(r.x ?? 0, r.y, r.z ?? 0, o.capColor ?? r.c, r.wf ?? o.wf);
      const row = base + ri * cols;
      for (let j = 0; j < (open ? cols - 1 : cols); j++) {
        const j2 = open ? j + 1 : (j + 1) % cols;
        const a = row + j, b = row + j2;
        // the cap faces along +Y when this end of the tube is its top; (ci, a, b) faces down for this angle order
        const up = ((rings[n - 1].y - rings[0].y) * dirSign) > 0;
        if (up) this.idx.push(ci, b, a); else this.idx.push(ci, a, b);
      }
    };
    if (o.cap0) cap(0, -1);
    if (o.cap1) cap(n - 1, 1);
    return this;
  }

  /** A thin straight rod / cone from p0 to p1 (arrays), radius r0 -> r1, with optional colour bands [{t0, t1, c}] (t along the rod). */
  rod(p0, p1, r0, r1, c, o = {}) {
    const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1), d = b.clone().sub(a), len = d.length();
    d.normalize();
    const u = new THREE.Vector3(Math.abs(d.y) < 0.9 ? 0 : 1, Math.abs(d.y) < 0.9 ? 1 : 0, 0).cross(d).normalize(), v = d.clone().cross(u);
    const seg = o.seg ?? 6, n = o.rings ?? 2, bands = o.bands ?? [];
    const base = this.pos.length / 3;
    for (let i = 0; i <= n; i++) {
      const t = i / n, p = a.clone().lerp(b, t), r = r0 + (r1 - r0) * t;
      const band = bands.find((q) => t >= q.t0 && t <= q.t1);
      for (let j = 0; j < seg; j++) {
        const th = (j / seg) * Math.PI * 2, cs = Math.cos(th), sn = Math.sin(th);
        this._vert(p.x + (u.x * cs + v.x * sn) * r, p.y + (u.y * cs + v.y * sn) * r, p.z + (u.z * cs + v.z * sn) * r, band ? band.c : c, o.wf);
      }
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < seg; j++) {
      const j2 = (j + 1) % seg, A = base + i * seg + j, Bq = base + (i + 1) * seg + j, C = base + (i + 1) * seg + j2, Dq = base + i * seg + j2;
      this.idx.push(A, Dq, Bq, Bq, Dq, C);
    }
    // orientation: (A, D, B) must face away from the axis
    const P = this.pos, i0 = base, i1 = base + seg, i2 = base + 1;
    const ux = P[i2 * 3] - P[i0 * 3], uy = P[i2 * 3 + 1] - P[i0 * 3 + 1], uz = P[i2 * 3 + 2] - P[i0 * 3 + 2], vx = P[i1 * 3] - P[i0 * 3], vy = P[i1 * 3 + 1] - P[i0 * 3 + 1], vz = P[i1 * 3 + 2] - P[i0 * 3 + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const rx = P[i0 * 3] - a.x, ry = P[i0 * 3 + 1] - a.y, rz = P[i0 * 3 + 2] - a.z;
    if (nx * rx + ny * ry + nz * rz < 0) {
      const tail = this.idx.length - n * seg * 6;
      for (let k = tail; k < this.idx.length; k += 3) { const t = this.idx[k + 1]; this.idx[k + 1] = this.idx[k + 2]; this.idx[k + 2] = t; }
    }
    return this;
  }

  /** An ellipsoid (lat/long), optionally rotated (Euler XYZ radians) about its centre. */
  blob(o) {
    const seg = o.seg ?? 8, rows = o.rings ?? 6;
    const base = this.pos.length / 3;
    const rot = o.rot ? _q.setFromEuler(_e.set(o.rot[0], o.rot[1], o.rot[2])) : null;
    const wf = o.wf;
    const cf = o.cf;
    for (let i = 0; i <= rows; i++) {
      const th = (i / rows) * Math.PI, y = Math.cos(th), rr = Math.sin(th);
      for (let j = 0; j < seg; j++) {
        const ph = (j / seg) * Math.PI * 2;
        _p.set(Math.sin(ph) * rr * o.rx, y * o.ry, -Math.cos(ph) * rr * o.rz);
        if (rot) _p.applyQuaternion(rot);
        this._vert((o.x ?? 0) + _p.x, (o.y ?? 0) + _p.y, (o.z ?? 0) + _p.z, cf ? cf(ph, th) : o.c, wf);
      }
    }
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < seg; j++) {
        const j2 = (j + 1) % seg;
        const a = base + i * seg + j, b = base + (i + 1) * seg + j, c = base + (i + 1) * seg + j2, d = base + i * seg + j2;
        if (i > 0) this.idx.push(a, d, b);
        if (i < rows - 1) this.idx.push(b, d, c);
      }
    }
    // outward check on the equator quad
    return this;
  }

  /** A cloth sheet: (rows+1) x (cols+1) points from fn(u, v) -> [x, y, z]; u across (0..1), v along (0..1). */
  ribbon(rows, cols, fn, colour, wf) {
    const base = this.pos.length / 3;
    for (let i = 0; i <= rows; i++) {
      for (let j = 0; j <= cols; j++) {
        const u = j / cols, v = i / rows, p = fn(u, v);
        this._vert(p[0], p[1], p[2], typeof colour === 'function' ? colour(u, v) : colour, wf);
      }
    }
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        const a = base + i * (cols + 1) + j, b = a + 1, c = a + cols + 1, d = c + 1;
        this.idx.push(a, c, b, b, c, d);
      }
    }
    return this;
  }

  build(smooth = true) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    g.setIndex(this.idx);
    if (smooth) g.computeVertexNormals();
    return g;
  }
}

/** Outward-facing fix for blobs: three.js lat/long winding above is right-handed when ry axis is up; kept separate for tests. */
export function mix(a, b, t) { return a + (b - a) * t; }
export function smooth(a, b, x) { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); }
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
