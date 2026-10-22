// Poor air (PLAN 6). Visible brownish haze volumes from `world.hazardZones.smog` (soft billboard clouds, one draw call).
// Inside one: Mithi's darkness drain is x3 (HealthSystem reads `game.air.at(pos).smog`; this module is the air source),
// Setu's breath rate x2.5 (setu-schedule reads the same air value), and everyone coughs (`sound:emit` cough + captions).
// Per run the volumes grow by a seeded 0-3.5 m margin and vary in thickness. Dust from collapses (`h.dustAt`) is reported as
// `dust` for a while, which also hurts Setu's breath.
import { SIM_RADIUS, clamp, smoothstep, pointInRect, hdist } from './util.js';

const COUGHS = ['You cough. The air tastes of tar and old rain.', 'A rasp in your chest. You cough until your eyes water.', 'Every breath is warm, brown and thick.'];

export class Smog {
  constructor(h) { this.h = h; this.zones = []; this.inside = 0; this.coughT = 3; this.stats = { coughs: 0, secondsInside: 0 }; this.setuCoughT = 4; }

  init() {
    const { game } = this.h, rng = this.h.rng.fork('smog');
    this.rng = rng;
    for (const z of game.world.hazardZones.smog) {
      const grow = rng.range(0, 3.5), dens = rng.range(0.8, 1.15);
      const r = { x0: z.x0 - grow, x1: z.x1 + grow, z0: z.z0 - grow, z1: z.z1 + grow };
      const area = (r.x1 - r.x0) * (r.z1 - r.z0), hgt = Math.max(2, z.y1 - z.y0);
      const n = Math.round(clamp(area / 34, 10, 46) * dens);
      const puffs = [];
      for (let i = 0; i < n; i++) {
        puffs.push({
          x: rng.range(r.x0, r.x1), z: rng.range(r.z0, r.z1), y: z.y0 + 0.5 + rng.range(0, hgt - 1),
          size: rng.range(8, 14) * (hgt > 5 ? 1.15 : 0.95), spin: rng.range(0, 6.28), ph: rng.range(0, 6.28), dr: rng.range(0.15, 0.35), amp: rng.range(0.8, 2.4),
        });
      }
      this.zones.push({ id: z.id, level: z.level, def: z, rect: r, y0: z.y0, y1: z.y1, dens, puffs, loop: false, cx: (r.x0 + r.x1) / 2, cz: (r.z0 + r.z1) / 2, cy: (z.y0 + z.y1) / 2 });
    }
    // overlay: a brown vignette while inside
    const el = this.el = document.createElement('div');
    el.id = 'fx-smog';
    el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:7;opacity:0;transition:opacity 1.1s ease;background:radial-gradient(ellipse at 50% 55%, rgba(110,72,28,.10) 0%, rgba(96,60,20,.34) 70%, rgba(70,40,12,.55) 100%);mix-blend-mode:normal';
    document.body.appendChild(el);
    // the air source: the default zone rects in air.js defer to this
    this.smogAt = (pos, out) => {
      if (!this.on) return;
      for (const z of this.zones) if (pointInRect(pos.x, pos.z, z.rect) && pos.y >= z.y0 - 0.5 && pos.y <= z.y1) { out.smog = 1; break; }
      const da = this.h.dustAt;
      if (da && this.h.game.clock && this.h.game.clock.t < this.h.dustUntil && hdist(pos, da) < da.r && Math.abs(pos.y) < 6) out.dust = Math.max(out.dust, 0.8);
    };
    this.on = true;
  }

  zoneAt(pos) {
    for (const z of this.zones) if (pointInRect(pos.x, pos.z, z.rect) && pos.y >= z.y0 - 0.5 && pos.y <= z.y1) return z;
    return null;
  }

  update(dt) {
    const h = this.h, p = h.pp, cam = h.game.camera.position, t = h.game.time, vis = h.vis.puffs;
    const inZone = this.zoneAt(p);
    this.inside += ((inZone ? 1 : 0) - this.inside) * Math.min(1, dt * 2);
    this.el.style.opacity = this.inside > 0.05 ? String(clamp(this.inside, 0, 1)) : '0';
    if (inZone) {
      this.stats.secondsInside += dt;
      this.coughT -= dt;
      if (this.coughT <= 0) {
        this.coughT = this.rng.range(3.2, 6.2);
        this.stats.coughs++;
        h.sound('cough', { x: p.x, y: p.y + 1.5, z: p.z }, 0.7);
        h.shake(0.12, 0.25);
        if (this.rng.chance(0.4)) h.say(this.rng.pick(COUGHS), 'story', 4); else h.nearCaption(p, '[cough]', 99);
      }
    } else this.coughT = Math.min(this.coughT, 2.5);
    const su = h.setuTarget();
    if (su && h.game.setu?.following) {
      const z = this.zoneAt(su);
      if (z) {
        this.setuCoughT -= dt;
        if (this.setuCoughT <= 0) {
          this.setuCoughT = this.rng.range(3, 6);
          h.sound('cough', { x: su.x, y: su.y + 0.9, z: su.z }, 0.6);
          if (this.rng.chance(0.5)) h.say('Setu coughs, a thin whistling sound. "Didi, the air is bad."', 'story', 5);
        }
      }
    }
    for (const z of this.zones) {
      const dh = hdist({ x: z.cx, z: z.cz }, p);
      const far = dh - Math.max(z.rect.x1 - z.rect.x0, z.rect.z1 - z.rect.z0) * 0.5;
      this._loop(z, far < 45 ? true : far > 70 ? false : z.loop);
      if (far > 110) continue;
      for (const q of z.puffs) {
        const x = q.x + Math.sin(t * q.dr + q.ph) * q.amp, y = q.y + Math.sin(t * q.dr * 0.7 + q.ph * 2) * 0.35, zz = q.z + Math.cos(t * q.dr * 0.8 + q.ph) * q.amp;
        const dx = x - cam.x, dy = y - cam.y, dz = zz - cam.z, d = Math.hypot(dx, dy, dz);
        const f = smoothstep(2.5, 9, d) * (1 - smoothstep(60, 110, d)) * (0.85 + 0.15 * Math.sin(t * 0.6 + q.ph));
        if (f < 0.01) continue;
        // sodium-lit brown, brighter in the dark below
        vis.add(x, y, zz, q.size, 0.115 * f * z.dens, 0.068 * f * z.dens, 0.028 * f * z.dens, q.spin + t * 0.02);
      }
    }
  }

  _loop(z, on) {
    const ev = this.h.game.events;
    if (on && !z.loop) { z.loop = true; ev.emit('sound:loop', { id: `smog-wind:${z.id}`, kind: 'smog-wind', loudness: 0.35, getPos: () => ({ x: z.cx, y: z.cy, z: z.cz }) }); }
    else if (!on && z.loop) { z.loop = false; ev.emit('sound:loopStop', { id: `smog-wind:${z.id}` }); }
  }

  list(out) {
    const p = this.h.pp;
    for (const z of this.zones) if (hdist({ x: z.cx, z: z.cz }, p) < SIM_RADIUS) out.push({ id: z.id, kind: 'smog', pos: { x: z.cx, y: z.cy, z: z.cz }, alert: this.zoneAt(p) === z ? 1 : 0, state: 'haze' });
  }
  setEnabled(on) { this.on = on; if (!on) { this.el.style.opacity = '0'; for (const z of this.zones) this._loop(z, false); } }
  snapshot() { return { zones: this.zones.length, inside: !!this.zoneAt(this.h.pp), density: +this.inside.toFixed(2), zone: this.zoneAt(this.h.pp)?.id ?? null, stats: { ...this.stats, secondsInside: +this.stats.secondsInside.toFixed(1) } }; }
  clear() {}
}
