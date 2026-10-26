// The Harbour Line rake: a four-car suburban EMU, built once as two merged geometries (lit body, emissive trim) that every train
// shares. A Mumbai local: blue lower body, cream window band, yellow door frames, open windows with two grill bars, a safety bar
// across every doorway, longitudinal benches, hand-straps and ceiling tubes inside, the yellow cab ends.
//
// Local frame: x along the train (centre 0), y up from the street, z across. Floor top 0.5 m (the platform height). Door side
// colliders and everything physical are created in index.js from the same LAYOUT numbers. 3 draw calls per train in view (body, glow, ceiling fans).
import * as THREE from '../../../vendor/three.module.js';
import { mergeGeometries } from '../../../vendor/addons/utils/BufferGeometryUtils.js';
import { makeBoxGeometry, tint } from '../../world/builder.js';

export const LAYOUT = (() => {
  const cars = 4, carLen = 9, gap = 0.4, half = 1.4, L = cars * carLen + (cars - 1) * gap;
  const carX = Array.from({ length: cars }, (_, i) => (i - (cars - 1) / 2) * (carLen + gap));
  const doorW = 1.5, doorOff = 2.3;
  const doors = carX.flatMap((c) => [c - doorOff, c + doorOff]);              // x of every door centre (per side)
  // wall segments between doors (the open-door state's colliders), as [x0, x1]
  const segs = []; let cur = -L / 2;
  for (const d of doors) { segs.push([cur, d - doorW / 2]); cur = d + doorW / 2; }
  segs.push([cur, L / 2]);
  return { cars, carLen, gap, half, L, carX, doorW, doorOff, doors, segs, floorTop: 0.5, roofY: 2.62, wallT: 0.1, inner: half - 0.1 };
})();

const C = { blue: 0x35577f, blueDark: 0x2a4566, cream: 0xd6d9cb, yellow: 0xe9bf3b, grey: 0x8d9494, dark: 0x20252a, seat: 0x6b4c36, steel: 0xa8aeb0, roof: 0x9aa0a0, ceil: 0xc2c0a8 };

/** Builds {lit, emissive} geometries of one rake plus the passenger slots. */
export function buildRakeGeometry() {
  const lit = [], glow = [];
  let key = 0;
  const L = LAYOUT, shade = true;
  const B = (x0, x1, y0, y1, z0, z1, color, mat = 'lit') => {
    const g = makeBoxGeometry([Math.min(x0, x1), y0, Math.min(z0, z1)], [Math.max(x0, x1), y1, Math.max(z0, z1)], mat === 'lit' ? tint(color, 0.07, ++key) : color, mat, { shade });
    (mat === 'lit' ? lit : glow).push(g);
  };
  const half = L.half, inner = L.inner;
  for (const xc of L.carX) {
    const x0 = xc - L.carLen / 2, x1 = xc + L.carLen / 2;
    // chassis, bogies
    B(x0, x1, 0.28, 0.5, -half, half, C.dark);
    B(x0 + 0.5, x1 - 0.5, 0.12, 0.28, -1.1, 1.1, 0x16191c);
    for (const bx of [-3.0, 3.0]) { B(xc + bx - 0.9, xc + bx + 0.9, 0.05, 0.36, -1.25, 1.25, 0x14171a); B(xc + bx - 0.12, xc + bx + 0.12, 0.0, 0.2, -1.2, 1.2, 0x2a2e30); }
    // roof, hump, vents
    B(x0, x1, L.roofY, L.roofY + 0.16, -half, half, C.roof);
    B(x0 + 0.3, x1 - 0.3, L.roofY + 0.16, L.roofY + 0.28, -1.0, 1.0, 0x848a8a);
    for (const vx of [-3.2, -1.1, 1.1, 3.2]) B(xc + vx - 0.3, xc + vx + 0.3, L.roofY + 0.28, L.roofY + 0.44, -0.4, 0.4, 0x585e62);
    // ceiling underside and its tube lights (emissive: the carriage reads as lit from outside)
    B(x0 + 0.1, x1 - 0.1, L.roofY - 0.05, L.roofY, -inner, inner, C.ceil);
    B(xc - 3.7, xc + 3.7, L.roofY - 0.09, L.roofY - 0.05, -0.12, 0.12, 0xfff0c0, 'emissive');
    B(xc - 3.7, xc + 3.7, L.roofY - 0.09, L.roofY - 0.05, -0.9, -0.78, 0xffe8b0, 'emissive');
    B(xc - 3.7, xc + 3.7, L.roofY - 0.09, L.roofY - 0.05, 0.78, 0.9, 0xffe8b0, 'emissive');
    // hand rails along the car and straps hanging from them
    for (const rz of [-0.55, 0.55]) {
      B(xc - 4.3, xc + 4.3, 2.28, 2.32, rz - 0.025, rz + 0.025, C.steel);
      for (let sx = -4.0; sx <= 4.0; sx += 0.7) B(xc + sx - 0.02, xc + sx + 0.02, 1.88, 2.28, rz - 0.03, rz + 0.03, 0xd8d6c8);
    }
    for (const s of [-1, 1]) {
      const zo = s * half, zi = s * (half - L.wallT);
      // wall segments of this car: the sill (blue, with a darker kick plate), window posts and two grill bars, the header
      const segs = L.segs.filter(([a, b]) => b > x0 + 0.01 && a < x1 - 0.01).map(([a, b]) => [Math.max(a, x0), Math.min(b, x1)]);
      for (const [a, b] of segs) {
        if (b - a < 0.05) continue;
        B(a, b, 0.5, 1.25, Math.min(zo, zi), Math.max(zo, zi), C.blue);
        B(a, b, 0.5, 0.72, Math.min(zo, zi) - (s > 0 ? 0 : 0.02), Math.max(zo, zi) + (s > 0 ? 0.02 : 0), C.blueDark);
        const mid = (a + b) / 2;
        if (b - a > 1.8) B(mid - 0.04, mid + 0.04, 1.25, 2.2, Math.min(zo, zi), Math.max(zo, zi), C.cream);
        B(a, b, 1.52, 1.56, zo - 0.02, zo + 0.02, C.steel); B(a, b, 1.86, 1.9, zo - 0.02, zo + 0.02, C.steel);
        // bench along the wall (wood) with its low back
        const sa = a + 0.1, sb = b - 0.1;
        if (sb - sa > 0.8) { B(sa, sb, 0.5, 0.92, s > 0 ? 0.72 : -inner, s > 0 ? inner : -0.72, C.seat); B(sa, sb, 0.92, 1.28, s > 0 ? inner - 0.07 : -inner, s > 0 ? inner : -inner + 0.07, 0x5a3f2e); }
        // the lit trim above and below the window band, so the car glows from outside
        B(a, b, 1.25, 1.285, Math.min(zo, zi), Math.max(zo, zi), 0xffd890, 'emissive');
        B(a, b, 2.165, 2.2, Math.min(zo, zi), Math.max(zo, zi), 0xffd890, 'emissive');
      }
      // header band over the whole car length
      B(x0, x1, 2.2, 2.45, Math.min(zo, zi), Math.max(zo, zi), C.cream);
      B(x0, x1, 2.45, L.roofY, Math.min(zo, zi), Math.max(zo, zi) + (s > 0 ? 0.03 : 0), C.blue);
      B(x0, x1, 2.3, 2.34, zo - (s > 0 ? -0.0 : 0.0) - 0.0, zo + (s > 0 ? 0.035 : -0.035), 0xc83a30);     // the red stripe
      // door frames: yellow posts, two safety bars across the doorway
      for (const dx of [xc - L.doorOff, xc + L.doorOff]) {
        for (const e of [-1, 1]) B(dx + e * (L.doorW / 2) - 0.06, dx + e * (L.doorW / 2) + 0.06, 0.5, L.roofY, zo - 0.06, zo + 0.06, C.yellow);
        B(dx - L.doorW / 2, dx + L.doorW / 2, 0.98, 1.03, zo - 0.025, zo + 0.025, 0xe4e4dc);
        B(dx - L.doorW / 2, dx + L.doorW / 2, 1.5, 1.55, zo - 0.025, zo + 0.025, 0xe4e4dc);
        B(dx - 0.025, dx + 0.025, 0.5, 2.3, s * 1.05 - 0.025, s * 1.05 + 0.025, C.steel);          // the vertical pole just inside the door
        B(dx - 0.5, dx + 0.5, 0.45, 0.5, Math.min(zo, zo + s * 0.25), Math.max(zo, zo + s * 0.25), 0x2a2e30);   // the step
      }
    }
    // gangway bellows between this car and the next
    if (xc < L.carX[L.carX.length - 1]) B(x1, x1 + L.gap, 0.5, 2.5, -1.05, 1.05, 0x1c2024);
  }
  // the cab ends: yellow with a black band, the windscreen, lamp housings
  for (const e of [-1, 1]) {
    const ex = e * L.L / 2;
    const [a, b] = e > 0 ? [ex - 0.12, ex] : [ex, ex + 0.12];
    B(a, b, 0.5, L.roofY, -half, half, C.yellow);
    B(a, b + (e > 0 ? 0.02 : -0.02), 0.5, 0.9, -half, half, 0x24282c);
    B(a, b + (e > 0 ? 0.02 : -0.02), 1.35, 2.3, -1.0, 1.0, 0x0e1418);
    B(a, b + (e > 0 ? 0.02 : -0.02), 2.3, 2.5, -0.9, 0.9, 0x1c1c18);
    for (const z of [-0.95, 0.95]) B(a, b + (e > 0 ? 0.06 : -0.06), 0.92, 1.12, z - 0.12, z + 0.12, 0x3a3e40);
    B(a, b + (e > 0 ? 0.04 : -0.04), 2.5, 2.58, -0.5, 0.5, 0xffc860, 'emissive');       // the route board
  }
  const mergedLit = mergeGeometries(lit, false), mergedGlow = mergeGeometries(glow, false);
  lit.forEach((g) => g.dispose()); glow.forEach((g) => g.dispose());
  mergedLit.computeBoundingSphere(); mergedGlow.computeBoundingSphere();
  return { lit: mergedLit, glow: mergedGlow };
}

/**
 * The people in a rake: seated along the benches, standing packed in the aisle and the vestibules, a few hanging out of the doors.
 * Each slot: {x, z, y, yaw, pose, side} in the train's local frame. pose 0 stand, 1 sit, 2 hang (arms up, leaning out).
 * Deterministic (fixed generator) so the trains look the same every run; `density` thins it for night trains.
 */
export function riderSlots(seed = 17, density = 1) {
  let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const L = LAYOUT, out = [];
  const seg = L.segs.filter(([a, b]) => b - a > 0.9);
  for (const sd of [-1, 1]) {
    for (const [a, b] of seg) {
      for (let x = a + 0.35; x < b - 0.2; x += 0.52) {
        if (rnd() > 0.88 * density) continue;
        out.push({ x: x + (rnd() - 0.5) * 0.08, z: sd * 1.02, y: 0.5, yaw: sd > 0 ? Math.PI / 2 : -Math.PI / 2, pose: 1, side: sd });
      }
    }
  }
  for (let x = -L.L / 2 + 0.7; x < L.L / 2 - 0.6; x += 0.5) {
    for (const z of [-0.5, 0.0, 0.5]) {
      if (rnd() > 0.5 * density) continue;
      out.push({ x: x + (rnd() - 0.5) * 0.22, z: z + (rnd() - 0.5) * 0.18, y: 0.5, yaw: rnd() * Math.PI * 2, pose: 0, side: 0 });
    }
  }
  // the iconic ones: hanging out of the doors by one arm
  L.doors.forEach((dx, i) => {
    for (const sd of [-1, 1]) {
      if (rnd() > 0.45 * density) continue;
      out.push({ x: dx + (rnd() - 0.5) * 0.7, z: sd * 1.56, y: 0.5, yaw: sd > 0 ? 0 : Math.PI, pose: 2, side: sd, door: i });
    }
  });
  return out;
}

/** Three ceiling fans per car (hub + three blades), turned a little each frame through one InstancedMesh per train. */
const FAN_Y = LAYOUT.roofY - 0.2;
export const FAN_SPOTS = LAYOUT.carX.flatMap((c) => [-2.8, 0, 2.8].map((o) => [c + o, FAN_Y, 0]));
function buildFanGeometry() {
  const parts = [makeBoxGeometry([-0.07, -0.05, -0.07], [0.07, 0.07, 0.07], 0x2a2e30, 'lit', { shade: true })];
  for (let i = 0; i < 3; i++) {
    const g = makeBoxGeometry([0.06, -0.01, -0.055], [0.52, 0.012, 0.055], 0xc9c4b0, 'lit', { shade: true });
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(i * Math.PI * 2 / 3));
    parts.push(g);
  }
  const m = mergeGeometries(parts, false); parts.forEach((g) => g.dispose());
  return m;
}
let fanGeo = null;

/** The meshes of one train (the two merged geometries are shared). */
export function makeTrainMeshes(game, geo) {
  const group = new THREE.Group();
  const lit = new THREE.Mesh(geo.lit, game.materials.lit), glow = new THREE.Mesh(geo.glow, game.materials.emissive);
  lit.name = 'train-body'; glow.name = 'train-glow';
  fanGeo = fanGeo || buildFanGeometry();
  const fans = new THREE.InstancedMesh(fanGeo, game.materials.lit, FAN_SPOTS.length);
  fans.name = 'train-fans'; fans.frustumCulled = false; fans.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(lit, glow, fans);
  group.userData.fans = fans; spinFans(group, 0);
  return group;
}

const _m = new THREE.Matrix4(), _r = new THREE.Matrix4();
/** Turn the fans of one train to the time `t` (seconds); the blades are lit by the car's tube lights, so a slow blur of motion is enough. */
export function spinFans(group, t) {
  const fans = group.userData.fans; if (!fans) return;
  FAN_SPOTS.forEach((p, i) => {
    _r.makeRotationY(t * (7 + (i % 3)) + i * 1.7); _m.makeTranslation(p[0], p[1], p[2]).multiply(_r);
    fans.setMatrixAt(i, _m);
  });
  fans.instanceMatrix.needsUpdate = true;
}
