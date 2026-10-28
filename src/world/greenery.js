// Phase 9B: the greenery. Green is a privilege of height and wealth: roof gardens, terrace trees, hedges, lawns and vertical gardens
// on the Upper Decks and the tops of some elite towers; creepers and balcony kitchen gardens on L2 (people making do); a few tulsi
// pots and window-ledge plants below. It is scattered by a seeded density field (clustered, patchy: some roofs lush, most bare, more
// green where the sunlight shafts fall) and adapts to whatever the world holds: it reads towers, decks, gates, stairs, ramps, lifts,
// POIs and the live colliders at runtime and never plants on a walk path, stair or lift lobby, gate approach or interactable.
//
//   buildGreenery(game, world, ctx?)      called once from city.js after the city is built; returns the Greenery (also world.greenery)
//   world.greenery = { stats, plants[], verify(), setEnabled(bool), debug }      plants[] = {kind, level, x, y, z, r, solid}
//
// Rendering: every plant of the city is baked into two static geometries (A: foliage and props, B: the leaf-textured green-wall
// panels), sorted by 64 m cell and LOD. Each frame the visible cells are chosen (frustum + distance, near = LOD 0, far = LOD 1) and
// the index buffer is recomposed only when that set changes, so all greenery is two draw calls (plus one additive call for the
// night pools of the garden lights), whatever its size. The material is Lambert with a vertex-shader wind sway and a fragment hook
// for sunlight shafts, irrigation lines and uplit foliage, and it is opted in to the Sing echolocation wave.
import * as THREE from '../../vendor/three.module.js';
import { SHAFT_LEAN } from './map.js';
import { PlantBatch, CELL } from './plants/batch.js';
import { DensityField, mulberry, hash2, fbm, ELITE } from './plants/field.js';
import * as S from './plants/species.js';
import { createUniforms, setShafts, makePlantMaterial, leafTexture } from './plants/material.js';

const SEED = 9031;
const lvlOf = (y) => (y >= 31 ? 'L3' : y >= 18 ? 'L2' : y >= 6 ? 'L1' : y >= -4 ? 'G' : 'U');
const FLOWERS = () => [S.C.marigold, S.C.magenta, S.C.jasmine, S.C.red, S.C.bloomB];
const V4 = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };

export function buildGreenery(game, world, ctx) {
  const off = (typeof location !== 'undefined' && new URLSearchParams(location.search).get('greenery') === '0') || game.params?.greenery === 0;
  if (off) return null;
  const g = new Greenery(game, world, ctx);
  try { g.build(); } catch (e) { console.error('greenery: build failed, the city goes without it', e); return null; }
  world.greenery = g.api();
  return g;
}

class Greenery {
  constructor(game, world, ctx) {
    this.game = game; this.world = world; this.ctx = ctx; this.map = world.map; this.phys = game.physics;
    const shafts = (world.sunShafts ?? this.map.sunShafts ?? []);
    this.shafts = shafts;
    this.field = new DensityField(SEED, shafts);
    this.b = new PlantBatch();
    this.plants = [];          // {kind, level, x, y, z, r, solid}
    this.placed = [];          // {x,z,r,y} footprint list for spacing
    this.pools = [];           // {x,y,z,r,c}
    this.colliders = [];
    this.rects = []; this.circs = [];
    this.counts = {};
    this.seq = 1;
  }

  // ------------------------------------------------------------------ bookkeeping
  rng(label) { let h = SEED; for (let i = 0; i < label.length; i++) h = Math.imul(h ^ label.charCodeAt(i), 16777619) >>> 0; return mulberry(h); }
  count(k, n = 1) { this.counts[k] = (this.counts[k] ?? 0) + n; }
  record(kind, x, y, z, r, solid, extra) { this.plants.push({ kind, level: lvlOf(y), x, y, z, r, solid, ...extra }); this.count(kind); }
  addSolid(kind, x0, y0, z0, x1, y1, z1) {
    const c = this.phys.addBox([x0, y0, z0], [x1, y1, z1], { solid: true, walkable: false, tag: 'plant:' + kind, userData: { plant: true } });
    this.colliders.push(c); return c;
  }

  // ------------------------------------------------------------------ what must stay clear
  gather() {
    const { map, world, game, ctx } = this, rects = this.rects, circs = this.circs;
    const rect = (x0, z0, x1, z1, y, h = 3.4) => rects.push({ x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), y0: y - 0.6, y1: y + h });
    const circ = (x, z, r, y, h = 3.2) => circs.push({ x, z, r, y0: y - 0.8, y1: y + h });
    const safe = (fn) => { try { fn(); } catch (e) { console.warn('greenery: skipped a clearance source', e); } };
    safe(() => { if (ctx?.clear) for (const c of ctx.clear) rects.push({ x0: c.x0, z0: c.z0, x1: c.x1, z1: c.z1, y0: c.y0, y1: c.y1 }); });
    safe(() => {
      for (const g of map.gates ?? []) {
        const v = V4[g.inside]; if (!v) continue;
        const hw = g.width / 2 + 1.5, out = 9, inn = 4;
        if (g.axis === 'x') rect(g.x - hw, g.z - v[1] * out, g.x + hw, g.z + v[1] * inn, g.y); else rect(g.x - v[0] * out, g.z - hw, g.x + v[0] * inn, g.z + hw, g.y);
      }
    });
    safe(() => {
      const defs = new Map((map.lifts ?? []).map((l) => [l.id, l]));
      const runtime = game.lifts?.lifts ?? [];
      const all = runtime.length ? runtime : (map.lifts ?? []);
      for (const l of all) {
        const [cx, cz] = l.center, [w, d] = l.size ?? [4, 4];
        const stops = l.stops ?? [{ y: l.yBottom, exit: l.exits?.bottom }, { y: l.yTop, exit: l.exits?.top }];
        const def = defs.get(l.id) ?? l;
        for (const s of stops) {
          circ(cx, cz, Math.max(w, d) / 2 + 3.2, s.y);
          const v = V4[s.exit]; if (!v) continue;
          const len = (def.lobby && def.lobby.side === s.exit ? def.lobby.len : 0) + 7;
          if (v[0]) { const e = cx + v[0] * w / 2; rect(e, cz - d / 2 - 1.8, e + v[0] * len, cz + d / 2 + 1.8, s.y); }
          else { const e = cz + v[1] * d / 2; rect(cx - w / 2 - 1.8, e, cx + w / 2 + 1.8, e + v[1] * len, s.y); }
        }
      }
    });
    safe(() => {
      for (const s of map.stairs ?? []) {
        if (s.from === s.to) continue;
        const run = s.run ?? 0.5, len = s.steps * run, ax = s.dir[1], sg = s.dir[0] === '-' ? -1 : 1, hw = s.width / 2 + 1.8, a = ax === 'z' ? s.z : s.x;
        if (ax === 'z') { rect(s.x - hw, a - sg * 7, s.x + hw, a, s.y0); rect(s.x - hw, a + sg * len, s.x + hw, a + sg * (len + 7), s.y1); }
        else { rect(a - sg * 7, s.z - hw, a, s.z + hw, s.y0); rect(a + sg * len, s.z - hw, a + sg * (len + 7), s.z + hw, s.y1); }
      }
      for (const r of map.ramps ?? []) {
        const ax = r.dir[1], sg = r.dir[0] === '-' ? -1 : 1;
        const xa = Math.min(r.x0, r.x1) - 1.8, xb = Math.max(r.x0, r.x1) + 1.8, za = Math.min(r.z0, r.z1) - 1.8, zb = Math.max(r.z0, r.z1) + 1.8;
        if (ax === 'z') { const lowEnd = sg < 0 ? zb : za, hiEnd = sg < 0 ? za : zb; rect(xa, lowEnd, xb, lowEnd + (sg < 0 ? 7 : -7), r.yLow); rect(xa, hiEnd, xb, hiEnd + (sg < 0 ? -7 : 7), r.yHigh); }
        else { const lowEnd = sg < 0 ? xb : xa, hiEnd = sg < 0 ? xa : xb; rect(lowEnd, za, lowEnd + (sg < 0 ? 7 : -7), zb, r.yLow); rect(hiEnd, za, hiEnd + (sg < 0 ? -7 : 7), zb, r.yHigh); }
      }
    });
    safe(() => {
      const sp = map.spawn; circ(sp.x, sp.z, 5, sp.y);
      for (const p of [map.controlTowerTerminal, map.sunriseBridgeEnd]) if (p) circ(p.x, p.z, p.radius ? p.radius + 2.5 : 6, p.y);
      for (const l of ['fragmentSpots', 'setuSpots']) for (const f of map[l] ?? []) circ(f.x, f.z, 1.8, f.y);
      for (const f of map.vendorSpots ?? []) circ(f.x, f.z, 3.4, f.y);
      for (const f of map.checkpoints ?? []) circ(f.x, f.z, 3.6, f.y);
      for (const l of map.solarLamps ?? []) { circ(l.x, l.z, 1.0, l.y); circs[circs.length - 1].path = false; }
      for (const i of game.interactables?.list?.() ?? []) { if (i.pos && i.pos.y > -50) circ(i.pos.x, i.pos.z, /lift/.test(i.id) ? 4.5 : 2.2, i.pos.y); }
    });
  }

  /** is the box (centre x,z, half extents hx,hz) at height y on a reserved approach? */
  avoidedBox(x, z, hx, hz, y) {
    for (const r of this.rects) if (x + hx > r.x0 && x - hx < r.x1 && z + hz > r.z0 && z - hz < r.z1 && y + 0.5 > r.y0 && y < r.y1) return true;
    for (const c of this.circs) {
      if (!(y + 0.5 > c.y0 && y < c.y1)) continue;
      const dx = Math.max(Math.abs(x - c.x) - hx, 0), dz = Math.max(Math.abs(z - c.z) - hz, 0);
      if (dx * dx + dz * dz < c.r * c.r) return true;
    }
    return false;
  }

  /** is the footprint (x,z,rad) at height y on a reserved approach? */
  avoided(x, z, rad, y) { return this.avoidedBox(x, z, rad, rad, y); }

  /** is a rail (a thin solid ~1 m+ high wall) standing at (x,z) on the deck at height y? */
  railAt(x, z, y) {
    for (const c of this.phys.query(x - 0.12, z - 0.12, x + 0.12, z + 0.12)) {
      if (!c.solid || c.userData?.plant) continue;
      if (c.min.y < y + 0.5 && c.max.y > y + 0.95 && c.max.y < y + 1.7 && Math.min(c.max.x - c.min.x, c.max.z - c.min.z) < 0.7) return true;
    }
    return false;
  }

  /** a solid footprint fits on the floor at height y (flat, clear of solids and the unstable slabs) */
  floorFree(x, z, rx, rz, y, h = 1.6, pad = 0.05) {
    const phys = this.phys;
    for (const c of phys.query(x - rx - pad, z - rz - pad, x + rx + pad, z + rz + pad)) {
      if (c.min.y < y + h && c.max.y > y + 0.07 && (c.solid || (c.walkable && c.max.y > y + 0.09))) {
        if (c.tag === 'tree' && c.userData?.old) continue;
        return false;
      }
    }
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, 0]]) {
      const g = phys.groundHeightAt(x + sx * rx * 0.85, z + sz * rz * 0.85, y + 0.1, 0.25, 0.05);
      if (!(Math.abs(g - y) < 0.07)) return false;
    }
    for (const s of this.world.slabs ?? []) if (x + rx > s.x0 - 1 && x - rx < s.x1 + 1 && z + rz > s.z0 - 1 && z - rz < s.z1 + 1) return false;
    return true;
  }

  inPath(s, x, z, rad) {
    if (!s.paths) return false;
    for (const p of s.paths) {
      const dx = p.bx - p.ax, dz = p.bz - p.az, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - p.ax) * dx + (z - p.az) * dz) / l2));
      if (Math.hypot(x - (p.ax + dx * t), z - (p.az + dz * t)) < p.hw + rad) return true;
    }
    return Math.hypot(x - s.hubX, z - s.hubZ) < 4.8 + rad;
  }

  /** the full test for a solid plant on a plaza */
  canPlace(s, x, z, rx, rz, h = 1.6, margin = 1.0) {
    if (x - rx < s.x0 + margin || x + rx > s.x1 - margin || z - rz < s.z0 + margin || z + rz > s.z1 - margin) return false;
    const rad = Math.max(rx, rz);
    if (this.avoided(x, z, rad + 0.3, s.y)) return false;
    if (this.inPath(s, x, z, rad + 0.25)) return false;
    return this.floorFree(x, z, rx, rz, s.y, h);
  }

  /** spacing between crowns ('tree') or between small things ('s'); the understory grows under the crowns */
  spaced(x, z, r, mode = 'tree') { for (const p of this.placed) if ((p.t ?? 'tree') === mode && Math.hypot(p.x - x, p.z - z) < p.r + r) return false; return true; }

  // ------------------------------------------------------------------ surfaces
  surfaces() {
    const out = [];
    for (const t of this.map.towers) if (t.roof) out.push({ id: t.id, x0: t.x0, z0: t.z0, x1: t.x1, z1: t.z1, y: t.h, kind: t.roof.kind, src: 'tower' });
    for (const d of this.map.decks) out.push({ id: d.id, x0: d.x0, z0: d.z0, x1: d.x1, z1: d.z1, y: d.y, kind: d.kind, src: 'deck', cuts: d.cuts ?? [], broken: d.broken });
    for (const s of out) { s.w = s.x1 - s.x0; s.d = s.z1 - s.z0; s.cx = (s.x0 + s.x1) / 2; s.cz = (s.z0 + s.z1) / 2; s.level = lvlOf(s.y); s.hubX = s.cx; s.hubZ = s.cz; }
    return out;
  }

  /** portals: where something walkable meets the edge of a roof; the paths from them to the hub stay clear of plants */
  corridors(s) {
    const pts = [];
    const sides = [{ n: [0, -1], fixed: s.z0, axis: 'x', a0: s.x0, a1: s.x1 }, { n: [0, 1], fixed: s.z1, axis: 'x', a0: s.x0, a1: s.x1 },
      { n: [-1, 0], fixed: s.x0, axis: 'z', a0: s.z0, a1: s.z1 }, { n: [1, 0], fixed: s.x1, axis: 'z', a0: s.z0, a1: s.z1 }];
    for (const sd of sides) {
      let run = null;
      const flush = () => {
        if (!run) return;
        const m = (run.a + run.b) / 2, ex = sd.axis === 'x' ? m : sd.fixed, ez = sd.axis === 'x' ? sd.fixed : m;
        pts.push({ x: ex - sd.n[0] * 0.8, z: ez - sd.n[1] * 0.8, hw: Math.max(2.2, (run.b - run.a) / 2 + 1.0) });
        run = null;
      };
      for (let t = sd.a0 + 0.5; t < sd.a1; t += 1) {
        const ex = sd.axis === 'x' ? t : sd.fixed, ez = sd.axis === 'x' ? sd.fixed : t;
        let portal = false;
        if (!this.railAt(ex - sd.n[0] * 0.15, ez - sd.n[1] * 0.15, s.y)) {
          const g = this.phys.groundHeightAt(ex + sd.n[0] * 1.5, ez + sd.n[1] * 1.5, s.y + 0.2, 0.7, 0.25);
          portal = Math.abs(g - s.y) < 0.75;
        }
        if (portal) { if (!run) run = { a: t, b: t }; else run.b = t; } else flush();
      }
      flush();
    }
    for (const r of this.rects) if (Math.abs(r.y0 + 0.6 - s.y) < 1.2) { const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2; if (cx > s.x0 && cx < s.x1 && cz > s.z0 && cz < s.z1) pts.push({ x: cx, z: cz, hw: 2.2 }); }
    for (const c of this.circs) if (c.path !== false && Math.abs(c.y0 + 0.8 - s.y) < 1.2 && c.x > s.x0 && c.x < s.x1 && c.z > s.z0 && c.z < s.z1) pts.push({ x: c.x, z: c.z, hw: 2.2 });
    s.paths = pts.map((p) => ({ ax: p.x, az: p.z, bx: s.hubX, bz: s.hubZ, hw: p.hw }));
    s.portals = pts;
  }

  // ------------------------------------------------------------------ the roof gardens (L3 plazas)
  hideOldTrees(plazas) {
    // the generic trees and lawns the garden scatter planted are replaced by this module's gardens
    const colliders = [];
    for (const s of plazas) for (const c of this.phys.query(s.x0, s.z0, s.x1, s.z1)) if (c.tag === 'tree' && Math.abs(c.min.y - s.y) < 0.2) colliders.push(c);
    for (const c of colliders) this.phys.remove(c);
    this.game.scene.traverse((o) => {
      if (!o.isInstancedMesh || o.name !== 'city:inst:tree') return;
      const m = new THREE.Matrix4(), p = new THREE.Vector3(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, m); m.decompose(p, q, sc);
        if (plazas.some((s) => p.x > s.x0 && p.x < s.x1 && p.z > s.z0 && p.z < s.z1 && Math.abs(p.y - s.y) < 0.3)) { sc.set(0, 0, 0); m.compose(p, q, sc); o.setMatrixAt(i, m); }
      }
      o.instanceMatrix.needsUpdate = true;
    });
  }

  lushOf(s) {
    let sum = 0, n = 0;
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) { sum += this.field.lushness(s.x0 + s.w * (i + 0.5) / 5, s.z0 + s.d * (j + 0.5) / 5, s.y); n++; }
    return sum / n;
  }

  plaza(s, opts = {}) {
    const R = this.rng(s.id), y = s.y, L = s.lush, b = this.b;
    const F = FLOWERS();
    const lights = [];
    const at = (x, z) => this.field.lushness(x, z, y);

    // ---- the sacred peepal, on one roof, near where the light falls
    if (opts.peepal) {
      const sh = this.shafts.filter((q) => q.y0 >= 30 && q.x > s.x0 && q.x < s.x1 && q.z > s.z0 && q.z < s.z1).sort((p, q) => q.r - p.r)[0] ?? { x: s.cx, z: s.cz, r: 6 };
      let best = null;
      for (let k = 0; k < 400 && !best; k++) {
        const a = R() * 6.28, d = sh.r + 3.5 + R() * 6, x = sh.x + Math.cos(a) * d, z = sh.z + Math.sin(a) * d;
        if (this.canPlace(s, x, z, 2.4, 2.4, 2.6, 2.0) && this.spaced(x, z, 5)) best = { x, z };
      }
      if (best) {
        const { x, z } = best;
        S.planterBox(b, { x, y, z, w: 4.4, h: 0.5, stone: true });
        S.tree(b, { x, y: y + 0.5, z, seed: 77, kind: 'peepal', h: 9.2, spread: 6.6, lit: true });
        this.addSolid('peepal', x - 2.2, y, z - 2.2, x + 2.2, y + 0.6, z + 2.2);
        S.gardenLight(b, { x: x + 1.6, y: y + 0.5, z: z + 1.6 }); S.gardenLight(b, { x: x - 1.6, y: y + 0.5, z: z - 1.6 });
        this.pools.push({ x, y: y + 0.07, z, r: 6.5, c: [1, 0.72, 0.34] });
        this.placed.push({ x, z, r: 4.4 });
        this.record('peepal', x, y, z, 2.2, true);
      }
    }

    // ---- planters that the garden scatter already put there: fill them
    const planters = [];
    for (const c of this.phys.query(s.x0, s.z0, s.x1, s.z1)) if (c.tag === 'planter' && Math.abs(c.min.y - y) < 0.2) planters.push({ x0: c.min.x, z0: c.min.z, x1: c.max.x, z1: c.max.z, top: c.max.y });
    planters.forEach((p, i) => {
      const q = this.rng(s.id + 'pl' + i);
      if (q() > 0.28 + 0.72 * L) return;
      const lenX = p.x1 - p.x0 >= p.z1 - p.z0, len = lenX ? p.x1 - p.x0 : p.z1 - p.z0, cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2, f = q() < 0.55 ? F[Math.floor(q() * F.length)] : null;
      const n = Math.max(1, Math.round(len / 1.15));
      for (let k = 0; k < n; k++) {
        const u = -len / 2 + (k + 0.5) * len / n, x = cx + (lenX ? u : 0), z = cz + (lenX ? 0 : u);
        S.shrub(b, { x, y: p.top, z, seed: this.seq++, r: 0.5 + q() * 0.16, h: 0.85 + q() * 0.4, flower: f });
      }
      this.count('planter-fill');
    });

    // ---- trees
    const nT = Math.round(2 + 18 * Math.pow(L, 1.0));
    let made = 0;
    for (let k = 0; k < 1400 && made < nT; k++) {
      const x = s.x0 + 1.5 + R() * (s.w - 3), z = s.z0 + 1.5 + R() * (s.d - 3);
      if (R() > 0.2 + 0.8 * Math.pow(at(x, z) / Math.max(0.2, L), 0.7)) continue;
      const roll = R(), kind = roll < 0.27 ? 'palm' : roll < 0.62 ? 'rain' : 'gulmohar';
      const spread = kind === 'palm' ? 2.2 : kind === 'rain' ? 4.2 + R() * 1.0 : 3.6 + R() * 0.9;
      if (!this.canPlace(s, x, z, 0.42, 0.42, 3, 1.4)) continue;
      if (!this.spaced(x, z, spread * (kind === 'palm' ? 0.55 : 0.8))) continue;
      const lit = L > 0.35 && R() < 0.42, seed = this.seq++;
      if (kind === 'palm') S.palm(b, { x, y, z, seed, h: 6.5 + R() * 4, frond: 2.3 + R() * 0.5 });
      else S.tree(b, { x, y, z, seed, kind, h: (kind === 'rain' ? 6.4 : 5.6) + R() * 2.1, spread, bloom: kind === 'gulmohar' && R() < 0.62, lit });
      this.addSolid(kind, x - 0.3, y, z - 0.3, x + 0.3, y + 3.4, z + 0.3);
      this.placed.push({ x, z, r: spread * (kind === 'palm' ? 0.55 : 0.8) });
      this.record(kind, x, y, z, 0.4, true, { lit });
      if (lit) {
        const a = R() * 6.28;
        S.gardenLight(b, { x: x + Math.cos(a) * 0.9, y, z: z + Math.sin(a) * 0.9 });
        lights.push([x, z]);
        this.pools.push({ x, y: y + 0.07, z, r: 3.4 + R(), c: [1, 0.72, 0.36] });
      }
      made++;
    }

    // ---- flowerbeds
    const nBeds = Math.round(0.5 + 4.5 * L);
    for (let k = 0, m = 0; k < 400 && m < nBeds; k++) {
      const horiz = R() < 0.5, w = horiz ? 2.6 + R() * 1.6 : 1.3, d = horiz ? 1.3 : 2.6 + R() * 1.6;
      const x = s.x0 + 2 + R() * (s.w - 4), z = s.z0 + 2 + R() * (s.d - 4);
      if (!this.canPlace(s, x, z, w / 2 + 0.2, d / 2 + 0.2, 0.5, 1.4) || !this.spaced(x, z, 0.6, 's')) continue;
      S.bed(b, { x, y, z, w, d, seed: this.seq++, flower: F[Math.floor(R() * F.length)] });
      this.addSolid('bed', x - w / 2, y, z - d / 2, x + w / 2, y + 0.3, z + d / 2);
      this.placed.push({ x, z, r: Math.max(w, d) * 0.45, t: 's' });
      this.record('bed', x, y, z, Math.max(w, d) / 2, true, { hx: w / 2, hz: d / 2 });
      if (R() < 0.5) { S.gardenLight(b, { x: x + w / 2 + 0.25, y, z: z - d / 2 }); this.pools.push({ x, y: y + 0.07, z, r: 3.0, c: [1, 0.6, 0.4] }); }
      m++;
    }

    // ---- understory shrubs among the trees and beds
    const nS = Math.round(3 + 22 * L);
    for (let k = 0, m = 0; k < 900 && m < nS; k++) {
      const x = s.x0 + 1.5 + R() * (s.w - 3), z = s.z0 + 1.5 + R() * (s.d - 3), r = 0.55 + R() * 0.4;
      if (R() > 0.15 + 0.85 * Math.pow(at(x, z) / Math.max(0.2, L), 0.7)) continue;
      if (!this.canPlace(s, x, z, r * 0.7, r * 0.7, 1.2, 1.2) || !this.spaced(x, z, r * 0.3, 's')) continue;
      S.shrub(b, { x, y, z, seed: this.seq++, r, h: 0.8 + R() * 0.7, flower: R() < 0.55 ? F[Math.floor(R() * F.length)] : null });
      this.addSolid('shrub', x - r * 0.6, y, z - r * 0.6, x + r * 0.6, y + 0.9, z + r * 0.6);
      this.placed.push({ x, z, r: r * 0.45, t: 's' });
      this.record('shrub', x, y, z, r * 0.6, true);
      m++;
    }

    // ---- hedges inside the rails, clipped around the paths; bougainvillea over the rails where there is no hedge
    const hedged = [];
    const sides = [{ n: [0, 1], axis: 'x', fixed: s.z0, a0: s.x0, a1: s.x1 }, { n: [0, -1], axis: 'x', fixed: s.z1, a0: s.x0, a1: s.x1 },
      { n: [1, 0], axis: 'z', fixed: s.x0, a0: s.z0, a1: s.z1 }, { n: [-1, 0], axis: 'z', fixed: s.x1, a0: s.z0, a1: s.z1 }];   // n = inward
    for (const sd of sides) {
      const at2 = (t, off) => (sd.axis === 'x' ? [t, sd.fixed + sd.n[1] * off] : [sd.fixed + sd.n[0] * off, t]);
      const free = (t) => { const [x, z] = at2(t, 0.9); const ex = sd.axis === 'x' ? 0.7 : 0.5, ez = sd.axis === 'x' ? 0.5 : 0.7; return this.railAt(...at2(t, 0.1), y) && this.floorFree(x, z, ex, ez, y, 1.4) && !this.avoided(x, z, 0.7, y) && !this.inPath(s, x, z, 0.5); };
      let t = sd.a0 + 1.0, runStart = null;
      const rr = this.rng(s.id + sd.axis + sd.fixed);
      const flush = (end) => {
        if (runStart === null) return;
        const a = runStart, c = end; runStart = null;
        if (c - a < 1.6) return;
        const mid = (a + c) / 2, [mx, mz] = at2(mid, 0.9);
        if (rr() > 0.1 + 0.9 * Math.pow(at(mx, mz) / Math.max(0.25, L), 0.6) * Math.min(1, 0.3 + L)) return;
        const hx0 = sd.axis === 'x' ? a : mx - 0.45, hx1 = sd.axis === 'x' ? c : mx + 0.45, hz0 = sd.axis === 'x' ? mz - 0.45 : a, hz1 = sd.axis === 'x' ? mz + 0.45 : c;
        S.hedge(b, { x0: hx0, z0: hz0, x1: hx1, z1: hz1, y, h: 1.05 + rr() * 0.4, t: 0.9, seed: this.seq++ });
        this.addSolid('hedge', hx0, y, hz0, hx1, y + 1.2, hz1);
        this.record('hedge', mx, y, mz, (c - a) / 2, true, { hx: (hx1 - hx0) / 2, hz: (hz1 - hz0) / 2 });
        hedged.push({ sd, a, c });
      };
      let gap = 0;
      while (t < sd.a1 - 1.0) {
        if (free(t)) { if (runStart === null) { runStart = t; gap = 0; } }
        else if (runStart !== null) flush(t - 0.5);
        if (runStart !== null && t - runStart > 4 + rr() * 6) { flush(t); t += 0.6 + rr() * 2.2; continue; }
        t += 0.5;
      }
      flush(t);
      // creepers on the rail wherever it is not hedged and not at a path
      let u = sd.a0 + 1.0;
      while (u < sd.a1 - 1.5) {
        const len = 3 + rr() * 5, end = Math.min(sd.a1 - 1, u + len), [mx, mz] = at2((u + end) / 2, 0.2);
        const covered = hedged.some((h) => h.sd === sd && !(end < h.a || u > h.c));
        let ok = !covered && rr() < 0.08 + 0.85 * L * Math.pow(at(mx, mz) / Math.max(0.25, L), 0.6);
        if (ok) for (let t2 = u; t2 <= end; t2 += 0.6) { const [x, z] = at2(t2, 0.25); if (!this.railAt(...at2(t2, 0.1), y) || this.avoided(x, z, 0.3, y) || this.inPath(s, x, z, 0.3)) { ok = false; break; } }
        if (ok) {
          const [ax, az] = at2(u, 0.22), [bx, bz] = at2(end, 0.22);
          S.creeper(b, { x0: ax, z0: az, x1: bx, z1: bz, y, side: sd.n, seed: this.seq++, density: 0.6 + 0.4 * L });
          this.record('creeper', (ax + bx) / 2, y, (az + bz) / 2, (end - u) / 2, false);
        }
        u = end + 0.5 + rr() * 3;
      }
    }

    // ---- and bougainvillea hanging down the outer face of the roof edge, so the street below sees a green fringe
    for (const sd of sides) {
      const at2 = (t, off) => (sd.axis === 'x' ? [t, sd.fixed + sd.n[1] * off] : [sd.fixed + sd.n[0] * off, t]);
      const rr = this.rng(s.id + 'drape' + sd.axis + sd.fixed);
      let u = sd.a0 + 1.0;
      while (u < sd.a1 - 2) {
        const end = Math.min(sd.a1 - 1, u + 3 + rr() * 7), [mx, mz] = at2((u + end) / 2, 0.2);
        let ok = rr() < 0.18 + 0.75 * Math.pow(at(mx, mz) / Math.max(0.25, L), 0.5) * Math.min(1, 0.25 + L);
        if (ok) for (let t2 = u; t2 <= end; t2 += 0.8) { const [x, z] = at2(t2, 0.25); if (!this.railAt(...at2(t2, 0.1), y) || this.avoided(x, z, 0.3, y)) { ok = false; break; } }
        if (ok) { const [dx0, dz0] = at2(u, -0.13), [dx1, dz1] = at2(end, -0.13); S.drape(b, { x0: dx0, z0: dz0, x1: dx1, z1: dz1, y: y + 1.1, out: [-sd.n[0], -sd.n[1]], seed: this.seq++, maxLen: 4 + 9 * L }); this.record('drape', (dx0 + dx1) / 2, y + 1.1, (dz0 + dz1) / 2, (end - u) / 2, false, { nx: -sd.n[0], nz: -sd.n[1] }); }
        u = end + 0.5 + rr() * 2.5;
      }
    }

    // ---- lawns over the free ground between (never over a path)
    const cells = [], step = 1.6, nz = fbm;
    for (let x = s.x0 + 1.4; x < s.x1 - 1.2; x += step) for (let z = s.z0 + 1.4; z < s.z1 - 1.2; z += step) {
      if (nz(x * 1.6 + 300, z * 1.6, SEED + 3) < 0.62 - 0.3 * L - 0.1) continue;
      if (this.avoided(x, z, 1.2, y) || this.inPath(s, x, z, 1.5)) continue;
      if (!this.floorFree(x, z, 1.1, 1.1, y, 0.9, 0.04)) continue;
      cells.push([x, z, step]);
    }
    if (cells.length) { S.lawn(b, { cells, y, seed: this.seq++ }); this.count('lawn-cells', cells.length); }
    s.stats = { trees: made, beds: nBeds, planters: planters.length, lawn: cells.length, lights: lights.length };
  }

  // ------------------------------------------------------------------ other decks: bridges, flyovers, walkways
  deckEdges(s) {
    const y = s.y, b = this.b, L = this.field.lushness(s.cx, s.cz, y), R = this.rng(s.id);
    if (s.level === 'L1' || s.level === 'G' || s.level === 'U') return;
    const sides = [{ n: [0, 1], axis: 'x', fixed: s.z0, a0: s.x0, a1: s.x1 }, { n: [0, -1], axis: 'x', fixed: s.z1, a0: s.x0, a1: s.x1 },
      { n: [1, 0], axis: 'z', fixed: s.x0, a0: s.z0, a1: s.z1 }, { n: [-1, 0], axis: 'z', fixed: s.x1, a0: s.z0, a1: s.z1 }];
    for (const sd of sides) {
      const len = sd.a1 - sd.a0; if (len < 5) continue;
      const at2 = (t, off) => (sd.axis === 'x' ? [t, sd.fixed + sd.n[1] * off] : [sd.fixed + sd.n[0] * off, t]);
      const isRoad = s.kind === 'road';
      // creeper strands on the rail
      let u = sd.a0 + 2;
      while (u < sd.a1 - 3) {
        const l = 3 + R() * 6, end = Math.min(sd.a1 - 2, u + l), [mx, mz] = at2((u + end) / 2, 0.2);
        const lush = this.field.lushness(mx, mz, y);
        let ok = R() < (s.level === 'L3' ? 0.12 + 0.8 * lush : 0.14 + 1.5 * lush);
        if (ok) for (let t = u; t <= end; t += 0.6) { const [x, z] = at2(t, 0.25); if (!this.railAt(...at2(t, 0.1), y) || this.avoided(x, z, 0.3, y)) { ok = false; break; } }
        if (ok) {
          const [ax, az] = at2(u, 0.22), [bx, bz] = at2(end, 0.22);
          S.creeper(b, { x0: ax, z0: az, x1: bx, z1: bz, y, side: sd.n, seed: this.seq++, density: s.level === 'L3' ? 0.7 : 0.45 });
          this.record('creeper', (ax + bx) / 2, y, (az + bz) / 2, (end - u) / 2, false);
          if (R() < 0.7) { const [dx0, dz0] = at2(u, -0.13), [dx1, dz1] = at2(end, -0.13); S.drape(b, { x0: dx0, z0: dz0, x1: dx1, z1: dz1, y: y + 1.1, out: [-sd.n[0], -sd.n[1]], seed: this.seq++, maxLen: s.level === 'L3' ? 5 : 2.6 }); this.record('drape', (dx0 + dx1) / 2, y + 1.1, (dz0 + dz1) / 2, (end - u) / 2, false, { nx: -sd.n[0], nz: -sd.n[1] }); }
        }
        u = end + 1 + R() * 5;
      }
      if (s.level === 'L3' && !isRoad && Math.min(s.w, s.d) >= 5.5) {
        // clipped planters along the bridge edge (the privileged get hedges on their bridges)
        let t = sd.a0 + 3.5;
        while (t < sd.a1 - 5) {
          const l = 2.5 + R() * 3, end = Math.min(sd.a1 - 3.5, t + l), [mx, mz] = at2((t + end) / 2, 0.75), lush = this.field.lushness(mx, mz, y);
          if (R() < 0.15 + 0.7 * lush) {
            const ex = sd.axis === 'x' ? 0.5 : 0.55, ez = sd.axis === 'x' ? 0.55 : 0.5;
            const ok = [t, (t + end) / 2, end].every((tt) => { const [x, z] = at2(tt, 0.75); return this.railAt(...at2(tt, 0.1), y) && this.floorFree(x, z, ex, ez, y, 1.4) && !this.avoided(x, z, 0.8, y); });
            if (ok) {
              const hx0 = sd.axis === 'x' ? t : mx - 0.4, hx1 = sd.axis === 'x' ? end : mx + 0.4, hz0 = sd.axis === 'x' ? mz - 0.4 : t, hz1 = sd.axis === 'x' ? mz + 0.4 : end;
              S.hedge(b, { x0: hx0, z0: hz0, x1: hx1, z1: hz1, y, h: 0.9, t: 0.8, seed: this.seq++ });
              this.addSolid('hedge', hx0, y, hz0, hx1, y + 1.1, hz1);
              this.record('hedge', mx, y, mz, (end - t) / 2, true, { hx: (hx1 - hx0) / 2, hz: (hz1 - hz0) / 2 });
            }
          }
          t = end + 3 + R() * 6;
        }
      }
      if (s.level === 'L2' && isRoad && len > 20) {
        // someone's paint buckets of money plant tied to the barrier (making do)
        let t = sd.a0 + 6;
        while (t < sd.a1 - 6) {
          const [x, z] = at2(t, 0.65), lush = this.field.lushness(x, z, y);
          if (R() < 0.05 + 0.9 * lush && this.railAt(...at2(t, 0.1), y) && this.floorFree(x, z, 0.25, 0.25, y, 0.8) && !this.avoided(x, z, 0.7, y)) {
            const k = 1 + Math.floor(R() * 3);
            for (let i = 0; i < k; i++) {
              const [px, pz] = at2(t + i * 0.55, 0.62);
              if (!this.floorFree(px, pz, 0.22, 0.22, y, 0.8)) continue;
              S.pot(b, { x: px, y, z: pz, seed: this.seq++, kind: 'bucket' });
              this.addSolid('bucket', px - 0.2, y, pz - 0.2, px + 0.2, y + 0.4, pz + 0.2);
              this.record('bucket', px, y, pz, 0.2, true);
            }
          }
          t += 12 + R() * 22;
        }
      }
    }
    // a small rooftop kitchen garden on any L2 roof that is not a road
    if (s.level === 'L2' && s.kind !== 'road' && Math.min(s.w, s.d) >= 6) {
      const w = Math.min(5.5, s.w - 3), d = Math.min(3.6, s.d - 3);
      for (let k = 0; k < 40; k++) {
        const x = s.x0 + 1.8 + w / 2 + R() * Math.max(0.1, s.w - 3.6 - w), z = s.z0 + 1.8 + d / 2 + R() * Math.max(0.1, s.d - 3.6 - d);
        if (this.avoided(x, z, Math.max(w, d) / 2, y) || !this.floorFree(x, z, w / 2, d / 2, y, 1.2)) continue;
        S.kitchenGarden(b, { x, y, z, w, d, seed: this.seq++ });
        this.addSolid('kitchen', x - w / 2, y, z - d / 2, x + w / 2, y + 0.4, z + d / 2);
        this.record('kitchen', x, y, z, Math.max(w, d) / 2, true, { hx: w / 2, hz: d / 2 });
        break;
      }
    }
  }

  // ------------------------------------------------------------------ the tops of the towers
  towerTops() {
    const b = this.b, F = FLOWERS();
    this.map.towers.forEach((t, ti) => {
      if (t.roof || t.h < 40) return;
      const w = t.x1 - t.x0, d = t.z1 - t.z0;
      if (Math.min(w, d) < 14 || t.style === 'control') return;
      const cx = (t.x0 + t.x1) / 2, cz = (t.z0 + t.z1) / 2, y = t.h;
      const elite = !!t.glass || Math.hypot(cx - ELITE.x, cz - ELITE.z) < 95;
      const lush = Math.min(1, this.field.lushness(cx, cz, 40) * (elite ? 1.3 : 0.85) + (elite ? 0.12 : 0));
      const R = this.rng('top' + t.id);
      if (hash2(ti, 77, SEED) > 0.12 + 1.1 * lush) return;              // most are bare
      const bw = w * 0.62 / 2 + 1.1, bd = d * 0.62 / 2 + 1.1;
      const ok = (x, z, r) => x - r > t.x0 + 1.0 && x + r < t.x1 - 1.0 && z - r > t.z0 + 1.0 && z + r < t.z1 - 1.0 && !(Math.abs(x - cx) < bw + r && Math.abs(z - cz) < bd + r) &&
        !([[t.x0, t.z0], [t.x1, t.z0], [t.x0, t.z1], [t.x1, t.z1]].some(([px, pz]) => Math.hypot(x - px, z - pz) < 3.6 + r));
      const placed = [];
      const n = 2 + Math.round(9 * lush);
      let made = 0;
      for (let k = 0; k < 500 && made < n; k++) {
        const x = t.x0 + R() * w, z = t.z0 + R() * d, roll = R(), kind = roll < 0.4 ? 'palm' : roll < 0.75 ? 'rain' : 'gulmohar', sp = kind === 'palm' ? 2.0 : 3.6;
        if (!ok(x, z, 1.2) || placed.some((p) => Math.hypot(p.x - x, p.z - z) < sp * 0.9)) continue;
        const seed = this.seq++;
        if (kind === 'palm') S.palm(b, { x, y, z, seed, h: 6.5 + R() * 4, frond: 2.4 });
        else S.tree(b, { x, y, z, seed, kind, h: 5.4 + R() * 2, spread: sp + R(), bloom: kind === 'gulmohar' && R() < 0.6, lit: lush > 0.4 && R() < 0.35 });
        placed.push({ x, z }); this.record('top-' + kind, x, y, z, 0.4, false); made++;
      }
      // lawn and a few shrubs between the trees
      const cells = [];
      for (let x = t.x0 + 1.6; x < t.x1 - 1; x += 2.6) for (let z = t.z0 + 1.6; z < t.z1 - 1; z += 2.6) if (ok(x, z, 1.3) && fbm(x * 1.5 + 90, z * 1.5, SEED + 5) > 0.5 - 0.2 * lush) cells.push([x, z, 2.55]);
      if (cells.length) S.lawn(b, { cells, y, seed: this.seq++ });
      for (let k = 0; k < 3 + lush * 8; k++) { const x = t.x0 + R() * w, z = t.z0 + R() * d; if (ok(x, z, 0.8)) S.shrub(b, { x, y, z, seed: this.seq++, r: 0.7 + R() * 0.5, h: 1.0 + R() * 0.6, flower: R() < 0.5 ? F[Math.floor(R() * F.length)] : null }); }
      this.count('tower-tops');
      this.topped = (this.topped ?? 0) + 1;
    });
  }

  // ------------------------------------------------------------------ vertical gardens on elite tower faces
  greenWalls() {
    const b = this.b;
    this.map.towers.forEach((t, ti) => {
      if (t.h < 55 || t.style === 'control' && false) return;
      const w = t.x1 - t.x0, d = t.z1 - t.z0, cx = (t.x0 + t.x1) / 2, cz = (t.z0 + t.z1) / 2;
      const elite = !!t.glass || (Math.hypot(cx - ELITE.x, cz - ELITE.z) < 80 && t.h > 100);
      if (!elite) return;
      const faces = [{ n: [0, -1], len: w, ax: t.x0, az: t.z0, tx: 1, tz: 0 }, { n: [0, 1], len: w, ax: t.x0, az: t.z1, tx: 1, tz: 0 },
        { n: [-1, 0], len: d, ax: t.x0, az: t.z0, tx: 0, tz: 1 }, { n: [1, 0], len: d, ax: t.x1, az: t.z0, tx: 0, tz: 1 }];
      const R = this.rng('wall' + t.id);
      // faces that look toward the middle of New Wadala (and the open canyons) get the gardens
      const scored = faces.map((f) => ({ f, s: (ELITE.x - cx) * f.n[0] + (ELITE.z - cz) * f.n[1] + R() * 18 })).sort((p, q) => q.s - p.s).slice(0, t.style === 'control' ? 2 : 2);
      for (const { f } of scored) {
        const cnt = Math.max(2, Math.floor(f.len / 10.5));         // the buttress fins stand at (i + 0.5) / cnt along the face
        for (let i = 0; i < cnt - 1; i++) {
          if (R() < 0.18) continue;
          const u = (i + 1) / cnt, bw = Math.min(5.2, f.len / cnt - 2.6);
          const px = f.ax + f.tx * f.len * u, pz = f.az + f.tz * f.len * u;
          let y0 = Math.max(41.5, (t.y0 ?? 0) + 4);
          if (t.glass && t.glass[1] + 3 < t.h - 24) y0 = Math.max(y0, t.glass[1] + 3);      // clear of the stained-glass band
          let y1 = Math.min(t.h - 9, y0 + 24 + R() * 40);
          // lift the base above anything walkable that meets the face here
          const hx = f.tx ? bw / 2 : 2.2, hz = f.tz ? bw / 2 : 2.2;
          let ok = true, maxTop = -1e9;
          for (const c of this.phys.query(px - hx - (f.n[0] > 0 ? 0 : 2.5), pz - hz - (f.n[1] > 0 ? 0 : 2.5), px + hx + (f.n[0] > 0 ? 2.5 : 0), pz + hz + (f.n[1] > 0 ? 2.5 : 0))) {
            if (c.tag.startsWith('tower') || c.tag.startsWith('plant')) continue;
            if (c.max.y > y0 - 3.4 && c.min.y < y1 + 1) { if (c.walkable && c.max.y < y1) maxTop = Math.max(maxTop, c.max.y); else if (c.solid) { ok = false; break; } }
          }
          if (!ok) { (this.wallLog ??= []).push(`${t.id} ${f.n} bay${i}: blocked`); continue; }
          if (maxTop + 3.6 > y0) y0 = maxTop + 3.6;
          if (y1 - y0 < 9) { (this.wallLog ??= []).push(`${t.id} ${f.n} bay${i}: short ${y0}-${y1}`); continue; }
          const half = bw / 2;
          S.greenWall(b, { ax: px - f.tx * half, az: pz - f.tz * half, bx: px + f.tx * half, bz: pz + f.tz * half, nx: f.n[0], nz: f.n[1], y0, y1, seed: this.seq++ });
          this.record('green-wall', px, (y0 + y1) / 2, pz, bw / 2, false, { tower: t.id, y0, y1 });
        }
      }
    });
  }

  // ------------------------------------------------------------------ balcony kitchen gardens on L2 (making do)
  balconies() {
    const b = this.b, decks = this.map.decks.filter((d) => d.y >= 18 && d.y < 31);
    const R = this.rng('balconies');
    const spots = [];
    this.map.towers.forEach((t, ti) => {
      if (t.roof || t.h < 40 || (t.y0 ?? -2) > 10) return;
      const faces = [{ n: [0, -1], len: t.x1 - t.x0, ax: t.x0, az: t.z0, tx: 1, tz: 0 }, { n: [0, 1], len: t.x1 - t.x0, ax: t.x0, az: t.z1, tx: 1, tz: 0 },
        { n: [-1, 0], len: t.z1 - t.z0, ax: t.x0, az: t.z0, tx: 0, tz: 1 }, { n: [1, 0], len: t.z1 - t.z0, ax: t.x1, az: t.z0, tx: 0, tz: 1 }];
      for (const f of faces) {
        if (f.len < 14) continue;
        for (let u = 4; u < f.len - 4; u += 6.5 + R() * 3) {
          const px = f.ax + f.tx * u, pz = f.az + f.tz * u;
          // L2 near a deck that runs past this face, or beside a street the face looks onto
          const near = decks.some((dk) => px > dk.x0 - 9 && px < dk.x1 + 9 && pz > dk.z0 - 9 && pz < dk.z1 + 9);
          if (!near) continue;
          if (R() > 0.5) continue;
          spots.push({ t, f, px, pz, y: 24 + 1.8 + R() * 6 });
        }
      }
    });
    let made = 0;
    for (const sp of spots) {
      if (made >= 22) break;
      const { f, px, pz, y } = sp, w = 4.0, dp = 1.8, n = f.n;
      const cx = px + n[0] * (dp / 2), cz = pz + n[1] * (dp / 2), hx = n[0] ? dp / 2 : w / 2, hz = n[1] ? dp / 2 : w / 2;
      let clear = true;
      for (const c of this.phys.query(cx - hx - 0.4, cz - hz - 0.4, cx + hx + 0.4, cz + hz + 0.4)) if (!c.tag.startsWith('tower') && c.max.y > y - 1 && c.min.y < y + 2.2) { clear = false; break; }
      if (!clear) continue;
      if (this.placed.some((p) => p.bal && Math.hypot(p.x - px, p.z - pz) < 5 && Math.abs(p.y - y) < 3)) continue;
      S.balcony(b, { x: px, y, z: pz, nx: n[0], nz: n[1], w, d: dp, seed: this.seq++ });
      this.addSolid('balcony', cx - hx, y - 0.3, cz - hz, cx + hx, y + 1.05, cz + hz);
      this.placed.push({ x: px, z: pz, y, r: 0, bal: true, t: 'b' });
      this.record('balcony', px, y, pz, 1.7, true, { hx: (hx), hz: (hz), cx, cz });
      made++;
    }
  }

  // ------------------------------------------------------------------ the little there is below: tulsi at the shrines, window ledges, weeds in the light
  lowerCity() {
    const b = this.b, map = this.map, R = this.rng('low');
    for (const sp of map.shrineSpots ?? []) {
      let done = false;
      for (let k = 0; k < 12 && !done; k++) {
        const a = k * 0.52 + R() * 0.3, x = sp.x + Math.cos(a) * 1.15, z = sp.z + Math.sin(a) * 1.15;
        if (this.avoided(x, z, 0.5, sp.y) || !this.floorFree(x, z, 0.26, 0.26, sp.y, 0.8)) continue;
        S.pot(b, { x, y: sp.y, z, seed: this.seq++, kind: 'tulsi', r: 0.26 });
        this.addSolid('tulsi', x - 0.22, sp.y, z - 0.22, x + 0.22, sp.y + 0.6, z + 0.22);
        this.record('tulsi', x, sp.y, z, 0.25, true);
        done = true;
      }
    }
    for (const sh of map.slumShacks ?? []) {
      if (R() > 0.3) continue;
      const side = R() < 0.5 ? -1 : 1, x = sh.x + side * (sh.w / 2 + 0.17), z = sh.z + (R() - 0.5) * sh.d * 0.5;
      if (this.phys.query(x - 0.25, z - 0.25, x + 0.25, z + 0.25).some((c) => c.solid && c.min.y < 1.7 && c.max.y > 0.5 && !c.tag.includes('shack') && c.tag !== 'shack')) continue;
      // ledge plank with a pot, hung on the wall at window height
      b.at(x, 1.1, z, 0, 1, { lod: 0 }); S.box(b, -0.2, 0, -0.32, 0.2, 0.05, 0.32, S.C.woodDark);
      S.pot(b, { x, y: 1.2, z, seed: this.seq++, kind: R() < 0.5 ? 'terracotta' : 'bucket', r: 0.2, flower: S.C.marigold });
      this.record('ledge-pot', x, 1.2, z, 0.2, false);
    }
    for (const sh of this.shafts) {
      if (sh.level !== 'G' || (map.deadTree && Math.hypot(sh.x - map.deadTree.x, sh.z - map.deadTree.z) < 18)) continue;      // the dead tree stays dead
      for (let k = 0; k < 4; k++) {
        const a = R() * 6.28, d = R() * sh.r * 0.7, x = sh.x + Math.cos(a) * d, z = sh.z + Math.sin(a) * d;
        const g = this.phys.groundHeightAt(x, z, 0.3, 0.3, 0.1);
        if (Math.abs(g) > 0.05 || this.avoided(x, z, 0.4, 0)) continue;
        b.at(x, 0, z, 0, 1, { lod: 0 }); const rr = this.rng('weed' + sh.id + k); S.tuft(b, 0, 0.02, 0, rr, 0.35, S.C.leafMid, S.C.leafYel); S.tuft(b, 0.12, 0.02, 0.05, rr, 0.28);
        b.at(x, 0, z, 0, 1, { lod: 1 }); S.tuft(b, 0, 0.02, 0, rr, 0.3);
        this.record('weed', x, 0, z, 0.15, false);
      }
    }
  }

  // ------------------------------------------------------------------ assembly
  build() {
    const t0 = performance.now(), game = this.game;
    this.gather();
    const all = this.surfaces();
    const plazas = all.filter((s) => s.level === 'L3' && Math.min(s.w, s.d) >= 18 && s.kind !== 'road');
    this.hideOldTrees(plazas);
    for (const s of plazas) { this.corridors(s); s.lush = Math.max(0.12, this.lushOf(s)); }
    // the peepal goes on the roof with the most light on it
    const peepalRoof = plazas.slice().sort((p, q) => q.lush - p.lush)[1] ?? plazas[0];
    for (const s of plazas) this.plaza(s, { peepal: s === peepalRoof });
    for (const s of all) if (!plazas.includes(s)) this.deckEdges(s);
    this.towerTops();
    this.greenWalls();
    this.balconies();
    this.lowerCity();
    this.plazas = plazas;
    this.finish();
    this.stats = { ms: Math.round(performance.now() - t0), plants: this.plants.length, ...this.counts, plazas: plazas.map((p) => ({ id: p.id, lush: +p.lush.toFixed(2), ...p.stats })), tris: this.b.tris.slice(), colliders: this.colliders.length };
    game.debug?.addState('greenery', () => this.snapshot());
    game.debug?.addAction('greeneryVerify', () => this.verify());
    game.debug?.addAction('greenery', (g, on) => { this.setEnabled(on !== false && on !== 0); return this.enabled; });
  }

  finish() {
    const game = this.game, U = this.U = createUniforms();
    setShafts(U, this.shafts, SHAFT_LEAN);
    const parts = this.b.finish();
    this.group = new THREE.Group(); this.group.name = 'greenery';
    this.layers = [];
    for (const p of parts) {
      const mat = makePlantMaterial(U, { map: leafTexture(), name: 'greenery' });
      game.senses?.patchMaterial?.(mat);
      const idx = new THREE.BufferAttribute(new Uint32Array(p.total), 1); idx.setUsage(THREE.DynamicDrawUsage);
      p.geometry.setIndex(idx); p.geometry.setDrawRange(0, 0);
      const mesh = new THREE.Mesh(p.geometry, mat);
      mesh.name = 'greenery:' + p.layer; mesh.frustumCulled = false; mesh.matrixAutoUpdate = false; mesh.visible = false;
      this.group.add(mesh);
      this.layers.push({ ...p, mesh, mat, sig: '', index: idx });
    }
    // night pools of the garden lights (one additive call)
    if (this.pools.length) {
      const pos = [], col = [], uv = [];
      for (const q of this.pools) {
        const x0 = q.x - q.r, x1 = q.x + q.r, z0 = q.z - q.r, z1 = q.z + q.r;
        pos.push(x0, q.y, z0, x1, q.y, z0, x1, q.y, z1, x0, q.y, z0, x1, q.y, z1, x0, q.y, z1);
        uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
        for (let i = 0; i < 6; i++) col.push(q.c[0], q.c[1], q.c[2]);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      g.computeBoundingSphere();
      this.poolMat = game.materials.pool.clone(); this.poolMat.color.setScalar(0);
      this.poolMesh = new THREE.Mesh(g, this.poolMat); this.poolMesh.name = 'greenery:pools'; this.poolMesh.visible = false; this.poolMesh.renderOrder = 2;
      this.group.add(this.poolMesh);
    }
    game.scene.add(this.group);
    const render0 = game.render.bind(game);
    game.render = () => { this.cull(); render0(); };
    this.onTime = () => {
      const night = 1 - Math.max(0, Math.min(1, game.sky.dayFactor ?? 1));
      U.uNight.value = night;
      if (this.poolMat) { this.poolMat.color.setScalar(0.85 * night); this.poolMesh.visible = night > 0.04 && this.enabled; }
    };
    game.events.on('sky:time', this.onTime); this.onTime();
    this.enabled = true;
    this._frustum = new THREE.Frustum(); this._pv = new THREE.Matrix4(); this._sph = new THREE.Sphere();
    this.visible = { cells: 0, tris: 0, lod0: 0 };
  }

  // ------------------------------------------------------------------ per frame: choose visible cells and LODs
  cull() {
    const game = this.game, U = this.U;
    if (!this.enabled) { for (const l of this.layers) l.mesh.visible = false; return; }
    U.uTime.value = game.time ?? 0;
    U.uSun.value = this.world.sunShafts?.intensity ?? 1;
    const cam = game.camera;
    cam.updateMatrixWorld();
    this._pv.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse.copy(cam.matrixWorld).invert());
    this._frustum.setFromProjectionMatrix(this._pv);
    const D = Math.max(66, (game.scene.fog?.far ?? 60) + 8) + 4, NEAR = Math.min(64, D * 0.42);
    const cp = cam.position, budget = 48000;
    let tris = 0, n0 = 0, cells = 0;
    const chosen = [];
    for (let li = 0; li < this.layers.length; li++) {
      const L = this.layers[li];
      L.cells.forEach((c, ci) => {
        const d = Math.hypot(c.center.x - cp.x, (c.center.y - cp.y) * 0.5, c.center.z - cp.z) - c.radius;
        if (d > D) return;
        this._sph.set(c.center, c.radius);
        if (!this._frustum.intersectsSphere(this._sph)) return;
        chosen.push({ li, ci, d });
      });
    }
    chosen.sort((p, q) => p.d - q.d);
    const picks = this.layers.map(() => []);
    for (const k of chosen) {
      const c = this.layers[k.li].cells[k.ci];
      let lod = k.d < NEAR ? 0 : 1;
      if (lod === 0 && tris + c.ranges[0].count / 3 > budget) lod = 1;
      if (!c.ranges[lod].count) lod = 1 - lod;
      if (!c.ranges[lod].count) continue;
      tris += c.ranges[lod].count / 3; if (lod === 0) n0++; cells++;
      picks[k.li].push(c.ranges[lod]);
    }
    this.visible = { cells, tris: Math.round(tris), lod0: n0 };
    this.layers.forEach((L, li) => {
      const list = picks[li];
      const sig = list.map((r) => r.start).join(',');
      if (sig !== L.sig) {
        L.sig = sig;
        const a = L.index.array; let n = 0;
        for (const r of list) { for (let v = r.start, e = r.start + r.count; v < e; v++) a[n++] = v; }
        L.index.clearUpdateRanges(); if (n) L.index.addUpdateRange(0, n);      // upload only the part in use
        L.index.needsUpdate = true; L.mesh.geometry.setDrawRange(0, n); L.n = n;
      }
      L.mesh.visible = (L.n ?? 0) > 0;
    });
  }

  setEnabled(on) { this.enabled = !!on; this.group.visible = !!on; }

  snapshot() {
    return { plants: this.plants.length, solids: this.colliders.length, tris: this.b.tris, visible: this.visible, ms: this.stats?.ms, calls: this.layers.filter((l) => l.mesh.visible).length + (this.poolMesh?.visible ? 1 : 0) };
  }

  api() {
    return { stats: this.stats, plants: this.plants, plazas: this.plazas, verify: () => this.verify(), setEnabled: (v) => this.setEnabled(v), snapshot: () => this.snapshot(), debug: this };
  }

  // ------------------------------------------------------------------ the test: nothing plants over an approach, and every approach still connects
  /**
   * Re-collects the reserved approaches from the world as it is NOW (every system has registered its interactables by then) and checks
   * every solid plant against them; then flood-fills each plaza from each of its portals with the plants' colliders on and off and
   * compares what is reachable. Returns { checked, overlaps:[...], blocked:[...], plazas:[...] }.
   */
  verify() {
    const fresh = new Greenery(this.game, this.world, this.ctx);
    fresh.gather();
    const overlaps = [];
    for (const p of this.plants) {
      if (!p.solid) continue;
      if (p.hx !== undefined ? fresh.avoidedBox(p.cx ?? p.x, p.cz ?? p.z, p.hx, p.hz, p.y) : fresh.avoided(p.x, p.z, p.r, p.y)) overlaps.push(`${p.kind}@${p.x.toFixed(1)},${p.y},${p.z.toFixed(1)} on a reserved approach`);
    }
    // interactables: no plant (solid or not) within 1.4 m
    for (const i of this.game.interactables?.list?.() ?? []) {
      if (!i.pos) continue;
      for (const p of this.plants) if (Math.abs(p.y - i.pos.y) < 2 && Math.hypot(p.x - i.pos.x, p.z - i.pos.z) < (p.kind === 'creeper' || p.kind === 'green-wall' ? 0.5 : 1.4) + (p.solid ? p.r * 0.5 : 0)) overlaps.push(`${p.kind} near interactable ${i.id}`);
    }
    // flood fill on each plaza
    const phys = this.phys, blocked = [], zones = [];
    const reach = (s, sx, sz) => {
      const step = 0.6, nx = Math.ceil(s.w / step), nz = Math.ceil(s.d / step), seen = new Uint8Array(nx * nz);
      const ok = (ix, iz) => {
        const x = s.x0 + (ix + 0.5) * step, z = s.z0 + (iz + 0.5) * step;
        if (ix < 0 || iz < 0 || ix >= nx || iz >= nz) return false;
        for (const c of phys.query(x - 0.33, z - 0.33, x + 0.33, z + 0.33)) if (c.solid && c.min.y < s.y + 1.7 && c.max.y > s.y + 0.65) return false;
        return Math.abs(phys.groundHeightAt(x, z, s.y + 0.1, 0.3, 0.3) - s.y) < 0.35;
      };
      const q = [[Math.floor((sx - s.x0) / step), Math.floor((sz - s.z0) / step)]];
      while (q.length) {
        const [ix, iz] = q.pop();
        if (ix < 0 || iz < 0 || ix >= nx || iz >= nz || seen[iz * nx + ix] || !ok(ix, iz)) continue;
        seen[iz * nx + ix] = 1;
        q.push([ix + 1, iz], [ix - 1, iz], [ix, iz + 1], [ix, iz - 1]);
      }
      return { seen, nx, nz, step };
    };
    for (const s of this.plazas ?? []) {
      const pts = s.portals.filter((p) => p.x > s.x0 && p.x < s.x1 && p.z > s.z0 && p.z < s.z1);
      if (pts.length < 2) { zones.push({ id: s.id, portals: pts.length }); continue; }
      const withPlants = reach(s, pts[0].x, pts[0].z);
      for (const c of this.colliders) this.phys.setEnabled(c, false);
      const without = reach(s, pts[0].x, pts[0].z);
      for (const c of this.colliders) this.phys.setEnabled(c, true);
      const at = (R, p) => R.seen[Math.floor((p.z - s.z0) / R.step) * R.nx + Math.floor((p.x - s.x0) / R.step)];
      const lost = pts.filter((p) => at(without, p) && !at(withPlants, p));
      let lostCells = 0, total = 0;
      for (let i = 0; i < withPlants.seen.length; i++) { total += without.seen[i]; if (without.seen[i] && !withPlants.seen[i]) lostCells++; }
      for (const p of lost) blocked.push(`${s.id}: portal ${p.x.toFixed(1)},${p.z.toFixed(1)} no longer reachable`);
      zones.push({ id: s.id, portals: pts.length, reachable: total, coveredByPlants: lostCells, lost: lost.length });
    }
    return { checked: this.plants.filter((p) => p.solid).length, overlaps, blocked, zones };
  }
}
