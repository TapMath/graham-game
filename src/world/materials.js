// Shared materials and procedural textures (no external files).
// All world meshes use these so the Sing shader patch (Phase 5) can hook every material in one
// place: iterate `materials.all` and patch onBeforeCompile.
import * as THREE from 'three';

function canvasTexture(size, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Deterministic noise so textures look the same every run. */
function lcg(seed) { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

/** Mottled concrete with panel seams; one tile = TILE_METRES of surface. */
export const TILE_METRES = 4;
function concreteTexture() {
  return canvasTexture(256, (g, n) => {
    const rnd = lcg(7);
    g.fillStyle = '#b9b9b0'; g.fillRect(0, 0, n, n);
    for (let i = 0; i < 2600; i++) {
      const v = 150 + rnd() * 80;
      g.fillStyle = `rgba(${v},${v},${v - 6},${0.18 + rnd() * 0.25})`;
      g.fillRect(rnd() * n, rnd() * n, 1 + rnd() * 5, 1 + rnd() * 5);
    }
    g.strokeStyle = 'rgba(40,45,42,.55)'; g.lineWidth = 3;
    g.strokeRect(0, 0, n, n);
    g.strokeStyle = 'rgba(40,45,42,.18)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(n / 2, 0); g.lineTo(n / 2, n); g.moveTo(0, n / 2); g.lineTo(n, n / 2); g.stroke();
  });
}

/** Window grid for tower facades: white = lit. Used as the emissive map. */
export const WINDOW_TILE_METRES = 12;
function windowTexture() {
  return canvasTexture(128, (g, n) => {
    const rnd = lcg(31);
    g.fillStyle = '#000'; g.fillRect(0, 0, n, n);
    const cols = 6, rows = 6, cw = n / cols, rh = n / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (rnd() < 0.42) continue;
        const warm = 150 + rnd() * 105;
        g.fillStyle = `rgb(${warm},${warm * 0.8},${warm * 0.42})`;
        g.fillRect(c * cw + 3, r * rh + 4, cw - 6, rh - 9);
      }
    }
  });
}

export function createMaterials() {
  const concrete = concreteTexture();
  // Lit, vertex-coloured, flat-ish shading. The workhorse for static geometry.
  const lit = new THREE.MeshLambertMaterial({ vertexColors: true, map: concrete });
  // Unlit glowing things: lamps, strips, signs. Colour comes from vertex colours.
  const emissive = new THREE.MeshBasicMaterial({ vertexColors: true });
  // Tower facades: lit body plus lit windows through the emissive map.
  const building = new THREE.MeshLambertMaterial({
    vertexColors: true,
    emissive: new THREE.Color(0xffffff),
    emissiveMap: windowTexture(),
    emissiveIntensity: 0.55,
  });
  const all = [lit, emissive, building];
  return { lit, emissive, building, all, textures: { concrete } };
}
