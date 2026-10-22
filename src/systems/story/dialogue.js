// Conversation cards (PLAN 1b cast, 3b style). Built on the same look as Phase 3's dialog but made for talking:
// a speaker with a safety-card pictogram portrait, lines that type out one at a time, then choices.
//
//   game.dialogue.open({
//     speaker: 'Tara Shahjehan',            // the name on the card
//     role: 'ACTRESS',                      // small tag above the name
//     scrawl: 'sunglasses at dawn',         // optional margin scribble next to the name
//     portrait: 'woman',                    // pictogram: woman | man | child | big | old | doctor | nurse | guard | worker | boy | girl
//     portraitColor: '#7fe0d8',             // pictogram colour (also the card's accent)
//     pos: {x,y,z},                         // optional: where the voice comes from (a sound ripple is emitted per line)
//     lines: [ 'plain speech', { narr: 'Mithi hears ...' }, { who: 'Mithi', text: '...' }, { text: '...', speaker: 'Jeetu' } ],
//     choices: [ { label: 'Give blood', note: '-2 rays', hint: '1', enabled: true, onChoose: (dlg) => spec | void } ],
//     onClose: (info) => {},                // after the card is gone (also when Esc closes it)
//     closable: true,                       // Esc closes it (default true)
//   });
//
// Keys: 1/2/3 choose, E / Enter / Space continue (or choose the highlighted option), Up/Down move the highlight, Esc closes.
// Mouse / touch: click a choice (large targets), click the card or "continue" to advance. While a card is open the
// pointer lock is RELEASED so the mouse works (and given back when the last card closes); `game.modal` is true.
// `onChoose` may return another spec (the next card of the conversation, same speaker unless it says otherwise) or open
// its own; anything else closes the card.
//
// API: open(spec), close(), advance(), choose(i), isOpen, current, holdPointer(bool) (Phase 3's dialog shares the lock handling).
// Events: dialogue:open {speaker}, dialogue:line {speaker, index, text}, dialogue:choose {speaker, index, label}, dialogue:close {speaker}.
// Debug: state().dialogue, do('dialogueChoose', i), do('dialogueAdvance').
import { installStoryCss } from './story-css.js';

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Safety-card stick figures, drawn in the portrait colour. 46 x 66. */
const FIG = {
  man: '<circle cx="23" cy="10" r="7"/><path d="M23 17 V40 M23 22 L10 34 M23 22 L36 34 M23 40 L13 62 M23 40 L33 62"/>',
  woman: '<circle cx="23" cy="10" r="7"/><path d="M23 17 V30 M23 22 L11 33 M23 22 L35 33 M23 28 L10 56 H36 Z M17 56 V63 M29 56 V63" class="dress"/><path class="fill" d="M23 28 L10 56 H36 Z"/>',
  child: '<circle cx="23" cy="24" r="7.5"/><path d="M23 31.5 V48 M23 35 L13 44 M23 35 L33 44 M23 48 L16 63 M23 48 L30 63"/>',
  boy: '<circle cx="23" cy="24" r="7.5"/><path d="M23 31.5 V48 M23 35 L12 40 M23 35 L34 44 M23 48 L16 63 M23 48 L30 63"/><path d="M12 40 L8 33" />',
  girl: '<circle cx="23" cy="24" r="7.5"/><path d="M23 31.5 V40 M23 35 L13 44 M23 35 L33 44 M23 39 L14 56 H32 Z M18 56 V63 M28 56 V63"/><path class="fill" d="M23 39 L14 56 H32 Z"/><circle cx="23" cy="15" r="3" />',
  big: '<circle cx="23" cy="9" r="7.5"/><path d="M23 16.5 V42 M23 21 L5 34 M23 21 L41 34 M23 42 L12 62 M23 42 L34 62"/><ellipse class="fill" cx="23" cy="31" rx="14" ry="13"/>',
  old: '<circle cx="26" cy="12" r="6.5"/><path d="M26 18.5 Q22 30 24 40 M25 23 L12 33 M25 23 L37 36 M24 40 L16 62 M24 40 L31 62 M37 36 L41 62"/>',
  doctor: '<circle cx="23" cy="10" r="7"/><path d="M23 17 V42 M23 22 L10 36 M23 22 L36 36 M23 42 L14 62 M23 42 L32 62"/><path class="fill" d="M14 22 H32 L35 52 H11 Z"/><path d="M19 22 V32 M27 22 V32"/>',
  nurse: '<circle cx="23" cy="10" r="7"/><path d="M17 4 H29 M23 17 V32 M23 22 L11 33 M23 22 L35 33 M23 30 L11 56 H35 Z"/><path d="M23 34 V42 M19 38 H27"/>',
  guard: '<circle cx="23" cy="11" r="6.5"/><path d="M14 6 H32 M23 17.5 V40 M23 22 L10 34 M23 22 L36 34 M23 40 L14 62 M23 40 L32 62"/><path class="fill" d="M15 22 H31 V40 H15 Z"/>',
  worker: '<circle cx="23" cy="11" r="6.5"/><path d="M15 7 Q23 -1 31 7 Z M23 17.5 V40 M23 22 L10 34 M23 22 L36 34 M23 40 L14 62 M23 40 L32 62"/>',
};
export function pictogram(kind = 'man', color = '#ffdf9a') {
  return `<svg class="cv-fig" viewBox="0 0 46 66" style="--cvc:${color}">${FIG[kind] ?? FIG.man}</svg>`;
}

export class DialogueSystem {
  init(game) {
    installStoryCss();
    this.game = game;
    game.dialogue = this;
    this.current = null;
    this.lineIdx = 0; this.typed = 0; this.typing = false; this.showChoices = false; this.sel = 0;
    this.cps = 80;                       // typed characters per second (tests can set game.dialogue.cps = 1e6)
    this._pointerHeld = 0; this._relock = false; this._timer = null; this.opened = 0;
    const el = this.el = document.createElement('div');
    el.id = 'convo'; el.hidden = true;
    document.body.appendChild(el);
    window.addEventListener('keydown', (e) => this._key(e), true);
    game.debug?.addAction('dialogueChoose', (g, i = 0) => { this.choose(i); return this.snapshot(); });
    game.debug?.addAction('dialogueAdvance', () => { this.advance(); return this.snapshot(); });
    game.debug?.addAction('dialogueSkip', () => { this.skip(); return this.snapshot(); });
    game.debug?.addState('dialogue6a', () => this.snapshot());
  }

  get isOpen() { return !!this.current; }

  // ------------------------------------------------------------------------------------------ pointer lock
  /** Release the pointer lock while any card/dialog is open so the mouse can click; give it back after. */
  holdPointer(on) {
    const g = this.game;
    if (on) {
      if (this._pointerHeld++ > 0) return;
      this._relock = !!g.input.locked;
      try { if (document.pointerLockElement) document.exitPointerLock(); } catch { /* not available */ }
    } else {
      if (this._pointerHeld === 0 || --this._pointerHeld > 0) return;
      if (this._relock) { this._relock = false; try { g.input.requestLock(); } catch { /* keyboard play still works */ } }
    }
  }

  // ------------------------------------------------------------------------------------------ opening
  open(spec) {
    const g = this.game;
    const prev = this.current;
    if (prev) this._teardown(true);
    const s = this.current = {
      speaker: 'Someone', role: '', scrawl: '', portrait: 'man', portraitColor: '#ffdf9a', pos: null, lines: [], choices: [], closable: true,
      ...spec,
    };
    s.lines = (s.lines ?? []).map((l) => (typeof l === 'string' ? { text: l } : { ...l }));
    if (!s.lines.length && !s.choices.length) s.lines = [{ text: '...' }];
    s.choices = (s.choices ?? []).map((c, i) => ({ hint: String(i + 1), enabled: true, ...c }));
    this.lineIdx = 0; this.sel = Math.max(0, s.choices.findIndex((c) => c.enabled !== false));
    this.showChoices = false;
    if (!prev) { g.modal = true; this.holdPointer(true); g.events.emit('dialogue:open', { speaker: s.speaker }); }
    this.opened++;
    this._render();
    this._startLine();
  }

  _lineOf() { return this.current.lines[this.lineIdx]; }

  _startLine() {
    const s = this.current; if (!s) return;
    const l = this._lineOf();
    if (!l) { this._finishLines(); return; }
    this.typed = 0; this.typing = true;
    this._paint();
    const g = this.game;
    g.events.emit('dialogue:line', { speaker: l.speaker ?? s.speaker, index: this.lineIdx, text: l.text ?? l.narr ?? '' });
    if (s.pos && !l.narr && !l.who) g.events.emit('sound:emit', { x: s.pos.x, y: (s.pos.y ?? 0) + 1.2, z: s.pos.z, kind: 'mutter', loudness: 0.34 });
    clearInterval(this._timer);
    this._timer = setInterval(() => {
      const text = this._text(l);
      this.typed = Math.min(text.length, this.typed + Math.max(1, Math.round(this.cps * 0.03)));
      this._paintText();
      if (this.typed >= text.length) { this.typing = false; clearInterval(this._timer); this._afterTyped(); }
    }, 30);
  }

  _text(l) { return l.narr ?? l.text ?? ''; }

  _afterTyped() {
    const s = this.current; if (!s) return;
    if (this.lineIdx >= s.lines.length - 1) this._finishLines();
    this._paint();
  }

  _finishLines() {
    const s = this.current; if (!s) return;
    this.showChoices = true; this._shownAt = performance.now();
    this._paint();
  }

  /** Finish the typing of the current line at once (or, if done, go to the next line / pick the highlighted choice). */
  advance() {
    const s = this.current; if (!s) return;
    if (this.typing) { this.typed = 1e9; this._paintText(); this.typing = false; clearInterval(this._timer); this._afterTyped(); return; }
    if (this.lineIdx < s.lines.length - 1) { this.lineIdx++; this._startLine(); return; }
    if (!s.choices.length) { this.close(); return; }
    if (performance.now() - (this._shownAt ?? 0) < 350) return;      // a double-tap of E must not pick an answer unseen
    if (this.sel >= 0) this.choose(this.sel);
  }

  /** Test aid: jump to the last line with the choices showing. */
  skip() {
    const s = this.current; if (!s) return;
    clearInterval(this._timer); this.typing = false;
    this.lineIdx = Math.max(0, s.lines.length - 1); this.typed = 1e9; this.showChoices = true;
    this._paint();
  }

  choose(i) {
    const s = this.current; if (!s) return;
    if (this.typing || this.lineIdx < s.lines.length - 1) {            // choosing early reads the rest of the card instantly
      if (!s.choices.length) return;
      this.skip();
    }
    const c = s.choices[i];
    if (!c) return;
    if (c.enabled === false) { this.game.messages?.say(c.why ?? 'Not now.', { kind: 'hint', ttl: 3 }); return; }
    this.game.events.emit('dialogue:choose', { speaker: s.speaker, index: i, label: c.label });
    const keep = this.current;
    let next;
    try { next = c.onChoose?.(this); } catch (e) { console.error(e); }
    if (this.current !== keep) return;                 // onChoose opened (or closed) something itself
    if (next && typeof next === 'object') {
      this.open({ speaker: s.speaker, role: s.role, scrawl: '', portrait: s.portrait, portraitColor: s.portraitColor, pos: s.pos, ...next });
      return;
    }
    this.close();
  }

  close() {
    const s = this.current; if (!s) return;
    this._teardown(false);
    try { s.onClose?.({ speaker: s.speaker }); } catch (e) { console.error(e); }
  }

  _teardown(silent) {
    clearInterval(this._timer);
    this.current = null; this.typing = false; this.showChoices = false;
    if (silent) return;
    this.el.hidden = true; this.el.innerHTML = '';
    this.game.modal = false;
    this.holdPointer(false);
    this.game.events.emit('dialogue:close', {});
  }

  // ------------------------------------------------------------------------------------------ keys
  _key(e) {
    const s = this.current;
    if (!s || e.repeat) return;
    const k = e.code;
    const stop = () => { e.preventDefault(); e.stopPropagation(); };
    const digit = /^(Digit|Numpad)([1-9])$/.exec(k);
    if (digit) {
      const i = Number(digit[2]) - 1;
      if (this.showChoices || this.lineIdx >= s.lines.length - 1) { if (s.choices[i]) { stop(); this.choose(i); } }
      else { stop(); this.advance(); }
      return;
    }
    if (k === 'KeyE' || k === 'Enter' || k === 'NumpadEnter' || k === 'Space') { stop(); this.advance(); return; }
    if ((k === 'ArrowDown' || k === 'KeyS') && this.showChoices && s.choices.length) { stop(); this._move(1); return; }
    if ((k === 'ArrowUp' || k === 'KeyW') && this.showChoices && s.choices.length) { stop(); this._move(-1); return; }
    if (k === 'Escape' && s.closable !== false) { stop(); this.close(); }
  }

  _move(d) {
    const n = this.current.choices.length;
    for (let j = 0; j < n; j++) {
      this.sel = (this.sel + d + n) % n;
      if (this.current.choices[this.sel].enabled !== false) break;
    }
    this._paintChoices();
  }

  // ------------------------------------------------------------------------------------------ drawing
  _render() {
    const s = this.current;
    this.el.hidden = false;
    this.el.style.setProperty('--cvc', s.portraitColor);
    this.el.innerHTML =
      `<div class="cv-card" style="--cvc:${esc(s.portraitColor)}"><div class="cv-top">` +
      `<div class="cv-portrait">${pictogram(s.portrait, s.portraitColor)}</div>` +
      `<div class="cv-main"><div class="cv-head">${s.role ? `<span class="cv-tag">${esc(s.role)}</span>` : ''}<h2 class="cv-name">${esc(s.speaker)}</h2>${s.scrawl ? `<span class="cv-scrawl">${esc(s.scrawl)}</span>` : ''}</div>` +
      `<p class="cv-text"></p></div></div>` +
      `<div class="cv-choices"></div>` +
      `<div class="cv-foot"><span class="cv-count"></span><span class="cv-next" role="button"><kbd>E</kbd><span class="cv-next-t">continue</span></span></div></div>`;
    const card = this.el.querySelector('.cv-card');
    this.textEl = this.el.querySelector('.cv-text');
    this.choicesEl = this.el.querySelector('.cv-choices');
    this.countEl = this.el.querySelector('.cv-count');
    this.nextEl = this.el.querySelector('.cv-next');
    this.nextT = this.el.querySelector('.cv-next-t');
    this.nameEl = this.el.querySelector('.cv-name');
    card.addEventListener('click', (ev) => { if (ev.target.closest('.cv-choice')) return; this.advance(); });
    this.nextEl.addEventListener('click', (ev) => { ev.stopPropagation(); this.advance(); });
  }

  _paintText() {
    const s = this.current; if (!s || !this.textEl) return;
    const l = this._lineOf(); if (!l) return;
    const text = this._text(l);
    this.textEl.innerHTML = esc(text.slice(0, this.typed)) + (this.typed < text.length ? '<i class="cv-cursor"></i>' : '');
  }

  _paint() {
    const s = this.current; if (!s || !this.textEl) return;
    const l = this._lineOf() ?? { text: '' };
    this.textEl.className = 'cv-text' + (l.narr ? ' narr' : '') + (l.who === 'Mithi' ? ' mithi' : '');
    if (l.speaker || l.who) { this.nameEl.textContent = l.speaker ?? l.who; } else this.nameEl.textContent = s.speaker;
    this._paintText();
    const n = s.lines.length;
    this.countEl.textContent = n > 1 ? `${Math.min(this.lineIdx + 1, n)} / ${n}` : '';
    const last = this.lineIdx >= n - 1;
    const choicesNow = this.showChoices && s.choices.length > 0;
    this.nextEl.style.display = choicesNow ? 'none' : '';
    this.nextT.textContent = last && !s.choices.length ? 'close' : 'continue';
    this._paintChoices();
  }

  _paintChoices() {
    const s = this.current; if (!s) return;
    if (!(this.showChoices && s.choices.length)) { this.choicesEl.innerHTML = ''; return; }
    this.choicesEl.innerHTML = s.choices.map((c, i) =>
      `<button type="button" class="cv-choice${i === this.sel ? ' on' : ''}${c.enabled === false ? ' off' : ''}" data-i="${i}"><kbd>${esc(c.hint)}</kbd><span class="lab">${esc(c.label)}</span>${c.note ? `<span class="note">${esc(c.note)}</span>` : ''}</button>`).join('');
    for (const b of this.choicesEl.querySelectorAll('button')) {
      b.addEventListener('click', (ev) => { ev.stopPropagation(); this.choose(Number(b.dataset.i)); });
      b.addEventListener('pointerenter', () => { this.sel = Number(b.dataset.i); for (const o of this.choicesEl.children) o.classList.toggle('on', o === b); });
    }
  }

  snapshot() {
    const s = this.current;
    if (!s) return null;
    const l = this._lineOf();
    return { speaker: s.speaker, role: s.role, line: l ? this._text(l) : null, lineIndex: this.lineIdx, lines: s.lines.length, typing: this.typing, choices: s.choices.map((c) => c.label), showChoices: this.showChoices, opened: this.opened };
  }
}
