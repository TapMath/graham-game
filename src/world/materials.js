// Shared materials and procedural textures (no external files).
// All world meshes use these so the Sing shader patch (Phase 5) can hook every material in one
// place: iterate `materials.all` and patch onBeforeCompile.
//
// The senses patch (Phase 5): `createSenseUniforms()` makes ONE set of shared uniforms (echolocation pulse and
// Mithi's perception grade); `patchSenseMaterial(mat, uniforms)` chains an `onBeforeCompile` onto any lit/unlit
// mesh material, preserving whatever hook it already had. Every material in `materials.all` is patched when
// it is created; the senses system (`game.senses.patchMaterial(mat)`) patches the rest of the scene.
import * as THREE from '../../vendor/three.module.js';

/** Shared uniforms of the senses patch. One object, referenced by every patched material. */
export function createSenseUniforms() {
  return {
    uPulseOrigin: { value: new THREE.Vector3(0, -1000, 0) },
    uPulseRadius: { value: 0 },          // metres, the leading edge of the echolocation wave
    uPulseStrength: { value: 0 },        // 0 = off (the shader skips all of it)
    uPulseBand: { value: 2.2 },          // half width of the bright band, metres
    uPulseColor: { value: new THREE.Color(0.62, 0.86, 1.0) },
    uSenseSat: { value: 1 },             // Mithi's perception: saturation 0..1 (1 = untouched)
    uSenseDim: { value: 1 },             // and brightness multiplier
  };
}

const SENSE_VERT_DECL = 'varying vec3 vSenseW;';
const SENSE_VERT = `
{
  vec4 senseP = vec4( transformed, 1.0 );
  #ifdef USE_INSTANCING
  senseP = instanceMatrix * senseP;
  #endif
  vSenseW = ( modelMatrix * senseP ).xyz;
}`;
const SENSE_FRAG_DECL = `varying vec3 vSenseW;
uniform vec3 uPulseOrigin; uniform float uPulseRadius; uniform float uPulseStrength; uniform float uPulseBand;
uniform vec3 uPulseColor; uniform float uSenseSat; uniform float uSenseDim;`;
// Added after the fog, so the wave lights geometry even where the (short) fog has swallowed it.
const SENSE_FRAG = `
{
  float senseL = dot( gl_FragColor.rgb, vec3( 0.299, 0.587, 0.114 ) );
  gl_FragColor.rgb = mix( vec3( senseL ), gl_FragColor.rgb, uSenseSat ) * uSenseDim;
  if ( uPulseStrength > 0.002 ) {
    float sd = distance( vSenseW, uPulseOrigin );
    float rel = uPulseRadius - sd;                       // > 0 behind the front
    float band = uPulseBand;
    float front = exp( -( rel * rel ) / ( band * band ) );
    float wake = rel > 0.0 ? exp( -rel / ( band * 9.0 ) ) * 0.55 : 0.0;
    vec3 sdx = dFdx( vSenseW ), sdy = dFdy( vSenseW );
    vec3 sn = normalize( cross( sdx, sdy ) + vec3( 1e-9 ) );
    vec3 sp = vSenseW * 0.5;                             // a 2 m scan grid on the surfaces
    vec3 sq = 0.5 - abs( fract( sp ) - 0.5 );
    vec3 saa = fwidth( sp ) * 1.3 + vec3( 1e-4 );
    vec3 sline = ( 1.0 - smoothstep( vec3( 0.0 ), saa, sq ) ) * ( 1.0 - step( vec3( 0.72 ), abs( sn ) ) );
    float grid = max( max( sline.x, sline.y ), sline.z );
    float edge = clamp( length( fwidth( sn ) ) * 2.5, 0.0, 1.0 );
    float core = exp( -( rel * rel ) / ( band * band * 0.1 ) );     // a thin white-hot line riding the soft band
    float k = front * ( 0.45 + 0.9 * grid + 1.3 * edge ) + core * ( 0.55 + 0.7 * grid + 0.5 * edge ) + wake * ( 0.45 * grid + 0.9 * edge );
    k *= uPulseStrength * ( 1.0 - smoothstep( 0.0, 1.0, sd / 90.0 ) * 0.35 );
    gl_FragColor.rgb += uPulseColor * k;
  }
}`;

/**
 * Chain the senses shader patch onto a material's onBeforeCompile (keeps any hook it already had). Works for
 * Lambert, Basic, Phong and Standard materials, instanced or not. Additive/glow decals are left alone.
 */
export function patchSenseMaterial(mat, uniforms) {
  if (!mat || mat.userData?.sensePatched) return mat;
  if (!(mat.isMeshLambertMaterial || mat.isMeshBasicMaterial || mat.isMeshStandardMaterial || mat.isMeshPhongMaterial)) return mat;
  if (mat.blending === THREE.AdditiveBlending) return mat;
  mat.userData = mat.userData || {};
  mat.userData.sensePatched = true;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = function (shader, renderer) {
    if (prev) prev.call(this, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\n' + SENSE_VERT_DECL)
      .replace('#include <project_vertex>', '#include <project_vertex>\n' + SENSE_VERT);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + SENSE_FRAG_DECL)
      .replace('#include <dithering_fragment>', '#include <dithering_fragment>\n' + SENSE_FRAG);
  };
  const prevKey = mat.customProgramCacheKey;
  mat.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + '|sense1'; };
  mat.needsUpdate = true;
  return mat;
}

function canvasTexture(size, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Deterministic noise so textures look the same every run. */
function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

/** Mottled concrete with panel seams; one tile = TILE_METRES of surface. */
export const TILE_METRES = 4;
function concreteTexture() {
  return canvasTexture(256, (g, n) => {
    const rnd = lcg(7);
    g.fillStyle = '#b9b9b0'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 2600; i++) {
      const v = 150 + rnd() * 80;
      g.fillStyle = `rgba(${v},${v},${v - 6},${0.18 + rnd() * 0.25})`;
      g.fillRect(rnd() * n, rnd() * n, 1 + rnd() * 5, 1 + rnd() * 5);
    }
    g.strokeStyle = 'rgba(40,45,42,.55)'; g.lineWidth = 3;
    g.strokeRect(0, 0, n, n);
    g.strokeStyle = 'rgba(40,45,42,.18)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(n / 2, 0); g.lineTo(n / 2, n); g.moveTo(0, n / 2); g.lineTo(n, n / 2); g.stroke();
  });
}

/** Window grid for tower facades: white = lit. Used as the emissive map. */
export const WINDOW_TILE_METRES = 12;
function windowTexture() {
  return canvasTexture(128, (g, n) => {
    const rnd = lcg(31);
    g.fillStyle = '#000'; g.fillRect(0, 0, n, n);
    const cols = 6, rows = 6, cw = n / cols, rh = n / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (rnd() < 0.42) continue;
        const warm = 150 + rnd() * 105;
        g.fillStyle = `rgb(${warm},${warm * 0.8},${warm * 0.42})`;
        g.fillRect(c * cw + 3, r * rh + 4, cw - 6, rh - 9);
      }
    }
  });
}

export function createMaterials() {
  const concrete = concreteTexture();
  // Lit, vertex-coloured, flat-ish shading. The workhorse for static geometry.
  const lit = new THREE.MeshLambertMaterial({ vertexColors: true, map: concrete });
  // Unlit glowing things: lamps, strips, signs. Colour comes from vertex colours.
  const emissive = new THREE.MeshBasicMaterial({ vertexColors: true });
  // Tower facades: lit body plus lit windows through the emissive map.
  const building = new THREE.MeshLambertMaterial({
    vertexColors: true,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: windowTexture(),
    emissiveIntensity: 0.55,
  });
  // Window glow is tiered by height so the lower storeys read as dim teal and the upper ones as warm
  // ochre (the deck's gloom-below / haze-above look) without a shader patch: same texture, different
  // emissive colour and strength. Towers use buildingLow (< 18 m), buildingMid (18-34 m), building (> 34 m).
  const tier = (color, intensity) => new THREE.MeshLambertMaterial({ vertexColors: true, emissive: new THREE.Color(color), emissiveMap: building.emissiveMap, emissiveIntensity: intensity });
  const buildingLow = tier(0x8fd4c4, 0.28);
  const buildingMid = tier(0xffc890, 0.42);
  // Soft additive light pools on the floor (lamp pools, vendor and checkpoint glow): instanced, tinted per instance.
  const pc = document.createElement('canvas'); pc.width = pc.height = 64;
  const pg = pc.getContext('2d'), gr = pg.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.5, 'rgba(255,255,255,.45)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  pg.fillStyle = gr; pg.fillRect(0, 0, 64, 64);
  const poolTex = new THREE.CanvasTexture(pc); poolTex.colorSpace = THREE.SRGBColorSpace;
  const pool = new THREE.MeshBasicMaterial({ map: poolTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  // Stained-glass window bands for the elite towers: lancet (pointed-arch) windows in jewel colours, unlit.
  const gc = document.createElement('canvas'); gc.width = gc.height = 128;
  const gg = gc.getContext('2d'); gg.fillStyle = '#05060a'; gg.fillRect(0, 0, 128, 128);
  const jewels = ['#c0283a', '#e8a020', '#2a62c8', '#2aa060', '#8a2ab0', '#e8e0b8'];
  for (let i = 0; i < 2; i++) {
    const x0 = 6 + i * 62, w = 52;
    gg.save(); gg.beginPath(); gg.moveTo(x0, 122); gg.lineTo(x0, 52); gg.quadraticCurveTo(x0, 12, x0 + w / 2, 6); gg.quadraticCurveTo(x0 + w, 12, x0 + w, 52); gg.lineTo(x0 + w, 122); gg.closePath(); gg.clip();
    for (let k = 0; k < 14; k++) { gg.fillStyle = jewels[(k * 5 + i * 3) % 6]; gg.fillRect(x0 + (k % 3) * 18, 6 + Math.floor(k / 3) * 24, 18, 24); }
    gg.strokeStyle = '#05060a'; gg.lineWidth = 2.5; for (let k = 1; k < 3; k++) { gg.beginPath(); gg.moveTo(x0 + k * 18, 0); gg.lineTo(x0 + k * 18, 128); gg.stroke(); }
    for (let k = 1; k < 6; k++) { gg.beginPath(); gg.moveTo(x0, 6 + k * 24); gg.lineTo(x0 + w, 6 + k * 24); gg.stroke(); }
    gg.restore();
  }
  const glassTex = new THREE.CanvasTexture(gc); glassTex.wrapS = glassTex.wrapT = THREE.RepeatWrapping; glassTex.colorSpace = THREE.SRGBColorSpace;
  const glass = new THREE.MeshBasicMaterial({ map: glassTex, color: 0xcccccc, vertexColors: true });
  const all = [lit, emissive, building, buildingLow, buildingMid, pool, glass];
  const sense = createSenseUniforms();
  for (const m of all) patchSenseMaterial(m, sense);
  return { lit, emissive, building, buildingLow, buildingMid, pool, glass, all, sense, textures: { concrete } };
}
