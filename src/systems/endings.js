// Endings (PLAN section 7). Basic versions of 3 and 4 and simple placeholders for 1 and 2 (Phase 6 builds the
// bridge cinematic on top via `endings.register`).
//
//   1  Dawn reunion         Setu is following, Mithi reaches the Sunrise Bridge end, city warned (flag cityWarned)
//   2  Setu found, city lost  Setu is following but the city was never warned (bridge reached, or 06:00 passes)
//   3  Setu lost            Setu's breath hits 0, or 06:00 comes and he never found his way to her
//   4  Mithi dies           0 rays
//
//   game.endings.trigger(type, info)   show an ending (once); sets game.mode = 'ending' (the simulation stops)
//   game.endings.register(type, fn)    fn(game, info, endings) -> true if it takes over the presentation (Phase 6 cinematics);
//                                      call endings.show(type, info) from it when its cinematic is done
//   game.endings.current               {type, title, info} or null
//   Debug: __grahan.do('ending', 3) ; flags via __grahan.set('cityWarned', true) / ('bridgePermit', true) / ('setuFollowing', true)
// Triggers: 'setu:died' -> 3, 'player:died' -> 4, 'clock:end' -> 2 (following) or 3, and reaching `world.sunriseBridgeEnd`
// on foot with Setu following (or waiting at the bridge) -> 1 if flags.cityWarned else 2.
// The ending screen shows run stats and a Play again button that reloads the page with a new random seed.
const TEXT = {
  1: {
    title: 'SUNRISE', kicker: 'Dawn reunion', tone: 'gold',
    body: ['"Didi... is that it? Is that the sun?"', 'The light comes over the sea like something being forgiven. Setu has never seen it. You have never seen it. You both feel it.'],
    warned: 'Mumbai was warned in time. Millions were evacuated.',
    unwarned: '',
  },
  2: {
    title: 'THE LIGHT, TOO LATE', kicker: 'Setu found, city lost', tone: 'dusk',
    body: ['Setu is with you. The sun is coming up over the Atal Setu, the first clear sky of your life.', 'Behind you, under Dharavi and Sion and every lit window, the sea finds the last of the tunnels. Nobody was told.'],
    warned: '', unwarned: 'The city was never warned.',
  },
  3: {
    title: 'SETU LOST', kicker: 'Mithi cannot find Setu', tone: 'night',
    body: ['The cough does not come again.', 'Somewhere under Dharavi a boy keeps counting his steps in the dark, and nobody is there to count with him.'],
    warned: '', unwarned: '',
  },
  4: {
    title: 'THE LIGHT RAN OUT', kicker: 'Mithi dies', tone: 'night',
    body: ['The light you were rationed ran out first.', 'Far above, Diwali goes on without you. Fireworks over New Wadala, marigolds, diyas on every step. Nobody looks down.'],
    warned: '', unwarned: '',
  },
};

export class EndingSystem {
  init(game) {
    this.game = game;
    game.endings = this;
    this.current = null;
    this.handlers = new Map();
    this.checkBridge = true;
    const el = this.el = document.createElement('div');
    el.id = 'ending'; el.hidden = true;
    document.body.appendChild(el);
    window.addEventListener('keydown', (e) => { if (!this.el.hidden && this.el.querySelector('#en-again') && (e.code === 'Enter' || e.code === 'Space')) this.playAgain(); });
    const ev = game.events;
    ev.on('setu:died', () => this.trigger(3, { reason: 'setuDied' }));
    ev.on('player:died', ({ cause }) => this.trigger(4, { reason: 'rays', cause }));
    ev.on('clock:end', () => {
      if (game.setu?.dead) return;
      if (game.flags.setuFollowing) this.trigger(2, { reason: 'dawnMissed' });
      else this.trigger(3, { reason: 'timeUp' });
    });
    game.debug?.addAction('ending', (g, type, info) => { this.trigger(type, info ?? { reason: 'debug' }); return this.current?.type ?? null; });
    game.debug?.addAction('endingReset', (g) => { this.reset(); g.setMode('playing'); g.screenfx.fade(0, 0.1); return true; });   // tests: leave an ending
    game.debug?.addState('ending', () => (this.current ? { type: this.current.type, title: this.current.title, reason: this.current.info?.reason ?? null } : null));
  }

  reset() {
    clearTimeout(this._cardTimer);
    this.current = null; this.el.hidden = true; this.el.className = ''; this.el.innerHTML = '';
  }

  register(type, fn) { this.handlers.set(type, fn); }

  trigger(type, info = {}) {
    if (this.current) return false;
    const game = this.game;
    this.current = { type, title: TEXT[type]?.title ?? '', info };
    game.events.emit('ending', { type, ...info });
    game.dialog?.close();
    game.modal = false;
    const h = this.handlers.get(type);
    if (h && h(game, info, this) === true) return true;
    this.show(type, info);
    return true;
  }

  /** The default presentation (also the placeholder for 1 and 2: a plain fade to the ending card). */
  show(type, info = {}) {
    const game = this.game, T = TEXT[type];
    this.current = this.current ?? { type, title: T.title, info };
    game.setMode('ending');
    try { document.exitPointerLock?.(); } catch { /* not locked */ }
    const fadeColor = T.tone === 'gold' ? '#f6e3b0' : T.tone === 'dusk' ? '#2a1a28' : '#04070a';
    game.screenfx.fade(1, type <= 2 ? 2.2 : 1.6, fadeColor);
    clearTimeout(this._cardTimer);
    this._cardTimer = setTimeout(() => { if (this.current) this._card(type, info); }, type <= 2 ? 2300 : 1700);
  }

  _stats() {
    const g = this.game, h = g.health, v = g.vendors;
    const real = g.time, mm = Math.floor(real / 60), ss = Math.floor(real % 60);
    return [
      ['Game time', `${g.clock.hhmm}, day ${g.clock.day}`],
      ['Time played', `${mm}:${String(ss).padStart(2, '0')}`],
      ['Rays left', `${g.player.rays} / ${g.player.maxRays}`],
      ['Setu', g.setu?.dead ? 'lost' : g.flags.setuFollowing ? 'with you' : g.setu?.found ? 'found' : 'not found'],
      ['D-shots bought', String(v?.stats.shots ?? 0)],
      ['Story fragments', String(g.flags.fragmentsFound ?? 0)],
      ['City warned', g.flags.cityWarned ? 'yes' : 'no'],
      ['Darkness endured', `${h?.stats.drains ?? 0} rays`],
    ];
  }

  _card(type, info) {
    const game = this.game, T = TEXT[type];
    const warned = game.flags.cityWarned;
    const extra = type === 1 ? (warned ? T.warned : '') : T.unwarned;
    const rows = this._stats().map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    this.el.className = 'tone-' + T.tone;
    this.el.innerHTML =
      `<div class="en-card"><p class="en-kicker">ENDING ${type} OF 4 &middot; ${T.kicker.toUpperCase()}</p><h1>${T.title}</h1>` +
      T.body.map((l) => `<p class="en-body">${l}</p>`).join('') + (extra ? `<p class="en-extra">${extra}</p>` : '') +
      `<div class="en-stats">${rows}</div><button type="button" id="en-again">Play again</button>` +
      `<p class="en-foot">${type === 1 ? '' : 'the game begins again'}</p></div>`;
    this.el.hidden = false;
    this.el.querySelector('#en-again').addEventListener('click', () => this.playAgain());
    game.events.emit('ending:shown', { type });
  }

  playAgain() {
    const u = new URL(location.href);
    u.searchParams.set('seed', String((Math.random() * 4294967296) >>> 0));
    location.href = u.toString();
  }

  update(dt, game) {
    if (this.current || !this.checkBridge) return;
    const p = game.player, be = game.world.sunriseBridgeEnd;
    if (!be) return;
    if (Math.abs(p.pos.y - be.y) < 3 && Math.hypot(p.pos.x - be.x, p.pos.z - be.z) < be.radius) {
      const s = game.setu;
      if (!s.dead && !s.found && s.windowId === 'bridge') s.find({ via: 'bridge' });       // he is waiting on the bridge: the reunion
      if (s.following) this.trigger(game.flags.cityWarned ? 1 : 2, { reason: 'bridge' });
    }
  }
}
