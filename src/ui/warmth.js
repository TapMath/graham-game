// The warmth cue: Mithi feels the heat of the sun on her skin, so the screen edge glows, softly, on the side where the nearest
// reachable light is, and glows more the closer she gets. It never says "go there"; it is a feeling.
//
// "Reachable" is the same level (the nearest lit shaft, or at night the nearest solar lamp), or else a known way up: the nearest stairs,
// ramp or lift that leads upward from this level (the underground has no light of its own; its stairs lead to the street). Routes whose
// gate would refuse you (fewer rays than it asks, or no permit) come last. Nothing shows while you stand in the light.
//
//   warmth.target      {kind:'shaft'|'lamp'|'route', id, x, z, level, dist, ...} or null
//   warmth.bearing     degrees from the view direction, clockwise (0 = straight ahead, 90 = on the right), or null
//   warmth.strength    0..1 how strong the glow is (distance and how few rays are left)
//   warmth.snapshot()  the plain object `state().map.warmth` prints
import { sunSources } from './mapdata.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export class Warmth {
  constructor(game) {
    this.game = game;
    this.target = null; this.bearing = null; this.world = null; this.strength = 0; this.alpha = 0; this.dist = null;
    this._prev = null; this._t = 0;
    const root = document.getElementById('hud');
    this.el = document.createElement('div'); this.el.className = 'warmth'; this.el.hidden = true; this.el.setAttribute('aria-hidden', 'true');
    this.arc = document.createElement('i'); this.arc.className = 'w-arc'; this.glow = document.createElement('i'); this.glow.className = 'w-glow';
    this.el.append(this.glow, this.arc);
    root.appendChild(this.el);
  }

  /** The nearest reachable light for a player standing at (x, z) on `level`. */
  pick(x, z, level, rays) {
    const g = this.game, w = g.world;
    const src = sunSources(w, level);
    let best = null, bd = Infinity;
    for (const s of src) {
      const d = Math.max(0, Math.hypot(s.x - x, s.z - z) - s.r);
      const bias = this._prev && this._prev.id === s.id ? 0.85 : 1;                       // stick with the last target unless another is clearly nearer
      if (d * bias < bd) { bd = d * bias; best = { kind: s.kind, id: s.id, x: s.x, z: s.z, level, dist: d }; }
    }
    if (best) return best;
    // no light on this level: the nearest way up that you can actually take
    const routes = (w.upRoutes ?? []).filter((r) => r.from === level);
    const can = (r) => !r.gate || (r.min > 0 ? rays >= r.min : (r.gate === 'gate-bridge' ? !!g.flags.bridgePermit : true));
    for (const pass of [true, false]) {
      for (const r of routes) {
        if (pass && !can(r)) continue;
        const d = Math.hypot(r.x - x, r.z - z);
        const bias = this._prev && this._prev.id === r.id ? 0.85 : 1;
        if (d * bias < bd) { bd = d * bias; best = { kind: 'route', id: r.id, x: r.x, z: r.z, level, dist: d, via: r.kind, to: r.to, gate: r.gate }; }
      }
      if (best) break;
    }
    return best;
  }

  /** Recompute from the player's position and the view direction (radians, 0 faces -Z, + turns left). */
  compute(yaw) {
    const g = this.game, p = g.player;
    const level = p.level, rays = p.rays;
    const inSun = !!g.world.isInSunlight?.(p.pos) || (g.world.sunShafts.intensity < 0.6 && !!g.world.isNearSolarLamp?.(p.pos));   // a solar lamp's glow counts at night
    const t = this.pick(p.pos.x, p.pos.z, level, rays);
    this._prev = t;
    this.target = t;
    if (!t) { this.bearing = this.world = this.dist = null; this.strength = 0; this.alpha = 0; return; }
    const dx = t.x - p.pos.x, dz = t.z - p.pos.z;
    const sx = dx * Math.cos(yaw) - dz * Math.sin(yaw), sy = dx * Math.sin(yaw) + dz * Math.cos(yaw);   // right and down on a rotated map
    this.bearing = Math.atan2(sx, -sy) * 180 / Math.PI;
    this.world = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;                                      // compass bearing from north, clockwise
    this.dist = t.dist;
    const near = 1 - smooth(5, 170, t.dist);
    const kind = t.kind === 'shaft' ? 1 : t.kind === 'lamp' ? 0.7 : 0.78;
    this.strength = clamp(0.16 + 0.84 * near, 0, 1) * kind;
    const need = clamp(0.42 + 0.58 * (1 - (rays - 2) / 8), 0.42, 1);                                     // a quiet glow when she is well, a stronger one when she is low
    this.alpha = inSun ? 0 : this.strength * need;
    this.inSun = inSun;
  }

  /** Move the glow to the screen edge (a rounded ellipse inset from the border). */
  paint() {
    const el = this.el, vis = this.alpha > 0.03 && this.bearing !== null;
    if (el.hidden === vis) el.hidden = !vis;
    if (!vis) return;
    const W = window.innerWidth, H = window.innerHeight, b = this.bearing * Math.PI / 180;
    const sn = Math.sin(b), cs = Math.cos(b);
    // where a ray from the middle of the screen in that direction leaves the screen, and the (rounded) outward normal there
    const rx = W / 2, ry = H / 2, t = Math.min(Math.abs(sn) > 1e-6 ? rx / Math.abs(sn) : Infinity, Math.abs(cs) > 1e-6 ? ry / Math.abs(cs) : Infinity);
    const nx0 = sn / rx, ny0 = -cs / ry, nl = Math.hypot(nx0, ny0) || 1, nx = nx0 / nl, ny = ny0 / nl;
    const len = clamp(Math.min(W, H) * (0.3 + 0.2 * this.strength), 130, 340), thick = clamp(Math.min(W, H) * 0.045 + 20 * this.strength, 30, 64);
    const ex = rx + sn * t - nx * thick * 0.42, ey = ry - cs * t - ny * thick * 0.42;     // the bright rim sits on the edge of the screen
    const theta = Math.atan2(-nx, ny);
    el.style.setProperty('--wl', len.toFixed(0) + 'px'); el.style.setProperty('--wt', thick.toFixed(0) + 'px');
    el.style.setProperty('--wa', this.alpha.toFixed(3));
    el.style.transform = `translate(${ex.toFixed(1)}px, ${ey.toFixed(1)}px) rotate(${theta.toFixed(4)}rad)`;
    el.dataset.kind = this.target.kind;
  }

  snapshot() {
    const t = this.target, r1 = (v) => (v === null ? null : Math.round(v * 10) / 10);
    return t ? {
      kind: t.kind, id: t.id, level: t.level, x: r1(t.x), z: r1(t.z), dist: r1(this.dist), bearingDeg: r1(this.bearing), worldBearingDeg: r1(this.world),
      strength: Math.round(this.strength * 100) / 100, alpha: Math.round(this.alpha * 100) / 100, inSun: !!this.inSun, shown: !this.el.hidden, via: t.via ?? null, to: t.to ?? null,
    } : null;
  }
}
