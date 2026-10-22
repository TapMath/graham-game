// Deranged wanderers (PLAN 6). Ragged figures drifting through the dark G streets. They mutter, shamble toward anyone who
// gets close, and grab: -1 ray, or half an hour of your day (`clock.advance(0.5)`), then wander off. Singing calms them for
// 25 s (they stop and listen, then drift away) unless they already have hold of someone. They can grab a following Setu too.
import { SIM_RADIUS, clamp, hdist, dist3, turnToward, yawDir, dirYaw, angleDiff, homeGround, randomSpot, lineOfSight, weatherMul } from './util.js';
import { Crowd } from './models.js';
import { rimMaterial } from './render.js';
import { npcSpec, SKIN } from '../../characters/humanoid.js';

export const WANDERER = npcSpec({
  name: 'Wanderer', height: 1.66, build: 'slim', skin: SKIN.deep, hair: { style: 'hood', color: 0x1a1816 },
  top: { color: 0x4c4136, trim: 0x6a5c48, length: 'longKurta', sleeves: 'long' }, bottom: { color: 0x2a2622, style: 'trousers' }, shoes: 0x241a14,
});

export const DERANGED_TUNING = Object.freeze({ wander: 0.9, approach: 2.5, sight: 11, hear: 6, grabRange: 1.05, grabSeconds: 0.95, cooldown: 22, calmRadius: 20, calmSeconds: 25 });
const _p = { x: 0, z: 0 };

export class Deranged {
  constructor(h) { this.h = h; this.list_ = []; this._id = 0; this.stats = { grabs: 0, rayLost: 0, timeLost: 0, calmed: 0, setuGrabs: 0 }; }

  init() {
    const { game } = this.h;
    this.rng = this.h.rng.fork('deranged');
    this.mat = rimMaterial(game, { emissive: 0x2a2822, rim: 0x9a9a62, power: 2.0, strength: 0.9, key: 'wanderer' });
    this.crowd = new Crowd(game, WANDERER, 12, this.mat);
    this.populate();
  }

  populate() {
    const zones = this.h.game.world.hazardZones.deranged, rng = this.rng;
    this.menace = rng.range(0.85, 1.2);
    const active = rng.shuffle(zones).slice(0, rng.int(3, 5));
    for (const z of active) {
      const n = rng.chance(0.35) ? 2 : 1;
      for (let i = 0; i < n; i++) this.add(z.x, z.z, z.r, { zone: z.id });
    }
  }

  add(cx, cz, r, { zone = null, state = 'wander' } = {}) {
    const sp = randomSpot(this.h.game, this.rng, cx, cz, Math.max(2, r * 0.6), 0);
    if (!sp || this.list_.length >= 12) return null;
    const d = {
      id: `wanderer-${this._id++}`, kind: 'deranged', zone, cx, cz, r, x: sp.x, y: sp.y, z: sp.z, yaw: this.rng.range(-3, 3), state: 'wander', t: 0,
      speed: 0, phase: this.rng.range(0, 6), goal: null, wait: 0, mutterT: this.rng.range(2, 8), calm: 0, cd: 0, perceiveT: this.rng.range(0, 0.3), target: null,
      stuck: 0, prefersTime: this.rng.chance(0.35), lost: 0, asleep: false, applied: false, gazeAt: null, sway: this.rng.range(0, 6), tilt: this.rng.range(0.1, 0.22), arms: 0,
    };
    this.list_.push(d);
    if (state !== 'wander') this.setState(d, state);
    return d;
  }

  setState(d, s) { d.state = s; d.t = 0; }

  perceive(d) {
    const h = this.h, T = DERANGED_TUNING;
    if (d.calm > 0 || d.cd > 0 || h.grace > 0) return null;
    const mul = weatherMul(h.game, d.y) * this.menace;
    let best = null;
    const test = (kind, pos, noise) => {
      const dh = hdist(d, pos);
      if (Math.abs(pos.y - d.y) > 2.5) return;
      let ok = dh < noise * mul;
      if (!ok && dh < T.sight * mul && Math.abs(angleDiff(d.yaw, dirYaw(pos.x - d.x, pos.z - d.z))) < 1.4) ok = lineOfSight(h.game, d.x, d.y + 1.4, d.z, pos.x, pos.y + 1.0, pos.z);
      if (ok && (!best || dh < best.d)) best = { kind, x: pos.x, y: pos.y, z: pos.z, d: dh };
    };
    test('player', h.pp, h.playerSpeed > 5 ? 11 : T.hear);
    const su = h.setuTarget();
    if (su) test('setu', su, 4);
    return best;
  }

  move(d, tx, tz, speed, dt, turn = 5) {
    const game = this.h.game, dx = tx - d.x, dz = tz - d.z, dd = Math.hypot(dx, dz);
    if (dd < 0.05) return 0;
    d.yaw = turnToward(d.yaw, dirYaw(dx, dz), turn * dt);
    const al = Math.cos(angleDiff(d.yaw, dirYaw(dx, dz)));
    const step = Math.min(speed * dt * clamp(al * 1.3, 0.1, 1), dd);
    const f = yawDir(d.yaw), nx = d.x + f.x * step, nz = d.z + f.z * step;
    if (homeGround(game, nx, nz, 0, 0.3, 0.3) === null) { d.stuck += dt; return 0; }
    _p.x = d.x; _p.z = d.z;
    game.physics.slideMove(_p, nx - d.x, nz - d.z, d.y, 0.3);
    const g2 = homeGround(game, _p.x, _p.z, 0, 0.3, 0.3);
    if (g2 === null) { d.stuck += dt; return 0; }
    const moved = Math.hypot(_p.x - d.x, _p.z - d.z);
    d.x = _p.x; d.z = _p.z; d.y = g2;
    if (moved < step * 0.3) d.stuck += dt; else d.stuck = Math.max(0, d.stuck - dt * 2);
    return moved;
  }

  think(d, dt) {
    const h = this.h, T = DERANGED_TUNING, game = h.game, p = h.pp;
    d.t += dt; d.cd = Math.max(0, d.cd - dt); d.calm = Math.max(0, d.calm - dt); d.mutterT -= dt; d.sway += dt;
    let sp = 0, armsWant = 0;
    d.perceiveT -= dt;
    let sense;
    if (d.perceiveT <= 0) { d.perceiveT = 0.2; sense = this.perceive(d); }

    switch (d.state) {
      case 'wander': {
        if (sense) { d.target = sense; this.setState(d, 'notice'); h.sound('mutter', d, 0.5); break; }
        if (d.wait > 0) { d.wait -= dt; if (d.wait <= 0) d.goal = null; }
        else {
          if (!d.goal || Math.hypot(d.goal.x - d.x, d.goal.z - d.z) < 1 || d.stuck > 0.7 || d.t > 30) {
            if (d.goal && this.rng.chance(0.55)) { d.wait = this.rng.range(2, 6); d.goal = null; d.stuck = 0; d.t = 0; break; }
            d.goal = randomSpot(game, this.rng, d.cx, d.cz, d.r, 0) ?? { x: d.cx, z: d.cz }; d.stuck = 0; d.t = 0.01;
          }
          sp = this.move(d, d.goal.x, d.goal.z, T.wander, dt, 2.5) / dt;
        }
        if (d.mutterT <= 0) { d.mutterT = this.rng.range(5, 10); h.sound('mutter', d, 0.4); h.nearCaption(d, '[muttering]', 14); }
        break;
      }
      case 'notice': {
        const tg = d.target;
        d.yaw = turnToward(d.yaw, dirYaw(tg.x - d.x, tg.z - d.z), 4 * dt);
        armsWant = 0.3;
        if (d.t > 0.7) { this.setState(d, 'approach'); h.sound('mutter', d, 0.7); h.say(this.rng.pick(['Something shuffles toward you out of the dark, muttering.', 'A voice, cracked and wet: "Light... have you got any light?"', 'Bare feet on wet concrete. Slow. Coming closer.']), 'story', 5); }
        break;
      }
      case 'approach': {
        if (d.calm > 0) { this.setState(d, 'calm'); break; }
        const live = d.target.kind === 'setu' ? h.setuTarget() : h.pp;
        if (!live) { this.setState(d, 'wander'); break; }
        const dh = hdist(d, live), dy = Math.abs(live.y - d.y);
        armsWant = 1;
        if (sense) d.lost = 0; else d.lost += dt;
        if (dh > 18 || dy > 3 || d.lost > 5) { this.setState(d, 'wander'); d.cd = 6; break; }
        if (dh <= T.grabRange && dy < 1.3 && h.grace <= 0) { d.target = { kind: d.target.kind, x: live.x, y: live.y, z: live.z, d: dh }; this.setState(d, 'grab'); d.applied = false; break; }
        sp = this.move(d, live.x, live.z, T.approach * this.menace, dt, 5) / dt;
        if (d.mutterT <= 0) { d.mutterT = this.rng.range(2.5, 4.5); h.sound('mutter', d, 0.55); }
        break;
      }
      case 'grab': {
        armsWant = 1;
        const isSetu = d.target.kind === 'setu' && h.game.setu?.following;
        const live = isSetu ? h.setuTarget() : h.pp;
        if (live) d.yaw = turnToward(d.yaw, dirYaw(live.x - d.x, live.z - d.z), 8 * dt);
        if (!isSetu) h.holdPlayer(0.12);
        if (!d.applied && d.t > 0.12) {
          d.applied = true; this.stats.grabs++;
          h.sound('grab', d, 0.9); h.shake(0.5, 0.5);
          if (isSetu) { game.setu.hurt(8, 'grab'); this.stats.setuGrabs++; h.say('A wild hand closes on Setu\'s collar. He squeaks.', 'story', 5); }
          else {
            const rays = game.player.rays, time = d.prefersTime || rays <= 2;
            if (time) { game.clock.advance(0.5, 'grabbed'); this.stats.timeLost++; h.say('He claws at your pockets, then your arm. By the time you tear free, half an hour is gone.', 'story', 7); h.game.screenfx?.fade(0.55, 0.12); setTimeout(() => h.game.screenfx?.fade(0, 0.8), 160); }
            else { h.hurt(1, 'grabbed'); this.stats.rayLost++; h.say('Fingers like wire around your wrist. He drinks the warmth out of you, and lets go.', 'story', 7); }
          }
        }
        if (d.t > T.grabSeconds) { d.cd = T.cooldown; d.calmFrom = { x: live ? live.x : h.pp.x, z: live ? live.z : h.pp.z }; this.setState(d, 'leave'); if (!isSetu) h.kick(d.x, d.z, 6, 0.25); }
        break;
      }
      case 'calm': {
        armsWant = 0;
        if (d.calmFrom) d.yaw = turnToward(d.yaw, dirYaw(d.calmFrom.x - d.x, d.calmFrom.z - d.z), 3 * dt);
        if (d.mutterT <= 0) { d.mutterT = this.rng.range(3, 5); h.sound('mutter', d, 0.25); }
        if (d.t > 11) this.setState(d, 'leave');
        break;
      }
      case 'leave': {
        const src = d.calmFrom ?? p;
        if (d.t > 8) { this.setState(d, 'wander'); d.goal = null; break; }
        const ax = d.x - src.x, az = d.z - src.z, l = Math.hypot(ax, az) || 1;
        sp = this.move(d, d.x + ax / l * 4, d.z + az / l * 4, T.wander * 1.4, dt, 3) / dt;
        if (d.stuck > 1) { d.yaw += 1.2; d.stuck = 0; }
        break;
      }
      default: this.setState(d, 'wander');
    }
    d.speed += (sp - d.speed) * Math.min(1, dt * 6);
    d.phase += dt * (2 + d.speed * 1.9);
    d.arms += (armsWant - d.arms) * Math.min(1, dt * 5);
  }

  onSing(pos) {
    const T = DERANGED_TUNING;
    for (const d of this.list_) {
      if (d.asleep || d.state === 'grab') continue;
      if (dist3(d, pos) > T.calmRadius + 1.5 || Math.abs(d.y - pos.y) > 6) continue;
      d.calm = T.calmSeconds; d.calmFrom = { x: pos.x, z: pos.z }; d.target = null; this.stats.calmed++;
      this.setState(d, 'calm');
    }
  }

  update(dt) {
    const h = this.h, p = h.pp, f = (d) => 1 - clamp((d - 55) / 55, 0, 0.9);
    this.crowd.begin();
    for (const d of this.list_) {
      const dist = dist3(d, p);
      d.asleep = dist > SIM_RADIUS;
      if (d.asleep) continue;
      this.think(d, dt);
      if (dist < 105) {
        const shamble = Math.sin(d.sway * 1.3) * 0.04;
        this.crowd.set({ x: d.x, y: d.y, z: d.z, yaw: d.yaw + shamble, speed: d.speed, phase: d.phase, lean: d.tilt + d.arms * 0.1, armUp: d.arms, armSwing: 0.45, armDrop: Math.sin(d.sway * 0.8) * 0.06 });
        const hot = d.state === 'approach' || d.state === 'grab' || d.state === 'notice';
        const ff = f(dist);
        const fx = -Math.sin(d.yaw), fz = -Math.cos(d.yaw), rx = Math.cos(d.yaw), rz = -Math.sin(d.yaw), hy = d.y + 1.5, r = hot ? 1 : 0.55;
        for (const s of [-0.055, 0.055]) h.vis.glows.add(d.x + fx * 0.14 + rx * s, hy, d.z + fz * 0.14 + rz * s, hot ? 0.16 : 0.1, 0.9 * r * ff, 0.95 * r * ff, 0.45 * r * ff);
      }
    }
    this.crowd.end();
  }

  list(out) {
    for (const d of this.list_) if (!d.asleep) out.push({ id: d.id, kind: 'deranged', pos: { x: d.x, y: d.y, z: d.z }, alert: d.state === 'approach' || d.state === 'grab' ? 1 : d.state === 'notice' ? 0.6 : 0, state: d.state });
  }
  setEnabled(on) { if (!on) for (const m of Object.values(this.crowd.meshes)) m.visible = false; }
  snapshot() { return { count: this.list_.length, stats: { ...this.stats }, approaching: this.list_.filter((d) => d.state === 'approach').length, calm: this.list_.filter((d) => d.calm > 0).length, menace: +(this.menace ?? 1).toFixed(2) }; }
  clear() { this.list_.length = 0; this.crowd.begin(); this.crowd.end(); }
  reset() { this.clear(); this.rng = this.h.rng.fork('deranged'); this.populate(); }
}
