// Phase 1 test arena: proves the controller (step-up, ramp, stairs, lift, jump, fall damage).
// Layout (x east, -z "north"; the player spawns at (0,0,18) looking north):
//   z=5..8    row of step-up test boxes 0.25 / 0.5 / 0.9 / 1.4 / 2.2 m high (x = -8,-4,0,4,8)
//   x=-14     ramp north from z=-8 (y 0) to z=-26 (y 4.8), onto platform A
//   x=16      stairs north from z=-8 (16 steps) onto landing B (y 4.8)
//   x=0       lift at z=-30.5 between ground and the bridge (y 4.8); bridge links A and B
//   x=34..46  tower, top y=12, reached by a second flight of stairs from landing B (fall-damage ledge)
// The map is hand-fixed (not seeded), like the real city.
import * as THREE from 'three';
import { Builder } from './builder.js';

const GROUND = 0x6b8483;

export const arenaSystem = {
  init(game) {
    game.world = {
      name: 'arena',
      spawn: { x: 0, y: 0, z: 18, yaw: 0 },
      bounds: { minX: -60, maxX: 60, minZ: -60, maxZ: 60 },
    };
    game.sky.setPalette({});
    const b = new Builder(game);

    // ---- ground + perimeter walls
    b.box([-60, -2, -60], [60, 0, 60], { color: GROUND, tag: 'floor' });
    const wall = { color: 0x55656a, tag: "wall" };
    b.box([-62, -2, -62], [62, 12, -60], wall); b.box([-62, -2, 60], [62, 12, 62], wall);
    b.box([-62, -2, -60], [-60, 12, 60], wall); b.box([60, -2, -60], [62, 12, 60], wall);

    // ---- lane markings (visual only)
    const mark = { mat: 'emissive', color: 0x7a6a30, solid: false, walkable: false };
    for (let z = 16; z > -26; z -= 4) b.box([-0.12, 0, z - 1], [0.12, 0.02, z], mark);
    for (const x of [-14, 16]) for (let z = 0; z > -8; z -= 2) b.box([x - 0.1, 0, z - 1], [x + 0.1, 0.02, z], mark);

    // ---- step-up test row
    [0.25, 0.5, 0.9, 1.4, 2.2].forEach((h, i) => {
      const x = -8 + i * 4;
      b.box([x - 1, 0, 5], [x + 1, h, 8], { color: [0x8a8f7a, 0x7d8f7a, 0x9a8a6a, 0x8a7a8f, 0x6f7f9a][i], tag: `step-${h}` });
    });

    // ---- ramp A and its platform
    b.ramp({ x0: -16, z0: -26, x1: -12, z1: -8, dir: '-z', yLow: 0, yHigh: 4.8, bottom: 0 }, { color: 0xb08a4a, tag: 'ramp' });
    b.box([-20, 3.8, -38], [-8, 4.8, -26], { color: 0x56606a, tag: 'platformA' });

    // ---- stairs 1 and landing B
    b.stairs({ x: 16, z: -8, y: 0, dir: '-z', steps: 16, rise: 0.3, run: 0.5, width: 4, color: 0x8d8070 });
    b.box([10, 3.8, -38], [22, 4.8, -16], { color: 0x56606a, tag: 'landingB' });

    // ---- bridge between A and B with rails (gap in the south rail for the lift exit)
    b.box([-8, 4.0, -36], [10, 4.8, -32], { color: 0x5d6670, tag: 'bridge' });
    const rail = { color: 0x9aa4a8, tag: 'rail' };
    b.box([-8, 4.8, -36], [10, 5.8, -35.8], rail);
    b.box([-8, 4.8, -32.2], [-2, 5.8, -32], rail); b.box([2, 4.8, -32.2], [10, 5.8, -32], rail);

    // ---- support pillars
    for (const [x, z] of [[-19, -37], [-9, -37], [-19, -27], [-9, -27], [11, -37], [21, -37], [11, -17], [21, -17], [-4, -34], [4, -34]]) {
      b.box([x - 0.4, 0, z - 0.4], [x + 0.4, 3.8, z + 0.4], { color: 0x454f55, tag: 'pillar' });
    }

    // ---- lift + guide posts with beacons
    game.lifts.add({ id: 'arena-lift', center: [0, -30.5], size: [3, 3], yBottom: 0.1, yTop: 4.8, speed: 2.5, dwell: 3, auto: true });
    for (const sx of [-1, 1]) {
      for (const z of [-28.85, -32.15]) {
        b.box([sx * 1.65 - 0.15, 0, z - 0.15], [sx * 1.65 + 0.15, 6.2, z + 0.15], { color: 0x3a444a, tag: 'lift-post' });
        b.box([sx * 1.65 - 0.2, 6.2, z - 0.2], [sx * 1.65 + 0.2, 6.5, z + 0.2], { mat: 'emissive', color: 0xffb347, solid: false, walkable: false });
      }
    }

    // ---- stairs 2 up to the tall tower ledge
    b.stairs({ x: 22, z: -28, y: 4.8, dir: '+x', steps: 24, rise: 0.3, run: 0.5, width: 4, bottom: 0, color: 0x7a7468 });
    b.box([34, 0, -38], [46, 12, -18], { mat: 'building', color: 0x4d535c, tag: 'tower' });
    // tower roof edge trim (visual) to make the ledge readable
    b.box([34, 12, -18.2], [46, 12.08, -18], { mat: 'emissive', color: 0xffb347, solid: false, walkable: false });

    // ---- street lamps near the spawn
    for (const [x, z] of [[-6, 14], [6, 14], [-6, 0], [6, 0], [-20, -2], [24, -2]]) {
      b.box([x - 0.08, 0, z - 0.08], [x + 0.08, 3.2, z + 0.08], { color: 0x2c3438, tag: 'lamp', solid: false, walkable: false });
      b.box([x - 0.3, 3.2, z - 0.3], [x + 0.3, 3.4, z + 0.3], { mat: 'emissive', color: 0xffc46b, solid: false, walkable: false });
    }

    // ---- backdrop towers (visual only), fixed layout so the map is identical every run
    let s = 12345; const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2 + rnd() * 0.1, r = 78 + rnd() * 30;
      const w = 10 + rnd() * 14, d = 10 + rnd() * 14, h = 50 + rnd() * 80;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      b.box([x - w / 2, -2, z - d / 2], [x + w / 2, h, z + d / 2], { mat: 'building', color: 0x3c4249, solid: false, walkable: false });
    }

    b.finish('arena');
  },
};
