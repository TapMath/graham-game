// Police drones and surveillance cameras (PLAN 6, 1b).
//
// Drones patrol the L1/L2 waypoint routes with a visible spotlight cone and a pool of light where it lands. Held in the
// beam for 1.6 s means DETAINED (see HazardSystem.detain). Singing within 40 m ("unregistered singing") makes the nearest
// drones fly over to investigate. Cameras sit at the health gates and sweep a narrow cone; one that sees the player calls
// the nearest drone. Everything is drawn instanced: one InstancedMesh for drones, one for camera heads, plus the shared
// beams and glows.
import * as THREE from '../../../vendor/three.module.js';
import { SIM_RADIUS, LEVEL_Y, clamp, hdist, dist3, turnToward, yawDir, dirYaw, inCone, lineOfSight, pointInRect, singHeard } from './util.js';
import { droneGeometry, cameraGeometry } from './models.js';
import { rimMaterial } from './render.js';

export const DRONE_TUNING = Object.freeze({
  detainSeconds: 1.6, spotRange: 15, spotHalf: 0.4, patrolSpeed: 3.6, investigateSpeed: 6.6, singRadius: 40, holdSeconds: 8,
  camRange: 14, camSee: 0.6, camCooldown: 8,
});

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1);

export class Drones {
  constructor(h) { this.h = h; this.drones = []; this.cams = []; this._id = 0; this.stats = { spotted: 0, detained: 0, investigations: 0, cameraCalls: 0 }; }

  init() {
    const { game } = this.h;
    this.rng = this.h.rng.fork('drones');
    this.mat = rimMaterial(game, { emissive: 0x20262e, rim: 0x6a8aff, power: 2.2, strength: 0.8, key: 'drone' });
    this.mesh = new THREE.InstancedMesh(droneGeometry(), this.mat, 16);
    this.camMesh = new THREE.InstancedMesh(cameraGeometry(), this.mat, 10);
    for (const m of [this.mesh, this.camMesh]) { m.frustumCulled = false; m.count = 0; m.visible = false; game.scene.add(m); }
    this.mesh.name = 'drones'; this.camMesh.name = 'cameras';
    this.populate();
  }

  populate() {
    const zones = this.h.game.world.hazardZones, rng = this.rng;
    this.fleetSpeed = rng.range(0.85, 1.25);
    this.fleetRange = rng.range(0.9, 1.15);
    for (const route of zones.drones) {
      const n = route.loop === true ? rng.int(1, 2) : rng.chance(0.25) ? 2 : 1;
      for (let i = 0; i < n; i++) this.addDrone(route, i, n);
    }
    for (const c of zones.cameras) this.addCamera(c);
  }

  addDrone(route, i = 0, n = 1, opts = {}) {
    const baseY = (opts.baseY ?? LEVEL_Y[route.level]) + (opts.altitude ?? route.altitude);
    const wps = route.waypoints, startIdx = Math.floor((wps.length * i) / n) % wps.length;
    const w = wps[startIdx];
    const d = {
      id: `${route.id}#${i}`, kind: 'drone', route, level: route.level, baseY, wp: wps, idx: (startIdx + 1) % wps.length, dir: 1,
      x: w[0], y: baseY, z: w[1], yaw: 0, speed: (opts.speed ?? this.rng.range(3.0, 4.2)) * (this.fleetSpeed ?? 1), state: 'patrol',
      target: null, hold: 0, spot: 0, aware: 0, range: DRONE_TUNING.spotRange * (this.fleetRange ?? 1), half: DRONE_TUNING.spotHalf,
      bx: 0, by: -0.8, bz: -0.6, sweep: this.rng.range(0, 6), losT: 0, los: false, alertSound: 0, loop: false, asleep: false, vx: 0, vz: 0, bob: this.rng.range(0, 6), tracked: false,
    };
    if (i > 0 && route.loop === 'pingpong') d.dir = -1;
    if (d.dir < 0) d.idx = clamp(startIdx - 1, 0, wps.length - 1);
    this.drones.push(d);
    return d;
  }

  addCamera(c) {
    const T = DRONE_TUNING;
    // the map's camera spot is the gate centre, inside the lintel: mount the head on top of the left post, looking out
    const gate = this.h.game.world.gate?.(c.gate);
    let mx = c.x, my = c.y, mz = c.z;
    if (gate) {
      const hw = gate.width / 2, ax = gate.axis === 'x' ? 1 : 0, az = 1 - ax, nx = gate.v[0], nz = gate.v[1];
      mx = gate.x - ax * (hw + 0.3) - nx * 0.5; mz = gate.z - az * (hw + 0.3) - nz * 0.5; my = gate.y + 4.78;
    }
    const cam = {
      id: c.id, kind: 'camera', gate: c.gate, x: mx, y: my, z: mz, yaw0: c.yaw, half: ((c.fov ?? 55) / 2) * Math.PI / 180, range: (c.range ?? T.camRange) * (this.fleetRange ?? 1),
      sweepAmp: this.rng.range(0.5, 0.85), period: this.rng.range(6, 9), ph: this.rng.range(0, 6), see: 0, cd: 0, track: 0, losT: 0, los: false, alert: 0, yaw: c.yaw, pitch: 0.28, look: null, asleep: false,
    };
    this.cams.push(cam);
    return cam;
  }

  // ---------------------------------------------------------------------------------------------- drones
  nearestWaypoint(d) {
    let best = 0, bd = Infinity;
    d.wp.forEach((w, i) => { const dd = Math.hypot(w[0] - d.x, w[1] - d.z); if (dd < bd) { bd = dd; best = i; } });
    return best;
  }

  investigate(d, x, z, why = 'sing', hold = DRONE_TUNING.holdSeconds) {
    if (d.state === 'track') return;
    d.state = 'investigate'; d.target = { x, z }; d.hold = hold; d.why = why; d.arrived = false;
    this.stats.investigations++;
    this.h.sound('drone-alert', d, 0.55);
  }

  /** Called by cameras: send the nearest drone (any level) to a position. */
  callNearest(x, y, z) {
    let best = null, bd = Infinity;
    for (const d of this.drones) { const dd = Math.hypot(d.x - x, d.z - z) + Math.abs(d.y - y) * 0.6; if (dd < bd) { bd = dd; best = d; } }
    if (best) { this.investigate(best, x, z, 'camera', 12); best.calledBy = 'camera'; this.stats.cameraCalls++; }
    return best;
  }

  updateDrone(d, dt) {
    const h = this.h, T = DRONE_TUNING, p = h.pp;
    d.sweep += dt; d.bob += dt;
    // ---- movement
    let tx = null, tz = null, sp = d.speed;
    if (d.state === 'patrol' || d.state === 'return') {
      const w = d.wp[d.idx];
      tx = w[0]; tz = w[1];
      if (Math.hypot(tx - d.x, tz - d.z) < 1.2) {
        if (d.state === 'return') { d.state = 'patrol'; }
        if (d.route.loop === true) d.idx = (d.idx + 1) % d.wp.length;
        else { if (d.idx + d.dir < 0 || d.idx + d.dir >= d.wp.length) d.dir *= -1; d.idx = clamp(d.idx + d.dir, 0, d.wp.length - 1); }
      }
      if (d.state === 'return') sp = 4.5;
    } else if (d.state === 'investigate') {
      tx = d.target.x; tz = d.target.z; sp = T.investigateSpeed;
      if (Math.hypot(tx - d.x, tz - d.z) < 2.5) {
        d.arrived = true; tx = null; d.hold -= dt;
        if (d.hold <= 0) { d.state = 'return'; d.idx = this.nearestWaypoint(d); this.h.sound('drone', d, 0.3); }
      }
    } else if (d.state === 'track') {
      // keep the player in the beam: drift over them
      tx = p.x; tz = p.z; sp = 2.8;
      if (Math.hypot(tx - d.x, tz - d.z) < 5) tx = null;
    }
    if (tx !== null) {
      const dx = tx - d.x, dz = tz - d.z, dd = Math.hypot(dx, dz) || 1;
      const want = clamp(sp, 0, dd / dt);
      d.vx += (dx / dd * want - d.vx) * Math.min(1, dt * 2.2); d.vz += (dz / dd * want - d.vz) * Math.min(1, dt * 2.2);
    } else { d.vx *= 1 - Math.min(1, dt * 2.5); d.vz *= 1 - Math.min(1, dt * 2.5); }
    d.x += d.vx * dt; d.z += d.vz * dt;
    d.y = d.baseY + Math.sin(d.bob * 1.6) * 0.18;
    const spd = Math.hypot(d.vx, d.vz);
    if (spd > 0.4) d.yaw = turnToward(d.yaw, dirYaw(d.vx, d.vz), 2.4 * dt);
    else if (d.state === 'investigate' && d.arrived) d.yaw += dt * 0.6;

    // ---- beam direction: forward and down, swinging side to side; locked on the player while tracking
    const fwd = yawDir(d.yaw + Math.sin(d.sweep * 1.9) * 0.45 * (d.state === 'track' ? 0 : 1));
    let tbx = fwd.x * 0.62, tby = -0.78, tbz = fwd.z * 0.62;
    if (d.state === 'investigate' && d.arrived) { const a = d.sweep * 1.4; tbx = Math.cos(a) * 0.5; tbz = Math.sin(a) * 0.5; tby = -0.85; }
    if (d.state === 'track' || d.spot > 0.05) { tbx = p.x - d.x; tby = p.y + 0.9 - d.y; tbz = p.z - d.z; }
    const tl = Math.hypot(tbx, tby, tbz) || 1; tbx /= tl; tby /= tl; tbz /= tl;
    const k = Math.min(1, dt * (d.spot > 0.05 ? 7 : 3.2));
    d.bx += (tbx - d.bx) * k; d.by += (tby - d.by) * k; d.bz += (tbz - d.bz) * k;
    const bl = Math.hypot(d.bx, d.by, d.bz) || 1; d.bx /= bl; d.by /= bl; d.bz /= bl;

    // ---- detection
    d.losT -= dt;
    const cx = p.x, cy = p.y + 1.0, cz = p.z;
    const along = inCone(d.x, d.y - 0.15, d.z, d.bx, d.by, d.bz, d.half, d.range, cx, cy, cz);
    let visible = false;
    if (along >= 0 && h.grace <= 0 && !h.detaining) {
      if (d.losT <= 0) { d.losT = 0.1; d.los = lineOfSight(h.game, d.x, d.y - 0.15, d.z, cx, cy, cz); }
      visible = d.los;
    } else d.los = false;
    if (visible) {
      if (d.spot <= 0.02) { this.stats.spotted++; h.sound('drone-alert', d, 0.8); h.pa(h.pick(PA_SPOT), 5); h.game.screenfx?.glitch?.(180); }
      d.spot = Math.min(T.detainSeconds + 0.5, d.spot + dt);
      if (d.state !== 'track') { d.state = 'track'; d.target = null; }
      if (d.spot >= T.detainSeconds) { h.detain('drone', { drone: d.id }); d.spot = 0; d.state = 'return'; d.idx = this.nearestWaypoint(d); }
    } else {
      d.spot = Math.max(0, d.spot - dt * 1.5);
      if (d.state === 'track' && d.spot <= 0) { d.state = 'investigate'; d.target = { x: p.x, z: p.z }; d.hold = 5; d.arrived = false; }
    }
    d.aware = d.state === 'track' ? 1 : d.state === 'investigate' ? 0.6 : 0;
  }

  drawDrone(d, n, dist) {
    const h = this.h;
    _v.set(d.x, d.y, d.z);
    _e.set(Math.min(0.25, Math.hypot(d.vx, d.vz) * 0.05), d.yaw, Math.sin(d.bob * 1.1) * 0.03, 'YXZ'); _q.setFromEuler(_e);
    _m.compose(_v, _q, _s.set(1, 1, 1));
    this.mesh.setMatrixAt(n, _m);
    // lights: a red anti-collision blink, a white nose lamp, and the spotlight cone
    const blink = (Math.sin(d.bob * 5) > 0.6) ? 1 : 0.25, hot = d.state === 'track';
    const f = 1 - clamp((dist - 60) / 50, 0, 0.9);
    h.vis.glows.add(d.x, d.y + 0.16, d.z, hot ? 0.9 : 0.6, 1.4 * blink * f, 0.08 * f, 0.05 * f);
    h.vis.glows.add(d.x, d.y - 0.18, d.z, 0.5, 0.9 * f, 0.95 * f, 1.0 * f);
    const col = hot ? [0.34, 0.12, 0.08] : d.state === 'investigate' ? [0.28, 0.2, 0.08] : [0.12, 0.19, 0.24];
    h.vis.beams.add(d.x, d.y - 0.15, d.z, d.bx, d.by, d.bz, d.half, d.range, col[0] * f, col[1] * f, col[2] * f);
  }

  // ---------------------------------------------------------------------------------------------- cameras
  updateCam(c, dt, dist) {
    const h = this.h, T = DRONE_TUNING, p = h.pp;
    c.ph += dt; c.cd = Math.max(0, c.cd - dt); c.alert = Math.max(0, c.alert - dt);
    const look = c.look && c.look.t > 0 ? c.look : null;
    if (look) look.t -= dt;
    let wantYaw = c.yaw0 + Math.sin((c.ph / c.period) * Math.PI * 2) * c.sweepAmp, wantPitch = 0.3;
    if (c.track > 0) {
      c.track -= dt;
      wantYaw = dirYaw(p.x - c.x, p.z - c.z); wantPitch = Math.atan2(c.y - (p.y + 1), Math.hypot(p.x - c.x, p.z - c.z));
    } else if (look) { wantYaw = dirYaw(look.x - c.x, look.z - c.z); wantPitch = 0.25; }
    c.yaw = turnToward(c.yaw, wantYaw, 2.2 * dt);
    c.pitch += (clamp(wantPitch, 0.05, 0.9) - c.pitch) * Math.min(1, dt * 3);
    const dx = -Math.sin(c.yaw) * Math.cos(c.pitch), dz = -Math.cos(c.yaw) * Math.cos(c.pitch), dy = -Math.sin(c.pitch);
    c.dx = dx; c.dy = dy; c.dz = dz;
    const ox = c.x + dx * 0.45, oy = c.y + dy * 0.45, oz = c.z + dz * 0.45;
    const along = inCone(ox, oy, oz, dx, dy, dz, c.half, c.range, p.x, p.y + 1.0, p.z);
    let visible = false;
    if (along >= 0 && h.grace <= 0 && !h.detaining && c.cd <= 0) {
      c.losT -= dt;
      if (c.losT <= 0) { c.losT = 0.1; c.los = lineOfSight(h.game, ox, oy, oz, p.x, p.y + 1.0, p.z); }
      visible = c.los;
    }
    if (visible) {
      c.see += dt;
      if (c.see >= T.camSee) {
        c.see = 0; c.cd = T.camCooldown; c.track = 3; c.alert = 4;
        h.sound('camera-alert', c, 0.85);
        const dr = this.callNearest(p.x, p.y, p.z);
        h.say(dr ? 'A camera swivels toward you, its little motor whining. Somewhere above, a drone changes course.' : 'A camera swivels toward you, its little motor whining.', 'story', 6);
      }
    } else c.see = Math.max(0, c.see - dt * 1.5);
  }

  drawCam(c, n, dist) {
    const h = this.h;
    _v.set(c.x, c.y, c.z); _e.set(-c.pitch, c.yaw, 0, 'YXZ'); _q.setFromEuler(_e);
    _m.compose(_v, _q, _s.set(1, 1, 1)); this.camMesh.setMatrixAt(n, _m);
    const alert = c.alert > 0, f = 1 - clamp((dist - 60) / 50, 0, 0.9);
    const blink = alert ? (Math.sin(c.ph * 14) > 0 ? 1 : 0.3) : (Math.sin(c.ph * 2.6) > 0.8 ? 1 : 0.2);
    h.vis.glows.add(c.x - c.dx * 0.1, c.y + 0.2, c.z - c.dz * 0.1, alert ? 0.7 : 0.45, 1.4 * blink * f, 0.06 * f, 0.04 * f);
    const col = alert ? [0.42, 0.08, 0.06] : [0.12, 0.22, 0.26];
    h.vis.beams.add(c.x + c.dx * 0.45, c.y + c.dy * 0.45, c.z + c.dz * 0.45, c.dx, c.dy, c.dz, c.half, c.range, col[0] * f, col[1] * f, col[2] * f);
  }

  // ---------------------------------------------------------------------------------------------- frame
  update(dt) {
    const h = this.h, p = h.pp;
    let n = 0, nc = 0;
    for (const d of this.drones) {
      const dist = dist3(d, p);
      if (dist > SIM_RADIUS) { if (!d.asleep) { d.asleep = true; this._loop(d, false); } continue; }
      d.asleep = false;
      this.updateDrone(d, dt);
      if (dist < 110) { this.drawDrone(d, n++, dist); this._loop(d, dist < 90); } else this._loop(d, false);
    }
    for (const c of this.cams) {
      const dist = dist3(c, p);
      c.asleep = dist > SIM_RADIUS;
      if (c.asleep) continue;
      this.updateCam(c, dt, dist);
      if (dist < 110) this.drawCam(c, nc++, dist);
    }
    this.mesh.count = n; this.mesh.visible = n > 0; if (n) this.mesh.instanceMatrix.needsUpdate = true;
    this.camMesh.count = nc; this.camMesh.visible = nc > 0; if (nc) this.camMesh.instanceMatrix.needsUpdate = true;
  }

  _loop(d, on) {
    const ev = this.h.game.events;
    if (on && !d.loop) { d.loop = true; ev.emit('sound:loop', { id: `drone:${d.id}`, kind: 'drone', loudness: 0.55, getPos: () => d }); }
    else if (!on && d.loop) { d.loop = false; ev.emit('sound:loopStop', { id: `drone:${d.id}` }); }
  }

  onSing(pos) {
    const T = DRONE_TUNING, game = this.h.game;
    for (const d of this.drones) {
      if (d.asleep && dist3(d, this.h.pp) > SIM_RADIUS) continue;
      if (!singHeard(game, d, pos, T.singRadius)) continue;
      this.investigate(d, pos.x, pos.z, 'sing');
    }
    let heardByCam = false;
    for (const c of this.cams) {
      if (!singHeard(game, c, pos, T.singRadius)) continue;
      c.look = { x: pos.x, z: pos.z, t: 4 };
      c.alert = 3; heardByCam = true;
      this.h.sound('camera-alert', c, 0.6);
    }
    if (heardByCam) this.callNearest(pos.x, pos.y, pos.z);
  }

  /** The player was detained: everything stands down. */
  stand_down() {
    for (const d of this.drones) { d.spot = 0; if (d.state === 'track' || d.state === 'investigate') { d.state = 'return'; d.idx = this.nearestWaypoint(d); } }
    for (const c of this.cams) { c.see = 0; c.track = 0; c.cd = 6; }
  }

  list(out) {
    for (const d of this.drones) if (!d.asleep) out.push({ id: d.id, kind: 'drone', pos: { x: d.x, y: d.y, z: d.z }, alert: d.state === 'track' ? 1 : d.state === 'investigate' ? 0.6 : 0, state: d.state });
    for (const c of this.cams) if (!c.asleep) out.push({ id: c.id, kind: 'camera', pos: { x: c.x, y: c.y, z: c.z }, alert: c.alert > 0 ? 1 : 0, state: c.alert > 0 ? 'alert' : 'idle' });
  }

  setEnabled(on) { if (!on) { this.mesh.visible = this.camMesh.visible = false; for (const d of this.drones) this._loop(d, false); } }
  snapshot() {
    return {
      drones: this.drones.length, cameras: this.cams.length, stats: { ...this.stats }, tracking: this.drones.filter((d) => d.state === 'track').length,
      investigating: this.drones.filter((d) => d.state === 'investigate').length, spot: +Math.max(0, ...this.drones.map((d) => d.spot)).toFixed(2),
      states: this.drones.map((d) => d.state[0]).join(''), camAlerts: this.cams.filter((c) => c.alert > 0).length,
    };
  }
  clear() { for (const d of this.drones) this._loop(d, false); this.drones.length = 0; this.cams.length = 0; this.mesh.count = this.camMesh.count = 0; this.mesh.visible = this.camMesh.visible = false; }
  reset() { this.clear(); this.rng = this.h.rng.fork('drones'); this.populate(); }
}

const PA_SPOT = [
  'Attention. An unregistered person has been identified. Please remain where you are.',
  'Remain calm. You are being scanned. Sunlight is a privilege, not a right.',
  'Citizen, you are outside a permitted corridor. Please hold still.',
];
void pointInRect;
