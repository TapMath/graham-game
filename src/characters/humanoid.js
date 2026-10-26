// Procedural people (PLAN 3b, Phase 3, rebuilt in Phase 8C). No image files and no model files: each person is ONE skinned,
// vertex-coloured mesh (smooth limbs, hands, feet, clothes, hair) plus a small alpha-blended face patch painted from a shared
// atlas of expressions, so a person costs 2 draw calls. The skeleton is procedural: a walk with knee and elbow bend, hip sway and a
// bob that keeps the feet on the floor; a breathing idle; the head follows a look-at target; mouths move, brows and lids change
// with the mood; gestures while talking.
//
//   const mithi = buildCharacter(MITHI, game);    // or buildMithi / buildSetu / buildNpc('guard') / npcSpec({...})
//   scene.add(mithi.group);                       // group origin = feet, faces -Z at rotation.y = 0 (like the player)
//   mithi.group.rotation.y = yaw;                 // +yaw turns left, same convention as player.yaw
//   mithi.update(dt, speed, { onGround, talking, mood, lookAt })    // procedural walk cycle etc.; speed in m/s
//   mithi.setVariant('jacket');                   // swap to a variant outfit (Mithi: the blue Metro jacket)
//   mithi.setMood('worry'); mithi.setTalking(true); mithi.lookAt(vec3 | null); mithi.gesture('point', 1.5); mithi.setPose('organ')
//   mithi.toStaticParts({ armR, armL, mood, ... }) -> { body, face }   baked geometry in the group's world pose (bystanders)
//   mithi.toStaticGeometry(armPose)               the body half only (old API)
//
// Bones are Object3Ds: character.armL / armR / legL / legR are the upper-arm and thigh bones (rotation.x swings forward, like before);
// character.bones has every one (hips spine chest neck head uarm/farm/hand L/R thigh/shin/foot L/R braid1-3 cloak1-2).
// `game.characterStyle` (see CHARACTER_STYLE) lists the palette and proportions for anything that wants to match (the crowd).
import * as THREE from '../../vendor/three.module.js';
import { mergeGeometries } from '../../vendor/addons/utils/BufferGeometryUtils.js';
import { SKIN, MITHI, SETU, NPC_DEFAULT, npcSpec, NPC_PRESETS, mergeSpec } from './specs.js';
import { BONES, B, buildBodyGeometry, bindPositions, parentOf, splitRigid, dimsOf } from './body.js';
import { faceAtlas, faceMaterial, makeFacePatch, EXPR } from './face.js';

export { SKIN, MITHI, SETU, NPC_DEFAULT, npcSpec, NPC_PRESETS };
export const buildNpc = (name, game) => buildCharacter(NPC_PRESETS[name], game);

/** What a person looks like, in numbers: for anything that must match the hero rig (the crowd). */
export const CHARACTER_STYLE = Object.freeze({
  proportions: { adultHeads: 7.5, childHeads: 5.5, heightM: [1.58, 1.84], heightF: [1.48, 1.7], heightChild: [1.0, 1.32], shoulderWidth: 0.25, hipWidth: 0.21, limbRadius: 0.032, headHeight: 0.22 },
  skin: SKIN,
  hair: { black: 0x14100e, darkBrown: 0x2a1812, brown: 0x3a281c, grey: 0x9a9a98, white: 0xd8d6d0, henna: 0x7a3a22 },
  clothes: {
    kurta: [0x2c3556, 0x6a7480, 0x8a7a58, 0x4a5a4a, 0x7a3a3a, 0x1f6a6a, 0xb4ac98, 0xa8a48c, 0x5a3a4a],
    sari: [0x14595a, 0xa02a3a, 0x2a4a8a, 0xc08a28, 0x6a2f52, 0x3a6a3a],
    shirt: [0xb8483a, 0x4a6a8a, 0x6a7480, 0xd0a030, 0x5a6a52, 0x8a8478, 0xc8c0a8],
    school: { shirt: 0xe8e4d6, shorts: 0x2f3b52 },
    trousers: [0x2c2f38, 0x33343c, 0x3a4048, 0x4a4038, 0x26262a, 0x2f3b52],
    uniforms: { metro: 0x2f6db3, rescue: 0xe88a20, guard: 0x2a3a58, nurse: 0x58a0a0, doctor: 0xd8dcd8 },
  },
  walk: { stridesPerSecond: (speed) => 0.6 + 0.25 * speed, armSwing: 0.55, bob: 0.0125 },
  lipTones: ['light', 'mid', 'dark'],
  // flat palettes in the shape the instanced crowd reads (src/systems/crowds), so the crowd wears the same colours as the cast
  skinTones: Object.values(SKIN),
  shirts: [0xb8483a, 0x4a6a8a, 0x6a7480, 0xd0a030, 0x5a6a52, 0x8a8478, 0xc8c0a8, 0x2c3556, 0x8a7a58, 0x1f6a6a],
  trousers: [0x2c2f38, 0x33343c, 0x3a4048, 0x4a4038, 0x26262a, 0x2f3b52],
  saris: [0x14595a, 0xa02a3a, 0x2a4a8a, 0xc08a28, 0x6a2f52, 0x3a6a3a],
});
export function installCharacterStyle(game) { if (game) game.characterStyle = CHARACTER_STYLE; return CHARACTER_STYLE; }

let _mat = null;
/** The one material for every person's body (vertex colours, smooth shading, double sided for cloth, a little emissive lift so they read in the dark). */
export function characterMaterial(game) {
  if (game) installCharacterStyle(game);
  if (_mat) return _mat;
  _mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: new THREE.Color(0x20262a) });
  game?.materials?.all?.push(_mat);
  return _mat;
}

// ------------------------------------------------------------------------------------------ geometry cache
const _cache = new Map();
function cachedBody(spec) {
  const key = JSON.stringify({ ...spec, name: undefined, variants: undefined });
  let e = _cache.get(key);
  if (!e) { e = buildBodyGeometry(spec); e.rigid = null; _cache.set(key, e); }
  return e;
}

// ------------------------------------------------------------------------------------------ look of the face
function lookOf(spec) {
  const c = new THREE.Color(spec.skin), lum = 0.3 * c.r + 0.59 * c.g + 0.11 * c.b;
  const age = spec.age ?? 0, hc = new THREE.Color(spec.hair?.color ?? 0);
  const greyHair = age > 0.5 || (hc.r > 0.28 && Math.abs(hc.r - hc.g) < 0.04 && spec.hair?.style !== 'turban' && spec.hair?.style !== 'cap');
  return {
    lip: lum > 0.42 ? 0 : lum > 0.2 ? 1 : 2,
    brow: greyHair ? 'grey' : 'dark',
    glasses: spec.glasses === true ? 'clear' : spec.glasses || null,
    age: age < 0.3 ? 0 : age < 0.7 ? 1 : 2,
    lash: spec.sex === 'f' ? 1 : 0,
    bindi: spec.bindi ?? null,
    child: spec.build === 'child' ? 1 : 0,
  };
}

// ------------------------------------------------------------------------------------------ gestures
// shoulder flexion x (forward +), abduction z (outward +), elbow flexion; [R x, R z, R elbow, L x, L z, L elbow]
const GESTURES = {
  rest: [0.04, 0.0, 0.14, 0.04, 0.0, 0.14],
  explain: [0.75, 0.15, 1.15, 0.12, 0.0, 0.2],
  emphasis: [0.7, 0.35, 1.05, 0.7, 0.35, 1.05],
  chest: [0.55, -0.32, 1.9, 0.06, 0.0, 0.2],
  point: [1.35, 0.1, 0.12, 0.05, 0.0, 0.2],
  shrug: [0.35, 0.5, 1.2, 0.35, 0.5, 1.2],
  beckon: [0.8, 0.1, 1.5, 0.05, 0.0, 0.2],
  wave: [2.5, 0.6, 0.6, 0.05, 0.0, 0.2],
  wide: [0.5, 0.95, 0.5, 0.5, 0.95, 0.5],
  cross: [0.45, -0.5, 2.3, 0.45, -0.5, 2.3],
  hips: [0.15, 0.62, 1.3, 0.15, 0.62, 1.3],
  wring: [0.6, -0.28, 1.7, 0.6, -0.28, 1.7],
  shout: [2.35, 0.55, 0.5, 2.35, 0.55, 0.5],
  face: [1.0, -0.1, 2.5, 1.0, -0.1, 2.5],
  reach: [1.5, 0.2, 0.15, 0.2, 0.0, 0.2],
};
const OSC = { explain: [0.18, 5], emphasis: [0.14, 4.5], beckon: [0.25, 6], wave: [0.3, 6], wring: [0.08, 7], shout: [0.35, 8], face: [0.04, 9], chest: [0.05, 3], point: [0.04, 3] };
const POSES = {
  stand: {}, organ: { arms: [0.95, -0.42, 2.3, 0.7, 0.38, 2.1], head: -0.15 }, sit: {}, pain: { arms: [0.4, -0.2, 1.8, 0.4, 0.2, 1.8] },
};

const _v = new THREE.Vector3(), _m = new THREE.Matrix4(), _w = new THREE.Vector3(), _e = new THREE.Euler();
const ease = (cur, tgt, k) => cur + (tgt - cur) * Math.min(1, k);

// ------------------------------------------------------------------------------------------ the character
export class Character {
  constructor(spec, game) {
    this.spec = spec;
    this.name = spec.name;
    this.game = game;
    this.mat = characterMaterial(game);
    const base = cachedBody(spec);
    this.D = this.dims = base.dims;
    this.entries = { default: base };
    for (const [name, over] of Object.entries(spec.variants ?? {})) this.entries[name] = cachedBody(mergeSpec(spec, over));
    this.variant = 'default';
    this.group = new THREE.Group();
    this.group.name = 'character-' + spec.name;
    this.rig = new THREE.Group();                 // lean / bob applied here, the feet stay on the group origin
    this.group.add(this.rig);
    const D = this.D, P = bindPositions(D);
    // bones
    this.bones = {};
    const list = [];
    for (const n of BONES) {
      const b = new THREE.Bone(); b.name = n;
      const par = parentOf(n), pp = par ? P[par] : [0, 0, 0];
      b.position.set(P[n][0] - pp[0], P[n][1] - pp[1], P[n][2] - pp[2]);
      this.bones[n] = b; list.push(b);
    }
    for (const n of BONES) { const par = parentOf(n); if (par) this.bones[par].add(this.bones[n]); }
    this.bindPos = P;
    this.body = new THREE.SkinnedMesh(base.geometry, this.mat);
    this.body.name = 'body-' + spec.name;
    this.body.add(this.bones.hips);
    this.rig.add(this.body);
    this.group.updateMatrixWorld(true);                 // the bones' bind pose must be in place before the skeleton takes its inverses
    this.skeleton = new THREE.Skeleton(list);
    this.body.bind(this.skeleton, this.body.matrixWorld);
    this.body.frustumCulled = true;
    this.body.geometry.boundingSphere = null;
    this._sphere();
    // compat names: arms and legs are the upper-arm and thigh bones
    this.armL = this.bones.uarmL; this.armR = this.bones.uarmR; this.legL = this.bones.thighL; this.legR = this.bones.thighR;
    this.parts = [this.body];
    // face
    this.look = lookOf(spec);
    this.hs = { w: (D.f ? 0.94 : 1) * (1 + 0.07 * D.kid), d: 1 + 0.02 * D.kid };
    this.facePatch = makeFacePatch(D.hh, D.kid > 0.5, this.hs);
    this.face = new THREE.Mesh(this.facePatch.geometry, faceMaterial(game));
    this.face.name = 'face-' + spec.name;
    this.face.position.set(0, D.chinY - P.head[1], -P.head[2]);
    this.face.frustumCulled = false;
    this.bones.head.add(this.face);
    this.bones.hips.updateMatrixWorld(true);
    this.hasCane = spec.props?.includes('cane');
    this.cane = base.cane;
    this._tip = new THREE.Vector3();
    this.gestures = spec.gestures ?? ['explain', 'emphasis', 'chest', 'shrug'];
    // animation state
    this.t = Math.random() * 10; this.phase = 0; this.stride = 0; this.speed = 0; this.air = 0;
    this.mood = 'neutral'; this.talking = false; this._talkT = 0; this._mouth = 'flat'; this._blinkT = 2 + Math.random() * 3; this._blink = 0;
    this.lookTarget = null; this._lookYaw = 0; this._lookPitch = 0;
    this.gest = { name: 'rest', until: 0, next: 0, cur: GESTURES.rest.slice(), tgt: GESTURES.rest.slice(), seed: Math.random() * 10 };
    this.pose = 'stand'; this._poseCur = null;
    this.sway = { x: 0, vx: 0 };
    this._cell = null; this._setCell('neutral');
    this.group.visible = true;
  }

  _sphere() {
    const D = this.D, g = this.body.geometry;
    if (!g.boundingSphere) g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, D.H * 0.5, 0), D.H * 0.95);
    this.body.boundingSphere = g.boundingSphere;
  }

  /** The old five-part rigid model (for instanced crowds that want it): { default: { body, armL, armR, legL, legR, dims } }. */
  get sets() {
    if (!this._sets) {
      this._sets = {};
      for (const [name, e] of Object.entries(this.entries)) { if (!e.rigid) e.rigid = splitRigid(e.geometry, e.dims); this._sets[name] = { ...e.rigid, dims: e.dims }; }
    }
    return this._sets;
  }

  setVariant(name) {
    const e = this.entries[name] ?? this.entries.default;
    this.variant = this.entries[name] ? name : 'default';
    this.body.geometry = e.geometry;
    this._sphere();
  }

  // ------------------------------------------------------------------ expression
  _setCell(name) {
    if (this._cellName === name) return;
    this._cellName = name;
    this.facePatch.setCell(faceAtlas().cell(this.look, name));
  }

  setMood(m) { this.mood = EXPR[m] ? m : 'neutral'; }
  setTalking(on, level = 1) { this.talking = !!on; this.talkLevel = level; }
  /** Look at a world point (or null to look ahead). */
  lookAt(p) { if (!p) { this.lookTarget = null; return; } (this.lookTarget ??= new THREE.Vector3()).set(p.x, p.y, p.z); }
  /** Play a named gesture for `secs` seconds (see GESTURES), then go back to resting/auto gestures. */
  gesture(name, secs = 1.6) { if (!GESTURES[name]) return; this.gest.name = name; this.gest.until = this.t + secs; this.gest.forced = true; this.gest.tgt = GESTURES[name].slice(); }
  setPose(p) { this.pose = POSES[p] ? p : 'stand'; }

  _expression(dt) {
    this._blinkT -= dt;
    if (this._blinkT <= 0) { this._blink = 0.12; this._blinkT = 2.2 + Math.random() * 3.6; }
    if (this._blink > 0) this._blink -= dt;
    let name = this.mood;
    if (this.talking) {
      this._talkT -= dt;
      if (this._talkT <= 0) {
        this._talkT = 0.07 + Math.random() * 0.1;
        const r = Math.random();
        this._mouth = r < 0.18 ? 'flat' : r < 0.5 ? 'openB' : r < 0.78 ? 'openC' : 'openA';
      }
      name = this.mood + ':' + this._mouth;
    } else if (this.mood === 'neutral' || this.mood === 'smile' || this.mood === 'worry' || this.mood === 'sad' || this.mood === 'angry') name = this.mood;
    if (this._blink > 0 && this.mood !== 'sleep' && this.mood !== 'pain') name = 'blink';
    if (name.endsWith(':flat')) name = name.slice(0, -5);
    this._setCell(name);
  }

  // ------------------------------------------------------------------ the pose, every frame
  /** Procedural animation. speed: horizontal m/s; opts.onGround=false = airborne pose. */
  update(dt, speed = 0, opts = {}) {
    if (opts.mood) this.mood = opts.mood;
    if (opts.talking !== undefined) this.talking = opts.talking;
    if (opts.lookAt !== undefined) this.lookAt(opts.lookAt);
    dt = Math.min(dt, 0.1);
    this.t += dt;
    const D = this.D, bn = this.bones, H = D.H;
    const air = opts.onGround === false;
    this.air = ease(this.air, air ? 1 : 0, dt * 14);
    const sp = Math.min(speed, 9);
    this.speed += (sp - this.speed) * Math.min(1, dt * 10);
    const s = this.speed, moving = s > 0.3;
    this.stride = Math.max(0, Math.min(1, this.stride + (moving ? 1 : -1) * Math.min(1, dt * 7)));
    const w = this.stride;
    const fc = 0.6 + 0.25 * Math.min(s, 8);
    if (moving) this.phase += dt * fc * Math.PI * 2;
    const ph = this.phase;
    const legLen = D.hipY - D.ankleY, thighL = D.hipY - D.kneeY, shinL = D.kneeY - D.ankleY;
    const longDress = this.spec.top?.length === 'sari' ? 0.72 : this.spec.top?.length === 'longKurta' ? 0.9 : 1;
    const stride = s / Math.max(0.3, fc);
    const A = Math.min(0.78, Math.asin(Math.min(0.9, stride / (4.2 * legLen)))) * longDress * w;
    const K = (0.25 + 0.075 * Math.min(s, 7)) * w;
    const t = this.t;
    // ---- legs
    const legs = [];
    for (const sd of [0, 1]) {
      const phi = ph + sd * Math.PI, th = A * Math.sin(phi);
      const flex = K * Math.pow(Math.max(0, Math.cos(phi + 0.2)), 2) + 0.06 * w;
      legs.push({ th, flex, dy: thighL * Math.cos(th) + shinL * Math.cos(th - flex) });
    }
    const idleLean = Math.sin(t * 0.5) * 0.018;
    // airborne: legs tucked, arms out
    for (let sd = 0; sd < 2; sd++) {
      const th = ease(legs[sd].th, sd ? -0.35 : 0.55, this.air), fl = ease(legs[sd].flex, sd ? 0.3 : 0.9, this.air);
      legs[sd].th = th; legs[sd].flex = fl;
      legs[sd].dy = thighL * Math.cos(th) + shinL * Math.cos(th - fl);
    }
    const dyMax = Math.max(legs[0].dy, legs[1].dy);
    const drop = (thighL + shinL) - dyMax;                        // how far the hips sink for the planted foot
    const hipsY = D.hipY - drop * (1 - this.air);
    bn.hips.position.set(Math.sin(ph) * 0.012 * w * (H / 1.7) + idleLean * 0.3, hipsY + Math.sin(t * 1.7) * 0.0012, 0);
    // sagittal swing: thigh positive = forward
    bn.thighL.rotation.set(legs[0].th, -0.04 * w, 0.03); bn.thighR.rotation.set(legs[1].th, 0.04 * w, -0.03);
    bn.shinL.rotation.set(-legs[0].flex, 0, 0); bn.shinR.rotation.set(-legs[1].flex, 0, 0);
    bn.footL.rotation.set(-(legs[0].th - legs[0].flex) * 0.9 + 0.1 * (1 - w) * 0, 0, 0); bn.footR.rotation.set(-(legs[1].th - legs[1].flex) * 0.9, 0, 0);
    // pelvis and spine
    const yawSw = Math.sin(ph) * 0.13 * w;
    bn.hips.rotation.set(0.02 * w * Math.cos(2 * ph), -yawSw * 0.7, Math.sin(ph) * -0.035 * w + Math.sin(t * 0.5) * 0.012 * (1 - w));
    const lean = -(0.02 + 0.028 * Math.min(s, 6)) * w * (this.spec.top?.length === 'sari' ? 0.7 : 1);
    const slump = (this.spec.age ?? 0) * 0.07 + (this.mood === 'sad' || this.mood === 'pain' ? 0.06 : 0) + (this.mood === 'scared' ? -0.02 : 0);
    const breath = Math.sin(t * (this.mood === 'scared' || this.mood === 'pain' ? 3.2 : 1.55));
    bn.spine.rotation.set(lean * 0.5 - slump * 0.4 + breath * 0.006, yawSw * 0.8, -Math.sin(ph) * 0.02 * w);
    bn.chest.rotation.set(lean * 0.6 - slump * 0.6 + breath * 0.012, yawSw * 0.7 + Math.sin(t * 0.3) * 0.02 * (1 - w), 0);
    bn.neck.rotation.set(-lean * 0.4 + slump * 0.5, 0, 0);
    // ---- head: look-at, nods
    let ty = 0, tp = 0;
    if (this.lookTarget) {
      this.group.updateMatrixWorld();
      _w.copy(this.lookTarget); this.group.worldToLocal(_w);
      const dx = _w.x, dz = _w.z, dy = _w.y - (D.chinY + D.hh * 0.45);
      ty = Math.atan2(-dx, -dz); tp = Math.atan2(dy, Math.hypot(dx, dz));
      if (Math.abs(ty) > 2.2) { ty = 0; tp = 0; }           // behind us: do not wring the neck
      ty = Math.max(-1.15, Math.min(1.15, ty)); tp = Math.max(-0.5, Math.min(0.45, tp));
    }
    this._lookYaw = ease(this._lookYaw, ty, dt * 6); this._lookPitch = ease(this._lookPitch, tp, dt * 6);
    const nod = this.talking ? Math.sin(t * 6.3 + this.gest.seed) * 0.035 + Math.sin(t * 2.1) * 0.03 : Math.sin(t * 0.4) * 0.02;
    const drift = Math.sin(t * 0.37 + this.gest.seed) * 0.05 * (1 - w) * (this.lookTarget ? 0.3 : 1);
    const pose = POSES[this.pose] ?? POSES.stand;
    bn.neck.rotation.y = this._lookYaw * 0.35 + drift * 0.3;
    bn.neck.rotation.x += this._lookPitch * 0.3;
    bn.head.rotation.set(-lean * 0.5 + this._lookPitch * 0.7 + nod + (pose.head ?? 0) + slump * 0.2, this._lookYaw * 0.65 + drift * 0.7, Math.sin(t * 0.31) * 0.012);
    // ---- arms: walk swing, idle, gesture
    this._gestures(dt);
    const g = this.gest.cur;
    const armA = (0.5 + 0.04 * Math.min(s, 6)) * A * 1.15;
    const swL = -Math.sin(ph) * armA, swR = Math.sin(ph) * armA;         // opposite to the legs (left arm forward with the right leg)
    const fl = (x) => 0.22 + 0.7 * Math.max(0, x) / Math.max(0.2, armA * 1.0) * Math.min(1, A * 2);
    const airArm = this.air;
    let aRx = ease(swR, 0, 0) + g[0] * (1 - w) + g[0] * w * 0.15, aLx = swL + g[3] * (1 - w) + g[3] * w * 0.15;
    const breathZ = breath * 0.008;
    let rz = 0.07 + g[1] + breathZ, lz = -(0.07 + g[4] + breathZ);
    let rE = (1 - w) * g[2] + w * (0.2 + fl(swR) * 0.75), lE = (1 - w) * g[5] + w * (0.2 + fl(swL) * 0.75);
    if (this.hasCane) {                                                    // the cane arm: held out in front, the tip sweeping at each step
      aRx = 0.78 + Math.sin(ph * 0.5 + 1) * 0.04 * w; rE = 0.35;
      rz = 0.1 + Math.sin(ph * 0.5) * (0.22 + 0.06 * Math.min(1, s / 4)) * (0.35 + 0.65 * w) + Math.sin(t * 0.9) * 0.05 * (1 - w);
      aRx += (1 - w) * (g[0] - 0.04) * 0.0;
    }
    if (pose.arms) { aRx = pose.arms[0]; rz = pose.arms[1]; rE = pose.arms[2]; aLx = pose.arms[3]; lz = -pose.arms[4] * 0.0 - 0.0; lE = pose.arms[5]; lz = -(0.07 + Math.abs(pose.arms[1]) * 0.5); }
    aRx = ease(aRx, -0.9, this.air); aLx = ease(aLx, -0.9, this.air); rz = ease(rz, 0.5, this.air); lz = ease(lz, -0.5, this.air);
    bn.uarmR.rotation.set(aRx, 0, rz); bn.uarmL.rotation.set(aLx, 0, lz);
    bn.farmR.rotation.set(rE, 0, 0); bn.farmL.rotation.set(lE, 0, 0);
    bn.handR.rotation.set(0.05 + Math.sin(t * 1.3) * 0.02, 0, 0); bn.handL.rotation.set(0.05, 0, 0);
    if (this.hasCane && this.cane && !pose.arms && !air) this._caneFix();
    // ---- trailing cloth and hair: a damped lag behind the body's lean and bounce
    const target = -(lean * 1.2 + Math.sin(ph * 2) * 0.05 * w);
    this.sway.vx += ((target - this.sway.x) * 60 - this.sway.vx * 7) * dt;
    this.sway.x += this.sway.vx * dt;
    const sx = Math.max(-0.6, Math.min(0.6, this.sway.x));
    bn.braid1.rotation.set(sx * 0.7 - bn.chest.rotation.x * 0.0 - lean * 0.8, Math.sin(ph) * 0.05 * w, Math.sin(ph) * 0.06 * w);
    bn.braid2.rotation.set(sx * 0.6, 0, -Math.sin(ph) * 0.08 * w);
    bn.braid3.rotation.set(sx * 0.5, 0, Math.sin(ph - 0.6) * 0.1 * w);
    bn.cloak1.rotation.set(sx * 0.8 + lean * 0.3, 0, Math.sin(ph) * 0.03 * w);
    bn.cloak2.rotation.set(sx * 0.9, 0, Math.sin(ph - 0.5) * 0.05 * w);
    // lean for the whole rig (a hint more at speed)
    this.rig.position.y = 0;
    this._expression(dt);
  }

  /** Lower or raise the cane arm so the tip just touches the floor (one correction step; the arm is the only thing that moves). */
  _caneFix() {
    const bn = this.bones;
    this.group.updateMatrixWorld(true);
    const tip = this._tip.set(...this.cane.tipLocal).applyMatrix4(bn.handR.matrixWorld);
    this.group.worldToLocal(tip);
    const sh = this.bindPos.uarmR, rel = Math.max(0.35, Math.abs(tip.z - sh[2]));
    const d = Math.max(-0.5, Math.min(0.5, -(tip.y - 0.015) / rel));
    bn.uarmR.rotation.x += d;
  }

  _gestures(dt) {
    const gs = this.gest, G = GESTURES;
    if (gs.forced && this.t > gs.until) { gs.forced = false; gs.name = 'rest'; gs.tgt = G.rest.slice(); gs.next = this.t + 0.8; }
    if (!gs.forced) {
      if (this.talking && this.t > gs.next) {
        const pool = this.gestures, pick = Math.random() < 0.18 ? 'rest' : pool[Math.floor(Math.random() * pool.length)];
        gs.name = pick; gs.tgt = G[pick].slice(); gs.next = this.t + 0.9 + Math.random() * 1.6;
      } else if (!this.talking && gs.name !== 'rest' && this.t > gs.next) { gs.name = 'rest'; gs.tgt = G.rest.slice(); }
    }
    const osc = OSC[gs.name];
    for (let i = 0; i < 6; i++) {
      let v = gs.tgt[i];
      if (osc && (i === 0 || i === 3 || i === 2 || i === 5)) v += Math.sin(this.t * osc[1] + i) * osc[0] * (i === 2 || i === 5 ? 1 : 0.4);
      gs.cur[i] = ease(gs.cur[i], v, dt * 7);
    }
  }

  // ------------------------------------------------------------------ baking for bystanders
  _resetBones() {
    for (const n of BONES) { const b = this.bones[n]; b.rotation.set(0, 0, 0); }
    const P = this.bindPos;
    for (const n of BONES) { const par = parentOf(n), pp = par ? P[par] : [0, 0, 0]; this.bones[n].position.set(P[n][0] - pp[0], P[n][1] - pp[1], P[n][2] - pp[2]); }
  }

  /** Pose and bake. pose: { armR, armL (shoulder flexion), armRz, armLz, foreR, foreL, legs:'stand'|'sit', mood, lookYaw, head, lean }. Returns { body, face } in the group's current world pose. */
  toStaticParts(pose = {}) {
    this._resetBones();
    const bn = this.bones, D = this.D;
    const rx = pose.armR ?? 0.05, lx = pose.armL ?? 0.05;
    bn.uarmR.rotation.set(rx, 0, pose.armRz ?? 0.1); bn.uarmL.rotation.set(lx, 0, pose.armLz ?? -0.1);
    bn.farmR.rotation.set(pose.foreR ?? (0.2 + Math.max(0, rx) * 0.9), 0, 0); bn.farmL.rotation.set(pose.foreL ?? (0.2 + Math.max(0, lx) * 0.9), 0, 0);
    bn.handR.rotation.x = 0.05; bn.handL.rotation.x = 0.05;
    const sit = pose.legs === 'sit';
    if (sit) {
      bn.thighL.rotation.set(1.5, 0.1, 0.05); bn.thighR.rotation.set(1.5, -0.1, -0.05); bn.shinL.rotation.x = -1.5; bn.shinR.rotation.x = -1.5;
      bn.footL.rotation.x = 0; bn.footR.rotation.x = 0;
      bn.hips.position.y = D.ankleY + (D.hipY - D.ankleY) * 0.0 + D.kneeY * 0.0 + (D.kneeY - D.ankleY) + 0.03;
    } else {
      bn.thighL.rotation.set(pose.legL ?? 0.0, 0, 0.03); bn.thighR.rotation.set(pose.legR ?? 0.0, 0, -0.03);
      if (pose.legL) bn.shinL.rotation.x = -Math.max(0, pose.legL) * 0.5;
      if (pose.legR) bn.shinR.rotation.x = -Math.max(0, pose.legR) * 0.5;
    }
    bn.spine.rotation.x = pose.lean ?? -0.01; bn.chest.rotation.x = (pose.lean ?? -0.01) * 0.6;
    bn.head.rotation.set(pose.head ?? 0, pose.lookYaw ?? 0, 0); bn.neck.rotation.y = (pose.lookYaw ?? 0) * 0.3;
    const mood = pose.mood ?? this.mood;
    this._cellName = null; this._setCell(mood);
    this.group.updateMatrixWorld(true);
    // CPU skinning
    const g = this.body.geometry, pos = g.attributes.position, si = g.attributes.skinIndex, sw = g.attributes.skinWeight, col = g.attributes.color;
    const mats = this.skeleton.bones.map((b, i) => new THREE.Matrix4().multiplyMatrices(b.matrixWorld, this.skeleton.boneInverses[i]));
    const out = new Float32Array(pos.count * 3), v = new THREE.Vector3(), r = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i); r.set(0, 0, 0);
      for (let k = 0; k < 4; k++) { const wgt = sw.getComponent(i, k); if (wgt > 0) r.addScaledVector(_v.copy(v).applyMatrix4(mats[si.getComponent(i, k)]), wgt); }
      out[i * 3] = r.x; out[i * 3 + 1] = r.y; out[i * 3 + 2] = r.z;
    }
    const body = new THREE.BufferGeometry();
    body.setAttribute('position', new THREE.BufferAttribute(out, 3));
    body.setAttribute('color', col.clone());
    body.setIndex(g.index.clone());
    body.computeVertexNormals();
    // face patch in world pose
    const fg = this.facePatch.geometry.clone();
    this.face.updateMatrixWorld(true);
    fg.applyMatrix4(this.face.matrixWorld);
    this._cellName = null;
    return { body, face: fg };
  }

  toStaticGeometry(armPose = {}) { return this.toStaticParts(armPose).body; }

  dispose() { this.facePatch.geometry.dispose(); this.skeleton.dispose?.(); }
}

export function buildCharacter(spec, game) { return new Character(spec, game); }
export const buildMithi = (game) => buildCharacter(MITHI, game);
export const buildSetu = (game) => buildCharacter(SETU, game);

/** Merge baked { body, face } pairs into one body geometry and one face geometry (for groups of bystanders). */
export function mergeStatic(list, keep = false) {
  const bodies = list.map((p) => p.body), faces = list.map((p) => p.face);
  const body = mergeGeometries(bodies, false), face = mergeGeometries(faces, false);
  if (!keep) { bodies.forEach((g) => g.dispose()); faces.forEach((g) => g.dispose()); }
  return { body, face };
}
