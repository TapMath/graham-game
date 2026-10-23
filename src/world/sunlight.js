// Sunlight shafts (visible warm columns), floor pools, dust motes and the L3 solar lamps.
//
//   world.sunShafts                  array of shaft records {id, level, x, z, y0, r, height}
//   world.sunShafts.intensity        0..1 multiplier (sky.setTimeOfDay sets it; 0 at night)
//   world.isInSunlight(pos)          true if pos ({x,y,z} feet) is inside a lit shaft
//   world.sunShaftAt(pos)            the shaft record, or null
//   world.solarLamps / isNearSolarLamp(pos)   lamps on the Upper Decks, which work at night
//
// Healing is Phase 3's job: it asks isInSunlight() (or isNearSolarLamp() at night, at half rate).
import * as THREE from '../../vendor/three.module.js';
import { SHAFT_LEAN } from './map.js';

const SIDES = 14;

function poolTexture() {
  // light through a gothic window onto the floor: a pointed-arch (lancet) patch with a soft rim and mullions
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  const gr = g.createRadialGradient(64, 70, 4, 64, 64, 62);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.55, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  // carve the mullions (dark bars) so the pool reads as a window's shadow pattern
  g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,.55)';
  g.fillRect(61, 0, 6, 128); g.fillRect(0, 44, 128, 5); g.fillRect(0, 84, 128, 5);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

const SHAFT_VS = `
  attribute float aFade; attribute float aAng;
  varying float vAng; varying float vFade; varying vec3 vN; varying vec3 vV; varying float vDepth;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vAng = aAng; vFade = aFade; vN = normalize(normalMatrix * normal); vV = -mv.xyz; vDepth = length(mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const SHAFT_FS = `
  uniform vec3 uColor; uniform float uIntensity; uniform float uFogNear; uniform float uFogFar; uniform float uTime;
  varying float vAng; varying float vFade; varying vec3 vN; varying vec3 vV; varying float vDepth;
  void main() {
    float f = abs(dot(normalize(vN), normalize(vV)));
    float edge = pow(f, 1.4);
    float fog = 1.0 - smoothstep(uFogNear, uFogFar, vDepth);
    float stri = 0.7 + 0.3 * sin(vAng * 11.0 + uTime * 0.12) * sin(vAng * 5.0 - uTime * 0.07);
    float a = vFade * edge * stri * uIntensity * fog * (0.52 + 0.04 * sin(uTime * 0.7 + vDepth * 0.05));
    gl_FragColor = vec4(uColor * a, a);
  }`;
const MOTE_VS = `
  attribute vec3 aBase; attribute vec4 aP; attribute float aSpeed;
  uniform float uTime; uniform vec2 uLean; uniform float uIntensity;
  varying float vA;
  void main() {
    // aP: x = radial fraction * r, y = angle, z = column height, w = phase
    float h = mod(aP.w * aP.z + uTime * aSpeed, aP.z);
    float ang = aP.y + uTime * 0.05;
    vec3 p = aBase + vec3(uLean.x * h + cos(ang) * aP.x, h, uLean.y * h + sin(ang) * aP.x);
    p.x += sin(uTime * 0.3 + aP.w * 20.0) * 0.4; p.z += cos(uTime * 0.27 + aP.w * 17.0) * 0.4;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(5.0 * 60.0 / -mv.z, 1.5, 5.0);
    vA = uIntensity * (0.35 + 0.65 * sin(uTime * 1.3 + aP.w * 40.0) * sin(uTime * 1.3 + aP.w * 40.0)) * (1.0 - smoothstep(0.7, 1.0, h / aP.z)) * (1.0 - smoothstep(60.0, 120.0, -mv.z));
  }`;
const MOTE_FS = `
  uniform vec3 uColor; varying float vA;
  void main() { vec2 d = gl_PointCoord - 0.5; float r = dot(d, d) * 4.0; float a = (1.0 - r) * vA; if (a < 0.01) discard; gl_FragColor = vec4(uColor * a, a); }`;

export class Sunlight {
  constructor(game, map) {
    this.game = game;
    this.list = map.sunShafts.map((s) => ({ ...s }));
    this.list.intensity = 1;
    this.lamps = map.solarLamps.map((l) => ({ ...l }));
    this.t = 0;
  }

  build() {
    const g = this.game, scene = g.scene;
    // ---- shaft columns (one merged mesh)
    const pos = [], nor = [], fade = [], ang = [];
    const pools = [];
    for (const s of this.list) {
      const topX = s.x + SHAFT_LEAN.x * s.height, topZ = s.z + SHAFT_LEAN.z * s.height, rTop = s.r * 0.8;
      for (let i = 0; i < SIDES; i++) {
        const a0 = (i / SIDES) * Math.PI * 2, a1 = ((i + 1) / SIDES) * Math.PI * 2;
        const seg = 5;
        for (let k = 0; k < seg; k++) {
          const t0 = k / seg, t1 = (k + 1) / seg;
          const P = (a, t) => {
            const r = s.r + (rTop - s.r) * t;
            return [s.x + (topX - s.x) * t + Math.cos(a) * r, s.y0 + s.height * t, s.z + (topZ - s.z) * t + Math.sin(a) * r];
          };
          const F = (t) => Math.pow(1 - t, 0.75) * Math.min(1, t * 14 + 0.05) * ({ G: 0.6, L1: 0.85, L2: 1, L3: 0.7 }[s.level] ?? 1);
          const v = [[P(a0, t0), t0], [P(a1, t0), t0], [P(a1, t1), t1], [P(a0, t1), t1]];
          const nrm = (a) => [Math.cos(a), 0, Math.sin(a)];
          for (const [i0, i1, i2] of [[0, 1, 2], [0, 2, 3]]) {
            for (const idx of [i0, i1, i2]) {
              pos.push(...v[idx][0]); fade.push(F(v[idx][1])); ang.push(idx === 0 || idx === 3 ? a0 : a1);
              nor.push(...nrm(idx === 0 || idx === 3 ? a0 : a1));
            }
          }
        }
      }
      pools.push(s);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('aFade', new THREE.Float32BufferAttribute(fade, 1));
    geo.setAttribute('aAng', new THREE.Float32BufferAttribute(ang, 1));
    geo.computeBoundingSphere();
    this.shaftMat = new THREE.ShaderMaterial({
      vertexShader: SHAFT_VS, fragmentShader: SHAFT_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(1.0, 0.78, 0.4) }, uIntensity: { value: 1 }, uFogNear: { value: 20 }, uFogFar: { value: 200 }, uTime: { value: 0 } },
    });
    this.shaftMesh = new THREE.Mesh(geo, this.shaftMat);
    this.shaftMesh.frustumCulled = false; this.shaftMesh.renderOrder = 5; this.shaftMesh.name = 'sunshafts';
    scene.add(this.shaftMesh);

    // ---- floor pools (additive discs on the floor where each shaft lands)
    const pp = [], pu = [];
    for (const s of pools) {
      const r = s.r * 1.35, y = s.y0 + 0.04;
      const q = [[-r, -r, 0, 0], [r, -r, 1, 0], [r, r, 1, 1], [-r, r, 0, 1]];
      for (const i of [0, 2, 1, 0, 3, 2]) { pp.push(s.x + q[i][0], y, s.z + q[i][1]); pu.push(q[i][2], q[i][3]); }
    }
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
    pg.setAttribute('uv', new THREE.Float32BufferAttribute(pu, 2));
    pg.computeBoundingSphere();
    this.poolMat = new THREE.MeshBasicMaterial({ map: poolTexture(), color: 0xffcf80, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.55 });
    this.poolMesh = new THREE.Mesh(pg, this.poolMat);
    this.poolMesh.renderOrder = 4; this.poolMesh.frustumCulled = false; this.poolMesh.name = 'sunpools';
    scene.add(this.poolMesh);

    // ---- dust motes drifting up through the columns
    const per = (s) => (s.level === 'G' ? 14 : s.level === 'L3' ? 26 : 20);
    const base = [], par = [], spd = [];
    let rs = 17; const rnd = () => ((rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (const s of this.list) {
      for (let i = 0; i < per(s); i++) {
        base.push(s.x, s.y0, s.z);
        par.push(Math.sqrt(rnd()) * s.r * 0.9, rnd() * 6.283, Math.min(s.height, 40), rnd());
        spd.push(0.15 + rnd() * 0.25);
      }
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(base.length), 3));
    mg.setAttribute('aBase', new THREE.Float32BufferAttribute(base, 3));
    mg.setAttribute('aP', new THREE.Float32BufferAttribute(par, 4));
    mg.setAttribute('aSpeed', new THREE.Float32BufferAttribute(spd, 1));
    mg.boundingSphere = new THREE.Sphere(new THREE.Vector3(30, 20, -10), 400);
    this.moteMat = new THREE.ShaderMaterial({
      vertexShader: MOTE_VS, fragmentShader: MOTE_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uLean: { value: new THREE.Vector2(SHAFT_LEAN.x, SHAFT_LEAN.z) }, uIntensity: { value: 1 }, uColor: { value: new THREE.Color(1, 0.86, 0.55) } },
    });
    this.motes = new THREE.Points(mg, this.moteMat);
    this.motes.frustumCulled = false; this.motes.renderOrder = 6; this.motes.name = 'sunmotes';
    scene.add(this.motes);
  }

  /** Called by the world's update. */
  update(dt) {
    this.t += dt;
    const I = Math.max(0, Math.min(1, this.list.intensity));
    const fog = this.game.scene.fog;
    this.shaftMat.uniforms.uIntensity.value = I;
    this.shaftMat.uniforms.uTime.value = this.t;
    this.shaftMat.uniforms.uFogNear.value = fog.near; this.shaftMat.uniforms.uFogFar.value = fog.far * 1.1;
    this.shaftMesh.visible = I > 0.01;
    this.moteMat.uniforms.uTime.value = this.t; this.moteMat.uniforms.uIntensity.value = I;
    this.motes.visible = I > 0.01;
    this.poolMat.opacity = 0.55 * I; this.poolMesh.visible = I > 0.01;
  }

  shaftAt(p) {
    if (this.list.intensity < 0.05) return null;
    for (const s of this.list) {
      const h = p.y - s.y0;
      if (h < -0.6 || h > s.height) continue;
      const t = Math.max(0, h) / s.height;
      const cx = s.x + SHAFT_LEAN.x * Math.max(0, h), cz = s.z + SHAFT_LEAN.z * Math.max(0, h);
      const r = (s.r + (s.r * 0.8 - s.r) * t) * 0.92;
      if (Math.hypot(p.x - cx, p.z - cz) <= r) return s;
    }
    return null;
  }

  lampNear(p) {
    for (const l of this.lamps) if (Math.abs(p.y - l.y) < 3 && Math.hypot(p.x - l.x, p.z - l.z) <= l.radius) return l;
    return null;
  }
}
