// The minimap: a CRT screen (rounded-square phosphor display in a gunmetal bezel, about 120 m across) that turns with the view, on a 2D canvas in the corner of the HUD.
// The scanlines, glass, sweep and flicker are CSS (styles.css .mm-*), so the canvas only pays for the map and its marks.
//
// The level's layout is painted once into an offscreen canvas (maprender.js, cached per level, rebuilt only when the level changes),
// so a frame is one rotated blit plus a handful of live marks: sunlight patches, lift batteries, gate thresholds, the Harbour Line's
// trains, the people with you, objectives (the primary one big, gold and on the screen's edge as an arrow when it is out of view), fragments you found and (faintly) the last lead to Setu. The layer never draws
// where Setu is while he is unfound. `draw(frame)` is called about 10 times a second by the map system.
import { NEON, paintLevel } from './maprender.js';
import { BOUNDS, LEVEL_INFO, gatesAt, linksAt, levelIndex, fmtDist, RAIL } from './mapdata.js';

const RADIUS_M = 60;                                   // metres from the player to the rim: 120 m across
/** Ring radius (m) of a capsule lift on the maps, by class: the bigger the car, the bigger the ring. */
const CAR_R = { solo: 2.4, family: 3.4, public: 4.6, freight: 5.8 };
const TAU = Math.PI * 2;
const MONO = "ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";
const CORNER = 0.18;                                    // screen corner radius as a fraction of its width (matches .mm-screen in CSS)
const pad3 = (v) => (v < 0 ? '-' : '+') + String(Math.min(999, Math.round(Math.abs(v)))).padStart(3, '0');

export class Minimap {
  constructor(canvas, readouts) {
    this.canvas = canvas; this.ro = readouts ?? {}; this._roTxt = {}; this.rc = 0;
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
    g.fillStyle = level === 'G' ? NEON.sea : NEON.bg; g.fillRect(0, 0, W, H);
    g.setTransform(ppm, 0, 0, ppm, -BOUNDS.x0 * ppm, -BOUNDS.z0 * ppm);
    paintLevel(g, level, NEON, BOUNDS, 1 / ppm);
    // phosphor bloom, once per level: a blurred copy added back on itself (skipped where canvas filters are missing)
    if ('filter' in g) { const t = document.createElement('canvas'); t.width = W; t.height = H; t.getContext('2d').drawImage(this.cache, 0, 0); g.setTransform(1, 0, 0, 1, 0, 0); g.filter = `blur(${Math.max(1.2, ppm * 0.7)}px)`; g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.55; g.drawImage(t, 0, 0); g.globalAlpha = 1; g.filter = 'none'; g.globalCompositeOperation = 'source-over'; }
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
    this._readouts(f);

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, S, S);
    g.save();
    this.rc = S * CORNER; this._rr(g, 1.5 * dpr, S - 3 * dpr, this.rc - 1.5 * dpr); g.clip();
    g.fillStyle = f.level === 'G' ? NEON.sea : NEON.bg; g.fillRect(0, 0, S, S);

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
    this._target(g, f, P, dpr, R, time);
    this._party(g, f, P, dpr, R);
    this._player(g, f, R, dpr);
    g.restore();

    g.strokeStyle = 'rgba(90,255,235,.12)'; g.lineWidth = 1 * dpr; g.setLineDash([2 * dpr, 4 * dpr]); g.beginPath(); g.arc(R, R, 30 * sc, 0, TAU); g.stroke(); g.setLineDash([]);

    // ---- the screen edge: a thin phosphor border and the compass (the dark vignette and the glass are CSS)
    this._rim(g, f, R, dpr);
    this._caption(g, f, R, dpr);
    this.stats.redraws++; this.stats.lastMs = performance.now() - t0;
  }

  /** Rounded-square path from `a` to `b` (device px), corner radius r. */
  _rr(g, a, b, r) { g.beginPath(); g.moveTo(a + r, a); g.arcTo(b, a, b, b, r); g.arcTo(b, b, a, b, r); g.arcTo(a, b, a, a, r); g.arcTo(a, a, b, a, r); g.closePath(); }

  /** Clamp (x, y) into the screen's rounded square inset by m; third value true when it had to move (the mark is out of view). */
  _edge(x, y, m) {
    const S = this.canvas.width, rc = this.rc, b = Math.max(rc, m), r = Math.max(rc - m, 0);
    const cx = Math.min(S - b, Math.max(b, x)), cy = Math.min(S - b, Math.max(b, y)), dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy);
    return d > r ? [cx + (d ? dx * r / d : 0), cy + (d ? dy * r / d : 0), true] : [x, y, false];
  }

  /** Heading and position on the bezel (DOM, updated only when the text changes). */
  _readouts(f) {
    const ro = this.ro, hdg = ((Math.round(-f.yaw * 180 / Math.PI) % 360) + 360) % 360;
    const set = (k, v) => { if (ro[k] && this._roTxt[k] !== v) { this._roTxt[k] = v; ro[k].textContent = v; } };
    set('hdg', `${String(hdg).padStart(3, '0')}°`); set('pos', `X${pad3(f.x)} Z${pad3(f.z)}`);
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
      const cx = l.center[0], cz = l.center[1], r = CAR_R[l.cls] ?? 3.6;       // the ring grows with the car: solo, family, public, freight
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
    g.font = `500 ${8.5 * dpr}px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const gt of gatesAt(f.level)) {
      const [x, y] = P(gt.x, gt.z);
      if (this._edge(x, y, 8 * dpr)[2]) continue;
      const ok = gt.permit ? !!f.permit : f.rays >= gt.min, txt = gt.permit ? 'P' : String(gt.min);
      const w = (txt.length > 1 ? 15 : 12) * dpr, h = 11 * dpr;
      g.fillStyle = ok ? 'rgba(61,255,176,.92)' : 'rgba(255,60,172,.95)'; this._pill(g, x - w / 2, y - h / 2 - 8 * dpr, w, h, 3 * dpr);
      g.fillStyle = '#10171b'; g.fillText(txt, x, y - 7.5 * dpr);
    }
  }

  _liftLabels(g, f, P, dpr) {
    if (this.size < 130) return;                                   // phones: the battery ring says enough, the text would swamp the screen
    g.font = `500 ${8 * dpr}px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const l of f.lifts) {
      const [x, y] = P(l.center[0], l.center[1]);
      if (this._edge(x, y, 24 * dpr)[2]) continue;
      const lv = l.stops.map((s) => s.level).filter((v, i, a) => v !== f.level && a.indexOf(v) === i);
      const full = l.seats >= 12 && l.crowd >= l.seats;
      const txt = `${l.chargePct}% ${lv.length ? (lv.length > 1 ? '↕' : levelIndex(lv[0]) > levelIndex(f.level) ? '↑' : '↓') + lv.join('·') : ''} ·${l.seats}p${full ? ' FULL' : ''}`;
      const w = g.measureText(txt).width + 7 * dpr;
      g.fillStyle = 'rgba(2,10,12,.85)'; this._pill(g, x - w / 2, y + 6 * dpr, w, 10 * dpr, 3 * dpr);
      g.fillStyle = '#7dfbe9'; g.fillText(txt, x, y + 11 * dpr);
    }
  }

  _fragments(g, f, P, dpr) {
    g.fillStyle = 'rgba(191,228,255,.92)'; g.strokeStyle = 'rgba(8,14,19,.8)'; g.lineWidth = 1 * dpr;
    for (const m of f.fragments) {
      const [x, y] = P(m.x, m.z); if (this._edge(x, y, 6 * dpr)[2]) continue;
      g.beginPath(); g.rect(x - 2.6 * dpr, y - 3.2 * dpr, 5.2 * dpr, 6.4 * dpr); g.fill(); g.stroke();
    }
  }

  _lead(g, f, P, dpr, R) {
    const m = f.lead; if (!m || f.target?.lead) return;               // (when the lead IS the objective, _target draws it)
    const near = m.level === f.level;
    let [x, y] = P(m.x, m.z);
    [x, y] = this._edge(x, y, 10 * dpr);
    g.save(); g.globalAlpha = near ? 0.62 : 0.34;
    g.strokeStyle = '#ffdf9a'; g.lineWidth = 1.3 * dpr; g.setLineDash([2.5 * dpr, 2.5 * dpr]);
    g.beginPath(); g.arc(x, y, 7.5 * dpr, 0, TAU); g.stroke(); g.setLineDash([]);
    g.fillStyle = '#ffdf9a'; g.font = `italic 600 ${11 * dpr}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('?', x, y + 0.5 * dpr);
    g.restore();
  }

  _objectives(g, f, P, dpr, R) {
    for (const m of f.objectives) {
      if (m.main) continue;                                           // the main target has its own, louder marker (_target)
      const near = m.level === f.level;
      let [x, y] = P(m.x, m.z);
      let off; [x, y, off] = this._edge(x, y, 9 * dpr);
      g.save(); g.globalAlpha = near ? 1 : 0.5;
      const s = (off ? 4.6 : 5.6) * dpr;
      g.fillStyle = '#ffdf9a'; g.strokeStyle = '#0a1217'; g.lineWidth = 1.4 * dpr;
      g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s, y); g.lineTo(x, y + s); g.lineTo(x - s, y); g.closePath(); g.fill(); g.stroke();
      if (!near) { g.fillStyle = '#ffdf9a'; g.font = `600 ${8 * dpr}px ${MONO}`; g.textAlign = 'center'; g.fillText(m.level, x, y - s - 4 * dpr); }
      g.restore();
    }
  }

  /**
   * The primary objective, the one thing the player should always be able to find: a big gold diamond that breathes (still with "reduce
   * flashing"). Off the screen it sits on the edge as a chevron pointing out toward it with the distance; on another level it carries the level tag
   * and an arrow ("L3 ↑") at full opacity.
   */
  _target(g, f, P, dpr, R, time) {
    const m = f.target; if (!m) return;
    const near = m.level === f.level;
    let [x, y] = P(m.x, m.z);
    let off; [x, y, off] = this._edge(x, y, 20 * dpr);                           // (inside the compass letters, so the chevron never hides the N)
    const k = f.calm ? 0 : 0.5 + 0.5 * Math.sin(time * 3.4), s = (near && !off ? 8 : 8.5) * dpr * (1 + 0.12 * k);
    g.save();
    if (near && !off) { g.strokeStyle = `rgba(255,207,51,${0.75 - 0.5 * k})`; g.lineWidth = 2 * dpr; g.beginPath(); g.arc(x, y, s + (4 + 5 * k) * dpr, 0, TAU); g.stroke(); }
    g.fillStyle = '#ffcf33'; g.strokeStyle = '#0a1217'; g.lineWidth = 1.8 * dpr; g.lineJoin = 'round'; g.shadowColor = 'rgba(255,207,51,.95)'; g.shadowBlur = 9 * dpr;   // the one thing that glows gold
    g.beginPath();
    if (off) {                                                         // a chevron on the rim, its tip toward the objective
      const a = Math.atan2(y - R, x - R), ux = Math.cos(a), uy = Math.sin(a), tx = x + ux * s * 0.9, ty = y + uy * s * 0.9;
      g.moveTo(tx, ty); g.lineTo(x - ux * s * 0.6 - uy * s, y - uy * s * 0.6 + ux * s); g.lineTo(x - ux * s * 0.15, y - uy * s * 0.15); g.lineTo(x - ux * s * 0.6 + uy * s, y - uy * s * 0.6 - ux * s);
    } else { g.moveTo(x, y - s); g.lineTo(x + s, y); g.lineTo(x, y + s); g.lineTo(x - s, y); }
    g.closePath(); g.stroke(); g.fill(); g.shadowBlur = 0;
    // the words: level change and/or distance, on a dark pill toward the middle of the screen (so it never runs off the edge)
    const tag = [near ? '' : `${m.level} ${levelIndex(m.level) > levelIndex(f.level) ? '↑' : '↓'}`, off || !near ? fmtDist(Math.hypot(m.x - f.x, m.z - f.z)) : ''].filter(Boolean).join(' ');
    if (tag) {
      g.font = `700 ${8.5 * dpr}px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle';
      const w = g.measureText(tag).width + 9 * dpr, h = 12 * dpr, dx = R - x, dy = R - y, dl = Math.hypot(dx, dy) || 1;
      const off2 = off ? s + 9 * dpr : s + 8 * dpr, cx = Math.max(w / 2 + 3 * dpr, Math.min(2 * R - w / 2 - 3 * dpr, off ? x + dx / dl * off2 : x)), cy = off ? y + dy / dl * off2 : y + off2;
      g.fillStyle = 'rgba(8,14,19,.88)'; this._pill(g, cx - w / 2, cy - h / 2, w, h, 6 * dpr);
      g.fillStyle = '#ffd84d'; g.fillText(tag, cx, cy + 0.4 * dpr);
    }
    g.restore();
  }

  _party(g, f, P, dpr, R) {
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const m of f.party) {
      if (m.level !== f.level) continue;
      let [x, y] = P(m.x, m.z);
      [x, y] = this._edge(x, y, 8 * dpr);
      g.fillStyle = m.color; g.strokeStyle = '#0a1217'; g.lineWidth = 1.5 * dpr;
      g.beginPath(); g.arc(x, y, 4.4 * dpr, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#10171b'; g.font = `700 ${6.4 * dpr}px ${MONO}`; g.fillText(m.tag, x, y + 0.3 * dpr);
    }
  }

  _player(g, f, R, dpr) {
    // the view cone, then the marker
    const fov = (f.fov ?? 75) * Math.PI / 180 * 0.8, L = 30 * dpr;
    const cone = g.createRadialGradient(R, R, 2 * dpr, R, R, L * 1.8);
    cone.addColorStop(0, 'rgba(255,255,255,.20)'); cone.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = cone; g.beginPath(); g.moveTo(R, R); g.arc(R, R, L * 1.8, -Math.PI / 2 - fov / 2, -Math.PI / 2 + fov / 2); g.closePath(); g.fill();
    g.fillStyle = '#ffffff'; g.strokeStyle = '#0a1217'; g.lineWidth = 1.6 * dpr; g.lineJoin = 'round'; g.shadowColor = 'rgba(120,255,240,.9)'; g.shadowBlur = 6 * dpr;
    g.beginPath(); g.moveTo(R, R - 7.6 * dpr); g.lineTo(R + 5.2 * dpr, R + 5.4 * dpr); g.lineTo(R, R + 2.6 * dpr); g.lineTo(R - 5.2 * dpr, R + 5.4 * dpr); g.closePath(); g.fill(); g.stroke(); g.shadowBlur = 0;
    if (f.inSun) { g.strokeStyle = 'rgba(255,225,150,.9)'; g.lineWidth = 1.6 * dpr; g.beginPath(); g.arc(R, R, 10.5 * dpr, 0, TAU); g.stroke(); }
  }

  _rim(g, f, R, dpr) {
    g.save();
    const S = 2 * R; this._rr(g, 1.2 * dpr, S - 1.2 * dpr, this.rc - 1.2 * dpr); g.strokeStyle = 'rgba(90,255,235,.5)'; g.lineWidth = 1.4 * dpr; g.stroke();
    // cardinal letters that turn with the view, on the square's edge; north in gold
    const cy = Math.cos(f.yaw), sy = Math.sin(f.yaw), m = 8.2 * dpr;
    const dirs = [['N', 0, -1, '#ffdf9a'], ['E', 1, 0, 'rgba(120,255,240,.6)'], ['S', 0, 1, 'rgba(120,255,240,.6)'], ['W', -1, 0, 'rgba(120,255,240,.6)']];
    g.font = `700 ${8.5 * dpr}px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const [name, dx, dz, col] of dirs) {
      const vx = dx * cy - dz * sy, vy = dx * sy + dz * cy, t = (R - m) / Math.max(Math.abs(vx), Math.abs(vy));   // along the heading to the square's edge
      const [x, y] = this._edge(R + vx * t, R + vy * t, m);
      g.fillStyle = col;
      if (name === 'N') { g.fillStyle = 'rgba(2,10,12,.8)'; g.beginPath(); g.arc(x, y, 6 * dpr, 0, TAU); g.fill(); g.fillStyle = col; }
      g.fillText(name, x, y + 0.4 * dpr);
    }
    g.restore();
  }

  _caption(g, f, R, dpr) {
    if (!f.eta) return;
    g.save();
    g.font = `500 ${8 * dpr}px ${MONO}`; g.textAlign = 'center'; g.textBaseline = 'middle';
    const w = g.measureText(f.eta).width + 12 * dpr;
    g.fillStyle = 'rgba(2,10,12,.86)'; this._pill(g, R - w / 2, 2 * R - 36 * dpr, w, 12.5 * dpr, 6 * dpr);
    g.fillStyle = '#7dfbe9'; g.fillText(f.eta, R, 2 * R - 29.6 * dpr);
    g.restore();
  }

  _pill(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.fill();
  }
}

export { RADIUS_M, LEVEL_INFO, linksAt };
