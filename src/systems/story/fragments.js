// Story fragments (PLAN 1b, 6, 3b). Thirteen glowing finds at `world.fragmentSpots`: phones, radios, graffiti, a voice
// recorder, a ledger, a weeping wall. Five are breach clues (`tag: 'breach'`): reading three of them (or reaching the breach
// chamber) calls `game.story.markBreachKnown()`.
//
//   game.fragments.open(id, {as:'mithi'|'jeetu', instant})   show a fragment card (what E does at a spot)
//   game.fragments.close()
//   game.fragments.found / read / clues                        Sets of ids: opened at all / actually read / breach clues read
//   game.fragments.defs                                        the text, by id
// Events: `fragment:read {id, tag, count, clues, as}`, `fragment:touched {id}` (a clue that needs eyes, opened as Mithi).
// Flags written: `fragmentsFound` (how many were opened), `breachEvidence` (fallback when there is no inventory).
// A fragment with `needsEyes` can only be read while `game.party?.active === 'jeetu'`; as Mithi she feels the paper, pockets it
// (evidence still comes with it) and the card says so. Audio fragments (radios, the voice note, the pump alarm) are heard by her.
//
// The card is the OK Computer collage of PLAN 3b: pale paper, typewriter text revealed by simulation time, a pictogram, scrawled
// annotations and strikethroughs. ~~word~~ strikes, **word** is circled in red, [[word]] is redacted, __word__ is bold.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ensureStyles, esc, STICK_FIGURE, STICK_LISTEN, STICK_READ, STICK_HAND } from './ui.js';

export const FRAGMENTS = [
  {
    id: 'frag-phone-rubble', title: 'Handset // screen cracked', source: 'Rubble, Sector Four', mode: 'audio',
    mithi: 'It buzzes against the stone, again and again. A mother, calling a phone under a ton of concrete.',
    say: 'You have fourteen missed calls from Mummy.',
    text: 'VOICE ASSIST: "You have fourteen missed calls from MUMMY."\n\nMUMMY  04:58   beta, are you home? the bridge is shut again\nMUMMY  05:20   it is the festival, all the lights are on up there. you said not to worry\nMUMMY  05:41   Bunty reply\nMUMMY  05:41   ~~Bunty~~\nMUMMY  05:43   **Bunty**\n\n[ 14 missed calls ]',
    scrawl: ['someone should answer'],
  },
  {
    id: 'frag-graffiti-slum', title: 'Wall, Slum Row', source: 'Paint, thick and cracked', mode: 'touch',
    mithi: 'Paint, built up in ridges. Her fingers read the letters the way they read a face.',
    text: 'SURYA SELLS THE SUN\nWE SELL OUR LUNGS\n\n~~ROSHNI~~ रोशनी  HAQ HAI\n(light is a right)\n\n[ below it, a child\'s sun, drawn with a smile.\n  someone has added a price tag to it ]',
    scrawl: ['who owns the morning?'],
  },
  {
    id: 'frag-radio-bazaar', title: 'Stall radio, turned up', source: 'The Bazaar, Level 1', mode: 'audio',
    mithi: 'A stallholder\'s radio, loud enough to drown out something else.',
    say: 'Air quality advisory. Level three: good. Level two: acceptable. Ground: not applicable.',
    text: '...AND NOW THE SURYA FESTIVAL OF LIGHTS SALE.\nThree months of Upper Deck daylight FREE with every annual plan.\n\nAIR QUALITY ADVISORY\n   Level Three ........ Good\n   Level Two .......... Acceptable\n   Ground ............. ~~Poor~~ Not Applicable\n\n...the Authority regrets the structural event in Sector Four.\nThere is no cause for alarm.\nThere is only an __event__.',
    scrawl: ['not applicable = us'],
  },
  {
    id: 'frag-poster-tree', title: 'Poster, with raised tactile strip', source: 'The dead tree, courtyard', mode: 'touch',
    mithi: 'Glossy paper peeling in the damp. A strip of raised dots along the bottom: the Municipal Code requires one.',
    text: 'FREE LUNG-HEALTH CAMP  --  BRIGHT LIVES INITIATIVE\nBreathless?  Wheezing?  Tired all the time?\n\nYou are not sick.\nYou are **UNDER-LIT**.\n\nTen minutes of daylight a day. Ask your SURYA representative.\n(Subscribers only. Terms apply. Ground-level residents may join the queue.)',
    scrawl: ['or under-paid', 'my son coughs all night'],
  },
  {
    id: 'frag-note-clover', title: 'Note, pinned to a pillar', source: 'Under the cloverleaf', mode: 'touch',
    mithi: 'Cardboard, a ballpoint pressed so hard it went through in places. She reads the dents.',
    text: 'MA --\nI went down the tunnel with Pinky\'s papa.\nHe says there is work.\n40 rupees and one roti a day.\nPinky\'s brother gets 60.\nBack by the bell.   Don\'t tell Papa.\n\n                              -- R.  (9)',
    scrawl: ['which bell?', 'he is not back'],
  },
  {
    id: 'frag-memo-site', title: 'Memo // internal', source: 'SURYA Corporation, site office', mode: 'visual', needsEyes: true, evidence: true,
    blind: 'A thick letterhead, embossed with the SURYA sun. Under it only ink, and she cannot read ink. Jeetu could. She folds the pages into her bag anyway.',
    mithi: 'Good paper. Expensive. The kind that is never meant to be found.',
    text: 'SURYA CORPORATION  --  INTERNAL  --  [[CONFIDENTIAL]]\nRE: PHASE C DEEP BORING, SEA WALL SECTOR S4-S7\n\nGeotech flags water ingress at chainage 4+300:\n"persistent seepage under positive pressure."\n\nRecommendation: **CONTINUE**.\nCost of delay (litigation, festival schedule) exceeds\nthe cost of remediation.\nLabour: Lower Settlement. No permits required.\nDo NOT file with the Municipal Authority.\n\n-- M. Rao, Director (Underground)',
    scrawl: ['pressure = the sea', 'no permits. no names.'],
  },
  {
    id: 'frag-voicelog-metro', title: 'Recorder 03 // voice note', source: 'Metro platform, Underground', mode: 'audio', breachClue: true,
    mithi: 'A small recorder wedged behind a pipe. A man\'s voice, close to the microphone, tired.',
    say: 'Third complaint this month. The pumps can\'t keep up. It is not seepage. It is the sea, coming in slowly, the way debt does.',
    text: 'ENGINEER\'S VOICE NOTE (RAHUL)  --  DAY 212\n\n"Third complaint this month. The pumps at the sump\ncan\'t keep up. The sea wall\'s footings sit below the\nbore line. I wrote it down. They told me to stop recording.\n\nIf you find this: it is not seepage.\nIt is the sea, coming in slowly,\nthe way __debt__ does.\n\n...They said the festival comes first.\n...Tell my wife I tried."',
    scrawl: ['the way debt does'],
  },
  {
    id: 'frag-seep-tunnel', title: 'The wall is weeping', source: 'West service tunnel, Underground', mode: 'touch', breachClue: true,
    mithi: 'Cold. Not dripping: a thin steady sheet over the concrete. She touches her fingertip to her tongue.',
    text: 'THE WALL IS WEEPING.\n\nCold. Not a drip: a thin, steady sheet over the concrete,\nand under your palm the whole surface hums with it.\nYou touch a fingertip to your tongue.\n\n**Salt.**\n\nBeside it, scored into the concrete with a nail, four notches,\neach one wider than the last:\n    |    ||    ||||    ||||||||',
    scrawl: ['it doubles', 'the sea is inside the wall'],
  },
  {
    id: 'frag-pumps-chamber', title: 'Pump station 3 // automated', source: 'The breach chamber', mode: 'audio', breachClue: true,
    mithi: 'The room breathes. A machine says the same thing again and again, to nobody.',
    say: 'Intake exceeds capacity. Footing seepage four thousand one hundred litres per minute. Rising. This line is not monitored.',
    text: 'PUMP STATION 3  --  AUTOMATED ANNOUNCEMENT\n\n"INTAKE EXCEEDS CAPACITY.\n FOOTING SEEPAGE: 4,100 LITRES PER MINUTE. RISING.\n PLEASE CONTACT THE SURYA SITE OFFICE.\n THIS LINE IS NOT MONITORED."\n\nLOG   18:42   ALARM MUTED   (user: K. SETH)\n      18:57   ALARM MUTED   (user: K. SETH)\n      19:11   ALARM MUTED   (user: **K. SETH**)',
    scrawl: ['they muted the sea', 'four thousand litres. a minute.'],
  },
  {
    id: 'frag-ledger-boring', title: 'Ledger // K. Seth & Sons', source: 'The boring machine, Underground', mode: 'visual', needsEyes: true, evidence: true, breachClue: true,
    blind: 'A hard-backed book, damp pages, a smell of kerosene and sweat. A tight column of figures she cannot see. She tucks it into her bag. Jeetu will read it.',
    mithi: 'It smells of kerosene and sweat. Someone counted something very carefully in here.',
    text: 'CONTRACTOR\'S LEDGER  --  LOWER SETTLEMENT\n\n  Hands, ages 7-13 ......... 41    @ Rs 40/day + roti\n  Hands, ages 14+ .......... 12    @ Rs 90/day\n  Pumps (rented: SURYA) .... Rs 2,10,000\n  Inspector K.M., to certify "dry" .. Rs 2,00,000 / month\n  Penalty for stopping the machine .. [[            ]]\n\nNOTE: bell at six, bell at six.\nNobody counts the ones who do not come back up.',
    scrawl: ['children', 'Rs 40. a day.'],
  },
  {
    id: 'frag-garden-solar', title: 'Brass plaque, engraved', source: 'Roof garden, Upper Decks', mode: 'touch',
    mithi: 'Cool brass, letters cut deep enough to read with a fingertip. Warm air, flowers, a sun that does not hurt.',
    text: 'THIS GARDEN IS SPONSORED BY THE MEHRA FAMILY.\nSunlight kindly stored for the residents of the Upper Decks.\nLower-level visitors are asked to admire from below.\n\n   Tulsi ........ 8 hours\n   Roses ........ 8 hours\n   Staff ........ ~~8~~',
    scrawl: ['staff: 0 hours'],
  },
  {
    id: 'frag-overlook-ad', title: 'Billboard, speaking', source: 'The East Overlook, Flyover', mode: 'audio',
    mithi: 'A billboard that speaks in a warm, expensive voice, to a road with no one on it.',
    say: 'Surya. The light you deserve. Dawn Premium: guaranteed sunrise at six oh two, from the Sunrise Bridge. Not a subscriber? The sun will rise anyway. Terms apply.',
    text: 'SURYA  --  THE LIGHT YOU DESERVE\n\nDAWN PREMIUM\nGuaranteed sunrise 06:02 from the Sunrise Bridge.\nRs 9,999 / month.   Priority seating.\n\nNot a subscriber?\nThe sun will rise anyway.\n(Terms apply. Not for you.)',
    scrawl: ['the sun was free', 'it still is'],
  },
  {
    id: 'frag-clover-radio', title: 'Taxi radio', source: 'The Cloverleaf, Flyover', mode: 'audio',
    mithi: 'A cab abandoned with its door open and its radio on, talking to the empty seats.',
    say: 'Hairline cracks noted on four further flyovers. The Authority advises motorists to proceed with optimism. Fireworks will go ahead at seven p.m. as scheduled.',
    text: '...TRAFFIC ON THE CLOVERLEAF: MODERATE. HAIRLINE CRACKS NOTED\nON FOUR FURTHER FLYOVERS. THE AUTHORITY ADVISES MOTORISTS\nTO PROCEED "WITH OPTIMISM".\n\n...the collapse in Sector Four is described as an isolated event.\n\n...and the fireworks go ahead at seven p.m. as scheduled.\nLight a diya tonight, Mumbai.\n**Any light will do.**',
    scrawl: ['any light', 'will do?'],
  },
];

// ---------------------------------------------------------------------------------------------- markers
const KIND_COLOR = { story: 0xffd890, breach: 0x9fe8ff };

function box(w, h, d, x, y, z, color, o = {}) {
  const g = new THREE.BoxGeometry(w, h, d).toNonIndexed();
  g.rotateX(o.rx ?? 0); g.rotateY(o.ry ?? 0); g.rotateZ(o.rz ?? 0);
  g.translate(x, y, z);
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.deleteAttribute('uv');
  return g;
}

/** A small unlit model per kind, sitting on the plinth top (local origin = plinth top centre). */
function modelFor(kind, tag) {
  const glow = tag === 'breach' ? 0x9fe8ff : 0xffd080;
  const L = [];
  switch (kind) {
    case 'phone': L.push(box(0.2, 0.025, 0.36, 0, 0.05, 0, 0x222a30, { rx: -0.25 }), box(0.17, 0.005, 0.3, 0, 0.065, 0, 0x7fd8ff, { rx: -0.25 })); break;
    case 'radio': L.push(box(0.36, 0.22, 0.13, 0, 0.12, 0, 0x4a3a2c), box(0.18, 0.14, 0.01, -0.07, 0.12, 0.07, 0x2a2018), box(0.06, 0.06, 0.012, 0.11, 0.15, 0.07, 0xffb347), box(0.012, 0.3, 0.012, 0.14, 0.34, 0, 0x9a9a98, { rz: -0.3 })); break;
    case 'graffiti': L.push(box(0.8, 0.5, 0.03, 0, 0.32, 0, 0x2a2430, { ry: 0.35 }), box(0.62, 0.08, 0.035, 0, 0.42, 0, 0xff4fa0, { ry: 0.35 }), box(0.5, 0.06, 0.035, 0, 0.27, 0, 0xffd45a, { ry: 0.35 })); break;
    case 'poster': L.push(box(0.5, 0.7, 0.02, 0, 0.4, 0, 0xe8e2d0, { ry: -0.3 }), box(0.4, 0.1, 0.022, 0, 0.62, 0, 0x4fe0c0, { ry: -0.3 })); break;
    case 'note': L.push(box(0.3, 0.012, 0.22, 0, 0.04, 0, 0xf0e8b0, { ry: 0.4 }), box(0.18, 0.014, 0.01, 0, 0.05, 0.02, 0x333333, { ry: 0.4 })); break;
    case 'memo': L.push(box(0.36, 0.03, 0.27, 0, 0.05, 0, 0xd0b878, { ry: -0.2 }), box(0.3, 0.012, 0.22, 0.01, 0.075, 0, 0xf4f0e0, { ry: -0.15 })); break;
    case 'voicelog': L.push(box(0.14, 0.07, 0.24, 0, 0.06, 0, 0x2a3034), box(0.04, 0.012, 0.04, 0, 0.1, -0.06, 0xff3a30), box(0.1, 0.01, 0.1, 0, 0.1, 0.05, 0x1a1e20)); break;
    case 'seep': L.push(box(0.05, 0.7, 0.02, -0.12, 0.38, 0, 0x4fb0d8), box(0.04, 0.5, 0.02, 0.0, 0.28, 0, 0x6fd0ff), box(0.05, 0.62, 0.02, 0.13, 0.34, 0, 0x4fb0d8), box(0.5, 0.025, 0.2, 0, 0.02, 0.08, 0x2f7898)); break;
    case 'console': L.push(box(0.52, 0.3, 0.3, 0, 0.17, 0, 0x30383c, { rx: 0 }), box(0.4, 0.2, 0.01, 0, 0.2, 0.155, 0x60ff9a), box(0.1, 0.03, 0.04, -0.15, 0.04, 0.17, 0xff5a40)); break;
    case 'ledger': L.push(box(0.32, 0.07, 0.42, 0, 0.06, 0, 0x5a3a28, { ry: 0.25 }), box(0.28, 0.05, 0.38, 0.005, 0.07, 0, 0xe8dcb8, { ry: 0.25 })); break;
    case 'billboard': L.push(box(0.9, 0.55, 0.03, 0, 0.38, 0, 0x30302c), box(0.82, 0.46, 0.035, 0, 0.38, 0, 0xffb040)); break;
    default: L.push(box(0.2, 0.2, 0.2, 0, 0.1, 0, glow));
  }
  return L;
}

export const HALO_VS = `
attribute float aPhase; attribute float aState; attribute vec3 aColor;
uniform float uTime; uniform float uSize;
varying vec3 vColor; varying float vA;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float d = max(1.0, -mv.z);
  float pulse = 0.78 + 0.22 * sin(uTime * 2.2 + aPhase);
  gl_PointSize = clamp(uSize * pulse * 16.0 / sqrt(d), 3.0, uSize * 1.5);
  vColor = aColor;
  vA = aState * (0.55 + 0.45 * pulse) * (1.0 - smoothstep(55.0, 95.0, d));
  gl_Position = projectionMatrix * mv;
}`;
export const HALO_FS = `
varying vec3 vColor; varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0;
  float a = smoothstep(1.0, 0.0, r); a = a * a;
  float core = smoothstep(0.28, 0.0, r);
  gl_FragColor = vec4(vColor * (0.7 + 0.9 * core), (a * 0.85 + core * 0.4) * vA);
}`;

// ---------------------------------------------------------------------------------------------- parsing and card
function parseMarkup(s) {
  const out = [];
  const re = /(~~.+?~~|\*\*.+?\*\*|\[\[.+?\]\]|__.+?__)/g;
  let last = 0, m;
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ k: 'p', t: s.slice(last, m.index) });
    const tok = m[0], body = tok.slice(2, -2);
    out.push({ k: tok[0] === '~' ? 's' : tok[0] === '*' ? 'circ' : tok[0] === '[' ? 'redact' : 'b', t: body });
    last = m.index + tok.length;
  }
  if (last < s.length) out.push({ k: 'p', t: s.slice(last) });
  return out;
}
const TAGS = { p: ['', ''], s: ['<s>', '</s>'], circ: ['<em class="circ">', '</em>'], redact: ['<span class="redact">', '</span>'], b: ['<b>', '</b>'] };
function renderPartial(segs, n) {
  let html = '', left = n;
  for (const s of segs) {
    if (left <= 0) break;
    const t = s.t.length <= left ? s.t : s.t.slice(0, left);
    left -= t.length;
    html += TAGS[s.k][0] + esc(t) + TAGS[s.k][1];
  }
  return html;
}
const totalChars = (segs) => segs.reduce((a, s) => a + s.t.length, 0);
const SPEED = 78;       // characters per second of simulation time

export class FragmentSystem {
  init(game) {
    this.game = game;
    game.fragments = this;
    ensureStyles();
    this.defs = Object.fromEntries(FRAGMENTS.map((f) => [f.id, f]));
    this.found = new Set(); this.read = new Set(); this.clues = new Set(); this.touched = new Set();
    this.current = null; this._closePending = false;
    this.spots = game.world.fragmentSpots ?? [];
    this._buildMarkers();
    this._buildCard();
    for (const sp of this.spots) {
      const def = this.defs[sp.id]; if (!def) continue;
      game.interactables.add({
        id: 'frag:' + sp.id, pos: { x: sp.x, y: sp.y, z: sp.z }, radius: 2.3, height: 2.4,
        prompt: () => this._prompt(sp, def), enabled: () => !this.current,
        onInteract: () => this.open(sp.id),
      });
    }
    window.addEventListener('keydown', (e) => this._key(e), true);
    const d = game.debug;
    d?.addAction('fragment', (g, id, o) => {
      if (id == null) return { all: FRAGMENTS.map((f) => f.id), found: [...this.found] };
      const sp = this.spots.find((s) => s.id === id || s.id === 'frag-' + id);
      if (sp && o && o.tp) g.player.teleport(sp.x, sp.y, sp.z + 1.4, 0);
      return this.open(sp ? sp.id : id, o ?? {});
    });
    d?.addAction('fragmentClose', () => { this.close(true); return true; });
    d?.addAction('fragmentFinish', () => { this._finish(); return true; });
  }

  reset() { this.found.clear(); this.read.clear(); this.clues.clear(); this.touched.clear(); this.close(true); this._refreshHalo(); }

  _prompt(sp, def) {
    const g = this.game;
    if (def.needsEyes && !this._canSee()) return this.found.has(sp.id) ? 'Feel the paper again' : 'Feel the paper';
    const verb = def.mode === 'audio' ? 'Listen' : def.mode === 'touch' ? 'Read by touch' : 'Read';
    void g;
    return this.read.has(sp.id) ? verb + ' again' : verb;
  }
  _canSee() { return this.game.party?.active === 'jeetu'; }

  // ------------------------------------------------------------------ 3D markers
  _buildMarkers() {
    const game = this.game, parts = [], n = this.spots.length;
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), phase = new Float32Array(n), state = new Float32Array(n);
    this.spots.forEach((sp, i) => {
      for (const g of modelFor(sp.kind, sp.tag)) { g.translate(sp.x, sp.y + 0.75, sp.z); parts.push(g); }
      pos[i * 3] = sp.x; pos[i * 3 + 1] = sp.y + 1.25; pos[i * 3 + 2] = sp.z;
      const c = new THREE.Color(KIND_COLOR[sp.tag] ?? 0xffd890);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      phase[i] = i * 1.7; state[i] = 1;
    });
    if (parts.length) {
      this.model = new THREE.Mesh(mergeGeometries(parts, false), new THREE.MeshBasicMaterial({ vertexColors: true }));
      this.model.frustumCulled = true; this.model.name = 'fragment-models';
      game.scene.add(this.model);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1));
    geo.setAttribute('aState', new THREE.BufferAttribute(state, 1));
    this.haloMat = new THREE.ShaderMaterial({
      vertexShader: HALO_VS, fragmentShader: HALO_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: { value: 0 }, uSize: { value: 54 } },
    });
    this.halo = new THREE.Points(geo, this.haloMat);
    this.halo.frustumCulled = false; this.halo.name = 'fragment-halos';
    game.scene.add(this.halo);
  }

  _refreshHalo() {
    if (!this.halo) return;
    const st = this.halo.geometry.attributes.aState;
    this.spots.forEach((sp, i) => { st.setX(i, this.read.has(sp.id) ? 0.28 : this.found.has(sp.id) ? 0.55 : 1); });
    st.needsUpdate = true;
  }

  // ------------------------------------------------------------------ the card
  _buildCard() {
    const el = this.el = document.createElement('div');
    el.id = 'frag'; el.hidden = true;
    document.body.appendChild(el);
    el.addEventListener('click', () => this._advance());
  }

  /** Open a fragment card. opts.as: 'mithi' | 'jeetu' overrides who is looking (tests); opts.instant skips the typewriter. */
  open(id, opts = {}) {
    const game = this.game, def = this.defs[id];
    if (!def) return false;
    if (this.current) this.close(true);
    const sees = opts.as ? opts.as === 'jeetu' : this._canSee();
    const blind = !!def.needsEyes && !sees;
    const sp = this.spots.find((s) => s.id === id);
    const tag = sp?.tag ?? (def.breachClue ? 'breach' : 'story');
    const n = FRAGMENTS.findIndex((f) => f.id === id) + 1;
    const text = blind ? def.blind : def.text;
    const segs = parseMarkup(blind ? def.blind : text);
    const first = !this.found.has(id);
    this.current = { id, def, segs, blind, sees, tag, chars: opts.instant ? 1e6 : 0, total: totalChars(segs), first, done: false };
    this.found.add(id);
    game.flags.fragmentsFound = this.found.size;

    const fig = def.mode === 'audio' ? STICK_LISTEN : def.mode === 'touch' || blind ? STICK_HAND : def.mode === 'visual' ? STICK_READ : STICK_FIGURE;
    const label = blind ? 'felt, not read' : sees && def.mode === 'visual' ? 'read aloud by Jeetu' : def.mode === 'audio' ? 'heard' : def.mode === 'touch' ? 'read by touch' : 'read';
    this.el.className = def.mode === 'audio' ? 'fr-card-audio' : '';
    this.el.innerHTML =
      `<div class="fr-paper"><div class="fr-head">${fig}<div class="fr-src">${esc(def.source)}<i>${tag === 'breach' ? 'SUBJECT: WATER / BORING / SURYA' : 'FOUND ITEM'}</i></div><div class="fr-n">${String(n).padStart(2, '0')} / ${FRAGMENTS.length}</div></div>` +
      `<div class="fr-title">${esc(def.title)}</div><div class="fr-body"></div>` +
      (blind ? '' : `<div class="fr-scrawls">${(def.scrawl ?? []).map((s) => `<span class="fr-scrawl">${esc(s)}</span>`).join('')}</div>`) +
      (def.evidence ? '<div style="margin-top:8px"><span class="fr-evid">EVIDENCE TAKEN</span></div>' : '') +
      `<div class="fr-foot"><span>${esc(label)}${tag === 'breach' ? ' &middot; breach clue' : ''}</span><span><kbd>E</kbd> close</span></div></div>`;
    this.bodyEl = this.el.querySelector('.fr-body'); this.paperEl = this.el.querySelector('.fr-paper');
    this.el.hidden = false;
    game.modal = true;
    this._render();

    // cue: paper, or a voice (spoken line through speech synthesis, else the Phase 5 babble), plus Mithi's own line
    game.sfx?.paper();
    if (def.mode === 'audio') this._voice(def);
    if (def.mithi) game.messages?.say(def.mithi, { kind: 'story', ttl: 9 });
    if (def.evidence) this._giveEvidence();
    if (blind) { this.touched.add(id); game.events.emit('fragment:touched', { id }); }
    if (!blind) this._markRead(id, tag, sees ? 'jeetu' : 'mithi');
    this._refreshHalo();
    if (opts.instant) this._finish();
    return { id, blind, tag, as: sees ? 'jeetu' : 'mithi', first };
  }

  _giveEvidence() {
    const g = this.game;
    if (g.items?.add) { if (!g.items.has?.('breachEvidence')) g.items.add('breachEvidence'); }
    if (!g.flags.breachEvidence) { g.flags.breachEvidence = true; g.messages?.say('Evidence: the pages go into your bag.', { kind: 'system', ttl: 6 }); }
  }

  _markRead(id, tag, as) {
    const g = this.game, def = this.defs[id];
    const isNew = !this.read.has(id);
    this.read.add(id);
    if (def.breachClue || tag === 'breach') this.clues.add(id);
    if (isNew) g.events.emit('fragment:read', { id, tag, count: this.read.size, clues: this.clues.size, as });
    if (this.clues.size >= 3 && !g.flags.breachKnown) g.story?.markBreachKnown?.('clues');
  }

  _voice(def) {
    const g = this.game, pa = g.pa;
    g.audio?.play('pa-squelch', null);
    const text = def.say ?? '';
    try {
      const ss = pa?._ss;
      if (ss && pa.voicesReady && pa.voiceEnabled && !g.audio?.muted) {
        const u = new SpeechSynthesisUtterance(text);
        if (pa.voice) { u.voice = pa.voice; u.lang = pa.voice.lang; } else u.lang = 'en-GB';
        u.rate = def.mode === 'audio' && def.id.includes('voicelog') ? 0.9 : 0.96; u.pitch = def.id.includes('voicelog') ? 0.8 : def.id.includes('pumps') ? 0.55 : 1;
        u.volume = Math.min(1, 0.8 * (g.audio?.volumes?.voice ?? 1) * (g.audio?.volumes?.master ?? 1));
        ss.cancel(); ss.speak(u);
      } else if (g.audio?.running() && !g.audio.muted) {
        g.audio.play('pa-babble', null, { syllables: Math.round(text.split(/\s+/).length * 1.7), gain: 0.8 });
      }
    } catch { /* the card text is the fallback */ }
  }

  _render() {
    const c = this.current; if (!c || !this.bodyEl) return;
    const n = Math.min(c.total, Math.floor(c.chars));
    this.bodyEl.innerHTML = renderPartial(c.segs, n) + (n < c.total ? '<span class="cur"></span>' : '');
    if (n >= c.total && !c.done) { c.done = true; this.el.classList.add('fr-done'); this.paperEl.classList.add('fr-done'); }
    this._shown = n;
  }

  _finish() { const c = this.current; if (!c) return; c.chars = 1e6; this._render(); }

  _advance() {
    const c = this.current; if (!c) return;
    if (!c.done) this._finish(); else this.close();
  }

  _key(e) {
    if (!this.current || e.repeat) return;
    if (e.code === 'KeyE' || e.code === 'Enter' || e.code === 'Space') { this._advance(); e.preventDefault(); }
    else if (e.code === 'Escape') this.close();
  }

  /** Close the card. The modal is released on the next simulation step (so the same E press cannot reopen it). */
  close(now = false) {
    if (!this.current) return;
    this.current = null;
    this.el.hidden = true; this.el.innerHTML = '';
    this.game.events.emit('fragment:closed', {});
    if (now) { this.game.modal = false; this._closePending = false; } else this._closePending = true;
  }

  update(dt, game) {
    this.haloMat.uniforms.uTime.value = game.time;
    if (this._closePending && !this.current) { this._closePending = false; game.modal = false; }
    const c = this.current;
    if (c) {
      game.modal = true;
      if (!c.done) {
        c.chars += dt * SPEED;
        if (Math.floor(c.chars) !== this._shown) this._render();
      }
    }
  }

  snapshot() {
    return {
      found: [...this.found], read: [...this.read], touched: [...this.touched], clues: [...this.clues], total: FRAGMENTS.length,
      open: this.current ? this.current.id : null, blind: this.current ? this.current.blind : null,
    };
  }
}
