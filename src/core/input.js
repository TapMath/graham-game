// Keyboard / mouse / pointer-lock input.
//
// Keys are tracked by KeyboardEvent.code. Keyboard works with or without pointer lock, so
// headless tests can drive the game with real KeyboardEvents or with input.setKey().
// Gameplay code asks about *actions* (see ACTIONS), not raw keys, so rebinding and the
// Phase 6 touch controls only need to call setKey()/addLook().

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

  releaseAll() { this.keys.clear(); }

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

  /** Movement intent in [-1, 1]: x = strafe right, y = forward. Not normalised. */
  moveAxis(out = { x: 0, y: 0 }) {
    out.x = (this.action('right') ? 1 : 0) - (this.action('left') ? 1 : 0);
    out.y = (this.action('forward') ? 1 : 0) - (this.action('back') ? 1 : 0);
    return out;
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
