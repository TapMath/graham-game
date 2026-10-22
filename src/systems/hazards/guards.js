// Metro guards (PLAN 6, 1b). Low-poly figures with torches at `world.metroGuardPosts`, each with a sweeping view cone.
//
// Without the disguise (game.flags.jacket, or Mithi wearing the jacket variant):
//   seen near the metro  -> "Oi! Station's closed!" and a shove back; kept in view for 3 s -> DETAINED.
// With the jacket they let you pass, unless you
//   run in view, sing near them (sing:start within 40 m), or linger (slow, in view) for 3 s -> "You're not staff!", then DETAINED.
// Phase 6 can call `game.hazards.guards.distract(seconds)` (Gautam's bail) to make them look away.
import * as THREE from 'three';
import { SIM_RADIUS, clamp, hdist, dist3, turnToward, yawDir, dirYaw, inCone, lineOfSight, angleDiff } from './util.js';
import { Crowd } from './models.js';
import { rimMaterial } from './render.js';
import { NPC_PRESETS } from '../../characters/humanoid.js';

export const GUARD_TUNING = Object.freeze({ half: 0.36, range: 12, peripheral: 3.6, watchSeconds: 3, lingerSeconds: 3, blownSeconds: 1.0, singRadius: 40, alertSeconds: 12, warnGap: 5 });

export class Guards {
  constructor(h) { this.h = h; this.guards = []; this.distracted = 0; this.stats = { warnings: 0, detained: 0, blown: 0 }; }

  init() {
    const { game } = this.h, rng = this.h.rng.fork('guards');
    this.rng = rng;
    const spec = { ...NPC_PRESETS.guard, props: ['torch'] };
    this.mat = rimMaterial(game, { emissive: 0x242a34, rim: 0x6a8cc8, power: 2.2, strength: 0.8, key: 'guard' });
    this.crowd = new Crowd(game, spec, 10, this.mat);
    const posts = game.world.metroGuardPosts ?? [];
    this.range = GUARD_TUNING.range * rng.range(0.9, 1.15);
    const skip = posts.length > 4 && rng.chance(0.6) ? rng.int(0, posts.length - 1) : -1;     // sometimes a post is unmanned
    posts.forEach((post, i) => { if (i !== skip) this.addGuard(post, i); });
  }

  addGuard(post, i = 0) {
    const game = this.h.game, f = yawDir(post.yaw);
    let pos = null;
    for (const d of [1.45, 1.1, 1.9, 0.7]) for (const a of [0, 0.6, -0.6]) {
      const ang = post.yaw + a, ff = yawDir(ang), x = post.x + ff.x * d, z = post.z + ff.z * d;
      const gh = game.physics.groundHeightAt(x, z, post.y + 0.3, 0.4, 0.3);
      if (gh > -Infinity && Math.abs(gh - post.y) < 0.3) { pos = { x, y: gh, z }; break; }
    }
    pos = pos ?? { x: post.x + f.x, y: post.y, z: post.z + f.z };
    const g = {
      id: post.id, kind: 'guard', post, x: pos.x, y: pos.y, z: pos.z, baseYaw: post.yaw, yaw: post.yaw, sweep: this.rng.range(0, 6), sweepSpeed: this.rng.range(0.5, 0.8), sweepAmp: this.rng.range(0.45, 0.75),
      state: 'idle', watch: 0, linger: 0, warnCd: 0, alertT: 0, alertAt: null, blownT: 0, losT: 0, los: false, visible: false, asleep: false, shift: this.rng.range(0, 6),
    };
    this.guards.push(g);
    return g;
  }

  distract(seconds = 30) { this.distracted = Math.max(this.distracted, seconds); }

  onSing(pos) {
    const T = GUARD_TUNING;
    for (const g of this.guards) {
      if (hdist(g, pos) > T.singRadius || Math.abs(g.y - pos.y) > 12) continue;
      if (this.distracted > 0) continue;
      g.alertT = T.alertSeconds; g.alertAt = { x: pos.x, z: pos.z };
      this.h.sound('guard-shout', g, 0.55);
    }
    if (this.guards.some((g) => g.alertT > 0)) this.h.say('"Who is that singing?" a guard barks. "Unregistered singing is an offence!"', 'story', 6);
  }

  update(dt) {
    const h = this.h, T = GUARD_TUNING, p = h.pp, jacket = h.hasJacket();
    this.distracted = Math.max(0, this.distracted - dt);
    this.crowd.begin();
    for (const g of this.guards) {
      const dist = dist3(g, p);
      g.asleep = dist > SIM_RADIUS;
      if (g.asleep) continue;
      g.sweep += dt * g.sweepSpeed; g.warnCd = Math.max(0, g.warnCd - dt); g.alertT = Math.max(0, g.alertT - dt);
      const blind = this.distracted > 0;

      // ---- where is the torch pointing?
      let want = g.baseYaw + Math.sin(g.sweep) * g.sweepAmp;
      if (blind) want = g.baseYaw + 1.6 * Math.sign(Math.sin(g.shift));            // looking away
      else if (g.state === 'warn' || g.state === 'blown' || g.visible) want = dirYaw(p.x - g.x, p.z - g.z);
      else if (g.alertT > 0 && g.alertAt) want = dirYaw(g.alertAt.x - g.x, g.alertAt.z - g.z) + Math.sin(g.sweep * 2) * 0.3;
      g.yaw = turnToward(g.yaw, want, (g.visible ? 4.5 : 2.2) * dt);
      const fwd = yawDir(g.yaw), pitch = -0.07, cp = Math.cos(pitch);
      const tx = g.x + fwd.x * 0.5 - fwd.z * 0.3, ty = g.y + 1.12, tz = g.z + fwd.z * 0.5 + fwd.x * 0.3;
      const dx = fwd.x * cp, dy = Math.sin(pitch), dz = fwd.z * cp;

      // ---- can it see the player?
      let inView = false;
      if (!blind && h.grace <= 0 && !h.detaining) {
        const along = inCone(tx, ty, tz, dx, dy, dz, T.half, this.range, p.x, p.y + 1.0, p.z);
        const close = hdist(g, p) < T.peripheral && Math.abs(p.y - g.y) < 2.5;
        if (along >= 0 || close) {
          g.losT -= dt;
          if (g.losT <= 0) { g.losT = 0.1; g.los = lineOfSight(h.game, tx, ty, tz, p.x, p.y + 1.0, p.z); }
          inView = g.los;
        } else g.los = false;
      }
      g.visible = inView;

      // ---- rules
      if (g.blownT > 0) {
        g.blownT -= dt;
        if (g.blownT <= 0) { this.stats.detained++; h.detain('guard', { guard: g.id }); g.state = 'idle'; g.watch = 0; g.linger = 0; }
      } else if (inView) {
        const dh = hdist(g, p), speed = h.playerSpeed, running = h.game.player.sprinting && speed > 5;
        if (!jacket) {
          g.watch += dt; g.state = 'warn';
          if (g.warnCd <= 0 && h.game.time - h.guardWarnT > 2.5) {
            g.warnCd = T.warnGap; h.guardWarnT = h.game.time; this.stats.warnings++;
            h.sound('guard-shout', g, 0.95); h.say('"Oi! Station\'s closed!"', 'system', 4, 'Guard');
            if (dh < 9) { h.kick(g.x, g.z, 9, 0.32); h.shake(0.3, 0.3); h.say('A hand in your chest shoves you back from the gate.', 'story', 4); }
          }
          if (g.watch >= T.watchSeconds) { this.stats.detained++; g.watch = 0; h.detain('guard', { guard: g.id, why: 'seen' }); }
        } else {
          let why = null;
          if (running && dh < 12) why = 'running';
          else if (g.alertT > 0) why = 'singing';
          else if (speed < 1.2) { g.linger += dt; if (g.linger >= T.lingerSeconds) why = 'lingering'; }
          else g.linger = Math.max(0, g.linger - dt * 0.6);
          g.state = 'idle';
          if (why) this.blow(g, why);
        }
      } else {
        g.watch = Math.max(0, g.watch - dt * 0.8); g.linger = Math.max(0, g.linger - dt * 0.5);
        if (g.state === 'warn') g.state = 'idle';
      }

      // ---- draw
      if (dist < 110) {
        this.crowd.set({ x: g.x, y: g.y, z: g.z, yaw: g.yaw, speed: 0, phase: 0, armUpR: 0.45, armUpL: 0.0, armSwing: 0, lean: 0 });
        const hot = g.state === 'warn' || g.state === 'blown';
        const f = 1 - clamp((dist - 60) / 50, 0, 0.9);
        const col = hot ? [0.5, 0.16, 0.1] : g.alertT > 0 ? [0.42, 0.34, 0.14] : [0.34, 0.31, 0.2];
        h.vis.beams.add(tx, ty, tz, dx, dy, dz, T.half, this.range, col[0] * f, col[1] * f, col[2] * f);
        h.vis.glows.add(tx, ty, tz, 0.55, 1.0 * f, 0.88 * f, 0.55 * f);
      }
    }
    this.crowd.end();
  }

  blow(g, why) {
    const h = this.h;
    g.state = 'blown'; g.blownT = GUARD_TUNING.blownSeconds; this.stats.blown++;
    h.sound('guard-shout', g, 1);
    h.say(why === 'singing' ? '"That voice. You\'re not staff!"' : '"You\'re not staff!"', 'system', 4, 'Guard');
  }

  stand_down() { for (const g of this.guards) { g.watch = 0; g.linger = 0; g.blownT = 0; g.state = 'idle'; g.alertT = 0; } }
  list(out) {
    for (const g of this.guards) if (!g.asleep) out.push({ id: g.id, kind: 'guard', pos: { x: g.x, y: g.y, z: g.z }, alert: g.state === 'warn' || g.state === 'blown' ? 1 : g.alertT > 0 ? 0.6 : 0, state: g.state });
  }
  setEnabled(on) { if (!on) { for (const m of Object.values(this.crowd.meshes)) m.visible = false; } }
  snapshot() {
    return { count: this.guards.length, stats: { ...this.stats }, watching: this.guards.filter((g) => g.visible).length, watch: +Math.max(0, ...this.guards.map((g) => g.watch)).toFixed(2), linger: +Math.max(0, ...this.guards.map((g) => g.linger)).toFixed(2), distracted: +this.distracted.toFixed(1), jacket: this.h.hasJacket() };
  }
  clear() { this.guards.length = 0; this.crowd.begin(); this.crowd.end(); }
  reset() { this.clear(); this.init2(); }
  init2() { const posts = this.h.game.world.metroGuardPosts ?? []; posts.forEach((post, i) => this.addGuard(post, i)); }
}
void angleDiff; void THREE;
