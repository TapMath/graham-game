// The map's static knowledge of the city: what is walkable and solid on every level, the links between levels, the named places, and
// a few helpers the minimap, the full map and the warmth cue share. Pure data and arithmetic (no DOM, no three.js), built once from
// src/world/map.js, so it costs nothing per frame.
//
//   LEVELS, LEVEL_INFO                     'U' 'G' 'L1' 'L2' 'L3' and their names (English, Devanagari)
//   levelData(level)                       {walk[], solids[], streets[], shacks[], buildings[], links...} rectangles in world metres
//   PLACES                                 named places (districts, water, stations, story places) with `level`, a discovery radius and `show`
//   leadSpot(id)                           where one of Setu's leads (flags.setuLead / a trail clue) points: {x, y, z, level}
//   BOUNDS                                 the world rectangle the sheet covers
//   sunSources(world, level)               the shafts (daytime) or solar lamps (night) of one level
import { MAP, Y } from '../world/map.js';
import { levelAt } from '../world/levels.js';

export const LEVELS = ['U', 'G', 'L1', 'L2', 'L3'];
export const LEVEL_INFO = {
  U: { en: 'Underground', dev: 'भूमिगत', y: Y.U, note: 'Metro and service tunnels' },
  G: { en: 'Ground', dev: 'ज़मीन', y: Y.G, note: 'Streets and slums' },
  L1: { en: 'Walkways', dev: 'पैदल पुल', y: Y.L1, note: 'Skywalks and terraces' },
  L2: { en: 'Flyovers', dev: 'फ्लाईओवर', y: Y.L2, note: 'EEH roads' },
  L3: { en: 'Upper Decks', dev: 'ऊपरी डेक', y: Y.L3, note: 'New Wadala gardens' },
};
export const BOUNDS = { x0: -190, z0: -184, x1: 222, z1: 192 };
export const levelIndex = (l) => LEVELS.indexOf(l);

const rect = (x0, z0, x1, z1, extra) => ({ x0, z0, x1, z1, ...extra });
const V = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };

// ------------------------------------------------------------------------------------------------ per-level geometry
const cache = new Map();

/** Walkable rectangles, solid rectangles and the little details of one level. */
export function levelData(level) {
  if (cache.has(level)) return cache.get(level);
  const y = Y[level], M = MAP;
  const walk = [], solids = [], streets = [], shacks = [], buildings = [], zones = [], details = [];
  const covers = (t) => { const y0 = t.y0 ?? 0, top = y0 + t.h; return { y0, top }; };

  if (level === 'U') {
    for (const f of M.uFloors) walk.push(rect(f.x0, f.z0, f.x1, f.z1, { id: f.id, name: f.name, ramp: !!f.ramp, tracks: f.tracks, sump: f.sump }));
  } else {
    if (level === 'G') {
      walk.push(rect(M.land.minX, M.land.minZ, M.land.maxX, M.land.maxZ, { id: 'land', kind: 'land' }));
      for (const s of M.streets) streets.push(s.axis === 'z' ? rect(s.c - s.w / 2, s.from, s.c + s.w / 2, s.to, { id: s.id }) : rect(s.from, s.c - s.w / 2, s.to, s.c + s.w / 2, { id: s.id }));
      for (const z of M.zones) zones.push(z);
      for (const sh of M.slumShacks) shacks.push(rect(sh.x - sh.w / 2, sh.z - sh.d / 2, sh.x + sh.w / 2, sh.z + sh.d / 2));
      for (const b of M.buildings) buildings.push({ ...b });
    }
    for (const d of M.decks) if (d.level === level) walk.push(rect(d.x0, d.z0, d.x1, d.z1, { id: d.id, kind: d.kind, y: d.y, broken: d.broken }));
    for (const t of M.towers) {
      const { y0, top } = covers(t);
      if (t.roof && Math.abs(top - y) < 0.6) { walk.push(rect(t.x0, t.z0, t.x1, t.z1, { id: t.id, kind: t.roof.kind, name: t.name })); continue; }
      if (y0 <= y + 0.6 && top > y + 1.5) solids.push(rect(t.x0, t.z0, t.x1, t.z1, { id: t.id, name: t.name, h: t.h }));
    }
  }
  const out = { level, y, walk, solids, streets, shacks, buildings, zones, details };
  cache.set(level, out);
  return out;
}

// ------------------------------------------------------------------------------------------------ links between levels
const stairRect = (s) => {
  const run = s.run ?? 0.5, len = s.steps * run, ax = s.dir[1], sg = s.dir[0] === '-' ? -1 : 1, hw = s.width / 2;
  return ax === 'z'
    ? { x0: s.x - hw, x1: s.x + hw, z0: Math.min(s.z, s.z + sg * len), z1: Math.max(s.z, s.z + sg * len), ax: 0, az: sg }
    : { z0: s.z - hw, z1: s.z + hw, x0: Math.min(s.x, s.x + sg * len), x1: Math.max(s.x, s.x + sg * len), ax: sg, az: 0 };
};

/** Every stair, ramp and lift as a plan-view footprint with the levels it joins. */
export const LINKS = (() => {
  const out = [];
  for (const s of MAP.stairs) {
    const a = levelAt(s.y0), b = levelAt(s.y1);
    if (a === b && !s.net) continue;                  // (the Phase 9A flights between 12 and 18 stay on one level but are still stairs)
    const r = stairRect(s);
    out.push({ id: s.id, kind: 'stairs', lo: a, hi: b, ...r, w: s.width, gate: s.gate ?? null, maintenance: !!s.maintenance, footX: s.x, footZ: s.z, y0: s.y0, y1: s.y1 });
  }
  for (const r of MAP.ramps) {
    const ax = r.dir[1], sg = r.dir[0] === '-' ? -1 : 1;
    out.push({ id: r.id, kind: 'ramp', lo: levelAt(r.yLow), hi: levelAt(r.yHigh), x0: Math.min(r.x0, r.x1), x1: Math.max(r.x0, r.x1), z0: Math.min(r.z0, r.z1), z1: Math.max(r.z0, r.z1), ax: ax === 'x' ? sg : 0, az: ax === 'z' ? sg : 0, gate: null, y0: r.yLow, y1: r.yHigh });
  }
  for (const l of MAP.lifts) {
    const stops = (l.stops ?? [{ id: 'bottom', y: l.yBottom, exit: l.exits.bottom }, { id: 'top', y: l.yTop, exit: l.exits.top }]).map((s) => ({ ...s, level: s.level ?? levelAt(s.y) })).sort((p, q) => p.y - q.y);
    const [cx, cz] = l.center, [w, d] = l.size;
    out.push({ id: l.id, kind: 'lift', cls: l.class ?? 'family', label: l.label, x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2, cx, cz, stops, lo: stops[0].level, hi: stops[stops.length - 1].level, gate: l.gate ?? null, panel: l.panel });
  }
  return out;
})();
export const GATES = MAP.gates.map((g) => ({ ...g, level: levelAt(g.y), toLevel: g.level }));

export const linksAt = (level) => LINKS.filter((l) => (l.kind === 'lift' ? l.stops.some((s) => s.level === level) : l.lo === level || l.hi === level));
export const gatesAt = (level) => GATES.filter((g) => g.level === level);

/** The Harbour Line as map geometry (G only). */
export const RAIL = (() => {
  const R = MAP.rail;
  return {
    x0: R.x0, x1: R.x1, zc: R.zc, corridor: R.corridor, trackZ: [R.tracks.east.z, R.tracks.west.z], platforms: R.platforms, trainLen: R.trainLen,
    stations: R.stations.map((s) => ({ id: s.id, name: s.name, dev: s.dev, x: s.x, x0: s.x0, x1: s.x1, terminus: s.terminus ?? null })),
    crossings: R.crossings.map((c) => ({ id: c.id, x: c.x, w: c.w })),
  };
})();

// ------------------------------------------------------------------------------------------------ places
// `always`: shown on the full map from the start (districts, water, the stations: Mithi knows her city). The rest appear when the
// player has been near them or has learned of them (`known` is a flag on game.flags). `r` is the discovery radius in metres.
const S = MAP.story;
export const PLACES = [
  // ---- water and districts (always known)
  { id: 'mahim-bay', en: 'Mahim Bay', dev: 'माहीम खाड़ी', sub: 'the sea', x: -164, z: 24, level: 'G', kind: 'water', always: true, big: true },
  { id: 'mahim-creek', en: 'Mahim Creek', dev: 'माहीम क्रीक', x: -164, z: -112, level: 'G', kind: 'water', always: true },
  { id: 'mithi-river', en: 'Mithi River', dev: 'मीठी नदी', sub: 'the estuary', x: 20, z: 168, level: 'G', kind: 'water', always: true, big: true },
  { id: 'harbour', en: 'Mumbai Harbour', dev: 'मुंबई बंदरगाह', x: 196, z: 36, level: 'G', kind: 'water', always: true },
  { id: 'dharavi', en: 'Dharavi', dev: 'धारावी', sub: '90 Feet Road', x: -105, z: -86, level: 'G', kind: 'district', always: true, big: true },
  { id: 'kumbharwada', en: 'Kumbharwada', dev: 'कुंभारवाडा', x: -105, z: 86, level: 'G', kind: 'district', always: true },
  { id: 'matunga', en: 'Matunga', dev: 'माटुंगा', x: -45, z: 30, level: 'G', kind: 'district', always: true },
  { id: 'sion-junction', en: 'Sion Junction', dev: 'सायन जंक्शन', sub: 'SkyGrid', x: -45, z: -30, level: 'G', kind: 'district', always: true, big: true },
  { id: 'kings-circle', en: "King's Circle", dev: 'किंग्स सर्कल', x: 15, z: -30, level: 'L1', kind: 'district', always: true },
  { id: 'new-wadala', en: 'New Wadala', dev: 'न्यू वडाळा', sub: 'SURYA towers', x: 105, z: -126, level: 'L3', kind: 'district', always: true, big: true },
  { id: 'wadala', en: 'Wadala', dev: 'वडाळा', x: 75, z: 90, level: 'G', kind: 'district', always: true },
  { id: 'sewri', en: 'Sewri', dev: 'शिवडी', sub: 'waterfront', x: 148, z: -44, level: 'G', kind: 'district', always: true },
  { id: 'eeh', en: 'Eastern Express Highway', dev: 'पूर्व द्रुतगति मार्ग', x: 40, z: -176, level: 'G', kind: 'road', always: true },
  { id: 'cloverleaf', en: 'EEH Cloverleaf', dev: 'ई ई एच क्लोवरलीफ', x: -15, z: -60, level: 'L2', kind: 'road', always: true, big: true },
  { id: 'atal-setu', en: 'Atal Setu', dev: 'अटल सेतू', sub: 'to Nhava Sheva', x: 186, z: -56, level: 'L3', kind: 'bridge', always: true, big: true },
  { id: 'atal-setu-g', en: 'Atal Setu pier', dev: 'अटल सेतू', x: 168, z: -50, level: 'G', kind: 'bridge', always: true },
  // ---- places you find
  { id: 'rubble', en: 'The collapse', dev: 'ढहा हुआ पुल', x: -44, z: -30, level: 'G', kind: 'story', r: 30, always: true },
  { id: 'mithi-home', en: "Mithi's home", dev: 'घर', x: -94, z: -78, level: 'G', kind: 'story', r: 22, always: true },
  { id: 'hospital', en: 'Sion Hospital', dev: 'सायन अस्पताल', x: S.hospital.x, z: S.hospital.z + 8, level: 'G', kind: 'story', r: 26, always: true },
  { id: 'police', en: 'Sion Police Station', dev: 'सायन पुलिस', x: S.policeStation.x, z: S.policeStation.z, level: 'G', kind: 'story', r: 24, always: true },
  { id: 'metro', en: 'Dharavi Metro', dev: 'धारावी मेट्रो', sub: 'Aqua Line', x: 45, z: 8, level: 'G', kind: 'story', r: 30, always: true },
  { id: 'metro-u', en: 'Dharavi Metro', dev: 'धारावी मेट्रो', sub: 'Aqua Line', x: 45, z: 14, level: 'U', kind: 'story', r: 40 },
  { id: 'maintenance', en: 'Maintenance shaft', dev: 'रखरखाव', x: 52, z: -30, level: 'G', kind: 'story', r: 16, known: 'knowsShaft' },
  { id: 'lift-wreck', en: 'Wrecked lift car', dev: 'टूटी लिफ्ट', x: 55.5, z: -24, level: 'U', kind: 'story', r: 14 },
  { id: 'catacombs', en: 'Neeche Dharavi', dev: 'नीचे धारावी', sub: 'catacomb homes', x: -98, z: 22, level: 'U', kind: 'story', r: 26 },
  { id: 'boring', en: 'Mithi Line boring site', dev: 'मीठी लाइन', sub: "SURYA's deep tunnel", x: -80, z: -55, level: 'U', kind: 'story', r: 22 },
  { id: 'breach', en: 'Breach chamber', dev: 'दरार', x: -118, z: -38, level: 'U', kind: 'story', r: 24 },
  { id: 'clinic', en: "The doctor's clinic", dev: 'दवा', x: -21, z: 77, level: 'U', kind: 'story', r: 18 },
  { id: 'tents', en: 'Triage tents', dev: 'राहत शिविर', x: -46, z: 2, level: 'G', kind: 'story', r: 22 },
  { id: 'bazaar', en: "King's Circle Bazaar", dev: 'किंग्स सर्कल बाज़ार', x: 15, z: -30, level: 'L1', kind: 'story', r: 30 },
  { id: 'tree', en: 'The dead tree', dev: 'सूखा पेड़', x: -45, z: 36, level: 'G', kind: 'story', r: 20 },
  { id: 'control', en: 'MMRDA Control Tower', dev: 'आपदा नियंत्रण', x: 142, z: -94, level: 'L3', kind: 'story', r: 30 },
  { id: 'checkpoint', en: 'Atal Setu checkpoint', dev: 'अटल सेतू चौकी', x: 157, z: -30, level: 'L3', kind: 'story', r: 24 },
  { id: 'permit-gate', en: 'Permit gate', dev: 'परमिट गेट', x: 160, z: -39, level: 'G', kind: 'story', r: 18 },
];
for (const st of RAIL.stations) PLACES.push({ id: 'st-' + st.id, en: st.name, dev: st.dev, x: st.x, z: RAIL.zc, level: 'G', kind: 'station', always: true });

// ------------------------------------------------------------------------------------------------ Setu's leads
const TL = Object.fromEntries(MAP.setuTimeline.map((t) => [t.id, t]));
const LEAD_ALIAS = { vent: 'ventExit', tents: 'triageTents', contractor: 'boringSite' };
/** A lead id (flags.setuLead, or a trail clue's target) to a place on the map: {x, y, z, level, id}, or null. */
export function leadSpot(id) {
  if (!id) return null;
  const t = TL[LEAD_ALIAS[id] ?? id];
  return t ? { id: t.id, x: t.x, y: t.y, z: t.z, level: levelAt(t.y) } : null;
}

// ------------------------------------------------------------------------------------------------ objectives -> places
const POS = {
  hospital: { x: S.hospital.entrance.x, z: S.hospital.entrance.z, level: 'G' },
  tara: { x: S.hospital.taraRoom.x, z: S.hospital.taraRoom.z, level: 'G' },
  metro: { x: S.metro.entranceA.x, z: S.metro.entranceA.z, level: 'G' },
  shaft: { x: S.maintenanceShaft.top.x, z: S.maintenanceShaft.top.z, level: 'G' },
  police: { x: S.policeStation.entrance.x, z: S.policeStation.entrance.z, level: 'G' },
  control: { x: MAP.controlTowerTerminal.x, z: MAP.controlTowerTerminal.z, level: 'L3' },
  bridge: { x: MAP.sunriseBridgeEnd.x, z: MAP.sunriseBridgeEnd.z, level: 'L3' },
  permit: { x: 160, z: -39, level: 'G' },
  oldman: { x: -38.2, z: -26.3, level: 'G' },
  home: { x: S.mithiHome.x, z: S.mithiHome.z, level: 'G' },
};
/** The places an objective (by id, as in systems/story/chain.js) sends you to. */
export function objectiveSpots(id, flags = {}) {
  switch (id) {
    case 'collapse': return [{ ...POS.oldman, label: 'the old man' }];
    case 'hospital': return [{ ...POS.hospital, label: 'Sion Hospital' }];
    case 'below': return [{ ...POS.metro, label: 'Metro' }, { ...POS.shaft, label: 'shaft' }];
    case 'underground': case 'search': { const s = leadSpot(flags.setuLead); return s ? [{ ...s, label: 'last lead' }] : []; }
    case 'bridge': return flags.bridgePermit ? [{ ...POS.permit, label: 'permit gate' }, { ...POS.bridge, label: 'Atal Setu' }] : [{ ...POS.bridge, label: 'Atal Setu' }];
    case 'warn': return [{ ...POS.control, label: 'Control Tower' }, { ...POS.tara, label: 'Tara' }];
    case 'permit': case 'blood': return [{ ...POS.tara, label: 'Tara' }];
    case 'bail': return [{ ...POS.police, label: 'police station' }];
    default: return [];
  }
}

// ------------------------------------------------------------------------------------------------ sunlight
/** Shafts (day) or the solar lamps (night, Upper Decks only) of a level, as [{x, z, r, kind, id}]. */
export function sunSources(world, level) {
  const out = [];
  const I = world.sunShafts?.intensity ?? 0;
  if (I > 0.05) for (const s of world.sunShafts) if (s.level === level) out.push({ id: s.id, x: s.x, z: s.z, r: s.r, kind: 'shaft', i: I });
  if (I < 0.6 && level === 'L3') for (const l of world.solarLamps ?? MAP.solarLamps) out.push({ id: l.id, x: l.x, z: l.z, r: l.radius, kind: 'lamp', i: 1 - I });
  return out;
}

/** When the light comes and goes (game hours): from sky.js (full from 06:48 to 17:30, gone before 05:48 and after 18:42). */
export const SUN_HOURS = { rise: 5.8, full: 6.8, fade: 17.5, set: 18.7 };
export const sunFactorAt = (h) => (h < SUN_HOURS.rise || h >= SUN_HOURS.set ? 0 : h < SUN_HOURS.full ? (h - SUN_HOURS.rise) / (SUN_HOURS.full - SUN_HOURS.rise) : h < SUN_HOURS.fade ? 1 : 1 - (h - SUN_HOURS.fade) / (SUN_HOURS.set - SUN_HOURS.fade));
export const fmtHour = (h) => { const hh = Math.floor(((h % 24) + 24) % 24), mm = Math.round((h - Math.floor(h)) * 60); return String(mm === 60 ? (hh + 1) % 24 : hh).padStart(2, '0') + ':' + String(mm === 60 ? 0 : mm).padStart(2, '0'); };

export { V as DIRS };
