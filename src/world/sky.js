// Sky dome, sun, fog and global lights.
//
//   game.sky.setTimeOfDay(hour)     0..24. Phase 3's clock calls this every frame/step; the world also
//                                   listens to 'debug:setTime'. Switches the sky to "dynamic" mode:
//                                   palette = time-of-day keyframe, blended with the gloom of the level
//                                   the player is on (teal-green murk below, warm hazy ochre above).
//   game.sky.setPalette({...})      static palette (the Phase 1 arena uses this); leaves dynamic mode.
//   game.sky.hour / .phase          'night' | 'predawn' | 'sunrise' | 'day' | 'dusk'
//   game.sky.dayFactor              0 at night .. 1 in full day (drives sunlight shafts, solar lamps)
//   event 'sky:time' {hour, phase, dayFactor}  when setTimeOfDay is called with a changed hour
//
// The sun rises in the EAST (+X), is highest at noon, sets in the west, and sits a little south (+Z).
// Palettes (setTimeOfDay): pre-dawn 05:00, sunrise 06:15, morning 07:30, noon, late afternoon 16:30,
// dusk 18:30, night 20:30..04:30. No shadows anywhere (PLAN section 4).
import * as THREE from 'three';

const STATIC_DEFAULT = {
  horizon: 0x2b4a44, zenith: 0x0d1716, fog: 0x1c2f2c, fogNear: 35, fogFar: 170,
  sunColor: 0xffd7a0, sunIntensity: 1.3, hemiIntensity: 1.7, hemiSky: 0xbfd8d0, hemiGround: 0x3a3426,
};

// hour, horizon, zenith, haze (fog colour on the upper levels), sun light colour, sun intensity,
// hemisphere intensity, disc colour, day brightness 0..1 (scales the teal gloom), window glow
const KEYS = [
  [0.0,  0x0f1d26, 0x04080d, 0x10202a, 0x6f8fc0, 0.35, 0.80, 0xb8c8e8, 0.00, 1.25],
  [4.5,  0x0f1d26, 0x04080d, 0x10202a, 0x6f8fc0, 0.35, 0.80, 0xb8c8e8, 0.00, 1.25],
  [5.3,  0x364b5a, 0x0d1a26, 0x2f424e, 0x8aa0c8, 0.40, 0.85, 0xd8d0c0, 0.18, 1.1],
  [6.2,  0xf59a52, 0x35506a, 0xc98d5e, 0xffa05a, 1.15, 0.95, 0xfff0c0, 0.50, 0.85],
  [7.5,  0xe6b062, 0x7f9a9a, 0xcfa468, 0xffd49a, 1.35, 1.15, 0xffe9b0, 0.82, 0.55],
  [12.0, 0xdcb870, 0x93aaa4, 0xc9a560, 0xffe6b0, 1.55, 1.30, 0xfff4cc, 1.00, 0.40],
  [16.5, 0xd89c54, 0x8a9a96, 0xc08a4e, 0xffc880, 1.40, 1.15, 0xffdca0, 0.88, 0.50],
  [18.3, 0xcc5a30, 0x2c2a44, 0x8a4a38, 0xff7a40, 0.95, 0.80, 0xffa060, 0.45, 0.90],
  [19.5, 0x4a2a3a, 0x0d1020, 0x2e2430, 0x7a6a90, 0.45, 0.78, 0xc0b0c8, 0.12, 1.15],
  [20.5, 0x0f1d26, 0x04080d, 0x10202a, 0x6f8fc0, 0.35, 0.80, 0xb8c8e8, 0.00, 1.25],
  [24.0, 0x0f1d26, 0x04080d, 0x10202a, 0x6f8fc0, 0.35, 0.80, 0xb8c8e8, 0.00, 1.25],
];

// Level atmosphere by walking-surface height: [y, gloom, fogNear, fogFar, hemiMul, sunMul]
const LEVEL_ATMOS = [
  [-8, 1.00, 6, 70, 3.4, 0.0],
  [0, 0.92, 10, 110, 2.3, 0.3],
  [12, 0.60, 20, 150, 1.9, 0.5],
  [24, 0.25, 32, 195, 1.2, 0.8],
  [38, 0.00, 44, 220, 1.05, 1.0],
];

const TEAL = new THREE.Color(0x1f4540);
const TEAL_DEEP = new THREE.Color(0x0a1716);

const _a = new THREE.Color(), _b = new THREE.Color(), _c = new THREE.Color(), _d = new THREE.Color();
const HEMI_GLOOM = new THREE.Color(0xa8cfc6);
const lerp = (a, b, t) => a + (b - a) * t;

function keyAt(hour) {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1][0] <= h) i++;
  const k0 = KEYS[i], k1 = KEYS[i + 1];
  const t = Math.max(0, Math.min(1, (h - k0[0]) / (k1[0] - k0[0])));
  const col = (idx) => new THREE.Color(k0[idx]).lerp(_b.set(k1[idx]), t);
  return {
    horizon: col(1), zenith: col(2), haze: col(3), sunColor: col(4), sunIntensity: lerp(k0[5], k1[5], t),
    hemiIntensity: lerp(k0[6], k1[6], t), disc: col(7), day: lerp(k0[8], k1[8], t), windows: lerp(k0[9], k1[9], t),
  };
}

function phaseOf(h) {
  if (h >= 20.5 || h < 4.5) return 'night';
  if (h < 6) return 'predawn';
  if (h < 7.5) return 'sunrise';
  if (h < 17.5) return 'day';
  return 'dusk';
}

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.1, 'rgba(255,255,255,1)');
  gr.addColorStop(0.14, 'rgba(255,255,255,.85)'); gr.addColorStop(0.3, 'rgba(255,240,210,.35)');
  gr.addColorStop(0.6, 'rgba(255,220,170,.10)'); gr.addColorStop(1, 'rgba(255,220,170,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class SkySystem {
  init(game) {
    this.game = game;
    const geo = new THREE.SphereGeometry(300, 24, 16);
    const col = new Float32Array(geo.attributes.position.count * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -2;
    this.dome.onBeforeRender = (_r, _s, camera) => { this.dome.position.copy(camera.position); this.dome.updateMatrixWorld(); };
    game.scene.add(this.dome);

    // sun / moon disc + halo (one additive sprite, never fogged, hidden behind towers by depth)
    this.disc = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffe9b0, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending }));
    this.disc.renderOrder = -1;
    this.disc.scale.setScalar(150);
    this.disc.frustumCulled = false;
    game.scene.add(this.disc);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 1); // no shadows by design (PLAN section 4)
    this.sun.position.set(-40, 80, 30);
    game.scene.add(this.hemi, this.sun);
    game.scene.fog = new THREE.Fog(STATIC_DEFAULT.fog, STATIC_DEFAULT.fogNear, STATIC_DEFAULT.fogFar);
    game.scene.background = new THREE.Color(STATIC_DEFAULT.fog);

    this.dynamic = false;
    this.hour = 8;
    this.phase = phaseOf(8);
    this.dayFactor = 1;
    this.sunDir = new THREE.Vector3(0, 1, 0);
    this._key = null;
    this._domeKey = '';
    this.setPalette({});
    game.events.on('debug:setTime', ({ hour }) => this.setTimeOfDay(hour));
  }

  /** Static palette (leaves dynamic time-of-day mode). */
  setPalette(p) {
    this.dynamic = false;
    this.disc.visible = false;
    const s = this.game.scene;
    this.palette = { ...(this.palette ?? STATIC_DEFAULT), ...p };
    p = this.palette;
    s.fog.color.set(p.fog); s.fog.near = p.fogNear; s.fog.far = p.fogFar;
    s.background.set(p.fog);
    this.hemi.color.set(p.hemiSky); this.hemi.groundColor.set(p.hemiGround); this.hemi.intensity = p.hemiIntensity;
    this.sun.color.set(p.sunColor); this.sun.intensity = p.sunIntensity;
    this._paintDome(new THREE.Color(p.horizon), new THREE.Color(p.zenith));
  }

  _paintDome(h, z) {
    const pos = this.dome.geometry.attributes.position, col = this.dome.geometry.attributes.color;
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = Math.pow(Math.max(0, pos.getY(i) / 300), 0.55);
      c.copy(h).lerp(z, t);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }

  /** Hour 0..24. Dynamic palette; see the header comment. */
  setTimeOfDay(hour) {
    const changed = !this.dynamic || Math.abs(hour - this.hour) > 0.005;
    if (!changed) return;                                                  // cheap to call every frame
    this.dynamic = true;
    this.hour = ((hour % 24) + 24) % 24;
    this._key = keyAt(this.hour);
    this.phase = phaseOf(this.hour);
    this.dayFactor = this._dayFactor(this.hour);
    // sun direction: east (+X) at 06:00, overhead at noon, west at 18:00, leaning south (+Z)
    const night = this.hour < 6 || this.hour >= 18;
    // by night the same arc is followed by a dim moon (rises in the east at 18:00)
    const ang = night ? ((this.hour >= 18 ? this.hour - 18 : this.hour + 6) / 12) * Math.PI : ((this.hour - 6) / 12) * Math.PI;
    this.sunDir.set(Math.cos(ang), Math.max(0.12, Math.sin(ang)) * 0.95, 0.38).normalize();
    this.sun.position.copy(this.sunDir).multiplyScalar(120);
    // window glow and the shafts follow the day
    const mats = this.game.materials;
    mats.building.emissiveIntensity = this._key.windows;
    mats.buildingMid.emissiveIntensity = this._key.windows * 0.76;
    mats.buildingLow.emissiveIntensity = this._key.windows * 0.5;
    const shafts = this.game.world?.sunShafts;
    if (shafts) shafts.intensity = this.dayFactor;
    this._applyLevel(changed);
    if (changed) this.game.events.emit('sky:time', { hour: this.hour, phase: this.phase, dayFactor: this.dayFactor });
  }

  _dayFactor(h) {
    if (h < 5.8 || h >= 18.7) return 0;
    if (h < 6.8) return (h - 5.8);
    if (h < 17.5) return 1;
    return 1 - (h - 17.5) / 1.2;
  }

  /** Smooth atmosphere by altitude: interpolate LEVEL_ATMOS at the player's feet. */
  _atmos(y) {
    const A = LEVEL_ATMOS;
    if (y <= A[0][0]) return A[0].slice(1);
    for (let i = 0; i < A.length - 1; i++) {
      if (y <= A[i + 1][0]) {
        const t = (y - A[i][0]) / (A[i + 1][0] - A[i][0]);
        const s = t * t * (3 - 2 * t);
        return A[i].slice(1).map((v, j) => lerp(v, A[i + 1][j + 1], s));
      }
    }
    return A[A.length - 1].slice(1);
  }

  _applyLevel(force = false) {
    if (!this.dynamic || !this._key) return;
    const k = this._key, y = this.game.player?.pos.y ?? 12;
    const [gloom, near, far, hemiMul, sunMul] = this._atmos(y);
    const sc = this.game.scene;
    // fog: teal murk (scaled by how bright the day is) below, hazy ochre above
    const dayLevel = 0.35 + 0.65 * k.day;
    _a.copy(TEAL).multiplyScalar(dayLevel).lerp(TEAL_DEEP, Math.max(0, Math.min(1, (-y) / 8 * 0.6 + (y < -2 ? 0.2 : 0))));
    _b.copy(k.haze);
    sc.fog.color.copy(_b).lerp(_a, gloom);
    sc.fog.near = near; sc.fog.far = far;
    sc.background.copy(sc.fog.color);
    this.hemi.color.copy(k.haze).lerp(HEMI_GLOOM, gloom * 0.7);
    this.hemi.groundColor.set(0x5a6860).lerp(_b.set(0x8a7658), 1 - gloom);
    this.hemi.intensity = k.hemiIntensity * hemiMul;
    this.sun.color.copy(k.sunColor);
    this.sun.intensity = k.sunIntensity * sunMul;
    // dome: warm sky tinted mildly by gloom so patches of sky between towers read as hazy ochre
    const key = `${this.hour.toFixed(2)}|${gloom.toFixed(2)}`;
    if (force || key !== this._domeKey) {
      this._domeKey = key;
      const dg = _c.copy(k.horizon).lerp(_d.copy(TEAL).multiplyScalar(0.8 + 0.4 * k.day), gloom * 0.35);
      this._paintDome(dg, _a.copy(k.zenith).lerp(TEAL_DEEP, gloom * 0.25));
    }
    // sun / moon disc
    this.disc.visible = true;
    this.disc.material.color.copy(k.disc);
    this.disc.material.opacity = Math.max(0.0, Math.min(1, 0.25 + k.day * 0.9));
    const cam = this.game.camera;
    this.disc.position.copy(cam.position).addScaledVector(this.sunDir, 250);
    this.disc.scale.setScalar(this.dayFactor > 0.02 || this.phase !== 'night' ? 150 + 60 * (1 - Math.min(1, this.sunDir.y * 1.6)) : 50);
  }

  update() { this._applyLevel(); }
}
