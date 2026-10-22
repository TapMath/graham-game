// Shared instanced renderers for the hazards. Everything here is a single InstancedMesh (one draw call each),
// rebuilt every simulation step from whatever is awake near the player:
//
//   Glows  billboard light dots (dog eyes, drone and camera lamps, torch bulbs)        1 draw call
//   Beams  additive cones (drone spotlights, camera sweeps, guard torches) + ground pools   2 draw calls
//   Puffs  soft billboard clouds (smog volumes, dust from collapses)                      1 draw call
//
// Usage per step:  r.begin(); r.add(...); ...; r.end();
import * as THREE from 'three';

/** Soft radial dot texture (white core, transparent edge). */
export function softTexture(size = 64, core = 0.12) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), h = size / 2, gr = g.createRadialGradient(h, h, 0, h, h, h);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(core, 'rgba(255,255,255,.9)');
  gr.addColorStop(0.35, 'rgba(255,255,255,.28)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** A lumpy cloud: several blurred blobs inside a soft disc. */
export function puffTexture(seed = 5, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  g.fillStyle = '#000'; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2, d = rnd() * size * 0.2, x = size / 2 + Math.cos(a) * d, y = size / 2 + Math.sin(a) * d, r = size * (0.16 + rnd() * 0.18);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
  }
  g.globalCompositeOperation = 'destination-in';
  const m = g.createRadialGradient(size / 2, size / 2, size * 0.1, size / 2, size / 2, size / 2);
  m.addColorStop(0, 'rgba(0,0,0,1)'); m.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = m; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function colorAttr(geo, value) {
  const n = geo.attributes.position.count, a = new Float32Array(n * 3);
  if (typeof value === 'number') a.fill(value); else for (let i = 0; i < n; i++) a[i * 3] = a[i * 3 + 1] = a[i * 3 + 2] = value(i, geo);
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
}

function makeInstanced(geo, mat, cap, name, order) {
  const mesh = new THREE.InstancedMesh(geo, mat, cap);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
  mesh.count = 0; mesh.frustumCulled = false; mesh.renderOrder = order; mesh.name = name; mesh.visible = false;
  return mesh;
}

const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion();
const _fwd = new THREE.Vector3(0, 0, -1), _dir = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _o = { x: 0, y: 0, z: 0 }, _d = { x: 0, y: 0, z: 0 };

class Instanced {
  begin() { this.n = 0; }
  _push(mat, r, g, b) {
    const i = this.n++;
    this.mesh.setMatrixAt(i, mat);
    const a = this.mesh.instanceColor.array; a[i * 3] = r; a[i * 3 + 1] = g; a[i * 3 + 2] = b;
    return i;
  }
  end() {
    const m = this.mesh;
    m.count = this.n; m.visible = this.n > 0;
    if (this.n) { m.instanceMatrix.needsUpdate = true; m.instanceColor.needsUpdate = true; }
  }
  get full() { return this.n >= this.cap; }
}

export class Glows extends Instanced {
  constructor(game, cap = 220) {
    super();
    this.game = game; this.cap = cap; this.n = 0;
    const geo = new THREE.PlaneGeometry(1, 1); colorAttr(geo, 1);
    this.tex = softTexture(64, 0.1);
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.mesh = makeInstanced(geo, this.mat, cap, 'hazard-glows', 9);
    game.scene.add(this.mesh);
  }
  /** size in metres; colour is linear 0..1+ (it is added to the screen). */
  add(x, y, z, size, r, g, b) {
    if (this.n >= this.cap) return;
    _p.set(x, y, z); _s.set(size, size, size);
    _m.compose(_p, this.game.camera.quaternion, _s);
    this._push(_m, r, g, b);
  }
}

export class Puffs extends Instanced {
  constructor(game, cap = 420) {
    super();
    this.game = game; this.cap = cap; this.n = 0;
    const geo = new THREE.PlaneGeometry(1, 1); colorAttr(geo, 1);
    this.tex = puffTexture(5);
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    this.mesh = makeInstanced(geo, this.mat, cap, 'hazard-puffs', 6);
    game.scene.add(this.mesh);
  }
  /** `spin` rotates the sprite around the view axis (radians) so the clouds do not all look alike. */
  add(x, y, z, size, r, g, b, spin = 0) {
    if (this.n >= this.cap) return;
    _p.set(x, y, z); _s.set(size, size, size);
    _q2.setFromAxisAngle(_fwd, spin);
    _q.copy(this.game.camera.quaternion).multiply(_q2);
    _m.compose(_p, _q, _s);
    this._push(_m, r, g, b);
  }
}

const BEAM_VS = `
  attribute float aFade;
  varying float vFade; varying vec3 vN; varying vec3 vV; varying vec3 vC;
  void main() {
    mat4 im = instanceMatrix;
    vec3 ax = normalize(im[0].xyz), ay = normalize(im[1].xyz);
    vN = normalize(mat3(modelViewMatrix) * (ax * position.x + ay * position.y));
    vec4 mv = modelViewMatrix * im * vec4(position, 1.0);
    vV = -mv.xyz; vFade = aFade;
    #ifdef USE_INSTANCING_COLOR
      vC = instanceColor;
    #else
      vC = vec3(1.0);
    #endif
    gl_Position = projectionMatrix * mv;
  }`;
// Soft volumetric look: bright where you look across the beam, nearly invisible when you look down its axis (standing in it).
const BEAM_FS = `
  varying float vFade; varying vec3 vN; varying vec3 vV; varying vec3 vC;
  void main() {
    float f = abs(dot(normalize(vN), normalize(vV)));
    float a = vFade * pow(f, 2.4);
    gl_FragColor = vec4(vC, a);
  }`;

export class Beams {
  constructor(game, cap = 48) {
    this.game = game; this.cap = cap; this.cones = new Instanced(); this.pools = new Instanced();
    const SEG = 20, pos = [], fade = [];
    const ring = (i) => { const a = (i / SEG) * Math.PI * 2; return [Math.cos(a), Math.sin(a), -1]; };
    for (let i = 0; i < SEG; i++) { const a = ring(i), b = ring(i + 1); pos.push(0, 0, 0, ...a, ...b); fade.push(1.0, 0.1, 0.1); }
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    cg.setAttribute('aFade', new THREE.Float32BufferAttribute(fade, 1));
    this.condMat = new THREE.ShaderMaterial({ vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    this.cones.mesh = makeInstanced(cg, this.condMat, cap, 'hazard-beams', 7);
    this.cones.cap = cap; this.cones.n = 0;
    const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2); colorAttr(pg, 1);
    this.poolMat = new THREE.MeshBasicMaterial({ map: softTexture(64, 0.25), vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    this.pools.mesh = makeInstanced(pg, this.poolMat, cap, 'hazard-pools', 6);
    this.pools.cap = cap; this.pools.n = 0;
    game.scene.add(this.cones.mesh); game.scene.add(this.pools.mesh);
  }
  begin() { this.cones.begin(); this.pools.begin(); }
  end() { this.cones.end(); this.pools.end(); }

  /**
   * A light cone from (ox,oy,oz) along the unit vector (dx,dy,dz): half angle `half`, length `len` (shortened where it hits
   * the world), tinted (r,g,b). A ground pool is drawn where it lands when it points down. Returns the actual length.
   */
  add(ox, oy, oz, dx, dy, dz, half, len, r, g, b, pool = 1) {
    if (this.cones.n >= this.cap) return len;
    _o.x = ox; _o.y = oy; _o.z = oz; _d.x = dx; _d.y = dy; _d.z = dz;
    const hit = this.game.physics.raycast(_o, _d, len, (c) => c.solid || c.walkable);
    const L = hit ? Math.max(0.5, hit.dist) : len, rad = Math.tan(half) * L;
    _dir.set(dx, dy, dz);
    _q.setFromUnitVectors(_fwd, _dir);
    _p.set(ox, oy, oz); _s.set(rad, rad, L);
    _m.compose(_p, _q, _s);
    // standing inside a beam you should see almost nothing of its walls: fade it out as the camera enters the cone
    const cam = this.game.camera.position, wx = cam.x - ox, wy = cam.y - oy, wz = cam.z - oz, ax = wx * dx + wy * dy + wz * dz;
    let mul = 0.95;
    if (ax > -0.5 && ax < L + 0.5) {
      const rr = Math.hypot(wx - ax * dx, wy - ax * dy, wz - ax * dz), R = Math.max(0.05, Math.tan(half) * Math.max(ax, 0));
      const t = Math.min(1, Math.max(0, (rr - R * 1.0) / (R * 0.8))), k = 1 - t * t * (3 - 2 * t);
      mul *= 1 - 0.96 * k;
    }
    // Phase 7b: a cone seen from close by (a drone overhead, a torch in your face) was a wall of saturated colour: thin it out
    const apex = Math.hypot(wx, wy, wz);
    mul *= 0.35 + 0.65 * Math.min(1, Math.max(0, (apex - 1.5) / 9));
    this.cones._push(_m, r * mul, g * mul, b * mul);
    if (hit && dy < -0.2 && pool > 0 && this.pools.n < this.cap) {
      const stretch = Math.min(2.6, 1 / Math.max(0.35, -dy));
      _q.setFromAxisAngle(_up, Math.atan2(dx, dz));
      _p.set(hit.point.x, hit.point.y + 0.05, hit.point.z); _s.set(rad * 2.4, 1, rad * 2.4 * stretch);
      _m.compose(_p, _q, _s);
      // the pool where it lands: strongest from a distance, soft and capped when the camera is on or beside it
      const hp = hit.point, pd = Math.hypot(cam.x - hp.x, cam.y - hp.y, cam.z - hp.z);
      const pf = 0.2 + 0.8 * Math.min(1, Math.max(0, (pd - 2.5) / 8));
      const k2 = 1.9 * pool * pf, cap = 0.5;
      this.pools._push(_m, Math.min(cap, r * k2), Math.min(cap, g * k2), Math.min(cap, b * k2));
    }
    return L;
  }
}

/**
 * A lit, vertex-coloured material with a cold rim light, so dark shapes keep a glowing silhouette in the gloom
 * (dogs, hazard figures). Chains cleanly with other onBeforeCompile patches (it only edits two shader chunks).
 */
export function rimMaterial(game, { emissive = 0x1c2428, rim = 0x4aa0b0, power = 2.4, strength = 0.9, key = 'rim' } = {}) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: new THREE.Color(emissive) });
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    shader.uniforms.uRimColor = { value: new THREE.Color(rim) };
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float rimF = pow(1.0 - clamp(abs(dot(normalize(normal), normalize(vViewPosition))), 0.0, 1.0), ${power.toFixed(2)});
          totalEmissiveRadiance += uRimColor * rimF * ${strength.toFixed(2)}; }`);
  };
  m.customProgramCacheKey = () => `hazard-${key}-${power}-${strength}`;
  game.materials?.all?.push(m);
  return m;
}
