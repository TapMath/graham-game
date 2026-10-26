// The minimap: a circular local map (about 120 m across) that turns with the view, on a 2D canvas in the corner of the HUD.
//
// The level's layout is painted once into an offscreen canvas (maprender.js, cached per level, rebuilt only when the level changes),
// so a frame is one rotated blit plus a handful of live marks: sunlight patches, lift batteries, gate thresholds, the Harbour Line's
// trains, the people with you, objectives, fragments you found and (faintly) the last lead to Setu. The layer never draws
// where Setu is while he is unfound. `draw(frame)` is called about 10 times a second by the map system.
import { DARK, paintLevel } from './maprender.js';
import { BOUNDS, LEVEL_INFO, gatesAt, linksAt, levelIndex, RAIL } from './mapdata.js';

const RADIUS_M = 60;                                   // metres from the player to the rim: 120 m across
const TAU = Math.PI * 2;

export class Minimap {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.cache = null; this.cacheLevel = null; this.cachePpm = 0;
    this.size = 0; this.dpr = 1;
    this.t = 0;
    this.stats = { redraws: 0, cacheBuilds: 0, lastMs: 0 };
  }

  /** Match the canvas backing store to its CSS size. */
  fit() {
    const cssW = this.canvas.clientWidth || 160, dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (Math.abs(cssW - this.size) < 0.5 && dpr === this.dpr) return;
    this.size = cssW; this.dpr = dpr;
    this.canvas.width = Math.round(cssW * dpr); this.canvas.height = Math.round(cssW * dpr);
    this.cacheLevel = null;                                   // the scale may have changed
  }

  _ensureCache(level) {
    if (this.cache && this.cacheLevel === level) return;
    const sc = (this.size / 2 / RADIUS_M) * this.dpr;                 // device pixels per metre on screen
    const ppm = Math.max(1.6, Math.min(3, sc * 1.05));
    const W = Math.ceil((BOUNDS.x1 - BOUNDS.x0) * ppm), H = Math.ceil((BOUNDS.z1 - BOUNDS.z0) * ppm);
    if (!this.cache) this.cache = document.createElement('canvas');
    this.cache.width = W; this.cache.height = H;
    const g = this.cache.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = level === 'G' ? DARK.sea : DARK.bg; g.fillRect(0, 0, W, H);
    g.setTransform(ppm, 0, 0, ppm, -BOUNDS.x0 * ppm, -BOUNDS.z0 * ppm);
    paintLevel(g, level, DARK, BOUNDS, 1 / ppm);
    this.cacheLevel = level; this.cachePpm = ppm; this.stats.cacheBuilds++;
  }

  /**
   * Draw one frame. `f`: {level, x, z, yaw, fov, hour, lit (0..1), sun[], lifts[], trains[], eta, party[], lead, objectives[], fragments[],
   * inSun, rays}. Coordinates are world metres; yaw is the view's yaw (0 faces -Z, + turns left).
   */
  draw(f, time) {
    this.fit();
    const t0 = performance.now();
    const g = this.g, S = this.canvas.width, R = S / 2, dpr = this.dpr;
    const sc = R / RADIUS_M;                                          // device px per metre
    const cy = Math.cos(f.yaw), sy = Math.sin(f.yaw);
    this.t = time;
    this._ensureCache(f.level);

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, S, S);
    g.save();
    g.beginPath(); g.arc(R, R, R - 1.5 * dpr, 0, TAU); g.clip();
    g.fillStyle = f.level === 'G' ? DARK.sea : DARK.bg; g.fillRect(0, 0, S, S);

    // ---- the world, rotated so the view points up
    g.save();
    g.translate(R, R); g.rotate(f.yaw); g.scale(sc, sc); g.translate(-f.x, -f.z);
    const half = RADIUS_M * 1.45;                                     // covers the corners of the rotated square
    const sx0 = Math.max(BOUNDS.x0, f.x - half), sz0 = Math.max(BOUNDS.z0, f.z - half), sx1 = Math.min(BOUNDS.x1, f.x + half), sz1 = Math.min(BOUNDS.z1, f.z + half);
    if (sx1 > sx0 && sz1 > sz0) {
      const ppm = this.cachePpm;
      g.imageSmoothingEnabled = true;
      g.drawImage(this.cache, (sx0 - BOUNDS.x0) * ppm, (sz0 - BOUNDS.z0) * ppm, (sx1 - sx0) * ppm, (sz1 - sz0) * ppm, sx0, sz0, sx1 - sx0, sz1 - sz0);
    }
    const px = 1 / sc;                                                // metres per device pixel

    this._sun(g, f, px, time);
    this._lifts(g, f, px);
    this._trains(g, f, px);
    g.restore();

    // ---- upright marks (screen space)
    const P = (wx, wz) => { const dx = wx - f.x, dz = wz - f.z; return [R + (dx * cy - dz * sy) * sc, R + (dx * sy + dz * cy) * sc]; };
    this._gates(g, f, P, dpr);
    this._liftLabels(g, f, P, dpr);
    this._fragments(g, f, P, dpr);
    this._lead(g, f, P, dpr, R);
    this._objectives(g, f, P, dpr, R);
    this._party(g, f, P, dpr, R);
    this._player(g, f, R, dpr);
    g.restore();

    g.strokeStyle = 'rgba(221,233,244,.1)'; g.lineWidth = 1 * dpr; g.setLineDash([2 * dpr, 4 * dpr]); g.beginPath(); g.arc(R, R, 30 * sc, 0, TAU); g.stroke(); g.setLineDash([]);

    // ---- the rim: glass edge, compass, dark vignette at the border so marks do not just stop
    const grad = g.createRadialGradient(R, R, R * 0.72, R, R, R);
    grad.addColorStop(0, 'rgba(5,10,14,0)'); grad.addColorStop(1, 'rgba(5,10,14,.55)');
    g.fillStyle = grad; g.beginPath(); g.arc(R, R, R - 1 * dpr, 0, TAU); g.fill();
    this._rim(g, f, R, dpr);
    this._caption(g, f, R, dpr);
    this.stats.redraws++; this.stats.lastMs = performance.now() - t0;
  }

  // ------------------------------------------------------------------------------------------------ world-space layers
  _sun(g, f, px, time) {
    g.save(); g.globalCompositeOperation = 'lighter';
    for (const s of f.sun) {
      const live = s.kind === 'shaft' ? s.i : s.i * 0.55;
      const lamp = s.kind === 'lamp', r = lamp ? 2.1 : s.r * 1.7, pulse = 0.88 + 0.12 * Math.sin(time * 1.6 + s.x);   // a solar lamp is a small warm pool, a shaft a big one
      const gr = g.createRadialGradient(s.x, s.z, 0, s.x, s.z, r * (lamp ? 3.4 : 1.8));
      gr.addColorStop(0, `rgba(255,198,84,${(0.92 * live * pulse).toFixed(3)})`); gr.addColorStop(0.45, `rgba(255,168,50,${(0.5 * live).toFixed(3)})`); gr.addColorStop(1, 'rgba(255,170,70,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(s.x, s.z, r * (lamp ? 3.4 : 1.8), 0, TAU); g.fill();
      if (!lamp) { g.strokeStyle = `rgba(255,216,120,${(0.9 * live).toFixed(3)})`; g.lineWidth = 1.2 * px; g.beginPath(); g.arc(s.x, s.z, r, 0, TAU); g.stroke(); }
    }
    g.restore();
    // where the light will be again (night, dawn): faint dashed rings on this level's shaft sites
    if (f.later) {
      g.save(); g.setLineDash([3 * px, 3 * px]); g.strokeStyle = 'rgba(255,214,140,.38)'; g.lineWidth = 1.1 * px;
      for (const s of f.later) { g.beginPath(); g.arc(s.x, s.z, s.r * 1.5, 0, TAU); g.stroke(); }
      g.restore();
    }
  }

  _lifts(g, f, px) {
    for (const l of f.lifts) {
      const cx = l.center[0], cz = l.center[1], r = 3.6;
      const pct = l.charge / l.capacity, col = pct > 0.5 ? '#9fe8c0' : pct > 0.2 ? '#ffd27a' : '#ff8068';
      g.lineWidth = 2.2 * px; g.strokeStyle = 'rgba(0,0,0,.45)'; g.beginPath(); g.arc(cx, cz, r, 0, TAU); g.stroke();
      g.strokeStyle = col; g.beginPath(); g.arc(cx, cz, r, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.02, pct)); g.stroke();
    }
  }

  _trains(g, f, px) {
    if (!f.trains.length) return;
    for (const t of f.trains) {
      const len = RAIL.trainLen, half = len / 2;
      g.fillStyle = t.moving ? '#ffe9a8' : '#ffd070'; g.strokeStyle = 'rgba(20,14,4,.7)'; g.lineWidth = 0.9 * px;
      g.beginPath(); g.rect(t.x - half, t.z - 1.7, len, 3.4); g.fill(); g.stroke();
      // carriage breaks and a head mark
      g.strokeStyle = 'rgba(20,14,4,.55)'; g.beginPath(); for (let k = 1; k < 4; k++) { const x = t.x - half + k * len / 4; g.moveTo(x, t.z - 1.7); g.lineTo(x, t.z + 1.7); } g.stroke();
      g.fillStyle = '#fff'; const hx = t.x + t.dir * half; g.beginPath(); g.moveTo(hx + t.dir * 2.6, t.z); g.lineTo(hx - t.dir * 0.4, t.z - 1.5); g.lineTo(hx - t.dir * 0.4, t.z + 1.5); g.closePath(); g.fill();
    }
  }

  // ------------------------------------------------------------------------------------------------ screen-space layers
  _gates(g, f, P, dpr) {
    g.font = `500 ${8.5 * dpr}px Inter, Helvetica, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const gt of gatesAt(f.level)) {
      const [x, y] = P(gt.x, gt.z);
      if (Math.hypot(x - this.canvas.width / 2, y - this.canvas.width / 2) > this.canvas.width / 2 - 8 * dpr) continue;
      const ok = gt.permit ? !!f.permit : f.rays >= gt.min, txt = gt.permit ? 'P' : String(gt.min);
      const w = (txt.length > 1 ? 15 : 12) * dpr, h = 11 * dpr;
      g.fillStyle = ok ? 'rgba(143,232,168,.92)' : 'rgba(255,128,104,.95)'; this._pill(g, x - w / 2, y - h / 2 - 8 * dpr, w, h, 3 * dpr);
      g.fillStyle = '#10171b'; g.fillText(txt, x, y - 7.5 * dpr);
    }
  }

  _liftLabels(g, f, P, dpr) {
    if (this.size < 130) return;                                   // phones: the battery ring says enough, the text would swamp the lens
    g.font = `500 ${8 * dpr}px Inter, Helvetica, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const l of f.lifts) {
      const [x, y] = P(l.center[0], l.center[1]);
      if (Math.hypot(x - this.canvas.width / 2, y - this.canvas.width / 2) > this.canvas.width / 2 - 24 * dpr) continue;
      const lv = l.stops.map((s) => s.level).filter((v) => v !== f.level);
      const txt = `${l.chargePct}% ${lv.length ? (lv.length > 1 ? '↕' : levelIndex(lv[0]) > levelIndex(f.level) ? '↑' : '↓') + lv.join('·') : ''}`;
      const w = g.measureText(txt).width + 7 * dpr;
      g.fillStyle = 'rgba(8,14,19,.8)'; this._pill(g, x - w / 2, y + 6 * dpr, w, 10 * dpr, 3 * dpr);
      g.fillStyle = '#c9ece6'; g.fillText(txt, x, y + 11 * dpr);
    }
  }

  _fragments(g, f, P, dpr) {
    g.fillStyle = 'rgba(191,228,255,.92)'; g.strokeStyle = 'rgba(8,14,19,.8)'; g.lineWidth = 1 * dpr;
    for (const m of f.fragments) {
      const [x, y] = P(m.x, m.z); if (Math.hypot(x - this.canvas.width / 2, y - this.canvas.width / 2) > this.canvas.width / 2 - 6 * dpr) continue;
      g.beginPath(); g.rect(x - 2.6 * dpr, y - 3.2 * dpr, 5.2 * dpr, 6.4 * dpr); g.fill(); g.stroke();
    }
  }

  _lead(g, f, P, dpr, R) {
    const m = f.lead; if (!m) return;
    const near = m.level === f.level;
    let [x, y] = P(m.x, m.z);
    const d = Math.hypot(x - R, y - R), lim = R - 10 * dpr;
    if (d > lim) { x = R + (x - R) * lim / d; y = R + (y - R) * lim / d; }
    g.save(); g.globalAlpha = near ? 0.62 : 0.34;
    g.strokeStyle = '#ffdf9a'; g.lineWidth = 1.3 * dpr; g.setLineDash([2.5 * dpr, 2.5 * dpr]);
    g.beginPath(); g.arc(x, y, 7.5 * dpr, 0, TAU); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#ffdf9a'; g.font = `italic 600 ${11 * dpr}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('?', x, y + 0.5 * dpr);
    g.restore();
  }

  _objectives(g, f, P, dpr, R) {
    for (const m of f.objectives) {
      const near = m.level === f.level;
      let [x, y] = P(m.x, m.z);
      const d = Math.hypot(x - R, y - R), lim = R - 9 * dpr, off = d > lim;
      if (off) { x = R + (x - R) * lim / d; y = R + (y - R) * lim / d; }
      g.save(); g.globalAlpha = near ? 1 : 0.5;
      const s = (off ? 4.6 : 5.6) * dpr;
      g.fillStyle = '#ffdf9a'; g.strokeStyle = '#0a1217'; g.lineWidth = 1.4 * dpr;
      g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s, y); g.lineTo(x, y + s); g.lineTo(x - s, y); g.closePath(); g.fill(); g.stroke();
      if (!near) { g.fillStyle = '#ffdf9a'; g.font = `600 ${8 * dpr}px Inter, Arial, sans-serif`; g.textAlign = 'center'; g.fillText(m.level, x, y - s - 4 * dpr); }
      g.restore();
    }
  }

  _party(g, f, P, dpr, R) {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const m of f.party) {
      if (m.level !== f.level) continue;
      let [x, y] = P(m.x, m.z);
      const d = Math.hypot(x - R, y - R), lim = R - 8 * dpr; if (d > lim) { x = R + (x - R) * lim / d; y = R + (y - R) * lim / d; }
      g.fillStyle = m.color; g.strokeStyle = '#0a1217'; g.lineWidth = 1.5 * dpr;
      g.beginPath(); g.arc(x, y, 4.4 * dpr, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#10171b'; g.font = `700 ${6.4 * dpr}px Inter, Arial, sans-serif`; g.fillText(m.tag, x, y + 0.3 * dpr);
    }
  }

  _player(g, f, R, dpr) {
    // the view cone, then the marker
    const fov = (f.fov ?? 75) * Math.PI / 180 * 0.8, L = 30 * dpr;
    const cone = g.createRadialGradient(R, R, 2 * dpr, R, R, L * 1.8);
    cone.addColorStop(0, 'rgba(255,255,255,.20)'); cone.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = cone; g.beginPath(); g.moveTo(R, R); g.arc(R, R, L * 1.8, -Math.PI / 2 - fov / 2, -Math.PI / 2 + fov / 2); g.closePath(); g.fill();
    g.fillStyle = '#ffffff'; g.strokeStyle = '#0a1217'; g.lineWidth = 1.6 * dpr; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(R, R - 7.6 * dpr); g.lineTo(R + 5.2 * dpr, R + 5.4 * dpr); g.lineTo(R, R + 2.6 * dpr); g.lineTo(R - 5.2 * dpr, R + 5.4 * dpr); g.closePath(); g.fill(); g.stroke();
    if (f.inSun) { g.strokeStyle = 'rgba(255,225,150,.9)'; g.lineWidth = 1.6 * dpr; g.beginPath(); g.arc(R, R, 10.5 * dpr, 0, TAU); g.stroke(); }
  }

  _rim(g, f, R, dpr) {
    g.save();
    g.strokeStyle = 'rgba(221,233,244,.55)'; g.lineWidth = 1.6 * dpr; g.beginPath(); g.arc(R, R, R - 1.2 * dpr, 0, TAU); g.stroke();
    // cardinal ticks that turn with the view; north in gold
    const cy = Math.cos(f.yaw), sy = Math.sin(f.yaw);
    const dirs = [['N', 0, -1, '#ffdf9a'], ['E', 1, 0, 'rgba(221,233,244,.55)'], ['S', 0, 1, 'rgba(221,233,244,.55)'], ['W', -1, 0, 'rgba(221,233,244,.55)']];
    g.font = `700 ${8.5 * dpr}px Inter, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [name, dx, dz, col] of dirs) {
      const x = R + (dx * cy - dz * sy) * (R - 8.2 * dpr), y = R + (dx * sy + dz * cy) * (R - 8.2 * dpr);
      g.fillStyle = col;
      if (name === 'N') { g.fillStyle = 'rgba(8,14,19,.75)'; g.beginPath(); g.arc(x, y, 6 * dpr, 0, TAU); g.fill(); g.fillStyle = col; }
      g.fillText(name, x, y + 0.4 * dpr);
    }
    g.restore();
  }

  _caption(g, f, R, dpr) {
    if (!f.eta) return;
    g.save();
    g.font = `500 ${8 * dpr}px Inter, Helvetica, Arial, sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = g.measureText(f.eta).width + 12 * dpr;
    g.fillStyle = 'rgba(8,14,19,.84)'; this._pill(g, R - w / 2, 2 * R - 36 * dpr, w, 12.5 * dpr, 6 * dpr);
    g.fillStyle = '#bfe4ff'; g.fillText(f.eta, R, 2 * R - 29.6 * dpr);
    g.restore();
  }

  _pill(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.fill();
  }
}

export { RADIUS_M, LEVEL_INFO, linksAt };
