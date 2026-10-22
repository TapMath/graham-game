// Full-screen effects: fades, flashes, the low-health vignette, glitch and the blur of a bad D-shot.
//
//   game.screenfx.fade(alpha, seconds, color)   fade a colour layer over the game to `alpha` (0 clears)
//   game.screenfx.flash(color, ms)              a quick pulse (damage red, heal gold)
//   game.screenfx.blur(px, seconds)             blur the 3D view by `px`, easing back to sharp over `seconds` (contaminated shot: 20 s)
//   game.screenfx.setLowHealth(level 0..1)      red/blue vignette that pulses (the HUD drives it from the rays)
//   game.screenfx.glitch(ms)                    scanline flicker + colour split on the HUD
// These are CSS-driven (real time), so they keep working in 'ending' mode.
export class ScreenFxSystem {
  init(game) {
    this.game = game;
    game.screenfx = this;
    const mk = (id) => { const d = document.createElement('div'); d.id = id; document.body.appendChild(d); return d; };
    this.fadeEl = mk('fx-fade'); this.flashEl = mk('fx-flash'); this.vignetteEl = mk('fx-vignette'); this.scanEl = mk('fx-scan');
    this.blurPx = 0; this._low = 0; this._flashT = 0;
    game.debug?.addState('screenfx', () => ({ fade: +(parseFloat(this.fadeEl.style.opacity) || 0).toFixed(2), blur: this.blurPx, low: this._low }));
  }

  fade(alpha, seconds = 0.6, color = '#000') {
    const e = this.fadeEl;
    e.style.background = color;
    e.style.transition = `opacity ${seconds}s ease`;
    e.style.opacity = String(alpha);
  }

  flash(color = '#ff3a2a', ms = 320, peak = 0.38) {
    const e = this.flashEl;
    e.style.transition = 'none'; e.style.background = color; e.style.opacity = String(peak);
    void e.offsetWidth;
    e.style.transition = `opacity ${ms}ms ease-out`; e.style.opacity = '0';
  }

  blur(px, seconds = 20) {
    const c = this.game.canvas;
    this.blurPx = px;
    c.style.transition = 'none';
    c.style.filter = `blur(${px}px)`;
    void c.offsetWidth;
    c.style.transition = `filter ${seconds}s linear`;
    c.style.filter = 'blur(0px)';
    clearTimeout(this._bt);
    this._bt = setTimeout(() => { this.blurPx = 0; c.style.filter = ''; c.style.transition = ''; }, seconds * 1000);
  }

  setLowHealth(level) {
    level = Math.max(0, Math.min(1, level));
    if (Math.abs(level - this._low) < 0.01) return;
    this._low = level;
    const v = this.vignetteEl;
    v.style.setProperty('--low', level.toFixed(2));
    v.classList.toggle('on', level > 0.02);
    v.style.setProperty('--beat', (1.5 - level * 0.8).toFixed(2) + 's');
  }

  glitch(ms = 260) {
    document.body.classList.add('glitch');
    this.scanEl.classList.add('on');
    clearTimeout(this._gt);
    this._gt = setTimeout(() => { document.body.classList.remove('glitch'); this.scanEl.classList.remove('on'); }, ms);
  }
}
