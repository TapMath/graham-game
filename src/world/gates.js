// Bio-scanner health gates. Routes up into L2 need >= 5 rays, into L3 >= 8 (PLAN section 2).
//
//   game.world.gates                 [Gate]  {id, min, open, x,y,z, axis, width, inside, collider}
//   game.world.gate(id)              lookup
//   events: 'gate:denied' {id, min, rays}   a player short of rays came near from the outside
//           'gate:opened' {id, min, rays}   the door opened for a player who met the requirement
//
// A gate with `permit:'bridgePermit'` checks `game.flags.bridgePermit` instead of rays (the bridge gate, Tara's permission).
// The check reads `game.player.rays` (Phase 3's health system owns it). The door is a solid collider
// that is disabled while open. It only refuses entry: from the inside (`inside` points from the
// outside into the route) it always opens, so nobody can be trapped in a lift lobby.
import * as THREE from '../../vendor/three.module.js';
import { TONE } from './structures.js';

const RANGE = 4.2;          // m: how close you must be for the scanner to react
const CLOSE_DELAY = 0.8;    // s the door stays open after the player steps away
const DENY_COOLDOWN = 3.0;
const DIRS = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };

export class Gate {
  constructor(def, collider) {
    Object.assign(this, def);
    this.collider = collider;
    this.open = false;
    this.closeIn = 0;
    this.lastDenied = -99;
    this.v = DIRS[def.inside];
    this.denyFlash = 0;
  }
}

export class GateSystem {
  constructor(game) {
    this.game = game;
    this.gates = [];
    this.mats = {
      red: new THREE.MeshBasicMaterial({ color: 0xff4a36 }),
      green: new THREE.MeshBasicMaterial({ color: 0x4cff9a }),
      curtain: new THREE.MeshBasicMaterial({ color: 0xff3a28, transparent: true, opacity: 0.28, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }),
    };
  }

  /** Build the arch, door collider, sign, lights and camera for each gate (ctx = structures.Ctx). */
  build(ctx, labels) {
    const { b, map, game } = ctx;
    const ind = new THREE.BoxGeometry(1, 0.22, 0.22);
    for (const d of map.gates) {
      const [nx, nz] = DIRS[d.inside];
      const alongX = d.axis === 'x', hw = d.width / 2;
      const tone = d.permit ? TONE.sun : d.min >= 8 ? TONE.gate8 : TONE.gate5;
      // posts + lintel
      const post = (c) => b.box(alongX ? [d.x + c - 0.3, d.y, d.z - 0.35] : [d.x - 0.35, d.y, d.z + c - 0.3], alongX ? [d.x + c + 0.3, d.y + 4.2, d.z + 0.35] : [d.x + 0.35, d.y + 4.2, d.z + c + 0.3],
        { color: 0x394345, tag: 'gate-post', walkable: false, userData: { rail: true } });
      post(-hw - 0.3); post(hw + 0.3);
      const lintel = alongX ? [[d.x - hw - 0.6, d.y + 3.3, d.z - 0.4], [d.x + hw + 0.6, d.y + 4.3, d.z + 0.4]] : [[d.x - 0.4, d.y + 3.3, d.z - hw - 0.6], [d.x + 0.4, d.y + 4.3, d.z + hw + 0.6]];
      b.box(lintel[0], lintel[1], { color: 0x2e3739, tag: 'gate-lintel', walkable: false, userData: { rail: true } });
      // scanner light bars down the inner post faces
      for (const c of [-hw, hw]) {
        const o = c > 0 ? -0.02 : 0.02;
        b.box(alongX ? [d.x + c + o - 0.03, d.y + 0.2, d.z - 0.3] : [d.x - 0.3, d.y + 0.2, d.z + c + o - 0.03], alongX ? [d.x + c + o + 0.03, d.y + 3.3, d.z + 0.3] : [d.x + 0.3, d.y + 3.3, d.z + c + o + 0.03],
          { mat: 'emissive', color: tone, solid: false, walkable: false, noTint: true });
      }
      // the door (collision only; the visual is the curtain)
      const dm = alongX ? [d.x - hw, d.y, d.z - 0.15] : [d.x - 0.15, d.y, d.z - hw];
      const dM = alongX ? [d.x + hw, d.y + 3.4, d.z + 0.15] : [d.x + 0.15, d.y + 3.4, d.z + hw];
      const collider = game.physics.addBox(dm, dM, { solid: true, walkable: false, tag: 'gate:' + d.id, userData: { gate: d.id, rail: true } });
      const gate = new Gate(d, collider);
      // curtain + status light (the status light flips red/green)
      const cur = new THREE.Mesh(new THREE.PlaneGeometry(d.width, 3.2), this.mats.curtain);
      cur.position.set(d.x, d.y + 1.7, d.z);
      if (!alongX) cur.rotation.y = Math.PI / 2;
      game.scene.add(cur);
      const light = new THREE.Mesh(ind, this.mats.red);
      light.scale.x = d.width + 0.4;
      light.position.set(d.x - nx * 0.45, d.y + 3.85, d.z - nz * 0.45);   // on the outside face
      if (!alongX) light.rotation.y = Math.PI / 2;
      game.scene.add(light);
      gate.curtain = cur; gate.light = light;
      // requirement sign facing the outside, plus a repeat inside the lintel
      const out = nx !== 0 ? (nx > 0 ? '-x' : '+x') : (nz > 0 ? '-z' : '+z');
      labels.add({ text: d.permit ? 'पुल  BRIDGE PERMIT REQUIRED' : `BIO-SCAN: ${d.min} RAYS`, tone: d.permit ? 'sun' : d.min >= 8 ? 'gate8' : 'gate5', x: d.x - nx * 0.42, y: d.y + 5.0, z: d.z - nz * 0.42, dir: out, w: Math.min(d.width + 1.6, 7), h: 1.3 });
      // surveillance camera on top of the left post looking at the approach
      const ax = alongX ? 1 : 0, az = alongX ? 0 : 1, cx = d.x - ax * (hw + 0.3) - nx * 0.5, cz = d.z - az * (hw + 0.3) - nz * 0.5;
      b.box([cx - 0.2, d.y + 4.2, cz - 0.2], [cx + 0.2, d.y + 4.6, cz + 0.2], { color: 0x222a2c, solid: false, walkable: false });
      b.box([cx - 0.3 * -nx - 0.09, d.y + 4.3, cz - 0.3 * -nz - 0.09], [cx - 0.3 * -nx + 0.09, d.y + 4.5, cz - 0.3 * -nz + 0.09], { mat: 'emissive', color: 0xff2a2a, solid: false, walkable: false, noTint: true });
      this.gates.push(gate);
    }
    return this.gates;
  }

  get(id) { return this.gates.find((g) => g.id === id); }

  /** Does the player meet the gate's requirement right now? */
  allows(gate) { return gate.permit ? !!this.game.flags[gate.permit] : (this.game.player?.rays ?? 0) >= gate.min; }

  update(dt) {
    const p = this.game.player; if (!p) return;
    const t = this.game.time;
    for (const g of this.gates) {
      const dx = p.pos.x - g.x, dz = p.pos.z - g.z, dy = p.pos.y - g.y;
      const near = Math.hypot(dx, dz) < RANGE + g.width * 0.3 && dy > -1.5 && dy < 3.5;
      const side = dx * g.v[0] + dz * g.v[1];          // > 0: inside (the route side)
      const outside = side < 0;
      const ok = this.allows(g);
      const wantOpen = near && (!outside || ok);
      if (wantOpen) {
        g.closeIn = CLOSE_DELAY;
        if (!g.open) {
          g.open = true; this.game.physics.setEnabled(g.collider, false);
          if (outside) this.game.events.emit('gate:opened', { id: g.id, min: g.min, rays: p.rays, permit: g.permit ?? null });
        }
      } else if (g.open) {
        // never close the door on someone standing in it
        const inDoor = Math.abs(side) < 1.3 && Math.abs(g.axis === 'x' ? dx : dz) < g.width / 2 + 0.6 && dy > -1.5 && dy < 2;
        g.closeIn -= dt;
        if (g.closeIn <= 0 && !inDoor) { g.open = false; this.game.physics.setEnabled(g.collider, true); }
      }
      if (near && outside && !ok && Math.hypot(dx, dz) < 3.4 && t - g.lastDenied > DENY_COOLDOWN) {
        g.lastDenied = t; g.denyFlash = 0.6;
        this.game.events.emit('gate:denied', { id: g.id, min: g.min, rays: p.rays, permit: g.permit ?? null });
      }
      g.denyFlash = Math.max(0, g.denyFlash - dt);
      g.curtain.visible = !g.open;
      g.light.material = g.open ? this.mats.green : this.mats.red;
      if (!g.open) g.light.visible = g.denyFlash > 0 ? (Math.floor(t * 12) % 2 === 0) : true; else g.light.visible = true;
    }
  }

  snapshot() { return this.gates.map((g) => ({ id: g.id, min: g.min, permit: g.permit ?? null, open: g.open })); }
}
