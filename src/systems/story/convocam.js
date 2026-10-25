// The conversation camera (Phase 8C): while a card is open the view leaves Mithi's eyes and frames the person talking, like a film.
//
//   cam.begin({ actor, memberIndex })          take the camera (a glide from where it was)
//   cam.shot('npc' | 'player' | 'wide')        npc: over the shoulder onto whoever she talks to (lower third left to the card);
//                                              player: reverse, from behind the other person onto Mithi (or Jeetu) while they speak
//   cam.update(dt)                             after the view and the player: writes game.camera
//   cam.end()                                  hand the camera back with a short ease
//
// Both people are posed for it: the listener turns their head to the speaker, the speaker's mouth moves (Character.setTalking), and a
// soft key light (a PointLight that exists from the start so no shader recompiles) lifts the face in the dark. A vignette closes in.
import * as THREE from '../../../vendor/three.module.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4();
const damp = (k, dt) => 1 - Math.exp(-k * dt);

export class ConversationCamera {
  constructor(game) {
    this.game = game;
    this.active = false; this.t = 0; this.kind = 'npc'; this.blendOut = 0;
    this.pos = new THREE.Vector3(); this.look = new THREE.Vector3(); this.fov = 60; this.roll = 0;
    this.tPos = new THREE.Vector3(); this.tLook = new THREE.Vector3(); this.tFov = 42;
    this.last = { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fov: 60 };
    this.key = new THREE.PointLight(0xffe4c8, 0, 8, 1.2);
    this.key.name = 'conversation-key';
    game.scene.add(this.key);
    this.vig = document.createElement('div'); this.vig.id = 'convo-vig'; document.body.appendChild(this.vig);
    this.side = 1; this.focus = new THREE.Vector3(); this.listener = null; this.speaker = null;
  }

  // ------------------------------------------------------------------ the people
  /** Head-height world position of a cast actor (or of the player). */
  headOf(actor, out, model) {
    const m = model ?? actor?.model;
    if (m && !(actor.hiddenModel && !model)) { m.group.updateMatrixWorld(true); return m.group.localToWorld(out.set(0, m.D.chinY + m.D.hh * 0.5, 0)); }
    const p = this.game.cast?.worldPos(actor) ?? actor.pos;
    const h = actor.def?.lying ? 0.3 : actor.id === 'oldman' ? 0.5 : actor.id === 'aayat' || actor.id === 'torchBoys' ? 1.0 : actor.id === 'jeetu' ? 0.95 : 1.55;
    if (actor.def?.lying) { const yaw = actor.def.yaw ?? 0; return out.set(p.x + Math.sin(yaw) * 1.4, (p.y ?? 0) + 0.28, p.z + Math.cos(yaw) * 1.4); }       // the pillow end of a baked sleeper
    return out.set(p.x, (p.y ?? 0) + h, p.z);
  }

  begin({ actor, memberIndex = 0 } = {}) {
    const g = this.game, cam = g.camera;
    this.actor = actor; this.index = memberIndex;
    this.model = g.cast?.beginTalk?.(actor, memberIndex) ?? actor?.model ?? null;      // the live body to animate (a stand-in for baked bystanders)
    this.player = g.view?.mithi ?? null;
    this.active = true; this.t = 0; this.blendOut = 0; this.kind = 'wide';
    this.pos.copy(cam.position); this.fov = cam.fov;
    cam.getWorldDirection(_a); this.look.copy(cam.position).addScaledVector(_a, 3);
    this.side = Math.sin(actor?.pos?.x * 1.7 + actor?.pos?.z * 0.9) > 0 ? 1 : -1;
    this.saveFov = cam.fov;
    document.body.classList.add('convo-cam');
    this.vig.classList.add('on');
    this.speaker = 'npc';
  }

  isLying() { const a = this.actor; return !!(a && (a.lying || a.def?.lying)) || (this.model && Math.abs(this.model.group.rotation.x) > 0.3); }

  shot(kind) { if (this.active) { this.kind = kind; this.shotT = 0; } }

  end() {
    if (!this.active) return;
    const g = this.game;
    this.active = false;
    this.last.pos.copy(g.camera.position); this.last.quat.copy(g.camera.quaternion); this.last.fov = g.camera.fov;
    this.blendOut = 0.45; this._fovBack = this.saveFov;
    this.vig.classList.remove('on');
    document.body.classList.remove('convo-cam');
    g.cast?.endTalk?.(this.actor, this.index);
    this.model?.setTalking?.(false); this.model?.lookAt?.(null);
    const pm = this.player; pm?.setTalking?.(false); pm?.lookAt?.(null);
    this.player?.setMood?.('neutral');
    this.model = null; this.actor = null;
  }

  // ------------------------------------------------------------------ per frame (after the view system)
  update(dt) {
    const g = this.game, cam = g.camera, p = g.player;
    this.key.intensity += ((this.active ? 7.5 : 0) - this.key.intensity) * damp(5, dt);
    if (!this.active) {
      if (this.blendOut > 0) {                      // ease from the shot back to the real view (set by the other systems this frame)
        this.blendOut = Math.max(0, this.blendOut - dt);
        const k = 1 - this.blendOut / 0.45, s = k * k * (3 - 2 * k);
        const realFov = g.settings?.get?.('fov') ?? this.saveFov;
        cam.position.lerpVectors(this.last.pos, _a.copy(cam.position), s);
        cam.quaternion.copy(this.last.quat).slerp(_q.copy(cam.quaternion), s);
        cam.fov = this.last.fov + (realFov - this.last.fov) * s;
        cam.updateProjectionMatrix();
      }
      return;
    }
    this.t += dt; this.shotT = (this.shotT ?? 0) + dt;
    const eye = _a.set(p.pos.x, p.eyeY, p.pos.z);
    const S = this.headOf(this.actor, this.focus, this.model);
    const dx = S.x - eye.x, dz = S.z - eye.z, dist = Math.max(0.6, Math.hypot(dx, dz));
    const d = _b.set(dx / dist, 0, dz / dist), r = _c.set(-d.z, 0, d.x).multiplyScalar(this.side);       // d: towards her; r: to the camera's side
    // pose both people
    const pm = this.player = g.view?.mithi ?? this.player;
    if (pm) {
      pm.group.visible = true;
      if (g.view.blend <= 0.001) { pm.group.position.set(p.pos.x, p.pos.y - (p.stepSmooth ?? 0), p.pos.z); pm.group.rotation.y = Math.atan2(-dx, -dz); pm.update(dt, 0, { onGround: true }); }
      pm.lookAt(S);
    }
    if (this.model) {
      this.model.lookAt(eye.clone().setY(p.eyeY - 0.02));
      // they turn to face her (standing people only)
      const mg = this.model.group, lying = Math.abs(mg.rotation.x) > 0.3;
      if (!lying && this.actor) {
        mg.getWorldPosition(_w);
        const want = Math.atan2(-(eye.x - _w.x), -(eye.z - _w.z));
        let dy = want - mg.rotation.y; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        mg.rotation.y += dy * damp(4, dt);
        if (this.actor.pos) this.actor.yaw = mg.rotation.y;
      }
    }
    // key light: up and to the side of the camera, aimed (by position) at the speaker's face
    const faceP = this.speaker === 'player' && pm ? eye : S;
    this.key.position.set(faceP.x - d.x * (this.speaker === 'player' ? -0.4 : 0.9) + r.x * 0.7, faceP.y + 0.55, faceP.z - d.z * (this.speaker === 'player' ? -0.4 : 0.9) + r.z * 0.7);
    // target shot
    const tp = this.tPos, tl = this.tLook;
    const push = Math.min(1, this.t / 8) * 0.12;
    if (this.kind === 'wide') {
      // the establishing glide: behind and above Mithi's shoulder, both of them in the frame
      tp.set(eye.x - d.x * 1.15 + r.x * 0.75, eye.y + 0.2, eye.z - d.z * 1.15 + r.z * 0.75);
      tl.set((eye.x + S.x) / 2 + d.x * 0.25, (eye.y + S.y) / 2 - 0.12, (eye.z + S.z) / 2 + d.z * 0.25);
      this.tFov = 46;
    } else if (this.kind === 'npc' && this.isLying()) {
      // someone in a bed: from above and beside the pillow, looking down at the face
      tp.set(S.x - d.x * 0.85 + r.x * 0.35, S.y + 0.95, S.z - d.z * 0.85 + r.z * 0.35);
      tl.set(S.x, S.y - 0.08, S.z);
      this.tFov = 42 - push * 10;
    } else if (this.kind === 'npc') {
      const camD = Math.min(2.15, Math.max(1.5, dist - 0.1));
      tp.set(S.x - d.x * camD + r.x * 0.5, S.y + 0.05 + (this.model ? 0.0 : 0), S.z - d.z * camD + r.z * 0.5);
      tp.x += d.x * push; tp.z += d.z * push;
      tl.set(S.x - r.x * 0.12, S.y - 0.17, S.z - r.z * 0.12);
      this.tFov = 36 - push * 14;
    } else {                                         // 'player': from behind the other person, onto her face
      tp.set(S.x + d.x * 0.5 + r.x * 0.42, Math.max(S.y - 0.02, eye.y + 0.02), S.z + d.z * 0.5 + r.z * 0.42);
      tl.set(eye.x + r.x * 0.08, eye.y - 0.15, eye.z + r.z * 0.08);
      this.tFov = 33;
    }
    // keep the camera out of walls: a ray from the focus person to the camera
    const from = this.kind === 'player' ? eye : S, to = tp;
    _a.copy(to).sub(from); const len = _a.length();
    if (len > 0.3 && g.physics?.raycast) {
      _a.normalize();
      const hit = g.physics.raycast(from, _a, len + 0.25, (c) => c.solid);
      if (hit && hit.dist < len + 0.25) { const k = Math.max(0.3, hit.dist - 0.25); to.copy(from).addScaledVector(_a, k); }
    }
    // glide, with a breath of hand-held drift
    const k = damp(this.t < 1.3 ? 3.4 : 5.5, dt);
    this.pos.lerp(tp, k); this.look.lerp(tl, k); this.fov += (this.tFov - this.fov) * k;
    const tt = g.time;
    cam.position.copy(this.pos);
    cam.position.x += Math.sin(tt * 0.7) * 0.012; cam.position.y += Math.sin(tt * 0.53 + 1) * 0.009;
    cam.up.set(0, 1, 0);
    cam.lookAt(_b.copy(this.look).add(_c.set(Math.sin(tt * 0.9) * 0.01, Math.sin(tt * 0.6) * 0.008, 0)));
    if (Math.abs(cam.fov - this.fov) > 1e-3) { cam.fov = this.fov; cam.updateProjectionMatrix(); }
  }
}
