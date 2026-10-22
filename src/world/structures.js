// Structural geometry of the city, built from MAP through the Builder: ground slab, underground,
// towers, decks, stairs/ramps/lifts, pillars and railings. (Props and landmarks live in props.js.)
//
// Rule of thumb used throughout: every walking surface is an AABB or a ramp registered with
// game.physics; every level change is a stair (0.3 m risers), a ramp or a lift, so the player's
// 0.6 m step-up and 1.1 m jump are always enough. Railings are generated automatically on every
// walkable edge that has a drop beside it (see edgeSegments).
import * as THREE from 'three';
import { Y } from './map.js';

export const TONE = {
  free: 0x59d6a2, gate5: 0xffb347, gate8: 0xff6a4a, metro: 0x4fe0ff, work: 0xffa030, sun: 0xffd45a, surya: 0xffcf6a, danger: 0xff5a4a,
};
export const DECK_COLOR = { walkway: 0x7b7463, road: 0x474d50, bridge: 0x80786a, pier: 0x6b6a62, terrace: 0x7b7668 };
const RAIL_H = 1.3;

export function subtractRects(r, cuts) {
  let pieces = [r];
  for (const c of cuts) {
    const next = [];
    for (const p of pieces) {
      if (c.x1 <= p.x0 || c.x0 >= p.x1 || c.z1 <= p.z0 || c.z0 >= p.z1) { next.push(p); continue; }
      if (c.z0 > p.z0) next.push({ x0: p.x0, z0: p.z0, x1: p.x1, z1: c.z0 });
      if (c.z1 < p.z1) next.push({ x0: p.x0, z0: c.z1, x1: p.x1, z1: p.z1 });
      const z0 = Math.max(p.z0, c.z0), z1 = Math.min(p.z1, c.z1);
      if (c.x0 > p.x0) next.push({ x0: p.x0, z0, x1: c.x0, z1 });
      if (c.x1 < p.x1) next.push({ x0: c.x1, z0, x1: p.x1, z1 });
    }
    pieces = next;
  }
  return pieces.filter((p) => p.x1 - p.x0 > 0.01 && p.z1 - p.z0 > 0.01);
}

/** Shared build state: the builder, physics, and helpers used by every build step. */
export class Ctx {
  constructor(game, b, map) {
    this.game = game; this.b = b; this.map = map; this.phys = game.physics;
    this.openings = [];        // rects where a rail must not be generated (lift doors)
    this.cutRects = [];        // unstable slab rects (no pillars / markings through them)
    this.slabDefs = [];        // unstable slabs to instantiate in city.js
    this.railPosts = [];       // [x,y,z,tone] for instanced rail posts
    this.pillarsPlaced = 0;
    this.lifts = [];
    this.stairInfo = new Map();
    this.clear = [];
    this.diyas = [];            // flickering diya flames [x,y,z]
    this.railPostsAll = [];
    this.doorLights = [];       // warm lamps over doors (instanced in props)
    this.steam = [];            // steam vent origins (rising puffs)           // keep-clear zones: props never go here (approaches, spawn, spots)
  }

  /** Reserve a square/rect (x0,z0,x1,z1) from walking height y so dressing never blocks it. */
  keepClear(x0, z0, x1, z1, y, h = 3.2) { this.clear.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), y0: y - 0.3, y1: y + h }); }
  keepClearAround(x, z, r, y) { this.keepClear(x - r, z - r, x + r, z + r, y); }

  /** Is there something that makes a rail unnecessary at (px,pz) for a deck at height y? */
  covered(px, pz, y, drop = 0.7, railH = RAIL_H) {
    const g = this.phys.groundHeightAt(px, pz, y, 0.7, 0.05);
    if (g > y - drop) return true;
    const list = this.phys.query(px - 0.05, pz - 0.05, px + 0.05, pz + 0.05);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.solid && !c.userData?.rail && c.min.y < y + railH && c.max.y > y + 0.5) return true;
    }
    for (const o of this.openings) {
      if (px >= o.x0 && px <= o.x1 && pz >= o.z0 && pz <= o.z1 && Math.abs(y - o.y) < 0.9) return true;
    }
    return false;
  }

  /** True if a solid overlaps the XZ footprint within the vertical range (ignores floors at/below y0). */
  blocked(x, z, hx, hz, y0, y1) {
    for (const c of this.clear) if (x + hx > c.x0 && x - hx < c.x1 && z + hz > c.z0 && z - hz < c.z1 && y1 > c.y0 && y0 < c.y1) return true;
    const list = this.phys.query(x - hx, z - hz, x + hx, z + hz);
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (c.solid && c.min.y < y1 && c.max.y > y0 + 0.06) return true;
    }
    return false;
  }

  inCut(x, z, pad = 0.5) {
    return this.cutRects.some((c) => x > c.x0 - pad && x < c.x1 + pad && z > c.z0 - pad && z < c.z1 + pad);
  }
}

/** Uncovered stretches along the 4 edges of a rect: [{axis, fixed, n:[nx,nz], a, b}]. */
export function edgeSegments(ctx, r, y, { drop = 0.7, step = 0.5, railH = RAIL_H } = {}) {
  const out = [];
  const sides = [
    { n: [0, -1], fixed: r.z0, axis: 'x', a0: r.x0, a1: r.x1 },
    { n: [0, 1], fixed: r.z1, axis: 'x', a0: r.x0, a1: r.x1 },
    { n: [-1, 0], fixed: r.x0, axis: 'z', a0: r.z0, a1: r.z1 },
    { n: [1, 0], fixed: r.x1, axis: 'z', a0: r.z0, a1: r.z1 },
  ];
  for (const s of sides) {
    let start = null;
    const n = Math.max(1, Math.round((s.a1 - s.a0) / step));
    const st = (s.a1 - s.a0) / n;
    for (let i = 0; i < n; i++) {
      const t = s.a0 + (i + 0.5) * st;
      const px = s.axis === 'x' ? t : s.fixed + s.n[0] * 0.4;
      const pz = s.axis === 'x' ? s.fixed + s.n[1] * 0.4 : t;
      const cov = ctx.covered(px, pz, y, drop, railH);
      if (!cov) { if (start === null) start = s.a0 + i * st; }
      else if (start !== null) { out.push({ ...s, a: start, b: s.a0 + i * st }); start = null; }
    }
    if (start !== null) out.push({ ...s, a: start, b: s.a1 });
  }
  return out;
}

/** Box bounds for a wall/rail running along a segment, sitting just inside the edge. */
function segBox(s, th, y0, y1) {
  if (s.axis === 'x') {
    const z0 = s.n[1] < 0 ? s.fixed : s.fixed - th;
    return { min: [s.a, y0, z0], max: [s.b, y1, z0 + th] };
  }
  const x0 = s.n[0] < 0 ? s.fixed : s.fixed - th;
  return { min: [x0, y0, s.a], max: [x0 + th, y1, s.b] };
}

/** One rail segment: a solid collider plus thin visual bars; posts are queued for instancing. */
export function addRail(ctx, s, y, { h = RAIL_H, style = 'rail', tone = 0xffb347, postEvery = 3 } = {}) {
  const b = ctx.b, th = 0.18;
  const col = segBox(s, th, y, y + h);
  b.world.addBox(col.min, col.max, { solid: true, walkable: false, tag: 'rail', userData: { rail: true } });
  const vis = (y0, y1, t, color, mat = 'lit') => {
    const bx = segBox(s, t, y0, y1);
    if (s.axis === 'x') { const off = (th - t) / 2 * (s.n[1] < 0 ? 1 : -1); bx.min[2] += off; bx.max[2] += off; }
    else { const off = (th - t) / 2 * (s.n[0] < 0 ? 1 : -1); bx.min[0] += off; bx.max[0] += off; }
    b.box(bx.min, bx.max, { color, mat, solid: false, walkable: false, visual: true, noTint: mat === 'emissive' });
  };
  if (style === 'wall') {                       // low solid parapet (roads, sea walls)
    vis(y, y + h, th, 0x5d6462);
    vis(y + h - 0.05, y + h + 0.03, 0.26, 0x8a8f88);
    return;
  }
  vis(y, y + 0.32, 0.12, 0x4a5456);
  vis(y + 0.62, y + 0.68, 0.06, 0x677074);
  vis(y + h - 0.12, y + h, 0.1, 0x8d948d);
  const len = s.b - s.a, n = Math.max(1, Math.round(len / postEvery));
  for (let i = 0; i <= n; i++) {
    const t = s.a + (len * i) / n;
    const px = s.axis === 'x' ? t : (s.n[0] < 0 ? s.fixed + th / 2 : s.fixed - th / 2);
    const pz = s.axis === 'x' ? (s.n[1] < 0 ? s.fixed + th / 2 : s.fixed - th / 2) : t;
    ctx.railPosts.push([px, y, pz, tone, i % 2 === 0]);
  }
}

// ======================================================================================= ground
export function buildGround(ctx) {
  const { b, map } = ctx, land = map.land;
  const holes = [];
  for (const s of map.stairs) {
    if (s.from === s.to) continue;
    if (s.from !== 'U' && s.to !== 'U') continue;
    const run = s.run ?? 0.5, len = s.steps * run, ax = s.dir[1], sg = s.dir[0] === '-' ? -1 : 1;
    const a = (ax === 'z' ? s.z : s.x), e = a + sg * len;
    // the hole stops exactly where the top step ends and extends 0.3 m past the low edge
    const loA = sg > 0 ? a - 0.3 : e, hiA = sg > 0 ? e : a + 0.3;
    const h = s.width / 2 + 0.5;
    holes.push(ax === 'z' ? { x0: s.x - h, x1: s.x + h, z0: loA, z1: hiA } : { z0: s.z - h, z1: s.z + h, x0: loA, x1: hiA });
  }
  for (const r of map.ramps) {
    if (r.from === 'U' || r.to === 'U') {
      const h = 0.5;
      holes.push({ x0: Math.min(r.x0, r.x1) - h, x1: Math.max(r.x0, r.x1) + h, z0: Math.min(r.z0, r.z1) - 0.3, z1: Math.max(r.z0, r.z1) });
    }
  }
  ctx.groundHoles = holes;
  const zoneColor = (cx, cz) => {
    for (const z of map.zones) if (cx >= z.x0 && cx <= z.x1 && cz >= z.z0 && cz <= z.z1) return z.color;
    return 0x56696a;
  };
  const T = 20;
  for (let x = land.minX; x < land.maxX; x += T) {
    for (let z = land.minZ; z < land.maxZ; z += T) {
      const r = { x0: x, z0: z, x1: Math.min(x + T, land.maxX), z1: Math.min(z + T, land.maxZ) };
      const color = zoneColor((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2);
      const chk = ((Math.floor(x / T) + Math.floor(z / T)) & 1) ? 0.96 : 1.04;
      const c = new THREE.Color(color).multiplyScalar(chk * 1.45).getHex();
      for (const p of subtractRects(r, holes)) b.box([p.x0, -2, p.z0], [p.x1, 0, p.z1], { color: c, tag: 'floor', noTint: false });
    }
  }
  // quay faces down to the water
  const q = (min, max) => b.box(min, max, { color: 0x3b4a4c, tag: 'quay', walkable: false });
  q([land.minX - 1, -6, land.minZ], [land.minX, -2, land.maxZ + 1]);
  q([land.minX - 1, -6, land.maxZ], [land.maxX + 1, -2, land.maxZ + 1]);
  q([land.maxX, -6, land.minZ], [land.maxX + 1, -2, land.maxZ + 1]);
  // street markings (dim, unlit): dashed centre lines
  const dash = (x, z, w, d) => b.box([x, 0.0, z], [x + w, 0.03, z + d], { mat: 'emissive', color: 0x5d5328, solid: false, walkable: false, noTint: true });
  for (const s of map.streets) {
    const along = s.axis === 'z' ? [s.from, s.to] : [s.from, s.to];
    for (let t = along[0] + 4; t < along[1] - 4; t += 8) {
      const x = s.axis === 'z' ? s.c - 0.1 : t, z = s.axis === 'z' ? t : s.c - 0.1;
      if (ctx.blocked(x + (s.axis === 'z' ? 0.1 : 1.5), z + (s.axis === 'z' ? 1.5 : 0.1), 0.4, 0.4, -0.5, 0.5)) continue;
      if (s.axis === 'z') dash(x, z, 0.2, 3); else dash(x, z, 3, 0.2);
    }
  }
}

// ======================================================================================= underground
export function buildUnderground(ctx) {
  const { b, map } = ctx;
  const done = [];
  for (const f of map.uFloors) {
    if (f.ramp) continue;
    const r = { x0: f.x0, z0: f.z0, x1: f.x1, z1: f.z1 };
    const cuts = [...done];
    if (f.tracks) cuts.push(f.tracks);
    if (f.sump) cuts.push(f.sump);
    const base = f.id.startsWith('u-t') || f.id === 'u-store' || f.id === 'u-maint' ? 0x66726f : (f.id === 'u-chamber' ? 0x646b62 : 0x76807c);
    const thick = f.sump ? 5.6 : 2;
    for (const p of subtractRects(r, cuts)) b.box([p.x0, Y.U - thick, p.z0], [p.x1, Y.U, p.z1], { color: base, tag: 'u-floor' });
    if (f.tracks) {
      const t = f.tracks;
      b.box([t.x0, Y.U - 3, t.z0], [t.x1, Y.U - 0.5, t.z1], { color: 0x3a4240, tag: 'u-track' });
      // rails
      for (const x of [t.x0 + 3, t.x0 + 4.45, t.x1 - 4.45, t.x1 - 3]) b.box([x - 0.05, Y.U - 0.5, t.z0], [x + 0.05, Y.U - 0.4, t.z1], { color: 0x6a655a, solid: false, walkable: false });
      for (let z = t.z0 + 1; z < t.z1; z += 1.6) b.box([t.x0 + 2.8, Y.U - 0.5, z], [t.x1 - 2.8, Y.U - 0.43, z + 0.35], { color: 0x4a3f33, solid: false, walkable: false });
      // platform-edge safety strips (lit)
      for (const [a, c] of [[t.x0 - 0.5, t.x0], [t.x1, t.x1 + 0.5]]) b.box([a, Y.U + 0.005, t.z0], [c, Y.U + 0.03, t.z1], { mat: 'emissive', color: 0xb98a2a, solid: false, walkable: false, noTint: true });
    }
    if (f.sump) {
      const s = f.sump;
      b.box([s.x0, ctx.map.breachChamber.sumpY - 2, s.z0], [s.x1, ctx.map.breachChamber.sumpY, s.z1], { color: 0x2f3836, tag: 'u-sump' });
    }
    done.push(r);
  }
  // guard rails around the breach sump (3.5 m drop), open on the stairs side
  {
    const s = map.breachChamber.sump, st = map.stairs.find((q) => q.id === 'stairs-u-breach');
    const gap = [st.z - st.width / 2 - 0.4, st.z + st.width / 2 + 0.4];
    const seg = (axis, fixed, n, a, c) => addRail(ctx, { axis, fixed, n, a, b: c }, Y.U, { h: 1.1 });
    seg('x', s.z0, [0, 1], s.x0, s.x1); seg('x', s.z1, [0, -1], s.x0, s.x1); seg('z', s.x0, [1, 0], s.z0, s.z1);
    seg('z', s.x1, [-1, 0], s.z0, gap[0]); seg('z', s.x1, [-1, 0], gap[1], s.z1);
  }
  // walls on every free edge of every U room (6 m: floor to the ground slab)
  for (const f of map.uFloors) {
    if (f.ramp) continue;
    const r = { x0: f.x0, z0: f.z0, x1: f.x1, z1: f.z1 };
    for (const s of edgeSegments(ctx, r, Y.U, { drop: 5, railH: 6 })) {
      const bx = segBox(s, 0.5, Y.U, Y.U + 6);
      b.box(bx.min, bx.max, { color: 0x65716e, tag: 'u-wall', walkable: false, userData: { rail: true } });
    }
  }
}

// ======================================================================================= towers
const WINDOW_BAND = [0x2ee6c8, 0xff4fa0, 0xffb347, 0x9ad0ff];

export function buildTowers(ctx) {
  const { b, map } = ctx;
  ctx.towerRects = [];
  let k = 0;
  for (const t of map.towers) {
    const y0 = t.y0 ?? -2, top = t.h, roofY = t.roof ? t.h : null;
    const bodyTop = roofY !== null ? roofY - 0.4 : top;
    const uv = [((k * 5) % 6) / 6, ((k * 7) % 6) / 6]; k++;   // multiples of one window cell: rows stay aligned
    const min = [t.x0, y0, t.z0], max = [t.x1, bodyTop, t.z1];
    // collider: one solid block
    b.world.addBox(min, max, { solid: true, walkable: false, tag: 'tower:' + t.id });
    const col = t.color ?? 0x55606a;
    const baseTop = y0 < 0 ? Math.min(bodyTop, 6) : y0;
    const vis = { solid: false, walkable: false };
    // window tiers by height: dim teal low, amber mid, bright warm high (see materials.js)
    const tiers = [[6, 18, 'buildingLow'], [18, 34, 'buildingMid'], [34, 1e9, 'building']];
    const facade = (a, c, color) => {
      for (const [lo, hi, mat] of tiers) {
        const y1 = Math.max(a, lo), y2 = Math.min(c, hi);
        if (y2 - y1 > 0.1) b.box([t.x0, y1, t.z0], [t.x1, y2, t.z1], { ...vis, mat, color, uvOffset: uv });
      }
    };
    if (t.style === 'control') {
      facade(y0, bodyTop, col);
      for (let y = y0 + 6; y < bodyTop - 2; y += 11) {
        b.box([t.x0 - 0.15, y, t.z0 - 0.15], [t.x1 + 0.15, y + 0.5, t.z1 + 0.15], { ...vis, mat: 'emissive', color: 0x4fe0ff, noTint: true });
      }
    } else {
      if (baseTop > y0) b.box([t.x0, y0, t.z0], [t.x1, baseTop, t.z1], { ...vis, color: new THREE.Color(col).multiplyScalar(0.8).getHex() });
      if (bodyTop > baseTop) facade(baseTop, bodyTop, col);
    }
    if (roofY !== null) {
      b.box([t.x0, roofY - 0.4, t.z0], [t.x1, roofY, t.z1], { color: DECK_COLOR.terrace, tag: 'roof:' + t.id });
      ctx.towerRects.push({ id: t.id, x0: t.x0, z0: t.z0, x1: t.x1, z1: t.z1, y: roofY, kind: t.roof.kind });
    }
    // gothic massing: buttress fins up the faces, corner pinnacles and a spire crown
    const stone = new THREE.Color(col).multiplyScalar(0.62).getHex();
    if (top > 40) {
      const fy0 = y0 < 0 ? 6 : y0 + 1, fy1 = top - 5;
      const faces = [[t.x0, t.z0, t.x1, t.z0, 0, -1], [t.x0, t.z1, t.x1, t.z1, 0, 1], [t.x0, t.z0, t.x0, t.z1, -1, 0], [t.x1, t.z0, t.x1, t.z1, 1, 0]];
      for (const [ax, az, bx, bz, nx, nz] of faces) {
        const len = Math.hypot(bx - ax, bz - az), cnt = Math.max(2, Math.floor(len / 10.5));
        for (let i = 0; i < cnt; i++) {
          const u = (i + 0.5) / cnt, px = ax + (bx - ax) * u, pz = az + (bz - az) * u;
          // fin: 0.8 wide, 1.1 deep (outward along the face normal), with a narrower capital above
          const fin = (depth, half, y1, y2) => {
            const x0 = nx ? Math.min(px, px + nx * depth) : px - half, x1 = nx ? Math.max(px, px + nx * depth) : px + half;
            const z0 = nz ? Math.min(pz, pz + nz * depth) : pz - half, z1 = nz ? Math.max(pz, pz + nz * depth) : pz + half;
            b.box([x0, y1, z0], [x1, y2, z1], { ...vis, color: stone });
          };
          fin(1.1, 0.4, fy0, fy1); fin(0.7, 0.22, fy1, fy1 + 3);
        }
      }
      for (const [px, pz] of [[t.x0 + 0.9, t.z0 + 0.9], [t.x1 - 0.9, t.z0 + 0.9], [t.x0 + 0.9, t.z1 - 0.9], [t.x1 - 0.9, t.z1 - 0.9]]) {
        b.box([px - 0.7, top - 0.2, pz - 0.7], [px + 0.7, top + 2.5, pz + 0.7], { ...vis, color: stone });
        b.instance('pyramid', { x: px, y: top + 2.5, z: pz, sx: 1.4, sy: 6, sz: 1.4, color: stone });
      }
      const cx = (t.x0 + t.x1) / 2, cz = (t.z0 + t.z1) / 2, w = (t.x1 - t.x0) * 0.62, d = (t.z1 - t.z0) * 0.62;
      b.box([cx - w / 2, top, cz - d / 2], [cx + w / 2, top + 4, cz + d / 2], { ...vis, color: new THREE.Color(col).multiplyScalar(0.85).getHex() });
      const sp = t.style === 'control' ? 26 : 16 + (t.h % 7);
      b.instance('pyramid', { x: cx, y: top + 4, z: cz, sx: w * 1.25, sy: sp, sz: d * 1.25, color: stone });
      b.box([cx - 0.12, top + 4 + sp, cz - 0.12], [cx + 0.12, top + 8 + sp, cz + 0.12], { ...vis, color: 0x2a3030 });
      b.box([cx - 0.35, top + 8 + sp, cz - 0.35], [cx + 0.35, top + 8.7 + sp, cz + 0.35], { ...vis, mat: 'emissive', color: 0xff3a2a, noTint: true });
    }
    if (t.glass) {
      // stained-glass window band (jewel-coloured lancets), unlit
      b.box([t.x0 - 0.25, t.glass[0], t.z0 - 0.25], [t.x1 + 0.25, t.glass[1], t.z1 + 0.25], { ...vis, mat: 'glass', color: 0xffffff, noTint: true });
      b.box([t.x0 - 0.45, t.glass[0] - 0.4, t.z0 - 0.45], [t.x1 + 0.45, t.glass[0], t.z1 + 0.45], { ...vis, color: stone });
      b.box([t.x0 - 0.45, t.glass[1], t.z0 - 0.45], [t.x1 + 0.45, t.glass[1] + 0.5, t.z1 + 0.45], { ...vis, color: stone });
    }
    // lit signage panels on street-facing facades (instanced later via ctx.facades)
    (ctx.facades ??= []).push({ t, y0: Math.max(y0, 0) });
  }
  void WINDOW_BAND;
}

// ======================================================================================= decks
export function buildDecks(ctx) {
  const { b, map } = ctx;
  for (const d of map.decks) {
    const cuts = d.cuts ?? [];
    const color = DECK_COLOR[d.kind] ?? 0x707070;
    for (const p of subtractRects(d, cuts)) {
      b.box([p.x0, d.y - d.th, p.z0], [p.x1, d.y, p.z1], { color, tag: `deck:${d.kind}`, userData: { deck: d.id } });
    }
    for (const c of cuts) {
      ctx.cutRects.push(c);
      ctx.slabDefs.push({ id: c.id, deck: d.id, level: d.level, x0: c.x0, z0: c.z0, x1: c.x1, z1: c.z1, y: d.y, th: d.th, color });
      // the slab's own collider (dynamic: Phase 4 drops it)
      const w = ctx.phys.addBox([c.x0, -d.th, c.z0], [c.x1, 0, c.z1], { dynamic: true, tag: `slab:${d.kind}`, userData: { slab: c.id } });
      ctx.phys.setOffset(w, 0, d.y, 0);
      ctx.slabDefs[ctx.slabDefs.length - 1].collider = w;
    }
  }
}

/** Dashed centre lines and edge lines on road decks, skipping unstable slabs. */
export function paintRoads(ctx) {
  const { b, map } = ctx;
  const line = (x0, z0, x1, z1, y, color = 0x6d6540) => b.box([x0, y, z0], [x1, y + 0.03, z1], { mat: 'emissive', color, solid: false, walkable: false, noTint: true });
  for (const d of map.decks) {
    if (d.kind !== 'road' || !d.lane) continue;
    const y = d.y;
    if (d.lane === 'x') {
      const zc = (d.z0 + d.z1) / 2;
      for (let x = d.x0 + 2; x < d.x1 - 4; x += 6) if (!ctx.inCut(x + 1.5, zc, 1.5)) line(x, zc - 0.1, x + 3, zc + 0.1, y);
      if (d.z1 - d.z0 > 8) for (const z of [d.z0 + 0.9, d.z1 - 1.0]) line(d.x0 + 1, z, d.x1 - 1, z + 0.1, y, 0x4f5a58);
    } else {
      const xc = (d.x0 + d.x1) / 2;
      for (let z = d.z0 + 2; z < d.z1 - 4; z += 6) if (!ctx.inCut(xc, z + 1.5, 1.5)) line(xc - 0.1, z, xc + 0.1, z + 3, y);
      if (d.x1 - d.x0 > 8) for (const x of [d.x0 + 0.9, d.x1 - 1.0]) line(x, d.z0 + 1, x + 0.1, d.z1 - 1, y, 0x4f5a58);
    }
  }
}

/** Jagged ends and hanging rebar for the broken skywalk stubs (visual only). */
export function dressBroken(ctx) {
  const { b, map } = ctx;
  const rnd = (() => { let s = 99; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); })();
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  for (const d of map.decks) {
    if (!d.broken) continue;
    const dir = d.broken === '+x' ? 1 : -1;
    const ex = dir > 0 ? d.x1 : d.x0, zc = (d.z0 + d.z1) / 2;
    // sheared-off concrete lips hanging at angles
    for (let i = 0; i < 4; i++) {
      const w = 1 + rnd() * 1.6, len = 1.5 + rnd() * 2.2;
      p.set(ex + dir * (len / 2 - 0.2) , d.y - 0.5 - rnd() * 1.3, zc + (i - 1.5) * 1.4 + (rnd() - 0.5) * 0.5);
      e.set((rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.4, dir * (0.2 + rnd() * 0.9));
      q.setFromEuler(e); m.compose(p, q, sc);
      b.geometry(box(len, 0.45, w), { color: 0x7b7463, matrix: m.clone() });
    }
    // rebar sticking out and hanging down
    for (let i = 0; i < 9; i++) {
      const len = 1.5 + rnd() * 3;
      p.set(ex + dir * (rnd() * 1.6), d.y - 0.4 - rnd() * 0.8, d.z0 + 0.6 + rnd() * (d.z1 - d.z0 - 1.2));
      e.set(0, (rnd() - 0.5) * 0.4, dir * (rnd() * 1.4 - 0.6));
      q.setFromEuler(e); m.compose(p, q, sc);
      b.geometry(box(len, 0.06, 0.06), { color: 0x5a3a28, matrix: m.clone() });
    }
  }
}

// ======================================================================================= pillars
export function buildPillars(ctx) {
  const { b, map } = ctx;
  for (const d of map.decks) {
    if (!d.pillars) continue;
    const long = d.x1 - d.x0 >= d.z1 - d.z0 ? 'x' : 'z';
    const len = long === 'x' ? d.x1 - d.x0 : d.z1 - d.z0, wid = long === 'x' ? d.z1 - d.z0 : d.x1 - d.x0;
    const n = Math.max(1, Math.round(len / (d.kind === 'road' ? 16 : 14)));
    const across = wid >= 8 ? [1.3, wid - 1.3] : [wid / 2];
    const pw = d.kind === 'road' ? 1.2 : 0.9;
    const bottom = d.y - d.th;
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) * len / n;
      for (const a of across) {
        const x = long === 'x' ? d.x0 + t : d.x0 + a, z = long === 'x' ? d.z0 + a : d.z0 + t;
        if (ctx.inCut(x, z, 0.8)) continue;
        const base = ctx.phys.groundHeightAt(x, z, bottom - 0.2, 0, pw / 2 + 0.05);
        if (!(base > -Infinity)) continue;
        if (bottom - base < 2) continue;
        if (ctx.blocked(x, z, pw / 2, pw / 2, base + 0.1, bottom)) continue;
        b.instance('pillar', { x, y: base, z, sx: pw, sy: bottom - base, sz: pw, color: 0x6c7270 });
        ctx.phys.addBox([x - pw / 2, base, z - pw / 2], [x + pw / 2, bottom, z + pw / 2], { solid: true, walkable: false, tag: 'pillar' });
        ctx.pillarsPlaced++;
      }
    }
  }
}

// ======================================================================================= stairs / ramps
function addStrip(ctx, axis, u0, u1, w0, w1, yTop0, yTop1, thick, tone) {
  const b = ctx.b;
  b.sheared({ axis, u0, u1, w0, w1, yTop0, yTop1, thick }, { color: 0x535c5c });
  // thin lit cap along the top
  b.sheared({ axis, u0, u1, w0: w0 - 0.02, w1: w1 + 0.02, yTop0: yTop0 + 0.06, yTop1: yTop1 + 0.06, thick: 0.08 }, { color: tone, mat: 'emissive', noTint: true });
}

export function buildStairs(ctx, s) {
  const { b, phys } = ctx;
  const run = s.run ?? 0.5, rise = ((s.y1 - 0.015) - s.y0) / s.steps;
  const ax = s.dir[1], sg = s.dir[0] === '-' ? -1 : 1;
  const tone = TONE[s.tone] ?? 0xffb347;
  const high = (s.y1 - s.y0) > 2;
  b.stairs({ x: s.x, z: s.z, y: s.y0, dir: s.dir, steps: s.steps, rise, run, width: s.width, bottom: s.y0 - (s.y0 < 0 ? 2 : 0.01), hollow: s.hollow, color: s.hollow ? 0x7c746a : 0x6c6a62 });
  const a0 = ax === 'z' ? s.z : s.x;
  const len = s.steps * run;
  const half = s.width / 2;
  const lat0 = ax === 'z' ? s.x : s.z;
  const gate = s.gate ? ctx.map.gates.find((g) => g.id === s.gate) : null;
  let lead = 0;
  if (gate) lead = Math.abs((ax === 'z' ? gate.z : gate.x) - a0) + 0.2;
  const thick = s.hollow ? s.hollow + RAIL_H : (s.y1 - s.y0) + RAIL_H + 0.1;
  for (const side of [-1, 1]) {
    const w0 = lat0 + side * half + (side > 0 ? 0 : -0.3), w1 = w0 + 0.3;
    // collider: one box per step (follows the stair line, leaves room under a floating flight)
    for (let i = 0; i < s.steps; i++) {
      const u0 = a0 + sg * i * run, u1 = a0 + sg * (i + 1) * run;
      const top = s.y0 + rise * (i + 1);
      const lo = Math.min(u0, u1), hi = Math.max(u0, u1);
      const min = ax === 'z' ? [w0, top, lo] : [lo, top, w0], max = ax === 'z' ? [w1, top + RAIL_H, hi] : [hi, top + RAIL_H, w1];
      phys.addBox(min, max, { solid: true, walkable: false, tag: 'balustrade', userData: { rail: true } });
    }
    const uA = a0, uB = a0 + sg * len;
    addStrip(ctx, ax, Math.min(uA, uB), Math.max(uA, uB), w0, w1, sg > 0 ? s.y0 + rise + RAIL_H : s.y1 + RAIL_H, sg > 0 ? s.y1 + RAIL_H : s.y0 + rise + RAIL_H, thick, tone);
    if (lead > 0) {
      const l0 = a0 - sg * lead, l1 = a0;
      const lo = Math.min(l0, l1), hi = Math.max(l0, l1);
      const min = ax === 'z' ? [w0, s.y0, lo] : [lo, s.y0, w0], max = ax === 'z' ? [w1, s.y0 + RAIL_H + 1.2, hi] : [hi, s.y0 + RAIL_H + 1.2, w1];
      b.box(min, max, { color: 0x4f5858, tag: 'lead-wall', walkable: false, userData: { rail: true } });
    }
  }
  // entrance beacon (tall lit pole in the route's colour) so the way up is visible from afar
  if (s.tone && s.tone !== 'metro' && s.tone !== 'work' && high) {
    const bx = ax === 'z' ? s.x + half + 0.9 : a0 - sg * 0.9, bz = ax === 'z' ? a0 - sg * 0.9 : s.z + half + 0.9;
    const bx2 = ax === 'z' ? s.x - half - 0.9 : bx, bz2 = ax === 'z' ? bz : s.z - half - 0.9;
    for (const [x, z] of [[bx, bz], [bx2, bz2]]) {
      b.box([x - 0.12, s.y0, z - 0.12], [x + 0.12, s.y0 + 7.5, z + 0.12], { color: 0x3c4648, solid: false, walkable: false });
      b.box([x - 0.3, s.y0 + 7.5, z - 0.3], [x + 0.3, s.y0 + 8.3, z + 0.3], { mat: 'emissive', color: tone, solid: false, walkable: false, noTint: true });
    }
  }
  ctx.stairInfo.set(s.id, { rise, run, top: s.y1 });
  if (s.sign) {
    const sx = ax === 'z' ? s.x : a0 + sg * len * 0.5;
    void sx;
  }
}

export function buildRamp(ctx, r) {
  const { b, phys } = ctx;
  const ax = r.dir[1], sg = r.dir[0] === '-' ? -1 : 1;
  const tone = TONE[r.tone] ?? 0xffb347;
  const rampSpec = { x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, dir: r.dir, yLow: r.yLow, yHigh: r.yHigh, bottom: r.yLow < 0 ? r.yLow - 1 : r.yLow };
  b.ramp(rampSpec, { color: 0x6e6a60, tag: 'ramp' });
  const xa = Math.min(r.x0, r.x1), xb = Math.max(r.x0, r.x1), za = Math.min(r.z0, r.z1), zb = Math.max(r.z0, r.z1);
  const uLo = ax === 'z' ? za : xa, uHi = ax === 'z' ? zb : xb, len = uHi - uLo;
  const hAt = (u) => { const t = (sg > 0 ? u - uLo : uHi - u) / len; return r.yLow + (r.yHigh - r.yLow) * t; };
  const N = Math.ceil(len / 1.0);
  for (const side of [-1, 1]) {
    const w0 = (ax === 'z' ? (side < 0 ? xa - 0.3 : xb) : (side < 0 ? za - 0.3 : zb)), w1 = w0 + 0.3;
    for (let i = 0; i < N; i++) {
      const u0 = uLo + (len * i) / N, u1 = uLo + (len * (i + 1)) / N;
      const y0 = Math.min(hAt(u0), hAt(u1)), y1 = Math.max(hAt(u0), hAt(u1));
      const min = ax === 'z' ? [w0, y0, u0] : [u0, y0, w0], max = ax === 'z' ? [w1, y1 + RAIL_H, u1] : [u1, y1 + RAIL_H, w1];
      phys.addBox(min, max, { solid: true, walkable: false, tag: 'balustrade', userData: { rail: true } });
    }
    const yA = hAt(uLo), yB = hAt(uHi);
    addStrip(ctx, ax, uLo, uHi, w0, w1, yA + RAIL_H, yB + RAIL_H, Math.abs(yB - yA) + RAIL_H + 0.2, tone);
  }
  if (r.tone === 'free') {
    const lowU = sg > 0 ? uLo : uHi, cx = (xa + xb) / 2, cz = (za + zb) / 2;
    for (const side of [-1, 1]) {
      const x = ax === 'z' ? (side < 0 ? xa - 0.9 : xb + 0.9) : lowU - sg * 0.9, z = ax === 'z' ? lowU - sg * 0.9 : (side < 0 ? za - 0.9 : zb + 0.9);
      b.box([x - 0.12, r.yLow, z - 0.12], [x + 0.12, r.yLow + 7.5, z + 0.12], { color: 0x3c4648, solid: false, walkable: false });
      b.box([x - 0.3, r.yLow + 7.5, z - 0.3], [x + 0.3, r.yLow + 8.3, z + 0.3], { mat: 'emissive', color: tone, solid: false, walkable: false, noTint: true });
    }
    void cx; void cz;
  }
}

// ======================================================================================= lifts
export function buildLift(ctx, l) {
  const { b, game } = ctx;
  const tone = TONE[l.tone] ?? 0xffb347;
  const [cx, cz] = l.center, [w, d] = l.size;
  const lift = game.lifts.add({ id: l.id, center: l.center, size: l.size, yBottom: l.yBottom + 0.04, yTop: l.yTop, speed: 4, dwell: 3, auto: false, exits: l.exits });
  ctx.lifts.push(lift);
  const exitSides = new Set([l.exits.bottom, l.exits.top]);
  const th = 0.3, top = l.yTop + 3.6, bot = l.yBottom - 0.2;
  const walls = { '-x': [[cx - w / 2 - th, bot, cz - d / 2 - th], [cx - w / 2, top, cz + d / 2 + th]], '+x': [[cx + w / 2, bot, cz - d / 2 - th], [cx + w / 2 + th, top, cz + d / 2 + th]],
    '-z': [[cx - w / 2 - th, bot, cz - d / 2 - th], [cx + w / 2 + th, top, cz - d / 2]], '+z': [[cx - w / 2 - th, bot, cz + d / 2], [cx + w / 2 + th, top, cz + d / 2 + th]] };
  for (const side of Object.keys(walls)) {
    if (exitSides.has(side)) continue;
    b.box(walls[side][0], walls[side][1], { color: 0x4a5557, tag: 'lift-shaft', walkable: false, userData: { rail: true } });
  }
  // roof cap
  b.box([cx - w / 2 - th, top, cz - d / 2 - th], [cx + w / 2 + th, top + 0.4, cz + d / 2 + th], { color: 0x3c4648, tag: 'lift-cap', walkable: false });
  // glowing corner strips along the full height: the lift is visible from far away
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = cx + sx * (w / 2 + th + 0.04), z = cz + sz * (d / 2 + th + 0.04);
    b.box([x - 0.08, l.yBottom, z - 0.08], [x + 0.08, top + 0.4, z + 0.08], { mat: 'emissive', color: tone, solid: false, walkable: false, noTint: true });
  }
  // lobby side walls (and the call panel)
  if (l.lobby) {
    const sd = l.lobby.side, ax = sd[1], sgn = sd[0] === '-' ? -1 : 1, len = l.lobby.len;
    const gate = ctx.map.gates.find((g) => g.id === l.gate);
    for (const side of [-1, 1]) {
      let min, max;
      if (ax === 'z') {
        const x0 = side < 0 ? cx - w / 2 - th : cx + w / 2, z0 = sgn > 0 ? cz + d / 2 : cz - d / 2 - len, z1 = z0 + len;
        min = [x0, l.yBottom, z0]; max = [x0 + th, l.yBottom + 3.6, z1];
      } else {
        const z0 = side < 0 ? cz - d / 2 - th : cz + d / 2, x0 = sgn > 0 ? cx + w / 2 : cx - w / 2 - len, x1 = x0 + len;
        min = [x0, l.yBottom, z0]; max = [x1, l.yBottom + 3.6, z0 + th];
      }
      b.box(min, max, { color: 0x4a5557, tag: 'lift-lobby', walkable: false, userData: { rail: true } });
      // lit strip along the lobby wall top
      b.box([min[0], max[1] - 0.2, min[2]], [max[0], max[1] - 0.1, max[2]], { mat: 'emissive', color: tone, solid: false, walkable: false, noTint: true });
    }
    void gate;
  }
  // openings so rails are not generated across the doorways
  for (const y of [l.yBottom, l.yTop]) ctx.openings.push({ x0: cx - w / 2 - 0.3, z0: cz - d / 2 - 0.3, x1: cx + w / 2 + 0.3, z1: cz + d / 2 + 0.3, y });
  return lift;
}


// ======================================================================================= enterable buildings (story set pieces)
/** A straight wall with door gaps (and lintels above them); a gap with `low` is a broken wall piece. */
export function wallRun(ctx, { axis, at, a, b: end, y, h, th = 0.4, gaps = [], color, doorH = 2.7, tag = 'wall' }) {
  const bd = ctx.b;
  const gs = gaps.map((g) => ({ s: g[0] - g[1] / 2, e: g[0] + g[1] / 2, low: g[2] })).sort((p, q) => p.s - q.s);
  const seg = (s0, e0, hh, yy = y) => {
    if (e0 - s0 < 0.05 || hh <= 0.01) return;
    const min = axis === 'x' ? [s0, yy, at - th / 2] : [at - th / 2, yy, s0], max = axis === 'x' ? [e0, yy + hh, at + th / 2] : [at + th / 2, yy + hh, e0];
    bd.box(min, max, { color, tag, walkable: false });
  };
  let cur = a;
  for (const g of gs) {
    seg(cur, g.s, h);
    if (g.low) seg(g.s, g.e, g.low); else if (h > doorH) seg(g.s, g.e, h - doorH, y + doorH);
    cur = g.e;
  }
  seg(cur, end, h);
}

export function buildBuildings(ctx) {
  const { b, map } = ctx;
  const th = 0.5;
  for (const bl of map.buildings) {
    const col = bl.color ?? 0x7a7a70, h = bl.h, y = bl.y ?? 0;
    const doors = (side) => bl.doors.filter((d) => d.side === side).map((d) => (d.low ? [d.c, d.w, d.low] : [d.c, d.w]));
    wallRun(ctx, { axis: 'x', at: bl.z0 + th / 2, a: bl.x0, b: bl.x1, y, h, th, gaps: doors('n'), color: col, tag: `bldg:${bl.id}` });
    wallRun(ctx, { axis: 'x', at: bl.z1 - th / 2, a: bl.x0, b: bl.x1, y, h, th, gaps: doors('s'), color: col, tag: `bldg:${bl.id}` });
    wallRun(ctx, { axis: 'z', at: bl.x0 + th / 2, a: bl.z0, b: bl.z1, y, h, th, gaps: doors('w'), color: col, tag: `bldg:${bl.id}` });
    wallRun(ctx, { axis: 'z', at: bl.x1 - th / 2, a: bl.z0, b: bl.z1, y, h, th, gaps: doors('e'), color: col, tag: `bldg:${bl.id}` });
    for (const pw of bl.partitions) wallRun(ctx, { ...pw, y, h: h - 0.4, th: 0.3, color: new THREE.Color(col).multiplyScalar(0.9).getHex(), tag: `bldg:${bl.id}` });
    // roof slab (a rectangle may be missing: a damaged flat)
    const cuts = bl.roofBreak ? [bl.roofBreak] : [];
    for (const r of subtractRects(bl, cuts)) b.box([r.x0, y + h - 0.4, r.z0], [r.x1, y + h, r.z1], { color: new THREE.Color(col).multiplyScalar(0.8).getHex(), tag: `roof:${bl.id}`, walkable: false });
    // warm light over every real door
    for (const d of bl.doors) {
      if (d.low) continue;
      const [x, z] = d.side === 'n' ? [d.c, bl.z0] : d.side === 's' ? [d.c, bl.z1] : d.side === 'w' ? [bl.x0, d.c] : [bl.x1, d.c];
      const o = { n: [0, -0.3], s: [0, 0.3], w: [-0.3, 0], e: [0.3, 0] }[d.side];
      ctx.doorLights.push({ x: x + o[0], y: y + 2.9, z: z + o[1], color: TONE[bl.tone] ?? 0xffb347, w: d.w });
    }
  }
  for (const up of map.uPartitions) for (const w of up.walls) wallRun(ctx, { ...w, y: up.y, h: up.h, th: 0.35, color: 0x66726f, tag: 'u-partition' });
}

// ======================================================================================= vents (child-sized shafts U -> G)
export function buildVents(ctx) {
  const { b, map } = ctx;
  for (const v of map.ventSpots) {
    // U side: a squat duct stub against the tunnel wall, 1 m high with a grille on its face (too small for the player)
    const u = v.u, [ix, iz] = v.inward, hw = v.width / 2 + 0.15;
    const cx = u.x + ix * 0.35, cz = u.z + iz * 0.35;
    const sx = ix ? 0.7 : hw * 2, sz = ix ? hw * 2 : 0.7;
    b.box([cx - sx / 2, u.y, cz - sz / 2], [cx + sx / 2, u.y + v.crawlHeight, cz + sz / 2], { color: 0x2a3030, tag: 'vent-duct', walkable: false });
    for (let i = -2; i <= 2; i++) {
      const o = i * 0.13, fx = u.x + ix * 0.72, fz = u.z + iz * 0.72;
      const px = ix ? fx : u.x + o, pz = ix ? u.z + o : fz;
      b.box([px - (ix ? 0.02 : 0.025), u.y + 0.1, pz - (ix ? 0.025 : 0.02)], [px + (ix ? 0.02 : 0.025), u.y + v.crawlHeight - 0.1, pz + (ix ? 0.025 : 0.02)], { mat: 'emissive', color: 0x50635a, solid: false, walkable: false, noTint: true });
    }
    // G side: a stack 1.5 m tall with a grate
    const gp = v.g;
    b.box([gp.x - 0.7, 0, gp.z - 0.7], [gp.x + 0.7, 1.5, gp.z + 0.7], { color: 0x4a5558, tag: 'vent-stack', walkable: false });
    b.box([gp.x - 0.55, 1.5, gp.z - 0.55], [gp.x + 0.55, 1.58, gp.z + 0.55], { mat: 'emissive', color: 0x20302c, solid: false, walkable: false, noTint: true });
    ctx.steam.push({ x: gp.x, y: 1.6, z: gp.z });
  }
}
