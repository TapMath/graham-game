// Low-poly Mumbai traffic: the kaali-peeli taxi (black below, yellow above), the auto-rickshaw (a three-wheeler in black and yellow),
// the red BEST bus. Each is one merged geometry drawn as an InstancedMesh (3 draw calls for all traffic). Faces -Z, origin at the
// ground under the middle of the vehicle.
import * as THREE from '../../../vendor/three.module.js';
import { mergeGeometries } from '../../../vendor/addons/utils/BufferGeometryUtils.js';

class Parts {
  constructor() { this.list = []; }
  box(w, h, d, x, y, z, color, { rx = 0, rz = 0 } = {}) {
    let g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
    if (rx || rz) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, 0, rz)));
    g.translate(x, y, z); g.deleteAttribute('uv');
    const n = g.attributes.position.count, c = new THREE.Color(color), a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); g.computeVertexNormals(); this.list.push(g); return this;
  }
  build() { const g = mergeGeometries(this.list, false); this.list.forEach((x) => x.dispose()); g.computeBoundingSphere(); return g; }
}
const WHEEL = 0x121416, GLASS = 0x141c22, CHROME = 0xaab0b0;

export function taxiGeometry() {
  const P = new Parts(), Y = 0xd8a820, K = 0x17181a;
  P.box(1.62, 0.5, 3.9, 0, 0.55, 0, K);                           // the lower body
  P.box(1.6, 0.14, 3.88, 0, 0.84, 0, Y);                          // the yellow belt line
  P.box(1.5, 0.42, 1.85, 0, 1.12, 0.35, Y);                       // the cabin
  P.box(1.5, 0.3, 1.0, 0, 1.0, -1.35, Y);                         // the bonnet
  P.box(1.46, 0.3, 1.78, 0, 1.18, 0.35, GLASS);                   // windows
  P.box(1.54, 0.08, 1.9, 0, 1.38, 0.35, Y);                       // the roof
  P.box(0.5, 0.1, 0.12, 0, 1.46, 0.0, 0xe8e8d0);                  // the TAXI roof sign
  for (const sx of [-1, 1]) for (const z of [-1.25, 1.2]) P.box(0.2, 0.62, 0.62, sx * 0.78, 0.31, z, WHEEL);
  for (const sx of [-0.55, 0.55]) P.box(0.3, 0.16, 0.06, sx, 0.72, -1.96, 0xf4f0d0);
  for (const sx of [-0.55, 0.55]) P.box(0.3, 0.12, 0.06, sx, 0.74, 1.96, 0x9a2a20);
  P.box(1.55, 0.1, 0.12, 0, 0.36, -1.98, CHROME);
  return P.build();
}

export function autoGeometry() {
  const P = new Parts(), Y = 0xd8b020, K = 0x17181a, G = 0x2f6a3a;
  P.box(1.34, 0.34, 2.5, 0, 0.5, 0.15, K);                         // the chassis, black
  P.box(1.3, 0.62, 0.9, 0, 0.95, 0.9, Y);                          // the rear: passenger bench
  P.box(1.34, 0.08, 2.0, 0, 1.62, 0.35, G);                        // the canvas roof, dark green
  P.box(1.1, 0.04, 0.8, 0, 1.2, -0.78, GLASS);                     // the windscreen
  P.box(0.08, 0.8, 0.08, -0.62, 1.2, -0.85, 0x303436); P.box(0.08, 0.8, 0.08, 0.62, 1.2, -0.85, 0x303436);
  P.box(0.6, 0.5, 0.7, 0, 0.8, -1.05, Y);                          // the nose cowling
  P.box(0.16, 0.5, 0.5, -0.65, 0.26, 1.0, WHEEL); P.box(0.16, 0.5, 0.5, 0.65, 0.26, 1.0, WHEEL); P.box(0.16, 0.45, 0.44, 0, 0.22, -1.2, WHEEL);
  P.box(0.2, 0.12, 0.05, 0, 0.82, -1.42, 0xf4f0d0); P.box(0.5, 0.1, 0.05, 0, 0.75, 1.42, 0x9a2a20);
  return P.build();
}

export function busGeometry() {
  const P = new Parts(), R = 0xa42a26, C = 0xd8d0b0, K = 0x16181a;
  P.box(2.5, 0.5, 9.2, 0, 0.55, 0, 0x2a2c2e);
  P.box(2.5, 1.0, 9.2, 0, 1.3, 0, R);                              // red lower body
  P.box(2.52, 0.9, 9.0, 0, 2.3, 0, GLASS);                         // the windows
  for (let z = -4.0; z <= 4.0; z += 1.0) P.box(2.54, 0.9, 0.08, 0, 2.3, z, C);
  P.box(2.5, 0.35, 9.2, 0, 2.95, 0, R);                            // red roof band
  P.box(2.4, 0.1, 9.0, 0, 3.15, 0, C);
  P.box(2.2, 0.25, 0.08, 0, 2.95, -4.64, 0xe8c050);                // the destination board
  for (const sx of [-1, 1]) for (const z of [-2.8, 2.8]) P.box(0.3, 1.0, 1.0, sx * 1.2, 0.5, z, WHEEL);
  for (const sx of [-0.8, 0.8]) P.box(0.4, 0.2, 0.06, sx, 0.9, -4.62, 0xf4f0d0);
  for (const sx of [-0.8, 0.8]) P.box(0.4, 0.2, 0.06, sx, 0.9, 4.62, 0x9a2a20);
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
