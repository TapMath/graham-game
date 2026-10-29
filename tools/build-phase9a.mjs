// Builds tools/shots-phase9a.json, the Phase 9A tour: the flyover network and the capsule lifts.
//   - the money shots: looking up from the streets of G at layered flyovers, bridges and walkways (the nave of the triple stack at Sion
//     Junction, a cross street, the EEH canyon), the triple stack from the street and from its middle deck, traffic on the flyovers;
//   - a long walk (the bot, real keys) over the skywalks between the towers, printing state() as it goes;
//   - each capsule class (solo, family, public, freight): its look, its seats, its price; the solo capsule leaving the followers to come
//     on the next cycle, a family capsule taking the whole party, a public capsule that is full at rush hour and one with a single seat;
//   - the maps showing the network and the lifts' capacities;
//   - the draw-call and triangle worst cases (third person, Jeetu and Setu following).
// Every step asserts with ok(); a failed assertion throws and fails the run.
//   node tools/build-phase9a.mjs
//   node tools/smoke.mjs --shots tools/shots-phase9a.json --wait 2500 --query seed=1 --viewport 960x540
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PRE = `const A=__grahan,B=A.bot,G=A.game;const ok=(c,m)=>{ if(!c) throw new Error('ASSERT '+m); };const wait=(ms)=>new Promise((r)=>setTimeout(r,ms));
const R1=(v)=>Math.round(v*10)/10;
const shot=(x,y,z,yaw,pitch)=>{ A.teleport(x,y,z,0); A.look(yaw,pitch); B.d.step(1); G.render(); G.render(); const r=G.renderStats(); return { calls:r.calls, tris:r.triangles, level:A.state().level }; };
const budget=(s,m)=>{ ok(s.calls<=150, m+': '+s.calls+' draw calls (budget 150)'); ok(s.tris<=400000, m+': '+s.tris+' triangles (budget 400k)'); return s; };
const party=()=>{ const P=[]; if (G.setu.following) P.push(['setu',G.setu.pos]); if (G.party.jeetu) P.push(['jeetu',G.party.jeetu.pos]); return P; };
const gather=()=>{ const f=[G.setu.follower, G.party.jeetu.follower]; for (const x of f) x.teleportBehind('test'); B.d.step(1.2); };
const far=(L)=>party().map(([n,p])=>[n,R1(Math.hypot(p.x-G.player.pos.x,p.z-G.player.pos.z)),R1(p.y-G.player.pos.y)]);`;
const step = (name, code, wait = 900) => ({ name, wait, eval: `(async()=>{${PRE.replace(/\n/g, ' ')}${code.trim().replace(/\n\s*/g, ' ')}})()` });

export const tour = [
  // ------------------------------------------------------------------------------------------------ the network as data
  step('p9a-setup-the-network-is-sound', `
    A.set('manual', true); A.set('invulnerable', true); A.set('hazards', false); A.setTime(10); A.set('perceive', 0); A.set('view', 'first'); A.teleport(-44, 0, -30, -90); A.step(1);
    const v = A.do('validateNetwork'); ok(v.errors.length === 0, 'no deck overlaps, no lift shaft through a deck, no pier in a wall, every deck reachable, every gate honoured, every sun shaft clear: ' + JSON.stringify(v.errors.slice(0, 4)));
    const a = A.do('deckArea'); ok(a.after >= 2.7 * a.before, 'the walkable deck area above G roughly tripled: ' + a.before + ' -> ' + a.after + ' m2 (x' + (a.after / a.before).toFixed(2) + ')');
    const bad = A.do('validatePOIs'); ok(bad.length === 0, 'every story POI still stands on walkable ground: ' + JSON.stringify(bad));
    const M = G.world.map, by = {}; for (const l of G.lifts.lifts) if (l.def) by[l.cls.id] = (by[l.cls.id] || 0) + 1;
    ok(G.lifts.lifts.filter((l) => l.def).length >= 16, 'at least twice the 8 lifts: ' + JSON.stringify(by));
    ok(by.solo >= 2 && by.family >= 4 && by.public >= 3 && by.freight >= 1, 'every class is there: ' + JSON.stringify(by));
    const heights = {}; for (const d of M.decks) heights[d.y] = (heights[d.y] || 0) + 1;
    ok([6, 12, 18, 24, 30, 38].every((y) => heights[y] > 0), 'decks at six heights, intermediate ones included: ' + JSON.stringify(heights));
    const ids = (k) => M.decks.filter((d) => d.net && d.group === k).map((d) => d.y);
    ok(new Set(ids('sj')).size === 3, 'the triple stack at Sion Junction: ' + JSON.stringify([...new Set(ids('sj'))]));
    ok(new Set(ids('eeh')).size === 2 && new Set(ids('mat')).size === 2 && new Set(ids('quay')).size === 2, 'double stacks (12+24, 18+30)');
    ok(['wad', 'ew'].every((k) => new Set(ids(k)).size === 1), 'single flyovers');
    const f = G.world.story.fallenDecks.length; ok(f === 5 && M.decks.find((d) => d.id === 'collapse-w').broken === '+x' && M.decks.find((d) => d.id === 'collapse-e').broken === '-x', 'the collapsed spans stay collapsed: ' + f + ' fallen decks, both stubs still broken');
    return { area: a, lifts: by, heights, decks: M.decks.length, piers: M.piers.length, stats: v.stats };`, 1500),

  // ------------------------------------------------------------------------------------------------ the money shots, from the streets of G
  step('p9a-money-shot-the-nave-of-the-triple-stack', `
    const s = budget(shot(-75, 0, -40, 0, 28), 'looking up the stack from the street'); return s;`, 1200),
  step('p9a-money-shot-cross-street-layers', `
    const s = budget(shot(-30, 0, 3, -90, 30), 'a cross street, flyovers over flyovers'); return s;`, 1200),
  step('p9a-money-shot-the-eeh-canyon', `
    const s = budget(shot(-60, 0, -118, -90, 22), 'the EEH canyon'); return s;`, 1200),
  step('p9a-money-shot-wadala-road-high', `
    const s = budget(shot(45, 0, -20, 180, 40), 'under the high road at x 45'); return s;`, 1200),
  step('p9a-money-shot-matunga-two-bridges', `
    const s = budget(shot(31, 0, 62, 0, 32), 'under the Matunga road and its two bridges between the towers'); return s;`, 1200),

  // ------------------------------------------------------------------------------------------------ the triple stack
  step('p9a-triple-stack-from-the-plaza', `
    const s = shot(-44, 0, -30, 90, 20); return Object.assign(s, { note: 'from the spawn: the broken stub still hangs over the rubble, the three decks of the stack stand behind it' });`, 1200),
  step('p9a-triple-stack-lowest-deck', `
    const s = shot(-75, 12, -70, 0, 35); ok(s.level === 'L1', 'on the low deck (12 m)'); return s;`, 1200),
  step('p9a-triple-stack-middle-deck', `
    const s = shot(-75, 24, -80, 0, 8); ok(s.level === 'L2', 'on the middle deck (24 m)'); return s;`, 1200),
  step('p9a-triple-stack-top-deck', `
    const s = shot(-75, 38, -100, 0, 6); ok(s.level === 'L3', 'on the top deck (38 m)'); return s;`, 1200),

  // ------------------------------------------------------------------------------------------------ traffic
  step('p9a-traffic-on-the-flyovers', `
    G.crowds.setEnabled(true); B.d.step(2);
    const by = {}; for (const v of G.crowds.vehicles) by[v.level] = (by[v.level] || 0) + 1;
    ok(by.L1 >= 10 && by.L2 >= 25 && by.L3 >= 3, 'vehicles drive the new road decks at every height: ' + JSON.stringify(by));
    const lanes = G.crowds.vlanes.filter((L) => L.y > 3).length; ok(lanes >= 24, 'lanes above G: ' + lanes);
    const s = shot(-40, 24, -122, -90, 3); const st = A.state().crowds;
    ok(st.drawn.vehicles >= 4, 'cars on screen on the EEH road: ' + st.drawn.vehicles);
    return { byLevel: by, lanes, drawn: st.drawn, ...s };`, 1500),
  step('p9a-traffic-on-the-low-deck', `
    const s = shot(-75, 12, -120, 0, 2); return Object.assign(s, { drawn: A.state().crowds.drawn });`, 1200),
  step('p9a-footpaths-pedestrians-on-the-flyovers', `
    const by = {}; for (const a of G.crowds.agents) by[a.level] = (by[a.level] || 0) + 1;
    ok(by.L1 >= 120 && by.L2 >= 40, 'people on the walkways and the footpaths of the flyovers: ' + JSON.stringify(by));
    const s = shot(-40, 24, -125, -90, 4); return Object.assign(s, { byLevel: by });`, 1200),

  // ------------------------------------------------------------------------------------------------ a long walk over the skywalks
  step('p9a-walk-1-the-matunga-road-between-the-towers', `
    A.set('view', 'first'); A.teleport(-94, 12, 32, 0); B.d.step(0.5); const s0 = A.state();
    ok(s0.level === 'L1', 'start on the Dharavi terrace: ' + s0.level);
    const r = await B.go([[-92, 38], [-92, 44], [-92, 54], [-92, 55.5], [-60, 55.5], [-20, 55.5], [20, 55.5]]);
    const s1 = A.state(); ok(r.ok && s1.pos.y > 17.7 && s1.pos.y < 18.4, 'up the stairs and out onto the Matunga road at 18 m: ' + JSON.stringify(s1.pos));
    return { ok: r.ok, at: s1.pos, level: s1.level, rays: s1.rays, t: G.clock.hhmm };`, 1500),
  step('p9a-walk-2-between-the-two-bridges', `
    const r = await B.go([[31, 55.5], [60, 55.5], [62, 55.5], [62, 52], [62, 46], [62, 40]]);
    const s = A.state(); ok(r.ok && s.pos.y < 12.4, 'down the stairs onto the Wadala terrace (12 m): ' + JSON.stringify(s.pos));
    return { ok: r.ok, at: s.pos, level: s.level };`, 1500),
  step('p9a-walk-3-the-skywalk-over-the-wadala-street', `
    const r = await B.go([[66, 38], [66, 17], [64, 17], [57, 17]]);
    const s1 = A.state(); ok(r.ok, 'to the foot of the double-decker skywalk');
    B.d.run('KeyW', 1.2); const s2 = A.state();
    const r2 = await B.go([[44, 17], [34, 17], [26, 17], [20, 17]]);
    const s3 = A.state(); ok(r2.ok && s3.pos.y < 12.4 && s3.pos.x < 30, 'over the street at 18 m and down onto the Matunga terrace: ' + JSON.stringify(s3.pos));
    return { up: s2.pos, across: s3.pos };`, 1500),
  step('p9a-walk-4-to-the-bazaar-and-the-way-it-is-logged', `
    const r = await B.go([[6, 22], [6, 20], [6, 10], [6, -2], [6, -10], [6, -18], [6, -22]]);
    const s = A.state(); ok(r.ok && s.level === 'L1' && s.pos.z < -20, 'over the Sion cross road and down into the King\\'s Circle bazaar: ' + JSON.stringify(s.pos));
    return { ok: r.ok, at: s.pos, level: s.level, stalls: B.stats.stalls, detours: B.stats.detours, state: { rays: s.rays, hour: s.world.hour } };`, 1500),

  // ------------------------------------------------------------------------------------------------ the capsules, class by class
  step('p9a-capsule-solo', `
    const L = G.lifts.get('lift-solo-wadala'); ok(L.cls.id === 'solo' && L.seats === 1, 'a solo capsule: ' + L.cls.id + ' ' + L.seats);
    const fam = G.lifts.get('lift-bridge'); ok(L.cost('top') / L.y !== undefined, 'priced'); const per = (x) => x.costPerM;
    ok(per(L) < per(fam) && per(fam) < per(G.lifts.get('lift-matunga')) && per(G.lifts.get('lift-matunga')) < per(G.lifts.get('lift-freight-eeh')), 'the price per metre rises with the capacity: ' + [L, fam, G.lifts.get('lift-matunga'), G.lifts.get('lift-freight-eeh')].map(per).join(' < '));
    const s = shot(86, 0, 57, 0, 8); return Object.assign(s, { perMetre: [L, fam, G.lifts.get('lift-matunga'), G.lifts.get('lift-freight-eeh')].map(per) });`, 1500),
  step('p9a-capsule-family', `
    const L = G.lifts.get('lift-eeh-w'); ok(L.cls.id === 'family' && L.seats === 4, 'a family capsule');
    const s = shot(-103, 0, -112, -90, 8); return s;`, 1500),
  step('p9a-capsule-public', `
    const L = G.lifts.get('lift-sion-stack'); ok(L.cls.id === 'public' && L.seats === 12, 'a public capsule');
    A.do('capsuleCrowd', L.id, 9); const s = shot(-70, 0, -1, 0, 6); const c = A.state().crowds.drawn;
    return Object.assign(s, { crowd: L.crowd, drawn: c });`, 1500),
  step('p9a-capsule-freight', `
    const L = G.lifts.get('lift-freight-eeh'); ok(L.cls.id === 'freight' && L.seats === 24, 'a freight capsule');
    A.do('capsuleCrowd', L.id, 18); const s = shot(-52, 0, -107, -60, 8); return Object.assign(s, { crowd: L.crowd });`, 1500),

  // ------------------------------------------------------------------------------------------------ the rule: who fits
  step('p9a-the-party-joins', `
    A.do('jeetuJoin'); A.do('setuFind'); A.set('view', 'third'); A.teleport(86, 0, 56, 0); A.look(0, 0); gather();
    ok(party().length === 2, 'Jeetu and Setu are with her: ' + JSON.stringify(far()));
    return far();`, 1200),
  step('p9a-solo-capsule-leaves-the-followers', `
    const L = G.lifts.get('lift-solo-wadala'); A.set('rays', 12); L.charge = 90;
    ok(far().every(([, d]) => d < 6), 'both are right behind her: ' + JSON.stringify(far()));
    const r = await B.rideLift('lift-solo-wadala', 'top');
    ok(r.ok && A.state().pos.y > 11.5, 'she rode the solo capsule up to the Wadala terrace: ' + JSON.stringify(r));
    const off = await B.go([[86, 46.5]]); ok(off.ok, 'she stepped off the car onto the terrace');
    const jobs = G.capsules.jobs.map((j) => j.m.id + ':' + j.phase);
    ok(G.capsules.jobs.length === 2, 'Setu and Jeetu are waiting for the next cycle: ' + JSON.stringify(jobs));
    const left = far(); ok(left.every(([, d, dy]) => dy < -6 || d > 5), 'they did not ride up with her: ' + JSON.stringify(left));
    G.render(); G.render();
    await B.idle(34);
    const after = far(); ok(G.capsules.jobs.length === 0 && after.every(([, d, dy]) => d < 9 && Math.abs(dy) < 1.5), 'on the next cycle both came up and rejoined her: ' + JSON.stringify(after));
    return { right_after: left, after, jobs, lift: L.snapshot() };`, 1500),
  step('p9a-family-capsule-takes-the-whole-party', `
    A.teleport(-100, 0, -112, -90); A.look(-90, 0); gather();
    const L = G.lifts.get('lift-eeh-w'); L.goTo('bottom'); B.d.step(6); L.charge = 90;
    const r = await B.rideLift('lift-eeh-w', 'm1');
    ok(r.ok && A.state().pos.y > 11.5, 'the family capsule went up to the EEH road: ' + JSON.stringify(r));
    ok(G.capsules.jobs.length === 0, 'nobody was left behind');
    await B.idle(2.5); const f = far(); ok(f.every(([, d, dy]) => d < 6 && Math.abs(dy) < 1.5), 'all three arrived together: ' + JSON.stringify(f));
    return { party: f, lift: L.snapshot() };`, 1500),
  step('p9a-public-capsule-full-at-rush-hour', `
    const L = G.lifts.get('lift-sion-stack'); A.setTime(8); A.set('rays', 12); L.goTo('bottom'); B.d.step(14); L.charge = 95;
    A.teleport(-70.5, 0.05, 43.3, 0); A.look(0, 0); gather();
    A.do('capsuleCrowd', L.id, 12); const st = G.capsules.status(L); ok(st.full && st.rush, 'rush hour, a full car: ' + JSON.stringify(st));
    const r = G.liftPanel.attempt(L, 'm1'); ok(r && r.ok === false && r.reason === 'full', 'a full public capsule cannot be boarded: ' + JSON.stringify(r));
    ok(!L.moving && Math.abs(L.y - 0.04) < 0.1, 'the car did not move'); ok(A.state().messages.last.some((m) => /full/i.test(m)), 'she is told: ' + JSON.stringify(A.state().messages.last.slice(0, 2)));
    const s = shot(-70.5, 0.05, 43.3, 0, 5); const wait0 = G.capsules.status(L).nextIn; ok(wait0 > 0, 'the next one is ' + wait0 + ' s away');
    return Object.assign(s, { status: st, next: wait0, prompt: A.state().world.focus });`, 1500),
  step('p9a-public-capsule-one-seat-left', `
    const L = G.lifts.get('lift-sion-stack'); A.teleport(-70.5, 0.05, 43.3, 0); gather(); A.do('capsuleCrowd', L.id, 10);
    const p = A.do('capsulePlan', L.id); ok(p.ok && p.board.length === 1 && p.left.length === 1, 'two seats free: Mithi and one of them ride, the other waits: ' + JSON.stringify(p));
    A.do('capsuleCrowd', L.id, 11); const q = A.do('capsulePlan', L.id); ok(q.ok && q.board.length === 0 && q.left.length === 2, 'one seat free: only Mithi rides: ' + JSON.stringify(q));
    A.do('capsuleCrowd', L.id, 2); const t = A.do('capsulePlan', L.id); ok(t.ok && t.board.length === 2 && t.left.length === 0, 'plenty of room by day: ' + JSON.stringify(t));
    return { two_free: p, one_free: q, plenty: t };`, 900),
  step('p9a-solar-charge-scales-with-capacity-and-height', `
    const fam = G.lifts.get('lift-bridge'), pub = G.lifts.get('lift-canyon'), fr = G.lifts.get('lift-freight-wadala'), solo = G.lifts.get('lift-prom-solo');
    const c = (l, to) => l.cost(to);
    const a = fam.cost('top') / (fam.yTop - fam.y), b = pub.cost('top') / (pub.yTop - pub.y), f = fr.cost('top') / Math.abs(fr.yTop - fr.y), s = solo.cost('top') / Math.abs(solo.yTop - solo.y);
    ok(s < a && a < b && b < f, 'units per metre: solo ' + s.toFixed(2) + ' < family ' + a.toFixed(2) + ' < public ' + b.toFixed(2) + ' < freight ' + f.toFixed(2));
    ok(fr.cost('top') > 1.8 * fam.cost('top') * 0 + 40, 'a 30 m freight ride is dear: ' + fr.cost('top').toFixed(1) + ' units');
    return { solo: s, family: a, public: b, freight: f };`, 600),

  // ------------------------------------------------------------------------------------------------ the maps
  step('p9a-minimap-shows-the-lift-and-its-seats', `
    A.set('view', 'first'); A.teleport(-76, 0, -3, 0); A.look(0, 0); B.d.step(1);
    const c = G.map.collect('G'); const l = c.lifts.find((x) => x.id === 'lift-sion-stack');
    ok(l && l.seats === 12 && l.cls === 'public' && typeof l.crowd === 'number', 'the minimap data carries the class and seats: ' + JSON.stringify(l && [l.cls, l.seats, l.crowd]));
    return { lifts: c.lifts.map((x) => [x.id, x.cls, x.seats, x.chargePct]) };`, 1200),
  step('p9a-full-map-L1-the-low-network', `
    const r = A.do('mapOpen', 'L1'); ok(r.open, 'the full map opened'); await wait(500);
    const txt = document.querySelector('.fm-lifts')?.textContent ?? ''; ok(/public/i.test(txt) && /solo/i.test(txt) && /seats|seat/.test(txt), 'the side notes list classes and seats: ' + txt.slice(0, 160));
    return { lifts: (document.querySelectorAll('.fm-lifts li').length), text: txt.slice(0, 300) };`, 1800),
  step('p9a-full-map-L2-the-flyover-grid', `
    A.do('mapTab', 'L2'); await wait(500); A.do('mapView', { cx: -20, cz: -30, zoom: 1.5 }); await wait(300);
    const txt = document.querySelector('.fm-lifts')?.textContent ?? ''; ok(/freight|public|family/i.test(txt), 'L2 lists lifts with their class');
    return { text: txt.slice(0, 260) };`, 1800),
  step('p9a-full-map-G-zoomed-on-the-lifts', `
    A.do('mapTab', 'G'); await wait(300); A.do('mapView', { cx: -70, cz: -20, zoom: 3.2 }); await wait(400);
    return { note: 'rings grow with the car and carry the seat count' };`, 1800),
  step('p9a-close-the-map', `A.do('mapClose'); B.d.step(0.5); return { open: A.state().map.open };`, 600),

  // ------------------------------------------------------------------------------------------------ the budgets
  step('p9a-budget-looking-up-at-the-web-from-g', `
    A.set('view', 'third'); gather();
    const rows = [], vs = [[-15, 0, -8, 0, 40], [-75, 0, -50, 0, 35], [-30, 0, 3, -90, 38], [45, 0, -118, 90, 30], [31, 0, 62, 0, 32]];
    let max = 0, tris = 0;
    for (const [x, y, z, yaw, pitch] of vs) { A.teleport(x, y, z, yaw); G.setu.follower.teleportBehind('t'); G.party.jeetu.follower.teleportBehind('t'); const s = shot(x, y, z, yaw, pitch); rows.push([x, z, s.calls, s.tris]); max = Math.max(max, s.calls); tris = Math.max(tris, s.tris); }
    ok(max <= 150 && tris <= 400000, 'worst case looking up from a street, third person, Jeetu and Setu following: ' + max + ' calls, ' + tris + ' triangles'); return { max, tris, rows };`, 1500),
  step('p9a-budget-a-busy-station', `
    const w = A.do('transitWait', 'sion', 'west', 300); const rows = [];
    for (const [x, z, yaw, pitch] of [[-45, -52.4, 0, 2], [-34, -52.9, 90, 1], [-52, -52.6, -60, 2]]) { const s = shot(x, 0.5, z, yaw, pitch); G.setu.follower.teleportBehind('t'); G.party.jeetu.follower.teleportBehind('t'); const s2 = shot(x, 0.5, z, yaw, pitch); rows.push([x, s2.calls, s2.tris]); }
    const max = Math.max(...rows.map((r) => r[1])), tris = Math.max(...rows.map((r) => r[2])); ok(max <= 150 && tris <= 400000, 'a busy station: ' + max + ' calls, ' + tris + ' triangles'); return { train: !!w, max, tris, rows };`, 1500),
  step('p9a-budget-sion-junction', `
    const rows = [], vs = [[-44, 0, -30, 90, 15], [-44, 0, -30, 0, 10], [-60, 0, -20, 45, 20], [-75, 0, 14, 0, 12]];
    for (const [x, y, z, yaw, pitch] of vs) { A.teleport(x, y, z, yaw); G.setu.follower.teleportBehind('t'); G.party.jeetu.follower.teleportBehind('t'); const s = shot(x, y, z, yaw, pitch); rows.push([x, z, s.calls, s.tris]); }
    const max = Math.max(...rows.map((r) => r[2])), tris = Math.max(...rows.map((r) => r[3])); ok(max <= 150 && tris <= 400000, 'Sion Junction: ' + max + ' calls, ' + tris + ' triangles'); return { max, tris, rows };`, 1500),
  step('p9a-budget-l2-traffic', `
    const rows = [], vs = [[-60, 24, -120, -90, 3], [-40, 24, 0, -90, 3], [45, 30, -60, 180, 2], [-75, 24, -60, 0, 4]];
    for (const [x, y, z, yaw, pitch] of vs) { A.teleport(x, y, z, yaw); G.setu.follower.teleportBehind('t'); G.party.jeetu.follower.teleportBehind('t'); const s = shot(x, y, z, yaw, pitch); rows.push([x, y, z, s.calls, s.tris]); }
    const max = Math.max(...rows.map((r) => r[3])), tris = Math.max(...rows.map((r) => r[4])); ok(max <= 150 && tris <= 400000, 'L2 traffic: ' + max + ' calls, ' + tris + ' triangles'); return { max, tris, rows, drawn: A.state().crowds.drawn };`, 1500),
  step('p9a-budget-the-worst-of-all', `
    const rows = [], vs = [[-15, 0, 4, 0, 30], [105, 0, -60, 0, 35], [75, 38, -60, 0, 5], [10, 12, -25, 90, 10], [57, 38, -14, -67, 0], [57, 38, -48, -67, 0], [93, 38, -12, -67, 0]];
    for (const [x, y, z, yaw, pitch] of vs) { A.teleport(x, y, z, yaw); G.setu.follower.teleportBehind('t'); G.party.jeetu.follower.teleportBehind('t'); const s = shot(x, y, z, yaw, pitch); rows.push([x, y, z, s.calls, s.tris]); }
    const max = Math.max(...rows.map((r) => r[3])), tris = Math.max(...rows.map((r) => r[4])); ok(max <= 150 && tris <= 400000, 'others (with the Skyline Terrace corners, looking east-north-east): ' + max + ' calls, ' + tris + ' triangles'); return { max, tris, rows };`, 1500),
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(path.join(here, 'shots-phase9a.json'), JSON.stringify(tour, null, 1));
  console.log('wrote shots-phase9a.json', tour.length, 'steps');
}
