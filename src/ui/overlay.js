// The menu shell: title screen, pause menu, how to play, settings and credits (PLAN section 3b / Phase 7a).
//
//   game.menu.screen            'title' | 'pause' | 'howto' | 'settings' | 'credits' | null (null while playing)
//   game.menu.begin()           start the run from the title (game.setMode('playing'); the opening cinematic is 6b's and
//                               fires on the first entry into play)
//   game.menu.pause() / resume()          Esc, losing pointer lock, the touch pause button, the tab being hidden
//   game.menu.open('howto'|'settings'|'credits'), back(), restart(), quitToTitle()
//
// The title DOM is static in index.html (so there is something on screen while the city builds); this system takes it over,
// fills in the buttons and removes the "building the city" state once every system has initialised. The 3D scene is not
// rendered behind the title (a 2D canvas, titlescene.js, does the skyline): game.render is a no-op while the title shows.
//
// Pointer lock: Begin and Resume request it on desktop (touch devices have none). Losing it (Esc) pauses, except while a
// dialogue or cutscene holds `game.modal`, which releases it on purpose. If the browser refuses the lock the game plays on
// with the keyboard and a click on the canvas asks again. Restart and Quit to title reload the page (the cleanest reset);
// restart sets a session flag so the reload goes straight into play without the title.
import { TitleScene } from './titlescene.js';
import { howToHtml } from './howto.js';
import { DEFS, GROUPS } from './settings.js';

const BEGIN_FLAG = 'grahan.begin';
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

let scene = null;
/** Start the title canvas as early as possible (main.js calls this before the heavy city build). */
export function startTitleScene() {
  if (scene) return scene;
  const cv = document.getElementById('title-canvas');
  if (!cv) return null;
  try { scene = new TitleScene(cv); scene.start(); } catch (e) { console.error(e); scene = null; }
  return scene;
}

const ICONS = {
  begin: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5 V5.5 M12 18.5 V21.5 M2.5 12 H5.5 M18.5 12 H21.5 M5.3 5.3 L7.4 7.4 M16.6 16.6 L18.7 18.7 M5.3 18.7 L7.4 16.6 M16.6 7.4 L18.7 5.3"/></svg>',
  howto: '<svg viewBox="0 0 24 24"><circle cx="12" cy="5.5" r="2.4"/><path d="M12 8 V15 M12 10 L7 13 M12 10 L17 13 M12 15 L8.5 21 M12 15 L15.5 21"/></svg>',
  settings: '<svg viewBox="0 0 24 24"><path d="M4 7 H20 M4 12 H20 M4 17 H20"/><circle cx="9" cy="7" r="2" class="f"/><circle cx="15" cy="12" r="2" class="f"/><circle cx="8" cy="17" r="2" class="f"/></svg>',
  credits: '<svg viewBox="0 0 24 24"><path d="M5 4 H15 L19 8 V20 H5 Z M15 4 V8 H19 M8 12 H16 M8 15 H16"/></svg>',
  resume: '<svg viewBox="0 0 24 24"><path d="M8 5 L19 12 L8 19 Z" class="f"/></svg>',
  restart: '<svg viewBox="0 0 24 24"><path d="M5 12 A7 7 0 1 0 8 6.2 M5 4 V8.5 H9.5"/></svg>',
  quit: '<svg viewBox="0 0 24 24"><path d="M10 4 H5 V20 H10 M9 12 H20 M16 8 L20 12 L16 16"/></svg>',
  back: '<svg viewBox="0 0 24 24"><path d="M20 12 H5 M10 6 L4 12 L10 18"/></svg>',
};

export class OverlaySystem {
  init(game) {
    this.game = game;
    game.menu = this;
    this.el = document.getElementById('overlay');
    this.titleEl = $('#ov-title');
    this.menuEl = $('#ov-menu');
    this.loadEl = $('#ov-load');
    this.screen = this.el && game.params.autostart ? null : 'title';
    this.origin = 'title';
    this.ready = false;
    this.pausedAt = 0;
    this.begun = false;
    this._confirm = null;

    // ---- containers for the screens that are built in JS
    this.panelEl = document.createElement('section'); this.panelEl.id = 'ov-panel'; this.panelEl.hidden = true;
    this.pauseEl = document.createElement('section'); this.pauseEl.id = 'ov-pause'; this.pauseEl.hidden = true;
    this.el.append(this.pauseEl, this.panelEl);
    this.hint = document.createElement('div'); this.hint.id = 'capture-hint'; this.hint.hidden = true; this.hint.textContent = 'Click to capture the mouse';
    document.body.appendChild(this.hint);

    // ---- keep the 3D scene from rendering behind the title (the 2D canvas is the backdrop)
    // and while paused the last frame just stays on screen (a few frames are still drawn after a pause, a resize or a setting change)
    const render = game.render.bind(game);
    this._dirty = 3;
    game.render = () => {
      if (this.titleActive) return;
      if (game.mode === 'paused' && (this.visible || game.map?.isOpen) && this._dirty <= 0) return;   // the full map is a sheet over the frozen frame
      this._dirty--;
      render();
    };
    window.addEventListener('resize', () => { this._dirty = 3; });
    game.events.on('settings:changed', () => { this._dirty = 3; });

    this._titleMenu();
    this._wire();
    game.debug?.addState('ui', () => ({ screen: this.screen, origin: this.origin, ready: this.ready, begun: this.begun, touch: document.body.classList.contains('touch'), mode: game.mode, locked: game.input.locked }));
    game.debug?.addAction('menu', (g, act, arg) => { this[act]?.(arg); return this.screen; });

    // the restart flag: straight into play (no title), as if Begin had been pressed
    this.ready = true;
    this.el.classList.remove('loading');
    if (this.loadEl) this.loadEl.hidden = true;
    this._sync();
    let resume = false;
    try { resume = sessionStorage.getItem(BEGIN_FLAG) === '1'; sessionStorage.removeItem(BEGIN_FLAG); } catch { /* no storage */ }
    if (resume && !game.params.autostart) setTimeout(() => this.begin({ lock: false }), 50);
  }

  /** Cards and dialogues with buttons need a free mouse: release the pointer lock while one is on screen and take it back after.
   *  (6a's conversations and the vendor dialog already do this; the fragment cards do not, so this covers all three by looking at the DOM.) */
  update(dt) {
    this._acc = (this._acc ?? 0) + dt;
    if (this._acc < 0.1) return;
    this._acc = 0;
    const g = this.game;
    const ui = !!document.querySelector('#frag:not([hidden]), #dialog:not([hidden]), #convo:not([hidden])');
    if (ui || g.modal) this.hint.hidden = true;           // the capture hint has no business over a card
    if (ui && g.input.locked) {
      this._uiRelock = true;
      try { document.exitPointerLock(); } catch { /* not locked */ }
    } else if (!ui && this._uiRelock && g.mode === 'playing') {
      this._uiRelock = false;
      if (!g.cinematics?.active) g.input.requestLock();
    }
  }

  get visible() { return !this.el.hidden; }
  get titleActive() { return this.visible && this.origin === 'title' && this.game.mode === 'menu'; }
  get touch() { return document.body.classList.contains('touch'); }

  // ------------------------------------------------------------------------------------------------ wiring
  _wire() {
    const game = this.game;
    game.events.on('mode:changed', () => this._sync());
    game.events.on('input:lock', ({ locked }) => {
      this.hint.hidden = locked || this.touch || game.mode !== 'playing' || game.params.autostart;
      if (locked) { if (game.mode === 'paused' || (game.mode === 'menu' && this.begun)) this._enterPlay(); }
      else if (game.mode === 'playing' && !game.params.autostart && !game.modal) this.pause({ viaLock: true });   // Esc: a dialogue / cutscene releases the lock on purpose
    });
    // no pointer lock available (or refused): play anyway with the keyboard
    game.events.on('input:lockerror', () => { if (game.mode === 'paused' || (game.mode === 'menu' && this.begun)) this._enterPlay(); });
    game.canvas.addEventListener('click', () => { if (game.mode === 'playing' && !game.input.locked && !this.touch && !game.modal) game.input.requestLock(); });
    game.canvas.addEventListener('pointerdown', () => { this.hint.hidden = true; });

    window.addEventListener('keydown', (e) => this._key(e), true);
    // "Play again" on an ending card reloads with a new seed; raise the restart flag so that reload goes straight into the new run
    const playAgain = (e) => { if (e.type === 'click' ? e.target.closest?.('#en-again') : (e.code === 'Enter' || e.code === 'Space') && document.querySelector('#ending #en-again')) { try { sessionStorage.setItem(BEGIN_FLAG, '1'); } catch { /* the title shows instead */ } } };
    document.addEventListener('click', playAgain, true); window.addEventListener('keydown', playAgain, true);
    document.addEventListener('visibilitychange', () => { if (document.hidden && game.mode === 'playing' && !game.params.autostart && !game.modal) this.pause(); });
    this.el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _key(e) {
    const game = this.game;
    if (this.visible) {
      if (e.code === 'Escape') {
        e.stopPropagation(); e.preventDefault();
        if (e.repeat) return;
        this.back();
        return;
      }
      if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
        e.stopPropagation(); e.preventDefault();
        this._moveFocus(e.code === 'ArrowDown' ? 1 : -1);
        return;
      }
      e.stopPropagation();       // the game's key handlers must not see menu keys (arrows, space, E ...)
      return;
    }
    // playing, no dialogue / cutscene / vision / dialog holding the game
    if (e.code === 'Escape' && game.mode === 'playing' && !game.modal && !e.defaultPrevented && !e.repeat) {
      e.preventDefault();
      this.pause();
    }
  }

  _moveFocus(d) {
    const root = this.screen === 'title' ? this.titleEl : this.screen === 'pause' ? this.pauseEl : this.panelEl;
    const items = [...root.querySelectorAll('button:not([disabled]), input[type=range], a[href]')].filter((n) => n.offsetParent !== null);
    if (!items.length) return;
    const i = items.indexOf(document.activeElement);
    const next = items[(i + d + items.length) % items.length];
    next.focus({ preventScroll: false });
  }

  // ------------------------------------------------------------------------------------------------ screens
  _sync() {
    const g = this.game, mode = g.mode;
    this._dirty = 3;
    if (mode === 'playing' || mode === 'ending') { this._hide(); return; }
    if (mode === 'paused' && g.map?.isOpen) { this._hide(); return; }                  // the full map (src/ui/map.js) pauses the game without the pause card
    if (mode === 'paused') { if (!this.visible || this.screen === null || this.origin !== 'pause') this._show('pause', 'pause'); return; }
    // menu
    if (g.params.autostart && !this.begun) { this._hide(); return; }
    if (!this.visible) this._show('title', 'title');
  }

  _show(screen, origin = this.origin) {
    this.screen = screen; this.origin = origin;
    this.el.hidden = false; this.el.classList.remove('fading');
    this.el.dataset.screen = screen; this.el.dataset.origin = origin;
    this.titleEl.hidden = screen !== 'title';
    this.pauseEl.hidden = screen !== 'pause';
    this.panelEl.hidden = !['howto', 'settings', 'credits'].includes(screen);
    document.body.classList.add('menu-open');
    if (origin === 'title') { startTitleScene(); scene?.setCalm(this.game.settings?.get('reduceFlash')); if (screen === 'title') scene?.start(); else scene?.stop(); } else scene?.stop();   // the skyline only moves on the title itself
    if (screen === 'pause') this._pauseCard();
    if (['howto', 'settings', 'credits'].includes(screen)) this._panel(screen);
    this._focusFirst();
  }

  _hide() {
    if (!this.visible) return;
    this.screen = null;
    this.el.hidden = true;
    document.body.classList.remove('menu-open');
    scene?.stop();
    this.hint.hidden = this.game.input.locked || this.touch || this.game.mode !== 'playing' || !!this.game.params.autostart;
  }

  _focusFirst() {
    const root = this.screen === 'title' ? this.titleEl : this.screen === 'pause' ? this.pauseEl : this.panelEl;
    setTimeout(() => { const b = root.querySelector('.mbtn.primary, .mbtn, .back'); if (b && this.visible) b.focus({ preventScroll: true }); }, 30);
  }

  open(kind) { this._show(kind, this.origin); }

  back() {
    const g = this.game;
    if (['howto', 'settings', 'credits'].includes(this.screen)) { this._show(this.origin === 'pause' ? 'pause' : 'title', this.origin); return; }
    if (this.screen === 'pause') { if (performance.now() - this.pausedAt > 350) this.resume(); return; }
    void g;
  }

  // ------------------------------------------------------------------------------------------------ title
  _titleMenu() {
    const items = [['begin', 'Begin', 'primary'], ['howto', 'How to play'], ['settings', 'Settings'], ['credits', 'Credits']];
    this.menuEl.innerHTML = items.map(([id, label, cls]) => `<button type="button" class="mbtn ${cls ?? ''}" data-act="${id}"><i class="ico">${ICONS[id]}</i><span>${label}</span></button>`).join('');
    this.menuEl.addEventListener('click', (e) => {
      const b = e.target.closest('.mbtn'); if (!b) return;
      this._act(b.dataset.act, b);
    });
  }

  _act(act, btn) {
    switch (act) {
      case 'begin': this.begin(); break;
      case 'howto': case 'settings': case 'credits': this.open(act); break;
      case 'resume': this.resume(); break;
      case 'restart': case 'quit': this._confirmThen(act, btn); break;
      default: break;
    }
  }

  /** Destructive buttons ask twice: the first press changes the label, the second one acts. */
  _confirmThen(act, btn) {
    if (this._confirm && this._confirm.act === act) { clearTimeout(this._confirm.t); this._confirm = null; act === 'restart' ? this.restart() : this.quitToTitle(); return; }
    if (this._confirm) { clearTimeout(this._confirm.t); this._confirm.reset(); }
    const span = btn.querySelector('span'), old = span.textContent;
    span.textContent = act === 'restart' ? 'Restart the run? Press again' : 'Quit to title? Press again';
    btn.classList.add('confirm');
    const reset = () => { span.textContent = old; btn.classList.remove('confirm'); };
    this._confirm = { act, reset, t: setTimeout(() => { reset(); this._confirm = null; }, 3200) };
  }

  begin({ lock = true } = {}) {
    const g = this.game;
    if (!this.ready || this.begun) return;
    this.begun = true;
    g.audio?.ensure?.();
    if (lock && !this.touch) g.input.requestLock();
    this.el.classList.add('fading');
    setTimeout(() => { if (g.mode === 'playing') this._hide(); }, 650);
    g.setMode('playing');          // the opening cinematic (Phase 6b) starts on this first entry into play
    if (!lock && !this.touch) this.hint.hidden = false;
  }

  _enterPlay() {
    const g = this.game;
    g.input.releaseAll(); g.input.edges.clear();      // keys pressed in the menu must not leak into the run
    g.setMode('playing');
  }

  // ------------------------------------------------------------------------------------------------ pause
  pause({ viaLock = false } = {}) {
    const g = this.game;
    if (g.mode !== 'playing' || g.modal) return;
    this.pausedAt = performance.now();
    if (!viaLock) { try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* not locked */ } }
    g.input.releaseAll();
    g.setMode('paused');
  }

  resume() {
    const g = this.game;
    if (g.mode !== 'paused') return;
    this._enterPlay();
    if (!this.touch && !g.params.autostart) g.input.requestLock();
  }

  _pauseCard() {
    const g = this.game, c = g.clock, setu = g.setu;
    const status = [
      c ? `<span>${esc(c.hhmm)}<i>day ${c.day} of 2</i></span>` : '',
      `<span>${g.player.rays}<i>/ ${g.player.maxRays} rays</i></span>`,
      setu ? `<span>${setu.dead ? 'lost' : setu.following ? 'with you' : setu.found ? 'found' : Math.round(setu.health) + '%'}<i>Setu</i></span>` : '',
    ].join('');
    const items = [['resume', 'Resume', 'primary'], ['howto', 'How to play'], ['settings', 'Settings'], ['restart', 'Restart'], ['quit', 'Quit to title']];
    this.pauseEl.innerHTML = `<div class="pause-card"><p class="kicker">municipal notice</p><h2>Paused</h2><div class="pause-status">${status}</div>` +
      `<nav class="menu">${items.map(([id, label, cls]) => `<button type="button" class="mbtn ${cls ?? ''}" data-act="${id}"><i class="ico">${ICONS[id]}</i><span>${label}</span></button>`).join('')}</nav>` +
      `<p class="pause-foot">${this.touch ? 'Tap the pause button to come back here.' : 'Esc resumes.'}</p></div>`;
    this._confirm = null;
    this.pauseEl.querySelector('.menu').addEventListener('click', (e) => { const b = e.target.closest('.mbtn'); if (b) this._act(b.dataset.act, b); });
  }

  _reloadUrl() {
    const u = new URL(location.href);
    u.searchParams.set('seed', String(this.game.params.seed));
    return u.toString();
  }

  restart() {
    try { sessionStorage.setItem(BEGIN_FLAG, '1'); } catch { /* the title will show instead */ }
    location.href = this._reloadUrl();
  }

  quitToTitle() {
    try { sessionStorage.removeItem(BEGIN_FLAG); } catch { /* nothing to clear */ }
    location.href = this._reloadUrl();
  }

  // ------------------------------------------------------------------------------------------------ panels
  _panel(kind) {
    const titles = { howto: 'How to play', settings: 'Settings', credits: 'Credits' };
    const body = kind === 'howto' ? howToHtml({ touch: this.touch }) : kind === 'settings' ? '<div class="set-body"></div>' : this._creditsHtml();
    this.panelEl.innerHTML = `<div class="panel panel-${kind}"><header class="panel-head"><button type="button" class="back" aria-label="Back"><i class="ico">${ICONS.back}</i><span>Back</span></button><h2>${titles[kind]}</h2></header><div class="panel-scroll">${body}</div></div>`;
    $('.back', this.panelEl).addEventListener('click', () => this.back());
    $('.panel-scroll', this.panelEl).scrollTop = 0;
    if (kind === 'settings') this._settingsUi($('.set-body', this.panelEl));
  }

  _creditsHtml() {
    return `<div class="credits">
      <p class="kicker">a game from a story</p>
      <h3>GRAHAN <span>(Children of the Sun)</span></h3>
      <dl>
        <dt>Story</dt><dd>Sarat T. Rao</dd>
        <dt>Concept deck</dt><dd>Sarat Talluri Rao<br>Mohammed Ali Rukadikar</dd>
      </dl>
      <p>Mumbai, 2049. Towers, flyovers and skywalks keep the sun from the ground. A boy who has never seen a sunrise has fallen into the dark, and his blind sister has his medicine.</p>
      <p class="small">Built to run in a browser with no downloads: three.js for the city, and every sound, from the rain to the raga, is synthesised live with the Web Audio API.</p>
      <p class="scrawl">a day celebrating light</p></div>`;
  }

  _settingsUi(root) {
    const s = this.game.settings;
    const touch = this.touch;
    const fmt = (def, v) => def.fmt === 'pct' ? Math.round(v * 100) + '%' : def.fmt === 'x' ? v.toFixed(2).replace(/0$/, '') + '×' : def.fmt === 'deg' ? Math.round(v) + '°' : String(v);
    let html = '';
    for (const [gid, gname] of GROUPS) {
      const rows = Object.entries(DEFS).filter(([, d]) => d.group === gid && (!d.touchOnly || touch));
      if (!rows.length) continue;
      html += `<section class="set-group"><h3>${gname}</h3>`;
      for (const [key, d] of rows) {
        const v = s.get(key);
        html += `<div class="set-row" data-key="${key}"><div class="set-lab"><label>${esc(d.label)}</label>${d.hint ? `<small>${esc(d.hint)}</small>` : ''}</div>`;
        if (d.type === 'range') html += `<div class="set-ctl"><input type="range" min="${d.min}" max="${d.max}" step="${d.step}" value="${v}" aria-label="${esc(d.label)}"><output>${fmt(d, v)}</output></div>`;
        else if (d.type === 'toggle') html += `<div class="set-ctl"><button type="button" class="tog" role="switch" aria-checked="${v}" aria-label="${esc(d.label)}"><i></i><span>${v ? 'On' : 'Off'}</span></button></div>`;
        else html += `<div class="set-ctl"><div class="seg" role="radiogroup" aria-label="${esc(d.label)}">${d.options.map(([o, name]) => `<button type="button" role="radio" data-v="${esc(o)}" aria-checked="${String(o) === String(v)}">${esc(name)}</button>`).join('')}</div></div>`;
        html += '</div>';
      }
      html += '</section>';
    }
    html += `<div class="set-foot"><button type="button" class="mbtn small" data-reset><i class="ico">${ICONS.restart}</i><span>Reset to defaults</span></button><p>${s.persisted ? 'Saved on this device.' : 'These will not be remembered on this device.'}</p></div>`;
    root.innerHTML = html;
    root.addEventListener('input', (e) => {
      const row = e.target.closest('.set-row'); if (!row || e.target.type !== 'range') return;
      const key = row.dataset.key, v = s.set(key, Number(e.target.value));
      row.querySelector('output').textContent = fmt(DEFS[key], v);
      root.querySelector('.set-foot p').textContent = s.persisted ? 'Saved on this device.' : 'These will not be remembered on this device.';
    });
    root.addEventListener('click', (e) => {
      if (e.target.closest('[data-reset]')) { s.reset(); this._panel('settings'); return; }
      const row = e.target.closest('.set-row'); if (!row) return;
      const key = row.dataset.key, d = DEFS[key];
      if (d.type === 'toggle' && e.target.closest('.tog')) {
        const v = s.set(key, !s.get(key)), b = row.querySelector('.tog');
        b.setAttribute('aria-checked', String(v)); b.querySelector('span').textContent = v ? 'On' : 'Off';
      } else if (d.type === 'choice' && e.target.closest('[data-v]')) {
        const b = e.target.closest('[data-v]'); s.set(key, b.dataset.v);
        const kept = s.get(key);
        for (const o of row.querySelectorAll('[data-v]')) o.setAttribute('aria-checked', String(String(o.dataset.v) === String(kept)));
      }
      root.querySelector('.set-foot p').textContent = s.persisted ? 'Saved on this device.' : 'These will not be remembered on this device.';
    });
  }
}
