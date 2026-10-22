// Mithi's health: 12 rays of light (PLAN section 2). `game.player.rays` is the integer value the gates and
// the HUD read; this system owns every change to it.
//
//   game.health.rays / .max                       (same as game.player.rays / maxRays)
//   game.health.damage(n, source) / heal(n, source) / setRays(n)
//   game.health.invulnerable                      debug: no damage, no darkness drain (__grahan.set('invulnerable', true))
//   game.health.setDecayMul(id, mul)              Phase 4 hooks (smog, water...): multiplies the darkness drain; mul 1 or null clears
//   game.health.status                            'healing' | 'draining' | 'safe' | 'dead'  (for the HUD)
//   game.health.progress                          0..1 how far the next darkness drain is
//
// Rules: start 7 rays. Away from sunlight the player loses 1 ray per 25 s underground, 40 s on the ground,
// 70 s on the walkways, nothing on the flyovers and above; smog multiplies that by 3. Standing in a lit sun
// shaft heals 1 ray per 2.5 s (and pauses the drain). At night the shafts are off; under an L3 solar lamp
// healing runs at half rate (1 per 5 s). Falls (`player:fall`.damage) and the void/sea (`player:void`.cost)
// cost rays. 0 rays = death.
//
// Events: 'health:changed' {rays, delta, source, max}  on every change (also heal/damage),
//         'health:damage' {n, source, rays}, 'health:heal' {n, source, rays},
//         'player:died' {cause}  once, at 0 rays (the endings system shows ending 4).
export const HEALTH = Object.freeze({
  max: 12, start: 7,
  drainSeconds: { U: 25, G: 40, L1: 70, L2: Infinity, L3: Infinity },   // seconds per ray lost
  smogMul: 3,
  sunSeconds: 2.5,           // seconds per ray in a lit shaft
  lampFactor: 0.5,           // solar lamps at night: half rate
  shaftOn: 0.3,              // shaft intensity above which a shaft heals
});

export class HealthSystem {
  init(game) {
    this.game = game;
    game.health = this;
    this.max = HEALTH.max;
    this.invulnerable = false;
    this.mods = new Map();
    this.status = 'safe';
    this.progress = 0;
    this.lastSource = null;
    this.stats = { damageTaken: 0, healed: 0, drains: 0 };
    this._drain = 0; this._heal = 0; this._dead = false;
    const p = game.player;
    p.maxRays = this.max;
    game.events.on('player:fall', ({ damage }) => { if (damage > 0) this.damage(damage, 'fall'); });
    game.events.on('player:void', ({ cost, reason }) => { if (cost > 0) this.damage(cost, reason === 'sea' ? 'sea' : 'void'); });
    game.debug?.addSetter('rays', (g, v) => this.setRays(v));
    game.debug?.addSetter('invulnerable', (g, v) => { this.invulnerable = !!v; });
    game.debug?.addAction('damage', (g, n = 1) => this.damage(n, 'debug'));
    game.debug?.addAction('heal', (g, n = 1) => this.heal(n, 'debug'));
    game.debug?.addState('health', () => ({
      rays: this.rays, max: this.max, status: this.status, progress: +this.progress.toFixed(2), invulnerable: this.invulnerable, dead: this._dead,
      decayMul: +this.decayMul().toFixed(2), lastSource: this.lastSource, stats: { ...this.stats },
    }));
    this.reset();
  }

  reset() {
    this.game.player.rays = HEALTH.start; this.game.player.maxRays = this.max;
    this._dead = false; this._drain = 0; this._heal = 0; this.status = 'safe';
  }

  get rays() { return this.game.player.rays; }
  get dead() { return this._dead; }

  setDecayMul(id, mul) { if (mul == null || mul === 1) this.mods.delete(id); else this.mods.set(id, mul); }
  decayMul() { let m = 1; for (const v of this.mods.values()) m *= v; return m; }

  setRays(n) {
    const p = this.game.player, v = Math.max(0, Math.min(this.max, Math.round(n)));
    const delta = v - p.rays;
    if (!delta) return;
    p.rays = v;
    this.lastSource = 'set';
    this.game.events.emit('health:changed', { rays: v, delta, source: 'set', max: this.max });
    if (v <= 0) this._die('set');
  }

  damage(n, source = 'unknown') {
    if (this._dead || this.invulnerable || !(n > 0)) return;
    const p = this.game.player, before = p.rays;
    p.rays = Math.max(0, p.rays - Math.round(n));
    const d = p.rays - before;
    if (!d) return;
    this.stats.damageTaken += -d; this.lastSource = source;
    const ev = this.game.events;
    ev.emit('health:damage', { n: -d, source, rays: p.rays });
    ev.emit('health:changed', { rays: p.rays, delta: d, source, max: this.max });
    if (p.rays <= 0) this._die(source);
  }

  heal(n, source = 'unknown') {
    if (this._dead || !(n > 0)) return;
    const p = this.game.player, before = p.rays;
    p.rays = Math.min(this.max, p.rays + Math.round(n));
    const d = p.rays - before;
    if (!d) return;
    this.stats.healed += d; this.lastSource = source;
    this.game.events.emit('health:heal', { n: d, source, rays: p.rays });
    this.game.events.emit('health:changed', { rays: p.rays, delta: d, source, max: this.max });
  }

  _die(cause) {
    if (this._dead) return;
    this._dead = true; this.status = 'dead';
    this.game.events.emit('player:died', { cause });
  }

  /** Healing rate in rays/second at `pos` right now (0 if none). */
  sunRate(pos) {
    const w = this.game.world;
    if (!w?.sunShafts) return { rate: 0, source: null };
    if (w.sunShafts.intensity >= HEALTH.shaftOn && w.isInSunlight(pos)) return { rate: 1 / HEALTH.sunSeconds, source: 'sun' };
    if (w.sunShafts.intensity < HEALTH.shaftOn && w.isNearSolarLamp?.(pos)) return { rate: HEALTH.lampFactor / HEALTH.sunSeconds, source: 'lamp' };
    return { rate: 0, source: null };
  }

  update(dt, game) {
    if (this._dead || game.modal) return;
    const p = game.player;
    const sun = this.sunRate(p.pos);
    if (sun.rate > 0) {
      this._drain = Math.max(0, this._drain - dt * 2);        // light slowly undoes the darkness
      this.status = p.rays < this.max ? 'healing' : 'safe';
      if (p.rays < this.max) {
        this._heal += dt * sun.rate;
        if (this._heal >= 1) { this._heal -= 1; this.heal(1, sun.source); }
      } else this._heal = 0;
    } else {
      this._heal = 0;
      const base = HEALTH.drainSeconds[p.level] ?? Infinity;
      if (!Number.isFinite(base) || this.invulnerable) { this.status = 'safe'; this._drain = 0; }
      else {
        this.status = 'draining';
        const smog = game.air ? game.air.at(p.pos).smog : 0;
        const mul = this.decayMul() * (smog ? HEALTH.smogMul : 1);
        this._drain += dt * mul / base;
        if (this._drain >= 1) {
          this._drain -= 1; this.stats.drains++;
          this.damage(1, 'darkness');
        }
      }
    }
    this.progress = this.status === 'draining' ? Math.min(1, this._drain) : 0;
  }
}
