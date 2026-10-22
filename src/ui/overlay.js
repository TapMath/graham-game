// Menu / pause overlay. Shown in 'menu' and 'paused' modes; clicking it starts or resumes play
// (requesting pointer lock). If pointer lock is unavailable the game still starts: keyboard works
// without it. Phase 6 replaces the markup in index.html with the real title screen.
export class OverlaySystem {
  init(game) {
    this.game = game;
    this.el = document.getElementById('overlay');
    this.cta = document.getElementById('overlay-cta');
    const start = () => {
      if (game.mode === 'playing') return;
      game.input.requestLock();
    };
    this.el.addEventListener('click', start);
    game.canvas.addEventListener('click', () => { if (game.mode === 'playing' && !game.input.locked) game.input.requestLock(); });
    game.events.on('input:lock', ({ locked }) => {
      if (locked) game.setMode('playing');
      else if (game.mode === 'playing' && !game.params.autostart) game.setMode('paused');
    });
    // No pointer lock available (or refused): play anyway with keyboard only.
    game.events.on('input:lockerror', () => game.setMode('playing'));
    game.events.on('mode:changed', () => this.sync());
    this.sync();
  }

  sync() {
    const g = this.game;
    this.el.hidden = g.mode === 'playing';
    this.cta.textContent = g.mode === 'paused' ? 'Paused. Click to resume' : 'Click to play';
  }
}
