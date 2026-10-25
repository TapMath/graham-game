// The crowd's body: one cheap low-poly person, drawn by the thousand as an InstancedMesh with the walk animated in the vertex shader.
//
// Two bodies (a man/boy in shirt and trousers, a woman/girl in a sari with a braid) share one material. Per-vertex attributes say what a
// vertex is (fixed colour / skin / shirt / trousers or sari / accent), which limb it belongs to and its pivot height; per-instance
// attributes carry the walk phase and amplitude, the pose (stand / sit / hang from a door) and the colours. Accessories (umbrella, cap, bag,
// a pot on the head) are always in the mesh and switched on per instance with a flag (the vertex shader collapses them otherwise).
//
//   const body = makePersonGeometry('man' | 'woman');   // origin at the feet, faces -Z, about 1.72 m tall
//   const mat = makePersonMaterial(game);
//   attributes per instance (InstancedBufferAttribute): aAnim vec4 (phase, amplitude 0..1, pose 0|1|2, flags bits 1 umbrella 2 cap 4 bag 8 head-load),
//                                                       aSkin, aCloth1, aCloth2, aAcc: vec3
// Style: skin tones, clothing and accent palettes come from `game.characterStyle` (Phase 8C) when it exists, else the defaults below.
import * as THREE from '../../../vendor/three.module.js';
import { mergeGeometries } from '../../../vendor/addons/utils/BufferGeometryUtils.js';

export const DEFAULT_STYLE = Object.freeze({
  skinTones: [0x8d5a3b, 0xa06f4b, 0xb98660, 0x7a4f35, 0xc79068, 0x6a4230, 0x5c3a28],
  shirts: [0x7a8a9a, 0xb8b0a0, 0x8a4a3a, 0x4a6a5a, 0xc8b878, 0x6a6a8a, 0xa05a3a, 0x3a4a5a, 0xd8d4c8, 0x9a7a4a, 0x5a7a8a],
  trousers: [0x2a2a30, 0x3a3a44, 0x5a4a3a, 0x20262a, 0xcfcab8, 0x4a4a52, 0x6a5a48],
  saris: [0xc03a5a, 0xd88a2a, 0x3a7a6a, 0x6a3a8a, 0xb83a2a, 0x2a5a9a, 0xe0c040, 0x8aa83a, 0xd86a8a, 0x4a8aa8],
  blouses: [0x2a2a30, 0xd8d0c0, 0x8a2a3a, 0x2a4a6a, 0xe8b838],
  accents: [0x18181c, 0x18181c, 0x18181c, 0x28282e, 0xb02a2a, 0x2a5aa8, 0xd8b82a, 0x2a8a5a, 0xc83a7a, 0xe86a2a],
  rich: [0xe8e4d8, 0xd8c890, 0xa8b8c8, 0xc8a8b8, 0x8ac0b0, 0xe0d0a0, 0xf0ece0],
});

const PART = { body: 0, legL: 1, legR: 2, armL: 3, armR: 4, umbrella: 5, cap: 6, bag: 7, load: 8 };
const MAT = { fixed: 0, skin: 1, cloth1: 2, cloth2: 3, accent: 4 };

class Mesher {
  constructor() { this.list = []; }
  box(w, h, d, x, y, z, { mat = MAT.fixed, color = 0xffffff, part = PART.body, pivotY = 0, rx = 0, rz = 0 } = {}) {
    return this.add(new THREE.BoxGeometry(w, h, d), x, y, z, { mat, color, part, pivotY, rx, rz });
  }
  cone(r0, r1, h, x, y, z, { seg = 7, mat, color, part, pivotY } = {}) {
    return this.add(new THREE.CylinderGeometry(r1, r0, h, seg, 1), x, y, z, { mat, color, part, pivotY });
  }
  add(g, x, y, z, { mat = MAT.fixed, color = 0xffffff, part = PART.body, pivotY = 0, rx = 0, rz = 0 }) {
    g = g.index ? g.toNonIndexed() : g;
    if (rx || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, 0, rz)));
    g.translate(x, y, z);
    g.deleteAttribute('uv');
    const n = g.attributes.position.count, c = new THREE.Color(color), col = new Float32Array(n * 3), m = new Float32Array(n), l = new Float32Array(n * 2);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; m[i] = mat; l[i * 2] = part; l[i * 2 + 1] = pivotY; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.setAttribute('aMat', new THREE.BufferAttribute(m, 1)); g.setAttribute('aLimb', new THREE.BufferAttribute(l, 2));
    g.computeVertexNormals();
    this.list.push(g);
    return this;
  }
  build() { const g = mergeGeometries(this.list, false); this.list.forEach((x) => x.dispose()); g.computeBoundingSphere(); return g; }
}

const HAIR = 0x16110e, CAPC = 0xe8e4d4, BAG = 0x6a5238;

export function makePersonGeometry(kind = 'man') {
  const M = new Mesher(), HIP = 0.86, SH = 1.38;
  const woman = kind === 'woman';
  if (!woman) {                                                                                                         // legs (a woman's are hidden by the sari)
    for (const [s, part] of [[-1, PART.legL], [1, PART.legR]]) M.box(0.14, 0.86, 0.17, s * 0.095, 0.43, 0, { mat: MAT.cloth2, part, pivotY: HIP });
  } else {
    M.box(0.4, 0.84, 0.27, 0, 0.44, 0, { mat: MAT.cloth2 });                                                            // the sari, to the ankles
    M.box(0.43, 0.06, 0.29, 0, 0.1, 0, { mat: MAT.accent });                                                            // its border
  }
  M.box(0.4, 0.62, 0.22, 0, HIP + 0.31 - (woman ? 0 : 0.05), 0, { mat: MAT.cloth1 });                                    // torso
  for (const [s, part] of [[-1, PART.armL], [1, PART.armR]]) M.box(0.09, 0.6, 0.1, s * 0.26, SH - 0.3, 0, { mat: MAT.skin, part, pivotY: SH });
  M.box(0.2, 0.28, 0.21, 0, 1.56, 0, { mat: MAT.skin });                                                                // head + neck
  M.box(0.225, 0.15, 0.25, 0, 1.69, 0.02, { color: HAIR });                                                              // hair: the top and the back of the head
  if (woman) M.box(0.07, 0.5, 0.07, 0, 1.28, 0.15, { color: HAIR });                                                      // the braid
  // accessories (flags: 1 umbrella, 2 cap, 4 shoulder bag, 8 pot on the head); open-ended cones: no caps to draw
  M.add(new THREE.ConeGeometry(0.62, 0.2, 8, 1, true), 0, 2.0, 0, { mat: MAT.accent, part: PART.umbrella });
  M.box(0.22, 0.07, 0.23, 0, 1.745, 0, { color: CAPC, part: PART.cap });
  M.box(0.2, 0.22, 0.09, 0.22, 0.96, 0.02, { color: BAG, part: PART.bag });
  M.add(new THREE.CylinderGeometry(0.17, 0.12, 0.22, 6, 1, true), 0, 1.84, 0, { mat: MAT.accent, part: PART.load });
  return M.build();
}

const VERT_DECL = `
attribute float aMat; attribute vec2 aLimb;
attribute vec4 aAnim; attribute vec3 aSkin; attribute vec3 aCloth1; attribute vec3 aCloth2; attribute vec3 aAcc;`;
const COLOR_CHUNK = `
#include <color_vertex>
{ float pm = aMat;
  vColor = pm < 0.5 ? color : ( pm < 1.5 ? aSkin : ( pm < 2.5 ? aCloth1 : ( pm < 3.5 ? aCloth2 : aAcc ) ) ); }`;
const BEGIN_CHUNK = `
vec3 transformed = vec3( position );
{
  float ph = aAnim.x, amp = aAnim.y, pose = aAnim.z, fl = aAnim.w, part = aLimb.x;
  float f1 = mod( fl, 2.0 ), f2 = mod( floor( fl / 2.0 ), 2.0 ), f4 = mod( floor( fl / 4.0 ), 2.0 ), f8 = mod( floor( fl / 8.0 ), 2.0 );
  float sit = step( 0.5, pose ) * step( pose, 1.5 ), hang = step( 1.5, pose );
  if ( part > 4.5 ) {
    float vis = part < 5.5 ? f1 : ( part < 6.5 ? f2 : ( part < 7.5 ? f4 : f8 ) );
    if ( vis < 0.5 ) transformed = vec3( 0.0 );
  } else if ( part > 0.5 ) {
    bool leg = part < 2.5;
    float sgn = leg ? ( part < 1.5 ? 1.0 : -1.0 ) : ( part < 3.5 ? -1.0 : 1.0 );
    float ang = sin( ph ) * ( leg ? 0.62 : 0.48 ) * amp * sgn;
    if ( leg ) ang += 1.45 * sit;
    else { ang += sit * 0.5; if ( part > 3.5 ) ang = mix( ang, 2.85, hang ); }
    float c = cos( ang ), s = sin( ang );
    vec3 d = transformed - vec3( 0.0, aLimb.y, 0.0 );
    transformed = vec3( 0.0, aLimb.y, 0.0 ) + vec3( d.x, d.y * c - d.z * s, d.y * s + d.z * c );
  }
  transformed.y += abs( sin( ph ) ) * 0.03 * amp - 0.46 * sit;
}`;

/** The one material of the crowd (Lambert, flat shaded, a little emissive so they read in the gloom). */
export function makePersonMaterial(game) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: new THREE.Color(0x2c3238) });
  m.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_DECL)
      .replace('#include <color_vertex>', COLOR_CHUNK)
      .replace('#include <begin_vertex>', BEGIN_CHUNK);
  };
  m.customProgramCacheKey = () => 'crowd-person-1';
  game.materials?.all?.push(m);
  return m;
}

/** Per-instance attributes for `cap` people, attached to a (cloned-attribute) geometry so each mesh owns its own. */
export function addInstanceAttributes(geo, cap) {
  const mk = (n) => new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n);
  const at = { aAnim: mk(4), aSkin: mk(3), aCloth1: mk(3), aCloth2: mk(3), aAcc: mk(3) };
  for (const [k, a] of Object.entries(at)) { a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(k, a); }
  return at;
}
