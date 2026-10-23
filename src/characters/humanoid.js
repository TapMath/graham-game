// Procedural low-poly people (PLAN 3b, Phase 3 third-person view). No textures, no skeleton files:
// each character is built from three.js primitives, merged per body part with vertex colours, so one
// character costs 5 draw calls (torso+head, two arms, two legs) with a single shared material.
//
//   const mithi = buildCharacter(MITHI);          // or SETU, or npcSpec({...}) for the Phase 6 cast
//   scene.add(mithi.group);                       // group origin = feet, faces -Z at rotation.y = 0 (like the player)
//   mithi.group.rotation.y = yaw;                 // +yaw turns left, same convention as player.yaw
//   mithi.update(dt, speed, { onGround });        // procedural walk cycle (limb swing); speed in m/s
//   mithi.setVariant('jacket');                   // swap to a variant body (Mithi: the blue Metro jacket)
//   mithi.toStaticGeometry()                      // one merged BufferGeometry in rest pose (vendors, bystanders)
//
// A spec describes the person (see MITHI, SETU, NPC_DEFAULT for every field):
//   { name, height, build:'slim'|'normal'|'stocky'|'child', skin, glasses,
//     hair:{color, style:'braid'|'long'|'short'|'bun'|'cap'|'hood'|'bald'|'turban'},
//     top:{color, trim, length:'shirt'|'kurta'|'longKurta'|'coat', sleeves:'short'|'long'},
//     bottom:{color, style:'trousers'|'shorts'|'skirt'}, shoes,
//     scarf:{color, trim}|null, jacket:{color, stripe}|null,
//     props:['cane','mouthOrgan','torch','bag','hardHat','bandage' (white wrap on the left arm), 'headBand' (white bandage round the head), 'headLamp'],
//     variants:{ name: {…fields to override…} } }
// Everything is in metres. All characters share `characterMaterial(game)`.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

let _mat = null;
/** The one material for every person (vertex colours, flat shading, a little emissive lift so they read in the dark). */
export function characterMaterial(game) {
  if (_mat) return _mat;
  _mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: new THREE.Color(0x20262a) });
  game?.materials?.all?.push(_mat);
  return _mat;
}

// ------------------------------------------------------------------------------------------ geometry helper
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();

class Mesher {
  constructor() { this.list = []; }
  _add(g, x, y, z, color, o = {}) {
    _e.set(o.rx ?? 0, o.ry ?? 0, o.rz ?? 0);
    _q.setFromEuler(_e);
    _v.set(x, y, z); _s.set(o.sx ?? 1, o.sy ?? 1, o.sz ?? 1);
    _m.compose(_v, _q, _s);
    g = g.index ? g.toNonIndexed() : g;
    g.applyMatrix4(_m);
    g.deleteAttribute('uv');
    const n = g.attributes.position.count, c = new THREE.Color(color), a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      // a hint of per-face variation keeps flat colours from looking like plastic
      a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    g.computeVertexNormals();
    this.list.push(g);
    return this;
  }
  box(w, h, d, x, y, z, color, o) { return this._add(new THREE.BoxGeometry(w, h, d), x, y, z, color, o); }
  cyl(rTop, rBot, h, x, y, z, color, o = {}) { return this._add(new THREE.CylinderGeometry(rTop, rBot, h, o.seg ?? 8, 1), x, y, z, color, o); }
  ball(r, x, y, z, color, o = {}) { return this._add(new THREE.IcosahedronGeometry(r, o.detail ?? 1), x, y, z, color, o); }
  build() {
    const g = mergeGeometries(this.list, false);
    this.list.forEach((x) => x.dispose());
    g.computeBoundingSphere();
    return g;
  }
}

// ------------------------------------------------------------------------------------------ specs
export const SKIN = { light: 0xd9a77e, tan: 0xb98660, brown: 0xa06f4b, dark: 0x7a4f35, deep: 0x5c3a28 };

export const MITHI = Object.freeze({
  name: 'Mithi', height: 1.62, build: 'slim', skin: SKIN.brown, glasses: true,
  hair: { color: 0x14100e, style: 'braid', tie: 0xb8302a },
  top: { color: 0x2a3150, trim: 0x8a93b8, length: 'longKurta', sleeves: 'long' },
  bottom: { color: 0x1c2036, style: 'trousers' }, shoes: 0x2b211c,
  scarf: { color: 0x6a2f52, trim: 0xd0a84a },
  jacket: null,
  props: ['cane'],
  // the blue Metro-worker jacket from the dead neighbour's flat (PLAN 1b disguise)
  variants: { jacket: { jacket: { color: 0x2f6db3, stripe: 0xe8e060 }, scarf: null } },
});

export const SETU = Object.freeze({
  name: 'Setu', height: 1.2, build: 'child', skin: SKIN.brown,
  hair: { color: 0x15110f, style: 'short' },
  top: { color: 0xd49a2c, trim: 0xf0d27a, length: 'shirt', sleeves: 'short' },
  bottom: { color: 0x3a4a6a, style: 'shorts' }, shoes: 0x7a3a2a,
  scarf: null, jacket: null,
  props: ['mouthOrgan'],
});

/** A generic adult/child with sensible defaults; Phase 6 builds the cast with npcSpec({...}). */
export const NPC_DEFAULT = Object.freeze({
  name: 'npc', height: 1.7, build: 'normal', skin: SKIN.tan,
  hair: { color: 0x1a1512, style: 'short' },
  top: { color: 0x59695f, trim: 0x9aa8a0, length: 'shirt', sleeves: 'long' },
  bottom: { color: 0x33343c, style: 'trousers' }, shoes: 0x1f1a17,
  scarf: null, jacket: null, props: [],
});
export function npcSpec(over = {}) {
  const s = { ...NPC_DEFAULT, ...over };
  for (const k of ['hair', 'top', 'bottom']) s[k] = { ...NPC_DEFAULT[k], ...(over[k] ?? {}) };
  return s;
}

/** Starting looks for the Phase 6 cast and bystanders (the spec is the whole contract: tweak colours, props, height). */
export const NPC_PRESETS = Object.freeze({
  jeetu: npcSpec({ name: 'Jeetu', height: 1.28, build: 'child', skin: SKIN.tan, hair: { style: 'short', color: 0x1a1512 }, top: { color: 0xb8483a, trim: 0xf0b8a0, length: 'shirt', sleeves: 'short' }, bottom: { color: 0x2f3b52, style: 'shorts' }, shoes: 0x2a2a2a, props: ['torch'] }),
  tara: npcSpec({ name: 'Tara', height: 1.67, build: 'slim', skin: SKIN.light, hair: { style: 'long', color: 0x2a1812 }, top: { color: 0x1f6a6a, trim: 0xe0c070, length: 'kurta', sleeves: 'long' }, bottom: { color: 0xe8e0d0, style: 'trousers' }, shoes: 0x6a4a2a, scarf: { color: 0xe0c070, trim: 0xa04a3a } }),
  gautam: npcSpec({ name: 'Gautam', height: 1.77, build: 'normal', skin: SKIN.tan, hair: { style: 'short', color: 0x1e1814 }, top: { color: 0x6a7480, trim: 0xa8b0b8, length: 'shirt', sleeves: 'long' }, bottom: { color: 0x2c2f38, style: 'trousers' } }),
  aayat: npcSpec({ name: 'Aayat', height: 1.16, build: 'child', skin: SKIN.dark, hair: { style: 'bun', color: 0x14100e }, top: { color: 0x7a6a50, trim: 0xb0a080, length: 'kurta', sleeves: 'long' }, bottom: { color: 0x4a4038, style: 'trousers' }, shoes: 0x3a2a20 }),
  kaalu: npcSpec({ name: 'Kaalu Seth', height: 1.84, build: 'stocky', skin: SKIN.dark, hair: { style: 'turban', color: 0x8a2a20 }, top: { color: 0x1a1a1e, trim: 0xc8a040, length: 'coat', sleeves: 'long' }, bottom: { color: 0x26262a, style: 'trousers' }, shoes: 0x181412 }),
  doctor: npcSpec({ name: 'Doctor', height: 1.72, build: 'normal', skin: SKIN.brown, hair: { style: 'short', color: 0x8a8a88 }, top: { color: 0xd8dcd8, trim: 0x8aa0a8, length: 'coat', sleeves: 'long' }, bottom: { color: 0x3a4048, style: 'trousers' } }),
  guard: npcSpec({ name: 'Guard', height: 1.8, build: 'stocky', skin: SKIN.tan, hair: { style: 'cap', color: 0x1c2a44 }, top: { color: 0x2a3a58, trim: 0xd0c070, length: 'shirt', sleeves: 'long' }, bottom: { color: 0x1c2438, style: 'trousers' }, shoes: 0x101010 }),
  nurse: npcSpec({ name: 'Nurse', height: 1.6, build: 'slim', skin: SKIN.brown, hair: { style: 'bun', color: 0x14100e }, top: { color: 0x58a0a0, trim: 0xe0f0f0, length: 'kurta', sleeves: 'short' }, bottom: { color: 0xe8ecec, style: 'trousers' }, shoes: 0xe0e0e0 }),
  rescuer: npcSpec({ name: 'Rescuer', height: 1.74, build: 'normal', skin: SKIN.brown, hair: { style: 'bald', color: 0 }, top: { color: 0x4a4a42, length: 'shirt', sleeves: 'long' }, bottom: { color: 0x30323a, style: 'trousers' }, jacket: { color: 0xe88a20, stripe: 0xe8e8a0 }, props: ['hardHat'] }),
  tunnelDweller: npcSpec({ name: 'Dweller', height: 1.6, build: 'slim', skin: SKIN.deep, hair: { style: 'long', color: 0x0e0c0a }, top: { color: 0x4a4440, trim: 0x706a60, length: 'kurta', sleeves: 'long' }, bottom: { color: 0x2a2622, style: 'trousers' }, shoes: 0x2a2018 }),
});
export const buildNpc = (name, game) => buildCharacter(NPC_PRESETS[name], game);

const BUILD = {
  slim: { w: 1.0, head: 0.07, hip: 0.5, arm: 0.36 },
  normal: { w: 1.0, head: 0.065, hip: 0.5, arm: 0.37 },
  stocky: { w: 1.18, head: 0.066, hip: 0.49, arm: 0.37 },
  child: { w: 0.9, head: 0.088, hip: 0.44, arm: 0.36 },
  big: { w: 1.7, head: 0.062, hip: 0.49, arm: 0.37 },          // the Big Man
};

function merged(spec, over) {
  const s = { ...spec, ...over };
  if (over) for (const k of ['hair', 'top', 'bottom']) s[k] = { ...spec[k], ...(over[k] ?? {}) };
  return s;
}

// ------------------------------------------------------------------------------------------ the build
function buildSet(spec) {
  const H = spec.height, B = BUILD[spec.build] ?? BUILD.normal;
  const headR = H * B.head, hipY = H * B.hip, shoulderY = H * (spec.build === 'child' ? 0.77 : 0.815);
  const sw = H * 0.1 * B.w, hipW = H * 0.085 * B.w, legR = H * 0.032 * B.w, armR = H * 0.021 * B.w;
  const armLen = H * B.arm, legLen = hipY;
  const skin = spec.skin, top = spec.top, jacket = spec.jacket;
  const sleeveColor = jacket ? jacket.color : top.color;
  const longSleeves = jacket ? true : top.sleeves === 'long';
  const L = {};   // dims the Character needs

  // ---- legs (hang from the hip pivot, mesh origin at the hip)
  const leg = () => {
    const m = new Mesher();
    const b = spec.bottom;
    const shoeH = H * 0.03;
    if (b.style === 'shorts') {
      m.cyl(legR * 1.18, legR * 1.3, legLen * 0.42, 0, -legLen * 0.21, 0, b.color);          // shorts
      m.cyl(legR * 0.92, legR * 0.82, legLen * 0.58 - shoeH, 0, -legLen * 0.42 - (legLen * 0.58 - shoeH) / 2, 0, skin);   // bare leg
    } else {
      m.cyl(legR * 1.15, legR * 0.85, legLen - shoeH, 0, -(legLen - shoeH) / 2, 0, b.color);
    }
    m.box(legR * 2.1, shoeH, legR * 4.6, 0, -legLen + shoeH / 2, -legR * 0.9, spec.shoes);
    return m.build();
  };

  // ---- arms (hang from the shoulder pivot)
  const arm = (side, variantCane) => {
    const m = new Mesher();
    const sleeveLen = longSleeves ? armLen * 0.86 : armLen * 0.4;
    m.cyl(armR * 1.25, armR * 1.05, sleeveLen, 0, -sleeveLen / 2, 0, sleeveColor);
    if (!longSleeves) m.cyl(armR * 0.95, armR * 0.8, armLen - sleeveLen - armR * 1.5, 0, -sleeveLen - (armLen - sleeveLen - armR * 1.5) / 2, 0, skin);
    if (jacket && jacket.stripe) m.cyl(armR * 1.3, armR * 1.2, armLen * 0.07, 0, -armLen * 0.5, 0, jacket.stripe, { seg: 8 });
    m.ball(armR * 1.05, 0, -armLen + armR * 0.2, 0, skin, { detail: 0 });                    // hand
    if (variantCane && spec.props.includes('cane')) {
      // white cane: a straight continuation of the arm, long enough to touch the floor when the arm angles forward
      const cl = H * 0.62;
      m.cyl(0.011, 0.011, cl, 0, -armLen + armR - cl / 2 + 0.06, 0, 0xf2f2ee, { seg: 5 });
      m.cyl(0.0125, 0.0125, cl * 0.14, 0, -armLen + armR - cl * 0.5 - cl * 0.12, 0, 0xc23a30, { seg: 5 });
      m.ball(0.02, 0, -armLen + armR - cl + 0.06, 0, 0xf2f2ee, { detail: 0 });
    }
    if (side < 0 && spec.props.includes('bandage')) {                                          // a white bandage wrapped round the forearm, a spot of red
      m.cyl(armR * 1.75, armR * 1.55, armLen * 0.46, 0, -armLen * 0.62, 0, 0xe8e4d6, { seg: 8 });
      m.cyl(armR * 1.8, armR * 1.8, armLen * 0.05, 0, -armLen * 0.5, 0, 0xcfc8b6, { seg: 8 });
      m.box(armR * 1.2, armLen * 0.08, armR * 0.6, 0, -armLen * 0.66, -armR * 1.5, 0xb83a30);
    }
    if (side > 0 && spec.props.includes('mouthOrgan')) {
      m.box(H * 0.085, H * 0.022, H * 0.03, 0, -armLen + armR * 0.2, -armR * 1.6, 0xb8c4cc, { ry: 0.3 });
      m.box(H * 0.07, H * 0.012, H * 0.012, 0, -armLen + armR * 0.2 + H * 0.003, -armR * 1.6 - H * 0.016, 0x2a2e32, { ry: 0.3 });
    }
    if (side > 0 && spec.props.includes('torch')) {
      m.cyl(armR * 1.3, armR * 1.6, H * 0.12, 0, -armLen + armR * 0.2, -armR * 1.5, 0x30363a, { rx: Math.PI / 2 });
      m.cyl(armR * 2.1, armR * 1.4, H * 0.025, 0, -armLen + armR * 0.2, -armR * 1.5 - H * 0.065, 0xffe9a0, { rx: Math.PI / 2 });
    }
    return m.build();
  };

  // ---- body: torso (+ skirt/kurta), neck, head, hair, face bits, scarf, jacket, bag
  const body = () => {
    const m = new Mesher();
    const torsoH = shoulderY - hipY + H * 0.03;
    const torsoCY = hipY + (shoulderY - hipY) / 2 - H * 0.005;
    const len = top.length;
    const ts = spec.build === 'child' ? 1.0 : 1.0;
    // base torso: slightly tapered cylinder, flattened front-to-back
    const bodyColor = top.color;
    m.cyl(sw * 1.0 * ts, hipW * 1.12, torsoH, 0, torsoCY, 0, bodyColor, { sz: 0.66, seg: 8 });
    // hips (trouser colour) under shirts
    if (len === 'shirt') m.cyl(hipW * 1.12, hipW * 1.15, H * 0.05, 0, hipY - H * 0.005, 0, spec.bottom.color, { sz: 0.7, seg: 8 });
    if (len === 'kurta' || len === 'longKurta' || len === 'coat') {
      const hem = len === 'longKurta' ? H * 0.26 : len === 'kurta' ? H * 0.33 : H * 0.35;
      const h = hipY + H * 0.02 - hem;
      m.cyl(hipW * 1.12, hipW * (len === 'coat' ? 1.45 : 1.65), h, 0, hem + h / 2, 0, bodyColor, { sz: 0.72, seg: 8 });
      if (top.trim) m.cyl(hipW * 1.66, hipW * 1.68, H * 0.016, 0, hem + H * 0.008, 0, top.trim, { sz: 0.72, seg: 8 });
      if (top.trim) m.box(H * 0.012, hipY - hem + H * 0.02, 0.01, 0, hem + (hipY - hem + H * 0.02) / 2, -hipW * 1.18 * 0.72 - 0.004, top.trim);   // front placket
    } else if (spec.bottom.style === 'skirt') {
      const h = H * 0.28;
      m.cyl(hipW * 1.15, hipW * 1.6, h, 0, hipY - h / 2 + H * 0.02, 0, spec.bottom.color, { sz: 0.74, seg: 8 });
    }
    if (len === 'shirt' && top.trim) m.box(sw * 1.5, H * 0.012, 0.012, 0, shoulderY - H * 0.012, -sw * 0.66, top.trim);   // collar band
    // shoulders
    m.box(sw * 2.05, H * 0.045, sw * 1.0, 0, shoulderY - H * 0.012, 0, jacket ? jacket.color : bodyColor);
    // jacket over the torso: waist length, hi-vis stripe
    if (jacket) {
      const jh = (shoulderY - hipY) + H * 0.09;
      m.cyl(sw * 1.12, hipW * 1.35, jh, 0, shoulderY - jh / 2 + H * 0.01, 0, jacket.color, { sz: 0.74, seg: 8 });
      if (jacket.stripe) {
        m.cyl(hipW * 1.4, hipW * 1.4, H * 0.018, 0, hipY + H * 0.045, 0, jacket.stripe, { sz: 0.75, seg: 8 });
        m.cyl(sw * 1.18, sw * 1.18, H * 0.015, 0, shoulderY - H * 0.07, 0, jacket.stripe, { sz: 0.75, seg: 8 });
      }
      m.box(sw * 1.1, H * 0.03, 0.012, 0, shoulderY - H * 0.02, -sw * 0.75, 0x1d4a82);   // collar
    }
    // neck + head
    const headY = H - headR * 1.05;
    m.cyl(headR * 0.36, headR * 0.42, H * 0.05, 0, shoulderY + H * 0.012, 0, skin, { seg: 6 });
    m.ball(headR, 0, headY, 0, skin, { sx: 0.88, sy: 1.04, sz: 0.96, detail: 1 });
    m.box(headR * 0.16, headR * 0.28, headR * 0.2, 0, headY - headR * 0.12, -headR * 0.96, skin);          // nose
    if (spec.glasses) {
      m.box(headR * 1.62, headR * 0.26, headR * 0.12, 0, headY + headR * 0.08, -headR * 0.82, 0x0a0c10);   // dark band: Mithi is blind
      m.box(headR * 0.1, headR * 0.1, headR * 0.12, -headR * 0.64, headY + headR * 0.1, -headR * 0.9, 0x303642);
    } else {
      for (const sx of [-1, 1]) m.box(headR * 0.14, headR * 0.12, headR * 0.1, sx * headR * 0.34, headY + headR * 0.08, -headR * 0.88, 0x1a1210);
    }
    m.box(headR * 0.36, headR * 0.07, headR * 0.08, 0, headY - headR * 0.5, -headR * 0.86, 0x8a4a3c);    // mouth
    // hair
    const hr = spec.hair, hc = hr.color;
    switch (hr.style) {
      case 'braid':
      case 'long': {
        m.ball(headR * 1.08, 0, headY + headR * 0.1, headR * 0.16, hc, { sx: 0.9, sy: 1.0, sz: 1.0 });
        m.box(headR * 1.5, headR * 0.28, headR * 0.3, 0, headY + headR * 0.72, -headR * 0.5, hc);          // fringe
        if (hr.style === 'braid') {
          const bl = H * 0.3, segs = 4;
          for (let i = 0; i < segs; i++) {
            const t = i / segs;
            m.ball(headR * (0.36 - 0.05 * t), 0, headY - headR * 0.5 - t * bl, headR * (0.96 + 0.18 * t), hc, { sy: 1.5, detail: 0 });
          }
          m.cyl(headR * 0.22, headR * 0.24, headR * 0.16, 0, headY - headR * 0.5 - bl * 0.8, headR * 1.12, hr.tie ?? 0xb8302a, { seg: 6 });
        } else {
          m.box(headR * 1.6, H * 0.26, headR * 0.5, 0, headY - H * 0.1, headR * 0.85, hc);
        }
        break;
      }
      case 'bun':
        m.ball(headR * 1.06, 0, headY + headR * 0.1, headR * 0.1, hc, { sx: 0.9 });
        m.ball(headR * 0.5, 0, headY + headR * 0.75, headR * 0.7, hc, { detail: 0 });
        break;
      case 'short':
        m.ball(headR * 1.06, 0, headY + headR * 0.14, headR * 0.1, hc, { sx: 0.9, sy: 0.92 });
        m.box(headR * 1.35, headR * 0.22, headR * 0.26, 0, headY + headR * 0.7, -headR * 0.55, hc);
        break;
      case 'cap':
        m.ball(headR * 1.1, 0, headY + headR * 0.22, 0, hc, { sx: 0.9, sy: 0.7 });
        m.box(headR * 1.3, headR * 0.1, headR * 0.7, 0, headY + headR * 0.45, -headR * 1.15, hc);
        break;
      case 'hood':
        m.ball(headR * 1.28, 0, headY + headR * 0.12, headR * 0.2, hc, { sx: 0.95, sy: 1.0 });
        m.cyl(sw * 0.95, sw * 1.35, H * 0.14, 0, shoulderY - H * 0.04, 0, hc, { sz: 0.8 });
        break;
      case 'turban':
        m.ball(headR * 1.2, 0, headY + headR * 0.35, 0, hc, { sx: 0.95, sy: 0.85 });
        break;
      default: break;     // bald
    }
    // scarf / dupatta: shoulder wrap plus a tail in front over one shoulder and a longer one behind
    if (spec.scarf && !jacket) {
      const sc = spec.scarf, ty = shoulderY - H * 0.018;
      m.box(sw * 2.25, H * 0.05, sw * 1.35, 0, ty, H * 0.004, sc.color);
      m.box(H * 0.11, H * 0.4, 0.014, -sw * 0.55, ty - H * 0.225, -sw * 0.7, sc.color, { rx: -0.05 });              // front tail
      if (sc.trim) m.box(H * 0.11, H * 0.012, 0.018, -sw * 0.55, ty - H * 0.42, -sw * 0.71, sc.trim, { rx: -0.05 });
      m.box(H * 0.2, H * 0.52, 0.016, sw * 0.1, ty - H * 0.28, sw * 0.78, sc.color, { rx: 0.1 });                  // long back tail
      if (sc.trim) {
        m.box(H * 0.2, H * 0.013, 0.02, sw * 0.1, ty - H * 0.54, sw * 0.82, sc.trim, { rx: 0.1 });
        m.box(H * 0.012, H * 0.5, 0.02, sw * 0.1 - H * 0.1, ty - H * 0.28, sw * 0.8, sc.trim, { rx: 0.1 });
        m.box(H * 0.012, H * 0.5, 0.02, sw * 0.1 + H * 0.1, ty - H * 0.28, sw * 0.8, sc.trim, { rx: 0.1 });
      }
    }
    if (spec.props.includes('bag')) m.box(sw * 1.4, H * 0.2, H * 0.09, 0, shoulderY - H * 0.14, sw * 0.9, 0x6a5a3a);
    if (spec.props.includes('headBand')) {
      m.cyl(headR * 1.0, headR * 1.0, headR * 0.5, 0, headY + headR * 0.34, 0, 0xe8e4d6, { sx: 0.9, sz: 0.97, seg: 10 });
      m.box(headR * 0.5, headR * 0.34, headR * 0.1, headR * 0.5, headY + headR * 0.34, -headR * 0.9, 0xb83a30);
    }
    if (spec.props.includes('headLamp')) {
      m.cyl(headR * 1.02, headR * 1.02, headR * 0.16, 0, headY + headR * 0.45, 0, 0x3a3a38, { sx: 0.9, sz: 0.97, seg: 10 });
      m.box(headR * 0.4, headR * 0.34, headR * 0.3, 0, headY + headR * 0.5, -headR * 1.0, 0xffe9a0);
    }
    if (spec.props.includes('hardHat')) {
      m.ball(headR * 1.12, 0, headY + headR * 0.38, 0, 0xe8c030, { sy: 0.7, sx: 0.95 });
      m.box(headR * 1.5, headR * 0.1, headR * 1.0, 0, headY + headR * 0.28, -headR * 0.12, 0xe8c030);
    }
    return m.build();
  };

  L.shoulderY = shoulderY; L.hipY = hipY; L.sw = sw; L.hipW = hipW; L.armLen = armLen; L.legLen = legLen; L.headR = headR; L.H = H; L.legR = legR;
  return { body: body(), armL: arm(-1, false), armR: arm(1, true), legL: leg(), legR: leg(), dims: L };
}

// ------------------------------------------------------------------------------------------ the character
export class Character {
  constructor(spec, game) {
    this.spec = spec;
    this.name = spec.name;
    this.mat = characterMaterial(game);
    this.sets = { default: buildSet(spec) };
    for (const [name, over] of Object.entries(spec.variants ?? {})) this.sets[name] = buildSet(merged(spec, over));
    this.variant = 'default';
    const d = this.sets.default.dims;
    this.dims = d;
    this.group = new THREE.Group();
    this.group.name = 'character-' + spec.name;
    this.rig = new THREE.Group();            // bob / lean applied here, the feet stay on the group origin
    this.group.add(this.rig);
    const set = this.sets.default;
    this.body = new THREE.Mesh(set.body, this.mat);
    this.armL = new THREE.Mesh(set.armL, this.mat);
    this.armR = new THREE.Mesh(set.armR, this.mat);
    this.legL = new THREE.Mesh(set.legL, this.mat);
    this.legR = new THREE.Mesh(set.legR, this.mat);
    this.armL.position.set(-d.sw * 1.02, d.shoulderY - 0.02, 0);
    this.armR.position.set(d.sw * 1.02, d.shoulderY - 0.02, 0);
    this.legL.position.set(-d.hipW * 0.55, d.hipY, 0);
    this.legR.position.set(d.hipW * 0.55, d.hipY, 0);
    for (const a of [this.armL, this.armR]) a.rotation.order = 'YXZ';
    this.parts = [this.body, this.armL, this.armR, this.legL, this.legR];
    for (const p of this.parts) { p.frustumCulled = true; this.rig.add(p); }
    this.hasCane = spec.props.includes('cane');
    this.phase = 0; this.t = Math.random() * 10; this.stride = 0; this.speed = 0;
    this.group.visible = true;
  }

  setVariant(name) {
    const set = this.sets[name] ?? this.sets.default;
    this.variant = this.sets[name] ? name : 'default';
    this.body.geometry = set.body; this.armL.geometry = set.armL; this.armR.geometry = set.armR;
    this.legL.geometry = set.legL; this.legR.geometry = set.legR;
  }

  /** Procedural walk. speed: horizontal m/s; opts.onGround=false = airborne pose. */
  update(dt, speed = 0, opts = {}) {
    this.t += dt;
    const air = opts.onGround === false;
    const sp = Math.min(speed, 9);
    this.speed += (sp - this.speed) * Math.min(1, dt * 10);          // eased so stops and starts are not a snap
    const s = this.speed, moving = s > 0.25;
    const k = Math.min(1, s / 4.2);
    this.stride += (moving ? 1 : -1) * Math.min(1, dt * 8);
    this.stride = Math.max(0, Math.min(1, this.stride));
    const w = this.stride;
    this.phase += dt * (1.6 + s * 1.6) * (moving ? 1 : 0);
    const ph = this.phase;
    const legAmp = Math.min(0.75, 0.2 * s) * w, armAmp = legAmp * 0.8;
    const sw = Math.sin(ph);
    const idle = Math.sin(this.t * 1.7) * 0.02;
    if (air) {
      this.legL.rotation.x = 0.5; this.legR.rotation.x = -0.35;
      this.armL.rotation.x = -0.9; this.armR.rotation.x = -0.9;
      this.armL.rotation.z = -0.5; this.armR.rotation.z = 0.5;
    } else {
      this.legL.rotation.x = sw * legAmp; this.legR.rotation.x = -sw * legAmp;
      this.armL.rotation.x = -sw * armAmp + idle; this.armL.rotation.z = -0.04;
      this.armR.rotation.z = 0.04;
      if (this.hasCane) {
        // cane arm: held out in front, the tip sweeping side to side at each step
        this.armR.rotation.x = 0.62 + Math.sin(ph * 0.5 + 1) * 0.05 * w;
        this.armR.rotation.y = Math.sin(ph * 0.5) * (0.28 + 0.08 * k) * (0.35 + 0.65 * w) + Math.sin(this.t * 0.9) * 0.05 * (1 - w);
      } else this.armR.rotation.x = sw * armAmp + idle;
    }
    const bob = moving && !air ? Math.abs(Math.sin(ph)) * 0.022 * this.dims.H : 0;
    this.rig.position.y = bob + Math.sin(this.t * 1.7) * 0.004 * (1 - w);
    this.rig.rotation.x = -0.1 * k * w;                              // lean into the walk (negative = forward, we face -Z)
  }

  /** One merged BufferGeometry of the rest pose, for bystanders and vendors (then 1 draw call per group). */
  toStaticGeometry(armPose = {}) {
    const list = [];
    if (armPose.armR !== undefined) this.armR.rotation.x = armPose.armR;
    if (armPose.armL !== undefined) this.armL.rotation.x = armPose.armL;
    if (armPose.armRz !== undefined) this.armR.rotation.z = armPose.armRz;
    this.group.updateMatrixWorld(true);
    for (const p of this.parts) {
      const g = p.geometry.clone(); g.applyMatrix4(p.matrixWorld); list.push(g);
    }
    const out = mergeGeometries(list, false);
    list.forEach((g) => g.dispose());
    return out;
  }

  dispose() { for (const s of Object.values(this.sets)) for (const g of [s.body, s.armL, s.armR, s.legL, s.legR]) g.dispose(); }
}

export function buildCharacter(spec, game) { return new Character(spec, game); }
export const buildMithi = (game) => buildCharacter(MITHI, game);
export const buildSetu = (game) => buildCharacter(SETU, game);
