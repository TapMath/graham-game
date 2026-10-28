// Crowds (Phase 8B): a packed Mumbai. Instanced, vertex-animated pedestrians and traffic, dense on the ground and thinning upward.
//
//   game.crowds = {
//     agents[]          every simulated person {mode, x, y, z, yaw, level, ...}   (about 1000)
//     vehicles[]        every simulated vehicle {type, x, y, z, yaw, v, level}      (about 150)
//     stats             {agents, vehicles, drawn:{people, vehicles, riders}, ...}   what the last frame drew
//     density           1 = full; the settings can lower it    setEnabled(bool)
//     count(level)      agents on a level                       near(x, z, r)  agents within r metres
//   }
// People (Phase 8D) are the cast's own builder baked small: 8 bodies (a man in shirt and trousers, in a kurta, a woman in a sari, in salwar
// kameez with a dupatta, an older man in a lungi, a child, a rescue worker in hi-vis, a well-dressed L3 resident), each an InstancedMesh with
// smooth limbs, hair and a painted face within ~13 m and one of 4 coarser meshes beyond (see bake.js and people.js); the walk, the sitting,
// the talking and the umbrella arm are animated in the vertex shader. Traffic is 3 meshes (taxis, auto-rickshaws, buses) and the lamps 1.
// Only the nearest ~600 people and ~60 vehicles within reach of the camera are written each frame, so the cost follows what you can see.
// People walk along street, platform, alley and bazaar lanes, wait at the level crossings of the Harbour Line, part around the player
// (nobody is drawn within about 0.95 m of the player, the camera, Setu or Jeetu), board and leave the trains at the stations. Passengers
// of the trains (from game.transit) are drawn through the same meshes.
//
// Look: skin tones and clothing come from `game.characterStyle` (Phase 8C: `skinTones`, `shirts`, `trousers`, `saris`, `rich`, plus
// `clothes.*` and `hair.*`), else the defaults in people.js.
import * as THREE from '../../../vendor/three.module.js';
import { buildPeople, DEFAULT_STYLE, MID_GROUP, ROBED } from './people.js';
import { makeFaceAtlas, X as XPR, L as LOOK } from './faces.js';
import { VEHICLES, makeVehicleMaterial } from './vehicles.js';
import { Glows } from '../hazards/render.js';
import { populate, buildVehicleLanes } from './populate.js';
import { LAYOUT } from '../transit/train-model.js';

const CAP_V = { taxi: 26, auto: 26, bus: 9 };          // per type, the nearest ones (Phase 9A: with the flyover web there are cars on every level, so the triangle budget needs a cap)
const CAPS = { near: 24, mid: 70, far: 190, umbrella: 130 };      // per body (near), per group (mid), far in all, umbrellas in all
const NEAR_R = 12, NEAR_MAX = 18, MID_R = 28, MID_MAX = 56, SEL_MAX = 400;   // people closer than NEAR_R (at most NEAR_MAX) get the detailed bodies, then the mid ones to MID_R, then the tiny ones
const KEEP = 0.98, KEEP_SEAT = 0.55, KEEP_CAM = 0.92, KEEP_EYE_SEATED = 0.82;     // nobody is drawn closer than this to the player's body, a seat (body), the camera, the eye of someone seated near
const LUNGIS = [0x3a6a8a, 0x2a5a3a, 0x7a3a2a, 0x5a5a8a, 0x8a8070, 0x6a2a3a, 0x3a4a6a];
const HIVIS = [0xe8801c, 0xe8801c, 0xe8801c, 0xd8b81c];
const KURTAS = [0xe8e4d8, 0xc8c0a8, 0x8a7a58, 0x6a7480, 0x4a5a4a, 0x7a3a3a, 0x2c3556, 0xb4ac98, 0xa8a48c];
const BRIGHT = [0xb8483a, 0x4a6a8a, 0xd0a030, 0x5a8a5a, 0xc8c0a8, 0x8a4a8a, 0xe8e4d6];
const HAIR_W = [[0, 0.55], [1, 0.2], [2, 0.1], [4, 0.05], [3, 0.1]];      // hair colour index, weight (the shader's palette: black, dark brown, brown, grey, henna, white)
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

    // ---- the meshes: 8 detailed bodies, 4 coarse groups, the umbrellas (one draw call each, and only the ones in use are drawn)
    this.faces = makeFaceAtlas();
    this.people = buildPeople(game, game.scene, this.faces, CAPS);
    this.pm = [...Object.values(this.people.near), ...Object.values(this.people.mid), this.people.far, this.people.umbrella];
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
    this.placed = [];

    // ---- events from the transit system: people board and get off at the stations
    game.events.on('transit:arrive', (d) => this._onArrive(d));
    const r0 = game.render.bind(game);
    game.render = () => { try { this.draw(); } catch (e) { if (!this._warned) { this._warned = true; console.error('[crowds] draw failed:', e); } } r0(); };

    const dbg = game.debug;
    dbg?.addState('crowds', () => ({ enabled: this.enabled, density: this.density, ...this.stats, byLevel: this._byLevel() }));
    dbg?.addSetter('crowds', (g, v) => this.setEnabled(!!v));
    dbg?.addSetter('crowdDensity', (g, v) => { this.density = +v; });
    dbg?.addSetter('crowdLod', (g, v) => { this.forceLod = v || null; });                 // test aid: 'near' | 'mid' | 'far' draws everybody with that level
    dbg?.addAction('crowdNear', (g, r = 20) => this.near(g.player.pos.x, g.player.pos.z, r).length);
    // test aids: place a person of a given body (kept apart from the simulation), a line-up of all of them, clear them
    dbg?.addAction('crowdPlace', (g, x, y, z, variant = 'shirt', yaw = 0, o = {}) => this.place(x, y, z, variant, yaw, o) ? this.placed.length : 0);
    dbg?.addAction('crowdLineup', (g, x, y, z, yaw = 0, gap = 0.9) => {
      const vs = ['shirt', 'kurta', 'sari', 'salwar', 'lungi', 'child', 'worker', 'rich'], ax = Math.cos(yaw), az = -Math.sin(yaw);
      vs.forEach((v, i) => { const t = (i - (vs.length - 1) / 2) * gap; this.place(x + ax * t, y, z + az * t, v, yaw, { pose: 0, amp: 0.05 }); });
      return this.placed.length;
    });
    dbg?.addAction('crowdClearPlaced', () => { for (const a of this.placed) { const k = this.agents.indexOf(a); if (k >= 0) this.agents.splice(k, 1); } this.placed.length = 0; return 0; });
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
  /** Put one person of a given body at a spot (a test aid; not simulated). */
  place(x, y, z, variant, yaw, o = {}) {
    const a = { mode: o.mode ?? 'stand', x, y, z, yaw, level: 'G', phase: o.phase ?? this.rng.next() * 6, amp: o.amp ?? 0.05, pose: o.pose ?? 0, home: { x, y, z, yaw }, talk: !!o.talk, mood: o.mood ?? 'neutral', umbrellaChance: 0 };
    this.look(a, { variant, umbrella: o.umbrella ?? 0 });
    if (o.hair !== undefined) { a.hair = o.hair; a.flags = (a.flags & 1) | (o.hair << 1); }
    a.placed = true;
    this.agents.push(a); this.placed.push(a);
    return a;
  }

  /** Is the player (or the camera) within r metres of this spot, on this floor? */
  _nearPlayer(x, y, z, r) {
    const p = this.game.player.pos;
    if (Math.abs(p.y - y) < 2.6 && Math.hypot(p.x - x, p.z - z) < r) return true;
    const c = this.game.camera.position;
    return Math.abs(c.y - y) < 2.6 && Math.hypot(c.x - x, c.z - z) < r * 0.8;
  }
  count(level) { let n = 0; for (const a of this.agents) if (a.level === level) n++; return n; }

  /**
   * Roll an appearance into `a`: which of the 8 bodies, its colours (a.col, 12 floats: skin, top, bottom, accent), hair colour, height,
   * build, the face look, and the flags (bit 0 umbrella, bits 1..3 hair).
   */
  look(a, { woman = a.woman, kid = false, rich = false, umbrella = 0.6, worker = false, variant = null } = {}) {
    const r = this.rng, S = this.style, c = a.col ?? (a.col = new Float32Array(12));
    const q = r.next();
    if (variant) { kid = variant === 'child'; worker = variant === 'worker'; rich = variant === 'rich'; woman = variant === 'sari' || variant === 'salwar'; a.woman = woman; a.kid = kid; a.rich = rich; a.worker = worker; }
    const v = variant ? variant : kid ? 'child' : worker ? 'worker' : woman ? (q < (rich ? 0.35 : 0.55) ? 'sari' : 'salwar') : rich ? 'rich' : (q < 0.5 ? 'shirt' : q < 0.78 ? 'kurta' : 'lungi');
    a.variant = v;
    rgb(r.pick(S.skinTones), c, 0);
    switch (v) {
      case 'shirt': rgb(r.pick(S.shirts), c, 3); rgb(r.pick(S.trousers), c, 6); rgb(r.pick(S.accents), c, 9); break;
      case 'kurta': rgb(r.pick(KURTAS), c, 3); rgb(r.next() < 0.5 ? 0xe8e4d8 : r.pick(S.trousers), c, 6); rgb(r.pick(S.shirts), c, 9); break;
      case 'sari': rgb(r.pick(rich ? S.rich : S.blouses), c, 3); rgb(r.pick(rich ? S.rich : S.saris), c, 6); rgb(r.pick(rich ? S.rich : S.saris), c, 9); break;
      case 'salwar': rgb(r.pick(rich ? S.rich : S.saris), c, 3); rgb(r.next() < 0.45 ? 0xe8e0d0 : r.pick(rich ? S.rich : S.saris), c, 6); rgb(r.pick(rich ? S.rich : S.saris), c, 9); break;
      case 'lungi': rgb(r.pick(S.shirts), c, 3); rgb(r.pick(LUNGIS), c, 6); rgb(0x18181c, c, 9); break;
      case 'child': rgb(r.pick(BRIGHT), c, 3); rgb(r.pick(S.trousers), c, 6); rgb(r.pick(S.accents), c, 9); break;
      case 'worker': rgb(r.pick(HIVIS), c, 3); rgb(r.pick(S.trousers), c, 6); rgb(0xe8e8a0, c, 9); break;
      default: rgb(r.pick(S.rich), c, 3); rgb(r.pick(S.trousers), c, 6); rgb(r.pick(S.rich), c, 9); break;     // rich: a coat over a shirt
    }
    // hair: black for most, grey for the old
    let hair = 0, hq = r.next() * 0.9, hacc = 0;
    for (const [idx, w] of HAIR_W) { hacc += w; if (hq < hacc) { hair = idx; break; } }
    if (v === 'lungi') hair = r.next() < 0.7 ? 3 : 5;
    if (kid) hair = 0;
    a.hair = hair;
    a.flags = 0;
    if (r.next() < umbrella && v !== 'worker') a.flags |= 1;
    a.flags |= hair << 1;
    // height and build (the cast's proportions, see characterStyle.proportions)
    const P = this.game.characterStyle?.proportions ?? {};
    const [m0, m1] = P.heightM ?? [1.58, 1.84], [f0, f1] = P.heightF ?? [1.48, 1.7], [k0, k1] = P.heightChild ?? [1.0, 1.32];
    a.h = kid ? k0 + (k1 - k0) * r.next() : woman ? f0 + (f1 - f0) * r.next() : m0 + (m1 - m0) * r.next() + (rich ? 0.02 : 0);
    a.build = kid ? 0.95 + r.next() * 0.1 : 0.92 + r.next() * 0.18;
    a.stride = 4.2 * 1.7 / a.h;
    a.faceLook = kid ? LOOK.kid : woman ? (r.next() < 0.4 ? LOOK.fBindi : LOOK.f) : (v === 'lungi' || (v === 'kurta' && r.next() < 0.3)) ? LOOK.mOld : LOOK.m;
    return a;
  }

  // ------------------------------------------------------------------ simulation (cheap: every step moves every agent along its lane)
  update(dt, game) {
    if (!this.enabled) return;
    this.frameCount++;
    const px = game.player.pos.x, pz = game.player.pos.z, py = game.player.pos.y, cross = game.transit?.crossings ?? [], cmap = this._cmap ?? (this._cmap = new Map());
    cmap.clear(); for (const c of cross) cmap.set(c.id, c.state);
    const sp = dt;
    const k = Math.min(1, dt * 4);
    for (const a of this.agents) {
      // the ones standing still step aside from the player (an eased offset, so it never snaps)
      if (a.mode !== 'lane' && a.mode !== 'wait' && a.pose !== 1) {
        const dx = a.x - px, dz = a.z - pz, d2 = dx * dx + dz * dz;
        if (d2 < 7 && Math.abs(a.y - py) < 2.5) {
          const d = Math.sqrt(d2) || 0.01, push = Math.max(0, 2.4 - d) * 0.5;
          a.ox = (a.ox ?? 0) + (dx / d * push - (a.ox ?? 0)) * k; a.oz = (a.oz ?? 0) + (dz / d * push - (a.oz ?? 0)) * k;
        } else if (a.ox || a.oz) { a.ox *= 1 - k * 0.5; a.oz *= 1 - k * 0.5; if (Math.abs(a.ox) + Math.abs(a.oz) < 0.01) a.ox = a.oz = 0; }
      }
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
    a.phase += sp * dt * a.stride;
  }

  _reroll(a) { if (this.rng.next() < 0.5) this.look(a, { woman: a.woman, kid: a.kid, rich: a.rich, worker: a.worker, umbrella: a.umbrellaChance ?? 0.6 }); }

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
    a.yaw = Math.atan2(-tx, -tz); a.amp = 1; a.phase += sp * a.stride;
  }
  _respawnStander(a) {
    const h = a.home;
    if (this._nearPlayer(h.x, h.y, h.z, 3.2)) { a.timer = 1.5; return; }                    // not while the player stands there
    a.ox = a.oz = 0;
    a.x = h.x + (this.rng.next() - 0.5) * 1.6; a.z = h.z + (this.rng.next() - 0.5) * 0.6; a.y = h.y; a.yaw = h.yaw; a.mode = 'stand'; a.hidden = false; a.amp = 0.04;
    this.look(a, { woman: a.woman, kid: a.kid, rich: a.rich, worker: a.worker, umbrella: 0.15 });
  }
  _stepPath(a, dt) {
    const w = a.path[a.pi];
    if (!w) { a.done = true; return; }
    const tx = w[0] - a.x, tz = w[1] - a.z, d = Math.hypot(tx, tz);
    if (d < 0.2) { a.pi++; return; }
    const sp = a.speed * dt;
    a.x += tx / d * sp; a.z += tz / d * sp; a.yaw = Math.atan2(-tx, -tz); a.amp = 1; a.phase += sp * a.stride;
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
    if (this._nearPlayer(x, 0.5, z, 1.9)) return null;                                        // never appear on top of the player (a door they stand in)
    const a = { mode: 'path', woman: this.rng.next() < 0.45, kid: false, x, y: 0.5, z, yaw: 0, phase: this.rng.next() * 6, amp: 1, speed: 1.35 + this.rng.next() * 0.4, path, pi: 0, life: 22, level: 'G', pose: 0 };
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
    v.len = VEHICLES[v.type].len; v.width = VEHICLES[v.type].width; v.vmax = (L.level === 'L2' || L.fast ? 9 : 5.5) * (0.75 + this.rng.next() * 0.4);
    v.tint = this.rng.pick(VEHICLES[v.type].tints);
  }

  // ------------------------------------------------------------------ drawing: only what is near and in front of the camera
  /** The people nobody may be drawn on top of: the player, the camera, Setu, Jeetu. */
  _keepOuts() {
    const game = this.game, k = this._kp ?? (this._kp = [{ x: 0, y: 0, z: 0, r: KEEP, cam: false }, { x: 0, y: 0, z: 0, r: KEEP_CAM, cam: true }, { x: 0, y: 0, z: 0, r: 0.85, cam: false, on: false }, { x: 0, y: 0, z: 0, r: 0.85, cam: false, on: false }]);
    const pl = game.player.pos, cp = game.camera.position;
    k[0].x = pl.x; k[0].y = pl.y; k[0].z = pl.z;
    k[1].x = cp.x; k[1].y = cp.y; k[1].z = cp.z;
    const s = game.setu, j = game.party?.jeetu;
    k[2].on = !!(s && (s.following || s.found) && s.pos); if (k[2].on) { k[2].x = s.pos.x; k[2].y = s.pos.y; k[2].z = s.pos.z; }
    k[3].on = !!(j && j.pos && game.party.active !== 'jeetu'); if (k[3].on) { k[3].x = j.pos.x; k[3].y = j.pos.y; k[3].z = j.pos.z; }
    return k;
  }

  draw() {
    if (!this.enabled) return;
    const game = this.game, cam = game.camera, cp = cam.position, time = game.time;
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
      const aboardT = tr.ride?.train === t, riderR2 = aboardT ? maxD2 : 48 * 48;
      const looks = this._riderLooks(t);
      for (let i = 0; i < t.slots.length; i++) {
        const sl = t.slots[i], lk = looks[i];
        lk.x = t.x + sl.x; lk.z = t.z + sl.z; lk.y = sl.y; lk.yaw = sl.yaw; lk.pose = sl.pose; lk.train = t;
        const ddx = lk.x - cp.x, ddz = lk.z - cp.z, d2 = ddx * ddx + ddz * ddz;
        if (d2 > riderR2) continue;
        if (d2 > 90 && (ddx * fx + ddz * fz) < -0.12 * Math.sqrt(d2) * fl) continue;
        lk._d = d2; riders.push(lk);
      }
    }
    for (const r of riders) sel.push(r);
    // the strangers in the public capsules (Phase 9A)
    if (game.capsules && !under) for (const a of game.capsules.riders(cp, (maxD + 8) * (maxD + 8))) {
      const ddx = a.x - cp.x, ddz = a.z - cp.z, ddy = a.y - cp.y, d2 = ddx * ddx + ddz * ddz + ddy * ddy * 0.4;
      if (d2 > maxD2 || (d2 > 90 && (ddx * fx + ddz * fz) < -0.12 * Math.sqrt(d2) * fl)) continue;
      a._d = d2; sel.push(a);
    }
    sel.sort((a, b) => a._d - b._d);
    if (sel.length > SEL_MAX) sel.length = SEL_MAX;
    // fill the meshes
    for (const p of this.pm) p.n = 0;
    const P = this.people, keep = this._keepOuts();
    const aboard = tr?.ride?.train ?? null;
    let drawnRiders = 0, nNear = 0, nMid = 0, tris = 0, dmin = 99, dminCam = 99, dminPeer = 99, drawn = 0;
    const NR2 = NEAR_R * NEAR_R, MR2 = MID_R * MID_R;
    for (const a of sel) {
      // where this person is drawn: the eased step-aside offset, then a hard bubble round the player, the camera and the companions
      let x = a.x + (a.ox ?? 0), z = a.z + (a.oz ?? 0);
      const y = a.y, pose = a.pose ?? 0, h = a.h ?? 1.7, seated = pose === 1 || pose === 2;
      // pushed out of every bubble in turn (twice round, since pushing out of one can push into the next); still inside one: not drawn
      let hidden = false, worst = 0;
      for (let pass = 0; pass < 3 && !hidden; pass++) {
        worst = 0;
        for (const k of keep) {
          if (k.on === false) continue;
          const dy = k.y - y;
          if (k.cam) { if (dy < -0.3 || dy > h + 0.8) continue; } else if (Math.abs(dy) > 2.4) continue;
          let r = k.r;
          if (seated) r = k.cam ? Math.max(k.r, KEEP_EYE_SEATED) : Math.min(k.r, a.train && aboard === a.train ? 0.45 : KEEP_SEAT);
          else if (a.mode === 'sleep') r += 0.4;
          let dx = x - k.x, dz = z - k.z, d = Math.hypot(dx, dz);
          if (d < r - 0.001) {
            if (a.mode === 'sleep' && d < 0.8) { hidden = true; break; }
            if (d < 0.002) { dx = Math.sin(a.yaw); dz = Math.cos(a.yaw); d = 1; }
            x = k.x + dx / d * r; z = k.z + dz / d * r; worst = Math.max(worst, r - d);
          }
        }
        if (worst === 0) break;
      }
      if (!hidden && worst > 0.004) hidden = true;                  // pushed out of one only to land in another, three times over: leave it out this frame
      if (hidden) continue;
      let near = nNear < NEAR_MAX && a._d < NR2, mid = !near && nMid < MID_MAX && a._d < MR2;
      if (this.forceLod) { near = this.forceLod === 'near'; mid = this.forceLod === 'mid'; }
      const rec = near ? P.near[a.variant] : mid ? P.mid[MID_GROUP[a.variant]] : P.far;
      if (!rec || rec.n >= rec.cap) continue;
      if (near) nNear++; else if (mid) nMid++;
      drawn++;
      const i = rec.n++, o = i * 16, e = rec.mesh.instanceMatrix.array;
      if (a.train) drawnRiders++;
      const sy = h / rec.h0, sxz = sy * (a.build ?? 1);
      const c = Math.cos(a.yaw) * sxz, s = Math.sin(a.yaw) * sxz;
      const roll = a.roll ?? (pose === 2 ? (a.train && a.train.doorsOpen ? 0.12 : 0.3) * (a.side ?? 0) : 0);
      if (a.mode === 'sleep') {                     // lying on the back, head toward the yaw direction: M = Ry(yaw) * Rx(90 deg)
        e[o] = c; e[o + 1] = 0; e[o + 2] = -s; e[o + 3] = 0;
        e[o + 4] = s * sy / sxz; e[o + 5] = 0; e[o + 6] = c * sy / sxz; e[o + 7] = 0;
        e[o + 8] = 0; e[o + 9] = -sxz; e[o + 10] = 0; e[o + 11] = 0;
        e[o + 12] = x; e[o + 13] = y + 0.14 * sxz; e[o + 14] = z; e[o + 15] = 1;
      } else if (roll) {                             // leaning out of a door: about the local z axis, then yaw
        const rc = Math.cos(roll), rs = Math.sin(roll);
        e[o] = c * rc; e[o + 1] = rs * sy; e[o + 2] = -s * rc; e[o + 3] = 0;
        e[o + 4] = -c * rs; e[o + 5] = rc * sy; e[o + 6] = s * rs; e[o + 7] = 0;
        e[o + 8] = s; e[o + 9] = 0; e[o + 10] = c; e[o + 11] = 0;
        e[o + 12] = x; e[o + 13] = y; e[o + 14] = z; e[o + 15] = 1;
      } else {
        e[o] = c; e[o + 1] = 0; e[o + 2] = -s; e[o + 3] = 0; e[o + 4] = 0; e[o + 5] = sy; e[o + 6] = 0; e[o + 7] = 0;
        e[o + 8] = s; e[o + 9] = 0; e[o + 10] = c; e[o + 11] = 0; e[o + 12] = x; e[o + 13] = y; e[o + 14] = z; e[o + 15] = 1;
      }
      const A = rec.at, col = a.col, k4 = i * 4;
      const talk = !!a.talk && pose === 0 && a.mode !== 'sleep';
      A.aAnim.array[k4] = a.phase; A.aAnim.array[k4 + 1] = a.mode === 'sleep' ? 0 : (a.amp ?? 0); A.aAnim.array[k4 + 2] = talk ? 3 : pose; A.aAnim.array[k4 + 3] = a.flags + (ROBED.has(a.variant) ? 16 : 0);
      const pa = A.aPalA.array, pb = A.aPalB.array, pc = A.aPalC.array;
      for (let q = 0; q < 4; q++) { pa[k4 + q] = col[q]; pb[k4 + q] = col[4 + q]; pc[k4 + q] = col[8 + q]; }
      if (near) {
        const cell = this.faces.cell(a.faceLook ?? 0, this._expression(a, time, talk)), f = A.aFace.array;
        f[i * 2] = cell[0]; f[i * 2 + 1] = cell[1];
      }
      tris += rec.tris;
      // the umbrella
      if ((a.flags & 1) && pose === 0 && a.mode !== 'sleep') {
        const um = P.umbrella;
        if (um.n < um.cap) {
          const j = um.n++, q = j * 16, ue = um.mesh.instanceMatrix.array;
          for (let t = 0; t < 16; t++) ue[q + t] = e[o + t];
          const ic = um.mesh.instanceColor.array; ic[j * 3] = col[9]; ic[j * 3 + 1] = col[10]; ic[j * 3 + 2] = col[11];
        }
      }
      // the closest one drawn, for the tests
      if (!seated && Math.abs(keep[0].y - y) < 2.4) { const d = Math.hypot(x - keep[0].x, z - keep[0].z); if (d < dmin) dmin = d; }
      if (keep[1].y - y > -0.3 && keep[1].y - y < h + 0.8) { const d = Math.hypot(x - keep[1].x, z - keep[1].z); if (d < dminCam) dminCam = d; }
      for (let q = 2; q < 4; q++) if (!seated && keep[q].on && Math.abs(keep[q].y - y) < 2.4) { const d = Math.hypot(x - keep[q].x, z - keep[q].z); if (d < dminPeer) dminPeer = d; }
    }
    for (const p of this.pm) {
      const m = p.mesh; m.count = p.n; m.visible = p.n > 0;
      if (!p.n) continue;
      m.instanceMatrix.needsUpdate = true;
      if (p.at) for (const at of Object.values(p.at)) at.needsUpdate = true;
      else m.instanceColor.needsUpdate = true;
    }
    this.stats.drawn.people = drawn; this.stats.drawn.riders = drawnRiders;
    this.stats.drawn.near = nNear; this.stats.drawn.mid = nMid; this.stats.drawn.umbrellas = P.umbrella.n; this.stats.drawn.tris = tris;
    this.stats.minDist = Math.round(dmin * 1000) / 1000; this.stats.minDistCam = Math.round(dminCam * 1000) / 1000; this.stats.minDistPeers = Math.round(dminPeer * 1000) / 1000;
    this._drawVehicles(cp, fx, fz, fl, Math.min(maxD2, 100 * 100), under);
  }

  /** Which face cell a near person wears this moment: asleep, talking, blinking, worried, smiling. */
  _expression(a, t, talk) {
    if (a.mode === 'sleep') return XPR.sleep;
    const ph = a.phase ?? 0, bt = (t * 0.8 + ph * 2.7) % 4.1;
    if (bt < 0.13) return XPR.blink;
    if (talk) { const q = Math.floor(t * 6 + ph * 5) % 5; return q === 0 ? XPR.talkA : q === 1 ? XPR.talkB : q === 2 ? XPR.neutral : q === 3 ? XPR.talkB : XPR.smile; }
    if (a.mood === 'worry') return XPR.worry;
    if (a.kid || a.mood === 'smile') return XPR.smile;
    return XPR.neutral;
  }

  _riderLooks(t) {
    let list = this.riderLooks.get(t.id);
    if (list) return list;
    list = t.slots.map((sl) => { const a = { woman: this.rng.next() < 0.28, phase: this.rng.next() * 6, amp: 0.03, level: 'G', mode: 'rider', side: sl.side ?? 0, pose: sl.pose, talk: this.rng.next() < 0.12 }; this.look(a, { woman: a.woman, umbrella: 0.0 }); return a; });
    this.riderLooks.set(t.id, list);
    return list;
  }

  _drawVehicles(cp, fx, fz, fl, maxD2, under) {
    const game = this.game;
    for (const v of Object.values(this.vm)) v.n = 0;
    this.lamps.begin();
    const cand = this._cand ?? (this._cand = []); cand.length = 0;
    if (!under) for (const L of this.vlanes) for (const v of L.vehicles) {
      const dx = v.x - cp.x, dz = v.z - cp.z, d2 = dx * dx + dz * dz + (v.y - cp.y) * (v.y - cp.y) * 0.4;
      if (d2 > maxD2) continue;
      if (d2 > 140 && (dx * fx + dz * fz) < -0.12 * Math.sqrt(d2) * fl) continue;
      v._d = d2; v._L = L; cand.push(v);
    }
    if (game.capsules && !under) for (const v of game.capsules.cargo(cp, maxD2)) { const dx = v.x - cp.x, dz = v.z - cp.z; v._d = dx * dx + dz * dz + (v.y - cp.y) * (v.y - cp.y) * 0.4; if (v._d <= maxD2) cand.push(v); }
    cand.sort((a, b) => a._d - b._d);
    for (const v of cand) {
      const L = v._L, d2 = v._d;
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
