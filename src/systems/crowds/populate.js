// Where the people and the traffic are: lanes along the pavements, platforms, slum alleys and bazaar aisles; queues and clusters at the
// station doors, the collapse, the hospital and the Metro; sleepers; and the traffic lanes on the streets and the flyovers.
// Everything is placed from a private generator (`game.rng.fork('crowds')`), so a seed gives the same city of people every run.
import { VEHICLES } from './vehicles.js';
import { LAYOUT } from '../transit/train-model.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function populate(sys) {
  const game = sys.game, map = game.world.map, R = map.rail, rng = sys.rng, A = sys.agents;
  const hubs = [
    [-44, -30, 62, 0.55], [-45, 75, 44, 0.45], [45, 0, 40, 0.4], [45, 54, 30, 0.4], [15, -30, 45, 0.3], [-105, -85, 38, 0.6], [-105, 85, 38, 0.6], [-75, 0, 36, 0.3],
    ...R.stations.map((s) => [s.x, -60, 42, 0.45]),
  ];
  const weight = (x, z) => { let w = 0.22; for (const [hx, hz, r, k] of hubs) { const d = Math.hypot(x - hx, z - hz); if (d < r) w += k * (1 - d / r); } return clamp(w, 0.1, 1); };

  // -------------------------------------------------------------------------------- lanes
  const addLane = (ax, az, bx, bz, y, level, o = {}) => {
    const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
    const L = { ax, az, bx, bz, len, ux, uz, px: -uz, pz: ux, y, level, ...o };
    sys.lanes.push(L); return L;
  };
  const walker = (L, s, dir, o = {}) => {
    const woman = o.woman ?? rng.next() < 0.42, kid = o.kid ?? rng.next() < 0.1;
    const lat0 = (o.lat ?? 0) + (rng.next() - 0.5) * (o.spread ?? 1.0);
    const a = {
      mode: 'lane', lane: L, s, dir, speed: (kid ? 1.7 : 0.95 + rng.next() * 0.65) * (o.speedMul ?? 1), lat: lat0, lat0, woman, kid, rich: !!o.rich,
      phase: rng.next() * 6.28, amp: 1, level: L.level, x: 0, y: L.y, z: 0, yaw: 0, pose: 0, umbrellaChance: o.umbrella ?? 0.6, worker: !!o.worker && !woman && !kid,
    };
    sys.look(a, { woman, kid, rich: o.rich, worker: a.worker, umbrella: o.umbrella ?? 0.6 });
    a.x = L.ax + L.ux * s + L.px * lat0; a.z = L.az + L.uz * s + L.pz * lat0;
    A.push(a);
    return a;
  };
  const stander = (x, y, z, yaw, level, o = {}) => {
    const woman = o.woman ?? rng.next() < 0.42, kid = o.kid ?? rng.next() < 0.08;
    const a = {
      mode: o.mode ?? 'stand', woman, kid, rich: !!o.rich, x, y, z, yaw, level, phase: rng.next() * 6.28, amp: o.amp ?? 0.05, pose: o.pose ?? 0,
      home: { x, y, z, yaw }, station: o.station, platformSide: o.side, umbrellaChance: o.umbrella ?? 0.5,
      worker: !!o.worker && !woman && !kid, mood: o.mood ?? 'neutral', talk: o.talk ?? (rng.next() < 0.16),
    };
    sys.look(a, { woman, kid, rich: o.rich, worker: a.worker, umbrella: o.umbrella ?? 0.5 });
    A.push(a);
    return a;
  };
  const faceTo = (x, z, tx, tz) => Math.atan2(-(tx - x), -(tz - z));

  // -------------------------------------------------------------------------------- pavements of the ground-level streets
  for (const st of map.streets) {
    if (st.axis === 'z') {                                   // N-S streets: both pavements, full length (they cross the line at its crossing)
      for (const side of [-1, 1]) {
        const x = st.c + side * 9.1;
        const L = addLane(x, -164, x, 104, 0, 'G');
        L.stops = [{ id: `crossing-${st.id}`, dir: 1, s: (R.corridor.z0 - 0.9) - L.az }, { id: `crossing-${st.id}`, dir: -1, s: (R.corridor.z1 + 0.9) - L.az }];
        const n = Math.round(L.len / 6.5);
        for (let i = 0; i < n; i++) {
          const s = (i + rng.next()) * L.len / n, z = L.az + s;
          if (z > R.corridor.z0 - 3 && z < R.corridor.z1 + 3) continue;
          if (rng.next() > weight(x, z) * 1.25) continue;
          walker(L, s, rng.next() < 0.5 ? 1 : -1, { spread: 1.2 });
        }
      }
    } else if (st.id === 'sz1') {                            // the Harbour Line street: pavements are the station platforms, outside the fence
      for (const z of [-67.8, -52.2]) {
        const L = addLane(-131, z, 152, z, 0, 'G', { station: true });
        const n = Math.round(L.len / 7);
        for (let i = 0; i < n; i++) { const s = (i + rng.next()) * L.len / n; if (rng.next() > weight(L.ax + s, z) * 1.3) continue; walker(L, s, rng.next() < 0.5 ? 1 : -1, { spread: 1.1 }); }
      }
    } else {
      for (const side of [-1, 1]) {
        const z = st.c + side * 9.1;
        const L = addLane(-122, z, 152, z, 0, 'G');
        const n = Math.round(L.len / 6.5);
        for (let i = 0; i < n; i++) { const s = (i + rng.next()) * L.len / n; if (rng.next() > weight(L.ax + s, z) * 1.25) continue; walker(L, s, rng.next() < 0.5 ? 1 : -1, { spread: 1.2 }); }
      }
    }
  }
  // the south promenade (the Mithi River steps): a slow evening-stroll crowd
  { const L = addLane(-135, 134, 150, 134, 0, 'G'); for (let i = 0; i < 26; i++) walker(L, rng.next() * L.len, rng.next() < 0.5 ? 1 : -1, { speedMul: 0.7, spread: 4, umbrella: 0.4 }); }
  // the west quay (Mahim Bay shore)
  { const L = addLane(-133, -160, -133, 100, 0, 'G'); for (let i = 0; i < 16; i++) walker(L, rng.next() * L.len, rng.next() < 0.5 ? 1 : -1, { speedMul: 0.8, spread: 3, umbrella: 0.4 }); }

  // -------------------------------------------------------------------------------- Dharavi: the lanes between the shacks, kids everywhere
  for (const [z0, z1] of [[-97, -72], [72, 97]]) {
    for (const x of [-121, -113, -105, -97, -89]) {
      if (z0 < 0 && x > -100 && x < -85) continue;                   // the two flats stand there
      const L = addLane(x, z0, x, z1, 0, 'G');
      for (let i = 0; i < 4; i++) walker(L, rng.next() * L.len, rng.next() < 0.5 ? 1 : -1, { speedMul: 0.75, spread: 0.8, umbrella: 0.35, kid: rng.next() < 0.3 });
    }
    for (const z of [z0 + 5, (z0 + z1) / 2, z1 - 5]) {
      const L = addLane(-123, z, -87, z, 0, 'G');
      for (let i = 0; i < 3; i++) walker(L, rng.next() * L.len, rng.next() < 0.5 ? 1 : -1, { speedMul: 0.75, spread: 0.8, umbrella: 0.35 });
    }
  }
  // the potters' lane: groups sitting and kneeling at their wheels (standing here; seated ones along the wall)
  for (let i = 0; i < 14; i++) stander(-120 + rng.next() * 32, 0, 76 + rng.next() * 18, rng.next() * 6.28, 'G', { umbrella: 0.2, pose: rng.next() < 0.4 ? 1 : 0 });
  for (let i = 0; i < 12; i++) stander(-122 + rng.next() * 34, 0, -96 + rng.next() * 22, rng.next() * 6.28, 'G', { umbrella: 0.2, pose: rng.next() < 0.3 ? 1 : 0 });

  // -------------------------------------------------------------------------------- Sion Junction: the rescue crowd
  for (let i = 0; i < 38; i++) {
    const a = rng.next() * 6.28, r = 13 + rng.next() * 12, x = -44 + Math.cos(a) * r * 1.2, z = -30 + Math.sin(a) * r * 0.75;
    if (Math.abs(x + 44) < 3 && Math.abs(z + 30) < 3) continue;
    stander(x, 0, z, faceTo(x, z, -44, -30), 'G', { umbrella: 0.35, amp: 0.1, worker: rng.next() < 0.42, mood: 'worry' });
  }
  for (const z of [-48, -13]) { const L = addLane(-66, z, -27, z, 0, 'G'); for (let i = 0; i < 6; i++) walker(L, rng.next() * L.len, rng.next() < 0.5 ? 1 : -1, { speedMul: 1.25, spread: 1.5, umbrella: 0.3, worker: rng.next() < 0.45 }); }
  for (const x of [-67, -25]) { const L = addLane(x, -46, x, -14, 0, 'G'); for (let i = 0; i < 5; i++) walker(L, rng.next() * L.len, rng.next() < 0.5 ? 1 : -1, { speedMul: 1.25, spread: 1.5, umbrella: 0.3, worker: rng.next() < 0.45 }); }
  // the triage tents
  for (let i = 0; i < 16; i++) { const x = -62 + rng.next() * 30, z = -8 + rng.next() * 13; stander(x, 0, z, rng.next() * 6.28, 'G', { umbrella: 0.2, worker: rng.next() < 0.4, mood: 'worry' }); }

  // -------------------------------------------------------------------------------- the hospital queue, the Metro entrances, the police station
  for (let i = 0; i < 16; i++) stander(-52 + i * 0.9 + (rng.next() - 0.5) * 0.3, 0, 67 + (i % 3) * 0.7 + rng.next() * 0.5, Math.PI, 'G', { umbrella: 0.6, mood: 'worry', talk: false });
  for (const [x, z] of [[45, -3.5], [45, 52.5]]) for (let i = 0; i < 12; i++) stander(x - 5 + rng.next() * 10, 0, z + (z < 0 ? 1 : -1) * rng.next() * 3, rng.next() * 6.28, 'G', { umbrella: 0.6 });
  for (let i = 0; i < 8; i++) stander(10 + rng.next() * 16, 0, -73 - rng.next() * 3, Math.PI * (rng.next() < 0.5 ? 1 : 0), 'G', { umbrella: 0.5 });
  // a chai stall and its regulars at a few street corners
  for (const [x, z] of [[-70, 12], [-20, 12], [40, 12], [100, 12], [-70, -12], [100, -112], [-20, 66], [40, 66]]) {
    for (let k = 0; k < 5; k++) { const a = k * 1.256 + rng.next() * 0.4; stander(x + Math.cos(a) * 1.6, 0, z + Math.sin(a) * 1.6, a + Math.PI, 'G', { umbrella: 0.35, talk: k % 2 === 0 }); }
  }

  // -------------------------------------------------------------------------------- the stations: people waiting along the platforms, hawkers, someone asleep on a bench
  for (const st of R.stations) for (const side of ['north', 'south']) {
    const P = R.platforms[side], edge = side === 'north' ? P.z1 : P.z0, sgn = side === 'north' ? -1 : 1, face = side === 'north' ? Math.PI : 0;
    for (const dx of LAYOUT.doors) {
      const n = 2 + Math.floor(rng.next() * 3);
      for (let k = 0; k < n; k++) stander(st.x + dx + (rng.next() - 0.5) * 1.7, 0.5, edge + sgn * (0.9 + rng.next() * 2.0), face + (rng.next() - 0.5) * 0.6, 'G', { station: st.id, side, umbrella: 0.1, amp: 0.05 });
    }
    const backZ = side === 'north' ? P.z0 + 0.55 : P.z1 - 0.55;
    for (const k of [-13, 0, 13]) for (let j = 0; j < 3; j++) if (rng.next() < 0.7) stander(st.x + k + (j - 1) * 0.62, 0.5, backZ, face, 'G', { pose: 1, umbrella: 0, amp: 0.02 });
    const sx = st.x + (side === 'north' ? 17.5 : -17.5), sz = side === 'north' ? P.z0 + 0.9 : P.z1 - 0.9;
    for (let j = 0; j < 4; j++) stander(sx + (j - 1.5) * 0.7, 0.5, sz + (side === 'north' ? 1.1 : -1.1), face, 'G', { umbrella: 0.0 });
    const L = addLane(st.x0 + 1.5, (P.z0 + P.z1) / 2 + (side === 'north' ? 0.4 : -0.4), st.x1 - 1.5, (P.z0 + P.z1) / 2 + (side === 'north' ? 0.4 : -0.4), 0.5, 'G');
    for (let i = 0; i < 3; i++) walker(L, rng.next() * L.len, rng.next() < 0.5 ? 1 : -1, { speedMul: 0.85, spread: 0.6, umbrella: 0.1 });
  }

  // -------------------------------------------------------------------------------- L1: the bazaar, the skywalks, the terraces
  const aisles = [-40.25, -32.75, -25.25, -17.75];
  for (const z of aisles) { const L = addLane(2.5, z, 33, z, 12, 'L1'); for (let i = 0; i < 9; i++) walker(L, rng.next() * L.len, rng.next() < 0.5 ? 1 : -1, { speedMul: 0.75, spread: 1.2, umbrella: 0.12 }); }
  for (const x of [4.5, 16, 28]) { const L = addLane(x, -46, x, -12, 12, 'L1'); for (let i = 0; i < 4; i++) walker(L, rng.next() * L.len, rng.next() < 0.5 ? 1 : -1, { speedMul: 0.75, spread: 0.9, umbrella: 0.12 }); }
  for (let i = 0; i < 26; i++) { const x = 4 + rng.next() * 28, z = -45 + rng.next() * 32; stander(x, 12, z, rng.next() * 6.28, 'L1', { umbrella: 0.1 }); }
  for (const [x0, z0, x1, z1] of [[15, -10, 15, 10], [-85, 20, -5, 20], [35, 30, 55, 30], [-105, -10, -105, 10]]) { const L = addLane(x0, z0, x1, z1, 12, 'L1'); for (let i = 0; i < Math.max(4, Math.round(L.len / 6)); i++) walker(L, rng.next() * L.len, rng.next() < 0.5 ? 1 : -1, { speedMul: 0.95, spread: 1.4, umbrella: 0.2 }); }
  for (const [x0, z0, x1, z1] of [[58, 14, 92, 14], [58, 46, 92, 46], [-120, -45, -90, -45], [-120, 45, -90, 45], [0, 14, 30, 14], [0, 46, 30, 46]]) { const L = addLane(x0, z0, x1, z1, 12, 'L1'); for (let i = 0; i < 4; i++) walker(L, rng.next() * L.len, rng.next() < 0.5 ? 1 : -1, { speedMul: 0.9, spread: 1.6, umbrella: 0.2 }); }

  // -------------------------------------------------------------------------------- L2: a few on the flyover edges (you are not meant to be there)
  for (const [x0, z0, x1, z1] of [[-130, -64.6, 150, -64.6], [-130, -55.4, 150, -55.4], [-16.6, -160, -16.6, -70], [-13.4, -50, -13.4, 38]]) {
    const L = addLane(x0, z0, x1, z1, 24, 'L2'); for (let i = 0; i < 5; i++) walker(L, rng.next() * L.len, rng.next() < 0.5 ? 1 : -1, { speedMul: 1.15, spread: 0.3, umbrella: 0.0 });
  }
  // -------------------------------------------------------------------------------- L3: the well-dressed, strolling the gardens
  for (const g of map.gardens) {
    const L1 = addLane(g.x0 + 3, g.z0 + 3, g.x1 - 3, g.z0 + 3, 38, 'L3'), L2 = addLane(g.x0 + 3, g.z1 - 3, g.x1 - 3, g.z1 - 3, 38, 'L3'), L3 = addLane(g.x0 + 3, g.z0 + 3, g.x0 + 3, g.z1 - 3, 38, 'L3');
    for (const L of [L1, L2, L3]) for (let i = 0; i < 3; i++) walker(L, rng.next() * L.len, rng.next() < 0.5 ? 1 : -1, { rich: true, speedMul: 0.7, umbrella: 0, woman: rng.next() < 0.5, spread: 1.2 });
    for (let i = 0; i < 4; i++) stander(g.x0 + 8 + rng.next() * (g.x1 - g.x0 - 16), 38, g.z0 + 8 + rng.next() * (g.z1 - g.z0 - 16), rng.next() * 6.28, 'L3', { rich: true, umbrella: 0 });
    { /* a couple talking under the trees */ const cx = g.x0 + 10 + rng.next() * (g.x1 - g.x0 - 20), cz = g.z0 + 10 + rng.next() * (g.z1 - g.z0 - 20); for (let k = 0; k < 3; k++) { const a = k * 2.1 + 0.4; stander(cx + Math.cos(a) * 0.9, 38, cz + Math.sin(a) * 0.9, a + Math.PI, 'L3', { rich: true, umbrella: 0, talk: k !== 1, mood: 'smile' }); } }
  }
  { const L = addLane(156, -30, 202, -30, 38, 'L3'); for (let i = 0; i < 4; i++) walker(L, rng.next() * L.len, rng.next() < 0.5 ? 1 : -1, { rich: true, speedMul: 0.7, umbrella: 0, spread: 3 }); }

  // -------------------------------------------------------------------------------- the ones asleep (a lying person: no walk, head along the yaw direction)
  const sleepers = [[-110, -96, 0.4], [-122, -76, 1.2], [-108, 90, 2.4], [-60, 121, 0], [12, 121, 3.1], [92, 121, 1.6], [-54, 69, 0.2], [37, -8, 1.5], [-30, 36, 2.8], [-95, 28, 0], [136, -52.8, 1.57], [-107, -68.4, 4.7], [76, -52.0, 1.57], [-46, -69.2, 1.57], [104, -137, 0], [-70, -124, 3], [62, 40, 0.3], [-20, 100, 1]];
  for (const [x, z, yaw] of sleepers) {
    const onPlatform = R.stations.some((st) => x > st.x0 && x < st.x1 && (z < -65.4 || z > -54.6) && z > -70 && z < -50);
    const a = stander(x, onPlatform ? 0.5 : 0, z, yaw, 'G', { mode: 'sleep', amp: 0, umbrella: 0 }); a.flags &= ~1;
  }
  // 5 rickshaw drivers dozing in their autos at the Metro forecourt are in the traffic lanes below
  void VEHICLES;
}

// ------------------------------------------------------------------------------------------------- traffic
export function buildVehicleLanes(sys) {
  const game = sys.game, map = game.world.map, R = map.rail, rng = sys.rng;
  const addLane = (ax, az, bx, bz, y, level, o = {}) => {
    const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len;
    const L = { ax, az, bx, bz, len, ux, uz, px: -uz, pz: ux, y, level, lat: 0, vehicles: [], phase: rng.next() * 6, jam: o.jam ?? 0.25, buses: o.buses ?? true, ...o };
    sys.vlanes.push(L);
    const spacing = o.spacing ?? 17;
    const n = Math.floor(len / spacing);
    for (let i = 0; i < n; i++) {
      if (rng.next() < 0.18) continue;
      const v = { s: (i + rng.next() * 0.6) * spacing, v: 0, level, x: 0, y, z: 0, honk: -9 };
      sys._rerollVehicle(v, L); v.v = v.vmax * 0.3;
      v.x = L.ax + L.ux * v.s; v.z = L.az + L.uz * v.s;
      L.vehicles.push(v); sys.vehicles.push(v);
    }
    return L;
  };
  for (const st of map.streets) {
    if (st.axis === 'z') {
      const sd = st.id;
      const south = addLane(st.c - 1.5, -164, st.c - 1.5, 104, 0, 'G', { spacing: 21 });         // going south
      south.stops = [{ id: `crossing-${sd}`, s: (R.corridor.z0 - 1.0) - south.az }];
      const north = addLane(st.c + 1.5, 104, st.c + 1.5, -164, 0, 'G', { spacing: 21 });         // going north
      north.stops = [{ id: `crossing-${sd}`, s: north.az - (R.corridor.z1 + 1.0) }];
    } else if (st.id !== 'sz1') {
      addLane(-122, st.c - 1.5, 152, st.c - 1.5, 0, 'G', { spacing: 20 });
      addLane(152, st.c + 1.5, -122, st.c + 1.5, 0, 'G', { spacing: 20 });
    }
  }
  // the flyovers: slow, heavy, lit traffic (the static cars on the decks were taken out for these)
  addLane(-133, -62.8, 155, -62.8, 24, 'L2', { spacing: 15, jam: 0.35 });
  addLane(155, -57.2, -133, -57.2, 24, 'L2', { spacing: 15, jam: 0.35 });
  addLane(-17.8, -164, -17.8, -67, 24, 'L2', { spacing: 16, jam: 0.35 });
  addLane(-12.2, -67, -12.2, -164, 24, 'L2', { spacing: 16, jam: 0.35 });
  addLane(-17.8, -53, -17.8, 40, 24, 'L2', { spacing: 16, jam: 0.35 });
  addLane(-12.2, 40, -12.2, -53, 24, 'L2', { spacing: 16, jam: 0.35 });
  // the promenade
  addLane(-135, 129.5, 150, 129.5, 0, 'G', { spacing: 26, jam: 0.2 });
  addLane(150, 126.5, -135, 126.5, 0, 'G', { spacing: 26, jam: 0.2 });
}
