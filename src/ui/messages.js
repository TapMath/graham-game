// Message feed: the captions, story lines and system notes shown bottom-left (HUD) and, later, spoken
// by the PA / narration voices. Any system can say something:
//
//   game.messages.say('text', { kind: 'story'|'clue'|'system'|'hint'|'pa'|'caption', ttl: 6, speaker })
//
// kinds: story (Mithi's sensory narration, warm italic), clue (what strangers say about Setu), system
// (gate scanner, clock, short notes), hint, pa (the municipal PA voice, boxed), caption (a sound: [dog barks]).
// Emits 'message' {id, text, kind, ttl, speaker, t}; the HUD renders it; `game.messages.log` keeps the last 60.
export class MessageSystem {
  init(game) {
    this.game = game;
    game.messages = this;
    this.log = [];
    this._n = 0;
    game.debug?.addState('messages', () => ({ count: this._n, last: this.log.slice(-4).map((m) => `${m.kind}: ${m.text}`) }));
  }

  say(text, opts = {}) {
    const m = { id: ++this._n, text, kind: opts.kind ?? 'system', ttl: opts.ttl ?? 6, speaker: opts.speaker ?? null, t: this.game.time };
    this.log.push(m);
    if (this.log.length > 60) this.log.shift();
    this.game.events.emit('message', m);
    return m;
  }

  caption(text, ttl = 4) { return this.say(text, { kind: 'caption', ttl }); }
}
