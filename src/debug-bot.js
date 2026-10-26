// Playthrough helpers for the debug API (window.__grahan.bot). Phase 7b.
//
// They drive the game the way a player does, with real inputs only: movement keys (KeyW/Shift), E, Q, Tab, Enter and the
// digit keys in conversations, plus `look` for the view. The simulation is stepped synchronously (`debug.run`), so a script is
// deterministic when the live loop is stopped first (`__grahan.set('manual', true)`). There are NO teleports and no flag or item
// setters in here. The only shortcuts are the ones a script needs because it cannot wait in real time: `idle()` steps the
// simulation, and the caller may use `setTime` between objectives.
//
//   bot.go([[x,z], ...], {sprint})          walk waypoints with the keys; reacts like a careful player (waits out visions
//                                           and detentions, sings when dogs close in, sprints away from a mauling)
//   bot.hold('KeyE', seconds)               hold a key (digging)
//   bot.tap('KeyE')                         tap a key
//   bot.dialogue([choices])                 read the open conversation card with Enter, answer with the digit keys; a choice
//                                           is an index, a label substring, or null (= the first enabled one)
//   bot.talk(castId, [choices])             walk up to a cast member, press E, run the dialogue
//   bot.use(interactableId)                 walk into reach of an interactable and press E
//   bot.read(fragmentId)                    walk to a fragment, open it, let the card type out, close it
//   bot.idle(seconds)                       let time pass (stepping with the usual reactions)
//   bot.log                                 everything the bot noticed (dialogue lines, reactions, stalls)
import { STEP } from './game.js';

const r1 = (v) => Math.round(v * 10) / 10;
const key = (code, type) => window.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));

export class Bot {
  constructor(dbg) {
    this.d = dbg;
    this.g = dbg.game;
    this.log = [];
    this.stats = { sings: 0, detours: 0, stalls: 0, visionsWaited: 0, detentionsWaited: 0, sprints: 0 };
    this.lastSingAt = -99;
    this.quiet = false;
    this.minRays = 12;                                           // the lowest she got, for the transcript
    dbg.game.events.on('health:changed', ({ rays }) => { if (rays < this.minRays) this.minRays = rays; });
  }

  get p() { return this.g.player; }
  note(s) { this.log.push(`[${this.g.clock?.hhmm ?? '--'} t=${this.g.time.toFixed(0)}] ${s}`); if (this.log.length > 400) this.log.shift(); }
  sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
  where() { const p = this.p.pos; return `(${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}) ${this.p.level} rays=${this.p.rays}`; }

  // ----------------------------------------------------------------------------------------------- stepping
  /** Step the simulation for `sec` seconds holding `keys` (real key state). */
  step(sec, keys) { this.d.run(keys ?? null, sec); }

  /** Things a player does without thinking. Returns true if it spent time. */
  async react() {
    const g = this.g, h = g.hazards, p = this.p;
    if (h?.detaining) { this.stats.detentionsWaited++; this.note('detained: waiting it out'); let n = 0; while (h.detaining && n++ < 400) { this.d.step(0.1); await Promise.resolve(); } return true; }
    if (g.visionSystem?.active) {                                // a vision holds her still: nothing to do but let it pass
      this.stats.visionsWaited++; this.note('a vision: waiting'); let n = 0;
      while (g.visionSystem.active && n++ < 100) { this.d.step(0.1); await Promise.resolve(); }
      return true;
    }
    if (h?.enabled && !this.quiet) {
      // dogs coming: sing (they calm); it is the one answer the game gives to a pack
      let worst = null, wd = 99;
      for (const e of h.list()) {
        if ((e.kind !== 'dog' && e.kind !== 'deranged') || e.state === 'calm' || e.state === 'leave') continue;
        const dd = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
        if (Math.abs(e.pos.y - p.pos.y) > 2.5) continue;
        if ((e.state === 'chase' || e.state === 'approach' || e.state === 'notice') && dd < wd) { wd = dd; worst = e; }
      }
      if (worst && wd < 16 && g.time - this.lastSingAt > 7 && g.canSing?.() !== false && g.party?.active !== 'jeetu') {
        this.lastSingAt = g.time; this.stats.sings++;
        this.note(`sings: ${worst.kind} ${worst.state} at ${wd.toFixed(0)} m`);
        this.d.run('KeyQ', 0.12);
        return true;
      }
    }
    return false;
  }

  /** Walk to (x, z) with the keys. Returns true on arrival. */
  async goTo(tx, tz, { tol = 0.9, sprint = false, maxSeconds = 120 } = {}) {
    const p = this.p, g = this.g;
    let last = Infinity, stall = 0, detours = 0, t0 = g.time;
    while (g.time - t0 < maxSeconds) {
      const dx = tx - p.pos.x, dz = tz - p.pos.z, d = Math.hypot(dx, dz);
      if (d < tol) return true;
      if (g.dialogue?.isOpen) return false;
      await Promise.resolve();
      if (g.modal && !g.dialogue?.isOpen && !g.fragments?.current && !g.visionSystem?.active && !g.hazards?.detaining) { this.d.step(0.1); continue; }   // a scene or card holds her: let it run
      if (await this.react()) { last = Infinity; stall = 0; continue; }
      if (g.transit?.holdPath?.(p.pos, dx / d, dz / d)) {                // a level crossing is ringing: wait behind the boom like anybody would
        this.stats.crossingWaits = (this.stats.crossingWaits ?? 0) + 1; this.d.step(0.2); last = Infinity; stall = 0; continue;
      }
      const yaw = Math.atan2(-dx, -dz) * 180 / Math.PI;
      if (stall > 5) {
        this.stats.stalls++;
        const side = (detours++ % 2 ? 1 : -1) * (60 + 15 * Math.min(4, detours >> 1));
        this.d.look(yaw + side, 0); this.d.run(sprint ? ['KeyW', 'ShiftLeft'] : 'KeyW', 0.7); stall = 0; last = Infinity;
        this.stats.detours++;
        if (detours > 14) { this.note(`STUCK going to (${tx}, ${tz}) at ${this.where()}`); return false; }
        continue;
      }
      this.d.look(yaw, 0);
      const speed = sprint ? 7 : 4.2;
      this.d.run(sprint ? ['KeyW', 'ShiftLeft'] : 'KeyW', Math.min(0.2, d / speed));
      if (d > last - 0.03) stall++; else stall = 0;
      last = Math.min(last, d);
    }
    this.note(`TIMEOUT going to (${tx}, ${tz}) at ${this.where()}`);
    return false;
  }

  /** points: [x, z] | {sprint:true|false} | {say:'tag'} | {look:[yaw,pitch]} | 'E' | {wait:s}. Returns {ok, log}. */
  async go(points, opts = {}) {
    let sprint = !!opts.sprint, ok = true;
    for (const pt of points) {
      if (pt === 'E') { this.tap('KeyE'); continue; }
      if (Array.isArray(pt)) {
        if (!(await this.goTo(pt[0], pt[1], { sprint, tol: pt[2] ?? opts.tol ?? 0.9 }))) { ok = false; break; }
        continue;
      }
      if (pt.sprint !== undefined) { sprint = !!pt.sprint; continue; }
      if (pt.say) { this.note(`${pt.say}: ${this.where()}`); continue; }
      if (pt.look) { this.d.look(pt.look[0], pt.look[1] ?? 0); continue; }
      if (pt.wait) { await this.idle(pt.wait); continue; }
      if (pt.talk) { await this.dialogue(pt.talk); continue; }
    }
    await this.sleep(0);
    return { ok, where: this.where() };
  }

  async idle(sec) {
    let left = sec;
    while (left > 0) {
      if (await this.react()) { left -= 0.1; continue; }
      const s = Math.min(0.25, left); this.d.step(s); left -= s;
      await Promise.resolve();
    }
  }

  /** Stand where you are until the rays are full (or `maxSeconds`). Meant for sun shafts. */
  async healUp(maxSeconds = 40) {
    const p = this.p; let t = 0;
    while (p.rays < p.maxRays && t < maxSeconds) { await this.idle(0.5); t += 0.5; }
    return p.rays;
  }

  /** Like idle(), but yields to promises every step (cinematics and their awaits only advance between steps). */
  async watch(sec, until = null) {
    const n = Math.round(sec / STEP);
    for (let i = 0; i < n; i++) {
      if (this.g.visionSystem?.active && !this.g.cinematics?.current) { await this.react(); continue; }
      this.d.step(STEP); await Promise.resolve();
      if (until && until()) break;
    }
  }

  tap(code, sec = 0.1) { this.d.run(code, sec); }
  hold(code, sec) { this.d.run(code, sec); }
  async tab() { key('Tab', 'keydown'); key('Tab', 'keyup'); await this.idle(0.3); }
  face(x, z, pitchDeg = 0) { const p = this.p.pos; this.d.look(Math.atan2(-(x - p.x), -(z - p.z)) * 180 / Math.PI, pitchDeg); }

  /** Sing (Q) when the song is ready. */
  async sing() { this.lastSingAt = this.g.time; this.stats.sings++; this.d.run('KeyQ', 0.12); await this.idle(0.1); }

  // ----------------------------------------------------------------------------------------------- talking
  /** Read the open conversation card; `choices` picks the answers in order (index | label substring | null = first enabled). */
  async dialogue(choices = [], { max = 40 } = {}) {
    const dlg = this.g.dialogue;
    let ci = 0, guard = 0;
    while (dlg.isOpen && guard++ < max) {
      const snap = dlg.snapshot();
      if (!snap) break;
      const cur = dlg.current;
      if (!this.quiet && snap.line && snap.lineIndex !== this._lastLine) { this._lastLine = snap.lineIndex; this.log.push(`  ${snap.speaker}: ${snap.line.slice(0, 110)}`); }
      if (dlg.showChoices || (dlg.lineIdx >= cur.lines.length - 1 && !dlg.typing && cur.choices.length)) {
        await this.sleep(380);                    // the card ignores an answer given before it was read (350 ms)
        let want = choices[ci++];
        const list = cur.choices;
        let idx = -1;
        if (typeof want === 'number') idx = want;
        else if (typeof want === 'string') idx = list.findIndex((c) => c.label.toLowerCase().includes(want.toLowerCase()));
        if (want != null && (idx < 0 || !list[idx] || list[idx].enabled === false)) this.note(`WANTED "${want}" but it is missing or disabled; taking the first enabled answer`);
        if (idx < 0 || !list[idx] || list[idx].enabled === false) idx = list.findIndex((c) => c.enabled !== false);
        this.log.push(`  > ${list[idx]?.label}`);
        this._lastLine = -1;
        key('Digit' + (idx + 1), 'keydown'); key('Digit' + (idx + 1), 'keyup');
        await this.sleep(10);
        continue;
      }
      if (!cur.choices.length && dlg.lineIdx >= cur.lines.length - 1 && !dlg.typing) { key('Enter', 'keydown'); key('Enter', 'keyup'); await this.sleep(5); continue; }
      key('Enter', 'keydown'); key('Enter', 'keyup');
      await this.sleep(5);
    }
    this._lastLine = -1;
    await this.idle(0.2);
    return !dlg.isOpen;
  }

  actor(id) { return this.g.cast?.get(id); }

  /** Walk up to a cast member, press E and read the conversation. */
  async talk(id, choices = [], { via = null, at = null } = {}) {
    const a = this.actor(id);
    if (!a) throw new Error('no cast member ' + id);
    const wp = this.g.cast.worldPos(a);
    const it = this.g.interactables.get('talk:' + id) ?? this.g.interactables.list().find((i) => i.id.startsWith('talk:' + id));
    const tx = it ? it.pos.x : wp.x, tz = it ? it.pos.z : wp.z;
    if (via) await this.go(via);
    if (at) await this.goTo(at[0], at[1], { tol: 0.5 });
    else await this.goTo(tx, tz, { tol: Math.max(1.4, (it?.radius ?? 2.5) - 1.0) });
    if (it) {                                                  // within reach? (the stand point is a hint, the interactable's radius is the rule)
      const p = this.p.pos;
      if (Math.hypot(p.x - it.pos.x, p.z - it.pos.z) > it.radius - 0.25) await this.goTo(it.pos.x, it.pos.z, { tol: Math.max(0.6, it.radius - 1.0) });
    }
    this.face(tx, tz);
    for (let k = 0; k < 3 && !this.g.dialogue.isOpen; k++) { this.tap('KeyE'); await Promise.resolve(); if (!this.g.dialogue.isOpen) await this.idle(0.4); }
    if (!this.g.dialogue.isOpen) { this.note(`E did not open ${id} here: ${this.where()}`); return false; }
    return this.dialogue(choices);
  }

  /** Walk to an interactable and press E (the first matching id). */
  async use(id, { tol } = {}) {
    const it = this.g.interactables.get(id);
    if (!it) throw new Error('no interactable ' + id);
    await this.goTo(it.pos.x, it.pos.z, { tol: tol ?? Math.max(1, it.radius - 1.1) });
    this.tap('KeyE');
    await this.idle(0.2);
  }

  /** Open a story fragment by walking to it and pressing E, wait for the card to type out, then close it. */
  async read(id) {
    const f = this.g.fragments;
    const it = this.g.interactables.get('frag:' + id) ?? this.g.interactables.list().find((i) => i.id.includes(id));
    if (!it) { this.note('no fragment interactable ' + id); return false; }
    await this.goTo(it.pos.x, it.pos.z, { tol: Math.max(0.9, it.radius - 1.2) });
    this.tap('KeyE'); await Promise.resolve();
    if (!this.g.modal) { this.note(`E did not open ${id}: ${this.where()}`); return false; }
    this.d.step(5);
    key('Enter', 'keydown'); key('Enter', 'keyup');
    await this.idle(0.6);
    return !this.g.modal;
  }

  // ----------------------------------------------------------------------------------------------- lifts
  /** Stand in the lift lobby at (x, z), press E, ride, and wait for the doors. */
  async ride(x, z, seconds = 8) {
    await this.goTo(x, z, { tol: 0.8 });
    this.tap('KeyE'); await this.idle(0.5);
    await this.idle(seconds);
  }

  // ----------------------------------------------------------------------------------------------- the Harbour Line (Phase 8B)
  /**
   * Take the Harbour Line from one station to another with real inputs: walk to the platform, wait for the right train to stand
   * with its doors open, walk in through a door, hold on while it runs (each leg costs a little game time), walk out at the stop.
   * Returns {ok, waited, rideSeconds, clock}.
   */
  async rideTrain(from, to) {
    const g = this.g, T = g.transit, p = this.p;
    const A = T.stations.find((s) => s.id === from), B = T.stations.find((s) => s.id === to);
    const east = B.x > A.x, side = east ? 'north' : 'south', P = A.platforms[side], zEdge = P.trackEdge, s = side === 'north' ? 1 : -1;     // s: from the platform toward the track
    const t0 = g.time;
    await this.goTo(A.x + (east ? -6 : 6), P.zMid, { tol: 0.8 });                      // up the platform, away from the columns
    this.note(`waiting for the ${east ? 'eastbound' : 'westbound'} train at ${A.name}`);
    let train = null, guard = 0;
    while (guard++ < 4000) {
      train = T.trains.find((t) => t.active && t.at === from && t.state === 'dwell' && t.dir === (east ? 1 : -1) && t.timer > 4);
      if (train) break;
      await this.idle(0.5);
    }
    if (!train) { this.note('NO TRAIN'); return { ok: false }; }
    const waited = g.time - t0;
    // the nearest door, then in and across the car
    const doors = [-16.4, -11.8, -7, -2.4, 2.4, 7, 11.8, 16.4].map((d) => train.x + d);
    const dx = doors.reduce((b, x) => (Math.abs(x - p.pos.x) < Math.abs(b - p.pos.x) ? x : b), doors[0]);
    await this.goTo(dx, zEdge - s * 0.9, { tol: 0.22 });                               // the door is 1.5 m wide and Mithi 0.7: line up on its middle
    this.d.look(s > 0 ? 180 : 0, 0);                                                    // face the train
    this.d.run('KeyW', 0.9);
    if (!T.ride) { this.d.run('KeyW', 0.5); }
    this.note(`boarded ${train.id}: ${this.where()}`);
    let n = 0;
    while (n++ < 2400 && !(T.ride && T.ride.train.at === to && T.ride.train.state === 'dwell')) {
      if (!T.ride) { this.note('left the train mid-way'); break; }
      await this.idle(0.5);
    }
    const rideSeconds = g.time - t0 - waited;
    // out of the doors: toward the platform, away from the track
    const t = T.ride?.train ?? train;
    if (t.at === to) {
      const doors2 = [-16.4, -11.8, -7, -2.4, 2.4, 7, 11.8, 16.4].map((d) => t.x + d);
      const ox = doors2.reduce((b, x) => (Math.abs(x - p.pos.x) < Math.abs(b - p.pos.x) ? x : b), doors2[0]);
      await this.goTo(ox, t.z + (side === 'north' ? -0.7 : 0.7), { tol: 0.22 });
      this.d.look(s > 0 ? 0 : 180, 0);
      this.d.run('KeyW', 1.0);
    }
    return { ok: !T.ride && p.pos.y > 0.4, waited: Math.round(waited), rideSeconds: Math.round(rideSeconds), clock: g.clock.hhmm, at: this.where() };
  }

  // ----------------------------------------------------------------------------------------------- lifts with floors and charge (Phase 8B)
  /**
   * Ride a lift to the stop `stopId`: walk to its call panel, call the car, step on, press E; when a floor panel opens answer it with the
   * floor's digit; when the cell is drained, wait for the sun (`onDrained: 'wait'`) or press a palm to the panel (`'palm'`, costs a ray).
   */
  async rideLift(liftId, stopId, { onDrained = 'wait', maxWait = 400 } = {}) {
    const g = this.g, lift = g.lifts.get(liftId), p = this.p, [cx, cz] = lift.center;
    const DIRS = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };
    const me = lift.stops.reduce((b, st) => (Math.abs(st.y - p.pos.y) < Math.abs(b.y - p.pos.y) ? st : b), lift.stops[0]);
    const settle = async () => { let n = 0; while (lift.moving && n++ < 600) await this.idle(0.5); };
    const handle = async () => { for (let i = 0; i < 6 && g.dialog.isOpen; i++) await this.answerLiftDialog(lift, stopId, onDrained, maxWait); };
    this.stats.liftRides = (this.stats.liftRides ?? 0) + 1;
    // 1. get the car to this floor (a call; a drained cell is waited out, or paid for with a palm)
    if (lift.stop() !== me.id) {
      await this.use(`${liftId}:${me.id}`); await handle(); await settle();
      if (lift.stop() !== me.id && !lift.moving) { this.tap('KeyE'); await this.idle(0.3); await handle(); await settle(); }
    }
    // 2. onto the car
    const side = DIRS[me.exit];
    await this.goTo(cx + side[0] * 2.6, cz + side[1] * 2.6, { tol: 0.7 });
    await this.goTo(cx, cz, { tol: 0.6 });
    // 3. E: a plain lift just goes; a many-floored one asks which floor; a drained one asks what you will do about it
    for (let tries = 0; tries < 5 && !lift.moving && lift.stop() !== stopId; tries++) {
      if (!g.dialog.isOpen) { this.tap('KeyE'); await this.idle(0.3); }
      await handle(); await this.idle(0.2);
    }
    await settle();
    return { ok: lift.stop() === stopId, charge: lift.chargePct, rays: p.rays, at: this.where() };
  }

  /** Read whatever lift dialog is open (floor panel or drained) and answer it for the target stop. */
  async answerLiftDialog(lift, stopId, onDrained, maxWait) {
    const g = this.g, dlg = g.dialog;
    const ids = dlg.current.choices.map((c) => c.id);
    const press = async (id) => { const i = dlg.current.choices.findIndex((c) => c.id === id); const k = dlg.current.choices[i].keys[0]; key(k, 'keydown'); key(k, 'keyup'); await this.sleep(5); };
    await this.sleep(20);
    if (ids.includes('palm')) {
      if (onDrained === 'palm') { this.note(`lift drained (${lift.chargePct}%): pressing a palm to the panel`); await press('palm'); }
      else {
        this.note(`lift drained (${lift.chargePct}%): waiting for the sun`); await press('wait');
        const cost = lift.cost(stopId, {}); let t = 0;
        while (t < maxWait && lift.charge + 1e-6 < Math.max(cost, lift.cost(lift.stop() === stopId ? 'bottom' : stopId, { call: true }))) { await this.idle(1); t += 1; }
        this.stats.liftWaits = (this.stats.liftWaits ?? 0) + t;
        this.tap('KeyE'); await Promise.resolve();
      }
    } else if (ids.includes(stopId)) await press(stopId);
    else await press(ids[ids.length - 1]);
  }

  /** One compact object for the playthrough transcript. */
  report(label) {
    const g = this.g, s = this.d.state(), st = s.setu, o = s.story6a?.objectives?.primary;
    const f = s.flags;
    const keep = ['oldManFreed', 'jeetuJoined', 'bloodGiven', 'bridgePermit', 'torch', 'jacket', 'reachedBelow', 'breachKnown', 'hasEvidence', 'cityWarned', 'setuFound'];
    const flags = Object.keys(f).filter((k) => keep.includes(k) && f[k]).join(',');
    return {
      step: label, clock: s.clock.hhmm, pos: [r1(s.pos.x), r1(s.pos.y), r1(s.pos.z)], level: s.level, rays: s.rays,
      setu: st && { win: st.window, hp: Math.round(st.health), found: st.found, dist: r1(st.dist), dead: st.dead },
      obj: o ? o.id : null, flags, detained: s.hazards?.detentions ?? 0, party: g.party?.active, calls: s.render.calls,
    };
  }

  /** Debug-style summary line. */
  brief() {
    const s = this.d.state();
    return `${s.clock?.hhmm} ${s.level} rays=${s.rays} setu=${s.setu?.window}/${s.setu?.health} found=${s.setu?.found} pos=(${r1(s.pos.x)},${r1(s.pos.z)})`;
  }
}
void STEP;
