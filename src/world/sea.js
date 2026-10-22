// The sea (west, south and east of the land, plus a strip north of the wall) and the water in the
// underground breach chamber.
//
//   world.seaLevel                      y of the sea surface (-2.4)
//   world.inSea(pos)                    true when pos is over the water (outside the land rectangle)
//   world.breachWater = { y, setLevel(y), rect, mesh }   Phase 4 raises this; starts at the sump (-10.9)
import * as THREE from 'three';

function rippleTexture(size = 128, seed = 3) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  let s = seed >>> 0; const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  g.fillStyle = '#7f9a9a'; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i++) {
    const v = 120 + rnd() * 100;
    g.strokeStyle = `rgba(${v},${v + 10},${v + 8},${0.10 + rnd() * 0.16})`; g.lineWidth = 1 + rnd() * 2;
    const x = rnd() * size, y = rnd() * size, w = 6 + rnd() * 22;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y + (rnd() - 0.5) * 3); g.stroke();
    // wrap so the tile repeats cleanly
    g.beginPath(); g.moveTo(x - size, y); g.lineTo(x - size + w, y + (rnd() - 0.5) * 3); g.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Sea {
  constructor(game, map) {
    this.game = game; this.map = map;
    this.level = map.seaLevel;
    const L = map.land, F = 1600;
    const quad = (x0, z0, x1, z1) => [x0, 0, z0, x0, 0, z1, x1, 0, z1, x0, 0, z0, x1, 0, z1, x1, 0, z0];
    const pos = [
      ...quad(-F, -F, L.minX, F),            // west
      ...quad(L.maxX, -F, F, F),             // east
      ...quad(L.minX, L.maxZ, L.maxX, F),    // south
      ...quad(L.minX, -F, L.maxX, L.minZ - 12), // north of the wall
    ];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const uv = []; for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] / 30, pos[i + 2] / 30);
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeBoundingSphere();
    this.tex = rippleTexture();
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, color: 0x2c5a5c });
    game.materials.all.push(this.mat);
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.position.y = this.level;
    this.mesh.frustumCulled = false;
    this.mesh.name = 'sea';
    game.scene.add(this.mesh);

    // ---- breach chamber water: one plane over the whole chamber, hidden under the floor until the
    // level rises above -8 (the floor boxes occlude it); visible in the sump from the start.
    const bc = map.breachChamber, r = bc.rect;
    const wg = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0); wg.rotateX(-Math.PI / 2);
    const wuv = wg.attributes.uv; for (let i = 0; i < wuv.count; i++) wuv.setXY(i, wuv.getX(i) * 8, wuv.getY(i) * 6);
    this.wtex = rippleTexture(128, 11);
    this.wmat = new THREE.MeshBasicMaterial({ map: this.wtex, color: 0x2d6a86, transparent: true, opacity: 0.82 });
    game.materials.all.push(this.wmat);
    const wm = new THREE.Mesh(wg, this.wmat);
    wm.position.set((r.x0 + r.x1) / 2, bc.waterY, (r.z0 + r.z1) / 2);
    wm.name = 'breach-water';
    game.scene.add(wm);
    const self = this;
    this.breachWater = {
      y: bc.waterY, rect: r, mesh: wm, baseY: bc.waterY,
      setLevel(y) { this.y = y; wm.position.y = y; },
    };
    void self;
  }

  /** Over the water: outside the land rectangle (west, south or east of it). */
  inSea(p) {
    const L = this.map.land;
    return p.x < L.minX || p.x > L.maxX || p.z > L.maxZ;
  }

  update(dt) {
    this.tex.offset.x += dt * 0.012; this.tex.offset.y += dt * 0.007;
    this.wtex.offset.x -= dt * 0.02; this.wtex.offset.y += dt * 0.015;
  }
}
