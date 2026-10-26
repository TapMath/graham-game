// Sunlight guidance in the world (Phase 8A).
//
//   upRoutes(map)        every way UP from a level, as plain data: [{id, kind:'stairs'|'ramp'|'lift', from, to, x, z, y, ax, az, w, gate, min}]
//                        (x, z, y) is the entrance on the lower level, (ax, az) the unit direction you walk to go in (toward the stairs,
//                        up the ramp, into the car). Shared with the HUD's warmth cue and the map (src/ui/).
//   new Guidance(game, map).build()    three small additions to the scene, 3 draw calls in all:
//     beacons   one mesh: for every sun shaft a thin pale column that carries on up past the tower tops, through the smog (no fog on it,
//               so it reads from afar, fainter close up where the real shaft is). It brightens as Mithi runs low on rays and goes with the day.
//     arrows    one InstancedMesh of painted street arrows (a sun glyph and a chevron) on the approaches to every way up, and at the
//               crossroads of the ground streets, pointing to the nearest one.
//     signs     one InstancedMesh of lit placards "धूप ↑ SUN ↑" on a post beside the foot of every way up (and at some crossroads).
//   guidance.stats        {beacons, arrows, signs}      guidance.update(dt)
import * as THREE from '../../vendor/three.module.js';
import { SHAFT_LEAN } from './map.js';
import { levelAt } from './levels.js';

const V = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };
const ORDER = ['U', 'G', 'L1', 'L2', 'L3'];
export const levelIndex = (l) => ORDER.indexOf(l);

/** Every way up, from the lower level's side. Two-stop lifts give one route (their bottom), a three-stop lift gives one per stop below the top. */
export function upRoutes(map) {
  const out = [];
  for (const s of map.stairs) {
    const a = levelAt(s.y0), b = levelAt(s.y1);
    if (a === b) continue;
    const [ax, az] = V[s.dir];
    out.push({ id: s.id, kind: 'stairs', from: a, to: b, x: s.x, z: s.z, y: s.y0, ax, az, w: s.width, gate: s.gate ?? null, min: s.gate ? (map.gates.find((g) => g.id === s.gate)?.min ?? 0) : 0 });
  }
  for (const r of map.ramps) {
    const ax = r.dir[1], sg = r.dir[0] === '-' ? -1 : 1;
    const xa = Math.min(r.x0, r.x1), xb = Math.max(r.x0, r.x1), za = Math.min(r.z0, r.z1), zb = Math.max(r.z0, r.z1);
    const lowU = ax === 'z' ? (sg > 0 ? za : zb) : (sg > 0 ? xa : xb);
    const x = ax === 'z' ? (xa + xb) / 2 : lowU, z = ax === 'z' ? lowU : (za + zb) / 2;
    out.push({ id: r.id, kind: 'ramp', from: levelAt(r.yLow), to: levelAt(r.yHigh), x, z, y: r.yLow, ax: ax === 'x' ? sg : 0, az: ax === 'z' ? sg : 0, w: ax === 'z' ? xb - xa : zb - za, gate: null, min: 0 });
  }
  for (const l of map.lifts) {
    const stops = (l.stops ?? [{ id: 'bottom', y: l.yBottom, exit: l.exits.bottom }, { id: 'top', y: l.yTop, exit: l.exits.top }]).slice().sort((p, q) => p.y - q.y);
    const top = stops[stops.length - 1], [cx, cz] = l.center, [w, d] = l.size;
    for (let i = 0; i < stops.length - 1; i++) {
      const st = stops[i], v = V[st.exit];
      if (!v) continue;
      out.push({
        id: l.id + (i ? ':' + st.id : ''), lift: l.id, stop: st.id, kind: 'lift', from: levelAt(st.y), to: levelAt(top.y),
        x: cx + v[0] * w / 2, z: cz + v[1] * d / 2, y: st.y, ax: -v[0], az: -v[1], w: v[0] ? d : w, gate: l.gate ?? null, min: top.min ?? 0,
      });
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ textures
function arrowTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 256, 256);
  g.lineJoin = 'round'; g.lineCap = 'round';
  // the chevron arrow, pointing up the texture
  const arrow = () => { g.beginPath(); g.moveTo(128, 6); g.lineTo(212, 98); g.lineTo(160, 98); g.lineTo(160, 178); g.lineTo(96, 178); g.lineTo(96, 98); g.lineTo(44, 98); g.closePath(); };
  arrow(); g.fillStyle = 'rgba(30,22,10,.55)'; g.fill();
  g.save(); g.translate(0, -3); arrow(); g.fillStyle = '#f4cf7a'; g.fill(); g.lineWidth = 5; g.strokeStyle = '#fff1c4'; g.stroke(); g.restore();
  // a small sun under the shaft of the arrow
  g.save(); g.translate(128, 218);
  g.fillStyle = '#f4cf7a'; g.beginPath(); g.arc(0, 0, 15, 0, 7); g.fill();
  g.strokeStyle = '#f4cf7a'; g.lineWidth = 5;
  for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; g.beginPath(); g.moveTo(Math.cos(a) * 22, Math.sin(a) * 22); g.lineTo(Math.cos(a) * 33, Math.sin(a) * 33); g.stroke(); }
  g.restore();
  // worn paint: knock grain out
  g.globalCompositeOperation = 'destination-out';
  let s = 11; const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(0,0,0,${0.25 + r() * 0.6})`; g.fillRect(r() * 256, r() * 256, 1 + r() * 4, 1 + r() * 3); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

function signTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 192;
  const g = c.getContext('2d');
  g.fillStyle = '#10171b'; g.fillRect(0, 0, 512, 192);
  g.strokeStyle = '#f0b860'; g.lineWidth = 6; g.strokeRect(9, 9, 494, 174);
  g.strokeStyle = 'rgba(240,184,96,.4)'; g.lineWidth = 2; g.strokeRect(19, 19, 474, 154);
  // a sun, left
  g.save(); g.translate(76, 96);
  g.fillStyle = '#ffd98a'; g.beginPath(); g.arc(0, 0, 21, 0, 7); g.fill();
  g.strokeStyle = '#ffd98a'; g.lineWidth = 6; g.lineCap = 'round';
  for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5; g.beginPath(); g.moveTo(Math.cos(a) * 31, Math.sin(a) * 31); g.lineTo(Math.cos(a) * 45, Math.sin(a) * 45); g.stroke(); }
  g.restore();
  g.textBaseline = 'middle'; g.fillStyle = '#ffe6b0'; g.textAlign = 'left';
  g.font = "700 62px 'Noto Sans Devanagari','Mangal','Nirmala UI','Kohinoor Devanagari','Lohit Devanagari','FreeSans','Helvetica Neue',sans-serif";
  g.fillText('धूप ↑', 150, 68);
  g.font = "800 52px 'Inter','Helvetica Neue',Arial,sans-serif"; g.fillStyle = '#f7f1e2';
  g.fillText('SUN ↑', 150, 134);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// ------------------------------------------------------------------------------------------------ beacons
const BEACON_VS = `
  attribute float aH; attribute float aAng;
  varying float vH; varying float vAng; varying vec3 vN; varying vec3 vV; varying float vDepth;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vH = aH; vAng = aAng; vN = normalize(normalMatrix * normal); vV = -mv.xyz; vDepth = length(mv.xyz);
    gl_Position = projectionMatrix * mv;
  }`;
const BEACON_FS = `
  uniform vec3 uColor; uniform float uI; uniform float uTime; uniform float uFar;
  varying float vH; varying float vAng; varying vec3 vN; varying vec3 vV; varying float vDepth;
  void main() {
    float f = abs(dot(normalize(vN), normalize(vV)));
    float edge = pow(f, 1.1);
    float rise = smoothstep(0.0, 0.1, vH) * (1.0 - smoothstep(0.55, 1.0, vH));
    float near = smoothstep(26.0, 120.0, vDepth);              // close up the real shaft carries the light; the beacon takes over with distance
    float gone = 1.0 - smoothstep(uFar * 0.82, uFar * 1.02, vDepth);
    float stri = 0.8 + 0.2 * sin(vAng * 7.0 + uTime * 0.15 + vH * 13.0);
    float a = edge * rise * near * gone * stri * uI * 0.78;
    gl_FragColor = vec4(uColor * a, a);
  }`;

export class Guidance {
  constructor(game, map, ctx = null) {
    this.game = game; this.map = map; this.ctx = ctx;
    this.stats = { beacons: 0, arrows: 0, signs: 0 };
    this.t = 0;
    this.routes = upRoutes(map);
    this.boost = 0.6;
  }

  build() {
    this._beacons();
    this._signage();
  }

  _beacons() {
    const g = this.game, shafts = this.game.world.sunShafts;
    const pos = [], nor = [], aH = [], aAng = [];
    const SIDES = 8, SEG = 6, TOP = 235;
    for (const s of shafts) {
      const y0 = s.y0 + 3, h = TOP - y0;
      const r0 = Math.max(s.r * 0.95, 1.2), r1 = Math.max(s.r * 2.3, 3.4);
      const P = (a, t) => {
        const hh = h * t, r = r0 + (r1 - r0) * Math.pow(t, 0.8);
        return [s.x + SHAFT_LEAN.x * hh + Math.cos(a) * r, y0 + hh, s.z + SHAFT_LEAN.z * hh + Math.sin(a) * r];
      };
      for (let i = 0; i < SIDES; i++) {
        const a0 = (i / SIDES) * Math.PI * 2, a1 = ((i + 1) / SIDES) * Math.PI * 2;
        for (let k = 0; k < SEG; k++) {
          const t0 = k / SEG, t1 = (k + 1) / SEG;
          const v = [[P(a0, t0), t0, a0], [P(a1, t0), t0, a1], [P(a1, t1), t1, a1], [P(a0, t1), t1, a0]];
          for (const tri of [[0, 1, 2], [0, 2, 3]]) for (const idx of tri) {
            const [p, t, a] = v[idx];
            pos.push(...p); aH.push(t); aAng.push(a); nor.push(Math.cos(a), 0, Math.sin(a));
          }
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('aH', new THREE.Float32BufferAttribute(aH, 1));
    geo.setAttribute('aAng', new THREE.Float32BufferAttribute(aAng, 1));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(40, 90, -10), 420);
    this.mat = new THREE.ShaderMaterial({
      vertexShader: BEACON_VS, fragmentShader: BEACON_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      uniforms: { uColor: { value: new THREE.Color(1.0, 0.9, 0.66) }, uI: { value: 0 }, uTime: { value: 0 }, uFar: { value: 340 } },
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.name = 'sun-beacons'; this.mesh.frustumCulled = false; this.mesh.renderOrder = 5;
    g.scene.add(this.mesh);
    this.stats.beacons = shafts.length;
  }

  /** True when a flat painted arrow (or a post) can stand at (x, z) on the surface at y. */
  _free(x, y, z, r = 0.5, high = 1.7) {
    const w = this.game.physics;
    const gh = w.groundHeightAt(x, z, y + 0.3, 0.3, 0.25);
    if (!(gh > y - 0.2 && gh < y + 0.2)) return null;
    for (const c of w.query(x - r, z - r, x + r, z + r)) if (c.solid && c.max.y > y + 0.2 && c.min.y < y + high) return null;
    return gh;
  }

  _signage() {
    const g = this.game, map = this.map;
    const arrows = [], signs = [];
    const seen = new Set();
    const key = (x, z, y) => `${Math.round(x * 2)}|${Math.round(z * 2)}|${Math.round(y)}`;
    const addArrow = (x, y, z, dx, dz, size = 1.7) => {
      const gh = this._free(x, y, z, 0.45); if (gh === null) return false;
      const k = key(x, z, y); if (seen.has(k)) return false; seen.add(k);
      arrows.push({ x, y: gh + 0.035, z, yaw: Math.atan2(-dx, -dz), size }); return true;
    };
    const addSign = (x, y, z, dx, dz) => {
      const gh = this._free(x, y, z, 0.45, 2.6); if (gh === null) return false;
      signs.push({ x, y: gh, z, yaw: Math.atan2(dx, dz) }); return true;   // the panel faces (dx, dz): towards whoever walks in
    };
    // at the foot of every way up: arrows leading in and a sign post beside the approach
    for (const r of this.routes) {
      const nx = -r.az, nz = r.ax;                                  // lateral
      let n = 0;
      for (const d of [2.2, 4.8, 7.6]) if (addArrow(r.x - r.ax * d, r.y, r.z - r.az * d, r.ax, r.az, d > 5 ? 1.9 : 2.3)) n++;
      const half = r.w / 2 + 1.1;
      for (const [d, side] of [[3.4, 1], [3.4, -1], [5.0, 1], [5.0, -1]]) {
        if (addSign(r.x - r.ax * d + nx * side * half, r.y, r.z - r.az * d + nz * side * half, -r.ax, -r.az)) break;
      }
      void n;
    }
    // crossroads of the ground streets: an arrow along the street towards the nearest way up from the street level
    const ground = this.routes.filter((r) => r.from === 'G');
    const streets = map.streets, xs = streets.filter((s) => s.axis === 'z').map((s) => s.c), zs = streets.filter((s) => s.axis === 'x').map((s) => s.c);
    for (const sx of xs) for (const sz of zs) {
      if (Math.abs(sz - map.rail.zc) < 14) continue;                        // the Harbour Line corridor
      let best = null, bd = 1e9;
      for (const r of ground) { const d = Math.hypot(r.x - sx, r.z - sz); if (d < bd) { bd = d; best = r; } }
      if (!best || bd < 16) continue;                                         // right there already
      const dx = best.x - sx, dz = best.z - sz;
      const horiz = Math.abs(dx) >= Math.abs(dz);
      const ux = horiz ? Math.sign(dx) : 0, uz = horiz ? 0 : Math.sign(dz);
      let placed = 0;
      for (const d of [0, 6]) if (addArrow(sx + ux * d, 0, sz + uz * d, ux, uz, 2.7)) placed++;
      if (placed) for (const [lat, back] of [[1, -7.5], [-1, -7.5], [1, 7.5], [-1, 7.5]]) if (addSign(sx + uz * 7.6 * lat + ux * back * 0.2, 0, sz - ux * 7.6 * lat + uz * back * 0.2, -ux, -uz)) break;
    }

    const tex = arrowTexture();
    const aGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.arrowMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, color: 0xd6c8a4 });
    g.materials.all?.push?.(this.arrowMat);
    const am = new THREE.InstancedMesh(aGeo, this.arrowMat, Math.max(1, arrows.length));
    am.name = 'sun-arrows'; am.renderOrder = 3; am.count = arrows.length;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), p = new THREE.Vector3(), sc = new THREE.Vector3();
    arrows.forEach((a, i) => { q.setFromEuler(e.set(0, a.yaw, 0)); p.set(a.x, a.y, a.z); sc.set(a.size, 1, a.size * 1.0); m.compose(p, q, sc); am.setMatrixAt(i, m); });
    am.instanceMatrix.needsUpdate = true; am.frustumCulled = false;
    g.scene.add(am); this.arrowMesh = am;

    // sign: a post and a placard, merged (the post samples the dark border of the texture)
    const W = 2.1, H = 0.79, postH = 2.45, y0 = postH - 0.1;
    const panel = new THREE.PlaneGeometry(W, H).translate(0, y0 + H / 2, 0.06);
    const post = new THREE.BoxGeometry(0.1, postH, 0.1).translate(0, postH / 2, 0);
    const uv = post.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5, 0.97);
    const sGeo = mergeSimple([panel, post]);
    this.signMat = new THREE.MeshBasicMaterial({ map: signTexture(), color: 0xe6dcc8 });
    g.materials.all?.push?.(this.signMat);
    const sm = new THREE.InstancedMesh(sGeo, this.signMat, Math.max(1, signs.length));
    sm.name = 'sun-signs'; sm.count = signs.length;
    signs.forEach((s, i) => { q.setFromEuler(e.set(0, s.yaw, 0)); p.set(s.x, s.y, s.z); sc.set(1, 1, 1); m.compose(p, q, sc); sm.setMatrixAt(i, m); });
    sm.instanceMatrix.needsUpdate = true; sm.frustumCulled = false;
    g.scene.add(sm); this.signMesh = sm;
    this.stats.arrows = arrows.length; this.stats.signs = signs.length;
    this.placed = { arrows, signs };
  }

  update(dt) {
    this.t += dt;
    const g = this.game, I = Math.max(0, Math.min(1, g.world.sunShafts.intensity));
    const rays = g.player?.rays ?? 7;
    const low = Math.max(0, Math.min(1, (6 - rays) / 4));                 // 0 at 6 rays and up, 1 at 2 rays and below
    const boost = 0.62 + 0.55 * low;
    this.boost += (boost - this.boost) * Math.min(1, dt * 2);
    const pulse = 1 + low * 0.14 * Math.sin(this.t * 1.7);
    const u = this.mat.uniforms;
    u.uI.value = I * this.boost * pulse; u.uTime.value = this.t; u.uFar.value = g.camera.far * 0.95;
    this.mesh.visible = I > 0.02;
  }
}

/** Merge a few non-indexed-or-indexed geometries with the same attributes (position, normal, uv) into one non-indexed geometry. */
function mergeSimple(list) {
  const parts = list.map((geo) => (geo.index ? geo.toNonIndexed() : geo));
  let n = 0; for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, o * 3); nor.set(p.attributes.normal.array, o * 3); uv.set(p.attributes.uv.array, o * 2);
    o += p.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return out;
}
