// The inventory (PLAN 1b): the few things Mithi carries, shown as a compact row of pictogram icons on the HUD.
//
//   game.items.has(id) / add(id, opts) / remove(id)      add returns true when it was new; events item:added / item:removed {id}
//   game.items.list()                                     ids in pick-up order
//   game.items.DEFS                                       {id: {name, desc, icon}}
//
// Ids: jacket (the blue Metro jacket), torch, batteries, tvRemote, pills (Setu's pills and inhaler; used up when he is found),
// breachEvidence (6b adds it), food, hardhat (the opening act). Side effects kept in one place:
//   jacket    -> game.flags.jacket = true (the guards read it) and Mithi's model wears the jacket variant
//   torch     -> game.flags.torch = true
//   breachEvidence -> game.flags.hasEvidence
import { installStoryCss } from './story-css.js';

const svg = (inner) => `<svg viewBox="0 0 24 24">${inner}</svg>`;
export const DEFS = {
  jacket: { name: 'Metro jacket', desc: 'A blue Metro worker\'s jacket. Guards let staff walk past.', icon: svg('<path d="M8 3 L4 6 L3 13 H6 V21 H18 V13 H21 L20 6 L16 3 L12 8 Z"/><path d="M6 15 H18 M12 8 V21"/>') },
  torch: { name: 'Torch', desc: 'A working torch. Jeetu can see by it.', icon: svg('<path d="M9 3 H15 L16 8 H8 Z"/><path d="M9 8 V20 H15 V8"/><path d="M12 12 V15"/><path d="M4 4 L6 6 M20 4 L18 6 M12 0.8 V2" class="ray"/>') },
  batteries: { name: 'Batteries', desc: 'Two fat batteries out of the TV remote.', icon: svg('<rect x="4" y="9" width="7" height="12" rx="1"/><rect x="13" y="9" width="7" height="12" rx="1"/><path d="M7 6 V9 M16 6 V9 M6 13 H9 M15 13 H18 M16.5 11.5 V14.5"/>') },
  tvRemote: { name: 'TV remote', desc: 'Home\'s TV remote, with nothing left inside.', icon: svg('<rect x="8" y="2" width="8" height="20" rx="2"/><circle cx="12" cy="6.5" r="1.4"/><path d="M10 11 H14 M10 14 H14 M10 17 H14"/>') },
  pills: { name: 'Pills & inhaler', desc: 'Setu\'s pills and inhaler. He needs one every eight hours.', icon: svg('<rect x="3" y="7" width="12" height="6" rx="3" transform="rotate(-35 9 10)"/><path d="M8 5 L12 12" transform="rotate(-35 9 10)"/><path d="M14 16 H21 V20 H14 Z M17.5 16 V13"/>') },
  breachEvidence: { name: 'Breach evidence', desc: 'Proof that the deep tunnels have breached the water table.', icon: svg('<path d="M6 3 H15 L19 7 V21 H6 Z"/><path d="M15 3 V7 H19"/><path d="M9 12 H16 M9 15 H16"/><path d="M12 17.5 C10.5 19 10.5 20.5 12 20.5 C13.5 20.5 13.5 19 12 17.5 Z"/>') },
  hardhat: { name: 'Hard hat', desc: 'A yellow rescue helmet from the crate at the crash site. Falling debris rings off it instead of you.', icon: svg('<path d="M4 16 C4 10 7.5 6 12 6 C16.5 6 20 10 20 16 Z"/><path d="M2 16 H22 V18.5 H2 Z"/><path d="M12 6 V11 M8.5 7.5 L9.5 11.5 M15.5 7.5 L14.5 11.5"/>') },
  food: { name: 'Food', desc: 'Roti, rice and water from home. Enough to share.', icon: svg('<path d="M3 12 H21 C21 17 17 20 12 20 C7 20 3 17 3 12 Z"/><path d="M8 9 C8 7 10 7 10 5 M13 9 C13 7 15 7 15 5"/>') },
};

export class ItemSystem {
  init(game) {
    installStoryCss();
    this.game = game;
    game.items = this;
    this.DEFS = DEFS;
    this.have = [];
    this.root = document.createElement('div');
    this.root.className = 'hud-items';
    document.getElementById('hud').appendChild(this.root);
    // Mithi carries Setu's pills and inhaler from the first second
    this.add('pills', { silent: true });
    game.events.on('setu:found', () => this.remove('pills'));
    game.debug?.addState('items', () => this.have.slice());
    game.debug?.addAction('give', (g, id) => { if (!DEFS[id]) throw new Error('unknown item ' + id); this.add(id); return this.have.slice(); });
    game.debug?.addAction('take', (g, id) => { this.remove(id); return this.have.slice(); });
  }

  has(id) { return this.have.includes(id); }
  list() { return this.have.slice(); }

  add(id, { silent = false } = {}) {
    const g = this.game;
    if (this.have.includes(id)) return false;
    if (!DEFS[id]) console.warn('unknown item', id);
    this.have.push(id);
    this._effects(id, true);
    this._draw(id);
    g.events.emit('item:added', { id });
    if (!silent) g.messages?.say(`Taken: ${DEFS[id]?.name ?? id}.`, { kind: 'system', ttl: 4 });
    return true;
  }

  remove(id) {
    const i = this.have.indexOf(id);
    if (i < 0) return false;
    this.have.splice(i, 1);
    this._effects(id, false);
    this._draw();
    this.game.events.emit('item:removed', { id });
    return true;
  }

  _effects(id, on) {
    const g = this.game;
    if (id === 'jacket') { g.flags.jacket = on; g.party?.mithiModel?.setVariant(on ? 'jacket' : 'default'); if (!g.party && g.view) g.view.mithi.setVariant(on ? 'jacket' : 'default'); }
    if (id === 'torch') g.flags.torch = on;
    if (id === 'breachEvidence') g.flags.hasEvidence = on;
  }

  _draw(newId) {
    this.root.innerHTML = this.have.map((id) => {
      const d = DEFS[id] ?? { name: id, icon: svg('<circle cx="12" cy="12" r="6"/>') };
      return `<div class="it${id === newId ? ' new' : ''}" data-id="${id}" data-name="${d.name}" title="${d.name}">${d.icon}</div>`;
    }).join('');
    if (newId) setTimeout(() => { this.root.querySelector('.it.new')?.classList.remove('new'); }, 2600);
  }
}
