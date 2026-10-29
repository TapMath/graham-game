// The built form of the Phase 9A network (the data is network.js): the tall piers the roads stand on, and the dressing every new deck
// gets: footpaths, the glowing line under the vault, the gothic ribbed-vault underside (pointed-arch ribs on a ridge), and the lit doors
// where a bridge meets a tower. Everything merges into the city's chunked meshes (no new draw calls), so far decks are distance-culled
// by the chunk cull in city.js.
import * as THREE from '../../vendor/three.module.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();
const dim = (hex, k) => new THREE.Color(hex).multiplyScalar(k).getHex();

/** A pointed (ogive) rib arch, span 1 and rise 0.866, extruded 1 along z, coarse: about 90 triangles. */
function ribGeometry() {
  const N = 3, out = [];
  for (let i = 0; i <= N; i++) { const th = Math.PI - (Math.PI / 3) * (i / N); out.push([0.5 + Math.cos(th), Math.sin(th)]); }
  for (let i = N - 1; i >= 0; i--) out.push([-out[i][0], out[i][1]]);
  const scale = (r) => out.map(([x, y]) => [x * r, y * r]);
  const shape = new THREE.Shape(), outer = scale(1), inner = scale(0.82).reverse();
  shape.moveTo(...outer[0]); for (const p of outer) shape.lineTo(...p); for (const p of inner) shape.lineTo(...p); shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false }); g.translate(0, 0, -0.5);
  return g;
}

/** The piers (data: map.piers): an octagonal shaft on a plinth, with a bracket under every deck it carries. Solid colliders. */
export function buildPiers(ctx) {
  const { b, map, phys } = ctx;
  for (const p of map.piers ?? []) {
    const h = p.y1 - p.y0;
    const cyl = new THREE.CylinderGeometry(p.hx * 0.94, p.hx * 1.06, h, 8, 1, true).translate(p.x, p.y0 + h / 2, p.z);
    b.geometry(cyl, { color: 0x6c7270 });
    b.box([p.x - p.hx - 0.25, 0, p.z - p.hz - 0.25], [p.x + p.hx + 0.25, 0.9, p.z + p.hz + 0.25], { color: 0x59605e, solid: false, walkable: false });
    phys.addBox([p.x - p.hx, 0, p.z - p.hz], [p.x + p.hx, p.y1, p.z + p.hz], { solid: true, walkable: false, tag: 'pillar' });
    for (const c of p.caps) {
      // the bracket: from the shaft out under the edge of the deck, with a pointed haunch below it
      const reach = c.reach ?? 1.5, w = p.hx + 0.3, cx = p.x + c.nx * reach / 2, cz = p.z + c.nz * reach / 2;
      const alongX = c.nz !== 0 ? true : false;
      const hx = alongX ? w : reach / 2 + p.hx * 0.4, hz = alongX ? reach / 2 + p.hz * 0.4 : w;
      b.box([cx - hx, c.y - 0.9, cz - hz], [cx + hx, c.y, cz + hz], { color: 0x626a68, solid: false, walkable: false });
      b.box([cx - hx * 0.62, c.y - 1.5, cz - hz * 0.62], [cx + hx * 0.62, c.y - 0.9, cz + hz * 0.62], { color: 0x586060, solid: false, walkable: false });
    }
    ctx.pillarsPlaced++;
  }
}

/** Footpaths, vault ribs, the light under the vault and the tower doors, for every deck the network added. */
export function dressNetwork(ctx) {
  const { b, map } = ctx;
  const rib = ribGeometry();
  let ribs = 0;
  for (const d of map.decks) {
    if (!d.net) continue;
    const w = d.x1 - d.x0, l = d.z1 - d.z0, alongX = d.lane ? d.lane === 'x' : w >= l, len = alongX ? w : l, wid = alongX ? l : w;
    const y = d.y, bottom = y - d.th, zc = (d.z0 + d.z1) / 2, xc = (d.x0 + d.x1) / 2;
    // footpaths: lighter strips 1.8 m wide down both edges of a road, with a dim kerb line
    if (d.footpath && wid >= 9) {
      const fp = 1.8;
      const strip = (x0, z0, x1, z1) => { b.box([x0, y, z0], [x1, y + 0.035, z1], { color: 0x7a7f78, solid: false, walkable: false }); };
      if (alongX) {
        strip(d.x0, d.z0, d.x1, d.z0 + fp); strip(d.x0, d.z1 - fp, d.x1, d.z1);
        for (const z of [d.z0 + fp, d.z1 - fp - 0.1]) b.box([d.x0, y + 0.03, z], [d.x1, y + 0.05, z + 0.1], { mat: 'emissive', color: 0x4a3e1c, solid: false, walkable: false, noTint: true });
      } else {
        strip(d.x0, d.z0, d.x0 + fp, d.z1); strip(d.x1 - fp, d.z0, d.x1, d.z1);
        for (const x of [d.x0 + fp, d.x1 - fp - 0.1]) b.box([x, y + 0.03, d.z0], [x + 0.1, y + 0.05, d.z1], { mat: 'emissive', color: 0x4a3e1c, solid: false, walkable: false, noTint: true });
      }
    }
    // the ridge of the vault and the light that runs along it (warm sodium low down, pale up high)
    const warm = y < 20 ? 0xff9a44 : y < 32 ? 0xffc27a : 0xffe6b8;
    if (alongX) {
      b.box([d.x0 + 0.5, bottom - 0.42, zc - 0.22], [d.x1 - 0.5, bottom, zc + 0.22], { color: 0x59615f, solid: false, walkable: false });
      b.box([d.x0 + 0.5, bottom - 0.5, zc - 0.07], [d.x1 - 0.5, bottom - 0.42, zc + 0.07], { mat: 'emissive', color: dim(warm, 0.55), solid: false, walkable: false, noTint: true });
    } else {
      b.box([xc - 0.22, bottom - 0.42, d.z0 + 0.5], [xc + 0.22, bottom, d.z1 - 0.5], { color: 0x59615f, solid: false, walkable: false });
      b.box([xc - 0.07, bottom - 0.5, d.z0 + 0.5], [xc + 0.07, bottom - 0.42, d.z1 - 0.5], { mat: 'emissive', color: dim(warm, 0.55), solid: false, walkable: false, noTint: true });
    }
    // the ribs: pointed arches across the underside, every 8 m (6.5 on skywalks)
    if (d.vault && wid >= 2.4 && len >= 5) {
      const rise = Math.min(d.kind === 'road' ? 2.7 : 1.8, 0.2 * wid + 0.45), step = d.kind === 'road' ? 8 : 6.5, color = d.kind === 'road' ? 0x5a6260 : 0x625f56;
      for (let t = step * 0.6; t < len - 1.0; t += step) {
        const cx = alongX ? d.x0 + t : xc, cz = alongX ? zc : d.z0 + t;
        if (ctx.inCut(cx, cz, 1)) continue;
        _p.set(cx, bottom - rise * 0.866, cz); _q.setFromEuler(_e.set(0, alongX ? Math.PI / 2 : 0, 0)); _s.set(wid - 0.5, rise, 0.45);
        b.geometry(rib, { color, matrix: _m.compose(_p, _q, _s).clone(), shade: true });
        ribs++;
      }
    }
    // where a bridge meets a tower: a lit door panel on the face
    if (d.door?.length) {
      for (const side of d.door) {
        const fz = side === 'z0' ? d.z0 + 0.05 : d.z1 - 0.05;
        b.box([xc - 1.4, y, fz - 0.05], [xc + 1.4, y + 3.1, fz + 0.05], { mat: 'emissive', color: dim(warm, 0.62), solid: false, walkable: false, noTint: true });
        b.box([xc - 1.7, y + 3.1, fz - 0.14], [xc + 1.7, y + 3.4, fz + 0.14], { color: 0x3c4648, solid: false, walkable: false });
      }
    }
  }
  ctx.vaultRibs = (ctx.vaultRibs ?? 0) + ribs;
}
