// The face (Phase 8C): a painted atlas of expressions drawn at run time (no image files) and a small curved patch of geometry
// that sits on the front of the head just proud of the skull. The patch is alpha-blended, so ONE atlas serves every skin tone:
// eyes, brows, nose shading, lips, glasses and age lines are painted on transparent cells. A person costs one extra draw call.
//
//   atlas = faceAtlas()                               the shared canvas texture (lazy cells)
//   cell  = atlas.cell(look, expression)              -> { u0, v0, u1, v1 } allocates and paints the cell on first use
//   patch = makeFacePatch(headHeight, child)          -> { geometry, setCell(cell) }
//   look  = { lip: 0|1|2, brow: 'dark'|'grey', glasses: null|'dark'|'clear', age: 0|1|2, lash: bool, bindi: color|null, stubble: bool }
//   expressions: neutral blink smile grin talkA talkB talkC worry sad angry scared pain shout sleep awe smirk
import * as THREE from '../../vendor/three.module.js';

// ------------------------------------------------------------------------------------------ head shape (shared with the body)
/** Head profile in head-height units: [t (0 chin .. 1 crown), half width, front z, back z]. Front is -Z. */
export const HEAD = [
  [0.00, 0.060, -0.300, -0.090],
  [0.05, 0.150, -0.350, 0.010],
  [0.14, 0.250, -0.385, 0.200],
  [0.28, 0.320, -0.405, 0.350],
  [0.44, 0.350, -0.410, 0.420],
  [0.60, 0.355, -0.410, 0.455],
  [0.76, 0.335, -0.380, 0.450],
  [0.89, 0.280, -0.310, 0.405],
  [0.97, 0.170, -0.190, 0.270],
  [1.00, 0.020, -0.050, 0.100],
];
export function headAt(t) {
  const n = HEAD.length;
  t = Math.max(0, Math.min(1, t));
  let i = 0; while (i < n - 2 && t > HEAD[i + 1][0]) i++;
  const a = HEAD[i], b = HEAD[i + 1], k = (t - a[0]) / (b[0] - a[0]), s = k * k * (3 - 2 * k);
  return { hw: a[1] + (b[1] - a[1]) * s, fz: a[2] + (b[2] - a[2]) * s, bz: a[3] + (b[3] - a[3]) * s };
}
/** The nose, an ellipsoid in head units. */
export function noseOf(child) {
  return child ? { x: 0, y: 0.45, z: -0.395, rx: 0.05, ry: 0.07, rz: 0.05 } : { x: 0, y: 0.455, z: -0.405, rx: 0.058, ry: 0.088, rz: 0.062 };
}
const FACE_T0 = 0.17, FACE_T1 = 0.80, FACE_HW = 0.34;     // the painted region: t range and half width (head units)

// ------------------------------------------------------------------------------------------ painting
const CELL = 96;
const LIPS = ['rgba(176,84,86,.88)', 'rgba(150,68,64,.9)', 'rgba(112,52,50,.92)'];
const LIPS_LOW = ['rgba(150,60,66,.9)', 'rgba(126,52,50,.92)', 'rgba(92,40,38,.94)'];

// each expression: eye openness 0..1.2, brow [inner lift, outer lift, tilt], mouth id, extras
export const EXPR = {
  neutral: { eye: 0.95, brow: [0.0, 0.0], mouth: 'flat' },
  blink: { eye: 0.0, brow: [0.0, 0.0], mouth: 'flat' },
  smile: { eye: 0.82, brow: [0.2, 0.3], mouth: 'smile', cheek: 0.6 },
  grin: { eye: 0.7, brow: [0.3, 0.45], mouth: 'grin', cheek: 0.8 },
  smirk: { eye: 0.9, brow: [0.1, 0.5], mouth: 'smirk', cheek: 0.2 },
  talkA: { eye: 0.95, brow: [0.1, 0.1], mouth: 'openA' },
  talkB: { eye: 0.95, brow: [0.2, 0.1], mouth: 'openB' },
  talkC: { eye: 0.9, brow: [0.0, 0.1], mouth: 'openC' },
  worry: { eye: 1.0, brow: [0.8, -0.3], mouth: 'frown', tilt: 1 },
  sad: { eye: 0.75, brow: [0.9, -0.5], mouth: 'frown', tilt: 1 },
  angry: { eye: 0.85, brow: [-0.7, 0.2], mouth: 'tight', tilt: -1 },
  scared: { eye: 1.25, brow: [0.9, 0.5], mouth: 'openB', tilt: 1 },
  pain: { eye: 0.3, brow: [0.9, -0.2], mouth: 'grimace', tilt: 1 },
  shout: { eye: 0.9, brow: [-0.3, 0.3], mouth: 'openA', tilt: -1, wide: true },
  sleep: { eye: 0.0, brow: [0.0, -0.1], mouth: 'flat', sleep: true },
  awe: { eye: 1.2, brow: [0.5, 0.7], mouth: 'openC' },
};
export const EXPRESSIONS = Object.keys(EXPR);

function ellipse(g, x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2); }

function paintEye(g, x, y, w, open, look, ex, side) {
  const S = CELL, h = w * 0.5 * Math.max(0.0, open);
  const lash = look.lash ? 1.35 : 1;
  const hide = look.glasses === 'dark';
  if (hide) return;
  if (open < 0.12 || ex.sleep) {                                  // closed: a lash line curving down at the outer edge
    g.strokeStyle = 'rgba(28,18,14,.92)'; g.lineWidth = S * 0.017 * lash; g.lineCap = 'round';
    g.beginPath(); g.moveTo(x - w * 0.5, y); g.quadraticCurveTo(x, y + w * (ex.sleep ? 0.2 : 0.13), x + w * 0.5, y - w * 0.02); g.stroke();
    if (look.lash) { g.lineWidth = S * 0.008; g.beginPath(); g.moveTo(x + side * w * 0.46, y); g.lineTo(x + side * w * 0.62, y + w * 0.07); g.stroke(); }
    return;
  }
  // sclera
  g.save();
  g.beginPath();
  g.moveTo(x - w * 0.5, y + w * 0.02);
  g.quadraticCurveTo(x, y - h * 1.55, x + w * 0.5, y - w * 0.02);
  g.quadraticCurveTo(x, y + h * 1.0, x - w * 0.5, y + w * 0.02);
  g.closePath();
  g.clip();
  g.fillStyle = '#efe9e0'; g.fillRect(x - w, y - w, w * 2, w * 2);
  const gr = g.createLinearGradient(0, y - h * 1.4, 0, y + h);
  gr.addColorStop(0, 'rgba(60,30,24,.38)'); gr.addColorStop(0.5, 'rgba(60,30,24,0)'); gr.addColorStop(1, 'rgba(60,30,24,.12)');
  g.fillStyle = gr; g.fillRect(x - w, y - w, w * 2, w * 2);
  // iris and pupil
  const ix = x + (ex.gx ?? 0) * w * 0.12, ir = w * 0.27 * (ex.eye > 1.1 ? 0.92 : 1);
  g.fillStyle = look.iris ?? '#2b1a12'; ellipse(g, ix, y - h * 0.05, ir * (look.child ? 1.12 : 1), ir * (look.child ? 1.12 : 1.02)); g.fill();
  g.fillStyle = 'rgba(80,46,28,.85)'; ellipse(g, ix, y + ir * 0.18, ir * 0.82, ir * 0.55); g.fill();
  g.fillStyle = '#0b0706'; ellipse(g, ix, y - h * 0.05, ir * 0.48, ir * 0.5); g.fill();
  g.fillStyle = 'rgba(255,255,255,.9)'; ellipse(g, ix - ir * 0.32, y - h * 0.3, ir * 0.2, ir * 0.2); g.fill();
  g.restore();
  // upper lid line, crease, lower lid
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(24,14,12,.95)'; g.lineWidth = S * 0.0165 * lash;
  g.beginPath(); g.moveTo(x - w * 0.52, y + w * 0.03); g.quadraticCurveTo(x - w * 0.02, y - h * 1.62, x + w * 0.52, y - w * 0.02); g.stroke();
  if (look.lash) { g.lineWidth = S * 0.01; g.beginPath(); g.moveTo(x + side * w * 0.48, y - w * 0.02); g.lineTo(x + side * w * 0.66, y - w * 0.1); g.stroke(); }
  g.strokeStyle = 'rgba(70,36,28,.34)'; g.lineWidth = S * 0.008;
  g.beginPath(); g.moveTo(x - w * 0.42, y - h * 1.0); g.quadraticCurveTo(x, y - h * 2.35, x + w * 0.45, y - h * 1.0); g.stroke();
  g.strokeStyle = 'rgba(70,36,28,.28)';
  g.beginPath(); g.moveTo(x - w * 0.38, y + h * 0.65); g.quadraticCurveTo(x, y + h * 1.25, x + w * 0.4, y + h * 0.62); g.stroke();
  if (look.age) {                                                  // bags and crow's feet
    g.strokeStyle = `rgba(70,40,32,${0.18 * look.age})`; g.lineWidth = S * 0.01;
    g.beginPath(); g.moveTo(x - w * 0.4, y + h * 1.7); g.quadraticCurveTo(x, y + h * 2.4, x + w * 0.4, y + h * 1.7); g.stroke();
    for (let k = 0; k < 2 + look.age; k++) { g.beginPath(); g.moveTo(x + side * w * 0.6, y + (k - 1) * h * 0.5); g.lineTo(x + side * w * 0.9, y + (k - 1.4) * h * 0.9); g.stroke(); }
  }
}

function paintBrow(g, x, y, w, lift, side, look, ex) {
  const S = CELL, thick = S * (look.brow === 'grey' ? 0.022 : 0.026) * (look.heavyBrow ?? 1);
  const inner = ex.brow[0], outer = ex.brow[1];
  const col = look.brow === 'grey' ? 'rgba(168,164,158,.95)' : 'rgba(24,16,12,.92)';
  // from the inner end (towards the nose) to the outer end
  const ix = x - side * w * 0.52, ox = x + side * w * 0.62;
  const iy = y - inner * S * 0.045, oy = y - outer * S * 0.03 - S * 0.008;
  const my = Math.min(iy, oy) - S * 0.018 - Math.max(0, (inner + outer) * 0.5) * S * 0.008;
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(ix, iy + thick * 0.35);
  g.quadraticCurveTo((ix + ox) / 2, my - thick * 0.2, ox, oy);
  g.quadraticCurveTo((ix + ox) / 2, my + thick * 1.55, ix, iy + thick * 0.9);
  g.closePath(); g.fill();
}

function paintMouth(g, cx, cy, w, look, ex) {
  const S = CELL, lipC = LIPS[look.lip ?? 1], lowC = LIPS_LOW[look.lip ?? 1];
  g.lineCap = 'round'; g.lineJoin = 'round';
  const line = 'rgba(48,22,20,.85)';
  switch (ex.mouth) {
    case 'flat': case 'tight': case 'frown': case 'smile': case 'smirk': case 'grimace': {
      const curve = ex.mouth === 'smile' ? -w * 0.14 : ex.mouth === 'frown' ? w * 0.13 : ex.mouth === 'smirk' ? -w * 0.06 : ex.mouth === 'grimace' ? w * 0.03 : 0;
      const half = w * (ex.mouth === 'smile' ? 0.56 : ex.mouth === 'tight' ? 0.42 : 0.48);
      const slant = ex.mouth === 'smirk' ? w * 0.08 : 0;
      // lips
      g.fillStyle = lipC;
      g.beginPath(); g.moveTo(cx - half, cy + curve * 0.4);
      g.quadraticCurveTo(cx - half * 0.35, cy - w * 0.15 + curve * 0.3, cx, cy - w * 0.1);
      g.quadraticCurveTo(cx + half * 0.35, cy - w * 0.15 + curve * 0.3, cx + half, cy + curve * 0.4 - slant);
      g.quadraticCurveTo(cx, cy + curve * 1.2 + w * 0.02, cx - half, cy + curve * 0.4); g.fill();
      g.fillStyle = lowC;
      g.beginPath(); g.moveTo(cx - half * 0.9, cy + curve * 0.45);
      g.quadraticCurveTo(cx, cy + curve * 1.3 + w * 0.3 * (ex.mouth === 'tight' ? 0.35 : 1), cx + half * 0.9, cy + curve * 0.45 - slant);
      g.quadraticCurveTo(cx, cy + curve * 1.2 + w * 0.02, cx - half * 0.9, cy + curve * 0.45); g.fill();
      g.strokeStyle = line; g.lineWidth = S * 0.011;
      g.beginPath(); g.moveTo(cx - half, cy + curve * 0.4); g.quadraticCurveTo(cx, cy + curve * 1.25 + w * 0.02, cx + half, cy + curve * 0.4 - slant); g.stroke();
      if (ex.mouth === 'grimace') { g.fillStyle = 'rgba(235,228,214,.85)'; g.fillRect(cx - half * 0.7, cy + curve * 0.5 - w * 0.02, half * 1.4, w * 0.08); }
      break;
    }
    case 'grin': {
      const half = w * 0.6;
      g.fillStyle = 'rgba(48,18,18,.95)';
      g.beginPath(); g.moveTo(cx - half, cy - w * 0.12); g.quadraticCurveTo(cx, cy + w * 0.52, cx + half, cy - w * 0.12); g.quadraticCurveTo(cx, cy - w * 0.04, cx - half, cy - w * 0.12); g.fill();
      g.fillStyle = 'rgba(238,232,220,.95)';
      g.beginPath(); g.moveTo(cx - half * 0.88, cy - w * 0.1); g.quadraticCurveTo(cx, cy + w * 0.02, cx + half * 0.88, cy - w * 0.1); g.lineTo(cx + half * 0.8, cy + w * 0.03); g.quadraticCurveTo(cx, cy + w * 0.1, cx - half * 0.8, cy + w * 0.03); g.fill();
      g.strokeStyle = lipC; g.lineWidth = S * 0.014;
      g.beginPath(); g.moveTo(cx - half, cy - w * 0.12); g.quadraticCurveTo(cx, cy + w * 0.56, cx + half, cy - w * 0.12); g.stroke();
      break;
    }
    default: {                                                      // open mouths
      const wide = ex.mouth === 'openA' ? 0.46 : ex.mouth === 'openB' ? 0.38 : 0.22;
      const tall = ex.mouth === 'openA' ? 0.38 : ex.mouth === 'openB' ? 0.2 : 0.3;
      const hw = w * wide * (ex.wide ? 1.15 : 1), hh = w * tall * (ex.wide ? 1.2 : 1);
      g.fillStyle = 'rgba(40,12,14,.97)'; ellipse(g, cx, cy + hh * 0.2, hw, hh); g.fill();
      g.fillStyle = 'rgba(234,228,216,.95)';
      g.beginPath(); g.ellipse(cx, cy + hh * 0.2, hw * 0.86, hh * 0.9, 0, Math.PI * 1.1, Math.PI * 1.9); g.lineTo(cx + hw * 0.7, cy - hh * 0.2 + hh * 0.2); g.lineTo(cx - hw * 0.7, cy - hh * 0.2 + hh * 0.2); g.fill();
      g.fillStyle = 'rgba(150,56,60,.9)'; ellipse(g, cx, cy + hh * 0.75, hw * 0.55, hh * 0.35); g.fill();
      g.strokeStyle = lipC; g.lineWidth = S * 0.02; ellipse(g, cx, cy + hh * 0.2, hw, hh); g.stroke();
    }
  }
}

function paintNose(g, cx, y, w, look) {
  const S = CELL;
  g.fillStyle = 'rgba(48,22,16,.5)';
  ellipse(g, cx - w * 0.2, y + w * 0.05, w * 0.07, w * 0.045, -0.4); g.fill();
  ellipse(g, cx + w * 0.2, y + w * 0.05, w * 0.07, w * 0.045, 0.4); g.fill();
  g.strokeStyle = 'rgba(60,30,22,.3)'; g.lineWidth = S * 0.012; g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx - w * 0.3, y - w * 0.2); g.quadraticCurveTo(cx - w * 0.36, y + w * 0.02, cx - w * 0.28, y + w * 0.08); g.stroke();
  g.beginPath(); g.moveTo(cx + w * 0.3, y - w * 0.2); g.quadraticCurveTo(cx + w * 0.36, y + w * 0.02, cx + w * 0.28, y + w * 0.08); g.stroke();
  const gr = g.createLinearGradient(cx - w * 0.1, 0, cx + w * 0.1, 0);
  gr.addColorStop(0, 'rgba(255,240,220,0)'); gr.addColorStop(0.5, 'rgba(255,240,220,.18)'); gr.addColorStop(1, 'rgba(255,240,220,0)');
  g.fillStyle = gr; g.fillRect(cx - w * 0.1, y - w * 0.9, w * 0.2, w * 0.85);
  // philtrum
  g.strokeStyle = 'rgba(60,30,22,.16)'; g.lineWidth = S * 0.01;
  g.beginPath(); g.moveTo(cx - w * 0.06, y + w * 0.2); g.lineTo(cx - w * 0.06, y + w * 0.4); g.moveTo(cx + w * 0.06, y + w * 0.2); g.lineTo(cx + w * 0.06, y + w * 0.4); g.stroke();
}

function paintCell(g, x0, y0, look, name) {
  const ex = EXPR[name] ?? EXPR.neutral, S = CELL;
  g.save();
  g.beginPath(); g.rect(x0, y0, S, S); g.clip();
  g.translate(x0, y0);
  const kd = look.child ? 1 : 0, eyeY = S * (0.38 + 0.025 * kd), eyeX = S * (0.255 - 0.012 * kd), eyeW = S * (0.19 + 0.04 * kd);
  // blush and the shadow under the cheekbone
  if (ex.cheek || look.blush) {
    for (const sx of [-1, 1]) {
      const gr = g.createRadialGradient(S / 2 + sx * S * 0.27, S * 0.62, 0, S / 2 + sx * S * 0.27, S * 0.62, S * 0.13);
      gr.addColorStop(0, `rgba(190,80,70,${0.2 * (ex.cheek ?? 0.4)})`); gr.addColorStop(1, 'rgba(190,80,70,0)');
      g.fillStyle = gr; g.fillRect(S / 2 + sx * S * 0.27 - S * 0.15, S * 0.62 - S * 0.15, S * 0.3, S * 0.3);
    }
  }
  // nasolabial folds
  const fold = (ex.cheek ? 0.7 : 0.25) + (look.age ?? 0) * 0.3;
  g.strokeStyle = `rgba(70,36,28,${0.16 * fold})`; g.lineWidth = S * 0.012; g.lineCap = 'round';
  for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(S / 2 + sx * S * 0.17, S * 0.66); g.quadraticCurveTo(S / 2 + sx * S * 0.27, S * 0.76, S / 2 + sx * S * 0.25, S * 0.85); g.stroke(); }
  if (look.age) {                                                // forehead lines
    g.strokeStyle = `rgba(70,36,28,${0.13 * look.age})`; g.lineWidth = S * 0.009;
    for (let k = 0; k < 2 + look.age; k++) { g.beginPath(); g.moveTo(S * 0.25, S * (0.1 + k * 0.045)); g.quadraticCurveTo(S / 2, S * (0.075 + k * 0.045), S * 0.75, S * (0.1 + k * 0.045)); g.stroke(); }
  }
  // eyes
  const open = ex.eye * (look.glasses === 'dark' ? 1 : 1);
  paintEye(g, S / 2 - eyeX, eyeY, eyeW, open, look, ex, -1);
  paintEye(g, S / 2 + eyeX, eyeY, eyeW, open, look, ex, 1);
  // brows
  const browY = S * 0.255;
  if (!look.noBrow) { paintBrow(g, S / 2 - eyeX, browY, eyeW, 0, -1, look, ex); paintBrow(g, S / 2 + eyeX, browY, eyeW, 0, 1, look, ex); }
  // glasses
  if (look.glasses) {
    const dark = look.glasses === 'dark', lw = S * (dark ? 0.27 : 0.23), lh = S * (dark ? 0.2 : 0.16);
    g.lineWidth = S * (dark ? 0.02 : 0.013); g.strokeStyle = dark ? 'rgba(12,12,14,.98)' : 'rgba(34,30,26,.95)';
    for (const sx of [-1, 1]) {
      const cx = S / 2 + sx * eyeX, cy = eyeY + S * 0.005;
      g.beginPath(); g.ellipse(cx, cy, lw / 2, lh / 2, 0, 0, Math.PI * 2);
      if (dark) {
        g.fillStyle = 'rgba(14,16,20,.97)'; g.fill();
        g.fillStyle = 'rgba(180,200,220,.2)'; g.beginPath(); g.ellipse(cx - lw * 0.18, cy - lh * 0.2, lw * 0.16, lh * 0.1, -0.5, 0, Math.PI * 2); g.fill();
      } else { g.fillStyle = 'rgba(200,220,235,.1)'; g.fill(); }
      g.stroke();
      g.beginPath(); g.moveTo(cx + sx * lw / 2, cy - lh * 0.1); g.lineTo(cx + sx * (lw / 2 + S * 0.08), cy - lh * 0.15); g.stroke();   // temple arm
    }
    g.beginPath(); g.moveTo(S / 2 - eyeX + lw / 2, eyeY - S * 0.01); g.quadraticCurveTo(S / 2, eyeY - S * 0.04, S / 2 + eyeX - lw / 2, eyeY - S * 0.01); g.stroke();
  }
  paintNose(g, S / 2, S * 0.585, S * 0.2, look);
  // a bindi for some
  if (look.bindi) { g.fillStyle = look.bindi; ellipse(g, S / 2, S * 0.215 - 0, S * 0.022, S * 0.026); g.fill(); }
  // stubble/moustache shadow is done in vertex colours; the mouth
  paintMouth(g, S / 2, S * 0.83, S * 0.3, look, ex);
  g.restore();
}

// ------------------------------------------------------------------------------------------ the atlas
class FaceAtlas {
  constructor() {
    this.cols = 21; this.rows = 10;
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.cols * CELL; this.canvas.height = this.rows * CELL;
    this.g = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.texture.generateMipmaps = true;
    this.map = new Map(); this.next = 0; this.dirty = false;
  }

  cell(look, name = 'neutral') {
    const key = lookKey(look) + '|' + name;
    let c = this.map.get(key);
    if (c) return c;
    if (this.next >= this.cols * this.rows) return this.map.get(lookKey(look) + '|neutral') ?? this.map.values().next().value;
    const i = this.next++, cx = i % this.cols, cy = Math.floor(i / this.cols);
    paintCell(this.g, cx * CELL, cy * CELL, look, name);
    // inset by half a texel so bilinear filtering does not bleed from the neighbour
    const e = 0.5;
    c = { u0: (cx * CELL + e) / this.canvas.width, u1: ((cx + 1) * CELL - e) / this.canvas.width, v1: 1 - (cy * CELL + e) / this.canvas.height, v0: 1 - ((cy + 1) * CELL - e) / this.canvas.height };
    this.map.set(key, c);
    this.texture.needsUpdate = true;
    return c;
  }
}
const lookKey = (l) => `${l.child ? 'c' : ''}${l.lip ?? 1}${l.brow ?? 'd'}${l.glasses ?? '-'}${l.age ?? 0}${l.lash ? 'L' : ''}${l.bindi ?? ''}${l.iris ?? ''}${l.noBrow ? 'n' : ''}`;
let _atlas = null;
export function faceAtlas() { return (_atlas ??= new FaceAtlas()); }
export function disposeFaceAtlas() { _atlas = null; }

let _fmat = null;
export function faceMaterial(game) {
  if (_fmat) return _fmat;
  _fmat = new THREE.MeshLambertMaterial({ map: faceAtlas().texture, transparent: true, depthWrite: false, emissive: new THREE.Color(0x20262a), polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  game?.materials?.all?.push(_fmat);
  return _fmat;
}

// ------------------------------------------------------------------------------------------ the patch
/**
 * The curved face patch in head-local coordinates (origin at the chin, +Y up, front -Z), sized by `hh` (head height in metres).
 * Returns { geometry, setCell(cell) }: setCell remaps the UVs onto an atlas cell.
 */
export function makeFacePatch(hh, child = false, headScale = { w: 1, d: 1 }) {
  const NU = 13, NV = 11, nose = noseOf(child);
  const pos = [], nor = [], uv0 = [], idx = [];
  const lift = 0.014;
  for (let i = 0; i < NV; i++) {
    const v = i / (NV - 1), t = FACE_T0 + (FACE_T1 - FACE_T0) * v;
    const h = headAt(t), cz = (h.fz + h.bz) / 2, rz = (h.bz - h.fz) / 2 + lift, hw = (h.hw + lift) * headScale.w;
    for (let j = 0; j < NU; j++) {
      const u = j / (NU - 1), xn = (u * 2 - 1) * FACE_HW * headScale.w;
      const xe = Math.max(-hw * 0.98, Math.min(hw * 0.98, xn));
      let z = cz - rz * Math.sqrt(Math.max(0, 1 - (xe / hw) * (xe / hw))) * headScale.d;
      // the nose rises out of the patch
      const nx = (xn - nose.x) / nose.rx, ny = (t - nose.y) / nose.ry, q = 1 - nx * nx - ny * ny;
      if (q > 0) z = Math.min(z, nose.z - nose.rz * Math.sqrt(q) - 0.004);
      pos.push(xe * hh, t * hh, z * hh);
      const sx = xe / hw;
      nor.push(sx * 0.7, 0, -Math.sqrt(Math.max(0.05, 1 - sx * sx * 0.5)));
      uv0.push(1 - u, v);
    }
  }
  for (let i = 0; i < NV - 1; i++) for (let j = 0; j < NU - 1; j++) {
    const a = i * NU + j, b = a + 1, c = a + NU, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv0.slice(), 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  // orient so the normals point forward (-Z)
  const n = geo.attributes.normal;
  let fix = 0; for (let i = 0; i < n.count; i++) fix += n.getZ(i);
  if (fix > 0) { geo.setIndex(idx.map((v, k) => (k % 3 === 1 ? idx[k + 1] : k % 3 === 2 ? idx[k - 1] : v))); geo.computeVertexNormals(); }
  const uv = geo.attributes.uv;
  return {
    geometry: geo,
    setCell(c) {
      if (!c) return;
      for (let i = 0; i < uv.count; i++) {
        const u = uv0[i * 2], v = uv0[i * 2 + 1];
        uv.setXY(i, c.u0 + (c.u1 - c.u0) * u, c.v0 + (c.v1 - c.v0) * v);
      }
      uv.needsUpdate = true;
    },
  };
}
