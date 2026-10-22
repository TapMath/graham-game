// The scenes (PLAN 1b, 7). Each is `async (cx, opts)`; see cinematics.js for the toolkit (cx.wait / cam / cap / fade / actor ...).
//   opening   05:30 vision, waking without Setu, stepping out, the five-level flyover falls, dust and silence, the title
//   reunion   the bridge: "Didi, there's no one", the mouth organ, the run, the sun breaks through, "Look, Setu, sunrise!"
//   setuLost  the cough that does not come
//   mithiDies the heartbeat that stops, the festival far above
//   warning   sirens across the city, the evacuation announcement
import * as THREE from 'three';
import { EVAC } from './breach.js';

const D2R = Math.PI / 180;
const rnd = (a, b) => a + Math.random() * (b - a);

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
  await cx.wait(3.4);
  cx.stamp('', '', false);
  cx.black(0, 2.2);

  // ---- 1: the long walk onto the bridge (wide, high)
  cx.mark('walk');
  skyTo(5.0, 12);
  cx.cam({ p: [157, 42, -33.5], l: [205, 40.2, -30], fov: 48, dur: 6.5, e: 'soft' });
  cx.walk(M, 171.5, BR.z, 1.35);
  if (J) cx.walk(J, 169.4, BR.z + 1.5, 1.5);
  if (!waiting) cx.walk(S, 170.0, BR.z - 1.5, 1.35);
  await cx.wait(3.0);
  cx.cap('Where the road runs out and the sea begins.', { kind: 'scrawl', ttl: 3.4 });
  await cx.wait(3.6);

  if (waiting) {
    // ---- 2: behind her shoulder: "Didi, there's no one"
    cx.mark('noone');
    cx.camPath((k) => ({ p: [M.pos.x - 4.4, 39.55, M.pos.z + 0.9 - k * 0.2], l: [M.pos.x + 14, 39.7, M.pos.z - 0.1], fov: 50 - k * 4 }), 4.6, 'inout');
    await cx.wait(1.8);
    if (J) { cx.walk(J, M.pos.x + 3.4, BR.z + 0.9, 2.6); }
    await cx.wait(1.4);
    cx.faceTo(M, 211, BR.z);
    if (J) { cx.faceTo(J, 211, BR.z); await cx.say('Didi... there\'s no one.', { who: 'Jeetu', ttl: 3.2 }); } else await cx.say('Setu?', { who: 'Mithi', ttl: 2.4 });
    // her face, front-on, the pre-dawn glow behind the lens
    cx.cam({ p: [M.pos.x + 0.5, 39.5, M.pos.z + 2.4], l: [M.pos.x + 0.1, 39.5, M.pos.z], fov: 34, dur: 2.6, e: 'inout' });
    await cx.wait(1.4);
    await cx.say('He is here. I can feel it.', { who: 'Mithi', ttl: 3.4 });
    if (J) await cx.say('Didi, the bridge is empty. Come. Let\'s go home.', { who: 'Jeetu', ttl: 3.4 }); else await cx.wait(2);
    cx.cap('She stands in the wind with her hand open, listening to the sea.', { kind: 'scrawl', ttl: 4 });
    await cx.wait(2.6);
    // ---- 3: she walks; the mouth organ
    cx.mark('organ');
    cx.cam({ p: [M.pos.x - 3.4, 39.2, M.pos.z + 1.3], l: [M.pos.x + 12, 39.6, M.pos.z], fov: 46, dur: 2.2, e: 'inout' });
    cx.walk(M, 180, BR.z, 1.0);
    g.audio?.play('caneTap', null);
    await cx.wait(2.8);
    skyTo(5.45, 4);
    emit(g, 'mouthorgan', 212.2, 39.2, -24.2, 0.8);
    cx.shake(0.04, 0.6);
    await cx.wait(0.6);
    if (J) { cx.cam({ p: [J.pos.x + 2.0, 39.45, J.pos.z + 0.2], l: [J.pos.x, 39.3, J.pos.z], fov: 36, dur: 0.9, e: 'out' }); cx.cap('♪', { kind: 'scrawl', ttl: 2 }); await cx.wait(1.2); }
    // whip to the far end
    cx.cam({ p: [M.pos.x - 1.2, 39.6, M.pos.z + 0.6], l: [212.5, 39.5, -24.6], fov: 36, dur: 1.1, e: 'inout' });
    await cx.wait(1.5);
    S.visible = true; cx.walk(S, 203, -26.4, 3.4, { face: true });
    await cx.say('♪  a mouth organ, small and out of breath', { kind: 'scrawl', ttl: 3.2 });
    // ---- 4: Setu steps out of the shadows and runs
    cx.mark('run');
    cx.cap('DIDI!', { who: 'Setu', ttl: 2.4 });
    sun.vis = 0.0;
    skyTo(5.78, 7);
    const run = cx.walk(S, 192.2, BR.z + 0.1, 6.3);
    cx.camPath((k) => ({ p: [M.pos.x - 2.0, 38.9, M.pos.z + 0.55], l: [S.pos.x, 39.2, S.pos.z], fov: 40 - k * 6 }), 2.2, 'inout');
    await cx.wait(0.8);
    cx.faceTo(M, S.pos.x, S.pos.z);
    cx.cap('Setu?', { who: 'Mithi', ttl: 1.2 });
    await cx.wait(0.8);
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
    cx.camPath((k) => ({ p: [M.pos.x - 4.6, 39.4, M.pos.z + 1.7], l: [M.pos.x + 14, 39.8, M.pos.z - 0.2], fov: 50 }), 6, 'inout');
    cx.walk(M, 189.2, BR.z, 1.5); cx.walk(S, 190.4, BR.z - 1.0, 1.5); if (J) cx.walk(J, 187.4, BR.z + 1.1, 1.6);
    skyTo(5.5, 8);
    await cx.wait(2.2);
    await cx.say('Didi... how long till the sun?', { who: 'Setu', ttl: 3 });
    await cx.say('Soon, Setu. Soon.', { who: 'Mithi', ttl: 2.6 });
    await cx.wait(1.4);
    cx.cap('They stand at the middle of the bridge, and the night begins to thin.', { kind: 'scrawl', ttl: 4 });
    skyTo(5.8, 5);
    cx.cam({ p: [M.pos.x - 3.2, 39.0, M.pos.z + 2.4], l: [M.pos.x + 6, 39.5, M.pos.z], fov: 42, dur: 5, e: 'inout' });
    await cx.wait(4.5);
    cx.faceTo(S, M.pos.x, M.pos.z); cx.faceTo(M, S.pos.x, S.pos.z);
    await cx.wait(0.4);
  }

  // ---- 5: the meeting, the embrace (or the held hand), and the sun
  await finale(cx, { M, S, J, sun, sea, seaColor0, warned, type, waiting, skyTo, sfx, hasJeetu });
  cx.mark('card');
  // ---- the card: gold-white out, then the ending screen (the layer stays up under the ending's own fade)
  cx.setWhiteColor(type === 1 ? '#f6e3b0' : '#e8cfa0');
  await cx.white(1, 2.2);
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
  }, 8.2, 'inout');
  await cx.wait(2.2);
  cx.cap(waiting ? 'You came. You came. I knew you would.' : 'I knew you would take me.', { who: 'Setu', ttl: 2.6 });
  await cx.wait(2.4);
  cx.cap('Setu. Setu. Setu.', { who: 'Mithi', ttl: 2.4 });
  // the sun breaks through
  cx.mark('sunbreak');
  cx.tween(0, 1, 6.5, (v) => { sun.el = -1 + v * 9.5; sun.size = 44 + v * 70; sun.vis = Math.min(1, v * 3); sun.glow = Math.min(1, v * 1.4); }, 'inout');
  skyTo(6.28, 8.5);
  cx.do(() => sfx?.swell(14, 0.2, 174.6));
  cx.bloom(0.0, 0);
  await cx.wait(2.4);
  cx.bloom(0.7, 2.6);
  await cx.wait(1.8);
  // all of them turn to the east, side by side; Jeetu runs up
  cx.mark('sunrise');
  cx.do(() => { S.pos.x = M.pos.x + 0.3; });
  cx.walk(S, M.pos.x + 0.15, BR.z - 1.05, 1.4);
  if (hasJeetu && J) cx.walk(J, M.pos.x - 0.1, BR.z + 1.15, 5.8);
  cx.camPath((k) => ({ p: [C.x - 6.1 + k * 1.8, 38.75 + k * 0.12, C.z + 1.4 - k * 0.6], l: [C.x + 30, 41.2, C.z + 3.5], fov: 44 }), 9, 'inout');
  await cx.wait(1.6);
  cx.faceTo(M, 300, BR.z); cx.faceTo(S, 300, BR.z);
  if (hasJeetu && J) { cx.faceTo(J, 300, BR.z); cx.cap('Look, Setu... SUNRISE!', { who: 'Jeetu', ttl: 3.6 }); }
  else cx.cap('Look, Setu. Sunrise.', { who: 'Mithi', ttl: 3.6 });
  // the world takes its colour: the sea turns gold-rose and her grey perception lifts
  cx.do(() => { if (sea) cx.tween(0, 1, 5, (v) => { sea.color.copy(seaColor0).lerp(new THREE.Color(0xe39a62), v * 0.85); }, 'inout'); });
  if (g.senses) { const p0 = g.senses.perceive; cx.tween(p0, 0, 6, (v) => { g.senses.perceive = v; }, 'inout'); }
  cx.bloom(0.42, 3.0);
  await cx.wait(3.6);
  cx.cap('Didi... is that it? Is that the sun?', { who: 'Setu', ttl: 4.0 });
  await cx.wait(4.0);
  cx.cap('I can feel it, Setu. It\'s warm. It is the warmest thing in the world.', { who: 'Mithi', ttl: 4.6 });
  await cx.wait(2.4);
  // lift away: three small figures on the bridge against the gold
  cx.mark('crane');
  cx.camPath((k) => ({ p: [C.x - 4.3 - k * 8.7, 38.9 + k * 8.5, C.z + 0.8 + k * 21], l: [C.x + 36 - k * 28, 40.8 - k * 0.8, C.z - 3 + k * 3], fov: 44 + k * 4 }), 11, 'inout');
  await cx.wait(3.6);
  if (warned) {
    cx.cap('Far behind them every siren in the city is singing the same warning. Millions are walking to higher ground.', { kind: 'scrawl', ttl: 6.4 });
    cx.do(() => { sfx?.siren(9, { gain: 0.16 }); setTimeout(() => sfx?.siren(8, { gain: 0.1 }), 900); });
  } else {
    cx.cap('Far behind them, under the towers, the sea finds the last of the tunnels. Nobody was told.', { kind: 'scrawl', ttl: 6.4 });
    cx.do(() => { sfx?.rumble(9, 0.35); g.events.emit('sound:emit', { x: g.player.pos.x - 120, y: 0, z: g.player.pos.z, kind: 'water-rush', loudness: 0.7 }); });
  }
  await cx.wait(6.8);
  cx.cap(warned ? 'Millions were evacuated in time.' : 'The light came anyway.', { ttl: 3.6, kind: 'say' });
  await cx.wait(3.6);
}

// =====================================================================================================  OPENING
const HOME = { x: -94, z: -78, door: { x: -90, z: -78 } };

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
  // Setu's mat, blanket and pillow, as he left them (the bag is gone: only dust shapes where his shoes stood)
  const mkBox = (w, h, d, x, y, z, color, ry = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color, emissive: 0x1a140d })); m.position.set(x, y, z); m.rotation.y = ry; return cx.prop(m); };
  mkBox(0.95, 0.04, 1.8, -95.0, 0.02, -79.2, 0xb8a47c, 0.12);
  mkBox(0.7, 0.07, 0.5, -94.85, 0.075, -78.5, 0x3d5f8f, 0.5);
  mkBox(0.5, 0.06, 0.4, -95.2, 0.07, -79.7, 0x365480, -0.3);
  mkBox(0.3, 0.08, 0.2, -95.0, 0.08, -80.0, 0xd8d0b8, 0.1);
  mkBox(0.22, 0.012, 0.3, -93.9, 0.01, -78.3, 0x1a1612, 0.2);
  mkBox(0.22, 0.012, 0.3, -93.6, 0.01, -78.7, 0x1a1612, -0.1);
  cx.hemiBoost = 2.6;
  const BED = [-95.0, 0.78, -75.3];
  cx.camSet(BED, [-92.5, 3.0, -76.5], 64, 0.14);

  // ---- 1: 05:30. the vision
  cx.mark('stamp');
  cx.stamp('05:30', 'Mumbai, 2049. Before dawn.');
  g.audio?.play('breath', null);
  await cx.wait(2.4);
  cx.stamp('', '', false);
  cx.mark('vision');
  sfx?.siren(7, { gain: 0.2 }); sfx?.cries(5, 0.24); sfx?.roar(3.2, 0.4);
  const orig = g.messages?.say?.bind(g.messages);
  if (g.messages) g.messages.say = (t, op) => (/^Setu hears:/.test(t) ? null : orig(t, op));
  cx.onCleanup(() => { if (g.messages && orig) g.messages.say = orig; });
  cx.do(() => {
    const ok = g.senses?.vision?.({ reason: 'story', force: true, duration: 4.2, from: { x: -46, y: 4.6, z: -32, yaw: 70 * D2R }, caption: 'Screaming. Sirens. Rubble. Somewhere, a voice calling a name.' });
    // it is her vision, not his: relabel the glitch overlay
    const root = document.getElementById('vision-fx');
    if (ok && root) {
      const lab = root.querySelector('.v-label'), k = root.querySelector('.v-cap .k');
      if (lab) lab.innerHTML = '<s>SUBJECT 0472</s> <i>mithi</i><br><b>2ND SIGHT</b> <em>REC</em><br>05:30 &nbsp;DAY 1';
      if (k) k.textContent = 'SHE HEARS';
      const off = g.events.on('vision:end', () => { if (k) k.textContent = 'HE HEARS'; off(); });
    }
  });
  cx.black(0, 0.1);
  await cx.wait(4.9);
  cx.black(1, 0.15);
  await cx.wait(0.5);

  // ---- 2: she wakes. Setu's side of the room is cold
  cx.mark('wake');
  cx.camSet(BED, [-92.5, 3.0, -76.5], 64, 0.14);
  g.audio?.play('breath', null);
  cx.do(() => { g.canvas.style.transition = 'none'; g.canvas.style.filter = 'blur(9px)'; void g.canvas.offsetWidth; g.canvas.style.transition = 'filter 2.6s ease-out'; g.canvas.style.filter = 'blur(0px)'; });
  cx.black(0, 1.2);
  cx.cap('A vision. The same one. Louder.', { kind: 'scrawl', ttl: 2.8 });
  await cx.wait(1.8);
  cx.cam({ p: [-94.6, 1.2, -75.8], l: [-94.8, 0.2, -79.2], fov: 66, roll: 0, dur: 1.8, e: 'inout' });
  await cx.wait(1.2);
  cx.cap('Setu?', { who: 'Mithi', ttl: 1.6 });
  await cx.wait(1.3);
  cx.cam({ p: [-94.4, 0.55, -77.6], l: [-94.9, 0.06, -79.4], fov: 58, dur: 2.0, e: 'inout' });
  cx.cap('The blanket is cold. His shoes are gone.', { kind: 'scrawl', ttl: 2.8 });
  await cx.wait(2.7);

  // ---- 3: she steps out into the rain
  cx.mark('street');
  cx.hemiBoost = 1.6;
  cx.cam({ p: [-91.4, 1.55, -78.0], l: [-85, 1.4, -78], fov: 70, dur: 1.5, e: 'inout' });
  g.audio?.play('footstep', null);
  await cx.wait(1.3);
  cx.hemiBoost = 1;
  cx.cam({ p: [-84.2, 1.6, -76.5], l: [-76, 3.0, -52], fov: 72, dur: 2.2, e: 'inout' });
  cx.cap('SETU!', { who: 'Mithi', ttl: 1.4 });
  await cx.wait(2.0);
  cx.cap('Rain on the pillars. And under her feet, a hum.', { kind: 'scrawl', ttl: 3 });
  sfx?.rumble(8, 0.3);
  cx.shake(0.14, 3);
  await cx.wait(2.8);
  cx.cam({ p: [-84.2, 1.6, -76.5], l: [-77, 14, -44], fov: 74, dur: 1.6, e: 'in' });
  cx.shake(0.5, 2);
  await cx.wait(1.6);

  // ---- 4: the five levels fall
  cx.mark('collapse');
  cx.do(() => { g.hazards?.dust?.(-84, 24, -66, 10, 6, { size: 4, up: -0.5, life: 3.5, color: [0.35, 0.32, 0.28] }); });
  sfx?.roar(8, 0.95);
  g.screenfx?.glitch(300);
  cx.shake(1.6, 8);
  cx.setWhiteColor('#cfc6b2');
  const slabs = [];
  // five slabs, one per level, come down into the street ahead of her (temporary: the real rubble is at the plaza)
  const levels = [[58, -75, -50, 18, 6], [50, -68, -44, 8, 18], [42, -82, -42, 19, 5.5], [36, -73, -37, 20, 6], [28, -77, -46, 14, 12]];
  levels.forEach(([y, x, z, w, d], i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, 1.0, d), new THREE.MeshLambertMaterial({ color: 0x41454a, emissive: 0x15171a }));
    m.position.set(x, y, z); m.rotation.set((Math.random() - 0.5) * 0.5, Math.random() * 1.2, (Math.random() - 0.5) * 0.4);
    cx.prop(m); slabs.push({ m, v: 0, delay: 0.1 + i * 0.45, done: false, landY: 0.6 + (i % 3) * 0.7, spin: (Math.random() - 0.5) * 0.9 });
  });
  const debris = [];
  for (let i = 0; i < 30; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(rnd(0.5, 2.2), rnd(0.3, 0.9), rnd(0.5, 2.2)), new THREE.MeshLambertMaterial({ color: 0x5a5a56, emissive: 0x15140f }));
    m.position.set(-76 + rnd(-9, 9), rnd(30, 70), -42 + rnd(-10, 10)); cx.prop(m);
    debris.push({ m, v: rnd(-8, 0), delay: rnd(0, 3), done: false, sp: new THREE.Vector3(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)) });
  }
  const t0f = cx.t;
  const fall = cx.frame((dt) => {
    const t = cx.t - t0f;
    for (const s of slabs) {
      if (s.done || t < s.delay) continue;
      s.v += 26 * dt; s.m.position.y -= s.v * dt; s.m.rotation.x += s.spin * dt * 0.4; s.m.rotation.z += s.spin * dt * 0.3;
      if (s.m.position.y <= s.landY) {
        s.m.position.y = s.landY; s.done = true;
        cx.shake(1.8, 2.5); sfx?.crash(0.9);
        g.hazards?.dust?.(s.m.position.x, 1.2, s.m.position.z, 18, 10, { size: 14, up: 3.4, life: 6, color: [0.85, 0.79, 0.66] });
        g.screenfx?.flash('#e6dcc4', 260, 0.25);
      }
    }
    for (const d of debris) {
      if (d.done || t < d.delay) continue;
      d.v += 24 * dt; d.m.position.y -= d.v * dt; d.m.rotation.x += d.sp.x * dt * 3; d.m.rotation.z += d.sp.z * dt * 3;
      if (d.m.position.y < 0.5) { d.m.position.y = 0.5; d.done = true; if (Math.random() < 0.4) g.hazards?.dust?.(d.m.position.x, 0.6, d.m.position.z, 4, 3, { size: 5, up: 2, life: 4, color: [0.42, 0.38, 0.32] }); }
    }
  });
  // the camera swings to the falling sky, then the dust wall rolls in
  cx.cam({ p: [-84.6, 1.7, -76.8], l: [-76, 12, -42], fov: 78, dur: 1.0, e: 'out' });
  await cx.wait(1.8);
  cx.cap('The whole sky comes down.', { kind: 'scrawl', ttl: 2.4 });
  await cx.wait(1.6);
  cx.white(0.6, 2.0);
  cx.cam({ p: [-84.6, 1.7, -76.8], l: [-74, 5, -46], fov: 76, dur: 2.6, e: 'inout' });
  await cx.wait(2.0);
  g.audio?.duck?.(0.9, 6);
  cx.white(1.0, 1.2);
  await cx.wait(1.4);
  cx.unframe(fall);

  // ---- 5: silence, then car alarms
  cx.mark('silence');
  sfx?.ring(6, 0.08);
  cx.cap('Then nothing.', { kind: 'scrawl', ttl: 2.4 });
  await cx.wait(2.4);
  cx.do(() => { sfx?.carAlarm(10, 0.1); setTimeout(() => sfx?.carAlarm(9, 0.07), 1400); });
  cx.cap('Car alarms. Dust settling. Somewhere a child is crying, and then many.', { kind: 'scrawl', ttl: 3.4 });
  await cx.wait(3.0);
  cx.black(1, 1.2); cx.white(0, 0.01);
  await cx.wait(1.4);
  cx.clearProps();

  // ---- 6: the title
  cx.mark('title');
  cx.title('GRAHAN', 'the search for sunrise');
  await cx.wait(4.4);
  cx.title('', '', false);
  await cx.wait(1.2);

  // ---- 7: gameplay at 05:40, in the dust of the collapse site
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
