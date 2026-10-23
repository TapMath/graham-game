// Builds tools/shots-playthrough.json (seed 1, the full good-ending run) and tools/shots-playthrough-seed2.json (the
// slower chase variant). Run:  node tools/build-playthrough.mjs
//
// Each step is an async script for the debug API (`__grahan.bot`, src/debug-bot.js): real inputs only (movement keys, E,
// Q, Tab, Enter and the digit keys in conversations, `look` for aiming), no teleports and no flag or item setters. The
// simulation is stepped by the script itself (`set('manual', true)` stops the live loop), so a run is deterministic.
// Start it with:  NODE_PATH=$(npm root -g) node tools/smoke.mjs --shots tools/shots-playthrough.json --wait 500 --query "seed=1&intro=1"
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PRE = 'const A=__grahan,B=A.bot,G=A.game;';
const step = (name, code, wait = 300) => ({ name, wait, eval: `(async()=>{${PRE}${code.trim().replace(/\n\s*/g, ' ')}})()` });
const rep = (label) => `B.report(${JSON.stringify(label)})`;

// ---------------------------------------------------------------------------------------------- shared legs
const OLDMAN = `
await B.go([[-38,-26]]); B.hold('KeyE', 3.6); await B.dialogue([]);
return ${rep('old man dug out')};`;

const HOME = `
await B.go([[-60,-40],[-75,-58],[-84,-70],[-84,-78],[-91,-78],[-94,-78]]);
await B.use('pick:remote'); await B.idle(0.5); await B.use('pick:food'); await B.idle(0.5);
return ${rep('batteries and food taken')};`;

const HOSPITAL_WALK = `
await B.go([[-91,-78],[-84,-78],[-84,-70],[-75,-58],[-75,-30],[-75,0],[-75,40],[-75,60],[-60,64],[-45,66],[-45,71.5],[-45,76],[-55,76],[-55,84],[-57.5,86]]);
return ${rep('in ward A')};`;

const JEETU = `
await B.sing(); await B.idle(2.5);
const sang = A.state().story6a.flags.jeetuCalled;
await B.talk('jeetu', ['Come with me'], { at: [-58.2, 89.2] });
return { ...${rep('Jeetu joined')}, calledBySong: sang, party: A.state().party };`;

const TARA = `
await B.go([[-55,84],[-55,78],[-41.5,78],[-41.5,84],[-41.5,86]]);
const first = A.state().rays;
if (first < 5) {                                  /* Tara will not take blood from someone who is shaking: the sun shaft behind the hospital is ten metres away */
  await B.go([[-44.5,90],[-45,93],[-45,96]]); await B.healUp();
  await B.go([[-45,93],[-44.5,90],[-41.5,86]]);
}
await B.talk('tara', ['B-positive'], { at: [-41.5, 88.4] });
return { raysOnArrival: first, ...${rep('blood given')}, bloodGiven: !!G.flags.bloodGiven };`;

const DEPOT_HEAL = `
await B.go([[-44.5,90],[-45,93],[-45,96]]); await B.healUp();
return { ...${rep('healed in the depot shaft')}, inSun: A.state().world.inSun };`;

const TO_SHAFT = `
await B.go([[-45,93],[-45,76],[-45,71.5],[-45,66],[-24,55],[-24,5],[-10,5],[-10,-30],[-10,-58],[40,-60],[45,-52],[52,-45],[52,-41],[52,-36.8],[52,-34.5],[52,-30],[52,-24.5],[52,-21],[54,-22]]);
return ${rep('at the wrecked lift')};`;

const FIND_SETU = `
await B.use('setu'); await B.idle(1);
return ${rep('Setu found')};`;

const TO_CHAMBER = `
await B.go([[52,-24.5],[52,-30],[52,-34.5],[52,-36.8],[52,-41],[45,-52],[40,-60],[-10,-60],[-75,-60],[-75,-20],[-75,0],[-110,0],[-133,2],[-133,-3],[-133,-12],[-133,-27],[-125,-28]]);
return { ...${rep('in the breach chamber')}, breachKnown: !!G.flags.breachKnown };`;

const PUMPS = `
await B.go([[-110,-28],[-106,-38]]);
const ok = await B.read('pumps-chamber');
return { ok, ...${rep('pump station read')}, clues: [...G.fragments.clues] };`;

const LEDGER = `
await B.go([[-100,-40],[-80,-40],[-79,-45],[-80,-49.5],[-90,-50]]);
A.look(-90, 4);
B.tap('KeyV'); await B.idle(0.8); await B.sleep(2500);
const third = { view: G.view.mode, calls: A.state().render.calls, setuFollowing: G.setu.following, jeetuFollowing: !!G.party.jeetu };
B.tap('KeyV'); await B.idle(0.6);
await B.go([[-70,-50]]);
await B.tab(); const asJeetu = G.party.active;
const ok = await B.read('ledger-boring');
await B.tab();
return { ok, asJeetu, thirdPersonUnderground: third, ...${rep('ledger read as Jeetu')}, clues: [...G.fragments.clues] };`;

const EXIT_AND_HEAL = `
await B.go([[-80,-49.5],[-79,-45],[-79,-40],[-100,-40],[-110,-30],[-125,-28],[-133,-27],[-133,-12],[-133,-3],[-133,3]]);
const quay = ${rep('west quay')};
await B.go([[-110,3],[-75,3],[-75,30],[-60,40],[-52,40]]); await B.healUp();
return { quay, ...${rep('healed under the dead tree')}, inSun: A.state().world.inSun };`;

const TARA_WARN = `
await B.go([[-52,43],[-52,60],[-45,66],[-45,71.5],[-45,76],[-41.5,78],[-41.5,84]]);
await B.talk('tara', ['Show her the evidence'], { at: [-41.5, 88.4] });
await B.watch(6);
return { ...${rep('Tara warns the city')}, cityWarned: !!G.flags.cityWarned, via: G.flags.cityWarnedVia };`;

const TO_PIER_GATE = `
await B.go([[-44.5,90],[-45,76],[-45,71.5],[-45,66],[-24,55],[-24,5],[-10,5],[-10,-30],[-10,-58],[40,-60],[105,-60],[140,-60],[155,-58],[156,-45],[156,-39]]);
return ${rep('at the pier gate')};`;

const BRIDGE_LIFT = `
await B.go([[161,-39],[168,-39],[172,-39]]);
B.tap('KeyE'); await B.idle(11);
return ${rep('lift to the bridge deck')};`;

const BRIDGE_WALK = `
await B.go([[172,-33],[190,-30],[203,-30]]);
return ${rep('on the Sunrise Bridge')};`;

const REUNION = `
const t0 = G.time;
await B.go([[211,-30]]);
await B.watch(150, () => G.endings.current);
const e = G.endings.current;
return { ending: e && e.type, title: e && e.title, scene: G.cinematics.last, clock: G.clock.hhmm, cityWarned: !!G.flags.cityWarned, setuFound: !!G.flags.setuFound, rays: G.player.rays, minRays: B.minRays, setuHealth: Math.round(G.setu.health), health: A.state().health.stats, detentions: A.state().hazards.detentions, dogBites: G.hazards.dogs.stats.bites, bot: B.stats, stats: A.state().ending };`;

export const seed1 = [
  step('opening', `
    A.set('manual', true); const c0 = G.cinematics.current?.name ?? null;
    await B.watch(8);
    return { cinematic: c0, playing: G.cinematics.current?.name ?? null, t: G.cinematics.current?.t, clock: G.clock.hhmm, mode: G.mode };`, 400),
  step('opening-skip', `
    A.hold('Enter'); A.release('Enter'); await B.watch(4, () => !G.cinematics.current);
    return { cinematicDone: !G.cinematics.current, ...${rep('start of play')} };`, 500),
  step('collapse-dig', OLDMAN),
  step('home-torch-and-food', HOME),
  step('walk-to-hospital', HOSPITAL_WALK),
  step('hospital-jeetu', JEETU),
  step('hospital-tara-blood', TARA),
  step('depot-sun-heal', DEPOT_HEAL),
  step('to-maintenance-shaft', TO_SHAFT),
  step('find-setu', FIND_SETU),
  step('to-breach-chamber', TO_CHAMBER),
  step('pump-station-clue', PUMPS),
  step('ledger-as-jeetu', LEDGER),
  step('exit-and-heal', EXIT_AND_HEAL),
  step('tara-warns-the-city', TARA_WARN),
  step('to-the-pier-gate', TO_PIER_GATE),
  step('bridge-lift', BRIDGE_LIFT),
  step('bridge-walk', BRIDGE_WALK),
  step('reunion-ending-1', REUNION, 1500),
];


// ---------------------------------------------------------------------------------------------- seed 2: the slower variant
// A different seed (other dog packs, drones, Setu's timetable, flood) and a different way in: no old man, no trip home. She pays
// Gautam's bail with TIME (two hours of forms: that is the waiting; no clock jump is used), so the guards at the Metro gate are
// busy and she can walk in by the front stairs; by then Setu has left the wrecked lift, so she follows the leads below.
const BAIL = `
await B.go([[-38,-26],[-38,-12],[-24,-8],[-10,5],[-10,-30],[-10,-58],[18,-62],[18,-74],[18,-79],[15,-79.4]]);
await B.talk('gautam', ['in time'], { at: [15, -80.2] });
await B.watch(3);
return { ...${rep('Gautam freed; two hours of forms')}, gautamFree: !!G.flags.gautamFree };`;

const S2_TO_HOSPITAL = `
await B.go([[15,-79.4],[18,-74],[18,-62],[-10,-58],[-10,-30],[-10,5],[-24,8],[-24,55],[-45,66],[-45,71.5],[-45,76],[-55,76],[-55,84],[-57.5,86]]);
return ${rep('in ward A')};`;

const S2_METRO_GATE = `
await B.go([[-45,93],[-45,76],[-45,71.5],[-45,66],[-24,55],[-24,5],[0,5],[39,5],[45,3],[45,-3],[45,-12],[45,-20],[45,-26]]);
return { ...${rep('through the Metro gate, no jacket')}, gautamDistracting: G.director.gautamDistracting(), guards: A.state().hazards.guards.stats };`;

const S2_WRECK = `
await B.go([[50,-22],[54,-22]]);
const at = G.setu.windowId, here = at === 'liftWreck';
if (here) { await B.use('setu'); await B.idle(1); }
await B.idle(1);
return { ...${rep('at the wrecked lift')}, setuWindow: at, foundHere: here, leadMessages: A.state().messages.last.slice(0, 3) };`;

const S2_TO_CATACOMBS = `
await B.go([[40,-30],[33,-32],[30,-40],[10,-40],[-30,-40],[-80,-40],[-100,-40],[-100,-32],[-117,-30],[-117,-10],[-117,10],[-117,22],[-105,22],[-97.5,22],[-97.5,16]]);
return ${rep('at the catacombs')};`;

const S2_AAYAT = `
const w = G.setu.windowId;
await B.talk('aayat', [], { at: [-97.5, 15] });
if (!G.setu.found) { await B.use('setu'); await B.idle(1); }
return { ...${rep('Aayat and Setu')}, setuWindow: w, lead: G.flags.setuLead };`;

const S2_TO_CHAMBER = `
await B.go([[-97.5,22],[-105,22],[-117,22],[-117,10],[-117,-10],[-117,-30],[-110,-30]]);
return { ...${rep('in the breach chamber')}, breachKnown: !!G.flags.breachKnown };`;

export const seed2 = [
  step('start', `A.set('manual', true); await B.idle(1); return ${rep('start of play (no intro, seed 2)')};`),
  step('bail-gautam-in-time', BAIL),
  step('walk-to-hospital', S2_TO_HOSPITAL),
  step('hospital-jeetu', JEETU),
  step('hospital-tara-blood', TARA),
  step('depot-sun-heal', DEPOT_HEAL),
  step('metro-front-gate', S2_METRO_GATE),
  step('lift-wreck', S2_WRECK),
  step('tunnels-to-the-catacombs', S2_TO_CATACOMBS),
  step('aayat-and-setu', S2_AAYAT),
  step('to-breach-chamber', S2_TO_CHAMBER),
  step('pump-station-clue', PUMPS),
  step('ledger-as-jeetu', LEDGER),
  step('exit-and-heal', EXIT_AND_HEAL),
  step('tara-warns-the-city', TARA_WARN),
  step('to-the-pier-gate', TO_PIER_GATE),
  step('bridge-lift', BRIDGE_LIFT),
  step('bridge-walk', BRIDGE_WALK),
  step('reunion-ending-1', REUNION, 1500),
];


// ---------------------------------------------------------------------------------------------- the Phase 7b regression tour
// Short, scripted probes of what 7b fixed (each asserts with ok(); a failed assertion throws and so fails the run).
const OK = "const ok=(c,m)=>{ if(!c) throw new Error('ASSERT '+m); };";
const pstep = (name, code, wait = 300) => ({ name, wait, eval: `(async()=>{${PRE}${OK}${code.trim().replace(/\n\s*/g, ' ')}})()` });
export const phase7b = [
  pstep('setup', `A.set('manual', true); A.set('invulnerable', true); A.do('hazardsClear'); A.setTime(7); A.teleport(-75, 0, -20, 0); B.d.step(1); return { clock: G.clock.hhmm, hazards: A.state().hazards.total };`),
  pstep('sing-does-not-go-through-floors', `
    A.teleport(-117, -8, 22, 0); A.look(0, 0);
    const under = A.do('spawnDrone', { altitude: 20, ahead: 4, span: 6 }); B.d.step(0.5); A.do('singEmit'); B.d.step(0.3);
    const dU = G.hazards.drones.drones.find((d) => d.id === under);
    A.teleport(-75, 0, -20, 0); A.look(0, 0);
    const near = A.do('spawnDrone', { altitude: 12, ahead: 5, span: 6 }); B.d.step(0.5); A.do('singEmit'); B.d.step(0.3);
    const far = A.do('spawnDrone', { altitude: 12, ahead: 38, span: 2 }); B.d.step(0.5); A.do('singEmit'); B.d.step(0.3);
    const st = (id) => G.hazards.drones.drones.find((d) => d.id === id).state;
    ok(dU.state === 'patrol', 'an L1 drone 20 m above ignores a song from the tunnels: ' + dU.state);
    ok(st(near) !== 'patrol', 'a drone one level up and 5 m off hears it (investigates, or has already spotted her): ' + st(near));
    ok(st(far) === 'patrol', 'a drone 38 m away on another level does not: ' + st(far));
    return { underground: dU.state, nextLevelNear: st(near), nextLevelFar: st(far) };`),
  pstep('visions-wait-for-a-calm-moment', `
    A.do('hazardsClear'); A.do('hazardsClear', 'drones'); G.hazards.grace = 0; A.teleport(-75, 0, 0, 0); A.look(90, 0); const V = G.visionSystem; V.lastT = -99; V.queue.length = 0; B.d.step(3);
    const calm0 = V.available();
    A.do('spawnDogs', 3, 8, 'chase'); B.d.step(0.5); const chased = V.available();
    A.do('hazardsClear'); B.d.step(0.5); const justAfter = V.available(); B.d.step(2.6); const later = V.available();
    A.do('jeetuJoin'); B.d.step(0.5); await B.tab(); const asJeetu = V.available();
    A.do('setuSetHealth', 49); B.d.step(3.5); const queued = V.queue.length, activeAsJeetu = V.active;
    await B.tab();
    ok(calm0 && !chased && !justAfter && later, 'available when calm (' + calm0 + '), not while chased (' + chased + '), not 0.5 s after (' + justAfter + '), again after 3 s (' + later + ')');
    ok(!asJeetu && !activeAsJeetu && queued === 1, 'never as Jeetu; a breath vision waits in the queue: ' + queued);
    return { calm0, chased, justAfter, later, asJeetu, queued, activeAsJeetu, party: G.party.active };`),
  pstep('drone-cone-close', `
    A.do('hazardsClear'); A.do('hazardGrace', 0); A.teleport(-75, 0, -20, 0); A.look(0, 35);
    A.do('spawnDrone', { altitude: 5, ahead: 3, span: 3, speed: 0.5 }); B.d.step(0.6); await B.sleep(2500);
    return { calls: A.state().render.calls, note: 'the patrol cone and its pool are muted at close range (screenshot)' };`, 500),
  pstep('chalk-faces-the-reader', `
    A.do('hazardsClear'); A.do('trail', 'triageTents', { tp: false }); const mk = G.trail.marks.get('triageTents'), w = mk.words.position, res = [];
    for (const ang of [0, 90, 180, 270]) {
      const x = w.x + Math.sin(ang * Math.PI / 180) * 2.3, z = w.z + Math.cos(ang * Math.PI / 180) * 2.3;
      A.teleport(x, 0, z, ang); A.look(ang, -36); B.d.step(0.3);
      const up = new G.camera.position.constructor(0, 1, 0).applyQuaternion(mk.words.quaternion);       /* the top edge of the words, in the world */
      const away = { x: w.x - x, z: w.z - z }, l = Math.hypot(away.x, away.z);
      const dot = (up.x * away.x + up.z * away.z) / l;
      res.push([ang, +dot.toFixed(2)]);
      ok(dot > 0.95, 'the words read upright from the ' + ang + ' degree side: ' + dot.toFixed(2));
    }
    A.teleport(w.x, 0, w.z + 2.3, 0); A.look(0, -36); B.d.step(0.3); await B.sleep(2200);
    return { res };`, 500),
  pstep('jeetu-hands-the-conversation-to-mithi', `
    A.teleport(-41.5, 0, 86.5, 0); B.d.step(0.5); await B.tab(); const before = G.party.active;
    A.do('talk', 'tara'); const after = G.party.active, open = G.dialogue.isOpen;
    await B.dialogue([]);
    ok(before === 'jeetu' && after === 'mithi' && open, 'talking while Jeetu is played swaps to Mithi: ' + before + ' -> ' + after);
    return { before, after, open };`),
  pstep('night-shrine-heals', `
    A.set('hazards', false); A.setTime(23); A.teleport(-66.3, 0, -81.8, 0); A.set('invulnerable', false); A.set('rays', 3); B.d.step(0.5);
    const status = A.state().health.status; B.d.step(10.5); const near = G.player.rays;
    A.teleport(-60, 0, -70, 0); A.set('rays', 3); B.d.step(10); const away = G.player.rays;
    ok(status === 'healing' && near >= 5 && away === 3, 'diyas heal at night, nowhere else does: ' + status + ' ' + near + ' ' + away);
    A.set('hazards', true); A.set('invulnerable', true); A.setTime(7);
    return { status, raysAtShrine: near, raysAway: away, shafts: G.world.sunShafts.intensity };`),
  pstep('dog-pack-aggression', `
    const out = {};
    const trial = (label, away, keys, secs, dist = 9) => { A.do('hazardsClear'); A.do('hazardGrace', 0); A.teleport(-100, 0, 0, 0); A.look(90, 0); A.set('rays', 12); G.hazards.grace = 0; A.do('spawnDogs', 3, dist, 'chase'); B.d.step(0.2); const b0 = G.hazards.dogs.stats.bites; if (away) A.look(-90, 0); if (keys) B.d.run(keys, secs); else B.d.step(secs); out[label] = G.hazards.dogs.stats.bites - b0; };
    trial('stand_6s', false, null, 6); trial('walk_away_6s', true, 'KeyW', 6); trial('sprint_away_5s', true, ['KeyW', 'ShiftLeft'], 5); trial('sprint_away_from_4m', true, ['KeyW', 'ShiftLeft'], 5, 4);
    A.do('hazardsClear'); A.do('hazardGrace', 0); A.teleport(-100, 0, 0, 0); A.look(90, 0); G.hazards.grace = 0; A.do('spawnDogs', 3, 9, 'chase'); B.d.step(1); B.d.run('KeyQ', 0.12); const b1 = G.hazards.dogs.stats.bites; B.d.step(8); out.sung_at_1s = G.hazards.dogs.stats.bites - b1;
    ok(out.stand_6s >= 1 && out.stand_6s <= 4, 'three dogs on a player who stands still: at most about one bite every 1.8 s: ' + out.stand_6s);
    ok(out.sprint_away_5s === 0 && out.sprint_away_from_4m === 0, 'sprinting outruns a pack (they top out at 6.3 m/s, sprint is 7)');
    ok(out.sung_at_1s === 0, 'a song calms the pack');
    return out;`),
  pstep('underground-draw-calls', `
    A.do('hazardsClear'); A.do('hazardGrace', 0); A.do('jeetuJoin'); A.do('setuFind'); A.set('view', 'third'); if (G.party.active !== 'mithi') await B.tab();
    const spots = [[-125, -8, -28, -90], [-80, -8, -48, 0], [-113, -8, 22, 0], [40, -8, 66, 0], [45, -8, -26, 0], [-20, -8, 76, 0], [-30, -8, -40, -90]];
    let max = 0; const rows = [];
    for (const [x, y, z, yaw] of spots) { A.teleport(x, y, z, yaw); A.do('setuTeleportToPlayer', 3); B.d.step(1); await B.sleep(1800); await B.sleep(1200); const c = A.state().render.calls; rows.push([x, z, c]); max = Math.max(max, c); }
    A.set('view', 'first');
    ok(max <= 140, 'worst case underground, third person, Jeetu and Setu following: ' + max + ' draw calls');
    return { max, rows, party: G.party.active };`, 600),
  pstep('reunion-length', `
    A.do('cine', 'reunion', { type: 1, waiting: true }); await B.watch(100, () => G.endings.current); const waiting = G.cinematics.last.t;
    A.do('endingReset'); await B.sleep(100);
    return { waitingVariantSeconds: waiting };`),
  pstep('ripple-near-the-eye', `
    A.do('endingReset'); A.set('hazards', false); A.do('hazardsClear'); A.teleport(-38, 0, -20, 0); A.look(0, 0); A.do('ripple', 'neutral', 0, -1.4, 0.9); B.d.step(0.5); await B.sleep(1500);
    return { note: 'a ring right at the eye is thinned and capped, no square-edged wash (screenshot)' };`, 500),
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(path.join(here, 'shots-playthrough.json'), JSON.stringify(seed1, null, 1));
  fs.writeFileSync(path.join(here, 'shots-playthrough-seed2.json'), JSON.stringify(seed2, null, 1));
  fs.writeFileSync(path.join(here, 'shots-phase7b.json'), JSON.stringify(phase7b, null, 1));
  console.log('wrote shots-playthrough.json', seed1.length, 'steps, shots-playthrough-seed2.json', seed2.length, 'steps and shots-phase7b.json', phase7b.length, 'steps');
}
