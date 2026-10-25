// Props and landmark dressing. Everything repeated is an InstancedMesh kind (see Builder.kind);
// one-offs (the dead tree, rubble, the bridge's cables) are merged static geometry. All placement is
// deterministic (a fixed-seed generator) so the city is the same every run.
import * as THREE from '../../vendor/three.module.js';
import { mergeGeometries } from '../../vendor/addons/utils/BufferGeometryUtils.js';
import { finishGeometry } from './builder.js';
import { TONE } from './structures.js';

export function fixedRng(seed) { let s = seed >>> 0; const f = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); f.range = (a, b) => a + (b - a) * f(); f.pick = (arr) => arr[Math.floor(f() * arr.length)]; return f; }

const NEON = [0x2ee6c8, 0xff4fa0, 0xffb347, 0x9ad0ff, 0xff7a3a, 0xc9ff6a];
const CAR_COLORS = [0x6b7a73, 0x7d6a52, 0x5a5f6d, 0x8a7a62, 0x4e6a6c, 0x6e4a42, 0x9a9a8c, 0x3f4a50];
const AWNING = [0xd98a2b, 0x2f8f86, 0xb23a6a, 0xd8cdb0, 0xa63c30, 0x6aa04a];
const CONTAINER = [0x8a4a32, 0x2f6a6e, 0x7a6a2e, 0x4a5f84, 0x6a3a3a, 0x4a7a56];

// ---------------------------------------------------------------------------------- instance kinds
export function defineKinds(b) {
  const part = (geo, color, mat = 'lit') => { const g = geo.index ? geo.toNonIndexed() : geo; return finishGeometry(g, color, mat, {}); };
  const box = (w, h, d, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); g.translate(x, y, z); return g; };

  const cyl = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1, false); cyl.translate(0, 0.5, 0);
  b.kind('pillar', part(cyl, 0xffffff), 'lit');
  const cube = box(1, 1, 1, 0, 0.5, 0);
  b.kind('cube', part(cube, 0xffffff), 'lit');
  b.kind('glow', part(cube.clone(), 0xffffff, 'emissive'), 'emissive');
  b.kind('car', mergeGeometries([
    part(box(1.9, 0.28, 4.3, 0, 0.26, 0), 0x2e3434),
    part(box(1.9, 0.62, 4.3, 0, 0.72, 0), 0xffffff),
    part(box(1.66, 0.6, 2.3, 0, 1.33, -0.2), 0x55605e),
  ], false), 'lit');
  b.kind('shack', mergeGeometries([
    part(box(1, 1, 1, 0, 0.5, 0), 0xffffff),
    part(box(1.22, 0.1, 1.22, 0, 1.05, 0), 0x6a5a4a),
    part(box(0.3, 0.7, 0.04, 0.2, 0.35, 0.5), 0x3a322c),
  ], false), 'lit');
  const tree = mergeGeometries([
    part(new THREE.CylinderGeometry(0.1, 0.16, 1.7, 5).translate(0, 0.85, 0), 0x5a4632),
    part(new THREE.IcosahedronGeometry(1.15, 0).translate(0, 2.3, 0), 0x6a7a3a),
    part(new THREE.IcosahedronGeometry(0.8, 0).translate(0.35, 3.1, 0.1), 0x7f8a45),
  ], false);
  b.kind('tree', tree, 'lit');
  // triangular-prism tent (ridge along z), pyramid (4-sided cone: spires, shrine canopies), flickering diya flame
  const tri = new THREE.Shape(); tri.moveTo(-0.5, 0); tri.lineTo(0.5, 0); tri.lineTo(0, 1); tri.closePath();
  const tent = new THREE.ExtrudeGeometry(tri, { depth: 1, bevelEnabled: false }); tent.translate(0, 0, -0.5);
  b.kind('tent', part(tent, 0xffffff), 'lit');
  const pyr = new THREE.ConeGeometry(0.7071, 1, 4); pyr.rotateY(Math.PI / 4); pyr.translate(0, 0.5, 0);
  b.kind('pyramid', part(pyr, 0xffffff), 'lit');
  b.kind('diya', part(new THREE.ConeGeometry(0.5, 1, 5).translate(0, 0.5, 0), 0xffffff, 'emissive'), 'emissive');
  b.kind('crow', mergeGeometries([
    part(box(0.16, 0.13, 0.34, 0, 0.1, 0), 0x16181c), part(box(0.09, 0.09, 0.1, 0, 0.2, -0.2), 0x16181c),
    part(box(0.05, 0.04, 0.09, 0, 0.19, -0.29), 0x2a2620), part(box(0.1, 0.03, 0.2, 0, 0.1, 0.25), 0x16181c),
  ], false), 'lit');
  b.kind('statue', mergeGeometries([
    part(box(1.3, 1.0, 1.3, 0, 0.5, 0), 0x8a8a80), part(box(0.8, 1.0, 0.6, 0, 1.5, 0), 0xffffff), part(box(0.34, 0.34, 0.34, 0, 2.2, 0), 0xffffff),
    part(box(0.2, 0.7, 0.2, -0.55, 1.45, -0.2), 0xffffff), part(box(0.2, 0.7, 0.2, 0.55, 1.45, -0.2), 0xffffff),
    part(new THREE.ConeGeometry(0.42, 0.5, 8).translate(0, 2.65, 0), 0xffffff, 'lit'),
  ], false), 'lit');
  // pointed (ogive) rib arch in the XY plane, span 1 wide, 0.866 tall at unit scale, extruded 1 along z: hung under decks
  const og = (r) => { const out = []; const N = 8; for (let i = 0; i <= N; i++) { const th = Math.PI - (Math.PI / 3) * (i / N); out.push([0.5 + Math.cos(th), Math.sin(th)]); } for (let i = N - 1; i >= 0; i--) out.push([-out[i][0], out[i][1]]); return out.map(([x, y]) => [x * r, y * r]); };
  const rs = new THREE.Shape(); const outer = og(1), inner = og(0.84).reverse();
  rs.moveTo(...outer[0]); for (const p of outer) rs.lineTo(...p); for (const p of inner) rs.lineTo(...p); rs.closePath();
  const rib = new THREE.ExtrudeGeometry(rs, { depth: 1, bevelEnabled: false }); rib.translate(0, 0, -0.5);
  b.kind('rib', part(rib, 0xffffff), 'lit');
  // soft additive light pool on the floor (unit horizontal quad with a radial falloff)
  const pg = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).toNonIndexed();
  pg.setAttribute('color', new THREE.BufferAttribute(new Float32Array(pg.attributes.position.count * 3).fill(1), 3));
  b.kind('pool', pg, 'pool');
  b.kind('drum', part(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 8).translate(0, 0.45, 0), 0xffffff), 'lit');
}

// ---------------------------------------------------------------------------------- helpers
/** Place an instance and (optionally) a solid AABB collider. Returns false if the spot is blocked. */
export function prop(ctx, kind, o, c = {}) {
  const { x, y, z, yaw = 0, sx = 1, sy = 1, sz = 1 } = o;
  const cs = Math.abs(Math.cos(yaw)), sn = Math.abs(Math.sin(yaw));
  const hx = (cs * sx + sn * sz) / 2, hz = (sn * sx + cs * sz) / 2;
  const { solid = true, walkable = false, tag = 'prop', check = true, pad = 0.05, supported = y > 0.5 } = c;
  if (check) {
    if (ctx.blocked(x, z, hx + pad, hz + pad, y, y + sy)) return false;
    if (ctx.inCut(x, z, Math.max(hx, hz))) return false;
    if (supported) {
      const g = ctx.phys.groundHeightAt(x, z, y + 0.1, 0.2, Math.min(hx, hz) * 0.9);
      if (!(Math.abs(g - y) < 0.3)) return false;
    }
  }
  ctx.b.instance(kind, o);
  if (solid) ctx.phys.addBox([x - hx, y, z - hz], [x + hx, y + sy, z + hz], { solid: true, walkable, tag });
  return true;
}

const dim = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();

// ---------------------------------------------------------------------------------- facades
export function dressFacades(ctx) {
  const rnd = fixedRng(7), b = ctx.b;
  const bands = [[12, 1.5], [24, 2], [38, 2], [0, 0]];
  const nearBand = (y) => bands.some(([c, w]) => w && Math.abs(y - c) < w);
  for (const { t } of ctx.facades) {
    const y0 = Math.max(t.y0 ?? 0, 0);
    if (t.h < 20 || t.style === 'control') continue;
    const faces = [
      { n: [0, 1], len: t.x1 - t.x0, at: (u) => [t.x0 + u, t.z1] }, { n: [0, -1], len: t.x1 - t.x0, at: (u) => [t.x0 + u, t.z0] },
      { n: [1, 0], len: t.z1 - t.z0, at: (u) => [t.x1, t.z0 + u] }, { n: [-1, 0], len: t.z1 - t.z0, at: (u) => [t.x0, t.z0 + u] },
    ];
    for (const f of faces) {
      const count = 1 + Math.floor(rnd() * 3);
      for (let i = 0; i < count; i++) {
        const w = 2.2 + rnd() * 3.2, h = 0.9 + rnd() * 1.1;
        const u = w / 2 + 1 + rnd() * Math.max(0.5, f.len - w - 2);
        const low = rnd() < 0.55;
        const y = low ? y0 + 3.5 + rnd() * 3 : y0 + 14 + rnd() * Math.min(t.h - y0 - 20, 26);
        if (y > t.h - 4 || nearBand(y) || nearBand(y + h)) continue;
        const [px, pz] = f.at(u);
        const ox = px + f.n[0] * 0.5, oz = pz + f.n[1] * 0.5;
        if (ctx.blocked(ox, oz, 0.3, 0.3, y, y + h)) continue;
        const color = dim(rnd.pick(NEON), low ? 0.7 : 0.5);
        const sx = f.n[0] !== 0 ? 0.18 : w, sz = f.n[0] !== 0 ? w : 0.18;
        b.instance('glow', { x: px + f.n[0] * 0.09, y, z: pz + f.n[1] * 0.09, sx, sy: h, sz, color });
        if (low && y0 < 1) {                       // wet-street reflection of the neon on the ground in front of it
          const reach = 5.5, hxz = f.n[0] !== 0;
          ctx.b.instance('pool', { x: px + f.n[0] * (reach / 2 + 0.3), y: 0.04, z: pz + f.n[1] * (reach / 2 + 0.3), sx: hxz ? reach : w * 0.9, sz: hxz ? w * 0.9 : reach, color: dim(color, 0.85) });
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------------- street furniture
export function scatterStreets(ctx) {
  const { b, map } = ctx, rnd = fixedRng(31);
  const lamp = (x, y, z, h = 5.4, head = 0xffb860, pool = true) => {
    if (ctx.blocked(x, z, 0.4, 0.4, y, y + h)) return;
    if (y > 0.5) { const g = ctx.phys.groundHeightAt(x, z, y + 0.1, 0.2, 0.2); if (!(Math.abs(g - y) < 0.3)) return; }
    b.instance('cube', { x, y, z, sx: 0.14, sy: h, sz: 0.14, color: 0x2c3438 });
    b.instance('glow', { x, y: y + h, z, sx: 0.6, sy: 0.22, sz: 0.6, color: head });
    ctx.phys.addBox([x - 0.07, y, z - 0.07], [x + 0.07, y + h, z + 0.07], { solid: true, walkable: false, tag: 'lamp' });
    if (pool) b.instance('pool', { x, y: y + 0.03, z, sx: 9, sz: 9, color: 0x6b4c1c });
  };
  // sodium lamps along every street, alternating sides
  for (const s of map.streets) {
    let side = 1;
    for (let t = s.from + 10; t < s.to - 5; t += 22) {
      const off = 8.2 * side; side = -side;
      if (s.axis === 'z') lamp(s.c + off, 0, t); else lamp(t, 0, s.c + off);
    }
  }
  // quay lamps
  for (let x = -130; x < 155; x += 28) lamp(x, 0, 140, 5, 0xffc878);
  for (let z = -160; z < 140; z += 28) lamp(-137, 0, z, 5, 0xffc878);
  // abandoned vehicles in lanes, on streets (G)
  const spots = [];
  for (const s of map.streets) {
    for (let t = s.from + 14; t < s.to - 14; t += 12 + rnd() * 26) {
      const lane = (rnd() < 0.5 ? -1 : 1) * (3 + rnd() * 3.5);
      spots.push(s.axis === 'z' ? { x: s.c + lane, z: t, yaw: rnd() < 0.5 ? 0 : Math.PI } : { x: t, z: s.c + lane, yaw: Math.PI / 2 * (rnd() < 0.5 ? 1 : -1) });
    }
  }
  for (const sp of spots) {
    if (rnd() < 0.4) continue;
    prop(ctx, 'car', { x: sp.x, y: 0, z: sp.z, yaw: sp.yaw, sx: 1, sy: 1.65, sz: 1, color: rnd.pick(CAR_COLORS) }, { tag: 'vehicle' });
  }
  // the promenade
  for (let x = -120; x < 150; x += 17 + rnd() * 20) prop(ctx, 'car', { x, y: 0, z: 128 + (rnd() < 0.5 ? -4 : 4), yaw: Math.PI / 2, sy: 1.65, color: rnd.pick(CAR_COLORS) }, { tag: 'vehicle' });
  // flyover traffic: stalled cars in lanes, with the odd jersey barrier
  for (const d of map.decks) {
    if (d.kind !== 'road' || !d.lane) continue;
    const alongX = d.lane === 'x', len = alongX ? d.x1 - d.x0 : d.z1 - d.z0, wid = alongX ? d.z1 - d.z0 : d.x1 - d.x0;
    const lanes = wid >= 8 ? [wid * 0.27, wid * 0.73] : [wid / 2];
    for (let t = 6; t < len - 6; t += 10 + rnd() * 24) {
      if (rnd() < 0.35) continue;
      const lane = rnd.pick(lanes);
      const x = alongX ? d.x0 + t : d.x0 + lane, z = alongX ? d.z0 + lane : d.z0 + t;
      if (d.id === 'road-h' && ((x > 62 && x < 94) || (x > 122 && x < 150))) continue;   // keep the lift lobbies' side lanes clear
      // Phase 8B: the cars on the flyovers are now moving traffic (src/systems/crowds), not parked props; the jersey barriers stay
      if (rnd() < 0.2) prop(ctx, 'cube', { x: alongX ? x + 4 : x, y: d.y, z: alongX ? z : z + 4, sx: alongX ? 2.2 : 0.7, sy: 0.9, sz: alongX ? 0.7 : 2.2, color: 0x8a8a80 }, { tag: 'barrier', walkable: true });
    }
  }
  // lamps along the flyovers (high sodium)
  for (const d of map.decks) {
    if (d.kind !== 'road' || !d.lane) continue;
    const alongX = d.lane === 'x', len = alongX ? d.x1 - d.x0 : d.z1 - d.z0;
    let side = 0;
    for (let t = 14; t < len - 8; t += 28) {
      const x = alongX ? d.x0 + t : (side ? d.x1 - 0.8 : d.x0 + 0.8), z = alongX ? (side ? d.z1 - 0.8 : d.z0 + 0.8) : d.z0 + t;
      side ^= 1;
      lamp(x, d.y, z, 6.5, 0xffd9a0, false);
    }
  }
}

// ---------------------------------------------------------------------------------- slums, yards, site
export function scatterAreas(ctx) {
  const { b, map } = ctx, rnd = fixedRng(5);
  const SHACK = [0x7a5a40, 0x5f6a5a, 0x8a6a48, 0x556068, 0x7a4a3a, 0x6a6a52];
  for (const s of map.slumShacks) {
    prop(ctx, 'shack', { x: s.x, y: 0, z: s.z, sx: s.w, sy: s.h, sz: s.d, color: rnd.pick(SHACK) }, { tag: 'shack' });
    if (rnd() < 0.35) b.instance('glow', { x: s.x + s.w / 2 + 0.1, y: 1.6, z: s.z, sx: 0.12, sy: 0.35, sz: 0.35, color: 0xffa860 });
  }
  const crates = (cx, cz, r, n, y = 0) => {
    for (let i = 0; i < n; i++) {
      const s = 0.7 + rnd() * 0.5;
      prop(ctx, 'cube', { x: cx + (rnd() - 0.5) * 2 * r, y, z: cz + (rnd() - 0.5) * 2 * r, yaw: rnd() * 3, sx: s, sy: s * (0.8 + rnd() * 0.3), sz: s, color: rnd.pick([0x7a6a4a, 0x6a5a40, 0x5a6a52]) }, { tag: 'crate', walkable: true });
    }
  };
  for (const c of [[-105, -80], [-105, 85], [-70, 85], [-45, 95], [20, 120], [-80, 26], [60, 90], [85, 80], [-45, -25], [-100, -92]]) crates(c[0], c[1], 7, 6);
  // containers stacked in the yards and on the site
  const yards = [[-62, -96, -28, -72]];   // (the hospital and the police station took the other two cells)
  for (const [x0, z0, x1, z1] of yards) {
    for (let i = 0; i < 9; i++) {
      const x = x0 + 4 + rnd() * (x1 - x0 - 8), z = z0 + 4 + rnd() * (z1 - z0 - 8), yaw = rnd() < 0.5 ? 0 : Math.PI / 2;
      const color = rnd.pick(CONTAINER);
      if (prop(ctx, 'cube', { x, y: 0, z, yaw, sx: 2.5, sy: 2.6, sz: 6.1, color }, { tag: 'container' }) && rnd() < 0.4) {
        prop(ctx, 'cube', { x, y: 2.6, z, yaw, sx: 2.5, sy: 2.6, sz: 6.1, color: rnd.pick(CONTAINER) }, { tag: 'container', supported: false, check: false });
      }
    }
  }
  for (let i = 0; i < 12; i++) {
    const x = 58 + rnd() * 34, z = 72 + rnd() * 36;
    prop(ctx, 'cube', { x, y: 0, z, yaw: rnd() * 3, sx: 2.5, sy: 2.6, sz: 6.1, color: rnd.pick(CONTAINER) }, { tag: 'container' });
  }
  // drums
  for (let i = 0; i < 40; i++) prop(ctx, 'drum', { x: -120 + rnd() * 270, y: 0, z: -165 + rnd() * 300, sx: 1, sy: 1, sz: 1, color: rnd.pick([0x6a3a2a, 0x3a5a6a, 0x5a5a40]) }, { tag: 'drum' });
}

// ---------------------------------------------------------------------------------- markets, terraces, gardens
export function scatterDecks(ctx) {
  const { b, map } = ctx, rnd = fixedRng(77);
  const stall = (x, z, y, yaw, vendor = false) => {
    const aw = rnd.pick(AWNING);
    const along = Math.abs(Math.sin(yaw)) > 0.5;
    const sx = along ? 1.3 : 2.8, sz = along ? 2.8 : 1.3;
    if (!prop(ctx, 'cube', { x, y, z, sx, sy: 1.0, sz, color: 0x7a6040 }, { tag: 'stall', walkable: true })) return false;
    const ax = along ? 3.1 : 3.4, az = along ? 3.4 : 2.6;
    b.instance('cube', { x, y: y + 2.55, z, sx: ax, sy: 0.1, sz: az, color: aw });
    for (const [px, pz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) b.instance('cube', { x: x + px * (ax / 2 - 0.1), y, z: z + pz * (az / 2 - 0.1), sx: 0.1, sy: 2.55, sz: 0.1, color: 0x3a3a38 });
    b.instance('glow', { x, y: y + 2.2, z, sx: 0.4, sy: 0.25, sz: 0.4, color: vendor ? 0x9affc0 : 0xffc070 });
    return true;
  };
  for (const m of map.markets) {
    for (let z = m.z0 + 4; z < m.z1 - 2; z += 7.5) {
      for (let x = m.x0 + 4; x < m.x1 - 2; x += 6.2) {
        if (rnd() < 0.25) continue;
        stall(x + (rnd() - 0.5) * 1.2, z + (rnd() - 0.5) * 1.2, m.y, rnd() < 0.5 ? 0 : Math.PI / 2);
      }
    }
  }
  // vendor booths (the D-shot sellers; Phase 3 decides which are active). The spot is where the vendor
  // stands; the counter is in front of them (yaw = the way the vendor faces, a multiple of 90 degrees).
  for (const v of map.vendorSpots) {
    const y = v.y, fx = -Math.round(Math.sin(v.yaw)), fz = -Math.round(Math.cos(v.yaw));   // facing direction
    const lat = fx ? [0, 1] : [1, 0];
    const at = (f, l) => [v.x + fx * f + lat[0] * l, v.z + fz * f + lat[1] * l];
    const sx = fx ? 0.9 : 3.2, sz = fx ? 3.2 : 0.9;
    const [cx, cz] = at(1.2, 0);
    ctx.phys.addBox([cx - sx / 2, y, cz - sz / 2], [cx + sx / 2, y + 1.1, cz + sz / 2], { solid: true, walkable: false, tag: 'vendor-booth' });
    b.instance('cube', { x: cx, y, z: cz, sx, sy: 1.1, sz, color: 0x58584e });
    const [bx, bz] = at(-1.0, 0);
    ctx.phys.addBox([bx - (fx ? 0.15 : 1.6), y, bz - (fx ? 1.6 : 0.15)], [bx + (fx ? 0.15 : 1.6), y + 2.4, bz + (fx ? 1.6 : 0.15)], { solid: true, walkable: false, tag: 'vendor-booth' });
    b.instance('cube', { x: bx, y, z: bz, sx: fx ? 0.3 : 3.2, sy: 2.4, sz: fx ? 3.2 : 0.3, color: 0x4a504a });
    const [ax, az] = at(0.1, 0);
    b.instance('cube', { x: ax, y: y + 2.5, z: az, sx: fx ? 2.6 : 3.6, sy: 0.1, sz: fx ? 3.6 : 2.6, color: 0x4d6a58 });
    for (const l of [-1.6, 1.6]) { const [px, pz] = at(1.2, l); b.instance('cube', { x: px, y, z: pz, sx: 0.1, sy: 2.5, sz: 0.1, color: 0x3a3a38 }); }
    const [lx, lz] = at(0.6, 0);
    b.instance('glow', { x: lx, y: y + 2.1, z: lz, sx: 0.5, sy: 0.3, sz: 0.5, color: 0x8affb0 });
    b.instance('pool', { x: v.x, y: y + 0.03, z: v.z, sx: 8, sz: 8, color: 0x2a6a44 });
  }
  // police checkpoints: the kiosk stands beside the release point
  for (const c of map.checkpoints) {
    const kx = c.x + 3.4;
    ctx.phys.addBox([kx - 1.2, 0, c.z - 1.1], [kx + 1.2, 2.6, c.z + 1.1], { solid: true, walkable: false, tag: 'police-booth' });
    b.instance('cube', { x: kx, y: 0, z: c.z, sx: 2.4, sy: 2.6, sz: 2.2, color: 0x4a5a70 });
    b.instance('glow', { x: kx, y: 2.6, z: c.z, sx: 0.5, sy: 0.35, sz: 0.5, color: 0x4a8aff });
    b.instance('pool', { x: c.x + 1.5, y: 0.03, z: c.z, sx: 11, sz: 9, color: 0x1e4a8a });
    b.instance('glow', { x: kx - 1.22, y: 1.5, z: c.z, sx: 0.04, sy: 0.5, sz: 1.2, color: 0x2a6a9a });
  }
  // story fragments: a small glowing device on a plinth at each spot (Phase 5 turns these into the real fragments)
  for (const f of map.fragmentSpots) {
    b.instance('cube', { x: f.x, y: f.y, z: f.z, sx: 0.5, sy: 0.75, sz: 0.5, color: 0x3a4244 });
    b.instance('glow', { x: f.x, y: f.y + 0.75, z: f.z, sx: 0.3, sy: 0.05, sz: 0.2, color: 0x9fe8ff });
    b.instance('pool', { x: f.x, y: f.y + 0.03, z: f.z, sx: 4, sz: 4, color: 0x2a6a7a });
  }
  // terrace roofs: AC units and tanks
  for (const t of ctx.towerRects) {
    if (t.kind !== 'terrace') continue;
    for (let i = 0; i < 6; i++) {
      const x = t.x0 + 3 + rnd() * (t.x1 - t.x0 - 6), z = t.z0 + 3 + rnd() * (t.z1 - t.z0 - 6);
      if (rnd() < 0.6) prop(ctx, 'cube', { x, y: t.y, z, sx: 1.6, sy: 1.1, sz: 1.2, color: 0x7f8580 }, { tag: 'ac', walkable: true });
      else prop(ctx, 'pillar', { x, y: t.y, z, sx: 2.4, sy: 2.6, sz: 2.4, color: 0x6a7068 }, { tag: 'tank' });
    }
  }
  // roof gardens (L3): lawns, planters, trees, benches
  for (const g of map.gardens) {
    const cx = (g.x0 + g.x1) / 2, cz = (g.z0 + g.z1) / 2, y = 38;
    for (let i = 0; i < 3; i++) {
      const w = 8 + rnd() * 8, d = 6 + rnd() * 8, x = g.x0 + 2 + rnd() * (g.x1 - g.x0 - w - 4), z = g.z0 + 2 + rnd() * (g.z1 - g.z0 - d - 4);
      if (ctx.blocked(x + w / 2, z + d / 2, w / 2, d / 2, y, y + 2)) continue;
      b.box([x, y, z], [x + w, y + 0.07, z + d], { color: 0x58683a, solid: false, walkable: false });
    }
    for (let i = 0; i < 9; i++) prop(ctx, 'tree', { x: g.x0 + 3 + rnd() * (g.x1 - g.x0 - 6), y, z: g.z0 + 3 + rnd() * (g.z1 - g.z0 - 6), sx: 1.2, sy: 1.2 + rnd() * 0.8, sz: 1.2, color: 0xffffff }, { tag: 'tree', check: true });
    for (let i = 0; i < 7; i++) prop(ctx, 'cube', { x: g.x0 + 3 + rnd() * (g.x1 - g.x0 - 6), y, z: g.z0 + 3 + rnd() * (g.z1 - g.z0 - 6), yaw: rnd() < 0.5 ? 0 : Math.PI / 2, sx: 3.2, sy: 0.8, sz: 1.2, color: 0x6a5a48 }, { tag: 'planter', walkable: true });
    for (let i = 0; i < 4; i++) prop(ctx, 'cube', { x: cx + (rnd() - 0.5) * 24, y, z: cz + (rnd() - 0.5) * 24, yaw: rnd() < 0.5 ? 0 : Math.PI / 2, sx: 2, sy: 0.5, sz: 0.6, color: 0x8a7a60 }, { tag: 'bench', walkable: true });
  }
}

// ---------------------------------------------------------------------------------- landmarks
export function buildLandmarks(ctx) {
  const { b, map } = ctx, rnd = fixedRng(12);
  const vis = { solid: false, walkable: false };
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);

  // ---------------- rubble field: stepped mounds (walkable, 0.45 m steps) + tilted slabs and rebar
  const rb = map.rubble;
  for (const mo of rb.mounds) {
    for (let k = 0; k < mo.levels; k++) {
      const r = mo.r - k * 1.15;
      if (r < 0.6) break;
      b.box([mo.x - r, 0, mo.z - r * (0.8 + 0.2 * Math.sin(k))], [mo.x + r, 0.45 * (k + 1), mo.z + r * (0.8 + 0.2 * Math.sin(k))], { color: [0x6e6a60, 0x5f5c54, 0x7a746a][k % 3], tag: 'rubble' });
    }
  }
  for (const c of rb.chunks) {
    const inside = ctx.blocked(c.x, c.z, 0.5, 0.5, 0.1, 3);
    p.set(c.x, (inside ? 1.6 : 0.5) + c.y * 0.3, c.z);
    e.set(c.tilt, c.rotY, c.tilt2); q.setFromEuler(e); m.compose(p, q, sc);
    b.geometry(new THREE.BoxGeometry(c.w, c.t, c.d), { color: 0x7d776a, matrix: m.clone() });
    if (rnd() < 0.6) {
      p.set(c.x + 1, 1.2, c.z); e.set(0, rnd() * 3, 0.5 + rnd()); q.setFromEuler(e); m.compose(p, q, sc);
      b.geometry(new THREE.BoxGeometry(3 + rnd() * 2, 0.07, 0.07), { color: 0x6a4630, matrix: m.clone() });
    }
  }
  // two crushed vehicles in the rubble
  for (const [x, z] of [[-56, -36], [-34, -22]]) {
    ctx.phys.addBox([x - 1.1, 0, z - 2.2], [x + 1.1, 0.9, z + 2.2], { solid: true, walkable: true, tag: 'wreck' });
    b.instance('car', { x, y: 0, z, yaw: 0.3, sx: 1, sy: 0.55, sz: 1, color: 0x6a5a48 });
  }

  // ---------------- dead tree: tapered trunk + recursive branches (visual), solid trunk
  const tr = map.deadTree;
  const trunk = new THREE.CylinderGeometry(1.0, 2.1, tr.height * 0.55, 9, 1, false);
  p.set(tr.x, tr.height * 0.275, tr.z); q.identity(); m.compose(p, q, sc);
  b.geometry(trunk, { color: 0x3c3830, matrix: m.clone(), noTint: true });
  ctx.phys.addBox([tr.x - 1.9, 0, tr.z - 1.9], [tr.x + 1.9, tr.height * 0.55, tr.z + 1.9], { solid: true, walkable: false, tag: 'dead-tree' });
  const branch = (o, dir, len, rad, depth) => {
    const g = new THREE.CylinderGeometry(rad * 0.6, rad, len, 5);
    g.translate(0, len / 2, 0);
    const qq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    const mm = new THREE.Matrix4().compose(o, qq, sc);
    b.geometry(g, { color: 0x3a362e, matrix: mm, noTint: true });
    if (depth <= 0) return;
    const end = o.clone().addScaledVector(dir.clone().normalize(), len);
    const n = depth > 2 ? 3 : 2;
    for (let i = 0; i < n; i++) {
      const d2 = dir.clone().normalize().add(new THREE.Vector3((rnd() - 0.5) * 1.5, rnd() * 0.5, (rnd() - 0.5) * 1.5)).normalize();
      if (d2.y < 0.05) d2.y = 0.2;
      branch(end, d2.normalize(), len * (0.7 + rnd() * 0.12), rad * 0.62, depth - 1);
    }
  };
  const top = new THREE.Vector3(tr.x, tr.height * 0.55 - 0.5, tr.z);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rnd() * 0.4;
    branch(top.clone(), new THREE.Vector3(Math.cos(a) * 0.9, 0.7 + rnd() * 0.4, Math.sin(a) * 0.9), 5.5 + rnd() * 2, 0.55, 3);
  }
  // roots
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + rnd() * 0.3;
    p.set(tr.x + Math.cos(a) * 2.6, 0.5, tr.z + Math.sin(a) * 2.6); e.set(0, -a, 0.9); q.setFromEuler(e); m.compose(p, q, sc);
    b.geometry(new THREE.BoxGeometry(4.2, 0.55, 0.6), { color: 0x3a362e, matrix: m.clone(), noTint: true });
  }

  // ---------------- metro: canopies, beacons, pillars, lights, train
  for (const [z0, z1] of [[-21, -4], [51, 67.5]]) {
    const x0 = 39, x1 = 51, y = 3.5;
    b.box([x0, y, z0], [x1, y + 0.4, z1], { color: 0x4a5558, tag: 'canopy', walkable: false });
    for (let z = z0 + 2; z < z1 - 1; z += 4) b.box([x0 + 1, y - 0.05, z], [x1 - 1, y + 0.02, z + 0.3], { ...vis, mat: 'emissive', color: dim(TONE.metro, 0.8), noTint: true });
    for (const [px, pz] of [[x0 + 0.5, z0 + 0.5], [x1 - 0.5, z0 + 0.5], [x0 + 0.5, z1 - 0.5], [x1 - 0.5, z1 - 0.5]]) {
      b.box([px - 0.3, 0, pz - 0.3], [px + 0.3, y, pz + 0.3], { color: 0x3c4648, tag: 'canopy-post', walkable: false });
      b.box([px - 0.1, y + 0.4, pz - 0.1], [px + 0.1, y + 9, pz + 0.1], { mat: 'emissive', color: TONE.metro, ...vis, noTint: true });
    }
  }
  const hall = map.uFloors.find((f) => f.id === 'u-hall');
  for (let z = hall.z0 + 4; z < hall.z1 - 2; z += 8) {
    for (const x of [hall.x0 + 10.2, hall.x1 - 10.2]) {
      b.instance('pillar', { x, y: -8, z, sx: 0.9, sy: 6, sz: 0.9, color: 0x6a726f });
      ctx.phys.addBox([x - 0.45, -8, z - 0.45], [x + 0.45, -2, z + 0.45], { solid: true, walkable: false, tag: 'u-pillar' });
    }
    for (const x of [hall.x0 + 5, hall.x1 - 5]) {
      b.instance('glow', { x, y: -2.45, z: z + 4, sx: 0.4, sy: 0.12, sz: 5, color: 0x8fd8d0 });
      b.instance('pool', { x, y: -8 + 0.03, z: z + 4, sx: 9, sz: 12, color: 0x3a6a62 });
    }
  }
  for (const f of map.uFloors) {
    if (f.id === 'u-hall' || f.ramp) continue;
    const long = f.x1 - f.x0 >= f.z1 - f.z0;
    const len = long ? f.x1 - f.x0 : f.z1 - f.z0, cx = (f.x0 + f.x1) / 2, cz = (f.z0 + f.z1) / 2;
    const concourse = f.id.startsWith('u-concourse');
    for (let t = 6; t < len - 3; t += concourse ? 8 : 12) {
      const x = long ? f.x0 + t : cx, z = long ? cz : f.z0 + t;
      if (concourse) {
        for (const o of [-9, 0, 9]) {
          const lx = long ? x : cx + o, lz = long ? cz + o : z;
          b.instance('glow', { x: lx, y: -2.45, z: lz, sx: long ? 0.4 : 4, sy: 0.12, sz: long ? 4 : 0.4, color: 0x8fd8d0 });
          b.instance('pool', { x: lx, y: -8 + 0.03, z: lz, sx: 12, sz: 12, color: 0x3a6a62 });
        }
      } else {
        b.instance('cube', { x, y: -3.1, z, sx: 0.5, sy: 0.18, sz: 0.5, color: 0x2a2f30 });
        b.instance('glow', { x, y: -3.32, z, sx: 0.36, sy: 0.2, sz: 0.36, color: 0xffa040 });
        b.instance('pool', { x, y: -8 + 0.03, z, sx: 8, sz: 8, color: 0x7a5018 });
      }
    }
    // pipes along the ceiling of tunnels
    if (!concourse && f.id !== 'u-chamber') {
      if (long) b.box([f.x0, -3.1, f.z0 + 0.6], [f.x1, -2.75, f.z0 + 0.95], { color: 0x6a4a38, ...vis });
      else b.box([f.x0 + 0.6, -3.1, f.z0], [f.x0 + 0.95, -2.75, f.z1], { color: 0x6a4a38, ...vis });
    }
  }
  // concourse benches / ticket gates (solid, small) and the stalled train
  const t0 = hall.tracks;
  b.box([t0.x0 + 1.8, -8.2, 8], [t0.x0 + 7.8, -4.8, 44], { color: 0x6a4838, tag: 'train', walkable: false });
  b.box([t0.x0 + 1.75, -6.9, 8], [t0.x0 + 7.85, -6.1, 44], { ...vis, mat: 'emissive', color: 0x2c6e66, noTint: true });
  b.box([t0.x0 + 1.9, -4.8, 8], [t0.x0 + 7.7, -4.65, 44], { ...vis, color: 0x3a3a38 });

  // ---------------- breach chamber: scaffolds, drums, hanging lamps, the cracked wall with seeping water
  const bc = map.breachChamber, s = bc.sump;
  for (const [x, z] of [[s.x0 - 1.5, s.z0 - 1.5], [s.x1 + 1.5, s.z0 - 1.5], [s.x0 - 1.5, s.z1 + 1.5], [s.x1 + 1.5, s.z1 + 1.5], [s.x0 - 1.5, (s.z0 + s.z1) / 2], [s.x1 + 1.5, (s.z0 + s.z1) / 2]]) {
    if (!ctx.blocked(x, z, 0.3, 0.3, -8, -2)) {
      b.box([x - 0.15, -8, z - 0.15], [x + 0.15, -2.2, z + 0.15], { color: 0x6a5a30, tag: 'scaffold', walkable: false });
      b.box([x - 1.5, -4.3, z - 0.07], [x + 1.5, -4.2, z + 0.07], { color: 0x6a5a30, ...vis });
    }
  }
  for (let i = 0; i < 8; i++) {
    const x = -136 + rnd() * 36, z = -49 + rnd() * 22;
    prop(ctx, 'drum', { x, y: -8, z, color: rnd() < 0.5 ? 0x7a4a2a : 0x4a5a5a }, { tag: 'drum', check: true });
  }
  for (let i = 0; i < 6; i++) prop(ctx, 'cube', { x: -134 + rnd() * 34, y: -8, z: -49 + rnd() * 22, yaw: rnd() * 3, sx: 1, sy: 0.9, sz: 1, color: 0x5a5440 }, { tag: 'crate', walkable: true });
  for (const [x, z] of [[-104, -34], [-120, -48], [-132, -28], [-112, -28], [-100, -46]]) {
    b.instance('glow', { x, y: -3.3, z, sx: 0.45, sy: 0.3, sz: 0.45, color: 0xffa040 });
    b.instance('pool', { x, y: -8 + 0.03, z, sx: 10, sz: 10, color: 0x7a5018 });
  }
  // the breach: a jagged crack of cold light in the west wall with water sheeting into the sump
  for (let i = 0; i < 9; i++) {
    const z = -44.5 + i * 1.8 + (rnd() - 0.5), y = -7.5 + i * 0.55 + rnd();
    b.box([-137.75, y, z], [-137.5, y + 1.3 + rnd(), z + 0.25 + rnd() * 0.3], { mat: 'emissive', color: 0x6ab8ff, ...vis, noTint: true });
  }
  for (let i = 0; i < 6; i++) {
    const z = -43 + i * 2.6 + rnd();
    b.box([-137.4, -10.9, z], [-137.1, -4 - rnd() * 1.5, z + 0.3], { mat: 'emissive', color: dim(0x4a98d8, 0.8), ...vis, noTint: true });
    b.box([-137.4, -12, z - 0.4], [-125.5, -11.45, z + 0.5], { ...vis, mat: 'emissive', color: dim(0x2a5f80, 0.55), noTint: true });
  }
  // wet seep in the west tunnel (the "water seeping through the wall" clue)
  b.box([-40.4, -8, -43.5], [-39.6, -4.6, -43.45], { mat: 'emissive', color: 0x5aa8e8, ...vis, noTint: true });
  b.box([-41.6, -8 + 0.02, -43.4], [-38.4, -8 + 0.05, -41.4], { mat: 'emissive', color: 0x1c3c50, ...vis, noTint: true });

  // ---------------- construction site: crane, hoarding, pipe stacks
  const crane = { x: 62, z: 78 };
  b.box([crane.x - 0.7, 0, crane.z - 0.7], [crane.x + 0.7, 58, crane.z + 0.7], { color: 0xc89a2a, tag: 'crane', walkable: false });
  b.box([crane.x - 22, 58, crane.z - 0.4], [crane.x + 18, 59, crane.z + 0.4], { color: 0xc89a2a, ...vis });
  b.box([crane.x - 0.15, 59, crane.z - 0.15], [crane.x + 0.15, 66, crane.z + 0.15], { color: 0xc89a2a, ...vis });
  b.box([crane.x - 21, 53, crane.z - 0.2], [crane.x - 19, 58, crane.z + 0.2], { color: 0x5a5a5a, ...vis });
  b.box([crane.x - 0.4, 66, crane.z - 0.4], [crane.x + 0.4, 66.8, crane.z + 0.4], { mat: 'emissive', color: 0xff3a2a, ...vis, noTint: true });
  b.box([crane.x - 21.4, 52, crane.z - 0.4], [crane.x - 19.6, 52.4, crane.z + 0.4], { mat: 'emissive', color: 0xffa040, ...vis, noTint: true });
  for (const [x0, z0, x1, z1] of [[55, 108.5, 71, 109.5], [79, 108.5, 95, 109.5], [93.5, 72, 94.5, 108], [55.5, 90, 56.5, 108]]) {
    b.box([x0, 0, z0], [x1, 2.6, z1], { color: 0x6a6a4a, tag: 'hoarding', walkable: false });
    b.box([x0, 2.6, z0], [x1, 2.7, z1], { color: 0xffb040, ...vis, mat: 'emissive', noTint: true });
  }
  for (let i = 0; i < 5; i++) b.box([80 + i * 2.2, 0, 74], [81.6 + i * 2.2, 0.8, 80], { color: 0x6a6a68, tag: 'pipes', walkable: true });
  // sand piles
  for (const [x, z] of [[62, 100], [88, 100]]) { b.box([x - 3, 0, z - 3], [x + 3, 0.5, z + 3], { color: 0x8a7a58, tag: 'sand' }); b.box([x - 1.8, 0.5, z - 1.8], [x + 1.8, 1.0, z + 1.8], { color: 0x8a7a58, tag: 'sand' }); }

  // ---------------- control terminal on the Upper Decks
  const ct = map.controlTowerTerminal;
  b.box([ct.x - 1.2, ct.y, ct.z - 1.6], [ct.x + 1.2, ct.y + 1.05, ct.z - 0.9], { color: 0x3a4448, tag: 'terminal', walkable: false });
  b.box([ct.x - 1.0, ct.y + 1.05, ct.z - 1.5], [ct.x + 1.0, ct.y + 1.8, ct.z - 1.35], { ...vis, mat: 'emissive', color: 0x4fe0ff, noTint: true });
  b.box([ct.x - 2.2, ct.y + 0.01, ct.z - 1.9], [ct.x + 2.2, ct.y + 0.05, ct.z + 1.5], { ...vis, mat: 'emissive', color: dim(0x4fe0ff, 0.4), noTint: true });
  // the Control Tower's lit doorway
  b.box([139, 38, -91.95], [145, 41.5, -91.8], { ...vis, mat: 'emissive', color: dim(0x4fe0ff, 0.6), noTint: true });

  // ---------------- Sunrise Bridge: pylons, stay cables, lamps, end arch
  const bd = map.decks.find((d) => d.id === 'sunrise-bridge'), zc = (bd.z0 + bd.z1) / 2;
  for (const px of [174, 196]) {
    for (const sz of [-1, 1]) {
      const z = zc + sz * 11;
      b.box([px - 1.1, -5, z - 1.1], [px + 1.1, 66, z + 1.1], { color: 0xc9bfa8, tag: 'pylon', walkable: false });
    }
    b.box([px - 1.1, 56, zc - 11], [px + 1.1, 58.5, zc + 11], { color: 0xc9bfa8, ...vis });
    b.box([px - 0.5, 66, zc - 12], [px + 0.5, 66.6, zc - 10], { mat: 'emissive', color: 0xffb347, ...vis, noTint: true });
    b.box([px - 0.5, 66, zc + 10], [px + 0.5, 66.6, zc + 12], { mat: 'emissive', color: 0xffb347, ...vis, noTint: true });
    for (const sz of [-1, 1]) {
      const topP = new THREE.Vector3(px, 64, zc + sz * 11);
      for (let k = 1; k <= 7; k++) for (const dx of [-1, 1]) {
        const bp = new THREE.Vector3(px + dx * k * 3.4, bd.y, zc + sz * 7);
        const dir = bp.clone().sub(topP), len = dir.length();
        const qq = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), dir.clone().normalize());
        const mm = new THREE.Matrix4().compose(topP.clone().add(bp).multiplyScalar(0.5), qq, sc);
        b.geometry(new THREE.BoxGeometry(len, 0.1, 0.1), { color: 0x8a8f90, matrix: mm, noTint: true });
      }
    }
  }
  for (let x = 160; x < 203; x += 7) b.box([x - 0.3, -5, zc - 0.5], [x + 0.3, bd.y - bd.th, zc + 0.5], { color: 0xb9b09a, ...vis });
  for (let x = 170; x < 205; x += 18) b.box([x - 1, -5, zc - 1], [x + 1, bd.y - bd.th, zc + 1], { color: 0xb9b09a, tag: 'bridge-pier', walkable: false });
  const end = map.sunriseBridgeEnd;
  for (const sz of [-1, 1]) b.box([end.x + 2.6, 38, end.z + sz * 8 - 0.3], [end.x + 3.2, 44, end.z + sz * 8 + 0.3], { color: 0xd8c9a8, tag: 'end-arch', walkable: false });
  b.box([end.x + 2.4, 43.5, end.z - 8.4], [end.x + 3.4, 44.5, end.z + 8.4], { color: 0xd8c9a8, ...vis });
  b.box([end.x + 2.5, 44.5, end.z - 8.2], [end.x + 3.3, 44.65, end.z + 8.2], { mat: 'emissive', color: 0xffd45a, ...vis, noTint: true });
  b.box([end.x - 1.5, 38.01, end.z - 3], [end.x + 1.5, 38.05, end.z + 3], { mat: 'emissive', color: dim(0xffd45a, 0.5), ...vis, noTint: true });
  for (let i = 0; i < 3; i++) prop(ctx, 'cube', { x: 206 + i * 3.4, y: 38, z: zc - 5.5, sx: 2, sy: 0.5, sz: 0.6, color: 0x8a7a60 }, { tag: 'bench', walkable: true });
  // bridge lamps: warm, leading east
  for (let x = 160; x <= 202; x += 8) for (const sz of [-1, 1]) {
    const z = zc + sz * 6.4;
    b.instance('cube', { x, y: 38, z, sx: 0.12, sy: 4, sz: 0.12, color: 0x3a4044 });
    b.instance('glow', { x, y: 42, z, sx: 0.5, sy: 0.2, sz: 0.5, color: 0xffc070 });
  }
}

// ---------------------------------------------------------------------------------- rail posts
export function flushRailPosts(ctx) {
  const b = ctx.b;
  ctx.railPostsAll = ctx.railPosts.slice();
  for (const [x, y, z, tone, light] of ctx.railPosts) {
    b.instance('cube', { x, y, z, sx: 0.1, sy: 1.34, sz: 0.1, color: 0x3a4346 });
    if (!light || y < 6) continue;
    const c = y < 20 ? 0xffb040 : y < 30 ? 0xffe2a8 : 0xfff0c8;
    b.instance('glow', { x, y: y + 1.34, z, sx: 0.14, sy: 0.12, sz: 0.14, color: c });
  }
  ctx.railPosts.length = 0;
}


// ---------------------------------------------------------------------------------- gothic and cyberpunk dressing
/** Ribbed vaults under the flyovers, shrines with diyas, crows, founder statues, puddles, door lamps. */
export function scatterGothic(ctx) {
  const { b, map } = ctx, rnd = fixedRng(2049);
  // ---- pointed-arch ribs hanging under road, walkway and bridge decks (apex flush with the underside)
  for (const d of map.decks) {
    if (!['road', 'walkway', 'bridge'].includes(d.kind)) continue;
    const alongX = d.lane ? d.lane === 'x' : d.x1 - d.x0 >= d.z1 - d.z0;
    const len = alongX ? d.x1 - d.x0 : d.z1 - d.z0, wid = alongX ? d.z1 - d.z0 : d.x1 - d.x0;
    const rise = Math.min(3.0, 0.45 * wid + 0.6), step = d.kind === 'road' ? 6 : 5;
    const bottom = d.y - d.th;
    for (let t = 3; t < len - 1.5; t += step) {
      const cx = alongX ? d.x0 + t : (d.x0 + d.x1) / 2, cz = alongX ? (d.z0 + d.z1) / 2 : d.z0 + t;
      if (ctx.inCut(cx, cz, 1)) continue;
      b.instance('rib', { x: cx, y: bottom - rise * 0.866, z: cz, yaw: alongX ? Math.PI / 2 : 0, sx: wid - 0.5, sy: rise, sz: 0.5, color: 0x5a6260 });
    }
  }
  // ---- street shrines: a stone niche with a pointed canopy, marigold garland and three diyas
  let shrines = 0;
  for (const sh of map.shrineSpots) {
    const { x, y, z } = sh;
    if (!prop(ctx, 'cube', { x, y, z, sx: 1.2, sy: 1.0, sz: 0.8, color: 0x7a7468 }, { tag: 'shrine', walkable: false })) continue;
    shrines++;
    b.instance('cube', { x, y: y + 1.0, z, sx: 1.4, sy: 0.12, sz: 1.0, color: 0x6a645a });
    b.instance('cube', { x, y: y + 1.12, z, sx: 0.9, sy: 0.7, sz: 0.55, color: 0x5a554c });
    b.instance('pyramid', { x, y: y + 1.82, z, sx: 1.0, sy: 0.9, sz: 0.7, color: 0x6a645a });
    b.instance('cube', { x, y: y + 0.55, z: z + 0.42, sx: 1.15, sy: 0.2, sz: 0.06, color: 0xe8a020 });   // marigolds
    b.instance('cube', { x: x + 0.3, y: y + 0.8, z: z + 0.42, sx: 0.2, sy: 0.35, sz: 0.06, color: 0xd86a20 });
    for (const dx of [-0.3, 0, 0.3]) { b.instance('diya', { x: x + dx, y: y + 1.16, z: z + 0.22, sx: 0.1, sy: 0.18, sz: 0.1, color: 0xffa040 }); ctx.diyas.push([x + dx, y + 1.16, z + 0.22]); }
    b.instance('pool', { x, y: y + 0.03, z: z + 1.2, sx: 5, sz: 5, color: 0x7a4a14 });
  }
  ctx.shrinesPlaced = shrines;
  // ---- founder statues (gold) on the Upper Decks
  for (const st of map.statues) {
    if (!prop(ctx, 'statue', { x: st.x, y: st.y, z: st.z, sx: 1, sy: 1, sz: 1, color: 0xffffff }, { tag: 'statue' })) continue;
    b.instance('glow', { x: st.x, y: st.y + 2.9, z: st.z, sx: 0.12, sy: 0.12, sz: 0.12, color: 0xffd45a });
  }
  // ---- crows on rails (a seeded sample of the rail posts) and lamp heads
  let crows = 0;
  for (const [x, y, z] of ctx.railPostsAll) {
    if (rnd() > 0.045 || y < 6) continue;
    b.instance('crow', { x, y: y + 1.34, z, yaw: rnd() * 6.28, sx: 1.4, sy: 1.4, sz: 1.4, color: 0xffffff }); crows++;
  }
  ctx.crows = crows;
  // ---- wet ground: dull sky-coloured puddles on G and U (additive: reads as a glossy patch)
  for (let i = 0; i < 170; i++) {
    const x = map.land.minX + 5 + rnd() * 290, z = map.land.minZ + 5 + rnd() * 300, r = 1.4 + rnd() * 2.6;
    if (ctx.blocked(x, z, r * 0.7, r * 0.7, 0, 0.6)) continue;
    b.instance('pool', { x, y: 0.035, z, sx: r * 2, sz: r * (1.2 + rnd()), color: dim(0x4a6a74, 0.5 + rnd() * 0.4) });
  }
  for (const f of map.uFloors) {
    if (f.ramp) continue;
    for (let i = 0; i < Math.min(14, ((f.x1 - f.x0) * (f.z1 - f.z0)) / 90); i++) {
      const x = f.x0 + 1.5 + rnd() * (f.x1 - f.x0 - 3), z = f.z0 + 1.5 + rnd() * (f.z1 - f.z0 - 3);
      if (ctx.blocked(x, z, 1, 1, -8, -7.2)) continue;
      b.instance('pool', { x, y: -8 + 0.035, z, sx: 2 + rnd() * 3, sz: 1.5 + rnd() * 2, color: dim(0x3a6a6e, 0.6) });
    }
  }
  // ---- warm lamps over the doors of the enterable buildings
  for (const d of ctx.doorLights) {
    b.instance('glow', { x: d.x, y: d.y, z: d.z, sx: 0.5, sy: 0.2, sz: 0.5, color: d.color });
    b.instance('pool', { x: d.x, y: 0.03, z: d.z, sx: 6, sz: 6, color: dim(d.color, 0.35) });
  }
}
