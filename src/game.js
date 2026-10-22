// The shared Game object. One instance, passed to every system.
//
//   game.scene / camera / renderer       three.js
//   game.physics                          PhysicsWorld (src/core/physics.js)
//   game.input                            Input (src/core/input.js)
//   game.events                           pub/sub bus (src/core/events.js)
//   game.rng                              seeded Rng; use game.rng.fork('name') for a private stream
//   game.params                           parsed URL params
//   game.materials                        shared materials (src/world/materials.js)
//   game.world                            set by the world system: { name, spawn:{x,y,z,yaw}, bounds }
//   game.player                           set by Player.init
//   game.time / game.frame                simulation seconds / steps (only advance while playing)
//   game.mode                             'menu' | 'playing' | 'paused' | 'ending'
//   game.flags                            free-form run flags (breachKnown, cityWarned, ...)
//   game.debug                            DebugApi (src/debug.js); extend its state()/set() from your system
//
// Systems are objects { init(game), update(dt, game), reset?(game) } registered with addSystem in
// the order they should run each simulation step (fixed dt = 1/60). Talk to other systems through
// game.events, or look one up with game.system('name').
import * as THREE from 'three';
import { Events } from './core/events.js';
import { createRng } from './core/rng.js';
import { Input } from './core/input.js';
import { PhysicsWorld } from './core/physics.js';
import { createMaterials } from './world/materials.js';

export const STEP = 1 / 60;
export const MODES = ['menu', 'playing', 'paused', 'ending'];

export class Game {
  constructor({ canvas, params }) {
    this.canvas = canvas;
    this.params = params;
    this.events = new Events();
    this.rng = createRng(params.seed);
    this.flags = {};
    this.time = 0;
    this.frame = 0;
    this.mode = 'menu';
    this.systems = [];
    this._byName = new Map();
    this._timers = [];

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.setSize(window.innerWidth, window.innerHeight, false);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 400);
    this.scene.add(this.camera);
    this.materials = createMaterials();
    this.physics = new PhysicsWorld();
    this.input = new Input(canvas, this.events);
    this.world = null;
    this.player = null;
    this.debug = null;
    window.addEventListener('resize', () => this.resize());
  }

  /** Register a system (order matters). Returns the system. */
  addSystem(name, system) {
    system.name = name;
    this.systems.push(system);
    this._byName.set(name, system);
    return system;
  }

  system(name) { return this._byName.get(name); }

  /** Call init on every system, in registration order. */
  init() {
    for (const s of this.systems) s.init?.(this);
    this.events.emit('game:init', {});
  }

  /** Start a fresh run state (systems restore their own state in reset). */
  reset() {
    this.time = 0; this.frame = 0; this.flags = {};
    for (const s of this.systems) s.reset?.(this);
    this.events.emit('game:reset', {});
  }

  setMode(mode) {
    if (this.mode === mode) return;
    const prev = this.mode;
    this.mode = mode;
    this.events.emit('mode:changed', { mode, prev });
  }

  /** One fixed simulation step. */
  update(dt = STEP) {
    this.time += dt;
    this.frame++;
    for (const s of this.systems) s.update?.(dt, this);
    this.input.endStep();
    if (this._timers.length) {
      const due = this._timers.filter((t) => t.at <= this.time);
      if (due.length) { this._timers = this._timers.filter((t) => t.at > this.time); due.forEach((t) => t.resolve()); }
    }
  }

  /** Promise that resolves after `seconds` of SIMULATION time (not wall time). */
  wait(seconds) { return new Promise((resolve) => this._timers.push({ at: this.time + seconds, resolve })); }

  render() { this.renderer.render(this.scene, this.camera); }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Render statistics for the last frame (draw calls are the performance budget, see PLAN section 4). */
  renderStats() {
    const i = this.renderer.info;
    return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures };
  }
}
