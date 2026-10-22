// Story set pieces (PLAN 1b): collapse site, triage tents, Mithi's flat, hospital, police station, the
// maintenance shaft and wrecked lift, catacombs, tunnel-boring site, clinic, guard posts, the bridge
// checkpoint. Everything is deterministic dressing around the buildings from structures.buildBuildings.
import * as THREE from 'three';
import { prop, fixedRng } from './props.js';
import { TONE } from './structures.js';

const dim = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();

export function buildStory(ctx) {
  const { b, map, phys } = ctx;
  const st = map.story, rnd = fixedRng(404);
  const vis = { solid: false, walkable: false };
  const put = (kind, o, solid = true, walk = false) => prop(ctx, kind, o, { solid, walkable: walk, check: false });
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
  const rot = (x, y, z, rx, ry, rz) => { e.set(rx, ry, rz); q.setFromEuler(e); return m4.compose(p3.set(x, y, z), q, one).clone(); };
  const diya = (x, y, z, s = 0.12) => { b.instance('diya', { x, y, z, sx: s, sy: s * 1.6, sz: s, color: 0xffa040 }); ctx.diyas.push([x, y, z]); };

  // ---------------- collapse site: five fallen road decks (solid piles with a tilted slab on top), crushed shacks
  map.story.fallenDecks.forEach((d) => {
    const hx = d.w / 2, hz = d.d / 2;
    b.box([d.x - hx, 0, d.z - hz], [d.x + hx, 2.2, d.z + hz], { color: 0x5a574e, tag: 'fallen-deck', walkable: false });
    const alongX = d.w >= d.d;
    const tilt = d.tilt;
    const g = new THREE.BoxGeometry(d.w + 2, 0.9, d.d + 1.5);
    b.geometry(g, { color: 0x3c4144, matrix: rot(d.x, 2.9 + Math.abs(tilt) * 4, d.z, alongX ? 0 : tilt, 0, alongX ? tilt : 0) });
    // painted lane line and a snapped guard rail on the slab
    const line = new THREE.BoxGeometry(alongX ? d.w - 1 : 0.2, 0.05, alongX ? 0.2 : d.d - 1);
    b.geometry(line, { color: 0xb9a040, noTint: true, mat: 'emissive', matrix: rot(d.x, 3.4 + Math.abs(tilt) * 4, d.z, alongX ? 0 : tilt, 0, alongX ? tilt : 0) });
    for (let i = 0; i < 3; i++) b.geometry(new THREE.BoxGeometry(0.08, 0.08, 2.6), { color: 0x6a4a34, matrix: rot(d.x + (i - 1) * d.w * 0.3, 3.8, d.z + hz * 0.6, 0.6 + i * 0.3, i, 0.2) });
  });
  // flattened shacks at the west edge of the site
  for (let i = 0; i < 7; i++) prop(ctx, 'shack', { x: -63 + rnd() * 3, y: 0, z: -14 - i * 4.2, sx: 3 + rnd(), sy: 0.7 + rnd() * 0.4, sz: 3, color: 0x6a5a4a }, { tag: 'crushed-shack' });

  // ---------------- triage tents (white and orange tarps with red cross lamps) and the body area
  const tents = [[-61, -2], [-55, 3], [-49, -3], [-43, 2], [-37, -3], [-33, 3]];
  tents.forEach(([x, z], i) => {
    const color = i % 3 === 0 ? 0xe8e4d8 : i % 3 === 1 ? 0xd9803a : 0xdadfe0;
    prop(ctx, 'tent', { x, y: 0, z, yaw: i % 2 ? 0 : Math.PI / 2, sx: 4, sy: 2.4, sz: 5.5, color }, { tag: 'tent', check: false, solid: true });
    b.instance('glow', { x: x + (i % 2 ? 0 : 0), y: 2.5, z, sx: 0.5, sy: 0.18, sz: 0.5, color: 0xff5a4a });
    b.instance('pool', { x, y: 0.03, z: z + 3.2, sx: 8, sz: 8, color: 0x5a3a2a });
  });
  const br = st.bodyArea.rect;
  for (let i = 0; i < 9; i++) {
    const x = br.x0 + 1.2 + (i % 3) * 3.2, z = br.z0 + 1.2 + Math.floor(i / 3) * 2.4;
    b.instance('cube', { x, y: 0, z, sx: 0.6, sy: 0.28, sz: 1.8, color: 0xd8d4c4 });
    b.instance('cube', { x, y: 0.28, z: z + 0.7, sx: 0.5, sy: 0.12, sz: 0.5, color: 0xd0cabb });
  }
  for (const [x, z] of [[-60, -23], [-52, -23]]) b.instance('glow', { x, y: 1.1, z, sx: 0.25, sy: 0.25, sz: 0.25, color: 0xffa040 });   // work lamps
  b.instance('pool', { x: -58, y: 0.03, z: -18.5, sx: 11, sz: 9, color: 0x4a3a22 });

  // ---------------- Mithi's flat and the neighbour's flat
  const bed = (x, z, w, d, color = 0x8a8a7a) => { put('cube', { x, y: 0, z, sx: w, sy: 0.5, sz: d, color }, true, true); put('cube', { x, y: 0.5, z, sx: w - 0.1, sy: 0.12, sz: d - 0.1, color: 0xb8b0a0 }, false); };
  const h = st.mithiHome;
  bed(-95.2, -75.4, 2.0, 1.0, 0x6a5a4a);
  put('cube', { x: -97.1, y: 0, z: h.z, sx: 0.6, sy: 0.7, sz: 1.4, color: 0x4a4038 });                       // TV stand under the screen
  put('cube', { x: -95.6, y: 0, z: -75.5 + 0.0, sx: 0.8, sy: 0.7, sz: 0.5, color: 0x5a4a3a }, true, true);   // table
  b.instance('glow', { x: h.remote.x + 0.0, y: 0.72, z: h.remote.z, sx: 0.16, sy: 0.04, sz: 0.07, color: 0x30ff80 });   // the remote
  b.instance('glow', { x: -93.5, y: 3.0, z: -78, sx: 0.4, sy: 0.12, sz: 0.4, color: 0x9ac8ff });             // dim blue light
  b.instance('pool', { x: -94.5, y: 0.03, z: -78, sx: 8, sz: 8, color: 0x3a64b0 });
  b.geometry(new THREE.BoxGeometry(2.6, 0.5, 0.8), { color: 0x7d776a, matrix: rot(-95.7, 1.4, -81.4, 0.5, 0.3, 0.2) });   // fallen slab at the broken wall
  const nf = st.neighbourFlat;
  bed(-95.2, -87.2, 2.0, 1.0, 0x5a5a52);
  put('cube', { x: -95.2, y: 0.62, z: -87.2, sx: 0.6, sy: 0.3, sz: 1.8, color: 0xd8d4c4 }, false);           // the shrouded body
  b.instance('cube', { x: nf.jacket.x + 0.1, y: nf.jacket.y - 0.35, z: nf.jacket.z, sx: 0.1, sy: 0.75, sz: 0.55, color: 0x2a58b0 });   // blue Metro jacket on its hook
  b.instance('glow', { x: nf.jacket.x + 0.2, y: nf.jacket.y + 0.45, z: nf.jacket.z, sx: 0.05, sy: 0.1, sz: 0.12, color: 0x6aa0ff });
  b.instance('pool', { x: -96, y: 0.03, z: -86, sx: 6, sz: 6, color: 0x3a64b0 });
  diya(-92.4, 0.82, -90.3, 0.1);

  // ---------------- hospital: beds, stretchers, benches, reception, monitors, ceiling tubes, a red cross
  const H = map.buildings.find((x) => x.id === 'hospital');
  const wardBeds = [[-60, 83], [-60, 87], [-60, 91], [-56, 83.5], [-52, 83.5], [-50, 92], [-44.5, 83.5], [-39, 83.5], [-44.5, 91.5]];
  for (const [x, z] of wardBeds) bed(x, z, 0.9, 2.0, 0xaab4b0);
  // the ICU: one bed behind a window of monitors
  bed(-31.5, 90, 1.0, 2.0, 0xc4ccc8);
  for (const mx of [-33.5, -29.5]) { put('cube', { x: mx, y: 0, z: 91.5, sx: 0.6, sy: 1.3, sz: 0.5, color: 0x3a4444 }); b.instance('glow', { x: mx, y: 1.0, z: 91.22, sx: 0.4, sy: 0.3, sz: 0.04, color: 0x40ff90 }); }
  for (let i = 0; i < 6; i++) put('cube', { x: -60 + i * 5.2, y: 0, z: 76, yaw: Math.PI / 2, sx: 0.5, sy: 0.45, sz: 2.2, color: 0x6a5a4a }, true, true);    // waiting benches
  for (const x of [-53, -48]) { bed(x, 74.5, 0.8, 1.9, 0x9aa49f); put('cube', { x, y: 0.62, z: 74.5, sx: 0.6, sy: 0.3, sz: 1.5, color: 0xd8d4c4 }, false); }  // stretchers in the lobby
  put('cube', { x: -54, y: 0, z: 78.4, sx: 4, sy: 1.1, sz: 0.8, color: 0x6a766f }, true);                         // reception desk
  for (let z = 76; z < 93; z += 5) for (const x of [-57, -45, -33]) b.instance('glow', { x, y: 4.1, z, sx: 0.3, sy: 0.08, sz: 3.2, color: 0xc8ffe8 });
  for (const [x, z] of [[-45, 76], [-55, 87], [-41.5, 87], [-31.5, 87]]) b.instance('pool', { x, y: 0.03, z, sx: 10, sz: 10, color: 0x4a9a7a });
  // red cross above the entrance
  b.box([-38.9, 3.2, 71.6], [-37.7, 4.5, 71.7], { ...vis, mat: 'emissive', color: 0xff3a30, noTint: true });
  b.box([-39.5, 3.6, 71.6], [-37.1, 4.1, 71.7], { ...vis, mat: 'emissive', color: 0xff3a30, noTint: true });
  void H;

  // ---------------- police station: desks, cell benches, bars, blue lamps
  const PS = map.buildings.find((x) => x.id === 'police-station');
  put('cube', { x: 22, y: 0, z: -78.3, sx: 4, sy: 1.1, sz: 0.9, color: 0x4a5260 });
  put('cube', { x: 6, y: 0, z: -86, sx: 2, sy: 0.8, sz: 1, color: 0x4a5260 }); put('cube', { x: 26, y: 0, z: -86, sx: 3, sy: 0.8, sz: 1.2, color: 0x4a5260 });
  put('cube', { x: 12, y: 0, z: -88.2, sx: 2.4, sy: 0.45, sz: 0.7, color: 0x5a5a52 }, true, true);                 // cell bench
  for (const x of [14.55, 14.9, 15.25]) b.instance('cube', { x, y: 0, z: -81, sx: 0.05, sy: 2.8, sz: 0.05, color: 0x404848 });
  for (const x of [6, 18, 26]) b.instance('glow', { x, y: 4.1, z: -80, sx: 3, sy: 0.08, sz: 0.3, color: 0x7ab0ff });
  for (const [x, z] of [[18, -78], [15, -86], [26, -86]]) b.instance('pool', { x, y: 0.03, z, sx: 9, sz: 9, color: 0x3a6ad0 });
  b.instance('glow', { x: 18, y: 5.1, z: -75.6, sx: 0.6, sy: 0.3, sz: 0.6, color: 0x4a8aff });   // roof beacon
  void PS;

  // ---------------- maintenance shaft hut and the wrecked lift car at the bottom
  for (let i = 0; i < 6; i++) b.box([51.1 + i * 0.28, 2.5, -36.02], [51.28 + i * 0.28, 2.64, -35.9], { ...vis, mat: 'emissive', color: i % 2 ? 0x222222 : 0xd8b020, noTint: true });
  b.instance('glow', { x: 52, y: 3.62, z: -36.1, sx: 0.4, sy: 0.14, sz: 0.4, color: 0xffa040 });
  b.instance('pool', { x: 52, y: 0.03, z: -37, sx: 6, sz: 6, color: 0x7a5018 });
  const w = st.maintenanceShaft.liftWreck;
  put('cube', { x: 58.2, y: -8, z: -24.5, sx: 3.2, sy: 1.8, sz: 3.4, yaw: 0, color: 0x6a4a38 });
  b.geometry(new THREE.BoxGeometry(3.4, 0.2, 3.0), { color: 0x5a3a2a, matrix: rot(58.1, -6.0, -24.5, 0.18, 0.2, -0.25) });   // buckled roof
  for (let i = 0; i < 5; i++) b.geometry(new THREE.BoxGeometry(0.05, 3.0 + rnd() * 2, 0.05), { color: 0x2a2a2a, matrix: rot(57 + rnd() * 2.4, -6 + rnd(), -25.5 + rnd() * 2, rnd() * 0.8, rnd() * 3, rnd() * 0.8) });  // snapped cables
  for (let i = 0; i < 6; i++) put('cube', { x: 54.5 + rnd() * 6.5, y: -8, z: -27.5 + rnd() * 6, sx: 0.4 + rnd() * 0.6, sy: 0.25 + rnd() * 0.35, sz: 0.4 + rnd() * 0.6, color: 0x5a5448 }, false);
  b.instance('glow', { x: 56.3, y: -7.3, z: -22.5, sx: 0.3, sy: 0.12, sz: 0.3, color: 0xff6a30 });                // emergency lamp
  b.instance('pool', { x: w.x, y: -8 + 0.03, z: w.z, sx: 8, sz: 8, color: 0x6a3a18 });

  // ---------------- catacomb homes: mattresses, pots, niche shrines, no electric light
  const rooms = [[-107, 12], [-97.5, 12], [-88.5, 12], [-107, 32], [-97.5, 32], [-88.5, 32]];
  rooms.forEach(([x, z], i) => {
    put('cube', { x, y: -8, z: z + (i < 3 ? 2.5 : -2.5), sx: 2.0, sy: 0.22, sz: 0.9, color: [0x7a5a4a, 0x5a6a5a, 0x6a5a7a, 0x8a7a50][i % 4] }, false);
    put('cube', { x: x + 2.2, y: -8, z: z + (i < 3 ? -3 : 3), sx: 0.4, sy: 0.9, sz: 0.4, color: 0x5a4a3a });
    put('drum', { x: x - 2.2, y: -8, z: z + (i < 3 ? -3.5 : 3.5), sx: 0.7, sy: 0.7, sz: 0.7, color: 0x8a5a3a });
    diya(x - 0.4, -7.35, z + (i < 3 ? -4.8 : 4.8)); b.instance('pool', { x: x - 0.4, y: -8 + 0.03, z: z + (i < 3 ? -4.8 : 4.8), sx: 3.5, sz: 3.5, color: 0x6a3a10 });
  });
  for (let z = 6; z < 40; z += 6) if (z < 18 || z > 26) b.instance('cube', { x: -112.2, y: -3.7, z, sx: 0.1, sy: 0.12, sz: 4, color: 0x3a3a38 });

  // ---------------- tunnel-boring machine site: the machine, its cutter head, child-labour cages, a foreman cabin
  const tb = st.boringSite;
  const cyl = new THREE.CylinderGeometry(2.6, 2.6, 16, 18); cyl.rotateZ(Math.PI / 2);
  b.geometry(cyl, { color: 0x9a8a38, matrix: rot(-79, -5.1, -55, 0, 0, 0), noTint: false });
  phys.addBox([-87, -8, -57.6], [-71, -2.4, -52.4], { solid: true, walkable: false, tag: 'tbm' });
  const head = new THREE.CylinderGeometry(3.1, 3.1, 0.9, 18); head.rotateZ(Math.PI / 2);
  b.geometry(head, { color: 0x6a6a68, matrix: rot(-87.6, -5.1, -55, 0, 0, 0) });
  phys.addBox([-88.5, -8, -58.1], [-87, -2.0, -51.9], { solid: true, walkable: false, tag: 'tbm' });
  for (let i = 0; i < 8; i++) b.geometry(new THREE.BoxGeometry(0.2, 0.25, 6.0), { color: 0xffa040, mat: 'emissive', noTint: true, matrix: rot(-88.15, -5.1, -55, (i / 8) * Math.PI, 0, 0) });
  b.box([-71, -8, -56], [-60, -6.9, -54], { color: 0x4a4a48, tag: 'conveyor', walkable: true });        // spoil conveyor (steppable height 1.1? low enough to jump)
  // concrete tunnel segments stacked like rings
  for (let i = 0; i < 4; i++) { const g = new THREE.CylinderGeometry(1.7, 1.7, 0.6, 14, 1, true); g.rotateX(Math.PI / 2); b.geometry(g, { color: 0x8a8a82, matrix: rot(-70 + i * 0.7, -6.3, -48, 0, 0, 0) }); }
  // cages along the north wall
  for (let k = 0; k < 3; k++) {
    const cx = tb.cages.x + k * 3.6, cz = tb.cages.z;
    for (let i = 0; i < 9; i++) for (const sz of [-1.2, 1.2]) b.instance('cube', { x: cx - 1.2 + i * 0.3, y: -8, z: cz + sz, sx: 0.05, sy: 2.2, sz: 0.05, color: 0x4a4a46 });
    for (let i = 0; i < 7; i++) for (const sx of [-1.2, 1.2]) b.instance('cube', { x: cx + sx, y: -8, z: cz - 1.0 + i * 0.3, sx: 0.05, sy: 2.2, sz: 0.05, color: 0x4a4a46 });
    b.box([cx - 1.25, -5.8, cz - 1.25], [cx + 1.25, -5.7, cz + 1.25], { color: 0x4a4a46, ...vis });
    for (const [dx, dz, w2, d2] of [[-1.2, 0, 0.12, 2.4], [1.2, 0, 0.12, 2.4], [0, -1.2, 2.4, 0.12], [0, 1.2, 2.4, 0.12]]) phys.addBox([cx + dx - w2 / 2, -8, cz + dz - d2 / 2], [cx + dx + w2 / 2, -5.8, cz + dz + d2 / 2], { solid: true, walkable: false, tag: 'cage', userData: { rail: true } });
    put('cube', { x: cx, y: -8, z: cz + 0.4, sx: 1.4, sy: 0.18, sz: 0.6, color: 0x7a6a50 }, false);
    b.instance('glow', { x: cx, y: -5.7, z: cz, sx: 0.25, sy: 0.12, sz: 0.25, color: 0xffa040 });
  }
  put('cube', { x: -64.5, y: -8, z: -61.5, sx: 3, sy: 3, sz: 3, color: 0x6a6a58 });
  b.instance('glow', { x: -64.5, y: -6.2, z: -59.97, sx: 1.6, sy: 0.7, sz: 0.05, color: 0xffd890 });
  for (const [x, z] of [[-90, -50], [-72, -50], [-66, -52], [-84, -62], [-76, -60]]) { b.instance('glow', { x, y: -3.4, z, sx: 0.5, sy: 0.3, sz: 0.5, color: 0xff9a30 }); b.instance('pool', { x, y: -8 + 0.03, z, sx: 11, sz: 11, color: 0x7a5018 }); }
  b.instance('pool', { x: -79, y: -8 + 0.03, z: -55, sx: 14, sz: 12, color: 0x5a3a14 });

  // ---------------- underground clinic
  const cl = st.clinic;
  for (const [x, z] of [[-27, 74], [-27, 79], [-27, 82], [-16, 74.5]]) { bed(x, z, 0.9, 2.0, 0xb8c0bc); }
  put('cube', { x: -16.5, y: -8, z: 80, sx: 0.5, sy: 2.0, sz: 3.4, color: 0x5a5a50 });                          // medicine shelves
  for (let i = 0; i < 6; i++) b.instance('glow', { x: -16.2, y: -7 + (i % 3) * 0.55, z: 78.6 + (i >> 1) * 0.9, sx: 0.12, sy: 0.3, sz: 0.12, color: [0x40ff90, 0xff4aa0, 0x60b0ff][i % 3] });
  b.instance('glow', { x: -27, y: -5.2, z: 76.5, sx: 1.1, sy: 0.2, sz: 1.1, color: 0xf0fff8 });                  // surgical lamp
  b.instance('pool', { x: -27, y: -8 + 0.03, z: 76.5, sx: 9, sz: 9, color: 0x4a7a6a });
  b.instance('pool', { x: -17, y: -8 + 0.03, z: 77.5, sx: 8, sz: 8, color: 0x4a9a7a });
  b.box([-20.4, -5.9, 70.5], [-19.6, -4.7, 70.62], { ...vis, mat: 'emissive', color: 0xff3a30, noTint: true });
  b.box([-20.7, -5.5, 70.5], [-19.3, -5.1, 70.62], { ...vis, mat: 'emissive', color: 0xff3a30, noTint: true });
  void cl;

  // ---------------- metro: guard booths and posts, shutter frames
  for (const g of map.metroGuardPosts) {
    if (g.level === 'G') {
      put('cube', { x: g.x, y: g.y, z: g.z, sx: 1.6, sy: 2.4, sz: 1.6, color: 0x4a5a70 });
      b.instance('glow', { x: g.x, y: g.y + 2.4, z: g.z, sx: 0.5, sy: 0.25, sz: 0.5, color: 0xffa040 });
      b.instance('glow', { x: g.x + (g.yaw > 0 ? -0.82 : 0.82), y: g.y + 1.4, z: g.z, sx: 0.04, sy: 0.6, sz: 1.0, color: 0x7ab0ff });
    } else {
      put('cube', { x: g.x, y: g.y, z: g.z, sx: 2.0, sy: 1.0, sz: 0.9, color: 0x4a5260 });
      b.instance('glow', { x: g.x, y: g.y + 1.3, z: g.z, sx: 0.3, sy: 0.15, sz: 0.3, color: 0x7ab0ff });
    }
  }
  // ---------------- Sunrise Bridge checkpoint: gantry, booths, barrier arms (visual)
  const bc = st.bridgeCheckpoint;
  for (const z of [-36.2, -23.8]) {
    put('cube', { x: 158.5, y: 38, z, sx: 2, sy: 2.6, sz: 1.6, color: 0x56627a });
    b.instance('glow', { x: 158.5, y: 40.6, z, sx: 0.5, sy: 0.3, sz: 0.5, color: 0x4a8aff });
  }
  b.box([156.8, 43.4, -37], [157.4, 44.2, -23], { color: 0x3a4448, tag: 'gantry', walkable: false });
  for (const z of [-36.8, -23.2]) b.box([156.8, 38, z - 0.3], [157.4, 43.4, z + 0.3], { color: 0x3a4448, tag: 'gantry-post', walkable: false });
  b.box([157.0, 39.0, -36], [157.1, 39.2, -24], { ...vis, mat: 'emissive', color: 0xff4a36, noTint: true });   // the (raised) barrier bar, glowing
  b.instance('glow', { x: 157.2, y: 43.2, z: -30, sx: 0.4, sy: 0.2, sz: 0.4, color: 0xff2a2a });                 // camera dome light
  // piles under the permit pier
  for (let x = 162; x <= 174; x += 6) for (const z of [-43.5, -34.5]) b.box([x - 0.3, -6, z - 0.3], [x + 0.3, -0.8, z + 0.3], { color: 0x4a4a42, ...vis });
  b.instance('pool', { x: 170, y: 0.03, z: -39, sx: 8, sz: 8, color: 0x7a5018 });
}
