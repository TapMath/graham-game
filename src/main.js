// Bootstrap: URL params, Game, systems, the fixed-step main loop, and the debug API.
import './polyfills.js';
import { Game, STEP } from './game.js';
import { parseParams } from './core/params.js';
import { Player } from './core/player.js';
import { LiftSystem } from './world/lift.js';
import { SkySystem } from './world/sky.js';
import { arenaSystem } from './world/arena.js';
import { CitySystem } from './world/city.js';
import { LiftPanelSystem } from './systems/lifts/panel.js';
import { TransitSystem } from './systems/transit/index.js';
import { CrowdSystem } from './systems/crowds/index.js';
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
import { AudioSystem } from './systems/audio/engine.js';
import { PASystem } from './systems/audio/pa.js';
import { RippleSystem } from './systems/senses/ripples.js';
import { SensesSystem } from './systems/senses/senses.js';
import { Sing } from './systems/senses/sing.js';
import { SetuVoice } from './systems/senses/organ.js';
import { VisionSystem } from './systems/senses/vision.js';
import { guarded } from './systems/senses/guard.js';
import { DialogueSystem } from './systems/story/dialogue.js';
import { ItemSystem } from './systems/story/items.js';
import { ObjectiveBoard } from './systems/story/objectives.js';
import { CastSystem } from './systems/story/cast/index.js';
import { Director } from './systems/story/director.js';
import { PartySystem } from './systems/story/party.js';
import { BreachSystem } from './systems/story/breach.js';
import { FragmentSystem } from './systems/story/fragments.js';
import { TrailSystem } from './systems/story/trail.js';
import { FireworkSystem } from './systems/story/fireworks.js';
import { CinematicSystem } from './systems/story/cinematics.js';
import { MessageSystem } from './ui/messages.js';
import { DialogSystem } from './ui/dialog.js';
import { ScreenFxSystem } from './ui/screenfx.js';
import { HudSystem } from './ui/hud.js';
import { OverlaySystem, startTitleScene } from './ui/overlay.js';
import { SettingsSystem, applyBootParams } from './ui/settings.js';
import { TouchSystem } from './ui/touch.js';
import { DebugHudSystem } from './ui/debughud.js';
import { DebugApi } from './debug.js';

function fatal(msg) {
  const el = document.getElementById('fatal');
  el.textContent = msg; el.hidden = false;
}

function boot() {
  const params = applyBootParams(parseParams(location.search));   // the stored run length applies unless ?minutes= is given
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
  if (!params.arena) game.addSystem('liftpanel', new LiftPanelSystem());   // Phase 8B: E panels, floor choice, solar charge (after the world, before the player)
  if (!params.arena) game.addSystem('transit', new TransitSystem());       // Phase 8B: the Harbour Line trains (they must move before the player is carried)
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
  if (!params.arena) game.addSystem('crowds', guarded(new CrowdSystem(), 'crowds'));   // Phase 8B: instanced pedestrians and traffic (after the player, so they part around her)
  // Phase 6b narrative layer: the breach and the warning (game.story), fragments, Setu's trail, the festival fireworks and the
  // cinematics. After the hazards, so the cinematic camera has the last word; before audio (its listener follows the camera).
  if (!params.arena) {
    game.addSystem('story', guarded(new BreachSystem(), 'story'));
    game.addSystem('fragments', guarded(new FragmentSystem(), 'fragments'));
    game.addSystem('trail', guarded(new TrailSystem(), 'trail'));
    game.addSystem('fireworks', guarded(new FireworkSystem(), 'fireworks'));
    game.addSystem('cinematics', guarded(new CinematicSystem(), 'cinematics'));
  }
  // Phase 5 senses and sound. After the view (the listener and the vision camera follow it), before the HUD.
  // `senses` grades the atmosphere the sky just set, so it must come after the sky; `ripples` hides Phase 3's Setu glow
  // after `setu` updated.
  game.addSystem('audio', guarded(new AudioSystem(), 'audio'));
  game.addSystem('ripples', guarded(new RippleSystem(), 'ripples'));
  game.addSystem('senses', guarded(new SensesSystem(), 'senses'));
  game.addSystem('sing', guarded(new Sing(), 'sing'));
  game.addSystem('setuVoice', guarded(new SetuVoice(), 'setuVoice'));
  game.addSystem('visionSystem', guarded(new VisionSystem(), 'visionSystem'));
  game.addSystem('pa', guarded(new PASystem(), 'pa'));
  game.addSystem('settings', new SettingsSystem());           // after audio and the PA: it applies the stored settings to them in init
  game.addSystem('hud', new HudSystem());
  // Phase 6a story layer: the cast and the objective chain. After the HUD (the items row and the optional objectives mount into its DOM);
  // `party` is last of them so its sighted-rendering override of the fog lands after the senses grade.
  game.addSystem('dialogue', new DialogueSystem());
  if (!params.arena) {
    game.addSystem('items', new ItemSystem());
    game.addSystem('objectives', new ObjectiveBoard());
    game.addSystem('cast', new CastSystem());
    game.addSystem('director', new Director());
    game.addSystem('party', new PartySystem());
  }
  game.addSystem('touch', new TouchSystem());                  // the touch layer (stick, look, buttons); a no-op without touch
  game.addSystem('debughud', new DebugHudSystem());
  game.addSystem('overlay', new OverlaySystem());               // title, pause, settings, how to play (src/ui/overlay.js)

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
    if (game.mode === 'playing' && !game.debug?.manual) {   // debug.manual: tests drive the simulation themselves (run/step/walk)
      acc += dt;
      while (acc >= STEP) { game.update(STEP); acc -= STEP; }
    } else acc = 0;
    game.render();
    game.debug.tick(now);
  }
  requestAnimationFrame(frame);
  return game;
}

// The title is static HTML with its skyline canvas: start the canvas, let the browser paint it, and only then build the city
// (a synchronous few hundred milliseconds), so the "building the city" state is visible instead of a blank page.
try { startTitleScene(); } catch (e) { console.error(e); }
requestAnimationFrame(() => setTimeout(() => {
  try {
    boot();
    window.__grahanBooted = true;   // the watchdog in index.html stands down
  } catch (e) {
    console.error(e);
    fatal('Grahan could not start: ' + (e && e.message ? e.message : e));
  }
}, 30));
