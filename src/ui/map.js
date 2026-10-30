// The map system (Phase 8A): the minimap in the corner of the HUD, the full map sheet (M, or the touch button, or a tap on the
// minimap), the warmth cue on the screen edge and the first-time hints. `game.map`:
//
//   game.map.open(tab?) / close() / toggle()      the full map; `tab` is 'U'|'G'|'L1'|'L2'|'L3' (default: the level you are on)
//   game.map.isOpen                                 true while the sheet is up (the game is paused: mode 'paused')
//   game.map.setMinimap(on)                         the "Minimap" setting (settings.js drives it; on by default)
//   game.map.collect(level)                         the live marks of one level (shared by both maps), see below
//   game.map.discovered                             Set of place ids the player knows (names appear on the full map)
//   game.map.target()                               where the primary objective is: {id, text, label, x, z, level, lead, dist, dir, dirShort, change, hint} or null (the maps and the HUD line)
//   game.map.lead                                   the last lead to Setu: {id, x, y, z, level} or null (never his real position)
//   game.map.warmth                                 the warmth cue (src/ui/warmth.js)
//   game.map.snapshot()                             what state().map prints
//
// Pausing: opening sets game.mode to 'paused' (the simulation stops, like the pause menu) but keeps the overlay shell's pause card
// from showing (overlay.js checks `game.map.isOpen`), and releases the pointer lock; closing puts the mode back and takes the lock
// again on desktop. It cannot open during a dialogue, a cutscene, a vision, an ending or the title.
import { Minimap } from './minimap.js';
import { FullMap } from './fullmap.js';
import { Warmth } from './warmth.js';
import { LEVELS, PLACES, RAIL, leadSpot, objectiveSpots, sunSources, compassOf, levelHint } from './mapdata.js';
import { levelAt } from '../world/levels.js';

const MAP_ICON = '<svg viewBox="0 0 24 24"><path d="M3.5 6.5 L9 4.5 L15 6.5 L20.5 4.5 V17.5 L15 19.5 L9 17.5 L3.5 19.5 Z M9 4.5 V17.5 M15 6.5 V19.5"/></svg>';
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const fmtEta = (s) => (s == null || !isFinite(s) ? '-' : s < 5 ? 'now' : s < 60 ? `${Math.round(s)}s` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`);
const LEAD_STATE = { trail: 1, learn: 2 };

export class MapSystem {
  init(game) {
    this.game = game;
    game.map = this;
    this.isOpen = false;
    this.minimapOn = true;
    this.discovered = new Set(PLACES.filter((p) => p.always).map((p) => p.id));
    this.lead = null; this.leadVia = null;
    this._dt = 0; this._tDisc = 0; this._tWarm = 0; this._lastDraw = -1; this._force = true; this._shown = null;
    this._hinted = false; this._playT = 0;

    // ---- the minimap in the HUD
    const hud = document.getElementById('hud');
    const mm = this.el = document.createElement('div');
    mm.className = 'minimap'; mm.hidden = true;
    mm.setAttribute('role', 'button'); mm.setAttribute('aria-label', 'Local map. Press M or tap to open the city map.');
    mm.innerHTML = '<div class="mm-bezel"><div class="mm-top"><i class="mm-led"></i><span class="mm-tag">SKYGRID NAV</span><span class="mm-hdg">000°</span></div>'
      + '<div class="mm-screen"><canvas class="mm-canvas"></canvas><i class="mm-sweep"></i><i class="mm-glass"></i></div>'
      + '<div class="mm-bot"><span class="mm-pos">X+000 Z+000</span></div><s></s><s></s><s></s><s></s></div>'
      + '<div class="mm-cap"><b class="mm-lvl">G</b><span class="mm-name">Ground</span><kbd class="mm-key">M</kbd></div>';
    hud.appendChild(mm);
    this.canvas = mm.querySelector('canvas'); this.lvlEl = mm.querySelector('.mm-lvl'); this.nameEl = mm.querySelector('.mm-name');
    this.mini = new Minimap(this.canvas, { hdg: mm.querySelector('.mm-hdg'), pos: mm.querySelector('.mm-pos') });
    mm.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.open(); });
    mm.addEventListener('contextmenu', (e) => e.preventDefault());

    this.warmth = new Warmth(game);
    this.full = new FullMap(game, this);

    // ---- keys: M opens and closes (Esc closes); the sheet handles its own tab and zoom keys
    window.addEventListener('keydown', (e) => this._key(e), true);

    // ---- what the player has been told about Setu (never where he really is)
    const ev = game.events;
    ev.on('trail:points', ({ to }) => this._setLead(leadSpot(to), 'trail'));
    ev.on('story:learn', ({ topic, lead }) => { if (topic === 'setu' && lead) this._setLead(leadSpot(lead), 'learn'); });
    ev.on('setu:found', () => { this.lead = null; });
    ev.on('game:reset', () => { this.lead = null; this.discovered = new Set(PLACES.filter((p) => p.always).map((p) => p.id)); });
    ev.on('settings:changed', ({ key, value }) => { if (key === 'minimap') this.setMinimap(value); });
    ev.on('settings:ready', (all) => this.setMinimap(all.minimap !== false));
    ev.on('mode:changed', () => { this._force = true; });
    ev.on('level:changed', () => { this._force = true; });

    // ---- draw just before each frame (also in tests that step the simulation by hand)
    const render = game.render.bind(game);
    game.render = () => { try { this._frame(); } catch (e) { if ((this._err = (this._err ?? 0) + 1) < 4) console.error('[map]', e); } render(); };

    // ---- debug
    const d = game.debug;
    d?.addState('map', () => this.snapshot());
    d?.addAction('mapOpen', (g, tab) => { const ok = this.open(tab); return { ok, open: this.isOpen, tab: this.full.level }; });
    d?.addAction('mapClose', () => { this.close(); return { open: this.isOpen, mode: game.mode }; });
    d?.addAction('mapTab', (g, tab) => { this.full.setLevel(tab); return this.full.level; });
    d?.addAction('mapView', (g, o) => { this.full.setView(o); return this.full.snapshot(); });
    d?.addAction('mapRedraw', () => { this._force = true; this._frame(); return this.mini.stats; });
    d?.addSetter('minimap', (g, v) => g.settings?.set('minimap', !!v));
  }

  // ------------------------------------------------------------------------------------------------ opening and closing
  canOpen() {
    const g = this.game;
    return !this.isOpen && g.mode === 'playing' && !g.modal && !g.cinematics?.active && !g.visionSystem?.active && !g.menu?.visible && !g.endings?.current;
  }

  open(tab) {
    if (!this.canOpen()) return false;
    const g = this.game;
    this.isOpen = true;
    g.input.releaseAll(); g.input.edges.clear();
    g.setMode('paused');                                            // after isOpen: the overlay shell leaves its pause card hidden
    try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* not locked */ }
    this.full.open(tab && LEVELS.includes(tab) ? tab : g.player.level);
    document.body.classList.add('map-open');
    this._apply();
    g.events.emit('map:open', { tab: this.full.level });
    return true;
  }

  close() {
    if (!this.isOpen) return;
    const g = this.game;
    this.full.close();
    this.isOpen = false;
    document.body.classList.remove('map-open');
    g.input.releaseAll(); g.input.edges.clear();
    g.setMode('playing');
    if (!g.menu?.touch && !g.params.autostart) g.input.requestLock();
    this._force = true; this._apply();
    g.events.emit('map:close', {});
  }

  toggle() { if (this.isOpen) this.close(); else this.open(); }

  _key(e) {
    if (e.code === 'KeyM' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const t = e.target;
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if (this.isOpen) { e.preventDefault(); e.stopPropagation(); this.close(); }
      else if (this.canOpen()) { e.preventDefault(); e.stopPropagation(); this.open(); }
      return;
    }
    if (!this.isOpen) return;
    // while the sheet is up the game does not see the keyboard
    if (e.code === 'Escape') { e.preventDefault(); e.stopPropagation(); if (!e.repeat) this.close(); return; }
    if (this.full.key(e)) { e.preventDefault(); e.stopPropagation(); return; }
    if (e.code === 'Tab') return;                                   // keep the browser's focus order for the buttons
    e.stopPropagation();
  }

  setMinimap(on) {
    this.minimapOn = on !== false;
    this._force = true; this._apply();
  }

  // ------------------------------------------------------------------------------------------------ Setu's lead
  _setLead(spot, via) {
    if (!spot || this.game.setu?.found || this.game.setu?.following) return;
    const rank = LEAD_STATE[via] ?? 0;
    this.lead = spot; this.leadVia = via; void rank;
  }

  // ------------------------------------------------------------------------------------------------ live marks
  /** The yaw of the view (0 faces -Z, + turns left), from the camera so third person and cutscene cameras are followed too. */
  viewYaw() {
    const q = this.game.camera.quaternion, x = q.x, y = q.y, z = q.z, w = q.w;
    // forward = (0,0,-1) rotated by q
    const fx = -2 * (x * z + w * y), fz = -(1 - 2 * (x * x + y * y));
    if (fx * fx + fz * fz < 1e-4) return this.game.player.yaw;
    return Math.atan2(-fx, -fz);
  }

  /** Everything live on one level, as plain arrays: sunlight, lifts, trains, people with you, objectives, fragments, the last lead. */
  collect(level) {
    const g = this.game, p = g.player, w = g.world;
    const out = { level, sun: [], later: null, lifts: [], trains: [], party: [], objectives: [], fragments: [], lead: null, eta: null };
    out.sun = sunSources(w, level);
    const I = w.sunShafts?.intensity ?? 0;
    if (I < 0.3 && level !== 'U') out.later = w.sunShafts.filter((s) => s.level === level);
    // lifts with a stop on this level
    for (const l of g.lifts?.state?.() ?? []) if (l.stops.some((s) => s.level === level)) out.lifts.push(l);
    // the Harbour Line (G)
    if (level === 'G' && g.transit?.enabled) {
      for (const t of g.transit.trains) if (t.active && t.state !== 'parked') out.trains.push({ id: t.id, x: t.x, z: t.z, dir: t.dir, moving: t.v > 0.5, state: t.state, at: t.at });
    }
    // people with you: Jeetu once he has joined, Mithi when you are Jeetu, Setu only once he follows
    const party = g.party;
    if (party?.jeetu) {
      if (party.active === 'jeetu') { const m = party.bodies?.mithi?._pos; if (m) out.party.push({ tag: 'M', color: '#cfe3f5', x: m.x, z: m.z, level: levelAt(m.y), y: m.y }); }
      else { const j = party.jeetu._pos ?? party.jeetu.pos; out.party.push({ tag: 'J', color: '#ff9f8a', x: j.x, z: j.z, level: levelAt(j.y), y: j.y }); }
    }
    if (g.setu?.following && !g.setu.dead) { const s = g.setu.pos; out.party.push({ tag: 'S', color: '#ffdf9a', x: s.x, z: s.z, level: levelAt(s.y), y: s.y }); }
    // where you are going
    const obj = g.objectives;
    const ids = [obj?.primary?.id, ...(obj?.optional ?? []).map((o) => o.id)].filter(Boolean);
    const seen = new Set();
    const tg = out.target = this.target();
    for (const id of ids) for (const sp of objectiveSpots(id, g.flags)) { if (sp.label === 'last lead') continue; const k = sp.label + sp.x; if (!seen.has(k)) { seen.add(k); out.objectives.push({ ...sp, primary: id === obj?.primary?.id, main: !!tg && !tg.lead && sp.label === tg.label && sp.x === tg.x }); } }
    // fragments already found
    const found = g.fragments?.found;
    if (found && found.size) for (const s of w.fragmentSpots) if (found.has(s.id) && s.level === level) out.fragments.push({ x: s.x, z: s.z, id: s.id });
    // the last lead (a hint, not a position), never while Setu is with you
    if (!g.setu?.found && !g.setu?.following) out.lead = this.lead ?? leadSpot(g.flags.setuLead);
    // the next train at the nearest station
    if (level === 'G' && p.level === 'G' && g.transit?.stations) {
      let best = null, bd = 76;
      for (const st of g.transit.stations) { const d = Math.hypot(st.x - p.pos.x, RAIL.zc - p.pos.z); if (d < bd) { bd = d; best = st; } }
      if (best) {
        const e = best.next?.east?.eta ?? best.eta?.east, wv = best.next?.west?.eta ?? best.eta?.west;
        out.eta = g.transit.inService?.(g.clock?.hour ?? 10) === false ? `${best.name.toUpperCase()}  no trains now` : `${best.name.toUpperCase()}   E ${fmtEta(e)}  ·  W ${fmtEta(wv)}`;
      }
    }
    return out;
  }

  /**
   * Where the primary objective is, from where the player stands: the spot of it nearest to you (on your level first), or Setu's last lead when
   * the objective is to find him. dist is in metres, rounded to 5 (so text built from it does not flicker); `change` is 'up'/'down' when
   * another level is needed. null when the objective has no place on the map.
   */
  target() {
    const g = this.game, p = g.player, id = g.objectives?.primary?.id;
    if (!id || !p) return null;
    let sp = null, lead = false;
    if (id === 'underground' || id === 'search') {                       // the objective is Setu, and all the map knows is the last lead
      if (g.setu?.found || g.setu?.following) return null;
      sp = this.lead ?? leadSpot(g.flags.setuLead); lead = true;
      if (!sp) return null;
      sp = { x: sp.x, z: sp.z, level: sp.level, label: "Setu's last lead" };
    } else {
      let bd = 1e9;
      for (const c of objectiveSpots(id, g.flags)) { const d = Math.hypot(c.x - p.pos.x, c.z - p.pos.z) + (c.level === p.level ? 0 : 400); if (d < bd) { bd = d; sp = c; } }
      if (!sp) return null;
    }
    const dx = sp.x - p.pos.x, dz = sp.z - p.pos.z, d = Math.hypot(dx, dz), [dir, dirShort] = compassOf(dx, dz), hint = levelHint(p.level, sp.level);
    return { id, text: g.objective?.text ?? '', label: sp.label, x: sp.x, z: sp.z, level: sp.level, lead, dist: Math.round(d / 5) * 5, dir, dirShort, change: hint ? (hint.startsWith('go up') ? 'up' : 'down') : null, hint };
  }

  _frameData() {
    const g = this.game, p = g.player, level = p.level;
    const f = this.collect(level);
    f.x = p.pos.x; f.z = p.pos.z; f.yaw = this.viewYaw(); f.fov = g.camera.fov; f.hour = g.clock?.hour ?? 10;
    f.inSun = !!g.world.isInSunlight?.(p.pos); f.rays = p.rays; f.permit = !!g.flags.bridgePermit; f.calm = !!g.settings?.get?.('reduceFlash');
    return f;
  }

  // ------------------------------------------------------------------------------------------------ update and draw
  update(dt, game) {
    const p = game.player;
    this._playT += dt;
    // places the player has seen
    this._tDisc -= dt;
    if (this._tDisc <= 0) {
      this._tDisc = 0.5;
      const f = game.flags, lv = p.level;
      for (const pl of PLACES) {
        if (this.discovered.has(pl.id)) continue;
        let hit = !!(pl.known && f[pl.known]);
        if (!hit && pl.r && pl.level === lv && Math.hypot(pl.x - p.pos.x, pl.z - p.pos.z) < pl.r) hit = true;
        if (hit) { this.discovered.add(pl.id); game.events.emit('map:discovered', { id: pl.id, name: pl.en }); }
      }
    }
    // the warmth cue
    this._tWarm -= dt;
    if (this._tWarm <= 0) { this._tWarm = 0.1; this.warmth.compute(this.viewYaw()); this._hint(); try { this._jeetuHint(); } catch { /* a hint is never worth a crash */ } }
    // the first-time hint for the map
    if (!this._hinted && this._playT > 22 && game.mode === 'playing' && !game.modal && !game.cinematics?.active) {
      this._hinted = true;
      const touch = game.menu?.touch;
      game.messages?.say(touch ? 'Tap the little map for the city map.' : 'Press M for the city map.', { kind: 'system', ttl: 6 });
    }
  }

  /** Jeetu has eyes: when she is low on rays and he is with her, he now and then points out the light (a shaft, or the way up) in words. */
  _jeetuHint() {
    const g = this.game, w = this.warmth, t = w.target;
    if (!g.party?.jeetu || g.party.active !== 'mithi' || !t || w.inSun || g.player.rays > 4) return;
    if (g.mode !== 'playing' || g.modal || g.cinematics?.active || g.time - (this._jeetuAt ?? -999) < 80) return;
    this._jeetuAt = g.time;
    const b = w.bearing, a = Math.abs(b), side = b > 0 ? 'right' : 'left';
    const dir = a < 28 ? 'straight ahead' : a < 70 ? `ahead, to the ${side}` : a < 115 ? `to your ${side}` : a < 155 ? `behind you, to the ${side}` : 'behind you';
    const m = Math.round(w.dist / 5) * 5;
    const text = t.kind === 'shaft' ? `Didi! Sunlight, ${dir}. Maybe ${Math.max(5, m)} metres.`
      : t.kind === 'lamp' ? `Didi, there is a lamp that still glows, ${dir}.`
        : t.via === 'lift' ? `Didi, a lift, ${dir}. It goes up where it is bright.` : `Didi, stairs up, ${dir}. The sun is up there, I can see the glow.`;
    g.messages?.say(`Jeetu: "${text}"`, { kind: 'story', ttl: 7, speaker: 'Jeetu' });
    g.events.emit('map:jeetu-hint', { kind: t.kind, bearing: Math.round(b) });
  }

  /** "Warmth, up there. Find the light." the first time the rays run low. */
  _hint() {
    const g = this.game;
    if (g.flags.warmthHint || g.player.rays > 4 || !this.warmth.target || g.modal || g.mode !== 'playing' || g.cinematics?.active) return;
    if (this.warmth.inSun) return;
    g.flags.warmthHint = true;
    g.messages?.say('Warmth, up there. Find the light.', { kind: 'story', ttl: 7 });
    g.events.emit('map:warmth-hint', {});
  }

  _apply() {
    const g = this.game;
    const hide = this.isOpen || !this.minimapOn || g.cinematics?.active || g.endings?.current || g.mode === 'ending' || (g.mode === 'menu' && !g.params.autostart);
    const show = !hide;
    if (show !== this._shown) { this._shown = show; this.el.hidden = !show; document.body.classList.toggle('minimap-on', show); }
  }

  _frame() {
    const g = this.game, now = performance.now();
    this._apply();
    // the glow follows the view every frame (it is a transform on one element)
    if (g.mode === 'playing' && !g.cinematics?.active && !g.visionSystem?.active && !g.endings?.current) this.warmth.paint();
    else if (!this.warmth.el.hidden) this.warmth.el.hidden = true;
    if (!this._shown) return;
    if (!this._force && now - this._lastDraw < 100) return;
    this._lastDraw = now; this._force = false;
    const f = this._frameData();
    if (f.level !== this._lvl) { this._lvl = f.level; this.lvlEl.textContent = f.level; this.nameEl.textContent = LEVEL_NAMES[f.level]; }
    this.mini.draw(f, now / 1000);
  }

  snapshot() {
    const g = this.game, f = this.mini.stats;
    return {
      open: this.isOpen, tab: this.isOpen ? this.full.level : null, minimap: this.minimapOn, minimapShown: !!this._shown,
      level: g.player?.level, discovered: [...this.discovered].filter((id) => !PLACES.find((p) => p.id === id)?.always), lead: this.lead && { id: this.lead.id, level: this.lead.level }, leadVia: this.leadVia, target: ((t) => t && { id: t.id, label: t.label, level: t.level, dist: t.dist, dir: t.dir, change: t.change })(this.target()),
      warmth: this.warmth.snapshot(), mini: { redraws: f.redraws, cacheBuilds: f.cacheBuilds, ms: Math.round(f.lastMs * 10) / 10 },
      size: this.canvas ? [this.canvas.clientWidth, this.canvas.clientHeight] : null,
      full: this.isOpen ? this.full.snapshot() : null,
    };
  }
}

const LEVEL_NAMES = { U: 'Underground', G: 'Ground', L1: 'Walkways', L2: 'Flyovers', L3: 'Upper Decks' };
export { MAP_ICON, clamp };
