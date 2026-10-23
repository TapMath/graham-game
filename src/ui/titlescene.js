// The title screen's backdrop: a hazy sun behind a silhouetted Mumbai skyline, flyovers sweeping across the frame with
// light trails on them, searchlights, drones, drizzle and flickering neon (after the pitch deck's title slide).
// It is a plain 2D canvas, so it costs almost nothing and the (much heavier) 3D city does not render behind the menu.
// Layers are painted once into offscreen canvases (rebuilt on resize) and only the cheap, moving things are drawn each frame:
// lit windows, neon, traffic, beams, rain. It runs at about 30 fps and stops when hidden.
//
//   const scene = new TitleScene(canvas); scene.start(); scene.stop(); scene.setCalm(true)   (calm = reduced flashing)

const TAU = Math.PI * 2;

function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const lerp = (a, b, t) => a + (b - a) * t;
const makeCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };

export class TitleScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.running = false;
    this.calm = false;
    this.t = 0;
    this._last = 0;
    this._acc = 0;
    this._raf = 0;
    this.W = 0; this.H = 0; this.dpr = 1;
    this._onResize = () => this.resize();
    window.addEventListener('resize', this._onResize);
    this.resize();
  }

  setCalm(v) { this.calm = !!v; }

  start() {
    if (this.running) return;
    this.running = true; this._last = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      this._raf = requestAnimationFrame(loop);
      const dt = Math.min(0.1, (now - this._last) / 1000);
      this._acc += dt; this._last = now;
      if (this._acc < 1 / 30 - 0.002) return;       // about 30 fps
      this.t += this._acc; this._acc = 0;
      this.draw();
    };
    this._raf = requestAnimationFrame(loop);
    if (document.hidden === false) this.draw();
  }

  stop() { this.running = false; cancelAnimationFrame(this._raf); }

  resize() {
    const c = this.canvas;
    const cssW = Math.max(2, c.clientWidth || window.innerWidth), cssH = Math.max(2, c.clientHeight || window.innerHeight);
    this.dpr = Math.min(window.devicePixelRatio || 1, cssW * cssH > 0.9e6 ? 1 : 1.5);
    if (cssW === this.W && cssH === this.H && c.width) return;
    this.W = cssW; this.H = cssH;
    c.width = Math.round(cssW * this.dpr); c.height = Math.round(cssH * this.dpr);
    this.portrait = cssH > cssW * 1.05;
    this.build();
    if (this.running || this.t === 0) this.draw();
  }

  // ---------------------------------------------------------------------------------------------- building the layers
  build() {
    const W = this.W, H = this.H, d = this.dpr, rng = mulberry(2049);
    this.rng = rng;
    const portrait = this.portrait;
    this.horizon = H * (portrait ? 0.64 : 0.67);
    this.sun = { x: W * (portrait ? 0.5 : H < 520 ? 0.5 : 0.66), y: H * (portrait ? 0.4 : 0.43), r: Math.min(W, H) * (portrait ? 0.15 : 0.12) };
    const padW = W;
    this.pad = 0;

    // ---- sky and sun (static)
    const sky = this.sky = makeCanvas(W * d, H * d); const s = sky.getContext('2d'); s.scale(d, d);
    const g = s.createLinearGradient(0, 0, 0, this.horizon + 20);
    g.addColorStop(0, '#0a1820'); g.addColorStop(0.32, '#1d3036'); g.addColorStop(0.56, '#5c6561'); g.addColorStop(0.74, '#b88f64'); g.addColorStop(0.9, '#e2ae72'); g.addColorStop(1, '#efc58a');
    s.fillStyle = g; s.fillRect(0, 0, W, this.horizon + 20);
    s.fillStyle = '#0b1517'; s.fillRect(0, this.horizon + 20, W, H);
    const sun = this.sun;
    for (const [rr, a] of [[7, 0.10], [4.4, 0.16], [2.6, 0.2], [1.6, 0.25]]) {          // a big soft halo
      const rg = s.createRadialGradient(sun.x, sun.y, sun.r * 0.4, sun.x, sun.y, sun.r * rr);
      rg.addColorStop(0, `rgba(255,226,160,${a})`); rg.addColorStop(1, 'rgba(255,226,160,0)');
      s.fillStyle = rg; s.fillRect(0, 0, W, H);
    }
    const disc = s.createRadialGradient(sun.x, sun.y, sun.r * 0.1, sun.x, sun.y, sun.r);
    disc.addColorStop(0, '#fff4d2'); disc.addColorStop(0.75, '#f9dca0'); disc.addColorStop(1, '#efc47c');
    s.fillStyle = disc; s.beginPath(); s.arc(sun.x, sun.y, sun.r, 0, TAU); s.fill();
    // smog bands crossing the sun
    for (let i = 0; i < 6; i++) {
      const by = sun.y - sun.r * 0.9 + (i / 5) * sun.r * 1.8 + (rng() - 0.5) * 6;
      const bw = sun.r * (2.4 + rng() * 2.2), bx = sun.x - bw / 2 + (rng() - 0.5) * sun.r * 1.5;
      const bg = s.createLinearGradient(bx, 0, bx + bw, 0);
      bg.addColorStop(0, 'rgba(120,100,80,0)'); bg.addColorStop(0.5, `rgba(120,98,78,${0.25 + rng() * 0.25})`); bg.addColorStop(1, 'rgba(120,100,80,0)');
      s.fillStyle = bg; s.fillRect(bx, by, bw, 2 + rng() * 6);
    }

    // ---- skyline layers
    const far = this.far = this._skyline(padW, 0.40, 70, '#6f6553', 0.55, rng, { spires: 0.18, fins: false });
    const mid = this.mid = this._skyline(padW, 0.5, 38, '#353d3a', 1, rng, { spires: 0.35, fins: true, needle: true });
    const near = this.near = this._skyline(padW, 0.36, 22, '#0b1213', 1, rng, { spires: 0.3, fins: true, edges: true, windows: true });
    // haze between layers keeps depth readable
    this.hazeA = this._haze(padW, 'rgba(214,170,118,0.30)');
    this.hazeB = this._haze(padW, 'rgba(70,86,84,0.34)');

    // ---- flyovers: curved decks on bezier paths (high far one, big dark foreground one)
    const hz = this.horizon;
    this.decks = [
      { depth: 0.55, path: [[-0.1 * W, hz + 0.01 * H], [0.28 * W, hz - 0.1 * H], [0.62 * W, hz + 0.03 * H], [1.1 * W, hz - 0.04 * H]], width: 0.012 * H + 4, color: '#1b2425', top: 'rgba(255,214,150,.38)', pillars: 0.06 },
      { depth: 1, path: [[-0.12 * W, H * 0.97], [0.34 * W, hz + 0.07 * H], [0.7 * W, hz + 0.26 * H], [1.12 * W, hz + 0.05 * H]], width: 0.05 * H + 8, color: '#070c0d', top: 'rgba(255,214,150,.9)', pillars: 0.2 },
    ];
    for (const dk of this.decks) dk.img = this._deck(dk);

    // ---- foreground: ground, a dead tree on the left, rubble
    const fg = this.fg = makeCanvas(W * d, H * d); const f = fg.getContext('2d'); f.scale(d, d);
    f.fillStyle = '#060a0b';
    f.beginPath(); f.moveTo(0, H);
    f.lineTo(0, H * 0.9);
    f.bezierCurveTo(W * 0.1, H * 0.86, W * 0.18, H * 0.93, W * 0.3, H * 0.92);
    f.bezierCurveTo(W * 0.5, H * 0.9, W * 0.7, H * 0.96, W, H * 0.9);
    f.lineTo(W, H); f.fill();
    this._deadTree(f, W * (portrait ? 0.13 : 0.075), H * 0.91, H * (portrait ? 0.2 : 0.3), rng);
    // the wet street under the sun: a warm smear with horizontal streaks
    f.save(); f.translate(this.sun.x, this.horizon); f.scale(1, 2.6);
    const sg = f.createRadialGradient(0, 0, 0, 0, 0, this.sun.r * 1.5);
    sg.addColorStop(0, 'rgba(255,200,130,.30)'); sg.addColorStop(1, 'rgba(255,200,130,0)');
    f.fillStyle = sg; f.fillRect(-this.sun.r * 1.5, 0, this.sun.r * 3, H);
    f.restore();
    for (let i = 0; i < 26; i++) { f.fillStyle = `rgba(255,214,160,${0.04 + rng() * 0.07})`; const yy = this.horizon + Math.pow(rng(), 1.6) * (H - this.horizon), ww = this.sun.r * (0.4 + rng() * 1.6); f.fillRect(this.sun.x - ww / 2, yy, ww, 1 + rng() * 2); }
    // mist from the ground up
    const mg = f.createLinearGradient(0, H * 0.6, 0, H);
    mg.addColorStop(0, 'rgba(60,84,84,0)'); mg.addColorStop(0.7, 'rgba(36,58,60,.30)'); mg.addColorStop(1, 'rgba(8,16,18,.72)');
    f.fillStyle = mg; f.fillRect(0, H * 0.6, W, H * 0.4);
    // vignette
    const vg = f.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.45, W / 2, H * 0.5, Math.max(W, H) * 0.8);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
    f.fillStyle = vg; f.fillRect(0, 0, W, H);

    // ---- everything static is composited once; a frame is then one blit plus the moving things
    const base = this.base = makeCanvas(W * d, H * d); const b = base.getContext('2d');
    for (const img of [sky, far.canvas, this.hazeA, mid.canvas, this.hazeB, this.decks[0].img, near.canvas, this.decks[1].img, fg]) b.drawImage(img, 0, 0);

    // ---- moving things
    this.rain = Array.from({ length: Math.round(Math.min(220, 60 + (W * H) / 9000)) }, () => ({ x: rng() * (W + 120), y: rng() * H, v: 520 + rng() * 520, l: 8 + rng() * 18, a: 0.08 + rng() * 0.2 }));
    this.cars = [];
    this.decks.forEach((dk, di) => { const n = di ? 9 : 7; for (let i = 0; i < n; i++) this.cars.push({ deck: di, t: rng(), v: (0.03 + rng() * 0.05) * (rng() < 0.5 ? 1 : -1), c: rng() < 0.45 ? 'rgba(255,92,72,' : 'rgba(255,226,170,', len: 0.008 + rng() * 0.012 }); });
    this.drones = Array.from({ length: 4 }, () => ({ x: rng(), y: 0.26 + rng() * 0.2, v: (0.012 + rng() * 0.02) * (rng() < 0.5 ? -1 : 1), ph: rng() * 6 }));
    this.neons = near.neons.concat(mid.neons).map((n) => ({ ...n, ph: rng() * 20 }));
    this.beams = [{ x: mid.needleX ?? W * 0.5, y: mid.needleY ?? H * 0.4, base: -1.2, sweep: 0.5, sp: 0.11 }, { x: near.spireX ?? W * 0.3, y: near.spireY ?? H * 0.6, base: -1.7, sweep: 0.35, sp: 0.16 }];
  }

  _skyline(padW, maxH, count, color, alpha, rng, o) {
    const W = this.W, H = this.H, d = this.dpr, hz = this.horizon;
    const cv = makeCanvas(padW * d, H * d); const c = cv.getContext('2d'); c.scale(d, d);
    c.globalAlpha = alpha; c.fillStyle = color; c.strokeStyle = color;
    const lights = [], neons = [];
    let x = -10, res = { canvas: cv, lights, neons };
    const bodyBase = hz + 6;
    // the one tall needle (deck: the spire tower beside the sun); only on the middle layer
    const needleAt = o.needle ? padW * (this.portrait ? 0.34 : 0.5) : -999;
    while (x < padW + 10) {
      const w = (0.012 + rng() * 0.03) * W * (this.portrait ? 1.6 : 1) * (o.edges ? 1.4 : 1);
      const h = (0.05 + Math.pow(rng(), 1.5) * maxH) * H;
      // keep the sun's neighbourhood open on the near layer so the sun stays the centre of the picture
      const cx = x + w / 2;
      const nearSun = o.edges && Math.abs(cx - this.pad - this.sun.x) < this.sun.r * 2.2;
      const hh = nearSun ? h * 0.35 : h;
      const top = bodyBase - hh;
      c.fillRect(x, top, w, bodyBase - top + H);
      if (o.fins && w > 14) { c.fillRect(x - 2, top + hh * 0.18, 2, hh * 0.82 + H); c.fillRect(x + w, top + hh * 0.18, 2, hh * 0.82 + H); }
      const r = rng();
      if (r < o.spires) {                                          // pointed gothic crown
        c.beginPath(); c.moveTo(x, top); c.lineTo(x + w / 2, top - w * (0.9 + rng() * 1.2)); c.lineTo(x + w, top); c.fill();
        if (o.fins) for (const px of [x - 1, x + w - 2]) { c.beginPath(); c.moveTo(px, top + 3); c.lineTo(px + 1.5, top - 9 - rng() * 8); c.lineTo(px + 3, top + 3); c.fill(); }
        if (o.edges && w > 20) { res.spireX = x + w / 2; res.spireY = top - w * 1.2; }
      } else if (r < o.spires + 0.25) {                            // stepped crown
        c.fillRect(x + w * 0.2, top - hh * 0.07, w * 0.6, hh * 0.07);
        c.fillRect(x + w * 0.38, top - hh * 0.13, w * 0.24, hh * 0.06);
      } else if (r < o.spires + 0.4) {                              // water tank / antenna
        c.fillRect(x + w * 0.45, top - 18 - rng() * 22, 1.6, 40);
      }
      if (o.windows) {
        const cols = Math.max(1, Math.floor(w / 7)), rows = Math.floor(hh / 9);
        for (let ry = 0; ry < rows; ry++) for (let cx2 = 0; cx2 < cols; cx2++) {
          if (rng() < 0.16) lights.push({ x: x + 3 + cx2 * 7 + rng() * 1.5, y: top + 6 + ry * 9, c: rng() < 0.62 ? 0 : rng() < 0.7 ? 1 : 2, ph: rng() * 40, on: rng() < 0.55 });
        }
        if (w > 22 && hh > H * 0.12 && rng() < 0.4) neons.push({ x: x + w * 0.35, y: top + hh * (0.15 + rng() * 0.5), w: 3, h: 14 + rng() * 22, c: rng() < 0.5 ? '#ff4fa3' : '#4fe3ff' });
      }
      x += w + (o.edges ? rng() * 4 : rng() * 5 - 1);
    }
    if (o.needle) {                                                // the needle tower
      const nx = needleAt, bw = Math.max(16, W * 0.026), nh = H * (this.portrait ? 0.46 : 0.5);
      c.globalAlpha = 1; c.fillStyle = '#1e2624';
      c.beginPath();
      c.moveTo(nx - bw / 2, bodyBase + H * 0.2); c.lineTo(nx - bw / 2, bodyBase - nh * 0.55);
      c.lineTo(nx - bw * 0.32, bodyBase - nh * 0.78); c.lineTo(nx - bw * 0.14, bodyBase - nh * 0.9); c.lineTo(nx, bodyBase - nh);
      c.lineTo(nx + bw * 0.14, bodyBase - nh * 0.9); c.lineTo(nx + bw * 0.32, bodyBase - nh * 0.78); c.lineTo(nx + bw / 2, bodyBase - nh * 0.55); c.lineTo(nx + bw / 2, bodyBase + H * 0.2);
      c.fill();
      c.fillRect(nx - bw * 0.85, bodyBase - nh * 0.52, bw * 1.7, nh * 0.52 + H * 0.2);       // buttress block at the foot
      c.fillRect(nx - bw * 0.7, bodyBase - nh * 0.62, bw * 1.4, nh * 0.1);
      res.needleX = nx - this.pad; res.needleY = bodyBase - nh;
      // sunlit left edge
      c.fillStyle = 'rgba(255,214,150,.35)'; c.fillRect(nx + bw / 2 - 1.5, bodyBase - nh * 0.55, 1.5, nh * 0.55);
      for (let i = 0; i < 18; i++) lights.push({ x: nx - bw * 0.3 + rng() * bw * 0.6, y: bodyBase - nh * 0.5 + i * (nh * 0.027), c: 0, ph: rng() * 40, on: rng() < 0.7 });
    }
    // lit rim from the sun on edges that face it
    if (o.edges) {
      c.globalAlpha = 1; c.fillStyle = 'rgba(255,200,130,.12)';
      c.fillRect(0, bodyBase - 1, padW, 1);
    }
    c.globalAlpha = 1;
    res.neons = neons.map((n) => ({ ...n, x: n.x - this.pad }));
    res.lights = lights;
    return res;
  }

  _haze(padW, color) {
    const d = this.dpr, H = this.H;
    const cv = makeCanvas(padW * d, H * d); const c = cv.getContext('2d'); c.scale(d, d);
    const g = c.createLinearGradient(0, this.horizon - H * 0.25, 0, this.horizon + 14);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, color);
    c.fillStyle = g; c.fillRect(0, this.horizon - H * 0.25, padW, H * 0.25 + 40);
    return cv;
  }

  _bez(p, t) {
    const u = 1 - t;
    return [u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0],
      u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1]];
  }

  _deck(dk) {
    const W = this.W, H = this.H, d = this.dpr, hz = this.horizon;
    const cv = makeCanvas(W * d, H * d); const c = cv.getContext('2d'); c.scale(d, d);
    const N = 60, pts = [];
    for (let i = 0; i <= N; i++) pts.push(this._bez(dk.path, i / N));
    // pillars (gothic: slightly flared) from the deck down to the ground line
    const ground = dk.depth < 1 ? hz + 14 : H * 1.05;
    c.fillStyle = dk.color;
    for (let i = 3; i < N; i += Math.max(3, Math.round(N * dk.pillars))) {
      const [x, y] = pts[i], pw = dk.width * 0.9;
      if (y > ground) continue;
      c.beginPath(); c.moveTo(x - pw * 0.4, y); c.lineTo(x + pw * 0.4, y); c.lineTo(x + pw * 0.6, ground); c.lineTo(x - pw * 0.6, ground); c.fill();
    }
    // the deck: an underside band, then a thinner lit top edge and a parapet
    c.lineCap = 'butt'; c.lineJoin = 'round';
    c.strokeStyle = dk.color; c.lineWidth = dk.width;
    c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke();
    c.strokeStyle = dk.top; c.lineWidth = Math.max(1.5, dk.width * (dk.depth === 1 ? 0.07 : 0.1));
    c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y - dk.width * 0.46) : c.moveTo(x, y - dk.width * 0.46))); c.stroke();
    c.strokeStyle = dk.color; c.lineWidth = Math.max(1, dk.width * 0.14);
    c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y - dk.width * 0.78) : c.moveTo(x, y - dk.width * 0.78))); c.stroke();
    // arches under the deck on the big one
    if (dk.depth === 1) {
      c.strokeStyle = 'rgba(255,190,120,.10)'; c.lineWidth = 1.2;
      for (let i = 4; i < N; i += 6) { const [x, y] = pts[i]; c.beginPath(); c.arc(x, y + dk.width * 0.3, dk.width * 0.55, Math.PI, 0); c.stroke(); }
    }
    return cv;
  }

  _deadTree(c, x, y, h, rng) {
    c.strokeStyle = '#05090a'; c.lineCap = 'round';
    const branch = (bx, by, ang, len, w, depth) => {
      if (depth <= 0 || len < 4) return;
      const ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len;
      c.lineWidth = w; c.beginPath(); c.moveTo(bx, by); c.lineTo(ex, ey); c.stroke();
      const n = depth > 3 ? 2 : (rng() < 0.7 ? 2 : 1);
      for (let i = 0; i < n; i++) branch(ex, ey, ang + (rng() - 0.5) * 1.15 + (i ? 0.3 : -0.3), len * (0.66 + rng() * 0.14), w * 0.66, depth - 1);
    };
    branch(x, y, -Math.PI / 2 + 0.08, h * 0.38, Math.max(5, h * 0.045), 7);
    branch(x, y - h * 0.18, -Math.PI / 2 + 0.7, h * 0.2, Math.max(3, h * 0.025), 5);
  }

  // ---------------------------------------------------------------------------------------------- one frame
  draw() {
    const c = this.ctx, W = this.W, H = this.H, d = this.dpr, t = this.t, calm = this.calm;
    if (!this.base) return;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(this.base, 0, 0);
    c.setTransform(d, 0, 0, d, 0, 0);
    // the sun breathes a little
    const sun = this.sun, pulse = 0.5 + 0.5 * Math.sin(t * 0.35), R = sun.r * (3.2 + pulse * 0.6);
    c.globalCompositeOperation = 'lighter';
    const rg = c.createRadialGradient(sun.x, sun.y, sun.r * 0.8, sun.x, sun.y, R);
    rg.addColorStop(0, `rgba(255,214,140,${0.08 + pulse * 0.05})`); rg.addColorStop(1, 'rgba(255,214,140,0)');
    c.fillStyle = rg; c.fillRect(sun.x - R, sun.y - R, R * 2, R * 2);
    // searchlights
    for (const b of this.beams) {
      const ang = b.base + Math.sin(t * b.sp * TAU + b.x) * b.sweep, len = H * 0.9, bx = b.x, by = b.y;
      const g = c.createLinearGradient(bx, by, bx + Math.cos(ang) * len, by + Math.sin(ang) * len);
      g.addColorStop(0, 'rgba(210,235,255,.12)'); g.addColorStop(1, 'rgba(210,235,255,0)');
      c.fillStyle = g; c.beginPath(); c.moveTo(bx, by);
      c.lineTo(bx + Math.cos(ang - 0.035) * len, by + Math.sin(ang - 0.035) * len); c.lineTo(bx + Math.cos(ang + 0.035) * len, by + Math.sin(ang + 0.035) * len); c.fill();
    }
    c.globalCompositeOperation = 'source-over';
    this._lights(c, this.mid, t, calm, 1);
    this._lights(c, this.near, t, calm, 1.15);
    this._neons(c, t, calm);
    this._traffic(c, 0); this._traffic(c, 1);
    this._drones(c, t);
    this._rain(c, t);
  }

  _lights(c, layer, t, calm, size) {
    c.globalCompositeOperation = 'lighter';
    const cols = ['rgba(255,196,110,', 'rgba(110,230,255,', 'rgba(255,110,170,'];
    for (const L of layer.lights) {
      if (!L.on) continue;
      const fl = calm ? 0.8 : (0.55 + 0.45 * Math.sin(t * 0.9 + L.ph) * (Math.sin(t * 0.13 + L.ph * 3) > 0.7 ? 1 : 0.35));
      c.fillStyle = cols[L.c] + (0.55 * fl).toFixed(2) + ')';
      c.fillRect(L.x, L.y, 2.2 * size, 3 * size);
    }
    c.globalCompositeOperation = 'source-over';
  }

  _neons(c, t, calm) {
    c.globalCompositeOperation = 'lighter';
    for (const n of this.neons) {
      let a = 0.8;
      if (!calm) { const f = Math.sin(t * 7.1 + n.ph * 5) * Math.sin(t * 2.3 + n.ph); a = f > 0.82 ? 0.15 : f > 0.6 ? 0.5 : 0.85; }
      c.fillStyle = n.c; c.globalAlpha = a * 0.55;
      c.fillRect(n.x, n.y, n.w, n.h);
      c.globalAlpha = a * 0.14; c.fillRect(n.x - 4, n.y - 3, n.w + 8, n.h + 6);
    }
    c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
  }

  _traffic(c, deckIdx) {
    const dk = this.decks[deckIdx], k = 1 / 30;
    c.globalCompositeOperation = 'lighter';
    for (const car of this.cars) {
      if (car.deck !== deckIdx) continue;
      car.t += car.v * k; if (car.t > 1.02) car.t = -0.02; if (car.t < -0.02) car.t = 1.02;
      for (let s = 0; s < 6; s++) {
        const tt = car.t - Math.sign(car.v) * s * car.len * 0.25;
        if (tt < 0 || tt > 1) continue;
        const [x, y] = this._bez(dk.path, tt);
        c.fillStyle = car.c + (0.9 - s * 0.14).toFixed(2) + ')';
        const sz = (deckIdx ? 3.2 : 2) * (1 - s * 0.1);
        c.fillRect(x - sz / 2, y - dk.width * 0.62 - sz * 0.3, sz * 1.4, sz * 0.7);
      }
    }
    c.globalCompositeOperation = 'source-over';
  }

  _drones(c, t) {
    c.globalCompositeOperation = 'lighter';
    for (const d of this.drones) {
      d.x += d.v / 30; if (d.x > 1.05) d.x = -0.05; if (d.x < -0.05) d.x = 1.05;
      const x = d.x * this.W, y = d.y * this.H + Math.sin(t * 0.8 + d.ph) * 4;
      const blink = Math.sin(t * 4 + d.ph) > 0.4;
      c.fillStyle = blink ? 'rgba(255,70,60,.95)' : 'rgba(255,255,255,.55)';
      c.fillRect(x, y, 2.4, 2.4);
      c.fillStyle = 'rgba(200,230,255,.28)'; c.fillRect(x - 5, y + 1, 12, 1);
    }
    c.globalCompositeOperation = 'source-over';
  }

  _rain(c, t) {
    const W = this.W, H = this.H, dt = 1 / 30;
    c.lineWidth = 1; c.lineCap = 'round';
    for (const pass of [0, 1]) {
      c.strokeStyle = pass ? 'rgba(200,225,240,.30)' : 'rgba(190,215,235,.14)';
      c.beginPath();
      for (const r of this.rain) {
        if ((r.a > 0.17) !== !!pass) continue;
        r.y += r.v * dt; r.x -= r.v * dt * 0.12;
        if (r.y > H + 20) { r.y = -20; r.x = Math.random() * (W + 120); }
        c.moveTo(r.x, r.y); c.lineTo(r.x - r.l * 0.12, r.y - r.l);
      }
      c.stroke();
    }
    void t;
  }
}

