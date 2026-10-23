// Lit text signs. All labels share one canvas atlas (one draw call, one texture): add() as many as
// you like during the build, then build() once to get a single mesh.
import * as THREE from 'three';
import { TONE } from './structures.js';

const FONT = '"Noto Sans Devanagari", "Noto Sans", FreeSans, "Trebuchet MS", Verdana, sans-serif';
const CELL_W = 512, CELL_H = 96, ATLAS = 1024;

export class Labels {
  constructor(game) { this.game = game; this.items = []; }

  /** {text, x,y,z, dir:'+x'|'-x'|'+z'|'-z' (facing), w, h, tone} */
  add(l) { this.items.push(l); }

  build() {
    const keys = [...new Set(this.items.map((l) => `${l.text}|${l.tone ?? 'free'}`))];
    const cols = ATLAS / CELL_W, rows = Math.ceil(keys.length / cols);
    const canvas = document.createElement('canvas');
    canvas.width = ATLAS; canvas.height = Math.max(CELL_H, Math.ceil(rows * CELL_H));
    // power-of-two height keeps older GPUs happy
    let H = 128; while (H < canvas.height) H *= 2; canvas.height = H;
    const g = canvas.getContext('2d');
    g.fillStyle = '#05090a'; g.fillRect(0, 0, canvas.width, canvas.height);
    const cell = new Map();
    keys.forEach((k, i) => {
      const [text, tone] = k.split('|');
      const cx = (i % cols) * CELL_W, cy = Math.floor(i / cols) * CELL_H;
      const color = '#' + (TONE[tone] ?? 0xffb347).toString(16).padStart(6, '0');
      g.fillStyle = '#0a1214'; g.fillRect(cx + 2, cy + 2, CELL_W - 4, CELL_H - 4);
      g.strokeStyle = color; g.lineWidth = 5; g.strokeRect(cx + 6, cy + 6, CELL_W - 12, CELL_H - 12);
      g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
      let size = 58;
      g.font = `bold ${size}px ${FONT}`;
      while (g.measureText(text).width > CELL_W - 52 && size > 20) { size -= 3; g.font = `bold ${size}px ${FONT}`; }
      g.fillText(text, cx + CELL_W / 2, cy + CELL_H / 2 + 3);
      cell.set(k, { u0: cx / ATLAS, u1: (cx + CELL_W) / ATLAS, v0: 1 - (cy + CELL_H) / canvas.height, v1: 1 - cy / canvas.height });
    });
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    const pos = [], uv = [];
    const rotY = { '+z': 0, '-z': Math.PI, '+x': Math.PI / 2, '-x': -Math.PI / 2 };
    for (const l of this.items) {
      const c = cell.get(`${l.text}|${l.tone ?? 'free'}`);
      const a = rotY[l.dir], ca = Math.cos(a), sa = Math.sin(a);
      const hw = l.w / 2, hh = l.h / 2;
      const pts = [[-hw, -hh, c.u0, c.v0], [hw, -hh, c.u1, c.v0], [hw, hh, c.u1, c.v1], [-hw, hh, c.u0, c.v1]];
      const V = pts.map(([x, y, u, v]) => [l.x + x * ca, l.y + y, l.z - x * sa, u, v]);
      for (const i of [0, 1, 2, 0, 2, 3]) { pos.push(V[i][0], V[i][1], V[i][2]); uv.push(V[i][3], V[i][4]); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.computeBoundingSphere();
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.FrontSide });
    this.game.materials.all.push(mat);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = 'labels';
    this.game.scene.add(mesh);
    this.mesh = mesh;
    return mesh;
  }
}
