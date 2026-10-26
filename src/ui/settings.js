// Player settings: one small store, persisted to localStorage (every access in try/catch, so private windows and blocked
// storage just mean "defaults, not remembered"), applied to the game through the APIs the other phases already expose.
//
//   game.settings.get(key)            current value
//   game.settings.set(key, value)     validates, stores, applies, emits; returns the value that was kept
//   game.settings.on(fn | key, fn)    change listener (returns an unsubscribe function); the event bus also gets
//                                     'settings:changed' {key, value} and 'settings:ready'
//   game.settings.reset()             back to the defaults
//   game.settings.all()               a plain copy
//   game.settings.defs                the schema the settings panel draws (see DEFS)
//
// Keys and what they drive
//   volMaster volMusic volSfx volVoice   game.audio.setVolume('master'|'music'|'sfx'|'voice', v)       0..1
//   paVoice                              game.pa.voiceEnabled (the announcements stay captioned either way)
//   captions                             game.audio.captionSounds  ([ A dog barks ] lines in the feed)
//   mouseSens   touchSens                multipliers on game.input.sensitivity / touchSensitivity       0.4..2.5
//   invertY                              game.input.invertY
//   fov                                  game.camera.fov (60..100); re-applied after cutscenes end
//   quality                              'low' | 'medium' | 'high': renderer pixel ratio cap (0.75 / 1 / 1.5) and camera.far
//                                        (310 / 360 / 400; the sky dome is 300 m, so it must stay above that). Phase 7b's
//                                        world can also read game.settings.get('quality') / ('drawDistance') for fog and culling.
//   runMinutes                           'standard' (the default run length) | 24 | 45 | 60. Read at boot (applyBootParams), so it
//                                        applies from the NEXT run; ?minutes=N in the URL always wins.
//   reduceFlash                          tones glitches, flashes and visions down (body.reduce-flash in the stylesheet, and
//                                        screenfx.glitch becomes a no-op). Defaults to on when the OS asks for reduced motion.
//   minimap                              the local map in the corner of the HUD (src/ui/map.js; on by default)
//   viewDefault                          'first' | 'third': game.view.set() when a run begins
//
// Phase 7b: read `game.settings?.get?.('key')` with a default; nothing here is required to exist.
import { DEFAULT_MINUTES } from '../core/params.js';

const STORE_KEY = 'grahan.settings.v1';
export const QUALITY = {
  low: { pixelRatio: 0.75, far: 310, drawDistance: 0.7 },
  medium: { pixelRatio: 1, far: 360, drawDistance: 0.85 },
  high: { pixelRatio: 1.5, far: 400, drawDistance: 1 },
};

function prefersReducedMotion() {
  try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
}
function coarsePointer() {
  try { return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches; } catch { return false; }
}

/** The schema: type, range/options, default, label, group. The settings panel is generated from this. */
export const DEFS = {
  volMaster: { group: 'sound', type: 'range', min: 0, max: 1, step: 0.05, def: 0.9, label: 'Master volume', fmt: 'pct' },
  volMusic: { group: 'sound', type: 'range', min: 0, max: 1, step: 0.05, def: 0.5, label: 'Music', fmt: 'pct' },
  volSfx: { group: 'sound', type: 'range', min: 0, max: 1, step: 0.05, def: 0.95, label: 'Sound effects', fmt: 'pct' },
  volVoice: { group: 'sound', type: 'range', min: 0, max: 1, step: 0.05, def: 0.95, label: 'Voices and singing', fmt: 'pct' },
  speech: { group: 'sound', type: 'toggle', def: true, label: 'Character voices', hint: 'The people you meet speak their lines. The words always appear on screen.' },
  paVoice: { group: 'sound', type: 'toggle', def: true, label: 'PA announcer voice', hint: 'The municipal voice. The words always appear on screen.' },
  captions: { group: 'sound', type: 'toggle', def: true, label: 'Captions for sounds', hint: '[ A dog barks ] lines in the feed.' },
  mouseSens: { group: 'controls', type: 'range', min: 0.4, max: 2.5, step: 0.05, def: 1, label: 'Mouse sensitivity', fmt: 'x' },
  touchSens: { group: 'controls', type: 'range', min: 0.4, max: 2.5, step: 0.05, def: 1, label: 'Touch look sensitivity', fmt: 'x', touchOnly: true },
  invertY: { group: 'controls', type: 'toggle', def: false, label: 'Invert Y axis' },
  fov: { group: 'display', type: 'range', min: 60, max: 100, step: 1, def: 75, label: 'Field of view', fmt: 'deg' },
  quality: { group: 'display', type: 'choice', options: [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], def: 'high', label: 'Graphics quality', hint: 'Resolution and draw distance.' },
  minimap: { group: 'display', type: 'toggle', def: true, label: 'Minimap', hint: 'A small map of the level you are on, turning with your view. M opens the full map.' },
  reduceFlash: { group: 'display', type: 'toggle', def: false, label: 'Reduce flashing', hint: 'Tones down glitches, flashes and visions.' },
  viewDefault: { group: 'display', type: 'choice', options: [['first', 'First person'], ['third', 'Third person']], def: 'first', label: 'Default view', hint: 'V switches in game.' },
  runMinutes: { group: 'run', type: 'choice', options: [[24, '24 min'], ['standard', `${Math.round(DEFAULT_MINUTES)} min`], [45, '45 min'], [60, '60 min']], def: 'standard', label: 'Run length', hint: 'Real minutes from first light to the flood. Applies to the next run.' },
};
export const GROUPS = [['sound', 'Sound'], ['controls', 'Controls'], ['display', 'Display'], ['run', 'Run']];

function defaults() {
  const d = {};
  for (const [k, def] of Object.entries(DEFS)) d[k] = def.def;
  if (coarsePointer()) d.quality = 'medium';              // phones start one notch down
  if (prefersReducedMotion()) d.reduceFlash = true;
  return d;
}

function coerce(key, v) {
  const def = DEFS[key];
  if (!def) return undefined;
  if (def.type === 'range') { const n = Number(v); return Number.isFinite(n) ? Math.min(def.max, Math.max(def.min, Number((Math.round(n / def.step) * def.step).toFixed(4)))) : def.def; }
  if (def.type === 'toggle') return !!v;
  if (def.type === 'choice') { const hit = def.options.find(([o]) => String(o) === String(v)); return hit ? hit[0] : def.def; }
  return v;
}

function readStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function writeStore(obj) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(obj)); return true; } catch { return false; }
}

/** The run length in real minutes the stored setting asks for, or null for "use the default". Safe to call before the game exists. */
export function storedRunMinutes() {
  const s = readStore();
  const v = s && s.runMinutes;
  const n = Number(v);
  return v != null && v !== 'standard' && Number.isFinite(n) && n > 0 ? n : null;
}

/** Called from boot, before the Game is created: ?minutes=N wins, otherwise the stored run length applies. */
export function applyBootParams(params) {
  if (params.minutesGiven) return params;
  const m = storedRunMinutes();
  if (m) params.minutes = m;
  return params;
}

export class SettingsSystem {
  constructor() {
    this.defs = DEFS;
    this.groups = GROUPS;
    this.values = defaults();
    this.persisted = false;           // true once a read from localStorage succeeded
    this._listeners = new Set();
    const stored = readStore();
    if (stored && typeof stored === 'object') {
      this.persisted = true;
      for (const k of Object.keys(DEFS)) if (k in stored) this.values[k] = coerce(k, stored[k]);
    }
  }

  init(game) {
    this.game = game;
    game.settings = this;
    this._wrapGlitch();
    game.events.on('game:init', () => this.applyAll());
    game.events.on('mode:changed', ({ mode, prev }) => {
      if (mode === 'playing' && prev === 'menu') this._applyViewDefault();         // a run begins
      if (mode === 'playing') this.applyCamera();                                  // the cutscene toolkit leaves fov where it was; pin it back
    });
    game.events.on('cinematic:end', () => this.applyCamera());
    game.events.on('vision:end', () => this.applyCamera());
    window.addEventListener('resize', () => this.applyQuality());
    game.debug?.addState('settings', () => ({ ...this.values, persisted: this.persisted, fovNow: game.camera.fov, pixelRatio: game.renderer.getPixelRatio(), far: game.camera.far }));
    game.debug?.addAction('settingsSet', (g, k, v) => this.set(k, v));
    game.debug?.addAction('settingsReset', () => { this.reset(); return this.all(); });
    this.applyAll();
  }

  get(key) { return this.values[key]; }
  all() { return { ...this.values }; }

  set(key, value) {
    if (!(key in DEFS)) return undefined;
    const v = coerce(key, value);
    if (v === this.values[key]) return v;
    this.values[key] = v;
    this._save();
    this.apply(key);
    this._emit(key, v);
    return v;
  }

  reset() {
    const d = defaults();
    for (const k of Object.keys(DEFS)) this.set(k, d[k]);
  }

  /** Listen for changes: on(fn) for all keys, on('fov', fn) for one. Returns an unsubscribe function. */
  on(a, b) {
    const rec = typeof a === 'function' ? { key: null, fn: a } : { key: a, fn: b };
    this._listeners.add(rec);
    return () => this._listeners.delete(rec);
  }

  _emit(key, value) {
    for (const l of [...this._listeners]) {
      if (l.key === null || l.key === key) { try { l.fn(value, key); } catch (e) { console.error(e); } }
    }
    this.game?.events.emit('settings:changed', { key, value });
  }

  _save() { this.persisted = writeStore(this.values) || this.persisted; }

  applyAll() {
    for (const k of Object.keys(DEFS)) this.apply(k);
    this.game?.events.emit('settings:ready', this.all());
  }

  apply(key) {
    const g = this.game, v = this.values[key];
    if (!g) return;
    try {
      switch (key) {
        case 'volMaster': g.audio?.setVolume?.('master', v); break;
        case 'volMusic': g.audio?.setVolume?.('music', v); break;
        case 'volSfx': g.audio?.setVolume?.('sfx', v); break;
        case 'volVoice': g.audio?.setVolume?.('voice', v); break;
        case 'paVoice': if (g.pa) g.pa.voiceEnabled = !!v; break;
        case 'captions': if (g.audio) g.audio.captionSounds = !!v; break;
        case 'mouseSens': g.input.sensitivity = 0.0022 * v; break;
        case 'touchSens': g.input.touchSensitivity = 0.0042 * v; break;
        case 'invertY': g.input.invertY = !!v; break;
        case 'fov': this.applyCamera(); break;
        case 'quality': this.applyQuality(); break;
        case 'minimap': g.map?.setMinimap?.(!!v); break;
        case 'reduceFlash': document.body.classList.toggle('reduce-flash', !!v); break;
        case 'viewDefault': if (g.mode === 'menu') this._applyViewDefault(); break;
        case 'runMinutes': break;                       // read at the next boot (applyBootParams)
      }
    } catch (e) { console.warn('setting', key, e); }
  }

  /** The camera's fov (not while a cutscene or a vision owns it). */
  applyCamera() {
    const g = this.game; if (!g) return;
    if (g.cinematics?.active || g.visionSystem?.active) return;
    const fov = this.values.fov;
    if (Math.abs(g.camera.fov - fov) > 1e-3) { g.camera.fov = fov; g.camera.updateProjectionMatrix(); }
  }

  applyQuality() {
    const g = this.game; if (!g) return;
    const q = QUALITY[this.values.quality] ?? QUALITY.high;
    const dpr = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
    if (Math.abs(g.renderer.getPixelRatio() - dpr) > 1e-3) { g.renderer.setPixelRatio(dpr); g.resize(); }
    if (g.camera.far !== q.far) { g.camera.far = q.far; g.camera.updateProjectionMatrix(); }
    this.drawDistance = q.drawDistance;                       // 1 = full; for systems that want to scale their own culling
  }

  _applyViewDefault() {
    const g = this.game;
    try { g.view?.set?.(this.values.viewDefault === 'third' ? 'third' : 'first'); } catch { /* arena mode */ }
  }

  /** screenfx.glitch is a Phase 3 service other systems call freely; with "reduce flashing" it does nothing. */
  _wrapGlitch() {
    const g = this.game;
    const fx = g.screenfx;
    if (!fx || fx._glitchWrapped) return;
    const orig = fx.glitch.bind(fx);
    fx.glitch = (ms) => { if (this.values.reduceFlash) return; orig(ms); };
    fx._glitchWrapped = true;
  }
}
