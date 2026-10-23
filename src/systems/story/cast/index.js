// The cast (PLAN 1b): low-poly people placed at the story POIs.
//
//   game.cast.get(id) -> actor | undefined
//       ids: jeetu tara sameer gautam aayat kaalu contractor doctor oldman, and the bystander groups
//            rescuers-collapse rescuers-triage nurses patients torchBoys sleepers
//   actor: { id, name, role, kind:'static'|'anim'|'group'|'oldman', group (THREE.Group: move it to move the actor), pos {x,y,z}, yaw,
//            model (Character, anim only), members [{x,y,z,yaw}] (groups), visible, owner ('party' once Jeetu follows Mithi) }
//   game.cast.list() / place(id, x, y, z, yaw) / setHidden(id, bool) / talkTo(id, memberIndex?)
//   game.cast.worldPos(actor)  the position to talk to / look at
//
// Rendering: static people are ONE merged mesh each (1 draw call, rest pose baked: standing or lying), bystander groups are one
// merged mesh for the whole group, only Jeetu and Gautam are animated Characters (5 calls each). Everything beyond ~70 m or on
// another level is hidden. Talking is an interactable per person (prompt "Talk to X"); what is said lives in conversations.js
// and the side effects in director.js (`game.director.talk(actor, memberIndex)`).
import * as THREE from '../../../../vendor/three.module.js';
import { mergeGeometries } from '../../../../vendor/addons/utils/BufferGeometryUtils.js';
import { buildCharacter, characterMaterial } from '../../../characters/humanoid.js';
import { buildRoster } from './roster.js';

const SHOW_DIST = 72;

function bake(game, spec, { x = 0, y = 0, z = 0, yaw = 0, lying = false, arms = {} } = {}) {
  const c = buildCharacter(spec, game);
  c.group.rotation.order = 'YXZ';
  c.group.rotation.set(lying ? Math.PI / 2 : 0, yaw, 0);
  c.group.position.set(x, y, z);
  const g = c.toStaticGeometry(arms);
  c.dispose();
  return g;
}

function paint(g, hex, matrix) {
  g = g.index ? g.toNonIndexed() : g;
  if (matrix) g.applyMatrix4(matrix);
  g.deleteAttribute('uv');
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  g.computeVertexNormals();
  return g;
}

/** A heap of broken concrete and rebar over the old man's legs. */
function rubbleMound() {
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new THREE.Vector3(1, 1, 1);
  const at = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => m.compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(rx, ry, rz)), new THREE.Vector3(sx, sy, sz)).clone();
  const parts = [
    paint(new THREE.BoxGeometry(1.45, 0.3, 1.0), 0x4e4b43, at(0.02, 0.3, 0.12, 0.1, 0.18, 0.12)),
    paint(new THREE.IcosahedronGeometry(0.4, 0), 0x3f3d37, at(-0.6, 0.18, 0.5, 0.3, 0.4, 0, 1.2, 0.7, 1)),
    paint(new THREE.IcosahedronGeometry(0.36, 0), 0x58544a, at(0.62, 0.17, -0.05, 0.1, 0.9, 0, 1.1, 0.7, 1)),
    paint(new THREE.IcosahedronGeometry(0.32, 0), 0x35332e, at(-0.1, 0.15, -0.4, 0, 0.3, 0, 1.3, 0.65, 1)),
    paint(new THREE.BoxGeometry(0.8, 0.16, 0.6), 0x5e5a50, at(0.15, 0.5, 0.3, -0.2, 0.5, 0.25)),
    paint(new THREE.CylinderGeometry(0.022, 0.022, 1.4, 5), 0x5a3220, at(-0.3, 0.62, 0.0, 1.0, 0.3, 0.5)),
    paint(new THREE.CylinderGeometry(0.022, 0.022, 1.1, 5), 0x5a3220, at(0.5, 0.58, 0.2, 0.7, -0.6, -0.4)),
  ];
  const g = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  return g;
}

export class CastSystem {
  init(game) {
    this.game = game;
    game.cast = this;
    this.actors = new Map();
    this.mat = characterMaterial(game);
    this.hidden = new Set();
    const S = game.world.story;
    for (const def of buildRoster(S)) {
      try { this._make(def); } catch (e) { console.error('cast', def.id, e); }
    }
    game.debug?.addState('cast', () => ({ count: this.actors.size, visible: [...this.actors.values()].filter((a) => a.group.visible).map((a) => a.id) }));
    game.debug?.addAction('cast', (g, id, dist = 3) => {            // teleport next to a cast member, looking at them
      const a = this.actors.get(id);
      if (!a) throw new Error('no cast member ' + id + ' (try: ' + [...this.actors.keys()].join(', ') + ')');
      return this.visit(a, dist);
    });
  }

  _ground(x, z, baseY) {
    const gh = this.game.physics.groundHeightAt(x, z, baseY + 0.6, 0.9);
    return gh > -Infinity ? gh : baseY;
  }

  _make(def) {
    const g = this.game, group = new THREE.Group();
    group.name = 'cast-' + def.id;
    const baseY = def.level === 'U' ? -8 : 0;
    const actor = {
      id: def.id, name: def.name, role: def.role, portrait: def.portrait, color: def.color, kind: def.kind, group, model: null, level: def.level, radius: def.radius ?? 3,
      pos: { x: def.x ?? def.centre?.x ?? 0, y: def.y ?? baseY, z: def.z ?? def.centre?.z ?? 0 }, yaw: def.yaw ?? 0, members: [], owner: null, talkCount: 0, def, mesh: null, hiddenFlag: false,
      talkable: def.talkable !== false,
    };
    if (def.kind === 'static' || def.kind === 'oldman') {
      if (def.y === undefined) actor.pos.y = this._ground(def.x, def.z, baseY);
      const geo = bake(g, def.spec, { lying: !!def.lying, arms: def.arms });
      const mesh = new THREE.Mesh(geo, this.mat);
      mesh.frustumCulled = true;
      group.add(mesh); actor.mesh = mesh;
      if (def.kind === 'oldman') {
        // buried: lying under a heap of rubble, one arm reaching up; freed: standing beside it, dusty
        const lying = bake(g, def.spec, { lying: true, arms: { armR: 1.55, armL: 0.5 } });
        const heap = rubbleMound();
        actor.buried = mergeGeometries([lying, heap], false);
        actor.freed = bake(g, def.spec, { arms: { armR: 0.3, armL: 0.1 } });
        lying.dispose(); heap.dispose();
        mesh.geometry = actor.buried;
        geo.dispose();
      }
    } else if (def.kind === 'anim') {
      const model = buildCharacter(def.spec, g);
      actor.model = model;
      group.add(model.group);
      if (def.lying) { model.group.rotation.order = 'YXZ'; model.group.rotation.x = Math.PI / 2; }
      model.group.rotation.y = 0;
      if (def.y === undefined) actor.pos.y = this._ground(def.x, def.z, baseY);
    } else if (def.kind === 'group') {
      const geos = [];
      for (const m of def.members) {
        const y = m.y ?? this._ground(m.x, m.z, baseY);
        geos.push(bake(g, m.spec, { x: m.x, y, z: m.z, yaw: m.yaw, lying: !!m.lying, arms: m.arms }));
        actor.members.push({ x: m.x, y, z: m.z, yaw: m.yaw });
      }
      const geo = mergeGeometries(geos, false);
      geos.forEach((x) => x.dispose());
      const mesh = new THREE.Mesh(geo, this.mat);
      group.add(mesh); actor.mesh = mesh;
      actor.pos.y = actor.members[0]?.y ?? baseY;
    }
    if (def.kind !== 'group') this.place(actor, actor.pos.x, actor.pos.y, actor.pos.z, actor.yaw);
    g.scene.add(group);
    this.actors.set(def.id, actor);
    if (actor.talkable) this._registerTalk(actor);
    return actor;
  }

  _registerTalk(a) {
    const g = this.game;
    const spots = a.kind === 'group' ? a.members.map((m, i) => ({ i, x: m.x, y: m.y, z: m.z })) : [{ i: 0, x: a.pos.x, y: a.pos.y, z: a.pos.z }];
    for (const s of spots) {
      g.interactables.add({
        id: `talk:${a.id}${a.kind === 'group' ? ':' + s.i : ''}`, pos: { x: s.x, y: s.y, z: s.z }, radius: a.radius, height: 2.6,
        prompt: () => (g.director?.promptFor?.(a, s.i) ?? `Talk to ${a.name}`),
        enabled: () => !g.modal && a.group.visible && !a.hiddenFlag && (g.director?.canTalk?.(a, s.i) ?? true),
        onInteract: () => g.director?.talk?.(a, s.i),
      });
      s.item = g.interactables.get(`talk:${a.id}${a.kind === 'group' ? ':' + s.i : ''}`);
    }
    a.spots = spots;
  }

  // ------------------------------------------------------------------------------------------ API
  get(id) { return this.actors.get(id); }
  list() { return [...this.actors.values()]; }
  worldPos(a) { return a.kind === 'group' ? (a.members[0] ?? a.pos) : a.pos; }
  talkTo(id, i = 0) { const a = this.actors.get(id); if (a) this.game.director?.talk(a, i); return !!a; }

  /** Move an actor (static meshes are rigid: this moves the whole group). Keeps the interactable with it. */
  place(a, x, y, z, yaw = a.yaw) {
    if (typeof a === 'string') a = this.actors.get(a);
    if (!a) return;
    a.pos.x = x; a.pos.y = y; a.pos.z = z; a.yaw = yaw;
    if (a.kind === 'group') return;
    a.group.position.set(x, y, z);
    if (a.model) a.model.group.rotation.y = yaw; else a.group.rotation.y = yaw;
    const s = a.spots?.[0]?.item;
    if (s) { s.pos.x = x; s.pos.y = y; s.pos.z = z; }
  }

  setHidden(id, hidden) { const a = typeof id === 'string' ? this.actors.get(id) : id; if (a) { a.hiddenFlag = hidden; a.group.visible = !hidden && a.group.visible; } }

  /** Teleport the player to `dist` metres from the actor, facing them (debug / cutscenes). */
  visit(a, dist = 3) {
    const g = this.game, p = a.kind === 'group' ? (a.members[0] ?? a.pos) : a.pos, pl = g.player;
    const w = g.physics;
    for (const ang of [0, 0.7, -0.7, 1.4, -1.4, 2.2, -2.2, Math.PI]) {
      const yaw = (a.yaw ?? 0) + ang;
      const x = p.x - Math.sin(yaw) * dist, z = p.z - Math.cos(yaw) * dist;       // in front of them
      const gh = w.groundHeightAt(x, z, p.y + 0.5, 0.9);
      if (gh > -Infinity && Math.abs(gh - p.y) < 1.0) {
        pl.teleport(x, gh, z, Math.atan2(-(p.x - x), -(p.z - z)));
        pl.setLook(Math.atan2(-(p.x - x), -(p.z - z)), -0.05);
        return { x, y: gh, z, at: a.id };
      }
    }
    pl.teleport(p.x, p.y, p.z + dist, 0);
    return { at: a.id, fallback: true };
  }

  update(dt, game) {
    const cam = game.camera.position, pl = game.player;
    const inU = pl.pos.y < -4;
    for (const a of this.actors.values()) {
      if (a.owner === 'party') continue;
      const p = a.kind === 'group' ? a.def.centre : a.pos;
      const d = Math.hypot(p.x - cam.x, p.z - cam.z);
      const sameLevel = (a.level === 'U') === inU;
      const show = !a.hiddenFlag && d < SHOW_DIST && sameLevel && Math.abs((a.pos.y ?? 0) - pl.pos.y) < 14;
      if (a.group.visible !== show) a.group.visible = show;
      if (show && a.model && d < 40) a.model.update(dt, a.speed ?? 0, { onGround: true });
    }
  }
}
