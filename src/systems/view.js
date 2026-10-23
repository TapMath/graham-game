// First / third person view (key V, or __grahan.set('view', 'first'|'third')).
//
//   game.view.mode         'first' | 'third'  (the target; first is the default)
//   game.view.blend        0..1 eased transition (0.22 s)      .third (blend > 0.5)
//   game.view.set(mode) / toggle()
//   game.view.mithi        the Character (src/characters/humanoid.js): .setVariant('jacket') puts on the blue Metro jacket
//   game.view.camDistance  the actual camera distance after the wall pull-in (m)
//
// Third person: the camera sits ~3.5 m behind and 1 m above the head, a little over the right shoulder, follows
// yaw/pitch smoothly, and is pulled in toward the head when `physics.raycast` finds a wall, floor or ceiling in
// the way. Controls and movement are identical to first person. Mithi's model is hidden in first person (and
// whenever the camera is closer than 0.9 m). The model faces the direction she moves; standing still it turns
// slowly toward where she looks. Walk animation is procedural (limb swing) from her horizontal speed.
// Events: 'view:changed' {mode}.
import * as THREE from '../../vendor/three.module.js';
import { buildMithi, buildNpc, NPC_PRESETS } from '../characters/humanoid.js';
import { turnToward } from './follower.js';

export const VIEW = Object.freeze({ back: 3.5, up: 1.0, side: 0.5, margin: 0.3, ease: 0.22, minModel: 0.9, lookAhead: 9 });
const _o = { x: 0, y: 0, z: 0 }, _d = { x: 0, y: 0, z: 0 };
const _p = new THREE.Vector3();
const smooth = (t) => t * t * (3 - 2 * t);

export class ViewSystem {
  init(game) {
    this.game = game;
    game.view = this;
    this.mode = 'first'; this.blend = 0;
    this.mithi = buildMithi(game);
    this.mithi.group.visible = false;
    game.scene.add(this.mithi.group);
    this.bodyYaw = 0; this.camYaw = 0; this.camPitch = 0;
    this.camDistance = 0; this.fullDistance = 0; this.pulledIn = false; this.orbit = 0; this.backOverride = 0;
    this._init = false;
    game.debug?.addSetter('view', (g, v) => this.set(v === 'third' ? 'third' : 'first'));
    game.debug?.addSetter('viewOrbit', (g, deg) => { this.orbit = deg * Math.PI / 180; });   // test aid: swing the camera round Mithi (180 = look at her face)
    game.debug?.addSetter('viewBack', (g, m) => { this.backOverride = m || 0; });             // test aid: camera distance in metres (0 = default 3.5)
    // test aid: a row of every NPC preset in front of the player (call again to remove it)
    game.debug?.addAction('npcLineup', (g, dist = 4) => {
      if (this.lineup) { for (const c of this.lineup) { g.scene.remove(c.group); c.dispose(); } this.lineup = null; return 0; }
      const p = g.player, names = Object.keys(NPC_PRESETS), sx = 1.25;
      this.lineup = names.map((n, i) => {
        const c = buildNpc(n, g), off = (i - (names.length - 1) / 2) * sx;
        const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
        const x = p.pos.x + fx * dist + rx * off, z = p.pos.z + fz * dist + rz * off;
        const gh = g.physics.groundHeightAt(x, z, p.pos.y + 0.5, 1);
        c.group.position.set(x, gh > -Infinity ? gh : p.pos.y, z);
        c.group.rotation.y = p.yaw + Math.PI;
        g.scene.add(c.group);
        return c;
      });
      return names;
    });
    game.debug?.addSetter('jacket', (g, v) => this.mithi.setVariant(v ? 'jacket' : 'default'));
    game.debug?.addState('view', () => ({
      mode: this.mode, blend: +this.blend.toFixed(2), camDistance: +this.camDistance.toFixed(2), full: +this.fullDistance.toFixed(2),
      pulledIn: this.pulledIn, variant: this.mithi.variant, modelVisible: this.mithi.group.visible,
    }));
  }

  get third() { return this.blend > 0.5; }

  set(mode) {
    if (mode === this.mode) return;
    this.mode = mode;
    if (!this._init) this._snapYaw();
    this.game.events.emit('view:changed', { mode });
  }
  toggle() { this.set(this.mode === 'first' ? 'third' : 'first'); }

  _snapYaw() {
    const p = this.game.player;
    this.camYaw = p.yaw; this.camPitch = p.pitch; this.bodyYaw = p.yaw; this._init = true;
  }

  update(dt, game) {
    const input = game.input, p = game.player;
    if (input.pressed('view')) this.toggle();
    const target = this.mode === 'third' ? 1 : 0;
    if (this.blend !== target) {
      const step = dt / VIEW.ease;
      this.blend = target > this.blend ? Math.min(target, this.blend + step) : Math.max(target, this.blend - step);
    }
    if (!this._init) this._snapYaw();

    const m = this.mithi, g = m.group;
    if (this.blend <= 0) { g.visible = false; this.camDistance = 0; this.pulledIn = false; this.camYaw = p.yaw; this.camPitch = p.pitch; this.bodyYaw = p.yaw; return; }

    // ---- model: follows the feet, faces the move direction
    const hv = Math.hypot(p.vel.x, p.vel.z);
    const k = 1 - Math.exp(-14 * dt);
    this.camYaw += Math.atan2(Math.sin(p.yaw - this.camYaw), Math.cos(p.yaw - this.camYaw)) * k;
    this.camPitch += (p.pitch - this.camPitch) * k;
    if (hv > 0.4) this.bodyYaw = turnToward(this.bodyYaw, Math.atan2(-p.vel.x, -p.vel.z), 12 * dt);
    else this.bodyYaw = turnToward(this.bodyYaw, p.yaw, 3.2 * dt);
    g.position.set(p.pos.x, p.pos.y - p.stepSmooth, p.pos.z);
    g.rotation.y = this.bodyYaw;
    m.update(dt, game.modal ? 0 : hv, { onGround: p.onGround });

    // ---- camera: eye position + (shoulder, back, up), pulled in by the world
    const b = smooth(this.blend);
    const eyeX = p.pos.x, eyeY = p.eyeY, eyeZ = p.pos.z;
    const yawEff = this.camYaw + this.orbit;
    const cy = Math.cos(yawEff), sy = Math.sin(yawEff), cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const fx = -sy * cp, fy = sp, fz = -cy * cp;                  // look direction
    const rx = cy, rz = -sy;                                      // right
    const back = this.backOverride || VIEW.back, up = this.backOverride ? VIEW.up * back / VIEW.back : VIEW.up;
    const ox = rx * VIEW.side - fx * back, oy = up - fy * back, oz = rz * VIEW.side - fz * back;
    const full = Math.hypot(ox, oy, oz);
    this.fullDistance = full;
    _o.x = eyeX; _o.y = eyeY; _o.z = eyeZ;
    _d.x = ox / full; _d.y = oy / full; _d.z = oz / full;
    const hit = game.physics.raycast(_o, _d, full + VIEW.margin, (c) => c.solid || c.walkable);
    let dist = full;
    this.pulledIn = false;
    if (hit && hit.dist - VIEW.margin < full) { dist = Math.max(0.12, hit.dist - VIEW.margin); this.pulledIn = true; }
    // pull in at once, relax outward smoothly
    if (dist > this.camDistance && this.camDistance > 0) dist = Math.min(dist, this.camDistance + 9 * dt);
    this.camDistance = dist;
    const cx = eyeX + _d.x * dist, cyy = eyeY + _d.y * dist, cz = eyeZ + _d.z * dist;
    // blend from the first-person eye to the third-person spot
    const cam = game.camera;
    const px = eyeX + (cx - eyeX) * b, py = eyeY + (cyy - eyeY) * b, pz = eyeZ + (cz - eyeZ) * b;
    cam.position.set(px, py, pz);
    // look at a point ahead of the eye so the framing stays sensible; at blend 0 this equals the first-person look
    _p.set(eyeX + fx * VIEW.lookAhead, eyeY + fy * VIEW.lookAhead, eyeZ + fz * VIEW.lookAhead);
    cam.lookAt(_p);
    if (b < 1) {
      const q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(this.camPitch, yawEff, 0, 'YXZ'));
      const q2 = cam.quaternion.clone();
      cam.quaternion.copy(q1.slerp(q2, b));
    }
    // hide the model while the camera is inside or right next to it
    const toHead = Math.hypot(px - eyeX, py - eyeY, pz - eyeZ);
    g.visible = this.blend > 0.3 && toHead > VIEW.minModel;
  }
}
