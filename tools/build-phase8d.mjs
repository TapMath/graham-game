// Builds tools/shots-phase8d.json, the Phase 8D tour: the crowd's people baked from the cast's builder. Close and mid-distance crowd views
// (the Sion platform with a train standing, a Dharavi lane, the Sion Junction rescue crowd, the King's Circle bazaar on L1, the L3 gardens),
// the crowd beside named cast members (Tara, the rescuers), third person standing in the crowd, the clearance assertions (nobody within
// 0.8 m of the player, the camera, Setu or Jeetu over several seconds in dense spots, none spawned in a train door), the traffic, and the
// draw-call and triangle worst case.
//   node tools/build-phase8d.mjs
//   node tools/smoke.mjs --shots tools/shots-phase8d.json --wait 2500 --query seed=1 --viewport 960x540
// Every step asserts with ok(); a failed assertion throws and fails the run.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PRE = `const A=__grahan,B=A.bot,G=A.game;const ok=(c,m)=>{ if(!c) throw new Error('ASSERT '+m); };const wait=(ms)=>new Promise((r)=>setTimeout(r,ms));
const face=(px,pz,tx,tz)=>Math.atan2(-(tx-px),-(tz-pz))*180/Math.PI;
const snap=()=>{ B.d.step(0.5); G.render(); G.render(); const r=G.renderStats(); const c=A.state().crowds; return { calls:r.calls, tris:r.triangles, drawn:c.drawn, min:[c.minDist,c.minDistCam,c.minDistPeers] }; };`;
const step = (name, code, wait = 600) => ({ name, wait, eval: `(async()=>{${PRE.replace(/\n/g, ' ')}${code.trim().replace(/\n\s*/g, ' ')}})()` });

export const tour = [
  step('p8d-setup', `
    A.set('manual', true); A.set('invulnerable', true); A.set('hazards', false); A.setTime(10); A.set('perceive', 0); A.set('view', 'first'); A.teleport(-44, 0, -30, 0); A.step(1);
    const C = G.crowds, P = C.people;
    ok(Object.keys(P.near).length === 8, 'eight detailed bodies');
    ok(Object.keys(P.mid).length === 4 && P.far, 'four mid groups and one far mesh');
    const by = {}; for (const a of C.agents) by[a.variant] = (by[a.variant] || 0) + 1;
    ok(Object.keys(by).length === 8, 'every body is worn by somebody: ' + JSON.stringify(by));
    const tris = {}; for (const [k, r] of Object.entries(P.near)) tris[k] = r.tris;
    for (const k of Object.keys(tris)) ok(tris[k] > 900 && tris[k] < 2000, 'near body ' + k + ' has a sane triangle count: ' + tris[k]);
    for (const [k, r] of Object.entries(P.mid)) ok(r.tris < 650, 'mid body ' + k + ': ' + r.tris);
    ok(P.far.tris < 130, 'the far body: ' + P.far.tris);
    ok(C.agents.length > 900, 'about a thousand people: ' + C.agents.length);
    return { agents: C.agents.length, bodies: by, near: tris, mid: Object.fromEntries(Object.entries(P.mid).map(([k, r]) => [k, r.tris])), far: P.far.tris };`),

  // ------------------------------------------------------------------------------------------------ the Sion platform, a train standing
  step('p8d-sion-platform-train-first-person', `
    A.set('view', 'first'); A.teleport(-45, 0.5, -52.4, 0); A.look(0, 2); A.set('hour', 10);
    const w = A.do('transitWait', 'sion', 'west', 300); ok(w, 'a westbound train at Sion');
    B.d.step(1.5); const s = snap();
    ok(s.drawn.near >= 3 && s.drawn.mid >= 5, 'people close and mid-distance: ' + JSON.stringify(s.drawn));
    ok(s.min[0] >= 0.8 && s.min[1] >= 0.8, 'nobody within 0.8 m of the player or the camera: ' + JSON.stringify(s.min));
    return { train: w, ...s };`, 900),
  step('p8d-sion-platform-along-the-edge', `A.teleport(-34, 0.5, -52.9, 0); A.look(90, 1); B.d.step(0.6); const s = snap(); ok(s.min[0] >= 0.8, 'clear: ' + s.min); return s;`, 900),
  step('p8d-sion-platform-crowd-close', `A.teleport(-52, 0.5, -52.6, 0); A.look(-60, 2); B.d.step(0.6); const s = snap(); ok(s.min[0] >= 0.8, 'clear: ' + s.min); return s;`, 900),
  step('p8d-sion-platform-third-person', `A.set('view', 'third'); A.teleport(-40, 0.5, -52.7, 0); A.look(0, -4); A.set('viewBack', 3.2); B.d.step(1); const s = snap(); ok(s.min[0] >= 0.8 && s.min[1] >= 0.8, 'clear: ' + s.min); A.set('view', 'first'); return s;`, 900),

  // ------------------------------------------------------------------------------------------------ Dharavi, the rescue crowd, the bazaar, the gardens
  step('p8d-dharavi-lane-first-person', `A.teleport(-105, 0, -85, 0); A.look(0, 1); B.d.step(1); const s = snap(); ok(s.drawn.near >= 3, 'people near in the lane: ' + JSON.stringify(s.drawn)); ok(s.min[0] >= 0.8 && s.min[1] >= 0.8, 'clear: ' + s.min); return s;`, 900),
  step('p8d-dharavi-lane-third-person', `A.set('view', 'third'); A.teleport(-113, 0, 80, 0); A.look(0, -3); A.set('viewBack', 3.2); B.d.step(1); const s = snap(); ok(s.min[0] >= 0.8 && s.min[1] >= 0.8, 'clear: ' + s.min); A.set('view', 'first'); return s;`, 900),
  step('p8d-sion-junction-rescue-crowd', `A.teleport(-44, 0, -16, 0); A.look(0, 1); B.d.step(1); const s = snap(); const w = G.crowds.agents.filter((a) => a.variant === 'worker').length; ok(w >= 10, 'hi-vis rescue workers in the crowd: ' + w); ok(s.min[0] >= 0.8 && s.min[1] >= 0.8, 'clear: ' + s.min); return { workers: w, ...s };`, 900),
  step('p8d-sion-junction-rescue-crowd-from-inside', `A.set('view', 'third'); A.teleport(-40, 0, -50, 0); A.look(40, -3); A.set('viewBack', 3.2); B.d.step(1); const s = snap(); ok(s.min[0] >= 0.8 && s.min[1] >= 0.8, 'clear: ' + s.min); A.set('view', 'first'); return s;`, 900),
  step('p8d-kings-circle-bazaar-L1', `A.teleport(10, 12, -26, 0); A.look(90, 1); B.d.step(1); const s = snap(); ok(s.drawn.near >= 3, 'people near in the bazaar: ' + JSON.stringify(s.drawn)); ok(s.min[0] >= 0.8 && s.min[1] >= 0.8, 'clear: ' + s.min); return s;`, 900),
  step('p8d-l3-gardens', `
    const g = G.world.map.gardens[0]; A.teleport(g.x0 + 10, 38, g.z0 + 3.5, 0); A.look(-90, 1); B.d.step(1);
    const s = snap(); const rich = G.crowds.agents.filter((a) => a.level === 'L3').map((a) => a.variant);
    ok(rich.length >= 10, 'people on L3: ' + rich.length); ok(s.min[0] >= 0.8 && s.min[1] >= 0.8, 'clear: ' + s.min); return { level: A.state().level, variants: [...new Set(rich)], ...s };`, 900),
  step('p8d-l3-gardens-third-person', `const g = G.world.map.gardens[0]; A.set('view', 'third'); A.teleport(g.x0 + 24, 38, g.z0 + 3.5, 0); A.look(-90, -3); A.set('viewBack', 3.2); B.d.step(1); const s = snap(); A.set('view', 'first'); return s;`, 900),

  // ------------------------------------------------------------------------------------------------ beside the cast
  step('p8d-beside-tara', `
    A.set('view', 'first'); A.do('crowdClearPlaced'); A.do('cast', 'tara', 4.4); const t = G.cast.get('tara').pos, yaw = 0.14;
    for (const [v, dx] of [['sari', -1.45], ['salwar', -2.5], ['child', -3.45], ['shirt', 1.35], ['kurta', 2.45], ['worker', 3.5]]) A.do('crowdPlace', t.x + dx, t.y, t.z + 0.3, v, yaw, {});
    B.d.step(1.2); const s = snap(); ok(s.drawn.near >= 6, 'six crowd bodies stand beside Tara: ' + JSON.stringify(s.drawn)); return s;`, 1000),
  step('p8d-beside-tara-closer', `const t = G.cast.get('tara').pos; A.teleport(t.x + 0.4, t.y, t.z + 2.6, 0); A.look(0, 3); B.d.step(0.8); const s = snap(); ok(s.min[0] >= 0.8, 'clear: ' + s.min); return s;`, 900),
  step('p8d-beside-tara-third-person', `const t = G.cast.get('tara').pos; A.set('view', 'third'); A.teleport(t.x + 0.9, t.y, t.z + 2.2, 0); A.look(0, -2); A.set('viewBack', 2.8); B.d.step(1); const s = snap(); A.set('view', 'first'); return s;`, 900),
  step('p8d-beside-the-rescuers', `
    A.do('crowdClearPlaced'); A.do('cast', 'rescuers-collapse', 4.6); const a = G.cast.get('rescuers-collapse'), m = a.members[0] || a.pos;
    A.do('crowdPlace', m.x + 1.5, m.y, m.z, 'worker', m.yaw || 0, {}); A.do('crowdPlace', m.x - 1.5, m.y, m.z, 'worker', m.yaw || 0, {}); A.do('crowdPlace', m.x + 3.0, m.y, m.z, 'shirt', m.yaw || 0, {});
    B.d.step(1.2); const s = snap(); return { members: a.members.length, ...s };`, 1000),
  step('p8d-beside-the-nurses', `A.do('crowdClearPlaced'); A.do('cast', 'nurses', 3.6); const a = G.cast.get('nurses'), m = a.members[0] || a.pos; A.do('crowdPlace', m.x + 1.6, m.y, m.z, 'sari', m.yaw || 0, {}); A.do('crowdPlace', m.x - 1.6, m.y, m.z, 'salwar', m.yaw || 0, {}); B.d.step(1.2); return snap();`, 1000),
  step('p8d-clear-placed', `A.do('crowdClearPlaced'); return 1;`, 100),

  // ------------------------------------------------------------------------------------------------ clearance: the crowd parts around the player
  step('p8d-clearance-chai-stall', `
    /* standing in the middle of a stall's regulars (5 of them 1.6 m round the spot) for 6 seconds, then running through the Dharavi lane crowd */
    A.set('view', 'first'); A.teleport(-70, 0, 12, 0); A.look(0, 0); const mins = []; let maxOff = 0;
    for (let i = 0; i < 24; i++) { B.d.step(0.25); G.render(); const c = A.state().crowds; mins.push([c.minDist, c.minDistCam]); for (const a of G.crowds.agents) maxOff = Math.max(maxOff, Math.hypot(a.ox || 0, a.oz || 0)); }
    const lo = Math.min(...mins.map((m) => m[0])), loc = Math.min(...mins.map((m) => m[1]));
    ok(lo >= 0.8 && loc >= 0.8, 'for 6 s nobody within 0.8 m of the player (' + lo + ') or the eye (' + loc + ')');
    ok(maxOff > 0.2, 'the regulars stepped aside (eased offset ' + maxOff.toFixed(2) + ' m)');
    return { lo, loc, maxOff: +maxOff.toFixed(2), samples: mins.length };`, 800),
  step('p8d-clearance-run-through-the-platform', `
    A.teleport(-60, 0.5, -52.4, 0); A.look(-90, 0); const mins = []; let n = 0;
    for (let i = 0; i < 16; i++) { A.run('KeyW', 0.5); G.render(); const c = A.state().crowds; mins.push([c.minDist, c.minDistCam]); n += A.do('crowdNear', 1.0); }
    const lo = Math.min(...mins.map((m) => m[0])), loc = Math.min(...mins.map((m) => m[1]));
    ok(lo >= 0.8 && loc >= 0.8, 'running 8 s through the platform crowd: nearest drawn person ' + lo + ' m, to the eye ' + loc + ' m');
    return { lo, loc, x: A.state().pos.x };`, 800),
  step('p8d-clearance-ring-of-people', `
    /* a ring of twelve people dropped 0.35 to 0.7 m round the player: they are drawn out of the 0.8 m bubble, the eye included */
    A.teleport(-105, 0, -85, 0); A.look(0, 0); A.do('crowdClearPlaced'); const p = G.player.pos;
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, r = 0.35 + (i % 3) * 0.17; A.do('crowdPlace', p.x + Math.cos(a) * r, 0, p.z + Math.sin(a) * r, ['shirt', 'sari', 'kurta', 'child', 'salwar', 'worker'][i % 6], a, {}); }
    const mins = []; for (let i = 0; i < 8; i++) { B.d.step(0.3); G.render(); const c = A.state().crowds; mins.push([c.minDist, c.minDistCam]); }
    const lo = Math.min(...mins.map((m) => m[0])), loc = Math.min(...mins.map((m) => m[1]));
    ok(lo >= 0.8 && loc >= 0.8, 'a ring of people on top of the player is drawn clear: ' + lo + ' / ' + loc);
    A.do('crowdClearPlaced'); return { lo, loc };`, 900),
  step('p8d-clearance-third-person-camera', `
    A.set('view', 'third'); A.set('viewBack', 3.2); A.teleport(-105, 0, -85, 0); A.look(0, 0); A.do('crowdClearPlaced'); const p = G.player.pos;
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = 1.6 + (i % 2) * 0.8; A.do('crowdPlace', p.x + Math.cos(a) * r, 0, p.z + Math.sin(a) * r, ['shirt', 'sari', 'kurta', 'child'][i % 4], a, {}); }
    const mins = []; for (let i = 0; i < 8; i++) { A.run('KeyW', 0.3); G.render(); const c = A.state().crowds; mins.push([c.minDist, c.minDistCam]); }
    const lo = Math.min(...mins.map((m) => m[0])), loc = Math.min(...mins.map((m) => m[1]));
    ok(lo >= 0.8 && loc >= 0.8, 'the follow camera is not in anybody either: ' + lo + ' / ' + loc);
    A.do('crowdClearPlaced'); A.set('view', 'first'); return { lo, loc };`, 900),
  step('p8d-clearance-companions-and-doors', `
    A.set('view', 'third'); A.do('setuFind'); A.do('jeetuJoin'); A.teleport(-105, 0, -85, 0); A.do('setuTeleportToPlayer', 2.4); B.d.step(1.5);
    const S = G.setu.pos, J = G.party.jeetu.pos; A.do('crowdClearPlaced');
    for (let i = 0; i < 6; i++) { const a = i * 1.05; A.do('crowdPlace', S.x + Math.cos(a) * 0.4, 0, S.z + Math.sin(a) * 0.4, 'shirt', a, {}); A.do('crowdPlace', J.x + Math.cos(a) * 0.45, 0, J.z + Math.sin(a) * 0.45, 'sari', a, {}); }
    const mins = []; for (let i = 0; i < 6; i++) { B.d.step(0.3); G.render(); mins.push(A.state().crowds.minDistPeers); }
    const lo = Math.min(...mins);
    ok(lo >= 0.8, 'nobody is drawn within 0.8 m of Setu or Jeetu: ' + lo);
    A.do('crowdClearPlaced');
    /* the doors of a train: nobody appears on top of the player standing in a doorway */
    A.set('view', 'first'); A.teleport(-45, 0.5, -52.4, 0); const before = G.crowds.transients.length;
    const got = G.crowds._spawnTransient(G.player.pos.x, G.player.pos.z, [[G.player.pos.x, G.player.pos.z + 3]]); ok(got === null, 'no passenger is spawned on the player in a doorway');
    ok(G.crowds._spawnTransient(G.player.pos.x + 4, G.player.pos.z, [[G.player.pos.x + 8, G.player.pos.z]]), 'but one is spawned a few metres off');
    return { lo, transients: G.crowds.transients.length - before };`, 700),
  step('p8d-clearance-aboard', `
    A.set('view', 'first'); A.teleport(-45, 0.5, -52.4, 0); const w = A.do('transitWait', 'sion', 'west', 300); A.do('transitBoard', 'sion'); A.look(0, 2); B.d.step(2);
    ok(A.state().transit.ride, 'riding');
    const mins = []; for (let i = 0; i < 12; i++) { B.d.step(0.4); G.render(); const c = A.state().crowds; mins.push([c.minDist, c.minDistCam]); }
    const lo = Math.min(...mins.map((m) => m[0])), loc = Math.min(...mins.map((m) => m[1])); const s = snap();
    ok(lo >= 0.8 && loc >= 0.8, 'aboard: the riders keep clear of the player and the eye: ' + lo + ' / ' + loc);
    return { lo, loc, riders: s.drawn.riders, near: s.drawn.near };`, 900),
  step('p8d-clearance-aboard-third-person', `A.set('view', 'third'); A.set('viewBack', 2.6); B.d.step(1); const s = snap(); ok(s.min[0] >= 0.8 && s.min[1] >= 0.8, 'aboard, in third person: ' + s.min); A.set('view', 'first'); return s;`, 900),
  step('p8d-alight', `G.transit.alight(); B.d.step(1); ok(!A.state().transit.ride, 'alighted'); return { ride: A.state().transit.ride };`, 400),

  // ------------------------------------------------------------------------------------------------ traffic
  step('p8d-traffic-closeup', `
    A.set('view', 'first'); const L = G.crowds.vlanes.find((l) => l.level === 'G' && l.vehicles.length > 3 && l.ux === 0 && l.vehicles.some((q) => q.type === 'taxi')); const v = L.vehicles.find((q) => q.type === 'taxi');
    const px = v.x + L.px * 7.5, pz = v.z - L.uz * 8; A.teleport(px, 0, pz, 0); A.look(face(px, pz, v.x, v.z), 3); B.d.step(0.8); const s = snap(); return { type: v.type, at: [px, pz], ...s };`, 900),
  step('p8d-traffic-bus-and-autos', `
    A.set('view', 'first'); const L = G.crowds.vlanes.find((l) => l.level === 'G' && l.ux === 0 && l.vehicles.some((q) => q.type === 'bus')); const v = L ? L.vehicles.find((q) => q.type === 'bus') : null;
    if (v) { const px = v.x + L.px * 7.5, pz = v.z - L.uz * 10; A.teleport(px, 0, pz, 0); A.look(face(px, pz, v.x, v.z), 4); } B.d.step(0.8); return { bus: !!v, ...snap() };`, 900),
  step('p8d-flyover-traffic', `A.teleport(-60, 24, -60, 0); A.look(90, 4); B.d.step(1); return snap();`, 900),

  // ------------------------------------------------------------------------------------------------ the budget: draw calls and triangles
  step('p8d-draw-calls-and-triangles-worst-case', `
    A.set('view', 'third'); A.do('setuFind'); A.do('jeetuJoin'); A.set('hazards', true); A.do('hazardsClear'); A.set('invulnerable', true); A.setTime(10);
    const rows = []; let maxC = 0, maxT = 0;
    const measure = async (label) => { B.d.step(1.2); G.render(); G.render(); const r = G.renderStats(); const d = A.state().crowds.drawn; rows.push([label, r.calls, Math.round(r.triangles / 1000) + 'k', d.near + '/' + d.mid + '/' + (d.people - d.near - d.mid)]); maxC = Math.max(maxC, r.calls); maxT = Math.max(maxT, r.triangles); };
    A.teleport(-45, 0.5, -67.6, 0); A.look(-90, -6); A.do('setuTeleportToPlayer', 3);
    const w = A.do('transitWait', 'sion', 'east', 300); ok(w, 'a train at Sion');
    await measure('Sion platform, train standing');
    A.look(-110, -4); await measure('Sion platform, looking down the line');
    A.teleport(-45, 0.5, -52.4, 0); A.look(-150, -6); A.do('setuTeleportToPlayer', 3); await measure('Sion south platform, an arriving train');
    A.teleport(135, 0.5, -52.4, 0); A.look(-90, -6); A.do('setuTeleportToPlayer', 3); await measure('Sewri');
    A.teleport(-45, 0, -30, 0); A.look(-90, 0); A.do('setuTeleportToPlayer', 3); await measure('the collapse crowd');
    A.teleport(10, 12, -26, 0); A.look(90, 0); A.do('setuTeleportToPlayer', 3); await measure('the bazaar');
    A.teleport(-105, 0, -80, 0); A.look(0, 0); A.do('setuTeleportToPlayer', 3); await measure('Dharavi');
    A.teleport(-15, 0, -50, 0); A.look(0, 0); A.do('setuTeleportToPlayer', 3); await measure('Sion crossing');
    A.teleport(-45, 0.5, -67.6, 0); A.do('setuTeleportToPlayer', 3);
    const w2 = A.do('transitWait', 'sion', 'east', 300); A.do('transitBoard', 'sion'); A.look(-90, -8); B.d.step(5); await measure('riding, third person');
    A.set('view', 'first');
    ok(maxC <= 150, 'the draw-call budget (about 150) holds at the worst case in third person: ' + maxC + ' ' + JSON.stringify(rows));
    ok(maxT <= 350000, 'the triangle budget (about 350k) holds at the worst case: ' + maxT + ' ' + JSON.stringify(rows));
    return { maxCalls: maxC, maxTris: maxT, rows };`, 800),
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(path.join(here, 'shots-phase8d.json'), JSON.stringify(tour, null, 1));
  console.log('wrote shots-phase8d.json', tour.length, 'steps');
}
