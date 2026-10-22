// Shared helpers for the hazard modules (Phase 4). Pure functions plus tiny physics probes.
export const SIM_RADIUS = 120;                    // hazards farther than this from the player are asleep (not simulated, not drawn)
export const LEVEL_Y = Object.freeze({ U: -8, G: 0, L1: 12, L2: 24, L3: 38 });
export const LEVEL_ORDER = ['U', 'G', 'L1', 'L2', 'L3'];

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
export const hdist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export function angleDiff(from, to) { return Math.atan2(Math.sin(to - from), Math.cos(to - from)); }
export function turnToward(cur, want, maxStep) { return cur + clamp(angleDiff(cur, want), -maxStep, maxStep); }
/** Forward vector for a yaw (0 faces -Z, +yaw turns left), like the player. */
export function yawDir(yaw, out = { x: 0, z: 0 }) { out.x = -Math.sin(yaw); out.z = -Math.cos(yaw); return out; }
export function dirYaw(dx, dz) { return Math.atan2(-dx, -dz); }

const _o = { x: 0, y: 0, z: 0 }, _d = { x: 0, y: 0, z: 0 };
const blocksSight = (c) => c.solid;
/** True when nothing solid lies between the two points (they may be a little inside open air; endpoints are not tested). */
export function lineOfSight(game, ax, ay, az, bx, by, bz, slack = 0.35) {
  const dx = bx - ax, dy = by - ay, dz = bz - az, len = Math.hypot(dx, dy, dz);
  if (len < 0.05) return true;
  _o.x = ax; _o.y = ay; _o.z = az; _d.x = dx / len; _d.y = dy / len; _d.z = dz / len;
  const hit = game.physics.raycast(_o, _d, len, blocksSight);
  return !hit || hit.dist > len - slack;
}

/**
 * Is point (px,py,pz) inside the cone with apex (ox,oy,oz), unit axis (dx,dy,dz), half angle `half` (rad) and length `range`?
 * Returns the distance along the axis or -1.
 */
export function inCone(ox, oy, oz, dx, dy, dz, half, range, px, py, pz) {
  const vx = px - ox, vy = py - oy, vz = pz - oz, d = Math.hypot(vx, vy, vz);
  if (d > range || d < 1e-4) return d < 1e-4 ? 0 : -1;
  const cos = (vx * dx + vy * dy + vz * dz) / d;
  return cos >= Math.cos(half) ? d : -1;
}

/** Is there open walkable ground at (x,z) within `tol` of `homeY`? Returns the ground height or null. */
export function homeGround(game, x, z, homeY, tol = 0.3, radius = 0.3) {
  const gh = game.physics.groundHeightAt(x, z, homeY + tol, 0.2, radius);
  if (gh === -Infinity || Math.abs(gh - homeY) > tol) return null;
  return gh;
}

/** A random walkable spot within r of (cx,cz) at homeY (or null after a few tries). */
export function randomSpot(game, rng, cx, cz, r, homeY, tol = 0.3) {
  for (let i = 0; i < 24; i++) {
    const a = rng.range(0, Math.PI * 2), d = Math.sqrt(rng.next()) * r;
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    const gh = homeGround(game, x, z, homeY, tol, 0.45);
    if (gh !== null && !blockedAt(game, x, z, gh)) return { x, y: gh, z };
  }
  return null;
}

/** Is a solid body (taller than a step) standing on (x,z) at height y? */
export function blockedAt(game, x, z, y, r = 0.35) {
  const list = game.physics.query(x - r, z - r, x + r, z + r);
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (!c.solid || c.min.y >= y + 1.7) continue;
    if (c.max.y > y + 0.3 && c.max.y > y && c.min.y < y + 1.2) return true;
  }
  return false;
}

export function levelOfY(y) {
  let id = 'U';
  for (const k of LEVEL_ORDER) if (y >= LEVEL_Y[k] - 4) id = k;
  return id;
}
export const levelIndex = (y) => LEVEL_ORDER.indexOf(levelOfY(y));

/** Weather penalty on hearing and sight: drizzle on G is loud on the roofs. */
export function weatherMul(game, y) {
  const f = game.world?.fx?.rain;
  if (!f) return 1;
  const lvl = levelOfY(y);
  return lvl === 'G' ? 0.75 : lvl === 'L1' ? 0.92 : 1;
}

export function pointInRect(x, z, r, margin = 0) { return x >= r.x0 - margin && x <= r.x1 + margin && z >= r.z0 - margin && z <= r.z1 + margin; }
