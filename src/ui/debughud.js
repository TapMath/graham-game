// Small text readout in the corner, only with ?debug=1. Handy in screenshots.
export class DebugHudSystem {
  init(game) {
    this.game = game;
    this.el = document.getElementById('debug-hud');
    this.el.hidden = !game.params.debug;
    this.acc = 0;
  }

  update(dt) {
    if (!this.game.params.debug) return;
    this.acc += dt;
    if (this.acc < 0.1) return;
    this.acc = 0;
    const g = this.game, p = g.player, r = g.renderStats();
    this.el.textContent =
      `pos ${p.pos.x.toFixed(1)} ${p.pos.y.toFixed(2)} ${p.pos.z.toFixed(1)}  level ${p.level}\n` +
      `${p.onGround ? 'ground' : 'air'}${p.sprinting ? ' sprint' : ''}  v ${Math.hypot(p.vel.x, p.vel.z).toFixed(1)} m/s  rays ${p.rays}\n` +
      `calls ${r.calls}  tris ${r.triangles}  seed ${g.params.seed}  t ${g.time.toFixed(1)}`;
  }
}
