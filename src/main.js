// Bootstrap: URL params, Game, systems, the fixed-step main loop, and the debug API.
import { Game, STEP } from './game.js';
import { parseParams } from './core/params.js';
import { Player } from './core/player.js';
import { LiftSystem } from './world/lift.js';
import { SkySystem } from './world/sky.js';
import { arenaSystem } from './world/arena.js';
import { CitySystem } from './world/city.js';
import { InteractableSystem } from './systems/interactables.js';
import { ClockSystem } from './systems/clock.js';
import { AirSystem } from './systems/air.js';
import { HealthSystem } from './systems/health.js';
import { SetuSystem } from './systems/setu.js';
import { VendorSystem } from './systems/vendors.js';
import { EndingSystem } from './systems/endings.js';
import { ObjectiveSystem } from './systems/objective.js';
import { ViewSystem } from './systems/view.js';
import { HazardSystem } from './systems/hazards/index.js';
import { MessageSystem } from './ui/messages.js';
import { DialogSystem } from './ui/dialog.js';
import { ScreenFxSystem } from './ui/screenfx.js';
import { HudSystem } from './ui/hud.js';
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
  game.addSystem('interactables', new InteractableSystem());   // before the world: it registers interactables in init
  game.addSystem('messages', new MessageSystem());             // UI services first: any system may use them in init
  game.addSystem('dialog', new DialogSystem());
  game.addSystem('screenfx', new ScreenFxSystem());
  game.addSystem('world', params.arena ? arenaSystem : new CitySystem());   // the city; the Phase 1 test arena stays behind ?arena=1
  game.addSystem('player', new Player());
  // Phase 3 core loop. Order is update order: the clock first, then health, Setu, vendors, endings, the view
  // (it moves the camera after the player did), and the HUD last (it only reads).
  game.addSystem('clock', new ClockSystem());
  game.addSystem('air', new AirSystem());
  game.addSystem('health', new HealthSystem());
  if (!params.arena) {                                        // the city only: they need its POIs
    game.addSystem('setu', new SetuSystem());
    game.addSystem('vendors', new VendorSystem());
  }
  game.addSystem('endings', new EndingSystem());
  game.addSystem('objective', new ObjectiveSystem());
  game.addSystem('view', new ViewSystem());
  if (!params.arena) game.addSystem('hazards', new HazardSystem());   // Phase 4 perils (after the view so the camera shake lands on the final camera)
  game.addSystem('hud', new HudSystem());
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
