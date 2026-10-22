// The fixed city of Grahan as DATA. Identical every run (the generated dressing below uses its own
// fixed-seed generator, never game.rng). Units are metres, +Y up, +X EAST (the Sunrise Bridge side),
// -Z north, +Z south. The sea lies to the WEST (x < -140) and SOUTH (z > 145); the Sunrise Bridge
// leaves the east side of the Upper Decks at x = 155 and runs out over the water to x = 215.
//
// Walking surfaces: U -8, G 0, L1 12, L2 24, L3 38.
//
// Plan of the district grid (columns c0..c4 west to east, rows r0..r4 north to south):
//   column spans x: c0 [-125,-85]  c1 [-65,-25]  c2 [-5,35]  c3 [55,95]  c4 [115,155]
//   row spans    z: r0 [-170,-130] r1 [-110,-70] r2 [-50,-10] r3 [10,50]  r4 [70,110]
//   N-S streets x: -75, -15, 45, 105 (20 m wide)   E-W streets z: -120, -60, 0, 60 (20 m wide)
//
//   r0  towers all along the north wall
//   r1  slum W   | clover yard | clover yard | Garden Terrace (L3) | Sunrise Heights (L3, Control Tower)
//   r2  terrace  | COLLAPSE    | BAZAAR (L1) | Skyline Terrace(L3) | Dawn Terrace (L3) -> Sunrise Bridge
//   r3  terrace  | DEAD TREE   | terrace B   | terrace C           | tower
//   r4  slum S   | tram depot  | tower       | construction site   | tower
//   L2: flyover H along z=-60 (x -135..157), flyover V along x=-15 (z -166..42), cloverleaf at (-15,-60)
//   U : metro station under x 27..63 (z -46..80), service tunnels, breach chamber far west (-138..-98)

export const Y = Object.freeze({ U: -8, G: 0, L1: 12, L2: 24, L3: 38 });

function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const R = lcg(2049);
const rr = (a, b) => a + (b - a) * R();
const rect = (x0, z0, x1, z1) => ({ x0, z0, x1, z1 });

// ------------------------------------------------------------------------------------ bounds
const bounds = { minX: -182, maxX: 222, minZ: -182, maxZ: 182 };
const land = { minX: -140, maxX: 160, minZ: -170, maxZ: 145 };   // ground (G) land; sea beyond W, S, E

// ------------------------------------------------------------------------------------ spawn
// The story begins in the rubble field of the collapsed walkway, looking east along the broken skywalk.
const spawn = { x: -44, y: 0, z: -30, yaw: -Math.PI / 2 };

// ------------------------------------------------------------------------------------ buildings
// `roof` makes the top a walkable rooftop at that height (kind: terrace/garden). Tall towers are solid
// blocks that carry the window grids and block the sun.
const towers = [
  // north wall of towers (row r0) and the world edge behind them
  { id: 'tw-n0', x0: -125, z0: -170, x1: -85, z1: -130, h: 105, color: 0x4e5f66, name: 'Palm Court Tower' },
  { id: 'tw-n1', x0: -65, z0: -170, x1: -25, z1: -130, h: 140, color: 0x5a5a52, name: 'Meridian' },
  { id: 'tw-n2', x0: -5, z0: -170, x1: 35, z1: -130, h: 96, color: 0x6a5f50, name: 'Orchid Heights' },
  { id: 'tw-n3', x0: 55, z0: -170, x1: 95, z1: -130, h: 132, color: 0x4a5a60, name: 'Solaris One', glass: [44, 62] },
  { id: 'tw-n4', x0: 115, z0: -170, x1: 155, z1: -130, h: 118, color: 0x5d6256, name: 'Aurum', glass: [44, 62] },
  { id: 'wall-n', x0: -142, z0: -182, x1: 222, z1: -170, h: 92, color: 0x44525a, name: 'North Wall' },
  // strips that close the open cells on their north/south sides
  { id: 'tw-slum-n', x0: -125, z0: -110, x1: -85, z1: -98, h: 70, color: 0x5c5648 },
  { id: 'tw-clover-w', x0: -65, z0: -110, x1: -25, z1: -98, h: 82, color: 0x4e5f66 },
  { id: 'tw-clover-e', x0: -5, z0: -110, x1: 35, z1: -98, h: 64, color: 0x6d5f52 },
  { id: 'tw-depot-s', x0: -65, z0: 98, x1: -25, z1: 110, h: 72, color: 0x4a5560 },
  { id: 'tw-slum-s', x0: -125, z0: 98, x1: -85, z1: 110, h: 60, color: 0x5c5648 },
  // west terraces (L1) with towers rising from them
  { id: 'pod-w2', x0: -125, z0: -50, x1: -85, z1: -10, h: 12, color: 0x6a6658, roof: { kind: 'terrace' }, name: 'West Terrace' },
  { id: 'tw-w2', x0: -125, z0: -50, x1: -103, z1: -10, y0: 12, h: 100, color: 0x536168 },
  { id: 'pod-w3', x0: -125, z0: 10, x1: -85, z1: 50, h: 12, color: 0x665f52, roof: { kind: 'terrace' }, name: 'West Terrace South' },
  { id: 'tw-w3', x0: -125, z0: 10, x1: -103, z1: 50, y0: 12, h: 88, color: 0x4f5a60 },
  // bazaar and the other L1 terraces
  { id: 'bazaar', x0: -5, z0: -50, x1: 35, z1: -10, h: 12, color: 0x7a6650, roof: { kind: 'terrace' }, style: 'market', name: 'Bazaar' },
  { id: 'tw-bz', x0: 24, z0: -50, x1: 35, z1: -36, y0: 12, h: 70, color: 0x5d5a52 },
  { id: 'terr-b', x0: -5, z0: 10, x1: 35, z1: 50, h: 12, color: 0x6a6658, roof: { kind: 'terrace' }, name: 'Terrace B' },
  { id: 'tw-b', x0: 20, z0: 36, x1: 35, z1: 50, y0: 12, h: 75, color: 0x4e5f66 },
  { id: 'terr-c', x0: 55, z0: 10, x1: 95, z1: 50, h: 12, color: 0x6a6252, roof: { kind: 'terrace' }, name: 'Terrace C' },
  { id: 'tw-c', x0: 80, z0: 10, x1: 95, z1: 24, y0: 12, h: 70, color: 0x5a5a52 },
  // Upper Decks (L3): four podium roofs at 38 m joined by bridges
  { id: 'pod-3-1', x0: 55, z0: -110, x1: 95, z1: -70, h: 38, color: 0x65604f, roof: { kind: 'garden' }, name: 'Garden Terrace' },
  { id: 'pod-4-1', x0: 115, z0: -110, x1: 155, z1: -70, h: 38, color: 0x5f6454, roof: { kind: 'garden' }, name: 'Sunrise Heights' },
  { id: 'pod-3-2', x0: 55, z0: -50, x1: 95, z1: -10, h: 38, color: 0x68604f, roof: { kind: 'garden' }, name: 'Skyline Terrace' },
  { id: 'pod-4-2', x0: 115, z0: -50, x1: 155, z1: -10, h: 38, color: 0x625e50, roof: { kind: 'garden' }, name: 'Dawn Terrace' },
  { id: 'tw-control', x0: 134, z0: -104, x1: 150, z1: -92, y0: 38, h: 140, color: 0x8a8f90, style: 'control', name: 'Control Tower', glass: [62, 84] },
  // remaining towers
  { id: 'tw-e3', x0: 115, z0: 10, x1: 155, z1: 50, h: 124, color: 0x585c52, name: 'Harbour Crown', glass: [46, 60] },
  { id: 'tw-s2', x0: -5, z0: 70, x1: 35, z1: 110, h: 100, color: 0x4e5a5e, name: 'Lotus Court' },
  { id: 'tw-s4', x0: 115, z0: 70, x1: 155, z1: 110, h: 110, color: 0x5a5648, name: 'Vertex' },
];

// ------------------------------------------------------------------------------------ ground zones
// Colour of the ground slab by zone (first match wins); everything else is street asphalt.
const zones = [
  { id: 'rubble', ...rect(-66, -46, -26, -14), color: 0x4d4f48 },
  { id: 'courtyard', ...rect(-65, 10, -25, 50), color: 0x465246 },
  { id: 'slum-w', ...rect(-125, -98, -85, -70), color: 0x57493e },
  { id: 'slum-s', ...rect(-125, 70, -85, 98), color: 0x57493e },
  { id: 'hospital-yard', ...rect(-65, 70, -25, 98), color: 0x5a6462 },
  { id: 'site', ...rect(55, 70, 95, 110), color: 0x6c6450 },
  { id: 'clover-w', ...rect(-65, -98, -25, -70), color: 0x4c5654 },
  { id: 'clover-e', ...rect(-5, -98, 35, -70), color: 0x4c5654 },
  { id: 'promenade', ...rect(-140, 110, 160, 145), color: 0x5f6a66 },
  { id: 'quay-w', ...rect(-140, -170, -125, 110), color: 0x5f6a66 },
];
const streets = [
  { id: 'sx0', axis: 'z', c: -75, w: 20, from: -170, to: 110 },
  { id: 'sx1', axis: 'z', c: -15, w: 20, from: -170, to: 110 },
  { id: 'sx2', axis: 'z', c: 45, w: 20, from: -170, to: 110 },
  { id: 'sx3', axis: 'z', c: 105, w: 20, from: -170, to: 110 },
  { id: 'sz0', axis: 'x', c: -120, w: 20, from: -125, to: 155 },
  { id: 'sz1', axis: 'x', c: -60, w: 20, from: -125, to: 155 },
  { id: 'sz2', axis: 'x', c: 0, w: 20, from: -125, to: 155 },
  { id: 'sz3', axis: 'x', c: 60, w: 20, from: -125, to: 155 },
];

// ------------------------------------------------------------------------------------ decks
// Raised walking decks. `cuts` are candidate unstable slabs (Phase 4): the deck is built without
// them and each cut becomes an individually movable slab in game.world.slabs.
const decks = [
  // ---- L1 walkways (y 12)
  { id: 'sk-a', level: 'L1', ...rect(12, -10, 18, 10), y: 12, th: 0.8, kind: 'walkway', pillars: false,
    cuts: [{ id: 'us-l1-a', ...rect(12, -3, 18, 3) }] },
  { id: 'sk-b', level: 'L1', ...rect(35, 27, 55, 33), y: 12, th: 0.8, kind: 'walkway', pillars: false,
    cuts: [{ id: 'us-l1-b', ...rect(42, 27, 48, 33) }] },
  { id: 'sk-tree', level: 'L1', ...rect(-85, 17, -5, 23), y: 12, th: 0.8, kind: 'walkway', pillars: true,
    cuts: [{ id: 'us-l1-tree-1', ...rect(-72, 17, -66, 23) }, { id: 'us-l1-tree-2', ...rect(-52, 17, -46, 23) }, { id: 'us-l1-tree-3', ...rect(-33, 17, -27, 23) }] },
  { id: 'sk-w', level: 'L1', ...rect(-108, -10, -102, 10), y: 12, th: 0.8, kind: 'walkway', pillars: false },
  { id: 'collapse-w', level: 'L1', ...rect(-85, -33, -55, -27), y: 12, th: 0.8, kind: 'walkway', pillars: false, broken: '+x' },
  { id: 'collapse-e', level: 'L1', ...rect(-35, -33, -5, -27), y: 12, th: 0.8, kind: 'walkway', pillars: false, broken: '-x' },
  { id: 'land-g1-b', level: 'L1', ...rect(-20, 26, -5, 34), y: 12, th: 0.8, kind: 'walkway', pillars: true },
  // ---- L2 flyovers (y 24)
  { id: 'road-h', level: 'L2', ...rect(-135, -66, 157, -54), y: 24, th: 1.2, kind: 'road', pillars: true, lane: 'x',
    cuts: [{ id: 'us-l2-h1', ...rect(-100, -66, -94, -54) }, { id: 'us-l2-h2', ...rect(-72, -66, -66, -54) },
      { id: 'us-l2-h3', ...rect(24, -66, 30, -54) }, { id: 'us-l2-h4', ...rect(60, -66, 66, -54) }, { id: 'us-l2-h5', ...rect(120, -66, 126, -54) }] },
  { id: 'overlook-n', level: 'L2', ...rect(135, -70, 157, -66), y: 24, th: 1.2, kind: 'road', pillars: false },
  { id: 'overlook-s', level: 'L2', ...rect(135, -54, 157, -50), y: 24, th: 1.2, kind: 'road', pillars: false },
  { id: 'road-v-n', level: 'L2', ...rect(-21, -166, -9, -66), y: 24, th: 1.2, kind: 'road', pillars: true, lane: 'z',
    cuts: [{ id: 'us-l2-v1', ...rect(-21, -120, -9, -114) }] },
  { id: 'road-v-s', level: 'L2', ...rect(-21, -54, -9, 42), y: 24, th: 1.2, kind: 'road', pillars: true, lane: 'z',
    cuts: [{ id: 'us-l2-v2', ...rect(-21, -20, -9, -14) }] },
  // cloverleaf loops (rectangular, 6 m wide): leg a leaves the main road, leg b rejoins the other
  { id: 'loop-ne-a', level: 'L2', ...rect(12, -96, 18, -66), y: 24, th: 1.2, kind: 'road', pillars: true, lane: 'z' },
  { id: 'loop-ne-b', level: 'L2', ...rect(-9, -96, 12, -90), y: 24, th: 1.2, kind: 'road', pillars: true, lane: 'x' },
  { id: 'loop-nw-a', level: 'L2', ...rect(-48, -96, -42, -66), y: 24, th: 1.2, kind: 'road', pillars: true, lane: 'z' },
  { id: 'loop-nw-b', level: 'L2', ...rect(-42, -96, -21, -90), y: 24, th: 1.2, kind: 'road', pillars: true, lane: 'x' },
  { id: 'loop-se-a', level: 'L2', ...rect(12, -54, 18, -24), y: 24, th: 1.2, kind: 'road', pillars: true, lane: 'z' },
  { id: 'loop-se-b', level: 'L2', ...rect(-9, -30, 12, -24), y: 24, th: 1.2, kind: 'road', pillars: true, lane: 'x' },
  { id: 'loop-sw-a', level: 'L2', ...rect(-48, -54, -42, -24), y: 24, th: 1.2, kind: 'road', pillars: true, lane: 'z' },
  { id: 'loop-sw-b', level: 'L2', ...rect(-42, -30, -21, -24), y: 24, th: 1.2, kind: 'road', pillars: true, lane: 'x' },
  { id: 'land-12-bazaar', level: 'L2', ...rect(-4, -54, 8, -50), y: 24, th: 1.2, kind: 'road', pillars: false },
  { id: 'land-12-b', level: 'L2', ...rect(-9, 16, 4, 22), y: 24, th: 1.2, kind: 'road', pillars: true },
  // ---- L3 upper decks (y 38)
  { id: 'br-3-w', level: 'L3', ...rect(72, -70, 78, -50), y: 38, th: 1.0, kind: 'bridge', pillars: false },
  { id: 'br-3-e', level: 'L3', ...rect(132, -70, 138, -50), y: 38, th: 1.0, kind: 'bridge', pillars: false },
  { id: 'br-3-n', level: 'L3', ...rect(95, -93, 115, -87), y: 38, th: 1.0, kind: 'bridge', pillars: false },
  { id: 'br-3-s', level: 'L3', ...rect(95, -33, 115, -27), y: 38, th: 1.0, kind: 'bridge', pillars: false },
  { id: 'sunrise-bridge', level: 'L3', ...rect(155, -37, 203, -23), y: 38, th: 1.2, kind: 'bridge', pillars: false },
  { id: 'sunrise-end', level: 'L3', ...rect(203, -41, 215, -19), y: 38, th: 1.2, kind: 'bridge', pillars: false },
  // ---- piers into the sea (G level, unrailed: walking off the end is the sea edge)
  { id: 'pier-s1', level: 'G', ...rect(20, 145, 28, 172), y: 0, th: 0.8, kind: 'pier', pillars: false, rails: false },
  { id: 'pier-s2', level: 'G', ...rect(-80, 145, -72, 168), y: 0, th: 0.8, kind: 'pier', pillars: false, rails: false },
  { id: 'pier-w1', level: 'G', ...rect(-166, -60, -140, -54), y: 0, th: 0.8, kind: 'pier', pillars: false, rails: false },
  { id: 'pier-bridge', level: 'G', ...rect(160, -44, 176, -34), y: 0, th: 0.8, kind: 'pier', pillars: false },
];

// ------------------------------------------------------------------------------------ connections
// Every level change is a stair, ramp or lift. `gate` names an entry of `gates`. Stairs: (x,z) is the
// centre of the LOW edge, `dir` is the direction of ascent; hollow = floating flight (thickness).
const stairs = [
  { id: 'stairs-g1-plaza', from: 'G', to: 'L1', x: -20, z: -8, y0: 0, y1: 12, dir: '-z', width: 6, steps: 38, hollow: 0.9, sign: 'WALKWAYS', tone: 'free' },
  { id: 'stairs-g1-south', from: 'G', to: 'L1', x: -15, z: 54, y0: 0, y1: 12, dir: '-z', width: 6, steps: 40, hollow: 0.9, sign: 'WALKWAYS', tone: 'free' },
  { id: 'stairs-12-b', from: 'L1', to: 'L2', x: -1, z: 42, y0: 12, y1: 24, dir: '-z', width: 6, steps: 40, hollow: 0.9, gate: 'gate-l2-stairs-b', sign: 'FLYOVERS', tone: 'gate5' },
  { id: 'stairs-23-sx3', from: 'L2', to: 'L3', x: 105, z: -66, y0: 24, y1: 38, dir: '-z', width: 6, steps: 42, hollow: 0.9, gate: 'gate-l3-stairs-sx3', sign: 'UPPER DECKS', tone: 'gate8' },
  { id: 'stairs-u-a', from: 'G', to: 'U', x: 45, z: -20, y0: -8, y1: 0, dir: '+z', width: 8, steps: 27, run: 0.55, hollow: 0, sign: 'METRO', tone: 'metro' },
  { id: 'stairs-u-b', from: 'G', to: 'U', x: 45, z: 66, y0: -8, y1: 0, dir: '-z', width: 8, steps: 27, run: 0.55, hollow: 0, sign: 'METRO', tone: 'metro' },
  { id: 'stairs-u-maint', from: 'G', to: 'U', x: 52, z: -24, y0: -8, y1: 0, dir: '-z', width: 1.6, steps: 25, run: 0.4, hollow: 0, tone: 'work', maintenance: true },
  { id: 'stairs-u-breach', from: 'U', to: 'U', x: -114, z: -38, y0: -11.5, y1: -8, dir: '+x', width: 4, steps: 12, run: 0.5, hollow: 0, tone: 'work' },
];
const ramps = [
  { id: 'ramp-g1-site', from: 'G', to: 'L1', x0: 72, z0: 50, x1: 78, z1: 86, dir: '-z', yLow: 0, yHigh: 12, tone: 'free', sign: 'WALKWAYS' },
  { id: 'ramp-u-c', from: 'G', to: 'U', x0: -136, z0: -26, x1: -130, z1: -2, dir: '+z', yLow: -8, yHigh: 0, tone: 'work', sign: 'SERVICE' },
];
// Lifts: platform centre, size, exits (the sides you walk on/off at each stop). `lobby` adds a walled
// approach corridor on that side, where the gate stands.
const lifts = [
  { id: 'lift-g1-skywalk', center: [20, 0], size: [4, 4], yBottom: 0, yTop: 12, exits: { bottom: '-x', top: '-x' }, tone: 'free', label: 'WALKWAYS' },
  { id: 'lift-12-bazaar', center: [2, -48], size: [4, 4], yBottom: 12, yTop: 24, exits: { bottom: '+z', top: '-z' }, tone: 'gate5', label: 'FLYOVERS', gate: 'gate-l2-lift-bazaar', lobby: { side: '+z', len: 8 } },
  { id: 'lift-23-west', center: [80, -60], size: [4, 4], yBottom: 24, yTop: 38, exits: { bottom: '-x', top: '-x' }, tone: 'gate8', label: 'UPPER DECKS', gate: 'gate-l3-lift-w', lobby: { side: '-x', len: 6 } },
  { id: 'lift-bridge', center: [172, -39], size: [4, 4], yBottom: 0, yTop: 38, exits: { bottom: '-x', top: '+z' }, tone: 'sun', label: 'SUNRISE BRIDGE', gate: 'gate-bridge', lobby: { side: '-x', len: 8 } },
  { id: 'lift-23-east', center: [140, -60], size: [4, 4], yBottom: 24, yTop: 38, exits: { bottom: '-x', top: '-x' }, tone: 'gate8', label: 'UPPER DECKS', gate: 'gate-l3-lift-e', lobby: { side: '-x', len: 6 } },
];
// Health gates. (x,y,z) = centre of the door on the walking surface; `axis` = the axis the door spans
// along; `inside` = direction from the outside (where you are refused) into the route. Entering needs
// rays >= min; leaving from the inside side always works.
const gates = [
  { id: 'gate-l2-stairs-b', min: 5, x: -1, y: 12, z: 43.5, axis: 'x', width: 6, inside: '-z', route: 'stairs-12-b', level: 'L2' },
  { id: 'gate-l2-lift-bazaar', min: 5, x: 2, y: 12, z: -38, axis: 'x', width: 4, inside: '-z', route: 'lift-12-bazaar', level: 'L2' },
  { id: 'gate-l3-stairs-sx3', min: 8, x: 105, y: 24, z: -64.65, axis: 'x', width: 6, inside: '-z', route: 'stairs-23-sx3', level: 'L3' },
  { id: 'gate-l3-lift-w', min: 8, x: 72.15, y: 24, z: -60, axis: 'z', width: 4, inside: '+x', route: 'lift-23-west', level: 'L3' },
  // the bridge permit gate: needs game.flags.bridgePermit (Tara's permission), not rays
  { id: 'gate-bridge', min: 0, permit: 'bridgePermit', x: 162.15, y: 0, z: -39, axis: 'z', width: 4, inside: '+x', route: 'lift-bridge', level: 'L3' },
  { id: 'gate-l3-lift-e', min: 8, x: 132.15, y: 24, z: -60, axis: 'z', width: 4, inside: '+x', route: 'lift-23-east', level: 'L3' },
];

// ------------------------------------------------------------------------------------ underground
// U floors are at -8; the ground slab (y -2..0) is their ceiling. Tracks lie 0.5 m lower.
const uFloors = [
  { id: 'u-concourse-n', ...rect(27, -46, 63, -8), name: 'Metro concourse' },
  { id: 'u-hall', ...rect(27, -8, 63, 50), name: 'Metro platforms', tracks: rect(38, -4, 52, 46) },
  { id: 'u-concourse-s', ...rect(27, 50, 63, 80), name: 'Metro south concourse' },
  { id: 'u-t1', ...rect(-98, -43, 27, -37), name: 'Service tunnel West' },
  { id: 'u-store', ...rect(-62, -37, -48, -25), name: 'Store room' },
  { id: 'u-chamber', ...rect(-138, -50, -98, -26), name: 'Breach chamber', sump: rect(-126, -46, -108, -30) },
  { id: 'u-ramp-c', ...rect(-137, -26, -129, -2), name: 'Service ramp', ramp: true },
  { id: 'u-t3', ...rect(-120, -26, -114, 68), name: 'Service tunnel Ring' },
  { id: 'u-t2', ...rect(-120, 62, 27, 68), name: 'Service tunnel South' },
  { id: 'u-maint', ...rect(-50, 68, -36, 80), name: 'Maintenance room' },
  // catacomb homes carved off the ring tunnel (no lamps)
  { id: 'u-cat-door', ...rect(-114, 20, -112, 24), name: 'Catacomb entrance' },
  { id: 'u-catacombs', ...rect(-112, 4, -84, 40), name: 'Catacomb homes' },
  // tunnel-boring machine cavern, north of the west tunnel
  { id: 'u-boring-link', ...rect(-82, -45, -76, -43), name: 'Boring site passage' },
  { id: 'u-boring', ...rect(-96, -64, -62, -45), name: 'Tunnel-boring machine site' },
  // the underground doctor's clinic, south of the south tunnel
  { id: 'u-clinic-link', ...rect(-22, 68, -18, 70), name: 'Clinic passage' },
  { id: 'u-clinic', ...rect(-30, 70, -12, 84), name: 'Underground clinic' },
];
const sumpY = -11.5;
const breachChamber = {
  id: 'breach-chamber', x: -118, y: -8, z: -28, rect: rect(-138, -50, -98, -26), sump: rect(-126, -46, -108, -30), sumpY,
  waterY: -10.9, breachWall: { x: -138, z0: -50, z1: -26 },
};

// ------------------------------------------------------------------------------------ landmarks
const deadTree = { id: 'dead-tree', x: -45, z: 36, height: 26 };
const rubble = { id: 'rubble-field', ...rect(-64, -44, -28, -16), mounds: [], chunks: [] };
for (let i = 0, tries = 0; i < 10 && tries < 80; tries++) {
  const x = rr(-62, -30), z = rr(-42, -18), r = rr(2.4, 4.4);
  if (Math.hypot(x - spawn.x, z - spawn.z) < r + 5) continue;
  if (rubble.mounds.some((m) => Math.hypot(m.x - x, m.z - z) < m.r + r)) continue;
  rubble.mounds.push({ x, z, r, levels: R() < 0.5 ? 2 : 3 }); i++;
}
for (let i = 0; i < 12; i++) {
  rubble.chunks.push({ x: rr(-62, -30), z: rr(-42, -18), w: rr(2, 5), d: rr(1.5, 3.5), t: rr(0.35, 0.7), rotY: rr(0, 3.14), tilt: rr(-0.5, 0.5), tilt2: rr(-0.4, 0.4), y: rr(0.2, 1.6) });
}

// slum shacks (visual + solid), generated on a loose grid inside the slum zones
function shacks(r, seedSkip) {
  const out = [];
  for (let x = r.x0 + 3; x < r.x1 - 3; x += 8) {
    for (let z = r.z0 + 3; z < r.z1 - 3; z += 8) {
      if (R() < 0.3 || (seedSkip && seedSkip(x, z))) continue;
      out.push({ x: x + rr(-1.2, 1.2), z: z + rr(-1.2, 1.2), w: rr(3, 5), d: rr(3, 4.5), h: rr(2.2, 3.1), yaw: 0 });
    }
  }
  return out;
}
const inRect = (x, z, r, pad = 0) => x > r.x0 - pad && x < r.x1 + pad && z > r.z0 - pad && z < r.z1 + pad;
const flatsArea = rect(-101, -95, -84, -71);
const slumShacks = [...shacks(rect(-125, -98, -85, -70), (x, z) => inRect(x, z, flatsArea, 4)), ...shacks(rect(-125, 70, -85, 98))];

// ------------------------------------------------------------------------------------ signs
// Lit signs on facades and canopies; `dir` is the way the sign faces.
const signs = [
  { id: 'sign-metro-a', text: 'METRO', x: 45, y: 4.7, z: -4.6, dir: '+z', w: 6, h: 1.4, tone: 'metro' },
  { id: 'sign-metro-b', text: 'METRO', x: 45, y: 4.7, z: 50.8, dir: '-z', w: 6, h: 1.4, tone: 'metro' },
  { id: 'sign-metro-b2', text: 'METRO', x: 45, y: 4.7, z: 67.2, dir: '+z', w: 6, h: 1.4, tone: 'metro' },
  { id: 'sign-bazaar', text: 'BAZAAR', x: 15, y: 9.5, z: -9.8, dir: '+z', w: 12, h: 2.2, tone: 'free' },
  { id: 'sign-bazaar-w', text: 'BAZAAR', x: -5.2, y: 9.5, z: -22, dir: '-x', w: 10, h: 2.2, tone: 'free' },
  { id: 'sign-control', text: 'CONTROL TOWER', x: 142, y: 47, z: -91.8, dir: '+z', w: 14, h: 2.4, tone: 'gate8' },
  { id: 'sign-sunrise', text: 'SUNRISE BRIDGE >', x: 154.8, y: 41.5, z: -30, dir: '-x', w: 13, h: 2.0, tone: 'sun' },
  { id: 'sign-clover', text: 'FLYOVERS', x: -15, y: 27.5, z: -66.3, dir: '+z', w: 8, h: 1.5, tone: 'gate5' },
  { id: 'sign-ramp-c', text: 'SERVICE', x: -133, y: 3.4, z: -1.6, dir: '+z', w: 6, h: 1.2, tone: 'work' },
  { id: 'sign-hospital', text: 'अस्पताल  HOSPITAL', x: -45, y: 3.9, z: -0 + 71.85, dir: '-z', w: 8.5, h: 1.4, tone: 'free' },
  { id: 'sign-police', text: 'पुलिस  POLICE', x: 18, y: 3.9, z: -75.85, dir: '+z', w: 7, h: 1.2, tone: 'metro' },
  { id: 'sign-maint', text: 'रखरखाव  MAINTENANCE', x: 52, y: 3.05, z: -36.2, dir: '-z', w: 4.2, h: 0.7, tone: 'work' },
  { id: 'sign-clinic', text: 'दवा  CLINIC', x: -26, y: -4.9, z: 69.85, dir: '-z', w: 5, h: 0.95, tone: 'free' },
  { id: 'sign-bridge-gantry', text: 'पुल  BRIDGE: PERMIT HOLDERS ONLY', x: 156.7, y: 42.6, z: -30, dir: '-x', w: 12, h: 1.4, tone: 'sun' },
  { id: 'sign-surya-a', text: 'सूर्य  SURYA: the light you deserve', x: -105, y: 24, z: -129.9, dir: '+z', w: 16, h: 2.6, tone: 'surya' },
  { id: 'sign-surya-b', text: 'सूर्य  SURYA', x: 54.9, y: 27, z: -90, dir: '-x', w: 9, h: 2.2, tone: 'surya' },
  { id: 'sign-surya-c', text: 'सूर्य  SURYA: sunlight, subscribed', x: 155.1, y: 30, z: 30, dir: '+x', w: 16, h: 2.6, tone: 'surya' },
  { id: 'sign-nosing-a', text: 'गाना मना है  NO SINGING', x: -85.2, y: 5.2, z: -30, dir: '+x', w: 6, h: 1.1, tone: 'danger' },
  { id: 'sign-nosing-b', text: 'गाना मना है  NO SINGING', x: 35.2, y: 5.4, z: -30, dir: '+x', w: 6, h: 1.1, tone: 'danger' },
  { id: 'sign-water', text: 'पानी  WATER', x: -84.9, y: 3.6, z: 80, dir: '+x', w: 4.5, h: 0.9, tone: 'metro' },
  { id: 'sign-tree', text: 'WALKWAYS', x: -45, y: 15.4, z: 16.6, dir: '-z', w: 8, h: 1.4, tone: 'free' },
];

// ------------------------------------------------------------------------------------ sunlight
// Light shafts. (x,z) = centre where the shaft meets its floor `y0`; it rises `height` m, leaning toward
// the east (the sun), see SHAFT_LEAN. None underground; few and thin on G, wider on higher levels.
export const SHAFT_LEAN = { x: 0.16, z: -0.05 };
const sh = (id, level, x, z, r, height = null) => ({ id, level, x, z, y0: Y[level], r, height: height ?? { G: 64, L1: 56, L2: 60, L3: 70 }[level] });
const sunShafts = [
  sh('sh-g-rubble', 'G', -47, -26, 2.2), sh('sh-g-tree', 'G', -52, 40, 1.4), sh('sh-g-slum-w', 'G', -105, -85, 1.5),
  sh('sh-g-depot', 'G', -45, 95, 1.6), sh('sh-g-site', 'G', 66, 91, 1.5), sh('sh-g-promenade', 'G', 20, 128, 1.6),
  sh('sh-g-clover', 'G', 25, -100, 1.8),
  sh('sh-l1-bazaar-a', 'L1', 24, -22, 3.0), sh('sh-l1-bazaar-b', 'L1', 6, -20, 2.6), sh('sh-l1-b', 'L1', 10, 38, 2.8),
  sh('sh-l1-c', 'L1', 70, 30, 3.2), sh('sh-l1-w', 'L1', -95, -30, 3.0), sh('sh-l1-w2', 'L1', -95, 30, 2.6), sh('sh-l1-tree', 'L1', -35, 20, 2.2),
  sh('sh-l2-h1', 'L2', -110, -60, 4.0), sh('sh-l2-h2', 'L2', -82, -60, 3.5), sh('sh-l2-clover-n', 'L2', -15, -112, 4.0),
  sh('sh-l2-clover-e', 'L2', 32, -60, 4.0), sh('sh-l2-v-south', 'L2', -15, 10, 3.5), sh('sh-l2-canyon', 'L2', 63, -60, 3.0),
  sh('sh-l2-overlook', 'L2', 148, -60, 4.5),
  sh('sh-l3-garden-w', 'L3', 75, -90, 6), sh('sh-l3-garden-w2', 'L3', 75, -30, 6), sh('sh-l3-heights', 'L3', 125, -85, 6),
  sh('sh-l3-dawn', 'L3', 125, -30, 6), sh('sh-l3-dawn2', 'L3', 146, -18, 5), sh('sh-l3-bridge', 'L3', 183, -30, 5), sh('sh-l3-end', 'L3', 209, -30, 6),
];
// Stored-sunlight lamps on the Upper Decks (they keep working at night at half healing).
const solarLamps = [];
const lampRows = [
  [58, -107], [92, -107], [58, -73], [92, -73], [75, -90], [118, -107], [152, -107], [118, -73], [152, -73], [125, -90],
  [58, -47], [92, -47], [58, -13], [92, -13], [75, -30], [118, -47], [152, -47], [118, -13], [152, -13], [135, -30],
  [105, -90], [105, -30], [165, -38], [177, -22], [189, -38], [201, -22], [209, -38], [209, -22],
];
lampRows.forEach(([x, z], i) => solarLamps.push({ id: `solar-${i + 1}`, x, y: 38, z, radius: 6 }));

// ------------------------------------------------------------------------------------ points of interest
const fragSpot = (id, level, x, z, tag, kind, y = Y[level]) => ({ id, level, x, y, z, tag, kind });
const fragmentSpots = [
  fragSpot('frag-phone-rubble', 'G', -47, -34, 'story', 'phone'),
  fragSpot('frag-graffiti-slum', 'G', -100, -74.5, 'story', 'graffiti'),
  fragSpot('frag-radio-bazaar', 'L1', 12, -22, 'story', 'radio'),
  fragSpot('frag-poster-tree', 'G', -34, 44, 'story', 'poster'),
  fragSpot('frag-note-clover', 'G', 22, -93, 'story', 'note'),
  fragSpot('frag-memo-site', 'G', 60, 92, 'breach', 'memo'),
  fragSpot('frag-voicelog-metro', 'U', 33, 24, 'breach', 'voicelog'),
  fragSpot('frag-seep-tunnel', 'U', -40, -41.2, 'breach', 'seep'),
  fragSpot('frag-pumps-chamber', 'U', -106, -42, 'breach', 'console'),
  fragSpot('frag-ledger-boring', 'U', -66, -50, 'breach', 'ledger'),
  fragSpot('frag-garden-solar', 'L3', 75, -96, 'story', 'note'),
  fragSpot('frag-overlook-ad', 'L2', 150, -57, 'story', 'billboard'),
  fragSpot('frag-clover-radio', 'L2', -15, -100, 'story', 'radio'),
];
const setuSpots = [
  { id: 'setu-slum-w', level: 'G', x: -96, y: 0, z: -80, note: 'behind a shack in the west slum' },
  { id: 'setu-tree', level: 'G', x: -48, y: 0, z: 41, note: 'among the roots of the dead tree' },
  { id: 'setu-hospital-back', level: 'G', x: -45, y: 0, z: 96, note: 'the alley behind the hospital' },
  { id: 'setu-site', level: 'G', x: 88, y: 0, z: 95, note: 'behind the construction hoarding' },
  { id: 'setu-metro', level: 'U', x: 31, y: -8, z: 40, note: 'end of the metro platform' },
  { id: 'setu-store', level: 'U', x: -55, y: -8, z: -31, note: 'the store room off the west tunnel' },
  { id: 'setu-chamber', level: 'U', x: -132, y: -8, z: -45, note: 'a ledge of the breach chamber' },
  { id: 'setu-terrace-w', level: 'L1', x: -93, y: 12, z: -18, note: 'under the tower base on the west terrace' },
];
const vendorSpots = [
  { id: 'vendor-g-tree', level: 'G', x: -78, y: 0, z: 26, yaw: -Math.PI / 2, name: 'Tree Alley' },
  { id: 'vendor-g-slum', level: 'G', x: -108, y: 0, z: -72, yaw: 0, name: 'Slum Row' },
  { id: 'vendor-g-quay', level: 'G', x: 20, y: 0, z: 120, yaw: Math.PI, name: 'Harbour Steps' },
  { id: 'vendor-l1-bazaar-a', level: 'L1', x: 10, y: 12, z: -20, yaw: Math.PI, name: 'Bazaar North' },
  { id: 'vendor-l1-bazaar-b', level: 'L1', x: 28, y: 12, z: -14, yaw: 0, name: 'Bazaar East' },
  { id: 'vendor-l1-terrace-c', level: 'L1', x: 70, y: 12, z: 42, yaw: Math.PI, name: 'Terrace C' },
];
const checkpoints = [
  { id: 'cp-west', x: -80, y: 0, z: 2, yaw: 0, name: 'West Junction' },
  { id: 'cp-center', x: -9, y: 0, z: 4, yaw: 0, name: 'Central Crossing' },
  { id: 'cp-east', x: 101, y: 0, z: 4, yaw: 0, name: 'East Junction' },
  { id: 'cp-south', x: 8, y: 0, z: 118, yaw: Math.PI, name: 'Harbour Gate' },
];
const controlTowerTerminal = { id: 'control-terminal', x: 142, y: 38, z: -90, radius: 3.2, level: 'L3' };
const sunriseBridgeEnd = { id: 'sunrise-bridge-end', x: 211, y: 38, z: -30, radius: 4, level: 'L3' };

const hazardZones = {
  dogs: [
    { id: 'dog-slum-w', level: 'G', x: -105, z: -85, r: 18 }, { id: 'dog-site', level: 'G', x: 75, z: 95, r: 18 }, { id: 'dog-clover', level: 'G', x: -45, z: -86, r: 16 },
    { id: 'dog-promenade', level: 'G', x: -20, z: 128, r: 20 }, { id: 'dog-slum-s', level: 'G', x: -105, z: 85, r: 16 },
    { id: 'dog-u-hall', level: 'U', x: 45, z: 22, r: 18 }, { id: 'dog-u-ring', level: 'U', x: -60, z: 65, r: 16 },
    { id: 'dog-u-chamber', level: 'U', x: -103, z: -38, r: 12 },
  ],
  // patrol routes: waypoints are [x, z]; `altitude` is metres above the deck; loop: true = cycle, 'pingpong' = back and forth
  drones: [
    { id: 'drone-l1-bazaar', level: 'L1', altitude: 5, loop: true,
      waypoints: [[8, -44], [20, -44], [20, -14], [15, -4], [15, 14], [28, 28], [45, 30], [75, 30], [75, 44], [62, 44], [45, 30], [28, 28], [10, 28], [15, 14], [15, -4], [8, -14]] },
    { id: 'drone-l1-tree', level: 'L1', altitude: 5, loop: 'pingpong', waypoints: [[-100, 20], [-12, 20]] },
    { id: 'drone-l2-h', level: 'L2', altitude: 8, loop: 'pingpong', waypoints: [[-130, -64.2], [150, -64.2]] },
    { id: 'drone-l2-v', level: 'L2', altitude: 8, loop: 'pingpong', waypoints: [[-15, -160], [-15, 38]] },
    { id: 'drone-l2-clover', level: 'L2', altitude: 8, loop: true, waypoints: [[-45, -93], [15, -93], [15, -27], [-45, -27]] },
  ],
  cameras: gates.map((g) => ({ id: `cam-${g.id.slice(5)}`, gate: g.id, x: g.x, y: g.y + 3.9, z: g.z, yaw: { '-z': 0, '+z': Math.PI, '-x': Math.PI / 2, '+x': -Math.PI / 2 }[g.inside] + Math.PI, range: 14, fov: 55 })),
  unstableSlabs: decks.flatMap((d) => (d.cuts ?? []).map((c) => ({ id: c.id, level: d.level, deck: d.id, ...rect(c.x0, c.z0, c.x1, c.z1), y: d.y }))),
  deranged: [
    { id: 'wander-slum', level: 'G', x: -100, z: -80, r: 14 }, { id: 'wander-hospital-lane', level: 'G', x: -72, z: 100, r: 14 },
    { id: 'wander-sz3-east', level: 'G', x: 100, z: 60, r: 14 }, { id: 'wander-canyon-n', level: 'G', x: 105, z: -140, r: 14 },
    { id: 'wander-quay-w', level: 'G', x: -134, z: 45, r: 12 }, { id: 'wander-courtyard', level: 'G', x: -45, z: 25, r: 12 },
  ],
  smog: [
    { id: 'smog-slum-w', level: 'G', ...rect(-125, -110, -85, -70), y0: 0, y1: 6 },
    { id: 'smog-slum-s', level: 'G', ...rect(-125, 70, -85, 110), y0: 0, y1: 6 },
    { id: 'smog-canyon-n', level: 'G', ...rect(-85, -170, -65, -130), y0: 0, y1: 9 },
    { id: 'smog-site', level: 'G', ...rect(55, 70, 95, 110), y0: 0, y1: 7 },
    { id: 'smog-u-ring', level: 'U', ...rect(-120, 62, 0, 68), y0: -8, y1: -3 },
    { id: 'smog-u-hall', level: 'U', ...rect(27, 10, 63, 50), y0: -8, y1: -3 },
    { id: 'smog-l1-market', level: 'L1', ...rect(0, -48, 30, -30), y0: 12, y1: 16 },
  ],
};

// ------------------------------------------------------------------------------------ story set pieces (PLAN 1b)
// Enterable buildings: outer walls (0.5 m) on the rect edge with door gaps, partitions, a roof slab.
//   doors: [{side:'n'|'s'|'e'|'w', c: coordinate along the wall, w: width, low?: height}]  (low = a broken wall piece, not a door)
//   partitions: [{axis:'x'|'z', at, a, b, gaps:[[centre,width],...]}]   axis = the direction the wall runs
const buildings = [
  { id: 'hospital', name: 'Sion General Hospital', ...rect(-63, 72, -27, 94), h: 5, color: 0x8a9490, tone: 'free',
    doors: [{ side: 'n', c: -45, w: 4 }, { side: 's', c: -45, w: 1.6 }],
    partitions: [
      { axis: 'x', at: 80, a: -62.5, b: -27.5, gaps: [[-55, 2.4], [-41.5, 2.4], [-31.5, 2]] },
      { axis: 'z', at: -47, a: 80, b: 93.5, gaps: [] },
      { axis: 'z', at: -36, a: 80, b: 93.5, gaps: [] },
      { axis: 'z', at: -55, a: 87, b: 93.5, gaps: [] },
    ] },
  { id: 'police-station', name: 'Colaba Police Station', ...rect(2, -90, 32, -76), h: 5, color: 0x56627a, tone: 'metro',
    doors: [{ side: 's', c: 18, w: 3.4 }],
    partitions: [
      { axis: 'x', at: -81, a: 2.5, b: 31.5, gaps: [[6, 1.6], [15, 1.2], [26, 1.6]] },
      { axis: 'z', at: 10, a: -89.5, b: -81, gaps: [] },
      { axis: 'z', at: 20, a: -89.5, b: -81, gaps: [] },
    ] },
  // damaged one-room flats at the slum edge
  { id: 'mithi-home', name: "Mithi and Setu's flat", ...rect(-98, -82, -90, -74), h: 3.2, color: 0x7a6a58, roofBreak: rect(-98, -82, -94, -78), tone: 'work',
    doors: [{ side: 'e', c: -78, w: 1.6 }, { side: 'n', c: -94, w: 2.2, low: 1.0 }], partitions: [] },
  { id: 'neighbour-flat', name: "The dead neighbour's flat", ...rect(-98, -92, -90, -84), h: 3.2, color: 0x6a6e66, tone: 'work',
    doors: [{ side: 'e', c: -88, w: 1.6 }], partitions: [] },
  // the maintenance hut over the shaft down to the metro tunnels (Jeetu's route)
  { id: 'maintenance-hut', name: 'Maintenance shaft hut', ...rect(49.5, -36, 54.5, -23), h: 3.4, color: 0x6a6a52, tone: 'work',
    doors: [{ side: 'n', c: 52, w: 1.8 }], partitions: [] },
];
// partitions inside U rooms (no roof; walls 3.2 m)
const uPartitions = [
  { room: 'u-catacombs', y: -8, h: 3.4, walls: [
    { axis: 'x', at: 20, a: -112, b: -84, gaps: [[-107, 1.6], [-97.5, 1.6], [-88.5, 1.6]] },
    { axis: 'x', at: 24, a: -112, b: -84, gaps: [[-107, 1.6], [-97.5, 1.6], [-88.5, 1.6]] },
    { axis: 'z', at: -102, a: 4, b: 20, gaps: [] }, { axis: 'z', at: -93, a: 4, b: 20, gaps: [] },
    { axis: 'z', at: -102, a: 24, b: 40, gaps: [] }, { axis: 'z', at: -93, a: 24, b: 40, gaps: [] },
  ] },
  { room: 'u-clinic', y: -8, h: 3.4, walls: [{ axis: 'z', at: -21, a: 70, b: 84, gaps: [[77.5, 3]] }] },
];

// narrow air vents (child-sized: 0.8 m wide, 1.0 m crawl height) from U up to a stack on G
const ventSpots = [
  { id: 'vent-1', name: 'Collapse-site vent', inward: [0, 1], u: { x: -50, y: -8, z: -42.5 }, g: { x: -50, y: 0, z: -47.5 }, crawlHeight: 1.0, width: 0.8 },
  { id: 'vent-2', name: 'Quay vent', inward: [1, 0], u: { x: -119.5, y: -8, z: 65 }, g: { x: -122, y: 0, z: 66 }, crawlHeight: 1.0, width: 0.8 },
  { id: 'vent-3', name: 'Clinic vent', inward: [0, -1], u: { x: -15, y: -8, z: 83.5 }, g: { x: -15, y: 0, z: 88 }, crawlHeight: 1.0, width: 0.8 },
];
// guarded metro: shutters (collider doors, `world.doors`) and guard posts (Phase 4/6 puts guards here)
const doorDefs = [
  { id: 'metro-shutter-a', x0: 40.5, z0: -5.3, x1: 49.5, z1: -4.95, y: 0, h: 3.3, closed: false, name: 'Metro north shutter' },
  { id: 'metro-shutter-b', x0: 40.5, z0: 50.95, x1: 49.5, z1: 51.25, y: 0, h: 3.3, closed: false, name: 'Metro south shutter' },
  { id: 'police-cell-gautam', x0: 14.4, z0: -81.15, x1: 15.6, z1: -80.85, y: 0, h: 2.8, closed: true, name: "Gautam's cell door" },
];
const metroGuardPosts = [
  { id: 'guard-a-west', level: 'G', x: 38.5, y: 0, z: -2, yaw: -Math.PI / 2 }, { id: 'guard-a-east', level: 'G', x: 51.5, y: 0, z: -2, yaw: Math.PI / 2 },
  { id: 'guard-b-west', level: 'G', x: 38.5, y: 0, z: 64, yaw: -Math.PI / 2 }, { id: 'guard-b-east', level: 'G', x: 51.5, y: 0, z: 64, yaw: Math.PI / 2 },
  { id: 'guard-concourse', level: 'U', x: 45, y: -8, z: -30, yaw: Math.PI }, { id: 'guard-platform', level: 'U', x: 45, y: -8, z: 50, yaw: 0 },
];
const fallenDecks = [
  { id: 'fallen-deck-1', x: -58, z: -42, w: 10, d: 4, tilt: 0.25 }, { id: 'fallen-deck-2', x: -43, z: -43.5, w: 10, d: 3, tilt: -0.22 },
  { id: 'fallen-deck-3', x: -31, z: -34, w: 4, d: 12, tilt: 0.2 }, { id: 'fallen-deck-4', x: -61, z: -29, w: 4, d: 12, tilt: -0.2 },
  { id: 'fallen-deck-5', x: -46, z: -15.5, w: 10, d: 3, tilt: 0.18 },
];
const story = {
  fallenDecks,
  collapseSite: { id: 'collapse-site', x: -44, y: 0, z: -30, rect: rect(-64, -44, -28, -16) },
  triageTents: { id: 'triage-tents', x: -46, y: 0, z: 3, rect: rect(-64, -9, -30, 6), tents: 6 },
  bodyArea: { id: 'body-area', x: -59, y: 0, z: -19, rect: rect(-64, -22, -54, -15) },
  mithiHome: { id: 'mithi-home', x: -94, y: 0, z: -78, door: { x: -90, y: 0, z: -78 }, tv: { x: -97, y: 0.9, z: -78 }, remote: { x: -95.5, y: 0.75, z: -75.5 } },
  neighbourFlat: { id: 'neighbour-flat', x: -94, y: 0, z: -88, door: { x: -90, y: 0, z: -88 }, jacket: { x: -97.4, y: 1.2, z: -86 } },
  hospital: { id: 'hospital', x: -45, y: 0, z: 74.2, entrance: { x: -45, y: 0, z: 71.5 }, wards: [{ id: 'ward-a', x: -55, y: 0, z: 87 }, { id: 'ward-b', x: -41.5, y: 0, z: 87 }],
    icu: { id: 'icu', x: -31.5, y: 0, z: 87 }, jeetuBed: { x: -58, y: 0, z: 90 }, taraRoom: { x: -42, y: 0, z: 90 } },
  policeStation: { id: 'police-station', x: 18, y: 0, z: -79, entrance: { x: 18, y: 0, z: -75.5 }, cell: { id: 'gautam-cell', x: 15, y: 0, z: -86 }, desk: { x: 18, y: 0, z: -78 } },
  metro: { id: 'metro-station', entranceA: { x: 45, y: 0, z: -3 }, entranceB: { x: 45, y: 0, z: 49.5 }, concourse: { x: 45, y: -8, z: -26 }, platform: { x: 33, y: -8, z: 10 } },
  maintenanceShaft: { id: 'maintenance-shaft', top: { x: 52, y: 0, z: -35 }, bottom: { x: 52, y: -8, z: -24 }, liftWreck: { x: 55.5, y: -8, z: -24 }, note: 'a steep narrow stair (stairs-u-maint) stands in for the ladder' },
  catacombs: { id: 'catacombs', x: -98, y: -8, z: 22, entrance: { x: -113, y: -8, z: 22 }, aayatHome: { x: -97.5, y: -8, z: 12 } },
  boringSite: { id: 'boring-site', x: -80, y: -8, z: -49.5, machine: { x: -79, y: -8, z: -55 }, foreman: { x: -68, y: -8, z: -60 }, cages: { x: -90, y: -8, z: -60 } },
  clinic: { id: 'underground-clinic', x: -21, y: -8, z: 77, door: { x: -20, y: -8, z: 69 } },
  bridgeCheckpoint: { id: 'bridge-checkpoint', x: 157, y: 38, z: -30, gate: 'gate-bridge', note: 'permit route: pier + lift-bridge at the east quay; health route: L3 gates' },
};
// Setu's day (PLAN 1b step 5): game hours from 06:00 day 1 (24 = midnight, 28 = 04:00 day 2); apply seeded jitter of about +-1 h
const setuTimeline = [
  { id: 'liftWreck', level: 'U', x: 55.5, y: -8, z: -24, from: 5.67, to: 9.5, jitter: 0.5 },
  { id: 'catacombs', level: 'U', x: -97.5, y: -8, z: 12, from: 9.5, to: 14 },
  { id: 'boringSite', level: 'U', x: -80, y: -8, z: -49.5, from: 14, to: 18 },
  { id: 'clinic', level: 'U', x: -21, y: -8, z: 77, from: 18, to: 23 },
  { id: 'ventExit', level: 'G', x: -15, y: 0, z: 89.8, from: 23, to: 23.5 },
  { id: 'triageTents', level: 'G', x: -46, y: 0, z: 3, from: 23.5, to: 28 },
  { id: 'bridge', level: 'L3', x: 200, y: 38, z: -30, from: 28, to: 48 },
];

// SURYA Corp animated ad screens: one shared canvas atlas (4 ads), quads on tower faces. dir = facing.
const adScreens = [
  { id: 'ad-surya-west', x: -102.85, y: 46, z: -30, dir: '+x', w: 20, h: 10, ad: 0 },
  { id: 'ad-bazaar-tower', x: 23.9, y: 34, z: -43, dir: '-x', w: 11, h: 5.5, ad: 1 },
  { id: 'ad-north-wall', x: -45, y: 46, z: -129.9, dir: '+z', w: 22, h: 11, ad: 0 },
  { id: 'ad-clover-east', x: 35.1, y: 40, z: -103, dir: '+x', w: 14, h: 7, ad: 2 },
  { id: 'ad-site-tower', x: 19.9, y: 45, z: 73, dir: '-x', w: 14, h: 7, ad: 3 },
  { id: 'ad-harbour', x: 135, y: 58, z: 49.9, dir: '-z', w: 20, h: 10, ad: 2 },
  { id: 'ad-vertex', x: 114.9, y: 50, z: 90, dir: '-x', w: 16, h: 8, ad: 1 },
  { id: 'ad-solaris', x: 75, y: 62, z: -129.9, dir: '+z', w: 22, h: 11, ad: 3 },
  { id: 'ad-tv-home', x: -97.45, y: 1.55, z: -78, dir: '+x', w: 1.1, h: 0.7, ad: 4 },
];
const shrineSpots = [[-66.3, -83], [-23.8, -41], [-66.3, 3], [-23.8, 31], [36.2, -83], [53.8, -41], [36.2, 31], [53.8, 69], [96.2, -123], [113.8, 3], [-86.3, -123], [-83.8, 69], [-24, -123], [14, 125]]
  .map(([x, z], i) => ({ id: `shrine-${i + 1}`, level: 'G', x, y: 0, z }));
shrineSpots.push({ id: 'shrine-l1-a', level: 'L1', x: 31, y: 12, z: -14 }, { id: 'shrine-l1-b', level: 'L1', x: 2, y: 12, z: -14 });
const searchlights = [
  { id: 'search-n1', x: -45, y: 164, z: -150, speed: 0.11, phase: 0 }, { id: 'search-s4', x: 135, y: 136, z: 90, speed: -0.09, phase: 2 },
  { id: 'search-e3', x: 135, y: 150, z: 30, speed: 0.08, phase: 4 }, { id: 'search-w2', x: -114, y: 123, z: -30, speed: -0.12, phase: 1 },
];
const statues = [[66, 38, -98], [124, 38, -98], [66, 38, -40], [124, 38, -40], [130, 38, -84], [190, 38, -39.5]].map(([x, y, z], i) => ({ id: `statue-${i + 1}`, x, y, z }));

const landmarks = [
  { id: 'rubble-field', name: 'Collapsed walkway rubble field', level: 'G', x: -44, y: 0, z: -30 },
  { id: 'dead-tree', name: 'Dead tree courtyard', level: 'G', x: -45, y: 0, z: 32 },
  { id: 'metro-a', name: 'Metro station (north entrance)', level: 'G', x: 45, y: 0, z: 6 },
  { id: 'metro-hall', name: 'Metro platforms', level: 'U', x: 33, y: -8, z: 10 },
  { id: 'market', name: 'Market skywalk and bazaar', level: 'L1', x: 15, y: 12, z: -28 },
  { id: 'cloverleaf', name: 'Cloverleaf flyover', level: 'L2', x: -15, y: 24, z: -60 },
  { id: 'control-tower', name: 'Control Tower', level: 'L3', x: 142, y: 38, z: -86 },
  { id: 'sunrise-bridge', name: 'Sunrise Bridge', level: 'L3', x: 185, y: 38, z: -30 },
  { id: 'breach-chamber', name: 'Breach chamber', level: 'U', x: -118, y: -8, z: -28 },
  { id: 'collapse-site', name: 'Collapse site (five fallen road decks)', level: 'G', x: -44, y: 0, z: -30 },
  { id: 'triage-tents', name: 'Triage tents and body area', level: 'G', x: -46, y: 0, z: 3 },
  { id: 'mithi-home', name: "Mithi's home", level: 'G', x: -94, y: 0, z: -78 },
  { id: 'neighbour-flat', name: "The dead neighbour's flat", level: 'G', x: -94, y: 0, z: -88 },
  { id: 'hospital', name: 'Sion General Hospital', level: 'G', x: -45, y: 0, z: 74.2 },
  { id: 'police-station', name: 'Police station', level: 'G', x: 18, y: 0, z: -79 },
  { id: 'maintenance-shaft', name: 'Maintenance shaft (stair to U)', level: 'G', x: 52, y: 0, z: -35 },
  { id: 'lift-wreck', name: 'Wrecked maintenance lift car', level: 'U', x: 55.5, y: -8, z: -24 },
  { id: 'catacombs', name: 'Catacomb homes', level: 'U', x: -98, y: -8, z: 22 },
  { id: 'boring-site', name: 'Tunnel-boring machine site', level: 'U', x: -80, y: -8, z: -49.5 },
  { id: 'underground-clinic', name: "Underground doctor's clinic", level: 'U', x: -21, y: -8, z: 77 },
  { id: 'vent-1', name: 'Air vent 1 (G exit)', level: 'G', x: -50, y: 0, z: -45.9 },
  { id: 'vent-3', name: 'Air vent 3 (G exit)', level: 'G', x: -15, y: 0, z: 89.8 },
  { id: 'bridge-checkpoint', name: 'Bridge checkpoint', level: 'L3', x: 157, y: 38, z: -30 },
  { id: 'bridge-permit-gate', name: 'Bridge permit gate (G quay)', level: 'G', x: 158, y: 0, z: -39 },
  { id: 'sea-west', name: 'West sea edge', level: 'G', x: -137, y: 0, z: 20 },
  { id: 'sea-south', name: 'South sea edge', level: 'G', x: 0, y: 0, z: 142 },
];

export const MAP = {
  name: 'Mumbai 2049',
  levels: Y, bounds, land, seaLevel: -2.4, spawn,
  towers, zones, streets, decks, stairs, ramps, lifts, gates, uFloors,
  deadTree, rubble, slumShacks, signs, buildings, uPartitions, ventSpots, doorDefs, metroGuardPosts, story, setuTimeline, adScreens, shrineSpots, searchlights, statues,
  sunShafts, solarLamps,
  breachChamber, controlTowerTerminal, sunriseBridgeEnd,
  setuSpots, vendorSpots, fragmentSpots, hazardZones, checkpoints, landmarks,
  // market stalls and other dressing zones used by the prop generator in city.js
  markets: [{ id: 'bazaar', ...rect(1, -48, 34, -12), y: 12 }, { id: 'terrace-c', ...rect(58, 14, 92, 48), y: 12 }],
  gardens: [rect(58, -108, 92, -72), rect(118, -108, 152, -72), rect(58, -48, 92, -12), rect(118, -48, 152, -12)],
};

export default MAP;
