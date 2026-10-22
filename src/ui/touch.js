// Touch controls (shown when the device has touch, `?touch=1` forces them on, `?touch=0` off):
//
//   left side    a floating virtual stick: it appears under the thumb, the knob follows, push it to the edge to sprint
//   anywhere else drag to look (the stick zone is the lower-left of the screen; everything else looks)
//   buttons      jump (Space), use (E; hold to dig), sing (Q; hold for second sight), switch (Tab, once Jeetu has joined),
//                view (V) and pause
//
// It only talks to `game.input` (setStick, lookTouch, virtualKey), so every system that reads keys keeps working. The layer
// hides itself while a dialogue, card, vision or cutscene holds `game.modal` (their own buttons are large tap targets) and
// shows a Skip button during cutscenes. Page scroll, pinch zoom and long-press menus are blocked on the game surface.
//
//   game.touch.enabled / snapshot()        state for tests (state().touch)
import { isTouchDevice } from '../core/input.js';

const ICON = {
  jump: '<svg viewBox="0 0 24 24"><path d="M12 19 V6 M6 11.5 L12 5.5 L18 11.5"/></svg>',
  use: '<svg viewBox="0 0 24 24"><path d="M8 11 V5.5 a1.6 1.6 0 0 1 3.2 0 V10 M11.2 9 V4.5 a1.6 1.6 0 0 1 3.2 0 V10 M14.4 9.5 a1.6 1.6 0 0 1 3.2 0 V14 c0 3.6 -2 6 -5.6 6 c-3 0 -4.6 -1.8 -6 -4.4 L4.6 12.6 a1.5 1.5 0 0 1 2.6 -1.4 L8 12.4"/></svg>',
  sing: '<svg viewBox="0 0 24 24"><path d="M9 18 V6 L19 4 V16"/><circle cx="6.8" cy="18" r="2.6" class="f"/><circle cx="16.8" cy="16" r="2.6" class="f"/></svg>',
  swap: '<svg viewBox="0 0 24 24"><path d="M4 8 H19 M15 4 L19 8 L15 12 M20 16 H5 M9 12 L5 16 L9 20"/></svg>',
  view: '<svg viewBox="0 0 24 24"><path d="M2.5 12 C6 6 18 6 21.5 12 C18 18 6 18 2.5 12 Z"/><circle cx="12" cy="12" r="3.2"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5 V19 M16 5 V19"/></svg>',
};
const BUTTONS = [
  { id: 'jump', code: 'Space', icon: ICON.jump, key: '', label: 'Jump' },
  { id: 'use', code: 'KeyE', icon: ICON.use, key: 'E', label: 'Use' },
  { id: 'sing', code: 'KeyQ', icon: ICON.sing, key: 'Q', label: 'Sing' },
  { id: 'swap', code: 'Tab', icon: ICON.swap, key: 'Tab', label: 'Switch' },
  { id: 'view', code: 'KeyV', icon: ICON.view, key: 'V', label: 'View' },
];
const SPRINT_ON = 0.97, SPRINT_OFF = 0.84, DEAD = 0.12;

export class TouchSystem {
  init(game) {
    this.game = game;
    game.touch = this;
    this.enabled = false;
    this.shown = false;
    this.pointers = new Map();      // pointerId -> {role, ...}
    this.stick = { x: 0, y: 0, sprint: false, mag: 0 };
    this.held = new Set();          // virtual key codes currently down
    this.looks = 0;

    const root = this.root = document.createElement('div');
    root.id = 'touch'; root.hidden = true;
    root.innerHTML =
      `<div id="t-ghost"><i class="ring"></i><i class="knob"></i></div>` +
      `<div id="t-stick" hidden><i class="ring"></i><i class="edge"></i><i class="knob"></i></div>` +
      `<div class="t-btns">${BUTTONS.map((b) => `<button type="button" class="t-btn t-${b.id}" data-code="${b.code}" aria-label="${b.label}"><span class="ic">${b.icon}</span>${b.key ? `<b>${b.key}</b>` : ''}</button>`).join('')}</div>` +
      `<button type="button" id="t-pause" aria-label="Pause">${ICON.pause}</button>` +
      `<button type="button" id="t-skip">Skip</button>`;
    document.body.appendChild(root);
    this.stickEl = root.querySelector('#t-stick'); this.knobEl = this.stickEl.querySelector('.knob'); this.ghostEl = root.querySelector('#t-ghost');
    this.swapBtn = root.querySelector('.t-swap');

    // the game surface: look and stick
    root.addEventListener('pointerdown', (e) => this._down(e));
    root.addEventListener('pointermove', (e) => this._move(e));
    root.addEventListener('pointerup', (e) => this._up(e));
    root.addEventListener('pointercancel', (e) => this._up(e));
    root.addEventListener('contextmenu', (e) => e.preventDefault());
    for (const b of root.querySelectorAll('.t-btn')) this._wireButton(b);
    root.querySelector('#t-pause').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); game.menu?.pause(); });
    root.querySelector('#t-skip').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); game.input.tap('Enter', 90); });

    // no page scroll or pinch zoom on the game surface; the menus and cards that scroll opt in
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('touchmove', (e) => {
      if (!this.enabled) return;
      if (e.target.closest?.('.panel-scroll, .cv-card, .fr-paper, #ending, .set-body, .htp-grid, #dialog')) return;
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    document.addEventListener('dblclick', (e) => { if (this.enabled) e.preventDefault(); });

    // turn on at the first real touch (hybrid laptops), or at once on touch devices
    window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') this.enable(true); }, true);
    if (isTouchDevice()) this.enable(true);

    game.events.on('mode:changed', () => this._refresh());
    game.events.on('cinematic:start', () => this._refresh());
    game.events.on('cinematic:end', () => this._refresh());
    game.events.on('party:switched', () => this._swapLabel());
    game.events.on('dialogue:open', () => this._refresh());
    game.events.on('dialogue:close', () => this._refresh());
    window.addEventListener('blur', () => this.releaseAll());
    game.debug?.addState('touch', () => this.snapshot());
  }

  enable(on) {
    if (this.enabled === on) return;
    this.enabled = on;
    document.body.classList.toggle('touch', on);
    this.root.hidden = !on;
    this._refresh();
  }

  snapshot() {
    return { enabled: this.enabled, shown: this.shown, stick: { x: +this.stick.x.toFixed(2), y: +this.stick.y.toFixed(2), sprint: this.stick.sprint }, pointers: this.pointers.size, looks: this.looks, held: [...this.held], swap: !this.swapBtn.hidden };
  }

  // ------------------------------------------------------------------------------------------------ buttons
  _wireButton(b) {
    const code = b.dataset.code;
    const release = (e) => {
      if (!this.held.has(code) || (e && e.pointerId !== b._pid)) return;
      this.held.delete(code); b.classList.remove('down'); b._pid = null;
      this.game.input.virtualKey(code, false);
    };
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      try { b.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
      b._pid = e.pointerId;
      if (this.held.has(code)) return;
      this.held.add(code); b.classList.add('down');
      this.game.input.virtualKey(code, true);
      navigator.vibrate?.(8);
    });
    b.addEventListener('pointerup', release);
    b.addEventListener('pointercancel', release);
    b.addEventListener('lostpointercapture', release);
  }

  releaseAll() {
    const g = this.game;
    for (const code of [...this.held]) { g.input.virtualKey(code, false); }
    this.held.clear();
    for (const b of this.root.querySelectorAll('.t-btn.down')) b.classList.remove('down');
    this.pointers.clear();
    this.stick.x = this.stick.y = 0; this.stick.sprint = false; this.stick.mag = 0;
    g.input.setStick(0, 0, false);
    this.stickEl.hidden = true; this.ghostEl.classList.remove('off');
  }

  // ------------------------------------------------------------------------------------------------ stick and look
  _down(e) {
    if (!this.shown || e.target !== this.root) return;
    e.preventDefault();
    try { this.root.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    const W = window.innerWidth, H = window.innerHeight;
    const inStickZone = e.clientX < W * 0.46 && e.clientY > H * 0.42;
    const hasStick = [...this.pointers.values()].some((p) => p.role === 'stick');
    if (inStickZone && !hasStick) {
      const R = this._radius();
      const ox = Math.min(Math.max(e.clientX, R + 12), W * 0.5), oy = Math.min(Math.max(e.clientY, H * 0.42 + R * 0.4), H - R - 12);
      this.pointers.set(e.pointerId, { role: 'stick', ox, oy, R });
      this.stickEl.style.left = ox + 'px'; this.stickEl.style.top = oy + 'px';
      this.stickEl.style.setProperty('--R', R + 'px');
      this.stickEl.hidden = false; this.ghostEl.classList.add('off');
      this._stickTo(this.pointers.get(e.pointerId), e.clientX, e.clientY);
    } else {
      this.pointers.set(e.pointerId, { role: 'look', x: e.clientX, y: e.clientY });
    }
  }

  _radius() { return Math.max(44, Math.min(64, Math.min(window.innerWidth, window.innerHeight) * 0.14)); }

  _move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    if (p.role === 'look') {
      this.game.input.lookTouch(e.clientX - p.x, e.clientY - p.y);
      p.x = e.clientX; p.y = e.clientY; this.looks++;
    } else this._stickTo(p, e.clientX, e.clientY);
  }

  _stickTo(p, x, y) {
    let dx = x - p.ox, dy = y - p.oy;
    const raw = Math.hypot(dx, dy), R = p.R, mag = raw / R;
    const ux = raw ? dx / raw : 0, uy = raw ? dy / raw : 0;
    if (raw > R) { dx = ux * R; dy = uy * R; }
    this.knobEl.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    const st = this.stick;
    st.mag = mag;
    if (mag < DEAD) { st.x = 0; st.y = 0; st.sprint = false; }
    else {
      const m = Math.min(1, mag);
      st.x = ux * m; st.y = -uy * m;                       // screen y grows downward; forward is up
      st.sprint = st.sprint ? mag > SPRINT_OFF : mag >= SPRINT_ON;
    }
    this.stickEl.classList.toggle('sprint', st.sprint);
    this.game.input.setStick(st.x, st.y, st.sprint);
  }

  _up(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (p.role === 'stick') {
      this.stick.x = this.stick.y = 0; this.stick.sprint = false; this.stick.mag = 0;
      this.game.input.setStick(0, 0, false);
      this.stickEl.hidden = true; this.stickEl.classList.remove('sprint'); this.ghostEl.classList.remove('off');
      this.knobEl.style.transform = '';
    }
  }

  /** The switch button names who you are (the HUD's Tab hint is hidden on touch). */
  _swapLabel() {
    const who = this.game.party?.active === 'jeetu' ? 'Jeetu' : 'Mithi';
    const b = this.swapBtn.querySelector('b');
    if (b && b.textContent !== who) b.textContent = who;
    this.swapBtn.setAttribute('aria-label', `Switch character (you are ${who})`);
  }

  // ------------------------------------------------------------------------------------------------ visibility
  _refresh() {
    const g = this.game;
    const playing = g.mode === 'playing';
    const cine = !!g.cinematics?.active;
    const show = this.enabled && playing && !g.modal && !cine;
    document.body.classList.toggle('touch-cine', this.enabled && playing && cine);
    document.body.classList.toggle('touch-modal', this.enabled && playing && !!g.modal && !cine);
    if (show !== this.shown) {
      this.shown = show;
      this.root.classList.toggle('on', show);
      if (!show) this.releaseAll();
    }
    // pause stays reachable except in cutscenes (they are skippable instead)
    this.root.classList.toggle('skip', this.enabled && playing && cine);
  }

  update() {
    const g = this.game;
    const modal = !!g.modal, cine = !!g.cinematics?.active;
    if (modal === this._modal && cine === this._cine && this.shown === (this.enabled && !modal && !cine)) {
      const joined = !!(g.flags.jeetuJoined || g.party?.jeetu);
      if (joined === this._joined) return;
      this._joined = joined; this.swapBtn.hidden = !joined; this._swapLabel();
      return;
    }
    this._modal = modal; this._cine = cine;
    this._refresh();
    const joined = !!(g.flags.jeetuJoined || g.party?.jeetu);
    this._joined = joined; this.swapBtn.hidden = !joined; this._swapLabel();
  }
}
