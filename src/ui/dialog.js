// A small modal dialog (vendors now; Phase 6 uses it for cast conversations). While it is open
// `game.modal` is true: the player stands still, the clock and health drain pause, E is ignored.
//
//   game.dialog.open({
//     title: 'Tree Alley', tag: 'D-SHOT', quote: 'Clean needle, boiled twice.',
//     rows: [['Restores', '+4 rays'], ['Costs', '1h 30m of your day']],
//     choices: [{ id: 'accept', label: 'Take the shot', keys: ['KeyY', 'Enter', 'Digit1'], hint: 'Y' },
//               { id: 'decline', label: 'Walk away', keys: ['KeyN', 'Escape', 'Digit2'], hint: 'N' }],
//     onChoose: (id) => {},
//   });
//   game.dialog.choose(id) / close() / isOpen
// E is deliberately not an answer key: the same key press opened the dialog and would answer it at once.
export class DialogSystem {
  init(game) {
    this.game = game;
    game.dialog = this;
    this.current = null;
    const el = this.el = document.createElement('div');
    el.id = 'dialog'; el.hidden = true;
    document.body.appendChild(el);
    window.addEventListener('keydown', (e) => {
      if (!this.current || e.repeat) return;
      for (const c of this.current.choices) {
        if (c.keys && c.keys.includes(e.code)) { e.preventDefault(); e.stopPropagation(); this.choose(c.id); return; }
      }
    }, true);
    game.debug?.addAction('dialogChoose', (g, id) => { this.choose(id); return true; });
    game.debug?.addState('dialog', () => (this.current ? { title: this.current.title, choices: this.current.choices.map((c) => c.id) } : null));
  }

  get isOpen() { return !!this.current; }

  open(cfg) {
    this.close(true);
    this.current = cfg;
    const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    const rows = (cfg.rows ?? []).map(([k, v]) => `<div class="dl-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`).join('');
    const btns = cfg.choices.map((c) => `<button type="button" data-id="${c.id}" class="dl-btn dl-${c.id}"><kbd>${esc(c.hint ?? '')}</kbd>${esc(c.label)}</button>`).join('');
    this.el.innerHTML =
      `<div class="dl-card"><div class="dl-head"><span class="dl-tag">${esc(cfg.tag ?? '')}</span><h2>${esc(cfg.title ?? '')}</h2></div>` +
      (cfg.quote ? `<p class="dl-quote">${esc(cfg.quote)}</p>` : '') + `<div class="dl-rows">${rows}</div>` + (cfg.note ? `<p class="dl-note">${esc(cfg.note)}</p>` : '') +
      `<div class="dl-btns">${btns}</div></div>`;
    for (const b of this.el.querySelectorAll('button')) b.addEventListener('click', () => this.choose(b.dataset.id));
    this.el.hidden = false;
    this.game.modal = true;
    this.game.events.emit('dialog:open', { title: cfg.title });
  }

  choose(id) {
    const cur = this.current;
    if (!cur) return;
    this.close();
    cur.onChoose?.(id);
  }

  close(silent = false) {
    if (!this.current && !silent) return;
    this.current = null;
    this.el.hidden = true;
    if (!silent) { this.game.modal = false; this.game.events.emit('dialog:close', {}); }
  }
}
