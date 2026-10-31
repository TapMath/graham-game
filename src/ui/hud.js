// The HUD: a DOM/CSS overlay in the OK Computer style of PLAN 3b (pale blue-white, thin sans-serif, small
// scrawled annotations over sterile corporate labels). Nothing here owns game state; it only reads it.
//
//   top-left   sun glyph with 12 rays (a lost ray fades out)  + ray count
//   top-centre the clock HH:MM (+ day), the flood countdown (hidden until `flags.breachKnown`, see setFloodVisible), the objective line
//   top-right  Setu's breath: heartbeat trace + bar. Hidden until the first Setu story line (or until he is found)
//   bottom     gate requirement card when near a bio-scanner, interaction prompt (game.interactables.focus)
//   bottom-left message feed (game.messages.say): sound captions, story lines, clues, system notes and the PA in ONE stack, kept
//              short (at most 4 lines, 3 on small screens), one caption and one PA line at a time, repeats merged ("x2")
//   whole screen: red/blue low-health vignette, damage/heal flashes, glitch (from game.screenfx)
//
// API: game.hud.setFloodVisible(bool), game.hud.showSetu(bool), game.hud.el (root), game.hud.setThreshold(n|null) marks a ray
// requirement on the sun. Debug HUD (?debug=1) is a separate element (ui/debughud.js).
import { fmtDist } from './mapdata.js';
const NS = 'http://www.w3.org/2000/svg';
const RAYS = 12;

function sunSvg() {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '-66 -66 132 132'); svg.setAttribute('class', 'sun');
  let h = `<defs><radialGradient id="sunCore" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fffbe8"/><stop offset=".7" stop-color="#ffe8a8"/><stop offset="1" stop-color="#f6c86a"/></radialGradient></defs>`;
  h += `<circle class="halo" r="26"/><circle class="core" r="15" fill="url(#sunCore)"/><circle class="ring" r="21"/>`;
  for (let i = 0; i < RAYS; i++) {
    const a = (i * 30 - 90) * Math.PI / 180, r0 = 28, r1 = i % 2 ? 47 : 41;
    h += `<line class="ray on" data-i="${i}" x1="${(Math.cos(a) * r0).toFixed(2)}" y1="${(Math.sin(a) * r0).toFixed(2)}" x2="${(Math.cos(a) * r1).toFixed(2)}" y2="${(Math.sin(a) * r1).toFixed(2)}"/>`;
  }
  h += `<g class="mark" opacity="0"><path d="M0 -62 l-4 -7 h8 z"/><text y="-71" text-anchor="middle">5</text></g>`;
  svg.innerHTML = h;
  return svg;
}

const SQUIGGLE = `<svg class="squig" viewBox="0 0 120 8" preserveAspectRatio="none"><path d="M1 5 C 10 1, 18 8, 30 4 S 52 1, 66 5 S 92 8, 119 3"/></svg>`;
const STICK = `<svg class="stick" viewBox="0 0 40 52"><circle cx="20" cy="8" r="5.5"/><path d="M20 14 V32 M20 19 L8 28 M20 19 L32 28 M20 32 L11 48 M20 32 L29 48"/><path class="sunbit" d="M20 -1 V-5 M9 2 L6 -1 M31 2 L34 -1"/></svg>`;
const PERMIT = `<svg class="stick" viewBox="0 0 40 52"><circle cx="20" cy="8" r="5.5"/><path d="M20 14 V32 M20 19 L8 28 M20 19 L30 22 M20 32 L11 48 M20 32 L29 48"/><rect x="26" y="14" width="10" height="13" rx="1"/><path d="M28 18 H34 M28 21 H34 M28 24 H32"/></svg>`;

export class HudSystem {
  init(game) {
    this.game = game;
    game.hud = this;
    const root = this.el = document.getElementById('hud');
    root.classList.add('grahan-hud');
    const q = (s) => root.querySelector(s);
    root.insertAdjacentHTML('beforeend', `
      <div class="hud-top">
        <div class="hud-rays">
          <div class="sunwrap"></div>
          <div class="rays-meta">
            <div class="lbl">DAILY LIGHT <s>ALLOWANCE</s><span class="scrawl rot-a">ration</span></div>
            <div class="rays-count"><b>7</b><i>/ 12</i></div>
            <div class="rays-status"></div>
            <div class="hud-wallet"><span class="lbl">CASH</span> <b>\u20b90</b><i class="pop"></i></div>
          </div>
        </div>
        <div class="hud-center">
          <div class="hud-clock">
            <div class="lbl">MUNICIPAL TIME</div>
            <div class="time">05:40</div>
            <div class="day">DAY <span>1</span> OF 2</div>
            <div class="flood" hidden>FLOOD IN <b>24h 20m</b><span class="scrawl rot-b">until the water</span></div>
          </div>
          <div class="hud-objective"><div class="lbl"><span>OBJECTIVE</span><button type="button" class="opt-chip" hidden></button></div><p></p><div class="obj-where" hidden></div>${SQUIGGLE}</div>
        </div>
        <div class="hud-setu" hidden>
          <div class="lbl"><s>SUBJECT 0471</s><span class="scrawl rot-b">Setu</span></div>
          <svg class="ecg" viewBox="0 0 132 34" preserveAspectRatio="none"><defs><linearGradient id="ecgFade" x1="0" x2="1" y1="0" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".3" stop-color="#fff" stop-opacity="1"/></linearGradient><mask id="ecgMask"><rect width="132" height="34" fill="url(#ecgFade)"/></mask></defs><g mask="url(#ecgMask)"><path class="ecg-line" d=""/></g><circle class="ecg-dot" r="1.7" cx="130" cy="21"/></svg>
          <div class="breath"><i></i></div>
          <div class="breath-n">BREATH <b>100</b>%</div>
        </div>
      </div>
      <div class="hud-bottom">
        <div class="gate-card" hidden><div class="gc-fig"></div><div class="gc-txt"><div class="lbl">BIO-SCAN</div><div class="gc-req"></div><div class="gc-state"></div></div></div>
        <div class="prompt" hidden><kbd>E</kbd><span></span></div>
      </div>
      <div class="hud-feed"></div>`);
    this.sunwrap = q('.sunwrap'); this.sunwrap.appendChild(this.sun = sunSvg());
    this.rayEls = [...this.sun.querySelectorAll('.ray')];
    this.mark = this.sun.querySelector('.mark');
    this.count = q('.rays-count b'); this.status = q('.rays-status');
    this.walletEl = q('.hud-wallet'); this.walletB = q('.hud-wallet b'); this.walletPop = q('.hud-wallet .pop'); this._rupees = null;
    game.events.on('wallet:change', ({ delta, reason }) => {
      if (!(delta > 0) || reason === 'set' || reason === 'new run') return;   // money earned or found pops; a reset does not
      this.walletPop.textContent = '+\u20b9' + delta;
      this.walletEl.classList.remove('gain'); void this.walletEl.offsetWidth; this.walletEl.classList.add('gain');
    });
    this.timeEl = q('.hud-clock .time'); this.dayEl = q('.hud-clock .day span'); this.floodEl = q('.hud-clock .flood'); this.floodB = q('.flood b');
    this.setuEl = q('.hud-setu'); this.ecg = q('.hud-setu .ecg'); this.ecgLine = q('.ecg-line'); this.ecgDot = q('.ecg-dot'); this.breathBar = q('.breath i'); this.breathN = q('.breath-n b');
    this.objEl = q('.hud-objective p'); this.objWrap = q('.hud-objective'); this.whereEl = q('.obj-where'); this._whereT = 0; this._where = '';
    this.gateCard = q('.gate-card'); this.gcFig = q('.gc-fig'); this.gcReq = q('.gc-req'); this.gcState = q('.gc-state');
    this.promptEl = q('.prompt'); this.promptText = q('.prompt span');
    this.feed = q('.hud-feed');
    this.crosshair = document.getElementById('crosshair');
    this.center = q('.hud-center'); this.optChip = q('.opt-chip');
    // optional objectives: a quiet list on big screens, folded behind a chip on small ones (CSS decides, see styles.css)
    this.optChip.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.optChip.addEventListener('click', () => { this.center.classList.toggle('opt-open'); this._chip(); });
    this._optN = 0;
    // on touch the prompt is a tap target for E
    this.promptEl.addEventListener('pointerdown', (e) => { if (document.body.classList.contains('touch')) { e.preventDefault(); game.input.tap('KeyE', 80); } });

    this.floodVisible = false; this.setuVisible = false;
    this._rays = -1; this._lit = new Array(RAYS).fill(true);
    this._ecg = { x: 0, buf: new Float32Array(132), phase: 0, last: 0, beatAt: 0 };
    this._glitchIn = 6; this._threshold = null; this._gateKey = '';
    this._objText = ''; this._clockText = '';
    this._lastFeed = 0; this._lastDraw = 0;

    const ev = game.events;
    ev.on('message', (m) => this._addMessage(m));
    ev.on('objective:changed', (d) => { if (d && Array.isArray(d.shown)) { this._optN = Math.max(0, d.shown.length - (d.shown.some((o) => !o.optional) ? 1 : 0)); if (!this._optN) this.center.classList.remove('opt-open'); this._chip(); this.objWrap.hidden = !this._objText && !this._optN; } });
    ev.on('setu:story', () => this.showSetu(true));
    ev.on('setu:found', () => this.showSetu(true));
    // The slow darkness drain is a quiet cue (a dim ember), not the red shock of a bite or a fall
    ev.on('health:damage', ({ source }) => {
      if (source === 'darkness') game.screenfx.flash('#5a1a14', 700, 0.12);
      else game.screenfx.flash('#ff3a2a', 380, 0.34);
      this._kick('hurt');
    });
    ev.on('health:heal', () => { game.screenfx.flash('#ffd98a', 420, 0.1); this._kick('bloom'); });
    ev.on('gate:denied', (d) => this._gateDenied(d));
    ev.on('gate:opened', (d) => game.messages.say(d.permit ? 'PERMIT ACCEPTED. The scanner chirps green.' : `BIO-SCAN ${d.min} RAYS: ACCEPTED. The door slides open.`, { kind: 'system', ttl: 4 }));
    game.debug?.addState('hud', () => ({
      raysLit: this._lit.filter(Boolean).length, setuVisible: this.setuVisible, floodVisible: !this.floodEl.hidden, clock: this.timeEl.textContent, objective: this.objEl.textContent,
      prompt: this.promptEl.hidden ? null : this.promptText.textContent, gateCard: this.gateCard.hidden ? null : this.gcReq.textContent, feed: this.feed.children.length,
    }));
    game.debug?.addAction('hudGlitch', () => { game.screenfx.glitch(400); return true; });
    this.setRays(game.player.rays, true);
  }

  _chip() {
    const n = this._optN, open = this.center.classList.contains('opt-open');
    this.optChip.hidden = n === 0;
    this.optChip.textContent = open ? 'hide optional' : `+${n} optional`;
  }

  setFloodVisible(v) { this.floodVisible = !!v; this.floodEl.hidden = !v; }
  showSetu(v) { this.setuVisible = !!v; this.setuEl.hidden = !v; }
  setThreshold(n) {
    if (n === this._threshold) return;
    this._threshold = n;
    if (n == null) { this.mark.setAttribute('opacity', '0'); return; }
    this.mark.setAttribute('transform', `rotate(${(n - 1) * 30})`);
    this.mark.querySelector('text').textContent = String(n);
    this.mark.setAttribute('opacity', '1');
  }

  _kick(cls) {
    const e = this.sunwrap;
    e.classList.remove('hurt', 'bloom'); void e.offsetWidth; e.classList.add(cls);
  }

  setRays(n, instant = false) {
    n = Math.max(0, Math.min(RAYS, n));
    for (let i = 0; i < RAYS; i++) {
      const on = i < n, el = this.rayEls[i];
      if (on === this._lit[i] && !instant) continue;
      this._lit[i] = on;
      el.classList.remove('dying', 'on', 'off', 'gain');
      if (on) { el.classList.add('on'); if (!instant) el.classList.add('gain'); }
      else { el.classList.add(instant ? 'off' : 'dying'); if (!instant) setTimeout(() => { el.classList.remove('dying'); if (!this._lit[i]) el.classList.add('off'); }, 1100); }
    }
    this.count.textContent = String(n);
    this._rays = n;
  }

  _gateDenied(d) {
    this._denyUntil = performance.now() + 1800;
    this.game.messages.say(d.permit ? 'BIO-SCAN: BRIDGE PERMIT REQUIRED. ACCESS DENIED.' : `BIO-SCAN: ${d.min} RAYS REQUIRED. YOU CARRY ${d.rays}. ACCESS DENIED.`, { kind: 'system', ttl: 5 });
    this.game.screenfx.flash('#ff5a3a', 260, 0.14);
    this.gateCard.classList.add('denied'); setTimeout(() => this.gateCard.classList.remove('denied'), 1500);
  }

  /** One stack for everything: a new caption replaces the previous caption, a new PA line replaces the previous PA line, an
   *  identical line just bumps a counter, and the feed never grows past MAX lines (3 on small screens). */
  _addMessage(m) {
    const text = m.kind === 'caption' ? `[ ${m.text} ]` : m.text;
    const exp = performance.now() + m.ttl * 1000;
    const feed = this.feed;
    const same = [...feed.children].reverse().find((c) => !c.classList.contains('gone') && c.dataset.text === text && c.dataset.kind === m.kind);
    if (same) {
      same.dataset.exp = String(exp);
      const n = Number(same.dataset.n || 1) + 1; same.dataset.n = String(n);
      let r = same.querySelector('.rep'); if (!r) { r = document.createElement('span'); r.className = 'rep'; same.appendChild(r); }
      r.textContent = `x${n}`;
      return;
    }
    if (m.kind === 'caption' || m.kind === 'pa') {
      for (const c of [...feed.children]) if (c.dataset.kind === m.kind) this._drop(c);
    }
    const d = document.createElement('div');
    d.className = 'msg ' + m.kind;
    d.textContent = text;
    d.dataset.exp = String(exp); d.dataset.text = text; d.dataset.kind = m.kind;
    feed.appendChild(d);
    requestAnimationFrame(() => d.classList.add('in'));
    const max = window.matchMedia('(max-width: 700px), (max-height: 520px)').matches ? 3 : 4;
    const live = [...feed.children].filter((c) => !c.classList.contains('gone'));
    // when full, drop the oldest line that is not a story line, else the oldest
    for (let i = 0; live.length - i > max; i++) {
      const victim = live.find((c) => c !== d && c.dataset.kind !== 'story') ?? live[0];
      this._drop(victim); live.splice(live.indexOf(victim), 1); i--;
    }
  }

  _drop(el) { if (el.classList.contains('gone')) return; el.classList.add('gone'); setTimeout(() => el.remove(), 600); }

  _nearestGate() {
    const g = this.game, p = g.player, gates = g.world.gates ?? [];
    let best = null, bd = 10;
    for (const gt of gates) {
      const dx = p.pos.x - gt.x, dz = p.pos.z - gt.z, dy = p.pos.y - gt.y;
      if (dy < -1.5 || dy > 3.5) continue;
      const side = dx * gt.v[0] + dz * gt.v[1];
      if (side >= 0.5) continue;                 // inside / past the door: nothing to show
      const d = Math.hypot(dx, dz);
      if (d < bd) { bd = d; best = gt; }
    }
    return best;
  }

  _drawEcg(dt, game) {
    const s = game.setu, c = this.ecg, e = this._ecg, W = 132, H = 34;
    const now = performance.now();
    if (now - this._lastDraw < 33) return;
    const step = Math.min(0.1, (now - (this._lastDraw || now - 33)) / 1000);
    this._lastDraw = now;
    const h = s.health / 100;
    const bpm = s.dead ? 0 : 58 + (1 - h) * 110;
    const px = Math.max(1, Math.round(step * 62));        // sample columns advanced
    const buf = e.buf;
    for (let k = 0; k < px; k++) {
      // shift left
      buf.copyWithin(0, 1);
      e.phase += (bpm / 60) * (1 / 62);
      if (e.phase >= 1) e.phase -= 1;
      const f = e.phase, amp = s.dead ? 0 : 0.35 + 0.65 * h;
      let y = 0;
      const g = (x, m, w) => Math.exp(-((x - m) * (x - m)) / (2 * w * w));
      if (!s.dead) {
        y += 0.12 * g(f, 0.12, 0.03);                    // P
        y -= 0.16 * g(f, 0.2, 0.008);                    // Q
        y += 1.0 * g(f, 0.235, 0.01);                    // R
        y -= 0.3 * g(f, 0.265, 0.01);                    // S
        y += 0.22 * g(f, 0.43, 0.05);                    // T
        y *= amp;
        y += (Math.random() - 0.5) * (0.02 + (1 - h) * 0.12);   // noisy and ragged as breath fails
        if (h < 0.25 && Math.random() < 0.04) y += (Math.random() - 0.5) * 0.4;
      }
      buf[buf.length - 1] = y;
    }
    const low = h < 0.25;
    const mid = H * 0.62, sc = H * 0.5, n = buf.length;
    let d = '';
    for (let i = 0; i < n; i++) d += (i ? 'L' : 'M') + ((i / (n - 1)) * W).toFixed(1) + ' ' + (mid - buf[i] * sc).toFixed(2);
    this.ecgLine.setAttribute('d', d);
    this.ecgDot.setAttribute('cy', (mid - buf[n - 1] * sc).toFixed(2));
    c.classList.toggle('low', low);
  }

  update(dt, game) {
    const p = game.player, now = performance.now();
    // ---- rays
    if (p.rays !== this._rays) this.setRays(p.rays);
    const hp = game.health;
    const st = hp ? hp.status : 'safe';
    let status = '';
    if (st === 'healing') status = (game.world.sunShafts?.intensity >= 0.3 ? 'in sunlight, healing' : 'lamp light, healing slowly');
    else if (st === 'draining') status = p.level === 'U' ? 'the dark is taking it' : 'in shadow';
    else if (st === 'dead') status = '';
    if (status !== this._status) { this._status = status; this.status.textContent = status; this.status.dataset.s = st; }
    const lowLevel = p.rays <= 1 ? 1 : p.rays === 2 ? 0.75 : p.rays === 3 ? 0.45 : p.rays === 4 ? 0.2 : 0;
    game.screenfx.setLowHealth(hp && hp.dead ? 1 : lowLevel);
    if (lowLevel >= 0.7) {
      this._glitchIn -= dt;
      if (this._glitchIn <= 0) { this._glitchIn = 4 + Math.random() * 5; game.screenfx.glitch(260); }
    }
    this.sun.classList.toggle('low', lowLevel >= 0.45);

    // ---- cash
    const ru = game.wallet ? game.wallet.rupees : null;
    if (ru !== this._rupees) { this._rupees = ru; this.walletEl.hidden = ru == null; this.walletB.textContent = '\u20b9' + (ru ?? 0); }

    // ---- clock
    const c = game.clock;
    const hhmm = c.hhmm;
    if (hhmm !== this._clockText) { this._clockText = hhmm; this.timeEl.textContent = hhmm; this.dayEl.textContent = c.day; }
    const showFlood = this.floodVisible || !!game.flags.breachKnown;
    if (showFlood !== !this.floodEl.hidden) this.floodEl.hidden = !showFlood;
    if (showFlood) { const t = c.fmtDuration(c.hoursLeft); if (t !== this._flood) { this._flood = t; this.floodB.textContent = t; } }

    // ---- Setu
    const s = game.setu;
    if (s && this.setuVisible) {
      const hv = Math.round(s.health);
      if (hv !== this._sh) {
        this._sh = hv; this.breathN.textContent = String(hv); this.breathBar.style.width = hv + '%';
        this.setuEl.classList.toggle('low', hv < 25);
      }
      this._drawEcg(dt, game);
    }

    // ---- objective
    const ot = game.objective ? game.objective.text : '';
    if (ot !== this._objText) { this._objText = ot; this.objEl.textContent = ot; this.objWrap.classList.toggle('empty', !ot); this.objWrap.hidden = !ot && !this._optN; this.objWrap.classList.remove('flip'); void this.objWrap.offsetWidth; this.objWrap.classList.add('flip'); }

    // ---- where the objective is: "Atal Setu · 240 m NE · go up to L3", a few times a second, the DOM touched only when the words change
    this._whereT -= dt;
    if (this._whereT <= 0) {
      this._whereT = 0.25;
      const t = game.map?.target?.(), w = t && ot ? [t.label, t.dist < 5 ? (t.change ? '' : 'here') : fmtDist(t.dist) + ' ' + t.dirShort, t.hint].filter(Boolean).join(' \u00b7 ') : '';
      if (w !== this._where) { this._where = w; this.whereEl.textContent = w; this.whereEl.hidden = !w; }
    }

    // ---- gate card and sun threshold marker
    const gt = game.modal ? null : this._nearestGate();
    const key = gt ? gt.id + '|' + p.rays + '|' + !!(gt.permit && game.flags[gt.permit]) : '';
    if (key !== this._gateKey) {
      this._gateKey = key;
      if (!gt) { this.gateCard.hidden = true; this.setThreshold(null); }
      else {
        const ok = gt.permit ? !!game.flags[gt.permit] : p.rays >= gt.min;
        this.gateCard.hidden = false; this.gateCard.classList.toggle('ok', ok);
        this.gcFig.innerHTML = gt.permit ? PERMIT : STICK;
        this.gcReq.textContent = gt.permit ? 'BRIDGE PERMIT' : `${gt.min} RAYS`;
        this.gcState.textContent = gt.permit ? (ok ? 'permit on file: entry permitted' : 'no permit on file: entry denied') : (ok ? `you carry ${p.rays}: entry permitted` : `you carry ${p.rays}: entry denied`);
        this.setThreshold(gt.permit ? null : gt.min);
      }
    }

    // ---- interaction prompt
    const f = game.interactables?.focus;
    const ptxt = !game.modal && f ? f.promptText : '';
    if (ptxt !== this._prompt) { this._prompt = ptxt; this.promptEl.hidden = !ptxt; this.promptText.textContent = ptxt; }
    this.crosshair.style.display = game.modal ? 'none' : '';
    const modal = !!game.modal; if (modal !== this._modal) { this._modal = modal; document.body.classList.toggle('modal-open', modal); }   // cards and dialogues dim the feed

    // ---- feed expiry (real time)
    if (now - this._lastFeed > 250) {
      this._lastFeed = now;
      for (const m of [...this.feed.children]) {
        if (!m.classList.contains('gone') && now > Number(m.dataset.exp)) { m.classList.add('gone'); setTimeout(() => m.remove(), 700); }
      }
    }
  }
}
