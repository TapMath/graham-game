// Small talk on the road (Phase 8C): Jeetu thinks aloud while he walks with Mithi, and once Setu is found the two boys bicker and make up.
// A line every minute or so of play, picked for where they are (rain at street level, the dark underground, the fireworks at night, a patch
// of sun) and never repeated. They go to the message feed as `clue` lines with the speaker's name (and a `mutter` ripple so Mithi sees
// the voice); they do not stop play. Nothing here is required by the story: it is company.
//
//   game.banter.say(id)    force a line by pool key (debug), game.banter.pools
const J = (text, mood) => ({ who: 'Jeetu', text, mood });
const S = (text) => ({ who: 'Setu', text });

export const POOLS = {
  rain: [
    J('Didi, it is raining on Diwali. Amma used to say it is good luck. (a sniff) I think she only said it for people without umbrellas.'),
    J('My shirt is wet through. Even my bandage is wet. I am a wet pirate.'),
  ],
  dark: [
    J('I am not scared, Didi. I am just walking close because the floor is slippery.'),
    J('Raju says there is a ghost in every tunnel in Mumbai. Raju is a liar. But still. If you hear anything, do not tell me.'),
    J('I am counting steps like Setu does. One, two, three... I forgot. Now I have to start again.'),
    J('It is so quiet down here, Didi. In Dharavi you can never hear yourself think. Here I can hear myself think, and I do not like it.'),
  ],
  shaft: [
    J('Didi, a bit of sun! It is... it is the colour of a lemon. You should stand in it. It is good for you. Everyone says.'),
    J('Look at the dust in the light. It goes up like it is going somewhere. Can we go there?'),
  ],
  night: [
    J('Fireworks, Didi! Can you hear? They are all going off over New Wadala. (a pause) Setu would have loved this. He will. He will love it.'),
    J('They are celebrating, up there. Of course they are. It is Diwali. Nobody told it about us.'),
  ],
  guilt: [
    J('I keep thinking: if I had not said baby. One word, Didi. If I had just said okay, let us go home, he would be asleep right now with his mouth open.', 'sad'),
    J('When we find him, I will say sorry first. Before he says anything. I have been practising. "Sorry, Setu." No, "Setu, I am sorry." Which one is better?', 'worry'),
  ],
  fan: [
    J('Sameer Shahjehan was lying in that bed, Didi. The real one. Setu will not believe me. I will tell him I held his hand. It is only a small lie.'),
    J('Do you think Tara madam is really that tall? On the posters she is taller than the buildings.'),
  ],
  hunger: [
    J('I am not hungry, Didi. My stomach is just making a speech.'),
    J('Didi, when this is over, I want a vada pav from the stall outside Sion station. With the green chutney. Two. No, four.'),
  ],
  hospital: [
    J('Everyone in that hospital was crying very quietly. It is worse than loud, Didi. It is like they did not want to wake the dead.'),
  ],
  setuFound: [
    S('Jeetu bhai, you said I was a baby.'),
    J('I know. I am sorry. I am so sorry, Setu. I was a donkey.', 'sad'),
    S('It is okay. I am a baby. But I am a baby who climbed four flights.'),
    J('Five. You climbed four and a half. Do not lie about the lift.', 'smile'),
    S('Didi, can I play the mouth organ? Only a little. Only one song.'),
    S('Didi, I counted four hundred and twelve steps from the vent to the tents. Then I lost count when I thought you were...'),
    J('Setu, shh. She is here. Count something else.', 'worry'),
    S('Jeetu bhai, is it true you saw Sameer Shahjehan? Tell me everything. Start from his shoes.'),
  ],
};

export class Banter {
  init(game) {
    this.game = game;
    game.banter = this;
    this.rng = game.rng.fork('banter');
    this.used = new Set(); this.next = 70; this.count = 0; this.pools = POOLS;
    game.debug?.addAction('banter', (g, key) => { this.say(key ?? this._pick()); return this.count; });
  }

  reset() { this.used.clear(); this.next = 70; this.count = 0; }

  _context() {
    const g = this.game, p = g.player, hour = g.clock?.hour ?? 8, list = [];
    const underground = p.pos.y < -4;
    if (underground) list.push('dark', 'dark', 'guilt');
    else {
      if (g.world?.sunShafts && (g.health?.status === 'healing')) list.push('shaft');
      list.push(g.flags.inHospital ? 'hospital' : 'rain', 'hunger');
      if (hour >= 19 || hour < 1) list.push('night');
    }
    if (g.flags.metTara && !g.flags.setuFound) list.push('fan');
    return list;
  }

  _pick() {
    const g = this.game;
    if (g.setu?.following) return 'setuFound';
    const ctx = this._context().filter((k) => POOLS[k].some((_, i) => !this.used.has(k + i)));
    return ctx.length ? ctx[this.rng.int(0, ctx.length - 1)] : null;
  }

  say(key) {
    const g = this.game, pool = POOLS[key];
    if (!pool) return false;
    let i = pool.findIndex((_, k) => !this.used.has(key + k));
    if (i < 0) { if (key !== 'setuFound') return false; this.used.clear(); i = 0; }
    // the Setu pool plays in order, a pair at a time
    const take = key === 'setuFound' ? 2 : 1;
    for (let k = 0; k < take && i + k < pool.length; k++) {
      const line = pool[i + k]; this.used.add(key + (i + k));
      setTimeout(() => {
        g.messages?.say(line.text, { kind: 'clue', ttl: 7.5, speaker: line.who });
        const src = line.who === 'Setu' ? g.setu?.pos : g.party?.bodies?.jeetu?._pos ?? g.player.pos;
        if (src) g.events.emit('sound:emit', { x: src.x, y: (src.y ?? 0) + 1, z: src.z, kind: 'mutter', loudness: 0.3 });
        g.voices?.say({ who: line.who, text: line.text });
      }, k * 4200);
    }
    this.count++;
    return true;
  }

  update(dt, game) {
    if (game.mode !== 'playing' || game.modal || !game.party?.jeetu) return;
    if ((this.next -= dt) > 0) return;
    this.next = 60 + this.rng.range(0, 50);
    if (game.hazards?.detaining || game.visionSystem?.active) return;
    const key = this._pick();
    if (key) this.say(key);
  }
}
