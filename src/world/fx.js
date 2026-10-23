// Atmosphere effects (PLAN 3b): animated SURYA ad screens (one canvas atlas, one draw call), drizzle
// streaks around the camera on G and U, slow searchlights sweeping the haze, flickering diyas.
//
//   world.fx = { ads, rain, searchlights, diyaFlicker }      all updated by CitySystem.update
//   rain intensity follows the player's height: heavy on G, light on L1, none above L2; underground it is
//   sparse drips from the ceiling. `world.fx.rain.setIntensity(f)` multiplies it (0 = off).
import * as THREE from 'three';

const FONT = '"Noto Sans Devanagari", "Noto Sans", FreeSans, "Trebuchet MS", Verdana, sans-serif';
const CELL_W = 512, CELL_H = 256;

// ------------------------------------------------------------------------------------------ ads
const SLIDES = [
  [  // 0: SURYA Corp, gold
    { bg: ['#1a1206', '#3a2608'], lines: [['सूर्य  SURYA', 84, '#ffd45a'], ['the light you deserve', 36, '#ffe9a8']] },
    { bg: ['#120d04', '#2a1c06'], lines: [['SUNLIGHT PLANS', 62, '#ffcf6a'], ['from ₹99 / day', 46, '#fff0c0']] },
    { bg: ['#1a1206', '#3a2608'], lines: [['MEMBERS ONLY', 60, '#ffd45a'], ['LEVEL 3: UNLIMITED DAWN', 34, '#ffe9a8']] },
  ],
  [  // 1: pharmacy, magenta and cyan
    { bg: ['#14061a', '#2a0a30'], lines: [['दवा  PHARMA-X', 66, '#ff5ab4'], ['breathe easy*', 40, '#7ae8ff']] },
    { bg: ['#06141a', '#0a2a30'], lines: [['पानी  WATER 24x7', 60, '#5af0ff'], ['filtered by SURYA', 34, '#c8f8ff']] },
  ],
  [  // 2: the municipal PA
    { bg: ['#1a0808', '#300c0c'], lines: [['NO SINGING', 80, '#ff5a4a'], ['गाना मना है', 56, '#ffb0a0']] },
    { bg: ['#08121a', '#0c2230'], lines: [['REPORT UNREGISTERED SINGING', 32, '#bfe8ff'], ['Have a pleasant day.', 40, '#ffffff']] },
    { bg: ['#08121a', '#0c2230'], lines: [['SUNLIGHT IS A PRIVILEGE', 38, '#bfe8ff'], ['NOT A RIGHT.', 54, '#ffffff']] },
  ],
  [  // 3: construction
    { bg: ['#141006', '#2a2208'], lines: [['SURYA CONSTRUCTION', 54, '#ffd45a'], ['Deeper. Faster. Safer*', 40, '#fff0c0']] },
    { bg: ['#141006', '#2a2208'], lines: [['*terms apply', 44, '#c8b878'], ['सूर्य  Building tomorrow', 40, '#ffd45a']] },
  ],
  [  // 4: the TV in Mithi's flat
    { bg: ['#101418', '#182028'], lines: [['BREAKING', 56, '#ff4a40'], ['FLYOVER COLLAPSE', 44, '#ffffff']] },
    { bg: ['#101418', '#182028'], lines: [['...', 80, '#9ab0c0']] },
  ],
];

export class AdScreens {
  constructor(game, map) {
    this.game = game; this.t = 0; this.acc = 0;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 1024; this.canvas.height = 1024;
    this.g = this.canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, color: 0xcccccc });
    game.materials.all.push(this.mat);
    const pos = [], uv = [], rotY = { '+z': 0, '-z': Math.PI, '+x': Math.PI / 2, '-x': -Math.PI / 2 };
    const cells = [[0, 0], [512, 0], [0, 256], [512, 256], [0, 512]];
    for (const a of map.adScreens) {
      const [cx, cy] = cells[a.ad], u0 = cx / 1024, u1 = (cx + CELL_W) / 1024, v0 = 1 - (cy + CELL_H) / 1024, v1 = 1 - cy / 1024;
      const k = a.ad === 4 ? 1 : 1.3;
      const ang = rotY[a.dir], ca = Math.cos(ang), sa = Math.sin(ang), hw = a.w * k / 2, hh = a.h * k / 2;
      const P = [[-hw, -hh, u0, v0], [hw, -hh, u1, v0], [hw, hh, u1, v1], [-hw, hh, u0, v1]].map(([x, y, u, v]) => [a.x + x * ca, a.y + y, a.z - x * sa, u, v]);
      for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(P[i][0], P[i][1], P[i][2]); uv.push(P[i][3], P[i][4]); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeBoundingSphere();
    this.mesh = new THREE.Mesh(geo, this.mat); this.mesh.name = 'ad-screens';
    game.scene.add(this.mesh);
    this.draw(0);
    game.events.on('sky:time', ({ dayFactor }) => { const n = 1 - dayFactor; this.mat.color.setScalar(0.7 + 0.3 * n); });
  }

  draw(t) {
    const g = this.g;
    SLIDES.forEach((slides, i) => {
      const x = (i === 4 ? 0 : (i % 2) * CELL_W), y = (i === 4 ? 2 : Math.floor(i / 2)) * CELL_H;
      const idx = Math.floor((t / 3.4 + i * 0.7)) % slides.length, sl = slides[idx];
      const ph = (t / 3.4 + i * 0.7) % 1;
      g.save(); g.beginPath(); g.rect(x, y, CELL_W, CELL_H); g.clip();
      const gr = g.createLinearGradient(x, y, x, y + CELL_H); gr.addColorStop(0, sl.bg[0]); gr.addColorStop(1, sl.bg[1]);
      g.fillStyle = gr; g.fillRect(x, y, CELL_W, CELL_H);
      if (i === 4) {                          // TV: static
        for (let k = 0; k < 500; k++) { const v = (Math.random() * 120) | 0; g.fillStyle = `rgb(${v},${v + 8},${v + 14})`; g.fillRect(x + Math.random() * CELL_W, y + Math.random() * CELL_H, 6, 3); }
      }
      // slide text with a fade in/out and a little horizontal jitter
      const a = Math.min(1, ph * 6, (1 - ph) * 6);
      g.globalAlpha = 0.25 + 0.75 * a;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const jitter = Math.random() < 0.06 ? (Math.random() - 0.5) * 14 : 0;
      const n = sl.lines.length;
      sl.lines.forEach(([text, size, color], k) => {
        let sz = size; g.font = `bold ${sz}px ${FONT}`;
        while (g.measureText(text).width > CELL_W - 40 && sz > 16) { sz -= 2; g.font = `bold ${sz}px ${FONT}`; }
        g.shadowColor = color; g.shadowBlur = 16; g.fillStyle = color;
        g.fillText(text, x + CELL_W / 2 + jitter, y + CELL_H / 2 + (k - (n - 1) / 2) * (size * 1.0 + 8));
      });
      g.shadowBlur = 0; g.globalAlpha = 1;
      // scanlines and an occasional glitch bar
      g.fillStyle = 'rgba(0,0,0,.28)'; for (let yy = y; yy < y + CELL_H; yy += 4) g.fillRect(x, yy, CELL_W, 1.5);
      if (Math.random() < 0.08) { g.fillStyle = 'rgba(255,255,255,.18)'; g.fillRect(x, y + Math.random() * CELL_H, CELL_W, 4 + Math.random() * 10); }
      g.strokeStyle = 'rgba(255,230,160,.55)'; g.lineWidth = 6; g.strokeRect(x + 3, y + 3, CELL_W - 6, CELL_H - 6);
      g.restore();
    });
    this.tex.needsUpdate = true;
  }

  update(dt) {
    this.t += dt; this.acc += dt;
    if (this.acc >= 0.2) { this.acc = 0; this.draw(this.t); }
  }
}

// ------------------------------------------------------------------------------------------ rain
const RAIN_VS = `
  uniform float uTime; uniform vec3 uCam; uniform float uInt; uniform float uSpeed; uniform float uLen; uniform vec3 uSize; uniform float uCeil;
  attribute float aEnd; attribute float aSeed;
  varying float vA;
  void main() {
    vec3 q = position * uSize;
    q.y -= uTime * uSpeed * (0.8 + 0.4 * aSeed);
    vec3 rel = mod(q - uCam + uSize * 0.5, uSize) - uSize * 0.5;
    vec3 p = uCam + rel;
    p.y += aEnd * uLen;
    float d = length(rel);
    vA = step(aSeed, uInt) * (1.0 - smoothstep(uSize.x * 0.28, uSize.x * 0.5, length(rel.xz))) * step(p.y, uCeil);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const RAIN_FS = `
  uniform vec3 uColor; uniform float uAlpha; varying float vA;
  void main() { if (vA < 0.01) discard; gl_FragColor = vec4(uColor, uAlpha * vA); }`;

export class Rain {
  constructor(game, n = 1500) {
    this.game = game; this.t = 0; this.scale = 1;
    const pos = new Float32Array(n * 2 * 3), end = new Float32Array(n * 2), seed = new Float32Array(n * 2);
    let s = 91; const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < n; i++) {
      const x = r(), y = r(), z = r(), sd = r();
      for (let k = 0; k < 2; k++) { pos.set([x, y, z], (i * 2 + k) * 3); end[i * 2 + k] = k; seed[i * 2 + k] = sd; }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: RAIN_VS, fragmentShader: RAIN_FS, transparent: true, depthWrite: false,
      uniforms: { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uInt: { value: 1 }, uSpeed: { value: 14 }, uLen: { value: 1.1 }, uSize: { value: new THREE.Vector3(34, 22, 34) }, uCeil: { value: 1e5 }, uColor: { value: new THREE.Color(0.72, 0.82, 0.92) }, uAlpha: { value: 0.32 } },
    });
    this.mesh = new THREE.LineSegments(geo, this.mat);
    this.mesh.frustumCulled = false; this.mesh.renderOrder = 8; this.mesh.name = 'rain';
    game.scene.add(this.mesh);
  }

  setIntensity(f) { this.scale = f; }

  update(dt) {
    this.t += dt;
    const u = this.mat.uniforms, cam = this.game.camera.position, y = this.game.player?.pos.y ?? 0;
    u.uTime.value = this.t; u.uCam.value.copy(cam);
    let inten, speed = 14, len = 1.1, ceil = 1e5;
    if (y < -3) { inten = 0.07; speed = 5; len = 0.35; ceil = -2.2; }                  // drips from the ceiling
    else if (y < 3) { inten = 0.85; }                                                  // G: drizzle
    else inten = 0.85 * Math.max(0, 1 - (y - 3) / 24);                                 // thinning out up the levels
    u.uInt.value = inten * this.scale; u.uSpeed.value = speed; u.uLen.value = len; u.uCeil.value = ceil;
    const night = 1 - (this.game.sky?.dayFactor ?? 1);
    u.uAlpha.value = 0.26 + 0.12 * night;
    this.mesh.visible = u.uInt.value > 0.01;
  }
}

// ------------------------------------------------------------------------------------------ searchlights
const SL_VS = `
  attribute float aFade; varying float vFade; varying vec3 vN; varying vec3 vV; varying float vDepth;
  void main() { vec4 mv = modelViewMatrix * vec4(position, 1.0); vFade = aFade; vN = normalize(normalMatrix * normal); vV = -mv.xyz; vDepth = length(mv.xyz); gl_Position = projectionMatrix * mv; }`;
const SL_FS = `
  uniform vec3 uColor; uniform float uInt; uniform float uFogFar;
  varying float vFade; varying vec3 vN; varying vec3 vV; varying float vDepth;
  void main() {
    float f = abs(dot(normalize(vN), normalize(vV)));
    float a = vFade * pow(f, 1.6) * uInt * (1.0 - smoothstep(uFogFar * 0.6, uFogFar * 1.6, vDepth));
    gl_FragColor = vec4(uColor * a, a);
  }`;

export class Searchlights {
  constructor(game, map) {
    this.game = game; this.t = 0; this.items = [];
    const L = 230, R = 13;
    const cone = new THREE.ConeGeometry(R, L, 18, 8, true).toNonIndexed();
    cone.translate(0, -L / 2, 0); cone.rotateX(Math.PI);                   // apex at the origin, opening along +y
    const p = cone.attributes.position, fade = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) { const t = Math.max(0, Math.min(1, p.getY(i) / L)); fade[i] = Math.pow(1 - t, 0.6) * Math.min(1, t * 12 + 0.1); }
    cone.setAttribute('aFade', new THREE.BufferAttribute(fade, 1));
    this.mat = new THREE.ShaderMaterial({
      vertexShader: SL_VS, fragmentShader: SL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(0.78, 0.9, 1.0) }, uInt: { value: 0.2 }, uFogFar: { value: 220 } },
    });
    for (const s of map.searchlights) {
      const m = new THREE.Mesh(cone, this.mat);
      m.position.set(s.x, s.y, s.z); m.frustumCulled = false; m.renderOrder = 5; m.name = s.id;
      game.scene.add(m);
      this.items.push({ def: s, mesh: m });
    }
  }

  update(dt) {
    this.t += dt;
    const dir = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    for (const it of this.items) {
      const az = it.def.phase + this.t * it.def.speed * 2, tilt = 1.02 + 0.2 * Math.sin(this.t * 0.07 + it.def.phase);
      dir.set(Math.sin(tilt) * Math.cos(az), Math.cos(tilt), Math.sin(tilt) * Math.sin(az));
      it.mesh.quaternion.setFromUnitVectors(up, dir);
    }
    const day = this.game.sky?.dayFactor ?? 1;
    this.mat.uniforms.uInt.value = 0.12 + 0.95 * (1 - day);
    this.mat.uniforms.uFogFar.value = this.game.scene.fog.far;
  }
}

// ------------------------------------------------------------------------------------------ diya flicker
export class DiyaFlicker {
  constructor(group) {
    this.mesh = group.getObjectByName('city:inst:diya');
    this.t = 0; this.n = this.mesh ? this.mesh.count : 0;
    this.col = new THREE.Color();
    this.base = new THREE.Color(0xffa040);
  }

  update(dt) {
    if (!this.mesh) return;
    this.t += dt;
    if (this._acc === undefined) this._acc = 0;
    this._acc += dt; if (this._acc < 0.09) return; this._acc = 0;
    for (let i = 0; i < this.n; i++) {
      const f = 0.65 + 0.35 * Math.sin(this.t * (9 + (i % 5)) + i * 1.7) * Math.sin(this.t * 3.1 + i);
      this.mesh.setColorAt(i, this.col.copy(this.base).multiplyScalar(0.55 + 0.7 * f));
    }
    this.mesh.instanceColor.needsUpdate = true;
  }
}
