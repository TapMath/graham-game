// The objective board (PLAN 1b "Game flow"): one primary objective and up to two optional ones.
//
//   game.objectives.set(id, text, { optional:false })   add/replace an objective by hand (6b: 'warn', the bridge...). Manual primaries win over the chain.
//   game.objectives.complete(id)                         mark done (events: objective:changed {id, done:true, text, primary, optional})
//   game.objectives.define({ id, optional, order, when(game), done(game), text(game)|string })   a rule-driven entry (the chain, chain.js)
//   game.objectives.list() -> [{id, text, optional, done}]   what is currently shown (primary first)
//   game.objectives.primary / optional                    the shown entries; .doneIds the completed ones
//   events: objective:changed {id, text, done, primary, optional, shown:[...]}   (Phase 3's own objective:changed {text} still fires too)
//
// Rule-driven entries re-evaluate twice a second, so every objective can be skipped or bypassed: `done(game)` is checked
// whatever way the player got there. The primary's text goes to Phase 3's objective line (`game.objective.set(text, 'story')`);
// optionals are drawn in a quiet list under it. With no primary the default chain of Phase 3 shows through.
import { installStoryCss } from './story-css.js';

export class ObjectiveBoard {
  init(game) {
    installStoryCss();
    this.game = game;
    game.objectives = this;
    this.defs = [];                 // rule-driven (chain)
    this.manual = new Map();        // id -> {id, text, optional, seq}
    this._seq = 0;
    this.doneIds = new Set();
    this.primary = null; this.optional = [];
    this._t = 0; this._key = '';
    const wrap = document.querySelector('#hud .hud-center') ?? document.getElementById('hud');
    this.root = document.createElement('div');
    this.root.className = 'hud-optional';
    wrap.appendChild(this.root);
    game.debug?.addState('objectives', () => ({ primary: this.primary && { id: this.primary.id, text: this.primary.text }, optional: this.optional.map((o) => ({ id: o.id, text: o.text })), done: [...this.doneIds] }));
    game.debug?.addAction('objective', (g, id) => {
      if (id) this.complete(id);
      this.refresh(true);
      return { primary: this.primary?.id ?? null, optional: this.optional.map((o) => o.id), done: [...this.doneIds] };
    });
  }

  define(def) { this.defs.push({ optional: false, order: this.defs.length, ...def }); this.defs.sort((a, b) => a.order - b.order); }

  set(id, text, { optional = false } = {}) {
    this.doneIds.delete(id);
    this.manual.set(id, { id, text, optional, manual: true, seq: ++this._seq });
    this.refresh(true);
  }

  complete(id) {
    if (this.doneIds.has(id)) return false;
    const m = this.manual.get(id), d = this.defs.find((x) => x.id === id);
    if (!m && !d) return false;
    this.doneIds.add(id);
    if (m) this.manual.delete(id);
    const text = m ? m.text : this._text(d);
    this.game.events.emit('objective:changed', { id, text, done: true, primary: !(m ?? d).optional, optional: !!(m ?? d).optional });
    this.refresh(true);
    return true;
  }

  isDone(id) { return this.doneIds.has(id); }
  _text(d) { return typeof d.text === 'function' ? d.text(this.game) : d.text; }

  list() { return [this.primary, ...this.optional].filter(Boolean).map((o) => ({ id: o.id, text: o.text, optional: !!o.optional, done: false })); }

  refresh(force = false) {
    const g = this.game;
    // 1. auto-complete rule entries whose goal was reached some other way
    for (const d of this.defs) {
      if (this.doneIds.has(d.id)) continue;
      let ok = false;
      try { ok = !!d.done?.(g); } catch { ok = false; }
      if (ok) this.complete(d.id);
    }
    // 2. choose what to show
    const active = [];
    for (const d of this.defs) {
      if (this.doneIds.has(d.id)) continue;
      let on = false;
      try { on = !!(d.when ? d.when(g) : true); } catch { on = false; }
      if (on) active.push({ id: d.id, text: this._text(d), optional: !!d.optional, order: d.order });
    }
    const man = [...this.manual.values()].sort((a, b) => b.seq - a.seq);
    const primary = man.find((m) => !m.optional) ?? active.find((a) => !a.optional) ?? null;
    const optional = [...man.filter((m) => m.optional), ...active.filter((a) => a.optional)].slice(0, 2);
    const key = JSON.stringify([primary && [primary.id, primary.text], optional.map((o) => [o.id, o.text])]);
    if (key === this._key && !force) return;
    const prevIds = new Set([this.primary?.id, ...this.optional.map((o) => o.id)]);
    this._key = key; this.primary = primary; this.optional = optional;
    // Phase 3's objective line shows the primary; with none, its own default chain shows through
    if (primary) g.objective?.set(primary.text, 'story'); else g.objective?.clear('story');
    this._draw(prevIds);
    g.events.emit('objective:changed', { id: primary?.id ?? null, text: primary?.text ?? g.objective?.text ?? '', done: false, primary: true, optional: false, shown: this.list() });
  }

  _draw(prevIds) {
    this.root.innerHTML = this.optional.map((o) => `<div class="op${prevIds.has(o.id) ? '' : ' new'}"><b>optional</b>${o.text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</div>`).join('');
  }

  update(dt) {
    this._t -= dt;
    if (this._t > 0) return;
    this._t = 0.4;
    this.refresh();
  }
}
