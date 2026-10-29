// The lift panels (Phase 8B): E interaction for every lift stop, the floor-choice panel of the multi-stop lifts, the drained-battery
// dialog (wait it out, or press your palm to the cell: one ray buys a ride), and the world-space charge gauges over the doorways.
//
//   game.liftPanel.open(lift)             the floor panel for the car you are standing in
//   game.liftPanel.attempt(lift, stopId)  ride (or call) with every check: bio-scan threshold, charge, drained dialog
//   game.liftPanel.gauges                 the instanced gauge meshes (2 draw calls, only the ones within ~50 m)
// Events: lift:ride, lift:drained, lift:topup (from the Lift), gate:denied {id:<lift id>, min, rays} (a stop's bio-scan said no),
//         lift:ready {id} (a drained lift you were waiting for has enough charge now).
// Test aids: __grahan.do('liftState'), do('liftSetCharge', id, pct), do('liftChoose', digit).
import * as THREE from '../../../vendor/three.module.js';

const DIRS = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };
const pct = (lift, units) => Math.round(100 * units / lift.capacity);
/** The capsule's class and how full it is, for prompts: "solo", "family", "public 7/12", "freight 3/24". */
const tag = (lift) => (lift.capsule ? ` · ${lift.cls.id}${lift.seats >= 12 ? ` ${lift.crowd}/${lift.seats}` : ''}` : '');
const mmss = (s) => (!isFinite(s) ? 'never, at this light' : s < 90 ? `${Math.ceil(s)} s` : `${Math.floor(s / 60)} min ${String(Math.round(s % 60)).padStart(2, '0')} s`);
const STYLE = `
.lp-gauge{height:11px;border:1px solid rgba(221,233,244,.55);margin:2px 0 10px;position:relative;background:rgba(0,0,0,.4)}
.lp-gauge i{display:block;height:100%;background:#59d6a2}
.lp-gauge.mid i{background:#ffb347}.lp-gauge.low i{background:#ff6a4a}
.lp-gauge b{position:absolute;top:-4px;width:2px;height:17px;background:#fff;box-shadow:0 0 4px #fff}
.lp-sun{display:inline-block;margin-left:.5em;opacity:.8}
`;

function gaugeColor(f, out) { return f > 0.5 ? out.setRGB(0.35, 0.85, 0.62) : f > 0.2 ? out.setRGB(1.0, 0.7, 0.25) : out.setRGB(1.0, 0.32, 0.22); }

export class LiftPanelSystem {
  init(game) {
    this.game = game;
    game.liftPanel = this;
    this.waiting = null;
    this.lastMsgAt = -99;
    const st = document.createElement('style'); st.textContent = STYLE; document.head.appendChild(st);
    this._registerInteractables();
    this._buildGauges();
    const dbg = game.debug;
    dbg?.addState('lifts8b', () => game.lifts.state());
    dbg?.addAction('liftState', () => game.lifts.state());
    dbg?.addAction('liftSetCharge', (g, id, p) => { const l = g.lifts.get(id); l.charge = l.capacity * p / 100; return l.snapshot(); });
    dbg?.addAction('liftChoose', (g, id) => { g.dialog.choose(id); return true; });
    dbg?.addSetter('liftsFree', (g, v) => { g.lifts.free = !!v; });
  }

  // ------------------------------------------------------------------ interaction
  _registerInteractables() {
    const game = this.game;
    for (const lift of game.lifts.lifts) {
      if (lift.def == null) continue;            // the arena's auto lift
      const [cx, cz] = lift.center, [w, d] = lift.size;
      const inFootprint = (p) => Math.abs(p.x - cx) < w / 2 + 0.15 && Math.abs(p.z - cz) < d / 2 + 0.15;
      const onCar = (p) => inFootprint(p) && Math.abs(p.y - lift.y) < 1.3;
      for (const stop of lift.stops) {
        const side = DIRS[stop.exit];
        const sid = stop.id;
        game.interactables.add({
          // standing in the empty shaft you cannot call the car down onto yourself
          enabled: (g) => lift.stop() === sid || lift.moving || !inFootprint(g.player.pos),
          id: `${lift.id}:${sid}`, pos: { x: cx + side[0] * (w / 2 + 1.4), y: stop.y, z: cz + side[1] * (d / 2 + 1.4) }, radius: 4.2, height: 2.6,
          prompt: (g) => {
            const c = `${lift.chargePct}%`, tg = tag(lift), full = lift.seats - lift.crowd < 1 ? ' · FULL' : '';
            if (lift.moving) return `Lift is moving · ${c}${tg}`;
            if (lift.stop() === sid) {
              if (!onCar(g.player.pos)) return `Step onto the lift${tg}${full}`;
              return lift.multi ? `Choose a floor · charge ${c}${tg}${full}` : `Ride lift ${sid === 'bottom' ? 'up' : 'down'} · ${pct(lift, lift.cost(sid === 'bottom' ? 'top' : 'bottom'))}% of ${c}${tg}${full}`;
            }
            const need = lift.cost(sid, { call: true });
            return lift.charge + 1e-6 < need ? `Call lift · drained (${c})${tg}` : `Call lift · charge ${c}${tg}`;
          },
          onInteract: (g) => {
            if (lift.moving) return;
            if (lift.stop() === sid) {
              if (!onCar(g.player.pos)) return;
              if (lift.multi) this.open(lift);
              else this.attempt(lift, sid === 'bottom' ? 'top' : 'bottom');
            } else this.attempt(lift, sid, { call: true });
          },
        });
      }
    }
  }

  /** Ride (or call) to a stop with every check. Returns the Lift.ride() result, or null if a dialog took over. */
  attempt(lift, stopId, { call = false } = {}) {
    const game = this.game, stop = lift.stopById(stopId), p = game.player;
    if (!call && stop.min && p.rays < stop.min) {
      game.events.emit('gate:denied', { id: lift.id, min: stop.min, rays: p.rays });
      return { ok: false, reason: 'scan' };
    }
    // Phase 9A: the capsule's seats. A full car cannot be boarded; a small one takes Mithi first and the others wait for the next cycle.
    let plan = null;
    if (!call && lift.capsule && game.capsules) {
      plan = game.capsules.plan(lift);
      if (!plan.ok) {
        const s = game.capsules.status(lift);
        game.messages?.say(`${lift.label || 'The lift'}: the ${lift.cls.name.toLowerCase()} is full, ${s.crowd} of ${s.seats} seats${s.rush ? ' (rush hour)' : ''}. The next one is ${Math.max(1, Math.ceil(s.nextIn))} s away.`, { kind: 'system', ttl: 4.5 });
        game.events.emit('capsule:refused', { id: lift.id, crowd: s.crowd, seats: s.seats });
        return { ok: false, reason: 'full' };
      }
    }
    const fromId = lift.stop();
    const r = lift.ride(stopId, { call });
    if (r.ok) {
      this.waiting = null;
      if (plan) game.capsules.depart(lift, plan, fromId, stopId);
      if (!call) {
        const left = plan?.left ?? [], names = left.map((m) => m.name);
        game.messages?.say(`${lift.label || 'Lift'}: ${stop.level} ${stop.name}. The cell reads ${lift.chargePct}%.`, { kind: 'system', ttl: 3.2 });
        if (names.length) game.messages?.say(lift.seats === 1 ? `A solo capsule: ${names.join(' and ')} will come on the next cycle.` : `Only room for ${plan.board.length + 1}: ${names.join(' and ')} will take the next one.`, { kind: 'story', ttl: 4.5 });
      }
      return r;
    }
    if (r.reason === 'drained') { this.drained(lift, stopId, { call }); return null; }
    return r;
  }

  _gaugeHtml(lift, costUnits = null) {
    const f = lift.charge / lift.capacity, cls = f > 0.5 ? '' : f > 0.2 ? 'mid' : 'low';
    return `<div class="lp-gauge ${cls}"><i style="width:${(f * 100).toFixed(0)}%"></i>${costUnits != null ? `<b style="left:${Math.min(100, 100 * costUnits / lift.capacity).toFixed(0)}%"></b>` : ''}</div>`;
  }
  _decorate(lift, costUnits) {
    const rows = this.game.dialog?.el?.querySelector('.dl-rows');
    if (rows) rows.insertAdjacentHTML('afterbegin', this._gaugeHtml(lift, costUnits));
  }
  _capRow(lift) {
    const c = lift.cls, st = this.game.capsules?.status(lift);
    return `${c.name} · ${c.cap === 1 ? '1 seat' : c.cap + ' seats'}${st && lift.seats >= 12 ? ` · ${st.crowd} taken${st.full ? ', FULL' : ''}` : ''}`;
  }
  _sunRow(lift) {
    const sun = this.game.world?.sunShafts?.intensity ?? 0;
    const lit = lift.panel === 'sun';
    return [`Solar cell`, `${lit ? 'above the haze' : 'in the shadow of the towers'} · ${sun < 0.05 ? 'no sun now' : `${(lift.rechargeRate() / lift.capacity * 100).toFixed(1)}% per second`}`];
  }

  /** The floor-choice panel of the car you stand in. */
  open(lift) {
    const game = this.game, here = lift.stopAtY(lift.y), dlg = game.dialog;
    if (!dlg || dlg.isOpen) return;
    const choices = [];
    lift.stops.forEach((s, i) => {
      if (s === here) return;
      const c = lift.cost(s.id);
      choices.push({ id: s.id, hint: String(i + 1), keys: [`Digit${i + 1}`, `Numpad${i + 1}`],
        label: `${s.level}  ${s.name} · ${pct(lift, c)}%${s.min ? ` · ${s.min} rays` : ''}` });
    });
    choices.push({ id: 'cancel', hint: 'Esc', keys: ['Escape'], label: 'Stay where you are' });
    dlg.open({
      title: lift.label || 'Lift', tag: `LIFT · FLOOR ${lift.stops.indexOf(here) + 1}`,
      quote: `The panel is warm. The cell glows ${lift.chargePct > 50 ? 'green' : lift.chargePct > 20 ? 'amber' : 'red'}.`,
      rows: [['Capsule', this._capRow(lift)], ['Charge', `${lift.chargePct}%`], this._sunRow(lift)],
      choices,
      onChoose: (id) => { if (id !== 'cancel') this.attempt(lift, id); },
    });
    this._decorate(lift, null);
  }

  /** The cell cannot carry that ride. Wait for the sun, or press a palm to it. */
  drained(lift, stopId, { call = false } = {}) {
    const game = this.game, dlg = game.dialog, stop = lift.stopById(stopId), cost = lift.cost(stopId, { call });
    if (!dlg || dlg.isOpen) return;
    const eta = lift.secondsToCharge(cost), rays = game.player.rays, canPalm = rays > 1;
    dlg.open({
      title: lift.label || 'Lift', tag: 'CELL DRAINED',
      quote: lift.panel === 'sun' || (game.world?.sunShafts?.intensity ?? 0) > 0.05
        ? 'The lift stutters and sighs. Nothing left in the cell. Somewhere above the haze the sun is feeding it, slowly.'
        : 'The lift is dead. The cell has had no sun for hours.',
      rows: [['Capsule', this._capRow(lift)], ['Charge', `${lift.chargePct}%`], ['This ride needs', `${pct(lift, cost)}% (${stop.level} ${stop.name})`], ['Waiting', mmss(eta)], this._sunRow(lift)],
      choices: [
        { id: 'palm', hint: '1', keys: ['Digit1', 'Numpad1'], label: canPalm ? `Press your palm to the panel · costs ${1} ray` : 'Press your palm to the panel (you have too little light left)' },
        { id: 'wait', hint: '2', keys: ['Digit2', 'Numpad2'], label: `Wait for the sun (${mmss(eta)})` },
        { id: 'leave', hint: 'Esc', keys: ['Escape'], label: 'Walk away' },
      ],
      onChoose: (id) => {
        if (id === 'palm') this.palm(lift, stopId, { call });
        else if (id === 'wait') { this.waiting = { lift, stopId, cost, call }; game.messages?.say(`You lean on the cold shaft and wait. The cell is at ${lift.chargePct}%.`, { kind: 'system', ttl: 4 }); }
      },
    });
    this._decorate(lift, cost);
  }

  /** One ray buys a ride: the palm goes flat on the cell and the lift drinks what it needs. */
  palm(lift, stopId, { call = false } = {}) {
    const game = this.game, p = game.player;
    if (p.rays <= 1) { game.messages?.say('There is too little light left in you. The panel stays dark.', { kind: 'system', ttl: 4 }); return; }
    game.health.setRays(p.rays - 1);
    lift.topUp(Math.max(0, lift.cost(stopId, { call }) - lift.charge) + 0.5);
    game.screenfx?.flash?.('#ffd27a', 320, 0.16);
    game.messages?.say('Your palm warms against the cell. A ray leaves you, and the lift hums awake.', { kind: 'story', ttl: 4.5 });
    game.events.emit('sound:emit', { x: lift.center[0], y: lift.y + 1, z: lift.center[1], kind: 'gate-chime', loudness: 0.45 });
    this.attempt(lift, stopId, { call });
  }

  // ------------------------------------------------------------------ world-space gauges
  _buildGauges() {
    const game = this.game;
    this.items = [];
    for (const lift of game.lifts.lifts) {
      if (lift.def == null) continue;
      const [cx, cz] = lift.center, [w, d] = lift.size;
      for (const stop of lift.stops) {
        const s = DIRS[stop.exit], ax = s[0] !== 0;
        this.items.push({
          lift, stop,
          x: cx + s[0] * (w / 2 + 0.2), z: cz + s[1] * (d / 2 + 0.2), y: stop.y + 2.55, yaw: ax ? Math.PI / 2 : 0,
          nx: s[0], nz: s[1],
        });
      }
    }
    const cap = this.items.length;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.frameMesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), cap);
    this.fillMesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: 0xffffff }), cap);
    for (const [m, name] of [[this.frameMesh, 'lift-gauge-frames'], [this.fillMesh, 'lift-gauge-fills']]) {
      m.name = name; m.frustumCulled = false; m.count = 0; m.visible = false;
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3), 3);
      game.scene.add(m);
    }
    this._t = 0;
    this.gauges = { frames: this.frameMesh, fills: this.fillMesh, items: this.items };
  }

  _updateGauges() {
    const game = this.game, p = game.player.pos, near = [];
    for (const it of this.items) {
      const dx = it.x - p.x, dz = it.z - p.z, dy = it.y - p.y;
      if (dx * dx + dz * dz < 55 * 55 && Math.abs(dy) < 40) near.push(it);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3(), col = new THREE.Color();
    let n = 0;
    for (const it of near) {
      const f = Math.max(0, Math.min(1, it.lift.charge / it.lift.capacity)), alongZ = it.nx !== 0;      // exit on +-x: the panel runs along z
      pos.set(it.x, it.y, it.z); alongZ ? sc.set(0.1, 0.34, 1.5) : sc.set(1.5, 0.34, 0.1); m.compose(pos, q, sc);
      this.frameMesh.setMatrixAt(n, m); this.frameMesh.setColorAt(n, col.setRGB(0.05, 0.08, 0.09));
      const bw = Math.max(0.03, 1.3 * f), off = -0.65 + bw / 2;
      if (alongZ) { pos.set(it.x + it.nx * 0.07, it.y, it.z + off); sc.set(0.05, 0.2, bw); } else { pos.set(it.x + off, it.y, it.z + it.nz * 0.07); sc.set(bw, 0.2, 0.05); }
      m.compose(pos, q, sc);
      this.fillMesh.setMatrixAt(n, m); this.fillMesh.setColorAt(n, gaugeColor(f, col));
      n++;
    }
    for (const mesh of [this.frameMesh, this.fillMesh]) {
      mesh.count = n; mesh.visible = n > 0;
      if (n) { mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true; }
    }
  }

  update(dt, game) {
    this._t += dt;
    if (this._t > 0.2) { this._t = 0; this._updateGauges(); }
    const w = this.waiting;
    if (w && w.lift.charge + 1e-6 >= w.cost && game.time - this.lastMsgAt > 1) {
      this.lastMsgAt = game.time; this.waiting = null;
      game.events.emit('lift:ready', { id: w.lift.id });
      game.messages?.say(`${w.lift.label || 'The lift'}: the cell has enough now. The panel flickers green.`, { kind: 'system', ttl: 4 });
    }
  }
}
