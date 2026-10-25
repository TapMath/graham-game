// Crowds (Phase 8B): a packed Mumbai. Instanced, vertex-animated pedestrians and traffic, dense on the ground and thinning upward.
//
//   game.crowds = {
//     agents[]          every simulated person {mode, x, y, z, yaw, level, ...}   (about 1000)
//     vehicles[]        every simulated vehicle {type, x, y, z, yaw, v, level}      (about 150)
//     stats             {agents, vehicles, drawn:{people, vehicles, riders}, ...}   what the last frame drew
//     density           1 = full; the settings can lower it    setEnabled(bool)
//     count(level)      agents on a level                       near(x, z, r)  agents within r metres
//   }
// People are drawn as 2 InstancedMeshes (men and women, 1 draw call each, the walk is animated in the vertex shader), traffic as 3
// (taxis, auto-rickshaws, buses) and the lamps as 1; only the nearest ~600 people and ~60 vehicles within reach of the camera are
// written each frame, so the cost follows what you can see. People walk along street, platform, alley and bazaar lanes, wait at the
// level crossings of the Harbour Line, part around the player, board and leave the trains at the stations. Passengers of the
// trains (from game.transit) are drawn through the same meshes.
//
// Look: skin tones and clothing come from `game.characterStyle` when Phase 8C provides it (arrays of hex colours in `skinTones`,
// `shirts`, `trousers`, `saris`, `blouses`, `accents`, `rich`), else the defaults in people.js.
import * as THREE from '../../../vendor/three.module.js';
import { makePersonGeometry, makePersonMaterial, addInstanceAttributes, DEFAULT_STYLE } from './people.js';
import { VEHICLES, makeVehicleMaterial } from './vehicles.js';
import { Glows } from '../hazards/render.js';
import { populate, buildVehicleLanes } from './populate.js';
import { LAYOUT } from '../transit/train-model.js';

const CAP_MAN = 360, CAP_WOMAN = 300, CAP_V = { taxi: 48, auto: 48, bus: 16 };
const SEL_MAX = CAP_MAN + CAP_WOMAN;
const tmpC = new THREE.Color();
const rgb = (hex, out, o) => { tmpC.set(hex); out[o] = tmpC.r; out[o + 1] = tmpC.g; out[o + 2] = tmpC.b; };

export class CrowdSystem {
  init(game) {
    this.game = game;
    game.crowds = this;
    this.rng = game.rng.fork('crowds');
    this.enabled = true; this.density = 1; this.frameCount = 0;
    this.style = this._style();
    this.stats = { agents: 0, vehicles: 0, drawn: { people: 0, vehicles: 0, riders: 0 }, boarded: 0, alighted: 0 };

    // ---- the meshes
    const mat = this.pmat = makePersonMaterial(game);
    this.pm = [];
    for (const [kind, cap] of [['man', CAP_MAN], ['woman', CAP_WOMAN]]) {
      const geo = makePersonGeometry(kind), at = addInstanceAttributes(geo, cap);
      const mesh = new THREE.InstancedMesh(geo, mat, cap);
      mesh.name = `crowd-${kind}`; mesh.frustumCulled = false; mesh.count = 0; mesh.visible = false;
      game.scene.add(mesh);
      this.pm.push({ mesh, at, cap, n: 0, kind });
    }
    const vmat = makeVehicleMaterial(game);
    this.vm = {};
    for (const [name, def] of Object.entries(VEHICLES)) {
      const mesh = new THREE.InstancedMesh(def.make(), vmat, CAP_V[name]);
      mesh.name = `traffic-${name}`; mesh.frustumCulled = false; mesh.count = 0; mesh.visible = false;
      mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP_V[name] * 3), 3);
      game.scene.add(mesh);
      this.vm[name] = { mesh, cap: CAP_V[name], n: 0, def };
    }
    this.lamps = new Glows(game, 260);
    this._m4 = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._e = new THREE.Euler();
    this._sel = []; this._fwd = new THREE.Vector3();

    // ---- the people
    this.agents = []; this.vehicles = []; this.lanes = []; this.vlanes = [];
    populate(this);
    buildVehicleLanes(this);
    this.stats.agents = this.agents.length; this.stats.vehicles = this.vehicles.length;
    this.riderLooks = new Map();
    this.transients = [];

    // ---- events from the transit system: people board and get off at the stations
    game.events.on('transit:arrive', (d) => this._onArrive(d));
    const r0 = game.render.bind(game);
    game.render = () => { try { this.draw(); } catch (e) { if (!this._warned) { this._warned = true; console.error('[crowds] draw failed:', e); } } r0(); };

    const dbg = game.debug;
    dbg?.addState('crowds', () => ({ enabled: this.enabled, density: this.density, ...this.stats, byLevel: this._byLevel() }));
    dbg?.addSetter('crowds', (g, v) => this.setEnabled(!!v));
    dbg?.addSetter('crowdDensity', (g, v) => { this.density = +v; });
    dbg?.addAction('crowdNear', (g, r = 20) => this.near(g.player.pos.x, g.player.pos.z, r).length);
  }

  _style() {
    const cs = this.game.characterStyle ?? {};
    const pick = (k) => (Array.isArray(cs[k]) && cs[k].length ? cs[k] : DEFAULT_STYLE[k]);
    return { skinTones: pick('skinTones'), shirts: pick('shirts'), trousers: pick('trousers'), saris: pick('saris'), blouses: pick('blouses'), accents: pick('accents'), rich: pick('rich') };
  }

  setEnabled(on) { this.enabled = on; if (!on) this._hideAll(); }
  _hideAll() { for (const p of this.pm) { p.mesh.count = 0; p.mesh.visible = false; } for (const v of Object.values(this.vm)) { v.mesh.count = 0; v.mesh.visible = false; } this.lamps.begin(); this.lamps.end(); }
  _byLevel() { const o = { U: 0, G: 0, L1: 0, L2: 0, L3: 0 }; for (const a of this.agents) o[a.level] = (o[a.level] ?? 0) + 1; return o; }
  near(x, z, r) { const out = []; for (const a of this.agents) if (!a.hidden && Math.hypot(a.x - x, a.z - z) < r) out.push(a); return out; }
  count(level) { let n = 0; for (const a of this.agents) if (a.level === level) n++; return n; }

  /** Roll an appearance into `a` (colours go into a.col, 12 floats: skin, shirt/blouse, trousers/sari, accent). */
  look(a, { woman = a.woman, kid = false, rich = false, umbrella = 0.6 } = {}) {
    const r = this.rng, S = this.style, c = a.col ?? (a.col = new Float32Array(12));
    rgb(r.pick(S.skinTones), c, 0);
    if (rich) {
      rgb(r.pick(S.rich), c, 3); rgb(r.pick(S.rich), c, 6); rgb(r.pick(S.rich), c, 9);
    } else if (woman) {
      rgb(r.pick(S.blouses), c, 3); rgb(r.pick(S.saris), c, 6); rgb(r.pick(S.saris), c, 9);
    } else {
      rgb(r.pick(S.shirts), c, 3); rgb(r.pick(S.trousers), c, 6); rgb(r.pick(S.accents), c, 9);
    }
    a.flags = 0;
    if (r.next() < umbrella) a.flags |= 1;
    else if (!woman && r.next() < 0.18) a.flags |= 2;
    if (r.next() < 0.28) a.flags |= 4;
    if (woman && !(a.flags & 1) && r.next() < 0.1) a.flags |= 8;
    a.scale = kid ? 0.58 + r.next() * 0.12 : (woman ? 0.93 : 1.0) + (r.next() - 0.5) * 0.1;
    return a;
  }

  // ------------------------------------------------------------------ simulation (cheap: every step moves every agent along its lane)
  update(dt, game) {
    if (!this.enabled) return;
    this.frameCount++;
    const px = game.player.pos.x, pz = game.player.pos.z, py = game.player.pos.y, cross = game.transit?.crossings ?? [], cmap = this._cmap ?? (this._cmap = new Map());
    cmap.clear(); for (const c of cross) cmap.set(c.id, c.state);
    const sp = dt;
    for (const a of this.agents) {
      switch (a.mode) {
        case 'lane': this._stepLane(a, sp, px, pz, py, cmap); break;
        case 'board': this._stepBoard(a, sp); break;
        case 'wait': a.timer -= sp; if (a.timer <= 0) this._respawnStander(a); break;
        case 'stand': case 'sleep': a.phase += sp * 0.9; break;
        default: break;
      }
    }
    for (let i = this.transients.length - 1; i >= 0; i--) {
      const a = this.transients[i];
      this._stepPath(a, sp);
      if (a.done) { a.hidden = true; this.transients.splice(i, 1); const k = this.agents.indexOf(a); if (k >= 0) this.agents.splice(k, 1); }
    }
    this._stepVehicles(sp, px, pz, cmap);
  }

  _stepLane(a, dt, px, pz, py, cmap) {
    const L = a.lane;
    let sp = a.speed;
    // wait for the Harbour Line's booms
    if (L.stops) for (const st of L.stops) {
      if (st.dir !== a.dir) continue;
      const ahead = (st.s - a.s) * a.dir;
      if (ahead > -0.05 && ahead < 0.6 + sp * dt && (cmap.get(st.id) ?? 'open') !== 'open') { sp = 0; break; }
    }
    // part around the player
    const dx = a.x - px, dz = a.z - pz;
    if (dx * dx + dz * dz < 12 && Math.abs(a.y - py) < 2.5) {
      const po = (px - L.ax) * L.px + (pz - L.az) * L.pz;
      const d = a.lat - po, near = Math.hypot(dx, dz);
      a.lat = Math.max(a.lat0 - 1.7, Math.min(a.lat0 + 1.7, a.lat + (d >= 0 ? 1 : -1) * dt * 1.5 * (1 - near / 3.5)));
      if (near < 1.6) sp *= 0.55;
    } else a.lat += (a.lat0 - a.lat) * Math.min(1, dt * 0.8);
    a.s += a.dir * sp * dt;
    if (a.s > L.len) { a.s = L.len; a.dir = -1; this._reroll(a); }
    else if (a.s < 0) { a.s = 0; a.dir = 1; this._reroll(a); }
    a.x = L.ax + L.ux * a.s + L.px * a.lat; a.z = L.az + L.uz * a.s + L.pz * a.lat;
    a.y = L.y + (L.station ? this._platformY(a.x, a.z) : 0);
    a.yaw = Math.atan2(-L.ux * a.dir, -L.uz * a.dir);
    a.amp = sp > 0 ? Math.min(1, sp / 1.4) : 0;
    a.phase += sp * dt * 3.9 / Math.max(0.55, a.scale);
  }

  _reroll(a) { if (this.rng.next() < 0.5) this.look(a, { woman: a.woman, kid: a.kid, rich: a.rich, umbrella: a.umbrellaChance ?? 0.6 }); }

  _platformY(x, z) {
    const rail = this.game.world.rail;
    if (!rail) return 0;
    for (const p of rail.platforms) {
      if (z < p.z0 - 0.3 || z > p.z1 + 0.3) continue;
      if (x >= p.x0 && x <= p.x1) return 0.5;
      if (x > p.x0 - 3 && x < p.x0) return 0.5 * (x - (p.x0 - 3)) / 3;
      if (x > p.x1 && x < p.x1 + 3) return 0.5 * (1 - (x - p.x1) / 3);
    }
    return 0;
  }

  _stepBoard(a, dt) {
    const tx = a.tx - a.x, tz = a.tz - a.z, d = Math.hypot(tx, tz);
    if (d < 0.25) { a.mode = 'wait'; a.timer = 16 + this.rng.next() * 14; a.hidden = true; this.stats.boarded++; return; }
    const sp = 1.5 * dt;
    a.x += tx / d * sp; a.z += tz / d * sp;
    a.yaw = Math.atan2(-tx, -tz); a.amp = 1; a.phase += sp * 3.9;
  }
  _respawnStander(a) {
    const h = a.home;
    a.x = h.x + (this.rng.next() - 0.5) * 1.6; a.z = h.z + (this.rng.next() - 0.5) * 0.6; a.y = h.y; a.yaw = h.yaw; a.mode = 'stand'; a.hidden = false; a.amp = 0.04;
    this.look(a, { woman: a.woman, umbrella: 0.15 });
  }
  _stepPath(a, dt) {
    const w = a.path[a.pi];
    if (!w) { a.done = true; return; }
    const tx = w[0] - a.x, tz = w[1] - a.z, d = Math.hypot(tx, tz);
    if (d < 0.2) { a.pi++; return; }
    const sp = a.speed * dt;
    a.x += tx / d * sp; a.z += tz / d * sp; a.yaw = Math.atan2(-tx, -tz); a.amp = 1; a.phase += sp * 3.9;
    a.y = this._platformY(a.x, a.z);
    a.life -= dt; if (a.life <= 0) a.done = true;
  }

  _onArrive({ train, station, dir }) {
    const game = this.game, tr = game.transit?.trains.find((t) => t.id === train);
    if (!tr) return;
    const side = dir === 'east' ? 'north' : 'south', s = side === 'north' ? -1 : 1, st = game.transit.stations.find((q) => q.id === station);
    const P = game.world.rail.platforms.find((p) => p.station === station && p.side === side);
    if (!P || !st) return;
    // people get off at every door, cross the platform and leave by its nearer end...
    const mid = (P.z0 + P.z1) / 2;
    for (const dx of LAYOUT.doors) {
      if (this.rng.next() < 0.3) continue;
      const n = 1 + (this.rng.next() < 0.5 ? 1 : 0), doorX = tr.x + dx, ex = this._exitX(P, doorX);
      for (let k = 0; k < n; k++) {
        this._spawnTransient(doorX + (k - 0.5) * 0.4, tr.z + s * 0.9, [[doorX + (this.rng.next() - 0.5), mid + (this.rng.next() - 0.5) * 1.4], [ex, mid + (this.rng.next() - 0.5) * 1.6], [ex + (ex < st.x ? -4 : 4), mid]]);
      }
    }
    // ...and the ones waiting nearest a door board
    const doors = LAYOUT.doors.map((d) => tr.x + d), want = [];
    for (const a of this.agents) {
      if (a.mode !== 'stand' || a.station !== station || a.platformSide !== side) continue;
      let best = 1e9, bd = null; for (const dx of doors) { const q = Math.abs(a.x - dx); if (q < best) { best = q; bd = dx; } }
      want.push([best, a, bd]);
    }
    want.sort((p, q) => p[0] - q[0]);
    for (const [, a, dx] of want.slice(0, 9)) { a.mode = 'board'; a.tx = dx + (this.rng.next() - 0.5) * 0.5; a.tz = tr.z + s * 1.2; }
  }
  _exitX(P, x) { return (x - (P.x0 + P.x1) / 2) < 0 ? P.x0 - 2.5 : P.x1 + 2.5; }

  _spawnTransient(x, z, path) {
    const a = { mode: 'path', woman: this.rng.next() < 0.45, kid: false, x, y: 0.5, z, yaw: 0, phase: this.rng.next() * 6, amp: 1, scale: 1, speed: 1.35 + this.rng.next() * 0.4, path, pi: 0, life: 22, level: 'G', pose: 0 };
    this.look(a, { woman: a.woman, umbrella: 0.1 });
    this.agents.push(a); this.transients.push(a);
    return a;
  }

  // ------------------------------------------------------------------ traffic
  _stepVehicles(dt, px, pz, cmap) {
    for (const L of this.vlanes) {
      const list = L.vehicles;
      for (const v of list) {
        // the nearest vehicle ahead in this lane
        let gap = 1e9;
        for (const o of list) { if (o === v) continue; const g = (o.s - v.s) - (o.len + v.len) / 2; if (g > -0.5 && g < gap) gap = g; }
        // a wave of traffic: the jam moves along the lane
        const wave = 0.5 + 0.5 * Math.sin(this.game.time * 0.11 + v.s * 0.021 + L.phase);
        let want = v.vmax * (L.jam + (1 - L.jam) * wave * wave);
        want = Math.min(want, Math.max(0, (gap - 1.4) * 1.3));
        if (L.stops) for (const st of L.stops) {
          const ahead = st.s - (v.s + v.len / 2 + 0.4);
          if (ahead > -0.2 && ahead < 14 && (cmap.get(st.id) ?? 'open') !== 'open') want = Math.min(want, Math.max(0, ahead * 0.9));
        }
        // somebody on foot in the way: stop and honk
        const dx = px - v.x, dz = pz - v.z;
        if (dx * dx + dz * dz < 90 && Math.abs(v.y - this.game.player.pos.y) < 2.5) {
          const along = dx * L.ux + dz * L.uz, lat = Math.abs(dx * L.px + dz * L.pz);
          if (along > 0 && along < v.len / 2 + 5 && lat < v.width / 2 + 1.0) { want = Math.min(want, Math.max(0, (along - v.len / 2 - 1.5) * 0.8)); if (this.game.time - (v.honk ?? -9) > 7 && want < 1 && this.rng.next() < 0.02) { v.honk = this.game.time; this.game.events.emit('sound:emit', { x: v.x, y: v.y + 1, z: v.z, kind: 'car-horn', loudness: 0.5 }); } }
        }
        v.v += Math.max(-4 * dt * 2, Math.min(2.2 * dt, want - v.v));
        v.s += v.v * dt;
        if (v.s > L.len + 6) { v.s = -6 - this.rng.next() * 8; this._rerollVehicle(v, L); }
        v.x = L.ax + L.ux * v.s + L.px * L.lat; v.z = L.az + L.uz * v.s + L.pz * L.lat; v.y = L.y;
      }
    }
  }
  _rerollVehicle(v, L) {
    const r = this.rng.next();
    v.type = L.buses && r < 0.14 ? 'bus' : r < 0.5 ? 'taxi' : 'auto';
    v.len = VEHICLES[v.type].len; v.width = VEHICLES[v.type].width; v.vmax = (L.level === 'L2' ? 9 : 5.5) * (0.75 + this.rng.next() * 0.4);
    v.tint = this.rng.pick(VEHICLES[v.type].tints);
  }

  // ------------------------------------------------------------------ drawing: only what is near and in front of the camera
  draw() {
    if (!this.enabled) return;
    const game = this.game, cam = game.camera, cp = cam.position;
    cam.getWorldDirection(this._fwd);
    const fx = this._fwd.x, fz = this._fwd.z, fl = Math.hypot(fx, fz) || 1;
    const under = game.player.pos.y < -3.2;
    const maxD = Math.min(125, (game.scene.fog?.far ?? 50) + 10);
    const maxD2 = maxD * maxD;
    const sel = this._sel; sel.length = 0;
    const consider = (a, ax, ay, az) => {
      const dx = ax - cp.x, dz = az - cp.z, dy = ay - cp.y, d2 = dx * dx + dz * dz + dy * dy * 0.4;
      if (d2 > maxD2) return;
      if (under !== (ay < -3.2)) return;
      if (d2 > 90 && (dx * fx + dz * fz) < -0.12 * Math.sqrt(d2) * fl) return;
      sel.push(a); a._d = d2;
    };
    for (const a of this.agents) { if (a.hidden) continue; consider(a, a.x, a.y, a.z); }
    // passengers: drawn from the trains' own slots
    const tr = game.transit, riders = [];
    if (tr) for (const t of tr.trains) {
      if (!t.active) continue;
      const dx = t.x - cp.x, dz = t.z - cp.z;
      if (dx * dx + dz * dz > (maxD + 22) * (maxD + 22) || under) continue;
      const looks = this._riderLooks(t);
      for (let i = 0; i < t.slots.length; i++) {
        const sl = t.slots[i], lk = looks[i];
        lk.x = t.x + sl.x; lk.z = t.z + sl.z; lk.y = sl.y; lk.yaw = sl.yaw; lk.pose = sl.pose; lk.train = t;
        const ddx = lk.x - cp.x, ddz = lk.z - cp.z, d2 = ddx * ddx + ddz * ddz;
        if (d2 > maxD2) continue;
        if (d2 > 90 && (ddx * fx + ddz * fz) < -0.12 * Math.sqrt(d2) * fl) continue;
        lk._d = d2; riders.push(lk);
      }
    }
    for (const r of riders) sel.push(r);
    if (sel.length > SEL_MAX) { sel.sort((a, b) => a._d - b._d); sel.length = SEL_MAX; }
    // fill the meshes
    for (const p of this.pm) p.n = 0;
    const pl = game.player.pos, aboard = tr?.ride?.train ?? null;
    let drawnRiders = 0;
    for (const a of sel) {
      const p = this.pm[a.woman ? 1 : 0];
      if (p.n >= p.cap) continue;
      const i = p.n++, o = i * 16, e = p.mesh.instanceMatrix.array;
      let x = a.x, z = a.z;
      const y = a.y, yaw = a.yaw, pose = a.pose ?? 0, sc = a.scale ?? 1;
      if (a.train) {                                // a passenger: make room for the player, sway with the carriage
        drawnRiders++;
        if (aboard === a.train) {
          const dx = x - pl.x, dz = z - pl.z, d = Math.hypot(dx, dz);
          if (d < 0.8 && pose === 0) { const k = (0.8 - d) / (d || 1); x += dx * k; z += dz * k; }
        }
      }
      const c = Math.cos(yaw) * sc, s = Math.sin(yaw) * sc;
      const roll = a.roll ?? (pose === 2 ? (a.train && a.train.doorsOpen ? 0.12 : 0.3) * (a.side ?? 0) : 0);
      if (a.mode === 'sleep') {                     // lying on the back, head toward the yaw direction: M = Ry(yaw) * Rx(90 deg)
        e[o] = c; e[o + 1] = 0; e[o + 2] = -s; e[o + 3] = 0;
        e[o + 4] = s; e[o + 5] = 0; e[o + 6] = c; e[o + 7] = 0;
        e[o + 8] = 0; e[o + 9] = -sc; e[o + 10] = 0; e[o + 11] = 0;
        e[o + 12] = x; e[o + 13] = y + 0.13; e[o + 14] = z; e[o + 15] = 1;
      } else if (roll) {                             // leaning out of a door: about the local z axis, then yaw
        const rc = Math.cos(roll), rs = Math.sin(roll);
        e[o] = c * rc; e[o + 1] = rs * sc; e[o + 2] = -s * rc; e[o + 3] = 0;
        e[o + 4] = -c * rs; e[o + 5] = rc * sc; e[o + 6] = s * rs; e[o + 7] = 0;
        e[o + 8] = s; e[o + 9] = 0; e[o + 10] = c; e[o + 11] = 0;
        e[o + 12] = x; e[o + 13] = y; e[o + 14] = z; e[o + 15] = 1;
      } else {
        e[o] = c; e[o + 1] = 0; e[o + 2] = -s; e[o + 3] = 0; e[o + 4] = 0; e[o + 5] = sc; e[o + 6] = 0; e[o + 7] = 0;
        e[o + 8] = s; e[o + 9] = 0; e[o + 10] = c; e[o + 11] = 0; e[o + 12] = x; e[o + 13] = y; e[o + 14] = z; e[o + 15] = 1;
      }
      const A = p.at, col = a.col;
      const k4 = i * 4, k3 = i * 3;
      A.aAnim.array[k4] = a.phase; A.aAnim.array[k4 + 1] = a.mode === 'sleep' ? 0 : (a.amp ?? 0); A.aAnim.array[k4 + 2] = pose; A.aAnim.array[k4 + 3] = a.flags;
      A.aSkin.array[k3] = col[0]; A.aSkin.array[k3 + 1] = col[1]; A.aSkin.array[k3 + 2] = col[2];
      A.aCloth1.array[k3] = col[3]; A.aCloth1.array[k3 + 1] = col[4]; A.aCloth1.array[k3 + 2] = col[5];
      A.aCloth2.array[k3] = col[6]; A.aCloth2.array[k3 + 1] = col[7]; A.aCloth2.array[k3 + 2] = col[8];
      A.aAcc.array[k3] = col[9]; A.aAcc.array[k3 + 1] = col[10]; A.aAcc.array[k3 + 2] = col[11];
    }
    for (const p of this.pm) {
      const m = p.mesh; m.count = p.n; m.visible = p.n > 0;
      if (p.n) { m.instanceMatrix.needsUpdate = true; for (const at of Object.values(p.at)) at.needsUpdate = true; }
    }
    this.stats.drawn.people = this.pm[0].n + this.pm[1].n; this.stats.drawn.riders = drawnRiders;
    this._drawVehicles(cp, fx, fz, fl, maxD2, under);
  }

  _riderLooks(t) {
    let list = this.riderLooks.get(t.id);
    if (list) return list;
    list = t.slots.map((sl) => { const a = { woman: this.rng.next() < 0.28, phase: this.rng.next() * 6, amp: 0.03, scale: 1, level: 'G', mode: 'rider', side: sl.side ?? 0, pose: sl.pose }; this.look(a, { woman: a.woman, umbrella: 0.0 }); return a; });
    this.riderLooks.set(t.id, list);
    return list;
  }

  _drawVehicles(cp, fx, fz, fl, maxD2, under) {
    const game = this.game;
    for (const v of Object.values(this.vm)) v.n = 0;
    this.lamps.begin();
    if (!under) for (const L of this.vlanes) for (const v of L.vehicles) {
      const dx = v.x - cp.x, dz = v.z - cp.z, d2 = dx * dx + dz * dz + (v.y - cp.y) * (v.y - cp.y) * 0.4;
      if (d2 > maxD2) continue;
      if (d2 > 140 && (dx * fx + dz * fz) < -0.12 * Math.sqrt(d2) * fl) continue;
      const vm = this.vm[v.type];
      if (vm.n >= vm.cap) continue;
      const i = vm.n++, o = i * 16, e = vm.mesh.instanceMatrix.array;
      const yaw = Math.atan2(-L.ux, -L.uz), c = Math.cos(yaw), s = Math.sin(yaw);
      e[o] = c; e[o + 1] = 0; e[o + 2] = -s; e[o + 3] = 0; e[o + 4] = 0; e[o + 5] = 1; e[o + 6] = 0; e[o + 7] = 0;
      e[o + 8] = s; e[o + 9] = 0; e[o + 10] = c; e[o + 11] = 0; e[o + 12] = v.x; e[o + 13] = v.y; e[o + 14] = v.z; e[o + 15] = 1;
      tmpC.set(v.tint); const ia = vm.mesh.instanceColor.array; ia[i * 3] = tmpC.r; ia[i * 3 + 1] = tmpC.g; ia[i * 3 + 2] = tmpC.b;
      if (d2 < 3600) {
        const hl = v.len / 2 + 0.06, w = v.width * 0.32, h = v.type === 'bus' ? 0.9 : v.type === 'auto' ? 0.78 : 0.76;
        const fxv = L.ux, fzv = L.uz;          // lane direction = the way the vehicle faces
        for (const sd of [-1, 1]) {
          this.lamps.add(v.x + fxv * hl + L.px * w * sd, v.y + h, v.z + fzv * hl + L.pz * w * sd, 1.3, 1.5, 1.4, 1.0);
          this.lamps.add(v.x - fxv * hl + L.px * w * sd, v.y + h, v.z - fzv * hl + L.pz * w * sd, 0.9, 1.1, 0.12, 0.08);
        }
      }
    }
    this.lamps.end();
    let total = 0;
    for (const v of Object.values(this.vm)) {
      v.mesh.count = v.n; v.mesh.visible = v.n > 0; total += v.n;
      if (v.n) { v.mesh.instanceMatrix.needsUpdate = true; v.mesh.instanceColor.needsUpdate = true; }
    }
    this.stats.drawn.vehicles = total;
    void game;
  }
}
