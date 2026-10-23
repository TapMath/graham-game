// Collapsing infrastructure (PLAN 6). 4-7 of the 12 candidate `world.slabs` are rolled unstable per seed. Stepping on one:
// a crack, camera shake and dust, and it falls 1.2 s later (`slab.drop(dy)` animated under gravity). Stay on it and you ride
// it down and take the impact; it is gone for the rest of the run, leaving rubble. Unstable slabs carry a hairline crack
// decal (and a slightly greyer tint) as the only warning.
//
// Also the rare ambient AFTERSHOCK: a distant rumble, a long shake, dust, and chunks of the fallen road decks sliding off
// the pile at the collapse site (a falling chunk can clip you if you linger there).
import * as THREE from 'three';
import { clamp, dist3, hdist } from './util.js';
import { Parts } from './models.js';

export const SLAB_TUNING = Object.freeze({ delay: 1.2, gravity: 15, minUnstable: 4, maxUnstable: 7 });
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _v = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _e = new THREE.Euler();

function crackTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); let s = 17;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  g.clearRect(0, 0, 128, 128);
  const bolt = (x, y, ang, len, w) => {
    g.lineWidth = w; g.strokeStyle = 'rgba(8,8,10,.9)'; g.beginPath(); g.moveTo(x, y);
    for (let i = 0; i < len; i++) { ang += (rnd() - 0.5) * 0.9; x += Math.cos(ang) * 5; y += Math.sin(ang) * 5; g.lineTo(x, y); if (rnd() < 0.08 && w > 1) bolt(x, y, ang + (rnd() - 0.5) * 1.8, len * 0.4 | 0, w * 0.6); }
    g.stroke();
  };
  for (let i = 0; i < 3; i++) bolt(64 + (rnd() - 0.5) * 30, 64 + (rnd() - 0.5) * 30, rnd() * 6.28, 18, 2.2);
  g.fillStyle = 'rgba(120,70,30,.18)'; g.beginPath(); g.ellipse(64, 64, 34, 22, 0.4, 0, 6.28); g.fill();     // rust bleed
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export class Slabs {
  constructor(h) { this.h = h; this.unstable = []; this.chunks = []; this.stats = { collapsed: 0, cracked: 0, riders: 0, aftershocks: 0 }; this.aftershocks = []; }

  init() {
    const { game } = this.h, world = game.world, rng = this.h.rng.fork('slabs');
    this.rng = rng;
    const slabs = world.slabs ?? [];
    const pick = rng.shuffle(slabs).slice(0, Math.min(slabs.length, rng.int(SLAB_TUNING.minUnstable, SLAB_TUNING.maxUnstable)));
    // landing height under each slab (first solid thing below it)
    for (const s of slabs) {
      const o = { x: (s.x0 + s.x1) / 2, y: s.y - s.th - 0.2, z: (s.z0 + s.z1) / 2 }, d = { x: 0, y: -1, z: 0 };
      const hit = game.physics.raycast(o, d, 60, (c) => !(c.dynamic && c.tag?.startsWith('slab')) && (c.solid || c.walkable));
      s.landY = hit ? hit.point.y : 0;
    }
    for (const s of pick) this.unstable.push({ slab: s, state: 'ok', t: 0, vy: 0, dy: 0, creak: false, cx: (s.x0 + s.x1) / 2, cz: (s.z0 + s.z1) / 2 });
    this.unstable.sort((a, b) => a.slab.id.localeCompare(b.slab.id));
    this.byId = new Map(this.unstable.map((u) => [u.slab.id, u]));

    // crack decals on the unstable slabs
    const n = Math.max(1, this.unstable.length);
    const pg = new THREE.PlaneGeometry(1, 1); pg.rotateX(-Math.PI / 2);
    this.crackMat = new THREE.MeshBasicMaterial({ map: crackTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.cracks = new THREE.InstancedMesh(pg, this.crackMat, n);
    this.cracks.frustumCulled = false; this.cracks.name = 'slab-cracks';
    this.unstable.forEach((u, i) => {
      const s = u.slab; u.ci = i;
      _v.set(u.cx, s.y + 0.03, u.cz); _s.set(s.x1 - s.x0, 1, s.z1 - s.z0); _q.identity(); void i;
      _m.compose(_v, _q, _s); this.cracks.setMatrixAt(i, _m);
      // a faint grey-green cast on the slab itself
      if (world.slabMesh?.instanceColor) { world.slabMesh.getColorAt(s.index, _c); _c.multiplyScalar(0.86); _c.g *= 1.04; world.slabMesh.setColorAt(s.index, _c); }
    });
    this.cracks.instanceMatrix.needsUpdate = true;
    if (world.slabMesh?.instanceColor) world.slabMesh.instanceColor.needsUpdate = true;
    game.scene.add(this.cracks);

    // rubble and falling debris (visual only)
    const dg = new Parts().box(1, 1, 1, 0, 0, 0, 0xffffff).build();
    this.debMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, emissive: new THREE.Color(0x14181a) });
    game.materials?.all?.push(this.debMat);
    this.debCap = 120;
    this.deb = new THREE.InstancedMesh(dg, this.debMat, this.debCap);
    this.deb.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.debCap * 3), 3);
    this.deb.frustumCulled = false; this.deb.count = 0; this.deb.visible = false; this.deb.name = 'debris';
    game.scene.add(this.deb);

    // aftershocks: 1-3 per run at seeded game hours
    let t = rng.range(8.5, 13);
    const count = rng.int(1, 3);
    for (let i = 0; i < count; i++) { this.aftershocks.push({ at: t, done: false }); t += rng.range(4.5, 8); }
  }

  /** Standing on it now? */
  _riding(u) {
    const p = this.h.game.player, c = u.slab.collider;
    return p.onGround && p.ground === c;
  }

  trigger(u, why = 'step') {
    if (u.state !== 'ok') return;
    const h = this.h, s = u.slab;
    u.state = 'cracking'; u.t = 0; u.why = why; this.stats.cracked++;
    _m.makeScale(0, 0, 0); this.cracks.setMatrixAt(u.ci, _m); this.cracks.instanceMatrix.needsUpdate = true;     // the decal goes with the slab
    h.sound('crack', { x: u.cx, y: s.y, z: u.cz }, 0.95);
    h.shake(0.55, 0.6);
    h.dust(u.cx, s.y + 0.2, u.cz, 10, Math.min(3, (s.x1 - s.x0) * 0.5), { size: 2.4, up: 0.8 });
    h.say('A flat crack under your feet. The whole deck shivers.', 'story', 4);
    h.nearCaption({ x: u.cx, y: s.y, z: u.cz }, '[concrete cracks]', 40);
  }

  collapseNow(id) { const u = this.byId.get(id); if (u) { this.trigger(u, 'debug'); u.t = SLAB_TUNING.delay; } return !!u; }

  update(dt) {
    const h = this.h, T = SLAB_TUNING, game = h.game, p = h.pp;
    const setu = game.setu?.following ? game.setu.follower : null;
    for (const u of this.unstable) {
      const s = u.slab;
      if (u.state === 'ok') {
        if (dist3({ x: u.cx, y: s.y, z: u.cz }, p) > 140) continue;
        if (this._riding(u) || (setu && setu.onGround && setu.ground === s.collider)) this.trigger(u);
      } else if (u.state === 'cracking') {
        u.t += dt;
        const wob = Math.sin(u.t * 70) * 0.012 * Math.min(1, u.t * 3);
        s.drop(-0.015 + wob);
        if (!u.creak && u.t > 0.5) { u.creak = true; h.sound('crack', { x: u.cx, y: s.y, z: u.cz }, 0.8); h.shake(0.35, 0.4); h.dust(u.cx, s.y + 0.2, u.cz, 5, 2.5, { size: 2, up: 0.6 }); }
        if (u.t >= T.delay) { u.state = 'falling'; u.vy = 0; u.dy = -0.015; u.end = s.landY - s.y + s.th; }
      } else if (u.state === 'falling') {
        u.vy -= T.gravity * dt; u.dy += u.vy * dt;
        if (u.dy <= u.end) {
          u.dy = u.end; s.drop(u.dy); this.impact(u);
        } else {
          s.drop(u.dy);
          if (dist3({ x: u.cx, y: s.y + u.dy, z: u.cz }, p) < 40) h.shake(0.3, 0.12);
        }
      }
    }
    this.updateChunks(dt);
    this.aftershockCheck();
    // the crack decals are one draw call: only while an unstable slab is within sight
    this.cracks.visible = this.unstable.some((u) => u.state === 'ok' && Math.hypot(u.cx - p.x, u.cz - p.z) < 130 && Math.abs(u.slab.y - p.y) < 50);
  }

  impact(u) {
    const h = this.h, s = u.slab, game = h.game, p = h.pp;
    const pos = { x: u.cx, y: s.landY, z: u.cz };
    u.state = 'gone'; s.dropped = true; this.stats.collapsed++;
    const high = s.y - s.landY;
    h.sound('collapse', pos, 1);
    h.dust(u.cx, s.landY + 0.5, u.cz, 22, Math.max(3, (s.x1 - s.x0) * 0.6), { size: 4.2, up: 1.4 });
    const dNear = dist3(pos, p);
    h.shake(clamp(1.3 - dNear / 60, 0.25, 1.1), 0.9);
    // who rides it down?
    const riding = h.game.player.onGround && h.game.player.ground === s.collider;
    const under = Math.abs(p.y - s.landY) < 1.2 && p.x > s.x0 - 0.3 && p.x < s.x1 + 0.3 && p.z > s.z0 - 0.3 && p.z < s.z1 + 0.3 && !riding;
    if (riding) {
      this.stats.riders++;
      h.hurt(1 + (high >= 20 ? 1 : 0), 'collapse');
      h.say('The deck gives way and you ride it down in a roar of dust. It hits like a fist.', 'story', 6);
    } else if (under) {
      h.hurt(1, 'crushed');
      h.say('Concrete rains down. Something heavy catches your shoulder.', 'story', 5);
    }
    const su = game.setu;
    if (su?.following && su.follower.onGround && su.follower.ground === s.collider) su.hurt(12, 'collapse');
    // rubble heap where it landed, then remove the slab (disable first so a rider is not carried away with it)
    game.physics.setEnabled(s.collider, false);
    s.drop(u.end - 1000);
    this.rubble(u, s);
  }

  rubble(u, s) {
    const n = 7;
    for (let i = 0; i < n; i++) {
      const w = this.rng.range(0.6, 2.0), hgt = this.rng.range(0.25, 0.8), d = this.rng.range(0.6, 2.0);
      this.addChunk({ x: u.cx + this.rng.range(-1, 1) * (s.x1 - s.x0) * 0.4, y: s.landY + hgt * 0.5, z: u.cz + this.rng.range(-1, 1) * (s.z1 - s.z0) * 0.4, sx: w, sy: hgt, sz: d, ry: this.rng.range(0, 3), state: 'rest', c: 0.30 + this.rng.range(0, 0.18) });
    }
  }

  addChunk(c) {
    c.vy = c.vy ?? 0; c.rx = c.rx ?? 0; c.rz = c.rz ?? 0; c.spin = c.spin ?? 0;
    if (this.chunks.length >= this.debCap) { const i = this.chunks.findIndex((k) => k.state === 'rest'); if (i >= 0) this.chunks.splice(i, 1); else return; }
    this.chunks.push(c);
  }

  updateChunks(dt) {
    const h = this.h, p = h.pp;
    let n = 0;
    for (const c of this.chunks) {
      if (c.state === 'fall') {
        c.vy -= 18 * dt; c.y += c.vy * dt; c.rx += c.spin * dt; c.rz += c.spin * 0.7 * dt;
        const floor = c.floor + c.sy * 0.5;
        if (!c.hit && c.y < 2.4 && Math.abs(p.y - c.floor) < 1.5 && hdist(c, p) < 1.3 && !h.detaining && h.grace <= 0 && !c.noHit) {
          c.hit = true; h.hurt(1, 'debris'); h.shake(0.7, 0.4); h.kick(c.x, c.z, 5, 0.2);
          h.say('A chunk of concrete clips your shoulder as it falls.', 'story', 5);
        }
        if (c.y <= floor) { c.y = floor; c.state = 'rest'; c.rx = c.rz = 0; h.dust(c.x, c.floor + 0.3, c.z, 3, 1, { size: 2, up: 0.5 }); if (hdist(c, p) < 60) h.sound('collapse', c, 0.35); }
      }
      if (hdist(c, p) > 130) continue;
      _v.set(c.x, c.y, c.z); _e.set(c.rx, c.ry, c.rz); _q.setFromEuler(_e); _s.set(c.sx, c.sy, c.sz);
      _m.compose(_v, _q, _s); this.deb.setMatrixAt(n, _m);
      const a = this.deb.instanceColor.array; a[n * 3] = c.c; a[n * 3 + 1] = c.c * 1.02; a[n * 3 + 2] = c.c * 0.96;
      n++;
    }
    this.deb.count = n; this.deb.visible = n > 0;
    if (n) { this.deb.instanceMatrix.needsUpdate = true; this.deb.instanceColor.needsUpdate = true; }
  }

  aftershockCheck() {
    const clock = this.h.game.clock;
    if (!clock || this.h.detaining) return;
    for (const a of this.aftershocks) if (!a.done && clock.t >= a.at) { a.done = true; this.aftershock(); }
  }

  aftershock() {
    const h = this.h, game = h.game, p = h.pp, site = game.world.story?.collapseSite;
    if (!site) return;
    this.stats.aftershocks++;
    const d = hdist(site, p);
    h.sound('collapse', { x: site.x, y: 2, z: site.z }, clamp(1 - d / 400, 0.45, 1));
    h.shake(clamp(1.15 - d / 260, 0.35, 1.1), 2.6);
    h.say(d < 70 ? 'The ground moans. Up on the pile, the fallen decks shift and slide.' : 'A deep groan rolls through the concrete overhead. Dust sifts down like ash. Somewhere far off, a deck settles.', 'story', 7);
    h.nearCaption({ x: p.x, y: p.y, z: p.z }, '[a distant rumble]', 9999);
    const r = site.rect;
    for (let i = 0; i < 14; i++) {
      const x = this.rng.range(r.x0, r.x1), z = this.rng.range(r.z0, r.z1), s = this.rng.range(0.4, 1.3);
      const floor = 0.1;
      this.addChunk({ x, y: this.rng.range(14, 30), z, sx: s * 1.4, sy: s * 0.7, sz: s, ry: this.rng.range(0, 3), state: 'fall', vy: 0, floor, spin: this.rng.range(-3, 3), c: 0.3 + this.rng.range(0, 0.14), hit: i > 5 });
    }
    h.dust(site.x, 6, site.z, 14, 12, { size: 6, up: -0.5, life: 5 });
    h.dustUntil = (game.clock?.t ?? 0) + 0.35;
    h.dustAt = { x: site.x, z: site.z, r: 30 };
    // sifting dust wherever you are
    h.dust(p.x, p.y + 3.2, p.z, 8, 6, { size: 2.2, up: -0.4, life: 3.5 });
  }

  list(out) {
    for (const u of this.unstable) if (u.state === 'cracking' || u.state === 'falling') out.push({ id: u.slab.id, kind: 'slab', pos: { x: u.cx, y: u.slab.y + u.dy, z: u.cz }, alert: 1, state: u.state });
  }
  setEnabled(on) { if (!on) { this.cracks.visible = false; this.deb.visible = false; } else this.cracks.visible = true; }
  snapshot() {
    return {
      unstable: this.unstable.map((u) => u.slab.id), states: Object.fromEntries(this.unstable.map((u) => [u.slab.id, u.state])),
      stats: { ...this.stats }, aftershocks: this.aftershocks.map((a) => ({ at: +a.at.toFixed(2), done: a.done })), chunks: this.chunks.length,
    };
  }
  reset() { /* a new run reloads the page (Play again); slabs are not rebuilt here */ }
}
