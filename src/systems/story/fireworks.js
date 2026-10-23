// The festival of lights: fireworks over the city from 19:00 to 01:00 (PLAN 1b). One additive Points draw call (a pool of
// bursts, every particle animated in the vertex shader from its birth time), a launch whistle, a boom after the light and
// crackle (`game.sfx.firework`, muffled on the ground), and the PA wishing everyone a luminous festival. They are visible mostly
// from L2 and L3 (the towers hide the sky from below); on G and U you mainly hear them.
//
//   game.fireworks.burst({x,y,z, kind:'sphere'|'ring'|'willow', color, delay})   one burst at a world position
//   game.fireworks.volley(n, spread)       n bursts around the player over `spread` seconds
//   game.fireworks.active                  true while the festival hours are on (or forced)
//   game.fireworks.force(seconds)          debug: run regardless of the hour for a while
//   Debug: do('fireworks', n)  (forces the show and fires n bursts), state().story6b.fireworks
// Events: `fireworks:burst {x,y,z,kind}`. The PA lines: 19:00 (the festival begins), 00:00 (it winds down).
import * as THREE from '../../../vendor/three.module.js';

const POOL = 9, PER = 150;
const PALETTE = [[1.0, 0.72, 0.28], [1.0, 0.36, 0.55], [0.4, 0.82, 1.0], [0.62, 1.0, 0.55], [0.85, 0.5, 1.0], [1.0, 0.95, 0.75], [1.0, 0.5, 0.2]];

const VS = `
attribute vec3 aOrigin; attribute vec3 aVel; attribute vec4 aMisc; attribute vec3 aColor;
uniform float uTime;
varying vec3 vColor; varying float vA;
void main() {
  float t = uTime - aMisc.x, life = aMisc.y;
  if (t < 0.0 || t > life) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); gl_PointSize = 0.0; vA = 0.0; vColor = vec3(0.0); return; }
  float k = t / life;
  float drag = 2.2;
  vec3 p = aOrigin + aVel * (1.0 - exp(-drag * t)) / drag;
  p.y -= 3.2 * t * t * (0.35 + 0.8 * k);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float flick = 0.62 + 0.38 * sin(uTime * 36.0 + aMisc.z * 19.0);
  float fade = pow(1.0 - k, 1.4);
  float born = smoothstep(0.0, 0.05, k);
  vA = fade * mix(1.0, flick, k) * born;
  vColor = aColor * (1.0 + 2.2 * (1.0 - k) * (1.0 - k) * (1.0 - k));
  gl_PointSize = clamp(aMisc.w * 2300.0 / max(1.0, -mv.z) * (1.25 - 0.65 * k), 3.0, 34.0);
  gl_Position = projectionMatrix * mv;
}`;
const FS = `
varying vec3 vColor; varying float vA;
void main() {
  vec2 c = gl_PointCoord - 0.5; float r = length(c) * 2.0;
  float a = smoothstep(1.0, 0.0, r);
  gl_FragColor = vec4(vColor, min(1.0, a * 1.6) * vA);
}`;

const rnd = (a, b) => a + Math.random() * (b - a);

export class FireworkSystem {
  init(game) {
    this.game = game;
    game.fireworks = this;
    const n = POOL * PER;
    this.attr = {
      origin: new Float32Array(n * 3), vel: new Float32Array(n * 3), misc: new Float32Array(n * 4), color: new Float32Array(n * 3),
    };
    for (let i = 0; i < n; i++) this.attr.misc[i * 4] = 1e9;                     // never born
    const geo = this.geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));          // unused, three needs it
    geo.setAttribute('aOrigin', new THREE.BufferAttribute(this.attr.origin, 3));
    geo.setAttribute('aVel', new THREE.BufferAttribute(this.attr.vel, 3));
    geo.setAttribute('aMisc', new THREE.BufferAttribute(this.attr.misc, 4));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.attr.color, 3));
    this.mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 } } });
    this.points = new THREE.Points(geo, this.mat);
    this.points.frustumCulled = false; this.points.renderOrder = 5; this.points.visible = false; this.points.name = 'fireworks';
    game.scene.add(this.points);
    this.slot = 0; this.bursts = 0; this.last = null; this.nextAt = 3; this._forceUntil = 0; this._said = {}; this._live = 0; this._lastBurstT = -99;
    const glow = this.glow = document.createElement('div');
    glow.id = 'cine-fireglow'; document.body.appendChild(glow);
    game.events.on('clock:hour', ({ hour }) => this._hour(hour));
    game.debug?.addAction('fireworks', (g, n = 3, front = true) => { this.force(40); this.volley(n, 0.4, front); return this.snapshot(); });
    game.debug?.addAction('fireworksOff', () => { this._forceUntil = 0; return true; });
  }

  get hour() { return this.game.clock ? this.game.clock.hour : 12; }
  get active() { return this.game.time < this._forceUntil || this.hour >= 19 || this.hour < 1; }
  force(seconds = 30) { this._forceUntil = this.game.time + seconds; }

  /** One burst. Position is world space; `delay` seconds from now. */
  burst(o = {}) {
    const g = this.game, p = g.player.pos;
    const ang = o.front ? -g.player.yaw - Math.PI / 2 + rnd(-0.55, 0.55) : rnd(0, Math.PI * 2), dist = rnd(70, 150);
    const x = o.x ?? p.x + Math.cos(ang) * dist, z = o.z ?? p.z + Math.sin(ang) * dist, y = o.y ?? Math.max(95, p.y + rnd(55, 105)) + rnd(0, 30);
    const kind = o.kind ?? (Math.random() < 0.18 ? 'ring' : Math.random() < 0.28 ? 'willow' : 'sphere');
    const base = PALETTE[(o.color ?? Math.floor(Math.random() * PALETTE.length)) % PALETTE.length];
    const alt = PALETTE[Math.floor(Math.random() * PALETTE.length)];
    const birth = g.time + (o.delay ?? 0), life = kind === 'willow' ? rnd(3.2, 4.2) : rnd(2.0, 2.8);
    const a = this.attr, s = this.slot; this.slot = (this.slot + 1) % POOL;
    const sp = kind === 'willow' ? rnd(32, 42) : rnd(40, 58);
    // ring bursts lie in a tilted plane
    const tx = rnd(-0.6, 0.6), tz = rnd(-0.6, 0.6);
    for (let i = 0; i < PER; i++) {
      const j = s * PER + i;
      let dx, dy, dz;
      if (kind === 'ring') { const t = (i / PER) * Math.PI * 2; dx = Math.cos(t); dz = Math.sin(t); dy = dx * tx + dz * tz; }
      else { const u = Math.random() * 2 - 1, t = Math.random() * Math.PI * 2, r = Math.sqrt(1 - u * u); dx = r * Math.cos(t); dz = r * Math.sin(t); dy = u; }
      const v = sp * (kind === 'ring' ? 0.8 : 0.45 + Math.random() * 0.6);
      a.origin[j * 3] = x; a.origin[j * 3 + 1] = y; a.origin[j * 3 + 2] = z;
      a.vel[j * 3] = dx * v; a.vel[j * 3 + 1] = dy * v; a.vel[j * 3 + 2] = dz * v;
      const mixc = (i % 5 === 0) ? alt : base;
      a.color[j * 3] = mixc[0]; a.color[j * 3 + 1] = mixc[1]; a.color[j * 3 + 2] = mixc[2];
      a.misc[j * 4] = birth; a.misc[j * 4 + 1] = life * rnd(0.82, 1.05); a.misc[j * 4 + 2] = Math.random(); a.misc[j * 4 + 3] = kind === 'willow' ? 0.5 : 0.62;
    }
    for (const k of ['aOrigin', 'aVel', 'aMisc', 'aColor']) this.geo.attributes[k].needsUpdate = true;
    this.bursts++; this.last = { x: Math.round(x), y: Math.round(y), z: Math.round(z), kind }; this._lastBurstT = g.time;
    const lvl = p.y;
    const dd = Math.hypot(x - p.x, y - p.y, z - p.z);
    const muffled = lvl < 6;
    setTimeout(() => g.sfx?.firework(dd, muffled, muffled ? 0.7 : 0.55), Math.max(0, (o.delay ?? 0) * 1000));
    // a coloured wash on the screen when the sky is open to you
    if (!muffled) this._glow(base, 0.12 + (lvl > 30 ? 0.1 : 0), (o.delay ?? 0) * 1000 + 700);
    g.events.emit('fireworks:burst', { x, y, z, kind });
  }

  _glow(c, a, delayMs) {
    setTimeout(() => {
      const e = this.glow, col = `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
      e.style.transition = 'none'; e.style.background = `radial-gradient(ellipse at 50% 0%, ${col} 0%, transparent 62%)`; e.style.opacity = String(a);
      void e.offsetWidth; e.style.transition = 'opacity 1.4s ease-out'; e.style.opacity = '0';
    }, delayMs);
  }

  volley(n = 4, spread = 3, front = false) {
    for (let i = 0; i < n; i++) this.burst({ front, delay: (i / Math.max(1, n)) * spread + rnd(0, 0.3), kind: i % 3 === 1 ? 'ring' : undefined });
  }

  _hour(hour) {
    const g = this.game;
    if (hour === 19 && !this._said[19]) {
      this._said[19] = true;
      g.pa?.say('Good evening. The Festival of Lights has begun. Please look up, and enjoy a luminous festival. Not that far up.', { force: true });
      setTimeout(() => this.volley(5, 4), 2500);
    } else if (hour === 0 && !this._said[0]) {
      this._said[0] = true;
      g.pa?.say('The festival is concluding. Thank you for being luminous. Please return to your registered dwelling. The lights will now be dimmed for your convenience.', { force: true });
    }
  }

  update(dt, game) {
    this.mat.uniforms.uTime.value = game.time;
    const live = game.time - this._lastBurstT < 5;
    this.points.visible = live;
    if (!this.active || game.mode !== 'playing') return;
    if (game.time >= this.nextAt) {
      const up = game.player.pos.y > 20;
      this.burst({});
      if (Math.random() < 0.3) this.burst({ delay: rnd(0.2, 0.7) });
      this.nextAt = game.time + (up ? rnd(2.2, 5.5) : rnd(4.5, 11));
    }
  }

  snapshot() {
    return { active: this.active, bursts: this.bursts, last: this.last, hour: +this.hour.toFixed(2), forced: this.game.time < this._forceUntil, visible: this.points.visible };
  }
}
