// Flooding (PLAN 6, 1b). The breach lets the sea into the tunnels:
//
//   * UNDERGROUND: one dark water plane over the whole U network rises from the sump (-10.9) over the run, slowly at first
//     (seeping) then faster; Phase 7b: it reaches the U floor (-8) at about 00:00-02:00 (seeded severity +-15 %; it was 21:00-23:00,
//     which met the clinic window) and stands 3-5 m deep in the tunnels by the end. Before that only the sump around the breach is deep. `world.breachWater.setLevel(y)` is kept in sync with it.
//   * GROUND: from `breachKnown` + 18 h (or from 02:00 regardless) water creeps up in four low areas of G (the south
//     promenade, the west quay strip, the courtyard, the building-site basin), each with its own seeded start, rate and cap.
//   * Wading: over 0.35 m slows you a little, over 1 m is DEEP: movement x0.42, 1 ray lost every 5 s, splash sounds and the
//     view turns murky underwater. A following Setu in water over 0.7 m has his breath rate x2.5 and is hurt as he wades.
//
// Water is a dark, glossy plane (specular off the sun and the lamps, a faint scrolling neon streak map and a gently
// scrolling normal map): one material, up to five meshes.
import * as THREE from '../../../vendor/three.module.js';
import { clamp, hdist, smoothstep, pointInRect } from './util.js';

export const FLOOD_TUNING = Object.freeze({
  sumpY: -10.9, uRange: 6.7, uPower: 3.6, gDelay: 18, gRegardless: 26, deep: 1.0, shallow: 0.35, deepSpeed: 0.42, drainSeconds: 5,
});

function rippleCanvas(size, seed, kind) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); let s = seed >>> 0;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  if (kind === 'normal') {
    // soft height field from random wave rings, converted to a normal map
    const h = new Float32Array(size * size);
    const waves = []; for (let i = 0; i < 16; i++) waves.push({ x: rnd() * size, y: rnd() * size, f: 0.12 + rnd() * 0.25, a: 0.4 + rnd() * 0.6 });
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      let v = 0;
      for (const w of waves) {
        let dx = Math.abs(x - w.x), dy = Math.abs(y - w.y); dx = Math.min(dx, size - dx); dy = Math.min(dy, size - dy);
        v += Math.sin(Math.hypot(dx, dy) * w.f * 2.0) * w.a / (1 + Math.hypot(dx, dy) * 0.08);
      }
      h[y * size + x] = v;
    }
    const img = g.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const l = h[y * size + ((x - 1 + size) % size)], r = h[y * size + ((x + 1) % size)], u = h[((y - 1 + size) % size) * size + x], d = h[((y + 1) % size) * size + x];
      let nx = (l - r) * 1.6, ny = (u - d) * 1.6; const nz = 1, len = Math.hypot(nx, ny, nz);
      nx /= len; ny /= len;
      const i = (y * size + x) * 4; img.data[i] = (nx * 0.5 + 0.5) * 255; img.data[i + 1] = (ny * 0.5 + 0.5) * 255; img.data[i + 2] = (nz / len * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  } else {
    // dark ground with faint neon streaks (reflections of signs in the oily water)
    g.fillStyle = '#0b2832'; g.fillRect(0, 0, size, size);
    // faint rippled sheen, then neon streaks (sign reflections stretched along the view direction)
    for (let i = 0; i < 90; i++) {
      const x = rnd() * size, y = rnd() * size, w = 6 + rnd() * 26;
      g.strokeStyle = `rgba(90,170,190,${0.05 + rnd() * 0.08})`; g.lineWidth = 1 + rnd() * 1.5;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y + (rnd() - 0.5) * 2); g.stroke();
      g.beginPath(); g.moveTo(x - size, y); g.lineTo(x - size + w, y + (rnd() - 0.5) * 2); g.stroke();
    }
    const cols = ['#e0307a', '#20c8e0', '#e8a030', '#6a50e0'];
    for (let i = 0; i < 22; i++) {
      const x = rnd() * size, y = rnd() * size, w = 1 + rnd() * 2.5, hgt = 8 + rnd() * 34;
      g.fillStyle = cols[i % 4]; g.globalAlpha = 0.16 + rnd() * 0.3;
      g.fillRect(x, y, w, hgt); g.fillRect(x - size, y, w, hgt);
    }
    g.globalAlpha = 1;
  }
  const t = new THREE.CanvasTexture(g.canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (kind !== 'normal') t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const U_RECT = { x0: -146, z0: -68, x1: 72, z1: 96 };
const G_ZONES = [
  { id: 'flood-promenade', x0: -135, z0: 107, x1: 155, z1: 143, cap: 1.9, rate: 0.55 },
  { id: 'flood-west-quay', x0: -139, z0: -122, x1: -112, z1: 100, cap: 1.7, rate: 0.5 },
  { id: 'flood-courtyard', x0: -65, z0: 10, x1: -25, z1: 50, cap: 1.5, rate: 0.45 },
  { id: 'flood-site-basin', x0: 55, z0: 70, x1: 95, z1: 110, cap: 1.8, rate: 0.5 },
];

export class Flood {
  constructor(h) {
    this.h = h; this.uLevel = FLOOD_TUNING.sumpY; this.knownAt = null; this.override = null;
    this.drain = 0; this.stepD = 0; this.lastRush = -99; this.stats = { deepSeconds: 0, rayLost: 0, splashes: 0, setuSoaked: 0 }; this.depth = 0; this.under = false; this.setuDeep = false; this.gStarted = false;
  }

  init() {
    const { game } = this.h, rng = this.h.rng.fork('flood'), T = FLOOD_TUNING;
    this.rng = rng;
    this.sev = rng.range(0.88, 1.18);
    this.zones = G_ZONES.map((z) => ({ ...z, rect: { x0: z.x0, z0: z.z0, x1: z.x1, z1: z.z1 }, delay: rng.range(0, 1.6), rate: z.rate * rng.range(0.85, 1.25), cap: z.cap * rng.range(0.85, 1.15), depth: 0, mesh: null, loop: false }));
    this.nTex = rippleCanvas(128, 41, 'normal'); this.eTex = rippleCanvas(256, 9, 'glow');
    this.mat = new THREE.MeshPhongMaterial({
      color: 0x0a1a20, specular: 0x9ac4d0, shininess: 90, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false,
      normalMap: this.nTex, normalScale: new THREE.Vector2(0.55, 0.55), emissive: 0xffffff, emissiveMap: this.eTex, emissiveIntensity: 0.6,
    });
    this.mat.onBeforeCompile = (sh) => {
      sh.uniforms.uSky = { value: new THREE.Color(0.035, 0.115, 0.15) };
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform vec3 uSky;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          { float fr = pow(1.0 - clamp(abs(dot(normal, normalize(vViewPosition))), 0.0, 1.0), 2.2);
            totalEmissiveRadiance += uSky * (0.5 + 2.4 * fr) * (0.8 + 0.7 * normal.x); }`);
    };
    this.mat.customProgramCacheKey = () => 'hazard-water';
    game.materials?.all?.push(this.mat);
    const plane = (r, name, tile) => {
      const g = new THREE.PlaneGeometry(r.x1 - r.x0, r.z1 - r.z0); g.rotateX(-Math.PI / 2);
      const uv = g.attributes.uv; const u = (r.x1 - r.x0) / tile, v = (r.z1 - r.z0) / tile;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * u, uv.getY(i) * v);
      const m = new THREE.Mesh(g, this.mat); m.position.set((r.x0 + r.x1) / 2, -30, (r.z0 + r.z1) / 2);
      m.frustumCulled = false; m.renderOrder = 4; m.name = name; m.visible = false; game.scene.add(m); return m;
    };
    this.uMesh = plane(U_RECT, 'flood-u', 5);
    for (const z of this.zones) z.mesh = plane(z.rect, z.id, 6);
    // underwater tint
    const el = this.el = document.createElement('div');
    el.id = 'fx-water'; el.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:7;opacity:0;transition:opacity .25s ease;background:linear-gradient(to bottom, rgba(8,32,40,.62), rgba(4,16,22,.82))';
    document.body.appendChild(el);
    this.world = game.world;
    this.bw = game.world.breachWater;
    this.baseVisible = this.bw?.mesh?.visible ?? true;
  }

  // ------------------------------------------------------------------------------------------ levels
  levelU(t) {
    const T = FLOOD_TUNING, f = clamp((t - 5.667) / (30 - 5.667), 0, 1);
    return Math.min(-2.4, T.sumpY + T.uRange * this.sev * Math.pow(f, T.uPower));
  }
  gStart() { const T = FLOOD_TUNING; return Math.min(this.knownAt != null ? this.knownAt + T.gDelay : Infinity, T.gRegardless); }
  depthG(z, t) { return clamp((t - this.gStart() - z.delay) * z.rate, 0, z.cap); }

  /** Water depth (m) over the floor at a point: U network, or one of the G basins. 0 elsewhere. */
  depthAt(pos) {
    if (pos.y < -3.5) {
      if (!pointInRect(pos.x, pos.z, U_RECT)) return 0;
      return Math.max(0, this.uLevel - pos.y);
    }
    if (pos.y > -1.5 && pos.y < 2.5) {
      for (const z of this.zones) if (z.depth > 0.02 && pointInRect(pos.x, pos.z, z.rect)) return Math.max(0, z.depth - pos.y);
    }
    return 0;
  }

  /** Set levels by hand for tests: {u: y, g: depth|[...]}; `null` returns to the clock. */
  setOverride(o) { this.override = o; }

  update(dt) {
    const h = this.h, game = h.game, T = FLOOD_TUNING, clock = game.clock, p = h.pp, t = clock?.t ?? 5.667;
    if (game.flags.breachKnown && this.knownAt == null) this.knownAt = t;
    const o = this.override;
    this.uLevel = o && o.u != null ? o.u : this.levelU(t);
    for (const z of this.zones) z.depth = o && o.g != null ? (Array.isArray(o.g) ? (o.g[this.zones.indexOf(z)] ?? 0) : o.g) : this.depthG(z, t);
    // meshes
    this.uMesh.visible = this.uLevel > T.sumpY - 0.01;
    this.uMesh.position.y = this.uLevel;
    if (this.bw) this.bw.setLevel(this.uLevel);
    for (const z of this.zones) { z.mesh.visible = z.depth > 0.02; z.mesh.position.y = z.depth + 0.01; }
    // ripples
    this.nTex.offset.x += dt * 0.012; this.nTex.offset.y -= dt * 0.008; this.eTex.offset.x -= dt * 0.006; this.eTex.offset.y += dt * 0.004;
    // flood begins on G: a rush of water from the drains
    const anyG = this.zones.some((z) => z.depth > 0.05);
    if (anyG && !this.gStarted) { this.gStarted = true; h.say('A sound like a river rising inside the walls. Water is coming up through the drains.', 'story', 8); h.sound('water-rush', p, 0.9); h.nearCaption(p, '[water rushing in the drains]', 99999); }
    // U rising rushes every half metre
    const k = Math.floor((this.uLevel - T.sumpY) / 0.75);
    if (k > (this._k ?? 0)) { this._k = k; if (hdist(p, { x: -118, z: -38 }) < 220 && game.time - this.lastRush > 20) { this.lastRush = game.time; h.sound('water-rush', { x: -118, y: -9, z: -38 }, 0.75); if (p.y < -3) h.say('Somewhere below, water gushes. The tunnel floor is wetter than it was.', 'story', 6); } }

    // ---- the player in the water
    const depth = this.depthAt(p);
    this.depth = depth;
    const eyeY = h.game.player.eyeY;
    const surf = p.y < -3.5 ? this.uLevel : (this.zones.find((z) => z.depth > 0.02 && pointInRect(p.x, p.z, z.rect))?.depth ?? -99);
    const under = depth > 0.05 && eyeY < surf;
    if (under !== this.under) { this.under = under; this.el.style.opacity = under ? '1' : '0'; }
    let mul = 1;
    if (depth >= T.deep) mul = T.deepSpeed;
    else if (depth > T.shallow) mul = 1 - 0.58 * ((depth - T.shallow) / (T.deep - T.shallow)) ;
    else if (depth > 0.1) mul = 0.9;
    h.setSpeedMod('water', mul);
    if (depth >= T.deep) {
      this.drain += dt / T.drainSeconds; this.stats.deepSeconds += dt;
      if (this.drain >= 1) {
        this.drain -= 1; this.stats.rayLost++;
        h.hurt(1, 'water');
        h.say('The water is black, cold and heavy. It pulls the warmth out of you.', 'story', 5);
      }
    } else this.drain = Math.max(0, this.drain - dt * 0.5);
    // splashing steps
    if (depth > 0.1) {
      this.stepD += h.playerSpeed * dt;
      if (this.stepD > (depth > T.deep ? 1.1 : 1.5)) { this.stepD = 0; this.stats.splashes++; h.sound('splash', { x: p.x, y: p.y + 0.2, z: p.z }, clamp(0.25 + depth * 0.3, 0.2, 0.85)); }
    }

    // ---- Setu in the water
    const su = h.setuTarget(), setu = game.setu;
    if (su && setu?.following) {
      const sd = this.depthAt(su);
      const deep = sd > 0.7;
      if (deep !== this.setuDeep) {
        this.setuDeep = deep;
        setu.setDecayMul('flood', deep ? 2.5 : 1);
        if (deep) { this.stats.setuSoaked++; h.say('Setu wades in up to his chest, wheezing. "Didi, it is so cold."', 'story', 6); }
      }
      if (deep) { this._setuAcc = (this._setuAcc ?? 0) + 0.9 * dt; if (this._setuAcc >= 1) { this._setuAcc -= 1; setu.hurt(1, 'water'); } }
    } else if (this.setuDeep) { this.setuDeep = false; setu?.setDecayMul('flood', 1); }

    // ---- water loops (nearest water to the player)
    this._loops(p);
  }

  _loops(p) {
    const h = this.h, ev = h.game.events, T = FLOOD_TUNING;
    const uOn = this.uLevel > T.sumpY + 0.2 && hdist(p, { x: -118, z: -38 }) < 130 && p.y < 6;
    if (uOn !== !!this._uLoop) {
      this._uLoop = uOn;
      if (uOn) ev.emit('sound:loop', { id: 'water:u', kind: 'water', loudness: 0.5, getPos: () => ({ x: clamp(this.h.pp.x, -138, -98), y: -9, z: clamp(this.h.pp.z, -50, -26) }) });
      else ev.emit('sound:loopStop', { id: 'water:u' });
    }
    for (const z of this.zones) {
      const near = z.depth > 0.1 && Math.abs(p.y) < 12 && hdist(p, { x: clamp(p.x, z.rect.x0, z.rect.x1), z: clamp(p.z, z.rect.z0, z.rect.z1) }) < 45;
      if (near !== z.loop) {
        z.loop = near;
        if (near) ev.emit('sound:loop', { id: `water:${z.id}`, kind: 'water', loudness: 0.4, getPos: () => ({ x: clamp(this.h.pp.x, z.rect.x0, z.rect.x1), y: z.depth, z: clamp(this.h.pp.z, z.rect.z0, z.rect.z1) }) });
        else ev.emit('sound:loopStop', { id: `water:${z.id}` });
      }
    }
  }

  list(out) {
    const p = this.h.pp;
    for (const z of this.zones) if (z.depth > 0.1) out.push({ id: z.id, kind: 'water', pos: { x: clamp(p.x, z.rect.x0, z.rect.x1), y: z.depth, z: clamp(p.z, z.rect.z0, z.rect.z1) }, alert: z.depth > 1 ? 1 : 0.3, state: 'flooded' });
    if (this.uLevel > -8) out.push({ id: 'flood-u', kind: 'water', pos: { x: clamp(p.x, U_RECT.x0, U_RECT.x1), y: this.uLevel, z: clamp(p.z, U_RECT.z0, U_RECT.z1) }, alert: this.depthAt({ x: p.x, y: -8, z: p.z }) > 1 ? 1 : 0.3, state: 'flooded' });
  }

  setEnabled(on) {
    if (!on) {
      this.uMesh.visible = false; for (const z of this.zones) z.mesh.visible = false;
      this.el.style.opacity = '0'; this.under = false; this.h.setSpeedMod('water', 1);
      if (this.bw) { this.bw.setLevel(this.bw.baseY); if (this.bw.mesh) this.bw.mesh.visible = this.baseVisible; }
      this.setuDeep = false; this.h.game.setu?.setDecayMul?.('flood', 1);
    } else if (this.bw?.mesh) this.bw.mesh.visible = false;
  }

  snapshot() {
    return {
      uLevel: +this.uLevel.toFixed(2), severity: +this.sev.toFixed(2), knownAt: this.knownAt, gStart: +this.gStart().toFixed(2), override: !!this.override,
      g: Object.fromEntries(this.zones.map((z) => [z.id, +z.depth.toFixed(2)])), playerDepth: +this.depth.toFixed(2), underwater: this.under, stats: { ...this.stats }, setuDeep: this.setuDeep,
    };
  }
  clear() {}
}
void smoothstep;
