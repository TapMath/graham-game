// The 6a story director: everything the cast and the objective chain DO (as opposed to say). PLAN 1b "Game flow" steps 1 to 4 and 6.
//
//   game.director.talk(actor, memberIndex)     open the conversation for a cast member (cast/conversations.js)
//   Step 1 collapse     hold E near the old man (interactable 'dig:oldman') -> freeOldMan(); he points to the hospital
//   Step 2 hospital     Jeetu answers a song (sing:start within 45 m) or the player's footsteps: jeetuCall(); joinJeetu(); giveBlood() for Tara
//   Step 3 getting below  the jacket (item + flag), the TV remote's batteries + Mithi's dead torch = a torch, the torch boys,
//                         Gautam's bail (payBail) and his distraction of the metro guards (hazards.guards.distract)
//   Step 4 underground  the dogs: 'feed-dogs' interactable with food; Aayat / Kaalu / contractor / doctor answer from Setu's real stage
//   Step 6 bridge       Tara: bridgePermit (talk after the blood, or her call), warnViaTara() -> game.story?.warnCity?.('tara')
//
// Flags written (game.flags): oldManFreed knowsHospital knowsJeetuBed jeetuCalled jeetuTalked jeetuJoined metTara bloodGiven taraFavour
// bridgePermit metGautam gautamFree gautamAtMetro knowsShaft heardBoring reachedBelow setuLead ('liftWreck'|'catacombs'|'boringSite'|
// 'contractor'|'clinic'|'vent'|'tents'|'bridge'), inHospital, jacket, torch, hasEvidence, taraCallSent.
// Events: story:oldman-freed, story:jeetu-joined, story:blood-given, story:bail-paid {mode}, story:torch {via}, story:permit {via},
// story:learn {topic}.
import { CONVERSATIONS, setuStage, STAGES } from './cast/conversations.js';
import { defineChain } from './chain.js';
import { COSTS } from './costs.js';

const GAUTAM_WALK = [[15, -83.2], [15, -79.2], [18, -76.4], [18, -71]];
const DIG_SECONDS = 3.2;

export class Director {
  init(game) {
    this.game = game;
    game.director = this;
    this.counts = new Map();
    this.justFreed = false;
    this.dig = 0; this._digT = 0; this._digSay = 0;
    this._moanT = 2.5;
    this.gautamUntil = -1; this._gShout = 0; this.walk = null; this._calledAt = -99; this._calling = null;
    this.taraCallAt = null;
    this.stats = { talks: 0, bailMode: null, torchVia: null, blood: false };

    const S = game.world.story;
    this.S = S;
    defineChain(game, this);

    // ---- step 1: the old man under the rubble (hold E)
    const o = game.cast.get('oldman');
    this.oldman = o;
    game.interactables.add({
      id: 'dig:oldman', pos: { x: o.pos.x, y: o.pos.y, z: o.pos.z }, radius: 2.6, height: 2.4,
      prompt: () => 'Hold E: dig him out',
      enabled: () => !game.flags.oldManFreed && !game.modal,
      onInteract: () => { game.events.emit('sound:emit', { x: o.pos.x, y: o.pos.y + 0.4, z: o.pos.z, kind: 'clank', loudness: 0.3 }); },
    });
    this._holdUi();

    // ---- step 2: Jeetu hears the song
    game.events.on('sing:start', (pos) => this._heardSong(pos));

    // ---- step 3: pickups at home and in the neighbour's flat
    const home = S.mithiHome, nf = S.neighbourFlat;
    game.interactables.add({
      id: 'pick:remote', pos: { x: home.remote.x, y: 0, z: home.remote.z }, radius: 2.0, height: 2.2,
      prompt: () => (game.items.has('torch') ? 'Take the remote\'s batteries (spare)' : 'Take the batteries from the TV remote'),
      enabled: () => !game.modal && !game.flags.tookBatteries,
      onInteract: () => this.takeBatteries(),
    });
    game.interactables.add({
      id: 'pick:food', pos: { x: home.x + 1.2, y: 0, z: home.z + 3.2 }, radius: 2.2, height: 2.2,
      prompt: () => 'Pack food and water',
      enabled: () => !game.modal && !game.items.has('food') && !game.flags.tookFood,
      onInteract: () => {
        game.flags.tookFood = true;
        game.items.add('food');
        game.messages?.say('Roti wrapped in cloth, a bottle that sloshes. Enough to share, if sharing is needed.', { kind: 'story', ttl: 6 });
      },
    });
    game.interactables.add({
      id: 'pick:jacket', pos: { x: nf.jacket.x + 0.9, y: 0, z: nf.jacket.z }, radius: 2.4, height: 2.4,
      prompt: () => 'Take the blue Metro jacket',
      enabled: () => !game.modal && !game.items.has('jacket') && !game.flags.tookJacket,
      onInteract: () => this.takeJacket(),
    });
    // feed the dogs: a moving spot at the nearest dog
    this.feed = game.interactables.add({
      id: 'feed-dogs', pos: { x: 0, y: -999, z: 0 }, radius: 9, height: 3.5,
      prompt: () => 'Throw the food to the dogs',
      enabled: () => !game.modal && game.items.has('food') && this._dogNear,
      onInteract: () => this.feedDogs(),
    });
    this._dogNear = null;

    // ---- detention at a guard's hand goes to the police station while Gautam is still inside (PLAN 1b)
    if (game.hazards) game.hazards.releaseAt = (info) => (!game.flags.gautamFree && info.by === 'guard'
      ? { id: 'police-station', name: 'the police station', x: S.policeStation.x, y: 0, z: S.policeStation.desk.z + 1.5, yaw: Math.PI } : null);

    game.events.on('setu:found', () => { game.flags.setuLead = null; });
    game.events.on('city:warned', () => game.objectives?.complete('warn'));

    const d = game.debug;
    d?.addAction('talk', (g, id, i = 0) => { const a = g.cast.get(id); if (!a) throw new Error('no cast member ' + id); this.talk(a, i); return d.state().dialogue6a; });
    d?.addAction('dig', () => { this.freeOldMan(); return true; });
    d?.addAction('walkGautam', () => { this.walk && (this.walk.i = this.walk.pts.length); return true; });
    d?.addState('story6a', () => this.snapshot());
    d?.addSetter('taraFavour', (g, v) => { g.flags.taraFavour = !!v; if (v) g.flags.bloodGiven = true; });
  }

  // ------------------------------------------------------------------------------------------ talking
  canTalk(a, i) {
    const dn = this._dogNear, p = this.game.player.pos;
    if (dn && Math.hypot(dn.x - p.x, dn.z - p.z) < 7) return false;      // dogs on you and food in the pack: E feeds them, nobody wants a chat
    if (a.id === 'oldman') return !!this.game.flags.oldManFreed;       // buried: E digs (hold), it does not chat
    if (a.id === 'jeetu') return this.game.party?.active !== 'jeetu';
    if (a.id === 'gautam' && this.walk) return false;
    return true;
  }

  promptFor(a, i) {
    const g = this.game, f = g.flags;
    switch (a.id) {
      case 'jeetu': return g.party?.jeetu ? 'Talk to Jeetu' : (f.jeetuCalled ? 'Talk to Jeetu: he is waving' : 'Talk to the boy in the bed');
      case 'sleepers': return 'Listen';
      case 'sameer': return 'Stand by the bed';
      case 'nurses': case 'rescuers-collapse': case 'rescuers-triage': return `Talk to ${a.name.toLowerCase()}`;
      case 'torchBoys': return 'Talk to the boys with the torch';
      case 'oldman': return 'Talk to the old man';
      default: return `Talk to ${a.name}`;
    }
  }

  talk(a, i = 0) {
    const g = this.game;
    if (g.modal || !g.dialogue) return false;
    const key = a.id, make = CONVERSATIONS[key];
    if (!make) return false;
    // Phase 8C: the cards know who is asking (ctx.as): written for what Mithi hears and feels, or for what Jeetu sees. No swapping.
    const n = this.counts.get(key + ':' + i) ?? 0;
    const as = g.party?.active === 'jeetu' ? 'jeetu' : 'mithi';
    const spec = make(g, { actor: a, idx: i, n, d: this, as });
    this.counts.set(key + ':' + i, n + 1);
    this.stats.talks++;
    const p = g.cast.worldPos(a);
    this._face = { x: p.x, y: (p.y ?? 0) + (a.id === 'jeetu' || a.id === 'sameer' ? 0.35 : a.id === 'aayat' || a.id === 'torchBoys' ? 0.55 : 1.05), z: p.z };
    g.dialogue.open({
      speaker: a.name, role: a.role, portrait: a.portrait, portraitColor: a.color, pos: { x: p.x, y: p.y, z: p.z }, actor: a, memberIndex: i, ...spec,
      onClose: () => { spec.onClose?.(); g.events.emit('story:talked', { id: a.id, idx: i }); },
    });
    return true;
  }

  /** Jeetu fetches Mithi (or Mithi hands the talk back): swap the controlled character, then carry on the same conversation. */
  handTo(who, actor, idx = 0) {
    const g = this.game;
    if (g.party?.active !== who && g.party?.switchTo?.(who)) {
      g.messages?.say(who === 'mithi' ? '"Didi! Didi, come! She needs your blood!" Jeetu runs off to fetch her, and a moment later you are Mithi again, walking to the ward.' : '"Okay, I will go." Jeetu takes the lead.', { kind: 'clue', ttl: 5, speaker: 'Jeetu' });
      g.wait(0.6).then(() => { if (!g.modal) this.talk(actor, idx); });
    }
  }

  // ------------------------------------------------------------------------------------------ knowledge
  learn(topic) {
    const f = this.game.flags;
    if (topic === 'hospital') f.knowsHospital = true;
    if (topic === 'jeetuBed') { f.knowsHospital = true; f.knowsJeetuBed = true; }
    this.game.events.emit('story:learn', { topic });
  }

  /** Someone told us where Setu is, from where he really is on his timeline. */
  learnSetu(who) {
    const g = this.game, st = setuStage(g), f = g.flags;
    const LEAD = { 0: 'liftWreck', 1: 'catacombs', 2: 'contractor', 3: 'clinic', 4: 'vent', 5: 'tents', 6: 'bridge' };
    if (st >= 0) {
      // Kaalu says "ask the contractor" while Setu is at the machine or at the clinic; the contractor, while he is still at the machine, says he is right here
      f.setuLead = who === 'kaalu' && (st === 2 || st === 3) ? 'contractor' : (who === 'contractor' && st === 2 ? 'boringSite' : LEAD[st]);
    }
    f['asked_' + who] = true;
    g.events.emit('story:learn', { topic: 'setu', who, stage: st, lead: f.setuLead });
  }

  // ------------------------------------------------------------------------------------------ step 1: the dig
  _holdUi() {
    const el = this.holdEl = document.createElement('div');
    el.className = 'hud-hold'; el.hidden = true;
    el.innerHTML = '<div class="lbl">DIGGING</div><div class="bar"><i></i></div><span class="scrawl rot-b">hold on...</span>';
    document.getElementById('hud').appendChild(el);
    this.holdBar = el.querySelector('i');
  }

  freeOldMan() {
    const g = this.game, f = g.flags, o = this.oldman;
    if (f.oldManFreed) return false;
    f.oldManFreed = true; f.knowsHospital = true;
    this.dig = 0; this.holdEl.hidden = true;
    o.mesh.visible = false; o.faceMesh.visible = false;               // the heap and the buried man give way to a standing, shaken one
    o.hiddenModel = false; o.model.group.visible = true; o.model.setMood('worry'); o.group.rotation.y = 0;
    g.cast.place(o, o.pos.x - 1.15, o.pos.y, o.pos.z + 0.55, o.yaw + 1.1);
    const it = g.interactables.get('talk:oldman'); if (it) { it.pos.x = o.pos.x; it.pos.z = o.pos.z; }
    g.interactables.remove('dig:oldman');
    this.justFreed = true;
    g.hazards?.dust(o.pos.x, o.pos.y, o.pos.z, 8, 1.4, { size: 2.2, life: 2.6 });
    g.events.emit('sound:emit', { x: o.pos.x, y: o.pos.y + 0.4, z: o.pos.z, kind: 'collapse', loudness: 0.35 });
    g.events.emit('story:oldman-freed', {});
    this.talk(o);
    return true;
  }

  _updateDig(dt, game) {
    const o = this.oldman;
    if (game.flags.oldManFreed) { this._moanT = Infinity; return; }
    const p = game.player, near = Math.hypot(p.pos.x - o.pos.x, p.pos.z - o.pos.z) < 2.7 && !game.modal;
    const held = near && game.input.action('interact');
    if (held) {
      this.dig += dt / DIG_SECONDS;
      this._digT -= dt;
      if (this._digT <= 0) {
        this._digT = 0.55;
        game.events.emit('sound:emit', { x: o.pos.x, y: o.pos.y + 0.4, z: o.pos.z, kind: 'clank', loudness: 0.4 });
        game.hazards?.dust(o.pos.x, o.pos.y, o.pos.z, 2, 0.8, { size: 1.6, life: 1.8 });
      }
      const say = this.dig > 0.66 ? 2 : this.dig > 0.3 ? 1 : 0;
      if (say > this._digSay) {
        this._digSay = say;
        game.messages?.say(say === 1 ? 'Concrete, grit, a rod of rebar bent like a wrist. Under it, a warm hand.' : 'The slab shifts. Breath, loud and thin, comes up through the dust.', { kind: 'story', ttl: 5 });
      }
      if (this.dig >= 1) this.freeOldMan();
    } else this.dig = Math.max(0, this.dig - dt * 0.9);
    const show = near && this.dig > 0.02;
    if (this.holdEl.hidden === show) this.holdEl.hidden = !show;
    if (show) this.holdBar.style.width = Math.min(100, this.dig * 100) + '%';
    // the moan that leads you there
    this._moanT -= dt;
    if (this._moanT <= 0) {
      this._moanT = 6.5;
      game.events.emit('sound:emit', { x: o.pos.x, y: o.pos.y + 0.5, z: o.pos.z, kind: 'mutter', loudness: 0.62 });
      if (!this._moanSaid && game.time > 1.5) { this._moanSaid = true; game.messages?.say('Under the sirens and the cranes of Sion Junction, something else. A moan, human and low, east of you, under the rubble.', { kind: 'story', ttl: 9 }); }
      else if (Math.hypot(p.pos.x - o.pos.x, p.pos.z - o.pos.z) < 40) game.messages?.caption('someone moaning under the rubble', 3);
    }
  }

  // ------------------------------------------------------------------------------------------ step 2: Jeetu
  _heardSong(pos) {
    const g = this.game, J = g.cast.get('jeetu');
    if (!J || g.party?.jeetu || g.flags.jeetuJoined) return;
    const p = pos ?? g.player.pos;
    if (Math.hypot(p.x - J.pos.x, p.z - J.pos.z) < 45 && Math.abs(p.y - J.pos.y) < 6) this._calling = { at: g.time + 1.3, via: 'song' };
  }

  jeetuCall(via = 'near') {
    const g = this.game, J = g.cast.get('jeetu');
    if (!J || g.party?.jeetu) return false;
    this._calledAt = g.time;
    g.flags.jeetuCalled = true;
    g.messages?.say('A boy\'s voice, high and cracked, carries over the beds of Sion Hospital: "Didi! Didi, I\'m here! DIDI!"', { kind: 'clue', ttl: 7, speaker: 'Jeetu' });
    g.events.emit('sound:emit', { x: J.pos.x, y: J.pos.y + 0.8, z: J.pos.z, kind: 'mutter', loudness: 0.8, who: 'jeetu' });
    g.events.emit('story:jeetu-call', { via });
    return true;
  }

  joinJeetu() {
    const g = this.game;
    if (g.party?.jeetu) return;
    g.party.join();
    g.flags.jeetuFound = true; g.flags.knowsHospital = true;
    g.items.add('pills', { silent: true });         // unchanged; keeps the row stable if it was removed by a debug path
    g.messages?.say('Jeetu joins you. He will be your eyes. (Tab: swap places with him.)', { kind: 'system', ttl: 6 });
    g.events.emit('story:jeetu-joined', {});
    g.objectives?.refresh(true);
  }

  // ------------------------------------------------------------------------------------------ costs
  _fadePay(hours, reason, then) {
    const g = this.game;
    g.screenfx?.fade(1, 0.45);
    g.wait(0.55).then(() => {                          // simulation time, so tests that step the game are deterministic
      g.clock?.advance(hours, reason);
      g.screenfx?.fade(0, 0.9);
      then?.();
    });
  }

  giveBlood() {
    const g = this.game, f = g.flags;
    if (g.player.rays < COSTS.blood.min) return { lines: ['You are shaking. I cannot take it from you. Find some light first.'], choices: [{ label: 'I will be back.' }] };
    g.health?.damage(COSTS.blood.rays, 'blood');
    f.bloodGiven = true; f.taraFavour = true;
    this.stats.blood = true;
    this.taraCallAt = g.clock.t + 1.3;
    this._fadePay(COSTS.blood.hours, 'blood');
    g.events.emit('story:blood-given', {});
    return {
      lines: [
        N_('A needle, a rubber tube, a cold bright line in the crook of your arm. You count the beeps from the next room to keep still. Somewhere in them, a man\'s heart takes up a little of yours.'),
        { text: 'Thank you. Thank you. (her voice breaks, then steadies) What is your brother\'s name?', mood: 'sad', g: 'chest' },
        N_('Nobody has thanked her in a long time, and the word sits on her like a coat that is too warm. She does not know where to put her hands.'),
        { text: 'Setu. Eight, asthma. I will make calls: the press, the Bridge Authority, anyone who still answers a phone at this hour. Come back when you know where he is. And child... do not let that arm go cold.', mood: 'worry', g: 'explain' },
      ],
      choices: [{ label: 'Thank you, Tara.' }],
    };
  }

  grantPermit(via = 'talk') {
    const g = this.game, f = g.flags;
    if (f.bridgePermit) return false;
    f.bridgePermit = true;
    g.messages?.say('Tara has arranged it: the pier gate on the Sewri quay will open for you.', { kind: 'system', ttl: 7 });
    g.events.emit('story:permit', { via });
    g.objectives?.complete('permit');
    return true;
  }

  warnViaTara() {
    const g = this.game;
    if (g.story?.warnCity) g.story.warnCity('tara');
    else { g.flags.cityWarned = true; g.events.emit('city:warned', { via: 'tara' }); g.messages?.say('Tara takes the folder. Within the hour, every screen in the city is showing the tunnels.', { kind: 'story', ttl: 8 }); }
    return {
      lines: [{ text: '(she reads, and her face changes) The pumping chamber. The ledger. A seawall at Mahim Creek, and children... Child, they knew. Give me an hour and a camera crew. I will put this on every screen from Sewri to Colaba, if I have to climb into the studio myself.', mood: 'angry', g: 'explain' }],
      choices: [{ label: 'Thank you.' }],
    };
  }

  payBail(mode) {
    const g = this.game, f = g.flags;
    if (mode === 'rays') g.health?.damage(COSTS.bail.rays, 'bail'); else this._fadePay(COSTS.bail.hours, 'bail');
    this.stats.bailMode = mode;
    f.gautamFree = true;
    const ga = g.cast.get('gautam'); if (ga) ga.role = 'FREE';
    g.world.doors?.['police-cell-gautam']?.setClosed(false);
    g.events.emit('story:bail-paid', { mode });
    this._startGautamWalk();
    return {
      lines: [mode === 'rays' ? N_('You count out what you have, in light. The sergeant takes it with the look of a man who has been paid in worse.') : N_('Forms. A stamp. Another stamp. The pen scratches for two hours and nobody apologises.'),
        'Go. I will be at the Metro gate in a few minutes. You will hear me.', 'Mithi... find him.'],
      choices: [{ label: 'Thank you, Gautam.' }],
    };
  }

  buyTorch(mode) {
    const g = this.game;
    if (mode === 'rays') g.health?.damage(COSTS.torch.rays, 'torch'); else this._fadePay(COSTS.torch.hours, 'torch');
    g.items.add('torch');
    this.stats.torchVia = mode;
    g.events.emit('story:torch', { via: mode });
    g.party?.jeetuModel?.setVariant?.('torch');
    return {
      lines: [N_(mode === 'rays' ? 'A small cold weight in your hand: metal, warm from a pocket. The click of a switch, a thin pale buzz you can feel in your teeth.' : 'Two cans on a carrying pole. An hour of stairs. Your shoulders will remember.'), 'Good torch, didi. If it dies, shake it.'],
      choices: [{ label: 'Thank you.' }],
    };
  }

  takeBatteries() {
    const g = this.game, f = g.flags, it = g.items;
    f.tookBatteries = true;
    it.add('tvRemote', { silent: true });
    it.add('batteries', { silent: true });
    if (!it.has('torch')) {
      // Mithi's own torch has been dead since the morning: two fat batteries bring it back
      it.remove('batteries'); it.remove('tvRemote');
      it.add('torch', { silent: true });
      g.messages?.say('The remote\'s back pops open. Two fat batteries. Mithi\'s old torch, dead since morning, clicks, and the thin buzz of a beam hums against your palm.', { kind: 'story', ttl: 8 });
      g.messages?.say(g.party?.jeetu ? '"Why didn\'t we think of this before?!" Jeetu laughs, and nearly cries.' : 'A short surprised laugh escapes you. Why did nobody think of this before?', { kind: 'clue', ttl: 7, speaker: g.party?.jeetu ? 'Jeetu' : null });
      this.stats.torchVia = this.stats.torchVia ?? 'batteries';
      g.party?.jeetuModel?.setVariant?.('torch');
      g.events.emit('story:torch', { via: 'batteries' });
    } else g.messages?.say('Two spare batteries, warm from the remote. In the dark, spares matter.', { kind: 'story', ttl: 5 });
  }

  takeJacket() {
    const g = this.game;
    g.flags.tookJacket = true;
    g.items.add('jacket');
    g.messages?.say('The blue Metro jacket, still on its hook. Your neighbour sold tickets in it. He will not need it. It is too big for you, and it smells of the ticket office.', { kind: 'story', ttl: 8 });
    if (g.party?.jeetu) g.messages?.say('"Now they will think you work there, Didi. Do not run. Do not sing near the guards."', { kind: 'clue', ttl: 6, speaker: 'Jeetu' });
  }

  feedDogs() {
    const g = this.game, h = g.hazards;
    if (!g.items.remove('food')) return;
    const p = g.player.pos;
    h?.dogs?.onSing({ x: p.x, y: p.y, z: p.z });
    for (const dog of h?.dogs?.dogs ?? []) if (Math.hypot(dog.x - p.x, dog.z - p.z) < 22 && dog.calm > 0) dog.calm = 55;
    g.messages?.say('You crumble the roti into the dark. Claws stop on stone. Wet noses, a rough tongue on your fingers, a thin whine of thanks. They will let you pass.', { kind: 'story', ttl: 8 });
    g.events.emit('story:fed-dogs', {});
  }

  // ------------------------------------------------------------------------------------------ Gautam
  gautamDistracting() { return this.game.flags.gautamAtMetro && this.game.clock.t < this.gautamUntil; }

  _startGautamWalk() {
    const g = this.game, a = g.cast.get('gautam');
    this.walk = { pts: GAUTAM_WALK, i: 0, a };
    g.messages?.say('The cell door grinds open. Gautam steps out, rubbing his wrist, and strides for the street.', { kind: 'story', ttl: 6 });
  }

  _updateGautam(dt, game) {
    const a = game.cast.get('gautam'); if (!a) return;
    if (this.walk) {
      const w = this.walk, pts = w.pts;
      if (w.i >= pts.length) {
        this.walk = null; w.a.hiddenFlag = true; w.a.group.visible = false;
        game.flags.gautamLeft = true;
        this._gautamAt = game.time + 22;                      // he reaches the Metro gate
        return;
      }
      const [tx, tz] = pts[w.i], dx = tx - a.pos.x, dz = tz - a.pos.z, dist = Math.hypot(dx, dz), step = 3.1 * dt;
      if (dist < step + 0.05) { w.i++; return; }
      const nx = a.pos.x + dx / dist * step, nz = a.pos.z + dz / dist * step;
      const gh = game.physics.groundHeightAt(nx, nz, a.pos.y + 0.4, 0.8);
      game.cast.place(a, nx, gh > -Infinity ? gh : a.pos.y, nz, Math.atan2(-dx, -dz));
      a.speed = 3.1;
      return;
    }
    a.speed = 0;
    if (this._gautamAt && game.time >= this._gautamAt) {
      this._gautamAt = 0;
      const gh = game.physics.groundHeightAt(47.3, 0.8, 0.5, 0.8);
      a.hiddenFlag = false;
      game.cast.place(a, 47.3, gh > -Infinity ? gh : 0, 0.8, 0.15);
      game.flags.gautamAtMetro = true;
      this.gautamUntil = game.clock.t + 4;                       // the guards are busy for four game hours
      game.messages?.say('Far down the street, a voice you know, raised and ringing: "Open the shutters! There are people down there!" The guards at Dharavi Metro are shouting back.', { kind: 'story', ttl: 9 });
      game.events.emit('story:gautam-metro', {});
    }
    if (game.flags.gautamAtMetro) {
      const live = game.clock.t < this.gautamUntil;
      const near = Math.hypot(game.player.pos.x - 45, game.player.pos.z - 10) < 90;
      if (live && near) game.hazards?.guards?.distract(3);
      // he waves his arms while he shouts
      if (a.model && live && a.group.visible) { a.model.setMood('shout'); a.model.setTalking(true); a.model.gesture('shout', 0.5); } else if (a.model) { a.model.setTalking(false); a.model.setMood('neutral'); }
      if (live && near) {
        this._gShout -= dt;
        if (this._gShout <= 0) {
          this._gShout = 14;
          game.events.emit('sound:emit', { x: a.pos.x, y: a.pos.y + 1.4, z: a.pos.z, kind: 'mutter', loudness: 0.75, who: 'gautam' });
          if (Math.hypot(game.player.pos.x - a.pos.x, game.player.pos.z - a.pos.z) < 50) game.messages?.say(pickLine(this._gn = (this._gn ?? 0) + 1), { kind: 'clue', ttl: 5, speaker: 'Gautam' });
        }
      } else if (!live && !this._gDone) { this._gDone = true; game.messages?.say('Gautam\'s voice cracks, and stops. The guards have stopped listening to him, and he has stopped pretending they will.', { kind: 'story', ttl: 6 }); }
    }
  }

  // ------------------------------------------------------------------------------------------ frame
  update(dt, game) {
    const f = game.flags, p = game.player;
    // calling Jeetu: by song, or by walking into his ward
    const J = game.cast.get('jeetu');
    if (J && !game.party?.jeetu && game.mode === 'playing') {
      const d = Math.hypot(p.pos.x - J.pos.x, p.pos.z - J.pos.z), same = Math.abs(p.pos.y - J.pos.y) < 6;
      if (this._calling && game.time >= this._calling.at) { const v = this._calling.via; this._calling = null; this.jeetuCall(v); }
      else if (same && d < 7 && game.time - this._calledAt > 14 && !game.modal && (this._nearCalls = this._nearCalls ?? 0) < 3) { this._nearCalls++; this.jeetuCall('near'); }
    }
    if (!f.reachedBelow && p.pos.y < -4) { f.reachedBelow = true; game.events.emit('story:below', {}); }
    f.inHospital = p.pos.x > -63 && p.pos.x < -27 && p.pos.z > 72 && p.pos.z < 94 && p.pos.y > -2;
    if (f.inHospital) f.visitedHospital = true;
    if (this._face && game.dialogue?.isOpen) {                // turn to face whoever is speaking (the pointer is free, the body is not)
      const fx = this._face.x - p.pos.x, fz = this._face.z - p.pos.z, fy = this._face.y - p.eyeY;
      const wantYaw = Math.atan2(-fx, -fz), wantPitch = Math.max(-0.65, Math.min(0.3, Math.atan2(fy, Math.hypot(fx, fz))));
      let dy = wantYaw - p.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      p.yaw += Math.max(-4 * dt, Math.min(4 * dt, dy));
      p.pitch += Math.max(-2 * dt, Math.min(2 * dt, wantPitch - p.pitch));
    }
    this._updateDig(dt, game);
    this._updateGautam(dt, game);
    // Tara's call
    if (this.taraCallAt && game.clock.t >= this.taraCallAt && !f.bridgePermit) {
      this.taraCallAt = null; f.taraCallSent = true;
      this.grantPermit('call');
      game.messages?.say(game.party?.jeetu ? 'Jeetu\'s phone buzzes, a number you do not know. "Madam Tara," he whispers. "She says the pier gate is yours."' : 'A hospital runner finds you with a folded note in Tara\'s hand: the pier gate on the Sewri quay will open for you.', { kind: 'clue', ttl: 9 });
    }
    // dogs near, food in the pack: the feed spot follows the nearest dog
    if (game.items.has('food') && game.hazards?.enabled) {
      let best = null, bd = 9;
      for (const dog of game.hazards.dogs?.dogs ?? []) {
        if (dog.asleep) continue;
        const d = Math.hypot(dog.x - p.pos.x, dog.z - p.pos.z);
        if (d < bd && Math.abs(dog.y - p.pos.y) < 2.5) { bd = d; best = dog; }
      }
      this._dogNear = best;
      if (best) { this.feed.pos.x = best.x; this.feed.pos.y = best.y; this.feed.pos.z = best.z; } else this.feed.pos.y = -999;
    } else { this._dogNear = null; this.feed.pos.y = -999; }
  }

  snapshot() {
    const g = this.game, f = g.flags;
    const keys = ['oldManFreed', 'knowsHospital', 'jeetuCalled', 'jeetuJoined', 'metTara', 'bloodGiven', 'taraFavour', 'bridgePermit', 'metGautam', 'gautamFree', 'gautamAtMetro', 'reachedBelow', 'setuLead', 'jacket', 'torch', 'cityWarned', 'breachKnown', 'hasEvidence', 'inHospital'];
    const flags = {}; for (const k of keys) flags[k] = f[k] ?? false;
    return {
      party: g.party?.snapshot?.(), items: g.items?.list?.(), objectives: g.objectives?.primary !== undefined && { primary: g.objectives.primary && { id: g.objectives.primary.id, text: g.objectives.primary.text }, optional: g.objectives.optional.map((o) => ({ id: o.id, text: o.text })), done: [...g.objectives.doneIds] },
      flags, dig: +this.dig.toFixed(2), setuStage: setuStage(g), stageName: STAGES[setuStage(g)] ?? 'found', stats: { ...this.stats },
      gautam: { walking: !!this.walk, distracting: !!this.gautamDistracting(), until: this.gautamUntil > 0 ? +this.gautamUntil.toFixed(2) : null }, talks: this.stats.talks,
      cast: g.cast ? [...g.cast.actors.values()].map((a) => a.id) : [],
    };
  }
}

const N_ = (text) => ({ narr: text });
const GAUTAM_LINES = [
  '"Open the shutters! There are children under there!"',
  '"Do you hear it? Do you hear them knocking? Listen!"',
  '"Fine! Arrest me again! I will say it from the cell!"',
  '"Every ticket booth, every shutter, and not one of you can hear a child!"',
  '"I have two hands! Give me a shovel and one hour, and I will be out of your way!"',
];
function pickLine(i) { return GAUTAM_LINES[i % GAUTAM_LINES.length]; }
