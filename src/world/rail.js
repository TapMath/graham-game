// The Harbour Line, static part (Phase 8B): ballast, rails and sleepers along the z = -60 corridor, the side platforms of the five
// stations (0.5 m: the carriage floor height) with their end ramps, columns, lamps and name boards, the fence that keeps people off the
// line except at the level crossings, the crossing masts, the viaduct piles over the sea, and the buffer stops. The trains, the
// crossing booms and everything that moves are in src/systems/transit.
//
// Everything is an AABB (the line is axis-aligned: trains slide along x). Visual boxes merge into the city chunks; repeated bits are
// instances of the Builder kinds, so the whole line costs almost no extra draw calls.
import * as THREE from '../../vendor/three.module.js';
import { fixedRng } from './props.js';

const dim = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();

/** Reserve the corridor before anything else is dressed (the ground's street markings, props, parked cars...). */
export function reserveRailCorridor(ctx) {
  const R = ctx.map.rail, c = R.corridor;
  ctx.keepClear(R.x0 - 1, c.z0, R.x1 + 1, c.z1, 0, 6);
}

export function buildRail(ctx, labels) {
  const { b, map, phys } = ctx, R = map.rail, rnd = fixedRng(808);
  const info = { stations: [], crossings: [], fences: [], platforms: [] };
  ctx.rail = info;
  const X0 = R.x0, X1 = R.x1, top = R.platformTop;
  const trackZ = [R.tracks.east.z, R.tracks.west.z];

  // ---- ballast, rails, sleepers (visual only: the tracks are flush with the street, you walk over them)
  for (const z of trackZ) {
    b.box([X0, 0, z - 1.55], [X1, 0.07, z + 1.55], { color: 0x3b3a36, solid: false, walkable: false, tag: 'ballast' });
    for (const dz of [-0.72, 0.72]) {
      b.box([X0, 0.07, z + dz - 0.06], [X1, 0.19, z + dz + 0.06], { color: 0x6c7276, solid: false, walkable: false, tag: 'rail' });
      b.box([X0, 0.19, z + dz - 0.025], [X1, 0.2, z + dz + 0.025], { mat: 'emissive', color: 0x274650, solid: false, walkable: false, noTint: true });   // the wet sheen on the rail head
    }
    for (let x = X0 + 0.5; x < X1 - 0.5; x += 1.1) {
      b.box([x - 0.13, 0.07, z - 1.25], [x + 0.13, 0.15, z + 1.25], { color: 0x4a3f33, solid: false, walkable: false, tag: 'sleeper', noTint: true });
    }
  }
  // the strip between the tracks: a darker bed with the odd cable trough
  b.box([X0, 0, R.tracks.east.z + 1.55], [X1, 0.03, R.tracks.west.z - 1.55], { color: 0x2e302d, solid: false, walkable: false, tag: 'bed' });

  // ---- viaduct piles under the decks over the water
  for (const [a, e] of [[-180, -142], [162, 205]]) {
    for (let x = a; x <= e; x += 9.5) for (const z of [-68.5, -51.5]) b.instance('pillar', { x, y: -5.6, z, sx: 1.1, sy: 4.7, sz: 1.1, color: 0x59605e });
  }

  // ---- buffer stops at the two ends of the line (solid; the trains reverse long before them)
  for (const [x, s] of [[X0, 1], [X1, -1]]) {
    for (const z of trackZ) {
      b.box([x - (s > 0 ? 0 : 0.7), 0.0, z - 1.0], [x + (s > 0 ? 0.7 : 0), 1.0, z + 1.0], { color: 0x8c3a2e, solid: true, walkable: false, tag: 'buffer' });
      b.box([x - (s > 0 ? 0 : 0.3), 1.0, z - 1.0], [x + (s > 0 ? 0.3 : 0), 1.3, z + 1.0], { mat: 'emissive', color: 0xd8c8a0, solid: false, walkable: false, noTint: true });
    }
  }

  // ---- stations: side platforms, ramps, columns, lamps, benches, name boards
  const rampLen = 3;
  for (const st of R.stations) {
    const rec = { id: st.id, x: st.x, x0: st.x0, x1: st.x1, platforms: {} };
    for (const side of ['north', 'south']) {
      const P = R.platforms[side];
      const zMid = (P.z0 + P.z1) / 2, faceDir = side === 'north' ? '+z' : '-z';
      const trackEdge = side === 'north' ? P.z1 : P.z0;
      phys.addBox([st.x0, 0, P.z0], [st.x1, top, P.z1], { solid: true, walkable: true, tag: 'platform' });
      b.box([st.x0, 0, P.z0], [st.x1, top, P.z1], { color: 0x8a8578, solid: false, walkable: false, visual: true, tag: 'platform' });
      // yellow safety line along the track edge, and a darker nosing
      const ly0 = side === 'north' ? trackEdge - 0.55 : trackEdge, ly1 = side === 'north' ? trackEdge : trackEdge + 0.55;
      b.box([st.x0, top, ly0], [st.x1, top + 0.012, ly1], { mat: 'emissive', color: 0x9c8420, solid: false, walkable: false, noTint: true });
      b.box([st.x0, top - 0.05, side === 'north' ? trackEdge - 0.02 : trackEdge - 0.0], [st.x1, top, side === 'north' ? trackEdge : trackEdge + 0.02], { color: 0x3a3a36, solid: false, walkable: false, noTint: true });
      // end ramps
      b.ramp({ x0: st.x0 - rampLen, z0: P.z0, x1: st.x0, z1: P.z1, dir: '+x', yLow: 0, yHigh: top, bottom: 0 }, { color: 0x7d786b, tag: 'platform-ramp' });
      b.ramp({ x0: st.x1, z0: P.z0, x1: st.x1 + rampLen, z1: P.z1, dir: '-x', yLow: 0, yHigh: top, bottom: 0 }, { color: 0x7d786b, tag: 'platform-ramp' });
      // columns, lamps and the pools of light under them
      for (const k of [-15, -5, 5, 15]) {
        const x = st.x + k;
        b.box([x - 0.16, 0, zMid - 0.16], [x + 0.16, 4.3, zMid + 0.16], { color: 0x4d5659, tag: 'platform-column' });
        b.box([x - 0.55, 4.25, zMid - 0.1], [x + 0.55, 4.4, zMid + 0.1], { mat: 'emissive', color: 0xffe3a0, solid: false, walkable: false, noTint: true });
        b.instance('pool', { x, y: top + 0.04, z: zMid, sx: 7.5, sz: 5.6, color: 0x5a4a22 });
      }
      // the name boards, hanging off the columns, readable from the train and from the platform
      const text = `${st.dev}  ${st.name.toUpperCase()}`;
      for (const k of [-10, 10]) {
        const x = st.x + k;
        for (const sgn of [1, -1]) labels.add({ text, tone: 'sun', x, y: 3.35, z: zMid + sgn * 0.22, dir: sgn > 0 ? '+z' : '-z', w: 6.4, h: 1.0 });
        b.box([x - 3.3, 2.78, zMid - 0.12], [x + 3.3, 3.95, zMid + 0.12], { color: 0x14181a, solid: false, walkable: false, noTint: true });
      }
      // a rank of benches along the back edge
      const backZ = side === 'north' ? P.z0 + 0.55 : P.z1 - 0.55;
      for (const k of [-13, 0, 13]) b.instance('cube', { x: st.x + k, y: top, z: backZ, sx: 2.2, sy: 0.45, sz: 0.5, color: 0x5a4a3a });
      // a chai-and-vada-pav stall at the end of each platform (solid)
      const sx = st.x + (side === 'north' ? 17.5 : -17.5), sz = side === 'north' ? P.z0 + 0.9 : P.z1 - 0.9;
      b.box([sx - 1.0, top, sz - 0.5], [sx + 1.0, top + 1.05, sz + 0.5], { color: 0x6a4a2e, tag: 'stall' });
      b.box([sx - 1.3, top + 2.2, sz - 0.8], [sx + 1.3, top + 2.32, sz + 0.8], { color: [0xd98a2b, 0x2f8f86, 0xb23a6a][Math.floor(rnd() * 3)], solid: false, walkable: false });
      b.box([sx - 0.1, top + 1.05, sz - 0.1], [sx + 0.1, top + 2.2, sz + 0.1], { color: 0x3a3a38, solid: false, walkable: false });
      b.instance('glow', { x: sx, y: top + 2.0, z: sz, sx: 0.5, sy: 0.18, sz: 0.5, color: 0xffc070 });
      rec.platforms[side] = { z0: P.z0, z1: P.z1, zMid, trackEdge, faceDir, top, stall: { x: sx, z: sz } };
      info.platforms.push({ station: st.id, side, x0: st.x0, x1: st.x1, z0: P.z0, z1: P.z1 });
    }
    info.stations.push(rec);
    // the keep-clear for dressing: platforms and the strips beside them
    ctx.keepClear(st.x0 - rampLen - 0.5, R.platforms.north.z0 - 0.5, st.x1 + rampLen + 0.5, R.platforms.north.z1, 0, 5);
    ctx.keepClear(st.x0 - rampLen - 0.5, R.platforms.south.z0, st.x1 + rampLen + 0.5, R.platforms.south.z1 + 0.5, 0, 5);
  }
  for (const st of [R.stations[2], R.stations[3]]) labels.add({ text: 'हार्बर लाइन  HARBOUR LINE', tone: 'metro', x: st.x + 14, y: 2.6, z: R.platforms.north.z0 + 0.04, dir: '+z', w: 3.6, h: 0.5 });

  // ---- level crossings: the fence has a gap where a N-S street crosses; booms (moved by the transit system) close it
  const cz0 = R.corridor.z0, cz1 = R.corridor.z1;
  for (const cr of R.crossings) {
    const rec = { id: cr.id, x: cr.x, w: cr.w, x0: cr.x - cr.w / 2, x1: cr.x + cr.w / 2, colliders: [], masts: [] };
    for (const side of [-1, 1]) {                                  // -1 north edge, +1 south edge
      const zf = side < 0 ? cz0 : cz1;
      const col = phys.addBox([rec.x0, 0, side < 0 ? zf - 0.2 : zf], [rec.x1, 1.4, side < 0 ? zf : zf + 0.2], { solid: true, walkable: false, tag: 'crossing-boom', userData: { crossing: cr.id } });
      phys.setEnabled(col, false);
      rec.colliders.push(col);
      for (const sx of [rec.x0, rec.x1]) {
        const mz = zf + side * 0.45;
        b.instance('cube', { x: sx, y: 0, z: mz, sx: 0.22, sy: 3.1, sz: 0.22, color: 0x2e3436 });
        b.instance('cube', { x: sx, y: 3.1, z: mz, sx: 0.8, sy: 0.4, sz: 0.3, color: 0x7a2a22 });
        rec.masts.push({ x: sx, z: mz, side });
        phys.addBox([sx - 0.11, 0, mz - 0.11], [sx + 0.11, 3.1, mz + 0.11], { solid: true, walkable: false, tag: 'crossing-mast' });
      }
      // warning plates on the mast ends, facing along the street so people see them coming
      for (const dirz of ['+z', '-z']) labels.add({ text: 'रेल क्रॉसिंग  RAIL CROSSING · STOP', tone: 'danger', x: rec.x0 + 0.0, y: 2.4, z: zf + side * 0.45 + (dirz === '+z' ? 0.17 : -0.17), dir: dirz, w: 4.2, h: 0.62 });
    }
    info.crossings.push(rec);
  }

  // ---- the fence between crossings and stations (solid, 1.4 m; posts are instances, the top rail a thin glowing bar)
  const gaps = [];
  for (const st of R.stations) gaps.push([st.x0 - rampLen - 0.5, st.x1 + rampLen + 0.5]);
  for (const c of info.crossings) gaps.push([c.x0, c.x1]);
  gaps.sort((p, q) => p[0] - q[0]);
  const segs = [];
  let cur = X0;
  for (const [a, e] of gaps) { if (a > cur + 0.3) segs.push([cur, a]); cur = Math.max(cur, e); }
  if (X1 > cur + 0.3) segs.push([cur, X1]);
  for (const [a, e] of segs) {
    for (const side of [-1, 1]) {
      const zf = side < 0 ? cz0 : cz1, z0 = side < 0 ? zf - 0.18 : zf, z1 = side < 0 ? zf : zf + 0.18;
      phys.addBox([a, 0, z0], [e, 1.4, z1], { solid: true, walkable: false, tag: 'rail-fence' });
      b.box([a, 0, z0], [e, 0.5, z1], { color: 0x59605e, solid: false, walkable: false, tag: 'rail-fence' });
      b.box([a, 1.15, z0 + 0.05], [e, 1.22, z1 - 0.05], { color: 0x6a7276, solid: false, walkable: false, tag: 'rail-fence' });
      b.box([a, 1.225, z0 + 0.07], [e, 1.235, z1 - 0.07], { mat: 'emissive', color: 0x3a3c2a, solid: false, walkable: false, noTint: true });
      for (let x = a + 0.2; x < e; x += 3.1) b.instance('cube', { x, y: 0, z: (z0 + z1) / 2, sx: 0.09, sy: 1.3, sz: 0.09, color: 0x4a5254 });
    }
    info.fences.push({ x0: a, x1: e });
  }

  // ---- the station gates in the fence at the platforms' ends are open (the platforms carry on to the pavement); nothing to build
  void dim;
  return info;
}
