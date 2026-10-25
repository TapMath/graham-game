// The body of a person (Phase 8C): proportions, the skeleton and ONE skinned, vertex-coloured mesh holding skin, clothes, hair and
// props. The face is a separate patch (face.js). All sizes derive from the spec's height: about 7.5 heads for adults, 5.5 for children.
import * as THREE from '../../vendor/three.module.js';
import { MeshBuilder, spline, smooth, mix, clamp } from './loft.js';
import { headAt, noseOf } from './face.js';

// skeleton --------------------------------------------------------------------------------------------------
export const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'uarmL', 'farmL', 'handL', 'uarmR', 'farmR', 'handR',
  'thighL', 'shinL', 'footL', 'thighR', 'shinR', 'footR', 'braid1', 'braid2', 'braid3', 'cloak1', 'cloak2'];
export const B = Object.fromEntries(BONES.map((n, i) => [n, i]));
const PARENT = { hips: null, spine: 'hips', chest: 'spine', neck: 'chest', head: 'neck', uarmL: 'chest', farmL: 'uarmL', handL: 'farmL', uarmR: 'chest', farmR: 'uarmR', handR: 'farmR',
  thighL: 'hips', shinL: 'thighL', footL: 'shinL', thighR: 'hips', shinR: 'thighR', footR: 'shinR', braid1: 'head', braid2: 'braid1', braid3: 'braid2', cloak1: 'chest', cloak2: 'cloak1' };

export const ARM_TILT = 0.15;      // the arms hang a little away from the body in the bind pose

/** Every length of this person, in metres. */
export function dimsOf(spec) {
  const H = spec.height, kid = spec.build === 'child' ? 1 : spec.build === 'teen' ? 0.45 : 0, f = spec.sex === 'f' ? 1 : 0;
  const bw = { slim: 0.93, normal: 1, stocky: 1.13, child: 0.97, teen: 0.96, big: 1.4 }[spec.build] ?? 1;
  const rs = { slim: 0.92, normal: 1, stocky: 1.1, child: 0.92, teen: 0.94, big: 1.3 }[spec.build] ?? 1;
  const mx = (a, b) => mix(a, b, kid);
  const D = { H, kid, f, bw, rs };
  D.hh = H * mx(1 / 7.5, 1 / 5.6) * (1 + 0.02 * f);
  D.chinY = H - D.hh;
  D.shoulderY = H * mx(0.818, 0.765) - f * 0.004 * H;
  D.neckBaseY = D.shoulderY + H * mx(0.024, 0.02);
  D.chestY = H * mx(0.725, 0.685);
  D.waistY = H * mx(0.625, 0.595);
  D.hipY = H * mx(0.525, 0.48);
  D.crotchY = H * mx(0.472, 0.435);
  D.kneeY = H * mx(0.285, 0.255);
  D.ankleY = H * 0.04;
  D.shoulderX = H * mx(0.092, 0.08) * (1 - 0.1 * f) * ((1 + bw) / 2);
  D.legX = H * mx(0.054, 0.05) * (1 + 0.05 * f);
  D.elbowY = D.shoulderY - H * mx(0.19, 0.165);
  D.wristY = D.elbowY - H * mx(0.15, 0.125);
  D.handLen = H * mx(0.1, 0.092);
  D.armR = H * 0.0305 * rs * mix(1, 0.92, f);          // upper-arm radius
  D.legR = H * 0.054 * rs * mix(1, 1.04, f);           // thigh radius
  D.off = H * 0.0065;                                  // clothing thickness
  // compat with the old rigid model
  D.sw = D.shoulderX; D.hipW = D.legX; D.armLen = D.shoulderY - D.wristY; D.legLen = D.hipY; D.headR = D.hh / 2; D.legRadius = H * 0.032;
  return D;
}

/** World-space bind position of every bone. */
export function bindPositions(D) {
  const x = D.shoulderX, tilt = (y) => (D.shoulderY - y) * Math.tan(ARM_TILT);
  const P = {
    hips: [0, D.hipY, 0], spine: [0, D.waistY, 0], chest: [0, D.chestY, 0], neck: [0, D.neckBaseY, 0], head: [0, D.chinY + D.hh * 0.18, D.hh * 0.05],
    uarmL: [-x, D.shoulderY, 0], farmL: [-x - tilt(D.elbowY), D.elbowY, 0], handL: [-x - tilt(D.wristY), D.wristY, 0],
    uarmR: [x, D.shoulderY, 0], farmR: [x + tilt(D.elbowY), D.elbowY, 0], handR: [x + tilt(D.wristY), D.wristY, 0],
    thighL: [-D.legX, D.hipY, 0], shinL: [-D.legX, D.kneeY, 0], footL: [-D.legX, D.ankleY, 0],
    thighR: [D.legX, D.hipY, 0], shinR: [D.legX, D.kneeY, 0], footR: [D.legX, D.ankleY, 0],
    braid1: [0, D.chinY + D.hh * 0.2, D.hh * 0.42], braid2: [0, D.shoulderY - D.H * 0.1, D.H * 0.06], braid3: [0, D.waistY, D.H * 0.06],
    cloak1: [0, D.shoulderY, D.H * 0.05], cloak2: [0, D.waistY + D.H * 0.04, D.H * 0.07],
  };
  return P;
}
export const parentOf = (name) => PARENT[name];

// torso profile -------------------------------------------------------------------------------------------
function torsoProfile(D, spec) {
  const f = D.f, kid = D.kid, bw = D.bw, belly = spec.build === 'big' ? 1.25 : spec.build === 'stocky' ? 1.08 : 1;
  const H = D.H, mxk = (a) => a * (1 - 0.04 * kid);
  const row = (y, rx, rz, kx = 1, kz = 1) => [y, H * rx * kx * bw * (1 - 0.05 * kid), H * rz * kz * Math.pow(bw, 1.2)];
  const yHip = D.hipY + 0.012 * H, yRib = mix(D.waistY, D.chestY, 0.5), yUp = mix(D.chestY, D.shoulderY, 0.62);
  return [
    row(D.crotchY - 0.01 * H, 0.088, 0.064, 1 + 0.06 * f, 1),
    row(yHip, 0.098, 0.071, 1 + 0.08 * f, (1 + 0.05 * f) * belly),
    row(D.waistY, 0.084, 0.058, 1 - 0.1 * f, (1 - 0.05 * f) * belly * (1 + 0.1 * kid)),
    row(yRib, 0.094, 0.062, 1 - 0.1 * f, belly * (1 + 0.05 * kid)),
    row(D.chestY, 0.104, 0.066, 1 - 0.07 * f, 1 + 0.12 * f),
    row(yUp, 0.106, 0.061, 1 - 0.12 * f, 1 + 0.04 * f),
    row(D.shoulderY + 0.002 * H, 0.098, 0.052, 1 - 0.13 * f, 1),
    row(D.shoulderY + 0.02 * H, 0.064, 0.047, 1 - 0.05 * f, 1),
    row(D.neckBaseY + 0.012 * H, 0.04, 0.04),
  ].map((r) => [r[0], r[1] * mxk(1), r[2]]);
}

// the builder ---------------------------------------------------------------------------------------------
const col = (c) => new THREE.Color(c);
const shade = (c, k) => col(c).multiplyScalar(k);
const lighter = (c, k) => col(c).lerp(new THREE.Color(1, 1, 1), k);
const R = (n) => Math.round(n * 1000) / 1000;

/**
 * Build the geometry of one outfit. Returns { geometry, dims, hair, cane } where `geometry` has position, normal, color, skinIndex, skinWeight.
 * `spec` may include `_pose` hints used for the cane.
 */
export function buildBodyGeometry(spec) {
  const D = dimsOf(spec), H = D.H, hh = D.hh, P = bindPositions(D), off = D.off;
  const skin = col(spec.skin), skinDark = shade(skin, 0.86), top = spec.top, bottom = spec.bottom, jacket = spec.jacket, sc = spec.scarf;
  const tl = top.length;
  const fem = D.f > 0;
  const baggy = bottom.style === 'salwar';
  const age = spec.age ?? 0;
  const hairC = col(spec.hair?.color ?? 0x1a1512), style = spec.hair?.style ?? 'short';
  const T = torsoProfile(D, spec);
  const torsoR = (y) => { const [rx, rz] = spline(T, y); return { rx, rz }; };
  const mb = new MeshBuilder();
  const W = (a) => a;       // readability

  // ---- weights
  const wTorso = (x, y) => {
    const t1 = smooth(D.hipY - 0.03, D.waistY + 0.04, y), t2 = smooth(D.waistY + 0.02, D.chestY + 0.08, y);
    return [[B.hips, 1 - t1], [B.spine, t1 * (1 - t2)], [B.chest, t1 * t2]];
  };
  const wNeck = (x, y) => {
    const a = smooth(D.neckBaseY - 0.03, D.neckBaseY + 0.03, y), b = smooth(D.neckBaseY + 0.03, D.chinY + 0.02, y);
    return [[B.chest, 1 - a], [B.neck, a * (1 - b)], [B.head, a * b]];
  };
  const wHead = () => [[B.head, 1]];
  const wArm = (side) => (x, y) => {
    const s = side < 0 ? 'L' : 'R';
    const e = 0.035 * H, e2 = 0.018 * H;
    const wC = 0.62 * smooth(D.shoulderY - 0.075, D.shoulderY + 0.012, y);
    const f = smooth(D.elbowY + e, D.elbowY - e, y), h = smooth(D.wristY + e2, D.wristY - e2, y);
    return [[B.chest, wC], [B['uarm' + s], (1 - f) * (1 - wC)], [B['farm' + s], f * (1 - h) * (1 - wC)], [B['hand' + s], h * (1 - wC)]];
  };
  const wLeg = (side) => (x, y) => {
    const s = side < 0 ? 'L' : 'R';
    const wH = 0.55 * smooth(D.hipY + 0.0, D.hipY + 0.07, y), k = smooth(D.kneeY + 0.04 * H, D.kneeY - 0.04 * H, y), a = smooth(D.ankleY + 0.05 * H, D.ankleY + 0.005, y);
    return [[B.hips, wH], [B['thigh' + s], (1 - wH) * (1 - k)], [B['shin' + s], (1 - wH) * k * (1 - a)], [B['foot' + s], (1 - wH) * k * a]];
  };
  const wSkirt = (k, legAmt) => (x, y, z) => {          // k: how far down the skirt this is (0 waist .. 1 hem); the leg on the same side takes the swing
    const s = x < 0 ? 'L' : 'R', lw = legAmt * smooth(0.0, 0.7, (D.waistY - y) / Math.max(0.1, D.waistY - D.kneeY)) * clamp(0.3 + 0.7 * Math.abs(x) / (0.1 * H), 0, 1);
    return [[B.hips, 1 - lw], [B['thigh' + s], lw]];
  };
  const wRigid = (b) => () => [[b, 1]];

  // ---- colours
  const topC = col(jacket ? jacket.color : top.color);
  const inner = col(top.inner ?? top.color);
  const bottomC = col(bottom.style === 'shorts' ? bottom.color : bottom.color);
  const trimC = col(top.trim ?? shade(top.color, 1.4));
  const longSleeves = jacket ? true : top.sleeves === 'long';
  const sleeveC = jacket ? col(jacket.color) : tl === 'coat' ? col(top.color) : col(top.color);

  // ============================================================================ torso skin + neck + head
  const torsoSkin = T.map((r, i) => ({ y: r[0], rx: r[1], rz: r[2], c: r[0] < D.waistY - 0.01 ? (tl === 'sari' && bottom.style !== 'shorts' ? col(bottom.color) : bottomC) : skin }));
  mb.tube(torsoSkin, { seg: 16, p: 2.25, wf: (x, y, z) => wTorso(x, y), cap0: true, capColor: bottomC });
  // neck
  const nb = D.neckBaseY, neckR = H * (0.037 - 0.004 * D.kid) * (D.bw > 1 ? 1.1 : 1) * (fem ? 0.9 : 1);
  mb.tube([
    { y: nb - 0.02 * H, rx: neckR * 1.25, rz: neckR * 1.2, c: skin },
    { y: nb + 0.01 * H, rx: neckR * 1.05, rz: neckR * 1.05, c: skin },
    { y: D.chinY + hh * 0.12, rx: neckR, rz: neckR * 1.02, z: hh * 0.03, c: skin },
    { y: D.chinY + hh * 0.34, rx: neckR * 0.98, rz: neckR * 1.02, z: hh * 0.05, c: skin },
  ], { seg: 12, wf: wNeck });

  // head -----------------------------------------------------------------------------------------------------
  const hs = { w: (fem ? 0.94 : 1) * (1 + 0.07 * D.kid), d: (1 + 0.02 * D.kid) };
  const ringAt = (t, grow = 0, sw = 1, sd = 1) => {
    const h = headAt(t), jaw = t < 0.3 ? (fem ? 0.93 : D.kid ? 1.02 : 1.04 + (D.bw > 1.1 ? 0.06 : 0)) : 1;
    return { y: D.chinY + t * hh, x: 0, z: hh * (h.fz + h.bz) / 2 + hh * 0.05 * 0, rx: hh * h.hw * hs.w * jaw * sw + grow, rz: hh * (h.bz - h.fz) / 2 * hs.d * sd + grow };
  };
  const headT = [0.0, 0.05, 0.14, 0.28, 0.44, 0.6, 0.76, 0.89, 0.97, 1.0];
  const stubble = spec.facial === 'stubble' || spec.facial === 'beard';
  mb.tube(headT.map((t) => {
    const r = ringAt(t);
    r.c = skin;
    if (stubble && t < 0.5) r.cf = (phi) => { const front = Math.cos(phi); return front > -0.15 || t < 0.14 ? shade(skin, spec.facial === 'beard' ? 0.5 : 0.8) : skin; };
    if (age > 0.4 && t > 0.9) r.c = lighter(skin, 0.0);
    return r;
  }), { seg: 16, wf: wHead, cap0: true, cap1: true, p: 2 });
  // nose, ears
  const nz = noseOf(D.kid > 0.5);
  mb.blob({ x: 0, y: D.chinY + nz.y * hh, z: nz.z * hh + hh * 0.0, rx: nz.rx * hh, ry: nz.ry * hh, rz: nz.rz * hh, c: shade(skin, 1.0), rot: [0.1, 0, 0], seg: 8, rings: 6, wf: wHead });
  for (const s of [-1, 1]) {
    const hr = headAt(0.46);
    mb.blob({ x: s * (hr.hw * hs.w * hh + hh * 0.004), y: D.chinY + 0.47 * hh, z: hh * 0.07, rx: hh * 0.045, ry: hh * 0.11, rz: hh * 0.075, c: shade(skin, 0.97), rot: [0, s * 0.35, 0], seg: 8, rings: 5, wf: wHead });
  }
  // brows ridge and cheeks get their shape from the face patch; lips too. Facial hair:
  if (spec.facial === 'moustache' || spec.facial === 'beard') {
    for (const s of [-1, 1]) mb.blob({ x: s * hh * 0.09, y: D.chinY + hh * 0.285, z: hh * (-0.405), rx: hh * 0.11, ry: hh * 0.035, rz: hh * 0.045, c: hairC, rot: [0, 0, s * -0.2], seg: 8, rings: 4, wf: wHead });
  }

  // ============================================================================ clothing
  const clothTorso = (o) => {
    // o: { yBot, yTop, color: (y)=>colour, gap: (y)=>half-angle of the front opening, grow, stops: [{y, c}] }
    const rows = [];
    const n = o.n ?? 8;
    for (let i = 0; i <= n; i++) {
      const y = mix(o.yBot, o.yTop, i / n), r = torsoR(y), g = o.grow ?? off;
      const gap = o.gap ? o.gap(y) : 0;
      rows.push({ y, rx: r.rx + g, rz: r.rz + g, c: o.color(y), a0: gap, a1: Math.PI * 2 - gap, wf: (x, yy) => wTorso(x, yy) });
    }
    mb.tube(rows, { seg: 22, p: 2.25 });
    return rows;
  };
  const hemShirt = D.hipY - 0.012 * H;
  const neckTop = D.neckBaseY + 0.012 * H;

  if (!jacket || true) {
    switch (tl) {
      case 'shirt': case 'tee': {
        const hem = tl === 'tee' ? D.hipY - 0.0 * H : hemShirt - 0.005 * H;
        const depth = tl === 'tee' ? 0.025 * H : 0.04 * H;
        clothTorso({
          yBot: hem, yTop: tl === 'tee' ? nb - 0.002 * H : neckTop, n: 10, color: () => topC,
          gap: tl === 'tee' ? null : (y) => (y > neckTop - depth ? smooth(neckTop - depth, neckTop, y) * 0.7 : 0),
          grow: off * 1.1,
        });
        // collar (shirts)
        if (tl === 'shirt') {
          for (const s of [-1, 1]) mb.ribbon(1, 1, (u, v) => {
            const y = neckTop - 0.035 * H + v * 0.04 * H, r = torsoR(clamp(y, D.chestY, neckTop)), xx = s * (r.rx * 0.2 + u * 0.03 * H + v * 0.016 * H);
            return [xx, y, -r.rz - off * 1.6 + v * 0.002 * H];
          }, shade(top.color, 1.1), wTorso);
        }
        break;
      }
      case 'kurta': case 'longKurta': case 'coat': {
        const coat = tl === 'coat';
        const hem = tl === 'longKurta' ? 0.215 * H : tl === 'coat' ? 0.27 * H : 0.33 * H;
        const depth = coat ? 0.1 * H : 0.025 * H;
        const open = coat ? 0.5 : 0.0;
        // upper body
        clothTorso({
          yBot: D.hipY - 0.02 * H, yTop: neckTop, n: 11, color: () => (coat && false ? inner : topC),
          gap: (y) => (y > neckTop - depth ? smooth(neckTop - depth, neckTop, y) * (coat ? 0.95 : 0.55) : 0) + (coat ? open * 0.04 : 0),
          grow: off * (coat ? 1.5 : 1.1),
        });
        if (coat) {                                                  // the shirt showing in the open front
          clothTorso({ yBot: D.hipY - 0.03 * H, yTop: neckTop, n: 8, color: () => inner, gap: () => 0, grow: off * 0.6 });
        }
        // skirt as two panels, slit at front and back
        const flare = coat ? 1.18 : tl === 'longKurta' ? 1.42 : 1.35;
        const mk = (a0, a1, sideSign) => {
          const rows = [];
          const n = 7;
          for (let i = 0; i <= n; i++) {
            const k = i / n, y = mix(D.waistY - 0.012 * H, hem, k), r = torsoR(Math.max(D.crotchY, mix(D.hipY + 0.012 * H, D.crotchY, k * 0.6))), fl = mix(1, flare, Math.pow(k, 1.1));
            const slit = coat ? 0.03 : 0.09;
            const legOut = D.legX + H * 0.056 * D.rs * (baggy ? 1.3 : 1.15);
            rows.push({ y, rx: (Math.max(r.rx, legOut * 0.96) + off * 1.4) * fl, rz: (r.rz + off * 1.4) * fl * (1 + 0.1 * k), c: topC, a0: a0 + slit * k, a1: a1 - slit * k, wf: wSkirt(k, 0.85) });
          }
          if (top.trim) { const last = rows[rows.length - 1], prev = rows[rows.length - 2], yy = last.y + 0.03 * H, q = (yy - prev.y) / (last.y - prev.y); rows.splice(rows.length - 1, 0, { ...last, y: yy, rx: mix(prev.rx, last.rx, q), rz: mix(prev.rz, last.rz, q), c: topC }); rows[rows.length - 1].c = trimC; rows.splice(rows.length - 1, 0, { ...rows[rows.length - 1], y: yy - 0.002, c: trimC }); }
          mb.tube(rows, { seg: 8, p: 2.1 });
        };
        mk(0.05, Math.PI - 0.05, 1); mk(Math.PI + 0.05, Math.PI * 2 - 0.05, -1);
        // the placket, buttons
        if (!coat) {
          mb.ribbon(8, 1, (u, v) => { const y = mix(neckTop - 0.02 * H, D.waistY, v), r = torsoR(clamp(y, D.waistY, neckTop)); return [(u - 0.5) * 0.012 * H, y, -r.rz - off * 1.35]; }, (u, v) => shade(top.color, 0.78), wTorso);
          for (let i = 0; i < 4; i++) { const y = mix(neckTop - 0.04 * H, D.chestY - 0.03 * H, i / 3), r = torsoR(y); mb.blob({ x: 0, y, z: -r.rz - off * 1.7, rx: 0.006 * H, ry: 0.006 * H, rz: 0.004 * H, c: trimC, seg: 5, rings: 3, wf: wTorso }); }
          // mandarin collar
          mb.tube([{ y: nb - 0.004 * H, rx: neckR * 1.5, rz: neckR * 1.42, c: topC }, { y: nb + 0.03 * H, rx: neckR * 1.34, rz: neckR * 1.3, c: topC, z: 0.002 * H }], { seg: 12, wf: wNeck, a0: 0.5, a1: Math.PI * 2 - 0.5 });
        }
        break;
      }
      case 'sari': {
        // blouse (cropped), bare midriff, the sari from the waist to the ankle
        const blouseHem = mix(D.waistY, D.chestY, 0.55);
        const blouseC = col(top.color);
        clothTorso({
          yBot: blouseHem, yTop: neckTop, n: 8, color: () => blouseC,
          gap: (y) => (y > neckTop - 0.07 * H ? smooth(neckTop - 0.07 * H, neckTop, y) * 1.15 : 0),
          grow: off * 1.1,
        });
        const sariC = col(bottom.color), border = col(top.trim ?? 0xe0c070), hem = 0.05 * H;
        const rows = [];
        const n = 9, yTop = D.waistY - 0.02 * H;
        for (let i = 0; i <= n; i++) {
          const k = i / n, y = mix(yTop, hem, k), r = torsoR(Math.max(D.crotchY, mix(D.hipY + 0.012 * H, D.crotchY, k * 0.55))), fl = mix(1, 1.22, Math.pow(k, 1.3));
          rows.push({ y, rx: (r.rx + off * 1.6) * fl, rz: (r.rz + off * 1.8) * fl, c: sariC, wf: wSkirt(k, 0.55) });
        }
        // hard colour stops for the border: a band 6 cm up, a thin line above it
        const last = rows[rows.length - 1];
        rows.splice(rows.length - 1, 0, { ...last, y: last.y + 0.075 * H * 1.0, c: sariC });
        rows.push({ ...last, y: last.y + 0.003, c: border });
        mb.tube(rows.sort((a, b) => b.y - a.y), { seg: 16, p: 2.1 });
        const band = (yy, hgt, c) => mb.tube([{ ...last, y: yy + hgt, c, rx: last.rx * 0.985 + 0.0, rz: last.rz * 0.985 }, { ...last, y: yy, c, rx: last.rx, rz: last.rz }], { seg: 16, p: 2.1 });
        // pleats: a fan of slightly different shades down the front
        for (let i = 0; i < 7; i++) {
          const a = (i - 3) * 0.17, x0 = Math.sin(a), z0 = -Math.cos(a);
          mb.ribbon(5, 1, (u, v) => {
            const y = mix(D.waistY - 0.01 * H, hem + 0.02 * H, v), k = (D.waistY - y) / (D.waistY - hem), r = torsoR(Math.max(D.crotchY, mix(D.hipY + 0.012 * H, D.crotchY, k * 0.55))), fl = mix(1, 1.22, Math.pow(k, 1.3));
            const rr = rows[0];
            return [x0 * (r.rx + off * 2.0) * fl + (u - 0.5) * 0.02 * H, y, z0 * (r.rz + off * 2.2) * fl];
          }, i % 2 ? shade(bottom.color, 1.1) : shade(bottom.color, 0.86), wSkirt(0.5, 0.55));
        }
        break;
      }
      default: break;
    }
  }

  // jacket over the top (Metro jacket, rescuers' hi-vis)
  if (jacket) {
    const jc = col(jacket.color), jy = D.hipY - 0.02 * H;
    clothTorso({
      yBot: jy, yTop: neckTop, n: 9, color: (y) => (jacket.stripe && Math.abs(y - (D.hipY + 0.045 * H)) < 0.012 * H ? col(jacket.stripe) : jacket.stripe && Math.abs(y - (D.chestY - 0.02 * H)) < 0.014 * H ? col(jacket.stripe) : jc),
      gap: (y) => (y > neckTop - 0.03 * H ? 0.35 : 0.0), grow: off * 2.2,
    });
    // stand-up collar
    mb.tube([{ y: nb, rx: neckR * 1.55, rz: neckR * 1.5, c: jc }, { y: nb + 0.035 * H, rx: neckR * 1.4, rz: neckR * 1.36, c: shade(jacket.color, 0.9) }], { seg: 12, wf: wNeck, a0: 0.35, a1: Math.PI * 2 - 0.35 });
    // vertical hi-vis stripes over each shoulder
    if (jacket.stripe) for (const s of [-1, 1]) {
      mb.ribbon(6, 1, (u, v) => { const y = mix(D.shoulderY, D.hipY + 0.03 * H, v), r = torsoR(y); const x = s * (r.rx * 0.45 + (u - 0.5) * 0.02 * H); return [x, y, -Math.sqrt(Math.max(0, 1 - (x / (r.rx + off * 2.4)) ** 2)) * (r.rz + off * 2.4) - 0.001]; }, col(jacket.stripe), wTorso);
    }
  }

  // ============================================================================ legs and feet
  const hemY = { shorts: D.kneeY + 0.07 * H, lungi: 0.2 * H, skirt: D.ankleY, trousers: D.ankleY, salwar: D.ankleY }[bottom.style] ?? D.ankleY;
  const sariLegs = tl === 'sari';
  const legTbl = [
    // y, rx, rz
    [D.hipY + 0.03 * H, 0.056, 0.060], [D.hipY - 0.04 * H, 0.056, 0.060], [mix(D.hipY, D.kneeY, 0.5), 0.048, 0.052], [D.kneeY + 0.05 * H, 0.037, 0.041], [D.kneeY, 0.033, 0.037],
    [D.kneeY - 0.055 * H, 0.036, 0.040], [mix(D.kneeY, D.ankleY, 0.62), 0.030, 0.033], [D.ankleY + 0.07 * H, 0.0215, 0.024], [D.ankleY + 0.015 * H, 0.0195, 0.021], [D.ankleY - 0.01 * H, 0.0195, 0.021],
  ].map((r) => [r[0], r[1], r[2]]);
  for (const side of [-1, 1]) {
    const rows = [];
    const ys = [];
    for (let i = 0; i <= 14; i++) ys.push(mix(D.hipY + 0.03 * H, D.ankleY - 0.008 * H, i / 14));
    for (const y of ys) {
      const [rx, rz] = spline(legTbl, y);
      const bag = baggy ? mix(1.0, y > D.kneeY ? 1.55 : 1.3, 0) : 1;
      let k = 1, c = skin;
      const covered = y > hemY;
      if (covered) { c = bottomC; k = bottom.style === 'trousers' ? 1.12 : baggy ? mix(1.28, 1.1, smooth(D.kneeY + 0.1 * H, D.ankleY + 0.04 * H, y)) : bottom.style === 'shorts' ? 1.2 : 1.1; }
      else { c = skin; k = 0.98; }
      if (sariLegs && y > D.ankleY + 0.04 * H) c = bottomC;
      rows.push({ y, x: side * D.legX, rx: H * rx * D.rs * k, rz: H * rz * D.rs * k, c });
    }
    // hard stop at the hem
    if (!(hemY <= D.ankleY + 0.001) && hemY > D.ankleY) {
      const idx = rows.findIndex((r) => r.y < hemY);
      if (idx > 0) {
        const a = rows[idx - 1], b = rows[idx];
        const [rx, rz] = spline(legTbl, hemY);
        rows.splice(idx, 0, { y: hemY + 0.002, x: a.x, rx: H * rx * D.rs * 1.13, rz: H * rz * D.rs * 1.13, c: bottomC }, { y: hemY, x: a.x, rx: H * rx * D.rs * 1.0, rz: H * rz * D.rs * 1.0, c: skin });
        // a cuff at the hem
        if (bottom.style === 'shorts' || bottom.style === 'trousers') rows[idx].c = shade(bottom.color, 0.85);
      }
    }
    mb.tube(rows, { seg: 10, p: 2.05, wf: wLeg(side), cap1: false });
    // trouser hem cuffs and ankle
    if (hemY <= D.ankleY + 0.001 && bottom.style !== 'shorts') {
      const r = spline(legTbl, D.ankleY + 0.006 * H);
      mb.tube([{ y: D.ankleY + 0.025 * H, x: side * D.legX, rx: H * r[0] * D.rs * (baggy ? 1.28 : 1.13), rz: H * r[1] * D.rs * (baggy ? 1.28 : 1.13), c: baggy ? shade(bottom.color, 1.25) : shade(bottom.color, 0.85) }, { y: D.ankleY - 0.004 * H, x: side * D.legX, rx: H * r[0] * D.rs * (baggy ? 1.2 : 1.08), rz: H * r[1] * D.rs * (baggy ? 1.2 : 1.08), c: baggy ? shade(bottom.color, 1.25) : shade(bottom.color, 0.85) }], { seg: 10, wf: wLeg(side) });
    }
    // foot
    const fx = side * D.legX, fl = H * 0.0675, fw = H * 0.026, fh = H * 0.024;
    const footW = wRigid(side < 0 ? B.footL : B.footR);
    if (spec.barefoot || spec.shoes == null) {
      mb.blob({ x: fx, y: H * 0.017, z: -fl * 0.58, rx: fw * 0.95, ry: fh * 0.72, rz: fl * 1.05, c: skin, seg: 9, rings: 5, wf: footW, rot: [0.02, 0, 0] });
      mb.blob({ x: fx, y: H * 0.018, z: fl * 0.3, rx: fw * 0.7, ry: fh * 0.9, rz: fl * 0.45, c: shade(skin, 0.95), seg: 8, rings: 4, wf: footW });
    } else {
      const sc2 = col(spec.shoes), sole = shade(spec.shoes, 0.45);
      mb.blob({ x: fx, y: H * 0.021, z: -fl * 0.55, rx: fw * 1.02, ry: fh * 0.92, rz: fl * 1.12, c: sc2, seg: 10, rings: 6, wf: footW });
      mb.blob({ x: fx, y: H * 0.0075, z: -fl * 0.5, rx: fw * 1.06, ry: fh * 0.34, rz: fl * 1.18, c: sole, seg: 10, rings: 3, wf: footW });
    }
  }

  // ============================================================================ arms and hands
  const sleeveEnd = longSleeves ? D.wristY + 0.01 * H : D.shoulderY - 0.075 * H - (tl === 'coat' ? 0 : 0);
  for (const side of [-1, 1]) {
    const rows = [], armW = wArm(side), sg = side < 0 ? 'L' : 'R';
    const ax = (y) => side * (D.shoulderX + (D.shoulderY - y) * Math.tan(ARM_TILT));
    const aTbl = [[D.shoulderY + 0.012 * H, 0.0315, 0.0315], [D.shoulderY - 0.04 * H, 0.0315, 0.0315], [mix(D.shoulderY, D.elbowY, 0.55), 0.028, 0.0285], [D.elbowY + 0.02 * H, 0.0245, 0.0255], [D.elbowY - 0.01 * H, 0.0245, 0.0255],
      [mix(D.elbowY, D.wristY, 0.3), 0.0262, 0.0270], [mix(D.elbowY, D.wristY, 0.7), 0.0208, 0.0195], [D.wristY + 0.012 * H, 0.0158, 0.0155], [D.wristY - 0.012 * H, 0.0155, 0.0153]];
    const ys = [];
    for (let i = 0; i <= 13; i++) ys.push(mix(D.shoulderY + 0.012 * H, D.wristY - 0.012 * H, i / 13));
    for (const y of ys) {
      const [rx, rz] = spline(aTbl, y);
      const covered = y > sleeveEnd;
      rows.push({ y, x: ax(y), rx: H * rx * D.rs * (covered ? 1.14 : 1), rz: H * rz * D.rs * (covered ? 1.14 : 1), c: covered ? sleeveC : skin, wf: armW });
    }
    if (sleeveEnd > D.wristY && sleeveEnd < D.shoulderY - 0.02) {
      const idx = rows.findIndex((r) => r.y < sleeveEnd);
      if (idx > 0) {
        const [rx, rz] = spline(aTbl, sleeveEnd);
        const cuffC = jacket ? shade(jacket.color, 0.85) : longSleeves ? shade(top.color, 0.85) : shade(top.color, 0.88);
        rows.splice(idx, 0, { y: sleeveEnd + 0.002, x: ax(sleeveEnd), rx: H * rx * D.rs * 1.16, rz: H * rz * D.rs * 1.16, c: cuffC, wf: armW }, { y: sleeveEnd, x: ax(sleeveEnd), rx: H * rx * D.rs * 1.0, rz: H * rz * D.rs * 1.0, c: skin, wf: armW });
      }
    }
    mb.tube(rows, { seg: 10, p: 2.05, cap0: false });
    // deltoid cap hides the shoulder seam
    mb.blob({ x: side * (D.shoulderX - 0.004 * H), y: D.shoulderY - 0.004 * H, z: 0, rx: D.armR * 1.02, ry: D.armR * 0.95, rz: D.armR * 1.0, c: shortSleeve(longSleeves, sleeveC, skin, tl, sleeveEnd, D), seg: 16, rings: 9, wf: (x, y) => [[B.chest, 0.55], [B['uarm' + sg], 0.45]] });
    // hand: palm, fingers, thumb
    const hx = (y) => ax(y), hy = D.wristY, L = D.handLen;
    const hw = wRigid(B['hand' + sg]);
    mb.blob({ x: hx(hy - L * 0.22), y: hy - L * 0.22, z: 0, rx: H * 0.0145, ry: L * 0.27, rz: H * 0.0235, c: skin, seg: 8, rings: 5, wf: hw, rot: [0, 0, side * -ARM_TILT] });
    mb.blob({ x: hx(hy - L * 0.62), y: hy - L * 0.62, z: -H * 0.003, rx: H * 0.0118, ry: L * 0.37, rz: H * 0.0225, c: shade(skin, 0.97), seg: 8, rings: 5, wf: hw, rot: [-0.18, 0, side * -ARM_TILT] });
    mb.blob({ x: hx(hy - L * 0.26) - side * H * 0.0105, y: hy - L * 0.3, z: -H * 0.016, rx: H * 0.0085, ry: L * 0.24, rz: H * 0.0095, c: skin, seg: 7, rings: 4, wf: hw, rot: [-0.55, 0, side * 0.35] });
    // bangles
    if (spec.props?.includes('bangles') && fem) {
      for (let i = 0; i < 3; i++) mb.tube([{ y: D.wristY + 0.014 * H + i * 0.007 * H, x: ax(D.wristY), rx: H * 0.0185, rz: H * 0.0185, c: i % 2 ? 0xe8c04a : 0xb83030, wf: hw }, { y: D.wristY + 0.019 * H + i * 0.007 * H, x: ax(D.wristY), rx: H * 0.0185, rz: H * 0.0185, c: i % 2 ? 0xe8c04a : 0xb83030, wf: hw }], { seg: 8 });
    }
  }
  if (spec.props?.includes('bandage')) {                       // a white wrap round the left forearm with a spot of red
    const sgL = B.farmL, y0 = D.elbowY - 0.01 * H, y1 = D.wristY + 0.03 * H;
    const rr = [];
    for (let i = 0; i <= 5; i++) { const y = mix(y0, y1, i / 5), [rx, rz] = spline([[y1, 0.0215, 0.0215], [y0, 0.0275, 0.0285]], y); rr.push({ y, x: -(D.shoulderX + (D.shoulderY - y) * Math.tan(ARM_TILT)), rx: H * rx * 1.18, rz: H * rz * 1.18, c: i % 2 ? 0xe8e4d6 : 0xdcd7c6, wf: wRigid(sgL) }); }
    mb.tube(rr, { seg: 9, cap0: true, cap1: true });
    mb.blob({ x: -(D.shoulderX + (D.shoulderY - mix(y0, y1, 0.5)) * Math.tan(ARM_TILT)), y: mix(y0, y1, 0.5), z: -H * 0.03, rx: H * 0.008, ry: H * 0.012, rz: H * 0.004, c: 0xb83a30, seg: 6, rings: 3, wf: wRigid(sgL) });
  }

  // ============================================================================ scarf / dupatta / pallu
  if (sc && !jacket) {
    const scC = col(sc.color), scT = sc.trim ? col(sc.trim) : null;
    const wC1 = (x, y) => { const k = smooth(D.shoulderY, D.waistY, y); return [[B.chest, 1 - k], [B.cloak1, k * 0.9], [B.cloak2, k * 0.1 + 0.0]]; };
    const wC2 = (x, y) => { const k = smooth(D.shoulderY - 0.05 * H, D.waistY + 0.05 * H, y); return [[B.chest, 1 - k], [B.cloak1, k * 0.35], [B.cloak2, k * 0.65]]; };
    const rzAt = (y) => torsoR(clamp(y, D.waistY, D.shoulderY)).rz, rxAt = (y) => torsoR(clamp(y, D.waistY, D.shoulderY)).rx;
    // a cloth with a border: separate sheets for the two side borders, the body and the hem, so the colours meet in hard lines
    const banded = (rows, fn, wf, hemBand = true) => {
      const u0s = scT ? [0, 0.12, 0.88] : [0], u1s = scT ? [0.12, 0.88, 1] : [1];
      const h0 = scT && hemBand ? 0.93 : 1;
      u0s.forEach((u0, i) => {
        const u1 = u1s[i], c = scT && i !== 1 ? scT : scC;
        mb.ribbon(Math.max(2, Math.round(rows * h0)), 1, (u, v) => fn(mix(u0, u1, u), v * h0), c, wf);
      });
      if (scT && hemBand) mb.ribbon(1, 1, (u, v) => fn(u, mix(0.93, 1, v)), scT, wf);
    };
    const edge = (u, v) => scC, stripe = (u, v) => scC;
    if (sc.style === 'sash') {
      // sari pallu: over the left shoulder, across the chest to the right hip, and a long tail down the back
      banded(10, (u, v) => {
        const k = v, x = mix(-D.shoulderX * 0.55, D.shoulderX * 0.95, k) + (u - 0.5) * 0.02 * H, y = mix(D.shoulderY + 0.012 * H, D.waistY - 0.03 * H, k) + (u - 0.5) * 0.045 * H * (1 - k * 0.2);
        const r = torsoR(clamp(y, D.waistY, D.shoulderY)), zz = -Math.sqrt(Math.max(0.0, 1 - Math.min(1, (x / (r.rx + off * 3)) ** 2))) * (r.rz + off * 3);
        return [x, y, zz];
      }, wC1, false);
      banded(10, (u, v) => {
        const x = -D.shoulderX * 0.45 + (u - 0.5) * 0.14 * H, y = mix(D.shoulderY + 0.012 * H, D.kneeY + 0.1 * H, v), r = torsoR(clamp(y, D.waistY, D.shoulderY));
        return [x, y, (v < 0.3 ? r.rz + off * 3 : r.rz + off * 3 + (v - 0.3) * 0.02 * H) + Math.sin(u * Math.PI) * 0.01 * H];
      }, wC2);
    } else {
      // dupatta draped round the neck: a collar of cloth, a tail in front on the left, a longer one behind on the right
      mb.tube([{ y: nb + 0.0 * H, rx: neckR * 1.75, rz: neckR * 1.65, c: scC, wf: wNeck }, { y: nb + 0.03 * H, rx: neckR * 1.4, rz: neckR * 1.35, c: scC, wf: wNeck }], { seg: 12 });
      banded(8, (u, v) => {
        const y = mix(D.shoulderY + 0.0 * H, D.waistY + 0.0 * H, v), x = -D.shoulderX * 0.4 + (u - 0.5) * 0.085 * H, r = torsoR(clamp(y, D.waistY, D.shoulderY));
        return [x, y, -(r.rz + off * 2.8) - Math.sin(u * Math.PI) * 0.008 * H];
      }, wC1);
      banded(10, (u, v) => {
        const y = mix(D.shoulderY + 0.0 * H, D.hipY - 0.08 * H, v), x = D.shoulderX * 0.35 + (u - 0.5) * 0.11 * H, r = torsoR(clamp(y, D.waistY, D.shoulderY));
        return [x, y, r.rz + off * 2.8 + v * 0.012 * H];
      }, wC2);
      // the part draped over the shoulders, front to back (a flat band over each shoulder)
      for (const s of [-1, 1]) mb.ribbon(2, 2, (u, v) => {
        const x = s * (D.shoulderX * 0.55 + (u - 0.5) * 0.07 * H), z = mix(-1, 1, v) * (torsoR(D.shoulderY).rz + off * 2.5);
        return [x, D.shoulderY + 0.022 * H - Math.abs(v - 0.5) * 0.01 * H, z];
      }, scC, wC1);
    }
  }

  // ============================================================================ hair
  const hairInfo = buildHair(mb, spec, D, hairC, hs, ringAt, torsoR, wHead, wRigid, age);

  // ============================================================================ props
  const props = spec.props ?? [];
  const hR = wRigid(B.handR), hL = wRigid(B.handL);
  const handAt = (side, down) => { const y = D.wristY - down; return [side * (D.shoulderX + (D.shoulderY - y) * Math.tan(ARM_TILT)), y]; };
  if (props.includes('mouthOrgan')) {
    const [x, y] = handAt(1, D.handLen * 0.45);
    mb.blob({ x: x - H * 0.004, y, z: -H * 0.036, rx: H * 0.052, ry: H * 0.0125, rz: H * 0.013, c: 0xb8c4cc, seg: 8, rings: 4, wf: hR, rot: [0, 0.25, 0] });
    mb.blob({ x: x - H * 0.004, y: y + H * 0.002, z: -H * 0.048, rx: H * 0.045, ry: H * 0.006, rz: H * 0.004, c: 0x2a2e32, seg: 6, rings: 3, wf: hR, rot: [0, 0.25, 0] });
  }
  if (props.includes('torch')) {
    const [x, y] = handAt(1, D.handLen * 0.4);
    mb.tube([{ y: y - H * 0.0, x, z: -H * 0.045, rx: H * 0.011, rz: H * 0.011, c: 0x30363a, wf: hR }, { y: y + 0, x, z: -H * 0.045, rx: H * 0.011, rz: H * 0.011, c: 0x30363a, wf: hR }], { seg: 6 });
    mb.blob({ x, y, z: -H * 0.075, rx: H * 0.012, ry: H * 0.012, rz: H * 0.04, c: 0x30363a, seg: 7, rings: 4, wf: hR });
    mb.blob({ x, y, z: -H * 0.112, rx: H * 0.017, ry: H * 0.017, rz: H * 0.006, c: 0xffe9a0, seg: 7, rings: 3, wf: hR });
  }
  if (props.includes('bag')) {
    mb.blob({ x: D.shoulderX * 0.4, y: D.waistY - 0.03 * H, z: H * 0.085, rx: H * 0.075, ry: H * 0.062, rz: H * 0.04, c: 0x6a5a3a, seg: 8, rings: 5, wf: wTorso });
    mb.ribbon(6, 1, (u, v) => { const y = mix(D.shoulderY + 0.01 * H, D.waistY - 0.02 * H, v), r = torsoR(y), s = (u - 0.5) * 0.014 * H; return [mix(-D.shoulderX * 0.5, D.shoulderX * 0.4, v) + s, y, -r.rz * Math.cos(v * 2) * 0.0 + (v < 0.5 ? -(r.rz + off * 3) : r.rz + off * 3)]; }, 0x4a3a28, wTorso);
  }
  if (props.includes('badge')) mb.blob({ x: -D.shoulderX * 0.45, y: D.chestY + 0.02 * H, z: -(torsoR(D.chestY).rz + off * 3), rx: H * 0.016, ry: H * 0.011, rz: H * 0.003, c: 0xe8e4d0, seg: 6, rings: 3, wf: wTorso });
  if (props.includes('headBand')) {
    const t = 0.7, r = ringAt(t, hh * 0.04);
    mb.tube([{ ...r, y: r.y - hh * 0.07, c: 0xe8e4d6 }, { ...r, y: r.y + hh * 0.09, rx: r.rx - hh * 0.01, rz: r.rz - hh * 0.01, c: 0xe8e4d6 }], { seg: 14, wf: wHead });
    mb.blob({ x: r.rx * 0.75, y: r.y + hh * 0.02, z: -r.rz * 0.65 + r.z, rx: hh * 0.045, ry: hh * 0.07, rz: hh * 0.02, c: 0xb83a30, seg: 6, rings: 3, wf: wHead });
  }
  if (props.includes('headLamp')) {
    const t = 0.78, r = ringAt(t, hh * 0.04);
    mb.tube([{ ...r, y: r.y - hh * 0.04, c: 0x3a3a38 }, { ...r, y: r.y + hh * 0.05, c: 0x3a3a38 }], { seg: 14, wf: wHead });
    mb.blob({ x: 0, y: r.y, z: r.z - r.rz - hh * 0.02, rx: hh * 0.08, ry: hh * 0.06, rz: hh * 0.05, c: 0xffe9a0, seg: 7, rings: 4, wf: wHead });
  }
  if (props.includes('hardHat')) {
    const r = ringAt(0.9, hh * 0.05);
    const rows = [];
    for (const t of [0.66, 0.74, 0.85, 0.94, 1.0, 1.05]) { const rr = ringAt(Math.min(1, t), hh * 0.06 * (t > 1 ? 0.2 : 1)); rows.push({ ...rr, y: D.chinY + t * hh, rx: rr.rx * (t > 1 ? 0.35 : 1), rz: rr.rz * (t > 1 ? 0.35 : 1), c: 0xe8c030 }); }
    mb.tube(rows, { seg: 14, wf: wHead, cap1: true });
    mb.blob({ x: 0, y: D.chinY + 0.69 * hh, z: -hh * 0.3, rx: hh * 0.46, ry: hh * 0.03, rz: hh * 0.3, c: 0xd8b028, seg: 12, rings: 3, wf: wHead });
  }

  // ---- the white cane (Mithi): the right hand holds it out ahead; its tip touches the floor when the arm is in its walking pose
  let cane = null;
  if (props.includes('cane')) {
    const root = new THREE.Object3D(), mkb = (name, parent) => { const o = new THREE.Object3D(); o.position.set(...P[name]); if (parent) { o.position.sub(new THREE.Vector3(...P[parent])); parent === root ? 0 : 0; } return o; };
    const chest = new THREE.Object3D(); chest.position.set(...P.chest);
    const ua = new THREE.Object3D(); ua.position.set(P.uarmR[0] - P.chest[0], P.uarmR[1] - P.chest[1], 0);
    const fa = new THREE.Object3D(); fa.position.set(P.farmR[0] - P.uarmR[0], P.farmR[1] - P.uarmR[1], 0);
    const ha = new THREE.Object3D(); ha.position.set(P.handR[0] - P.farmR[0], P.handR[1] - P.farmR[1], 0);
    root.add(chest); chest.add(ua); ua.add(fa); fa.add(ha);
    root.updateMatrixWorld(true);
    const bind = ha.matrixWorld.clone();
    ua.rotation.set(0.78, 0, 0.1); fa.rotation.set(0.35, 0, 0); ha.rotation.set(0.05, 0, 0);
    root.updateMatrixWorld(true);
    const delta = new THREE.Matrix4().multiplyMatrices(ha.matrixWorld, bind.clone().invert()), inv = delta.clone().invert();
    const grip = new THREE.Vector3(P.handR[0], P.handR[1] - D.handLen * 0.42, -H * 0.004).applyMatrix4(delta);
    const alpha = 0.92, dir = new THREE.Vector3(0.04, -Math.sin(alpha), -Math.cos(alpha));
    const L = grip.y / Math.sin(alpha);
    const tipP = grip.clone().addScaledVector(dir, L), topP = grip.clone().addScaledVector(dir, -0.09);
    const tipB = tipP.clone().applyMatrix4(inv), topB = topP.clone().applyMatrix4(inv), gripB = grip.clone().applyMatrix4(inv);
    const hw = wRigid(B.handR), tt = [tipB.x, tipB.y, tipB.z];
    mb.rod([topB.x, topB.y, topB.z], tt, H * 0.0062, H * 0.0058, 0xf3f1ea, { seg: 6, rings: 12, wf: hw, bands: [{ t0: 0, t1: 0.2, c: 0x1c1c1e }, { t0: 0.7, t1: 0.76, c: 0xc2332c }, { t0: 0.8, t1: 0.86, c: 0xc2332c }] });
    mb.blob({ x: tipB.x, y: tipB.y - 0.004, z: tipB.z, rx: H * 0.0085, ry: H * 0.0085, rz: H * 0.0085, c: 0xf3f1ea, seg: 6, rings: 4, wf: hw });
    cane = { length: L, tipLocal: [tipB.x - P.handR[0], tipB.y - P.handR[1], tipB.z - P.handR[2]] };
  }

  const geometry = mb.build();
  return { geometry, dims: D, hair: hairInfo, cane, builder: mb };
}

function shortSleeve(longS, sleeveC, skin, tl, sleeveEnd, D) { return longS || sleeveEnd > D.elbowY ? sleeveC : sleeveC; }

// hair ---------------------------------------------------------------------------------------------------------
function buildHair(mb, spec, D, hairC, hs, ringAt, torsoR, wHead, wRigid, age) {
  const H = D.H, hh = D.hh, style = spec.hair?.style ?? 'short';
  if (style === 'bald') return { style };
  const grey = age > 0.5 ? hairC.clone().lerp(new THREE.Color(0.7, 0.7, 0.7), (age - 0.5) * 1.2) : hairC;
  const col = (c, k = 1) => (k === 1 ? c : c.clone().multiplyScalar(k));
  const cap = (o) => {
    const ts = o.ts ?? [1.01, 0.985, 0.95, 0.9, 0.85, 0.8, 0.75, 0.7, 0.64, 0.58, 0.52, 0.46, 0.4, 0.34, 0.3];
    const rows = ts.map((t) => {
      const r = ringAt(Math.min(t, 1), (o.grow ?? 0.05) * hh * (t > 0.95 ? 1.2 : 1), o.w ?? 1, o.d ?? 1);
      let gap = 0;
      gap = o.g0 ?? 0;
      if (t < o.hl) gap = mix(o.g0 ?? 0, o.g1, smooth(o.hl, o.hl - 0.16, t));
      if (t < o.sideT) gap = mix(o.g1, o.g2, smooth(o.sideT, o.backT, t));
      if (t > 0.99) { r.rx *= 0.6; r.rz *= 0.6; r.y += hh * 0.02; }
      return { ...r, a0: gap, a1: Math.PI * 2 - gap, c: col(hairC), wf: wHead, cf: o.cf };
    });
    mb.tube(rows, { seg: 26, p: 2 });
  };
  const flat = (rows, seg = 12, o = {}) => mb.tube(rows, { seg, ...o });
  const hc = hairC;
  const noseY = D.chinY;
  switch (style) {
    case 'crop': cap({ hl: 0.86, g1: 0.7, sideT: 0.56, backT: 0.4, g2: 2.0, grow: 0.016 }); break;
    case 'short': {
      cap({ hl: 0.8, g1: 1.0, sideT: 0.56, backT: 0.34, g2: 2.2, grow: 0.03 });
      mb.blob({ x: hh * 0.05, y: D.chinY + 0.8 * hh, z: -hh * 0.37, rx: hh * 0.3, ry: hh * 0.07, rz: hh * 0.1, c: hc, rot: [0.25, 0, 0.1], seg: 9, rings: 4, wf: wHead });       // a fringe
      break;
    }
    case 'side': {
      cap({ hl: 0.8, g1: 1.0, sideT: 0.56, backT: 0.36, g2: 2.2, grow: 0.034 });
      mb.blob({ x: hh * 0.1, y: D.chinY + 0.83 * hh, z: -hh * 0.34, rx: hh * 0.31, ry: hh * 0.08, rz: hh * 0.12, c: hc, rot: [0.3, 0, -0.18], seg: 9, rings: 4, wf: wHead });
      break;
    }
    case 'slick': cap({ hl: 0.82, g1: 1.0, sideT: 0.56, backT: 0.4, g2: 2.2, grow: 0.018 }); break;
    case 'balding': {
      // a ring of hair round the sides and back, bare on top
      cap({ ts: [0.7, 0.62, 0.54, 0.46, 0.38, 0.3], hl: 0.7, g0: 1.9, g1: 1.9, sideT: 0.5, backT: 0.32, g2: 2.4, grow: 0.034 });
      break;
    }
    case 'long': {
      cap({ hl: 0.8, g1: 1.15, sideT: 0.62, backT: 0.3, g2: 1.5, grow: 0.05, w: 1.04 });
      mb.blob({ x: -hh * 0.02, y: D.chinY + 0.82 * hh, z: -hh * 0.38, rx: hh * 0.34, ry: hh * 0.075, rz: hh * 0.11, c: hc, rot: [0.3, 0, 0.15], seg: 9, rings: 4, wf: wHead });
      // the fall of hair behind the shoulders: a flat curtain that widens a little and ends in a soft tip
      const rows = [];
      for (let i = 0; i <= 8; i++) {
        const k = i / 8, y = mix(D.chinY + 0.38 * hh, D.shoulderY - 0.17 * H, k), rr = torsoR(clamp(y, D.waistY, D.neckBaseY));
        const w2 = mix(0.4 * hh, 0.52 * hh, Math.sin(Math.min(1, k * 1.3) * 1.2));
        const wf = (x, yy) => { const a = smooth(D.neckBaseY + 0.04, D.shoulderY - 0.08 * H, yy); return [[B.head, 1 - a], [B.chest, a * 0.8], [B.cloak1, a * 0.2]]; };
        rows.push({ y, x: 0, z: y > D.shoulderY ? hh * 0.2 : rr.rz + hh * 0.08, rx: w2 * (1 - k * 0.25), rz: hh * 0.075 * (1 - k * 0.2), c: k > 0.85 ? col(hc, 0.9) : hc, wf });
      }
      mb.tube(rows, { seg: 10, cap1: true });
      for (const s of [-1, 1]) {             // side locks falling over the front of the shoulders
        const lr = [];
        for (let i = 0; i <= 5; i++) {
          const k = i / 5, y = mix(D.chinY + 0.45 * hh, D.shoulderY - 0.1 * H, k), rr = torsoR(clamp(y, D.waistY, D.shoulderY));
          const wf = (x, yy) => { const a = smooth(D.neckBaseY, D.shoulderY - 0.06 * H, yy); return [[B.head, 1 - a], [B.chest, a]]; };
          lr.push({ y, x: s * (hh * 0.33 + k * hh * 0.05), z: -hh * 0.06 + k * -hh * 0.05, rx: hh * 0.065 * (1 - k * 0.5), rz: hh * 0.08 * (1 - k * 0.4), c: hc, wf });
        }
        mb.tube(lr, { seg: 7, cap1: true });
      }
      break;
    }
    case 'bob': {
      cap({ hl: 0.8, g1: 1.15, sideT: 0.62, backT: 0.28, g2: 1.35, grow: 0.045, w: 1.03 });
      mb.blob({ x: 0, y: D.chinY + 0.82 * hh, z: -hh * 0.38, rx: hh * 0.33, ry: hh * 0.07, rz: hh * 0.1, c: hc, rot: [0.3, 0, 0.1], seg: 9, rings: 4, wf: wHead });
      break;
    }
    case 'bun': case 'bunLow': {
      cap({ hl: 0.8, g1: 1.05, sideT: 0.6, backT: 0.36, g2: 2.0, grow: 0.024 });
      mb.blob({ x: 0, y: D.chinY + (style === 'bun' ? 0.88 : 0.46) * hh, z: hh * (style === 'bun' ? 0.28 : 0.52), rx: hh * 0.2, ry: hh * 0.17, rz: hh * 0.19, c: hc, seg: 9, rings: 6, wf: wHead });
      mb.blob({ x: 0, y: D.chinY + 0.82 * hh, z: -hh * 0.37, rx: hh * 0.3, ry: hh * 0.06, rz: hh * 0.09, c: hc, rot: [0.25, 0, 0], seg: 9, rings: 4, wf: wHead });
      break;
    }
    case 'braid': {
      cap({ hl: 0.8, g1: 1.15, sideT: 0.62, backT: 0.34, g2: 1.8, grow: 0.034 });
      // centre parting highlight
      mb.ribbon(3, 1, (u, v) => { const t = mix(0.82, 1.0, v), r = ringAt(Math.min(t, 0.995), 0.045 * hh); return [(u - 0.5) * 0.012 * hh, r.y + 0.008 * hh, r.z - r.rz * 0.99 * Math.cos(v * 1.1) + v * hh * 0.4]; }, shade2(hc, 1.7), wHead);
      mb.blob({ x: 0, y: D.chinY + 0.43 * hh, z: hh * 0.53, rx: hh * 0.17, ry: hh * 0.16, rz: hh * 0.15, c: hc, seg: 8, rings: 5, wf: wHead });          // the knot at the nape
      // the braid: three bones, a rope of alternating bright and dark loops, a red tie and a tassel
      const rows = [], n = 21, y0 = D.chinY + 0.4 * hh, y1 = D.waistY - 0.02 * H;
      for (let i = 0; i <= n; i++) {
        const k = i / n, y = mix(y0, y1, k), rr = torsoR(clamp(y, D.waistY, D.neckBaseY)), bz = (y > D.shoulderY ? hh * 0.5 : rr.rz + hh * 0.1) + (y > D.shoulderY ? 0 : 0.004 * H);
        const j = 1 - (i % 2) * 0.1;
        const wf = (x, yy) => {
          const q = smooth(y0, y1, yy), a = 1 - q;     // 0 at top
          const w1 = smooth(1.0, 0.65, q) , w2 = smooth(0.1, 0.5, q) * smooth(1.0, 0.7, q), w3 = smooth(0.45, 0.95, q);
          return [[B.head, Math.max(0, 1 - q * 3)], [B.braid1, w1 * 0.6], [B.braid2, w2], [B.braid3, w3]];
        };
        rows.push({ y, x: 0, z: bz, rx: hh * 0.075 * (1 - k * 0.45) * j, rz: hh * 0.075 * (1 - k * 0.45) * j, c: i % 2 ? col(hc, 1.3) : hc, wf });
      }
      mb.tube(rows, { seg: 7, cap1: true });
      const tip = rows[rows.length - 1];
      mb.tube([{ ...tip, y: tip.y + hh * 0.07, rx: tip.rx * 1.25, rz: tip.rz * 1.25, c: spec.hair?.tie ?? 0xb8302a }, { ...tip, y: tip.y - hh * 0.02, rx: tip.rx * 1.25, rz: tip.rz * 1.25, c: spec.hair?.tie ?? 0xb8302a }], { seg: 7 });
      mb.blob({ x: 0, y: tip.y - hh * 0.12, z: tip.z, rx: hh * 0.045, ry: hh * 0.13, rz: hh * 0.045, c: hc, seg: 6, rings: 4, wf: tip.wf });
      break;
    }
    case 'cap': {
      cap({ hl: 0.78, g1: 1.0, sideT: 0.55, backT: 0.4, g2: 2.0, grow: 0.01 });
      const rows = [];
      for (const t of [0.6, 0.7, 0.82, 0.93, 1.0, 1.05]) { const rr = ringAt(Math.min(1, t), hh * 0.07 * (t > 1 ? 0.3 : 1)); rows.push({ ...rr, y: D.chinY + t * hh + (t > 1 ? hh * 0.015 : 0), rx: rr.rx * (t > 1 ? 0.3 : 1), rz: rr.rz * (t > 1 ? 0.3 : 1) * 1.0, c: hairC }); }
      // cap colour is the 'hair' colour (a uniform cap); the real hair shows below it
      mb.tube(rows.map((r) => ({ ...r, wf: wHead })), { seg: 14, cap1: true });
      mb.blob({ x: 0, y: D.chinY + 0.69 * hh, z: -hh * 0.46, rx: hh * 0.32, ry: hh * 0.025, rz: hh * 0.25, c: shade2(hairC, 0.8), seg: 10, rings: 3, wf: wHead });
      mb.tube([{ ...ringAt(0.67, hh * 0.075), c: 0xd0c070, wf: wHead }, { ...ringAt(0.72, hh * 0.075), c: 0xd0c070, wf: wHead }], { seg: 14 });
      break;
    }
    case 'turban': {
      // layers of wound cloth: a dome, then bands wound across it
      const rows = [];
      for (const t of [0.52, 0.6, 0.72, 0.85, 0.96, 1.04, 1.1]) { const rr = ringAt(Math.min(1, t), hh * 0.085 * (t > 1 ? 0.5 : 1)); rows.push({ ...rr, y: D.chinY + t * hh + (t > 1 ? hh * 0.02 : 0), rx: rr.rx * (t > 1 ? 0.55 : 1), rz: rr.rz * (t > 1 ? 0.55 : 1), c: hairC, wf: wHead }); }
      mb.tube(rows, { seg: 16, cap1: true });
      for (let i = 0; i < 4; i++) mb.blob({ x: (i - 1.5) * hh * 0.02, y: D.chinY + (0.64 + i * 0.1) * hh, z: hh * 0.04, rx: hh * 0.5, ry: hh * 0.06, rz: hh * 0.53, c: shade2(hairC, i % 2 ? 0.8 : 1.15), rot: [0.1 * (i - 1.5), 0.2 * (i % 2 ? 1 : -1), 0.12 * (i - 1.5)], seg: 14, rings: 4, wf: wHead });
      mb.blob({ x: hh * 0.12, y: D.chinY + 0.98 * hh, z: -hh * 0.02, rx: hh * 0.18, ry: hh * 0.08, rz: hh * 0.2, c: shade2(hairC, 0.9), seg: 8, rings: 4, wf: wHead });
      break;
    }
    case 'hood': {
      // a dupatta pulled over the hair and falling on both shoulders
      const rows = [];
      for (const t of [1.04, 0.97, 0.88, 0.76, 0.62, 0.48, 0.34, 0.2, 0.02]) {
        const rr = ringAt(Math.min(1, t), hh * 0.075);
        const drop = t < 0.3 ? (0.3 - t) : 0;
        const wf = (x, yy) => { const a = smooth(D.chinY + 0.3 * hh, D.shoulderY - 0.02, yy); return [[B.head, 1 - a], [B.chest, a]]; };
        const gap = t > 0.9 ? 0 : mix(0.6, 1.05, smooth(0.8, 0.3, t));
        rows.push({ ...rr, y: t >= 0.2 ? D.chinY + t * hh : D.chinY + t * hh - drop * hh * 0.3, rx: rr.rx * (1 + drop * 1.7), rz: rr.rz * (1 + drop * 0.8), z: rr.z + drop * hh * 0.3, c: hairC, a0: gap, a1: Math.PI * 2 - gap, wf });
      }
      mb.tube(rows, { seg: 14, cap1: true });
      break;
    }
    default: break;
  }
  return { style };
}
const shade2 = (c, k) => (c.isColor ? c.clone().multiplyScalar(k) : new THREE.Color(c).multiplyScalar(k));

// rigid parts for code that wants the old five-part model ---------------------------------------------------------------
const PART_OF = (b) => (b >= B.uarmL && b <= B.handL ? 'armL' : b >= B.uarmR && b <= B.handR ? 'armR' : b >= B.thighL && b <= B.footL ? 'legL' : b >= B.thighR && b <= B.footR ? 'legR' : 'body');
export function splitRigid(geo, D) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, colA = geo.attributes.color, si = geo.attributes.skinIndex, sw = geo.attributes.skinWeight, idx = geo.index.array;
  const partOfV = new Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    let best = 0, bw = -1;
    for (let k = 0; k < 4; k++) if (sw.getComponent(i, k) > bw) { bw = sw.getComponent(i, k); best = si.getComponent(i, k); }
    partOfV[i] = PART_OF(best);
  }
  const pivot = { body: [0, 0, 0], armL: [-D.sw * 1.02, D.shoulderY - 0.02, 0], armR: [D.sw * 1.02, D.shoulderY - 0.02, 0], legL: [-D.hipW * 0.55, D.hipY, 0], legR: [D.hipW * 0.55, D.hipY, 0] };
  const out = {};
  for (const part of Object.keys(pivot)) {
    const map = new Map(), P = [], N = [], C = [], I = [];
    const add = (v) => {
      let m = map.get(v);
      if (m === undefined) { m = P.length / 3; map.set(v, m); P.push(pos.getX(v) - pivot[part][0], pos.getY(v) - pivot[part][1], pos.getZ(v) - pivot[part][2]); N.push(nor.getX(v), nor.getY(v), nor.getZ(v)); C.push(colA.getX(v), colA.getY(v), colA.getZ(v)); }
      return m;
    };
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t], b = idx[t + 1], c = idx[t + 2];
      const votes = { [partOfV[a]]: 1 }; votes[partOfV[b]] = (votes[partOfV[b]] ?? 0) + 1; votes[partOfV[c]] = (votes[partOfV[c]] ?? 0) + 1;
      let win = partOfV[a], wv = 0; for (const [k, v] of Object.entries(votes)) if (v > wv) { wv = v; win = k; }
      if (win === part) I.push(add(a), add(b), add(c));
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setIndex(I);
    g.computeBoundingSphere();
    out[part] = g;
  }
  return out;
}
