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
await B.talk('jeetu', ['Come with me'], { at: [-57.6, 88.4] });
return { ...${rep('Jeetu joined')}, calledBySong: sang, party: A.state().party };`;

const TARA = `
await B.go([[-55,84],[-55,78],[-41.5,78],[-41.5,84]]);
await B.talk('tara', ['B-positive'], { at: [-41.5, 87.4] });
return ${rep('blood given')};`;

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
await B.go([[-100,-40],[-80,-40],[-79,-45],[-80,-49.5],[-90,-50],[-70,-50]]);
await B.tab(); const asJeetu = G.party.active;
const ok = await B.read('ledger-boring');
await B.tab();
return { ok, asJeetu, ...${rep('ledger read as Jeetu')}, clues: [...G.fragments.clues] };`;

const EXIT_AND_HEAL = `
await B.go([[-80,-49.5],[-79,-45],[-79,-40],[-100,-40],[-110,-30],[-125,-28],[-133,-27],[-133,-12],[-133,-3],[-133,3]]);
const quay = ${rep('west quay')};
await B.go([[-110,3],[-75,3],[-75,30],[-60,40],[-52,40]]); await B.healUp();
return { quay, ...${rep('healed under the dead tree')}, inSun: A.state().world.inSun };`;

const TARA_WARN = `
await B.go([[-52,43],[-52,60],[-45,66],[-45,71.5],[-45,76],[-41.5,78],[-41.5,84]]);
await B.talk('tara', ['Show her the evidence'], { at: [-41.5, 87.4] });
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
await B.go([[172,-33],[190,-30],[205,-30]]);
return ${rep('on the Sunrise Bridge')};`;

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
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(path.join(here, 'shots-playthrough.json'), JSON.stringify(seed1, null, 1));
  console.log('wrote shots-playthrough.json', seed1.length, 'steps');
}
