// Self-check of the Phase 9A flyover network (no browser needed):  node tools/check-network.mjs [--plan out.json]
// Prints overlaps, headroom problems, lift shafts through decks, piers inside things, unreachable decks and gate-rule breaks, then the numbers.
import { MAP } from '../src/world/map.js';
import { validateNetwork, deckArea, routeGraph } from '../src/world/netcheck.js';

const r = validateNetwork(MAP);
for (const e of r.errors) console.log('ERROR  ', e);
for (const w of r.warnings) console.log('warning', w);
const byClass = {}; for (const l of MAP.lifts) byClass[l.class ?? 'family'] = (byClass[l.class ?? 'family'] ?? 0) + 1;
const g = routeGraph(MAP), reach = g.reach(12);
console.log(JSON.stringify({
  errors: r.errors.length, warnings: r.warnings.length, decks: MAP.decks.length, piers: MAP.piers.length, lifts: MAP.lifts.length, liftsByClass: byClass,
  stairs: MAP.stairs.length, ramps: MAP.ramps.length, gates: MAP.gates.length, deckAreaM2: Math.round(deckArea(MAP)), reachable: `${reach.size}/${g.nodes.length}`,
  trafficLanes: MAP.trafficLanes.length, walkLanes: MAP.walkLanes.length,
}, null, 1));
process.exit(r.errors.length ? 1 : 0);
