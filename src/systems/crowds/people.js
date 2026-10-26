// The crowd's bodies (Phase 8D): instanced, baked from the cast's character builder (see bake.js), walked by the vertex shader.
//
// What a pedestrian is. One of 8 bodies (a man in shirt and trousers, a man in a kurta, a woman in a sari, a woman in salwar kameez with
// a dupatta, an older man in a lungi, a child, a rescue worker in hi-vis, a well-dressed L3 resident), drawn near as an InstancedMesh per
// body (about 1,800 to 2,500 triangles, smooth limbs, hands, hair, a painted face) and far as one of 4 coarser meshes (about 400 triangles).
// Per instance: a transform (position, yaw, height and build), `aAnim` (walk phase, amplitude, pose, flags/hair), the clothing colours
// (`aPalA/B/C`: skin, top, bottom, accent) and the face cell. The shader recolours the baked marker colours, swings the same bones as the
// cast's walk (hips, thighs, shins, feet, shoulders, elbows, spine, trailing cloth and braid), with a bob and a sway, and projects the
// face atlas onto the head.
//
//   attributes per instance (InstancedBufferAttribute): aAnim vec4 (phase, amplitude 0..1, pose 0 stand | 1 sit | 2 hang from a grip | 3 talk,
//     flags: bit 0 umbrella, bits 1..3 hair colour), aPalA vec4 (skin rgb, top r), aPalB vec4 (top gb, bottom rg), aPalC vec4 (bottom b, accent rgb),
//     aFace vec2 (atlas cell)
// Style: skin tones, clothing and accent palettes come from `game.characterStyle` (Phase 8C) when it exists, else the defaults below.
import * as THREE from '../../../vendor/three.module.js';
import { bakeVariant, bakeFar, VARIANTS } from './bake.js';

export const DEFAULT_STYLE = Object.freeze({
  skinTones: [0x8d5a3b, 0xa06f4b, 0xb98660, 0x7a4f35, 0xc79068, 0x6a4230, 0x5c3a28],
  shirts: [0x7a8a9a, 0xb8b0a0, 0x8a4a3a, 0x4a6a5a, 0xc8b878, 0x6a6a8a, 0xa05a3a, 0x3a4a5a, 0xd8d4c8, 0x9a7a4a, 0x5a7a8a],
  trousers: [0x2a2a30, 0x3a3a44, 0x5a4a3a, 0x20262a, 0xcfcab8, 0x4a4a52, 0x6a5a48],
  saris: [0xc03a5a, 0xd88a2a, 0x3a7a6a, 0x6a3a8a, 0xb83a2a, 0x2a5a9a, 0xe0c040, 0x8aa83a, 0xd86a8a, 0x4a8aa8],
  blouses: [0x2a2a30, 0xd8d0c0, 0x8a2a3a, 0x2a4a6a, 0xe8b838],
  accents: [0x18181c, 0x18181c, 0x18181c, 0x28282e, 0xb02a2a, 0x2a5aa8, 0xd8b82a, 0x2a8a5a, 0xc83a7a, 0xe86a2a],
  rich: [0xe8e4d8, 0xd8c890, 0xa8b8c8, 0xc8a8b8, 0x8ac0b0, 0xe0d0a0, 0xf0ece0],
});

/** The mid-distance mesh that draws each body (a coarser bake shared by like silhouettes). Beyond that, one tiny mesh draws everybody. */
export const MID_GROUP = { shirt: 'shirt', worker: 'shirt', rich: 'shirt', child: 'shirt', lungi: 'shirt', kurta: 'kurta', sari: 'sari', salwar: 'salwar' };
export const MID_GROUPS = ['shirt', 'kurta', 'sari', 'salwar'];
/** Bodies in a long garment (the far mesh shows a skirt for them instead of legs): aAnim.w bit 4. */
export const ROBED = new Set(['kurta', 'sari', 'salwar', 'lungi']);
const STRIDE = { sari: 0.72, salwar: 0.9, kurta: 0.92 };

// ------------------------------------------------------------------------------------------ the shader
const VERT_DECL = `
attribute vec4 aBone; attribute vec4 aAnim; attribute vec4 aPalA; attribute vec4 aPalB; attribute vec4 aPalC; attribute vec2 aFace;
uniform vec4 uPiv; uniform vec2 uWalk;
#ifdef FACE
varying vec2 vFaceUv; varying float vFaceW; varying vec2 vFaceCell;
#endif
const vec3 HAIRS[6] = vec3[6]( vec3( 0.006, 0.005, 0.005 ), vec3( 0.022, 0.011, 0.007 ), vec3( 0.05, 0.03, 0.018 ), vec3( 0.30, 0.29, 0.28 ), vec3( 0.14, 0.05, 0.025 ), vec3( 0.62, 0.6, 0.56 ) );
vec3 gP; vec3 gN;
float gThL, gThR, gFxL, gFxR, gArmL, gArmR, gElL, gElR, gLean, gYawUp, gSway;
void rotX( float y0, float a ) {
  float c = cos( a ), s = sin( a );
  float py = gP.y - y0;
  gP.y = y0 + py * c - gP.z * s; gP.z = py * s + gP.z * c;
  float ny = gN.y;
  gN.y = ny * c - gN.z * s; gN.z = ny * s + gN.z * c;
}
void rotY( float a ) {
  float c = cos( a ), s = sin( a );
  gP.xz = vec2( gP.x * c + gP.z * s, - gP.x * s + gP.z * c );
  gN.xz = vec2( gN.x * c + gN.z * s, - gN.x * s + gN.z * c );
}
void upperT() { rotX( uPiv.x, gLean ); rotY( gYawUp ); }
void applyBone( float b ) {
  if ( b < 0.5 ) return;                                         // hips
  if ( b < 4.5 ) {                                               // thigh, shin
    bool left = b < 2.5, thigh = ( b < 1.5 ) || ( b > 2.5 && b < 3.5 );
    float th = left ? gThL : gThR, fx = left ? gFxL : gFxR;
    if ( ! thigh ) rotX( uPiv.y, - fx );
    rotX( uPiv.x, th );
  } else if ( b < 8.5 ) {                                        // upper arm, forearm (and hand)
    bool left = b < 6.5, fore = ( b > 5.5 && b < 6.5 ) || b > 7.5;
    float a = left ? gArmL : gArmR, e = left ? gElL : gElR;
    if ( fore ) rotX( uWalk.y, e );
    rotX( uPiv.w, a );
    upperT();
  } else if ( b < 10.5 ) {                                       // feet
    bool left = b < 9.5;
    float th = left ? gThL : gThR, fx = left ? gFxL : gFxR;
    rotX( uPiv.z, - ( th - fx ) * 0.9 );
    rotX( uPiv.y, - fx );
    rotX( uPiv.x, th );
  } else if ( b < 11.5 ) {                                       // spine, chest, neck, head
    upperT();
  } else {                                                       // trailing cloth, the braid
    rotX( uPiv.w, gSway );
    upperT();
  }
}`;

const FRAG_DECL = `
#ifdef FACE
uniform sampler2D uFace; uniform vec2 uCell;
varying vec2 vFaceUv; varying float vFaceW; varying vec2 vFaceCell;
#endif`;

const COLOR_CHUNK = `
{
  float cl = aBone.w;
  float hi = mod( floor( aAnim.w / 2.0 ), 8.0 );
  vec3 skin = aPalA.rgb, topc = vec3( aPalA.w, aPalB.x, aPalB.y ), botc = vec3( aPalB.z, aPalB.w, aPalC.x ), acc = aPalC.yzw;
  vec3 pal = skin;
  if ( cl > 5.5 ) pal = mix( vec3( 0.014, 0.011, 0.009 ), botc * 0.25, 0.4 );
  else if ( cl > 4.5 ) pal = HAIRS[ int( min( hi, 5.0 ) ) ];
  else if ( cl > 3.5 ) pal = acc;
  else if ( cl > 2.5 ) pal = botc;
  else if ( cl > 1.5 ) pal = topc;
  vColor = cl < 0.5 ? color : pal * color.r;
}`;

const NORMAL_CHUNK = `
vec3 objectNormal = vec3( normal );
vec3 skP = position;
{
  float ph = aAnim.x, w = aAnim.y, pose = aAnim.z, fl = aAnim.w;
  float umb = mod( fl, 2.0 );
  float sit = step( 0.5, pose ) * ( 1.0 - step( 1.5, pose ) );
  float hang = step( 1.5, pose ) * ( 1.0 - step( 2.5, pose ) );
  float talk = step( 2.5, pose );
  float A = 0.44 * w * uWalk.x, K = 0.34 * w;
  float s0 = sin( ph ), c0 = cos( ph + 0.2 );
  gThL = A * s0; gThR = - A * s0;
  gFxL = K * max( c0, 0.0 ) * max( c0, 0.0 ) + 0.06 * w; gFxR = K * max( - c0, 0.0 ) * max( - c0, 0.0 ) + 0.06 * w;
  gThL = mix( gThL, 1.5, sit ); gThR = mix( gThR, 1.5, sit ); gFxL = mix( gFxL, 1.5, sit ); gFxR = mix( gFxR, 1.5, sit );
  float armA = A * 0.62;
  gArmL = - s0 * armA; gArmR = s0 * armA;
  gElL = 0.16 + 0.09 * w + 0.9 * max( gArmL, 0.0 ); gElR = 0.16 + 0.09 * w + 0.9 * max( gArmR, 0.0 );
  float ts = sin( ph * 3.1 ), tc = sin( ph * 2.3 + 1.0 );
  gArmR = mix( gArmR, 0.7 + 0.18 * ts, talk ); gElR = mix( gElR, 1.15 + 0.25 * tc, talk );
  gArmL = mix( gArmL, 0.12 + 0.05 * tc, talk );
  gArmL = mix( gArmL, 0.35, sit ); gArmR = mix( gArmR, 0.35, sit ); gElL = mix( gElL, 1.1, sit ); gElR = mix( gElR, 1.1, sit );
  gArmR = mix( gArmR, 2.85, hang ); gElR = mix( gElR, 0.3, hang );
  float um = umb * ( 1.0 - hang ) * ( 1.0 - sit );
  gArmR = mix( gArmR, 0.5, um ); gElR = mix( gElR, 2.05, um );
  gLean = - 0.05 * w - 0.03 * sit;
  float yaw = s0 * 0.13 * w;
  gYawUp = 1.5 * yaw;
  gSway = - ( 0.06 + 0.16 * w ) + 0.08 * w * sin( 2.0 * ph - 0.6 );
  float tl = uPiv.x - uPiv.y, sl = uPiv.y - uPiv.z;
  float dyL = tl * cos( gThL ) + sl * cos( gThL - gFxL ), dyR = tl * cos( gThR ) + sl * cos( gThR - gFxR );
  float drop = tl + sl - max( dyL, dyR );
  gP = position; gN = objectNormal; applyBone( aBone.x );
  vec3 pa = gP, na = gN;
  if ( aBone.z > 0.001 ) { gP = position; gN = objectNormal; applyBone( aBone.y ); pa = mix( pa, gP, aBone.z ); na = mix( na, gN, aBone.z ); }
  gP = pa; gN = normalize( na );
  rotY( - 0.7 * yaw );
  skP = gP + vec3( s0 * 0.012 * w, - drop, 0.0 );
  objectNormal = gN;
#ifdef FARM
  float robe = mod( floor( fl / 16.0 ), 2.0 );
  if ( uv.x > - 2.5 && uv.x < - 1.5 ) { if ( robe < 0.5 ) skP = vec3( 0.0, uPiv.x, 0.0 ); }
  else if ( uv.x > - 1.5 && uv.x < - 0.5 ) { if ( robe > 0.5 ) skP = vec3( 0.0, uPiv.x, 0.0 ); }
#endif
}`;

const BEGIN_CHUNK = `
vec3 transformed = skP;
#ifdef FACE
vFaceUv = uv; vFaceW = clamp( - normal.z * 3.0 - 0.4, 0.0, 1.0 ) * step( - 5.0, uv.x ); vFaceCell = aFace;
#endif`;

const FACE_FRAG = `
#include <color_fragment>
#ifdef FACE
{
  vec2 fu = vFaceUv;
  float inside = step( 0.0, fu.x ) * step( fu.x, 1.0 ) * step( 0.0, fu.y ) * step( fu.y, 1.0 );
  vec4 fc = texture2D( uFace, vFaceCell + fu * uCell );
  diffuseColor.rgb = mix( diffuseColor.rgb, fc.rgb, fc.a * inside * vFaceW );
}
#endif`;

/**
 * One material per body (the program is shared, the uniforms are the body's pivots).
 * opts: { face: atlas|null, pivots: [hipY, kneeY, ankleY, shoulderY, elbowY], stride }
 */
export function makePersonMaterial(game, opts) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: new THREE.Color(0x2c3238) });
  const [hip, knee, ankle, shoulder, elbow] = opts.pivots;
  const u = { uPiv: { value: new THREE.Vector4(hip, knee, ankle, shoulder) }, uWalk: { value: new THREE.Vector2(opts.stride ?? 1, elbow) } };
  if (opts.face) { u.uFace = { value: opts.face.texture }; u.uCell = { value: new THREE.Vector2(...opts.face.size) }; }
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = (opts.face ? '#define FACE\n' : '') + (opts.far ? '#define FARM\n' : '') + shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + VERT_DECL)
      .replace('#include <color_vertex>', COLOR_CHUNK)
      .replace('#include <beginnormal_vertex>', NORMAL_CHUNK)
      .replace('#include <begin_vertex>', BEGIN_CHUNK);
    shader.fragmentShader = (opts.face ? '#define FACE\n' : '') + shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + FRAG_DECL)
      .replace('#include <color_fragment>', FACE_FRAG);
  };
  m.customProgramCacheKey = () => 'crowd-person-2' + (opts.face ? 'f' : opts.far ? 'x' : 'n');
  game?.materials?.all?.push(m);
  return m;
}

/** Per-instance attributes for `cap` people on a geometry (each mesh owns its own). */
export function addInstanceAttributes(geo, cap) {
  const mk = (n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(cap * n), n); a.setUsage(THREE.DynamicDrawUsage); return a; };
  const at = { aAnim: mk(4), aPalA: mk(4), aPalB: mk(4), aPalC: mk(4), aFace: mk(2) };
  for (const [k, a] of Object.entries(at)) geo.setAttribute(k, a);
  return at;
}

/** An umbrella held over the right shoulder: a canopy, a pole, drawn with the person's own transform. */
export function makeUmbrellaGeometry() {
  const canopy = new THREE.ConeGeometry(0.56, 0.2, 10, 1, true).toNonIndexed();
  canopy.translate(0.14, 2.04, -0.2);
  const pole = new THREE.CylinderGeometry(0.011, 0.011, 0.95, 5, 1, true).toNonIndexed();
  pole.translate(0.26, 1.64, -0.25);
  const g = [canopy, pole].map((x, i) => {
    x.deleteAttribute('uv');
    const n = x.attributes.position.count, c = new Float32Array(n * 3).fill(i ? 0.1 : 1);
    x.setAttribute('color', new THREE.BufferAttribute(c, 3));
    return x;
  });
  const merged = new THREE.BufferGeometry();
  const P = [], N = [], C = [];
  for (const x of g) { x.computeVertexNormals(); P.push(...x.attributes.position.array); N.push(...x.attributes.normal.array); C.push(...x.attributes.color.array); }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  merged.computeBoundingSphere();
  return merged;
}

/**
 * Build every mesh of the crowd's people: 8 near bodies, 4 mid groups, 1 far mesh, the umbrellas. Returns plain records the system fills each frame.
 *   { near: { [variant]: { mesh, at, cap, n, dims, pivots, tris } }, mid: { [group]: {...} }, far: {...}, umbrella: { mesh, cap, n }, tris }
 */
export function buildPeople(game, scene, atlas, caps) {
  const out = { near: {}, mid: {}, tris: {}, atlas };
  for (const key of VARIANTS) {
    const b = bakeVariant(key, 'high'), cap = caps.near;
    const mat = makePersonMaterial(game, { face: atlas, pivots: b.pivots, stride: STRIDE[key] });
    const at = addInstanceAttributes(b.geometry, cap);
    const mesh = new THREE.InstancedMesh(b.geometry, mat, cap);
    mesh.name = `crowd-near-${key}`; mesh.frustumCulled = false; mesh.count = 0; mesh.visible = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
    out.near[key] = { mesh, at, cap, n: 0, dims: b.dims, pivots: b.pivots, tris: b.tris, h0: b.dims.H };
    out.tris['near-' + key] = b.tris;
  }
  const mk = (b, name, cap, o) => {
    const mat = makePersonMaterial(game, { pivots: b.pivots, ...o });
    const at = addInstanceAttributes(b.geometry, cap);
    const mesh = new THREE.InstancedMesh(b.geometry, mat, cap);
    mesh.name = name; mesh.frustumCulled = false; mesh.count = 0; mesh.visible = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);
    out.tris[name] = b.tris;
    return { mesh, at, cap, n: 0, dims: b.dims, pivots: b.pivots, tris: b.tris, h0: b.dims.H };
  };
  out.mid = {};
  for (const key of MID_GROUPS) out.mid[key] = mk(bakeVariant(key, 'low'), `crowd-mid-${key}`, caps.mid, { stride: STRIDE[key] });
  out.far = mk(bakeFar(), 'crowd-far', caps.far, { far: true });
  const ug = makeUmbrellaGeometry();
  const umat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, emissive: new THREE.Color(0x14181c) });
  game?.materials?.all?.push(umat);
  const umesh = new THREE.InstancedMesh(ug, umat, caps.umbrella);
  umesh.name = 'crowd-umbrellas'; umesh.frustumCulled = false; umesh.count = 0; umesh.visible = false;
  umesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  umesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(caps.umbrella * 3), 3);
  scene.add(umesh);
  out.umbrella = { mesh: umesh, cap: caps.umbrella, n: 0 };
  return out;
}
