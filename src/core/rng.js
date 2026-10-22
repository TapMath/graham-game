// Seeded PRNG (mulberry32) plus the small helpers every system needs.
// Use game.rng.fork('name') to give each system its own stream, so adding a roll
// in one system never changes what another system rolls for the same seed.

export function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}

export class Rng {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.state = this.seed;
  }
  /** Uniform float in [0, 1). */
  next() {
    let t = (this.state += 0x6d2b79f5) >>> 0;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** Float in [a, b). */
  range(a, b) { return a + (b - a) * this.next(); }
  /** Integer in [a, b] inclusive. */
  int(a, b) { return a + Math.floor(this.next() * (b - a + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  /** True with probability p. */
  chance(p) { return this.next() < p; }
  /** Fisher-Yates; returns a new array. */
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  /** Independent child stream, deterministic for (seed, label). */
  fork(label) { return new Rng((this.seed ^ hashString(String(label))) >>> 0); }
}

export function createRng(seed) { return new Rng(seed); }
