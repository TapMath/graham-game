// The breach and the warning (PLAN 1b, 6): `game.story`.
//
//   game.story.markBreachKnown(via)   set flags.breachKnown, reveal the flood countdown, show the PA / caption moment, add the
//                                     objective "Warn the city: ..." and emit `breach:known {via, hoursLeft}`. Idempotent.
//                                     Called by the fragments (3 breach clues read) and by reaching the breach chamber.
//   game.story.warnCity(via)          via 'tower' | 'tara': set flags.cityWarned (+ cityWarnedVia), emit `city:warned {via}`, play
//                                     the warning sequence (sirens, evacuation PA lines, captions). Idempotent. Tara's
//                                     "get it on TV" action (Phase 6a) calls it with 'tara'.
//   game.story.breachKnown / cityWarned / evidence       read-only conveniences
//   game.story.snapshot()                                 state().story6b
// The Control Tower terminal (Phase 2 emits `terminal:interact`) is wired here: before the breach is known it only hums; once
// known, E warns the city; afterwards it says so.
// Objectives are written through `game.objectives?.set` (Phase 6a) with a fallback to Phase 3's `game.objective.set`.
import { PA_LINES } from '../audio/pa.js';
import { StorySfx } from './sfx.js';

export const WARN_TEXT = 'Warn the city: Tara can get it on TV, or the Control Tower on L3';

export const EVAC = [
  'Attention. This is an evacuation announcement. Residents of the lower tunnels and Sector Four are to move to the upper levels at once. For tonight, sunlight is free of charge.',
  'Please proceed to the Upper Decks in an orderly manner. Do not run. Do not carry diyas into the tunnels. Please do not pick the roses.',
  'A water event has been confirmed beneath the sea wall. Please remain calm. This is no longer a rumour.',
  'Metro services are cancelled. Shelters are open along the Sunrise Bridge. Bring children. Bring neighbours. Bring your dead light-passes. They will be honoured.',
  'Ground level residents: the lights are on for you tonight. Please walk toward them.',
  'This message has been approved by the Ministry of Dawn. It is, for once, true.',
];

export class BreachSystem {
  init(game) {
    this.game = game;
    game.story = this;
    game.sfx = game.sfx ?? new StorySfx(game);
    this.knownAt = null; this.warnedAt = null; this._origWhen = null; this._chamberT = 0; this._evacAt = 0; this._evacLeft = 0;
    this.warnVia = null; this.knownVia = null;

    const ev = game.events;
    ev.on('terminal:interact', () => this._terminal());
    const it = game.interactables?.get('control-terminal');
    if (it) it.prompt = () => (game.flags.cityWarned ? 'The warning is already out' : game.flags.breachKnown ? 'Send the breach warning to the city' : 'Use the Control Tower terminal');

    const d = game.debug;
    d?.addAction('breachKnown', (g, via = 'debug') => { this.markBreachKnown(via); return g.flags.breachKnown; });
    d?.addAction('warn', (g, via = 'tower') => { if (!g.flags.breachKnown) this.markBreachKnown('debug'); this.warnCity(via); return g.flags.cityWarned; });
    d?.addAction('story6bReset', () => { this.reset(); return true; });
    d?.addState('story6b', () => this.snapshot());
  }

  get breachKnown() { return !!this.game.flags.breachKnown; }
  get cityWarned() { return !!this.game.flags.cityWarned; }
  get evidence() { const g = this.game; return !!(g.items?.has?.('breachEvidence') || g.flags.breachEvidence); }

  reset() {
    const g = this.game;
    g.flags.breachKnown = false; g.flags.cityWarned = false; g.flags.breachEvidence = false;
    this.knownAt = this.warnedAt = null; this.warnVia = this.knownVia = null;
    g.hud?.setFloodVisible(false);
    if (this._origWhen) { PA_LINES.forEach((l, i) => { if (this._origWhen[i]) l.when = this._origWhen[i]; }); while (PA_LINES.length > this._origWhen.length) PA_LINES.pop(); this._origWhen = null; }
    this._setObjective(null);
    g.fragments?.reset?.();
  }

  _setObjective(text) {
    const g = this.game;
    if (text) {
      if (g.objectives?.set) g.objectives.set('warn', text); else g.objective?.set(text, 'warn');
    } else if (g.objectives?.complete) g.objectives.complete('warn'); else g.objective?.clear('warn');
  }

  // ------------------------------------------------------------------ the breach becomes known
  markBreachKnown(via = 'clues') {
    const g = this.game;
    if (g.flags.breachKnown) return false;
    g.flags.breachKnown = true; g.flags.breachKnownVia = via;
    this.knownAt = g.clock?.t ?? null; this.knownVia = via;
    g.hud?.setFloodVisible(true);
    this._setObjective(WARN_TEXT);
    // the moment: a cold flash, the PA calling it a rumour, then Mithi's own voice
    g.screenfx?.glitch(520);
    g.screenfx?.flash('#7fcfff', 900, 0.22);
    g.audio?.play('vision-sting', null);
    g.pa?.say('Attention, residents. There is no water in the lower tunnels. Water is a rumour. Please do not spread unregistered rumours.', { force: true });
    const left = g.clock ? g.clock.hoursLeft : 24;
    setTimeout(() => {
      g.messages?.say('The sea is inside the city. It has been counting down since before the festival began.', { kind: 'story', ttl: 10 });
      g.messages?.say(`Flood in ${g.clock ? g.clock.fmtDuration(g.clock.hoursLeft) : '24h'}. Somebody has to be told.`, { kind: 'system', ttl: 10 });
    }, 2600);
    g.events.emit('breach:known', { via, hoursLeft: left });
    return true;
  }

  // ------------------------------------------------------------------ warning the city
  warnCity(via = 'tower') {
    const g = this.game;
    if (g.flags.cityWarned) return false;
    g.flags.cityWarned = true; g.flags.cityWarnedVia = via;
    this.warnedAt = g.clock?.t ?? null; this.warnVia = via;
    this._setObjective(null);
    this._evacPA();
    g.events.emit('city:warned', { via });
    if (g.cinematics) g.cinematics.play('warning', { via }).catch(() => {});
    else {
      g.messages?.say('Sirens, one after another, climbing the towers. The whole city is learning to be afraid in the right direction.', { kind: 'story', ttl: 10 });
      g.pa?.say(EVAC[0], { force: true });
    }
    return true;
  }

  /** Replace the PA's ordinary lines with evacuation announcements (Phase 5 reads the exported array). */
  _evacPA() {
    const g = this.game;
    if (!this._origWhen) {
      this._origWhen = PA_LINES.map((l) => l.when);
      PA_LINES.forEach((l) => { l.when = () => false; });
      for (const text of EVAC) PA_LINES.push({ text, when: () => !!g.flags.cityWarned });
    }
    if (g.pa) g.pa.nextAt = g.time + 24;       // the first evacuation announcement from the PA's own timer
  }

  _terminal() {
    const g = this.game;
    if (g.modal) return;
    if (g.flags.cityWarned) { g.messages?.say('The terminal shows the broadcast going out on every channel. Nothing left to do here.', { kind: 'system', ttl: 6 }); return; }
    if (!g.flags.breachKnown) {
      g.messages?.say('The terminal hums, and asks politely what the emergency is. You have nothing to tell it yet.', { kind: 'story', ttl: 8 });
      g.messages?.say('(Somewhere underground there is proof.)', { kind: 'hint', ttl: 7 });
      return;
    }
    g.messages?.say('The terminal accepts a priority override. Your hand finds the key marked BROADCAST.', { kind: 'story', ttl: 6 });
    this.warnCity('tower');
  }

  update(dt, game) {
    // reaching the breach chamber is enough to know
    this._chamberT -= dt;
    if (this._chamberT <= 0 && !game.flags.breachKnown) {
      this._chamberT = 0.4;
      const bc = game.world.breachChamber, p = game.player.pos;
      if (bc && p.y < bc.y + 3 && p.y > bc.y - 6 && p.x > bc.rect.x0 && p.x < bc.rect.x1 && p.z > bc.rect.z0 && p.z < bc.rect.z1) this.markBreachKnown('chamber');
    }
    // after the warning, the PA keeps announcing the evacuation now and then (Phase 5's timer also picks from the new lines)
  }

  snapshot() {
    const g = this.game;
    return {
      breachKnown: !!g.flags.breachKnown, breachVia: this.knownVia, cityWarned: !!g.flags.cityWarned, warnVia: this.warnVia, evidence: this.evidence,
      fragments: g.fragments?.snapshot?.() ?? null, trail: g.trail?.snapshot?.() ?? null, cine: g.cinematics?.snapshot?.() ?? null, fireworks: g.fireworks?.snapshot?.() ?? null,
    };
  }
}
