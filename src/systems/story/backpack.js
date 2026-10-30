// Mithi's backpack: one button (B on the keyboard, the bag button on touch) opens a card of everything she carries, and each
// thing in it can be tried. While the bag is open `game.modal` is true, like any dialog: Mithi stands still, the clock, the
// darkness drain and the hazards hold their breath.
//
//   cash      rupees, read live from `game.wallet` (shared with busking). "Count it": she reads the notes by their folds.
//             The D-shot vendors take cash as well as time (vendors.js).
//   dshots    two jabs in a tin, bought "for emergencies". +3 rays each, with a small chance the shot is bad (-2, a blur).
//   earbuds   in or out. In: the city is muffled, a song plays, and the dark takes her a little slower. Out: she hears again.
//   phone     a talking phone: it says the time aloud. Every use costs battery.
//   water     three sips. Each clears her throat: the darkness drain is halved for a minute.
//   biscuits  four glucose biscuits, +1 ray each.
//   ...and everything in `game.items` (Setu's pills and inhaler, the jacket, the torch...), which can be looked at.
//
//   game.backpack.open() / close() / toggle() / isOpen
//   game.backpack.use(id, action?)     try an item as if its button were pressed; returns the result line (or null)
//   game.backpack.snapshot()           state for tests (state().backpack)
// Events: 'backpack:open', 'backpack:close', 'backpack:use' {id, action, ok}.
// Debug: __grahan.do('bagOpen'), do('bagClose'), do('bagUse', id, action).
//
// Wallet: the busking thread owns `src/systems/wallet.js` (game.wallet: rupees, add, spend, set; event 'wallet:change'). When it
// is not registered the backpack installs a shim with the same shape, so the bag works either way.

import { StorySfx } from './sfx.js';

const CASH_START = 120;
const SHOT = Object.freeze({ potency: 3, risk: 0.12, damage: 2, blurSeconds: 14 });
const WATER = Object.freeze({ seconds: 60, mul: 0.5 });
const EARBUDS_MUL = 0.85, EARBUDS_WORLD = 0.3;
const PHONE = Object.freeze({ start: 23, perUse: 3 });

const svg = (inner) => `<svg viewBox="0 0 24 24">${inner}</svg>`;
const ICON = {
  bag: svg('<path d="M8 7 V5 a4 4 0 0 1 8 0 V7"/><path d="M5 9 a2 2 0 0 1 2 -2 H17 a2 2 0 0 1 2 2 V20 a1 1 0 0 1 -1 1 H6 a1 1 0 0 1 -1 -1 Z"/><path d="M8 13 H16 V17 H8 Z M12 13 V15"/>'),
  cash: svg('<rect x="2.5" y="6.5" width="19" height="11" rx="1"/><circle cx="12" cy="12" r="2.6"/><path d="M5.5 9.5 V14.5 M18.5 9.5 V14.5"/>'),
  dshot: svg('<path d="M14 4 L20 10 M17 7 L9 15 L7 17 L5 19 M10.5 7.5 L16.5 13.5 M9 15 L7 13 M12 9 L13 10 M10 11 L11 12"/>'),
  earbuds: svg('<path d="M7 5 a3 3 0 0 1 3 3 V12 a2 2 0 0 1 -2 2 H7 a3 3 0 0 1 0 -9 Z M8.5 14 V19"/><path d="M17 5 a3 3 0 0 0 -3 3 V12 a2 2 0 0 0 2 2 H17 a3 3 0 0 0 0 -9 Z M15.5 14 V19"/>'),
  phone: svg('<rect x="7" y="2.5" width="10" height="19" rx="2"/><path d="M10.5 18.5 H13.5"/><path d="M19.5 8 c1.2 1.2 1.2 3.8 0 5 M21.5 6 c2.4 2.4 2.4 6.6 0 9" class="ray"/>'),
  water: svg('<path d="M10 2.5 H14 V5 H10 Z"/><path d="M9.5 5 H14.5 C16 7 17 8 17 10 V20 a1.5 1.5 0 0 1 -1.5 1.5 H8.5 A1.5 1.5 0 0 1 7 20 V10 C7 8 8 7 9.5 5 Z"/><path d="M7 13 C9 12 11 14 13 13 S16 12 17 13"/>'),
  biscuits: svg('<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="8" cy="9" r=".8"/><circle cx="12" cy="9" r=".8"/><circle cx="16" cy="9" r=".8"/><circle cx="8" cy="15" r=".8"/><circle cx="12" cy="15" r=".8"/><circle cx="16" cy="15" r=".8"/>'),
};

/** A small wallet with the same shape as src/systems/wallet.js, for when that system is not registered. */
function walletShim(game) {
  const w = {
    rupees: 0, shim: true,
    _emit(delta, reason) { game.events.emit('wallet:change', { rupees: w.rupees, delta, reason }); },
    add(n, reason = '') { n = Math.max(0, Math.round(n)); if (n) { w.rupees += n; w._emit(n, reason); } return w.rupees; },
    spend(n, reason = '') { n = Math.max(0, Math.round(n)); if (n > w.rupees) return false; w.rupees -= n; w._emit(-n, reason); return true; },
    set(n, reason = 'set') { const v = Math.max(0, Math.round(n)), d = v - w.rupees; w.rupees = v; if (d) w._emit(d, reason); return v; },
  };
  return w;
}

/** How a blind girl keeps her money straight: each note folded its own way. */
function readNotes(r) {
  if (r <= 0) return 'Nothing. The zip pocket is empty except for a hair clip.';
  const notes = [[500, 'a five hundred folded into a tight square'], [200, 'a two hundred folded in half twice'], [100, 'a hundred folded long'],
    [50, 'a fifty folded once at the corner'], [20, 'a twenty, flat'], [10, 'a ten, soft as cloth']];
  const out = []; let left = r;
  for (const [v, word] of notes) { while (left >= v && out.length < 6) { out.push(word); left -= v; } }
  const coins = left > 0 ? `, and ${left} in coins` : '';
  return `₹${r}. Your fingers find ${out.join(', ')}${coins}. Amma taught you the folds.`;
}

export class BackpackSystem {
  init(game) {
    this.game = game;
    game.backpack = this;
    this.isOpen = false;
    this.sel = 'cash';
    this.result = '';
    this.state = { dshots: 2, earbuds: false, phone: PHONE.start, water: 3, biscuits: 4, waterT: 0 };
    this.stats = { uses: 0, shots: 0, badShots: 0 };
    this._notes = [];
    if (!game.wallet) game.wallet = walletShim(game);
    game.wallet.add(CASH_START, 'backpack');
    installBagCss();
    this.sfx = new StorySfx(game);

    const el = this.el = document.createElement('div');
    el.id = 'backpack'; el.hidden = true;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Mithi\'s backpack');
    document.body.appendChild(el);
    el.addEventListener('click', (e) => {
      const t = e.target.closest('[data-tile], [data-act], .bp-close');
      // a tap on the backdrop closes, but not the click a touch browser sends after the tap that opened the bag
      if (!t) { if (e.target === el && performance.now() - this._openedAt > 450) this.close(); return; }
      if (t.classList.contains('bp-close')) { this.close(); return; }
      if (t.dataset.tile) { this.sel = t.dataset.tile; this.result = ''; this.render(); return; }
      if (t.dataset.act) this.use(this.sel, t.dataset.act);
    });

    // the desktop hint under the items row (touch has its own button in the touch layer)
    this.hint = document.createElement('div');
    this.hint.className = 'hud-bag';
    this.hint.innerHTML = `<kbd>B</kbd><span>BACKPACK</span>`;
    document.getElementById('hud')?.appendChild(this.hint);

    window.addEventListener('keydown', (e) => this._key(e), true);
    game.events.on('wallet:change', () => { if (this.isOpen) this.render(); });
    game.events.on('item:added', () => { if (this.isOpen) this.render(); });
    game.events.on('item:removed', () => { if (this.isOpen) this.render(); });

    game.debug?.addState('backpack', () => this.snapshot());
    game.debug?.addAction('bagOpen', () => { this.open(); return this.isOpen; });
    game.debug?.addAction('bagClose', () => { this.close(); return this.isOpen; });
    game.debug?.addAction('bagUse', (g, id, act) => this.use(id, act));
  }

  snapshot() {
    return { open: this.isOpen, sel: this.sel, rupees: this.game.wallet?.rupees ?? 0, ...this.state, waterT: +this.state.waterT.toFixed(1), stats: { ...this.stats }, tiles: this.tiles().map((t) => t.id) };
  }

  // ------------------------------------------------------------------------------------------------ opening and closing
  canOpen() {
    const g = this.game;
    return !this.isOpen && g.mode === 'playing' && !g.modal && !g.cinematics?.active && !g.visionSystem?.active && !g.map?.isOpen && !g.menu?.visible && !g.endings?.current && !g.health?.dead;
  }

  open() {
    if (!this.canOpen()) return false;
    const g = this.game;
    this.isOpen = true;
    this._openedAt = performance.now();
    g.input.releaseAll(); g.input.edges.clear();
    g.modal = true;
    g.dialogue?.holdPointer(true);
    this.result = '';
    if (!this.tiles().some((t) => t.id === this.sel)) this.sel = 'cash';
    this.render();
    this.el.hidden = false;
    document.body.classList.add('bag-open');
    this.sfx.paper(0.35);                                           // the zip and the rustle of the bag
    g.events.emit('backpack:open', {});
    return true;
  }

  close() {
    if (!this.isOpen) return;
    const g = this.game;
    this.isOpen = false;
    this.el.hidden = true;
    document.body.classList.remove('bag-open');
    g.input.releaseAll(); g.input.edges.clear();
    g.modal = false;
    g.dialogue?.holdPointer(false);
    g.events.emit('backpack:close', {});
  }

  toggle() { if (this.isOpen) this.close(); else this.open(); }

  _key(e) {
    const t = e.target;
    if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
    if (e.code === 'KeyB' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (this.isOpen) { e.preventDefault(); e.stopPropagation(); this.close(); }
      else if (this.canOpen()) { e.preventDefault(); e.stopPropagation(); this.open(); }
      return;
    }
    if (!this.isOpen) return;
    e.stopPropagation();                                            // while the bag is open the game does not see the keyboard
    if (e.repeat) return;
    if (e.code === 'Escape') { e.preventDefault(); this.close(); return; }
    const tiles = this.tiles(), i = tiles.findIndex((x) => x.id === this.sel);
    const digit = /^Digit([1-9])$/.exec(e.code);
    if (digit && tiles[+digit[1] - 1]) { e.preventDefault(); this.sel = tiles[+digit[1] - 1].id; this.result = ''; this.render(); return; }
    if (e.code === 'ArrowRight' || e.code === 'ArrowDown' || e.code === 'ArrowLeft' || e.code === 'ArrowUp') {
      e.preventDefault();
      const d = e.code === 'ArrowRight' || e.code === 'ArrowDown' ? 1 : -1;
      this.sel = tiles[(i + d + tiles.length) % tiles.length].id; this.result = ''; this.render(); return;
    }
    if (e.code === 'Enter' || e.code === 'Space') {
      e.preventDefault();
      const a = tiles[i]?.actions?.find((x) => !x.off);
      if (a) this.use(this.sel, a.id);
    }
  }

  // ------------------------------------------------------------------------------------------------ the contents
  /** Every tile in the bag, in order: the backpack's own things first, then what Mithi has picked up on the way. */
  tiles() {
    const g = this.game, s = this.state, r = g.wallet?.rupees ?? 0, rays = g.player.rays, full = rays >= (g.player.maxRays ?? 12);
    const list = [
      { id: 'cash', name: 'Cash', icon: ICON.cash, badge: `₹${r}`,
        desc: 'Notes and coins in the zip pocket. D-shot sellers take cash as well as time, and people sometimes pay for a song.',
        rows: [['In the pocket', `₹${r}`]], actions: [{ id: 'count', label: 'Count it' }] },
      { id: 'dshots', name: 'D-shots', icon: ICON.dshot, badge: s.dshots ? `×${s.dshots}` : 'empty', empty: !s.dshots,
        desc: 'A tin with D-shot jabs, bought from a seller near home "for emergencies". Black-market light under the skin. Usually clean.',
        rows: [['Left', String(s.dshots)], ['Gives', `+${SHOT.potency} rays`], ['Risk', 'a bad one blurs the world and takes 2 rays']],
        actions: [{ id: 'jab', label: 'Use a D-shot', off: !s.dshots || full, why: !s.dshots ? 'The tin is empty.' : 'You are already full of light.' }] },
      { id: 'earbuds', name: 'Earbuds', icon: ICON.earbuds, badge: s.earbuds ? 'in' : 'out', on: s.earbuds,
        desc: 'Wireless earbuds with one song saved on them, the one Setu hums. With them in, the city goes quiet and the dark feels further away. But you see by sound, and the city is muffled.',
        rows: [['Now', s.earbuds ? 'In your ears, playing' : 'In their case']],
        actions: [{ id: 'toggle', label: s.earbuds ? 'Take them out' : 'Put them in' }] },
      { id: 'phone', name: 'Talking phone', icon: ICON.phone, badge: `${s.phone}%`, empty: s.phone <= 0,
        desc: 'An old phone that reads out loud. It tells you the time. The battery is nearly gone, so make each ask count.',
        rows: [['Battery', s.phone > 0 ? `${s.phone}%` : 'dead']],
        actions: [{ id: 'time', label: 'Ask the time', off: s.phone <= 0, why: 'The phone is dead.' }] },
      { id: 'water', name: 'Water bottle', icon: ICON.water, badge: s.water ? `${s.water} sips` : 'empty', empty: !s.water, on: s.waterT > 0,
        desc: 'A steel bottle of boiled water from home. A sip clears the dust from your throat and you breathe easier for a while.',
        rows: [['Left', `${s.water} sips`], ['A sip', 'the dark drains you half as fast for a minute']],
        actions: [{ id: 'sip', label: 'Take a sip', off: !s.water, why: 'The bottle is empty.' }] },
      { id: 'biscuits', name: 'Glucose biscuits', icon: ICON.biscuits, badge: s.biscuits ? `×${s.biscuits}` : 'empty', empty: !s.biscuits,
        desc: 'A crumpled packet of glucose biscuits. Sugar, a little strength.',
        rows: [['Left', String(s.biscuits)], ['Each', '+1 ray']],
        actions: [{ id: 'eat', label: 'Eat one', off: !s.biscuits || full, why: !s.biscuits ? 'Only crumbs left.' : 'You are not hungry. Save them.' }] },
    ];
    for (const id of g.items?.list() ?? []) {
      const d = g.items.DEFS[id] ?? { name: id, desc: '', icon: svg('<circle cx="12" cy="12" r="6"/>') };
      const t = { id: 'item:' + id, name: d.name, icon: d.icon, desc: d.desc, rows: [], actions: [{ id: 'feel', label: 'Feel it' }], carried: true };
      if (id === 'pills') t.actions = [{ id: 'feel', label: 'Check them' }];
      list.push(t);
    }
    return list;
  }

  /** Try an item. Returns the line Mithi gets back, or null if nothing happened. */
  use(id, action) {
    const g = this.game, s = this.state;
    const tile = this.tiles().find((t) => t.id === id);
    if (!tile) return null;
    const act = tile.actions.find((a) => a.id === action) ?? tile.actions[0];
    if (!act) return null;
    if (act.off) { this._say(act.why, false, id, act.id); return act.why; }
    let line = '', ok = true;
    if (id === 'cash') line = readNotes(g.wallet?.rupees ?? 0);
    else if (id === 'dshots') {
      s.dshots--; this.stats.shots++;
      const rays0 = g.player.rays;
      if (g.rng.chance(SHOT.risk)) {
        this.stats.badShots++;
        g.health.damage(SHOT.damage, 'dshot');
        g.screenfx?.blur(6, SHOT.blurSeconds);
        g.screenfx?.flash('#a0ff40', 600, 0.25);
        line = `This one was bad. It burns going in and the world smears at the edges. (-${rays0 - g.player.rays} rays)`; ok = false;
      } else {
        g.health.heal(SHOT.potency, 'dshot');
        g.screenfx?.flash('#ffdf9a', 500, 0.22);
        line = `A pinch at the arm, cold, then warm, then a little like sunlight under the skin. (+${g.player.rays - rays0} rays)`;
      }
    } else if (id === 'earbuds') {
      s.earbuds = !s.earbuds;
      this._earbuds(s.earbuds);
      line = s.earbuds
        ? 'You push them in. The roar of the city drops away and Setu\'s song fills your head. The dark feels further off. But you cannot hear the street.'
        : 'You take them out. The city rushes back in: horns, voices, water dripping somewhere. You can hear your way again.';
    } else if (id === 'phone') {
      s.phone = Math.max(0, s.phone - PHONE.perUse);
      const said = `The time is ${this._spokenTime()}. Battery ${s.phone} percent.`;
      g.voices?.say?.({ who: 'phone', text: said });
      line = `The phone speaks in its flat voice: "${said}"` + (s.phone <= 0 ? ' Then it goes silent for good.' : '');
    } else if (id === 'water') {
      s.water--; s.waterT = WATER.seconds;
      g.health.setDecayMul('water', WATER.mul);
      line = 'Cool, a little metallic from the bottle. The grit in your throat washes down and your breath comes easier.';
    } else if (id === 'biscuits') {
      s.biscuits--;
      const rays0 = g.player.rays; g.health.heal(1, 'food');
      line = `Sweet and dry. You eat it in three bites and save the crumbs. (+${g.player.rays - rays0} ray)`;
    } else if (id === 'item:pills') line = 'Setu\'s pills, the strip still half full, and his inhaler. They are his, not yours. Keep them for when you find him.';
    else if (tile.carried) line = `You run your hands over it. ${tile.desc}`;
    this.stats.uses++;
    this._say(line, ok, id, act.id);
    return line;
  }

  _say(line, ok, id, action) {
    this.result = line;
    this.game.messages?.say(line, { kind: 'story', ttl: 7 });
    this.game.events.emit('backpack:use', { id, action, ok });
    if (this.isOpen) this.render();
  }

  _spokenTime() {
    const c = this.game.clock, h = c?.hour ?? 6, hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    const h12 = ((hh + 11) % 12) + 1, ap = hh < 12 ? 'A M' : 'P M';
    return `${h12}:${String(mm).padStart(2, '0')} ${ap}`;
  }

  // ------------------------------------------------------------------------------------------------ earbuds: the song and the muffle
  _earbuds(on) {
    const g = this.game, a = g.audio;
    g.health.setDecayMul('earbuds', on ? EARBUDS_MUL : null);
    this._songAt = 0; this._step = 0;
    if (!a?.ctx || !a.pre) return;
    const t = a.ctx.currentTime;
    a.pre.gain.cancelScheduledValues(t);
    a.pre.gain.setTargetAtTime(on ? EARBUDS_WORLD : 1, t, 0.25);
    if (on && !this._song) { this._song = a.ctx.createGain(); this._song.gain.value = 0.16; this._song.connect(a.comp); }
    if (this._song) this._song.gain.setTargetAtTime(on ? 0.16 : 0, t, 0.3);
  }

  /** Schedule the earbud song a little ahead of the audio clock: Bhupali, slow, a soft triangle over a drone. */
  _songTick() {
    const a = this.game.audio, ctx = a?.ctx;
    if (!ctx || ctx.state !== 'running' || !this._song) return;
    const MEL = [0, 2, 4, 7, 9, 7, 4, 2, 4, 7, 9, 12, 9, 7, 4, 0, 2, 4, 2, 0, -3, 0, 2, 0];
    const step = 0.42, base = 261.6;
    if (this._songAt < ctx.currentTime) this._songAt = ctx.currentTime + 0.05;
    while (this._songAt < ctx.currentTime + 1.0) {
      const c = this._songAt, i = this._step++ % MEL.length, f = base * Math.pow(2, MEL[i] / 12), long = i % 8 === 7;
      try {
        const o = ctx.createOscillator(), og = ctx.createGain();
        o.type = 'triangle'; o.frequency.value = f;
        og.gain.setValueAtTime(0, c); og.gain.linearRampToValueAtTime(0.5, c + 0.03); og.gain.setTargetAtTime(0, c + step * (long ? 1.6 : 0.7), 0.12);
        o.connect(og); og.connect(this._song); o.start(c); o.stop(c + step * 2.5);
        if (i % 8 === 0) {
          const d = ctx.createOscillator(), dg = ctx.createGain();
          d.type = 'sine'; d.frequency.value = base / 2;
          dg.gain.setValueAtTime(0, c); dg.gain.linearRampToValueAtTime(0.28, c + 0.4); dg.gain.setTargetAtTime(0, c + step * 7, 0.4);
          d.connect(dg); dg.connect(this._song); d.start(c); d.stop(c + step * 9);
        }
      } catch { /* the context went away */ }
      this._songAt += long ? step * 2 : step;
    }
  }

  // ------------------------------------------------------------------------------------------------ drawing
  render() {
    const tiles = this.tiles(), cur = tiles.find((t) => t.id === this.sel) ?? tiles[0];
    if (cur) this.sel = cur.id;
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const grid = tiles.map((t, i) => `<button type="button" class="bp-tile${t.id === this.sel ? ' sel' : ''}${t.empty ? ' empty' : ''}${t.on ? ' on' : ''}" data-tile="${esc(t.id)}" aria-label="${esc(t.name)}">` +
      `<span class="ic">${t.icon}</span><span class="nm">${esc(t.name)}</span>${t.badge ? `<span class="bd">${esc(t.badge)}</span>` : ''}<kbd>${i < 9 ? i + 1 : ''}</kbd></button>`).join('');
    const rows = (cur?.rows ?? []).map(([k, v]) => `<div class="dl-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
    const acts = (cur?.actions ?? []).map((a) => `<button type="button" class="bp-act${a.off ? ' off' : ''}" data-act="${a.id}">${esc(a.label)}</button>`).join('');
    this.el.innerHTML =
      `<div class="bp-card"><div class="bp-head"><span class="dl-tag">BACKPACK</span><h2>Mithi's bag</h2><button type="button" class="bp-close" aria-label="Close the backpack">×</button></div>` +
      `<div class="bp-body"><div class="bp-grid">${grid}</div>` +
      `<div class="bp-detail">${cur ? `<div class="bp-big">${cur.icon}</div><h3>${esc(cur.name)}</h3><p class="bp-desc">${esc(cur.desc)}</p><div class="dl-rows">${rows}</div><div class="bp-acts">${acts}</div>` : ''}` +
      `<p class="bp-result" aria-live="polite">${esc(this.result)}</p></div></div>` +
      `<p class="bp-foot"><kbd>B</kbd> or <kbd>Esc</kbd> closes · <kbd>1</kbd>–<kbd>9</kbd> pick · <kbd>Enter</kbd> use</p></div>`;
  }

  update(dt) {
    const g = this.game, s = this.state;
    if (s.waterT > 0 && !g.modal && g.mode === 'playing') {
      s.waterT -= dt;
      if (s.waterT <= 0) { s.waterT = 0; g.health.setDecayMul('water', null); }
    }
    if (s.earbuds) this._songTick();
    if (this.hint) {
      const show = g.mode === 'playing' && !g.modal && !g.cinematics?.active;
      if (show !== this._hintShown) { this._hintShown = show; this.hint.classList.toggle('on', show); }
    }
  }

  reset() { if (this.isOpen) this.close(); }
}

let cssInstalled = false;
function installBagCss() {
  if (cssInstalled || typeof document === 'undefined') return;
  cssInstalled = true;
  const st = document.createElement('style');
  st.id = 'backpack-css';
  st.textContent = `
#backpack { position: fixed; inset: 0; z-index: 27; display: flex; align-items: center; justify-content: center; padding: calc(var(--sat) + 12px) calc(var(--sar) + 12px) calc(var(--sab) + 12px) calc(var(--sal) + 12px);
  background: radial-gradient(ellipse at 50% 55%, rgba(4, 8, 14, .72), rgba(4, 8, 14, .38) 75%); font-family: var(--sans); color: var(--ink); touch-action: manipulation; }
#backpack[hidden] { display: none; }
.bp-card { width: min(860px, 100%); max-height: 100%; overflow: auto; -webkit-overflow-scrolling: touch; background: rgba(7, 13, 20, .9); border: 1px solid rgba(221, 233, 244, .3);
  padding: 16px 22px 14px; backdrop-filter: blur(3px); box-shadow: 0 0 44px rgba(0, 0, 0, .55); }
.bp-head { display: flex; align-items: center; gap: 14px; margin-bottom: 12px; }
.bp-head h2 { margin: 0; font-weight: 200; font-size: 26px; letter-spacing: .08em; flex: 1; }
.bp-head .dl-tag { color: var(--sun); border-color: rgba(255, 223, 154, .6); }
.bp-close { width: 52px; height: 52px; border-radius: 50%; border: 1.5px solid rgba(221, 233, 244, .5); background: transparent; color: var(--ink); font: 200 30px/1 var(--sans); cursor: pointer; padding: 0; }
.bp-close:hover { border-color: var(--sun); color: var(--sun-hot); }
.bp-body { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 18px; }
.bp-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(104px, 1fr)); gap: 8px; align-content: start; }
.bp-tile { position: relative; min-height: 104px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 5px; padding: 10px 6px 8px; cursor: pointer;
  color: var(--ink); background: rgba(221, 233, 244, .04); border: 1px solid rgba(221, 233, 244, .28); font-family: var(--sans); touch-action: manipulation; }
.bp-tile .ic svg { width: 38px; height: 38px; fill: none; stroke: currentColor; stroke-width: 1.5; stroke-linecap: round; stroke-linejoin: round; }
.bp-tile .nm { font-size: 11px; letter-spacing: .14em; text-transform: uppercase; text-align: center; line-height: 1.2; }
.bp-tile .bd { font-size: 12px; color: var(--sun); letter-spacing: .04em; }
.bp-tile kbd { position: absolute; left: 5px; top: 4px; font: 400 10px var(--sans); color: var(--ink-faint); }
.bp-tile:hover { border-color: rgba(255, 223, 154, .6); }
.bp-tile.sel { border-color: var(--sun); background: rgba(255, 223, 154, .1); color: var(--sun-hot); box-shadow: 0 0 18px rgba(255, 220, 140, .18); }
.bp-tile.empty { opacity: .5; } .bp-tile.on .ic svg { stroke: var(--sun); filter: drop-shadow(0 0 5px rgba(255, 220, 140, .7)); }
.bp-detail { display: flex; flex-direction: column; min-width: 0; }
.bp-big svg { width: 54px; height: 54px; fill: none; stroke: var(--sun); stroke-width: 1.3; stroke-linecap: round; stroke-linejoin: round; }
.bp-detail h3 { margin: 4px 0 6px; font-weight: 300; font-size: 21px; letter-spacing: .06em; }
.bp-desc { margin: 0 0 10px; font-size: 14.5px; line-height: 1.45; color: var(--ink-dim); font-weight: 300; }
.bp-acts { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
.bp-act { flex: 1; min-width: 150px; min-height: 56px; font: 300 16px var(--sans); letter-spacing: .08em; color: var(--sun-hot); background: rgba(255, 223, 154, .08); border: 1px solid var(--sun); cursor: pointer; padding: 10px 14px; touch-action: manipulation; }
.bp-act:hover { background: rgba(255, 223, 154, .16); }
.bp-act.off { color: var(--ink-dim); border-color: rgba(221, 233, 244, .3); background: transparent; }
.bp-result { min-height: 2.8em; margin: 12px 0 0; font-family: var(--hand); font-style: italic; font-size: 15px; line-height: 1.4; color: #f4ead2; }
.bp-foot { margin: 10px 0 0; font-size: 11px; letter-spacing: .1em; color: var(--ink-faint); }
.bp-foot kbd { font: 400 11px var(--sans); border: 1px solid rgba(221, 233, 244, .35); padding: 0 4px; border-radius: 3px; }
body.touch .bp-foot, body.touch .bp-tile kbd { display: none; }
body.bag-open #touch { display: none; }
@media (max-width: 640px), (max-height: 520px) and (orientation: landscape) {
  .bp-body { grid-template-columns: 1fr; } .bp-card { padding: 12px 14px 12px; }
  .bp-grid { grid-template-columns: repeat(auto-fill, minmax(84px, 1fr)); } .bp-tile { min-height: 84px; }
  .bp-tile .ic svg { width: 30px; height: 30px; } .bp-head h2 { font-size: 21px; }
}
@media (max-height: 520px) and (orientation: landscape) and (min-width: 641px) { .bp-body { grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); } }
.hud-bag { position: absolute; left: 20px; top: 172px; display: none; align-items: center; gap: 7px; font-size: 9.5px; letter-spacing: .24em; color: var(--ink-dim); }
.hud-bag.on { display: flex; }
.hud-bag kbd { font: 400 11px var(--sans); border: 1px solid rgba(255, 223, 154, .7); color: var(--sun-hot); min-width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; border-radius: 3px; }
body.touch .hud-bag { display: none !important; }
.t-bag { right: 176px; bottom: 150px; width: 62px; height: 62px; }
`;
  document.head.appendChild(st);
}
