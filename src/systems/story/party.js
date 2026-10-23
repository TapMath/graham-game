// The party (PLAN 1b "Jeetu and character switching"): Mithi and, once he joins, Jeetu.
//
//   game.party.active        'mithi' | 'jeetu'   who the player controls
//   game.party.jeetu         the Jeetu actor (game.cast.get('jeetu')) once he has joined, else null
//   game.party.join()        Jeetu joins (he stands up and follows Mithi)       .switchTo(id) / toggle()  (Tab)
//   game.party.mithiModel / jeetuModel   the two Characters       game.party.light  the single torch SpotLight
//   events: party:joined {id}, party:switched {active, from}
//
// HOW SWITCHING WORKS (least invasive): `game.player` stays THE controller. Hazards, gates, health, the camera, the senses
// and Setu's follower all keep reading `game.player`. Tab swaps *who the controller is*: the player is teleported onto the other
// character's spot (keeping the camera yaw and pitch), and the character that was just controlled becomes the follower, driven by
// Phase 3's `Follower` with the same breadcrumb trail (the trail belongs to `game.player`). The two bodies are
// `party.bodies.mithi` / `.jeetu`; their `.pos` is the live player position while active, a private spot while following.
// `game.view.mithi` is re-pointed at the active character's model, so third person (V) shows Jeetu when you are Jeetu.
// Health rays stay one shared pool. Hazards target only the controlled character (and Setu); the follower is not bitten.
//
// AS JEETU: sighted rendering (`senses.perceive = 0`, the sky's normal fog; underground the fog closes to ~6 m and the world
// dims unless the party has the torch), a torch cone (one SpotLight; attached to the camera when he is you, held in his
// hand when he follows), speed x0.85 (`hazards.setSpeedMod('party')`), no singing (`game.canSing()` is false), no cane taps,
// a lower eye (1.1 m). `game.party.active === 'jeetu'` is what 6b reads for `needsEyes` fragments.
// WHILE JEETU FOLLOWS MITHI: `senses.fogBonus += 15` and hazard callouts in the feed ("Didi, dogs, left!") from `hazards.list()`.
import * as THREE from 'three';
import { Follower } from '../follower.js';
import { installStoryCss } from './story-css.js';

const JEETU_SPEED = 0.85, JEETU_EYE = 1.1;
const CALL = { dog: 26, deranged: 18, guard: 20, drone: 24, camera: 20, slab: 10, smog: 7, water: 6 };
const COOL = { dog: 9, deranged: 12, guard: 14, drone: 12, camera: 20, slab: 6, smog: 16, water: 14 };

function bearing(from, yaw, to) {
  // angle of `to` relative to where `from` faces, + = to the left
  const dx = to.x - from.x, dz = to.z - from.z;
  let a = Math.atan2(-dx, -dz) - yaw;
  a = Math.atan2(Math.sin(a), Math.cos(a));
  return a;
}
export function sayDirection(a) {
  const d = Math.abs(a) * 180 / Math.PI, side = a > 0 ? 'left' : 'right';
  if (d < 28) return 'ahead';
  if (d < 70) return `ahead, ${side}`;
  if (d < 115) return side;
  if (d < 155) return `behind, ${side}`;
  return 'behind you';
}

export class PartySystem {
  init(game) {
    installStoryCss();
    this.game = game;
    game.party = this;
    this.active = 'mithi';
    this.jeetu = null;
    this.mithiModel = game.view?.mithi ?? null;
    this.jeetuModel = null;
    this._yEye = null;
    this._call = new Map(); this._callGlobal = 0; this._callT = 0;
    this._ownScale = false; this._fogAdded = 0; this.lastCall = null; this.calls = 0;
    this._mithiHide = false;

    const p = game.player;
    // Jeetu is shorter: his eyes are lower (the base getter reads PLAYER.eye)
    const base = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(p), 'eyeY');
    Object.defineProperty(p, 'eyeY', { configurable: true, get: () => (this.active === 'jeetu' ? p.pos.y + JEETU_EYE - p.stepSmooth : base.get.call(p)) });

    this.bodies = { mithi: null, jeetu: null };
    const self = this;
    this.bodies.mithi = {
      id: 'mithi', name: 'Mithi', model: this.mithiModel, yaw: 0, _pos: { x: p.pos.x, y: p.pos.y, z: p.pos.z }, follower: null, speed: 0,
      get pos() { return self.active === 'mithi' ? p.pos : this._pos; },
    };

    // the torch: one SpotLight, always in the scene (intensity 0 when off) so no shader ever recompiles when it is lit
    const light = this.light = new THREE.SpotLight(0xffe6b0, 0, 26, 0.52, 0.55, 1.15);
    light.name = 'party-torch';
    game.scene.add(light, light.target);

    // HUD: who you are
    this.hud = document.createElement('div');
    this.hud.className = 'hud-party'; this.hud.hidden = true;
    this.hud.innerHTML = '<kbd>TAB</kbd><span>switch · you are <b>Mithi</b></span>';
    document.getElementById('hud').appendChild(this.hud);

    game.canSing = () => this.active !== 'jeetu';
    window.addEventListener('keydown', (e) => {
      if (e.code !== 'Tab') return;
      e.preventDefault();
      if (e.repeat || game.mode !== 'playing') return;
      this.toggle();
    });

    game.debug?.addAction('switch', (g, id) => { const r = id ? this.switchTo(id) : this.toggle(); return { ok: r, active: this.active }; });
    game.debug?.addAction('jeetuJoin', () => { this.join(); return this.active; });
    game.debug?.addState('party', () => this.snapshot());
  }

  reset() { this.active = 'mithi'; }

  // ------------------------------------------------------------------------------------------ joining
  join() {
    const g = this.game;
    if (this.jeetu) return this.jeetu;
    const a = g.cast.get('jeetu');
    if (!a) return null;
    const p = g.player, self = this;
    a.owner = 'party';
    const start = { x: a.pos.x, y: 0, z: a.pos.z };
    // stand up beside the bed, near Mithi if she is close
    const near = Math.hypot(p.pos.x - start.x, p.pos.z - start.z) < 8;
    const sx = near ? p.pos.x + Math.cos(p.yaw) * 1.4 : -58.6, sz = near ? p.pos.z - Math.sin(p.yaw) * 1.4 : 90.4;
    const gh = g.physics.groundHeightAt(sx, sz, p.pos.y + 0.6, 0.9);
    a._pos = { x: sx, y: gh > -Infinity ? gh : 0, z: sz };
    Object.defineProperty(a, 'pos', { configurable: true, get: () => (self.active === 'jeetu' ? p.pos : a._pos) });
    this.jeetuModel = a.model;
    a.group.remove(a.model.group); g.scene.add(a.model.group);     // world coordinates from now on (the cast group sat at his bed)
    a.model.group.rotation.set(0, a.yaw, 0);
    a.model.group.visible = true;
    a.group.visible = true;
    this.bodies.jeetu = a;
    a.speed = 0;
    this.jeetu = a;
    this.bodies.mithi.follower = new Follower(g, this.bodies.mithi, p, { label: 'mithi', speed: 4.2, maxSpeed: 7.4, followDist: 2.0 });
    this.bodies.mithi.follower.enabled = false;
    a.follower = new Follower(g, a, p, { label: 'jeetu', speed: 4.3, maxSpeed: 7.4, followDist: 1.9 });
    a.follower.reset();
    g.flags.jeetuJoined = true;
    this.hud.hidden = false;
    this._hudText();
    g.events.emit('party:joined', { id: 'jeetu' });
    return a;
  }

  // ------------------------------------------------------------------------------------------ switching
  toggle() { return this.switchTo(this.active === 'mithi' ? 'jeetu' : 'mithi'); }

  switchTo(id) {
    const g = this.game;
    if (!this.jeetu) { g.messages?.say('Jeetu is not with you yet.', { kind: 'hint', ttl: 3 }); return false; }
    if (id === this.active || g.modal || g.mode !== 'playing') return false;
    const p = g.player, from = this.bodies[this.active], to = this.bodies[id];
    const prev = this.active;
    // remember the controlled body's spot, then put the controller on the other body's spot (camera look unchanged)
    const keep = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
    from._pos.x = keep.x; from._pos.y = keep.y; from._pos.z = keep.z; from.yaw = p.yaw;
    const t = to._pos, yaw = p.yaw, pitch = p.pitch;
    this.active = id;
    p.teleport(t.x, t.y, t.z, yaw);
    p.pitch = pitch;
    p.syncCamera();
    to.follower && (to.follower.enabled = false);
    from.follower.enabled = true; from.follower.reset();
    if (g.view) {
      const model = to.model;
      if (g.view.mithi && g.view.mithi !== model) g.view.mithi.group.visible = false;
      g.view.mithi = model;
      g.view._init && (g.view.bodyYaw = p.yaw);
    }
    if (to.model) to.model.group.rotation.set(0, p.yaw, 0);
    this._hudText();
    g.messages?.say(id === 'jeetu' ? 'You are Jeetu. You can see. You cannot sing.' : 'You are Mithi again. The world is sound.', { kind: 'system', ttl: 4 });
    g.events.emit('party:switched', { active: id, from: prev });
    return true;
  }

  _hudText() {
    const who = this.active === 'jeetu' ? 'Jeetu' : 'Mithi';
    this.hud.innerHTML = `<kbd>TAB</kbd><span>switch · you are <b>${who}</b></span>`;
  }

  // ------------------------------------------------------------------------------------------ frame
  update(dt, game) {
    if (!this.jeetu) { this._senses(game); return; }
    const p = game.player, J = this.bodies.jeetu, M = this.bodies.mithi;
    // ---- the follower walks
    const fb = this.active === 'mithi' ? J : M;
    fb.follower.update(dt);
    fb.speed = fb.follower.speed;
    const m = fb.model;
    if (m) {
      m.group.position.set(fb._pos.x, fb._pos.y, fb._pos.z);
      m.group.rotation.set(0, fb.yaw ?? 0, 0);
      m.group.visible = true;
      m.update(dt, fb.speed ?? 0, { onGround: fb.follower.onGround });
    }
    // Jeetu's talk spot follows him
    const it = J.spots?.[0]?.item;
    if (it) { const jp = J.pos; it.pos.x = jp.x; it.pos.y = jp.y; it.pos.z = jp.z; it.radius = 1.5; it.priority = -1; }   // he stands 1.9 m away: pickups beside you win unless you step up to him
    this._senses(game);
    this._speed(game);
    this._torch(game);
    if (this.active === 'mithi') this._callouts(dt, game);
  }

  /** Sighted rendering, the dark underground without a torch, fogBonus. */
  _senses(game) {
    const s = game.senses; if (!s) return;
    const jeetuNow = this.active === 'jeetu';
    if (jeetuNow) { if (!this._wasJeetu) { this._wasJeetu = true; this._pre = s.perceive > 0 ? s.perceive : 1; } s.perceive = 0; }
    else if (this._wasJeetu) { this._wasJeetu = false; s.perceive = this._pre ?? 1; }       // give Mithi her own perception back
    // Jeetu following widens Mithi's world by 15 m
    const want = this.jeetu && !jeetuNow ? 15 : 0;
    if (want !== this._fogAdded) { s.fogBonus = (s.fogBonus || 0) + (want - this._fogAdded); this._fogAdded = want; }
    // Jeetu in the dark
    if (jeetuNow && !(game.visionSystem?.active) && game.player.pos.y < -4) {
      const torch = game.items?.has('torch');
      const fog = game.scene.fog;
      fog.near = 0.3; fog.far = torch ? 27 : 6.5;
      s.U.uSenseDim.value = torch ? 0.82 : 0.38;
    }
  }

  _speed(game) {
    const h = game.hazards, p = game.player;
    const mul = this.active === 'jeetu' ? JEETU_SPEED : 1;
    if (h && h.enabled) {
      if (this._ownScale) { p.speedScale = 1; this._ownScale = false; }
      h.setSpeedMod('party', mul);
    } else if (mul !== 1 || this._ownScale) { p.speedScale = mul; this._ownScale = mul !== 1; }
  }

  _torch(game) {
    const L = this.light, p = game.player;
    const has = game.items?.has('torch') && this.jeetu;
    const lvl = p.pos.y < -4 ? 'U' : p.pos.y < 6 ? 'G' : 'H';
    const on = has && lvl !== 'H';
    L.intensity = on ? (lvl === "U" ? 9 : 4) : 0;
    if (!on) return;
    if (this.active === 'jeetu') {
      // held at the chest, aimed where the camera looks
      const cp = Math.cos(p.pitch), fx = -Math.sin(p.yaw) * cp, fy = Math.sin(p.pitch), fz = -Math.cos(p.yaw) * cp;
      L.position.set(p.pos.x + fx * 0.35 + Math.cos(p.yaw) * 0.18, p.pos.y + 1.0, p.pos.z + fz * 0.35 - Math.sin(p.yaw) * 0.18);
      L.target.position.set(L.position.x + fx * 10, L.position.y + fy * 10, L.position.z + fz * 10);
    } else {
      const J = this.bodies.jeetu, jp = J._pos, yaw = J.yaw ?? 0;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      L.position.set(jp.x + fx * 0.3, jp.y + 0.85, jp.z + fz * 0.3);
      L.target.position.set(jp.x + fx * 10, jp.y + 0.35, jp.z + fz * 10);
    }
    L.target.updateMatrixWorld();
  }

  /** Jeetu calls out dangers around Mithi, relative to where she faces ("Didi, dogs, left!"). */
  _callouts(dt, game) {
    const h = game.hazards;
    this._callT -= dt;
    if (this._callT > 0 || !h || !h.enabled || game.modal) return;
    this._callT = 0.5;
    const p = game.player, now = game.time, list = h.list();
    this._callGlobal = Math.max(0, this._callGlobal - 0.5);
    if (this._callGlobal > 0) return;
    let best = null, bd = Infinity;
    for (const e of list) {
      const range = CALL[e.kind]; if (!range) continue;
      const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d > range || Math.abs(e.pos.y - p.pos.y) > (e.kind === 'drone' || e.kind === 'camera' ? 16 : 3.5)) continue;
      if ((e.kind === 'dog' || e.kind === 'deranged') && e.state === 'calm') continue;
      if (now - (this._call.get(e.kind) ?? -99) < COOL[e.kind]) continue;
      if (d < bd) { bd = d; best = e; }
    }
    if (!best) return;
    this._call.set(best.kind, now); this._callGlobal = 3;
    const dir = sayDirection(bearing(p.pos, p.yaw, best.pos));
    const J = this.bodies.jeetu;
    const T = {
      dog: bd < 9 ? `"Didi, dogs, ${dir}! Close!"` : `"Didi, dogs, ${dir}!"`,
      deranged: `"Didi, someone's standing there, ${dir}. He's not right."`,
      guard: `"Didi, a guard, ${dir}. Walk slowly."`,
      drone: `"Drone, ${dir}, up high. Keep out of the light."`,
      camera: `"Camera, ${dir}, Didi."`,
      slab: '"Didi, the floor, it\'s cracking!"',
      smog: `"Didi, bad air, ${dir}. Cover your mouth."`,
      water: `"Water, ${dir}, Didi. Deep."`,
    };
    this.calls++;
    this.lastCall = { kind: best.kind, dir, dist: Math.round(bd), text: T[best.kind] };
    game.messages?.say(T[best.kind], { kind: 'clue', speaker: 'Jeetu', ttl: 4.5 });
    game.events.emit('sound:emit', { x: J._pos.x, y: J._pos.y + 1, z: J._pos.z, kind: 'mutter', loudness: 0.3 });
    game.events.emit('party:callout', this.lastCall);
  }

  snapshot() {
    const J = this.bodies.jeetu, M = this.bodies.mithi, r = (v) => Math.round(v * 100) / 100;
    const pos = (b) => b && { x: r(b.pos.x), y: r(b.pos.y), z: r(b.pos.z) };
    return {
      active: this.active, joined: !!this.jeetu, jeetu: pos(J), mithi: pos(M), torchOn: this.light.intensity > 0, torchIntensity: r(this.light.intensity),
      follower: this.jeetu ? { who: this.active === 'mithi' ? 'jeetu' : 'mithi', ...(() => { const f = (this.active === 'mithi' ? J : M).follower; return { state: f.state, teleports: f.teleports }; })() } : null,
      canSing: this.game.canSing(), perceive: this.game.senses ? r(this.game.senses.perceive) : null, fogBonus: this.game.senses?.fogBonus ?? 0,
      speedScale: r(this.game.player.speedScale), eyeY: r(this.game.player.eyeY - this.game.player.pos.y), calls: this.calls, lastCall: this.lastCall,
      viewModel: this.game.view?.mithi?.name ?? null,
    };
  }
}
