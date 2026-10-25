// The opening's sets (Phase 8C): Mithi's room in Dharavi, the festival lane outside it, and the five-level Sion Junction interchange over
// the street, built as temporary props that fall to pieces in a sequence of dominoes. Everything here is data-driven by the scene in
// scenes.js (`opening`); it owns no game state and removes itself with the scene (every mesh goes through `cx.prop`).
//
//   const room = buildRoom(cx)                     the one-room flat: mat, blanket, shelf, radio, flute, cane, bag, a diya
//   const lane = buildLane(cx)                     festival lights, stalls, pots, laundry, a rickshaw, a sign; people (lane.people)
//   const ic = buildInterchange(cx, {x, z0, len})  piers, five decks of girders, vehicles; ic.fail(t) runs the collapse
//   const fx = new Effects(cx)                     dust puffs, flying debris, sparks (fx.update(dt) every frame)
import * as THREE from '../../../vendor/three.module.js';
import { mergeGeometries } from '../../../vendor/addons/utils/BufferGeometryUtils.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

// ------------------------------------------------------------------------------------------------------------ geometry helper
export class Parts {
  constructor() { this.list = []; }
  _add(g, x, y, z, color, o = {}) {
    _e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0); _q.setFromEuler(_e); _v.set(x, y, z); _s.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    _m.compose(_v, _q, _s);
    g = g.index ? g.toNonIndexed() : g;
    g.applyMatrix4(_m); g.deleteAttribute('uv');
    const n = g.attributes.position.count, c = new THREE.Color(color), a = new Float32Array(n * 3);
    const j = o.jitter ?? 0;
    for (let i = 0; i < n; i += 3) {                                 // a little per-triangle variation so flat colours do not look like plastic
      const k = 1 + (Math.random() - 0.5) * j;
      for (let t = 0; t < 3; t++) { a[(i + t) * 3] = c.r * k; a[(i + t) * 3 + 1] = c.g * k; a[(i + t) * 3 + 2] = c.b * k; }
    }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    g.computeVertexNormals();
    this.list.push(g);
    return this;
  }
  box(w, h, d, x, y, z, c, o) { return this._add(new THREE.BoxGeometry(w, h, d), x, y, z, c, o); }
  cyl(rt, rb, h, x, y, z, c, o = {}) { return this._add(new THREE.CylinderGeometry(rt, rb, h, o.seg ?? 8, 1, o.open ?? false), x, y, z, c, o); }
  ball(r, x, y, z, c, o = {}) { return this._add(new THREE.IcosahedronGeometry(r, o.detail ?? 1), x, y, z, c, o); }
  cone(r, h, x, y, z, c, o = {}) { return this._add(new THREE.ConeGeometry(r, h, o.seg ?? 8), x, y, z, c, o); }
  geo() { if (!this.list.length) return null; const g = mergeGeometries(this.list, false); this.list.forEach((x) => x.dispose()); this.list = []; g.computeBoundingSphere(); return g; }
  mesh(mat) { const g = this.geo(); return g ? new THREE.Mesh(g, mat) : null; }
}

let _lit = null, _glow = null;
function mats() {
  _lit ??= new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color(0x201a14) });
  _glow ??= new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  return { lit: _lit, glow: _glow };
}
/** Add a mesh to the scene as a temporary prop, with the senses patch so it is graded like the rest of the world. */
function put(cx, mesh, x = 0, y = 0, z = 0) {
  if (!mesh) return null;
  mesh.position.set(x, y, z);
  cx.prop(mesh);
  cx.game.senses?.patchObject?.(mesh);
  return mesh;
}

// ------------------------------------------------------------------------------------------------------------ textures
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
function signTexture(lines, bg, fg, font = 'bold 56px Helvetica, Arial, sans-serif') {
  return canvasTex(512, 160, (g, w, h) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    lines.forEach((l, i) => g.fillText(l, w / 2, h * (lines.length === 1 ? 0.5 : 0.32 + i * 0.38)));
  });
}
function signPanel(cx, tex, w, h, x, y, z, ry = 0, glowing = true) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glowing ? new THREE.MeshBasicMaterial({ map: tex, fog: false }) : new THREE.MeshLambertMaterial({ map: tex, emissive: 0x303030 }));
  m.position.set(x, y, z); m.rotation.y = ry; cx.prop(m); return m;
}

// ------------------------------------------------------------------------------------------------------------ the room
/** Mithi's room. Origin: the door is at x = -90 on the east wall, the packed bag beside it; the mat lies against the south wall. */
export function buildRoom(cx) {
  const { lit, glow } = mats(), L = new Parts(), G = new Parts();
  const F = 0;
  // Setu's mat, blanket, pillow: a woven mat with stripes, a checked blanket thrown back, a flat pillow with the dent of a head
  for (let i = 0; i < 6; i++) L.box(0.95 / 6, 0.025, 1.8, -95.45 + i * 0.158, F + 0.0125, -79.1, i % 2 ? 0xc9b184 : 0xb09a6e, { jitter: 0.1, ry: 0.12 });
  L.box(0.8, 0.06, 0.62, -94.95, F + 0.06, -78.35, 0x35507a, { ry: 0.5, rx: 0.05, jitter: 0.2 });
  L.box(0.72, 0.05, 0.5, -95.15, F + 0.075, -78.0, 0x3f5d8c, { ry: 0.2, rz: 0.08, jitter: 0.2 });
  L.ball(0.2, -95.2, F + 0.08, -79.95, 0xe2d8c0, { sx: 1.2, sy: 0.35, sz: 0.9 });
  L.box(0.22, 0.012, 0.3, -93.95, F + 0.007, -78.3, 0x14110e, { ry: 0.2 });                // where his slippers were
  L.box(0.22, 0.012, 0.3, -93.62, F + 0.007, -78.72, 0x14110e, { ry: -0.1 });
  // Mithi's own sleeping place on the floor, still warm: a thinner mat and a folded dupatta
  L.box(0.9, 0.025, 1.75, -96.5, F + 0.0125, -76.4, 0x9a8a68, { ry: -0.05 });
  L.box(0.4, 0.06, 0.26, -96.5, F + 0.06, -75.7, 0x6a2f52, { jitter: 0.1 });
  // the shelf on the west wall: steel plates, a brass lota, the flute, a transistor radio, the parents' photograph, a marigold garland
  L.box(1.5, 0.05, 0.28, -98.1, F + 1.3, -77.0, 0x5a4634);
  for (let i = 0; i < 4; i++) L.cyl(0.1, 0.1, 0.012, -98.1 + (i - 1.5) * 0.12, F + 1.41 + i * 0.001, -77.18, 0xb8bcc0, { seg: 12, rx: Math.PI / 2 - 0.2, ry: 0 });
  L.cyl(0.045, 0.07, 0.15, -97.55, F + 1.38, -76.9, 0xc09a3a, { seg: 8 });                // lota
  L.cyl(0.011, 0.011, 0.62, -98.55, F + 1.33, -76.9, 0xc8a46a, { seg: 6, rz: Math.PI / 2 });   // bamboo flute
  L.box(0.26, 0.17, 0.09, -98.3, F + 1.435, -76.95, 0x3a2f28, { ry: 0.2 });               // radio
  L.cyl(0.004, 0.004, 0.4, -98.2, F + 1.65, -76.96, 0x9a9a98, { seg: 4, rz: 0.4 });
  L.box(0.2, 0.26, 0.02, -97.6, F + 1.55, -77.2, 0x1a1816); L.box(0.17, 0.22, 0.01, -97.6, F + 1.55, -77.19, 0x6a5a4a);   // the photograph
  for (let i = 0; i < 11; i++) L.ball(0.035, -97.88 + i * 0.035, F + 1.54 + Math.abs(Math.sin(i * 0.9)) * -0.07, -77.215, i % 3 ? 0xf0a020 : 0xe06a10, { detail: 0 });   // the garland
  // a crate with the old TV already sits there; beside it a bucket and a pot
  L.cyl(0.14, 0.12, 0.27, -97.7, F + 0.135, -74.9, 0x2f6aa0, { seg: 10 });                // blue plastic bucket (Dharavi is full of them)
  L.cyl(0.19, 0.22, 0.34, -98.1, F + 0.17, -75.4, 0x8a4a2c, { seg: 10 });                 // a clay matka
  // the packed bag, by the door; the cane, leaning
  L.box(0.42, 0.34, 0.2, -91.1, F + 0.17, -79.5, 0x6a5a3a, { jitter: 0.15, ry: 0.3 });
  L.box(0.3, 0.2, 0.06, -91.1, F + 0.2, -79.35, 0x5a4a2c, { ry: 0.3 });
  L.cyl(0.008, 0.008, 1.1, -90.7, F + 0.55, -80.4, 0xf0eee6, { seg: 6, rx: 0.12, rz: -0.12 });
  L.cyl(0.0095, 0.0095, 0.07, -90.74, F + 0.38, -80.4, 0xc2332c, { seg: 6, rx: 0.12, rz: -0.12 });
  // clothes on a line across the room
  L.box(1.6, 0.012, 0.012, -95, F + 2.0, -80.6, 0x3a3a38);
  for (let i = 0; i < 4; i++) L.box(0.26, 0.4 + (i % 2) * 0.1, 0.012, -95.6 + i * 0.4, F + 1.8, -80.58, [0x8a3a3a, 0x3a5a8a, 0xd0b050, 0x5a8a5a][i], { jitter: 0.2 });
  // a diya on the sill by the door: its flame is the one warm thing
  L.cyl(0.07, 0.04, 0.035, -90.6, F + 0.9, -76.0, 0xb0602c, { seg: 8 });
  G.cone(0.016, 0.07, -90.6, F + 0.95, -76.0, 0xffc060, { seg: 5 });
  // the window: a pale rectangle of sodium light cut in the north wall
  G.box(0.9, 0.55, 0.02, -94, F + 1.55, -82.0, 0xc87a3a);
  put(cx, L.mesh(lit)); put(cx, G.mesh(glow));
  // a tiny flicker light for the diya (it is a glow mesh only; the sky's hemi boost does the rest)
  return {};
}

// ------------------------------------------------------------------------------------------------------------ the lane
const MARIGOLD = [0xf0a020, 0xe06a10, 0xf6c040];
const LIGHTS = [0xffd890, 0xff8ab0, 0x9ae0ff, 0xffb040, 0xb8ff9a];

/** The lane outside, the street x = -75 running north under the interchange (z from -60 to -92 is the stretch the camera sees). */
export function buildLane(cx, dz = 0) {
  const { lit, glow } = mats(), L = new Parts(), G = new Parts();
  const X = -75;
  // --- festival lights: three strings of small coloured bulbs hung across the lane, with marigold garlands and paper stars
  const strings = [[-61, 7.6], [-68, 7.0], [-76, 6.6], [-84, 6.2]];
  for (const [z, hgt] of strings) {
    const x0 = X - 8.2, x1 = X + 8.2, n = 22;
    for (let i = 0; i <= n; i++) {
      const u = i / n, x = x0 + (x1 - x0) * u, y = hgt - Math.sin(u * Math.PI) * 0.0 - (1 - Math.pow(2 * u - 1, 2)) * -0.0 - Math.sin(u * Math.PI) * 0.9 + 0.9;
      const dy = hgt - (Math.sin(u * Math.PI)) * 0.8;
      G.ball(0.07, x, dy, z, LIGHTS[(i + Math.abs(Math.round(z))) % LIGHTS.length], { detail: 0 });
      if (i % 3 === 1) for (let k = 0; k < 4; k++) L.ball(0.05, x + (k - 1.5) * 0.02, dy - 0.2 - k * 0.1, z, MARIGOLD[k % 3], { detail: 0 });
    }
    L.box(16.4, 0.02, 0.02, X, hgt, z, 0x201c18);
  }
  // paper stars (akash kandil) hung at the side
  for (const [x, y, z] of [[X - 4.5, 4.4, -66], [X + 4.2, 4.0, -72], [X - 4, 4.6, -80], [X + 4.4, 4.2, -88]]) {
    G.ball(0.28, x, y, z, 0xffcf70, { detail: 0, sx: 1, sy: 1.1, sz: 1 }); L.cyl(0.004, 0.004, 1.2, x, y + 0.9, z, 0x201c18, { seg: 3 });
    L.cone(0.1, 0.45, x, y - 0.4, z, 0xe05a20, { seg: 4, rx: Math.PI });
  }
  // --- the chai stall on the east edge: a blue tarp, a counter, a kettle on a stove, stools, tumblers, a gas cylinder
  const sx = X + 5.0, sz = -66;
  L.box(2.4, 0.9, 0.9, sx, 0.45, sz, 0x6a4a2c, { jitter: 0.15 });
  L.box(2.8, 0.05, 1.6, sx - 0.1, 2.35, sz, 0x2a6aa8, { rx: 0.08, jitter: 0.1 });
  for (const [dx, dz] of [[-1.3, -0.7], [1.2, -0.7], [-1.3, 0.7], [1.2, 0.7]]) L.cyl(0.03, 0.03, 2.35, sx + dx, 1.17, sz + dz, 0x4a4036, { seg: 5 });
  L.cyl(0.2, 0.22, 0.28, sx - 0.6, 1.04, sz, 0xb0b4b8, { seg: 10 }); L.cyl(0.04, 0.05, 0.18, sx - 0.6, 1.27, sz, 0xb0b4b8, { seg: 6 });          // kettle
  L.cyl(0.19, 0.19, 0.6, sx + 1.55, 0.3, sz + 0.2, 0x2a4a8a, { seg: 10 });                                                                      // gas cylinder
  for (let i = 0; i < 6; i++) L.cyl(0.03, 0.025, 0.08, sx + 0.1 + i * 0.12, 0.94, sz + 0.1, 0xd8e4e8, { seg: 6 });                                // glasses
  for (const dz of [1.2, 1.9]) L.cyl(0.18, 0.15, 0.38, sx - 0.3, 0.19, sz + dz, 0x8a6a3a, { seg: 8 });
  G.box(0.5, 0.03, 0.03, sx - 0.6, 0.97, sz, 0xff8a30);                                                                                          // stove flame
  G.ball(0.1, sx - 0.2, 2.15, sz, 0xfff0b0, { detail: 1 });                                                                                      // a bare bulb under the tarp
  // --- Kumbharwada: a handcart of clay pots and a kiln glowing at the foot of the west wall
  const cx0 = X - 5.6, cz0 = -73.5;
  L.box(1.5, 0.08, 0.9, cx0, 0.62, cz0, 0x6a4a2c); L.cyl(0.32, 0.32, 0.08, cx0 - 0.5, 0.32, cz0 + 0.5, 0x2a2622, { seg: 10, rx: Math.PI / 2 }); L.cyl(0.32, 0.32, 0.08, cx0 + 0.5, 0.32, cz0 + 0.5, 0x2a2622, { seg: 10, rx: Math.PI / 2 });
  for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) L.ball(0.21 - r * 0.02, cx0 - 0.55 + i * 0.22, 0.86 + r * 0.38, cz0 - 0.15 + (i % 2) * 0.2, [0xb0582c, 0xa04a24, 0xc06a38][(i + r) % 3], { detail: 1, sy: 1.15, jitter: 0.1 });
  L.ball(0.8, X - 6.6, 0.0, -82.5, 0x5a4636, { detail: 1, sy: 0.9 });                                                                            // a clay kiln mound
  G.ball(0.45, X - 6.1, 0.5, -82.5, 0xff7a20, { detail: 1, sy: 0.5 }); G.ball(0.28, X - 6.1, 0.65, -82.5, 0xffc060, { detail: 0, sy: 0.4 });
  // --- an auto-rickshaw (green and black), asleep, its driver curled on the seat
  const ax = X - 4.2, az = -88;
  L.box(1.25, 0.15, 2.2, ax, 0.4, az, 0x2a2a2c); L.box(1.2, 0.8, 1.1, ax, 0.95, az + 0.3, 0x1c6a3a, { jitter: 0.05 }); L.box(1.25, 0.12, 1.7, ax, 1.45, az + 0.5, 0x1a1a1a);
  L.box(0.9, 0.6, 0.6, ax, 0.9, az - 0.9, 0x1c6a3a); L.cyl(0.18, 0.18, 0.12, ax, 0.2, az - 1.0, 0x1a1a1a, { seg: 10, rz: Math.PI / 2 });
  for (const dx of [-0.55, 0.55]) L.cyl(0.19, 0.19, 0.1, ax + dx, 0.2, az + 0.8, 0x1a1a1a, { seg: 10, rz: Math.PI / 2 });
  G.box(0.18, 0.12, 0.05, ax, 1.0, az - 1.2, 0xfff0c0);
  // --- laundry along the west wall: saris and shirts on a sagging line
  const lz0 = -62, lz1 = -90;
  L.box(0.02, 0.02, 28, X - 7.4, 3.6, (lz0 + lz1) / 2, 0x201c18);
  for (let i = 0; i < 9; i++) { const z = lz0 - 1.5 - i * 3.0; L.box(0.02, 1.0 + (i % 3) * 0.5, 0.9, X - 7.4, 3.0, z, [0xd05a3a, 0x3a6aa8, 0xe0c050, 0x6a9a5a, 0xa04a8a, 0xf0e8d8][i % 6], { jitter: 0.2, rz: (i % 2 ? 0.04 : -0.03) }); }
  // --- blue plastic drums, stacked pipes, a handwritten board, wires along the walls
  for (const [dx, dz] of [[-7.0, -64], [-7.0, -64.9], [6.9, -75], [6.9, -75.9]]) L.cyl(0.3, 0.3, 0.9, X + dx, 0.45, dz, 0x2a5aa0, { seg: 10 });
  for (let i = 0; i < 4; i++) L.cyl(0.04, 0.04, 28, X + 7.6, 2.0 + i * 0.35, -77, 0x6a6a6c, { seg: 5, rx: Math.PI / 2 });
  // --- a rangoli at the door of the room and another by the chai stall: flat discs of coloured powder
  for (const [rx, rz, r] of [[-86.5, -78, 0.55], [X + 3.0, -70, 0.7]]) {
    L.cyl(r, r, 0.012, rx, 0.012, rz, 0x6a2a50, { seg: 14 }); L.cyl(r * 0.75, r * 0.75, 0.014, rx, 0.014, rz, 0xf0a020, { seg: 14 }); L.cyl(r * 0.5, r * 0.5, 0.016, rx, 0.016, rz, 0x2a8aa0, { seg: 14 }); L.cyl(r * 0.25, r * 0.25, 0.018, rx, 0.018, rz, 0xe8e0d0, { seg: 14 });
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; L.cyl(0.05, 0.05, 0.02, rx + Math.cos(a) * r * 0.9, 0.02, rz + Math.sin(a) * r * 0.9, 0xffe080, { seg: 5 }); }
  }
  // --- diyas along the edge of the lane: the festival
  for (let i = 0; i < 14; i++) { const z = -60 - i * 2.2, x = i % 2 ? X - 6.2 : X + 6.2; L.cyl(0.05, 0.03, 0.03, x, 0.02, z, 0xa8552c, { seg: 6 }); G.cone(0.014, 0.05, x, 0.07, z, 0xffc060, { seg: 4 }); }
  put(cx, L.mesh(lit), 0, 0, dz); put(cx, G.mesh(glow), 0, 0, dz);
  // --- the big blue direction sign over the lane: SION JN
  const sign = signTexture(['सायन जंक्शन', 'SION JN  →  EEH'], '#1a4a8a', '#f4f4f0', 'bold 46px Helvetica, Arial, sans-serif');
  const panel = signPanel(cx, sign, 5.4, 1.7, X, 8.4, -84 + dz, 0, true);
  return { X, sign: panel };
}

// ------------------------------------------------------------------------------------------------------------ people of the lane
const SK = { light: 0xe0b48f, tan: 0xc48d62, brown: 0xa5724a, dark: 0x7e5036, deep: 0x5a3826 };
const spec = (o) => ({ name: 'lane', height: 1.7, build: 'normal', sex: 'm', skin: SK.brown, hair: { style: 'short', color: 0x1a1512 }, top: { color: 0x59695f, length: 'shirt', sleeves: 'long' }, bottom: { color: 0x33343c, style: 'trousers' }, shoes: 0x1f1a17, scarf: null, jacket: null, props: [], ...o });
export const LANE_PEOPLE = [
  // who, spec, start [x, z], what they do before: 'stand' or a walk to [x, z]
  { id: 'chai', at: [-70.6, -65.2], yaw: 90, doing: 'chai', spec: spec({ name: 'Chaiwallah', height: 1.64, age: 0.5, skin: SK.dark, hair: { style: 'balding', color: 0xb0aca0 }, facial: 'moustache', top: { color: 0xd8d0b8, length: 'kurta', sleeves: 'short' }, bottom: { color: 0x6a8aa8, style: 'lungi' }, barefoot: true, shoes: null }) },
  { id: 'womanA', at: [-78.6, -61], to: [-78.6, -76], speed: 0.9, spec: spec({ name: 'Woman', height: 1.56, sex: 'f', build: 'slim', skin: SK.brown, hair: { style: 'bun', color: 0x14100e }, top: { color: 0xc8901a, trim: 0xe8d080, length: 'sari', sleeves: 'short' }, bottom: { color: 0x8a2a3a, style: 'skirt' }, scarf: { color: 0x8a2a3a, trim: 0xe8d080, style: 'sash' }, barefoot: true, shoes: null, bindi: '#8a2a30', props: ['bangles'] }) },
  { id: 'womanB', at: [-72.4, -60], to: [-72.4, -74], speed: 0.8, spec: spec({ name: 'Woman', height: 1.52, sex: 'f', build: 'normal', skin: SK.tan, hair: { style: 'braid', color: 0x14100e, tie: 0xd04040 }, top: { color: 0x3a6aa8, trim: 0xd0b060, length: 'kurta', sleeves: 'long' }, bottom: { color: 0xe0d8c8, style: 'salwar' }, scarf: { color: 0xd08a30, trim: 0xe8d080, style: 'neck' }, shoes: 0x6a4a2a }) },
  { id: 'potter', at: [-80.6, -73.6], yaw: -60, doing: 'cart', spec: spec({ name: 'Potter', height: 1.68, skin: SK.dark, age: 0.3, hair: { style: 'turban', color: 0xc07a2a }, facial: 'stubble', top: { color: 0xb8b0a0, length: 'shirt', sleeves: 'short' }, bottom: { color: 0xe8e0d0, style: 'lungi' }, barefoot: true, shoes: null }) },
  { id: 'kid1', at: [-75.8, -62], to: [-75.4, -78], speed: 1.5, spec: spec({ name: 'Kid', height: 1.12, build: 'child', skin: SK.brown, hair: { style: 'crop', color: 0x14100e }, top: { color: 0xe8e4d6, length: 'tee', sleeves: 'short' }, bottom: { color: 0x2f3b52, style: 'shorts' }, barefoot: true, shoes: null }) },
  { id: 'kid2', at: [-74.6, -61], to: [-74.2, -77], speed: 1.45, spec: spec({ name: 'Kid', height: 1.05, build: 'child', sex: 'f', skin: SK.tan, hair: { style: 'braid', color: 0x14100e, tie: 0xe8c040 }, top: { color: 0xc8402a, trim: 0xf0d080, length: 'kurta', sleeves: 'short' }, bottom: { color: 0xe0d8c8, style: 'salwar' }, barefoot: true, shoes: null }) },
  { id: 'dad', at: [-69.6, -72], to: [-69.6, -66], speed: 0.7, spec: spec({ name: 'Man', height: 1.72, skin: SK.brown, hair: { style: 'side', color: 0x1a1512 }, facial: 'stubble', top: { color: 0x7a8a96, length: 'shirt', sleeves: 'short' }, bottom: { color: 0x2c2f38, style: 'trousers' }, shoes: 0x1c1816 }) },
  { id: 'grandma', at: [-79.4, -86], to: [-79.4, -82], speed: 0.45, spec: spec({ name: 'Grandmother', height: 1.46, sex: 'f', age: 0.9, build: 'slim', skin: SK.dark, hair: { style: 'bun', color: 0xd8d4cc }, top: { color: 0xe8e4d6, trim: 0xb0a890, length: 'sari', sleeves: 'long' }, bottom: { color: 0xe8e4d6, style: 'skirt' }, scarf: { color: 0xe8e4d6, trim: 0xb0a890, style: 'sash' }, barefoot: true, shoes: null }) },
  { id: 'auto', at: [-70.2, -78.4], yaw: 180, doing: 'brush', spec: spec({ name: 'Neighbour', height: 1.66, skin: SK.tan, hair: { style: 'crop', color: 0x1a1512 }, top: { color: 0xe8e4d6, length: 'tee', sleeves: 'short' }, bottom: { color: 0x3a5a8a, style: 'lungi' }, barefoot: true, shoes: null }) },
  { id: 'girl', at: [-77.6, -69.4], to: [-77.4, -74.6], speed: 0.6, spec: spec({ name: 'Girl', height: 1.38, build: 'child', sex: 'f', skin: SK.brown, hair: { style: 'bob', color: 0x14100e }, top: { color: 0x8a3a6a, trim: 0xe8d080, length: 'kurta', sleeves: 'long' }, bottom: { color: 0xe0d8c8, style: 'salwar' }, barefoot: true, shoes: null, props: ['bangles'] }) },
];

// ------------------------------------------------------------------------------------------------------------ effects
function puffTexture() {
  return canvasTex(128, 128, (g, w) => {
    g.clearRect(0, 0, w, w);
    const rr = (x, y, r, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.5, `rgba(255,255,255,${a * 0.55})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, w); };
    rr(64, 64, 62, 0.55);
    for (let i = 0; i < 9; i++) rr(64 + rnd(-24, 24), 64 + rnd(-24, 24), rnd(18, 34), rnd(0.2, 0.45));
  });
}

/** Dust, debris and sparks for the collapse. update(dt) every frame; spawn calls are cheap. */
export class Effects {
  constructor(cx, { dust = 320, debris = 90, sparks = 160 } = {}) {
    this.cx = cx;
    // ---- dust: soft billboards, instanced, one draw call
    const geo = new THREE.InstancedBufferGeometry();
    const base = new THREE.PlaneGeometry(1, 1);
    geo.setAttribute('position', base.attributes.position); geo.setAttribute('uv', base.attributes.uv); geo.setIndex(base.index);
    this.nD = dust; this.d = { pos: new Float32Array(dust * 3), data: new Float32Array(dust * 4), col: new Float32Array(dust * 3) };
    this.dAge = new Float32Array(dust).fill(1e9); this.dLife = new Float32Array(dust).fill(1); this.dVel = new Float32Array(dust * 3); this.dS0 = new Float32Array(dust); this.dS1 = new Float32Array(dust); this.dA = new Float32Array(dust); this.dSpin = new Float32Array(dust);
    this.aPos = new THREE.InstancedBufferAttribute(this.d.pos, 3); this.aData = new THREE.InstancedBufferAttribute(this.d.data, 4); this.aCol = new THREE.InstancedBufferAttribute(this.d.col, 3);
    for (const a of [this.aPos, this.aData, this.aCol]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aPos', this.aPos); geo.setAttribute('aData', this.aData); geo.setAttribute('aCol', this.aCol); geo.instanceCount = dust;
    this.puffTex = puffTexture();
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, uniforms: { uMap: { value: this.puffTex } },
      vertexShader: 'attribute vec3 aPos; attribute vec4 aData; attribute vec3 aCol; varying vec2 vUv; varying float vA; varying vec3 vC; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(aPos, 1.0); float c = cos(aData.z), s = sin(aData.z); vec2 p = vec2(c * position.x - s * position.y, s * position.x + c * position.y); mv.xy += p * aData.x; gl_Position = projectionMatrix * mv; vA = aData.y; vC = aCol; }',
      fragmentShader: 'uniform sampler2D uMap; varying vec2 vUv; varying float vA; varying vec3 vC; void main(){ float a = texture2D(uMap, vUv).a * vA; if (a < 0.004) discard; gl_FragColor = vec4(vC, a); }',
    });
    this.dustMesh = new THREE.Mesh(geo, mat); this.dustMesh.frustumCulled = false; this.dustMesh.renderOrder = 5;
    cx.prop(this.dustMesh);
    // ---- debris: tumbling chunks of concrete and bent steel
    this.nB = debris;
    this.chunks = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: new THREE.Color(0x18150f) }), debris);
    this.chunks.frustumCulled = false; this.chunks.count = 0;
    this.bAlive = []; for (let i = 0; i < debris; i++) this.bAlive.push(null);
    for (let i = 0; i < debris; i++) this.chunks.setColorAt(i, new THREE.Color(0x5c5850));
    cx.prop(this.chunks); cx.game.senses?.patchObject?.(this.chunks);
    // ---- sparks: additive points
    this.nS = sparks;
    const sg = new THREE.BufferGeometry();
    this.sPos = new Float32Array(sparks * 3).fill(-9999); this.sVel = new Float32Array(sparks * 3); this.sAge = new Float32Array(sparks).fill(9); this.sLife = new Float32Array(sparks).fill(1);
    this.sCol = new Float32Array(sparks * 3);
    sg.setAttribute('position', new THREE.BufferAttribute(this.sPos, 3).setUsage(THREE.DynamicDrawUsage)); sg.setAttribute('color', new THREE.BufferAttribute(this.sCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.sparks = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.28, vertexColors: true, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
    this.sparks.frustumCulled = false; cx.prop(this.sparks);
    this.nextD = 0; this.nextB = 0; this.nextS = 0; this.t = 0;
    this.tmp = new THREE.Object3D();
  }

  /** A puff of dust: position, velocity, size at birth and death, life (s), opacity, colour. */
  puff(x, y, z, vx, vy, vz, s0, s1, life, alpha = 0.5, color = [0.42, 0.37, 0.31]) {
    alpha = Math.min(0.92, alpha * 1.4);
    const i = this.nextD++ % this.nD;
    this.d.pos[i * 3] = x; this.d.pos[i * 3 + 1] = y; this.d.pos[i * 3 + 2] = z;
    this.dVel[i * 3] = vx; this.dVel[i * 3 + 1] = vy; this.dVel[i * 3 + 2] = vz;
    this.dS0[i] = s0; this.dS1[i] = s1; this.dLife[i] = life; this.dAge[i] = 0; this.dA[i] = alpha; this.dSpin[i] = rnd(-0.6, 0.6);
    const k = rnd(0.88, 1.12);
    this.d.col[i * 3] = color[0] * k; this.d.col[i * 3 + 1] = color[1] * k; this.d.col[i * 3 + 2] = color[2] * k;
    this.d.data[i * 4 + 2] = rnd(0, 6.28);
  }

  /** A burst of dust over a footprint (a deck landing): n puffs spread over a rect, pushed outward. */
  cloud(cx_, cy, cz, n, spread, { speed = 6, up = 3, size = 5, grow = 14, life = 6, alpha = 0.45, color } = {}) {
    for (let i = 0; i < n; i++) {
      const a = rnd(0, 6.283), r = Math.sqrt(Math.random()) * spread;
      this.puff(cx_ + Math.cos(a) * r * 0.5, cy + rnd(0, 1.6), cz + Math.sin(a) * r, Math.cos(a) * rnd(0.3, 1) * speed * 0.5, rnd(0.2, 1) * up, Math.sin(a) * rnd(0.3, 1) * speed + 3, size * rnd(0.6, 1.2), grow * rnd(0.6, 1.2), life * rnd(0.7, 1.2), alpha * rnd(0.7, 1), color);
    }
  }

  chunk(x, y, z, vx, vy, vz, sx, sy, sz, color = 0x5c5850) {
    const i = this.nextB++ % this.nB;
    this.bAlive[i] = { x, y, z, vx, vy, vz, rx: rnd(0, 6), ry: rnd(0, 6), rz: rnd(0, 6), wx: rnd(-6, 6), wy: rnd(-6, 6), wz: rnd(-6, 6), sx, sy, sz, floor: 0.2 + sy * 0.4, rest: false };
    this.chunks.setColorAt(i, new THREE.Color(color).multiplyScalar(rnd(0.75, 1.15)));
    if (this.chunks.instanceColor) this.chunks.instanceColor.needsUpdate = true;
    this.chunks.count = this.nB;
  }

  spark(x, y, z, n = 18, speed = 7) {
    for (let k = 0; k < n; k++) {
      const i = this.nextS++ % this.nS;
      this.sPos[i * 3] = x; this.sPos[i * 3 + 1] = y; this.sPos[i * 3 + 2] = z;
      const a = rnd(0, 6.283), e = rnd(-0.3, 1.2), sp = rnd(0.3, 1) * speed;
      this.sVel[i * 3] = Math.cos(a) * Math.cos(e) * sp; this.sVel[i * 3 + 1] = Math.sin(e) * sp + 2; this.sVel[i * 3 + 2] = Math.sin(a) * Math.cos(e) * sp;
      this.sAge[i] = 0; this.sLife[i] = rnd(0.35, 0.9);
      const w = Math.random() < 0.4; this.sCol[i * 3] = w ? 0.9 : 1.0; this.sCol[i * 3 + 1] = w ? 0.95 : rnd(0.55, 0.85); this.sCol[i * 3 + 2] = w ? 1.0 : 0.3;
    }
  }

  update(dt) {
    this.t += dt;
    // dust
    for (let i = 0; i < this.nD; i++) {
      const age = (this.dAge[i] += dt);
      if (age >= this.dLife[i]) { this.d.data[i * 4 + 1] = 0; continue; }
      const k = age / this.dLife[i], drag = Math.exp(-0.9 * dt);
      this.dVel[i * 3] *= drag; this.dVel[i * 3 + 1] *= Math.exp(-0.5 * dt); this.dVel[i * 3 + 2] *= drag;
      this.d.pos[i * 3] += this.dVel[i * 3] * dt; this.d.pos[i * 3 + 1] += this.dVel[i * 3 + 1] * dt; this.d.pos[i * 3 + 2] += this.dVel[i * 3 + 2] * dt;
      this.d.data[i * 4] = this.dS0[i] + (this.dS1[i] - this.dS0[i]) * (1 - Math.pow(1 - k, 2));
      this.d.data[i * 4 + 1] = this.dA[i] * smooth(0, 0.12, k) * (1 - smooth(0.55, 1, k));
      this.d.data[i * 4 + 2] += this.dSpin[i] * dt;
    }
    this.aPos.needsUpdate = true; this.aData.needsUpdate = true; this.aCol.needsUpdate = true;
    // debris
    let any = false;
    for (let i = 0; i < this.nB; i++) {
      const b = this.bAlive[i];
      if (!b) { this.tmp.scale.set(0.0001, 0.0001, 0.0001); this.tmp.position.set(0, -50, 0); this.tmp.updateMatrix(); this.chunks.setMatrixAt(i, this.tmp.matrix); continue; }
      any = true;
      if (!b.rest) {
        b.vy -= 22 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
        b.rx += b.wx * dt; b.ry += b.wy * dt; b.rz += b.wz * dt;
        if (b.y < b.floor) { b.y = b.floor; if (Math.abs(b.vy) > 2.5) { b.vy *= -0.32; b.vx *= 0.6; b.vz *= 0.6; b.wx *= 0.5; b.wy *= 0.5; b.wz *= 0.5; } else { b.rest = true; } }
      }
      this.tmp.position.set(b.x, b.y, b.z); this.tmp.rotation.set(b.rx, b.ry, b.rz); this.tmp.scale.set(b.sx, b.sy, b.sz); this.tmp.updateMatrix();
      this.chunks.setMatrixAt(i, this.tmp.matrix);
    }
    if (any) this.chunks.instanceMatrix.needsUpdate = true;
    // sparks
    for (let i = 0; i < this.nS; i++) {
      if (this.sAge[i] >= this.sLife[i]) { this.sPos[i * 3 + 1] = -9999; continue; }
      this.sAge[i] += dt; this.sVel[i * 3 + 1] -= 16 * dt;
      this.sPos[i * 3] += this.sVel[i * 3] * dt; this.sPos[i * 3 + 1] += this.sVel[i * 3 + 1] * dt; this.sPos[i * 3 + 2] += this.sVel[i * 3 + 2] * dt;
    }
    this.sparks.geometry.attributes.position.needsUpdate = true; this.sparks.geometry.attributes.color.needsUpdate = true;
  }
}

// ------------------------------------------------------------------------------------------------------------ the interchange
const LEVEL_Y = [5.4, 10.8, 16.2, 21.6, 27.0];
const LEVEL_REST = [0.7, 1.9, 3.1, 4.3, 5.5];
const SEG = 16;                                    // metres per deck segment
const CONC = 0x6a6962, CONC_D = 0x4a4944, STEEL = 0x3a3c40, RUST = 0x7a4a2c;

function vehicleGeo(kind, color) {
  const P = new Parts(), G = new Parts();
  if (kind === 'bus') {
    P.box(2.5, 2.8, 9.5, 0, 1.6, 0, color, { jitter: 0.06 }); P.box(2.5, 0.3, 9.5, 0, 0.35, 0, 0x2a2a2c);
    G.box(2.3, 0.8, 0.05, 0, 2.2, -4.78, 0x2a3a4a); for (let i = 0; i < 5; i++) G.box(0.04, 0.8, 1.4, 1.27, 2.1, -3.4 + i * 1.7, 0x2a3a4a), G.box(0.04, 0.8, 1.4, -1.27, 2.1, -3.4 + i * 1.7, 0x2a3a4a);
    G.box(0.3, 0.25, 0.05, -0.9, 0.6, -4.78, 0xfff0c0); G.box(0.3, 0.25, 0.05, 0.9, 0.6, -4.78, 0xfff0c0); G.box(0.3, 0.2, 0.05, -0.9, 0.6, 4.78, 0xff2a20); G.box(0.3, 0.2, 0.05, 0.9, 0.6, 4.78, 0xff2a20);
  } else if (kind === 'truck') {
    P.box(2.4, 1.6, 2.2, 0, 1.3, -3.4, color); P.box(2.5, 2.4, 6.2, 0, 1.8, 1.0, 0x7a6a4a, { jitter: 0.1 }); P.box(2.5, 0.35, 8.8, 0, 0.45, 0, 0x222224);
    G.box(0.3, 0.2, 0.05, -0.8, 0.9, -4.5, 0xfff0c0); G.box(0.3, 0.2, 0.05, 0.8, 0.9, -4.5, 0xfff0c0); G.box(0.25, 0.2, 0.05, 0, 0.9, 4.42, 0xff2a20);
  } else if (kind === 'taxi') {
    P.box(1.7, 0.7, 4.0, 0, 0.7, 0, 0x14110e); P.box(1.6, 0.6, 2.2, 0, 1.3, 0.2, 0xe8c020, { jitter: 0.05 }); P.box(1.7, 0.2, 4.0, 0, 0.35, 0, 0x201c18);
    G.box(0.3, 0.18, 0.05, -0.6, 0.75, -2.02, 0xfff0c0); G.box(0.3, 0.18, 0.05, 0.6, 0.75, -2.02, 0xfff0c0); G.box(0.3, 0.16, 0.05, -0.6, 0.78, 2.02, 0xff2a20); G.box(0.3, 0.16, 0.05, 0.6, 0.78, 2.02, 0xff2a20);
  } else if (kind === 'auto') {
    P.box(1.3, 1.3, 2.4, 0, 1.0, 0.2, 0x1c6a3a); P.box(1.3, 0.1, 2.0, 0, 1.7, 0.3, 0x14110e); P.box(0.7, 0.7, 0.6, 0, 0.8, -1.4, 0x1c6a3a); P.box(1.3, 0.2, 2.6, 0, 0.35, 0, 0x201c18);
    G.box(0.2, 0.15, 0.05, 0, 0.95, -1.72, 0xfff0c0); G.box(0.3, 0.12, 0.05, 0, 0.8, 1.42, 0xff2a20);
  } else {
    P.box(1.8, 1.2, 4.2, 0, 1.0, 0, color, { jitter: 0.08 }); P.box(1.7, 0.6, 2.3, 0, 1.75, 0.2, color, { jitter: 0.04 }); P.box(1.8, 0.3, 4.2, 0, 0.4, 0, 0x201c18);
    G.box(0.35, 0.2, 0.05, -0.6, 1.0, -2.12, 0xfff0c0); G.box(0.35, 0.2, 0.05, 0.6, 1.0, -2.12, 0xfff0c0); G.box(0.3, 0.2, 0.05, -0.6, 1.0, 2.12, 0xff2a20); G.box(0.3, 0.2, 0.05, 0.6, 1.0, 2.12, 0xff2a20);
    G.box(1.4, 0.5, 0.04, 0, 1.78, -0.95, 0x2a3a4a);
  }
  return { P, G };
}

/**
 * The five-level web of roads over the street: piers in rows, decks in segments of girders and slabs with barriers and lamps, vehicles with
 * lit headlamps. `ic.start(t)` begins the failure: the far end first, dominoing toward the camera.
 */
export function buildInterchange(cx, { x = -75, zS = -92, rows = 5 } = {}) {
  const { lit, glow } = mats();
  const W = 11.2, nSeg = rows - 1;
  const ic = { x, zS, segs: [], piers: [], vehicles: [], failAt: [], started: false, t: 0, cx, fx: null, rows, W, groups: [] };
  // ---- piers: low part (static), mid and high parts per row (they shear and drop)
  const PL = new Parts();
  for (let r = 0; r < rows; r++) {
    const z = zS - r * SEG;
    for (const sx of [-1, 1]) {
      const px = x + sx * (W / 2 - 0.9);
      PL.box(2.6, 0.7, 2.6, px, 0.35, z, CONC_D);                                   // footing
      PL.box(1.7, 8.2, 1.7, px, 4.8, z, CONC, { jitter: 0.08 });
    }
    const mid = new Parts(), high = new Parts(), rebar = new Parts();
    for (const sx of [-1, 1]) {
      const px = x + sx * (W / 2 - 0.9);
      mid.box(1.55, 9.2, 1.55, px, 13.4, z, CONC, { jitter: 0.08 }); mid.box(2.6, 0.9, 2.0, px, 18.0, z, CONC_D);
      high.box(1.45, 8.0, 1.45, px, 22.9, z, CONC, { jitter: 0.08 }); high.box(2.8, 0.7, 2.2, px, 27.1, z, CONC_D);
      for (let k = 0; k < 7; k++) rebar.cyl(0.025, 0.025, rnd(1.2, 2.6), px + rnd(-0.6, 0.6), 8.7 + rnd(-0.4, 0.8), z + rnd(-0.6, 0.6), RUST, { seg: 4, rx: rnd(-0.6, 0.6), rz: rnd(-0.6, 0.6) });
    }
    const m = put(cx, mid.mesh(lit)), h = put(cx, high.mesh(lit)), rb = put(cx, rebar.mesh(lit)); rb.visible = false;
    ic.piers.push({ row: r, z, mid: m, high: h, rebar: rb, state: 'ok', t: 0, vy: 0, dx: 0, dxS: rnd(-1, 1) });
  }
  put(cx, PL.mesh(lit));
  // ---- decks: for every level, segments between consecutive rows
  for (let L = 0; L < 5; L++) {
    for (let s = 0; s < nSeg; s++) {
      const P = new Parts(), G = new Parts(), z0 = zS - s * SEG;
      // slab, girders, cross diaphragms, barriers, lane paint, lamp posts and their glowing heads, orange lamps hung below
      P.box(W, 0.55, SEG, 0, -0.275, -SEG / 2, CONC, { jitter: 0.05 });
      for (let g = 0; g < 5; g++) P.box(0.45, 1.15, SEG - 0.4, -W / 2 + 1.1 + g * (W - 2.2) / 4, -1.1, -SEG / 2, CONC_D, { jitter: 0.06 });
      for (let d = 0; d < 4; d++) P.box(W - 1.4, 0.4, 0.35, 0, -1.25, -1.5 - d * 4.4, CONC_D);
      for (const sx of [-1, 1]) { P.box(0.45, 0.95, SEG, sx * (W / 2 - 0.22), 0.47, -SEG / 2, 0x7a766c, { jitter: 0.05 }); P.box(0.47, 0.18, SEG, sx * (W / 2 - 0.22), 0.7, -SEG / 2, 0x2a2a2a); }
      for (let d = 0; d < 6; d++) P.box(0.16, 0.02, 1.6, 0, 0.005, -1.0 - d * 2.7, 0xe8e4d6);
      for (let d = 0; d < 2; d++) for (const sx of [-1, 1]) { P.cyl(0.07, 0.09, 6.2, sx * (W / 2 - 0.3), 3.1, -3.5 - d * 9, STEEL, { seg: 5 }); G.box(0.7, 0.14, 0.4, sx * (W / 2 - 0.9), 6.15, -3.5 - d * 9, 0xffb860); P.box(0.8, 0.1, 0.5, sx * (W / 2 - 0.9), 6.25, -3.5 - d * 9, STEEL); }
      for (let d = 0; d < 4; d++) for (const sx of [-0.33, 0.33]) G.box(0.5, 0.16, 0.5, sx * W * 0.55, -1.8, -2.0 - d * 4.0, 0xffa040);
      const seg = new THREE.Group();
      const m1 = P.mesh(lit), m2 = G.mesh(glow);
      if (m1) seg.add(m1); if (m2) seg.add(m2);
      seg.position.set(x, LEVEL_Y[L], z0); cx.prop(seg); cx.game.senses?.patchObject?.(seg);
      const S = { L, s, g: seg, z0, y0: LEVEL_Y[L], state: 'ok', t: 0, pitch: 0, vy: 0, yy: 0, tilt: rnd(-0.1, 0.1), roll: rnd(-0.07, 0.07), done: false, drift: rnd(-0.6, 0.6), landAt: LEVEL_REST[L] + rnd(0, 0.3), cars: [] };
      ic.segs.push(S);
      // vehicles: three or four on each segment, in two lanes, their lamps lit
      const kinds = ['bus', 'taxi', 'auto', 'car', 'truck', 'taxi'], cols = [0xa83a2c, 0x2a4a7a, 0x8a8a84, 0x3a6a4a, 0x6a2a2a, 0xd0c8b0];
      let zc = -2.5 - rnd(0, 2);
      const n = 2 + Math.floor(rnd(0, 2.2));
      for (let k = 0; k < n && zc > -SEG + 3; k++) {
        const kind = kinds[(L * 3 + s * 2 + k) % kinds.length], lane = (k + L + s) % 2 ? 1 : -1;
        const { P: vp, G: vg } = vehicleGeo(kind, cols[(L + s + k) % cols.length]);
        const vh = new THREE.Group(), a = vp.mesh(lit), b = vg.mesh(glow); if (a) vh.add(a); if (b) vh.add(b);
        const len = kind === 'bus' ? 9.5 : kind === 'truck' ? 8.8 : kind === 'auto' ? 2.6 : 4.2;
        vh.position.set(lane * 2.1, 0, zc - len / 2);
        if (lane > 0) vh.rotation.y = Math.PI;
        seg.add(vh); cx.game.senses?.patchObject?.(vh);
        S.cars.push({ g: vh, lane, vx: 0, vy: 0, vz: 0, free: false, wx: rnd(-2, 2), wz: rnd(-2, 2) });
        ic.vehicles.push(S.cars[S.cars.length - 1]);
        zc -= len + rnd(1.2, 3);
      }
    }
  }
  // ---- timing: row r gives way at failAt[r]; the far end goes first
  ic.failAt = []; for (let r = 0; r < rows; r++) ic.failAt[r] = r * 0.5;
  ic.start = () => { ic.started = true; ic.t = 0; };
  ic.update = (dt, fx) => updateInterchange(ic, dt, fx);
  ic.tremble = (amp) => { for (const S of ic.segs) if (S.state === 'ok') S.g.position.x = x + Math.sin(cx.t * 46 + S.L * 1.7 + S.s) * amp; for (const P of ic.piers) if (P.state === 'ok') { P.mid.position.x = Math.sin(cx.t * 52 + P.row) * amp * 0.6; P.high.position.x = Math.sin(cx.t * 41 + P.row * 2) * amp * 0.9; } };
  return ic;
}

function updateInterchange(ic, dt, fx) {
  const cx = ic.cx, G = 20;
  if (!ic.started) return;
  ic.t += dt;
  const t = ic.t;
  // ---- piers: crack, shear, drop
  for (const P of ic.piers) {
    const ft = ic.failAt[P.row];
    if (P.state === 'ok' && t >= ft) {
      P.state = 'cracking'; P.t = 0;
      P.rebar.visible = true;
      const n = 4;
      for (let k = 0; k < n; k++) fx.spark(ic.x + rnd(-4, 4), rnd(8, 12), P.z, 20, 8);
      fx.cloud(ic.x, 9, P.z, 10, 3, { size: 2.2, grow: 7, life: 4, alpha: 0.4, speed: 3 });
      cx.shake(0.5, 1.2); cx.game.sfx?.crash(0.35);
    }
    if (P.state === 'cracking') {
      P.t += dt;
      const k = smooth(0, 0.45, P.t);
      P.mid.position.x = P.dxS * 0.35 * k; P.mid.rotation.z = P.dxS * 0.05 * k;
      if (P.t > 0.45) { P.state = 'falling'; P.t = 0; P.vy = 0; fx.cloud(ic.x, 12, P.z, 14, 4, { size: 3, grow: 9, life: 5, alpha: 0.4 }); }
    }
    if (P.state === 'falling') {
      P.t += dt; P.vy += G * dt;
      P.mid.position.y -= P.vy * dt; P.high.position.y -= P.vy * dt * 1.05; P.mid.rotation.z += P.dxS * dt * 0.25; P.high.rotation.z -= P.dxS * dt * 0.2; P.high.position.x += P.dxS * dt * 1.1;
      if (P.mid.position.y < -8.2 && P.state !== 'down') { P.mid.position.y = -8.2; P.state = 'down'; }
      if (P.high.position.y < -18) P.high.visible = false;
    }
  }
  // ---- deck segments
  for (const S of ic.segs) {
    const rowN = S.s + 1, rowS = S.s;                       // the near (south) row gives way first; the segment hinges on the far one, then drops
    const tN = ic.failAt[rowS] + 0.25 + S.L * 0.14, tS = ic.failAt[rowN] + 0.55 + S.L * 0.14;
    if (S.state === 'ok' && t >= tN) { S.state = 'hinge'; S.t = 0; cx.game.sfx?.crash(0.3 + 0.1 * S.L); }
    if (S.state === 'hinge') {
      S.t += dt;
      S.pitch = 0.5 * smooth(0, 0.9, S.t) * smooth(0, 0.9, S.t);     // the near end drops, hinged on the far one (positive pitch lowers the -z end? see below)
      S.g.rotation.x = S.pitch; S.g.rotation.z = S.roll * smooth(0, 1, S.t);
      S.g.position.y = S.y0 - SEG * Math.sin(S.pitch); S.g.position.z = S.z0 + SEG * (Math.cos(S.pitch) - 1);     // hinged on the far end
      if (t >= tS || S.t > 1.4) { S.state = 'drop'; S.vy = 0; S.t = 0; }
      // vehicles slide when the slope bites
      if (S.pitch < -0.18) for (const c of S.cars) if (!c.free) releaseCar(S, c, ic, fx);
    }
    if (S.state === 'drop') {
      S.t += dt; S.vy += G * dt; S.g.position.y -= S.vy * dt;
      S.g.position.x = ic.x + S.drift * smooth(0, 1.2, S.t);
      S.g.rotation.x += (S.tilt - S.g.rotation.x) * Math.min(1, dt * 1.6);
      if (S.g.position.y <= S.landAt) {
        S.g.position.y = S.landAt; S.state = 'down'; S.done = true;
        const k = 1 - S.L / 5;
        cx.shake(1.0 + k * 0.9, 1.8); cx.game.sfx?.crash(0.55 + 0.35 * k);
        const zc = S.z0 - SEG / 2;
        fx.cloud(ic.x, 1.2 + S.landAt, zc, 34, 7.5, { speed: 9, up: 3.5, size: 6, grow: 15, life: 7.5, alpha: 0.5 });
        for (let i = 0; i < 9; i++) fx.chunk(ic.x + rnd(-5, 5), S.landAt + rnd(1, 4), zc + rnd(-7, 7), rnd(-5, 5), rnd(3, 9), rnd(-2, 8), rnd(0.3, 1.1), rnd(0.2, 0.6), rnd(0.3, 1.1), [0x5c5850, 0x6a6962, 0x4a4944, 0x7a4a2c][i % 4]);
        for (let i = 0; i < 6; i++) fx.spark(ic.x + rnd(-5, 5), S.landAt + 1.5, zc + rnd(-7, 7), 8, 6);
        for (const c of S.cars) if (!c.free) releaseCar(S, c, ic, fx);
        cx.game.screenfx?.flash?.('#e6dcc4', 200, 0.12);
      }
    }
  }
  // ---- vehicles that came off the deck
  for (const c of ic.vehicles) {
    if (!c.free || c.rest) continue;
    c.vy -= 20 * dt; c.g.position.x += c.vx * dt; c.g.position.y += c.vy * dt; c.g.position.z += c.vz * dt;
    c.g.rotation.x += c.wx * dt * 0.4; c.g.rotation.z += c.wz * dt * 0.4;
    if (c.g.position.y < 1.6 + c.stackY) { c.g.position.y = 1.6 + c.stackY; if (Math.abs(c.vy) > 3) { c.vy *= -0.2; c.vx *= 0.5; c.vz *= 0.5; fx.cloud(c.g.position.x, c.g.position.y, c.g.position.z, 5, 2, { size: 3, grow: 7, life: 3.5, alpha: 0.4 }); cx.shake(0.5, 0.6); } else c.rest = true; }
  }
}

function releaseCar(S, c, ic, fx) {
  c.free = true;
  const g = c.g, scene = ic.cx.game.scene;
  scene.attach(g);                                     // keep its world transform, drop its parent
  c.vx = c.lane * rnd(0.5, 3); c.vy = rnd(-1, 2); c.vz = rnd(2, 9); c.stackY = S.L * 0.35;
  c.wx = rnd(-2.5, 2.5); c.wz = rnd(-3, 3);
  ic.cx.props.push(g);
}
