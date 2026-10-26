// The crowd's faces (Phase 8D): one small shared atlas of painted expressions for the instanced pedestrians.
//
// The cast's own atlas (src/characters/face.js) is lazy and shared with the cast's expressions; the crowd paints its own, once, at
// start-up: 5 looks (man, older man with grey brows, woman, woman with a bindi, child) x 7 expressions (neutral, smile, two talking
// mouths, worry, blink, asleep). The cells use the same layout as the cast's face patch (eyes at 38 % height, brows at 25 %, nose at
// 58 %, mouth at 83 %), so the head UVs baked by bake.js line up. The paint is alpha only where there is a feature, so one atlas serves
// every skin tone (the instance's skin colour shows through).
//
//   const atlas = makeFaceAtlas();
//   atlas.texture                 THREE.CanvasTexture (sRGB, mipmapped)
//   atlas.size                    [du, dv] the size of one cell in uv units
//   atlas.cell(look, expr)        [u0, v0]  look: index into LOOKS; expr: index into EXPR
import * as THREE from '../../../vendor/three.module.js';

export const EXPR = ['neutral', 'smile', 'talkA', 'talkB', 'worry', 'blink', 'sleep'];
export const X = Object.fromEntries(EXPR.map((n, i) => [n, i]));
export const LOOKS = ['m', 'mOld', 'f', 'fBindi', 'kid'];
export const L = Object.fromEntries(LOOKS.map((n, i) => [n, i]));

const CELL = 64;

function ellipse(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); }

function paintCell(g, x0, y0, look, ex) {
  const S = CELL, kid = look === 'kid', fem = look === 'f' || look === 'fBindi', old = look === 'mOld';
  g.save();
  g.beginPath(); g.rect(x0, y0, S, S); g.clip();
  g.translate(x0, y0);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const eyeY = S * (0.38 + (kid ? 0.025 : 0)), eyeX = S * (0.255 - (kid ? 0.012 : 0)), eyeW = S * (0.19 + (kid ? 0.04 : 0));
  // the cheek shadow and the folds from the nose to the mouth
  g.strokeStyle = `rgba(70,36,28,${old ? 0.3 : 0.15})`; g.lineWidth = S * 0.012;
  for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(S / 2 + sx * S * 0.17, S * 0.66); g.quadraticCurveTo(S / 2 + sx * S * 0.27, S * 0.76, S / 2 + sx * S * 0.25, S * 0.85); g.stroke(); }
  if (ex === 'smile') for (const sx of [-1, 1]) { const gr = g.createRadialGradient(S / 2 + sx * S * 0.27, S * 0.62, 0, S / 2 + sx * S * 0.27, S * 0.62, S * 0.13); gr.addColorStop(0, 'rgba(190,80,70,.2)'); gr.addColorStop(1, 'rgba(190,80,70,0)'); g.fillStyle = gr; g.fillRect(S * 0.2, S * 0.45, S * 0.6, S * 0.35); }
  // eyes
  const open = ex === 'blink' || ex === 'sleep' ? 0 : ex === 'smile' ? 0.8 : ex === 'worry' ? 1.0 : 0.95;
  for (const sx of [-1, 1]) {
    const x = S / 2 + sx * eyeX, y = eyeY, w = eyeW, h = w * 0.5 * open;
    g.strokeStyle = 'rgba(24,14,12,.95)';
    if (open < 0.1) {
      g.lineWidth = S * (fem ? 0.024 : 0.019);
      g.beginPath(); g.moveTo(x - w * 0.5, y); g.quadraticCurveTo(x, y + w * (ex === 'sleep' ? 0.2 : 0.13), x + w * 0.5, y - w * 0.02); g.stroke();
      continue;
    }
    g.save();
    g.beginPath(); g.moveTo(x - w * 0.5, y + w * 0.02); g.quadraticCurveTo(x, y - h * 1.55, x + w * 0.5, y - w * 0.02); g.quadraticCurveTo(x, y + h * 1.0, x - w * 0.5, y + w * 0.02); g.closePath(); g.clip();
    g.fillStyle = '#efe9e0'; g.fillRect(x - w, y - w, w * 2, w * 2);
    const ir = w * 0.28 * (kid ? 1.12 : 1);
    g.fillStyle = '#2b1a12'; ellipse(g, x, y - h * 0.05, ir, ir * 1.02); g.fill();
    g.fillStyle = '#0b0706'; ellipse(g, x, y - h * 0.05, ir * 0.5, ir * 0.5); g.fill();
    g.fillStyle = 'rgba(255,255,255,.85)'; ellipse(g, x - ir * 0.32, y - h * 0.3, ir * 0.2, ir * 0.2); g.fill();
    g.restore();
    g.lineWidth = S * (fem ? 0.026 : 0.02);
    g.beginPath(); g.moveTo(x - w * 0.52, y + w * 0.03); g.quadraticCurveTo(x - w * 0.02, y - h * 1.62, x + w * 0.52, y - w * 0.02); g.stroke();
    if (fem) { g.lineWidth = S * 0.012; g.beginPath(); g.moveTo(x + sx * w * 0.48, y - w * 0.02); g.lineTo(x + sx * w * 0.66, y - w * 0.1); g.stroke(); }
    g.strokeStyle = 'rgba(70,36,28,.3)'; g.lineWidth = S * 0.01;
    g.beginPath(); g.moveTo(x - w * 0.38, y + h * 0.65); g.quadraticCurveTo(x, y + h * 1.25, x + w * 0.4, y + h * 0.62); g.stroke();
  }
  // brows: from the inner end (towards the nose) to the outer end; worry lifts the inner ends
  const inner = ex === 'worry' ? 0.9 : ex === 'smile' ? 0.15 : 0.0, outer = ex === 'worry' ? -0.4 : ex === 'smile' ? 0.25 : 0.0;
  const thick = S * (old ? 0.028 : fem ? 0.022 : kid ? 0.024 : 0.032);
  g.fillStyle = old ? 'rgba(170,166,160,.95)' : 'rgba(24,16,12,.92)';
  for (const sx of [-1, 1]) {
    const x = S / 2 + sx * eyeX, w = eyeW, ix = x - sx * w * 0.52, ox = x + sx * w * 0.62, by = S * 0.255;
    const iy = by - inner * S * 0.085, oy = by - outer * S * 0.055 - S * 0.008, my = Math.min(iy, oy) - S * 0.018;
    g.beginPath(); g.moveTo(ix, iy + thick * 0.35); g.quadraticCurveTo((ix + ox) / 2, my - thick * 0.2, ox, oy); g.quadraticCurveTo((ix + ox) / 2, my + thick * 1.55, ix, iy + thick * 0.9); g.closePath(); g.fill();
  }
  // nose: nostrils and the shadow beside the bridge
  const nx = S / 2, ny = S * 0.585, nw = S * 0.2;
  g.fillStyle = 'rgba(48,22,16,.5)';
  ellipse(g, nx - nw * 0.2, ny + nw * 0.05, nw * 0.07, nw * 0.045, -0.4); g.fill();
  ellipse(g, nx + nw * 0.2, ny + nw * 0.05, nw * 0.07, nw * 0.045, 0.4); g.fill();
  g.strokeStyle = 'rgba(60,30,22,.3)'; g.lineWidth = S * 0.012;
  for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(nx + sx * nw * 0.3, ny - nw * 0.2); g.quadraticCurveTo(nx + sx * nw * 0.36, ny + nw * 0.02, nx + sx * nw * 0.28, ny + nw * 0.08); g.stroke(); }
  if (look === 'fBindi') { g.fillStyle = '#a82a22'; ellipse(g, S / 2, S * 0.215, S * 0.024, S * 0.028); g.fill(); }
  // the mouth
  const cx = S / 2, cy = S * 0.83, w = S * 0.3, lip = fem ? 'rgba(150,56,64,.9)' : 'rgba(150,72,66,.8)', lipLow = fem ? 'rgba(122,44,50,.92)' : 'rgba(120,58,54,.85)';
  if (ex === 'talkA' || ex === 'talkB') {
    const hw = w * (ex === 'talkA' ? 0.46 : 0.36), hh = w * (ex === 'talkA' ? 0.36 : 0.2);
    g.fillStyle = 'rgba(40,12,14,.97)'; ellipse(g, cx, cy + hh * 0.2, hw, hh); g.fill();
    g.fillStyle = 'rgba(234,228,216,.9)'; g.fillRect(cx - hw * 0.7, cy + hh * 0.2 - hh * 0.85, hw * 1.4, hh * 0.38);
    g.strokeStyle = lip; g.lineWidth = S * 0.02; ellipse(g, cx, cy + hh * 0.2, hw, hh); g.stroke();
  } else {
    const curve = ex === 'smile' ? -w * 0.2 : ex === 'worry' ? w * 0.16 : 0, half = w * (ex === 'smile' ? 0.56 : 0.46);
    g.fillStyle = lip;
    g.beginPath(); g.moveTo(cx - half, cy + curve * 0.4); g.quadraticCurveTo(cx - half * 0.35, cy - w * 0.15 + curve * 0.3, cx, cy - w * 0.1); g.quadraticCurveTo(cx + half * 0.35, cy - w * 0.15 + curve * 0.3, cx + half, cy + curve * 0.4); g.quadraticCurveTo(cx, cy + curve * 1.2 + w * 0.02, cx - half, cy + curve * 0.4); g.fill();
    g.fillStyle = lipLow;
    g.beginPath(); g.moveTo(cx - half * 0.9, cy + curve * 0.45); g.quadraticCurveTo(cx, cy + curve * 1.3 + w * 0.3, cx + half * 0.9, cy + curve * 0.45); g.quadraticCurveTo(cx, cy + curve * 1.2 + w * 0.02, cx - half * 0.9, cy + curve * 0.45); g.fill();
    g.strokeStyle = 'rgba(48,22,20,.8)'; g.lineWidth = S * 0.012;
    g.beginPath(); g.moveTo(cx - half, cy + curve * 0.4); g.quadraticCurveTo(cx, cy + curve * 1.25 + w * 0.02, cx + half, cy + curve * 0.4); g.stroke();
  }
  g.restore();
}

export function makeFaceAtlas() {
  const cols = EXPR.length, rows = LOOKS.length;
  const W = cols * CELL, H = rows * CELL;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const e = 0.5;                                                          // inset by half a texel so filtering does not bleed from the neighbour
  const uv = [];
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    paintCell(g, c * CELL, r * CELL, LOOKS[r], EXPR[c]);
    uv[r * cols + c] = [(c * CELL + e) / W, 1 - ((r + 1) * CELL - e) / H];
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.magFilter = THREE.LinearFilter; tex.anisotropy = 4;
  tex.needsUpdate = true;
  return { texture: tex, canvas, size: [(CELL - 2 * e) / W, (CELL - 2 * e) / H], cell: (look, expr) => uv[look * cols + expr], dispose: () => tex.dispose() };
}
