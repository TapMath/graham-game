// Setu's trail (PLAN 1b step 5): when Mithi reaches a spot of his timeline that he has already left, the place remembers him.
// A child's chalk step-count and arrow on the floor ("he counts his steps"), a small found object (his inhaler cap, a doctor's
// token, a bent grille), and an ambient voice that says which way he went. Phase 3's `setu:clue` caption stays; this layer adds
// the barks, the chalk and the objects, and each of them points to the next stage of his timeline.
//
//   game.trail.marks                  Map spotId -> {spawned, found, barked}
//   game.trail.spawn(spotId)          put the marks at a spot now (also happens on `setu:moved {from}`)
//   game.trail.nextOf(spotId)         the timeline entry after it
// Events consumed: `setu:moved {from,to}` (marks appear where he was), `setu:clue {id}` (the bark). Emitted: `trail:found {id}`,
// `trail:bark {id}`. Flags: `trailFound` (count). Debug: do('trail', spotId) spawns, teleports beside it and returns the state.
import * as THREE from '../../../vendor/three.module.js';
import { HALO_VS, HALO_FS } from './fragments.js';

const _yq = new THREE.Quaternion(), _yAxis = new THREE.Vector3(0, 1, 0);

const TRAIL = {
  liftWreck: {
    chalk: ['1  2  3', '.... 31 ->'], arrowTo: 'catacombs',
    bark: { who: 'a man sifting the wreck', text: '"A little boy, blue shirt? He kept counting out loud, sixty-one, sixty-two. Went west, toward the old ring tunnel."' },
    object: { name: 'inhaler cap', color: 0x59a8ff, prompt: 'Pick up the small blue cap',
      text: 'An inhaler cap, still warm from a small hand. Setu. A trail of chalk ticks leads off to the west, counting, counting.' },
  },
  catacombs: {
    chalk: ['|||| ||||', '112 ->'], arrowTo: 'boringSite',
    bark: { who: 'a woman in the dark', text: '"Aayat took him to see the machine. Please. Do not tell Seth I said so."' },
    object: { name: 'snuffed diya', color: 0xffa040, prompt: 'Touch the snuffed diya',
      text: 'A diya, put out with a thumb. In the dust beside it, two sets of bare feet: one child-sized, one smaller. They went toward the grinding.' },
  },
  boringSite: {
    chalk: ['204', '||||  ||||  ->'], arrowTo: 'clinic',
    bark: { who: 'a child at the cages', text: '"The new boy had a mouth organ. The contractor took it. Took him too. South, the long tunnel, to the doctor."' },
    object: { name: 'chalk stub', color: 0xeeeede, prompt: 'Pick up the stub of chalk',
      text: 'A stub of chalk worn to nothing, and a tally scratched on a cage bar: forty, forty-one, forty-two. Someone took the boy south, down the long tunnel.' },
  },
  clinic: {
    chalk: ['vent', '388 ->'], arrowTo: 'ventExit',
    bark: { who: 'the doctor', text: '"He asked which way the air comes from. I told him the vents. I should have bitten my tongue."' },
    object: { name: 'pill strip', color: 0xe8e8ff, prompt: 'Pick up the empty pill strip',
      text: 'An empty blister strip and a clinic token stamped 18:40. On the back, in a child\'s pencil: "VENT" and an arrow. He is climbing out.' },
  },
  ventExit: {
    chalk: ['4  0  0', '->  tents'], arrowTo: 'triageTents',
    bark: { who: 'a volunteer by the stack', text: '"Something small came out of that grille an hour ago. Coughing. It went toward the tents."' },
    object: { name: 'bent grille', color: 0x9aa0a8, prompt: 'Feel the bent grille',
      text: 'The grille hangs open, bent from the inside. Small soot-black handprints on the rim, and under them, scratched with a fingernail: a count, four hundred steps.' },
  },
  triageTents: {
    chalk: ['MITHI', 'DIDI ?  ->'], arrowTo: 'bridge',
    bark: { who: 'a nurse', text: '"He asked everyone for his sister. We told him the bodies were over there. God forgive me. He walked east, toward the bridges, counting."' },
    object: { name: 'tent pole', color: 0xffe08a, prompt: 'Touch the chalk on the tent pole',
      text: 'On the tent pole, in a child\'s chalk: MITHI DIDI? with an arrow pointing east. The volunteers have not rubbed it out. He thinks you are dead, and he is going to the bridge anyway.' },
  },
};

// Phase 7b: the chalk used to be ONE decal with the arrow baked in, laid along the way to the next stage, so from the other side the
// words were upside down (and read as mirrored). Now the words are a decal that turns on the floor to face whoever is looking at them
// (see update()), and the arrow is its own decal that keeps pointing the way Setu went.
function chalkRand(seed) { let s = seed; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const CHALK_FONT = "italic 84px 'Bradley Hand','Segoe Print','Chalkboard SE','Comic Neue','Purisa','Comic Sans MS',cursive";
function chalkTexture(lines) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.clearRect(0, 0, 512, 256);
  g.lineCap = 'round'; g.lineJoin = 'round';
  const r = chalkRand(7 + lines.join('').length);
  g.fillStyle = 'rgba(246,244,234,.92)';
  g.font = CHALK_FONT;
  g.textBaseline = 'middle'; g.textAlign = 'center';
  const rows = lines.map((l) => l.replace('->', '').trim());
  const gap = 256 / (rows.length + 1);
  rows.forEach((ln, i) => {
    g.save(); g.translate(256, gap * (i + 1)); g.rotate((r() - 0.5) * 0.08);
    g.globalAlpha = 0.9; g.fillText(ln, 0, 0, 470);
    g.restore();
  });
  // chalk grain: knock holes out of the strokes
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(0,0,0,${0.25 + r() * 0.5})`; g.fillRect(r() * 512, r() * 256, 1 + r() * 3, 1 + r() * 2); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 2;
  return tex;
}

/** A scratched chalk arrow pointing along +X of the decal. */
function arrowTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.lineCap = 'round'; g.lineJoin = 'round';
  const r = chalkRand(91);
  const scribble = (x0, y0, x1, y1, w) => {
    for (let k = 0; k < 3; k++) {
      g.strokeStyle = `rgba(245,243,232,${0.5 + r() * 0.4})`; g.lineWidth = w * (0.6 + r() * 0.6);
      g.beginPath(); g.moveTo(x0 + (r() - 0.5) * 3, y0 + (r() - 0.5) * 3); g.lineTo(x1 + (r() - 0.5) * 3, y1 + (r() - 0.5) * 3); g.stroke();
    }
  };
  scribble(20, 64, 230, 64, 9); scribble(230, 64, 184, 24, 9); scribble(230, 64, 184, 104, 9);
  g.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(0,0,0,${0.25 + r() * 0.5})`; g.fillRect(r() * 256, r() * 128, 1 + r() * 3, 1 + r() * 2); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 2;
  return tex;
}

export class TrailSystem {
  init(game) {
    this.game = game;
    game.trail = this;
    this.timeline = game.world.setuTimeline ?? [];
    this.marks = new Map();
    this.group = new THREE.Group(); this.group.name = 'setu-trail';
    game.scene.add(this.group);
    this._pending = [];
    this.found = 0;
    const ev = game.events;
    ev.on('setu:moved', ({ from }) => { if (from) this.spawn(from); });
    ev.on('setu:clue', ({ id }) => this._bark(id));
    const d = game.debug;
    d?.addAction('trail', (g, id = 'liftWreck', opts = {}) => {
      this.spawn(id, true);
      const t = this.timeline.find((w) => w.id === id);
      if (t && opts.tp !== false) { g.player.teleport(t.x - 3.2, t.y, t.z, -90); }
      if (opts.bark) this._bark(id, true);
      return this.snapshot();
    });
    d?.addAction('trailBark', (g, id) => { this._bark(id, true); return true; });
    // a small glow for found objects
    this.haloMat = new THREE.ShaderMaterial({ vertexShader: HALO_VS, fragmentShader: HALO_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 }, uSize: { value: 30 } } });
    this._haloGeo = null;
  }

  nextOf(id) { const i = this.timeline.findIndex((w) => w.id === id); return i >= 0 ? this.timeline[i + 1] ?? null : null; }

  /** Put Setu's marks at a timeline spot. */
  spawn(id) {
    const def = TRAIL[id], spot = this.timeline.find((w) => w.id === id);
    if (!def || !spot || this.marks.has(id)) return false;
    const next = this.timeline.find((w) => w.id === def.arrowTo) ?? this.nextOf(id);
    const ang = Math.atan2(next.z - spot.z, next.x - spot.x);          // direction to the next stage (the arrow points along +X of the decal)
    const ux = Math.cos(ang), uz = Math.sin(ang);
    const mk = { id, spawned: true, found: false, barked: false, meshes: [], item: null };
    // chalk on the floor: the words (they turn to face the reader) and, a little further toward the next stage, the arrow
    const decalMat = (map) => new THREE.MeshBasicMaterial({ map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    const flat = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0, 'XYZ'));
    const words = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.75), decalMat(chalkTexture(def.chalk)));
    const dpos = this._place(spot, ang, 1.5, 0.5);
    words.quaternion.copy(flat); words.position.set(dpos.x, spot.y + 0.035, dpos.z);
    words.userData.flat = flat;
    this.group.add(words); mk.meshes.push(words);
    const arrow = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.55), decalMat(this.arrowTex ?? (this.arrowTex = arrowTexture())));
    arrow.quaternion.copy(flat).premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -ang));
    const apos = this._place(spot, ang, 2.9, 0.1);
    arrow.position.set(apos.x, spot.y + 0.034, apos.z);
    this.group.add(arrow); mk.meshes.push(arrow);
    mk.words = words;
    // the found object: a tiny thing on the floor with a glow
    const o = def.object, ipos = this._place(spot, ang + Math.PI, 1.0, 0.3), ox = ipos.x, oz = ipos.z;
    const geo = id === 'ventExit' || id === 'triageTents' ? new THREE.BoxGeometry(0.1, 0.5, 0.1) : new THREE.CylinderGeometry(0.07, 0.07, 0.07, 10);
    const item = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: o.color }));
    item.position.set(ox, spot.y + (id === 'ventExit' || id === 'triageTents' ? 0.25 : 0.05), oz);
    this.group.add(item); mk.meshes.push(item); mk.itemPos = { x: ox, y: spot.y, z: oz };
    const game = this.game;
    mk.item = game.interactables.add({
      id: 'trail:' + id, pos: { x: ox, y: spot.y, z: oz }, radius: 2.0, height: 2.2, prompt: o.prompt,
      enabled: () => !game.modal, onInteract: () => this._found(id),
    });
    this.marks.set(id, mk);
    this._rebuildHalo();
    return true;
  }

  /** True when a small thing can lie on the floor at (x, z): walkable ground at spot level and no solid in the way. */
  _free(x, y, z) {
    const w = this.game.physics;
    const gh = w.groundHeightAt(x, z, y + 0.3, 0.4, 0.2);
    if (!(gh > y - 0.25 && gh < y + 0.25)) return false;
    for (const c of w.query(x - 0.7, z - 0.7, x + 0.7, z + 0.7)) if (c.solid && c.max.y > y + 0.25 && c.min.y < y + 1.6) return false;
    return true;
  }

  /** A free floor spot near `spot`, `dist` metres along `ang` (then fanned out around it), 0.45 m to the side. */
  _place(spot, ang, dist, side) {
    for (const da of [0, 0.7, -0.7, 1.4, -1.4, 2.1, -2.1, Math.PI]) {
      for (const d of [dist, dist * 0.7]) {
        const a = ang + da, x = spot.x + Math.cos(a) * d - Math.sin(a) * side, z = spot.z + Math.sin(a) * d + Math.cos(a) * side;
        if (this._free(x, spot.y, z)) return { x, z };
      }
    }
    return { x: spot.x, z: spot.z };
  }

  _rebuildHalo() {
    if (this.halo) { this.group.remove(this.halo); this.halo.geometry.dispose(); }
    const list = [...this.marks.values()];
    if (!list.length) return;
    const pos = new Float32Array(list.length * 3), col = new Float32Array(list.length * 3), phase = new Float32Array(list.length), state = new Float32Array(list.length);
    list.forEach((m, i) => {
      pos[i * 3] = m.itemPos.x; pos[i * 3 + 1] = m.itemPos.y + 0.35; pos[i * 3 + 2] = m.itemPos.z;
      const c = new THREE.Color(0xfff0c0); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
      phase[i] = i * 2.3; state[i] = m.found ? 0 : 1;
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    geo.setAttribute('aPhase', new THREE.BufferAttribute(phase, 1)); geo.setAttribute('aState', new THREE.BufferAttribute(state, 1));
    this.halo = new THREE.Points(geo, this.haloMat); this.halo.frustumCulled = false;
    this.group.add(this.halo);
  }

  _found(id) {
    const g = this.game, def = TRAIL[id], mk = this.marks.get(id);
    if (!def || !mk) return;
    const first = !mk.found;
    mk.found = true;
    g.messages?.say(def.object.text, { kind: 'clue', ttl: 13 });
    g.sfx?.paper(0.25);
    if (first) {
      this.found++; g.flags.trailFound = this.found;
      mk.meshes[2].visible = false;                       // you took it
      g.interactables.remove('trail:' + id);
      this._rebuildHalo();
      g.events.emit('trail:found', { id, name: def.object.name });
      const next = this.timeline.find((w) => w.id === def.arrowTo);
      if (next) g.events.emit('trail:points', { id, to: next.id, x: next.x, y: next.y, z: next.z });
    }
  }

  _bark(id, force = false) {
    const g = this.game, def = TRAIL[id], mk = this.marks.get(id) ?? { barked: false };
    if (!def || (mk.barked && !force)) return;
    if (!this.marks.has(id)) this.spawn(id);
    const m = this.marks.get(id); if (m) m.barked = true;
    const spot = this.timeline.find((w) => w.id === id);
    setTimeout(() => {
      g.messages?.say(`${def.bark.text}`, { kind: 'clue', ttl: 12, speaker: def.bark.who });
      if (spot) g.events.emit('sound:emit', { x: spot.x + 1.5, y: spot.y + 1.2, z: spot.z + 1, kind: 'mutter', loudness: 0.5 });
      g.events.emit('trail:bark', { id, who: def.bark.who });
    }, force ? 50 : 2200);
  }

  update(dt, game) {
    this.haloMat.uniforms.uTime.value = game.time;
    // the words lie on the floor with their top edge away from you, wherever you stand
    const cp = game.camera.position;
    for (const mk of this.marks.values()) {
      const w = mk.words; if (!w) continue;
      const dx = cp.x - w.position.x, dz = cp.z - w.position.z;
      if (dx * dx + dz * dz > 900) continue;
      _yq.setFromAxisAngle(_yAxis, Math.atan2(dx, dz));
      w.quaternion.copy(_yq).multiply(w.userData.flat);
    }
  }

  reset() {
    for (const [id, m] of this.marks) { for (const me of m.meshes) this.group.remove(me); this.game.interactables.remove('trail:' + id); }
    this.marks.clear(); this.found = 0; this._rebuildHalo();
  }

  snapshot() {
    return { spawned: [...this.marks.keys()], found: [...this.marks.values()].filter((m) => m.found).map((m) => m.id), barked: [...this.marks.values()].filter((m) => m.barked).map((m) => m.id), count: this.found };
  }
}
