// Baking the crowd's bodies from the cast's character builder (Phase 8D).
//
// The named cast is built by src/characters/body.js (lofted smooth limbs, hands, hair, saris, kurtas). The crowd must look like that
// cast but cost a fraction of it, so each crowd body is the SAME builder run once at start-up on a spec whose colours are *marker
// colours* (pure red = skin, green = top, blue = bottom, yellow = accent, magenta = hair, cyan = shoes), at a reduced segment count
// (an LOD profile that thins the lofts), and then converted into instanceable geometry:
//
//   position, normal           the bind pose (a neutral standing person, feet at y = 0, facing -Z)
//   color (vec3)               for a palette vertex: the shade (marker brightness) in .r; for a fixed vertex: its own colour
//   aBone (vec4)               (bone class a, bone class b, weight of b, material class 0 fixed | 1 skin | 2 top | 3 bottom | 4 accent | 5 hair | 6 shoes)
//   uv (vec2)                  face-projection coordinates for the head's skin (a cell-local 0..1 patch), (-9, -9) elsewhere
//
// The vertex shader (people.js) swings the bone classes (hips, thighs, shins, feet, upper arms, forearms, spine/chest, braid/cloak)
// with a procedural walk cycle, so every person walks like the cast (same bind pose, same pivots, same swing) from one instanced mesh.
import * as THREE from '../../../vendor/three.module.js';
import { buildBodyGeometry, B, dimsOf } from '../../characters/body.js';
import { MeshBuilder } from '../../characters/loft.js';
import { npcSpec } from '../../characters/specs.js';

/** Marker colours, in the order of the material classes 1..6. */
export const MARK = { skin: 0xff0000, top: 0x00ff00, bottom: 0x0000ff, accent: 0xffff00, hair: 0xff00ff, shoes: 0x00ffff };
export const CLASS = { fixed: 0, skin: 1, top: 2, bottom: 3, accent: 4, hair: 5, shoes: 6 };
const MARK_DIR = Object.entries(MARK).map(([k, hex]) => { const c = new THREE.Color(hex); return { cls: CLASS[k], d: [c.r, c.g, c.b] }; });

/** The bone classes the shader animates. */
export const BC = { hips: 0, thighL: 1, shinL: 2, thighR: 3, shinR: 4, uarmL: 5, farmL: 6, uarmR: 7, farmR: 8, footL: 9, footR: 10, upper: 11, cloth: 12 };
const BONE_CLASS = {
  [B.hips]: BC.hips, [B.spine]: BC.upper, [B.chest]: BC.upper, [B.neck]: BC.upper, [B.head]: BC.upper,
  [B.uarmL]: BC.uarmL, [B.farmL]: BC.farmL, [B.handL]: BC.farmL, [B.uarmR]: BC.uarmR, [B.farmR]: BC.farmR, [B.handR]: BC.farmR,
  [B.thighL]: BC.thighL, [B.shinL]: BC.shinL, [B.footL]: BC.footL, [B.thighR]: BC.thighR, [B.shinR]: BC.shinR, [B.footR]: BC.footR,
  [B.braid1]: BC.upper, [B.braid2]: BC.cloth, [B.braid3]: BC.cloth, [B.cloak1]: BC.cloth, [B.cloak2]: BC.cloth,
};

// ------------------------------------------------------------------------------------------ the people (the 8 bodies)
const m = MARK;
const SPECS = {
  // a man in a short-sleeved shirt and trousers
  shirt: { height: 1.7, spec: { sex: 'm', hair: { style: 'short' }, top: { length: 'shirt', sleeves: 'short' }, bottom: { style: 'trousers' } } },
  // a man in a kurta and pyjama
  kurta: { height: 1.68, spec: { sex: 'm', hair: { style: 'side' }, top: { length: 'kurta', sleeves: 'long' }, bottom: { style: 'salwar' }, facial: 'moustache' } },
  // a woman in a sari: blouse, bare midriff, pallu over the shoulder
  sari: { height: 1.56, spec: { sex: 'f', build: 'slim', hair: { style: 'bun' }, top: { length: 'sari', sleeves: 'short' }, bottom: { style: 'salwar' }, scarf: { color: m.bottom, trim: m.accent, style: 'sash' }, props: ['bangles'] } },
  // a woman in a salwar kameez with a dupatta
  salwar: { height: 1.55, spec: { sex: 'f', build: 'slim', hair: { style: 'braid', tie: m.accent }, top: { length: 'kurta', sleeves: 'long' }, bottom: { style: 'salwar' }, scarf: { color: m.accent, trim: m.bottom, style: 'neck' } } },
  // an older man in a lungi, barefoot, grey stubble
  lungi: { height: 1.62, spec: { sex: 'm', age: 0.7, build: 'slim', hair: { style: 'balding' }, facial: 'stubble', top: { length: 'shirt', sleeves: 'short' }, bottom: { style: 'lungi' }, shoes: null, barefoot: true } },
  // a child
  child: { height: 1.2, spec: { sex: 'm', build: 'child', hair: { style: 'short' }, top: { length: 'tee', sleeves: 'short' }, bottom: { style: 'shorts' } } },
  // a rescue worker in hi-vis, with a hard hat
  worker: { height: 1.74, spec: { sex: 'm', hair: { style: 'crop' }, top: { length: 'shirt', sleeves: 'long' }, bottom: { style: 'trousers' }, jacket: { color: m.top, stripe: m.accent }, props: ['hardHat'] } },
  // a well-dressed L3 resident: a long coat over a shirt
  rich: { height: 1.76, spec: { sex: 'm', hair: { style: 'slick' }, top: { length: 'coat', inner: m.accent, sleeves: 'long' }, bottom: { style: 'trousers' }, facial: 'stubble' } },
};
export const VARIANTS = Object.keys(SPECS);

function specOf(key) {
  const V = SPECS[key];
  const s = npcSpec({
    name: 'crowd-' + key, height: V.height, skin: m.skin, shoes: m.shoes,
    hair: { color: m.hair }, top: { color: m.top, trim: m.accent }, bottom: { color: m.bottom },
    ...V.spec,
    hair: { color: m.hair, ...(V.spec.hair ?? {}) }, top: { color: m.top, trim: m.accent, ...(V.spec.top ?? {}) }, bottom: { color: m.bottom, ...(V.spec.bottom ?? {}) },
  });
  if (V.spec.scarf === undefined) s.scarf = null;
  if (V.spec.jacket === undefined) s.jacket = null;
  return s;
}

// ------------------------------------------------------------------------------------------ LOD profiles
//   seg: scale of the segment counts of every loft; minSeg; headSeg: the head keeps its ring count for the face; ringKeep: drop every
//   second ring of the long tubes except where the colour changes; minBlob: ellipsoids smaller than this (m) are left out; rods and
//   ribbons (cane, pleats, collar) are left out at the coarse level.
export const LOD = {
  high: { seg: 0.5, minSeg: 6, headSeg: 12, hairInflate: 1.04, hairRings: 7, maxRings: 6, headRings: 8, minBlob: 0.0, minThin: 0.015, blobSmall: [5, 3], blobMid: [6, 4], blobBig: [7, 4], ribbons: true, rods: true },
  low: { seg: 0.25, minSeg: 4, headSeg: 6, hairInflate: 1.22, hairRings: 4, maxRings: 3, headRings: 4, minBlob: 0.06, minThin: 0.02, blobSmall: [5, 3], blobMid: [5, 3], blobBig: [5, 3], ignoreEnds: true, ribbons: 'big', rods: false },
};

// same marker class (a shade of the same colour counts as the same)
const sameColor = (a, b) => {
  if (!a || !b) return a === b;
  const x = a.isColor ? a : new THREE.Color(a), y = b.isColor ? b : new THREE.Color(b), mx = Math.max(x.r, x.g, x.b, 1e-6), my = Math.max(y.r, y.g, y.b, 1e-6);
  return Math.hypot(x.r / mx - y.r / my, x.g / mx - y.g / my, x.b / mx - y.b / my) < 0.12;
};

/** Segment and ring counts of an ellipsoid at this level: the small ones (fingers, ears, the nose) get the fewest. */
function blobRes(b, prof) {
  const r = Math.max(b.rx, b.ry, b.rz), [s0, r0] = r < 0.05 ? prof.blobSmall : r < 0.1 ? prof.blobMid : prof.blobBig;
  return { seg: Math.min(s0, b.seg ?? 8), rings: Math.min(r0, b.rings ?? 6) };
}

function withLod(prof, fn) {
  const P = MeshBuilder.prototype, o = { tube: P.tube, blob: P.blob, rod: P.rod, ribbon: P.ribbon };
  // a coarser polygon has less area than the circle it replaces: grow the radii so a limb keeps its thickness
  const area = (n) => Math.sqrt(Math.PI / (0.5 * n * Math.sin(2 * Math.PI / n)));
  P.tube = function (rings, opts = {}) {
    const seg0 = opts.seg ?? 10;
    const head = opts.cap0 && opts.cap1 && rings.length === 10 && seg0 === 16;
    const hair = !head && (seg0 === 26 || (opts.cap1 && rings.length <= 9 && seg0 >= 12));        // hair, hats, turbans: must stay outside the skull
    if (prof.noTorsoSkin && seg0 === 16 && opts.p === 2.25 && opts.cap0 && !opts.cap1) return this;       // the bare torso under a shirt (hidden, and it pokes through a coarse one)
    const seg = head || hair ? prof.headSeg : Math.max(prof.minSeg, Math.round(seg0 * prof.seg));
    const torsoSkin = seg0 === 16 && opts.p === 2.25 && opts.cap0 && !opts.cap1;                  // the bare torso: stays inside the shirt whatever the segment count
    const infl = hair ? prof.hairInflate : torsoSkin ? 0.95 : area(seg) / area(seg0);
    const want = head ? prof.headRings : hair ? prof.hairRings : prof.maxRings;
    let rs = rings;
    if (rings.length > want + 1) {
      const keep = new Set([0, rings.length - 1]);
      for (let k = 1; k < want - 1; k++) keep.add(Math.round(k * (rings.length - 1) / (want - 1)));
      if (!head) for (let i = 1; i < rings.length - (prof.ignoreEnds ? 3 : 1); i++) if (!sameColor(rings[i].c, rings[i - 1].c) || !sameColor(rings[i].c, rings[i + 1].c) || rings[i].cf) keep.add(i);
      rs = rings.filter((r, i) => keep.has(i));
      // the ankle of a long tube: no colour gradient down the shin (the shoe is a blob of its own)
      if (prof.ignoreEnds && rs.length > 2 && rings.length > 8) rs[rs.length - 1] = { ...rs[rs.length - 1], c: rs[rs.length - 2].c };
    }
    if (infl !== 1) rs = rs.map((r) => ({ ...r, rx: r.rx * infl, rz: r.rz * infl }));
    return o.tube.call(this, rs, { ...opts, seg });
  };
  P.blob = function (b) {
    if (Math.max(b.rx, b.ry, b.rz) < prof.minBlob || Math.min(b.rx, b.ry, b.rz) < prof.minThin) return this;
    return o.blob.call(this, { ...b, ...blobRes(b, prof) });
  };
  P.rod = function (...a) { return prof.rods ? o.rod.apply(this, a) : this; };
  P.ribbon = function (rows, cols, fn2, colour, wf) {
    if (prof.ribbons === false) return this;
    if (prof.ribbons === 'big') { if (rows < 8) return this; rows = Math.max(3, Math.round(rows / 2)); }
    return o.ribbon.call(this, rows, cols, fn2, colour, wf);
  };
  try { return fn(); } finally { Object.assign(P, o); }
}

// ------------------------------------------------------------------------------------------ the face patch region (face.js: FACE_T0/T1/HW)
const FACE_T0 = 0.17, FACE_T1 = 0.80, FACE_HW = 0.34;

/**
 * Bake one body at one level of detail.
 * Returns { geometry, dims, tris, verts, pivots:[hipY, kneeY, ankleY, shoulderY, elbowY] }.
 */
export function bakeVariant(key, lodName = 'high') {
  const spec = specOf(key), prof = LOD[lodName];
  const { geometry: src, dims: D } = withLod({ ...prof, noTorsoSkin: lodName === 'low' && spec.top.length !== 'sari' }, () => buildBodyGeometry(spec));
  const out = convert(src, D, lodName === 'high');
  return { ...out, spec };
}

/** Marker-coloured, bone-weighted builder geometry -> the crowd's attribute layout (see the header). */
function convert(src, D, faceOk) {
  const n = src.attributes.position.count;
  const pos = src.attributes.position.array, col = src.attributes.color.array, si = src.attributes.skinIndex.array, sw = src.attributes.skinWeight.array;
  const nor = src.attributes.normal.array;
  const color = new Float32Array(n * 3), bone = new Float32Array(n * 4), uv = new Float32Array(n * 2).fill(-9);
  const hs = { w: (D.f ? 0.94 : 1) * (1 + 0.07 * D.kid) };
  const lo = D.chinY + FACE_T0 * D.hh - 0.01, hi = D.chinY + 0.96 * D.hh;
  for (let i = 0; i < n; i++) {
    const r = col[i * 3], g = col[i * 3 + 1], b = col[i * 3 + 2], mx = Math.max(r, g, b, 1e-6);
    // material class: the nearest marker direction, else fixed
    let cls = 0, best = 0.16;
    for (const M of MARK_DIR) { const dd = Math.hypot(r / mx - M.d[0], g / mx - M.d[1], b / mx - M.d[2]); if (dd < best) { best = dd; cls = M.cls; } }
    if (cls === 0) { color[i * 3] = r; color[i * 3 + 1] = g; color[i * 3 + 2] = b; } else { color[i * 3] = mx; color[i * 3 + 1] = mx; color[i * 3 + 2] = mx; }
    // the two strongest bone classes
    const acc = new Map();
    for (let k = 0; k < 4; k++) { const w = sw[i * 4 + k]; if (w > 0) { const c = BONE_CLASS[si[i * 4 + k]] ?? 0; acc.set(c, (acc.get(c) ?? 0) + w); } }
    const list = [...acc.entries()].sort((p, q) => q[1] - p[1]);
    const a = list[0] ? list[0][0] : 0, bb = list[1] ? list[1][0] : a, wb = list[1] ? list[1][1] / (list[0][1] + list[1][1]) : 0;
    bone[i * 4] = a; bone[i * 4 + 1] = bb; bone[i * 4 + 2] = wb; bone[i * 4 + 3] = cls;
    // the face: the skin of the head, projected flat onto the cell (the same layout as the cast's face patch)
    if (faceOk && cls === CLASS.skin && a === BC.upper && wb < 0.02 && sw[i * 4] > 0.99 && si[i * 4] === B.head) {
      const y = pos[i * 3 + 1], x = pos[i * 3], shade = mx;
      if (y > lo && y < hi && Math.abs(shade - 0.97) > 0.005) {
        const t = (y - D.chinY) / D.hh;
        uv[i * 2] = 1 - ((x / (FACE_HW * hs.w * D.hh) + 1) / 2);
        uv[i * 2 + 1] = (t - FACE_T0) / (FACE_T1 - FACE_T0);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nor), 3));
  g.setAttribute('color', new THREE.BufferAttribute(color, 3));
  g.setAttribute('aBone', new THREE.BufferAttribute(bone, 4));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(new THREE.BufferAttribute(new Uint16Array(src.index.array), 1));
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, D.H * 0.5, 0), D.H * 0.8);
  src.dispose();
  return { geometry: g, dims: D, tris: src.index.count / 3 | 0, verts: n, pivots: [D.hipY, D.kneeY, D.ankleY, D.shoulderY, D.elbowY] };
}

/**
 * The far body (beyond ~30 m): about 110 triangles, one mesh for every kind of person. Legs (uv.x = -1) show for trousers, a skirt cone
 * (uv.x = -2) shows for long garments (the shader reads the 'robe' flag, bit 4 of aAnim.w); the head carries the hair as vertex colours.
 */
export function bakeFar() {
  const spec = specOf('shirt'), D = dimsOf(spec), H = D.H, mb = new MeshBuilder();
  const c = (k) => new THREE.Color(MARK[k]);
  const wLeg = (s) => () => [[B['thigh' + s], 0.6], [B['shin' + s], 0.4]];
  for (const side of [-1, 1]) {
    const s = side < 0 ? 'L' : 'R', r0 = H * 0.046, r1 = H * 0.03;
    mb.tube([
      { y: D.hipY + 0.02, x: side * D.legX, rx: r0, rz: r0 * 1.05, c: c('bottom') },
      { y: D.ankleY, x: side * D.legX, rx: r1, rz: r1 * 1.1, c: c('bottom') },
    ], { seg: 4, wf: wLeg(s) });
  }
  const legIdx = mb.idx.length;
  mb.tube([
    { y: D.waistY - 0.02, rx: H * 0.1, rz: H * 0.075, c: c('bottom') },
    { y: 0.05 * H, rx: H * 0.15, rz: H * 0.11, c: c('bottom') },
  ], { seg: 5, wf: (x, y) => [[B.hips, 0.55], [x < 0 ? B.thighL : B.thighR, 0.45]] });
  const skirtIdx = mb.idx.length;
  mb.tube([
    { y: D.hipY, rx: H * 0.1, rz: H * 0.07, c: c('bottom') },
    { y: D.hipY + 0.004, rx: H * 0.1, rz: H * 0.07, c: c('top') },
    { y: D.chestY, rx: H * 0.105, rz: H * 0.07, c: c('top') },
    { y: D.shoulderY + 0.01 * H, rx: H * 0.1, rz: H * 0.055, c: c('top') },
  ], { seg: 5, wf: (x, y) => (y < D.waistY ? [[B.hips, 0.5], [B.spine, 0.5]] : [[B.chest, 1]]) });
  for (const side of [-1, 1]) {
    const s = side < 0 ? 'L' : 'R', x = (y) => side * (D.shoulderX + (D.shoulderY - y) * 0.15);
    mb.tube([
      { y: D.shoulderY, x: x(D.shoulderY), rx: H * 0.034, rz: H * 0.034, c: c('top') },
      { y: D.wristY - 0.04, x: x(D.wristY), rx: H * 0.02, rz: H * 0.02, c: c('skin') },
    ], { seg: 4, wf: () => [[B['uarm' + s], 0.6], [B['farm' + s], 0.4]] });
  }
  // the head: hair on top and behind, skin in front
  mb.blob({ x: 0, y: D.chinY + D.hh * 0.5, z: D.hh * 0.03, rx: D.hh * 0.36, ry: D.hh * 0.52, rz: D.hh * 0.42, seg: 5, rings: 3, wf: () => [[B.head, 1]],
    cf: (ph, th) => ((th < 1.05 || Math.cos(ph) < -0.2) ? c('hair') : c('skin')) });
  const src = mb.build();
  const out = convert(src, D, false);
  // mark the legs and the skirt for the shader (every vertex belongs to one part; the parts do not share vertices)
  const uv = out.geometry.attributes.uv, idx = out.geometry.index.array;
  const tag = (from, to, v) => { for (let k = from; k < to; k++) uv.array[idx[k] * 2] = v; };
  tag(0, legIdx, -1); tag(legIdx, skirtIdx, -2);
  return out;
}
export { dimsOf };
