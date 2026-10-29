// The capsule fleet (Phase 9A): every capsule lift in the city is drawn by three instanced meshes (3 draw calls for all of them):
//   cap-frame   the opaque parts: a steel skirt and slab, the roof dome and the four mullions (one rounded-square shape, scaled per car)
//   cap-glass   the glass wall, double sided and transparent, tinted by class (teal solo, blue family, amber public and freight)
//   cap-glow    emissive bars: the lit floor edge, the roof lamp, the glass corner lights, the closed doors and the shut landing doors
// A car is placed at its Lift's position every frame (only cars within ~130 m of the camera), so the lift's own code does not draw anything.
//   game.fleet.stats   {cars, bars}
import * as THREE from '../../../vendor/three.module.js';

const SEG = 20, N = 4;       // the rounded square: |x|^N + |z|^N = const, drawn with SEG segments

function ring(scale, y) {
  const out = [];
  for (let i = 0; i < SEG; i++) {
    const t = (i / SEG) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t);
    out.push([0.5 * scale * Math.sign(c) * Math.pow(Math.abs(c), 2 / N), y, 0.5 * scale * Math.sign(s) * Math.pow(Math.abs(s), 2 / N)]);
  }
  return out;
}

function Mesh() {
  const pos = [], col = [];
  const tri = (a, b, c, color) => { pos.push(...a, ...b, ...c); for (let i = 0; i < 3; i++) col.push(color.r, color.g, color.b); };
  return {
    wall(r0, r1, color) {            // quads between two rings (facing outwards)
      for (let i = 0; i < SEG; i++) {
        const j = (i + 1) % SEG;
        tri(r0[i], r1[j], r0[j], color); tri(r0[i], r1[i], r1[j], color);
      }
    },
    fan(r, c, color, up = true) { for (let i = 0; i < SEG; i++) { const j = (i + 1) % SEG; if (up) tri(r[i], c, r[j], color); else tri(r[i], r[j], c, color); } },
    box(x0, y0, z0, x1, y1, z1, color) {
      const v = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
      for (const f of [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]]) { tri(v[f[0]], v[f[1]], v[f[2]], color); tri(v[f[0]], v[f[2]], v[f[3]], color); }
    },
    build() {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
      g.computeVertexNormals();
      return g;
    },
  };
}

const C = (hex) => new THREE.Color(hex);

function frameGeometry() {
  const m = Mesh(), steel = C(0x56616a), dark = C(0x2e3740), roof = C(0x6b767e);
  m.box(-0.5, -0.14, -0.5, 0.5, 0, 0.5, dark);                                   // the slab (the car's floor)
  m.wall(ring(1.0, 0.0), ring(1.0, 0.17), steel);                                 // skirt
  m.wall(ring(1.0, 0.86), ring(1.0, 0.93), steel);                                // top band
  m.wall(ring(1.0, 0.93), ring(0.78, 0.975), roof);                               // roof dome
  m.wall(ring(0.78, 0.975), ring(0.4, 1.0), roof);
  m.fan(ring(0.4, 1.0), [0, 1.0, 0], roof);
  for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) m.box(sx * 0.42 - 0.018, 0.17, sz * 0.42 - 0.018, sx * 0.42 + 0.018, 0.86, sz * 0.42 + 0.018, steel);   // mullions
  return m.build();
}
function glassGeometry() {
  const m = Mesh(), white = C(0xffffff);
  m.wall(ring(0.985, 0.17), ring(0.985, 0.86), white);
  m.wall(ring(0.985, 0.86), ring(0.95, 0.93), white);
  return m.build();
}
function barGeometry() {
  const g = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 3).fill(1), 3));
  return g;
}

export class CapsuleFleet {
  init(game) {
    this.game = game; game.fleet = this;
    this.cars = game.lifts.lifts.filter((l) => l.capsule);
    const cap = Math.max(1, this.cars.length);
    this.frame = new THREE.InstancedMesh(frameGeometry(), game.materials.lit, cap);
    const glassMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide });
    this.glassMat = glassMat;
    this.glass = new THREE.InstancedMesh(glassGeometry(), glassMat, cap);
    this.glow = new THREE.InstancedMesh(barGeometry(), game.materials.emissive, cap * 24);
    for (const [m, name] of [[this.frame, 'cap-frame'], [this.glass, 'cap-glass'], [this.glow, 'cap-glow']]) {
      m.name = name; m.frustumCulled = false; m.count = 0; m.visible = false;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(m.instanceMatrix.count * 3), 3);
      game.scene.add(m);
    }
    this.glass.renderOrder = 4;
    this.stats = { cars: 0, bars: 0 };
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
    const r0 = game.render.bind(game);
    game.render = () => { try { this.refresh(); } catch (e) { if (!this._warned) { this._warned = true; console.error('[fleet] refresh failed:', e); } } r0(); };
    game.debug?.addState('fleet', () => this.stats);
  }

  _bar(n, cx, cy, cz, sx, sy, sz, hex, k = 1) {
    const m = this._m, c = this._c, g = this.glow;
    m.makeScale(sx, sy, sz).setPosition(cx, cy, cz);
    g.setMatrixAt(n, m); c.set(hex); g.setColorAt(n, c.multiplyScalar(k));
    return n + 1;
  }

  refresh() {
    const game = this.game, cp = game.camera.position, under = game.player.pos.y < -3.2;
    if (!this._senses && game.senses?.patchMaterial) { this._senses = true; game.senses.patchMaterial(this.glassMat); }
    let n = 0, nb = 0;
    const night = 1 - Math.max(0, Math.min(1, game.sky?.dayFactor ?? 1));
    for (const l of this.cars) {
      const [cx, cz] = l.center, [w, d] = l.size, y = l.y, dx = cx - cp.x, dz = cz - cp.z;
      if (dx * dx + dz * dz > 135 * 135 || under !== (l.y < -3.2) && Math.abs(l.y - cp.y) > 8) continue;
      const H = l.cls.h, m = this._m, c = this._c;
      m.makeScale(w, H, d).setPosition(cx, y, cz);
      this.frame.setMatrixAt(n, m); this.frame.setColorAt(n, c.set(0xffffff));
      this.glass.setMatrixAt(n, m); this.glass.setColorAt(n, c.set(l.cls.glass));
      n++;
      const tone = l.def ? TONES[l.def.tone] ?? 0xffb347 : 0xffb347, e = 0.07;
      // the lit floor edge, the roof lamp, the four corner lights
      nb = this._bar(nb, cx, y + 0.03, cz - d / 2 + e, w * 0.98, 0.03, 0.1, tone); nb = this._bar(nb, cx, y + 0.03, cz + d / 2 - e, w * 0.98, 0.03, 0.1, tone);
      nb = this._bar(nb, cx - w / 2 + e, y + 0.03, cz, 0.1, 0.03, d * 0.9, tone); nb = this._bar(nb, cx + w / 2 - e, y + 0.03, cz, 0.1, 0.03, d * 0.9, tone);
      nb = this._bar(nb, cx, y + H * 0.84, cz, w * 0.5, 0.05, Math.min(0.5, d * 0.3), 0xfff0cc, 0.7 + 0.5 * night);
      for (const [sx, sz] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) nb = this._bar(nb, cx + sx * w * 0.42, y + H * 0.52, cz + sz * d * 0.42, 0.05, H * 0.62, 0.05, tone, 0.8);
      // closed doors: two bars across the opening
      for (const dr of l.doors) {
        if (!dr.closed) continue;
        const ax = dr.side[1], sg = dr.side[0] === '-' ? -1 : 1;
        const px = ax === 'x' ? cx + sg * (w / 2 - 0.08) : cx, pz = ax === 'x' ? cz : cz + sg * (d / 2 - 0.08), sx = ax === 'x' ? 0.06 : w * 0.92, sz = ax === 'x' ? d * 0.92 : 0.06;
        nb = this._bar(nb, px, y + 1.12, pz, sx, 0.07, sz, tone); nb = this._bar(nb, px, y + 0.3, pz, sx, 0.07, sz, tone);
      }
      // the shut landing doors (the car is elsewhere): a bar across each exit
      for (const ld of l.landing) {
        if (!ld.closed || Math.abs(ld.y - cp.y) > 40) continue;
        const ax = ld.side[1], sg = ld.side[0] === '-' ? -1 : 1;
        const px = ax === 'x' ? cx + sg * (w / 2 + 0.07) : cx, pz = ax === 'x' ? cz : cz + sg * (d / 2 + 0.07), sx = ax === 'x' ? 0.07 : w * 0.96, sz = ax === 'x' ? d * 0.96 : 0.07;
        nb = this._bar(nb, px, ld.y + 1.2, pz, sx, 0.08, sz, 0xff7a4a, 0.85); nb = this._bar(nb, px, ld.y + 0.55, pz, sx, 0.05, sz, 0xff7a4a, 0.55);
      }
    }
    for (const mesh of [this.frame, this.glass]) { mesh.count = n; mesh.visible = n > 0; if (n) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; } }
    this.glow.count = nb; this.glow.visible = nb > 0;
    if (nb) { this.glow.instanceMatrix.needsUpdate = true; this.glow.instanceColor.needsUpdate = true; }
    this.stats.cars = n; this.stats.bars = nb;
  }
}

const TONES = { free: 0x59d6a2, gate5: 0xffb347, gate8: 0xff6a4a, metro: 0x4fe0ff, work: 0xffa030, sun: 0xffd45a, surya: 0xffcf6a, danger: 0xff5a4a };
