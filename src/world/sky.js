// Sky dome, fog and global lights. Phase 1: one fixed gloomy palette; Phase 2/3 drive setPalette()
// from the clock (time of day) and per-level atmosphere.
//   game.sky.setPalette({ horizon, zenith, fog, fogNear, fogFar, sunColor, sunIntensity, hemiIntensity })
import * as THREE from 'three';

const DEFAULT = {
  horizon: 0x2b4a44, zenith: 0x0d1716, fog: 0x1c2f2c, fogNear: 35, fogFar: 170,
  sunColor: 0xffd7a0, sunIntensity: 1.3, hemiIntensity: 1.7, hemiSky: 0xbfd8d0, hemiGround: 0x3a3426,
};

export class SkySystem {
  init(game) {
    this.game = game;
    const geo = new THREE.SphereGeometry(300, 24, 16);
    const col = new Float32Array(geo.attributes.position.count * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
    this.dome.frustumCulled = false;
    this.dome.renderOrder = -1;
    this.dome.onBeforeRender = (_r, _s, camera) => { this.dome.position.copy(camera.position); this.dome.updateMatrixWorld(); };
    game.scene.add(this.dome);

    this.hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
    this.sun = new THREE.DirectionalLight(0xffffff, 1); // no shadows by design (PLAN section 4)
    this.sun.position.set(-40, 80, 30);
    game.scene.add(this.hemi, this.sun);
    game.scene.fog = new THREE.Fog(DEFAULT.fog, DEFAULT.fogNear, DEFAULT.fogFar);
    game.scene.background = new THREE.Color(DEFAULT.fog);
    this.setPalette(DEFAULT);
  }

  setPalette(p) {
    const s = this.game.scene;
    this.palette = { ...(this.palette ?? DEFAULT), ...p };
    p = this.palette;
    s.fog.color.set(p.fog); s.fog.near = p.fogNear; s.fog.far = p.fogFar;
    s.background.set(p.fog);
    this.hemi.color.set(p.hemiSky); this.hemi.groundColor.set(p.hemiGround); this.hemi.intensity = p.hemiIntensity;
    this.sun.color.set(p.sunColor); this.sun.intensity = p.sunIntensity;
    const pos = this.dome.geometry.attributes.position, col = this.dome.geometry.attributes.color;
    const h = new THREE.Color(p.horizon), z = new THREE.Color(p.zenith), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const t = Math.pow(Math.max(0, pos.getY(i) / 300), 0.6);
      c.copy(h).lerp(z, t);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }
}
