// The scenes (PLAN 1b, 7). Each is `async (cx, opts)`; see cinematics.js for the toolkit (cx.wait / cam / cap / fade / actor ...).
//   opening   05:30 vision, waking without Setu, stepping out, the five-level flyover falls, dust and silence, the title
//   reunion   the bridge: "Didi, there's no one", the mouth organ, the run, the sun breaks through, "Look, Setu, sunrise!"
//   setuLost  the cough that does not come
//   mithiDies the heartbeat that stops, the festival far above
//   warning   sirens across the city, the evacuation announcement
import * as THREE from '../../../vendor/three.module.js';
import { EVAC } from './breach.js';
import { buildRoom, buildLane, buildInterchange, Effects, LANE_PEOPLE } from './intro.js';

const D2R = Math.PI / 180;
const rnd = (a, b) => a + Math.random() * (b - a);
const mix = (a, b, t) => a + (b - a) * t;

// ----------------------------------------------------------------------------------------------------- helpers
let _sunTex = null;
function sunTexture() {
  if (_sunTex) return _sunTex;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d'), gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.16, 'rgba(255,252,236,1)'); gr.addColorStop(0.2, 'rgba(255,236,170,.95)');
  gr.addColorStop(0.34, 'rgba(255,200,110,.45)'); gr.addColorStop(0.62, 'rgba(255,150,80,.14)'); gr.addColorStop(1, 'rgba(255,140,70,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  _sunTex = new THREE.CanvasTexture(c); _sunTex.colorSpace = THREE.SRGBColorSpace;
  return _sunTex;
}

/** A sun that rises over the sea in the east (our own, so it can climb out of the haze whatever the sky's keyframes do). */
function makeSun(cx) {
  const mat = new THREE.SpriteMaterial({ map: sunTexture(), color: 0xffffff, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending });
  const sun = new THREE.Sprite(mat); sun.frustumCulled = false; sun.renderOrder = -1;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTexture(), color: 0xffb070, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, opacity: 0.0 }));
  halo.frustumCulled = false; halo.renderOrder = -1;
  cx.prop(sun); cx.prop(halo);
  const s = { sun, halo, el: 0, az: 8 * D2R, size: 40, glow: 0, vis: 1, pos: new THREE.Vector3(), update() { /* below */ } };
  s.update = () => {
    const cam = cx.game.camera.position, el = s.el * D2R;
    const dir = new THREE.Vector3(Math.cos(el) * Math.cos(s.az), Math.sin(el), Math.cos(el) * Math.sin(s.az));
    s.pos.copy(cam).addScaledVector(dir, 270);
    sun.position.copy(s.pos); halo.position.copy(s.pos);
    sun.scale.setScalar(s.size); halo.scale.setScalar(s.size * 5.2);
    mat.opacity = Math.min(1, s.vis); halo.material.opacity = Math.min(1, s.glow) * 0.8;
    // bloom follows the sun on screen
    const p = s.pos.clone().project(cx.game.camera);
    const on = p.z < 1 && Math.abs(p.x) < 1.6 && Math.abs(p.y) < 1.6;
    if (on) cx.bloomAt(((p.x * 0.5 + 0.5) * 100).toFixed(1), ((1 - (p.y * 0.5 + 0.5)) * 100).toFixed(1));
  };
  cx.frame(() => s.update());
  return s;
}

function ensureAudio(g) { try { g.audio?.ensure?.(); } catch { /* ok */ } }
const emit = (g, kind, x, y, z, loud, extra = {}) => g.events.emit('sound:emit', { x, y, z, kind, loudness: loud, ...extra });

// =====================================================================================================  REUNION
const BR = { z: -30, y: 38 };

async function reunion(cx, o) {
  const g = cx.game, E = o.endings ?? g.endings;
  const type = o.type ?? (g.flags.cityWarned ? 1 : 2), warned = !!g.flags.cityWarned;
  const waiting = o.waiting ?? g.cinematics.bridgeFind;           // Setu was waiting out on the bridge (he runs to her), else he came with her
  const hasJeetu = g.party ? !!g.party.jeetu : true;
  const sfx = g.sfx, p = g.player;
  ensureAudio(g);
  cx.hideSetu = true; cx.hideSky = true;
  cx.letterbox(true);
  cx.black(1, 0);
  const wasFrozen = p.frozen; p.frozen = true;
  p.teleport(168, BR.y, BR.z, -90 * D2R); p.frozen = true;
  const sea = g.system?.('world')?.sea?.mat;
  const seaColor0 = sea ? sea.color.clone() : null;
  cx.onCleanup(() => { p.frozen = wasFrozen; if (sea && seaColor0) sea.color.copy(seaColor0); });

  // the night passes: start the sky in the last of the dark and run it forward through the whole scene
  const h0 = g.clock.hour, lateDawn = h0 >= 4.7 && h0 < 5.9;
  cx.skyHour = lateDawn ? Math.min(h0, 5.3) : 4.55;
  const skyTo = (h, secs) => { const from = cx.skyHour; return cx.tween(from, h, secs, (v) => { cx.skyHour = v; }, 'inout'); };
  g.sky.setTimeOfDay(cx.skyHour);
  const sun = makeSun(cx); sun.el = -2; sun.size = 34; sun.vis = 0; sun.glow = 0;

  // cast
  const M = cx.actor('mithi', 163, BR.y, BR.z, -90 * D2R);
  const J = hasJeetu ? cx.actor('jeetu', 160.6, BR.y, BR.z + 1.5, -90 * D2R) : null;
  const S = cx.actor('setu', waiting ? 213.2 : 161.6, BR.y, waiting ? -23.4 : BR.z - 1.7, waiting ? 90 * D2R : -90 * D2R);
  if (waiting) S.visible = false;
  cx.camSet([150, 47, -35], [205, 39.5, -30], 54);

  // ---- 0: black, the place and the hour
  g.audio?.play('breath', null);
  sfx?.wind(40, 0.16);
  cx.stamp(lateDawn ? '05:10' : '04:50', 'the bridge that joins the two islands');
  await cx.wait(2.4);
  cx.stamp('', '', false);
  cx.black(0, 1.8);

  // ---- 1: the long walk onto the bridge (wide, high)
  cx.mark('walk');
  skyTo(5.0, 10);
  cx.cam({ p: [157, 42, -33.5], l: [205, 40.2, -30], fov: 48, dur: 5.0, e: 'soft' });
  cx.walk(M, 171.5, BR.z, 1.35);
  if (J) cx.walk(J, 169.4, BR.z + 1.5, 1.5);
  if (!waiting) cx.walk(S, 170.0, BR.z - 1.5, 1.35);
  await cx.wait(1.8);
  cx.cap('Where the road runs out and the sea begins.', { kind: 'scrawl', ttl: 2.6 });
  await cx.wait(2.2);

  if (waiting) {
    // ---- 2: behind her shoulder: "Didi, there's no one"
    cx.mark('noone');
    cx.camPath((k) => ({ p: [M.pos.x - 4.4, 39.55, M.pos.z + 0.9 - k * 0.2], l: [M.pos.x + 14, 39.7, M.pos.z - 0.1], fov: 50 - k * 4 }), 3.8, 'inout');
    await cx.wait(1.2);
    if (J) { cx.walk(J, M.pos.x + 3.4, BR.z + 0.9, 2.6); }
    await cx.wait(0.9);
    cx.faceTo(M, 211, BR.z);
    if (J) { cx.faceTo(J, 211, BR.z); await cx.say('Didi... there\'s no one.', { who: 'Jeetu', ttl: 2.4 }); } else await cx.say('Setu?', { who: 'Mithi', ttl: 2.0 });
    // her face, front-on, the pre-dawn glow behind the lens
    cx.cam({ p: [M.pos.x + 0.5, 39.5, M.pos.z + 2.4], l: [M.pos.x + 0.1, 39.5, M.pos.z], fov: 34, dur: 2.0, e: 'inout' });
    await cx.wait(0.8);
    await cx.say('He is here. I can feel it.', { who: 'Mithi', ttl: 2.3 });
    if (J) await cx.say('Didi, the bridge is empty. Come. Let\'s go home.', { who: 'Jeetu', ttl: 2.1 }); else await cx.wait(1.2);
    cx.cap('She stands in the wind with her hand open, listening to the sea.', { kind: 'scrawl', ttl: 2.6 });
    await cx.wait(1.1);
    // ---- 3: she walks; the mouth organ
    cx.mark('organ');
    cx.cam({ p: [M.pos.x - 3.4, 39.2, M.pos.z + 1.3], l: [M.pos.x + 12, 39.6, M.pos.z], fov: 46, dur: 1.8, e: 'inout' });
    cx.walk(M, 180, BR.z, 1.0);
    g.audio?.play('caneTap', null);
    await cx.wait(1.6);
    skyTo(5.45, 4);
    emit(g, 'mouthorgan', 212.2, 39.2, -24.2, 0.8);
    cx.shake(0.04, 0.6);
    await cx.wait(0.6);
    if (J) { cx.cam({ p: [J.pos.x + 2.0, 39.45, J.pos.z + 0.2], l: [J.pos.x, 39.3, J.pos.z], fov: 36, dur: 0.9, e: 'out' }); cx.cap('♪', { kind: 'scrawl', ttl: 1.6 }); await cx.wait(0.8); }
    // whip to the far end
    cx.cam({ p: [M.pos.x - 1.2, 39.6, M.pos.z + 0.6], l: [212.5, 39.5, -24.6], fov: 36, dur: 0.9, e: 'inout' });
    await cx.wait(1.0);
    S.visible = true; cx.walk(S, 203, -26.4, 3.4, { face: true });
    await cx.say('♪  a mouth organ, small and out of breath', { kind: 'scrawl', ttl: 2.0 });
    // ---- 4: Setu steps out of the shadows and runs
    cx.mark('run');
    cx.cap('DIDI!', { who: 'Setu', ttl: 2.4 });
    sun.vis = 0.0;
    skyTo(5.78, 7);
    const run = cx.walk(S, 192.2, BR.z + 0.1, 6.3);
    cx.camPath((k) => ({ p: [M.pos.x - 2.0, 38.9, M.pos.z + 0.55], l: [S.pos.x, 39.2, S.pos.z], fov: 40 - k * 6 }), 2.2, 'inout');
    await cx.wait(0.6);
    cx.faceTo(M, S.pos.x, S.pos.z);
    cx.cap('Setu?', { who: 'Mithi', ttl: 1.0 });
    await cx.wait(0.6);
    const mrun = cx.walk(M, 190.9, BR.z, 5.6);
    // side-on tracking shot of the run
    cx.camPath((k) => {
      const mx = (M.pos.x + S.pos.x) / 2, sep = Math.abs(S.pos.x - M.pos.x), dist = 6.1;
      const half = Math.atan((sep / 2 + 1.6) / dist);                          // keep both of them in the frame as they close
      const fov = Math.max(34, Math.min(70, 2 * Math.atan(Math.tan(half) / g.camera.aspect) / D2R));
      return { p: [mx - 1.0 + k * 2, 39.0, BR.z + dist], l: [mx, 39.3, BR.z], fov };
    }, 3.8, 'lin');
    await Promise.all([run, mrun]);
    await cx.wait(0.1);
  } else {
    // ---- they arrive together: the long walk to the end of the bridge
    cx.camPath((k) => ({ p: [M.pos.x - 4.6, 39.4, M.pos.z + 1.7], l: [M.pos.x + 14, 39.8, M.pos.z - 0.2], fov: 50 }), 5, 'inout');
    cx.walk(M, 189.2, BR.z, 1.8); cx.walk(S, 190.4, BR.z - 1.0, 1.8); if (J) cx.walk(J, 187.4, BR.z + 1.1, 1.9);
    skyTo(5.5, 6);
    await cx.wait(1.6);
    await cx.say('Didi... how long till the sun?', { who: 'Setu', ttl: 2.6 });
    await cx.say('Soon, Setu. Soon.', { who: 'Mithi', ttl: 2.2 });
    await cx.wait(0.8);
    cx.cap('They stand at the middle of the bridge, and the night begins to thin.', { kind: 'scrawl', ttl: 3.4 });
    skyTo(5.8, 4);
    cx.cam({ p: [M.pos.x - 3.2, 39.0, M.pos.z + 2.4], l: [M.pos.x + 6, 39.5, M.pos.z], fov: 42, dur: 4, e: 'inout' });
    await cx.wait(3.4);
    cx.faceTo(S, M.pos.x, M.pos.z); cx.faceTo(M, S.pos.x, S.pos.z);
    await cx.wait(0.3);
  }

  // ---- 5: the meeting, the embrace (or the held hand), and the sun
  await finale(cx, { M, S, J, sun, sea, seaColor0, warned, type, waiting, skyTo, sfx, hasJeetu });
  cx.mark('card');
  // ---- the card: gold-white out, then the ending screen (the layer stays up under the ending's own fade)
  cx.setWhiteColor(type === 1 ? '#f6e3b0' : '#e8cfa0');
  await cx.white(1, 1.8);
  o.keepLayers = true;
  cx.always(() => { g.clock.setTime(30); });
  cx.clearProps();
  E.show(type, o.info);
}

async function finale(cx, { M, S, J, sun, sea, seaColor0, warned, waiting, skyTo, sfx, hasJeetu }) {
  const g = cx.game;
  const C = new THREE.Vector3(191.2, 39.0, BR.z);
  // they hold each other, facing
  cx.faceTo(M, S.pos.x, S.pos.z); cx.faceTo(S, M.pos.x, M.pos.z);
  if (waiting) { cx.do(() => g.audio?.play('breath', null)); cx.shake(0.03, 0.4); }
  cx.mark('embrace');
  cx.cap(waiting ? 'Didi... they said you were...' : 'Didi.', { who: 'Setu', ttl: 2.4 });
  // slow orbit from the south round toward the west, low, so the east and the arch open up behind them
  const r = 4.6;
  cx.camPath((k) => {
    const ph = k * 1.0;
    return { p: [C.x - r * Math.sin(ph), 39.75 - k * 0.8, C.z + r * Math.cos(ph)], l: [C.x + 0.4, 39.2 + k * 0.5, C.z], fov: 44 - k * 5 };
  }, 6.4, 'inout');
  await cx.wait(1.6);
  cx.cap(waiting ? 'You came. You came. I knew you would.' : 'I knew you would take me.', { who: 'Setu', ttl: 2.2 });
  await cx.wait(1.8);
  cx.cap('Setu. Setu. Setu.', { who: 'Mithi', ttl: 2.0 });
  // the sun breaks through
  cx.mark('sunbreak');
  cx.tween(0, 1, 5.2, (v) => { sun.el = -1 + v * 9.5; sun.size = 44 + v * 70; sun.vis = Math.min(1, v * 3); sun.glow = Math.min(1, v * 1.4); }, 'inout');
  skyTo(6.28, 7);
  cx.do(() => sfx?.swell(12, 0.2, 174.6));
  cx.bloom(0.0, 0);
  await cx.wait(1.8);
  cx.bloom(0.7, 2.2);
  await cx.wait(1.4);
  // all of them turn to the east, side by side; Jeetu runs up
  cx.mark('sunrise');
  cx.do(() => { S.pos.x = M.pos.x + 0.3; });
  cx.walk(S, M.pos.x + 0.15, BR.z - 1.05, 1.4);
  if (hasJeetu && J) cx.walk(J, M.pos.x - 0.1, BR.z + 1.15, 5.8);
  cx.camPath((k) => ({ p: [C.x - 6.1 + k * 1.8, 38.75 + k * 0.12, C.z + 1.4 - k * 0.6], l: [C.x + 30, 41.2, C.z + 3.5], fov: 44 }), 7, 'inout');
  await cx.wait(1.0);
  cx.faceTo(M, 300, BR.z); cx.faceTo(S, 300, BR.z);
  if (hasJeetu && J) { cx.faceTo(J, 300, BR.z); cx.cap('Look, Setu... SUNRISE!', { who: 'Jeetu', ttl: 2.8 }); }
  else cx.cap('Look, Setu. Sunrise.', { who: 'Mithi', ttl: 2.8 });
  // the world takes its colour: the sea turns gold-rose and her grey perception lifts
  cx.do(() => { if (sea) cx.tween(0, 1, 5, (v) => { sea.color.copy(seaColor0).lerp(new THREE.Color(0xe39a62), v * 0.85); }, 'inout'); });
  if (g.senses) { const p0 = g.senses.perceive; cx.tween(p0, 0, 6, (v) => { g.senses.perceive = v; }, 'inout'); }
  cx.bloom(0.42, 2.4);
  await cx.wait(2.8);
  cx.cap('Didi... is that it? Is that the sun?', { who: 'Setu', ttl: 3.2 });
  await cx.wait(3.2);
  cx.cap('I can feel it, Setu. It\'s warm. It is the warmest thing in the world.', { who: 'Mithi', ttl: 3.8 });
  await cx.wait(1.8);
  // lift away: three small figures on the bridge against the gold
  cx.mark('crane');
  cx.camPath((k) => ({ p: [C.x - 4.3 - k * 8.7, 38.9 + k * 8.5, C.z + 0.8 + k * 21], l: [C.x + 36 - k * 28, 40.8 - k * 0.8, C.z - 3 + k * 3], fov: 44 + k * 4 }), 7.6, 'inout');
  await cx.wait(2.0);
  if (warned) {
    cx.cap('Far behind them every siren in the city is singing the same warning. Millions are walking to higher ground.', { kind: 'scrawl', ttl: 5 });
    cx.do(() => { sfx?.siren(9, { gain: 0.16 }); setTimeout(() => sfx?.siren(8, { gain: 0.1 }), 900); });
  } else {
    cx.cap('Far behind them, under the towers, the sea finds the last of the tunnels. Nobody was told.', { kind: 'scrawl', ttl: 5 });
    cx.do(() => { sfx?.rumble(9, 0.35); g.events.emit('sound:emit', { x: g.player.pos.x - 120, y: 0, z: g.player.pos.z, kind: 'water-rush', loudness: 0.7 }); });
  }
  await cx.wait(4.4);
  cx.cap(warned ? 'Millions were evacuated in time.' : 'The light came anyway.', { ttl: 2.8, kind: 'say' });
  await cx.wait(2.8);
}

// =====================================================================================================  OPENING
// Phase 8C: restaged in the real place. 05:30, Dharavi: Mithi's room, a vision, the festival lane, and five levels of Sion Junction coming
// down over the street. The sets live in intro.js; this is the direction. About 50 s; skippable (Esc / Enter).
const HOME = { x: -94, z: -78 };
const LANE_DZ = -12;                                // the lane dressing sits this far north of where it was authored
const IC = { x: -75, zS: -108 };                    // the interchange: five decks over the street, the near end 30 m north of the door

async function opening(cx) {
  const g = cx.game, p = g.player, sfx = g.sfx, spawn = g.world.spawn;
  ensureAudio(g);
  cx.letterbox(true);
  cx.black(1, 0);
  const wasFrozen = p.frozen; p.frozen = true;
  cx.onCleanup(() => { p.frozen = wasFrozen; g.canvas.style.filter = ''; g.canvas.style.transition = ''; });
  cx.skyHour = 5.5; g.sky.setTimeOfDay(5.5);
  cx.hideSetu = true;
  p.teleport(HOME.x + 0.6, 0, HOME.z + 0.2, -90 * D2R);
  p.frozen = true;
  if (g.senses) g.senses.perceive = 0.28;           // the film shows the street in colour; the vision and the game still see through her ears
  buildRoom(cx);
  const lane = buildLane(cx, LANE_DZ);
  const fx = new Effects(cx);
  const ic = buildInterchange(cx, { x: IC.x, zS: IC.zS });
  cx.frame((dt) => { fx.update(dt); ic.update(dt, fx); });
  // the people of the lane
  const folk = LANE_PEOPLE.map((d) => {
    const a = cx.actor(d.spec, d.at[0], 0, d.at[1] + LANE_DZ, (d.yaw ?? 0) * D2R);
    a.def = d; a.home = [d.at[0], d.at[1] + LANE_DZ]; a.leg = 0; a.panic = false;
    a.char.setMood(d.id === 'chai' || d.id === 'dad' ? 'smile' : 'neutral');
    if (d.doing === 'chai') { a.char.gesture('reach', 1e6); }
    if (d.doing === 'cart') { a.char.gesture('explain', 1e6); a.char.setTalking(true); }
    if (d.doing === 'brush') { a.char.gesture('face', 1e6); }
    return a;
  });
  let folkOn = true;
  cx.frame(() => {
    if (!folkOn) return;
    for (const a of folk) {
      const d = a.def;
      if (!d.to || a.goal || a.panic) continue;
      a.leg ^= 1;
      const to = a.leg ? [d.to[0], d.to[1] + LANE_DZ] : a.home;
      cx.walk(a, to[0], to[1], d.speed, { face: true });
    }
  });
  cx.hemiBoost = 1.9;
  const BED = [-95.0, 0.78, -75.3];
  cx.camSet(BED, [-92.5, 3.0, -76.5], 64, 0.14);

  // ---- 1: 05:30. the stamp, the breath, the rain on the tin
  cx.mark('stamp');
  cx.stamp('05:30', 'Dharavi, Mumbai. The morning of Diwali. 2049.');
  g.audio?.play('breath', null);
  cx.do(() => { sfx?.radio(9, 0.05); });
  await cx.wait(2.4);
  cx.stamp('', '', false);

  // ---- 2: the vision
  cx.mark('vision');
  sfx?.siren(7, { gain: 0.2 }); sfx?.cries(5, 0.24); sfx?.roar(3.2, 0.4);
  const orig = g.messages?.say?.bind(g.messages);
  if (g.messages) g.messages.say = (t, op) => (/^Setu hears:/.test(t) ? null : orig(t, op));
  cx.onCleanup(() => { if (g.messages && orig) g.messages.say = orig; });
  cx.do(() => {
    const ok = g.senses?.vision?.({ reason: 'story', force: true, duration: 4.2, from: { x: -46, y: 4.6, z: -32, yaw: 70 * D2R }, caption: 'Screaming. Sirens. Rubble. Somewhere, a voice calling a name.' });
    const root = document.getElementById('vision-fx');
    if (ok && root) {                               // it is her vision, not his: relabel the glitch overlay
      const lab = root.querySelector('.v-label'), k = root.querySelector('.v-cap .k');
      if (lab) lab.innerHTML = '<s>SUBJECT 0472</s> <i>mithi</i><br><b>2ND SIGHT</b> <em>REC</em><br>05:30 &nbsp;DAY 1';
      if (k) k.textContent = 'SHE HEARS';
      const off = g.events.on('vision:end', () => { if (k) k.textContent = 'HE HEARS'; off(); });
    }
  });
  cx.black(0, 0.1);
  await cx.wait(4.9);
  cx.black(1, 0.15);
  await cx.wait(0.4);

  // ---- 3: she wakes. The room, small and cold. Setu's mat is empty
  cx.mark('wake');
  cx.hand(0.8);
  cx.camSet([-96.5, 0.4, -76.4], [-92.6, 2.1, -79.4], 64, 0.12);
  g.audio?.play('breath', null);
  cx.do(() => { g.canvas.style.transition = 'none'; g.canvas.style.filter = 'blur(9px)'; void g.canvas.offsetWidth; g.canvas.style.transition = 'filter 2.4s ease-out'; g.canvas.style.filter = 'blur(0px)'; });
  cx.black(0, 1.0);
  cx.cap('A vision. The same one. Louder.', { kind: 'scrawl', ttl: 2.4 });
  cx.cam({ p: [-96.4, 0.46, -76.7], l: [-95.2, 0.9, -79.0], fov: 60, roll: 0.05, dur: 2.6, e: 'inout' });
  await cx.wait(2.2);
  cx.cap('Setu?', { who: 'Mithi', ttl: 1.5 });
  await cx.wait(1.5);
  cx.mark('mat');
  cx.cam({ p: [-95.6, 0.62, -77.2], l: [-95.0, 0.07, -79.0], fov: 54, roll: 0, dur: 2.2, e: 'inout' });
  cx.cap('The blanket is cold. His slippers are gone.', { kind: 'scrawl', ttl: 2.6 });
  await cx.wait(2.6);
  cx.mark('bag');
  cx.cam({ p: [-93.4, 1.05, -77.0], l: [-91.1, 0.35, -79.6], fov: 58, dur: 2.0, e: 'inout' });
  cx.do(() => sfx?.bell(0.1));
  await cx.wait(2.0);

  // ---- 4: out of the door, into the lane (rain, lights, the whole street awake)
  cx.mark('door');
  cx.hemiBoost = 1.7;
  cx.cam({ p: [-90.2, 1.5, -78.0], l: [-82, 1.7, -80], fov: 70, dur: 1.7, e: 'inout' });
  g.audio?.play('footstep', null);
  cx.do(() => { sfx?.murmur(9, 0.07); });
  await cx.wait(1.6);
  cx.mark('lane');
  cx.camPath((k) => ({ p: [mix(-89.5, -80.6, k), 1.55, mix(-78.2, -79.4, k)], l: [-76, 2.0 + k * 1.4, -88 + k * -4], fov: 72 }), 4.6, 'inout');
  cx.cap('Rain on tin. Frying oil. Marigolds, diyas, a radio singing. The whole lane is awake.', { kind: 'scrawl', ttl: 3.4 });
  await cx.wait(2.6);
  cx.cap('SETU!', { who: 'Mithi', ttl: 1.3 });
  cx.do(() => { for (const a of folk.slice(0, 4)) a.char.lookAt({ x: -80, y: 1.5, z: -79 }); });
  await cx.wait(2.0);

  // ---- 5: the lane looks up. The web of roads, and under her feet a hum
  cx.mark('look-up');
  cx.hemiBoost = 1.35;
  const eyeJ = { x: -77.4, y: 1.6, z: -91.0 };
  cx.cam({ p: [eyeJ.x, eyeJ.y, eyeJ.z], l: [IC.x, 16, IC.zS - 30], fov: 78, dur: 2.4, e: 'inout' });
  cx.cap('Over the lane, five levels of road. Sion Junction. And under her feet, a hum.', { kind: 'scrawl', ttl: 3.8 });
  cx.do(() => { sfx?.rumble(8, 0.28); });
  cx.shake(0.2, 3);
  ic.tremble(0.02);
  await cx.wait(2.2);
  cx.hand(1.0);
  cx.do(() => { for (const a of folk) { if (!a.def.to) continue; a.char.lookAt({ x: IC.x, y: 12, z: IC.zS - 12 }); } });
  await cx.wait(0.6);
  cx.cap('Concrete ticks. Dust sifts down.', { kind: 'scrawl', ttl: 2.2 });
  cx.do(() => { sfx?.groan(6, 0.5); for (let i = 0; i < 6; i++) fx.puff(IC.x + rnd(-5, 5), rnd(6, 20), IC.zS - rnd(2, 40), 0, -0.6, 0, 1.5, 3, 3.5, 0.3); });
  const trem0 = cx.t;
  const trem = cx.frame(() => ic.tremble(0.06 * Math.min(1, (cx.t - trem0) / 2)));
  cx.shake(0.5, 2.2);
  cx.hemiBoost = 0.9;
  await cx.wait(2.0);

  // ---- 6: the interchange comes down, the far end first
  cx.mark('collapse');
  cx.unframe(trem);
  folkOn = false;
  lane.sign.visible = false;
  cx.hand(2.6);
  cx.hemiBoost = 1.6;
  ic.start();
  sfx?.roar(9, 0.95);
  g.screenfx?.glitch(260);
  cx.shake(1.1, 9);
  cx.setWhiteColor('#cfc6b2');
  cx.cam({ p: [eyeJ.x, eyeJ.y, eyeJ.z], l: [IC.x, 12, IC.zS - 38], fov: 70, dur: 1.4, e: 'out' });
  // the people run south, past the camera
  const run = (a, i) => {
    a.panic = true; a.char.setMood(i % 3 ? 'scared' : 'shout');
    a.char.lookAt(null);
    if (a.def.doing) { a.char.gesture('rest', 0.1); }
    const x = [-72.4, -73.8, -77.2, -70.6, -75.6, -71.4, -78.6, -74.4, -72.2, -73.2][i % 10];
    cx.walk(a, x, -56 + rnd(-2, 2), 5.2 + (i % 4) * 0.5, { face: true });
  };
  cx.do(() => folk.forEach((a, i) => g.wait(0.15 + i * 0.12).then(() => run(a, i))));
  cx.do(() => { sfx?.cries(7, 0.3); });
  await cx.wait(2.2);
  cx.cam({ p: [eyeJ.x, 1.45, eyeJ.z + 0.4], l: [IC.x + 1, 7, IC.zS - 18], fov: 76, dur: 2.0, e: 'inout' });
  cx.cap('The whole sky comes down.', { kind: 'scrawl', ttl: 2.4 });
  // dust rolls down the street toward the camera
  cx.do(() => { for (let i = 0; i < 70; i++) { const z = IC.zS - rnd(2, 60); fx.puff(IC.x + rnd(-6, 6), rnd(0.5, 7), z, rnd(-1, 1), rnd(0, 1.2), rnd(10, 17), rnd(4, 8), rnd(14, 24), rnd(6, 10), 0.5); } });
  await cx.wait(2.2);
  cx.do(() => { for (let i = 0; i < 40; i++) fx.puff(IC.x + rnd(-6, 6), rnd(0.5, 6), IC.zS - rnd(2, 30), rnd(-1, 1), rnd(0, 1.5), rnd(12, 18), rnd(5, 9), rnd(16, 26), rnd(5, 8), 0.6); });
  cx.cam({ p: [eyeJ.x, 1.4, eyeJ.z + 0.8], l: [IC.x, 3, IC.zS - 8], fov: 80, dur: 1.8, e: 'in' });
  await cx.wait(1.7);
  cx.white(0.5, 1.2);
  await cx.wait(1.0);
  g.audio?.duck?.(0.9, 6);
  cx.white(1.0, 0.9);
  await cx.wait(1.0);

  // ---- 7: silence, then car alarms
  cx.mark('silence');
  cx.hand(0.3);
  sfx?.ring(6, 0.08);
  cx.cap('Then nothing.', { kind: 'scrawl', ttl: 2.4 });
  // the dust thins to the colour of the morning: the lane, the pile where the roads were, a few people who stayed on their feet
  cx.do(() => {
    cx.setWhiteColor('#a89c86');
    cx.cam({ p: [eyeJ.x, 1.5, eyeJ.z + 1.5], l: [IC.x, 4.5, IC.zS - 10], fov: 66, dur: 0.1 });
    folk.slice(0, 5).forEach((a, i) => { a.panic = true; a.goal = null; a.pos.x = -77.5 + i * 1.7 - (i % 2) * 3; a.pos.z = -84 - i * 1.3; a.speed = 0; a.yaw = Math.atan2(-(IC.x - a.pos.x), -(IC.zS - a.pos.z)) + (i % 2 ? 0.4 : -0.3); a.char.setMood(i % 2 ? 'pain' : 'sad'); a.char.gesture(i === 2 ? 'face' : 'rest', 5); });
    for (let i = 0; i < 40; i++) fx.puff(IC.x + rnd(-6, 6), rnd(0.5, 5), IC.zS - rnd(2, 22), rnd(-0.5, 0.5), rnd(0, 0.6), rnd(0.5, 2.5), rnd(5, 9), rnd(10, 16), rnd(8, 12), 0.5);
  });
  cx.white(0.42, 2.6);
  await cx.wait(2.2);
  cx.do(() => { sfx?.carAlarm(10, 0.1); setTimeout(() => sfx?.carAlarm(9, 0.07), 1400); });
  cx.cap('Car alarms. Dust settling. Somewhere a child is crying, and then many.', { kind: 'scrawl', ttl: 3.4 });
  await cx.wait(2.6);
  cx.black(1, 1.0); cx.white(0, 0.01);
  await cx.wait(1.2);
  cx.clearProps();

  // ---- 8: the title
  cx.mark('title');
  cx.title('GRAHAN', 'the search for sunrise');
  await cx.wait(4.0);
  cx.title('', '', false);
  await cx.wait(1.0);

  // ---- 9: gameplay at 05:40, in the dust of the collapse site
  cx.mark('play');
  cx.always(() => {
    p.frozen = wasFrozen;
    p.teleport(spawn.x, spawn.y, spawn.z, spawn.yaw ?? 0);
    cx.skyHour = undefined; cx.hideSetu = false; cx.hemiBoost = 1;
    g.hazards?.dust?.(spawn.x + 4, 0.5, spawn.z - 3, 16, 9, { size: 8, up: 1.5, life: 8, color: [0.4, 0.37, 0.3] });
    g.hazards?.dust?.(spawn.x - 6, 0.5, spawn.z + 4, 12, 9, { size: 8, up: 1.5, life: 8, color: [0.4, 0.37, 0.3] });
  });
  cx.camSet([spawn.x, 1.6, spawn.z], [spawn.x + 10, 1.4, spawn.z], 75);
  cx.setWhiteColor('#b8ae9a'); cx.white(0.9, 0.01);
  cx.letterbox(false);
  cx.clearProps();
  cx.hand(0);
  cx.rig.on = false;
  cx.black(0, 2.0);
  await cx.wait(1.0);
  cx.white(0, 3.0);
  g.messages?.say('05:40. Setu is gone.', { kind: 'story', ttl: 8 });
  await cx.wait(0.4);
}

// =====================================================================================================  SETU LOST
async function setuLost(cx, o) {
  const g = cx.game, p = g.player, sfx = g.sfx, E = o.endings ?? g.endings;
  ensureAudio(g);
  cx.letterbox(true);
  const eye = [p.pos.x, p.eyeY, p.pos.z];
  const yaw = p.yaw, pitch = p.pitch;
  const fwd = (d, py) => [eye[0] - Math.sin(yaw) * d, eye[1] + py, eye[2] - Math.cos(yaw) * d];
  cx.camSet(eye, fwd(5, Math.tan(pitch) * 5), 75);
  cx.vignette(0.35, 3);
  cx.cap('She listens for the mouth organ.', { kind: 'scrawl', ttl: 3.6 });
  emit(g, 'mouthorgan', p.pos.x + Math.cos(yaw) * 14, p.pos.y + 1, p.pos.z - Math.sin(yaw) * 14, 0.55, { weak: 0.9 });
  cx.camSet(eye, fwd(5, Math.tan(pitch) * 5), 75);
  await cx.wait(2.6);
  cx.cam({ p: [eye[0], eye[1] - 0.2, eye[2]], l: fwd(4, -2.4), fov: 66, dur: 5, e: 'inout' });
  g.canvas.style.transition = 'filter 5s'; g.canvas.style.filter = 'grayscale(.85) brightness(.8)';
  cx.onCleanup(() => { g.canvas.style.filter = ''; g.canvas.style.transition = ''; });
  await cx.wait(2.2);
  cx.cap('[ the mouth organ stops in the middle of a note ]', { kind: 'pa', ttl: 3.6 });
  await cx.wait(3.4);
  sfx?.ring(6, 0.05);
  cx.cap('She waits for the cough. The cough does not come.', { kind: 'scrawl', ttl: 5 });
  g.audio?.duck?.(0.9, 8);
  await cx.wait(5.4);
  cx.cap('Far above, the festival of lights goes on.', { kind: 'say', ttl: 4 });
  for (let i = 0; i < 3; i++) { setTimeout(() => sfx?.firework(160, true, 0.5), 600 + i * 1300); try { g.fireworks?._glow([1, 0.7, 0.4], 0.14, 1500 + i * 1300); } catch { /* ok */ } }
  await cx.wait(4.4);
  cx.black(1, 2.2);
  await cx.wait(2.6);
  o.keepBlack = true;
  cx.clearProps();
  E.show(3, o.info);
}

// =====================================================================================================  MITHI DIES
async function mithiDies(cx, o) {
  const g = cx.game, p = g.player, sfx = g.sfx, E = o.endings ?? g.endings;
  ensureAudio(g);
  cx.letterbox(true);
  const eye = [p.pos.x, p.eyeY, p.pos.z];
  const yaw = p.yaw;
  const fwd = (d, py) => [eye[0] - Math.sin(yaw) * d, eye[1] + py, eye[2] - Math.cos(yaw) * d];
  cx.camSet(eye, fwd(6, Math.tan(p.pitch) * 6), 75);
  cx.vignette(0.55, 3);
  g.canvas.style.transition = 'filter 7s'; g.canvas.style.filter = 'grayscale(.9) brightness(.7) contrast(1.1)';
  cx.onCleanup(() => { g.canvas.style.filter = ''; g.canvas.style.transition = ''; });
  sfx?.heartbeat(64, 6, 0.8);
  cx.cap('The light you were rationed ran out first.', { kind: 'scrawl', ttl: 4 });
  await cx.wait(3.0);
  // she sinks to her knees, then onto her back, looking up
  cx.cam({ p: [eye[0], eye[1] - 0.7, eye[2]], l: fwd(3, -0.9), fov: 70, roll: 0.1, dur: 2.6, e: 'inout' });
  sfx?.heartbeat(48, 4, 0.7);
  cx.vignette(0.8, 3);
  await cx.wait(2.8);
  cx.cam({ p: [eye[0] - Math.sin(yaw) * 0.2, 0.32 + p.pos.y, eye[2] - Math.cos(yaw) * 0.2], l: [eye[0], p.pos.y + 14, eye[2]], fov: 62, roll: -0.12, dur: 3.2, e: 'inout' });
  cx.black(0.25, 3);
  // the festival, far above
  cx.cap('Far above, the festival of lights goes on. Fireworks, marigolds, diyas on every step.', { kind: 'say', ttl: 5 });
  g.fireworks?.force?.(12);
  for (let i = 0; i < 4; i++) { setTimeout(() => { try { g.fireworks?.burst({ x: eye[0] + rnd(-30, 30), y: p.pos.y + 90 + rnd(0, 30), z: eye[2] + rnd(-30, 30) }); } catch { /* ok */ } }, 800 + i * 1100); }
  sfx?.heartbeat(30, 3, 0.55);
  for (let i = 0; i < 4; i++) { try { g.fireworks?._glow(i % 2 ? [1, 0.6, 0.3] : [0.5, 0.8, 1], 0.2, 900 + i * 1100); } catch { /* ok */ } }
  await cx.wait(4.6);
  cx.cap('Nobody looks down.', { kind: 'scrawl', ttl: 3.5 });
  await cx.wait(3.6);
  cx.black(1, 2.4);
  g.audio?.duck?.(1, 8);
  await cx.wait(3.0);
  o.keepBlack = true;
  cx.clearProps();
  E.show(4, o.info);
}

// =====================================================================================================  WARNING
async function warning(cx, o) {
  const g = cx.game, p = g.player, sfx = g.sfx, via = o.via ?? 'tower';
  ensureAudio(g);
  cx.letterbox(true);
  const eye = [p.pos.x, p.eyeY, p.pos.z], yaw = p.yaw;
  const dir = (y) => [eye[0] - Math.sin(y) * 20, eye[1] + 2, eye[2] - Math.cos(y) * 20];
  cx.camSet(eye, dir(yaw), 75);
  cx.cap(via === 'tara' ? 'On every screen in the city, a famous face stops smiling and starts telling the truth.' : 'The terminal accepts the override. A cold line of text says BROADCAST: ALL CHANNELS.', { kind: 'scrawl', ttl: 4 });
  cx.setWhiteColor('#ff4a30');
  cx.frame(() => { const v = 0.06 + 0.06 * Math.sin(cx.t * 5.2); cx._layer('white').style.opacity = String(Math.max(0, v) * Math.min(1, cx.t / 2)); });
  sfx?.siren(11, { gain: 0.22 });
  setTimeout(() => sfx?.siren(10, { gain: 0.14 }), 1500);
  setTimeout(() => sfx?.siren(9, { gain: 0.1 }), 3100);
  g.audio?.play('vision-sting', null);
  // turn to face the city
  const west = 119 * D2R;                   // toward the old city, south-west of the Upper Decks
  cx.cam({ p: eye, l: dir(yaw + Math.atan2(Math.sin(west - yaw), Math.cos(west - yaw)) * 1.0), fov: 70, dur: 5.5, e: 'inout' });
  await cx.wait(3.6);
  g.pa?.say(EVAC[0], { force: true });
  cx.cap('Sirens, one after another, climbing the towers.', { kind: 'scrawl', ttl: 4 });
  await cx.wait(4.4);
  cx.cap('Evacuation. Evacuation. For tonight, sunlight is free of charge.', { kind: 'pa', who: 'Municipal PA', ttl: 4.5 });
  await cx.wait(4.6);
  cx.cap('Somewhere under the city, a million people have just been told to look up.', { kind: 'say', ttl: 4 });
  await cx.wait(4.2);
  cx.always(() => { cx._layer('white').style.opacity = '0'; });
  p.setLook(yaw, p.pitch);
}

export const SCENES = { opening, reunion, setuLost, mithiDies, warning };
