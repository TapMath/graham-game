// Collision world: custom, tiny, no dependencies.
//
// Colliders are plain records (see _make) of two kinds:
//   box  - an AABB. Its top face (max.y) is walkable; its sides block horizontal movement.
//   ramp - a box footprint whose top surface rises linearly from yLow to yHigh along one axis.
// Both can be solid (blocks), walkable (can be stood on), or both (default).
//
// Static colliders live in a uniform XZ grid (spatial hash), so thousands of boxes are cheap:
// a query only touches the few cells under the player. Colliders bigger than
// `maxCellsPerCollider` cells (a huge floor) go in a short `large` list scanned every query.
//
// Dynamic colliders (lifts, collapsing slabs) are created with {dynamic:true}; they are NOT in
// the grid, they live in a short list and are moved with world.setOffset(). `collider.pos` is the
// accumulated translation from the creation position, which is how the player knows how far a
// platform moved while it stood on it (see Player.update). Static colliders can still be
// removed or toggled at any time (remove / setEnabled), e.g. a gate that opens.
//
// Player shape: a 0.35 m radius, 1.7 m tall cylinder treated as an AABB.

export const PLAYER = Object.freeze({
  radius: 0.35,
  height: 1.7,
  eye: 1.6,
  stepHeight: 0.6,  // max ledge walked up without jumping
  airStep: 0.12,    // tolerance while airborne (no stepping up in mid-air)
});

const EPS = 1e-4;
let nextId = 1;

export class PhysicsWorld {
  constructor({ cellSize = 8, maxCellsPerCollider = 64 } = {}) {
    this.cellSize = cellSize;
    this.inv = 1 / cellSize;
    this.maxCells = maxCellsPerCollider;
    this.grid = new Map();   // cell key -> Collider[]
    this.large = [];         // static colliders spanning too many cells
    this.dynamic = [];       // movable colliders
    this.count = 0;          // number of live colliders
    this.killY = -40;        // below this the player is "out of the world" (void / sea)
    this.groundCollider = null; // set by groundHeightAt: the collider that produced the result
    this.hitX = false;       // set by slideMove: did the move get blocked on that axis
    this.hitZ = false;
    this._stamp = 0;
    this._out = [];
  }

  // ---------------------------------------------------------------- creation

  /**
   * Add an AABB. min/max are [x,y,z]. opts: {solid=true, walkable=true, dynamic=false, tag='', userData}
   * Returns the collider record.
   */
  addBox(min, max, opts = {}) {
    return this._register(this._make('box', min, max, opts));
  }

  /**
   * Add a ramp. {x0,z0,x1,z1} footprint, dir '+x'|'-x'|'+z'|'-z' = direction the surface RISES,
   * yLow = surface height at the low edge, yHigh = at the high edge, bottom = underside (default yLow).
   */
  addRamp({ x0, z0, x1, z1, dir, yLow, yHigh, bottom }, opts = {}) {
    const bot = bottom ?? Math.min(yLow, yHigh);
    const c = this._make('ramp', [Math.min(x0, x1), bot, Math.min(z0, z1)], [Math.max(x0, x1), Math.max(yLow, yHigh), Math.max(z0, z1)], opts);
    c.ramp = { axis: dir[1], sign: dir[0] === '-' ? -1 : 1, yLow, yHigh };
    return this._register(c);
  }

  _make(type, min, max, opts) {
    return {
      id: nextId++, type, tag: opts.tag ?? '',
      solid: opts.solid ?? true, walkable: opts.walkable ?? true,
      dynamic: !!opts.dynamic, enabled: true, removed: false, userData: opts.userData ?? null,
      min: { x: min[0], y: min[1], z: min[2] }, max: { x: max[0], y: max[1], z: max[2] },
      baseMin: { x: min[0], y: min[1], z: min[2] }, baseMax: { x: max[0], y: max[1], z: max[2] },
      pos: { x: 0, y: 0, z: 0 },   // accumulated translation (dynamic colliders)
      ramp: null, stamp: 0, cells: null, large: false,
    };
  }

  _key(ix, iz) { return (ix + 32768) * 65536 + (iz + 32768); }

  _register(c) {
    this.count++;
    if (c.dynamic) { this.dynamic.push(c); return c; }
    const inv = this.inv;
    const ix0 = Math.floor(c.min.x * inv), ix1 = Math.floor(c.max.x * inv);
    const iz0 = Math.floor(c.min.z * inv), iz1 = Math.floor(c.max.z * inv);
    if ((ix1 - ix0 + 1) * (iz1 - iz0 + 1) > this.maxCells) { c.large = true; this.large.push(c); return c; }
    c.cells = [];
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const k = this._key(ix, iz);
        let list = this.grid.get(k);
        if (!list) this.grid.set(k, (list = []));
        list.push(c);
        c.cells.push(k);
      }
    }
    return c;
  }

  /** Permanently remove a collider (static or dynamic). */
  remove(c) {
    if (c.removed) return;
    c.removed = true; c.enabled = false; this.count--;
    const drop = (arr) => { const i = arr.indexOf(c); if (i >= 0) arr.splice(i, 1); };
    if (c.dynamic) drop(this.dynamic);
    else if (c.large) drop(this.large);
    else for (const k of c.cells) { const l = this.grid.get(k); if (l) { drop(l); if (!l.length) this.grid.delete(k); } }
  }

  /** Temporarily switch a collider off/on without touching the grid (gates, retracted bridges). */
  setEnabled(c, on) { c.enabled = on; }

  /** Move a dynamic collider to base position + (x,y,z). Updates bounds and `pos`. */
  setOffset(c, x, y, z) {
    if (!c.dynamic) throw new Error('setOffset needs a collider created with {dynamic:true}');
    c.pos.x = x; c.pos.y = y; c.pos.z = z;
    c.min.x = c.baseMin.x + x; c.min.y = c.baseMin.y + y; c.min.z = c.baseMin.z + z;
    c.max.x = c.baseMax.x + x; c.max.y = c.baseMax.y + y; c.max.z = c.baseMax.z + z;
  }

  // ---------------------------------------------------------------- queries

  /**
   * Enabled colliders whose XZ bounds overlap the rectangle.
   * WARNING: returns a shared array that is overwritten by the next query/raycast call.
   */
  query(minX, minZ, maxX, maxZ) {
    const out = this._out; out.length = 0;
    const stamp = ++this._stamp, inv = this.inv, grid = this.grid;
    const ix0 = Math.floor(minX * inv), ix1 = Math.floor(maxX * inv);
    const iz0 = Math.floor(minZ * inv), iz1 = Math.floor(maxZ * inv);
    const take = (c) => {
      if (c.stamp === stamp || !c.enabled) return;
      c.stamp = stamp;
      if (c.min.x < maxX && c.max.x > minX && c.min.z < maxZ && c.max.z > minZ) out.push(c);
    };
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const list = grid.get(this._key(ix, iz));
        if (list) for (let i = 0; i < list.length; i++) take(list[i]);
      }
    }
    for (let i = 0; i < this.large.length; i++) take(this.large[i]);
    for (let i = 0; i < this.dynamic.length; i++) take(this.dynamic[i]);
    return out;
  }

  /** Surface height of a ramp at (x,z) (clamped to the footprint); box: its top. */
  surfaceHeightAt(c, x, z) {
    if (!c.ramp) return c.max.y;
    const r = c.ramp;
    let t;
    if (r.axis === 'z') {
      const len = c.max.z - c.min.z;
      const u = Math.min(Math.max(z, c.min.z), c.max.z);
      t = (r.sign > 0 ? u - c.min.z : c.max.z - u) / len;
    } else {
      const len = c.max.x - c.min.x;
      const u = Math.min(Math.max(x, c.min.x), c.max.x);
      t = (r.sign > 0 ? u - c.min.x : c.max.x - u) / len;
    }
    return c.pos.y + r.yLow + (r.yHigh - r.yLow) * t;
  }

  /** Highest top surface of c under the rectangle (rect must overlap c in XZ). */
  surfaceTop(c, minX, minZ, maxX, maxZ) {
    if (!c.ramp) return c.max.y;
    const x0 = Math.max(minX, c.min.x), x1 = Math.min(maxX, c.max.x);
    const z0 = Math.max(minZ, c.min.z), z1 = Math.min(maxZ, c.max.z);
    return Math.max(this.surfaceHeightAt(c, x0, z0), this.surfaceHeightAt(c, x1, z1));
  }

  /**
   * Height of the highest walkable surface under a player footprint at (x,z) that is
   * <= feetY + step. Returns -Infinity if there is none. The collider that supplied it is left
   * in world.groundCollider.
   */
  groundHeightAt(x, z, feetY, step = PLAYER.stepHeight, radius = PLAYER.radius) {
    const minX = x - radius, maxX = x + radius, minZ = z - radius, maxZ = z + radius;
    const list = this.query(minX, minZ, maxX, maxZ);
    let best = -Infinity, bestC = null;
    const limit = feetY + step + EPS;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!c.walkable) continue;
      const h = this.surfaceTop(c, minX, minZ, maxX, maxZ);
      if (h <= limit && h > best) { best = h; bestC = c; }
    }
    this.groundCollider = bestC;
    return best;
  }

  /**
   * Lowest underside above the head, between oldHeadY and newHeadY, under the footprint
   * (used to stop jumps). Returns Infinity if nothing is hit.
   */
  ceilingAt(x, z, oldHeadY, newHeadY, radius = PLAYER.radius) {
    const list = this.query(x - radius, z - radius, x + radius, z + radius);
    let best = Infinity;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!c.solid) continue;
      if (c.min.y >= oldHeadY - EPS && c.min.y < newHeadY && c.min.y < best) best = c.min.y;
    }
    return best;
  }

  /**
   * Move the footprint centre p ({x,z}) by (dx,dz), sliding along solids. A solid blocks if it
   * overlaps the player's vertical span [feetY, feetY+height] and its top is above feetY+stepH
   * (lower tops are walked over). Axes are resolved separately so you slide along walls.
   * Sets world.hitX / world.hitZ.
   */
  slideMove(p, dx, dz, feetY, stepH = PLAYER.stepHeight) {
    p.x += dx;
    this.hitX = dx !== 0 && this._push(p, true, dx, feetY, stepH);
    p.z += dz;
    this.hitZ = dz !== 0 && this._push(p, false, dz, feetY, stepH);
  }

  _push(p, isX, d, feetY, stepH) {
    const r = PLAYER.radius, headY = feetY + PLAYER.height;
    const list = this.query(p.x - r, p.z - r, p.x + r, p.z + r);
    let hit = false;
    for (let i = 0; i < list.length; i++) {
      const c = list[i];
      if (!c.solid || c.min.y >= headY - EPS) continue;
      const minX = p.x - r, maxX = p.x + r, minZ = p.z - r, maxZ = p.z + r;
      if (!(c.min.x < maxX - EPS * 0.1 && c.max.x > minX + EPS * 0.1 && c.min.z < maxZ - EPS * 0.1 && c.max.z > minZ + EPS * 0.1)) continue;
      if (this.surfaceTop(c, minX, minZ, maxX, maxZ) <= feetY + stepH + EPS) continue;
      const lo = isX ? c.min.x - r - EPS : c.min.z - r - EPS;   // player ends up on the low side
      const hi = isX ? c.max.x + r + EPS : c.max.z + r + EPS;   // or the high side
      const cur = isX ? p.x : p.z;
      let to;
      if (d > 0) to = lo; else if (d < 0) to = hi; else to = Math.abs(cur - lo) < Math.abs(cur - hi) ? lo : hi;
      if (isX) p.x = to; else p.z = to;
      hit = true;
    }
    return hit;
  }

  /**
   * Cast a ray against all colliders. o, d: {x,y,z}, d must be normalised.
   * Returns {dist, collider, point:{x,y,z}} or null. Ramps are tested against their real surface.
   * Use for line of sight (drones, dogs, camera cones) and picking.
   */
  raycast(o, d, maxDist = 100, filter = null) {
    let best = null;
    const stamp = ++this._stamp;
    const test = (c) => {
      if (c.stamp === stamp || !c.enabled) return;
      c.stamp = stamp;
      if (filter && !filter(c)) return;
      const t = this._rayBox(o, d, c, maxDist);
      if (t !== null && (!best || t < best.dist)) {
        best = { dist: t, collider: c, point: { x: o.x + d.x * t, y: o.y + d.y * t, z: o.z + d.z * t } };
      }
    };
    for (const c of this.large) test(c);
    for (const c of this.dynamic) test(c);

    const cs = this.cellSize;
    let ix = Math.floor(o.x * this.inv), iz = Math.floor(o.z * this.inv);
    const sx = d.x > 0 ? 1 : -1, sz = d.z > 0 ? 1 : -1;
    const tdx = d.x !== 0 ? cs / Math.abs(d.x) : Infinity, tdz = d.z !== 0 ? cs / Math.abs(d.z) : Infinity;
    let tmx = d.x !== 0 ? ((sx > 0 ? ix + 1 : ix) * cs - o.x) / d.x : Infinity;
    let tmz = d.z !== 0 ? ((sz > 0 ? iz + 1 : iz) * cs - o.z) / d.z : Infinity;
    for (let guard = 0; guard < 2048; guard++) {
      const list = this.grid.get(this._key(ix, iz));
      if (list) for (let i = 0; i < list.length; i++) test(list[i]);
      const tExit = Math.min(tmx, tmz);
      if ((best && best.dist <= tExit) || tExit > maxDist) break;
      if (tmx < tmz) { ix += sx; tmx += tdx; } else { iz += sz; tmz += tdz; }
    }
    return best;
  }

  _rayBox(o, d, c, maxDist) {
    let t0 = 0, t1 = maxDist;
    for (const a of ['x', 'y', 'z']) {
      const lo = c.min[a], hi = c.max[a];
      if (Math.abs(d[a]) < 1e-9) { if (o[a] < lo || o[a] > hi) return null; continue; }
      let ta = (lo - o[a]) / d[a], tb = (hi - o[a]) / d[a];
      if (ta > tb) { const s = ta; ta = tb; tb = s; }
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) return null;
    }
    if (!c.ramp) return t0;
    // Ramp: march inside the box until the ray dips below the sloped surface.
    for (let t = t0; t <= t1; t += 0.2) {
      const x = o.x + d.x * t, z = o.z + d.z * t, y = o.y + d.y * t;
      if (y <= this.surfaceHeightAt(c, x, z)) return t;
    }
    return null;
  }
}
