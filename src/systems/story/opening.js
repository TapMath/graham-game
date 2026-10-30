// The opening act (after the collapse cutscene): the first minutes of the game happen inside the police cordon round the crash site at
// Sion Junction, and Mithi's first actions come out of the rescue going on around her. The world opens up when she has done her part.
//
//   game.opening.active          true while the sequence holds (the cordon is shut); false once it is open, or when it never ran
//   game.opening.stage           'wait' (the cutscene) | 'hat' | 'rubble' | 'stretcher' | 'oldman' | 'done'
//   game.opening.live            the sequence ran this game (normal play, or ?opening=1); the debris and the voices only run when live
//   game.opening.digReady()      the old man's moan and the dig (director.js) wait for this
//   game.opening.skip()          jump to the open world (debug, and the safety valve)
//
// The sequence (each step is an objective, see `_objectives`; the map finds them through mapdata.registerObjectiveSpots):
//   1 hat        a volunteer is shouting "hard hats!" at the red crate: take one (E). It saves a ray when debris hits you.
//   2 rubble     the bucket line: hold E at the pile to lift a chunk, carry it to the spoil heap, E to drop it. Three times.
//   3 stretcher  a stretcher team is one bearer short: take the back handles (E) and follow the front bearer's voice to the stretcher row.
//   4 oldman     a rescuer calls for quiet, and in the hush there is a moan: the chain's 'collapse' objective (dig him out, director.js).
//   then         the police open the line, and the chain carries on to the hospital.
//
// Round it, all the time (and after the opening too, while she is at the site): the crowd at work (crowds.place agents driven here: the
// bucket line, stretcher teams, a volunteer handing out hard hats and the people coming for them, people running, diggers, constables at the
// tape, rescue squads arriving), ambulances that come one at a time through the south gate and take the injured from the stretcher row, the
// voices of the site (opening-lines.js) and, while live, pieces of the broken decks still falling from above (a creak, a shout, a shadow,
// then the chunk). With ?autostart=1 the sequence does not run (tests); ?opening=1 runs it anyway, ?opening=0 never.
import * as THREE from '../../../vendor/three.module.js';
import { buildCrashSite, SPOTS, CORDON, ROW_X, isClear } from '../../world/crashsite.js';
import { registerObjectiveSpots } from '../../ui/mapdata.js';
import { Glows } from '../hazards/render.js';
import { LINES, CALLS } from './opening-lines.js';

const STAGES = ['wait', 'hat', 'rubble', 'stretcher', 'oldman', 'done'];
const RUBBLE_TRIPS = 3;
const LIFT_SECONDS = 1.3;
const SITE = { x: -46, z: -21, r: 75 };                                   // within this of the site, the life of it runs and is heard
const AMB = { first: 70, gap: [75, 95], speed: 6.5, load: 2, wait: 22 };   // ambulances: the first arrives 70 s into the opening, then one every 75-95 s
const KHAKI = [0.62, 0.52, 0.32], KHAKI_D = [0.42, 0.36, 0.22];
const lerp = (a, b, t) => a + (b - a) * t;
const hd = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

export class OpeningSystem {
  init(game) {
    this.game = game;
    game.opening = this;
    const P = game.params;
    this.live = !P.arena && (P.opening === true || (P.opening == null && !P.autostart));
    this.rng = game.rng.fork('opening');
    this.site = buildCrashSite(game, { cordon: this.live });
    this.stage = this.live ? 'wait' : 'done';
    this.active = this.live;
    this.t = 0; this.st = 0;                       // seconds since the opening began; seconds in this stage
    this.trips = 0; this.carrying = null; this.lift = 0;
    this.stats = { hits: 0, hatSaves: 0, chunks: 0, ambulances: 0, loaded: 0, barks: 0 };
    this._said = new Map(); this._next = { bark: 6, ambient: 9, debris: 14, call: 3, cordon: 0 };
    this.warn = [];                                // debris on its way: {x, z, y0, t, at, s, chunk}
    this._timers = [];

    this._buildCrowd();
    this._buildProps();
    this.amb = { ...this.site.ambulance(), state: 'away', t: AMB.first, n: 0, z: SPOTS.road.z, loaded: 0, medics: [], honk: 0 };
    this.glows = new Glows(game, 40);
    const r0 = game.render.bind(game);
    game.render = () => { try { this._draw(); } catch (e) { if (!this._warned) { this._warned = true; console.error('[opening] draw failed:', e); } } r0(); };

    if (this.live) {
      this._interactables();
      this._objectives();
      this._holdUi();
      game.events.on('cinematic:end', ({ name }) => { if (name === 'opening' && this.stage === 'wait') this._begin(); });
      game.events.on('story:oldman-freed', () => { this._freedAt = this.t; });
      game.events.on('story:talked', ({ id }) => { if (id === 'oldman' && this.stage === 'oldman') this._open('talked'); });
    }
    registerObjectiveSpots((id) => this._spots(id));

    const d = game.debug;
    d?.addState('opening', () => this.snapshot());
    d?.addAction('openingSkip', () => { this.skip(); return this.snapshot(); });
    d?.addAction('openingStage', (g, s) => { this._setStage(s); return this.snapshot(); });
    d?.addAction('openingDebris', (g, onPlayer = true) => { this._debris(onPlayer, true); return this.warn.length; });
    d?.addAction('openingAmbulance', () => { if (this.amb.state === 'away') this.amb.t = 0; return this.amb.state; });
  }

  // ------------------------------------------------------------------------------------------------ the sequence
  digReady() { return !this.live || this.stage === 'oldman' || this.stage === 'done'; }

  _begin() {
    if (this.stage !== 'wait') return;
    this._setStage('hat');
    this._shout(this.agents.giver, CALLS.hatShout, { voice: true });
  }

  _setStage(s) {
    if (!STAGES.includes(s) || s === this.stage) return;
    const prev = this.stage;
    this.stage = s; this.st = 0;
    if (s === 'done') { this.active = false; this._dropCarry(); }
    if (s === 'rubble' && prev === 'hat') this._say('A bucket line runs from the pile to the spoil heap: hands passing concrete, hands passing rebar, nobody talking but to count.', 'story', 8);
    if (s === 'stretcher') this._say('Over the din, a man is shouting for one more pair of hands on a stretcher. West of you, by the fallen deck.', 'story', 8);
    if (s === 'oldman') {
      this._shout(this.agents.giver, CALLS.quiet, { voice: true });
      this.game.sfx?.groan?.(3, 0.18);
      this.hush = 10;
    }
    this.game.objectives?.refresh(true);
    this.game.events.emit('opening:stage', { stage: s, prev });
  }

  skip() {
    if (this.stage === 'done') return;
    const g = this.game;
    if (!g.items?.has('hardhat')) g.items?.add('hardhat', { silent: true });
    this.trips = Math.max(this.trips, RUBBLE_TRIPS); g.flags.openingStretcher = true;
    this._open('skip');
  }

  _open(via) {
    if (this.stage === 'done') return;
    const g = this.game;
    this._setStage('done');
    g.flags.openingDone = true;
    this.site.cordon?.open();
    if (via !== 'skip') {
      this._shout(this.agents.police[0], CALLS.open, { voice: true });
      g.messages?.say('The police drag the barricades aside and the crowd spills out into Sion. The city is open to you now. Find Setu.', { kind: 'story', ttl: 9 });
    }
    g.events.emit('opening:open', { via });
  }

  // ------------------------------------------------------------------------------------------------ objectives and the map
  _objectives() {
    const g = this.game, O = g.objectives;
    if (!O) return;
    O.define({ id: 'os-hat', order: 1, text: 'Debris is still falling from the broken SkyGrid. A volunteer is shouting "hard hats!" by the red crate, north-east of you. Take one (E).',
      when: () => this.stage === 'hat', done: () => this.stage !== 'wait' && this.stage !== 'hat' });
    O.define({ id: 'os-rubble', order: 2,
      text: () => (this.carrying === 'chunk'
        ? `Carry the chunk west to the spoil heap and drop it there (E). Follow the rescuer's voice. (${this.trips}/${RUBBLE_TRIPS})`
        : `Join the bucket line: hold E at the pile under the fallen deck to lift a chunk, carry it to the spoil heap. (${this.trips}/${RUBBLE_TRIPS})`),
      when: () => this.stage === 'rubble', done: () => STAGES.indexOf(this.stage) > STAGES.indexOf('rubble') });
    O.define({ id: 'os-stretcher', order: 3,
      text: () => (this.carrying === 'stretcher'
        ? 'Carry the stretcher with him to the stretcher row by the triage tents. Stay close to his voice: if you fall behind, he waits.'
        : 'A stretcher team is one bearer short, west of you by the fallen deck. Take the back handles (E).'),
      when: () => this.stage === 'stretcher', done: () => STAGES.indexOf(this.stage) > STAGES.indexOf('stretcher') });
  }

  _spots(id) {
    const S = SPOTS;
    switch (id) {
      case 'os-hat': return [{ x: S.hat.x, z: S.hat.z, level: 'G', label: 'hard hats' }];
      case 'os-rubble': return this.carrying === 'chunk' ? [{ x: S.heap.x, z: S.heap.z, level: 'G', label: 'spoil heap' }] : [{ x: S.pile.x, z: S.pile.z, level: 'G', label: 'the pile' }];
      case 'os-stretcher': return this.carrying === 'stretcher' ? [{ x: S.row.x, z: S.row.z, level: 'G', label: 'stretcher row' }] : [{ x: this.str.x, z: this.str.z, level: 'G', label: 'stretcher' }];
      default: return null;
    }
  }

  // ------------------------------------------------------------------------------------------------ interactables
  _interactables() {
    const g = this.game, I = g.interactables, S = SPOTS;
    I.add({ id: 'opening:hat', pos: { x: S.hat.x + Math.sin(S.hat.yaw) * 0.9, y: 0, z: S.hat.z + Math.cos(S.hat.yaw) * 0.9 }, radius: 2.4, height: 2.4,
      prompt: () => 'Take a hard hat', enabled: () => !g.modal && !g.items.has('hardhat'), onInteract: () => this.takeHat() });
    I.add({ id: 'opening:lift', pos: { x: S.pile.x, y: 0, z: S.pile.z }, radius: 2.5, height: 2.6,
      prompt: () => 'Hold E: lift a chunk off the pile', enabled: () => !g.modal && this.stage === 'rubble' && !this.carrying,
      onInteract: () => g.events.emit('sound:emit', { x: S.pile.x, y: 0.5, z: S.pile.z, kind: 'clank', loudness: 0.3 }) });
    I.add({ id: 'opening:drop', pos: { x: S.heap.x, y: 0, z: S.heap.z }, radius: 2.8, height: 2.6,
      prompt: () => 'Drop the chunk on the heap', enabled: () => !g.modal && this.carrying === 'chunk', onInteract: () => this.dropChunk() });
    this.strIt = I.add({ id: 'opening:stretcher', pos: { x: S.injured.x, y: 0, z: S.injured.z - 1.4 }, radius: 2.2, height: 2.4,
      prompt: () => (this.str.dropped ? 'Take the handles again' : 'Take the back of the stretcher'), enabled: () => !g.modal && this.stage === 'stretcher' && !this.carrying && !this.str.done,
      onInteract: () => this.takeStretcher() });
  }

  takeHat() {
    const g = this.game;
    if (g.items.has('hardhat')) return false;
    g.items.add('hardhat');
    this._shout(this.agents.giver, CALLS.hatGiven);
    g.messages?.say('Hard plastic, still warm from someone else\'s hands. It sits low over your ears and the din of the site goes hollow, like a shell held to the head.', { kind: 'story', ttl: 8 });
    this._wearHat(true);
    if (this.stage === 'hat' || this.stage === 'wait') this._setStage('rubble');
    return true;
  }

  _wearHat(on) {
    const m = this.game.party?.mithiModel ?? this.game.view?.mithi;
    const head = m?.bones?.head;
    if (!head) return;
    if (on && !this.hatOnHead) {
      const geo = new THREE.SphereGeometry(0.155, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2);
      const brim = new THREE.CylinderGeometry(0.19, 0.19, 0.015, 14);
      const mat = new THREE.MeshLambertMaterial({ color: 0xf0c020, emissive: new THREE.Color(0x2a2008) });
      const g = new THREE.Group(); g.add(new THREE.Mesh(geo, mat)); const b = new THREE.Mesh(brim, mat); b.position.set(0, 0.01, -0.03); g.add(b);
      g.position.set(0, 0.13, 0.0); g.name = 'hardhat';
      head.add(g); this.game.senses?.patchObject?.(g);
      this.hatOnHead = g;
    }
  }

  dropChunk() {
    const g = this.game, S = SPOTS;
    if (this.carrying !== 'chunk') return false;
    this._dropCarry();
    this.trips++;
    this.site.heapGrow(this.trips);
    g.events.emit('sound:emit', { x: S.heap.x, y: 0.4, z: S.heap.z, kind: 'clank', loudness: 0.45 });
    g.hazards?.dust(S.heap.x - 0.6, 0.3, S.heap.z - 0.9, 4, 0.8, { size: 1.4, life: 1.8 });
    this._shout(this.agents.heapMan, CALLS.dropped[Math.min(CALLS.dropped.length - 1, this.trips - 1)]);
    if (this.trips >= RUBBLE_TRIPS && this.stage === 'rubble') {
      g.messages?.say('Your palms are raw and grey with dust. The bucket line closes up behind you without a word: someone else\'s hands, the same concrete.', { kind: 'story', ttl: 8 });
      this._setStage('stretcher');
    }
    g.objectives?.refresh(true);
    return true;
  }

  takeStretcher() {
    const g = this.game, s = this.str;
    if (this.carrying || s.done) return false;
    this.carrying = 'stretcher';
    g.hazards?.setSpeedMod('opening', 0.78);
    this._shout(s.lead, s.dropped ? CALLS.bearerStart.split('.')[0] + '.' : CALLS.bearerStart);
    if (!s.dropped) g.messages?.say('The handles are rough steel wrapped in tape. She weighs almost nothing and it is still the heaviest thing you have ever lifted.', { kind: 'story', ttl: 7 });
    s.dropped = false; s.moving = true; s.leadT = 2;
    g.objectives?.refresh(true);
    return true;
  }

  _dropCarry() {
    if (!this.carrying) return;
    this.carrying = null;
    this.game.hazards?.setSpeedMod('opening', 1);
  }

  _holdUi() {
    const el = this.holdEl = document.createElement('div');
    el.className = 'hud-hold'; el.hidden = true;
    el.innerHTML = '<div class="lbl">LIFTING</div><div class="bar"><i></i></div><span class="scrawl rot-b">heavy...</span>';
    document.getElementById('hud')?.appendChild(el);
    this.holdBar = el.querySelector('i');
  }

  _updateLift(dt) {
    const g = this.game, p = g.player.pos, S = SPOTS;
    if (!this.holdEl) return;
    const near = this.stage === 'rubble' && !this.carrying && !g.modal && Math.hypot(p.x - S.pile.x, p.z - S.pile.z) < 2.5;
    if (near && g.input.action('interact')) {
      this.lift += dt / LIFT_SECONDS;
      if (this.lift >= 1) {
        this.lift = 0; this.carrying = 'chunk';
        g.hazards?.setSpeedMod('opening', 0.72);
        g.events.emit('sound:emit', { x: S.pile.x, y: 0.5, z: S.pile.z, kind: 'clank', loudness: 0.4 });
        g.hazards?.dust(S.pile.x, 0.4, S.pile.z - 0.6, 3, 0.7, { size: 1.3, life: 1.6 });
        if (this.trips === 0) g.messages?.say('A slab of deck the size of a school bag, edged with broken tile. Rebar bites your fingers. You hug it to your chest and turn west, toward the voice calling "idhar".', { kind: 'story', ttl: 8 });
        g.objectives?.refresh(true);
      }
    } else this.lift = Math.max(0, this.lift - dt * 1.2);
    const show = near && this.lift > 0.02;
    if (this.holdEl.hidden === show) this.holdEl.hidden = !show;
    if (show) this.holdBar.style.width = Math.min(100, this.lift * 100) + '%';
  }

  // ------------------------------------------------------------------------------------------------ the crowd at work
  _buildCrowd() {
    const g = this.game, C = g.crowds, r = this.rng, S = SPOTS;
    this.agents = { bucket: [], teams: [], runners: [], diggers: [], police: [], takers: [], row: [], medics: [] };
    this.all = [];
    if (!C) return;
    const add = (x, z, variant, yaw = 0, o = {}) => {
      const a = C.place(x, 0, z, variant, yaw, { mode: 'script', amp: 0, pose: o.pose ?? 0, talk: !!o.talk, mood: o.mood ?? 'worry' });
      a.hat = !!o.hat; a.role = o.role ?? null; a.wait = 0;
      this.all.push(a);
      return a;
    };
    // the volunteer at the hard-hat crate, and the man at the heap who calls the chain in
    this.agents.giver = add(S.hat.x - Math.sin(S.hat.yaw) * 0.8, S.hat.z - Math.cos(S.hat.yaw) * 0.8, 'worker', S.hat.yaw + Math.PI, { hat: true, talk: true, role: 'Volunteer' });
    this.agents.heapMan = add(S.heap.x + 0.6, S.heap.z - 2.6, 'worker', 0.9, { hat: true, talk: true, role: 'Rescuer' });
    this.agents.pileMan = add(S.pile.x + 1.6, S.pile.z - 0.6, 'worker', Math.PI, { hat: true, talk: true, role: 'Rescuer' });
    // the bucket line: five hands between the pile and the heap
    for (let i = 0; i < 5; i++) {
      const a = add(lerp(S.pile.x, S.heap.x, i / 5), lerp(S.pile.z, S.heap.z, i / 5), i % 3 ? 'worker' : 'shirt', 0, { hat: i % 2 === 0, role: i % 3 ? 'Rescuer' : 'Volunteer' });
      a.job = i % 2 ? 'toHeap' : 'toPile'; a.speed = 1.05 + r.next() * 0.25; a.wait = r.next() * 2;
      this.agents.bucket.push(a);
    }
    // two stretcher teams that keep bringing the injured from the pile to the row
    const picks = [[-49.5, -33.5], [-40.5, -41.5], [-58.5, -33.0], [-36.0, -27.8], [-52.0, -42.0], [-34.0, -36.0]];
    for (let k = 0; k < 2; k++) {
      const front = add(-50 + k * 6, -12, 'worker', 0, { hat: true, role: 'Rescuer' }), back = add(-50 + k * 6, -10, k ? 'shirt' : 'worker', 0, { hat: k === 0, role: 'Rescuer' });
      const body = add(-50 + k * 6, -11, r.next() < 0.5 ? 'sari' : 'kurta', 0, { role: 'Injured' }); body.mode = 'sleep'; body.y = 0.62; body.hidden = true;
      this.agents.teams.push({ front, back, body, picks, path: null, pi: 0, state: 'idle', wait: 2 + k * 9, x: -50 + k * 6, z: -11, yaw: 0, carry: false, speed: 1.1 });
    }
    // the stretcher row: the injured waiting for an ambulance
    ROW_X.forEach((x, i) => { const a = add(x, S.row.z, i % 2 ? 'salwar' : 'shirt', Math.PI, { role: 'Injured' }); a.mode = 'sleep'; a.y = 0.36; a.hidden = i >= 2; this.agents.row.push(a); });
    // people running: from the debris, to a name, to a phone signal
    for (let i = 0; i < 7; i++) {
      const x = -60 + r.next() * 30, z = -44 + r.next() * 30;
      const a = add(x, z, r.pick(['shirt', 'kurta', 'sari', 'salwar', 'lungi', 'child']), 0, { role: r.pick(['Man', 'Woman', 'Boy']) });
      a.speed = 3.0 + r.next() * 1.4; a.wait = r.next() * 3; a.tx = x; a.tz = z;
      this.agents.runners.push(a);
    }
    // diggers at the edges of the decks, working with their hands
    for (const [x, z, yaw] of [[-52.5, -38.6, 0.5], [-47.0, -41.2, 0], [-40.2, -40.6, -0.3], [-58.4, -27.0, 1.5], [-55.6, -40.0, 2.6], [-34.0, -29.0, -1.3], [-44.0, -18.5, Math.PI], [-48.6, -16.0, Math.PI - 0.2]]) {
      const a = add(x, z, r.next() < 0.7 ? 'worker' : 'shirt', yaw, { hat: r.next() < 0.75, talk: true, role: 'Rescuer' });
      this.agents.diggers.push(a);
    }
    // constables at the tape and the gate
    for (const [x, z, yaw] of [[SPOTS.gate.x - 4.4, CORDON.z1 - 1.1, Math.PI], [-60, CORDON.z1 - 1.0, Math.PI], [CORDON.x0 + 1.0, -30, -Math.PI / 2], [CORDON.x1 - 1.0, -38, Math.PI / 2], [-46, CORDON.z0 + 1.0, 0]]) {
      const a = add(x, z, 'shirt', yaw, { talk: false, role: 'Constable' });
      a.col[3] = KHAKI[0]; a.col[4] = KHAKI[1]; a.col[5] = KHAKI[2]; a.col[6] = KHAKI_D[0]; a.col[7] = KHAKI_D[1]; a.col[8] = KHAKI_D[2];
      this.agents.police.push(a);
    }
    this._takerT = 4;
  }

  _walk(a, tx, tz, speed, dt) {
    const dx = tx - a.x, dz = tz - a.z, d = Math.hypot(dx, dz);
    if (d < 0.15) { a.amp = 0; return true; }
    const s = Math.min(d, speed * dt);
    a.x += dx / d * s; a.z += dz / d * s;
    a.yaw = Math.atan2(-dx, -dz);
    a.amp = Math.min(1, speed / 1.4); a.phase += s * (a.stride ?? 2.5);
    return false;
  }

  _stepCrowd(dt) {
    const S = SPOTS, r = this.rng;
    // the bucket line
    for (const a of this.agents.bucket) {
      if (a.wait > 0) { a.wait -= dt; a.amp = 0; a.talk = a.wait > 0.5; continue; }
      a.talk = false;
      const to = a.job === 'toPile' ? S.pile : S.heap, off = a.job === 'toPile' ? 0.9 : -1.4;
      if (a.goal === undefined || a.goalJob !== a.job) { a.goalJob = a.job; a.goal = { x: to.x + (r.next() - 0.5) * 2.2, z: to.z + off * (a.job === 'toPile' ? -1 : 1) + (r.next() - 0.5) * 1.2 }; }
      if (this._walk(a, a.goal.x, a.goal.z, a.carry ? a.speed * 0.8 : a.speed, dt)) {
        a.carry = a.job === 'toPile';                              // lifted at the pile, carried to the heap
        a.job = a.job === 'toPile' ? 'toHeap' : 'toPile'; a.wait = 0.9 + r.next() * 1.1;
      }
    }
    // the stretcher teams
    for (const T of this.agents.teams) this._stepTeam(T, dt);
    // the runners
    for (const a of this.agents.runners) {
      if (a.wait > 0) { a.wait -= dt; a.amp = 0; continue; }
      a.talk = false;
      if (this._walk(a, a.tx, a.tz, a.speed, dt)) {
        a.wait = 0.6 + r.next() * 3.2; a.talk = r.next() < 0.6;
        for (let k = 0; k < 12; k++) { const x = -62 + r.next() * 34, z = -46 + r.next() * 50; if (isClear(x, z, 0.6) && !(x > CORDON.x1 - 2 || z > CORDON.z1 - 2)) { a.tx = x; a.tz = z; break; } }
      }
    }
    // people coming for a hard hat, then going to help
    this._takerT -= dt;
    if (this._takerT <= 0 && this.agents.takers.length < 8) {
      this._takerT = 7 + r.next() * 7;
      const C = this.game.crowds, from = r.pick([[-62, -12], [-30, -12], [-60, 4], [-36, 4], [-62, -46]]);
      const a = C.place(from[0], 0, from[1], r.pick(['shirt', 'kurta', 'lungi', 'salwar']), 0, { mode: 'script', amp: 0, pose: 0, mood: 'worry' });
      a.role = r.pick(['Man', 'Woman', 'Volunteer']); a.hat = false; a.job = 'toCrate'; a.speed = 1.5 + r.next() * 0.5; a.wait = 0;
      this.all.push(a); this.agents.takers.push(a);
    }
    for (const a of this.agents.takers) {
      if (a.wait > 0) { a.wait -= dt; a.amp = 0; continue; }
      if (a.job === 'toCrate') {
        if (this._walk(a, S.hat.x + Math.sin(S.hat.yaw) * 1.1 + (r.next() - 0.5) * 0.2, S.hat.z + Math.cos(S.hat.yaw) * 1.1, a.speed, dt)) { a.wait = 1.2; a.hat = true; a.job = 'toWork'; a.tx = -58 + r.next() * 24; a.tz = -44 + r.next() * 26; }
      } else if (a.job === 'toWork') {
        if (!isClear(a.tx, a.tz, 0.5)) { a.tx = -50 + r.next() * 14; a.tz = -38 + r.next() * 14; }
        if (this._walk(a, a.tx, a.tz, a.speed, dt)) { a.job = 'work'; a.talk = true; }
      }
    }
    // the injured do not get pushed about; the step-aside of the crowd is undone for everyone on a stretcher or carrying one
    for (const T of this.agents.teams) for (const a of [T.front, T.back, T.body]) { a.ox = 0; a.oz = 0; }
    for (const a of this.agents.row) { a.ox = 0; a.oz = 0; }
    if (this.str) for (const a of [this.str.lead, this.str.body]) { a.ox = 0; a.oz = 0; }
    // the hush: everyone stops for a moment to listen
    if (this.hush > 0) { this.hush -= dt; for (const a of this.all) if (a.mode === 'script') { a.talk = false; if (this.hush > 4) a.amp *= 0.2; } }
  }

  _stepTeam(T, dt) {
    const r = this.rng, S = SPOTS;
    if (T.wait > 0) { T.wait -= dt; this._placeTeam(T, 0); return; }
    if (T.state === 'idle') {                                    // go to a pick-up spot
      const p = r.pick(T.picks);
      T.path = [[T.x, T.z], [-46, -24], p]; T.pi = 1; T.state = 'toPick'; T.carry = false;
    }
    const w = T.path[T.pi];
    const dx = w[0] - T.x, dz = w[1] - T.z, d = Math.hypot(dx, dz), sp = T.speed * (T.carry ? 0.85 : 1.25);
    if (d < 0.2) {
      T.pi++;
      if (T.pi >= T.path.length) {
        if (T.state === 'toPick') { T.state = 'toRow'; T.carry = true; T.wait = 3.2; T.path = [[T.x, T.z], [-46, -24], [-50, -15.5], [-41, -9.5], [S.row.x - 3.5, S.row.z - 0.2]]; T.pi = 1; T.body.hidden = false; }
        else if (T.state === 'toRow') {
          T.carry = false; T.body.hidden = true; T.wait = 2.5; T.state = 'idle';
          const free = this.agents.row.find((a) => a.hidden);
          if (free) { free.hidden = false; this.game.events.emit('opening:injured', { row: this.rowCount() }); }
        }
      }
      this._placeTeam(T, 0);
      return;
    }
    const s = Math.min(d, sp * dt);
    T.x += dx / d * s; T.z += dz / d * s; T.yaw = Math.atan2(-dx, -dz);
    this._placeTeam(T, s);
  }

  _placeTeam(T, moved) {
    const fx = -Math.sin(T.yaw), fz = -Math.cos(T.yaw);
    const F = T.front, B = T.back, Y = T.body;
    F.x = T.x + fx * 1.15; F.z = T.z + fz * 1.15; B.x = T.x - fx * 1.15; B.z = T.z - fz * 1.15;
    F.yaw = B.yaw = T.yaw;
    const amp = moved > 0 ? Math.min(1, T.speed / 1.4) : 0;
    for (const a of [F, B]) { a.amp = amp; a.phase += moved * (a.stride ?? 2.5); }
    Y.x = T.x; Y.z = T.z; Y.yaw = T.yaw; Y.y = 0.8;
  }

  rowCount() { return this.agents.row.filter((a) => !a.hidden).length; }

  // ------------------------------------------------------------------------------------------------ Mithi's stretcher
  _buildProps() {
    const g = this.game, S = SPOTS, C = g.crowds;
    // carried things: chunks, stretcher frames (one instanced box mesh) and hard hats on heads (one instanced dome)
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.props = new THREE.InstancedMesh(box, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: new THREE.Color(0x14120e) }), 96);
    this.props.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(96 * 3), 3);
    this.props.frustumCulled = false; this.props.count = 0; this.props.name = 'opening-props';
    const dome = new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    const brim = new THREE.CylinderGeometry(1.22, 1.22, 0.08, 12); brim.translate(0, 0.02, 0);
    const hat = (() => { const a = dome.toNonIndexed(), b = brim.toNonIndexed(); const pos = new Float32Array(a.attributes.position.count * 3 + b.attributes.position.count * 3); pos.set(a.attributes.position.array); pos.set(b.attributes.position.array, a.attributes.position.array.length); const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); gg.computeVertexNormals(); return gg; })();
    this.hats = new THREE.InstancedMesh(hat, new THREE.MeshLambertMaterial({ color: 0xf0c020, emissive: new THREE.Color(0x3a2a08) }), 64);
    this.hats.frustumCulled = false; this.hats.count = 0; this.hats.name = 'opening-hats';
    // the shadows of what is about to fall
    const disc = new THREE.CircleGeometry(1, 20); disc.rotateX(-Math.PI / 2);
    this.shadows = new THREE.InstancedMesh(disc, new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false }), 8);
    this.shadows.frustumCulled = false; this.shadows.count = 0; this.shadows.name = 'opening-shadows'; this.shadows.renderOrder = 2;
    for (const m of [this.props, this.hats, this.shadows]) { g.scene.add(m); g.senses?.patchObject?.(m); }
    // the injured woman one bearer short, and her front bearer
    const lead = C ? C.place(S.injured.x, 0, S.injured.z - 1.15, 'worker', Math.PI, { mode: 'script', amp: 0, pose: 0, talk: true, mood: 'worry' }) : { x: 0, z: 0 };
    const body = C ? C.place(S.injured.x, 0.36, S.injured.z, 'sari', Math.PI, { mode: 'script', amp: 0, mood: 'worry' }) : { x: 0, z: 0 };
    body.mode = 'sleep'; body.y = 0.36; lead.hat = true; lead.role = 'Rescuer'; body.role = 'Injured woman';
    if (C) this.all.push(lead, body);
    // lead.x/z is the front bearer, (x, z) the stretcher's middle
    this.str = { lead, body, x: S.injured.x, z: S.injured.z, yaw: Math.PI, pi: 1, moving: false, done: false, dropped: false, leadT: 0, waitT: 0, onGround: true };
  }

  _stepStretcher(dt) {
    const g = this.game, s = this.str, p = g.player.pos, S = SPOTS;
    if (!s || s.done || this.stage === 'wait' || this.stage === 'hat' || this.stage === 'rubble') { this._layStretcher(); return; }
    if (this.carrying !== 'stretcher') {
      // waiting for hands: he calls now and then; the handles are at the stretcher's back end
      s.lead.amp = 0; s.lead.talk = true;
      if (this.strIt) { this.strIt.pos.x = s.x - Math.sin(s.yaw) * -1.3; this.strIt.pos.z = s.z - Math.cos(s.yaw) * -1.3; }
      if (this.live && this.stage === 'stretcher' && this._every('ask', s.dropped ? 5 : 7)) this._shout(s.lead, s.dropped ? CALLS.bearerDropped : CALLS.bearerAsk, { ripple: 0.55 });
      this._layStretcher();
      return;
    }
    // carrying: he walks the route; the back of the stretcher is where she is
    const R = S.route, w = R[s.pi];
    const back = { x: s.x + Math.sin(s.yaw) * 1.3, z: s.z + Math.cos(s.yaw) * 1.3 };
    const gap = hd(p, back);
    if (gap > 6) {                                              // she let go
      s.dropped = true; this._dropCarry(); s.lead.amp = 0;
      this._shout(s.lead, CALLS.bearerDropped, { ripple: 0.6 });
      g.objectives?.refresh(true);
      this._layStretcher();
      return;
    }
    const go = gap < 2.3;
    s.lead.talk = !go;
    if (!go) { s.lead.amp = 0; if (this._every('wait', 4)) this._shout(s.lead, CALLS.bearerWait, { ripple: 0.5 }); }
    else {
      if (this._every('lead', 6)) this._shout(s.lead, CALLS.bearerLead[Math.floor(this.rng.next() * CALLS.bearerLead.length)], { ripple: 0.45 });
      const tx = w[0], tz = w[1], dx = tx - s.x, dz = tz - s.z, d = Math.hypot(dx, dz);
      if (d < 0.25) {
        s.pi++;
        if (s.pi >= R.length) { this._setDown(); return; }
      } else {
        const st = Math.min(d, 1.05 * dt);
        s.x += dx / d * st; s.z += dz / d * st;
        const want = Math.atan2(-dx, -dz); let dy = want - s.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); s.yaw += dy * Math.min(1, dt * 2.5);
        s.lead.amp = 0.75; s.lead.phase += st * (s.lead.stride ?? 2.5);
      }
    }
    s.lead.x = s.x - Math.sin(s.yaw) * 1.15; s.lead.z = s.z - Math.cos(s.yaw) * 1.15; s.lead.yaw = s.yaw;
    s.body.x = s.x; s.body.z = s.z; s.body.yaw = s.yaw; s.body.y = 0.8;
    s.onGround = false;
  }

  _layStretcher() {
    const s = this.str;
    if (!s || s.done) return;
    s.onGround = true;
    s.body.x = s.x; s.body.z = s.z; s.body.yaw = s.yaw; s.body.y = 0.36;
    s.lead.x = s.x - Math.sin(s.yaw) * 1.25; s.lead.z = s.z - Math.cos(s.yaw) * 1.25; s.lead.yaw = s.yaw;
  }

  _setDown() {
    const g = this.game, s = this.str;
    s.done = true; s.moving = false;
    this._dropCarry();
    g.flags.openingStretcher = true;
    s.body.hidden = true;
    const free = this.agents.row.find((a) => a.hidden); if (free) free.hidden = false;
    s.lead.talk = true; s.lead.amp = 0;
    this._shout(s.lead, CALLS.setDown);
    this._later(2.2, () => this._shout(free ?? s.body, CALLS.injuredThanks, { who: 'Injured woman' }));
    g.interactables.remove('opening:stretcher');
    // the bearer goes back to the pile
    s.lead.mode = 'script'; this.agents.runners.push(Object.assign(s.lead, { speed: 1.6, wait: 4, tx: -46, tz: -30 }));
    if (this.stage === 'stretcher') this._later(5, () => { if (this.stage === 'stretcher') this._setStage('oldman'); });
  }

  // ------------------------------------------------------------------------------------------------ ambulances
  _stepAmbulance(dt) {
    const A = this.amb, S = SPOTS, g = this.game, grp = A.group, p = g.player.pos;
    const near = hd(p, SITE) < SITE.r + 40;
    if (A.state === 'away') {
      if (this.stage === 'wait' && this.live) return;
      A.t -= dt;
      if (A.t < 22 && !A.sirenFar && near) { A.sirenFar = true; g.sfx?.siren?.(9, { gain: 0.08, far: true }); if (this.live && A.n === 0) this._say('Far off, under the noise of the pile, a siren. It does not seem to get any closer.', 'story', 7); }
      if (A.t <= 0) {
        A.state = 'in'; A.z = S.road.z; A.n++; A.loaded = 0; A.sirenFar = false; this.stats.ambulances++;
        grp.visible = true; grp.position.set(S.bay.x, 0, A.z); grp.rotation.y = 0;
        if (near) g.sfx?.siren?.(10, { gain: 0.2, far: false });
        if (this.live && near) { this._say(A.n === 1 ? 'A siren, close now, and the crowd at the south gate parting. The first ambulance noses through.' : `Another siren at the south gate. Ambulance ${A.n}. One at a time, the lane only takes one.`, 'story', 7); this._bark('ambulance'); }
        // a rescue squad comes in behind it, on foot
        this._squad();
      }
      return;
    }
    // honk and stop for anyone in the way
    const fwdZ = A.state === 'out' ? 1 : -1, ahead = { x: S.bay.x, z: A.z + fwdZ * 4.2 };
    const blocked = hd(p, ahead) < 2.6 && Math.abs(p.y) < 2;
    if (blocked) { if (this._every('honk', 3)) { g.events.emit('sound:emit', { x: grp.position.x, y: 1, z: A.z, kind: 'mutter', loudness: 0.7 }); g.messages?.caption('[a horn: two short blasts]', 2.5); if (this.live) this._say('"Side, madam, side! Ambulance!"', 'clue', 4, 'Driver'); } }
    if (A.state === 'in') {
      if (!blocked) A.z = Math.max(S.bay.z, A.z - AMB.speed * dt * (A.z - S.bay.z < 8 ? 0.45 : 1));
      if (A.z <= S.bay.z + 0.01) { A.state = 'load'; A.t = 0; this._medics(); }
    } else if (A.state === 'load') {
      A.t += dt;
      const medicsBusy = A.medics.some((m) => m.job !== 'gone');
      if ((!medicsBusy && (A.loaded >= AMB.load || A.t > AMB.wait)) || A.t > 60) { A.state = 'out'; A.t = 0; for (const m of A.medics) { m.hidden = true; m.job = 'gone'; } if (this.live && near && A.loaded) this._say(`The ambulance backs out with ${A.loaded === 1 ? 'one' : A.loaded} aboard, beeping, into the dark of the courtyard.`, 'story', 6); }
    } else if (A.state === 'out') {
      if (!blocked) A.z += AMB.speed * 0.6 * dt;
      if (A.z > S.road.z) { A.state = 'away'; grp.visible = false; A.t = AMB.gap[0] + this.rng.next() * (AMB.gap[1] - AMB.gap[0]); }
    }
    grp.position.z = A.z;
    // the lights: red and blue in turn; the gate arm lifts while it passes
    const ph = Math.floor(this.t * 5) % 2;
    A.red.visible = ph === 0; A.blue.visible = ph === 1;
    if (this.site.cordon && !this.site.cordon.isOpen) { const k = Math.max(0, 1 - Math.abs(A.z - CORDON.z1) / 9); this.site.cordon.lift(k); }
    this._stepMedics(dt);
  }

  _medics() {
    const A = this.amb, C = this.game.crowds, S = SPOTS;
    if (!C) return;
    if (!A.medics.length) for (let i = 0; i < 2; i++) { const m = C.place(S.bay.x, 0, S.bay.z + 3.4, 'worker', 0, { mode: 'script', amp: 0, mood: 'worry' }); m.role = 'Paramedic'; m.col[3] = 0.9; m.col[4] = 0.9; m.col[5] = 0.86; this.all.push(m); A.medics.push(m); }
    for (const [i, m] of A.medics.entries()) { m.hidden = false; m.x = S.bay.x + (i ? 0.6 : -0.6); m.z = S.bay.z + 3.6; m.job = 'toRow'; m.wait = i * 0.4; }
    A.team = { carry: false };
  }

  _stepMedics(dt) {
    const A = this.amb, S = SPOTS;
    if (A.state !== 'load' || !A.medics.length) return;
    const [m1, m2] = A.medics;
    if (m1.job === 'gone') return;
    let target = null; for (const a of this.agents.row) if (!a.hidden) target = a;
    if (m1.job === 'toRow') {
      if (!target) { if (A.t > AMB.wait * 0.6) for (const m of A.medics) m.job = 'back'; return; }
      const a = this._walk(m1, target.x, target.z - 1.2, 1.6, dt), b = this._walk(m2, target.x, target.z + 1.2, 1.6, dt);
      if (a && b) { m1.job = m2.job = 'carry'; target.hidden = true; A.carryBody = target; A.cx = target.x; A.cz = target.z; }
    } else if (m1.job === 'carry') {
      const rx = S.bay.x, rz = S.bay.z + 3.6, dx = rx - A.cx, dz = rz - A.cz, d = Math.hypot(dx, dz), yaw = Math.atan2(-dx, -dz);
      if (d < 0.3) { A.loaded++; this.stats.loaded++; A.carryBody = null; m1.job = m2.job = A.loaded >= AMB.load ? 'back' : 'toRow'; return; }
      const s = Math.min(d, 1.1 * dt); A.cx += dx / d * s; A.cz += dz / d * s;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
      m1.x = A.cx + fx * 1.1; m1.z = A.cz + fz * 1.1; m2.x = A.cx - fx * 1.1; m2.z = A.cz - fz * 1.1; m1.yaw = m2.yaw = yaw;
      for (const m of [m1, m2]) { m.amp = 0.8; m.phase += s * (m.stride ?? 2.5); m.ox = 0; m.oz = 0; }
    } else if (m1.job === 'back') {
      const a = this._walk(m1, S.bay.x - 0.5, S.bay.z + 3.4, 1.6, dt), b = this._walk(m2, S.bay.x + 0.5, S.bay.z + 3.4, 1.6, dt);
      if (a && b) { m1.job = m2.job = 'gone'; m1.hidden = m2.hidden = true; }
    }
  }

  _squad() {
    const C = this.game.crowds, r = this.rng;
    if (!C || this.agents.diggers.length > 16) return;
    for (let i = 0; i < 3; i++) {
      const a = C.place(SPOTS.gate.x - 2 + i, 0, CORDON.z1 + 2 + i * 0.8, 'worker', 0, { mode: 'script', amp: 0, mood: 'worry' });
      a.hat = true; a.role = 'Rescuer'; a.speed = 2.6; a.wait = 1.5 + i * 0.7;
      let x = -44, z = -38; for (let k = 0; k < 10; k++) { const tx = -58 + r.next() * 26, tz = -44 + r.next() * 22; if (isClear(tx, tz, 0.8)) { x = tx; z = tz; break; } }
      a.tx = x; a.tz = z; a.job = 'squad';
      this.all.push(a); this.agents.takers.push(Object.assign(a, { job: 'toWork' }));
    }
    if (this.live) this._say('Behind the ambulance, on foot at a jog, a rescue squad in orange: helmets, crowbars, a coil of rope, a stretcher folded on a shoulder.', 'story', 7);
  }

  // ------------------------------------------------------------------------------------------------ falling debris
  _debris(onPlayer, force = false) {
    const g = this.game, p = g.player.pos, r = this.rng;
    const H = g.hazards;
    if (!H?.enabled || !H.slabs) return;
    let x, z;
    if (onPlayer) { const a = r.next() * 6.283, d = r.next() * 1.0; x = p.x + Math.cos(a) * d; z = p.z + Math.sin(a) * d; }
    else {
      x = p.x; z = p.z;
      for (let k = 0; k < 14; k++) { const a = r.next() * 6.283, d = 4 + r.next() * 14; const tx = p.x + Math.cos(a) * d, tz = p.z + Math.sin(a) * d; if (tx > CORDON.x0 + 2 && tx < CORDON.x1 - 2 && tz > CORDON.z0 + 2 && tz < -12 && isClear(tx, tz, 0.4)) { x = tx; z = tz; break; } }
    }
    if (!force && (x < CORDON.x0 || x > CORDON.x1 || z < CORDON.z0 || z > -10)) return;   // only over the pile, where the decks broke
    // where it comes from: the walkway ends at 12 m or the loop road at 24 m, whichever is over it; else the SkyGrid's broken lips
    const under24 = x > -48 && x < -21 && z > -30 && z < -24 || x > -48 && x < -42 && z < -24;
    const y0 = under24 ? 23.2 : 12 + r.next() * 3;
    const hit = g.physics.raycast({ x, y: 9, z }, { x: 0, y: -1, z: 0 }, 20, (c) => (c.solid || c.walkable) && c.tag !== 'cordon');
    const floor = hit ? hit.point.y : 0;
    const s = 0.35 + r.next() * (onPlayer ? 0.55 : 0.9);
    this.warn.push({ x, z, y0, floor, s, t: 0, at: 1.6 + r.next() * 0.4, onPlayer });
    g.events.emit('sound:emit', { x, y: y0 - 1, z, kind: 'crack', loudness: 0.7 });
    if (this.live) {
      g.messages?.caption('[concrete groans overhead]', 2.5);
      const who = this._nearestAgent({ x, z }, 14);
      if (onPlayer || r.next() < 0.5) this._line(LINES.falling[Math.floor(r.next() * LINES.falling.length)], who);
    }
  }

  _stepDebris(dt) {
    const g = this.game, H = g.hazards, p = g.player.pos;
    for (let i = this.warn.length - 1; i >= 0; i--) {
      const w = this.warn[i];
      w.t += dt;
      if (w.t >= w.at && !w.chunk) {
        const c = { x: w.x, y: w.y0, z: w.z, sx: w.s * 1.4, sy: w.s * 0.7, sz: w.s, ry: this.rng.next() * 3, state: 'fall', vy: -1.5, floor: w.floor, spin: (this.rng.next() - 0.5) * 6, c: 0.3 + this.rng.next() * 0.14, noHit: true };
        H?.slabs?.addChunk(c);
        w.chunk = c; this.stats.chunks++;
      }
      if (w.chunk) {
        const c = w.chunk;
        if (!w.checked && c.y < w.floor + 2.4) {
          w.checked = true;
          if (Math.hypot(p.x - c.x, p.z - c.z) < 1.25 + w.s * 0.4 && Math.abs(p.y - w.floor) < 1.6 && !H.detaining && H.grace <= 0) this._hit(c);
        }
        if (c.state === 'rest') { this.warn.splice(i, 1); continue; }
      }
      if (w.t > 8) this.warn.splice(i, 1);
    }
  }

  _hit(c) {
    const g = this.game, H = g.hazards;
    this.stats.hits++;
    H.shake(0.8, 0.45); H.kick(c.x, c.z, 4.5, 0.22);
    if (g.items?.has('hardhat')) {
      this.stats.hatSaves++;
      g.screenfx?.flash?.('#e8e0c8', 160, 0.18);
      g.events.emit('sound:emit', { x: c.x, y: 1.7, z: c.z, kind: 'clank', loudness: 0.5 });
      g.messages?.say('CLANG. Something hits the hard hat square on and the world rings like a bell. Your knees go, then come back. The hat took it.', { kind: 'story', ttl: 6 });
    } else {
      H.hurt(1, 'debris');
      g.messages?.say('A chunk of concrete from above glances off your head and shoulder. Hot, then numb. You need a hard hat.', { kind: 'story', ttl: 6 });
    }
  }

  // ------------------------------------------------------------------------------------------------ voices
  _nearestAgent(pos, r = 12) {
    let best = null, bd = r;
    for (const a of this.all) { if (a.hidden || a.mode === 'sleep') continue; const d = Math.hypot(a.x - pos.x, a.z - pos.z); if (d < bd) { bd = d; best = a; } }
    return best;
  }

  _every(key, secs) {
    const last = this._said.get('e:' + key) ?? -99;
    if (this.t - last < secs) return false;
    this._said.set('e:' + key, this.t);
    return true;
  }

  _say(text, kind = 'story', ttl = 6, speaker) {
    if (!this.live) return;
    this.game.messages?.say(text, { kind, ttl, speaker });
  }

  /** A line from someone at the site: a ripple at where they stand and the words in the feed. */
  _line(L, a) {
    const g = this.game;
    if (!this.live || !L) return;
    const last = this._said.get(L.text) ?? -999;
    if (this.t - last < 90) return;
    this._said.set(L.text, this.t);
    this.stats.barks++;
    if (a) g.events.emit('sound:emit', { x: a.x, y: 1.6, z: a.z, kind: 'mutter', loudness: L.thought ? 0.25 : 0.45 });
    if (L.thought) g.messages?.say(`${L.who[0].toUpperCase() + L.who.slice(1)}, under the breath: "${L.text}"`, { kind: 'story', ttl: 6 });
    else g.messages?.say(`"${L.text}"`, { kind: 'clue', ttl: 6, speaker: L.who });
  }

  _shout(a, text, { voice = false, ripple = 0.65, who } = {}) {
    const g = this.game;
    if (!this.live || !text) return;
    const name = who ?? a?.role ?? 'Rescuer';
    if (a) g.events.emit('sound:emit', { x: a.x, y: 1.7, z: a.z, kind: 'mutter', loudness: ripple });
    g.messages?.say(`"${text}"`, { kind: 'clue', ttl: 6, speaker: name });
    if (voice && !g.modal && !g.voices?.current) { try { g.voices?.say?.({ who: name, text }); } catch { /* a voice is never worth a crash */ } }
  }

  _bark(pool) {
    const P = LINES[pool];
    if (!P) return;
    const p = this.game.player.pos, a = this._nearestAgent(p, 14);
    const fresh = P.filter((L) => this.t - (this._said.get(L.text) ?? -999) >= 90);
    if (!fresh.length) return;
    this._line(fresh[Math.floor(this.rng.next() * fresh.length)], a);
  }

  _stepVoices(dt) {
    const g = this.game, p = g.player.pos;
    if (!this.live || g.modal || g.cinematics?.active || this.stage === 'wait') return;
    const inSite = hd(p, SITE) < 40 && p.y < 4;
    // the calls that lead a blind woman through the steps: a voice at the place she needs
    this._next.call -= dt;
    if (this._next.call <= 0) {
      this._next.call = 5;
      if (this.stage === 'hat' && !g.items.has('hardhat')) this._shout(this.agents.giver, LINES.hats[Math.floor(this.rng.next() * LINES.hats.length)].text, { who: 'Volunteer' });
      else if (this.stage === 'rubble') {
        if (this.carrying === 'chunk') this._shout(this.agents.heapMan, CALLS.heapCall[Math.floor(this.rng.next() * CALLS.heapCall.length)], { ripple: 0.6 });
        else if (hd(p, SPOTS.pile) > 3) this._shout(this.agents.pileMan, CALLS.pileCall[Math.floor(this.rng.next() * CALLS.pileCall.length)], { ripple: 0.6 });
        this._next.call = 4.5;
      }
    }
    // the rest of the site
    this._next.bark -= dt;
    if (inSite && this._next.bark <= 0) {
      this._next.bark = 5.5 + this.rng.next() * 4.5;
      if (this.hush > 0) return;
      const q = this.rng.next(), noAmb = this.amb.n === 0;
      const pool = q < 0.22 ? 'what' : q < 0.42 ? 'rescue' : q < 0.55 ? (noAmb ? 'noAmbulance' : 'searching') : q < 0.68 ? 'searching' : q < 0.84 ? 'thoughts' : q < 0.92 ? 'what' : 'rescue';
      this._bark(pool);
    }
    // the sound of it: cries, a car alarm, the murmur of the crowd, the steel creaking
    this._next.ambient -= dt;
    if (inSite && this._next.ambient <= 0) {
      this._next.ambient = 12 + this.rng.next() * 10;
      const s = g.sfx, q = this.rng.next();
      if (q < 0.3) s?.cries?.(4, 0.07); else if (q < 0.5) s?.carAlarm?.(6, 0.05); else if (q < 0.8) s?.murmur?.(8, 0.09); else s?.groan?.(3, 0.12);
    }
    // the tape
    if (this.active && this.site.cordon && !this.site.cordon.isOpen) {
      const C = CORDON, edge = Math.min(p.x - C.x0, C.x1 - p.x, p.z - C.z0, C.z1 - p.z);
      if (edge < 1.3 && p.y < 4 && this._every('cordon', 9)) {
        const L = LINES.cordon[Math.floor(this.rng.next() * LINES.cordon.length)];
        const cop = this.agents.police.reduce((b, a) => (hd(a, p) < hd(b, p) ? a : b), this.agents.police[0]);
        this._shout(cop, L.text, { who: 'Constable' });
      }
    }
  }

  // ------------------------------------------------------------------------------------------------ the frame
  update(dt, game) {
    if (game.mode !== 'playing') return;
    const p = game.player.pos;
    if (this.stage === 'wait' && !game.cinematics?.active && game.time > 1) this._begin();
    if (this.stage !== 'wait') { this.t += dt; this.st += dt; }
    if (this._timers.length) { const due = this._timers.filter((x) => x.at <= this.t); if (due.length) { this._timers = this._timers.filter((x) => x.at > this.t); due.forEach((x) => x.fn()); } }
    // the crowd and the ambulances live whether or not the sequence runs (so the site is never still)
    const near = hd(p, SITE) < SITE.r + 30;
    if (near) { this._stepCrowd(dt); this._stepStretcher(dt); }
    this._stepAmbulance(dt);
    if (this.live) {
      if (this.stage === 'hat' && game.items.has('hardhat')) this._setStage('rubble');
      this._updateLift(dt);
      this._stepVoices(dt);
      // debris: often while the opening holds, now and then afterwards while she is on the pile
      const onPile = p.y < 4 && p.x > CORDON.x0 && p.x < CORDON.x1 && p.z > CORDON.z0 && p.z < -8;
      this._next.debris -= dt;
      if (onPile && this._next.debris <= 0 && this.stage !== 'wait' && !game.modal) {
        const opening = this.active;
        this._next.debris = opening ? 7 + this.rng.next() * 7 : 22 + this.rng.next() * 20;
        const atHer = this.rng.next() < (opening ? (this.stage === 'hat' ? 0.25 : 0.4) : 0.3);
        this._debris(atHer);
      }
      // the old man: when he is out and has spoken, open the line (or a while after he is freed, if the talk is skipped)
      if (this.stage === 'oldman' && game.flags.oldManFreed && this._freedAt != null && this.t - this._freedAt > 20 && !game.modal) this._open('freed');
      if (this.stage !== 'done' && this.stage !== 'oldman' && (game.flags.oldManFreed || game.flags.jeetuJoined || game.flags.reachedBelow)) this._open('bypass');
    }
    this._stepDebris(dt);
  }

  _later(secs, fn) { this._timers.push({ at: this.t + secs, fn }); }

  // drawn once per rendered frame, after everything moved: the carried things, the hats, the shadows of what is falling, the ambulance lamps
  _draw() {
    const g = this.game, P = this.props, H = this.hats, cam = g.camera.position;
    if (!P) return;
    let n = 0;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
    const box = (x, y, z, yaw, sx, sy, sz, hex, pitch = 0) => {
      if (n >= 96) return;
      e.set(pitch, yaw, 0, 'YXZ'); q.setFromEuler(e); m4.compose(v.set(x, y, z), q, s.set(sx, sy, sz)); P.setMatrixAt(n, m4);
      col.setHex(hex); P.instanceColor.setXYZ(n, col.r, col.g, col.b); n++;
    };
    const stretcher = (x, z, yaw, y) => {
      box(x, y, z, yaw, 0.62, 0.06, 2.1, 0x2f5a3a);
      for (const k of [-1, 1]) box(x + Math.cos(yaw) * 0.3 * k, y + 0.02, z - Math.sin(yaw) * 0.3 * k, yaw, 0.04, 0.05, 2.5, 0x8a8a84);
    };
    const near = hd(cam, SITE) < SITE.r + 40;
    if (near) {
      for (const a of this.agents.bucket) if (a.carry && !a.hidden) { const fx = -Math.sin(a.yaw), fz = -Math.cos(a.yaw); box(a.x + fx * 0.32, 1.02, a.z + fz * 0.32, a.yaw + 0.4, 0.5, 0.3, 0.38, 0x6a665e); }
      for (const T of this.agents.teams) stretcher(T.x, T.z, T.yaw, T.carry ? 0.74 : 0.2);
      for (const a of this.agents.row) stretcher(a.x, a.z, Math.PI, 0.3);
      if (this.amb.carryBody || (this.amb.state === 'load' && this.amb.medics[0]?.job === 'carry')) stretcher(this.amb.cx, this.amb.cz, Math.atan2(-(SPOTS.bay.x - this.amb.cx), -(SPOTS.bay.z + 3.6 - this.amb.cz)), 0.74);
      const st = this.str;
      if (st && !st.done) stretcher(st.x, st.z, st.yaw, st.onGround ? 0.3 : 0.74);
      if (this.amb.state === 'load' && this.amb.carryBody) { /* the body is drawn by the crowd when on a stretcher; the medics carry the frame */ }
    }
    // Mithi's own chunk, held in front of her (first person sees the top of it; third person sees her hug it)
    if (this.carrying === 'chunk') { const pp = g.player.pos, yaw = g.player.yaw ?? 0; box(pp.x - Math.sin(yaw) * 0.38, pp.y + 1.0, pp.z - Math.cos(yaw) * 0.38, yaw + 0.3, 0.46, 0.28, 0.36, 0x6a665e); }
    P.count = n; P.visible = n > 0; if (n) { P.instanceMatrix.needsUpdate = true; P.instanceColor.needsUpdate = true; }
    // hats on heads
    let h = 0;
    if (near) for (const a of this.all) {
      if (!a.hat || a.hidden || a.mode === 'sleep' || h >= 64) continue;
      if (Math.hypot(a.x - cam.x, a.z - cam.z) > 45) continue;
      const sc = 0.15 * (a.build ?? 1) * ((a.h ?? 1.7) / 1.7);
      m4.compose(v.set(a.x + (a.ox ?? 0), a.y + (a.h ?? 1.7) - 0.075 * ((a.h ?? 1.7) / 1.7), a.z + (a.oz ?? 0)), q.setFromEuler(e.set(0, a.yaw, 0)), s.set(sc, sc * 0.95, sc * 1.08));
      H.setMatrixAt(h++, m4);
    }
    H.count = h; H.visible = h > 0; if (h) H.instanceMatrix.needsUpdate = true;
    // shadows of what is about to land
    let k = 0;
    for (const w of this.warn) {
      if (k >= 8 || (w.chunk && w.chunk.state === 'rest')) continue;
      const grow = Math.min(1, w.t / (w.at + 0.9)), r = (0.4 + w.s) * (0.4 + grow * 0.9);
      m4.compose(v.set(w.x, w.floor + 0.03, w.z), q.identity(), s.set(r, 1, r)); this.shadows.setMatrixAt(k++, m4);
    }
    this.shadows.count = k; this.shadows.visible = k > 0; if (k) this.shadows.instanceMatrix.needsUpdate = true;
    // flare on the ambulance's light bar and on the gate's beacon
    const G = this.glows; G.begin();
    const A = this.amb;
    if (A.group.visible) { const on = Math.floor(this.t * 5) % 2; G.add(A.group.position.x + (on ? 0.42 : -0.42), 2.85, A.z - 1.9, 2.2, on ? 0.1 : 1.0, on ? 0.25 : 0.1, on ? 1.0 : 0.08); }
    if (this.site.cordon && !this.site.cordon.isOpen) { const on = Math.floor(this.t * 2.5) % 2; G.add(SPOTS.gate.x - 4.8, 2.7, CORDON.z1 + 0.9, 1.4, on ? 0.15 : 0.9, on ? 0.3 : 0.15, on ? 1.0 : 0.1); }
    G.end();
  }

  snapshot() {
    return {
      live: this.live, active: this.active, stage: this.stage, t: +this.t.toFixed(1), trips: this.trips, carrying: this.carrying,
      stretcher: this.str && { x: +this.str.x.toFixed(2), z: +this.str.z.toFixed(2), pi: this.str.pi, done: this.str.done, dropped: this.str.dropped },
      cordon: this.site.cordon ? (this.site.cordon.isOpen ? 'open' : 'shut') : 'none',
      ambulance: { state: this.amb.state, n: this.amb.n, z: +this.amb.z.toFixed(1), loaded: this.amb.loaded, t: +this.amb.t.toFixed(1) },
      row: this.rowCount(), warn: this.warn.length, agents: this.all.length, stats: { ...this.stats },
    };
  }
}
