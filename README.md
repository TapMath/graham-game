# Grahan

*the search for sunrise in 2049 Mumbai*

Mumbai, 2049. Hundreds of towers, thousands of flyovers and walkways, stacked so densely that the ground never sees the sun. On the morning of a festival of lights, a five-level flyover collapses onto the slum beneath it. Setu, eight years old and asthmatic, who has never seen a sunrise, falls with the maintenance lift into the metro tunnels. His sister **Mithi** is eighteen and blind. She carries his pills and inhaler, and she hears the city the way other people see it.

Grahan is a real-time, first-person search-and-survival game that runs in a browser. You play Mithi. Find Setu before his breath runs out, survive the city (feral dogs, drones and police, collapsing walkways, smog, the dark), learn what the deep construction under the city has done to the water table, warn the authorities, and bring Setu to the Sunrise Bridge on the east edge for dawn.

It is based on *Grahan (Children of the Sun)*, a story by Sarat T. Rao, and a concept deck by Sarat Talluri Rao and Mohammed Ali Rukadikar. The sources are in `docs/`.

**Sound is how Mithi sees. Headphones are recommended.**

## How to play

- **Health is a sun.** You have 12 rays and start with 7. Darkness takes them (fastest underground, never on the flyovers). At zero, Mithi is gone. Health is also the currency.
- **Stand in sunlight** to heal. There is more of it the higher you go, and you can go higher the more health you have: bio-scanner gates want 5 rays for the flyovers and 8 for the upper decks.
- **Sing (Q).** A wave of sound shows you the shape of the world and Setu may answer. Singing calms dogs and frightened people, but police, drones and guards hate it. Hold Q for two seconds for second sight, a glimpse from Setu's side.
- **Listen for the mouth organ.** Setu plays it when you sing and now and then on his own. Gold rings show where it comes from, even through walls.
- **Tab** swaps between Mithi and Jeetu once he joins you. Jeetu can read signs and documents, climb, and carry a torch. He cannot sing.
- **V** switches between first and third person.
- **The map.** A round minimap in the corner turns with your view and shows the level you are on: streets, decks, stairs, ramps and lifts (with their battery), gates and their ray thresholds, the Harbour Line with the next train, and the **sunlight patches active right now**. **M** opens the full city map: a transit sheet of the slice of Mumbai (Dharavi, Sion Junction, King's Circle, New Wadala, Sewri, Atal Setu, Mahim Bay, the Mithi River), one tab per level, with the lifts, gates, trains, sunlight (and when it returns), places you have found and a "you are here". **Where to go:** the current objective is a big pulsing gold marker on the minimap (a chevron with the distance on the rim when it is out of view, "L3 ↑" when it is on another level) and a star on the full map on every tab (a faded ghost on the other levels, a dashed line from you on your own level); the top of the full map's side panel is a "Where to go" card (distance, compass direction, level, a "Show on map" button), and a small line under the objective on the HUD says the same ("Atal Setu · 240 m NE · go up to L3").
- **The web.** Single, double and triple road flyovers on shared piers (the triple stack stands at Sion Junction, beside the collapsed spans), bridges between the tower faces and skywalks at 6, 12, 18, 24, 30 and 38 m, ribbed like cathedral vaults underneath, with traffic on the roads and people on the footpaths. The routes up are stairs, ramps and **capsule lifts**: rounded glass cars on exposed rails in four classes (solo 1, family 4, public 12, freight 24). Capacity is a rule, not a label: Jeetu and Setu wait for the next cycle in a solo capsule, and a public one is full at rush hour. A ride costs solar charge by capacity and height, and the maps show every lift's class and seats.
- **Finding the light.** Mithi feels the sun on her skin: a soft glow on the edge of the screen points the way to the nearest sunlight you can reach (the same level, or the nearest stairs or lift up), and grows as you near it. Pale columns of light stand out of the smog from afar, and painted arrows and **धूप ↑ SUN ↑** signs mark the ways up.
- **The clock and the flood.** Time runs from before dawn to dawn the next day, in real time (about 30 minutes by default). Something is wrong with the water below. Once you know, a flood timer appears.
- **D-shots** are illegal health jabs from black-market sellers. Each one has a different price in time and a different risk. Sellers also take cash, which costs no time.
- **Mithi's backpack (B).** Cash (₹120 to start), two D-shots of her own (+3 rays, a small chance of a bad one), earbuds (the city goes quiet, a song plays and the dark drains her a little slower, but she cannot hear the street), a talking phone that says the time (it costs battery), a water bottle (three sips; each halves the darkness drain for a minute), glucose biscuits (+1 ray each), and everything she picks up. The game waits while the bag is open.

The in-game "How to play" screen has the same cards with pictograms.

### Controls

| | Keyboard and mouse | Touch |
|---|---|---|
| Move | `W` `A` `S` `D` | left thumb: floating stick (push it to the edge to sprint) |
| Sprint | `Shift` | stick to the edge |
| Look | mouse (pointer lock) | drag anywhere on the right |
| Jump | `Space` | jump button |
| Use, talk, read (hold to dig) | `E` | E button, or tap the prompt |
| Sing / second sight | `Q` (hold 2 s) | Q button (hold) |
| Switch character | `Tab` | switch button (after Jeetu joins) |
| Third person | `V` | V button |
| Backpack (the game waits while it is open) | `B` (`B` or `Esc` closes; `1`-`9` pick; `Enter` uses) | bag button |
| Map (full city map, pauses the game) | `M` (`Esc` or `M` closes it; `1`-`5` or the arrows change level; `+` `-` zoom; `C` centres on you) | tap the little map, or the map button when the minimap is off |
| Pause | `Esc` | pause button |

Conversation answers and cards are clickable and tappable. The touch layer appears on touch devices (or after the first touch).

### Settings

Pause menu or title screen, saved in `localStorage`: master, music, effects and voice volume; PA voice; captions for sounds; mouse and touch sensitivity; invert Y; field of view; quality (resolution and draw distance); reduce flashing (also on by default when the OS asks for reduced motion); the minimap (on or off); default view; run length (24, 30, 45 or 60 minutes, applied on the next run).

## Run it locally

There is no build step and no dependency to install. Serve the repository root with any static server and open `index.html`:

```sh
python3 -m http.server 8000
# then open http://localhost:8000/
```

It needs a browser with WebGL 2 and Web Audio: any current Chrome, Edge, Firefox or Safari, including iPad and iPhone (iOS/iPadOS 15 or later). Touch controls turn on automatically on touch screens. Nothing is loaded from the network (three.js is vendored in `vendor/`, all sound is synthesised, all textures are procedural), so it also runs offline from a static host.

### URL parameters

| Parameter | Effect |
|---|---|
| `seed=N` | Seed for the run (dangers, vendor offers, Setu's route, unstable walkways). The map is always the same. Default: random. |
| `minutes=N` | Total real minutes of the run, first light to the flood. Overrides the run-length setting. |
| `autostart=1` | Skip the title and the pointer-lock requirement and start playing at once (headless tests need it). The opening cutscene is skipped too, unless `intro=1`. |
| `intro=1` | Play the opening collapse cutscene even with `autostart`. |
| `debug=1` | Expose `window.__grahan` (state, teleport, set time, spawn things, ...) and the corner readout. |
| `arena=1` | Load the small test arena instead of the city. |
| `hazards=0` | Switch every hazard off (dogs, drones, guards, smog, flood, collapses). |
| `mute=1` | Start with the sound muted. |
| `touch=1` / `touch=0` | Force the touch controls on or off. |

For example `index.html?seed=7&minutes=45&debug=1`.

## Project structure

```
index.html            entry: the static title screen, the HUD container, a boot watchdog
src/main.js           boot, system registration, the fixed-step loop
src/game.js           the shared Game object (scene, camera, events, rng, systems, modes)
src/debug.js          the debug / test API (window.__grahan with ?debug=1)
src/core/             events, rng, params, input (keyboard, mouse, pointer lock, touch), physics, player
src/world/            the city as data (map.js) and everything that builds it: structures, props, rail (the Harbour Line's tracks, platforms, fence), sky, sea,
                      lifts (capsules: solo, family, public and freight classes, solar battery), the flyover network (network.js is the data, netcheck.js its
                      self-check, network-build.js its piers, footpaths and vaulted undersides), gates, sunlight, fx
src/characters/       procedural low-poly people
src/systems/          clock, health, Setu, vendors, hazards/, audio/ (a procedural Web Audio engine), senses/ (sing, ripples,
                      visions), story/ (cast, dialogue, objectives, fragments, cinematics), endings,
                      transit/ (the Harbour Line trains), crowds/ (instanced pedestrians and traffic), lifts/ (floor panels and charge, the capsule fleet,
                      capacity: who fits in the car and who waits for the next one)
src/ui/               HUD, messages, dialogs, screen effects, title screen, pause menu, settings, how to play, touch controls, the minimap, the full map and the warmth cue
                      (map.js, minimap.js, fullmap.js, maprender.js, mapdata.js, warmth.js)
src/styles.css        the whole stylesheet (OK Computer language: pale blue-white thin type, safety-card pictograms, scrawls)
tools/smoke.mjs       headless test runner (Playwright)  tools/shots*.json  screenshot tours with assertions
tools/audio-check.mjs offline render of every synthesised sound  tools/check-network.mjs  self-check of the flyover network (no browser)
docs/PLAN.md          the design spec and the per-phase progress log
docs/*.pdf            the story and the pitch deck
vendor/               three.js r160 (MIT)
```

## Testing

The smoke tool serves the repository, opens the game in headless Chromium (software WebGL), runs the steps of a "shots" file, saves a screenshot per step into `shots/` (git-ignored), and **fails on any console error, page error or failed request**. Steps can run JS in the page (`eval`, mostly through the debug API), click, tap, press keys, drive raw touch points, resize the viewport and reload.

```sh
npm i -g playwright && npx playwright install chromium      # once
node tools/smoke.mjs --shots tools/shots.json --wait 6000    # the city tour (about 12 minutes under SwiftShader)
```

Playwright is found through `NODE_PATH` or the global npm root.

| Flag | Meaning |
|---|---|
| `--shots file.json` | the steps to run |
| `--wait ms` | wait after the page loads |
| `--query "seed=1&..."` | extra URL parameters |
| `--out dir` | screenshot folder (default `shots`) |
| `--no-autostart` | open without `autostart=1`, so the title screen shows |
| `--mobile` | phone emulation (touch, 844x390; `--orientation portrait` for 390x844, or `--viewport WxH`) |

The tours: `tools/shots.json` (the whole city, level by level), `shots-arena.json` (the Phase 1 arena, `--query "seed=1&arena=1"`), `shots-phase3.json` (core loop), `shots-phase4.json` (hazards), `shots-phase5.json` (senses and sound), `shots-phase6a.json` and `shots-phase6b.json` (cast, objectives, fragments, cinematics; `shots-phase6b-intro.json` with `--query "seed=1&intro=1"`), `shots-phase9a.json` (the flyover web and the capsule lifts: money shots from the streets, the triple stack, traffic on the flyovers, a long walk over the skywalks, each capsule class, the seat rule, the maps and the draw-call and triangle worst cases; built by `tools/build-phase9a.mjs`), `shots-phase8b.json` (Mumbai signage, the Harbour Line, crowds, lifts and the draw-call worst case; built by `tools/build-phase8b.mjs`), `shots-phase8a.json` (the minimap and the full map on every level and on phone-sized screens, the warmth cue and its bearing, sun beacons, painted arrows and signs, the minimap setting; built by `tools/build-phase8a.mjs`) and `shots-phase8a-mobile.json` (real touch: tapping the minimap, the tabs, zoom and pan; run with `--mobile --query "seed=1&touch=1"`), `shots-objective-map.json` (where the current objective is: the HUD line, the minimap marker and rim arrow, the full map's star, ghost and "Where to go" card, on desktop and phone-sized screens), `shots-phase7a.json` (title, how to play, settings, pause, HUD, dialogs and endings on desktop; run with `--no-autostart`) and `shots-phase7a-mobile.json` (touch controls and the phone layouts in both orientations; run with `--mobile --query "seed=1&touch=1"`). Most steps assert with `ok(condition, message)`, so a broken behaviour fails the run, not just the picture.

`node tools/audio-check.mjs` renders every synthesised sound offline and flags silence, NaN and clipping (`--wav dir` writes WAV files to listen to).

## Credits

- **Story:** Sarat T. Rao, *Grahan (Children of the Sun)*
- **Concept deck:** Sarat Talluri Rao and Mohammed Ali Rukadikar
- three.js (MIT) for rendering; everything else, including every sound, is written for this game.
