// The platform indicator boards: ten small lit boards (one per platform) hung on the columns, showing the next train's destination and
// its ETA, redrawn once a second while you are within earshot of a station. One canvas atlas, one mesh, one draw call.
import * as THREE from '../../../vendor/three.module.js';

const CW = 512, CH = 72, COLS = 2, ROWS = 5;
const DEST = { east: ['शिवडी  SEWRI', 'सेवरी'], west: ['माहीम जं.  MAHIM JN', 'माहीम'] };

export class IndicatorBoards {
  constructor(game, transit) {
    this.game = game; this.transit = transit; this.t = 0; this.cells = [];
    const canvas = this.canvas = document.createElement('canvas');
    canvas.width = CW * COLS; canvas.height = 512;
    this.g = canvas.getContext('2d');
    this.tex = new THREE.CanvasTexture(canvas); this.tex.colorSpace = THREE.SRGBColorSpace; this.tex.anisotropy = 2;
    const pos = [], uv = [], R = transit.R;
    let n = 0;
    for (const st of transit.stations) {
      for (const side of ['north', 'south']) {
        const P = R.platforms[side], zMid = (P.z0 + P.z1) / 2;
        const col = side === 'north' ? 0 : 1, row = transit.stations.indexOf(st);
        const u0 = col * CW / canvas.width, u1 = (col + 1) * CW / canvas.width, v1 = 1 - row * CH / canvas.height, v0 = 1 - (row + 1) * CH / canvas.height;
        const faceDir = side === 'north' ? -1 : 1;               // away from the track, toward the back of the platform... boards face the walkway AND the track
        const x = st.x + 5, w = 1.9, h = 0.27, y = 2.55;
        for (const f of [1, -1]) {
          const z = zMid + f * 0.2;
          const xs = f > 0 ? [x - w / 2, x + w / 2] : [x + w / 2, x - w / 2];
          const q = [[xs[0], y - h, z, u0, v0], [xs[1], y - h, z, u1, v0], [xs[1], y + h, z, u1, v1], [xs[0], y + h, z, u0, v1]];
          for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(q[i][0], q[i][1], q[i][2]); uv.push(q[i][3], q[i][4]); }
        }
        this.cells.push({ st, side, dir: side === 'north' ? 'east' : 'west', col, row, text: '' });
        void faceDir; n++;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeBoundingSphere();
    const mat = new THREE.MeshBasicMaterial({ map: this.tex, side: THREE.DoubleSide });
    game.materials.all.push(mat);
    this.mesh = new THREE.Mesh(geo, mat); this.mesh.name = 'rail-boards'; game.scene.add(this.mesh);
    this.draw();
  }

  draw() {
    const g = this.g;
    g.fillStyle = '#05090a'; g.fillRect(0, 0, this.canvas.width, this.canvas.height);
    for (const c of this.cells) {
      const x = c.col * CW, y = c.row * CH, eta = c.st.eta[c.dir];
      const secs = isFinite(eta) ? Math.max(0, Math.round(eta)) : null;
      const t = secs == null ? '--' : secs < 8 ? 'ARRIVING' : secs < 60 ? `${secs} s` : `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
      const near = secs != null && secs < 20;
      g.fillStyle = '#0b1214'; g.fillRect(x + 2, y + 2, CW - 4, CH - 4);
      g.strokeStyle = near ? '#ff6a4a' : '#ffd45a'; g.lineWidth = 3; g.strokeRect(x + 5, y + 5, CW - 10, CH - 10);
      g.fillStyle = near ? '#ff9a7a' : '#ffd45a'; g.textBaseline = 'middle';
      g.font = 'bold 27px "Noto Sans Devanagari", "Noto Sans", Verdana, sans-serif'; g.textAlign = 'left';
      g.fillText(DEST[c.dir][0], x + 18, y + CH / 2 + 1);
      g.textAlign = 'right'; g.font = 'bold 32px "Noto Sans", Verdana, sans-serif'; g.fillText(t, x + CW - 18, y + CH / 2 + 1);
    }
    this.tex.needsUpdate = true;
  }

  update(dt) {
    this.t -= dt;
    if (this.t > 0) return;
    this.t = 1;
    const p = this.game.player.pos, R = this.transit.R;
    if (!this.transit.stations.some((s) => Math.hypot(p.x - s.x, p.z - R.zc) < 90 && Math.abs(p.y) < 8)) return;
    this.draw();
  }
}
