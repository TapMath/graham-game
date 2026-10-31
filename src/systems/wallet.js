// Mithi's money, in rupees. One small store every system shares (busking pays into it, the backpack's cash and the vendors
// read and spend it). Health is still the main currency; this is the coins in her pocket.
//
//   game.wallet.rupees              the amount now (a whole number, never below 0)
//   game.wallet.add(n, reason)      add n (> 0); returns the new amount
//   game.wallet.spend(n, reason)    take n if there is enough: true, else false and nothing changes
//   game.wallet.set(n)              set the amount (tests, story)
// Event: 'wallet:change' {rupees, delta, reason}. A new run restores the amount the wallet held when the game finished
// starting (so cash a system puts in at init, the backpack's for one, comes back on every run).
// Debug: __grahan.set('rupees', n), state().wallet.
export class WalletSystem {
  init(game) {
    this.game = game;
    this.rupees = Math.max(0, Math.round(game.wallet?.rupees ?? 0));   // a stand-in another system made before this one keeps its cash
    this.earned = 0; this.spent = 0;
    game.wallet = this;
    this.start = this.rupees;
    game.events.on('game:init', () => { this.start = this.rupees; });
    game.debug?.addSetter('rupees', (g, v) => this.set(v));
    game.debug?.addState('wallet', () => ({ rupees: this.rupees, earned: this.earned, spent: this.spent }));
  }

  reset() { this.earned = 0; this.spent = 0; this.set(this.start, 'new run'); }

  add(n, reason = '') {
    n = Math.round(n);
    if (!(n > 0)) return this.rupees;
    this.rupees += n; this.earned += n;
    this.game.events.emit('wallet:change', { rupees: this.rupees, delta: n, reason });
    return this.rupees;
  }

  spend(n, reason = '') {
    n = Math.round(n);
    if (!(n >= 0) || n > this.rupees) return false;
    this.rupees -= n; this.spent += n;
    this.game.events.emit('wallet:change', { rupees: this.rupees, delta: -n, reason });
    return true;
  }

  set(n, reason = 'set') {
    const v = Math.max(0, Math.round(n || 0)), d = v - this.rupees;
    this.rupees = v;
    if (d) this.game.events.emit('wallet:change', { rupees: v, delta: d, reason });
    return v;
  }
}
