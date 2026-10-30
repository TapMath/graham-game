// The crash site as it is in the first minutes after the fall (the opening act, src/systems/story/opening.js). Built once, as a few
// merged meshes around the five fallen decks of Sion Junction (world/story.js): buses and cars that came down with the SkyGrid, some
// crushed, some upside down, one on its side; concrete, rebar, glass and festival marigolds everywhere; cables and rebar hanging off the
// broken walkway ends overhead; the hard-hat crate; the rescuers' spoil heap; the stretcher row and the ambulance bay by the triage tents;
// and the police cordon (barricades on every side and a gate at the south for the ambulances), which is only built while the opening holds
// Mithi inside it. Coordinates are in the city's frame (-Z is north). Draw calls: 2 for the site (lit and glowing), 2 for the cordon,
// 3 for the ambulance (body, red lamps, blue lamps), and only while each is in view.
//
//   const site = buildCrashSite(game, { cordon })
//   site.SPOTS                      named places of the opening (hat crate, pile, heap, injured, bay, row, gate, the route to the bay)
//   site.CORDON                     {x0, x1, z0, z1}: the rectangle the cordon closes (the walls stand on its edges)
//   site.cordon                     {mesh, gate, colliders[], open()} or null when not built
//   site.ambulance()                a new ambulance: {group, red, blue}; its front faces -z
//   site.heapGrow(n)                the spoil heap gains a chunk (n = how many the player has dropped)
import * as THREE from '../../vendor/three.module.js';
import { mergeGeometries } from '../../vendor/addons/utils/BufferGeometryUtils.js';
import { Parts } from '../systems/story/intro.js';
import { fixedRng } from './props.js';

export const CORDON = { x0: -69, x1: -24, z0: -51, z1: 9 };
export const SPOTS = {
  spawn: { x: -44, z: -30 },
  hat: { x: -40, z: -36, yaw: 0.35 },              // the red crate of hard hats and the volunteer handing them out
  pile: { x: -44, z: -40.6 },                       // where the bucket line lifts rubble off fallen deck 2
  heap: { x: -55, z: -36.5 },                       // the spoil heap they carry it to
  injured: { x: -56.5, z: -29.5 },                  // the woman on a stretcher, one bearer short
  route: [[-56.5, -29.5], [-54.5, -22.5], [-53, -11.5], [-41, -8.6], [-31.5, -7.6]],   // from the injured woman to the stretcher row
  row: { x: -32, z: -7 },                           // the stretcher row: the injured waiting for an ambulance
  bay: { x: -28, z: -2.5 },                         // where an ambulance stops (its front at z = -5)
  gate: { x: -28, z: 9 },                           // the cordon's south gate
  road: { x: -28, z: 62 },                          // where the ambulances come from, out of sight in the courtyard
  oldman: { x: -38.2, z: -26.3 },
};
// rows of the stretcher row (x of each stretcher, laid along z)
export const ROW_X = [-33.6, -32.4, -31.2, -30.0];

const CLEAR = [
  [SPOTS.spawn, 5], [SPOTS.oldman, 3.5], [{ x: -45, z: -26 }, 3], [SPOTS.hat, 2.6], [SPOTS.pile, 2.6], [SPOTS.heap, 3], [SPOTS.injured, 2.6],
  [{ x: -47, z: -34 }, 1.6], [{ x: -50, z: -47.5 }, 2], [{ x: -58, z: -21 }, 3],
];
const LANES = [(x, z) => Math.abs(z + 48) < 2 && x > -67 && x < -26, (x, z) => Math.abs(z + 13) < 2 && x > -67 && x < -26, (x, z) => Math.abs(x + 67) < 2 && z > -47 && z < -13, (x, z) => Math.abs(x + 25) < 2 && z > -47 && z < -13];
function segDist(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz, t = Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / l2));
  return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t);
}
/** Is (x, z) free for clutter (not on a spot, a lane, the route, the bay or the row)? r = the clutter's own radius. */
export function isClear(x, z, r = 0.5) {
  for (const [p, rr] of CLEAR) if (Math.hypot(x - p.x, z - p.z) < rr + r) return false;
  for (const f of LANES) if (f(x, z)) return false;
  const R = SPOTS.route;
  for (let i = 0; i + 1 < R.length; i++) if (segDist(x, z, R[i], R[i + 1]) < 1.4 + r) return false;
  if (x > -30.5 - r && x < -25.5 + r && z > -9 - r) return false;                         // the bay and the ambulance's way in
  if (x > -35 - r && x < -29 + r && z > -9.5 - r && z < -4.5 + r) return false;           // the stretcher row
  if (segDist(x, z, [SPOTS.pile.x, SPOTS.pile.z], [SPOTS.heap.x, SPOTS.heap.z]) < 1.3 + r) return false;   // the bucket line
  return true;
}

let _lit = null, _glow = null;
function mats() {
  _lit ??= new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color(0x1a1612) });
  _glow ??= new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
  return { lit: _lit, glow: _glow };
}
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
function place(geo, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _m.compose(_v.set(x, y, z), _q, _s.set(sx, sy, sz));
  geo.applyMatrix4(_m); return geo;
}
/** Dents: every vertex moves by a hash of where it is, so shared corners move together and the panels crumple without tearing. */
function crumple(geo, amt, seed = 1) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const h = (k) => { const s = Math.sin(x * 12.9898 * k + y * 78.233 + z * 37.719 * k + seed * 4.1) * 43758.5453; return s - Math.floor(s) - 0.5; };
    p.setXYZ(i, x + h(1.3) * amt, y + h(2.1) * amt * (y > 0.9 ? 1.6 : 0.6), z + h(3.7) * amt);
  }
  geo.computeVertexNormals();
  return geo;
}

// ------------------------------------------------------------------------------------------------------------ vehicles (local frame: front at -z)
function vehicle(kind, color, { crushed = 0, seed = 1 } = {}) {
  const P = new Parts(), G = new Parts();
  const glass = 0x1e2a33, black = 0x1a1816, rim = 0x3a3a3c;
  const wheel = (x, z, r = 0.36) => P.cyl(r, r, 0.26, x, r, z, black, { seg: 10, rz: Math.PI / 2 });
  if (kind === 'bus') {
    P.box(2.5, 2.7 * (1 - crushed), 9.6, 0, 0.45 + 1.35 * (1 - crushed), 0, color, { jitter: 0.1 }); P.box(2.52, 0.35, 9.6, 0, 0.42, 0, 0x2a2a2c);
    P.box(2.54, 0.25, 9.62, 0, 1.0, 0, 0xd8c8a0);                                          // the BEST cream stripe
    for (let i = 0; i < 6; i++) for (const s of [-1, 1]) P.box(0.04, 0.8 * (1 - crushed), 1.3, s * 1.27, 1.9 * (1 - crushed * 0.8), -3.8 + i * 1.55, glass);
    P.box(2.3, 0.9 * (1 - crushed), 0.05, 0, 1.9 * (1 - crushed * 0.8), -4.82, glass);
    for (const z of [-3.2, 3.2]) for (const x of [-1.1, 1.1]) wheel(x, z, 0.5);
    G.box(0.3, 0.2, 0.05, -0.9, 0.7, -4.82, 0xfff0c0); G.box(0.3, 0.2, 0.05, 0.9, 0.7, -4.82, 0x8a6a40);
    G.box(1.4, 0.24, 0.05, 0, 2.6 * (1 - crushed * 0.9), -4.82, 0xff9a30);                   // the route board, still lit
  } else if (kind === 'truck') {
    P.box(2.4, 1.6, 2.2, 0, 1.3, -3.4, color, { jitter: 0.1 }); P.box(2.5, 2.4 * (1 - crushed), 6.2, 0, 0.6 + 1.2 * (1 - crushed), 1.0, 0x7a6a4a, { jitter: 0.12 });
    P.box(2.5, 0.35, 8.8, 0, 0.45, 0, 0x222224); P.box(2.2, 0.7, 0.05, 0, 1.6, -4.52, glass);
    for (const z of [-3.2, 1.0, 3.0]) for (const x of [-1.1, 1.1]) wheel(x, z, 0.48);
    G.box(0.3, 0.2, 0.05, -0.8, 0.9, -4.52, 0xfff0c0);
  } else if (kind === 'taxi') {
    P.box(1.7, 0.7, 4.0, 0, 0.75, 0, 0x14110e); P.box(1.6, 0.6 * (1 - crushed), 2.2, 0, 1.4 - crushed * 0.35, 0.2, 0xe8c020, { jitter: 0.08 });
    P.box(1.62, 0.5 * (1 - crushed), 1.9, 0, 1.38 - crushed * 0.3, 0.25, glass);
    for (const z of [-1.3, 1.3]) for (const x of [-0.82, 0.82]) wheel(x, z, 0.3);
    G.box(0.3, 0.18, 0.05, -0.6, 0.8, -2.02, 0xfff0c0);
  } else if (kind === 'auto') {
    P.box(1.3, 1.25, 2.4, 0, 1.0, 0.2, 0x1c6a3a, { jitter: 0.1 }); P.box(1.32, 0.1, 2.0, 0, 1.68, 0.3, 0xd8c020); P.box(0.7, 0.7, 0.6, 0, 0.8, -1.4, 0x1c6a3a); P.box(1.3, 0.2, 2.6, 0, 0.35, 0, 0x201c18);
    P.cyl(0.24, 0.24, 0.16, 0, 0.24, -1.5, black, { seg: 10, rz: Math.PI / 2 }); for (const x of [-0.55, 0.55]) P.cyl(0.24, 0.24, 0.12, x, 0.24, 0.9, black, { seg: 10, rz: Math.PI / 2 });
  } else {                                                                                   // a car
    P.box(1.8, 0.75, 4.3, 0, 0.75, 0, color, { jitter: 0.1 }); P.box(1.7, 0.62 * (1 - crushed), 2.3, 0, 1.43 - crushed * 0.4, 0.2, color, { jitter: 0.08 });
    P.box(1.72, 0.52 * (1 - crushed), 2.0, 0, 1.42 - crushed * 0.38, 0.22, glass);
    for (const z of [-1.4, 1.4]) for (const x of [-0.86, 0.86]) wheel(x, z, 0.33);
    P.box(1.8, 0.2, 0.25, 0, 0.55, -2.18, rim); P.box(1.8, 0.2, 0.25, 0, 0.55, 2.18, rim);
    G.box(0.35, 0.18, 0.05, -0.62, 0.85, -2.17, 0xfff0c0); G.box(0.3, 0.16, 0.05, 0.62, 0.85, 2.17, 0xff2a20);
  }
  const lit = P.geo(), glow = G.geo();
  if (crushed > 0 || seed) crumple(lit, 0.06 + crushed * 0.18, seed);
  return { lit, glow };
}

// ------------------------------------------------------------------------------------------------------------ the ambulance
/** A 2049 Mumbai ambulance: a white electric van, a red-and-orange band, the 108 cross, a light bar. Front at -z. */
export function makeAmbulance(game) {
  const { lit, glow } = mats();
  const P = new Parts(), R = new Parts(), B = new Parts(), G = new Parts();
  P.box(2.1, 2.3, 5.6, 0, 1.45, 0.3, 0xeeeee8, { jitter: 0.04 });                              // the box
  P.box(2.0, 1.2, 1.4, 0, 0.95, -2.95, 0xeeeee8, { jitter: 0.04 });                           // the nose
  P.box(1.9, 0.62, 0.05, 0, 1.95, -2.27, 0x1e2a33); P.box(1.85, 0.5, 0.05, 0, 1.35, -3.66, 0x1e2a33);   // windscreen (two panes)
  for (const s of [-1, 1]) {
    P.box(0.04, 0.3, 5.7, s * 1.06, 1.15, 0.3, 0xd83a20); P.box(0.04, 0.14, 5.7, s * 1.06, 1.38, 0.3, 0xf0a020);   // the band
    P.box(0.04, 0.7, 0.22, s * 1.065, 2.0, 0.6, 0xd82a2a); P.box(0.04, 0.22, 0.7, s * 1.065, 2.0, 0.6, 0xd82a2a);   // the cross
    P.box(0.05, 0.55, 0.9, s * 1.06, 1.95, -1.6, 0x1e2a33);                                   // side window
  }
  P.box(2.12, 0.28, 6.9, 0, 0.42, -0.35, 0x2a2a2c);
  for (const z of [-2.6, 2.0]) for (const x of [-0.95, 0.95]) P.cyl(0.38, 0.38, 0.28, x, 0.38, z, 0x161412, { seg: 10, rz: Math.PI / 2 });
  P.box(1.6, 0.06, 0.04, 0, 1.6, 3.12, 0x9a9a98);                                             // the rear door seam
  P.box(0.04, 2.1, 0.04, 0, 1.45, 3.12, 0x9a9a98);
  // light bar: red left, blue right, and a strip on the back
  P.box(1.6, 0.16, 0.4, 0, 2.66, -1.9, 0x2a2a2c);
  R.box(0.7, 0.18, 0.36, -0.42, 2.8, -1.9, 0xff2a20); R.box(0.6, 0.12, 0.05, -0.5, 2.45, 3.13, 0xff2a20); R.box(0.12, 0.12, 0.05, -0.85, 0.85, -3.67, 0xff3a20);
  B.box(0.7, 0.18, 0.36, 0.42, 2.8, -1.9, 0x3a6aff); B.box(0.6, 0.12, 0.05, 0.5, 2.45, 3.13, 0x3a6aff); B.box(0.12, 0.12, 0.05, 0.85, 0.85, -3.67, 0x3a6aff);
  G.box(0.34, 0.2, 0.05, -0.65, 0.9, -3.67, 0xfff4d0); G.box(0.34, 0.2, 0.05, 0.65, 0.9, -3.67, 0xfff4d0);
  G.box(0.3, 0.16, 0.05, -0.85, 0.75, 3.13, 0xff2a20); G.box(0.3, 0.16, 0.05, 0.85, 0.75, 3.13, 0xff2a20);
  const group = new THREE.Group();
  const body = P.mesh(lit), red = R.mesh(glow), blue = B.mesh(glow), lamps = G.mesh(glow);
  // the lamps share the body's draw: merge them into one glowing mesh with the always-on lamps; red and blue flash
  group.add(body, red, blue, lamps);
  group.name = 'ambulance';
  game.scene.add(group);
  game.senses?.patchObject?.(group);
  group.visible = false;
  return { group, red, blue };
}

// ------------------------------------------------------------------------------------------------------------ the site
export function buildCrashSite(game, { cordon = false } = {}) {
  const { lit, glow } = mats(), phys = game.physics, rnd = fixedRng(2049);
  const L = [], G = [];                       // geometries for the two merged meshes
  const solid = (x0, y0, z0, x1, y1, z1, tag) => phys.addBox([x0, y0, z0], [x1, y1, z1], { solid: true, walkable: true, tag });

  // ---- the vehicles that came down with the SkyGrid: [kind, x, y, z, rx, ry, rz, color, crushed]
  const WRECKS = [
    ['bus', -58, 0, -45.3, 0.02, Math.PI / 2 + 0.08, 0.04, 0xb83a2c, 0.5, 'crushed under deck 1'],
    ['bus', -31, 1.27, -20, 0, 0.06, Math.PI / 2 + 0.03, 0x3a6a8a, 0.12, 'on its side'],
    ['car', -35.5, 1.85, -32, 0, 0.4, Math.PI, 0x6a2a2a, 0.35, 'upside down'],
    ['car', -50, 1.85, -21, 0.05, 1.2, Math.PI - 0.06, 0x2a4a7a, 0.4, 'upside down'],
    ['car', -35.5, 0.92, -38.5, 0.05, 0.1, Math.PI / 2 - 0.05, 0xd0c8b0, 0.2, 'on its side'],
    ['taxi', -65.6, 1.2, -35.6, -0.75, 0.3, 0.12, 0, 0.25, 'nose down against deck 4'],
    ['auto', -41, 0.66, -21.5, 0, 2.2, Math.PI / 2, 0, 0.1, 'on its side'],
    ['car', -46, 0, -18.6, 0, 0.1, 0.02, 0x8a8a84, 0.62, 'flattened under deck 5'],
    ['truck', -31, 0, -44.8, 0.04, Math.PI / 2 - 0.06, -0.05, 0x6a2a2a, 0.35, 'crushed'],
  ];
  const wrecks = [];
  WRECKS.forEach(([kind, x, y, z, rx, ry, rz, color, crushed, note], i) => {
    const { lit: a, glow: b } = vehicle(kind, color || 0x5a5f6d, { crushed, seed: i + 1 });
    place(a, x, y, z, rx, ry, rz); L.push(a);
    if (b) { place(b, x, y, z, rx, ry, rz); G.push(b); }
    a.computeBoundingBox(); const bb = a.boundingBox;
    // a collider a little inside the box: you can walk up to them and lean on them, not into them
    const c = solid(bb.min.x + 0.15, Math.max(0, bb.min.y), bb.min.z + 0.15, bb.max.x - 0.15, bb.max.y - 0.1, bb.max.z - 0.15, 'wreck');
    wrecks.push({ kind, x, z, note, collider: c });
  });

  // ---- clutter: chunks of deck, rebar, a fallen lamp post, barrier pieces, glass, marigolds from the festival, papers
  const Lp = new Parts(), Gp = new Parts();
  const CONC = [0x5c5850, 0x6a6962, 0x4a4944, 0x77736a];
  let placed = 0;
  for (let k = 0; k < 900 && placed < 120; k++) {
    const x = rnd.range(-66, -26), z = rnd.range(-50, -10), s = rnd.range(0.25, 1.3);
    if (!isClear(x, z, s)) continue;
    placed++;
    Lp.box(s * rnd.range(0.8, 1.8), s * rnd.range(0.3, 0.7), s * rnd.range(0.8, 1.6), x, s * 0.2, z, rnd.pick(CONC), { ry: rnd() * 3, rx: rnd.range(-0.3, 0.3), rz: rnd.range(-0.3, 0.3), jitter: 0.12 });
    if (rnd() < 0.45) for (let r = 0; r < 3; r++) Lp.cyl(0.02, 0.02, rnd.range(0.8, 2.2), x + rnd.range(-0.4, 0.4), s * 0.4 + 0.3, z + rnd.range(-0.4, 0.4), 0x7a4a2c, { seg: 4, rx: rnd.range(-1.1, 1.1), rz: rnd.range(-1.1, 1.1) });
    if (s > 1.0 && placed % 3 === 0) solid(x - s * 0.6, 0, z - s * 0.6, x + s * 0.6, s * 0.35, z + s * 0.6, 'rubble');   // low enough to step on
  }
  // small grit, glass and marigolds: no colliders
  for (let k = 0; k < 700; k++) {
    const x = rnd.range(-66, -26), z = rnd.range(-50, -9);
    if (!isClear(x, z, 0.1)) continue;
    const q = rnd();
    if (q < 0.55) Lp.box(rnd.range(0.08, 0.3), rnd.range(0.05, 0.14), rnd.range(0.08, 0.3), x, 0.04, z, rnd.pick(CONC), { ry: rnd() * 3 });
    else if (q < 0.72) Gp.box(rnd.range(0.05, 0.16), 0.01, rnd.range(0.05, 0.16), x, 0.02, z, 0x7a9ab0, { ry: rnd() * 3 });   // glass catching the work lamps
    else if (q < 0.88) Lp.ball(0.05, x, 0.04, z, rnd.pick([0xf0a020, 0xe06a10, 0xf6c040]), { detail: 0 });
    else Lp.box(0.21, 0.005, 0.3, x, 0.01, z, rnd.pick([0xe8e4d6, 0xd8d0b8, 0xc8402a]), { ry: rnd() * 3 });                     // paper, a festival flyer
  }
  // a fallen lamp post and a snapped direction gantry across the field
  Lp.cyl(0.09, 0.12, 9, -52, 0.15, -27.2, 0x3a3c40, { seg: 6, rz: Math.PI / 2, ry: 0.5 }); Lp.box(0.9, 0.12, 0.5, -48.2, 0.2, -29.3, 0x3a3c40, { ry: 0.5 });
  Gp.box(0.6, 0.06, 0.3, -48.2, 0.15, -29.3, 0x5a4a30, { ry: 0.5 });
  Lp.box(7, 0.35, 0.35, -36.5, 0.6, -13.6, 0x3a3c40, { ry: 0.12, rz: 0.15 }); Lp.box(4.6, 1.3, 0.08, -37.2, 0.95, -13.2, 0x1a4a8a, { ry: 0.12, rz: 0.15, rx: -0.9 });
  // barrier sections torn off the decks, standing on end
  for (const [x, z, ry, rz] of [[-53.5, -40.6, 0.3, 0.5], [-39.5, -44.5, 1.2, -0.4], [-61.5, -26.5, 0.1, 1.0], [-33.2, -25.0, 1.5, 0.8], [-47.8, -46.0, 0.2, 0.3]]) {
    Lp.box(0.45, 0.95, 5, x, 0.6, z, 0x7a766c, { ry, rz, jitter: 0.08 }); Lp.box(0.47, 0.18, 5, x, 1.0, z, 0x2a2a2a, { ry, rz });
  }
  // the broken ends overhead: cables and rebar hanging from the walkways at 12 m and the loop road at 24 m (what is still falling)
  for (const [x, y, z0, z1, n] of [[-55, 11.6, -33, -27, 14], [-35, 11.6, -33, -27, 14], [-45, 23.4, -30, -24, 10]]) {
    for (let i = 0; i < n; i++) {
      const len = rnd.range(1.5, 5.5), z = rnd.range(z0, z1);
      Lp.cyl(0.025, 0.025, len, x + rnd.range(-0.4, 0.4), y - len / 2, z, rnd() < 0.5 ? 0x7a4a2c : 0x1a1a1a, { seg: 4, rx: rnd.range(-0.25, 0.25), rz: rnd.range(-0.25, 0.25) });
    }
    for (let i = 0; i < 5; i++) Lp.box(rnd.range(0.4, 1.0), rnd.range(0.3, 0.6), rnd.range(0.4, 1.0), x + rnd.range(-0.6, 0.6), y - rnd.range(0.4, 1.4), rnd.range(z0, z1), rnd.pick(CONC), { rx: rnd(), rz: rnd() });
  }
  // a burst water main: a dark spreading pool by the old man's slab
  Lp.cyl(2.6, 2.6, 0.01, -41.5, 0.012, -23.2, 0x22262a, { seg: 16 });
  Lp.cyl(0.18, 0.18, 1.6, -40, 0.1, -22.5, 0x4a5a60, { seg: 8, rz: Math.PI / 2, ry: 0.4 });

  // ---- the hard-hat crate: a trestle table, two crates, a stack of yellow hats, a work lamp
  const H = SPOTS.hat;
  Lp.box(1.8, 0.06, 0.8, H.x, 0.85, H.z, 0x6a5a40, { ry: H.yaw }); for (const dx of [-0.75, 0.75]) Lp.box(0.06, 0.85, 0.7, H.x + Math.cos(H.yaw) * dx, 0.42, H.z - Math.sin(H.yaw) * dx, 0x4a3a2a, { ry: H.yaw });
  Lp.box(0.9, 0.6, 0.6, H.x - 1.4, 0.3, H.z + 0.6, 0xc8302a, { ry: H.yaw + 0.2 }); Lp.box(0.9, 0.6, 0.6, H.x - 1.2, 0.9, H.z + 0.5, 0xc8302a, { ry: H.yaw - 0.1 });
  for (let i = 0; i < 9; i++) { const hx = H.x + (i % 3 - 1) * 0.42, hz = H.z + (Math.floor(i / 3) - 1) * 0.18; Lp.ball(0.16, hx, 0.94 + (i % 2) * 0.04, hz, 0xf0c020, { detail: 1, sy: 0.75 }); Lp.cyl(0.21, 0.21, 0.02, hx, 0.9, hz, 0xe0b018, { seg: 10 }); }
  Lp.cyl(0.03, 0.03, 2.2, H.x + 1.1, 1.1, H.z - 0.4, 0x2a2a2c, { seg: 5 }); Gp.box(0.4, 0.25, 0.25, H.x + 1.1, 2.25, H.z - 0.4, 0xfff0c0);
  solid(H.x - 1.0, 0, H.z - 0.5, H.x + 1.0, 0.9, H.z + 0.5, 'hat-table');

  // ---- the spoil heap: a low mound the rescuers carry rubble to (heapGrow adds the player's chunks to a second mesh)
  const HP = SPOTS.heap;
  for (let i = 0; i < 26; i++) { const a = rnd() * 6.283, r = Math.sqrt(rnd()) * 1.9; Lp.box(rnd.range(0.3, 0.8), rnd.range(0.2, 0.5), rnd.range(0.3, 0.8), HP.x - 1.2 + Math.cos(a) * r, rnd.range(0.1, 0.9) * (1 - r / 2.2), HP.z - 1.6 + Math.sin(a) * r, rnd.pick(CONC), { ry: rnd() * 3, rx: rnd(), rz: rnd() }); }
  solid(HP.x - 2.6, 0, HP.z - 3, HP.x + 0.2, 0.55, HP.z - 0.4, 'spoil-heap');

  // ---- the stretcher row (empty frames; the injured on them are the opening's instanced bodies) and a first-aid post
  const R = SPOTS.row;
  Lp.box(4.4, 0.03, 3.0, R.x - 0.2, 0.015, R.z, 0x2a4a6a);                                   // a blue tarp on the ground
  Lp.box(1.2, 0.8, 0.6, R.x - 3.0, 0.4, R.z + 0.3, 0xe8e4d8); Lp.box(0.5, 0.12, 0.04, R.x - 3.0, 0.6, R.z - 0.01, 0xd82a2a); Lp.box(0.12, 0.5, 0.04, R.x - 3.0, 0.6, R.z - 0.01, 0xd82a2a);
  // the bay: painted lines and a hand-lettered board on a pole
  const B = SPOTS.bay;
  for (const dx of [-1.6, 1.6]) Lp.box(0.12, 0.01, 7, B.x + dx, 0.012, B.z - 0.5, 0xe8e0c0);
  Lp.cyl(0.04, 0.04, 2.4, B.x - 2.4, 1.2, B.z - 4.4, 0x2a2a2c, { seg: 5 }); Lp.box(1.1, 0.5, 0.04, B.x - 2.4, 2.3, B.z - 4.4, 0xe8e4d8);
  Lp.box(0.9, 0.12, 0.05, B.x - 2.4, 2.38, B.z - 4.43, 0xc8302a); Lp.box(0.7, 0.08, 0.05, B.x - 2.4, 2.2, B.z - 4.43, 0x2a2a2c);
  // work lamps on tripods round the field (their light pools come from the glow mesh; the sky's grade does the rest)
  for (const [x, z] of [[-48.5, -38.2], [-36.8, -28.5], [-57.5, -33.2], [-44.5, -21.0], [-30.8, -10.5], [-51.5, -12.4]]) {
    for (let k = 0; k < 3; k++) Lp.cyl(0.025, 0.025, 2.4, x + Math.cos(k * 2.1) * 0.35, 1.15, z + Math.sin(k * 2.1) * 0.35, 0x2a2a2c, { seg: 4, rx: Math.sin(k * 2.1) * 0.25, rz: -Math.cos(k * 2.1) * 0.25 });
    Lp.box(0.5, 0.35, 0.3, x, 2.45, z, 0x3a3a3c); Gp.box(0.44, 0.28, 0.05, x, 2.45, z - 0.16, 0xfff4d8);
  }
  const lp = Lp.geo(), gp = Gp.geo();
  if (lp) L.push(lp); if (gp) G.push(gp);
  const siteLit = new THREE.Mesh(mergeGeometries(L, false), lit); siteLit.name = 'crash-site';
  const siteGlow = new THREE.Mesh(mergeGeometries(G, false), glow); siteGlow.name = 'crash-site-lamps';
  for (const m of [siteLit, siteGlow]) { m.geometry.computeBoundingSphere(); game.scene.add(m); }
  game.senses?.patchObject?.(siteLit); game.senses?.patchObject?.(siteGlow);
  L.forEach((g) => g.dispose()); G.forEach((g) => g.dispose());

  // ---- the player's own chunks on the heap (grows as she drops them)
  const heapMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshLambertMaterial({ color: 0x6a665e, emissive: new THREE.Color(0x15130f) }), 8);
  heapMesh.count = 0; heapMesh.name = 'crash-site-heap'; heapMesh.frustumCulled = false; game.scene.add(heapMesh); game.senses?.patchObject?.(heapMesh);
  const heapGrow = (n) => {
    for (let i = 0; i < Math.min(8, n); i++) {
      const a = i * 2.1, r = 0.5 + (i % 3) * 0.3;
      _e.set(i * 0.7, i * 1.3, i * 0.4); _q.setFromEuler(_e);
      _m.compose(_v.set(HP.x - 0.6 + Math.cos(a) * r, 0.25 + (i > 3 ? 0.3 : 0), HP.z - 0.9 + Math.sin(a) * r), _q, _s.set(0.7, 0.4, 0.55));
      heapMesh.setMatrixAt(i, _m);
    }
    heapMesh.count = Math.min(8, n); heapMesh.instanceMatrix.needsUpdate = true;
  };

  const site = { SPOTS, CORDON, wrecks, meshes: [siteLit, siteGlow, heapMesh], heapGrow, cordon: null, ambulance: () => makeAmbulance(game) };
  if (cordon) site.cordon = buildCordon(game);
  return site;
}

// ------------------------------------------------------------------------------------------------------------ the cordon
/** Police barricades round the site and a barrier arm at the south gate; tall invisible walls keep Mithi in until open(). */
function buildCordon(game) {
  const { lit } = mats(), C = CORDON, phys = game.physics;
  const P = new Parts(), Gt = new Parts();
  const RED = 0xc8302a, WHITE = 0xe8e4d8;
  const barricade = (x, z, alongX, parts = P) => {
    const ry = alongX ? 0 : Math.PI / 2, ax = alongX ? 1 : 0, az = alongX ? 0 : 1;
    for (const s of [-1, 1]) parts.box(0.08, 1.05, 0.5, x + ax * s * 1.05, 0.52, z + az * s * 1.05, 0x2a2a2c, { ry });
    for (let i = 0; i < 6; i++) parts.box(0.36, 0.24, 0.06, x + ax * (i - 2.5) * 0.36, 0.86, z + az * (i - 2.5) * 0.36, i % 2 ? WHITE : RED, { ry });
    parts.box(2.2, 0.06, 0.06, x, 0.42, z, 0x3a3a3c, { ry });
  };
  const gateX0 = SPOTS.gate.x - 3, gateX1 = SPOTS.gate.x + 3;
  for (let x = C.x0 + 1.25; x < C.x1; x += 2.5) { barricade(x, C.z0, true); if (x < gateX0 || x > gateX1) barricade(x, C.z1, true); }
  for (let z = C.z0 + 1.25; z < C.z1; z += 2.5) { barricade(C.x0, z, false); barricade(C.x1, z, false); }
  // POLICE LINE tape between the barricades, a little above them, sagging
  for (const [x0, z0, x1, z1] of [[C.x0, C.z0, C.x1, C.z0], [C.x0, C.z0, C.x0, C.z1], [C.x1, C.z0, C.x1, C.z1], [C.x0, C.z1, gateX0, C.z1], [gateX1, C.z1, C.x1, C.z1]]) {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.ceil(len / 0.8);
    for (let i = 0; i < n; i++) {
      const u = (i + 0.5) / n, x = x0 + (x1 - x0) * u, z = z0 + (z1 - z0) * u;
      P.box(z0 === z1 ? 0.78 : 0.02, 0.07, z0 === z1 ? 0.02 : 0.78, x, 1.2 - Math.abs(Math.sin(u * len * 0.4)) * 0.12, z, i % 2 ? 0xf0d020 : 0x1a1a1a);
    }
  }
  // the south gate: a counterweighted barrier arm (it lifts for the ambulances) and a police booth
  const gz = C.z1;
  Gt.box(0.4, 1.1, 0.4, gateX0, 0.55, gz, 0x2a2a2c); Gt.box(0.4, 1.1, 0.4, gateX1, 0.55, gz, 0x2a2a2c);
  P.box(1.4, 2.4, 1.4, gateX0 - 1.8, 1.2, gz + 0.9, 0x56627a); P.box(1.5, 0.12, 1.5, gateX0 - 1.8, 2.45, gz + 0.9, 0x3a4448);
  const arm = new Parts();
  for (let i = 0; i < 12; i++) arm.box(0.5, 0.12, 0.12, 0.25 + i * 0.5, 0, 0, i % 2 ? WHITE : RED);
  const mesh = P.mesh(lit), gateMesh = Gt.mesh(lit), armMesh = arm.mesh(lit);
  armMesh.position.set(gateX0, 1.0, gz);
  mesh.name = 'cordon'; gateMesh.name = 'cordon-gate'; armMesh.name = 'cordon-arm';
  for (const m of [mesh, gateMesh, armMesh]) { game.scene.add(m); game.senses?.patchObject?.(m); }
  // the walls: tall enough that nobody climbs out over a wreck, low enough to stay under the SkyGrid overhead (12 m)
  const colliders = [];
  const wall = (x0, z0, x1, z1) => colliders.push(phys.addBox([x0, -2, z0], [x1, 9, z1], { solid: true, walkable: false, tag: 'cordon' }));
  wall(C.x0 - 0.4, C.z0 - 0.4, C.x1 + 0.4, C.z0); wall(C.x0 - 0.4, C.z1, C.x1 + 0.4, C.z1 + 0.4);
  wall(C.x0 - 0.4, C.z0, C.x0, C.z1); wall(C.x1, C.z0, C.x1 + 0.4, C.z1);
  const cordon = {
    mesh, gateMesh, armMesh, colliders, isOpen: false,
    lift(k) { armMesh.rotation.z = k * 1.35; },
    open() {
      if (cordon.isOpen) return;
      cordon.isOpen = true;
      for (const c of colliders) phys.remove(c);
      for (const m of [mesh, gateMesh, armMesh]) { game.scene.remove(m); m.geometry.dispose(); }
    },
  };
  return cordon;
}
