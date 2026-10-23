// Feral dogs (PLAN 6, 1b). Packs of 2-4 on G and U, seeded per run (which zones, pack sizes, how fierce).
//
//   wander -> notice (hearing or sight, worse in rain) -> chase -> bite (-1 ray, knockback, 2.4 s cooldown per dog, at least
//   1.8 s between any two bites on Mithi: Phase 7b, a pack of three used to bite about once a second)
//
// They cannot climb: a dog only ever stands on ground within 0.3 m of its home level (G = 0, U = -8), so stairs,
// ramps and lifts are an escape; one that loses its target above it paces and whines, then gives up.
// `sing:start` within 20 m calms a dog for 25 s (it sits and whimpers, then trots away). A following Setu can
// be a target too: a bite costs his breath. Drawn with two InstancedMeshes (bodies, legs) + eye glows.
import * as THREE from '../../../vendor/three.module.js';
import { SIM_RADIUS, clamp, hdist, dist3, angleDiff, turnToward, yawDir, dirYaw, homeGround, randomSpot, lineOfSight, weatherMul } from './util.js';
import { DOG, dogBodyGeometry, dogLegGeometry } from './models.js';
import { rimMaterial } from './render.js';

const CAP = 28;
const TINTS = [0xc8b8a0, 0x9a8c7c, 0x6c645c, 0x4a4540, 0x8a6a4a];
const _m = new THREE.Matrix4(), _b = new THREE.Matrix4(), _l = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s1 = new THREE.Vector3(1, 1, 1);
const _c = new THREE.Color();

export const DOG_TUNING = Object.freeze({
  wanderSpeed: 1.5, chaseSpeed: 5.5, chaseMax: 6.3, biteRange: 1.2, biteCooldown: 2.4, biteGap: 1.8, knock: 9,
  hearWalk: 10, hearSprint: 19, hearIdle: 4, sight: 17, sightHalf: 1.3, calmRadius: 20, calmSeconds: 25, loseSeconds: 5.5,
});

export class Dogs {
  constructor(h) { this.h = h; this.dogs = []; this.packs = []; this.stats = { bites: 0, setuBites: 0, calmed: 0, escaped: 0 }; this._id = 0; }

  init() {
    const { game } = this.h, T = DOG_TUNING;
    this.rng = this.h.rng.fork('dogs');
    this.mat = rimMaterial(game, { emissive: 0x15191b, rim: 0x5ac8d0, power: 3.0, strength: 1.5, key: 'dog' });
    this.body = new THREE.InstancedMesh(dogBodyGeometry(), this.mat, CAP);
    this.legs = new THREE.InstancedMesh(dogLegGeometry(), this.mat, CAP * 4);
    for (const m of [this.body, this.legs]) { m.frustumCulled = false; m.count = 0; m.visible = false; game.scene.add(m); }
    this.body.name = 'dogs-body'; this.legs.name = 'dogs-legs';
    this.populate();
    void T;
  }

  populate() {
    const zones = this.h.game.world.hazardZones.dogs, rng = this.rng;
    const order = rng.shuffle(zones);
    const n = rng.int(5, 6);
    this.fierce = rng.range(0.9, 1.2);                       // run-wide: speed and senses
    for (const z of order.slice(0, n)) {
      const size = rng.int(2, 3), homeY = z.level === 'U' ? -8 : 0;
      this.addPack(z.x, z.z, z.r, homeY, size, { zone: z, fierce: this.fierce * rng.range(0.92, 1.08) });
    }
  }

  /** Add a pack of `size` dogs around (cx,cz). Returns the pack. */
  addPack(cx, cz, r, homeY, size, { zone = null, fierce = this.fierce ?? 1, state = 'wander' } = {}) {
    const pack = { id: `pack-${this.packs.length}`, zone, cx, cz, r, homeY, goal: null, wait: 0, dogs: [], fierce };
    for (let i = 0; i < size && this.dogs.length < CAP; i++) {
      const sp = randomSpot(this.h.game, this.rng, cx, cz, Math.max(2.5, r * 0.5), homeY);
      if (!sp) continue;
      const dog = this.makeDog(pack, sp, i);
      pack.dogs.push(dog); this.dogs.push(dog);
      if (state !== 'wander') this.setState(dog, state);
    }
    if (pack.dogs.length) { pack.leader = pack.dogs[0]; this.packs.push(pack); }
    return pack;
  }

  makeDog(pack, sp, i) {
    const rng = this.rng;
    return {
      id: `dog-${this._id++}`, kind: 'dog', pack, i, x: sp.x, y: sp.y, z: sp.z, homeY: pack.homeY, yaw: rng.range(-Math.PI, Math.PI),
      state: 'wander', t: 0, cd: 0, calm: 0, sit: 0, phase: rng.range(0, 6), speed: 0, size: rng.range(0.88, 1.12), tint: new THREE.Color(TINTS[rng.int(0, TINTS.length - 1)]),
      target: null, lastSeen: null, lost: 0, stuck: 0, side: 0, sideT: 0, perceiveT: rng.range(0, 0.3), barkT: 0, whimperT: 0, recoil: 0, asleep: false,
      prefersSetu: rng.chance(0.35), off: rng.range(0, Math.PI * 2), offD: rng.range(1.3, 2.6), frustT: 0, alertAmt: 0, loop: false,
    };
  }

  setState(dog, s) { dog.state = s; dog.t = 0; if (s !== 'chase' && dog.loop) this._loop(dog, false); }

  _loop(dog, on) {
    const ev = this.h.game.events;
    if (on && !dog.loop) { dog.loop = true; ev.emit('sound:loop', { id: `dog-pant:${dog.id}`, kind: 'dog-pant', loudness: 0.5, getPos: () => dog }); }
    else if (!on && dog.loop) { dog.loop = false; ev.emit('sound:loopStop', { id: `dog-pant:${dog.id}` }); }
  }

  // ---------------------------------------------------------------------------------------------- senses
  /** The best thing this dog can notice right now: {kind:'player'|'setu', x,y,z, d} or null. */
  perceive(dog) {
    const h = this.h, T = DOG_TUNING, p = h.pp;
    if (dog.calm > 0 || h.grace > 0) return null;
    const mul = weatherMul(h.game, dog.y) * dog.pack.fierce;
    let best = null;
    const test = (kind, pos, noise) => {
      const dh = hdist(dog, pos), dy = Math.abs(pos.y - dog.y);
      if (dy > 3.2) return;
      let seen = false;
      if (dh < noise * mul) seen = true;                                            // heard it
      else if (dh < T.sight * mul && Math.abs(angleDiff(dog.yaw, dirYaw(pos.x - dog.x, pos.z - dog.z))) < T.sightHalf) {
        seen = lineOfSight(h.game, dog.x, dog.y + 0.6, dog.z, pos.x, pos.y + 1.0, pos.z);
      } else if (dh < 2.6) seen = true;
      if (seen && (!best || dh < best.d)) best = { kind, x: pos.x, y: pos.y, z: pos.z, d: dh };
    };
    const sp = h.playerSpeed;
    test('player', p, h.game.player.sprinting && sp > 4 ? T.hearSprint : sp > 0.8 ? T.hearWalk : T.hearIdle);
    const su = h.setuTarget();
    if (su) test('setu', su, su.moving ? 8 : 3);
    if (best && best.kind === 'setu' && h.hdistPlayer(dog) < 5 && !dog.prefersSetu) {
      // prefer the nearby player unless this dog likes small prey
      best = { kind: 'player', x: p.x, y: p.y, z: p.z, d: hdist(dog, p) };
    }
    return best;
  }

  // ---------------------------------------------------------------------------------------------- movement
  /** Move toward (tx,tz) at `speed`, staying on the home level. Returns the distance actually moved. */
  move(dog, tx, tz, speed, dt, turn = 9) {
    const h = this.h, game = h.game, dx = tx - dog.x, dz = tz - dog.z, d = Math.hypot(dx, dz);
    if (d < 0.04) return 0;
    let want = dirYaw(dx, dz);
    if (dog.sideT > 0) want += dog.side * 1.1;
    dog.yaw = turnToward(dog.yaw, want, turn * dt);
    const al = Math.cos(angleDiff(dog.yaw, want));
    const step = Math.min(speed * dt * clamp(al * 1.2, 0.15, 1), d + 0.2);
    const f = yawDir(dog.yaw), nx = dog.x + f.x * step, nz = dog.z + f.z * step;
    const gh = homeGround(game, nx, nz, dog.homeY, 0.3, 0.3);
    if (gh === null) { dog.stuck += dt; return 0; }
    _p.x = dog.x; _p.z = dog.z;
    game.physics.slideMove(_p, nx - dog.x, nz - dog.z, dog.y, 0.3);
    const g2 = homeGround(game, _p.x, _p.z, dog.homeY, 0.3, 0.3);
    if (g2 === null) { dog.stuck += dt; return 0; }
    const moved = Math.hypot(_p.x - dog.x, _p.z - dog.z);
    dog.x = _p.x; dog.z = _p.z; dog.y = g2;
    if (moved < step * 0.35) dog.stuck += dt; else dog.stuck = Math.max(0, dog.stuck - dt * 2);
    return moved;
  }

  // ---------------------------------------------------------------------------------------------- behaviour
  think(dog, dt) {
    const h = this.h, T = DOG_TUNING, game = h.game;
    dog.t += dt; dog.cd = Math.max(0, dog.cd - dt); dog.barkT -= dt; dog.whimperT -= dt; dog.sideT = Math.max(0, dog.sideT - dt);
    dog.recoil = Math.max(0, dog.recoil - dt);
    if (dog.calm > 0) dog.calm = Math.max(0, dog.calm - dt);
    let speedNow = 0;

    // perception (a few times a second)
    dog.perceiveT -= dt;
    let sense;
    if (dog.perceiveT <= 0) { dog.perceiveT = 0.18 + this.rng.next() * 0.1; sense = this.perceive(dog); } else sense = undefined;

    switch (dog.state) {
      case 'wander': case 'idle': {
        if (sense) { this.noticed(dog, sense); break; }
        const pack = dog.pack, lead = pack.leader === dog;
        dog.alertAmt = Math.max(0, dog.alertAmt - dt);
        if (lead || pack.leader.state === 'calm' || pack.leader.asleep) {
          if (dog.state === 'idle') { if (dog.t > dog.idleFor) this.setState(dog, 'wander'); break; }
          if (!pack.goal || Math.hypot(pack.goal.x - dog.x, pack.goal.z - dog.z) < 1.2 || dog.stuck > 0.8 || dog.t > 25) {
            if (this.rng.chance(0.45) && dog.t > 1) { dog.idleFor = this.rng.range(2, 6); this.setState(dog, 'idle'); pack.goal = null; break; }
            pack.goal = randomSpot(game, this.rng, pack.cx, pack.cz, pack.r, pack.homeY) ?? { x: pack.cx, z: pack.cz };
            dog.stuck = 0; dog.t = 0.01;
          }
          speedNow = this.move(dog, pack.goal.x, pack.goal.z, T.wanderSpeed, dt, 4) / dt;
        } else {
          const L = pack.leader, gx = L.x + Math.cos(dog.off) * dog.offD, gz = L.z + Math.sin(dog.off) * dog.offD;
          const dd = Math.hypot(gx - dog.x, gz - dog.z);
          if (dd > 1.0) speedNow = this.move(dog, gx, gz, clamp(T.wanderSpeed + (dd - 1) * 1.2, 0, 4), dt, 5) / dt;
          else dog.yaw = turnToward(dog.yaw, L.yaw, 2 * dt);
          if (L.state === 'idle' && dd < 1.6) { /* rest with the leader */ }
        }
        break;
      }
      case 'notice': {
        // freeze, turn, bark
        const tg = dog.target;
        dog.yaw = turnToward(dog.yaw, dirYaw(tg.x - dog.x, tg.z - dog.z), 7 * dt);
        if (dog.t > 0.55 * (dog.reaction ?? 1)) this.setState(dog, 'chase');
        if (sense) { dog.target = sense; }
        break;
      }
      case 'chase': {
        if (dog.calm > 0) { this.beCalm(dog); break; }
        const tg = this.trackTarget(dog, sense);
        if (!tg) { this.setState(dog, 'search'); break; }
        const dh = Math.hypot(tg.x - dog.x, tg.z - dog.z), dy = tg.y - dog.y;
        if (Math.abs(dy) > 1.9 && dh < 9) {           // target is up (or down) a level: cannot follow
          dog.frustT += dt;
          if (dh > 2.2) speedNow = this.move(dog, tg.x, tg.z, Math.min(T.chaseMax, T.chaseSpeed * dog.pack.fierce), dt) / dt;
          if (dog.barkT <= 0) { dog.barkT = this.rng.range(1.4, 2.4); h.sound('bark', dog, 0.8); }
          if (dog.frustT > 6) { this.stats.escaped++; this.setState(dog, 'search'); dog.target = null; }
          break;
        }
        dog.frustT = 0;
        if (dh <= T.biteRange && Math.abs(dy) < 1.4) {
          if (dog.cd <= 0) this.bite(dog, tg);
          dog.yaw = turnToward(dog.yaw, dirYaw(tg.x - dog.x, tg.z - dog.z), 10 * dt);
        } else if (dog.recoil > 0) {
          const f = yawDir(dog.yaw); speedNow = this.move(dog, dog.x - f.x * 2, dog.z - f.z * 2, 2.2, dt, 0) / dt;
        } else {
          if (dog.stuck > 0.5 && dog.sideT <= 0) { dog.side = this.rng.chance(0.5) ? 1 : -1; dog.sideT = 0.8; dog.stuck = 0; }
          speedNow = this.move(dog, tg.x, tg.z, Math.min(T.chaseMax, T.chaseSpeed * dog.pack.fierce), dt, 12) / dt;
        }
        if (dog.barkT <= 0 && dh < 14) { dog.barkT = this.rng.range(2.2, 3.8); h.sound(this.rng.chance(0.6) ? 'bark' : 'growl', dog, 0.75); }
        break;
      }
      case 'search': {
        if (sense) { this.noticed(dog, sense); break; }
        const ls = dog.lastSeen;
        if (!ls || dog.t > 6 || (Math.hypot(ls.x - dog.x, ls.z - dog.z) < 1.5)) { dog.lastSeen = null; this.setState(dog, 'wander'); dog.pack.goal = null; break; }
        speedNow = this.move(dog, ls.x, ls.z, T.wanderSpeed * 2.2, dt, 6) / dt;
        break;
      }
      case 'calm': {
        this.beCalm(dog, dt);
        break;
      }
      case 'leave': {
        const src = dog.calmFrom;
        if (dog.t > 9 || !src) { this.setState(dog, 'wander'); dog.pack.goal = null; break; }
        const ax = dog.x - src.x, az = dog.z - src.z, l = Math.hypot(ax, az) || 1;
        speedNow = this.move(dog, dog.x + ax / l * 5, dog.z + az / l * 5, T.wanderSpeed * 1.2, dt, 5) / dt;
        if (dog.stuck > 1) { dog.side = 1; dog.sideT = 0.6; dog.stuck = 0; }
        break;
      }
      default: this.setState(dog, 'wander');
    }
    // sit eases in while calm, out otherwise
    const wantSit = dog.state === 'calm' && dog.t > 1.2 ? 1 : 0;
    dog.sit += (wantSit - dog.sit) * Math.min(1, dt * 4);
    dog.speed += (speedNow - dog.speed) * Math.min(1, dt * 8);
    dog.phase += dt * (3 + dog.speed * 1.55);
    dog.alertAmt = dog.state === 'chase' || dog.state === 'notice' ? 1 : dog.state === 'search' ? 0.5 : dog.alertAmt;
    // keep the pack from stacking
    if (dog.state !== 'calm') for (const o of dog.pack.dogs) {
      if (o === dog) continue;
      const dx = dog.x - o.x, dz = dog.z - o.z, dd = Math.hypot(dx, dz);
      if (dd < 0.7 && dd > 0.001) { const pushx = dx / dd * (0.7 - dd) * 0.5, pushz = dz / dd * (0.7 - dd) * 0.5; if (homeGround(game, dog.x + pushx, dog.z + pushz, dog.homeY, 0.3, 0.3) !== null) { dog.x += pushx; dog.z += pushz; } }
    }
    if (dog.state === 'chase') { if (!dog.loop) this._loop(dog, true); }
  }

  beCalm(dog, dt = 0) {
    if (dog.state !== 'calm' && dog.state !== 'leave') { dog.target = null; this.setState(dog, 'calm'); }
    if (dog.state !== 'calm') return;
    const src = dog.calmFrom;
    if (src && dog.t < 1.5) dog.yaw = turnToward(dog.yaw, dirYaw(src.x - dog.x, src.z - dog.z), 5 * dt);
    if (dog.t > 1.5 && dog.whimperT <= 0) { dog.whimperT = this.rng.range(2.6, 4.2); this.h.sound('whimper', dog, 0.5); }
    if (dog.t > 11) this.setState(dog, 'leave');
  }

  noticed(dog, sense) {
    dog.target = sense; dog.lastSeen = { x: sense.x, y: sense.y, z: sense.z }; dog.lost = 0;
    dog.reaction = this.rng.range(0.7, 1.15);
    this.setState(dog, 'notice');
    this.h.sound('bark', dog, 0.9); this.h.nearCaption(dog, '[a dog barks]', 40);
    // the pack hears it
    for (const o of dog.pack.dogs) {
      if (o !== dog && (o.state === 'wander' || o.state === 'idle') && o.calm <= 0) { o.target = sense; o.lastSeen = dog.lastSeen; o.reaction = this.rng.range(0.9, 1.5); this.setState(o, 'notice'); }
    }
  }

  /** Where the target is now (live position for the player/Setu when sensed or close), or null once lost. */
  trackTarget(dog, sense) {
    const h = this.h, T = DOG_TUNING;
    let tg = dog.target;
    if (sense) { dog.lost = 0; tg = dog.target = sense; dog.lastSeen = { x: sense.x, y: sense.y, z: sense.z }; }
    else {
      dog.lost += 0.016;
      // dogs track by smell: keep following a target that stays close
      if (tg) {
        const live = tg.kind === 'setu' ? h.setuTarget() : h.pp;
        if (live && hdist(dog, live) < 22 && Math.abs(live.y - dog.y) < 3.5) { dog.lost = Math.max(0, dog.lost - 0.012); tg = dog.target = { kind: tg.kind, x: live.x, y: live.y, z: live.z, d: hdist(dog, live) }; dog.lastSeen = tg; }
      }
      if (dog.lost > T.loseSeconds) return null;
    }
    return tg;
  }

  bite(dog, tg) {
    const h = this.h, T = DOG_TUNING, game = h.game;
    dog.cd = T.biteCooldown; dog.recoil = 0.4;
    if (tg.kind === 'setu' && game.setu?.following) {
      game.setu.hurt(8, 'dog'); this.stats.setuBites++;
      h.sound('bite', dog, 0.9); h.say('Setu cries out. A dog has him by the sleeve.', 'story', 5);
      return;
    }
    if (game.time - h.lastPlayerHit < T.biteGap) { dog.cd = 0.5; return; }
    h.lastPlayerHit = game.time;
    this.stats.bites++;
    h.hurt(1, 'dog');
    h.kick(dog.x, dog.z, T.knock, 0.3);
    h.shake(0.45, 0.35);
    h.sound('bite', dog, 1); h.nearCaption(dog, '[growl, snap]', 20);
    h.say(this.rng.pick(['Teeth. A hot, wet snap at your leg.', 'Claws on your shin, then pain.', 'The dog hits you low and hard.']), 'story', 4);
  }

  onSing(pos) {
    const T = DOG_TUNING;
    for (const d of this.dogs) {
      if (d.asleep) continue;
      if (dist3(d, pos) > T.calmRadius + 1.5) continue;
      if (Math.abs(d.y - pos.y) > 6) continue;
      d.calm = T.calmSeconds; d.calmFrom = { x: pos.x, z: pos.z }; d.target = null;
      this.stats.calmed++;
      this.setState(d, 'calm');
    }
  }

  // ---------------------------------------------------------------------------------------------- frame
  update(dt) {
    const h = this.h, p = h.pp;
    let n = 0;
    for (const dog of this.dogs) {
      const d = dist3(dog, p);
      if (d > SIM_RADIUS) {
        if (!dog.asleep) { dog.asleep = true; this._loop(dog, false); }
        continue;
      }
      dog.asleep = false;
      this.think(dog, dt);
      if (d < 105) n = this.draw(dog, n, d);
    }
    this.body.count = n; this.legs.count = n * 4;
    this.body.visible = this.legs.visible = n > 0;
    if (n) {
      this.body.instanceMatrix.needsUpdate = true; this.legs.instanceMatrix.needsUpdate = true;
      if (this.body.instanceColor) this.body.instanceColor.needsUpdate = true;
      if (this.legs.instanceColor) this.legs.instanceColor.needsUpdate = true;
    }
  }

  draw(dog, n, dist) {
    const sit = dog.sit, sc = dog.size;
    const trot = clamp(dog.speed / 3.2, 0, 1), gallop = clamp((dog.speed - 3.5) / 3, 0, 1);
    const amp = (0.45 * trot + 0.5 * gallop) * (1 - sit);
    const bob = (Math.abs(Math.sin(dog.phase * 2)) * 0.03 * trot + gallop * Math.sin(dog.phase * 2) * 0.03) * (1 - sit);
    const lowered = sit * 0.2 + (dog.state === 'notice' ? 0.04 : 0) + (dog.state === 'chase' ? 0.03 : 0);
    const pitchBody = sit * 0.7 - gallop * 0.08 + (dog.state === 'notice' ? -0.1 : 0);
    // base: position and heading
    _v.set(dog.x, dog.y + bob - lowered, dog.z); _e.set(0, dog.yaw, 0, 'YXZ'); _q.setFromEuler(_e); _s1.set(sc, sc, sc);
    _b.compose(_v, _q, _s1);
    // body pitched about the rump
    _v.set(0, 0.28, 0.3); _e.set(pitchBody, 0, 0); _q.setFromEuler(_e);
    _l.compose(_v, _q, _s1.set(1, 1, 1)); _m.makeTranslation(0, -0.28, -0.3); _l.multiply(_m);
    _m.multiplyMatrices(_b, _l);
    this.body.setMatrixAt(n, _m); this.body.setColorAt(n, dog.tint);
    // legs: diagonal pairs
    const legs = [[-1, DOG.frontZ, 0], [1, DOG.frontZ, Math.PI], [-1, DOG.backZ, Math.PI], [1, DOG.backZ, 0]];
    for (let k = 0; k < 4; k++) {
      const [sx, z, off] = legs[k], front = z < 0;
      let ang = Math.sin(dog.phase + off) * amp * (front ? 1 : 1.05);
      let py = DOG.hipY;
      let zz = z;
      if (sit > 0) {
        if (front) { ang = ang * (1 - sit) - pitchBody * sit; }
        else { ang = ang * (1 - sit) + sit * 1.25; py = DOG.hipY * (1 - sit * 0.55); }
      }
      let lx = sx * DOG.sideX, ly = py, lz = zz;
      if (front && sit > 0) { // the chest rises with the pitched body: lift and move the front hips with it
        const c = Math.cos(pitchBody), s = Math.sin(pitchBody), oy = ly - 0.28, oz = lz - 0.3;
        ly = 0.28 + oy * c - oz * s; lz = 0.3 + oy * s + oz * c;
      }
      _v.set(lx, ly, lz); _e.set(ang, 0, 0); _q.setFromEuler(_e); _s1.set(1, 1, 1);
      _l.compose(_v, _q, _s1);
      _m.multiplyMatrices(_b, _l);
      this.legs.setMatrixAt(n * 4 + k, _m); this.legs.setColorAt(n * 4 + k, dog.tint);
    }
    // eyes
    if (dist < 60) {
      const hot = dog.state === 'chase' || dog.state === 'notice', calm = dog.state === 'calm' || dog.state === 'leave';
      const intens = (hot ? 1.2 : calm ? 0.3 : 0.55) * (1 - clamp((dist - 30) / 40, 0, 0.8));
      _c.setRGB(hot ? 1.0 : 0.95, hot ? 0.16 : 0.62, hot ? 0.08 : 0.2);
      // head position in dog space (pitch ignored)
      const hy = 0.71 + (sit > 0 ? 0.12 * sit : 0) - lowered * 0.8, hz = -0.575;
      for (const sx of [-0.05, 0.05]) {
        const wx = dog.x + (sx * Math.cos(dog.yaw) + hz * -Math.sin(dog.yaw) * -1) * sc, wz = dog.z + (-sx * Math.sin(dog.yaw) + hz * Math.cos(dog.yaw)) * sc;
        this.h.vis.glows.add(wx, dog.y + hy * sc, wz, hot ? 0.17 : 0.12, _c.r * intens, _c.g * intens, _c.b * intens);
      }
    }
    return n + 1;
  }

  list(out) {
    for (const d of this.dogs) if (!d.asleep) out.push({ id: d.id, kind: 'dog', pos: { x: d.x, y: d.y, z: d.z }, alert: d.state === 'chase' || d.state === 'notice' ? 1 : d.state === 'search' ? 0.4 : 0, state: d.state });
  }

  count() { return this.dogs.length; }
  setEnabled(on) { if (!on) { this.body.visible = this.legs.visible = false; for (const d of this.dogs) this._loop(d, false); } }
  snapshot() {
    return {
      count: this.dogs.length, packs: this.packs.length, fierce: +(this.fierce ?? 1).toFixed(2), stats: { ...this.stats },
      awake: this.dogs.filter((d) => !d.asleep).length, chasing: this.dogs.filter((d) => d.state === 'chase').length, calm: this.dogs.filter((d) => d.calm > 0).length,
    };
  }
  clear() {
    for (const d of this.dogs) this._loop(d, false);
    this.dogs.length = 0; this.packs.length = 0; this.body.count = this.legs.count = 0; this.body.visible = this.legs.visible = false;
  }
  reset() { this.clear(); this.rng = this.h.rng.fork('dogs'); this.populate(); }
}

const _p = { x: 0, z: 0 };
