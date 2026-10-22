// Bootstrap: URL params, Game, systems, the fixed-step main loop, and the debug API.
import { Game, STEP } from './game.js';
import { parseParams } from './core/params.js';
import { Player } from './core/player.js';
import { LiftSystem } from './world/lift.js';
import { SkySystem } from './world/sky.js';
import { arenaSystem } from './world/arena.js';
import { OverlaySystem } from './ui/overlay.js';
import { DebugHudSystem } from './ui/debughud.js';
import { DebugApi } from './debug.js';

function fatal(msg) {
  const el = document.getElementById('fatal');
  el.textContent = msg; el.hidden = false;
}

function boot() {
  const params = parseParams(location.search);
  const game = new Game({ canvas: document.getElementById('game'), params });

  // Registration order == update order. Lifts and sky must exist before the world builds;
  // lifts must update before the player so platforms move first.
  game.lifts = game.addSystem('lifts', new LiftSystem());
  game.sky = game.addSystem('sky', new SkySystem());
  game.addSystem('world', arenaSystem);      // Phase 2 swaps this for the city (arena stays behind ?arena=1)
  game.addSystem('player', new Player());
  game.addSystem('debughud', new DebugHudSystem());
  game.addSystem('overlay', new OverlaySystem());

  game.debug = new DebugApi(game);
  game.init();
  game.player = game.system('player');
  if (params.debug) window.__grahan = game.debug.api();

  if (params.autostart) game.setMode('playing'); else game.setMode('menu');

  // Fixed-step simulation decoupled from rendering, so slow frames (software GL in tests) do not
  // change game behaviour. At most MAX_CATCHUP seconds are simulated per rendered frame.
  const MAX_CATCHUP = 0.25;
  let last = performance.now(), acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_CATCHUP);
    last = now;
    if (game.mode === 'playing') {
      acc += dt;
      while (acc >= STEP) { game.update(STEP); acc -= STEP; }
    } else acc = 0;
    game.render();
    game.debug.tick(now);
  }
  requestAnimationFrame(frame);
  return game;
}

try {
  boot();
} catch (e) {
  console.error(e);
  fatal('Grahan could not start: ' + (e && e.message ? e.message : e));
}
