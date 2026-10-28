// The seeded density field: green is a privilege of height, wealth (New Wadala) and sunlight, and it comes in patches.
//   lushness(x, z, y)  0..1: how green this spot is allowed to be
// plus a few deterministic helpers (hash noise, a small PRNG). Nothing here touches game.rng: the city is the same every run.

export function mulberry(seed) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = Math.imul(s ^ (s >>> 15), s | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export function hash2(ix, iz, seed = 0) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iz, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

const fade = (t) => t * t * (3 - 2 * t);
export function vnoise(x, z, seed = 0) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = fade(x - ix), fz = fade(z - iz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed), c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
export const fbm = (x, z, seed = 0) => 0.55 * vnoise(x / 46, z / 46, seed) + 0.3 * vnoise(x / 17, z / 17, seed + 7) + 0.15 * vnoise(x / 6, z / 6, seed + 13);

const sstep = (a, b, t) => { const k = Math.max(0, Math.min(1, (t - a) / (b - a))); return k * k * (3 - 2 * k); };

/** The centre of the elite district (New Wadala: the L3 podiums and the glass towers). */
export const ELITE = { x: 105, z: -62 };

export class DensityField {
  constructor(seed, shafts = []) {
    this.seed = seed;
    this.shafts = shafts;       // [{x,z,r,y0}] sunlight shafts: green gathers where the light falls
  }

  /** how close to light (1 inside a shaft, falling off over ~14 m) */
  sunNear(x, z, y) {
    let best = 0;
    for (const s of this.shafts) {
      if (Math.abs(s.y0 - y) > 14) continue;
      const d = Math.hypot(x - s.x, z - s.z);
      best = Math.max(best, Math.exp(-Math.pow(Math.max(0, d - s.r) / 14, 2)));
    }
    return best;
  }

  /** 0..1 */
  lushness(x, z, y) {
    const height = sstep(26, 40, y);                                      // L3 and above: 1, L2: a few, below: 0
    const wealth = 0.3 + 0.7 * (1 - sstep(60, 150, Math.hypot(x - ELITE.x, (z - ELITE.z) * 0.8)));
    const patch = sstep(0.34, 0.66, fbm(x, z, this.seed));                // clustered: some spots lush, most bare
    const sun = this.sunNear(x, z, y);
    return Math.max(0, Math.min(1, height * wealth * (0.25 + 0.75 * patch) * (0.8 + 0.4 * sun) + 0.12 * sun * height));
  }
}
