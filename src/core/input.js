// Keyboard / mouse / pointer-lock input.
//
// Keys are tracked by KeyboardEvent.code. Keyboard works with or without pointer lock, so
// headless tests can drive the game with real KeyboardEvents or with input.setKey().
// Gameplay code asks about *actions* (see ACTIONS), not raw keys, so rebinding and the
// touch controls (src/ui/touch.js) only need to call setKey()/addLook()/setStick().
//
// Touch (Phase 7a): `setStick(x, y)` feeds an analog move vector (x right, y forward, both -1..1) that moveAxis() adds to the
// keyboard; `lookTouch(dx, dy)` turns a finger drag (CSS pixels) into look using `touchSensitivity` (rad per pixel, scaled by the
// touch-sensitivity setting); `virtualKey(code, down)` / `tap(code)` fire real KeyboardEvents on window, so systems that listen
// for key events (Tab for Jeetu, Enter and Esc in cards and cutscenes, E and the digits in dialogue) work from touch buttons too.
// `isTouchDevice()` is the one place that decides whether the touch layer is wanted (`?touch=1` forces it, `?touch=0` forbids it).

export function isTouchDevice(search = (typeof location !== 'undefined' ? location.search : '')) {
  try {
    const q = new URLSearchParams(search);
    if (q.has('touch')) return q.get('touch') !== '0' && q.get('touch') !== 'false';
    const coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    return coarse && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
  } catch { return false; }
}

const KEY_NAMES = { Space: ' ', Tab: 'Tab', Enter: 'Enter', Escape: 'Escape', KeyE: 'e', KeyQ: 'q', KeyV: 'v', ShiftLeft: 'Shift' };

export const ACTIONS = {
  forward: ['KeyW'],
  back: ['KeyS'],
  left: ['KeyA'],
  right: ['KeyD'],
  jump: ['Space'],
  sprint: ['ShiftLeft', 'ShiftRight'],
  interact: ['KeyE'],
  sing: ['KeyQ'],
  view: ['KeyV'],
  lookLeft: ['ArrowLeft'],
  lookRight: ['ArrowRight'],
  lookUp: ['ArrowUp'],
  lookDown: ['ArrowDown'],
};

const GAME_KEYS = new Set(Object.values(ACTIONS).flat());

export class Input {
  constructor(canvas, events) {
    this.canvas = canvas;
    this.events = events;
    this.keys = new Set();    // codes currently held
    this.edges = new Set();   // codes pressed since the last endStep() (survives taps shorter than a step)
    this.lookDX = 0;
    this.lookDY = 0;
    this.locked = false;
    this.sensitivity = 0.0022; // rad per pixel
    this.invertY = false;
    this.touchSensitivity = 0.0042;   // rad per CSS pixel of finger drag (the setting scales this)
    this.stick = { x: 0, y: 0, active: false };   // virtual stick, see setStick()
    this._attach();
  }

  _attach() {
    const onDown = (e) => {
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) this.setKey(e.code, true);
    };
    const onUp = (e) => this.setKey(e.code, false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', () => this.releaseAll());
    document.addEventListener('mousemove', (e) => {
      if (this.locked) this.addLook(e.movementX, e.movementY);
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.releaseAll();
      this.events.emit('input:lock', { locked: this.locked });
    });
    document.addEventListener('pointerlockerror', () => this.events.emit('input:lockerror', {}));
  }

  /** Press/release a key programmatically (tests, touch buttons). */
  setKey(code, down) {
    if (down) {
      if (!this.keys.has(code)) this.edges.add(code);
      this.keys.add(code);
    } else {
      this.keys.delete(code);
    }
  }

  releaseAll() { this.keys.clear(); this.stick.x = 0; this.stick.y = 0; this.stick.active = false; }

  isDown(code) { return this.keys.has(code); }

  /** Is any key bound to the action held? */
  action(name) {
    for (const c of ACTIONS[name]) if (this.keys.has(c)) return true;
    return false;
  }

  /** Was the action pressed (edge) since the previous simulation step? */
  pressed(name) {
    for (const c of ACTIONS[name]) if (this.edges.has(c)) return true;
    return false;
  }

  /** Movement intent in [-1, 1]: x = strafe right, y = forward. Not normalised. The virtual stick adds to the keys. */
  moveAxis(out = { x: 0, y: 0 }) {
    out.x = (this.action('right') ? 1 : 0) - (this.action('left') ? 1 : 0);
    out.y = (this.action('forward') ? 1 : 0) - (this.action('back') ? 1 : 0);
    if (this.stick.active) {
      out.x = Math.max(-1, Math.min(1, out.x + this.stick.x));
      out.y = Math.max(-1, Math.min(1, out.y + this.stick.y));
    }
    return out;
  }

  /** Virtual stick (touch): x right, y forward, each -1..1. `sprint` also holds Shift (the stick is pushed to its edge). */
  setStick(x, y, sprint = false) {
    const s = this.stick;
    s.x = x; s.y = y; s.active = x !== 0 || y !== 0;
    this.setKey('ShiftLeft', !!(sprint && s.active));
  }

  /** A finger drag in CSS pixels, converted to the same radians-per-pixel scale the mouse uses. */
  lookTouch(dx, dy) {
    const k = this.touchSensitivity / this.sensitivity;
    this.addLook(dx * k, dy * k);
  }

  /** Press or release a key as a real KeyboardEvent (reaches window listeners and this class). */
  virtualKey(code, down) {
    try {
      window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', { code, key: KEY_NAMES[code] ?? code, bubbles: true, cancelable: true }));
    } catch { this.setKey(code, down); }
  }

  /** A quick press and release (the key is held for one frame so edge-triggered actions see it). */
  tap(code, ms = 60) {
    this.virtualKey(code, true);
    setTimeout(() => this.virtualKey(code, false), ms);
  }

  /** Add look movement in pixels (mouse or touch drag). */
  addLook(dx, dy) { this.lookDX += dx; this.lookDY += dy; }

  /** Take and clear accumulated look movement. */
  consumeLook(out = { x: 0, y: 0 }) {
    out.x = this.lookDX; out.y = this.lookDY;
    this.lookDX = 0; this.lookDY = 0;
    return out;
  }

  /** Called by Game.update once per simulation step, after all systems ran. */
  endStep() { this.edges.clear(); }

  requestLock() {
    if (this.canvas.requestPointerLock) {
      try { const p = this.canvas.requestPointerLock(); if (p && p.catch) p.catch(() => this.events.emit('input:lockerror', {})); }
      catch { this.events.emit('input:lockerror', {}); }
    } else {
      this.events.emit('input:lockerror', {});
    }
  }
}
