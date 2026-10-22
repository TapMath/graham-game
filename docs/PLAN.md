# Grahan: build plan

Sources: `docs/Grahan Game Presentation.pdf` (the pitch deck: mechanics) and `docs/Grahan Full Story.pdf` (the story, *Grahan (Children of the Sun)* by Sarat T. Rao: characters, places, beats). Where they conflict, **§1b (story integration) wins**. This file turns them into a buildable spec for a **first-person, in-browser** game, then splits the build into phases. Every phase agent reads this whole file first.

## 1. The game in one paragraph

Mumbai, 2049. Towers, flyovers and skywalks are stacked so densely that the ground never sees the sun. Setu, an asthmatic eight-year-old who has never seen a sunrise, climbed the five-level flyover before dawn to see one; the flyover collapsed and he fell, in the maintenance lift, into the tunnels below. He needs his pills and inhaler, and his blind 18-year-old sister **Mithi** carries them. You play Mithi in first person. Find Setu before his health runs out, survive the city, discover that underground construction has breached the water table (a flood is 24 hours away), warn the authorities, and bring Setu to the eastern bridge so he can see the sunrise.

## 1b. Story integration (from `docs/Grahan Full Story.pdf`; overrides the rest of this file where they conflict)

Read the story PDF (`pdftotext "docs/Grahan Full Story.pdf" -`). The game keeps the deck's 2049 setting and mechanics but takes its **cast, places and beats** from the story, compressed into one playable day: **"a day celebrating light"**, the festival of lights (diyas, marigolds, neon rangoli, fireworks at night), which is bitterly ironic in a city with no sun.

**Inciting event.** Pre-dawn. A five-level flyover junction, built by SURYA Corp with substandard material, collapses onto the slum beneath it (Mithi and Setu's home). Setu (8, **asthmatic**) had snuck out with his friend **Jeetu** to watch the sunrise from the top level. He turned back breathless and took the **maintenance lift** down just as it all fell; the lift smashed down the shaft into the **metro tunnels** below. Mithi had woken from a **vision** (she has second sight: brief flickers of the future), found him gone, stepped outside, and so survived.

**Cast.**
- **Mithi** (player, 18, blind). Sings and plays the flute; her song **calms** dogs and frightened people. Has **second sight**. Wary of people. Carries Setu's **pills and inhaler** (he needs a pill every 8 hours).
- **Setu** (8, asthmatic, found as a baby under the bridge, hence the name). Instinct for electronics. Carries the **mouth organ** Mithi gave him; its sound is his signature. Counts his steps in the dark, a trick learned from Mithi.
- **Jeetu** (Setu's friend, injured in the collapse, found in the hospital). Becomes **Mithi's eyes**: after he joins he follows her, calls out hazards and directions ("Didi, dogs, left!"), and later carries a **torch**. Playable by switching characters (see below).
- **Gautam** (Mithi's friend and former boss). Volunteering at the metro, arrested after fighting the police on her behalf. Optional: bail him out at the police station and he helps (distracts guards at the metro).
- **The actress** (call her **Tara Shahjehan**, wife of the film star **Sameer Shahjehan**, whom both boys idolise). Met at the hospital; her husband needs B+ blood and Mithi is B+. If helped, she becomes the key ally: she can get **permission to reach the bridge** and can get the breach **on TV and radio** (the way to **warn the city**).
- **Aayat** (a girl Setu's age who lives underground). Helps Setu. Knows the air vents.
- **The Big Man** (labour boss underground; call him **Kaalu Seth**) who works children on a **tunnel-boring machine**; he "sells" Setu to another contractor, who takes him to the **underground doctor**.
- Guards, police, nurses, tunnel dwellers, the boys who sell a torch, vendors.

**The deck's flood, tied to the story.** The illegal deep tunnelling (SURYA Corp's contractors, using the tunnel dwellers' child labour) has breached the sea wall's underside; the collapse made it worse. Water is seeping into the lowest tunnels. Breach clues are found underground (the boring machine, seeping walls, a contractor's ledger, a SURYA memo, an engineer's voice note). Warning the city = taking the evidence to **Tara** (she gets it broadcast) **or** to the Control Tower terminal on L3.

**Places the map needs** (in addition to §3): the **collapse site** (rubble of five fallen road decks on the slum, rescue workers, triage tents, a body area; the player spawn), **Mithi's home** (a damaged one-room flat on the slum's edge with the TV whose remote has batteries), the **dead neighbour's flat** (a blue Metro-worker jacket inside), the **hospital** (G/L1, chaotic, wards and an ICU), the **police station** (G), the **metro station** (shut and guarded at G, platforms and tunnels in U), the **maintenance lift shaft with a ladder** down to U (the route Jeetu remembers), the underground **catacomb homes** carved into tunnels (total darkness), the **tunnel-boring machine** site (child labour, the breach is near here), the **underground doctor's clinic**, **air vents** (narrow shafts up to G that only a child fits through), and **the bridge** on the east edge, "the bridge that connects the two islands", where Setu was found as a baby (= the Sunrise Bridge).

**Game flow.** Open, real-time and non-linear, but guided by an **objective chain** that mirrors the episodes. Each objective is optional to the degree it can be bypassed by clever play:
1. *Collapse site (05:40)*: the crash cutscene (roar, shake, dust, screaming). Tutorial: hear a moan under rubble, dig out an old man (hold E). Survivors say Setu and Jeetu went up the flyover; Jeetu was taken to the hospital.
2. *Hospital*: find Jeetu by calling (sing or shout). Optionally give blood for Tara's husband (costs 2 rays; earns Tara's help later). Jeetu joins: "He took the maintenance lift down. Then it all came down."
3. *Getting below*: the metro is guarded. Routes: the maintenance shaft ladder (Jeetu knows it), or the metro entrance in the **Metro jacket** disguise (guards let a "worker" pass unless you run or sing near them), or bail Gautam to distract them. Darkness below needs **light** for Jeetu: buy a torch from the boys (costs rays or time), or take the TV remote's batteries from home (the story's "why didn't we think of this before" moment). Mithi doesn't need light; Jeetu does.
4. *Underground*: dogs (sing to calm them, or feed them), the catacomb homes, Aayat, Kaalu Seth, the contractor, the doctor's clinic. The breach clues are here.
5. *Setu moves on his own timeline* (seeded jitter of about ±1 game hour): metro lift wreck (05:40–09:00) → catacomb homes with Aayat (09:00–14:00) → boring-machine site (14:00–18:00) → the doctor's clinic (18:00–23:00; the doctor partly restores his health) → escapes up an **air vent** to G (≈23:00) → wanders the **triage tents** and body area looking for Mithi (23:00–04:00) → believing her dead, walks to **the bridge** (04:00 onward) and waits. Players who arrive just after he has left get story clues pointing on ("the boy left an hour ago, coughing, asked about a vent"). Mithi can intercept him at any stage. Once found, Mithi gives him a **pill and inhaler** (health refills, decay slows) and he follows her.
6. *The bridge*: the bridge gate needs **Tara's permission** (if she was helped) **or** the L3 health gate route (≥ 8 rays). If Setu is waiting there, Mithi walking onto the bridge triggers his **mouth organ** and the reunion. The best ending is a reunion at sunrise with the city warned.

**Mechanic changes from the story** (these override §5 and §6):
- **Sing calms; it doesn't alert.** Singing calms dogs and deranged or frightened people within 20 m for 25 s (they stop, listen, then wander off). But police and drones treat it as "unregistered singing" (a PA rule): it alerts drones and guards within 40 m. The echolocation wave and Setu's response stay.
- **Setu answers with his mouth organ**, not humming. He also plays it unprompted every few game minutes (weaker, coughing). Mithi can hear it at long range, up to 150 m when it's quiet, with a sound ripple visible through walls. This is the main way to find him.
- **Visions (second sight).** At story moments, when Setu's health crosses 50%, 25% and 10%, and on demand (hold **Q** for 2 s, 2 game-hour cooldown), Mithi gets a 2–3 s **vision**: a glitchy, overexposed, OK-Computer-styled glimpse of the world *seen from Setu's current position* (a second camera render with heavy noise, scanlines, colour bleed and text fragments), plus a caption of what he hears. It hints at where he is without a marker.
- **Setu's health is his breath** (asthma): it falls faster in smog, dust and stale tunnel air, and rises when a pill or inhaler is used or near air vents. Tuned so a player who never finds him loses him at about 03:00, unless the doctor's visit (which happens on his timeline) buys time.
- **Jeetu and character switching** (the deck's "1–3 players: Mithi and Setu's friends", as single-player). Once Jeetu joins, **Tab** switches control between Mithi and Jeetu, and the other one follows (the same follow AI as Setu). As **Jeetu** you see the world normally (sighted rendering, with a torch cone once he has one), move a bit slower (injured), can't sing, can read signs and documents (some breach clues need eyes), and can climb the maintenance ladder. As **Mithi** you perceive by sound, sing, have visions, and are the only one who can calm dogs and comfort Setu. While Jeetu follows Mithi, he widens her perception (fog-far +15 m) and calls out hazards in captions and voice-like blips.
- **Disguise.** The Metro jacket lets you walk past metro guards; running, singing or lingering in a guard's view for more than 3 s blows it ("You're not staff!") → detained (the same as police detention: +1 h, released at a checkpoint, or at the police station if Gautam's subplot is active).
- **Money.** The story uses cash (bail, the torch). Keep the deck's rule that **health is the currency**: prices are paid in rays or in time. "Cash" doesn't exist as a separate resource.

**Endings** (§7 stays, re-skinned with the story's ending): the best ending happens on the bridge at sunrise. Mithi walks out onto the empty-seeming bridge, Jeetu says "Didi, there's no one", the mouth organ plays from the shadows, Setu runs to her, they meet in the middle as the sun breaks through, and Jeetu shouts "Look, Setu, sunrise!" If the city was warned, add a caption: millions were evacuated in time. If Setu reaches the bridge but Mithi doesn't, or arrives too late, that's an ending variant of "Mithi cannot find Setu".

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

## 3b. Art direction and tone (references: Blade Runner, OK Computer, gothic, cyberpunk)

The deck's look (hazy ochre above, teal gloom below) blended with four touchstones. Every phase that adds visuals, sound or text follows this.

- **Blade Runner.** Perpetual smog and **drizzle on G and U** (cheap instanced rain streaks near the camera, drips from flyover undersides, wet reflective ground via high metalness/low roughness on street materials). Sodium-orange lamps against cold cyan neon. Huge **animated advertising screens** on tower faces (canvas textures cycling slogans), slow **searchlights** sweeping the haze, distant flying-traffic light trails between towers, steam vents. Music is slow, sad analogue-synth pads (Vangelis-like) under everything.
- **OK Computer.** Alienation and gentle, sterile dread. A calm synthetic **municipal PA voice** makes announcements at intervals ("Remain calm. Sunlight is a privilege, not a right. Report unregistered singing. Have a pleasant day."), via `speechSynthesis` when available with on-screen captions either way (captions are mandatory; the voice is optional). The UI borrows from the album art: pale blue-white, thin sans-serif, **safety-card pictograms** (stick figures for hints and gates), and small scrawled annotations and strikethroughs, as if someone wrote over corporate text. Occasional **glitches** (text scrambling, scanline flicker) when health is low or near surveillance. Music cues use detuned electric-piano and mellotron arpeggios.
- **Gothic.** The city as a cathedral of concrete. Towers have buttress fins and pointed crowns like spires, and flyover undersides are **ribbed vaults with pointed arches** (deck slide 12). Upper-level elite towers have stained-glass coloured window bands. Add crows on railings, gargoyle-like statues of corporate founders, the dead tree, street shrines with flickering diyas and marigolds. Use chiaroscuro: deep blacks with single beams of light. The sunlight shafts should feel **sacred**, like light through a cathedral window.
- **Cyberpunk.** High tech, low life. The sun is literally owned: **SURYA Corp** (the antagonist conglomerate, also the builder behind the illegal deep construction that caused the breach) sells sunlight subscriptions to the upper levels. Neon signs in **Devanagari and English** (e.g. "सूर्य SURYA — the light you deserve", "D-SHOT", "पानी", "दवा CLINIC", "NO SINGING"), surveillance drones, camera domes, bio-scanner gates, cables and pipes everywhere, black-market vendors under tarps lit by phone screens.
- **Palette.** Below (U/G): near-black, teal and cyan, sodium orange, magenta neon accents. Middle (L1/L2): smoky grey-violet, neon, the first warm light. Above (L3): ochre and gold haze, white stone, gardens. Dawn ending: pink-gold sun over the sea, the first clear sky in the game.
- **Writing voice.** Spare and melancholy. Corporate and government text is sterile and euphemistic; the human voices (Mithi, Setu, vendors, strangers) are warm, Mumbai-flavoured English with Hindi/Marathi words ("Didi", "bhai", "chal", "arre"). Mithi's lines are sensory: sounds, smells, heat, never sights.

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
3. **Core loop**: clock + day/night, health rays (decay by level, sun healing, gates enforcing thresholds, fall damage, death), Setu (moving along the §1b timeline between map spots with seeded jitter, breath-health decay, story lines, find + pill/inhaler + follow), vendors + D-shot dialog, basic HUD (sun-ray glyph, Setu heartbeat meter, clock, objective line, interaction prompts, message feed), basic endings 3 and 4 plus a placeholder for 1 and 2. **Plus a third-person view toggle** (key **V**, user request): a low-poly Mithi model (long dark dress/kurta, braid, white cane; simple walk animation by swinging limbs procedurally) and a low-poly Setu model (small boy, also used for the following Setu); in third person the camera sits behind/above the player's shoulder (~3.5 m back, 1 m up), smoothly follows yaw/pitch, and pulls in when a wall is between it and the player (use `physics.raycast`). Switching is instant with a short ease; the movement/controls stay identical; first person stays the default. Expose `__grahan.set('view', 'first'|'third')` for tests.
4. **Perils**: all hazards in §6 (plus metro **guards** with view cones, ready for Phase 6's disguise rule) with seeded population and variance, their visuals, and their effects on Mithi *and* following Setu; smog and flooding.
5. **Senses and sound**: procedural audio engine with HRTF, ambient soundscape per level (with the §3b music direction), sound ripples, Sing (the echolocation shader, calming dogs and people, alerting police per §1b), Setu's mouth organ (answering and unprompted), **visions** (second-camera glitch render from Setu's position), the municipal PA announcer with captions.
6. **Story and cast**: the §1b story layer. The NPC cast (Jeetu, Tara, Gautam, Aayat, Kaalu Seth, the contractor, the doctor, guards, nurses, rescuers, tunnel dwellers, the torch boys) as simple low-poly figures with dialogue cards. The objective chain, Setu's timeline and his trail clues, Jeetu joining with **Tab character switching**, the torch and remote batteries, the Metro jacket disguise, Gautam's bail, Tara's blood donation and her permission and broadcast, story fragments and breach discovery, the Control Tower alternative, the opening collapse cutscene, and all four endings with the bridge reunion at sunrise.
7. **Polish and mobile**: title screen in the deck's style (title "GRAHAN", subtitle "the search for sunrise in 2049 Mumbai", silhouetted skyline, §3b look), how-to-play using safety-card pictograms, pause/settings (volume, mouse sensitivity, invert Y, game length, captions), **touch controls** (left virtual stick, right-side drag-to-look, buttons for jump/sprint/interact/sing/switch/view), responsive HUD, performance pass, a bug sweep across all systems, balancing a full playthrough, and a `README.md`.

## 10. Progress log

(Each phase appends a short entry here.)

### Phase 1: Foundation (done)

**What exists.** A static, no-build game shell that boots into a test arena with a working first-person controller. Run it with any static server (`index.html?autostart=1&debug=1&seed=1`). Smoke tour: `NODE_PATH=$(npm root -g) node tools/smoke.mjs --shots tools/shots.json` (passes, 0 console errors; 4-6 draw calls, ~2.5k triangles in the arena).

**Files.**
- `index.html` (import map, `#game` canvas, `#hud` container for later widgets, `#overlay` menu/pause, `#debug-hud`), `src/styles.css`.
- `src/main.js`: boot, system registration (this is where Phase 2 swaps the world system), fixed-step loop. Simulation runs at a fixed 1/60 s step decoupled from rendering (max 0.25 s catch-up per frame), so slow headless frames do not change behaviour.
- `src/game.js`: `Game` (scene, camera, renderer, `physics`, `input`, `events`, `rng`, `params`, `materials`, `flags`, `mode`, `time`). `game.addSystem(name, {init(game), update(dt, game), reset?(game)})` (registration order is update order), `game.system(name)`, `game.setMode('menu'|'playing'|'paused'|'ending')` (emits `mode:changed`), `game.wait(seconds)` (Promise on simulation time), `game.renderStats()`. `STEP` is exported.
- `src/core/`: `events.js` (`on` returns an unsubscribe fn, `once`, `off`, `emit`; handlers get `(data, type)`; `'*'` sees everything), `rng.js` (`Rng`: `next/range/int/pick/chance/shuffle/fork(label)`; use `game.rng.fork('setu')` so systems do not disturb each other's streams), `params.js`, `input.js`, `physics.js`, `player.js`.
- `src/world/`: `levels.js` (`LEVELS`, `levelAt(y)`), `materials.js` (shared `lit` / `emissive` / `building` materials, procedural concrete + window textures; `materials.all` is the list to patch for the Sing shader), `builder.js`, `lift.js`, `sky.js`, `arena.js`.
- `src/ui/overlay.js`, `src/ui/debughud.js`, `src/debug.js`.
- `tools/shots.json`: regression tour (movement, step-up, blocked box, jump onto box, wall, jump height, ramp, stairs up/down, lift board/rise/exit/carry-down, tower fall + fall event + respawn hook, void respawn, raycast, 5000-box physics perf, overview shots). Append to it; do not delete.

**Physics API (`game.physics`, `src/core/physics.js`).**
- `addBox([x,y,z],[x,y,z], {solid=true, walkable=true, dynamic=false, tag, userData})` and `addRamp({x0,z0,x1,z1, dir:'+x'|'-x'|'+z'|'-z' (direction the surface rises), yLow, yHigh, bottom}, opts)` return a collider record `{id,type,tag,min,max,pos,enabled,dynamic,...}`.
- Static colliders go in a uniform XZ grid (8 m cells; spatial hash); colliders spanning more than 64 cells go to a `large` list. Measured: 5000 boxes, 20000 `groundHeightAt` calls in ~22 ms. Dynamic colliders live in a short separate list.
- `remove(c)`, `setEnabled(c, bool)` (gates, retractable bridges), `setOffset(c, x, y, z)` (dynamic only; moves the collider and updates `c.pos`, the accumulated translation).
- `groundHeightAt(x, z, feetY, step=0.6, radius=0.35)` returns the highest walkable top <= feetY+step (or -Infinity) and leaves the collider in `physics.groundCollider`. `slideMove(p, dx, dz, feetY, stepH)` moves a footprint with sliding (sets `hitX/hitZ`), `ceilingAt(...)`, `query(minX,minZ,maxX,maxZ)` (returns a SHARED array, overwritten by the next query/raycast), `raycast(origin, dir, maxDist, filter?)` returns `{dist, collider, point}` and handles ramp surfaces (use for line of sight). `physics.killY = -40`.
- `PLAYER` constants: radius 0.35, height 1.7, eye 1.6, stepHeight 0.6, airStep 0.12 (no stepping up mid-air).
- Moving platforms: create the collider with `{dynamic:true}` and call `setOffset` each frame (see `Lift`). The player compares `ground.pos` to the value it stored last frame, so it is carried regardless of system order (lifts still update before the player).

**Player (`game.player`, `src/core/player.js`).** Fields: `pos` (feet), `vel`, `yaw` (0 faces -Z, +yaw turns left), `pitch`, `rays` (placeholder 7, `maxRays` 12; Phase 3 health owns it), `onGround`, `ground`, `level`, `lastSafe`, `frozen`, `speedScale`. Methods: `teleport(x,y,z,yaw?)`, `setLook`, `respawn(reason)`, `reset()`. `MOVE` and `fallDamage(height)` are exported (free up to 9 m, then 1 ray per 4 m or part thereof: 12 m = 1). Step-up 0.6 m with smoothed camera, coyote time and jump buffer; jump apex is about 1.1 m (so the 1.4 m box needs a ledge or stairs, the 0.9 m box is jumpable). Last-safe position is recorded after standing 0.5 s on a static collider with floor on all four sides within 0.7 m (so never a ledge edge).

**Events (all on `game.events`).** `player:jump {}`, `player:land {height, speed}` (falls >= 0.5 m), `player:fall {height, damage}` (falls >= 2 m; `damage` is the ray cost, 0 if under 9 m; Phase 3 should subscribe and subtract `damage`), `player:void {cost:1}` then `player:respawn {reason,x,y,z}` (fell below `killY`; Phase 3 subtracts `cost`), `player:interact {}` (E) and `player:sing {}` (Q) edges, `lift:moving {id,target}`, `lift:arrived {id,y}`, `input:lock {locked}`, `input:lockerror`, `mode:changed {mode,prev}`, `game:init`, `game:reset`, `debug:setTime {hour}`.

**Input.** `game.input`: `action(name)`, `pressed(name)` (edge since last step, survives taps shorter than a step), `setKey(code, down)` (for touch buttons), `addLook(dx, dy)` (for touch drag), `moveAxis()`, `sensitivity`, `invertY`, `locked`, `requestLock()`. Actions are in `ACTIONS` (WASD, Shift, Space, E interact, Q sing, arrow keys look). Keyboard works with or without pointer lock; mouse look only while locked.

**World contract.** The active world system must set `game.world = {name, spawn:{x,y,z,yaw}, bounds}` in `init` (before the player system inits). Phase 2: write the city as a system registered in `main.js` in place of `arenaSystem` (keep `arenaSystem` behind `?arena=1`; `params.arena` is already parsed). Use `Builder` (`src/world/builder.js`): `box(min,max,{color,mat,solid,walkable,visual,tag})`, `boxC(center,size,opts)`, `ramp(...)`, `stairs({x,z,y,dir,steps,rise,run,width,bottom})` (x,z is the centre of the low edge), `finish()` merges per material (one draw call each) and adds to the scene. `mat` is `'lit'` (concrete + vertex colour), `'emissive'` (unlit glow) or `'building'` (window texture). UVs are world-scaled (4 m tile for lit, 12 m for building windows). It does not yet do InstancedMesh; add that for repeated props. Lifts: `game.lifts.add({id, center:[x,z], size, yBottom, yTop, speed, dwell, auto})`; `lift.goTo('top'|'bottom'|y)`, `lift.toggle()` (what E-interaction should call), `lift.auto`. Sky/fog/lights: `game.sky.setPalette({horizon, zenith, fog, fogNear, fogFar, sunColor, sunIntensity, hemiIntensity, ...})` (Phase 3 clock should drive it).

**Debug API (`window.__grahan` with `?debug=1`; class `DebugApi` in `src/debug.js`, also `game.debug`).** `state()`, `teleport(x,y,z,yawDeg?)`, `look(yawDeg,pitchDeg)`, `setTime(h)`, `set(key,value)` (built-ins `rays`, `freeze` (free camera), `speed`, `hour`; unknown keys land in `game.flags`), `do(name,...args)`, `ray(origin,dir,max)`, `fps()`, `events(type?)` / `clearEvents()` (event log, handy for asserting `player:fall`). Test helpers: `run(keys, seconds)` is SYNCHRONOUS and deterministic (steps the sim, returns `{state, minY, maxY, moved}`), `press(code, ms)` is async (real KeyboardEvents held for ms of simulation time, returns a Promise that the smoke harness awaits), `hold`/`release`, `step(seconds)`. Extend from your system's `init`: `game.debug.addState('setu', game => ({...}))` (shows up as `state().setu`), `addSetter(key, (game, v) => ...)`, `addAction(name, fn)`. `state()` already reports pos, level, rays, onGround, yaw/pitch, vel, groundTag, lastSafe, flags, lifts, collider count and render stats (calls/triangles); `setu` and `clock` are `null` placeholders for Phase 3.

**Arena (`src/world/arena.js`).** 120 m square, 4 m tile grid floor, perimeter walls, backdrop towers. Step-up boxes (0.25, 0.5, 0.9, 1.4, 2.2 m) at z=5..8; ramp (x=-14, z=-8 to -26, 4.8 m rise) to platform A; stairs (x=16, 16 steps) to landing B; bridge between them; auto-cycling lift at (0,-30.5) joining ground and the bridge; second stair flight from B to a 12 m tower (fall-damage ledge, drop gives `damage:1`). Spawn (0,0,18) facing -Z.

**Deviations / notes.**
- `player:fall` fires for every fall >= 2 m (with `damage` possibly 0), not only damaging ones; use `damage`. `player:land` is the lighter-weight hook for footstep/landing sounds.
- Holding Space does not auto-bunny-hop; each jump needs a fresh press.
- Sky is a vertex-coloured dome mesh that follows the camera (not `scene.background` image), palette set through `game.sky.setPalette`.
- The test harness runs the page's own loop concurrently with `run()`/`step()` (JS is single threaded, so each eval is atomic, but the live loop advances the sim between evals). Do comparisons inside a single eval.
- Not done on purpose (later phases): touch input, audio, real HUD, the clock, health/ray logic, lift E-interaction prompt, InstancedMesh props, sea boundary.
