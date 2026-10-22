// First-person controller. A system: game.addSystem('player', new Player()); afterwards `game.player`.
//
// Movement: WASD walk (4.2 m/s), Shift sprint (7), Space jump (7 m/s), gravity 22 m/s^2.
// Step-up: ledges up to PLAYER.stepHeight (0.6 m) are walked over, stairs included, with the camera
// smoothed so it does not pop. Standing on a dynamic collider (lift, slab) carries the player.
//
// Events emitted on game.events:
//   player:jump     {}
//   player:land     {height, speed}             every landing after a fall of >= 0.5 m
//   player:fall     {height, damage}            every landing after a fall of >= 2 m; `damage` is the
//                                               ray cost (0 below the 9 m threshold). Phase 3 applies it.
//   player:void     {cost}                      fell out of the world (below world.killY); player is
//                                               respawned right after, `cost` is the ray penalty (1)
//   player:respawn  {reason, x, y, z}           put back at the last safe position
//   player:interact {}                          E pressed (systems check proximity themselves)
//   player:sing     {}                          Q pressed
//
// `rays` is a placeholder here (7 of 12); the health system (Phase 3) owns it from then on.

import { PLAYER } from './physics.js';
import { levelAt } from '../world/levels.js';

export const MOVE = Object.freeze({
  walk: 4.2, sprint: 7, jump: 7, gravity: 22, terminal: 60,
  groundAccel: 45, groundFriction: 40, airAccel: 10,
  coyote: 0.1, jumpBuffer: 0.12,
});
export const FALL = Object.freeze({ freeHeight: 9, metresPerRay: 4 });

/** Rays lost for a fall of `height` metres: free up to 9 m, then 1 ray per 4 m (or part) beyond. */
export function fallDamage(height) {
  return height > FALL.freeHeight ? Math.floor((height - FALL.freeHeight) / FALL.metresPerRay) + 1 : 0;
}

export class Player {
  init(game) {
    this.game = game;
    game.player = this;
    this.world = game.physics;
    this.camera = game.camera;
    this.camera.rotation.order = 'YXZ';

    this.pos = { x: 0, y: 0, z: 0 };      // feet position
    this.vel = { x: 0, y: 0, z: 0 };
    this.yaw = 0;                          // radians; 0 faces -Z, +yaw turns left
    this.pitch = 0;
    this.rays = 7;                         // placeholder until the health system exists
    this.maxRays = 12;
    this.onGround = false;
    this.ground = null;                    // collider we stand on
    this.groundPos = { x: 0, y: 0, z: 0 }; // its `pos` last frame (for carrying)
    this.sprinting = false;
    this.frozen = false;                   // debug: skip physics (free camera)
    this.speedScale = 1;                   // debug / future slow effects
    this.stepSmooth = 0;                   // camera lag after a step up/down
    this.lastSafe = { x: 0, y: 0, z: 0 };
    this.safeTimer = 0;
    this._coyote = 0;
    this._jumpBuf = 0;
    this._fallPeak = 0;
    this._look = { x: 0, y: 0 };
    this._axis = { x: 0, y: 0 };
    this.reset(game);
  }

  /** Back to the world's spawn point. */
  reset(game = this.game) {
    const s = game.world.spawn;
    this.teleport(s.x, s.y, s.z, s.yaw ?? 0);
    this.rays = 7;
  }

  /** Place the player (feet position) and clear motion. Also becomes the last safe position. */
  teleport(x, y, z, yaw) {
    this.pos.x = x; this.pos.y = y; this.pos.z = z;
    this.vel.x = this.vel.y = this.vel.z = 0;
    if (yaw !== undefined) this.yaw = yaw;
    this.onGround = false; this.ground = null; this.stepSmooth = 0;
    this._fallPeak = y; this._coyote = 0;
    this.lastSafe.x = x; this.lastSafe.y = y; this.lastSafe.z = z; this.safeTimer = 0;
    this.syncCamera();
  }

  setLook(yaw, pitch) {
    this.yaw = yaw;
    this.pitch = Math.max(-1.5, Math.min(1.5, pitch));
    this.syncCamera();
  }

  /** Put the player back at the last position where they had stood safely for a moment. */
  respawn(reason = 'manual') {
    const s = this.lastSafe;
    this.teleport(s.x, s.y + 0.05, s.z);
    this.game.events.emit('player:respawn', { reason, x: s.x, y: s.y, z: s.z });
  }

  get level() { return levelAt(this.pos.y); }
  get eyeY() { return this.pos.y + PLAYER.eye - this.stepSmooth; }

  syncCamera() {
    this.camera.position.set(this.pos.x, this.eyeY, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);
  }

  update(dt, game) {
    const input = game.input;

    // ---- look (mouse when locked, arrow keys always)
    const look = input.consumeLook(this._look);
    const sgn = input.invertY ? -1 : 1;
    this.yaw -= look.x * input.sensitivity;
    this.pitch -= look.y * input.sensitivity * sgn;
    this.yaw += ((input.action('lookLeft') ? 1 : 0) - (input.action('lookRight') ? 1 : 0)) * 1.9 * dt;
    this.pitch += ((input.action('lookUp') ? 1 : 0) - (input.action('lookDown') ? 1 : 0)) * 1.2 * dt;
    this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));

    if (input.pressed('interact')) game.events.emit('player:interact', {});
    if (input.pressed('sing')) game.events.emit('player:sing', {});

    if (!this.frozen) this._move(dt, input);
    this.stepSmooth *= Math.exp(-12 * dt);
    if (Math.abs(this.stepSmooth) < 1e-3) this.stepSmooth = 0;
    this.syncCamera();
  }

  _move(dt, input) {
    const w = this.world, pos = this.pos, vel = this.vel;

    // ---- carried by a moving platform (lift / collapsing slab)
    if (this.onGround && this.ground && this.ground.dynamic && this.ground.enabled) {
      const gp = this.ground.pos, o = this.groundPos;
      const cx = gp.x - o.x, cy = gp.y - o.y, cz = gp.z - o.z;
      if (cx !== 0 || cz !== 0) w.slideMove(pos, cx, cz, pos.y, PLAYER.stepHeight);
      pos.y += cy;
      o.x = gp.x; o.y = gp.y; o.z = gp.z;
    }

    // ---- wish direction
    const ax = input.moveAxis(this._axis);
    let wx = 0, wz = 0;
    const len = Math.hypot(ax.x, ax.y);
    if (len > 0) {
      const f = ax.y / len, s = ax.x / len;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      wx = -sin * f + cos * s;     // forward = (-sin, -cos); right = (cos, -sin)
      wz = -cos * f - sin * s;
    }
    this.sprinting = input.action('sprint') && ax.y > 0;
    const speed = (this.sprinting ? MOVE.sprint : MOVE.walk) * this.speedScale;

    // ---- horizontal velocity
    const tx = wx * speed, tz = wz * speed;
    if (this.onGround) {
      const rate = (len > 0 ? MOVE.groundAccel : MOVE.groundFriction) * dt;
      vel.x = approach(vel.x, tx, rate); vel.z = approach(vel.z, tz, rate);
    } else if (len > 0) {
      const rate = MOVE.airAccel * dt;
      vel.x = approach(vel.x, tx, rate); vel.z = approach(vel.z, tz, rate);
    }

    // ---- jump (with buffer + coyote time)
    if (input.pressed('jump')) this._jumpBuf = MOVE.jumpBuffer;
    else this._jumpBuf = Math.max(0, this._jumpBuf - dt);
    this._coyote = this.onGround ? MOVE.coyote : Math.max(0, this._coyote - dt);
    if (this._jumpBuf > 0 && (this.onGround || this._coyote > 0)) {
      vel.y = MOVE.jump; this.onGround = false; this.ground = null;
      this._coyote = 0; this._jumpBuf = 0; this._fallPeak = pos.y;
      this.game.events.emit('player:jump', {});
    }

    vel.y = Math.max(-MOVE.terminal, vel.y - MOVE.gravity * dt);

    // ---- horizontal move with collision
    const stepH = this.onGround ? PLAYER.stepHeight : PLAYER.airStep;
    const px = pos.x, pz = pos.z;
    w.slideMove(pos, vel.x * dt, vel.z * dt, pos.y, stepH);
    if (w.hitX) vel.x = (pos.x - px) / dt;
    if (w.hitZ) vel.z = (pos.z - pz) / dt;

    // ---- vertical
    const prevY = pos.y;
    const newY = prevY + vel.y * dt;
    if (vel.y > 0) {
      const ceil = w.ceilingAt(pos.x, pos.z, prevY + PLAYER.height, newY + PLAYER.height);
      if (ceil < Infinity) { pos.y = ceil - PLAYER.height - 1e-3; vel.y = 0; } else pos.y = newY;
      this._leaveGround();
    } else {
      const g = w.groundHeightAt(pos.x, pos.z, prevY, stepH);
      if (g > -Infinity && newY <= g + 1e-6) {
        this._land(g, vel.y);
      } else if (this.onGround && g > -Infinity && prevY - g <= PLAYER.stepHeight) {
        this._land(g, 0); // walking down stairs / a ramp: stay glued to the surface
      } else {
        pos.y = newY;
        this._leaveGround();
      }
    }
    if (!this.onGround && pos.y > this._fallPeak) this._fallPeak = pos.y;

    // ---- last safe position + falling out of the world
    if (this.onGround && this.ground && !this.ground.dynamic) {
      this.safeTimer += dt;
      if (this.safeTimer > 0.5 && this._wellSupported()) { this.lastSafe.x = pos.x; this.lastSafe.y = pos.y; this.lastSafe.z = pos.z; }
    } else this.safeTimer = 0;
    if (pos.y < w.killY) {
      this.game.events.emit('player:void', { cost: 1 });
      this.respawn('void');
    }
  }

  /** True if there is floor close to level on all four sides (so not at a ledge or gap edge). */
  _wellSupported(margin = 0.7) {
    const { x, y, z } = this.pos, w = this.world;
    for (const [dx, dz] of [[margin, 0], [-margin, 0], [0, margin], [0, -margin]]) {
      if (!(w.groundHeightAt(x + dx, z + dz, y, 0.3, 0.05) > y - 0.5)) return false;
    }
    return true;
  }

  _leaveGround() {
    if (!this.onGround) return;
    this.onGround = false; this.ground = null; this._fallPeak = this.pos.y;
  }

  _land(groundY, vy) {
    const pos = this.pos, w = this.world;
    const wasAir = !this.onGround;
    const dy = groundY - pos.y;
    if (!wasAir) this.stepSmooth += dy;          // grounded -> grounded: smooth the camera over steps
    pos.y = groundY;
    this.vel.y = 0;
    this.onGround = true;
    this.ground = w.groundCollider;
    if (this.ground && this.ground.dynamic) {
      const p = this.ground.pos; this.groundPos.x = p.x; this.groundPos.y = p.y; this.groundPos.z = p.z;
    }
    if (wasAir) {
      const height = this._fallPeak - groundY;
      if (height >= 0.5) this.game.events.emit('player:land', { height, speed: -vy });
      if (height >= 2) this.game.events.emit('player:fall', { height, damage: fallDamage(height) });
    }
  }
}

function approach(v, target, maxDelta) {
  if (v < target) return Math.min(v + maxDelta, target);
  return Math.max(v - maxDelta, target);
}
