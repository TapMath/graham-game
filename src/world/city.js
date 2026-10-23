// The city world system (replaces the test arena as the default world; ?arena=1 keeps the arena).
// Builds MAP (src/world/map.js) through the Builder and exposes `game.world`:
//
//   game.world = {
//     name:'city', map, spawn, bounds, land, seaLevel,
//     levelAt(pos)            'U'|'G'|'L1'|'L2'|'L3' from pos.y
//     sunShafts[] (.intensity) isInSunlight(pos) sunShaftAt(pos)       (see sunlight.js)
//     solarLamps[]            isNearSolarLamp(pos)
//     gates[] gate(id)        health gates (see gates.js)
//     slabs[]                 candidate unstable slabs {id, deck, level, rect, y, collider, drop(dy), reset()}
//     breachWater             {y, setLevel(y)}                         (see sea.js)
//     inSea(pos)              stats                                    POI lists copied from the map:
//     setuSpots vendorSpots fragmentSpots hazardZones checkpoints controlTowerTerminal sunriseBridgeEnd breachChamber landmarks
//   }
//
// Interaction: lifts register E interactables (game.interactables). Falling into the sea (west,
// south, east of the land) emits player:void {cost:1, reason:'sea'} and respawns the player.
import * as THREE from '../../vendor/three.module.js';
import { MAP } from './map.js';
import { Builder, finishGeometry, shadeAt } from './builder.js';
import { levelAt as levelAtY } from './levels.js';
import {
  Ctx, edgeSegments, addRail, buildGround, buildUnderground, buildTowers, buildDecks, paintRoads, dressBroken,
  buildPillars, buildStairs, buildRamp, buildLift, buildBuildings, buildVents, DECK_COLOR,
} from './structures.js';
import { defineKinds, dressFacades, scatterStreets, scatterAreas, scatterDecks, buildLandmarks, flushRailPosts, scatterGothic } from './props.js';
import { buildStory } from './story.js';
import { AdScreens, Rain, Searchlights, DiyaFlicker } from './fx.js';
import { Labels } from './labels.js';
import { GateSystem } from './gates.js';
import { Sunlight } from './sunlight.js';
import { Sea } from './sea.js';

const _col = new THREE.Color();

export class CitySystem {
  init(game) {
    this.game = game;
    const map = MAP;
    const t0 = performance.now();
    this.map = map;

    game.world = {
      name: 'city', map, spawn: map.spawn, bounds: map.bounds, land: map.land, seaLevel: map.seaLevel,
      levelAt: (pos) => levelAtY(Array.isArray(pos) ? pos[1] : pos.y),
      setuSpots: map.setuSpots, vendorSpots: map.vendorSpots, fragmentSpots: map.fragmentSpots, hazardZones: map.hazardZones,
      checkpoints: map.checkpoints, controlTowerTerminal: map.controlTowerTerminal, sunriseBridgeEnd: map.sunriseBridgeEnd,
      breachChamber: map.breachChamber, landmarks: map.landmarks,
      story: map.story, setuTimeline: map.setuTimeline, buildings: map.buildings, ventSpots: map.ventSpots, metroGuardPosts: map.metroGuardPosts,
      adScreens: map.adScreens, searchlights: map.searchlights, doors: {},
    };
    const world = game.world;

    const b = new Builder(game, { shade: true, chunk: 100 });
    const ctx = new Ctx(game, b, map);
    this.ctx = ctx;
    defineKinds(b);

    // ---- structures (order matters: later steps probe the colliders of earlier ones)
    buildGround(ctx);
    buildTowers(ctx);
    buildDecks(ctx);
    for (const s of map.stairs) buildStairs(ctx, s);
    for (const r of map.ramps) buildRamp(ctx, r);
    this.liftDefs = map.lifts;
    for (const l of map.lifts) buildLift(ctx, l);
    buildUnderground(ctx);
    buildBuildings(ctx);
    buildVents(ctx);
    this._buildDoors(ctx, world);

    // ---- gates (arch, door, sign), labels
    const labels = new Labels(game);
    this.gates = new GateSystem(game);
    this.gates.build(ctx, labels);
    for (const s of map.signs) labels.add(s);
    for (const v of map.vendorSpots) {        // green D-SHOT sign over every black-market booth, facing the customers
      const f = { 0: '-z', [Math.PI]: '+z', [-Math.PI / 2]: '+x', [Math.PI / 2]: '-x' }[v.yaw] ?? '-z', o = { '-z': [0, -2.3], '+z': [0, 2.3], '+x': [2.3, 0], '-x': [-2.3, 0] }[f];
      labels.add({ text: 'D-SHOT', tone: 'free', x: v.x + o[0], y: v.y + 3.15, z: v.z + o[1], dir: f, w: 2.8, h: 0.55 });
    }

    this._reserveClearZones(ctx);

    // ---- dressing
    buildPillars(ctx);
    paintRoads(ctx);
    dressBroken(ctx);
    buildLandmarks(ctx);
    buildStory(ctx);
    scatterStreets(ctx);
    scatterAreas(ctx);
    scatterDecks(ctx);
    dressFacades(ctx);

    // ---- railings on every walkable edge with a drop beside it
    for (const d of map.decks) {
      if (d.rails === false) continue;
      for (const s of edgeSegments(ctx, d, d.y)) addRail(ctx, s, d.y);
    }
    for (const t of ctx.towerRects) {
      for (const s of edgeSegments(ctx, t, t.y)) addRail(ctx, s, t.y);
    }
    for (const s of edgeSegments(ctx, map.land, 0, { railH: 0.9 })) addRail(ctx, s, 0, { h: 0.9, style: 'wall' });
    flushRailPosts(ctx);
    scatterGothic(ctx);

    this.group = b.finish('city');
    labels.build();
    this.fx = { ads: new AdScreens(game, map), rain: new Rain(game), searchlights: new Searchlights(game, map), diyaFlicker: new DiyaFlicker(this.group) };
    world.fx = this.fx;
    game.events.on('sky:time', ({ dayFactor }) => game.materials.glass.color.setScalar(0.62 + 0.38 * (1 - dayFactor)));

    // ---- boundary: invisible walls past the sea and behind the world edge
    const B = map.bounds, E = 4;
    const wall = (min, max) => game.physics.addBox(min, max, { solid: true, walkable: false, tag: 'world-edge' });
    wall([B.minX - E, -60, B.minZ - E], [B.minX, 160, B.maxZ + E]);
    wall([B.maxX, -60, B.minZ - E], [B.maxX + E, 160, B.maxZ + E]);
    wall([B.minX, -60, B.minZ - E], [B.maxX, 160, B.minZ]);
    wall([B.minX, -60, B.maxZ], [B.maxX, 160, B.maxZ + E]);

    // ---- unstable slab candidates: instanced visuals + dynamic colliders
    this._buildSlabs(ctx, world);

    // ---- sea, water, light
    this.sea = new Sea(game, map);
    world.seaLevel = this.sea.level; world.inSea = (p) => this.sea.inSea(p); world.breachWater = this.sea.breachWater;
    this.sun = new Sunlight(game, map);
    this.sun.build();
    world.sunShafts = this.sun.list;
    world.isInSunlight = (p) => !!this.sun.shaftAt(p);
    world.sunShaftAt = (p) => this.sun.shaftAt(p);
    world.solarLamps = this.sun.lamps;
    world.isNearSolarLamp = (p) => !!this.sun.lampNear(p);
    this._buildSolarLamps(game, map);
    world.gates = this.gates.gates;
    world.gate = (id) => this.gates.get(id);
    world.lifts = game.lifts.lifts;

    // ---- interactables: lifts and the Control Tower terminal
    this._registerLiftInteractables(game, map);
    const ct = map.controlTowerTerminal;
    game.interactables.add({
      id: ct.id, pos: { x: ct.x, y: ct.y, z: ct.z }, radius: ct.radius, height: 2.5, prompt: 'Use the Control Tower terminal',
      onInteract: () => game.events.emit('terminal:interact', { id: ct.id }),
    });

    // ---- sky: start in the morning; Phase 3's clock calls game.sky.setTimeOfDay(hour)
    game.sky.setTimeOfDay(game.flags.debugHour ?? 7.5);

    // ---- debug / state
    this._seaCool = 0;
    world.stats = { build_ms: Math.round(performance.now() - t0), boxes: b.stats.boxes, instances: b.stats.instances, pillars: ctx.pillarsPlaced, colliders: game.physics.count };
    game.debug?.addState('world', (g) => ({
      level: g.player.level, hour: +g.sky.hour.toFixed(2), phase: g.sky.phase,
      inSun: world.isInSunlight(g.player.pos), nearSolarLamp: world.isNearSolarLamp(g.player.pos), shaftIntensity: +world.sunShafts.intensity.toFixed(2),
      gates: this.gates.snapshot(), focus: g.interactables?.focus ? { id: g.interactables.focus.id, prompt: g.interactables.focus.promptText } : null,
      inSea: world.inSea(g.player.pos), stats: world.stats,
    }));
    world.validatePOIs = () => this.validatePOIs();
    game.debug?.addAction('validatePOIs', () => this.validatePOIs());
    game.debug?.addAction('lift', (g, id, where) => { g.lifts.get(id).goTo(where); return g.lifts.get(id).snapshot(); });
    game.debug?.addAction('tp', (g, name) => {
      const m = map.landmarks.find((l) => l.id === name) ?? map.setuSpots.find((l) => l.id === name) ?? map.fragmentSpots.find((l) => l.id === name);
      if (!m) throw new Error('no such place ' + name);
      return g.debug.teleport(m.x, m.y, m.z);
    });
  }

  /** Approaches to gates, lifts, stairs, ramps and the points other systems care about stay free of props. */
  _reserveClearZones(ctx) {
    const map = this.map;
    const V = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };
    for (const g of map.gates) {
      const [nx, nz] = V[g.inside], out = 8;
      const hw = g.width / 2 + 1.5;
      if (g.axis === 'x') ctx.keepClear(g.x - hw, g.z - nz * 0.5, g.x + hw, g.z - nz * out, g.y);
      else ctx.keepClear(g.x - nx * 0.5, g.z - hw, g.x - nx * out, g.z + hw, g.y);
    }
    for (const l of map.lifts) {
      const [cx, cz] = l.center, [w, d] = l.size;
      for (const [stop, y] of [['bottom', l.yBottom], ['top', l.yTop]]) {
        const [sx, sz] = V[l.exits[stop]];
        if (sx) { const e = cx + sx * w / 2; ctx.keepClear(e, cz - d / 2 - 1.5, e + sx * 6, cz + d / 2 + 1.5, y); }
        else { const e = cz + sz * d / 2; ctx.keepClear(cx - w / 2 - 1.5, e, cx + w / 2 + 1.5, e + sz * 6, y); }
      }
    }
    for (const s of map.stairs) {
      if (s.from === s.to) continue;
      const run = s.run ?? 0.5, len = s.steps * run, ax = s.dir[1], sg = s.dir[0] === '-' ? -1 : 1, hw = s.width / 2 + 1.5;
      const a = ax === 'z' ? s.z : s.x;
      const lo = a - sg * 6, hiEnd = a + sg * (len + 6);
      if (ax === 'z') { ctx.keepClear(s.x - hw, lo, s.x + hw, a, s.y0); ctx.keepClear(s.x - hw, a + sg * len, s.x + hw, hiEnd, s.y1); }
      else { ctx.keepClear(lo, s.z - hw, a, s.z + hw, s.y0); ctx.keepClear(a + sg * len, s.z - hw, hiEnd, s.z + hw, s.y1); }
    }
    for (const r of map.ramps) {
      const ax = r.dir[1], sg = r.dir[0] === '-' ? -1 : 1;
      const xa = Math.min(r.x0, r.x1) - 1.5, xb = Math.max(r.x0, r.x1) + 1.5, za = Math.min(r.z0, r.z1) - 1.5, zb = Math.max(r.z0, r.z1) + 1.5;
      if (ax === 'z') {
        const lowEnd = sg < 0 ? zb : za, highEnd = sg < 0 ? za : zb;
        ctx.keepClear(xa, lowEnd, xb, lowEnd + (sg < 0 ? 6 : -6), r.yLow); ctx.keepClear(xa, highEnd, xb, highEnd + (sg < 0 ? -6 : 6), r.yHigh);
      }
    }
    const sp = map.spawn; ctx.keepClearAround(sp.x, sp.z, 5, sp.y);
    const ct = map.controlTowerTerminal; ctx.keepClearAround(ct.x, ct.z, 5, ct.y);
    const be = map.sunriseBridgeEnd; ctx.keepClearAround(be.x, be.z, 6, be.y);
    for (const f of map.fragmentSpots) ctx.keepClearAround(f.x, f.z, 1.6, f.y);
    for (const f of map.setuSpots) ctx.keepClearAround(f.x, f.z, 1.6, f.y);
    for (const f of map.vendorSpots) ctx.keepClearAround(f.x, f.z, 3.2, f.y);
    for (const c of map.checkpoints) ctx.keepClearAround(c.x, c.z, 3.5, c.y);
    for (const bl of map.buildings) ctx.keepClear(bl.x0 - 0.3, bl.z0 - 0.3, bl.x1 + 0.3, bl.z1 + 0.3, bl.y ?? 0, bl.h);      // random dressing stays out of the buildings
    ctx.keepClear(-64, -9, -30, 6, 0);                                                                               // triage tents
    for (const v of map.ventSpots) ctx.keepClearAround(v.g.x, v.g.z, 1.5, 0);
  }

  /** Self-check for the data lists: every spot must stand on walkable ground at its stated height and not inside a solid. */
  validatePOIs() {
    const map = this.map, w = this.game.physics, bad = [];
    const check = (kind, id, x, y, z, tol = 0.35) => {
      const g = w.groundHeightAt(x, z, y + 0.5, 0.6, 0.3);
      if (!(Math.abs(g - y) <= tol)) { bad.push(`${kind} ${id}: ground ${g === -Infinity ? 'none' : g.toFixed(2)} vs y ${y}`); return; }
      if (kind === 'dog' || kind === 'drone') return;      // areas / flight paths: only the ground matters
      for (const c of w.query(x - 0.3, z - 0.3, x + 0.3, z + 0.3)) if (c.solid && c.min.y < y + 1.6 && c.max.y > y + 0.65) { bad.push(`${kind} ${id}: inside solid ${c.tag}`); return; }
    };
    for (const a of ['setuSpots', 'vendorSpots', 'fragmentSpots', 'checkpoints']) for (const p of map[a]) check(a, p.id, p.x, p.y, p.z);
    check('spawn', 'spawn', map.spawn.x, map.spawn.y, map.spawn.z);
    for (const p of [map.controlTowerTerminal, map.sunriseBridgeEnd]) check('poi', p.id, p.x, p.y, p.z);
    const bc = map.breachChamber; check('poi', bc.id, bc.x, bc.y, bc.z);
    for (const d of map.hazardZones.drones) {
      const y = { L1: 12, L2: 24 }[d.level];
      d.waypoints.forEach(([x, z], i) => {
        check('drone', `${d.id}[${i}]`, x, y, z, 1.4);   // props (<= 1.3 m) may stand under the path
        for (const c of w.query(x - 1, z - 1, x + 1, z + 1)) if (c.solid && c.max.y > y + 6 && c.min.y < y + d.altitude + 1 && c.tag.startsWith('tower')) bad.push(`drone ${d.id}[${i}]: inside ${c.tag}`);
      });
    }
    for (const d of map.hazardZones.dogs) check('dog', d.id, d.x, d.level === 'U' ? -8 : 0, d.z, 1.0);
    for (const l of map.landmarks) check('landmark', l.id, l.x, l.y, l.z);
    const st = map.story, pts = [['triage-tents', st.triageTents], ['mithi-home', st.mithiHome], ['neighbour-flat', st.neighbourFlat], ['hospital', st.hospital],
      ['hospital-entrance', st.hospital.entrance], ['hospital-icu', st.hospital.icu], ['jeetu-bed', st.hospital.jeetuBed], ['tara-room', st.hospital.taraRoom], ['police', st.policeStation],
      ['police-entrance', st.policeStation.entrance], ['gautam-cell', st.policeStation.cell], ['metro-a', st.metro.entranceA], ['metro-b', st.metro.entranceB], ['metro-concourse', st.metro.concourse],
      ['maint-top', st.maintenanceShaft.top], ['maint-bottom', st.maintenanceShaft.bottom], ['lift-wreck', st.maintenanceShaft.liftWreck], ['catacombs', st.catacombs], ['aayat-home', st.catacombs.aayatHome],
      ['boring-site', st.boringSite], ['boring-foreman', st.boringSite.foreman], ['clinic', st.clinic], ['bridge-checkpoint', st.bridgeCheckpoint], ['collapse-site', st.collapseSite]];
    for (const [id, p] of pts) check('story', id, p.x, p.y, p.z);
    for (const t of map.setuTimeline) check('timeline', t.id, t.x, t.y, t.z);
    for (const v of map.ventSpots) { check('vent-g', v.id, v.g.x, v.g.y, v.g.z + 1.6); check('vent-u', v.id, v.u.x + v.inward[0] * 1.6, v.u.y, v.u.z + v.inward[1] * 1.6); }
    return bad;
  }

  /** Story doors with colliders: world.doors[id] = {id, closed, setClosed(bool)}; metro shutters start open, Gautam's cell closed. */
  _buildDoors(ctx, world) {
    const game = this.game, b = ctx.b;
    for (const d of this.map.doorDefs) {
      const col = game.physics.addBox([d.x0, d.y, d.z0], [d.x1, d.y + d.h, d.z1], { solid: true, walkable: false, tag: 'door:' + d.id, userData: { door: d.id } });
      const wide = d.x1 - d.x0 > d.z1 - d.z0;
      const g = new THREE.BoxGeometry(d.x1 - d.x0, d.h, d.z1 - d.z0);
      const bars = d.id.startsWith('police');
      const mat = bars ? game.materials.emissive : game.materials.lit;
      const mesh = new THREE.Mesh(finishGeometry(g.toNonIndexed(), bars ? 0x405048 : 0x5a6468, bars ? 'emissive' : 'lit', { shade: !bars }), mat);
      mesh.position.set((d.x0 + d.x1) / 2, d.y + d.h / 2, (d.z0 + d.z1) / 2);
      if (bars) mesh.scale.set(wide ? 1 : 1, 1, 1);
      game.scene.add(mesh);
      // frame and a warning light (always there, whether the shutter is up or down)
      if (!bars) b.box([d.x0 - 0.4, d.y, d.z0 - 0.15], [d.x0, d.y + d.h + 0.4, d.z1 + 0.15], { color: 0x3c4648, tag: 'door-frame', walkable: false });
      if (!bars) b.box([d.x1, d.y, d.z0 - 0.15], [d.x1 + 0.4, d.y + d.h + 0.4, d.z1 + 0.15], { color: 0x3c4648, tag: 'door-frame', walkable: false });
      if (!bars) b.box([d.x0, d.y + d.h, d.z0 - 0.15], [d.x1, d.y + d.h + 0.4, d.z1 + 0.15], { color: 0x3c4648, tag: 'door-frame', walkable: false });
      const door = {
        id: d.id, name: d.name, collider: col, mesh, closed: !!d.closed,
        setClosed(v) { this.closed = !!v; game.physics.setEnabled(col, this.closed); mesh.visible = this.closed; game.events.emit('door:changed', { id: d.id, closed: this.closed }); },
      };
      door.setClosed(d.closed);
      world.doors[d.id] = door;
    }
  }

  _buildSlabs(ctx, world) {
    const game = this.game, defs = ctx.slabDefs;
    world.slabs = [];
    if (!defs.length) return;
    const g = finishGeometry(new THREE.BoxGeometry(1, 1, 1).toNonIndexed(), 0xffffff, 'lit', {});
    const mesh = new THREE.InstancedMesh(g, game.materials.lit, defs.length);
    mesh.name = 'unstable-slabs';
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const sh = new THREE.Color();
    defs.forEach((d, i) => {
      const w = d.x1 - d.x0, dd = d.z1 - d.z0;
      const slab = {
        id: d.id, deck: d.deck, level: d.level, x0: d.x0, z0: d.z0, x1: d.x1, z1: d.z1, y: d.y, th: d.th, collider: d.collider, index: i, offsetY: 0, dropped: false,
        /** Move the slab down/up by dy metres (collider and visual). Phase 4 animates this for a collapse. */
        drop(dy) { this.offsetY = dy; game.physics.setOffset(this.collider, 0, this.y + dy, 0); setMatrix(this); mesh.instanceMatrix.needsUpdate = true; },
        reset() { this.drop(0); this.dropped = false; },
      };
      world.slabs.push(slab);
    });
    const setMatrix = (slab) => {
      const d = defs[slab.index];
      p.set((d.x0 + d.x1) / 2, d.y - d.th / 2 + slab.offsetY, (d.z0 + d.z1) / 2); s.set(d.x1 - d.x0, d.th, d.z1 - d.z0);
      m.compose(p, q, s); mesh.setMatrixAt(slab.index, m);
    };
    defs.forEach((d, i) => {
      setMatrix(world.slabs[i]);
      shadeAt(d.y - d.th / 2, sh); _col.set(d.color).multiply(sh);
      mesh.setColorAt(i, _col);
    });
    mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
    mesh.frustumCulled = false;
    game.scene.add(mesh);
    world.slabMesh = mesh;
  }

  _buildSolarLamps(game, map) {
    // instanced poles + glowing heads (the head material brightens at night) + additive pools
    const poleG = finishGeometry(new THREE.BoxGeometry(0.14, 3.6, 0.14).translate(0, 1.8, 0).toNonIndexed(), 0xffffff, 'lit', {});
    const n = map.solarLamps.length;
    const poles = new THREE.InstancedMesh(poleG, game.materials.lit, n);
    const headG = new THREE.CylinderGeometry(0.1, 0.5, 0.35, 10).translate(0, 3.75, 0);
    this.solarMat = new THREE.MeshBasicMaterial({ color: 0xffe6b0 });
    game.materials.all.push(this.solarMat);
    const heads = new THREE.InstancedMesh(headG, this.solarMat, n);
    const poolG = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.solarPoolMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, map: this._poolTex() });
    const pools = new THREE.InstancedMesh(poolG, this.solarPoolMat, n);
    const m = new THREE.Matrix4(), c = new THREE.Color(0x3a4246);
    map.solarLamps.forEach((l, i) => {
      m.makeTranslation(l.x, l.y, l.z); poles.setMatrixAt(i, m); poles.setColorAt(i, c); heads.setMatrixAt(i, m);
      m.makeScale(11, 1, 11).setPosition(l.x, l.y + 0.05, l.z); pools.setMatrixAt(i, m);
    });
    for (const o of [poles, heads, pools]) { o.instanceMatrix.needsUpdate = true; o.frustumCulled = false; game.scene.add(o); }
    this.solarPools = pools;
    game.events.on('sky:time', ({ dayFactor }) => this._solarGlow(dayFactor));
    this._solarGlow(game.sky.dayFactor);
  }

  _poolTex() {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  }

  /** Solar lamps glow brighter as the day fades. */
  _solarGlow(day) {
    const night = 1 - Math.max(0, Math.min(1, day));
    this.solarMat.color.setRGB(0.55 + 0.45 * night, 0.5 + 0.4 * night, 0.34 + 0.2 * night);
    this.solarPoolMat.opacity = 0.65 * night; this.solarPools.visible = night > 0.05;
  }

  _registerLiftInteractables(game, map) {
    const dirs = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };
    for (const l of map.lifts) {
      const lift = game.lifts.get(l.id);
      const [cx, cz] = l.center, [w, d] = l.size;
      const inFootprint = (p) => Math.abs(p.x - cx) < w / 2 + 0.15 && Math.abs(p.z - cz) < d / 2 + 0.15;
      const onCar = (p) => inFootprint(p) && Math.abs(p.y - lift.y) < 1.3;
      for (const stop of ['bottom', 'top']) {
        const side = dirs[l.exits[stop]];
        const y = stop === 'bottom' ? lift.yBottom : l.yTop;
        game.interactables.add({
          // standing in the empty shaft you cannot call the car down onto yourself
          enabled: (g) => lift.stop() === stop || lift.moving || !inFootprint(g.player.pos),
          id: `${l.id}:${stop}`, pos: { x: cx + side[0] * (w / 2 + 1.4), y, z: cz + side[1] * (d / 2 + 1.4) }, radius: 4.2, height: 2.6,
          prompt: (g) => {
            if (lift.moving) return 'Lift is moving';
            if (lift.stop() === stop) return onCar(g.player.pos) ? `Ride lift ${stop === 'bottom' ? 'up' : 'down'}` : 'Step onto the lift';
            return 'Call lift';
          },
          onInteract: (g) => {
            if (lift.moving) return;
            if (lift.stop() === stop) { if (onCar(g.player.pos)) lift.goTo(stop === 'bottom' ? 'top' : 'bottom'); } else lift.goTo(stop);
          },
        });
      }
    }
  }

  /**
   * Phase 7b (draw-call budget): from the tunnels the towers cannot be seen, but their window-wall chunks still cost a call each.
   * Deep underground (feet below -5, back on above -3) the tower chunks (`city:building*`, `city:glass*`) are hidden.
   */
  _undergroundCull(game, p) {
    if (!this._cullables) {
      this._cullables = [];
      game.scene.traverse((o) => { if (o.isMesh && /^city:(building|glass)/.test(o.name)) this._cullables.push(o); });
      this._under = false;
    }
    const under = p.pos.y < (this._under ? -3.0 : -5.0);
    if (under === this._under) return;
    this._under = under;
    for (const m of this._cullables) m.visible = !under;
  }

  update(dt, game) {
    this.gates.update(dt);
    this.sun.update(dt);
    this.sea.update(dt);
    const fx = this.fx;
    fx.ads.update(dt); fx.rain.update(dt); fx.searchlights.update(dt); fx.diyaFlicker.update(dt);
    const p = game.player;
    if (p) this._undergroundCull(game, p);
    if (p) {
      this._seaCool -= dt;
      if (p.pos.y < this.map.seaLevel - 0.7 && this.sea.inSea(p.pos) && this._seaCool <= 0) {
        this._seaCool = 1;
        game.events.emit('player:void', { cost: 1, reason: 'sea' });
        p.respawn('sea');
      }
    }
  }
}

void DECK_COLOR;
