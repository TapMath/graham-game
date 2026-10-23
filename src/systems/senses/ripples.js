// Sound ripples: Mithi "sees" by hearing. Every sound that reaches her (a `sound:emit`, and the active loops now and
// then) spawns a soft expanding ring at its source, drawn additive with the depth test off, so it shows through walls
// and fog. Size and brightness follow loudness and distance; Setu's rings are larger, warm gold and come in threes so
// they can be told apart from everything else.
//
//   game.ripples.add({x,y,z, loud, tone, flat, self, scale, life, echoes})   spawn one (tones below)
//   game.ripples.fromLoop(loop)         called by the audio engine for audible loops
//   game.ripples.activeCount()          rings currently alive
//
// One pooled InstancedBufferGeometry (MAX instances, 4 vertices each) and one ShaderMaterial = ONE draw call in total.
// Billboarded rings face the camera; `flat` rings (footsteps, drips) lie on the ground.
import * as THREE from '../../../vendor/three.module.js';
import { KINDS, audibleRange } from '../audio/kinds.js';

const MAX = 96;
export const TONES = {
  neutral: [0.62, 0.9, 1.0],
  step: [0.55, 0.82, 0.95],
  threat: [1.0, 0.42, 0.6],
  machine: [0.4, 0.95, 1.0],
  water: [0.3, 0.68, 1.0],
  drip: [0.5, 0.8, 0.95],
  setu: [1.0, 0.74, 0.34],
  voice: [0.92, 0.96, 1.0],
  echo: [0.8, 0.95, 1.0],
};

const VERT = /* glsl */`
attribute vec3 aCenter; attribute vec4 aData; attribute vec4 aColor;
uniform float uTime;
varying vec2 vUv; varying vec4 vCol; varying float vAge; varying float vW;
void main() {
  float age = (uTime - aData.x) / aData.y;
  if (age < 0.0 || age > 1.0) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vCol = vec4(0.0); vAge = 1.0; vUv = vec2(0.0); vW = 0.1; return; }
  float r = max(aData.z * (1.0 - (1.0 - age) * (1.0 - age)), 0.04);
  // Phase 7b: seen from close by (the speaker you are talking to, the old man under the rubble) a ring a few metres wide filled
  // the screen as a hard-edged square wash. Keep its apparent size under about 17 degrees and let it thin out right next to the eye.
  float dc = distance(aCenter, cameraPosition);
  r = min(r, dc * 0.3 + 0.15);
  vec3 right, up;
  if (aData.w > 0.5) { right = vec3(1.0, 0.0, 0.0); up = vec3(0.0, 0.0, 1.0); }
  else { right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]); up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]); }
  vec3 wp = aCenter + (right * position.x + up * position.y) * r;
  gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  vUv = position.xy; vCol = aColor; vCol.a *= mix(0.15, 1.0, smoothstep(1.5, 6.0, dc)); vAge = age;
  vW = clamp(clamp(r * 0.07, 0.12, 0.5) / r, 0.02, 0.4) * (1.0 - 0.35 * age);   // ring thickness is in metres, not a fraction of the radius
}`;
const FRAG = /* glsl */`
varying vec2 vUv; varying vec4 vCol; varying float vAge; varying float vW;
void main() {
  if (vCol.a <= 0.0) discard;
  float d = length(vUv);
  float w = vW;
  float ring = smoothstep(1.0 - w * 2.2, 1.0 - w * 0.5, d) * (1.0 - smoothstep(1.0 - w * 0.5, 1.0 + w * 0.6, d));
  float d2 = abs(d - 0.64);
  float ring2 = (1.0 - smoothstep(0.0, w * 1.3, d2)) * smoothstep(0.1, 0.35, vAge) * 0.5;
  float fill = (1.0 - smoothstep(0.0, 1.0, d)) * 0.045;
  float fade = (1.0 - vAge); fade *= fade;
  float a = (ring + ring2 + fill) * fade * vCol.a;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vCol.rgb * a * 1.5, a);
}`;

export class RippleSystem {
  init(game) {
    this.game = game;
    game.ripples = this;
    this.max = MAX;
    this.next = 0;
    this.spawned = 0; this.lastKinds = [];
    const base = new THREE.PlaneGeometry(2, 2);
    const geo = new THREE.InstancedBufferGeometry();
    geo.index = base.index; geo.setAttribute('position', base.attributes.position);
    this.center = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.data = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    this.color = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4);
    for (let i = 0; i < MAX; i++) this.data.array[i * 4] = -1e6;
    for (const a of [this.center, this.data, this.color]) a.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('aCenter', this.center); geo.setAttribute('aData', this.data); geo.setAttribute('aColor', this.color);
    geo.instanceCount = MAX;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, uniforms: { uTime: { value: 0 } },
      transparent: true, depthTest: false, depthWrite: false, fog: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 999;
    this.mesh.name = 'ripples';
    game.scene.add(this.mesh);
    this.enabled = true;
    game.events.on('sound:emit', (d) => this._onEmit(d));
    game.debug?.addState('ripples', () => ({ active: this.activeCount(), spawned: this.spawned, last: this.lastKinds.slice(-6) }));
    game.debug?.addAction('ripple', (g, tone = 'neutral', dx = 6, dz = 0, loud = 0.6) => {
      const p = g.player.pos; this.add({ x: p.x + dx, y: p.y + 1, z: p.z + dz, loud, tone }); return this.activeCount();
    });
  }

  activeCount() {
    const t = this.game.time, d = this.data.array; let n = 0;
    for (let i = 0; i < MAX; i++) { const s = d[i * 4], l = d[i * 4 + 1]; if (t < s + l && t >= s - 3) n++; }
    return n;
  }

  _onEmit(d) {
    if (!d || d.x === undefined || !this.enabled) return;
    const spec = KINDS[d.kind];
    let tone = spec ? spec.tone : 'neutral';
    if (tone === null) return;
    if (d.kind === 'mouthorgan' || d.who === 'setu' || d.setu) tone = 'setu';
    const loud = Math.max(0, Math.min(1, d.loudness ?? d.loud ?? spec?.loud ?? 0.5));
    const h = this.game.audio ? this.game.audio.head() : this.game.camera.position;
    const dist = Math.hypot(d.x - h.x, (d.y ?? 0) - h.y, d.z - h.z);
    if (dist > audibleRange(this.game, loud)) return;
    this.lastKinds.push(d.kind); if (this.lastKinds.length > 12) this.lastKinds.shift();
    this.add({ x: d.x, y: d.y ?? 0, z: d.z, loud, tone, flat: d.kind === 'drip' || d.kind === 'footstep' || d.kind === 'splash', dist });
  }

  fromLoop(l) {
    const tone = l.kind === 'water' ? 'water' : (l.kind === 'drone' || l.kind === 'machine' || l.kind === 'lift') ? 'machine' : l.kind === 'dog-pant' ? 'threat' : 'neutral';
    this.add({ x: l.pos.x, y: l.pos.y, z: l.pos.z, loud: Math.min(0.6, l.loud * 0.8), tone, flat: l.kind === 'water', dist: l.d, soft: true });
  }

  /** Spawn a ripple. `loud` 0..1 sets size and brightness; distance is added so far sources stay visible. */
  add(o) {
    const g = this.game;
    const loud = Math.max(0.02, Math.min(1, o.loud ?? 0.4));
    const tone = o.tone && TONES[o.tone] ? o.tone : 'neutral';
    const h = g.audio ? g.audio.head() : g.camera.position;
    const dist = o.dist ?? Math.hypot(o.x - h.x, o.y - h.y, o.z - h.z);
    const setu = tone === 'setu';
    let radius = (1.1 + 5.0 * loud) * (o.scale ?? 1) + dist * 0.045 * (0.5 + loud);
    let life = 1.0 + 1.4 * loud;
    let amp = 0.5 + 0.5 * loud;
    if (o.self) { radius = 0.8 + loud * 2.2; life = 0.9 + loud * 0.4; amp = 0.16 + loud * 0.3; }
    if (o.soft) amp *= 0.55;
    if (tone === 'drip') { radius = 0.7 + loud * 3; life = 1.0; amp = 0.4; }
    if (tone === 'voice') { radius = 14; life = 2.4; amp = 0.3; }
    if (setu) { radius = radius * 1.55 + 2.5; life = 2.7; amp = 0.95; }
    const range = audibleRange(g, loud);
    if (!o.self) amp *= Math.max(0.28, 1 - (dist / (range * 1.15)) * 0.8);
    life = o.life ?? life;
    const echoes = o.echoes ?? (setu ? 3 : tone === 'threat' && loud > 0.55 ? 2 : 1);
    const col = TONES[tone], t = g.time;
    for (let k = 0; k < echoes; k++) {
      const i = this.next; this.next = (this.next + 1) % MAX;
      const c = this.center.array, d = this.data.array, cl = this.color.array;
      c[i * 3] = o.x; c[i * 3 + 1] = o.y; c[i * 3 + 2] = o.z;
      d[i * 4] = t + k * (setu ? 0.42 : 0.3); d[i * 4 + 1] = life * (1 - k * 0.12); d[i * 4 + 2] = radius * (1 - k * 0.22); d[i * 4 + 3] = o.flat ? 1 : 0;
      cl[i * 4] = col[0]; cl[i * 4 + 1] = col[1]; cl[i * 4 + 2] = col[2]; cl[i * 4 + 3] = amp * (1 - k * 0.3);
    }
    this.center.needsUpdate = this.data.needsUpdate = this.color.needsUpdate = true;
    this.spawned++;
  }

  update() {
    this.mat.uniforms.uTime.value = this.game.time;
    // Phase 3's pulsing glow on Setu was a stand-in for these ripples; hide it now that they exist
    const s = this.game.setu;
    if (s && s.glow) s.glow.visible = false;
  }
}
