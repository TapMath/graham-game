// Setu's voice: the mouth organ Mithi gave him, and his cough.
//
//   - When Mithi sings (`sing:start`) and Setu is within earshot (150 m, or 90 m where it is loud around her: the crash
//     site on the ground, the flyovers) he answers 1.5 s later with a short mouth-organ phrase: her own phrase played
//     back to her, thinner the lower his breath. Below ~30 % it may break off into a cough.
//   - Unprompted he plays now and then, weaker as his breath falls: every ~0.3 to 0.9 game hours (about 25 to 70 real
//     seconds), only when Mithi is within earshot to hear it.
//   - He coughs while his breath is under 60 %, more often the lower it is.
// Everything goes out as `sound:emit` {kind:'mouthorgan' | 'cough', who:'setu'}: the audio engine plays it with HRTF at his
// position and the ripple system draws his warm, large, triple ripples through every wall.
//
//   game.setuVoice.answerAt        game time of a pending answer (or null)
//   game.setuVoice.stats           {answers, spontaneous, coughs}
import { RAGA } from '../audio/synth.js';
import { loudZoneFactor } from '../audio/kinds.js';

const semis = (f, st) => f * Math.pow(2, st / 12);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class SetuVoice {
  init(game) {
    this.game = game;
    game.setuVoice = this;
    this.rng = game.rng.fork('setu-voice');
    this.answerAt = null; this.phrase = null;
    this.stats = { answers: 0, spontaneous: 0, coughs: 0, skippedFar: 0 };
    this.nextPlay = null; this.nextCough = 6; this.told = false;
    game.events.on('sing:start', (d) => this._onSing(d));
    game.debug?.addState('setuVoice', () => ({ ...this.stats, answerIn: this.answerAt == null ? null : +(this.answerAt - game.time).toFixed(2), range: this.range() }));
    game.debug?.addAction('setuPlay', (g, weak = 0) => { this._play({ weak, spontaneous: false }); return this.stats; });
  }

  /** How far Mithi can hear him right now: 150 m, 90 m when it is loud around her. */
  range() { return 150 * loudZoneFactor(this.game); }

  _dist() {
    const s = this.game.setu, p = this.game.player.pos;
    return Math.hypot(s.pos.x - p.x, s.pos.y - p.y, s.pos.z - p.z);
  }
  _active() { const s = this.game.setu; return !!s && !s.dead; }
  _hearable() { return this._active() && this._dist() <= this.range() * 1.1; }

  _onSing(d) {
    const s = this.game.setu;
    if (!s || s.dead || s.found || s.following) return;
    if (this._dist() > this.range()) { this.stats.skippedFar++; return; }
    this.answerAt = this.game.time + 1.5;
    this.phrase = d.phrase ?? RAGA.phrases[d.index ?? 0];
  }

  /** Build the notes of a phrase for the reed, trimmed by how weak he is. */
  _notes(phrase, weak) {
    const full = phrase ?? RAGA.phrases[0];
    const n = weak > 0.7 ? 3 : weak > 0.45 ? 4 : weak > 0.2 ? 5 : 6;
    const tail = full.slice(Math.max(0, full.length - 1 - n), full.length - 1);      // the end of her phrase, before the long last note
    const list = (tail.length ? tail : full.slice(0, n)).map(([st, b]) => [semis(RAGA.tonicReed, st), clamp(b * 0.42, 0.18, 0.7) * (1 + weak * 0.3)]);
    const last = full[full.length - 1];
    list.push([semis(RAGA.tonicReed, last[0]), 0.9 * (1 - weak * 0.35)]);
    return list;
  }

  _play({ weak = 0, spontaneous = false } = {}) {
    const g = this.game, s = g.setu;
    if (!s) return false;
    const health = s.health / 100;
    weak = clamp(weak, 0, 1);
    let notes = this._notes(this.phrase, weak);
    const breaks = health < 0.3 && this.rng.chance(0.55);
    if (breaks) notes = notes.slice(0, Math.max(2, Math.ceil(notes.length / 2)));
    const loud = clamp(0.58 + 0.2 * health - weak * 0.05, 0.5, 0.78);          // 0.78 reaches ~158 m, 0.58 about 124 m
    g.events.emit('sound:emit', { x: s.pos.x, y: s.pos.y + 0.9, z: s.pos.z, kind: 'mouthorgan', loudness: loud, notes, weak, who: 'setu' });
    let dur = 0.1; for (const [, d] of notes) dur += d + 0.03;
    if (breaks) this.cough = g.time + dur + 0.15;
    if (spontaneous) this.stats.spontaneous++; else this.stats.answers++;
    if (!this.told) {
      this.told = true;
      g.messages?.say('A thin, wavering note, beyond the walls. A mouth organ. Setu.', { kind: 'story', ttl: 9 });
    }
    return true;
  }

  _cough() {
    const g = this.game, s = g.setu;
    this.stats.coughs++;
    g.events.emit('sound:emit', { x: s.pos.x, y: s.pos.y + 0.8, z: s.pos.z, kind: 'cough', loudness: clamp(0.3 + (1 - s.health / 100) * 0.3, 0.3, 0.6), pitch: 1.4, who: 'setu' });
  }

  update(dt, game) {
    const s = game.setu, clock = game.clock;
    if (!s || !clock) return;
    const t = game.time;
    if (this.cough && t >= this.cough) { this.cough = 0; if (this._active()) this._cough(); }
    if (this.answerAt != null && t >= this.answerAt) {
      this.answerAt = null;
      if (this._active() && !s.found && !s.following) {
        if (this._dist() <= this.range() * 1.1) this._play({ weak: 1 - s.health / 100, spontaneous: false });
        else this.stats.skippedFar++;
      }
    }
    if (!this._active() || game.mode !== 'playing') return;
    // unprompted playing (not once he is with her)
    if (!s.found && !s.following) {
      if (this.nextPlay == null) this.nextPlay = clock.t + 0.15 + this.rng.range(0, 0.3);
      if (clock.t >= this.nextPlay) {
        const weak = 1 - s.health / 100;
        this.nextPlay = clock.t + (0.3 + weak * 0.6) + this.rng.range(0, 0.35);        // game hours
        if (this._hearable() && s.health > 3) { if (!this.phrase) this.phrase = RAGA.phrases[this.rng.int(0, RAGA.phrases.length - 1)]; this._play({ weak: clamp(weak * 1.15 + 0.15, 0, 1), spontaneous: true }); }
      }
    }
    // coughs
    if (s.health < 60 && t >= this.nextCough) {
      this.nextCough = t + 4 + (s.health / 100) * 14 + this.rng.range(0, 5);
      if (this._hearable()) this._cough();
    }
  }
}
