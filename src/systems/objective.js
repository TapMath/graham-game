// The objective line shown on the HUD. A default chain follows the run's flags; Phase 6 (the story layer)
// pushes the finer steps with `game.objective.set(text)`.
//
//   game.objective.text              the line the HUD shows
//   game.objective.set(text, id?)    override the default chain until clear(id) (later sets win)
//   game.objective.clear(id?)        drop one override (or all)
// Default chain: find Setu -> take him to the Sunrise Bridge (warn the city on the way, once the breach is known).
export class ObjectiveSystem {
  init(game) {
    this.game = game;
    game.objective = this;
    this.overrides = [];
    this.text = this.defaultText();
    game.debug?.addState('objective', () => this.text);
  }

  set(text, id = 'main') {
    this.overrides = this.overrides.filter((o) => o.id !== id);
    this.overrides.push({ id, text });
    this._refresh();
  }
  clear(id) { this.overrides = id ? this.overrides.filter((o) => o.id !== id) : []; this._refresh(); }

  defaultText() {
    const f = this.game.flags;
    if (this.game.setu?.dead) return 'Setu is gone.';
    if (!f.setuFollowing) return 'Find Setu before his breath runs out.';
    if (f.breachKnown && !f.cityWarned) return 'Warn the authorities at the MMRDA Control Tower in Wadala, then take Setu to the Atal Setu at Sewri.';
    return 'Take Setu to the Atal Setu at Sewri, on the east edge. He has never seen a sunrise.';
  }

  _refresh() {
    const t = this.overrides.length ? this.overrides[this.overrides.length - 1].text : this.defaultText();
    if (t !== this.text) { this.text = t; this.game.events.emit('objective:changed', { text: t }); }
  }

  update() { this._refresh(); }
}
