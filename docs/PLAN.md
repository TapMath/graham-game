# Grahan: build plan

Source: `docs/Grahan Game Presentation.pdf` (the pitch deck). This file turns that deck into a buildable spec for a **first-person, in-browser** game, then splits the build into phases. Every phase agent reads this whole file first.

## 1. The game in one paragraph

Mumbai, 2049. Towers, flyovers and skywalks are stacked so densely that the ground never sees the sun. Setu, a small boy who has never seen a sunrise, climbed to the upper levels one morning, something collapsed, and he is now lost somewhere below. He needs his life-saving injections, and his blind 18-year-old sister **Mithi** carries them. You play Mithi in first person. Find Setu before his health runs out, survive the city, discover that underground construction has breached the water table (a flood is 24 hours away), warn the authorities, and bring Setu to the eastern bridge so he can see the sunrise.

## 2. Design pillars (from the deck → game rules)

| Deck idea | Game rule |
|---|---|
| **Health is the currency**, shown as a sun whose rays vanish one by one | Player health = **12 rays**, start at **7**. HUD is a sun glyph with 12 rays; a lost ray fades out. 0 rays = Mithi dies. |
| Heal by **standing in sunlight shafts**, more of them higher up | Sun-shaft volumes (visible god-ray cones/columns). Inside one: +1 ray every 2.5 s. Few and thin on the ground level, more and wider on upper levels. |
| **You can go higher the more health you have** | Bio-scanner **health gates** guard the routes up: Walkways (L1) is free, Flyovers (L2) needs ≥ 5 rays, Upper decks (L3) needs ≥ 8 rays. Gates are on lifts and stair landings; a gate shows its requirement and refuses you with a buzz if you're short. |
| Darkness drains you | Away from sunlight, health decays: underground 1 ray / 25 s, ground 1 ray / 40 s, walkways 1 ray / 70 s, flyovers & up: no decay. Smog multiplies the decay. |
| **D-shots**: illegal health jabs with **unpredictable costs by seller** | Black-market vendors. Each offer is rolled per vendor per run: potency (+2 to +6 rays), **price paid in time** (30 min to 3 h is cut from the flood clock, "you wait while they fetch it"), and a risk (0–35%) that the shot is cut/contaminated (−2 rays and blurred vision for 20 s). Vendor flavour text hints at their honesty. Accept or walk away. |
| **Setu's health is a ticking clock**, conveyed through story | Setu's health 100 → 0. Decays so that he dies **~14 real minutes** after start if never found. Shown as a small heartbeat meter *and* periodic story lines ("Setu's cough echoes off the pillars, weaker now."). Game over if he dies. |
| **Global ticking clock: water breach, 24 hours, real time** | In-game clock starts **06:00 day 1**; the flood arrives **06:00 day 2**. Default 1 game hour = 1 real minute (24 real minutes total). Override via `?minutes=N`. The breach is *discovered* through play (see §6), not told up front. |
| **Dangers**, randomly populated with variance; **fixed map** | The map is hand-designed and identical every run. Dangers, Setu's hiding spot, vendor offers and unstable walkways are rolled from a **seed** (`?seed=N`, else random) so each run plays differently. |
| Blind protagonist with **heightened sound design** | Mithi perceives the world mostly through sound: short visual range, desaturated darkness, and a **Sing** ability (echolocation pulse, see §5). Positional HRTF audio for everything. |
| Endings | See §7. |
| 1–3 players | Out of scope for this build (single player as Mithi). Architecture should not preclude it later, but don't build networking. |

## 3. The city (fixed map)

Roughly **360 m × 360 m** play area, bounded by sea on the west and south (impassable water/walls) and dense towers elsewhere. **Up is +Y**, units are metres. **East is +X**: the dawn bridge is on the east edge, facing the sunrise.

Five vertical layers:

| Level | Y (walk surface) | Character | Light |
|---|---|---|---|
| **U** Underground | −8 | Metro & service tunnels, construction pits. **The breach is here.** Floods first. | Pitch dark; work lamps only |
| **G** Ground | 0 | Streets and slums between tower bases and pillars, under flyovers. Dogs, deranged people, smog. Where Setu most likely is. | Near-dark, sodium lamps, rare thin shafts |
| **L1** Walkways | 12 | Skywalk network between towers, markets, vendors | Dim, some shafts |
| **L2** Flyovers | 24 | Elevated roadways (traffic lanes with barriers), police drones | Bright patches |
| **L3** Upper decks | 38 | Rooftop gardens of the rich, the **Control Tower** (where you warn the authorities), and access to the **Sunrise Bridge** on the east edge | Full sun |

Connections between levels: staircases, ramps, **lifts** (press E; ride a moving platform), broken pipes/ladders, construction scaffolds, tunnel shafts down to U. Each level must be reachable by at least two routes, and upward routes into L2 and L3 pass through health gates. Tower bodies are solid, tall boxes (60–140 m) with emissive window grids, which is what blocks the sun.

Landmarks to help navigation (and to match the deck's art): a giant dead tree in a ground-level courtyard; a collapsed walkway rubble field (where Setu fell from: the starting story beat); the metro station; the market skywalk; the cloverleaf flyover; the Control Tower; the Sunrise Bridge.

Visual style: hazy, warm-ochre smog high up; teal-green gloom below (see the deck's "perils" and "urban jungle" slides). Low-poly flat-shaded geometry, heavy distance fog, emissive windows, volumetric-looking light shafts (additive transparent cones). No external textures; use procedural canvas textures where needed.

## 4. Technical architecture

- **No build step.** Static site served from the repo root. `index.html` has an import map: `"three": "./vendor/three.module.js"`, `"three/addons/": "./vendor/addons/"`. Three.js r160 is vendored. Only `vendor/addons/utils/BufferGeometryUtils.js` is vendored; if another addon is needed, copy it from the `three@0.160.0` npm package (`npm pack three@0.160.0`) into `vendor/addons/` with the same relative path.
- Plain ES modules under `src/`. No frameworks. No external network requests of any kind (no CDNs, no fonts from the web); the game must run offline from a static host.
- Suggested layout (phases may add files; keep modules small and focused):

```
index.html            entry, import map, HUD/menu DOM containers, <link> to src/styles.css
src/main.js           bootstrap, URL params, game loop, state machine (menu → playing ↔ paused → ending)
src/game.js           the shared Game object: scene, camera, renderer, clock, rng, events, systems registry
src/core/events.js    tiny pub/sub (on/off/emit)
src/core/rng.js       seeded PRNG (mulberry32) + helpers (range, pick, chance, shuffle)
src/core/input.js     keyboard, mouse, pointer lock, (phase 6) touch
src/core/physics.js   collision world (see below)
src/core/player.js    first-person controller
src/world/materials.js shared materials (+ the sing-pulse shader patch, phase 5)
src/world/map.js      the fixed city layout as DATA (boxes, ramps, lifts, gates, shafts, spawn points, POIs)
src/world/builder.js  turns map data into merged meshes + physics colliders
src/world/sky.js      sky, fog, sun, day/night lighting
src/systems/*.js      health, setu, clock, vendors, hazards, story, audio, sing, endings
src/ui/*.js           hud, menus, dialogs, messages
src/styles.css
tools/smoke.mjs       headless test (see §8)
```

- **Game object** (`src/game.js`): a single object passed to every system. Systems are `{ init(game), update(dt, game), reset?(game) }` registered in order. Cross-system communication goes through `game.events` (e.g. `emit('health:changed', {rays})`, `emit('setu:found')`, `emit('ending', {type})`).
- **Physics**: custom and simple; don't pull in a physics library.
  - *Walkables*: axis-aligned boxes (top surface) and *ramps* (box footprint with a linear height from one edge to the opposite). `groundHeightAt(x, z, feetY)` returns the highest walkable top ≤ `feetY + 0.6` (step-up height). Use a uniform grid spatial hash for lookups.
  - *Solids*: AABBs that block horizontal motion when they overlap the player's vertical span; resolve by minimal push-out on X/Z. Player is a 0.35 m-radius, 1.7 m-tall cylinder approximated as an AABB.
  - *Dynamic* colliders (lifts, collapsing slabs) are allowed: they're the same records with mutable positions.
  - Gravity 22 m/s², jump 7 m/s, walk 4.2 m/s, sprint 7 m/s (sprint drains nothing; keep it simple). Fall damage: falls over 9 m cost 1 ray per 4 m beyond 9. Falling into the sea or the world's bottom respawns at the last safe position and costs 1 ray.
- **Rendering budget**: must stay playable on a mid-range phone. Merge static geometry per material (BufferGeometryUtils.mergeGeometries), use InstancedMesh for repeated props (pillars, lamps, railings, windows), keep draw calls under ~150, shadows **off** (fake light with shafts, emissive and vertex colour), pixel ratio capped at 1.5, fog far ≤ 220 m.
- **Debug/test API** (always present when `?debug=1`): `window.__grahan = { game, teleport(x,y,z), look(yawDeg, pitchDeg), setTime(hour), set(key, value), state(), fps() }`. `state()` returns a plain JSON snapshot (player position, level, rays, setu health, clock, flags). Each phase extends `state()` and `set()` for what it adds.
- **URL params**: `seed`, `minutes`, `debug`, `autostart` (skip the menu and pointer-lock requirement; start playing immediately; needed for headless tests), `mute`.
- Pointer lock: request it on click into the canvas; while not locked and not autostart, show a "click to play" pause overlay. With `autostart=1`, the loop runs without pointer lock.

## 5. Mithi's senses (the signature mechanic)

Mithi is blind. In first person, render the world as she *perceives* it:

- **Base perception**: short-range, desaturated, dark. Fog-near ~6 m, fog-far ~45 m on G/U, opening up on higher levels where sunlight and warmth make the world "louder". Sunlight shafts are always visible as warm glows (she feels the heat).
- **Sound made visible**: sound sources (dogs barking, drones, dripping water, footsteps of strangers, vendors calling, Setu's humming) show soft expanding ripple rings at their world position, with intensity by loudness and distance, visible even through fog. So you see a dog *because it barked*.
- **Sing (Q)**: Mithi sings a short phrase (a few notes in Raga Bhairav, a dawn raga). It sends out an expanding **echolocation wave** (radius grows to ~60 m over 2.5 s) that lights up geometry edges in cool white as it passes, then fades. Implemented as a material shader patch (`onBeforeCompile` adds a band of emissive light where `abs(distance(worldPos, pulseOrigin) - pulseRadius) < bandWidth`), driven by shared uniforms so all materials react in one place. Cooldown 6 s.
  - If Setu is within 90 m he **hums back** the same phrase from his position (positional audio + a ripple at his location visible through walls). This is the main way to locate him.
  - Singing is loud: dogs and deranged people within 35 m get alerted to your position. Risk vs. reward.
- **Heightened spatial audio**: Web Audio API with HRTF PannerNodes for every source; all sounds are **synthesised procedurally** (oscillators, filtered noise, envelopes). No audio files.

## 6. Systems detail

- **Clock** (`systems/clock.js`): game time from 06:00 day 1 to 06:00 day 2. Drives sky/lighting: day (06–18), dusk (18–20), night (20–05), pre-dawn (05–06). At night, sunlight shafts go out; upper levels keep a few weak **solar lamps** (stored sunlight; half healing rate). Time penalties (vendors, police detention) jump the clock forward. HUD shows `HH:MM` and, once the breach is discovered, "Flood in Xh Ym".
- **Setu** (`systems/setu.js`): placed at one of ~8 candidate hiding spots (mostly G and U, one on L1), chosen by seed. Health decays (faster near smog or water). Find him: get within 2.5 m and press **E** → give injection (his health refills to 100 and then decays at a third of the rate), and he now **follows** Mithi (simple follow AI: path toward her along her recent breadcrumb trail, teleport to her if > 25 m behind or stuck; dangers can target him too). Story lines tied to his health at 75/50/25/10%.
- **Breach discovery** (`systems/story.js`): ~12 story fragments placed on the map (glowing phones, radio broadcasts, graffiti, an engineer's voice log, a leaked builder memo, water seeping through a tunnel wall). 4 of them are **breach clues**. Reading any 3 breach clues (or reaching the breach chamber in U) sets `breachKnown`, reveals the flood countdown, and adds the objective "Warn the authorities at the Control Tower (L3)". Other fragments explore the deck's themes: construction greed, inequality, air, health, resources. Fragments show as a short text card plus a spoken-style audio cue.
- **Warning the authorities**: interact with the Control Tower terminal on L3 while `breachKnown`. Sets `cityWarned`.
- **Vendors** (`systems/vendors.js`): 6 candidate vendor spots (G and L1), 4 active per run. Rolled as in §2.
- **Hazards** (`systems/hazards/*.js`, phase 4), all seeded, with magnitude variance per run:
  - *Feral dogs*: packs of 2–4 on G/U. Wander → hear/see → chase → bite (−1 ray, knockback, 1.5 s cooldown). They can't climb stairs or ladders, so going up is the escape. Barks produce sound ripples.
  - *Police drones*: patrol L1/L2 along routes with a visible spotlight cone. Spotted for 1.2 s → **detained**: screen fade, the clock jumps +1 h, Mithi is released at the nearest G-level checkpoint. Surveillance cameras at gates have static cones; a camera spotting you calls the nearest drone.
  - *Collapsing infrastructure*: 4–7 walkway slabs rolled as unstable. Stepping on one: cracking sound, shake, falls 1.2 s later (dynamic collider drops). Gone for the rest of the run.
  - *Deranged characters*: wanderers in dark G areas. Approach when close, grab (lose 1 ray or 30 min), then wander off. Can be avoided; singing calms them (they stop and listen) unless already grabbing.
  - *Poor air (smog)*: volumes (visible brownish haze) that multiply health decay ×3 and cough audio.
  - *Flooding*: water plane in U rises over the run; after `breachKnown` + 18 h, it starts rising on G too. Deep water (> 1 m) drains 1 ray / 5 s.
- **Health gates**: see §2.

## 7. Endings (deck slide 14)

Checked in `systems/endings.js`:

1. **Dawn reunion**: Setu is following, `cityWarned` is set, and Mithi reaches the Sunrise Bridge → cinematic: camera eases toward the east, clock fast-forwards to 06:00, sun rises over the sea, Setu's line *"Didi… is that it? Is that the sun?"*, text: "The city was warned in time. Millions were evacuated." Then credits/replay.
2. **Setu found, city lost**: Setu is with Mithi but the clock reaches 06:00 without `cityWarned` (or she reaches the bridge without warning and the flood hits) → bittersweet ending, "the game begins again".
3. **Setu lost**: Setu's health hits 0 → ending text, "the game begins again".
4. **Mithi dies**: rays hit 0 → ending, "the game begins again".

Each ending screen has a **Play again** button (new random seed) and shows run stats (time, fragments found, D-shots bought).

## 8. Testing (every phase)

- Serve and test headlessly: `NODE_PATH=$(npm root -g) node tools/smoke.mjs --shots tools/shots.json`. This opens `index.html?autostart=1&debug=1&seed=1`, saves screenshots to `shots/` (git-ignored), and **fails on any console error, page error or failed request**. Always look at the screenshots you produce (read the PNG files) to make sure the scene looks right, not just that it runs.
- Use the `window.__grahan` debug API in shot steps to teleport around, set the time, trigger systems and print `state()` to assert behaviour.
- Keep `tools/shots.json` as a growing regression tour of the city and systems; each phase appends steps for what it added (don't delete earlier useful ones).
- SwiftShader is slow; FPS numbers in headless are not meaningful. Judge performance by draw calls (`renderer.info.render.calls`) and triangle count, which `state()` should report.

## 9. Phases

Each phase is done by one agent, in order, and must finish with: smoke test passing, screenshots checked, `docs/PLAN.md` §10 progress log updated with what was built and any deviations, and a git commit on the current branch (don't push).

1. **Foundation**: `index.html` + import map, `game.js`, events, rng, input (keyboard/mouse/pointer lock), physics (walkables, ramps, solids, spatial hash, dynamic colliders), FPS player controller (walk/sprint/jump/gravity/step-up/fall damage hooks), main loop and state machine, URL params, debug API, a **small test arena** (floor, boxes, a ramp, stairs, a moving lift) to prove the controller, and `tools/shots.json`.
2. **The city**: `map.js` as data for all five levels with the connections and landmarks in §3, `builder.js` (merged/instanced meshes + colliders), lifts with E-interaction, health-gate *objects* (visual + collider + an interaction hook; the health check itself can read `game.player.rays` with a default), sunlight shaft *volumes* (visual + queryable `isInSunlight(pos)`), sky/fog/lighting with a time-of-day hook, sea boundary, respawn on fall. Replace the arena as the default scene (keep it reachable via `?arena=1`). Shot tour of every level and landmark.
3. **Core loop**: clock + day/night, health rays (decay by level, sun healing, gates enforcing thresholds, fall damage, death), Setu (placement, decay, story lines, find + inject + follow), vendors + D-shot dialog, basic HUD (sun-ray glyph, Setu heartbeat meter, clock, objective line, interaction prompts, message feed), basic endings 3 and 4 plus a placeholder for 1 and 2.
4. **Perils**: all hazards in §6 with seeded population and variance, their visuals, and their effects on Mithi *and* following Setu; smog and flooding.
5. **Senses and story**: procedural audio engine with HRTF, ambient soundscape per level, sound ripples, Sing/echolocation shader, Setu humming back, story fragments with breach discovery, Control Tower warning, all four endings with the dawn cinematic.
6. **Polish and mobile**: title screen in the deck's style (title "GRAHAN", subtitle "the search for sunrise in 2049 Mumbai", silhouetted skyline), how-to-play, pause/settings (volume, mouse sensitivity, invert Y, game length), **touch controls** (left virtual stick, right-side drag-to-look, buttons for jump/sprint/interact/sing), responsive HUD, performance pass, a bug sweep across all systems, and a `README.md`.

## 10. Progress log

(Each phase appends a short entry here.)
