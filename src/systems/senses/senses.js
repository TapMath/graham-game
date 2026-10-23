// Mithi's senses: the facade (`game.senses`), her perception, and the shader patch for everything in the scene.
//
//   game.senses.patchMaterial(mat)    opt a material in to the echolocation wave and the perception grade (chains any
//                                     existing onBeforeCompile). Characters, hazards and props call this once.
//   game.senses.patchObject(obj3d)    patch every mesh material under an object
//   game.senses.vision(opts)          second sight (Phase 6 story hook), see vision.js. Same as game.senses.vision.start
//   game.senses.sing / ripples / vision / organ   the sub-systems
//   game.senses.caneTap(tip)          a small sonar ping (called by the audio engine on cane taps)
//   game.senses.perceive              0..1 how strongly her perception grade applies (1 = first person as Mithi; lower in
//                                     the third-person view; Phase 6 sets 0 while the player is Jeetu: he sees normally)
//   game.senses.fogBonus              metres added to her fog distance (Jeetu following widens it by 15)
//
// Perception (PLAN section 5): short, dark, desaturated. Fog is tight underground and on the ground (about 5 to 48 m) and
// opens up on the upper levels where the warmth and the noise carry; colour drains out of the world (the sun shafts are
// their own shader and stay warm: she feels the heat). The echolocation wave and sound ripples are added AFTER the fog, so
// they show through it. The grade is applied per frame over the sky system's atmosphere (this system updates after it).
import * as THREE from '../../../vendor/three.module.js';
import { patchSenseMaterial } from '../../world/materials.js';

// by walking surface height: [y, fogNear, fogFar, saturation, brightness]
const PERCEPTION = [
  [-8, 3, 38, 0.30, 0.86],
  [0, 5, 48, 0.40, 0.90],
  [12, 12, 82, 0.58, 0.95],
  [24, 22, 135, 0.80, 1.0],
  [38, 40, 215, 0.95, 1.0],
];
const lerp = (a, b, t) => a + (b - a) * t;
const _c = new THREE.Color();

function grade(y) {
  const A = PERCEPTION;
  if (y <= A[0][0]) return A[0].slice(1);
  for (let i = 0; i < A.length - 1; i++) {
    if (y <= A[i + 1][0]) {
      const t = (y - A[i][0]) / (A[i + 1][0] - A[i][0]), s = t * t * (3 - 2 * t);
      return A[i].slice(1).map((v, j) => lerp(v, A[i + 1][j + 1], s));
    }
  }
  return A[A.length - 1].slice(1);
}

export class SensesSystem {
  init(game) {
    this.game = game;
    game.senses = this;
    this.U = game.materials.sense;
    this.perceive = 1; this.fogBonus = 0; this.enabled = true;
    this._k = 1; this._patchT = 0; this._patched = new WeakSet(); this.patchedCount = 0;
    // the public handle for story hooks: game.senses.vision(opts)
    const self = this;
    this.vision = function vision(opts) { return self.visionSystem ? self.visionSystem.start(opts) : false; };
    this.sing = null; this.ripples = null; this.visionSystem = null; this.organ = null;
    this.patchScene();
    game.debug?.addState('senses', () => ({
      perceive: +this.perceive.toFixed(2), sat: +this.U.uSenseSat.value.toFixed(2), dim: +this.U.uSenseDim.value.toFixed(2), fog: [+game.scene.fog.near.toFixed(1), +game.scene.fog.far.toFixed(1)],
      patched: this.patchedCount, fogBonus: this.fogBonus,
    }));
    game.debug?.addSetter('perceive', (g, v) => { this.perceive = Math.max(0, Math.min(1, Number(v))); this._forced = true; });
    game.debug?.addSetter('fogBonus', (g, v) => { this.fogBonus = Number(v) || 0; });
  }

  /** Link the sibling systems (they register after this one): called lazily from update. */
  _link() {
    const g = this.game;
    this.sing = g.sing ?? this.sing; this.ripples = g.ripples ?? this.ripples; this.visionSystem = g.visionSystem ?? this.visionSystem; this.organ = g.setuVoice ?? this.organ;
  }

  patchMaterial(mat) {
    if (!mat) return mat;
    if (Array.isArray(mat)) { mat.forEach((m) => this.patchMaterial(m)); return mat; }
    if (this._patched.has(mat)) return mat;
    this._patched.add(mat);
    const before = !!mat.userData?.sensePatched;
    patchSenseMaterial(mat, this.U);
    if (!before && mat.userData?.sensePatched) this.patchedCount++;
    return mat;
  }
  patchObject(obj) {
    obj.traverse((o) => { if ((o.isMesh || o.isInstancedMesh) && o.material) this.patchMaterial(o.material); });
  }
  /** Patch every mesh material currently in the scene (cheap; also re-run every few seconds for late additions). */
  patchScene() {
    this.patchObject(this.game.scene);
    for (const m of this.game.materials.all) this.patchMaterial(m);
  }

  caneTap(tip) {
    if (!this.sing || !this.enabled) return;
    if (this.sing.busy()) return;
    this.sing.startPulse('cane', { x: tip.x, y: tip.y + 0.3, z: tip.z });
  }

  update(dt, game) {
    this._link();
    this._patchT -= dt;
    if (this._patchT <= 0) { this._patchT = 3; this.patchObject(game.scene); }

    // ---- perception grade, over the sky's atmosphere
    const view = game.view, p = game.player;
    const third = view ? view.blend : 0;
    let P = this.perceive * (1 - 0.7 * third);
    if (!this.enabled || game.params.arena) P = 0;
    const visionOn = this.visionSystem && this.visionSystem.active;
    if (visionOn) P = 0;
    const k = 1 - Math.exp(-dt * 6);
    this._k += (P - this._k) * k;
    const kk = this._k;
    const [near, far, sat, dim] = grade(p.pos.y);
    const fog = game.scene.fog;
    fog.near = lerp(fog.near, near, kk);
    fog.far = lerp(fog.far, far + this.fogBonus * (kk > 0.3 ? 1 : 0), kk);
    // her fog is a little greyer and darker than the city's
    _c.copy(fog.color);
    const l = _c.r * 0.3 + _c.g * 0.59 + _c.b * 0.11;
    fog.color.r = lerp(fog.color.r, lerp(_c.r, l, 0.4) * 0.85, kk);
    fog.color.g = lerp(fog.color.g, lerp(_c.g, l, 0.4) * 0.85, kk);
    fog.color.b = lerp(fog.color.b, lerp(_c.b, l, 0.4) * 0.85, kk);
    game.scene.background?.copy?.(fog.color);
    this.U.uSenseSat.value = lerp(1, sat, kk);
    this.U.uSenseDim.value = lerp(1, dim, kk);
  }
}
