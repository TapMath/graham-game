// The full map: a city transit sheet of the slice of Mumbai the game takes place in, in the safety-card look (pale card, ink lines,
// orange and blue "lines", a few scrawled notes). Opened with M (or the touch button, or by tapping the minimap); the game is paused
// while it is up (src/ui/map.js does the pausing). One tab per level (U, G, L1, L2, L3), the Harbour Line and its stations with the
// next trains, the lifts with their floors and battery, the gates with their thresholds, the sunlight now and when it comes and
// goes, the places you have found, and a "you are here". It draws its own text (the world's label atlas is full).
//
//   Mouse: drag to pan, wheel to zoom, the tabs and buttons.   Keys: 1-5 or Left/Right for the tabs, + and - to zoom, C centres on you,
//   F fits the whole sheet, M or Esc closes.   Touch: drag, pinch, the buttons (they are large enough to hit).
import { PAPER, paintLevel } from './maprender.js';
import {
  BOUNDS, LEVELS, LEVEL_INFO, GATES, LINKS, PLACES, RAIL, SUN_HOURS, levelData, levelIndex, linksAt, sunFactorAt, fmtHour, gatesAt,
} from './mapdata.js';
import { MAP } from '../world/map.js';

const TAU = Math.PI * 2;
/** Ring radius (m) of a capsule lift by class: the bigger the car, the bigger the ring. */
const CAR_R = { solo: 2.4, family: 3.4, public: 4.6, freight: 5.8 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SANS = "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const DEVA = "'Noto Sans Devanagari','Mangal','Nirmala UI','Kohinoor Devanagari','Lohit Devanagari','FreeSans',sans-serif";
const HAND = "'Bradley Hand','Segoe Print','Chalkboard SE','Comic Neue','Comic Sans MS','Purisa',cursive";
const SERIF = "Georgia, 'Times New Roman', serif";

const LIFT_NAMES = {
  'lift-g1-skywalk': "King's Circle lift", 'lift-12-bazaar': 'Bazaar flyover lift', 'lift-23-west': 'Wadala lift (west)', 'lift-23-east': 'Wadala lift (east)',
  'lift-bridge': 'Atal Setu lift', 'lift-wadala-express-s': 'New Wadala Express (south)', 'lift-wadala-express-n': 'New Wadala Express (north)', 'lift-canyon': 'Wadala Canyon lift',
};
const GATE_NAMES = {
  'gate-l2-stairs-b': 'EEH flyover stairs, Matunga', 'gate-l2-stairs-ew': 'Sion cross road stairs, King’s Circle', 'gate-l2-lift-bazaar': 'EEH flyover lift, King’s Circle', 'gate-l3-stairs-sx3': 'Upper Decks stairs, Wadala',
  'gate-l3-lift-w': 'Upper Decks lift, west', 'gate-l3-lift-e': 'Upper Decks lift, east', 'gate-bridge': 'Atal Setu permit gate',
};
const STAIR_NAMES = {
  'stairs-g1-plaza': 'Sion Junction stairs', 'stairs-g1-south': 'Matunga south stairs', 'stairs-12-b': 'EEH stairs', 'stairs-23-sx3': 'Wadala stairs',
  'stairs-u-a': 'Metro, north entrance', 'stairs-u-b': 'Metro, south entrance', 'stairs-u-maint': 'Maintenance shaft', 'ramp-g1-site': 'Wadala site ramp', 'ramp-u-c': 'Mahim Creek service ramp',
};
const DOT = { U: '#7a5c9b', G: '#1c6fb8', L1: '#e8742f', L2: '#d38b00', L3: '#2e8a57' };

export class FullMap {
  constructor(game, sys) {
    this.game = game; this.sys = sys;
    this.level = 'G';
    this.view = { cx: 15, cz: 0, zoom: 1 };
    this.dpr = 1; this.W = 0; this.H = 0;
    this.cache = null; this.cacheKey = ''; this.cachePpm = 0;
    this.pointers = new Map(); this.drag = null;
    this.sideKey = '';
    this.timer = null;
    this._build();
  }

  // ------------------------------------------------------------------------------------------------ DOM
  _build() {
    const el = this.el = document.createElement('div');
    el.id = 'fullmap'; el.className = 'fm'; el.hidden = true;
    const tabs = LEVELS.map((l) => `<button type="button" role="tab" class="fm-tab" data-level="${l}" aria-selected="false" style="--dot:${DOT[l]}"><b>${l}</b><span>${LEVEL_INFO[l].en}</span><i class="fm-you" title="you are here"></i><i class="fm-lit"></i></button>`).join('');
    el.innerHTML = `
      <div class="fm-sheet" role="dialog" aria-modal="true" aria-label="City map" tabindex="-1">
        <header class="fm-head">
          <div class="fm-title"><span class="fm-kicker">municipal notice <i>नक्शा</i></span><h2>GRAHAN <em>light and transit map</em></h2></div>
          <nav class="fm-tabs" role="tablist" aria-label="Levels">${tabs}</nav>
          <button type="button" class="fm-close" aria-label="Close the map"><svg viewBox="0 0 24 24"><path d="M6 6 L18 18 M18 6 L6 18"/></svg><span>Close</span><kbd>M</kbd></button>
        </header>
        <div class="fm-body">
          <div class="fm-map">
            <canvas class="fm-canvas" aria-label="Map of the level"></canvas>
            <div class="fm-tools">
              <button type="button" data-z="in" aria-label="Zoom in">+</button><button type="button" data-z="out" aria-label="Zoom out">&minus;</button>
              <button type="button" data-z="me" aria-label="Centre on me"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="3.2"/><path d="M12 3 V7 M12 17 V21 M3 12 H7 M17 12 H21"/></svg></button>
              <button type="button" data-z="fit" aria-label="Fit the whole sheet"><svg viewBox="0 0 24 24"><path d="M4 9 V4 H9 M15 4 H20 V9 M20 15 V20 H15 M9 20 H4 V15"/></svg></button>
            </div>
            <div class="fm-note" hidden></div>
          </div>
          <aside class="fm-side" aria-label="Map notes"></aside>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.sheet = el.querySelector('.fm-sheet'); this.canvas = el.querySelector('canvas'); this.g = this.canvas.getContext('2d');
    this.side = el.querySelector('.fm-side'); this.note = el.querySelector('.fm-note'); this.mapEl = el.querySelector('.fm-map');
    this.tabEls = [...el.querySelectorAll('.fm-tab')];

    el.querySelector('.fm-close').addEventListener('click', () => this.sys.close());
    for (const t of this.tabEls) t.addEventListener('click', () => this.setLevel(t.dataset.level));
    el.querySelector('.fm-tools').addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      const z = b.dataset.z;
      if (z === 'in') this.zoomBy(1.35); else if (z === 'out') this.zoomBy(1 / 1.35); else if (z === 'me') this.centreOnMe(); else this.fit();
    });
    this.side.addEventListener('click', (e) => {
      const p = e.target.closest('[data-place]'); if (!p) return;
      const pl = PLACES.find((q) => q.id === p.dataset.place); if (!pl) return;
      this.setLevel(pl.level, true); this.view.cx = pl.x; this.view.cz = pl.z; this.view.zoom = Math.max(this.view.zoom, 2.2); this.draw();
    });
    // pointers: drag to pan, two fingers to pinch, wheel to zoom
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture?.(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 2) { const [a, b] = [...this.pointers.values()]; this.drag = { pinch: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.view.zoom }; }
    });
    c.addEventListener('pointermove', (e) => {
      const p = this.pointers.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      if (this.pointers.size === 1) { this.view.cx -= dx / this.view.zoom; this.view.cz -= dy / this.view.zoom; this._clampView(); this.draw(); }
      else if (this.pointers.size === 2 && this.drag?.pinch) {
        const [a, b] = [...this.pointers.values()];
        this.view.zoom = clamp(this.drag.zoom * Math.hypot(a.x - b.x, a.y - b.y) / this.drag.pinch, this._minZoom(), 6); this.draw();
      }
    });
    const up = (e) => { this.pointers.delete(e.pointerId); if (this.pointers.size < 2) this.drag = null; };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up); c.addEventListener('lostpointercapture', up);
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect(), mx = e.clientX - r.left - r.width / 2, my = e.clientY - r.top - r.height / 2;
      const k = Math.exp(-e.deltaY * 0.0016), z0 = this.view.zoom, z1 = clamp(z0 * k, this._minZoom(), 6);
      this.view.cx += mx / z0 - mx / z1; this.view.cz += my / z0 - my / z1; this.view.zoom = z1; this._clampView(); this.draw();
    }, { passive: false });
    new ResizeObserver(() => { if (!this.el.hidden) { this._fitCanvas(); this.draw(); } }).observe(this.mapEl);
    window.addEventListener('resize', () => { if (!this.el.hidden) { this._fitCanvas(); this.draw(); } });
  }

  // ------------------------------------------------------------------------------------------------ open / close / state
  open(level) {
    this.level = LEVELS.includes(level) ? level : 'G';
    this.el.hidden = false;
    this._fitCanvas();
    this.fit(false);
    this._tabs(); this._sideNow(true); this.draw();
    clearInterval(this.timer); this.timer = setInterval(() => { if (!this.el.hidden) { this.draw(); this._sideNow(); } }, 160);
    setTimeout(() => { if (!this.el.hidden) (this.el.querySelector(`.fm-tab[data-level="${this.level}"]`) ?? this.sheet).focus({ preventScroll: true }); }, 30);
  }

  close() {
    clearInterval(this.timer); this.timer = null;
    this.el.hidden = true; this.pointers.clear(); this.drag = null;
  }

  setLevel(l, keepView = false) {
    if (!LEVELS.includes(l)) return;
    this.level = l; this._tabs(); this._sideNow(true);
    if (!keepView) this.fit(false);
    this.draw();
  }

  setView(o = {}) { Object.assign(this.view, o); this._clampView(); this.draw(); }

  _tabs() {
    const pl = this.game.player.level;
    const I = this.game.world.sunShafts?.intensity ?? 0;
    for (const t of this.tabEls) {
      const l = t.dataset.level, on = l === this.level;
      t.setAttribute('aria-selected', String(on)); t.classList.toggle('on', on); t.classList.toggle('here', l === pl);
      const n = I > 0.05 ? this.game.world.sunShafts.filter((s) => s.level === l).length : 0;
      const lit = t.querySelector('.fm-lit'); lit.textContent = n ? `${n}` : ''; lit.hidden = !n;
    }
  }

  _fitCanvas() {
    const r = this.mapEl.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = Math.max(60, Math.round(r.width)), H = Math.max(60, Math.round(r.height));
    if (W === this.W && H === this.H && dpr === this.dpr) return;
    this.W = W; this.H = H; this.dpr = dpr;
    this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr);
    this.canvas.style.width = W + 'px'; this.canvas.style.height = H + 'px';
  }

  _minZoom() { return Math.min(this.W / (BOUNDS.x1 - BOUNDS.x0), this.H / (BOUNDS.z1 - BOUNDS.z0)) * 0.92; }
  /** The part of the sheet this level occupies (the whole slice for the street, a smaller patch for the rest). */
  extent(level) {
    this._ext ??= {};
    if (this._ext[level]) return this._ext[level];
    let e;
    if (level === 'G') e = { x0: -178, z0: -182, x1: 212, z1: 188 };
    else {
      const D = levelData(level);
      let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
      for (const w of D.walk) { x0 = Math.min(x0, w.x0); z0 = Math.min(z0, w.z0); x1 = Math.max(x1, w.x1); z1 = Math.max(z1, w.z1); }
      for (const l of linksAt(level)) { x0 = Math.min(x0, l.x0); z0 = Math.min(z0, l.z0); x1 = Math.max(x1, l.x1); z1 = Math.max(z1, l.z1); }
      const m = 26; e = { x0: x0 - m, z0: z0 - m, x1: x1 + m, z1: z1 + m };
    }
    return (this._ext[level] = e);
  }
  fit(redraw = true) {
    const e = this.extent(this.level), W = this.W || 800, H = this.H || 600;
    this.view.zoom = clamp(Math.min(W / (e.x1 - e.x0), H / (e.z1 - e.z0)), this._minZoom(), 6);
    this.view.cx = (e.x0 + e.x1) / 2; this.view.cz = (e.z0 + e.z1) / 2;
    this._clampView();
    if (redraw) this.draw();
  }
  zoomBy(k) { this.view.zoom = clamp(this.view.zoom * k, this._minZoom(), 6); this._clampView(); this.draw(); }
  centreOnMe(redraw = true) {
    const p = this.game.player; this.view.cx = p.pos.x; this.view.cz = p.pos.z; this.view.zoom = Math.max(this.view.zoom, 2.4);
    if (this.level !== p.level) { this.level = p.level; this._tabs(); this._sideNow(true); }
    this._clampView(); if (redraw) this.draw();
  }
  _clampView() {
    const v = this.view, hw = this.W / 2 / v.zoom, hh = this.H / 2 / v.zoom;
    const spanX = BOUNDS.x1 - BOUNDS.x0, spanZ = BOUNDS.z1 - BOUNDS.z0;
    v.cx = hw * 2 >= spanX ? (BOUNDS.x0 + BOUNDS.x1) / 2 : clamp(v.cx, BOUNDS.x0 + hw - 20, BOUNDS.x1 - hw + 20);
    v.cz = hh * 2 >= spanZ ? (BOUNDS.z0 + BOUNDS.z1) / 2 : clamp(v.cz, BOUNDS.z0 + hh - 20, BOUNDS.z1 - hh + 20);
  }

  key(e) {
    const idx = LEVELS.indexOf(this.level);
    if (/^Digit[1-5]$/.test(e.code) || /^Numpad[1-5]$/.test(e.code)) { this.setLevel(LEVELS[Number(e.code.slice(-1)) - 1]); return true; }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { this.setLevel(LEVELS[Math.min(LEVELS.length - 1, idx + 1)]); return true; }
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { this.setLevel(LEVELS[Math.max(0, idx - 1)]); return true; }
    if (e.code === 'ArrowUp' || e.code === 'KeyW') { this.setLevel(LEVELS[Math.min(LEVELS.length - 1, idx + 1)]); return true; }
    if (e.code === 'ArrowDown' || e.code === 'KeyS') { this.setLevel(LEVELS[Math.max(0, idx - 1)]); return true; }
    if (e.code === 'Equal' || e.code === 'NumpadAdd') { this.zoomBy(1.3); return true; }
    if (e.code === 'Minus' || e.code === 'NumpadSubtract') { this.zoomBy(1 / 1.3); return true; }
    if (e.code === 'KeyC' || e.code === 'Home') { this.centreOnMe(); return true; }
    if (e.code === 'KeyF') { this.fit(); return true; }
    return false;
  }

  snapshot() {
    return { level: this.level, zoom: Math.round(this.view.zoom * 100) / 100, cx: Math.round(this.view.cx), cz: Math.round(this.view.cz), size: [this.W, this.H], cacheBuilds: this.cacheBuilds ?? 0, sections: [...this.side.querySelectorAll('h3')].map((h) => h.textContent) };
  }

  // ------------------------------------------------------------------------------------------------ the static sheet
  _ensureCache() {
    const ppm = clamp(this.view.zoom * this.dpr * 1.1, 2, 4);
    const key = this.level;
    if (this.cache && this.cacheKey === key && this.cachePpm >= ppm * 0.74 && this.cachePpm <= ppm * 1.6) return;
    const W = Math.ceil((BOUNDS.x1 - BOUNDS.x0) * ppm), H = Math.ceil((BOUNDS.z1 - BOUNDS.z0) * ppm);
    if (!this.cache) this.cache = document.createElement('canvas');
    this.cache.width = W; this.cache.height = H;
    const g = this.cache.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = this.level === 'U' ? '#dfe6ea' : PAPER.sea; g.fillRect(0, 0, W, H);
    g.setTransform(ppm, 0, 0, ppm, -BOUNDS.x0 * ppm, -BOUNDS.z0 * ppm);
    const px = 1 / ppm;
    if (this.level !== 'G') this._ghost(g, px);
    // the sea's own texture: a few soft wave dashes
    if (this.level === 'G') this._waves(g, px);
    paintLevel(g, this.level, PAPER, BOUNDS, px);
    this.cacheKey = key; this.cachePpm = ppm; this.cacheBuilds = (this.cacheBuilds ?? 0) + 1;
  }

  _ghost(g, px) {
    const M = MAP, L = M.land;
    g.fillStyle = this.level === 'U' ? '#eef2f4' : '#f1f5f7'; g.fillRect(L.minX, L.minZ, L.maxX - L.minX, L.maxZ - L.minZ);
    g.fillStyle = 'rgba(255,255,255,.9)';
    for (const s of M.streets) { if (s.axis === 'z') g.fillRect(s.c - s.w / 2, s.from, s.w, s.to - s.from); else g.fillRect(s.from, s.c - s.w / 2, s.to - s.from, s.w); }
    g.fillStyle = 'rgba(150,165,175,.16)';
    for (const t of levelData('G').solids) g.fillRect(t.x0, t.z0, t.x1 - t.x0, t.z1 - t.z0);
    if (this.level !== 'U') for (const d of M.decks) if (d.level === 'G') { g.fillStyle = 'rgba(150,165,175,.2)'; g.fillRect(d.x0, d.z0, d.x1 - d.x0, d.z1 - d.z0); }
    g.strokeStyle = 'rgba(120,140,155,.35)'; g.lineWidth = 1.2 * px; g.strokeRect(L.minX, L.minZ, L.maxX - L.minX, L.maxZ - L.minZ);
  }

  _waves(g, px) {
    g.save(); g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 1.1 * px; g.lineCap = 'round';
    let s = 7; const r = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
    const L = MAP.land;
    for (let i = 0; i < 220; i++) {
      const x = BOUNDS.x0 + r() * (BOUNDS.x1 - BOUNDS.x0), z = BOUNDS.z0 + r() * (BOUNDS.z1 - BOUNDS.z0);
      if (x > L.minX - 6 && x < L.maxX + 6 && z > L.minZ - 6 && z < L.maxZ + 6) continue;
      if (Math.abs(z - MAP.rail.zc) < 14 || (z > -48 && z < -22 && x > 150)) continue;
      g.beginPath(); g.moveTo(x - 4, z); g.quadraticCurveTo(x - 2, z - 1.6, x, z); g.quadraticCurveTo(x + 2, z + 1.6, x + 4, z); g.stroke();
    }
    g.restore();
  }

  // ------------------------------------------------------------------------------------------------ the live sheet
  draw() {
    if (this.el.hidden || !this.W) return;
    const g = this.g, dpr = this.dpr, W = this.W, H = this.H, v = this.view, z = v.zoom;
    this._ensureCache();
    const sys = this.sys, game = this.game, p = game.player, now = performance.now() / 1000;
    this._boxes = [];
    const data = sys.collect(this.level);
    const X = (wx) => (wx - v.cx) * z + W / 2, Y = (wz) => (wz - v.cz) * z + H / 2;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = PAPER.bg; g.fillRect(0, 0, W, H);
    // the sheet
    g.save();
    g.translate(W / 2, H / 2); g.scale(z, z); g.translate(-v.cx, -v.cz);
    g.imageSmoothingEnabled = true;
    g.drawImage(this.cache, BOUNDS.x0, BOUNDS.z0, BOUNDS.x1 - BOUNDS.x0, BOUNDS.z1 - BOUNDS.z0);
    const px = 1 / z;
    // sunlight (glows, with the later ring when it is dark)
    this._sun(g, data, px, now);
    this._trains(g, data, px);
    g.restore();

    // ---- upright layers
    this._rail(g, X, Y, z, data);                                             // the line first: its plates are in the way of the names
    this._labels(g, X, Y, z, data);
    this._links(g, X, Y, z);
    this._lifts(g, X, Y, z, data);
    this._gates(g, X, Y, z, p);
    this._marks(g, X, Y, z, data, now);
    this._compass(g, W, H, z);
  }

  _sun(g, data, px, t) {
    g.save();
    for (const s of data.sun) {
      if (s.kind === 'lamp') {                                       // a solar lamp: a small lantern with a pool of light, no rays
        const live = Math.min(1, s.i * 1.1), gr = g.createRadialGradient(s.x, s.z, 0, s.x, s.z, 7.5);
        gr.addColorStop(0, `rgba(255,208,90,${(0.8 * live).toFixed(3)})`); gr.addColorStop(1, 'rgba(255,190,50,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(s.x, s.z, 7.5, 0, TAU); g.fill();
        g.fillStyle = '#ffb000'; g.strokeStyle = '#8a5a00'; g.lineWidth = 1 * px; g.beginPath(); g.arc(s.x, s.z, 1.7, 0, TAU); g.fill(); g.stroke();
        continue;
      }
      const live = s.i, r = s.r * 1.55;
      const gr = g.createRadialGradient(s.x, s.z, 0, s.x, s.z, r * 2.1);
      gr.addColorStop(0, `rgba(255,214,70,${(0.85 * live).toFixed(3)})`); gr.addColorStop(0.5, `rgba(255,190,50,${(0.45 * live).toFixed(3)})`); gr.addColorStop(1, 'rgba(255,190,50,0)');
      g.fillStyle = gr; g.beginPath(); g.arc(s.x, s.z, r * 2.1, 0, TAU); g.fill();
      g.strokeStyle = `rgba(214,140,0,${(0.9 * live).toFixed(3)})`; g.lineWidth = 1.5 * px; g.beginPath(); g.arc(s.x, s.z, r, 0, TAU); g.stroke();
      // a sun glyph: disc and short rays, rays turn slowly
      const k = Math.max(2.4, r * 0.55);
      g.fillStyle = '#ffb000'; g.beginPath(); g.arc(s.x, s.z, k * 0.55, 0, TAU); g.fill();
      g.strokeStyle = '#e59a00'; g.lineWidth = 1.4 * px; g.beginPath();
      for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + t * 0.1; g.moveTo(s.x + Math.cos(a) * k * 0.85, s.z + Math.sin(a) * k * 0.85); g.lineTo(s.x + Math.cos(a) * k * 1.3, s.z + Math.sin(a) * k * 1.3); }
      g.stroke();
    }
    if (data.later) {
      g.setLineDash([3 * px, 3 * px]); g.strokeStyle = 'rgba(214,140,0,.75)'; g.lineWidth = 1.4 * px; g.fillStyle = 'rgba(255,200,70,.12)';
      for (const s of data.later) { g.beginPath(); g.arc(s.x, s.z, s.r * 1.55, 0, TAU); g.fill(); g.stroke(); }
      g.setLineDash([]);
    }
    g.restore();
  }

  _trains(g, data, px) {
    for (const t of data.trains) {
      const len = RAIL.trainLen, half = len / 2;
      g.fillStyle = '#ffcf33'; g.strokeStyle = '#6a4a00'; g.lineWidth = 1 * px;
      g.beginPath(); g.rect(t.x - half, t.z - 1.9, len, 3.8); g.fill(); g.stroke();
      g.strokeStyle = 'rgba(106,74,0,.6)'; g.beginPath(); for (let k = 1; k < 4; k++) { const x = t.x - half + k * len / 4; g.moveTo(x, t.z - 1.9); g.lineTo(x, t.z + 1.9); } g.stroke();
    }
  }

  _text(g, txt, x, y, o = {}) {
    g.font = o.font; g.textAlign = o.align ?? 'center'; g.textBaseline = o.base ?? 'middle';
    if (o.halo !== false) { g.lineJoin = 'round'; g.lineWidth = o.haloW ?? 3.2; g.strokeStyle = o.haloColor ?? 'rgba(255,255,255,.92)'; g.strokeText(txt, x, y); }
    g.fillStyle = o.color ?? '#1b2a36'; g.fillText(txt, x, y);
  }

  _labels(g, X, Y, z, data) {
    const disc = this.sys.discovered, lv = this.level;
    const small = this.W < 700;
    const S = clamp(z, 0.6, 3) ** 0.45 * (small ? 0.9 : 1);                   // text grows a little with the zoom
    const order = [...PLACES].sort((a, b) => (b.big ? 2 : 0) - (a.big ? 2 : 0));
    const UP = [[0, 0], [0, -1], [0, 1], [0, -2], [0, 2], [1, 0], [-1, 0]];     // the label may slide up or down by whole label heights, or aside
    for (const pl of order) {
      if (pl.kind === 'station') continue;                                    // drawn with the line
      if (!disc.has(pl.id)) continue;
      const own = pl.level === lv;
      const ghostOk = pl.kind === 'water' || (pl.kind === 'district' && pl.level === 'G');
      if (!own && !ghostOk) continue;
      if (!own && lv === 'U' && pl.kind !== 'water') continue;
      const x0 = X(pl.x), y0 = Y(pl.z);
      if (x0 < -120 || y0 < -40 || x0 > this.W + 120 || y0 > this.H + 40) continue;
      g.save(); g.globalAlpha = own ? 1 : 0.42;
      if (pl.kind === 'water') {
        g.font = `italic ${(pl.big ? 17 : 13) * S}px ${SERIF}`;
        const w = g.measureText(pl.en).width, h = 30 * S;
        const pos = this._spot(x0, y0 + 3 * S, w, h, UP, true);
        if (pos) {
          const [x, y] = pos; y;
          this._text(g, pl.en, x, pos[1] - 4 * S, { font: g.font, color: '#4d7a98', halo: false });
          g.font = `${11 * S}px ${DEVA}`; this._text(g, pl.dev, x, pos[1] + 13 * S, { font: g.font, color: '#4d7a98', halo: false });
          if (pl.sub && z > 0.9) { g.font = `italic ${10 * S}px ${SERIF}`; this._text(g, pl.sub, x, pos[1] - 19 * S, { font: g.font, color: '#6d92aa', halo: false }); }
        }
      } else if (pl.kind === 'story') {
        if (z >= 1.15) {
          g.font = `600 ${10.5 * S}px ${SANS}`;
          const tw = g.measureText(pl.en).width + 16, h = (z > 1.6 && pl.dev ? 32 : 22) * S;
          const pos = this._spot(x0, y0 + 6 * S, tw, h, [[0, 0], [0, 1], [0, -1], [1, 0], [-1, 0]], true);
          if (pos) {
            const [x, y] = pos;
            g.fillStyle = '#c2381f'; g.beginPath(); g.arc(x0, y0 - 3, 3.4, 0, TAU); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 1.4; g.stroke();
            this._text(g, pl.en, x, y - (z > 1.6 && pl.dev ? 4 * S : 0), { font: g.font, color: '#2a1d1a' });
            if (z > 1.6 && pl.dev) { g.font = `${9.5 * S}px ${DEVA}`; this._text(g, pl.dev, x, y + 10 * S, { font: g.font, color: 'rgba(42,29,26,.75)' }); }
          }
        }
      } else {
        // districts and roads: bold caps, Devanagari beneath
        const sz = (pl.big ? 14 : 11.5) * S;
        g.font = `700 ${sz}px ${SANS}`;
        const name = pl.en.toUpperCase(), w = g.measureText(name).width + 6, h = sz * (pl.sub && z > 1.1 ? 3.3 : 2.3);
        const pos = this._spot(x0, y0, w, h, UP, true);
        if (pos) {
          const [x, y] = pos;
          this._text(g, name, x, y - sz * 0.35, { font: g.font, color: pl.kind === 'bridge' ? '#1d4f9c' : pl.kind === 'road' ? '#9a5b00' : '#2a3a47', haloW: 4 });
          g.font = `${sz * 0.84}px ${DEVA}`; this._text(g, pl.dev, x, y + sz * 0.72, { font: g.font, color: 'rgba(42,58,71,.8)', haloW: 3.4 });
          if (pl.sub && z > 1.1) { g.font = `italic ${sz * 0.75}px ${SERIF}`; this._text(g, pl.sub, x, y - sz * 1.3, { font: g.font, color: 'rgba(42,58,71,.65)', haloW: 3 }); }
        }
      }
      g.restore();
    }
    // underground: name the tunnels and the metro (never the places the story has to reveal)
    if (lv === 'U' && z > 1.5) {
      const SAFE = { 'u-concourse-n': 'Metro concourse', 'u-hall': 'Metro platforms', 'u-concourse-s': 'Metro south concourse', 'u-t1': 'Service tunnel, west', 'u-t2': 'Service tunnel, south', 'u-t3': 'Service tunnel, ring' };
      const S2 = clamp(z, 0.6, 3) ** 0.4;
      for (const f of levelData('U').walk) {
        const nm = SAFE[f.id]; if (!nm) continue;
        const cx = X((f.x0 + f.x1) / 2), cy = Y((f.z0 + f.z1) / 2);
        const vertical = f.z1 - f.z0 > f.x1 - f.x0;
        g.save(); g.font = `italic 500 ${10.5 * S2}px ${SERIF}`; g.translate(cx, cy);
        if (vertical && f.id !== 'u-hall' && !f.id.startsWith('u-concourse')) g.rotate(-Math.PI / 2);
        this._text(g, nm, 0, 0, { font: g.font, color: 'rgba(27,42,54,.72)', haloW: 3 }); g.restore();
      }
    }
  }

  _links(g, X, Y, z) {
    if (z < 0.95) return;
    const lv = this.level, S = clamp(z, 0.6, 3) ** 0.4;
    for (const l of linksAt(lv)) {
      if (l.kind === 'lift') continue;
      const x = X((l.x0 + l.x1) / 2), y = Y((l.z0 + l.z1) / 2);
      if (x < -40 || y < -20 || x > this.W + 40 || y > this.H + 20) continue;
      const up = l.lo === lv, other = up ? l.hi : l.lo;
      const txt = `${up ? '\u2191' : '\u2193'}${other}`;
      g.font = `600 ${9.5 * S}px ${SANS}`;
      const w = g.measureText(txt).width + 10, h = 14;
      const [cx, cy] = this._spot(x, y + 14, w, h);
      g.fillStyle = 'rgba(196,82,26,.95)'; this._pill(g, cx - w / 2, cy - h / 2, w, h, 7);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, cx, cy + 0.5);
      if (z > 1.9 && STAIR_NAMES[l.id]) { g.font = `500 ${9 * S}px ${SANS}`; const nw = g.measureText(STAIR_NAMES[l.id]).width + 6; const [nx, ny] = this._spot(cx, cy + 14, nw, 12); this._text(g, STAIR_NAMES[l.id], nx, ny, { font: g.font, color: '#6b2a0c' }); }
    }
  }

  _rail(g, X, Y, z, data) {
    if (this.level !== 'G') return;
    const S = clamp(z, 0.6, 3) ** 0.45, transit = this.game.transit, small = z < 1.25;
    RAIL.stations.forEach((st, i) => {
      const x = X(st.x), y = Y(RAIL.zc), up = i % 2 === 0 ? -1 : 1;                  // plates alternate above and below the line
      g.fillStyle = '#fff'; g.strokeStyle = '#1c6fb8'; g.lineWidth = 3 * Math.min(S, 1.3);
      g.beginPath(); g.arc(x, y, 7 * S, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#1c6fb8'; g.beginPath(); g.arc(x, y, 2.6 * S, 0, TAU); g.fill();
      g.font = `700 ${(small ? 9.5 : 11) * S}px ${SANS}`;
      const txt = st.name.toUpperCase(), tw = Math.max(g.measureText(txt).width, 40) + 14, ph = 17 * S, py = y + (up < 0 ? -(14 * S + ph) : 14 * S);
      g.fillStyle = '#1c6fb8'; g.beginPath(); g.moveTo(x, y + up * 7 * S); g.lineTo(x, up < 0 ? py + ph : py); g.strokeStyle = '#1c6fb8'; g.lineWidth = 2; g.stroke();
      this._boxes.push({ x: x - tw / 2, y: up < 0 ? py - 18 * S : py, w: tw, h: ph + 18 * S }, { x: x - 10, y: y - 10, w: 20, h: 20 });
      g.fillStyle = '#1c6fb8'; this._pill(g, x - tw / 2, py, tw, ph, 4);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, x, py + ph / 2 + 0.5);
      g.font = `${(small ? 9 : 10) * S}px ${DEVA}`; this._text(g, st.dev, x, up < 0 ? py - 8 * S : py + ph + 9 * S, { font: g.font, color: '#1c4f82' });
      if (z > 2.3 && transit) {
        const ts = transit.stations.find((q) => q.id === st.id), f = (v) => (v == null || !isFinite(v) ? '-' : v < 5 ? 'now' : v < 60 ? Math.round(v) + 's' : `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`);
        if (ts) { g.font = `500 ${9.5 * S}px ${SANS}`; this._text(g, `\u2192 ${f(ts.next?.east?.eta ?? ts.eta?.east)}   \u2190 ${f(ts.next?.west?.eta ?? ts.eta?.west)}`, x, up < 0 ? y + 22 * S : y - 22 * S, { font: g.font, color: '#1c4f82' }); }
      }
    });
    // the line's own name along the track
    if (z > 0.8) { this._boxes.push({ x: X(15) - 80, y: Y(RAIL.zc) + 8, w: 160, h: 18 }); g.font = `600 ${10 * S}px ${SANS}`; this._text(g, 'HARBOUR LINE \u00b7 \u0939\u093e\u0930\u094d\u092c\u0930 \u0932\u093e\u0907\u0928', X(15), Y(RAIL.zc) + 17 * S, { font: g.font, color: '#1c6fb8', haloW: 3 }); }
    void data;
  }

  _lifts(g, X, Y, z, data) {
    const S = clamp(z, 0.6, 3) ** 0.4;
    for (const l of data.lifts) {
      const x = X(l.center[0]), y = Y(l.center[1]);
      if (x < -40 || y < -20 || x > this.W + 40 || y > this.H + 20) continue;
      const pct = l.charge / l.capacity, col = pct > 0.5 ? '#12906a' : pct > 0.2 ? '#d38b00' : '#d1362b';
      const r = Math.max(7, (CAR_R[l.cls] ?? 3.4) * 1.15 * z);      // the ring grows with the car: solo, family, public, freight
      g.lineWidth = 3.2; g.strokeStyle = 'rgba(0,0,0,.15)'; g.beginPath(); g.arc(x, y, r + 3, 0, TAU); g.stroke();
      g.strokeStyle = col; g.beginPath(); g.arc(x, y, r + 3, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(0.03, pct)); g.stroke();
      if (z > 0.8) {                                                // the seats, inside the ring
        g.font = `700 ${(l.seats > 9 ? 8 : 9.5) * S}px ${SANS}`; g.fillStyle = l.seats >= 12 && l.crowd >= l.seats ? '#d1362b' : '#00605c'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(l.seats), x, y + 0.5);
      }
      if (z > 1.9) {
        const lvs = l.stops.map((s) => s.level).filter((v, i, a) => a.indexOf(v) === i), txt = `${lvs.join('⇄')}  ${l.chargePct}%  ·${l.seats}p${l.seats >= 12 && l.crowd >= l.seats ? ' FULL' : ''}`;
        g.font = `600 ${9.5 * S}px ${SANS}`; const w = g.measureText(txt).width + 12, h = 15 * S;
        const [cx, cy] = this._spot(x, y - r - 14 * S, w, h);
        g.fillStyle = 'rgba(0,92,88,.95)'; this._pill(g, cx - w / 2, cy - h / 2, w, h, 7);
        g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, cx, cy + 0.5);
      }
    }
  }

  _gates(g, X, Y, z, p) {
    const S = clamp(z, 0.6, 3) ** 0.4;
    for (const gt of gatesAt(this.level)) {
      const x = X(gt.x), y = Y(gt.z);
      if (x < -30 || y < -20 || x > this.W + 30 || y > this.H + 20) continue;
      const permit = !!gt.permit, ok = permit ? !!this.game.flags.bridgePermit : p.rays >= gt.min, txt = permit ? 'PERMIT' : `${gt.min} rays`;
      g.font = `700 ${9.5 * S}px ${SANS}`; const w = g.measureText(txt).width + 12, h = 15 * S;
      const [cx, cy] = this._spot(x, y - 16 * S, w, h);
      g.strokeStyle = ok ? '#2e8a57' : '#d1362b'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, y - 2); g.lineTo(cx, cy + h / 2); g.stroke();
      g.fillStyle = ok ? '#2e8a57' : '#d1362b'; this._pill(g, cx - w / 2, cy - h / 2, w, h, 4);
      g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(txt, cx, cy + 0.5);
    }
  }

  _marks(g, X, Y, z, data, now) {
    const game = this.game, p = game.player, S = clamp(z, 0.6, 3) ** 0.4;
    // fragments you found
    for (const m of data.fragments) { const x = X(m.x), y = Y(m.z); g.fillStyle = '#fff'; g.strokeStyle = '#1c6fb8'; g.lineWidth = 1.4; g.beginPath(); g.rect(x - 4, y - 5, 8, 10); g.fill(); g.stroke(); g.beginPath(); g.moveTo(x - 2, y - 1.5); g.lineTo(x + 2, y - 1.5); g.moveTo(x - 2, y + 1.5); g.lineTo(x + 2, y + 1.5); g.stroke(); }
    // the last lead to Setu
    const lead = data.lead;
    if (lead && lead.level === this.level) {
      const x = X(lead.x), y = Y(lead.z), r = 14 * S, pulse = 0.5 + 0.5 * Math.sin(now * 2.2);
      g.save(); g.setLineDash([4, 4]); g.strokeStyle = `rgba(150,100,0,${0.55 + 0.25 * pulse})`; g.lineWidth = 1.8; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); g.setLineDash([]);
      g.font = `italic 700 ${17 * S}px ${SERIF}`; this._text(g, '?', x, y + 1, { font: g.font, color: '#8a5a00', haloW: 3 });
      g.font = `${13 * S}px ${HAND}`; this._text(g, 'Setu was seen near here', x, y + r + 12 * S, { font: g.font, color: '#8a5a00', haloW: 3 });
      g.restore();
    }
    // where you are going
    for (const m of data.objectives) {
      if (m.level !== this.level) continue;
      const x = X(m.x), y = Y(m.z), s = 7.5 * S;
      g.fillStyle = m.primary ? '#ffcf33' : '#fff0b8'; g.strokeStyle = '#4a3400'; g.lineWidth = 1.8;
      g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s, y); g.lineTo(x, y + s); g.lineTo(x - s, y); g.closePath(); g.fill(); g.stroke();
      if (z > 1.3) { g.font = `${12 * S}px ${HAND}`; this._text(g, m.label, x, y - s - 8 * S, { font: g.font, color: '#4a3400', haloW: 3 }); }
    }
    // the people with you
    for (const m of data.party) {
      if (m.level !== this.level) continue;
      const x = X(m.x), y = Y(m.z);
      g.fillStyle = m.color; g.strokeStyle = '#1b2a36'; g.lineWidth = 1.8; g.beginPath(); g.arc(x, y, 7, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#1b2a36'; g.font = `700 9px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(m.tag, x, y + 0.5);
    }
    // you
    const px = X(p.pos.x), py = Y(p.pos.z), here = this.level === p.level;
    const yaw = this.sys.viewYaw();
    if (here) {
      const pulse = 0.5 + 0.5 * Math.sin(now * 3.2);
      g.save();
      g.fillStyle = `rgba(209,54,43,${0.12 + 0.12 * pulse})`; g.beginPath(); g.arc(px, py, 22 * S + 4 * pulse, 0, TAU); g.fill();
      // the way you face
      g.translate(px, py); g.rotate(-yaw);
      g.fillStyle = 'rgba(209,54,43,.18)'; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 30 * S, -Math.PI / 2 - 0.62, -Math.PI / 2 + 0.62); g.closePath(); g.fill();
      g.fillStyle = '#d1362b'; g.strokeStyle = '#fff'; g.lineWidth = 2.4; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(0, -11 * S); g.lineTo(8 * S, 8 * S); g.lineTo(0, 4 * S); g.lineTo(-8 * S, 8 * S); g.closePath(); g.stroke(); g.fill();
      g.restore();
      // the scrawled callout: in the first free spot around the pin
      const bw = 128 * S, bh = 38 * S;
      let spot = null, side = 1;
      for (const [dx, dy] of [[1, -1], [-1, -1], [1, 1], [-1, 1], [0, -1.7], [0, 1.7], [2, 0], [-2, 0], [1.4, -2], [-1.4, -2]]) {
        side = dx < 0 ? -1 : 1;
        spot = this._spot(px + dx * (bw / 2 + 14 * S), py + dy * (bh / 2 + 22 * S), bw, bh, [[0, 0]], true);
        if (spot) break;
      }
      if (!spot) { side = 1; spot = [px + bw / 2 + 24 * S, py - 40 * S]; }
      const [tx, ty] = spot;
      g.save(); g.strokeStyle = '#d1362b'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(px + Math.sign(tx - px || 1) * 9, py + Math.sign(ty - py || -1) * 9);
      g.quadraticCurveTo((px + tx) / 2 + 6, (py + ty) / 2 - 8, tx - Math.sign(tx - px || 1) * bw * 0.3, ty + bh * 0.2); g.stroke();
      g.save(); g.translate(tx, ty - 8 * S); g.rotate(-0.05);
      g.font = `${17 * S}px ${HAND}`; this._text(g, 'you are here', 0, 0, { font: g.font, color: '#d1362b', align: 'center', haloW: 4 });
      g.font = `${12 * S}px ${DEVA}`; this._text(g, 'आप यहाँ हैं', 0, 16 * S, { font: g.font, color: '#d1362b', align: 'center', haloW: 3.4 });
      g.restore(); g.restore();
      this.note.hidden = true;
    } else {
      this.note.hidden = false;
      const nm = LEVEL_INFO[p.level];
      const txt = `You are on ${p.level}, ${nm.en}`;
      if (this.note.textContent !== txt) this.note.textContent = txt;
      // a ghost of where you are, straight above or below
      g.save(); g.globalAlpha = 0.5; g.fillStyle = '#d1362b'; g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.arc(px, py, 6, 0, TAU); g.fill(); g.stroke(); g.restore();
      g.font = `${12 * S}px ${HAND}`; this._text(g, `you: ${p.level} ${levelIndex(p.level) > levelIndex(this.level) ? '↑' : '↓'}`, px, py - 13, { font: g.font, color: '#d1362b', haloW: 3 });
    }
  }

  _compass(g, W, H, z) {
    // the corner furniture: a compass rose, a scale bar and the sheet's own note
    const x = W - 38, y = H - 44;
    g.save(); g.translate(x, y);
    g.strokeStyle = '#1b2a36'; g.fillStyle = '#1b2a36'; g.lineWidth = 1.4;
    g.beginPath(); g.arc(0, 0, 15, 0, TAU); g.stroke();
    g.beginPath(); g.moveTo(0, -20); g.lineTo(4.5, 0); g.lineTo(0, 4); g.lineTo(-4.5, 0); g.closePath(); g.fillStyle = '#d1362b'; g.fill();
    g.beginPath(); g.moveTo(0, 20); g.lineTo(3.5, 0); g.lineTo(-3.5, 0); g.closePath(); g.fillStyle = '#1b2a36'; g.fill();
    g.font = `700 10px ${SANS}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#1b2a36';
    g.fillText('N', 0, -29);
    g.restore();
    const m = z * 100;                                                       // a 100 m bar
    const bx = 14, by = H - 18;
    g.strokeStyle = '#1b2a36'; g.lineWidth = 2; g.beginPath(); g.moveTo(bx, by - 4); g.lineTo(bx, by); g.lineTo(bx + m, by); g.lineTo(bx + m, by - 4); g.stroke();
    g.font = `600 10px ${SANS}`; g.fillStyle = '#1b2a36'; g.textAlign = 'left'; g.textBaseline = 'bottom';
    this._text(g, '100 m', bx, by - 6, { font: g.font, haloW: 3, align: 'left' });
    if (H > 520) { g.font = `13px ${HAND}`; this._text(g, 'a slice of Mumbai, 2049: not to scale', bx, by - 22, { font: g.font, color: 'rgba(27,42,54,.62)', haloW: 3.5, align: 'left' }); }
  }

  /** A free spot for a w x h chip near (x, y): the first of a few offsets that does not touch a chip already placed. Returns the chip's centre. */
  _spot(x, y, w, h, tries = [[0, 0], [0, -1], [0, 1], [1, 0], [-1, 0], [0, -2], [0, 2], [1, -1], [-1, -1], [1, 1], [-1, 1]], strict = false) {
    const boxes = this._boxes;
    for (const [i, j] of tries) {
      const cx = x + i * (w + 4), cy = y + j * (h + 3);
      const bx = cx - w / 2, by = cy - h / 2;
      if (boxes.some((r) => bx < r.x + r.w && bx + w > r.x && by < r.y + r.h && by + h > r.y)) continue;
      boxes.push({ x: bx, y: by, w, h }); return [cx, cy];
    }
    if (strict) return null;
    boxes.push({ x: x - w / 2, y: y - h / 2, w, h });
    return [x, y];
  }

  _pill(g, x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.fill();
  }

  // ------------------------------------------------------------------------------------------------ the notes beside the sheet
  _sideNow(force = false) {
    const game = this.game, p = game.player, lv = this.level, info = LEVEL_INFO[lv];
    const world = game.world, I = world.sunShafts?.intensity ?? 0, hour = game.clock?.hour ?? 10;
    const data = this.sys.collect(lv);
    const rays = p.rays;
    const dist = (l) => Math.hypot(l.center[0] - p.pos.x, l.center[1] - p.pos.z);
    const lifts = data.lifts.slice().sort((a, b) => dist(a) - dist(b));
    const T = game.transit;
    const disc = this.sys.discovered;
    const places = PLACES.filter((q) => q.level === lv && q.kind === 'story' && disc.has(q.id));
    const hidden = PLACES.filter((q) => q.level === lv && q.kind === 'story' && !disc.has(q.id)).length;
    const key = JSON.stringify([lv, Math.round(I * 20), Math.floor(hour * 6), rays, lifts.map((l) => [l.id, Math.round(l.charge / 2), l.crowd]), T?.stations?.map((s) => [Math.round((s.next?.east?.eta ?? 999) / 3), Math.round((s.next?.west?.eta ?? 999) / 3)]), places.length, hidden, p.level, data.sun.length, game.flags.bridgePermit]);
    if (!force && key === this.sideKey) return;
    this.sideKey = key;

    const sunIdx = data.sun.length;
    let nearest = '';
    if (lv === p.level && data.sun.length) {
      let b = null, bd = 1e9; for (const s of data.sun) { const d = Math.hypot(s.x - p.pos.x, s.z - p.pos.z); if (d < bd) { bd = d; b = s; } }
      const dx = b.x - p.pos.x, dz = b.z - p.pos.z, ang = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360, name = ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(ang / 45) % 8];
      nearest = `<p class="fm-line">Nearest ${b.kind === 'lamp' ? 'solar lamp' : 'light'} on this level: <b>${Math.round(bd)} m ${name}</b>.</p>`;
    }
    const rise = fmtHour(SUN_HOURS.rise + 0.05), set = fmtHour(SUN_HOURS.set - 0.02), fade = fmtHour(SUN_HOURS.fade);
    const lit = I > 0.05;
    const sunMsg = lv === 'U' ? 'No sky reaches this deep. Take the stairs up to the street.'
      : lit ? `${sunIdx} patch${sunIdx === 1 ? '' : 'es'} of sunlight on this level now${I < 0.95 ? ' (' + Math.round(I * 100) + '%)' : ''}. The light starts to thin at ${fade} and is gone by ${set}.`
        : lv === 'L3' ? `The sun is down. The solar lamps on the Upper Decks keep a little light (${sunIdx} lit). The shafts return about ${rise}; dashed rings show where.`
          : `The sun is down. The shafts return about ${rise}: the dashed rings show where they will stand.`;
    const sunSvg = this._sunStrip(hour);

    let html = `<section class="fm-sec fm-level"><h3>${lv} <i>${esc(info.en)}</i> <span class="dev">${info.dev}</span></h3><p class="fm-line dim">${esc(info.note)}${lv !== p.level ? ` &middot; you are on ${p.level}` : ' &middot; you are on this level'}</p></section>`;
    html += `<section class="fm-sec fm-sun"><h3>Sunlight <span class="dev">धूप</span></h3>${sunSvg}<p class="fm-line">${esc(sunMsg)}</p>${nearest}</section>`;
    if (lv === 'G') {
      const rows = RAIL.stations.map((s) => {
        const ts = T?.stations?.find((q) => q.id === s.id), f = (v) => (v == null || !isFinite(v) ? '-' : v < 5 ? 'now' : v < 60 ? Math.round(v) + 's' : `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, '0')}`);
        return `<li><span class="nm">${esc(s.name)}</span><span class="eta"><i>→</i>${f(ts?.next?.east?.eta ?? ts?.eta?.east)}<i>←</i>${f(ts?.next?.west?.eta ?? ts?.eta?.west)}</span></li>`;
      }).join('');
      const served = T?.inService?.(hour);
      html += `<section class="fm-sec"><h3>Harbour Line <span class="dev">हार्बर लाइन</span></h3><ul class="fm-list fm-rail">${rows}</ul><p class="fm-line dim">${served === false ? 'No trains at this hour.' : 'Next trains: east to Sewri, west to Mahim. Walk in at an open door, or press E.'}</p></section>`;
    }
    if (lifts.length) {
      html += `<section class="fm-sec"><h3>Lifts <span class="dev">लिफ्ट</span></h3><ul class="fm-list fm-lifts">${lifts.map((l) => {
        const col = l.chargePct > 50 ? 'ok' : l.chargePct > 20 ? 'mid' : 'low';
        const floors = l.stops.map((s) => `${s.level}${s.min && s.level !== lv ? `<sup>${s.min}</sup>` : ''}`).filter((v, i, a) => a.indexOf(v) === i).join(' ⇄ ');
        const full = l.seats >= 12 && l.crowd >= l.seats;
        return `<li><span class="nm">${esc(LIFT_NAMES[l.id] ?? l.label ?? l.id)}</span><span class="fl">${floors}</span><span class="cp${full ? ' full' : ''}" title="capsule class and seats">${l.cls} ${l.seats > 1 ? l.seats + ' seats' : '1 seat'}${l.seats >= 12 ? ` · ${l.crowd} in${full ? ', FULL' : ''}` : ''}</span><span class="bar ${col}" title="solar battery"><i style="width:${l.chargePct}%"></i></span><span class="pc">${l.chargePct}%${l.panel === 'shade' ? ' <em>shaded</em>' : ''}</span></li>`;
      }).join('')}</ul><p class="fm-line dim">Batteries charge in sunlight. Small numbers are rays the floor asks for.</p></section>`;
    }
    const gates = gatesAt(lv);
    if (gates.length) {
      html += `<section class="fm-sec"><h3>Gates <span class="dev">द्वार</span></h3><ul class="fm-list fm-gates">${gates.map((gt) => {
        const permit = !!gt.permit, ok = permit ? !!game.flags.bridgePermit : rays >= gt.min;
        return `<li class="${ok ? 'ok' : 'no'}"><span class="nm">${esc(GATE_NAMES[gt.id] ?? gt.id)}</span><span class="th">${permit ? 'permit' : gt.min + ' rays'}</span><span class="st">${ok ? 'open to you' : 'closed to you'}</span></li>`;
      }).join('')}</ul><p class="fm-line dim">You carry ${rays} ray${rays === 1 ? '' : 's'}.</p></section>`;
    }
    html += `<section class="fm-sec"><h3>Places <span class="dev">जगहें</span></h3>${places.length ? `<ul class="fm-list fm-places">${places.map((q) => `<li><button type="button" data-place="${q.id}"><span class="nm">${esc(q.en)}</span><span class="dev">${q.dev}</span></button></li>`).join('')}</ul>` : '<p class="fm-line dim">Nothing marked on this level yet.</p>'}${hidden ? `<p class="fm-line dim">${hidden} more to find here.</p>` : ''}</section>`;
    html += `<section class="fm-sec fm-legend"><h3>Key</h3><ul>
      <li><i class="k-sun"></i>sunlight now</li><li><i class="k-lamp"></i>solar lamp</li><li><i class="k-sunlater"></i>where it returns</li><li><i class="k-stairs"></i>stairs and ramps</li><li><i class="k-lift"></i>lift and its battery</li>
      <li><i class="k-gate"></i>gate and its rays</li><li><i class="k-train"></i>Harbour Line train</li><li><i class="k-you"></i>you</li><li><i class="k-obj"></i>where you are going</li><li><i class="k-lead"></i>last lead to Setu</li><li><i class="k-frag"></i>pages you found</li></ul></section>`;
    this.side.innerHTML = html;
  }

  _sunStrip(hour) {
    const W = 300, H = 56, x0 = 8, x1 = W - 8, h0 = 4, h1 = 22;
    const X = (h) => x0 + (h - h0) / (h1 - h0) * (x1 - x0), Y = (f) => H - 18 - f * 28;
    let d = `M ${X(h0)} ${Y(0)}`;
    for (let h = h0; h <= h1; h += 0.25) d += ` L ${X(h).toFixed(1)} ${Y(sunFactorAt(h)).toFixed(1)}`;
    const now = X(clamp(hour, h0, h1));
    const ticks = [6, 9, 12, 15, 18, 21].map((h) => `<text x="${X(h)}" y="${H - 3}" text-anchor="middle">${String(h).padStart(2, '0')}</text><path d="M ${X(h)} ${H - 17} v 3" class="tk"/>`).join('');
    return `<svg class="fm-sunstrip" viewBox="0 0 ${W} ${H}" role="img" aria-label="Daylight through the day, now ${fmtHour(hour)}"><defs><linearGradient id="fmSunG" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#ffc533"/><stop offset="1" stop-color="#ffe9a8"/></linearGradient></defs>
      <path d="${d} L ${X(h1)} ${Y(0)} Z" fill="url(#fmSunG)" opacity=".9"/><path d="${d}" class="cv"/><path d="M ${x0} ${Y(0)} H ${x1}" class="ax"/>${ticks}
      <path d="M ${now} ${Y(1) - 8} V ${Y(0) + 2}" class="nowl"/><circle cx="${now}" cy="${Y(sunFactorAt(hour))}" r="4.4" class="nowd"/><text x="${clamp(now, 24, W - 24)}" y="${Y(1) - 12}" text-anchor="middle" class="nowt">${fmtHour(hour)}</text></svg>`;
  }
}

export { LINKS, GATES, levelData };
