// The plants. Every function emits low-poly flat-shaded geometry into a PlantBatch, at both levels of detail (lod 0 near, lod 1
// far), using the same seed for both so the silhouettes agree. Local space: +Y up, origin at the plant's foot. Wind weights
// (the 7th vertex value) are 0 on trunks and pots and rise toward the leaf tips.
import * as THREE from '../../../vendor/three.module.js';
import { mulberry } from './field.js';

const col = (hex) => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const mul = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const clamp01 = (t) => Math.max(0, Math.min(1, t));

export const C = {
  leafLo: col(0x2a6a30), leafMid: col(0x4a9a3c), leafHi: col(0x86c84c), leafYel: col(0xa8d65a),
  dryLo: col(0x4d6232), dryHi: col(0x86893f),
  rainLo: col(0x2c6c34), rainHi: col(0x78bc4a),
  gulLo: col(0x346e32), gulHi: col(0x8ac84e), bloomA: col(0xd23a1c), bloomB: col(0xf2701f),
  peepLo: col(0x4a9a3a), peepHi: col(0xb2dc60),
  palmLo: col(0x2f7a34), palmHi: col(0x88c84e),
  trunk: col(0x5a4632), trunkHi: col(0x7a6448), palmTrunk: col(0x8a7a5a),
  terracotta: col(0xb9623a), terraDark: col(0x8e4628), concrete: col(0x8d8d86), concreteDark: col(0x6a6a64), stone: col(0xa8a294),
  magenta: col(0xe0267c), magentaHi: col(0xff58ab), marigold: col(0xf5a21b), jasmine: col(0xf6efdf), purple: col(0x8a4ab0), red: col(0xd8302a),
  soil: col(0x4a3a2c), wood: col(0x8a6a44), woodDark: col(0x5e4630), steel: col(0x474f52),
  cyan: col(0x4cf0ff), lampWarm: col(0xffe2a8),
  bucketBlue: col(0x2f5fa8), bucketRed: col(0xa8412f), bucketWhite: col(0xd8d4c6), bucketYellow: col(0xd6b02f), bucketGreen: col(0x3c8a58),
  veg: col(0x5da83e), vegPurple: col(0x6a3a7a), chilli: col(0xd8302a),
};

// ------------------------------------------------------------------ templates
function template(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo, p = g.attributes.position, verts = [], faces = [], key = new Map();
  for (let i = 0; i < p.count; i += 3) {
    const f = [];
    for (let k = 0; k < 3; k++) {
      const v = new THREE.Vector3(p.getX(i + k), p.getY(i + k), p.getZ(i + k)).normalize();
      const id = `${v.x.toFixed(3)},${v.y.toFixed(3)},${v.z.toFixed(3)}`;
      if (!key.has(id)) { key.set(id, verts.length); verts.push([v.x, v.y, v.z]); }
      f.push(key.get(id));
    }
    faces.push(f);
  }
  return { verts, faces };
}
const ICO = template(new THREE.IcosahedronGeometry(1, 0));
const OCT = template(new THREE.OctahedronGeometry(1, 0));
const TET = template(new THREE.TetrahedronGeometry(1, 0));

/**
 * An organic lump: a jittered low-poly ellipsoid, coloured low->high, with sway weight `w` at the crown.
 * o: { tpl, jit, lo, hi, w, flat, pick(ny, rng) -> colour, down: darken the underside }
 */
export function blob(b, cx, cy, cz, rx, ry, rz, rng, o) {
  const T = o.tpl ?? ICO, jit = o.jit ?? 0.14, w = o.w ?? 0.6;
  const vs = T.verts.map((v) => { const j = 1 + (rng() - 0.5) * 2 * jit; return [v[0] * j, v[1] * j, v[2] * j]; });
  for (const f of T.faces) {
    const a = vs[f[0]], c = vs[f[1]], d = vs[f[2]];
    const ny = (a[1] + c[1] + d[1]) / 3;
    const color = o.pick ? o.pick(ny, rng) : mul(mix(o.lo, o.hi, clamp01(0.5 + 0.5 * ny + (rng() - 0.5) * 0.18)), ny < -0.15 ? 0.72 : 1);
    const V = (p) => [cx + p[0] * rx, cy + (o.flat && p[1] < 0 ? p[1] * 0.4 : p[1]) * ry, cz + p[2] * rz, color[0], color[1], color[2], o.w0 !== undefined ? o.w0 + (w - o.w0) * (p[1] * 0.5 + 0.5) : w * (0.55 + 0.45 * (p[1] * 0.5 + 0.5))];
    b.tri(V(a), V(c), V(d));
  }
}

/** axis-aligned box in local space (top and sides, no bottom unless asked). */
export function box(b, x0, y0, z0, x1, y1, z1, c, { w = 0, bottom = false, shade = 0.78 } = {}) {
  const side = mul(c, shade), top = c;
  const V = (x, y, z, cc, ww = w) => [x, y, z, cc[0], cc[1], cc[2], ww];
  const wt = (y) => (y >= y1 - 1e-6 ? w : w * 0.2);
  b.quad(V(x0, y1, z0, top, w), V(x1, y1, z0, top, w), V(x1, y1, z1, top, w), V(x0, y1, z1, top, w));
  b.quad(V(x0, y0, z1, side, wt(y0)), V(x1, y0, z1, side, wt(y0)), V(x1, y1, z1, side, w), V(x0, y1, z1, side, w));
  b.quad(V(x1, y0, z0, mul(side, 0.9), wt(y0)), V(x0, y0, z0, mul(side, 0.9), wt(y0)), V(x0, y1, z0, mul(side, 0.9), w), V(x1, y1, z0, mul(side, 0.9), w));
  b.quad(V(x1, y0, z1, mul(side, 0.85), wt(y0)), V(x1, y0, z0, mul(side, 0.85), wt(y0)), V(x1, y1, z0, mul(side, 0.85), w), V(x1, y1, z1, mul(side, 0.85), w));
  b.quad(V(x0, y0, z0, mul(side, 0.95), wt(y0)), V(x0, y0, z1, mul(side, 0.95), wt(y0)), V(x0, y1, z1, mul(side, 0.95), w), V(x0, y1, z0, mul(side, 0.95), w));
  if (bottom) b.quad(V(x0, y0, z0, mul(side, 0.6)), V(x1, y0, z0, mul(side, 0.6)), V(x1, y0, z1, mul(side, 0.6)), V(x0, y0, z1, mul(side, 0.6)));
}

/** a tapered prism from p0 to p1 (local points), radii r0 -> r1, `sides` sides. */
export function limb(b, p0, p1, r0, r1, sides, cLo, cHi, w0 = 0, w1 = 0) {
  const d = new THREE.Vector3(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]), len = d.length() || 1; d.divideScalar(len);
  const ref = Math.abs(d.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const u = new THREE.Vector3().crossVectors(d, ref).normalize(), v = new THREE.Vector3().crossVectors(d, u);
  const ring = (p, r, c, w) => Array.from({ length: sides }, (_, i) => { const a = (i / sides) * Math.PI * 2, ca = Math.cos(a) * r, sa = Math.sin(a) * r; return [p[0] + u.x * ca + v.x * sa, p[1] + u.y * ca + v.y * sa, p[2] + u.z * ca + v.z * sa, c[0], c[1], c[2], w]; });
  const A = ring(p0, r0, cLo, w0), B = ring(p1, r1, cHi, w1);
  for (let i = 0; i < sides; i++) { const j = (i + 1) % sides; b.quad(A[i], A[j], B[j], B[i]); }
}

// ------------------------------------------------------------------ trees
const TREE = {
  rain: { lo: C.rainLo, hi: C.rainHi, blobs: 7, flat: 1.0 },
  gulmohar: { lo: C.gulLo, hi: C.gulHi, blobs: 7, flat: 1.15 },
  peepal: { lo: C.peepLo, hi: C.peepHi, blobs: 10, flat: 0.9 },
};

/** Umbrella-crowned tree. o: { x,y,z, seed, kind:'rain'|'gulmohar'|'peepal', h, spread, bloom (gulmohar in flower), lit (uplit at night) } */
export function tree(b, o) {
  const T = TREE[o.kind] ?? TREE.rain;
  for (const lod of [0, 1]) {
    const rng = mulberry(o.seed);
    b.at(o.x, o.y, o.z, rng() * 6.28, 1, { lod });
    const h = o.h, sp = o.spread, lean = (rng() - 0.5) * 0.9, lean2 = (rng() - 0.5) * 0.9;
    const r0 = (o.kind === 'peepal' ? 0.42 : 0.2) + h * 0.012;
    const top = [lean, h * 0.62, lean2], mid = [lean * 0.35, h * 0.32, lean2 * 0.35];
    const sides = lod ? 4 : 6;
    limb(b, [0, 0, 0], mid, r0, r0 * 0.78, sides, mul(C.trunk, 0.8), C.trunk);
    limb(b, mid, top, r0 * 0.78, r0 * 0.5, sides, C.trunk, C.trunkHi);
    const cy = h * 0.76;
    const pick = o.kind === 'gulmohar' && o.bloom ? (ny, r) => (ny > 0.05 && r() < 0.62 ? mix(C.bloomA, C.bloomB, r()) : mul(mix(T.lo, T.hi, clamp01(0.5 + 0.5 * ny)), ny < -0.15 ? 0.72 : 1)) : undefined;
    b.glow = o.lit ? 2 : 0;
    const bo = { lo: T.lo, hi: T.hi, w: 0.9, w0: 0.35, pick, flat: true, jit: 0.16 };
    if (lod === 0) {
      for (let i = 0; i < T.blobs; i++) {
        const a = (i / T.blobs) * Math.PI * 2 + rng() * 0.6, rad = sp * 0.5 * (0.55 + 0.45 * rng());
        const bx = Math.cos(a) * rad + lean, bz = Math.sin(a) * rad + lean2, by = cy + (rng() - 0.5) * 0.9;
        limb(b, top, [bx * 0.7, by - 0.7, bz * 0.7], 0.08, 0.04, 4, C.trunk, C.trunkHi);
        blob(b, bx, by, bz, sp * 0.44, (0.95 + 0.4 * rng()) * T.flat, sp * 0.44, rng, bo);
      }
      blob(b, lean, cy + 0.7, lean2, sp * 0.52, 1.15 * T.flat, sp * 0.52, rng, bo);
      for (let i = 0; i < 4; i++) {         // a lower skirt of leaf, so the crown reads full from the side
        const a = (i / 4) * Math.PI * 2 + rng(), rad = sp * (0.62 + 0.2 * rng());
        blob(b, Math.cos(a) * rad + lean, cy - 0.75 - rng() * 0.3, Math.sin(a) * rad + lean2, sp * 0.3, 0.7, sp * 0.3, rng, { ...bo, w0: 0.5 });
      }
    } else {
      for (let i = 0; i < 7; i++) rng();
      blob(b, lean, cy, lean2, sp * 0.98, 1.5 * T.flat, sp * 0.98, rng, { ...bo, tpl: OCT, jit: 0.1 });
      blob(b, lean, cy + 1.0, lean2, sp * 0.62, 1.1 * T.flat, sp * 0.62, rng, { ...bo, tpl: OCT, jit: 0.1 });
    }
    b.glow = 0;
  }
}

/** Coconut/royal palm: leaning ringed trunk and a crown of drooping fronds. */
export function palm(b, o) {
  for (const lod of [0, 1]) {
    const rng = mulberry(o.seed);
    b.at(o.x, o.y, o.z, rng() * 6.28, 1, { lod });
    const h = o.h, ax = (rng() - 0.5) * 1.4, az = (rng() - 0.5) * 1.4;
    const segs = lod ? 1 : 4, sides = lod ? 4 : 5;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs, f = (t) => [ax * t * t, h * t, az * t * t];
      limb(b, f(t0), f(t1), 0.22 - 0.1 * t0, 0.22 - 0.1 * t1, sides, mul(C.palmTrunk, 0.8 + 0.2 * t0), mul(C.palmTrunk, 0.9 + 0.1 * t1), 0.0, 0.05);
    }
    const cx = ax, cy = h, cz = az, n = lod ? 6 : 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rng() * 0.4, len = o.frond * (0.85 + 0.3 * rng()), rise = 0.9 + rng() * 0.8, droop = 1.7 + rng() * 0.9, wd = 0.32;
      const pts = [];
      const S = lod ? 2 : 3;
      for (let k = 0; k <= S; k++) {
        const t = k / S, hd = len * t, yy = rise * Math.sin(t * 2.4) - droop * t * t;
        const px = cx + Math.cos(a) * hd, pz = cz + Math.sin(a) * hd;
        const wv = wd * Math.sin(Math.PI * Math.min(1, 0.18 + t * 0.85));
        const c = mix(C.palmLo, C.palmHi, t * 0.8 + rng() * 0.15);
        pts.push({ p: [px, cy + yy, pz], px: -Math.sin(a) * wv, pz: Math.cos(a) * wv, c, w: 0.5 + 0.5 * t });
      }
      for (let k = 0; k < S; k++) {
        const A = pts[k], B = pts[k + 1];
        const v = (q, s) => [q.p[0] + q.px * s, q.p[1] - Math.abs(s) * 0.1, q.p[2] + q.pz * s, q.c[0], q.c[1], q.c[2], q.w];
        if (k < S - 1) b.quad(v(A, -1), v(A, 1), v(B, 1), v(B, -1));
        else { b.tri(v(A, -1), v(A, 1), [B.p[0], B.p[1], B.p[2], B.c[0], B.c[1], B.c[2], B.w]); }
      }
    }
    if (lod === 0) blob(b, cx, cy - 0.15, cz, 0.3, 0.3, 0.3, rng, { tpl: OCT, lo: C.palmTrunk, hi: C.palmTrunk, w: 0 });
  }
}

// ------------------------------------------------------------------ shrubs, hedges, beds, grass
/** A flowering or leafy shrub. o: { x,y,z, seed, r, h, flower: colour | null, dry } */
export function shrub(b, o) {
  const lo = o.dry ? C.dryLo : C.leafLo, hi = o.dry ? C.dryHi : C.leafHi;
  for (const lod of [0, 1]) {
    const rng = mulberry(o.seed);
    b.at(o.x, o.y, o.z, rng() * 6.28, 1, { lod });
    const r = o.r, h = o.h;
    const bo = { lo, hi, w: 0.8, w0: 0.1, jit: 0.15, flat: true };
    if (lod === 0) {
      blob(b, 0, h * 0.5, 0, r * 0.75, h * 0.5, r * 0.75, rng, bo);
      for (let i = 0; i < 3; i++) { const a = rng() * 6.28 + i * 2.1; blob(b, Math.cos(a) * r * 0.5, h * (0.3 + 0.2 * rng()), Math.sin(a) * r * 0.5, r * 0.5, h * 0.36, r * 0.5, rng, bo); }
      if (o.flower) {
        for (let i = 0; i < 9; i++) {
          const a = rng() * 6.28, e = 0.2 + 0.8 * rng(), px = Math.cos(a) * r * 0.62 * Math.sqrt(e), pz = Math.sin(a) * r * 0.62 * Math.sqrt(e), py = h * (0.55 + 0.4 * (1 - e)) + 0.05;
          blob(b, px, py, pz, 0.11, 0.09, 0.11, rng, { tpl: TET, lo: o.flower, hi: mix(o.flower, [1, 1, 1], 0.25), w: 0.9, w0: 0.5, jit: 0.1 });
        }
      }
    } else {
      for (let i = 0; i < 5; i++) rng();
      blob(b, 0, h * 0.45, 0, r * 0.95, h * 0.55, r * 0.95, rng, { ...bo, tpl: OCT, pick: o.flower ? (ny, rr) => (ny > 0.3 && rr() < 0.4 ? o.flower : mix(lo, hi, clamp01(0.5 + 0.5 * ny))) : undefined });
    }
  }
}

/** A clipped hedge along an axis: o: { x0,z0,x1,z1,y,h,t (thickness), seed, dry } (the longer side is the length). */
export function hedge(b, o) {
  const lenX = o.x1 - o.x0 >= o.z1 - o.z0, L = lenX ? o.x1 - o.x0 : o.z1 - o.z0, t = o.t ?? 0.9, h = o.h ?? 1.2;
  const cx = (o.x0 + o.x1) / 2, cz = (o.z0 + o.z1) / 2;
  const lo = o.dry ? C.dryLo : C.leafLo, hi = o.dry ? C.dryHi : C.leafMid;
  for (const lod of [0, 1]) {
    const rng = mulberry(o.seed);
    b.at(cx, o.y, cz, lenX ? 0 : Math.PI / 2, 1, { lod });
    // local x = along the hedge
    const step = lod ? Math.max(3, L / 4) : 0.75, n = Math.max(1, Math.round(L / step)), st = L / n;
    const prof = (x, jit) => {
      const j = h * (lod ? 0.96 + jit : 0.8 + jit * 0.5);
      return [[x, 0, -t / 2], [x, h * 0.72, -t / 2], [x, j, -t * 0.24], [x, j, t * 0.24], [x, h * 0.72, t / 2], [x, 0, t / 2]];
    };
    let prev = null;
    for (let i = 0; i <= n; i++) {
      const x = -L / 2 + i * st, cur = prof(x, (rng() - 0.5) * 0.14);
      if (prev) {
        for (let k = 0; k < 5; k++) {
          const c = mix(lo, hi, 0.25 + 0.75 * (k === 2 ? 1 : k === 1 || k === 3 ? 0.55 : 0.2) + (rng() - 0.5) * 0.15);
          const wA = k >= 1 && k <= 3 ? 0.35 : 0.05, wB = k >= 1 && k <= 3 ? 0.35 : 0.05;
          const V = (p, w) => [p[0], p[1], p[2], c[0], c[1], c[2], w];
          b.quad(V(prev[k], wA), V(prev[k + 1], k + 1 >= 1 && k + 1 <= 3 ? 0.35 : 0.05), V(cur[k + 1], k + 1 >= 1 && k + 1 <= 3 ? 0.35 : 0.05), V(cur[k], wB));
        }
      }
      prev = cur;
    }
    if (lod === 0) for (let x = -L / 2 + 0.5; x < L / 2 - 0.2; x += 0.8) {      // a scalloped, leafy top
      blob(b, x + (rng() - 0.5) * 0.2, h * 0.8, (rng() - 0.5) * t * 0.3, 0.62, h * 0.34, t * 0.62, rng, { tpl: ICO, lo: mix(lo, hi, 0.4), hi: mix(hi, C.leafHi, 0.3), w: 0.55, w0: 0.3, jit: 0.2 });
    }
    // end caps
    for (const e of [0, 1]) {
      const x = e ? L / 2 : -L / 2, c = mul(lo, 0.85), p = prof(x, 0);
      const V = (q, w = 0.05) => [q[0], q[1], q[2], c[0], c[1], c[2], w];
      b.quad(V(p[0]), V(p[1]), V(p[4]), V(p[5]));
      b.tri(V(p[1]), V(p[2], 0.3), V(p[3], 0.3)); b.tri(V(p[1]), V(p[3], 0.3), V(p[4]));
    }
  }
}

/** A low flowerbed: o: { x,y,z, yaw, w,d, seed, flower } with a stone kerb and clumps of bloom. */
export function bed(b, o) {
  for (const lod of [0, 1]) {
    const rng = mulberry(o.seed);
    b.at(o.x, o.y, o.z, o.yaw ?? 0, 1, { lod });
    const hw = o.w / 2, hd = o.d / 2;
    box(b, -hw, 0, -hd, hw, 0.28, hd, C.stone, { shade: 0.8 });
    b.quad([-hw + 0.1, 0.27, -hd + 0.1, ...C.soil, 0], [hw - 0.1, 0.27, -hd + 0.1, ...C.soil, 0], [hw - 0.1, 0.27, hd - 0.1, ...C.soil, 0], [-hw + 0.1, 0.27, hd - 0.1, ...C.soil, 0]);
    const n = lod ? 3 : Math.max(5, Math.round(o.w * o.d * 2.2));
    for (let i = 0; i < n; i++) {
      const x = (rng() - 0.5) * (o.w - 0.4), z = (rng() - 0.5) * (o.d - 0.4), pick = rng();
      const f = pick < 0.6 ? o.flower : pick < 0.8 ? C.marigold : C.jasmine;
      blob(b, x, 0.4 + rng() * 0.12, z, 0.24 + rng() * 0.1, 0.2, 0.24 + rng() * 0.1, rng, { tpl: OCT, lo: mix(C.leafLo, f, 0.35), hi: f, w: 0.9, w0: 0.5, jit: 0.2 });
    }
  }
}

/** Lawn: a lumpy mat of grass over free cells. o: { cells:[[x,z,size]], y, seed } (LOD 1: the same cells, flat). Plus tufts at lod 0. */
export function lawn(b, o) {
  const lumps = new Map();
  const rng0 = mulberry(o.seed);
  const hv = (x, z) => { const k = `${Math.round(x * 4)},${Math.round(z * 4)}`; if (!lumps.has(k)) lumps.set(k, rng0()); return lumps.get(k); };
  for (const lod of [0, 1]) {
    const rng = mulberry(o.seed ^ 0x55);
    for (const [x, z, s] of o.cells) {
      b.at(x, o.y, z, 0, 1, { lod });
      const h = s / 2;
      const V = (px, pz) => { const lump = lod ? 0 : hv(x + px, z + pz) * 0.06; const c = mix(mul(C.leafLo, 1.1), C.leafMid, 0.35 + hv(x + px, z + pz) * 0.65); return [px, 0.09 + lump, pz, c[0], c[1], c[2], 0.04]; };
      b.quad(V(-h, -h), V(h, -h), V(h, h), V(-h, h));
      if (lod === 0 && rng() < 0.55) tuft(b, (rng() - 0.5) * s * 0.8, 0.09, (rng() - 0.5) * s * 0.8, rng, 0.28 + rng() * 0.2);
    }
  }
}

/** a few blades of grass (3 triangles, rooted at the point) in the current local frame */
export function tuft(b, x, y, z, rng, h, lo = C.leafMid, hi = C.leafYel) {
  for (let i = 0; i < 3; i++) {
    const a = rng() * 6.28, s = 0.07 + rng() * 0.05, c = mix(lo, hi, rng());
    b.tri([x - Math.sin(a) * s, y, z + Math.cos(a) * s, c[0] * 0.55, c[1] * 0.55, c[2] * 0.55, 0], [x + Math.sin(a) * s, y, z - Math.cos(a) * s, c[0] * 0.55, c[1] * 0.55, c[2] * 0.55, 0], [x + Math.cos(a) * h * 0.4, y + h, z + Math.sin(a) * h * 0.4, c[0], c[1], c[2], 1]);
  }
}

// ------------------------------------------------------------------ creepers: bougainvillea on the railings
/**
 * A strand of bougainvillea laid along a railing. o: { x0,z0,x1,z1 (the line, axis aligned), y, side:[nx,nz] (which way is "in"),
 * seed, density 0..1 }. Magenta bracts over green leaves, with tendrils hanging on the inside face.
 */
export function creeper(b, o) {
  const dx = o.x1 - o.x0, dz = o.z1 - o.z0, L = Math.hypot(dx, dz), ux = dx / (L || 1), uz = dz / (L || 1);
  const cx = (o.x0 + o.x1) / 2, cz = (o.z0 + o.z1) / 2, yaw = Math.atan2(-uz, ux);   // local +x runs along the strand
  for (const lod of [0, 1]) {
    const rng = mulberry(o.seed);
    b.at(cx, o.y, cz, -Math.atan2(uz, ux), 1, { lod });
    // local frame: x along the strand, z: +z is... decide the inside via sign
    const inz = (() => { const loc = { x: o.side[0] * Math.cos(yaw) - o.side[1] * Math.sin(yaw), z: o.side[0] * Math.sin(yaw) + o.side[1] * Math.cos(yaw) }; return loc.z >= 0 ? 1 : -1; })();
    if (lod === 0) {
      const step = 0.24 / (0.55 + 0.45 * (o.density ?? 1));
      for (let x = -L / 2 + 0.25; x < L / 2 - 0.15; x += step) {
        const y = 0.3 + rng() * 0.95, zz = inz * (0.02 + rng() * 0.12), r = 0.15 + rng() * 0.13;
        blob(b, x + (rng() - 0.5) * 0.2, y, zz, r, r * 0.85, r, rng, { tpl: OCT, lo: C.leafLo, hi: C.leafMid, w: 0.85, w0: 0.2, jit: 0.2 });
        for (let k = 0; k < 3; k++) {       // magenta bracts: little paper-like flat flowers
          if (rng() > 0.85) continue;
          const fx = x + (rng() - 0.5) * 0.4, fy = y + (rng() - 0.25) * 0.4, fz = zz + inz * (0.08 + rng() * 0.14), c = rng() < 0.7 ? C.magenta : C.magentaHi, s = 0.09 + rng() * 0.07, a = rng() * 3;
          const ca = Math.cos(a) * s, sa = Math.sin(a) * s;
          b.quad([fx - ca, fy - sa, fz, ...mul(c, 0.85), 0.9], [fx + sa, fy - ca, fz + s * 0.3, ...c, 0.9], [fx + ca, fy + sa, fz, ...c, 0.9], [fx - sa, fy + ca, fz + s * 0.3, ...mul(c, 0.9), 0.9]);
        }
        if (rng() < 0.32) {   // a tendril hanging on the inside face
          const tx = x + (rng() - 0.5) * 0.3, len = 0.5 + rng() * 0.7, c = mix(C.leafMid, C.magenta, 0.45 + rng() * 0.3);
          b.quad([tx - 0.07, 1.2, inz * 0.1, ...C.leafMid, 0.4], [tx + 0.07, 1.2, inz * 0.1, ...C.leafMid, 0.4], [tx + 0.04, 1.2 - len, inz * 0.16, ...c, 1], [tx - 0.04, 1.2 - len, inz * 0.16, ...c, 1]);
        }
      }
    } else {
      const seg = Math.max(2.4, L / 3), n = Math.max(1, Math.round(L / seg)), st = L / n;
      for (let i = 0; i < n; i++) {
        const x0 = -L / 2 + i * st, x1 = x0 + st, c1 = mix(C.leafMid, C.magenta, 0.4 + rng() * 0.3), c2 = mix(C.leafLo, C.magentaHi, 0.35 + rng() * 0.25);
        b.quad([x0, 0.3, inz * 0.08, ...c2, 0.4], [x1, 0.3, inz * 0.08, ...c2, 0.4], [x1, 1.25, inz * 0.1, ...c1, 0.7], [x0, 1.25, inz * 0.1, ...c1, 0.7]);
      }
    }
  }
}

// ------------------------------------------------------------------ bougainvillea draped down the outside of a roof edge
/**
 * Strands of creeper hanging from a rail down the outer face of a deck or roof: the green you see from the street below.
 * o: { x0,z0,x1,z1 (the line along the edge, axis aligned, just outside the wall), y (top, rail height), out:[nx,nz] (away from the
 * deck), seed, maxLen }
 */
export function drape(b, o) {
  const dx = o.x1 - o.x0, dz = o.z1 - o.z0, L = Math.hypot(dx, dz), ux = dx / (L || 1), uz = dz / (L || 1);
  const cx = (o.x0 + o.x1) / 2, cz = (o.z0 + o.z1) / 2, yaw = Math.atan2(-uz, ux);
  const outz = (o.out[0] * Math.sin(yaw) + o.out[1] * Math.cos(yaw)) >= 0 ? 1 : -1;
  for (const lod of [0, 1]) {
    const rng = mulberry(o.seed);
    b.at(cx, o.y, cz, yaw, 1, { lod });
    const step = lod ? 1.9 : 0.8;
    for (let x = -L / 2 + 0.25; x < L / 2 - 0.1; x += step) {
      const len = 1.4 + rng() * (o.maxLen ?? 6), wd = lod ? 1.2 : 0.14 + rng() * 0.1, flowery = rng() < 0.72, zz = outz * 0.12;
      let px = x, pw = wd;
      const segs = lod ? 1 : 3;
      for (let k = 0; k < segs; k++) {
        const t0 = k / segs, t1 = (k + 1) / segs, y0 = -len * t0, y1 = -len * t1, nx = x + (rng() - 0.5) * 0.25;
        const c0 = mix(C.leafLo, C.leafMid, 0.4 + 0.3 * rng()), c1 = mix(C.leafMid, flowery && lod ? C.magenta : C.leafHi, flowery && lod ? 0.55 : 0.5 + 0.3 * rng());
        b.quad([px - pw, y0, zz, ...c0, 0.15 + 0.5 * t0], [px + pw, y0, zz, ...c0, 0.15 + 0.5 * t0], [nx + pw * 0.8, y1, zz + outz * 0.05, ...c1, 0.3 + 0.7 * t1], [nx - pw * 0.8, y1, zz + outz * 0.05, ...c1, 0.3 + 0.7 * t1]);
        px = nx; pw *= 0.8;
      }
      if (!lod) {
        for (let k = 0; k < 1 + Math.floor(len / 3); k++) {      // leaf clusters along the strand
          const fy = -len * (0.1 + 0.85 * rng()), r = 0.15 + rng() * 0.1;
          blob(b, x + (rng() - 0.5) * 0.2, fy, zz + outz * 0.1, r, r * 1.2, r, rng, { tpl: OCT, lo: C.leafLo, hi: C.leafHi, w: 0.5 + 0.5 * (-fy / len), w0: 0.3, jit: 0.2 });
        }
        if (flowery) for (let k = 0; k < 2 + Math.floor(len / 2.5); k++) {
          const fy = -len * (0.1 + 0.85 * rng()), fx = x + (rng() - 0.5) * 0.35, s2 = 0.09 + rng() * 0.07, c = rng() < 0.7 ? C.magenta : C.magentaHi;
          b.quad([fx - s2, fy, zz + outz * 0.12, ...c, 0.9], [fx, fy - s2, zz + outz * 0.15, ...c, 0.9], [fx + s2, fy, zz + outz * 0.12, ...c, 0.9], [fx, fy + s2, zz + outz * 0.15, ...c, 0.9]);
        }
      }
    }
  }
}

// ------------------------------------------------------------------ pots and buckets

/** A rusty paint bucket of money plant, in the current local frame at (ox,oy,oz): the vines trail over the rim. */
function bucketLocal(b, rng, lod, ox, oy, oz) {
  const cc = [C.bucketBlue, C.bucketRed, C.bucketWhite, C.bucketYellow, C.bucketGreen][Math.floor(rng() * 5)], sides = lod ? 5 : 8;
  limb(b, [ox, oy, oz], [ox, oy + 0.32, oz], 0.15, 0.2, sides, mul(cc, 0.8), cc);
  b.quad([ox - 0.2, oy + 0.32, oz - 0.2, ...C.soil, 0], [ox + 0.2, oy + 0.32, oz - 0.2, ...C.soil, 0], [ox + 0.2, oy + 0.32, oz + 0.2, ...C.soil, 0], [ox - 0.2, oy + 0.32, oz + 0.2, ...C.soil, 0]);
  if (lod) { blob(b, ox, oy + 0.45, oz, 0.3, 0.2, 0.3, rng, { tpl: OCT, lo: C.leafLo, hi: C.leafHi, w: 0.3 }); return; }
  blob(b, ox, oy + 0.45, oz, 0.2, 0.15, 0.2, rng, { tpl: OCT, lo: C.leafLo, hi: C.leafHi, w: 0.8, w0: 0.3 });
  for (let v = 0; v < 4; v++) {
    const a = rng() * 6.28, len = 0.35 + rng() * 0.5;
    for (let k = 0; k < 5; k++) {
      const t = k / 5, px = ox + Math.cos(a) * (0.2 + t * 0.06), pz = oz + Math.sin(a) * (0.2 + t * 0.06), py = oy + 0.36 - t * len, s = 0.075 + rng() * 0.03, c = mix(C.leafMid, C.leafYel, rng());
      b.tri([px - s, py, pz, ...c, 0.9], [px + s, py, pz, ...c, 0.9], [px, py - s * 1.5, pz + s * 0.3, ...mul(c, 0.8), 1]);
      b.tri([px, py + s, pz, ...mul(c, 1.05), 0.7], [px - s, py, pz, ...c, 0.9], [px + s, py, pz, ...c, 0.9]);
    }
  }
}

/** A pot with a plant. o: { x,y,z, seed, kind:'terracotta'|'concrete'|'tulsi'|'bucket', r, flower } */
export function pot(b, o) {
  for (const lod of [0, 1]) {
    const rng = mulberry(o.seed);
    b.at(o.x, o.y, o.z, rng() * 6.28, 1, { lod });
    const r = o.r ?? 0.24, h = (o.kind === 'concrete' ? 0.8 : 0.5) * (o.r ? o.r / 0.24 : 1);
    if (o.kind === 'bucket') { bucketLocal(b, rng, lod, 0, 0, 0); continue; }
    const body = o.kind === 'concrete' ? C.concrete : C.terracotta, sides = lod ? 5 : 8;
    limb(b, [0, 0, 0], [0, h, 0], r * 0.72, r, sides, mul(body, 0.7), body);
    limb(b, [0, h, 0], [0, h + 0.06, 0], r * 1.06, r * 1.06, sides, mul(body, 0.95), mul(body, 1.05));
    b.quad([-r, h + 0.05, -r, ...C.soil, 0], [r, h + 0.05, -r, ...C.soil, 0], [r, h + 0.05, r, ...C.soil, 0], [-r, h + 0.05, r, ...C.soil, 0]);
    if (o.kind === 'tulsi') {   // holy basil: a small dense dark-green bush with purple flower spikes
      blob(b, 0, h + 0.28, 0, r * 0.95, 0.3, r * 0.95, rng, { tpl: lod ? OCT : ICO, lo: C.leafLo, hi: C.leafMid, w: 0.9, w0: 0.3, jit: 0.15 });
      if (!lod) for (let i = 0; i < 5; i++) { const a = rng() * 6.28, d = rng() * r * 0.6; blob(b, Math.cos(a) * d, h + 0.5 + rng() * 0.12, Math.sin(a) * d, 0.05, 0.1, 0.05, rng, { tpl: TET, lo: C.purple, hi: mix(C.purple, [1, 1, 1], 0.3), w: 0.9 }); }
    } else {
      blob(b, 0, h + 0.3, 0, r * 1.25, 0.34, r * 1.25, rng, { tpl: lod ? OCT : ICO, lo: C.leafLo, hi: C.leafHi, w: 0.9, w0: 0.3, jit: 0.16 });
      if (o.flower && !lod) for (let i = 0; i < 5; i++) { const a = rng() * 6.28, d = rng() * r; blob(b, Math.cos(a) * d, h + 0.5 + rng() * 0.15, Math.sin(a) * d, 0.1, 0.08, 0.1, rng, { tpl: TET, lo: o.flower, hi: o.flower, w: 0.9, w0: 0.4 }); }
    }
  }
}

/** A square concrete planter holding a tree or palm: o: { x,y,z, w, h } (the plant is placed by the caller) */
export function planterBox(b, o) {
  for (const lod of [0, 1]) {
    b.at(o.x, o.y, o.z, 0, 1, { lod });
    const hw = o.w / 2;
    box(b, -hw, 0, -hw, hw, o.h, hw, o.dark ? C.concreteDark : C.concrete, { shade: 0.82 });
    b.quad([-hw + 0.08, o.h + 0.01, -hw + 0.08, ...C.soil, 0], [hw - 0.08, o.h + 0.01, -hw + 0.08, ...C.soil, 0], [hw - 0.08, o.h + 0.01, hw - 0.08, ...C.soil, 0], [-hw + 0.08, o.h + 0.01, hw - 0.08, ...C.soil, 0]);
  }
}

/** Garden light: a spike with a warm lamp head (glows; the planter is uplit by it at night). */
export function gardenLight(b, o) {
  for (const lod of [0, 1]) {
    b.at(o.x, o.y, o.z, 0, 1, { lod });
    if (lod === 0) box(b, -0.04, 0, -0.04, 0.04, 0.38, 0.04, C.steel, { shade: 0.9 });
    b.glow = 1;
    const c = C.lampWarm;
    if (lod === 0) { b.tri([-0.1, 0.38, 0, ...c, 0], [0.1, 0.38, 0, ...c, 0], [0, 0.55, 0.0, ...c, 0]); b.tri([0, 0.38, -0.1, ...c, 0], [0, 0.38, 0.1, ...c, 0], [0, 0.55, 0, ...c, 0]); }
    else b.tri([-0.12, 0.3, 0, ...c, 0], [0.12, 0.3, 0, ...c, 0], [0, 0.55, 0, ...c, 0]);
    b.glow = 0;
  }
}

// ------------------------------------------------------------------ the vertical garden (green wall)
/**
 * A green-wall bay on a tower face. o: { ax,az, bx,bz (base line of the panel in world, a to b), nx,nz (outward normal), y0,y1, seed }.
 * The leaf-textured panel (layer B) hangs 0.4 m off the facade, framed in dark steel, with planter troughs every 7 m of height that
 * spill foliage, and lit irrigation lines (cyan, glow) feeding each trough.
 */
export function greenWall(b, o) {
  const len = Math.hypot(o.bx - o.ax, o.bz - o.az), h = o.y1 - o.y0, off = 0.42;
  const px = (t, d) => [o.ax + (o.bx - o.ax) * t + o.nx * d, o.az + (o.bz - o.az) * t + o.nz * d];
  const mx = (o.ax + o.bx) / 2 + o.nx * off, mz = (o.az + o.bz) / 2 + o.nz * off;
  const tx = (o.bx - o.ax) / len, tz = (o.bz - o.az) / len;
  const yaw = -Math.atan2(tz, tx);   // local +x along the panel
  // layer B: the panel (one quad; the texture repeats every 2.4 m)
  for (const lod of [0, 1]) {
    b.at(mx, o.y0, mz, yaw, 1, { layer: 'B', lod });
    const hl = len / 2, u = len / 2.4, v = h / 2.4, c = [1.5, 1.5, 1.5];
    const V = (x, y) => [x, y, 0, c[0], c[1], c[2], 0.03 * (y / h)];
    b.quad(V(-hl, 0), V(hl, 0), V(hl, h), V(-hl, h), [[0, 0], [u, 0], [u, v], [0, v]]);
  }
  // layer A: frame, troughs, foliage spill, irrigation
  const rng = mulberry(o.seed);
  for (const lod of [0, 1]) {
    b.at(mx, o.y0, mz, yaw, 1, { lod });
    const hl = len / 2;
    box(b, -hl - 0.12, 0, -0.08, -hl + 0.1, h, 0.12, C.steel, { shade: 0.9 });
    box(b, hl - 0.1, 0, -0.08, hl + 0.12, h, 0.12, C.steel, { shade: 0.9 });
    if (lod === 0) {
      const flip = o.nx * Math.sin(yaw) + o.nz * Math.cos(yaw);     // is local +z outward?
      const out = (o.nx * Math.sin(yaw) + o.nz * Math.cos(yaw)) >= 0 ? 1 : -1;
      void flip;
      for (let y = 0; y < h - 1; y += 7) {
        box(b, -hl, y, 0, hl, y + 0.5, out * 0.75, C.concreteDark, { shade: 0.85 });
        for (let x = -hl + 0.6; x < hl; x += 1.5) {
          blob(b, x + (rng() - 0.5) * 0.3, y + 0.75, out * (0.35 + rng() * 0.2), 0.62, 0.38, 0.5, rng, { lo: C.leafLo, hi: rng() < 0.2 ? C.leafYel : C.leafHi, w: 0.9, w0: 0.3, jit: 0.2 });
          if (rng() < 0.4) b.quad([x - 0.1, y + 0.4, out * 0.7, ...C.leafMid, 0.4], [x + 0.1, y + 0.4, out * 0.7, ...C.leafMid, 0.4], [x + 0.05, y - 1.3 - rng() * 1.6, out * 0.62, ...C.leafHi, 1], [x - 0.05, y - 1.3 - rng() * 1.6, out * 0.62, ...C.leafHi, 1]);
        }
        // irrigation: a lit line along each trough and a lit riser between troughs
        b.glow = 1;
        const gz = out * 0.76;
        b.quad([-hl, y + 0.52, gz, ...C.cyan, 0], [hl, y + 0.52, gz, ...C.cyan, 0], [hl, y + 0.6, gz, ...C.cyan, 0], [-hl, y + 0.6, gz, ...C.cyan, 0]);
        b.glow = 0;
      }
    }
    b.glow = 1;   // the feed pipe up the left post and a dripline across the middle of each 3.5 m
    const out2 = (o.nx * Math.sin(yaw) + o.nz * Math.cos(yaw)) >= 0 ? 1 : -1;
    b.quad([-hl + 0.18, 0, out2 * 0.14, ...C.cyan, 0], [-hl + 0.28, 0, out2 * 0.14, ...C.cyan, 0], [-hl + 0.28, h, out2 * 0.14, ...C.cyan, 0], [-hl + 0.18, h, out2 * 0.14, ...C.cyan, 0]);
    if (lod === 0) for (let y = 3.5; y < h; y += 3.5) b.quad([-hl + 0.2, y, out2 * 0.1, ...mul(C.cyan, 0.8), 0], [hl - 0.2, y, out2 * 0.1, ...mul(C.cyan, 0.8), 0], [hl - 0.2, y + 0.05, out2 * 0.1, ...mul(C.cyan, 0.8), 0], [-hl + 0.2, y + 0.05, out2 * 0.1, ...mul(C.cyan, 0.8), 0]);
    b.glow = 0;
  }
  void px;
}

// ------------------------------------------------------------------ balconies and kitchen gardens (making do)
/**
 * A cantilevered balcony kitchen garden on a tower face: slab, rail, raised crate beds with vegetables and chillies, bamboo canes,
 * paint buckets of money plant, a water drum, and a bougainvillea trailing off the front. o: { x,y,z (middle of the facade side of the
 * slab), nx,nz (outward normal), w, d, seed }.
 */
export function balcony(b, o) {
  for (const lod of [0, 1]) {
    const rng = mulberry(o.seed);
    b.at(o.x, o.y, o.z, Math.atan2(o.nx, o.nz), 1, { lod });   // local +z = outward
    const hw = o.w / 2, d = o.d;
    box(b, -hw, -0.28, 0, hw, 0, d, C.concrete, { shade: 0.8, bottom: true });
    if (lod === 1) { blob(b, 0, 0.4, d * 0.6, hw * 0.8, 0.4, d * 0.4, rng, { tpl: OCT, lo: C.dryLo, hi: C.leafHi, w: 0.5 }); continue; }
    // rail: posts and a top bar
    for (let x = -hw; x <= hw + 0.01; x += o.w / 4) box(b, x - 0.03, 0, d - 0.06, x + 0.03, 1.0, d, C.steel, { shade: 0.9 });
    box(b, -hw, 0.95, d - 0.06, hw, 1.02, d, C.steel, { shade: 0.9 });
    box(b, -hw, 0, 0, -hw + 0.06, 1.0, d, C.steel, { shade: 0.9 }); box(b, hw - 0.06, 0, 0, hw, 1.0, d, C.steel, { shade: 0.9 });
    // two crate beds with vegetables
    for (let i = 0; i < 2; i++) {
      const bx = -hw * 0.45 + i * hw * 0.9, bw = hw * 0.62;
      box(b, bx - bw, 0, d * 0.28, bx + bw, 0.32, d * 0.28 + 0.55, C.wood, { shade: 0.8 });
      for (let k = 0; k < 4; k++) {
        const kind = rng();
        const c = kind < 0.4 ? C.veg : kind < 0.6 ? C.vegPurple : C.leafMid;
        blob(b, bx - bw + (k + 0.5) * (bw * 2) / 4, 0.5, d * 0.28 + 0.28, 0.2, 0.17, 0.2, rng, { tpl: OCT, lo: mul(c, 0.7), hi: c, w: 0.8, w0: 0.3 });
        if (kind > 0.8) blob(b, bx - bw + (k + 0.5) * (bw * 2) / 4 + 0.06, 0.45, d * 0.28 + 0.4, 0.05, 0.05, 0.05, rng, { tpl: TET, lo: C.chilli, hi: C.chilli, w: 0.8 });
      }
      // bamboo canes tied in a wigwam
      for (let k = 0; k < 3; k++) { const a = k * 2.1 + i; limb(b, [bx + Math.cos(a) * 0.2, 0.32, d * 0.28 + 0.28 + Math.sin(a) * 0.12], [bx, 1.35, d * 0.28 + 0.28], 0.015, 0.012, 3, C.wood, C.wood); }
    }
    // paint buckets of money plant on the slab edge, and a water drum
    bucketLocal(b, rng, lod, -hw * 0.75, 0, d * 0.5);
    limb(b, [hw * 0.8, 0, d * 0.5], [hw * 0.8, 0.8, d * 0.5], 0.28, 0.28, 8, mul(C.bucketBlue, 0.75), C.bucketBlue);
    b.glow = 1;      // a lantern and a string of bulbs: somebody lives here
    for (let x = -hw + 0.2; x <= hw - 0.1; x += (o.w - 0.4) / 5) b.tri([x - 0.05, 1.08, d - 0.02, ...C.lampWarm, 0], [x + 0.05, 1.08, d - 0.02, ...C.lampWarm, 0], [x, 0.98, d - 0.02, ...C.lampWarm, 0]);
    b.quad([hw * 0.55 - 0.1, 1.7, d * 0.5, ...C.lampWarm, 0], [hw * 0.55 + 0.1, 1.7, d * 0.5, ...C.lampWarm, 0], [hw * 0.55 + 0.1, 1.45, d * 0.5, ...C.lampWarm, 0], [hw * 0.55 - 0.1, 1.45, d * 0.5, ...C.lampWarm, 0]);
    b.glow = 0;
    // creeper off the front rail
    for (let x = -hw + 0.3; x < hw - 0.2; x += 0.5) {
      blob(b, x, 0.9 + rng() * 0.15, d - 0.05, 0.22, 0.2, 0.2, rng, { tpl: OCT, lo: C.leafLo, hi: C.leafMid, w: 0.85, w0: 0.2 });
      if (rng() < 0.55) blob(b, x + 0.1, 1.02, d + 0.08, 0.1, 0.09, 0.1, rng, { tpl: TET, lo: C.magenta, hi: C.magentaHi, w: 0.9, w0: 0.5 });
      if (rng() < 0.5) b.quad([x - 0.08, 0.9, d + 0.04, ...C.leafMid, 0.4], [x + 0.08, 0.9, d + 0.04, ...C.leafMid, 0.4], [x + 0.04, -0.2 - rng() * 1.1, d + 0.06, ...C.magenta, 1], [x - 0.04, -0.2 - rng() * 1.1, d + 0.06, ...C.leafHi, 1]);
    }
  }
}

/** A small roof kitchen garden patch (raised beds, canes, a tank and buckets) on a flat roof. o: { x,y,z, yaw, w,d, seed } */
export function kitchenGarden(b, o) {
  for (const lod of [0, 1]) {
    const rng = mulberry(o.seed);
    b.at(o.x, o.y, o.z, o.yaw ?? 0, 1, { lod });
    const hw = o.w / 2, hd = o.d / 2, rows = Math.max(2, Math.floor(o.d / 1.6));
    for (let r = 0; r < rows; r++) {
      const z = -hd + (r + 0.5) * (o.d / rows);
      box(b, -hw + 0.4, 0, z - 0.45, hw - 0.4, 0.3, z + 0.45, C.woodDark, { shade: 0.85 });
      const n = lod ? 2 : Math.floor((o.w - 0.8) / 0.55);
      for (let k = 0; k < n; k++) {
        const x = lod ? (k ? hw * 0.4 : -hw * 0.4) : -hw + 0.7 + k * 0.55, kind = rng(), c = kind < 0.45 ? C.veg : kind < 0.7 ? C.vegPurple : kind < 0.88 ? C.leafMid : C.chilli;
        blob(b, x, 0.46, z + (rng() - 0.5) * 0.3, lod ? 0.55 : 0.22, 0.2, lod ? 0.35 : 0.22, rng, { tpl: OCT, lo: mul(c, 0.7), hi: c, w: 0.8, w0: 0.3 });
      }
    }
    if (lod === 0) {
      for (let k = 0; k < 2; k++) { const x = -hw * 0.3 + k * hw * 0.6, z = -hd + 0.8; for (let i = 0; i < 3; i++) { const a = i * 2.1; limb(b, [x + Math.cos(a) * 0.25, 0.3, z + Math.sin(a) * 0.25], [x, 1.5, z], 0.015, 0.012, 3, C.wood, C.wood); } blob(b, x, 1.0, z, 0.22, 0.4, 0.22, rng, { tpl: OCT, lo: C.leafLo, hi: C.leafMid, w: 0.8, w0: 0.4 }); }
      limb(b, [hw - 0.35, 0, hd - 0.35], [hw - 0.35, 1.0, hd - 0.35], 0.4, 0.4, 8, mul(C.bucketBlue, 0.7), C.bucketBlue);
      limb(b, [hw - 0.35, 1.0, hd - 0.35], [hw - 0.35, 1.08, hd - 0.35], 0.42, 0.42, 8, C.steel, C.steel);
    }
  }
}
