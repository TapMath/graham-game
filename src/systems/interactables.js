// Registry of things the player can use with E. Any system can add one; the HUD (Phase 3) reads
// `game.interactables.focus` to show a prompt, and E presses are routed here.
//
//   game.interactables.add({
//     id: 'lift-g1:bottom',
//     pos: {x, y, z} | [x, y, z],     // y = floor height of the spot
//     radius: 3,                      // horizontal reach in metres
//     height: 2.5,                    // vertical reach above `pos.y` (feet may be 1 m below it)
//     prompt: 'Call lift' | (game, item) => string,
//     enabled: true | (game, item) => bool,
//     onInteract: (game, item) => {},
//   });
//   game.interactables.remove(id); .nearest(pos?) ; .focus ; .list()
//
// Events: `interactable:focus {id, prompt}` when the nearest in-range item changes (id null when
// nothing is in range), `interactable:used {id}` after an E press was routed to an item.
export class InteractableSystem {
  init(game) {
    this.game = game;
    this.items = new Map();
    this.focus = null;       // nearest in-range item (or null); item.promptText is its current prompt
    game.interactables = this;
    game.events.on('player:interact', () => this.interact());
  }

  add(def) {
    const p = def.pos;
    const item = {
      radius: 2.5, height: 2.5, enabled: true, prompt: 'Use', ...def,
      pos: Array.isArray(p) ? { x: p[0], y: p[1], z: p[2] } : { x: p.x, y: p.y ?? 0, z: p.z },
      promptText: '',
    };
    this.items.set(item.id, item);
    return item;
  }

  remove(id) { if (this.focus?.id === id) this.focus = null; return this.items.delete(id); }
  get(id) { return this.items.get(id); }
  list() { return [...this.items.values()]; }

  isEnabled(it) { return typeof it.enabled === 'function' ? !!it.enabled(this.game, it) : !!it.enabled; }
  textOf(it) { return typeof it.prompt === 'function' ? it.prompt(this.game, it) : it.prompt; }

  /** Nearest enabled item in range of `pos` (default: the player's feet), or null. */
  nearest(pos = this.game.player?.pos) {
    if (!pos) return null;
    let best = null, bd = Infinity;
    for (const it of this.items.values()) {
      const dx = pos.x - it.pos.x, dz = pos.z - it.pos.z, dy = pos.y - it.pos.y;
      if (dy < -1.2 || dy > it.height) continue;
      const d = Math.hypot(dx, dz);
      if (d > it.radius || d >= bd || !this.isEnabled(it)) continue;
      best = it; bd = d;
    }
    return best;
  }

  /** Route an E press to the nearest item. Returns true if something handled it. */
  interact() {
    const it = this.nearest();
    if (!it) return false;
    it.onInteract?.(this.game, it);
    this.game.events.emit('interactable:used', { id: it.id });
    return true;
  }

  update() {
    const it = this.nearest();
    if (it) it.promptText = this.textOf(it);
    if (it !== this.focus) {
      this.focus = it;
      this.game.events.emit('interactable:focus', { id: it ? it.id : null, prompt: it ? it.promptText : '' });
    }
  }
}
