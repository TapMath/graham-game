// Materials for the greenery: Lambert (so the scene's light, fog and Mithi's senses patch all apply), with one shader hook:
//   vertex   wind sway: world-space gust plus per-vertex flutter, scaled by the vertex weight aMisc.x (0 trunk .. 1 leaf tip)
//   fragment sunlight shafts catch the leaves (warm lift where a shaft passes through them), emissive irrigation lines and lamps
//            (aMisc.z = 1), and foliage uplit by garden lights at night (aMisc.z = 2)
// Time of day arrives through `uniforms` (uNight, uSun), set by greenery.js from sky:time.
import * as THREE from '../../../vendor/three.module.js';

const MAX_SHAFTS = 16;

export function leafTexture() {
  const n = 256, c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d');
  let s = 4242; const R = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  g.fillStyle = '#2a5a2c'; g.fillRect(0, 0, n, n);
  const greens = ['#3a7a36', '#4a8f3c', '#5aa444', '#6cb84c', '#80c855', '#3f8a46', '#52a055'];
  // wrap-around leaves: draw each leaf at its 9 tiled offsets so the texture repeats seamlessly
  const leaf = (x, y, w, h, a, col) => {
    for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) {
      g.save(); g.translate(x + ox, y + oy); g.rotate(a); g.fillStyle = col;
      g.beginPath(); g.moveTo(0, -h / 2); g.quadraticCurveTo(w, 0, 0, h / 2); g.quadraticCurveTo(-w, 0, 0, -h / 2); g.fill();
      g.strokeStyle = 'rgba(20,50,25,.55)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -h / 2); g.lineTo(0, h / 2); g.stroke();
      g.restore();
    }
  };
  for (let i = 0; i < 520; i++) leaf(R() * n, R() * n, 7 + R() * 9, 18 + R() * 20, R() * 6.28, greens[Math.floor(R() * greens.length)]);
  // a few blossoms (magenta, white, orange) so the wall is a garden, not just a hedge
  const flowers = ['#e0267c', '#f4eadc', '#f0742a', '#ffcf40'];
  for (let i = 0; i < 38; i++) {
    const x = R() * n, y = R() * n, col = flowers[Math.floor(R() * flowers.length)];
    for (const ox of [-n, 0, n]) for (const oy of [-n, 0, n]) { g.fillStyle = col; g.beginPath(); g.arc(x + ox, y + oy, 2.2 + R() * 1.6, 0, 6.3); g.fill(); }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

export function createUniforms() {
  const sh = new Float32Array(MAX_SHAFTS * 4), hh = new Float32Array(MAX_SHAFTS);
  return {
    uTime: { value: 0 }, uWind: { value: 1 }, uNight: { value: 0 }, uSun: { value: 1 },
    uShafts: { value: sh }, uShaftH: { value: hh }, uShaftN: { value: 0 }, uLean: { value: new THREE.Vector2(0.16, -0.05) },
  };
}

export function setShafts(U, shafts, lean) {
  const list = shafts.filter((s) => s.y0 >= 20).slice(0, MAX_SHAFTS);
  const a = U.uShafts.value, h = U.uShaftH.value;
  list.forEach((s, i) => { a[i * 4] = s.x; a[i * 4 + 1] = s.z; a[i * 4 + 2] = s.r; a[i * 4 + 3] = s.y0; h[i] = s.height; });
  U.uShaftN.value = list.length;
  U.uLean.value.set(lean.x, lean.z);
}

const VERT_DECL = `attribute vec3 aMisc;
uniform float uTime; uniform float uWind;
varying vec3 vGW; varying vec2 vGM;`;
const VERT_SWAY = `
vec3 transformed = vec3( position );
{
  float gw = aMisc.x * uWind;
  float ph = aMisc.y;
  float gust = 0.55 + 0.45 * sin( uTime * 0.31 + position.x * 0.045 + position.z * 0.03 );
  float s1 = sin( uTime * 1.35 + ph + position.x * 0.25 );
  float s2 = sin( uTime * 2.7 + ph * 1.9 + position.z * 0.35 );
  float fl = sin( uTime * 6.1 + ph * 3.1 + position.y * 2.3 );
  transformed.x += gw * ( 0.16 * gust * ( 0.6 + 0.4 * s1 ) + 0.030 * s2 );
  transformed.z += gw * ( 0.07 * gust * s2 + 0.025 * s1 );
  transformed.y += gw * ( 0.025 * s1 + 0.012 * fl );
  vGW = transformed; vGM = aMisc.yz;
}`;
const FRAG_DECL = `uniform float uNight; uniform float uSun; uniform vec4 uShafts[${MAX_SHAFTS}]; uniform float uShaftH[${MAX_SHAFTS}]; uniform int uShaftN; uniform vec2 uLean;
varying vec3 vGW; varying vec2 vGM;`;
const FRAG_EMIT = `
{
  float shaftK = 0.0;
  for ( int i = 0; i < ${MAX_SHAFTS}; i++ ) {
    if ( i >= uShaftN ) break;
    vec4 s = uShafts[ i ];
    float hy = vGW.y - s.w;
    if ( hy < -1.0 || hy > uShaftH[ i ] ) continue;
    vec2 c = s.xy + uLean * max( hy, 0.0 );
    float d = distance( vGW.xz, c );
    shaftK = max( shaftK, 1.0 - smoothstep( s.z * 0.55, s.z * 1.05, d ) );
  }
  float lit = shaftK * uSun;
  // the light that falls through the haze: leaves in a shaft go bright, warm and a little translucent
  totalEmissiveRadiance += diffuseColor.rgb * vec3( 1.5, 1.25, 0.55 ) * lit * 0.5 + vec3( 0.10, 0.075, 0.02 ) * lit;
  if ( vGM.y > 0.5 && vGM.y < 1.5 ) totalEmissiveRadiance += diffuseColor.rgb * ( 0.5 + 2.0 * uNight );
  if ( vGM.y > 1.5 ) totalEmissiveRadiance += diffuseColor.rgb * vec3( 1.0, 0.7, 0.38 ) * uNight * 0.62;
}`;

// the leaf texture is applied only where the vertices say so (glow kind 3, the green-wall panels), so one material serves every plant
const MAP_FRAG = `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  diffuseColor *= mix( vec4( 1.0 ), sampledDiffuseColor, step( 2.5, vGM.y ) );
#endif`;

/** One plant material. `map` is the leaf texture for the green-wall layer, null for plain vertex colour. */
export function makePlantMaterial(U, { map = null, name = 'plants' } = {}) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, map });
  m.name = name;
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, U);
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\n' + VERT_DECL).replace('#include <begin_vertex>', VERT_SWAY);
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\n' + FRAG_DECL).replace('#include <map_fragment>', MAP_FRAG)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + FRAG_EMIT);
  };
  m.customProgramCacheKey = () => 'greenery1';
  return m;
}
