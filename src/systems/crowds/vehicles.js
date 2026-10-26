// Low-poly Mumbai traffic: the kaali-peeli taxi (black below, yellow above), the auto-rickshaw (a three-wheeler in black and yellow),
// the red BEST bus. Each is one merged geometry drawn as an InstancedMesh (3 draw calls for all traffic). Faces -Z, origin at the
// ground under the middle of the vehicle. Phase 8D: a bevelled cab (the roof is narrower than the belt line and the windscreen slopes),
// round wheels with hubs, window frames and glass, bumpers and lamps, for 300 to 600 triangles a vehicle.
import * as THREE from '../../../vendor/three.module.js';
import { mergeGeometries } from '../../../vendor/addons/utils/BufferGeometryUtils.js';

class Parts {
  constructor() { this.list = []; }
  /**
   * A box. `top`: [kx, kz, dz] shrinks the top face (x by kx, z by kz) and slides it by dz (a tapered cab, a sloped windscreen).
   * `rx`, `rz`: tilt about those axes.
   */
  box(w, h, d, x, y, z, color, { rx = 0, rz = 0, top = null, seg = 1 } = {}) {
    let g = new THREE.BoxGeometry(w, h, d, seg, 1, 1);
    if (top) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) if (p.getY(i) > 0) p.setXYZ(i, p.getX(i) * top[0], p.getY(i), p.getZ(i) * top[1] + top[2]);
    }
    g = g.toNonIndexed();
    if (rx || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, 0, rz)));
    return this._add(g, x, y, z, color);
  }
  /** A cylinder whose axis runs along X (a wheel), `r` radius, `w` width, with a hub disc on the outer face. */
  wheel(r, w, x, y, z, color, hub = 0x8a8c8e, seg = 8) {
    const g = new THREE.CylinderGeometry(r, r, w, seg, 1).toNonIndexed();
    g.rotateZ(Math.PI / 2);
    this._add(g, x, y, z, color);
    const h = new THREE.CircleGeometry(r * 0.52, 6).toNonIndexed();
    h.rotateY(x >= 0 ? Math.PI / 2 : -Math.PI / 2);
    return this._add(h, x + (x >= 0 ? 1 : -1) * (w / 2 + 0.006), y, z, hub);
  }
  /** A cylinder along the Y axis (a lamp, a post). */
  post(r, h, x, y, z, color, seg = 6) { return this._add(new THREE.CylinderGeometry(r, r, h, seg, 1).toNonIndexed(), x, y, z, color); }
  _add(g, x, y, z, color) {
    g.translate(x, y, z); g.deleteAttribute('uv');
    const n = g.attributes.position.count, c = new THREE.Color(color), a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.computeVertexNormals(); this.list.push(g); return this;
  }
  build() { const g = mergeGeometries(this.list, false); this.list.forEach((x) => x.dispose()); g.computeBoundingSphere(); return g; }
}
const WHEEL = 0x121416, GLASS = 0x141c22, CHROME = 0xaab0b0, FRAME = 0x1a1c1e;

export function taxiGeometry() {
  const P = new Parts(), Y = 0xd8a820, K = 0x17181a;
  P.box(1.64, 0.46, 3.92, 0, 0.5, 0, K);                                          // the lower body, black
  P.box(1.62, 0.16, 3.9, 0, 0.8, 0, Y, { top: [0.97, 0.99, 0] });                 // the yellow belt line, a hint of tumblehome
  P.box(1.5, 0.28, 1.12, 0, 0.99, -1.38, Y, { top: [0.9, 0.8, 0.12] });           // the bonnet, sloping to the windscreen
  P.box(1.54, 0.46, 1.9, 0, 1.14, 0.45, Y, { top: [0.84, 0.9, 0.0] });            // the cabin: shoulders in, a narrower roof
  P.box(1.4, 0.32, 0.06, 0, 1.18, -0.54, GLASS, { rx: -0.42 });                   // the windscreen, raked back
  P.box(1.36, 0.28, 0.06, 0, 1.2, 1.38, GLASS, { rx: 0.4 });                       // the rear window
  for (const sx of [-1, 1]) {
    P.box(0.05, 0.3, 0.86, sx * 0.745, 1.18, 0.04, GLASS, { rz: sx * 0.16 });     // door glass, front
    P.box(0.05, 0.3, 0.7, sx * 0.745, 1.18, 0.98, GLASS, { rz: sx * 0.16 });      // rear
    P.box(0.07, 0.34, 0.07, sx * 0.76, 1.17, 0.52, FRAME, { rz: sx * 0.16 });     // the pillar between
    P.box(0.12, 0.16, 0.2, sx * 0.9, 0.98, -0.78, K);                              // the wing mirror
  }
  P.box(1.34, 0.06, 1.6, 0, 1.42, 0.5, Y);                                         // the roof
  P.box(0.5, 0.12, 0.14, 0, 1.51, 0.15, 0xe8e8d0);                                 // the TAXI roof sign
  for (const sx of [-1, 1]) for (const z of [-1.28, 1.22]) P.wheel(0.31, 0.22, sx * 0.8, 0.31, z, WHEEL);
  for (const sx of [-0.56, 0.56]) { P.post(0.1, 0.06, sx, 0.74, -1.96, 0xf4f0d0, 8); }
  for (const sx of [-0.62, 0.62]) P.box(0.3, 0.1, 0.06, sx, 0.74, 1.96, 0x9a2a20);
  P.box(1.72, 0.1, 0.14, 0, 0.34, -2.0, CHROME);                                   // the bumpers
  P.box(1.72, 0.1, 0.14, 0, 0.34, 2.0, CHROME);
  P.box(0.5, 0.2, 0.05, 0, 0.52, -1.97, CHROME);                                   // the grille
  return P.build();
}

export function autoGeometry() {
  const P = new Parts(), Y = 0xd8b020, K = 0x17181a, G = 0x2f6a3a;
  P.box(1.3, 0.3, 2.5, 0, 0.5, 0.2, K);                                            // the chassis, black
  P.box(1.3, 0.5, 1.0, 0, 0.9, 0.95, Y, { top: [0.95, 0.96, 0] });                 // the rear: the passenger bench
  P.box(1.2, 0.3, 0.9, 0, 0.82, 0.1, Y, { top: [0.9, 0.9, 0] });                   // the seat back and the front panel
  P.box(1.34, 0.07, 2.0, 0, 1.58, 0.36, G, { top: [0.78, 0.92, -0.08] });          // the canvas roof, domed
  P.box(1.0, 0.04, 0.78, 0, 1.2, -0.78, GLASS, { rx: -0.9 });                      // the windscreen, raked
  for (const sx of [-1, 1]) {
    P.post(0.025, 0.8, sx * 0.62, 1.2, -0.86, 0x303436);                           // the front pillars
    P.post(0.025, 0.8, sx * 0.64, 1.2, 1.2, 0x303436);                             // the rear pillars
  }
  P.box(0.54, 0.46, 0.8, 0, 0.8, -1.06, Y, { top: [0.82, 0.8, 0.06] });            // the nose cowling, tapered
  P.wheel(0.26, 0.14, -0.62, 0.26, 1.02, WHEEL, 0x8a8c8e, 8);                       // two rear wheels
  P.wheel(0.26, 0.14, 0.62, 0.26, 1.02, WHEEL, 0x8a8c8e, 8);
  P.wheel(0.25, 0.14, 0, 0.25, -1.24, WHEEL, 0x8a8c8e, 8);                          // one front wheel
  P.box(0.5, 0.05, 0.05, 0, 1.0, -0.92, FRAME);                                    // the handlebar
  P.post(0.08, 0.06, 0, 0.82, -1.47, 0xf4f0d0, 8);
  P.box(0.5, 0.1, 0.05, 0, 0.75, 1.46, 0x9a2a20);
  return P.build();
}

export function busGeometry() {
  const P = new Parts(), R = 0xa42a26, C = 0xd8d0b0;
  P.box(2.5, 0.46, 9.2, 0, 0.54, 0, 0x2a2c2e);                                     // the chassis
  P.box(2.5, 1.0, 9.2, 0, 1.28, 0, R);                                             // red lower body
  P.box(2.5, 0.1, 9.22, 0, 1.78, 0, C);                                            // the cream belt line
  P.box(2.46, 0.84, 9.0, 0, 2.28, 0, GLASS, { top: [0.97, 1, 0] });                // the windows
  for (let z = -4.0; z <= 4.0; z += 1.0) P.box(2.5, 0.88, 0.09, 0, 2.28, z, FRAME, { top: [0.97, 1, 0] });   // the window pillars
  P.box(2.46, 0.36, 9.2, 0, 2.88, 0, R, { top: [0.9, 1, 0] });                     // the red roof band, shoulders in
  P.box(2.2, 0.08, 9.0, 0, 3.1, 0, C, { top: [0.9, 1, 0] });                       // the roof
  P.box(2.1, 0.28, 0.06, 0, 2.66, -4.62, 0xe8c050);                                // the destination board
  P.box(2.0, 0.6, 0.06, 0, 2.2, -4.62, GLASS);                                     // the windscreen
  for (const sx of [-1, 1]) for (const z of [-2.8, 2.8]) P.wheel(0.5, 0.3, sx * 1.2, 0.5, z, WHEEL, 0x8a8c8e, 10);
  for (const sx of [-0.8, 0.8]) { P.post(0.12, 0.06, sx, 0.9, -4.62, 0xf4f0d0, 8); P.box(0.4, 0.2, 0.06, sx, 0.9, 4.62, 0x9a2a20); }
  P.box(2.56, 0.12, 0.14, 0, 0.5, -4.66, CHROME); P.box(2.56, 0.12, 0.14, 0, 0.5, 4.66, CHROME);
  return P.build();
}

export function makeVehicleMaterial(game) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: new THREE.Color(0x14181c) });
  game.materials?.all?.push(m);
  return m;
}
export const VEHICLES = {
  taxi: { make: taxiGeometry, len: 3.9, width: 1.62, tints: [0xffffff, 0xf0e8d0, 0xe8e0c8] },
  auto: { make: autoGeometry, len: 2.5, width: 1.34, tints: [0xffffff, 0xe8e8d8] },
  bus: { make: busGeometry, len: 9.2, width: 2.5, tints: [0xffffff, 0xe0d8d0] },
};
