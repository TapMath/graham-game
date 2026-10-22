// Visions: Mithi's second sight. A 2 to 3 second glitchy, over-exposed, OK-Computer glimpse of the world as seen from
// Setu's current position, with a caption of what he hears.
//
//   game.senses.vision(opts) / game.visionSystem.start(opts)
//        opts: { reason: 'breath'|'demand'|'story'|'debug', duration (s, default 2.7), caption, from:{x,y,z,yaw},
//                hold (extra seconds of the steady phase; tests), force }
//   game.visionSystem.available()      the on-demand cooldown (2 game hours) is over and Setu is still out there
//   game.visionSystem.active / count / lastAt
//
// Triggers: Setu's breath crossing 50/25/10 % (2.5 s after the story line, so it can be read), on demand (hold Q for 2 s;
// cooldown 2 game hours; only while he is not yet found), and story hooks from Phase 6 (`game.senses.vision({...})`, always
// allowed). Events: vision:start {reason, caption, x,y,z}, vision:end {reason}.
//
// Rendering: while a vision is active `game.render` is replaced by a two-pass render: the scene from a second camera at
// Setu's eye into a low-resolution render target (fog opened out, the senses grade off, ambient lifted underground), then a
// full-screen shader pass: block tears, vertical roll, chromatic offset, colour bleed, over-exposure with a soft clip,
// scanlines, grain, vignette, and a white-out flash at both ends. CSS layers add noise, scanlines, colour bleed, scrambled
// text fragments and the caption. The player is held still (game.modal) and the clock pauses for the duration.
import * as THREE from 'three';
import { levelAt } from '../../world/levels.js';

const HEARS = {
  liftWreck: ['Wind howling down a vent. Metal ticking as it cools.', 'Dust settling. Somewhere, water dripping into water.', 'A far grinding, and under it the wind, always the wind.'],
  catacombs: ['Children whispering. A bell, far off, and then nothing.', 'Slow dripping. Someone humming without a tune.', 'Bare feet on stone. Nobody speaks above a breath.'],
  boringSite: ['The grind of the great machine. A man shouting numbers.', 'Cutter teeth on rock. A child coughing, stifled.', 'Chains. A bell. "Faster," says someone big.'],
  clinic: ['A radio murmuring. Glass touching glass. A tired, kind voice.', 'Someone coughing who is not him. The tick of a lamp.', 'A page turning. "Lie still," the doctor says.'],
  ventExit: ['Wind in a grille. Sirens above, small and far.', 'Rain. His own breath, loud in his ears.', 'Crowds, muffled. A loudspeaker saying nothing useful.'],
  triageTents: ['Sobbing. A radio crackling names. Rain on canvas.', 'Sirens. Strangers saying "sorry, I do not know," again and again.', 'Generators humming. A woman reading a list of the missing.'],
  bridge: ['Waves under steel. Gulls. His own steps, counted.', 'The wind off the sea, clean. A mouth organ, very softly.', 'Far below, the city waking. Nobody near. Waiting.'],
  found: ['Didi\'s voice, close. His own breathing, easier now.'],
};
const FRAGS = ['REMAIN CALM', 'SUBJECT 0471', 'COUNT YOUR STEPS', 'didi?', 'LIGHT IS A SERVICE', 'BREATHE IN / HOLD', 'SECTOR 4 : NOMINAL', 'HAVE A PLEASANT DAY', '41  42  43  44', 'who is singing', 'DO NOT LOOK UP', 'it is so dark here', 'x x x  x x', 'MISSING: 1'];
const GLYPHS = 'ABCDEFGHJKLMNPRSTUVWXYZ0123456789#%&/\\<>_=+';

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const FRAG = `
uniform sampler2D tDiffuse; uniform float uTime; uniform float uGlitch; uniform float uFlash; uniform float uAspect; uniform float uExpo;
varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main(){
  vec2 uv = vUv; float t = uTime;
  float spk = step(0.9, hash(vec2(floor(t * 7.0), 9.0))) * (0.3 + uGlitch);       // zoom punches
  uv = 0.5 + (uv - 0.5) * (1.0 - 0.055 * spk);
  float fr = floor(t * 9.0);
  float roll = step(0.97, hash(vec2(fr, 3.0))) * (hash(vec2(fr, 4.0)) - 0.5) * 0.35 * (0.3 + uGlitch);
  uv.y = fract(uv.y + roll);
  float band = floor(uv.y * 26.0), ft = floor(t * 13.0);
  float bn = hash(vec2(band, ft));
  float tear = step(0.88 - 0.32 * uGlitch, bn) * (hash(vec2(band, ft + 7.0)) - 0.5) * 0.16 * (0.35 + uGlitch);
  uv.x += tear;
  uv.x += (hash(vec2(floor(uv.y * 260.0), floor(t * 30.0))) - 0.5) * 0.003 * (0.5 + uGlitch);
  float ca = (0.004 + 0.022 * uGlitch) * (1.0 + 0.5 * sin(t * 3.1));
  vec3 col;
  col.r = texture2D(tDiffuse, uv + vec2(ca, ca * 0.3)).r;
  col.g = texture2D(tDiffuse, uv).g;
  col.b = texture2D(tDiffuse, uv - vec2(ca, ca * 0.3)).b;
  vec3 bleed = vec3(0.0);
  for (int i = 1; i <= 6; i++) {
    float o = float(i) * 0.0065;
    bleed += texture2D(tDiffuse, uv + vec2(o, 0.0)).rgb * vec3(1.0, 0.32, 0.66) + texture2D(tDiffuse, uv - vec2(o, 0.0)).rgb * vec3(0.3, 0.88, 1.0);
  }
  bleed /= 12.0;
  col += bleed * (0.55 + 0.6 * uGlitch);
  vec3 halo = vec3(0.0);                                                           // halation: bright areas smear toward the centre
  for (int i = 1; i <= 8; i++) { vec3 sm = texture2D(tDiffuse, uv + (vec2(0.5) - uv) * (float(i) * 0.05)).rgb; halo += max(sm - 0.28, 0.0); }
  col += halo / 8.0 * vec3(1.0, 0.72, 0.46) * 1.8;
  float luma = dot(col, vec3(0.299, 0.587, 0.114));
  col = col * uExpo + vec3(0.03, 0.06, 0.07);                       // lifted, teal shadows
  col = mix(col, vec3(luma * uExpo * 1.1), 0.22);
  col *= mix(vec3(0.9, 1.0, 1.1), vec3(1.2, 1.05, 0.82), smoothstep(0.1, 0.9, luma * uExpo));   // warm highlights, cold shadows
  col = vec3(1.0) - exp(-col * 1.7);
  col += vec3(0.9, 0.8, 0.65) * pow(max(luma * uExpo - 0.7, 0.0), 1.4) * 0.35;
  float n = hash(uv * vec2(uAspect * 500.0, 500.0) + t);
  col += (n - 0.5) * (0.1 + 0.12 * uGlitch);
  col *= 0.9 + 0.1 * sin(gl_FragCoord.y * 3.14159);
  vec2 q = vUv - 0.5; col *= 1.0 - dot(q, q) * 1.15;
  float neg = step(0.972, hash(vec2(floor(t * 10.0), 11.0))) * step(0.3, uGlitch);   // a stray negative frame
  col = mix(col, vec3(1.0) - col, neg * 0.9);
  col = mix(col, vec3(1.0, 0.98, 0.94), uFlash);
  gl_FragColor = vec4(col, 1.0);
  gl_FragColor = linearToOutputTexel(gl_FragColor);
}`;

const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const scramble = (s, k, rnd = Math.random) => { let o = ''; for (const ch of s) o += ch === ' ' || rnd() > k ? ch : GLYPHS[Math.floor(rnd() * GLYPHS.length)]; return o; };

export class VisionSystem {
  init(game) {
    this.game = game;
    game.visionSystem = this;
    this.active = false; this.count = 0; this.lastT = -99; this.lastAt = null; this.queue = [];
    this.rng = game.rng.fork('vision');
    this.reason = null; this.caption = ''; this.t0 = 0; this.dur = 2.7; this.hold = 0; this.setModal = false; this.pos = new THREE.Vector3(); this.yaw = 0;
    this.COOLDOWN_HOURS = 2;
    this._buildDom();
    this.cam = new THREE.PerspectiveCamera(88, 16 / 9, 0.05, 400); this.cam.rotation.order = 'YXZ';
    this.rt = null; this._ui = { w: 0, h: 0 };
    this.quadScene = new THREE.Scene(); this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.quadMat = new THREE.ShaderMaterial({
      vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
      uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uGlitch: { value: 1 }, uFlash: { value: 0 }, uAspect: { value: 1.78 }, uExpo: { value: 2.2 } },
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.quadMat); quad.frustumCulled = false; this.quadScene.add(quad);
    // two-pass render while active
    const orig = game.render.bind(game);
    game.render = () => { if (this.active) { try { this._render(); } catch (e) { console.error(e); this._finish(); orig(); } } else orig(); };

    game.events.on('setu:story', ({ pct }) => { if (pct === 50 || pct === 25 || pct === 10) this.queue.push({ at: game.time + 2.5, opts: { reason: 'breath', pct } }); });
    game.events.on('setu:found', () => { this.queue.length = 0; });
    game.debug?.addAction('vision', (g, opts = {}) => { const ok = this.start({ reason: 'debug', force: true, ...opts }); return { ok, caption: this.caption, from: this.active ? { x: +this.pos.x.toFixed(1), y: +this.pos.y.toFixed(1), z: +this.pos.z.toFixed(1) } : null }; });
    game.debug?.addAction('visionEnd', () => { this._finish(); return true; });
    game.debug?.addAction('visionReset', () => { this.lastT = -99; return true; });
    game.debug?.addState('vision', () => ({ active: this.active, count: this.count, reason: this.reason, caption: this.caption, available: this.available(), age: this.active ? +(game.time - this.t0).toFixed(2) : null, queued: this.queue.length, cooldownHours: +Math.max(0, this.COOLDOWN_HOURS - (game.clock ? game.clock.t - this.lastT : 99)).toFixed(2) }));
  }

  reset() { this.queue.length = 0; this.lastT = -99; if (this.active) this._finish(); }

  /**
   * Phase 7b: second sight never takes her out of a fight. False while a hazard is on her (a chasing dog, an approaching or
   * grabbing wanderer, a drone or camera on her trail, a guard who has seen her, a cracking slab, deep water), and for 2 s
   * after it lets go; and false whenever the player is not Mithi (Jeetu has no second sight).
   */
  calm() {
    const g = this.game, p = g.player.pos;
    if (g.party && g.party.active !== 'mithi') return false;
    let danger = !!g.hazards?.detaining || !!g.cinematics?.current;
    if (!danger && g.hazards?.enabled) {
      for (const e of g.hazards.list()) {
        const dx = e.pos.x - p.x, dz = e.pos.z - p.z, d = Math.hypot(dx, dz), dy = Math.abs(e.pos.y - p.y);
        if (e.kind === 'dog') { if (e.alert > 0 && d < 30 && dy < 3) danger = true; }
        else if (e.kind === 'deranged') { if (e.alert >= 0.6 && d < 20 && dy < 3) danger = true; }
        else if (e.kind === 'drone') { if (e.alert > 0 && d < 40 && dy < 26) danger = true; }
        else if (e.kind === 'camera') { if (e.alert > 0 && d < 25) danger = true; }
        else if (e.kind === 'guard') { if (e.alert > 0 && d < 20 && dy < 4) danger = true; }
        else if (e.kind === 'slab') { if (d < 14) danger = true; }
        if (danger) break;
      }
      if (!danger && g.hazards.flood?.depthAt?.(p) > 0.35) danger = true;
    }
    if (danger) this._calmAt = g.time + 2;
    return !danger && g.time >= (this._calmAt ?? 0);
  }

  available() {
    const g = this.game, s = g.setu;
    if (this.active || g.modal || g.mode !== 'playing') return false;
    if (!this.calm()) return false;
    if (!s || s.dead || s.found || s.following) return false;
    if (g.canSee && g.canSee() === true) return false;
    return !g.clock || g.clock.t - this.lastT >= this.COOLDOWN_HOURS;
  }

  _caption(opts) {
    if (opts.caption) return opts.caption;
    const s = this.game.setu;
    const list = HEARS[s && (s.found || s.following) ? 'found' : (s && s.windowId) || 'liftWreck'] ?? HEARS.liftWreck;
    return this.rng.pick(list);
  }

  /** Pick the camera: Setu's eye, facing the most open direction near where he looks. */
  _place(opts) {
    const g = this.game, s = g.setu;
    if (opts.from) { this.pos.set(opts.from.x, opts.from.y, opts.from.z); this.yaw = opts.from.yaw ?? 0; return; }
    if (!s) { const p = g.player.pos; this.pos.set(p.x, p.y + 1.1, p.z); this.yaw = g.player.yaw + Math.PI; return; }
    this.pos.set(s.pos.x, s.pos.y + 1.1, s.pos.z);
    const o = { x: this.pos.x, y: this.pos.y, z: this.pos.z }, d = { x: 0, y: 0, z: 0 };
    let best = s.yaw, bestD = -1;
    for (let k = 0; k < 12; k++) {
      const yaw = s.yaw + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 6);
      d.x = -Math.sin(yaw); d.z = -Math.cos(yaw);
      const hit = g.physics.raycast(o, d, 18, (c) => c.solid || c.walkable);
      const dist = hit ? hit.dist : 18;
      const score = dist - Math.abs(k) * 0.15;
      if (score > bestD) { bestD = score; best = yaw; }
      if (k === 0 && dist > 6) break;                               // he is already looking at something worth seeing
    }
    this.yaw = best;
  }

  start(opts = {}) {
    const g = this.game;
    if (this.active) return false;
    if (!opts.force && (opts.reason === 'demand' || opts.reason == null) && !this.available()) return false;
    if (g.mode !== 'playing' && !opts.force) return false;
    this.reason = opts.reason ?? 'story';
    this.caption = this._caption(opts);
    this._place(opts);
    this.dur = Math.max(1.2, opts.duration ?? 2.4 + this.rng.range(0, 0.5));
    this.hold = opts.hold ?? 0;
    this.t0 = g.time; this.active = true;
    this.lastT = g.clock ? g.clock.t : 0; this.lastAt = g.time; this.count++;
    this.setModal = !g.modal; if (this.setModal) g.modal = true;
    document.body.classList.add('in-vision');
    this._dom.root.classList.add('on');
    this._dom.cap.dataset.target = this.caption;
    const h = g.clock ? g.clock.hhmm : '--:--';
    this._dom.label.innerHTML = `<s>SUBJECT 0471</s> <i>setu</i><br><b>2ND SIGHT</b> <em>REC</em><br>LVL ${levelAt(this.pos.y - 1.1)} &nbsp;${h}`;
    g.events.emit('vision:start', { reason: this.reason, caption: this.caption, x: this.pos.x, y: this.pos.y, z: this.pos.z });
    this._frags();
    return true;
  }

  _finish() {
    if (!this.active) return;
    this.active = false;
    const g = this.game;
    if (this.setModal) g.modal = false;
    this.setModal = false;
    document.body.classList.remove('in-vision');
    this._dom.root.classList.remove('on');
    g.events.emit('vision:end', { reason: this.reason });
    g.messages?.say('Setu hears: ' + this.caption, { kind: 'clue', ttl: 10 });
  }

  /** progress info for the current frame */
  _prog() {
    const age = this.game.time - this.t0 - 0;
    const held = this.hold > 0 ? Math.min(Math.max(age - 0.6, 0), this.hold) : 0;
    const a = age - held;                                           // time that really passed in the story of the vision
    return { age, a, u: a / this.dur, held: this.hold > 0 && age > 0.6 && age < 0.6 + this.hold };
  }

  update(dt, game) {
    if (!this.active) {
      // queued breath visions wait for a free moment
      if (this.queue.length && game.time >= this.queue[0].at && !game.modal && game.mode === 'playing' && this.calm()) this.start(this.queue.shift().opts);
      return;
    }
    const age = game.time - this.t0;
    const end = this.dur + this.hold;
    if (age >= end) { this._finish(); return; }
    this._domUpdate(age, end);
  }

  // ------------------------------------------------------------------ rendering
  _render() {
    const g = this.game, r = g.renderer, sc = g.scene, cam = this.cam;
    const { age, a } = this._prog();
    const u = Math.max(0, Math.min(1, a / this.dur));
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    const w = Math.max(64, Math.floor(size.x * 0.55)), h = Math.max(36, Math.floor(size.y * 0.55));
    if (!this.rt || this.rt.width !== w || this.rt.height !== h) {
      this.rt?.dispose();
      this.rt = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    }
    // Setu's eye, swaying a little
    const sway = Math.sin(age * 1.1) * 0.32, bob = Math.sin(age * 2.3) * 0.015;
    cam.aspect = size.x / size.y; cam.fov = 86 + Math.sin(age * 0.8) * 3; cam.updateProjectionMatrix();
    cam.position.copy(this.pos); cam.position.y += bob;
    cam.rotation.set(-0.05 + Math.sin(age * 0.7) * 0.05, this.yaw + sway, Math.sin(age * 0.45) * 0.04, 'YXZ');

    // stash and grade the scene for his eyes: open fog, no senses grade, no wave, lifted ambient where he is underground
    const fog = sc.fog, U = g.materials.sense;
    const st = { near: fog.near, far: fog.far, sat: U.uSenseSat.value, dim: U.uSenseDim.value, pulse: U.uPulseStrength.value };
    const sky = g.sky, hemi = sky ? sky.hemi.intensity : 1;
    const under = this.pos.y < -4;
    fog.near = 3; fog.far = under ? 46 : 85;
    U.uSenseSat.value = 1; U.uSenseDim.value = 1; U.uPulseStrength.value = 0;
    if (sky) sky.hemi.intensity = hemi * (under && g.player.pos.y > -4 ? 3.2 : 1.4);
    const sm = g.setu?.model?.group, mm = g.view?.mithi?.group, rip = g.ripples?.mesh;
    const sv = sm ? sm.visible : false, mv = mm ? mm.visible : false, rv = rip ? rip.visible : false;
    if (sm) sm.visible = false;
    if (rip) rip.visible = false;
    if (mm) mm.visible = false;
    const prevRT = r.getRenderTarget();
    r.setRenderTarget(this.rt);
    r.render(sc, cam);
    r.setRenderTarget(prevRT);
    fog.near = st.near; fog.far = st.far; U.uSenseSat.value = st.sat; U.uSenseDim.value = st.dim; U.uPulseStrength.value = st.pulse;
    if (sky) sky.hemi.intensity = hemi;
    if (sm) sm.visible = sv; if (rip) rip.visible = rv; if (mm) mm.visible = mv;

    // the glitch envelope: wild at the start and the end, with random spikes
    const spike = (Math.sin(age * 17.0) * Math.sin(age * 5.3) > 0.82 ? 0.5 : 0) + (Math.sin(age * 41.0) > 0.96 ? 0.4 : 0);
    const glitch = Math.min(1.7, (1 - smooth(0, 0.28, u)) * 0.9 + smooth(0.72, 1, u) * 1.1 + 0.42 + spike);
    const flash = (1 - smooth(0, 0.2, u)) * 0.95 + smooth(0.86, 1, u) * 0.95;
    const qm = this.quadMat.uniforms;
    qm.tDiffuse.value = this.rt.texture; qm.uTime.value = performance.now() / 1000; qm.uGlitch.value = glitch; qm.uFlash.value = Math.min(1, flash); qm.uAspect.value = size.x / size.y;
    qm.uExpo.value = 3.0 + 0.6 * Math.sin(age * 2.0) + (1 - smooth(0, 0.4, u)) * 1.5;
    r.render(this.quadScene, this.quadCam);
  }

  // ------------------------------------------------------------------ DOM overlay
  _buildDom() {
    const root = document.createElement('div'); root.id = 'vision-fx';
    root.innerHTML = `<canvas class="v-noise" width="320" height="180"></canvas><div class="v-scan"></div><div class="v-bleed a"></div><div class="v-bleed b"></div>
<div class="v-frags"></div><div class="v-label"></div><div class="v-cap"><span class="k">HE HEARS</span><span class="t"></span></div>`;
    document.body.appendChild(root);
    const st = document.createElement('style');
    st.textContent = `
#vision-fx{position:fixed;inset:0;z-index:12;pointer-events:none;opacity:0;font-family:Inter,'Helvetica Neue',Helvetica,Arial,sans-serif;color:#eef6ff}
#vision-fx.on{opacity:1}
#vision-fx .v-noise{position:absolute;inset:0;width:100%;height:100%;image-rendering:pixelated;mix-blend-mode:screen;opacity:.085}
#vision-fx .v-scan{position:absolute;inset:0;background:repeating-linear-gradient(to bottom,rgba(200,235,255,.1) 0 1px,transparent 1px 4px);mix-blend-mode:screen}
#vision-fx .v-scan::after{content:'';position:absolute;left:0;right:0;height:14%;top:-14%;background:linear-gradient(to bottom,transparent,rgba(255,255,255,.12),transparent);animation:vscan 1.9s linear infinite}
@keyframes vscan{to{top:110%}}
#vision-fx .v-bleed{position:absolute;top:0;bottom:0;width:38%;mix-blend-mode:screen;opacity:.35;animation:vbleed .31s steps(3) infinite}
#vision-fx .v-bleed.a{left:0;background:linear-gradient(to right,rgba(255,60,150,.55),transparent)}
#vision-fx .v-bleed.b{right:0;background:linear-gradient(to left,rgba(40,220,255,.5),transparent)}
@keyframes vbleed{0%{opacity:.22;transform:translateX(0)}33%{opacity:.5;transform:translateX(6px)}66%{opacity:.3;transform:translateX(-4px)}100%{opacity:.4;transform:translateX(2px)}}
#vision-fx .v-frags span{position:absolute;font-size:13px;letter-spacing:.26em;text-transform:uppercase;color:#f4fbff;text-shadow:2px 0 rgba(255,60,120,.8),-2px 0 rgba(60,230,255,.8);white-space:nowrap;mix-blend-mode:screen}
#vision-fx .v-frags span.big{font-size:30px;letter-spacing:.08em;font-weight:200}
#vision-fx .v-frags span.hand{font-family:'Bradley Hand','Segoe Script','Comic Sans MS',cursive;font-style:italic;text-transform:none;letter-spacing:.02em;font-size:22px;color:#ffe8b0;text-shadow:0 0 6px rgba(255,170,60,.8)}
#vision-fx .v-label{position:absolute;left:5vw;top:11vh;font-size:11px;letter-spacing:.22em;line-height:1.7;text-transform:uppercase;text-shadow:2px 0 rgba(255,60,120,.8),-2px 0 rgba(60,230,255,.8)}
#vision-fx .v-label s{opacity:.7}#vision-fx .v-label i{font-family:'Bradley Hand','Segoe Script',cursive;text-transform:none;font-size:16px;color:#ffe8b0;letter-spacing:0}
#vision-fx .v-label em{color:#ff5a6a;font-style:normal}
#vision-fx .v-cap{position:absolute;left:50%;bottom:11vh;transform:translateX(-50%);width:min(80vw,760px);text-align:center;text-shadow:0 0 10px rgba(0,0,0,.9),2px 0 rgba(255,60,120,.7),-2px 0 rgba(60,230,255,.7)}
#vision-fx .v-cap .k{display:block;font-size:10px;letter-spacing:.34em;color:rgba(220,240,255,.75);margin-bottom:6px}
#vision-fx .v-cap .t{font-size:21px;line-height:1.4;font-style:italic;font-weight:300;letter-spacing:.02em}
body.in-vision .grahan-hud{opacity:.16;transition:opacity .3s}
body.in-vision #fx-vignette{opacity:.35}`;
    document.head.appendChild(st);
    this._dom = { root, noise: root.querySelector('.v-noise'), frags: root.querySelector('.v-frags'), label: root.querySelector('.v-label'), cap: root.querySelector('.v-cap .t') };
    this._dom.nctx = this._dom.noise.getContext('2d');
    this._dom.img = this._dom.nctx.createImageData(320, 180);
    this._fr = [];
  }

  _frags() {
    const f = this._dom.frags; f.innerHTML = ''; this._fr = [];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const el = document.createElement('span');
      const text = i === 0 ? this.rng.pick(['didi?', 'where is didi', 'didi, it is dark']) : this.rng.pick(FRAGS);
      el.className = i === 0 ? 'hand' : this.rng.chance(0.25) ? 'big' : '';
      el.style.left = (14 + this.rng.range(0, 56)) + 'vw'; el.style.top = (8 + this.rng.range(0, 60)) + 'vh';
      el.style.transform = `rotate(${this.rng.range(-4, 4)}deg)`;
      f.appendChild(el);
      this._fr.push({ el, text, born: this.rng.range(0.1, 1.6), life: this.rng.range(0.5, 1.4) });
    }
  }

  _domUpdate(age, end) {
    const d = this._dom, now = performance.now();
    if (now - (this._lastDom || 0) < 55) return;
    this._lastDom = now;
    // noise
    const data = d.img.data;
    for (let i = 0; i < data.length; i += 4) { const v = Math.random() < 0.6 ? 0 : 255 * Math.random(); data[i] = data[i + 1] = data[i + 2] = v; data[i + 3] = 255; }
    d.nctx.putImageData(d.img, 0, 0);
    // fragments: appear, scramble, vanish
    const u = Math.min(1, age / end);
    for (const f of this._fr) {
      const t = age - f.born, on = t > 0 && t < f.life + 0.3 + (this.hold > 0 ? this.hold : 0);
      f.el.style.opacity = on ? '1' : '0';
      if (on) f.el.textContent = scramble(f.text, t < 0.25 ? 0.8 : (Math.random() < 0.12 ? 0.4 : 0.03));
    }
    // caption resolves out of static
    const target = d.cap.dataset.target ?? this.caption, k = Math.max(0, 1 - (age - 0.3) / 1.0);
    d.cap.textContent = scramble(target, k);
    void u;
  }
}
