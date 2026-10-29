// The flyover network of Phase 9A, as data. `buildNetwork(W)` takes the working map (the base city's towers, decks, stairs, ramps, lifts,
// gates, buildings and rail, see map.js) and returns what it adds:
//
//   decks[]       road flyovers (single, double and triple stacks on shared piers), skywalks, bridges and catwalks. Every new deck has
//                 `net: true`, `vault: true` (ribbed-vault underside), and roads a `lane` axis and `footpath: true`.
//   piers[]       the tall columns the roads stand on: {id, x, z, hx, hz, y0, y1, caps:[{y, nx, nz}]} (nx, nz: the way to the deck)
//   stairs[] ramps[] lifts[] gates[]    the flights, ramps, capsule lifts and health gates that join them to the rest of the city
//   trafficLanes[] walkLanes[]          where the traffic drives and the pedestrians walk (src/systems/crowds reads them)
//
// Heights. The layers of the old city (G 0, L1 12, L2 24, L3 38) gain the in-between 6, 18 and 30: a deck at 6 is a low flyover, 18 and 30
// sit between the old levels. `levelAt` puts 18 on L1 (free), 30 on L2 (bio-scan 5 rays) and 38 on L3 (8 rays); every way from a free
// layer into a gated one passes a gate (stairs) or a lift stop with a `min`. `node tools/check-network.mjs` proves all of it.
import { levelAt } from './levels.js';
import { subtractRects, solidBoxes } from './netcheck.js';
import { LIFT_CLASSES } from './lift-classes.js';

const r2 = (n) => Math.round(n * 100) / 100;
const DIRV = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };
const OPP = { '+x': '-x', '-x': '+x', '+z': '-z', '-z': '+z' };

export function buildNetwork(W) {
  const out = { decks: [], piers: [], stairs: [], ramps: [], lifts: [], gates: [], trafficLanes: [], walkLanes: [], links: [] };
  W.piers = [];
  const known = () => ({ ...W, decks: W.decks, piers: W.piers });

  // ----------------------------------------------------------------------------------------------- decks
  /** One deck (a rect at a height). Pieces never overlap another deck at the same height (the caller splits them). */
  const deck = (d) => {
    const rec = {
      level: levelAt(d.y), th: d.kind === 'road' ? 1.2 : d.kind === 'catwalk' ? 0.4 : 0.8, kind: 'walkway', pillars: false, net: true, vault: true,
      ...d,
    };
    W.decks.push(rec); out.decks.push(rec);
    return rec;
  };
  /** A straight strip at one or more heights; each height is cut where another deck at that height already stands (the junctions). */
  const strip = (s) => {
    const { id, axis, c, w, a0, a1, levels, kind = 'road', th = kind === 'road' ? 1.2 : 0.8, group = id, name } = s;
    const base = axis === 'x' ? { x0: a0, x1: a1, z0: c - w / 2, z1: c + w / 2 } : { x0: c - w / 2, x1: c + w / 2, z0: a0, z1: a1 };
    const made = [];
    for (const y of levels) {
      const same = W.decks.filter((d) => Math.abs(d.y - y) < 0.02);
      const pieces = subtractRects(base, same, 1.5).filter((p) => (axis === 'x' ? p.x1 - p.x0 : p.z1 - p.z0) > 2.5);
      pieces.forEach((p, i) => made.push(deck({ id: `${id}-${y}${pieces.length > 1 ? '-' + String.fromCharCode(97 + i) : ''}`, ...p, y, th, kind, lane: kind === 'road' ? axis : undefined, footpath: kind === 'road', group, name, strip: id, ...(s.brokenA && Math.abs((axis === 'x' ? p.x0 : p.z0) - a0) < 0.01 ? { broken: s.brokenA } : {}) })));
    }
    // lanes: two carriageway lanes (one each way) and a footpath lane each side, per height
    const wl = w / 2 - 1.9;
    for (const y of levels) {
      const lv = levelAt(y);
      if (kind === 'road') {
        for (const [k, sg] of [[0, 1], [1, -1]]) {
          const lat = c + sg * wl / 2 * 1.0, A = s.laneA0 ?? a0 + 1.5, B = a1 - 1.5;
          out.trafficLanes.push({ id: `${id}-${y}-t${k}`, ...(axis === 'x' ? { ax: sg > 0 ? A : B, az: lat, bx: sg > 0 ? B : A, bz: lat } : { ax: lat, az: sg > 0 ? A : B, bx: lat, bz: sg > 0 ? B : A }),
            y, level: lv, spacing: y >= 36 ? 64 : y >= 28 ? 46 : 40, jam: 0.3, buses: y < 36 });
        }
      }
      const walkN = Math.max(2, Math.round((a1 - a0) / 70));
      for (const [k, sg] of [[0, 1], [1, -1]]) {
        const lat = c + sg * (w / 2 - 0.95);
        out.walkLanes.push({ id: `${id}-${y}-w${k}`, ...(axis === 'x' ? { ax: a0 + 1, az: lat, bx: a1 - 1, bz: lat } : { ax: lat, az: a0 + 1, bx: lat, bz: a1 - 1 }), y, level: lv, n: kind === 'road' ? Math.max(2, Math.round(walkN * (y >= 36 ? 0.6 : 0.8))) : 2, speedMul: 1.1, rich: y >= 36, spread: 0.4 });
      }
    }
    return { ...s, made };
  };

  // ----------------------------------------------------------------------------------------------- stairs and gates
  const flight = (f) => {
    const { id, x, z, dir, y0, y1, width = 4, gate = null, tone, run } = f;
    const steps = Math.round((y1 - y0) / 0.3);
    const rec = { id, from: levelAt(y0), to: levelAt(y1), x, z, y0, y1, dir, width, steps, hollow: 0.9, net: true, ...(run ? { run } : {}) };
    if (gate) {
      rec.gate = gate.id;
      const v = DIRV[dir], gx = x - v[0] * 1.5, gz = z - v[1] * 1.5;
      out.gates.push({ id: gate.id, min: gate.min, x: r2(gx), y: y0, z: r2(gz), axis: v[0] ? 'z' : 'x', width, inside: dir, route: id, level: levelAt(y1), net: true });
      W.gates.push(out.gates[out.gates.length - 1]);
    }
    rec.tone = tone ?? (gate ? (gate.min >= 8 ? 'gate8' : 'gate5') : 'free');
    if (gate) rec.sign = gate.min >= 8 ? 'UPPER DECKS' : 'FLYOVERS';
    W.stairs.push(rec); out.stairs.push(rec);
    return rec;
  };
  const ramp = (r) => {
    const rec = { id: r.id, from: levelAt(r.yLow), to: levelAt(r.yHigh), x0: r.x0, z0: r.z0, x1: r.x1, z1: r.z1, dir: r.dir, yLow: r.yLow, yHigh: r.yHigh, tone: r.tone ?? 'free', sign: r.sign ?? 'WALKWAYS', net: true, bottom: r.bottom };
    W.ramps.push(rec); out.ramps.push(rec);
    return rec;
  };

  // ----------------------------------------------------------------------------------------------- capsule lifts
  const lift = (l) => {
    const cls = LIFT_CLASSES[l.cls];
    const size = l.size ?? cls.size;
    const stops = l.stops.map((s, i) => ({
      id: l.stops.length === 2 ? (i ? 'top' : 'bottom') : i === 0 ? 'bottom' : i === l.stops.length - 1 ? 'top' : 'm' + i,
      y: s.y, exit: s.exit, name: s.name, level: levelAt(s.y), ...(s.min ? { min: s.min } : {}),
    }));
    const top = stops[stops.length - 1];
    const rec = {
      id: l.id, center: l.at, size, yBottom: stops[0].y, yTop: top.y, exits: { bottom: stops[0].exit, top: top.exit }, tone: l.tone ?? (top.min >= 8 ? 'gate8' : top.min >= 5 ? 'gate5' : 'free'),
      label: l.label, panel: l.panel ?? (top.y >= 30 ? 'sun' : 'shade'), start: l.start ?? 0.85, stops, class: l.cls, capsule: true, net: true, back: l.back ?? null,
      ...(l.rails === false ? { rails: false } : {}),
    };
    W.lifts.push(rec); out.lifts.push(rec);
    return rec;
  };

  // ----------------------------------------------------------------------------------------------- piers
  // places on the ground no pier may stand on or beside: the story's spots, the Metro's canopies, the triage tents and the rubble field
  const keepRects = [{ x0: -64, z0: -9, x1: -30, z1: 6 }, { x0: -66, z0: -46, x1: -26, z1: -14 }, { x0: 38, z0: -22, x1: 52, z1: -3 }, { x0: 38, z0: 49, x1: 52, z1: 68 }];
  const keepPts = [...(W.pois ?? []), W.spawn];
  const pierAt = (id, x, z, hx, hz, y1, caps, group) => {
    const L = W.land;
    if (keepRects.some((r) => x + hx > r.x0 && x - hx < r.x1 && z + hz > r.z0 && z - hz < r.z1)) return null;
    if (keepPts.some((q) => q && (q.y ?? 0) < 3 && Math.hypot(q.x - x, q.z - z) < hx + 2.4)) return null;
    if (x - hx < L.minX + 0.2 || x + hx > L.maxX - 0.2 || z - hz < L.minZ + 0.2 || z + hz > L.maxZ - 0.2) return null;
    const box = { id, kind: 'pier', x0: x - hx, x1: x + hx, z0: z - hz, z1: z + hz, y0: 0, y1 };
    for (const o of solidBoxes(known())) {
      if (o.x0 >= box.x1 - 0.02 || o.x1 <= box.x0 + 0.02 || o.z0 >= box.z1 - 0.02 || o.z1 <= box.z0 + 0.02) continue;
      if (o.y0 >= box.y1 - 0.02 || o.y1 <= box.y0 + 0.02) continue;
      if (o.kind === 'rail' && o.id.startsWith('platform') === false && false) continue;
      return null;
    }
    const p = { id, x: r2(x), z: r2(z), hx, hz, y0: 0, y1: r2(y1), caps, group };
    W.piers.push(p); out.piers.push(p);
    return p;
  };
  /** Piers along a strip, both sides, 18 m apart, taller for stacks; positions that would stand in something are dropped. */
  const piersFor = (s, { every = 18, start = 8, lat } = {}) => {
    const { id, axis, c, w, a0, a1, levels, skip = [], th = s.kind && s.kind !== 'road' ? 0.8 : 1.2 } = s;
    const topY = Math.max(...levels), yTop = topY - th, off = lat ?? w / 2 + 1.4;
    const hx = Math.min(0.95, 0.55 + yTop / 90), n = [];
    let k = 0;
    for (let a = a0 + start; a < a1 - 3; a += every, k++) {
      if (skip.some(([p, q]) => a > p && a < q)) continue;
      for (const sg of [-1, 1]) {
        const x = axis === 'x' ? a : c + sg * off, z = axis === 'x' ? c + sg * off : a;
        const caps = levels.map((y) => ({ y: r2(y - th), nx: axis === 'x' ? 0 : -sg, nz: axis === 'x' ? -sg : 0, reach: r2(off - w / 2 + 0.15) }));
        const p = pierAt(`${id}-p${k}${sg > 0 ? 'b' : 'a'}`, x, z, hx, hx, yTop, caps, id);
        if (p) n.push(p);
      }
    }
    return n;
  };

  // =============================================================================================== THE ROADS
  const R = {};
  // Sion Junction, the triple stack: three decks on shared piers beside the fallen SkyGrid (the collapsed spans stay collapsed)
  R.sj = { id: 'sj', axis: 'z', c: -75, w: 14, a0: -104, a1: 36, levels: [12, 24, 38], name: 'Sion Junction SkyGrid', brokenA: '-z', laneA0: -66, skip: [[-85, -71]] };      // the north end, where the five-level interchange fell in the opening, is sheared off
  R.eeh = { id: 'eeh', axis: 'x', c: -120, w: 12, a0: -125, a1: 157, levels: [12, 24], name: 'EEH north' };
  R.mat = { id: 'mat', axis: 'x', c: 60, w: 12, a0: -125, a1: 157, levels: [18, 30], name: 'Matunga road', skip: [[-47, -43]] };      // (the hospital's approach, x -45, stays open)
  R.quay = { id: 'quay', axis: 'z', c: -131, w: 12, a0: -126, a1: 108, levels: [12, 24], name: 'Mahim quay road' };
  R.prom = { id: 'prom', axis: 'x', c: 128, w: 12, a0: -108, a1: 130, levels: [6, 18], name: 'Mithi River promenade' };
  R.ew = { id: 'ew', axis: 'x', c: 0, w: 12, a0: -125, a1: 157, levels: [24], name: 'Sion cross road', skip: [[-29, -25], [-12, -8]] };      // (the routes along x -10 and the plaza street)
  R.wad = { id: 'wad', axis: 'z', c: 45, w: 12, a0: -168, a1: 105, levels: [30], name: 'Wadala high road' };
  R.skyv = { id: 'skyv', axis: 'z', c: -15, w: 12, a0: -166, a1: -70, levels: [38], name: 'SkyGrid express' };
  R.dh = { id: 'dh', axis: 'z', c: -75, w: 12, a0: 44, a1: 104, levels: [18], name: 'Dharavi link' };
  R.vs = { id: 'vs', axis: 'z', c: -15, w: 12, a0: 42, a1: 104, levels: [24], name: 'Sion south road' };
  R.skyh = { id: 'skyh', axis: 'x', c: -90, w: 12, a0: -68, a1: 55, levels: [38], name: 'SkyGrid link' };
  // the order matters: a later strip is cut where an earlier one already stands at the same height
  for (const key of ['sj', 'eeh', 'quay', 'ew', 'mat', 'dh', 'vs', 'prom', 'wad', 'skyv', 'skyh']) strip({ ...R[key], kind: 'road' });

  // ----------------------------------------------------------------------------------------------- links that tie the stacks to the old city
  // Sion Junction: the lowest deck meets the broken skywalk stub and the Dharavi terrace; the street climbs to it by the capsule lift
  deck({ id: 'sj-link-w', x0: -85, x1: -82, z0: -44, z1: -38, y: 12, kind: 'walkway' });
  // the EEH canyon: bridges between each pair of tower faces, at both heights of the road (12 and 24), joined to it where they cross
  const eehBridges = [-108, -54, 18, 69, 126];
  eehBridges.forEach((c, i) => {
    for (const y of [12, 24]) {
      const same = W.decks.filter((d) => Math.abs(d.y - y) < 0.02), base = { x0: c - 3, x1: c + 3, z0: -130, z1: -110 };
      const pieces = subtractRects(base, same, 1.0);
      pieces.forEach((p, k) => deck({ id: `cb-eeh-${i + 1}-${y}${pieces.length > 1 ? String.fromCharCode(97 + k) : ''}`, ...p, y, kind: 'bridge', door: [p.z0 <= -129.9 ? 'z0' : null, p.z1 >= -110.1 ? 'z1' : null].filter(Boolean) }));
    }
    out.walkLanes.push({ id: `cb-eeh-${i + 1}-w`, ax: c, az: -128, bx: c, bz: -112, y: 12, level: 'L1', n: 1, speedMul: 0.9, spread: 0.5 });
  });
  // Matunga road: the terraces send stairs up to it (12 to 18), and two bridges at 24 span it between the faces of the towers
  [[8, 'b'], [62, 'c'], [-92, 'w3']].forEach(([x, k]) => flight({ id: `stairs-mat-${k}`, x, z: 44, dir: '+z', y0: 12, y1: 18, width: 3.6, tone: 'free' }));
  [31, 128].forEach((c, i) => {      // two bridges (18 and 30) span the Matunga road between the faces of the towers, joined to it where they cross
    for (const y of [18, 30]) {
      const same = W.decks.filter((d) => Math.abs(d.y - y) < 0.02), base = { x0: c - 3, x1: c + 3, z0: 50, z1: 70 };
      const pieces = subtractRects(base, same, 1.0);
      pieces.forEach((p, k) => deck({ id: `cb-mat-${i + 1}-${y}${pieces.length > 1 ? String.fromCharCode(97 + k) : ''}`, ...p, y, kind: 'bridge', door: [p.z0 <= 50.1 ? 'z0' : null, p.z1 >= 69.9 ? 'z1' : null].filter(Boolean) }));
    }
  });
  // a stair from the bazaar terrace up to the Sion cross road (12 m to 24 m): a new way into the flyovers, behind a bio-scan gate (5 rays)
  flight({ id: 'stairs-12-ew', x: 30, z: -26, dir: '+z', y0: 12, y1: 24, width: 4, gate: { id: 'gate-l2-stairs-ew', min: 5 } });
  // double-decker skywalks over the three streets between the terraces (12 below, 18 above), reached by stairs from each roof
  const dd = (id, axis, c, w, a0, a1, a2) => {   // deck at 18 spanning [a0,a1], stairs on the terraces [a0-10,a0] and [a1,a1+10]
    deck(axis === 'x' ? { id, x0: a0, x1: a1, z0: c - w / 2, z1: c + w / 2, y: 18, kind: 'catwalk' } : { id, x0: c - w / 2, x1: c + w / 2, z0: a0, z1: a1, y: 18, kind: 'catwalk' });
    flight(axis === 'x' ? { id: `stairs-${id}-a`, x: a0 - 10, z: c, dir: '+x', y0: 12, y1: 18, width: 3.4 } : { id: `stairs-${id}-a`, x: c, z: a0 - 10, dir: '+z', y0: 12, y1: 18, width: 3.4 });
    flight(axis === 'x' ? { id: `stairs-${id}-b`, x: a1 + 10, z: c, dir: '-x', y0: 12, y1: 18, width: 3.4 } : { id: `stairs-${id}-b`, x: c, z: a1 + 10, dir: '-z', y0: 12, y1: 18, width: 3.4 });
    void a2;
    out.walkLanes.push(axis === 'x' ? { id: `${id}-w`, ax: a0 + 1, az: c, bx: a1 - 1, bz: c, y: 18, level: 'L1', n: 2, speedMul: 1, spread: 0.6 } : { id: `${id}-w`, ax: c, az: a0 + 1, bx: c, bz: a1 - 1, y: 18, level: 'L1', n: 2, speedMul: 1, spread: 0.6 });
  };
  dd('sk-b2', 'x', 17, 3.6, 35, 55);          // terr-b to terr-c, over the street at x 35..55 (z 14..20)
  dd('sk-a2', 'z', 6, 3.6, -10, 10);           // the bazaar to terr-b over the Sion cross road (x 3..9)
  dd('sk-w2', 'z', -98, 3.6, -10, 10);         // the two west terraces over the same street (x -101..-95)

  // ----------------------------------------------------------------------------------------------- the promenade: ramps up from the quay
  ramp({ id: 'ramp-prom-w', x0: -128, x1: -108, z0: 125.5, z1: 130.5, dir: '+x', yLow: 0, yHigh: 6, tone: 'free', sign: 'WALKWAYS', bottom: 0 });
  ramp({ id: 'ramp-prom-e', x0: 130, x1: 149, z0: 125.5, z1: 130.5, dir: '-x', yLow: 0, yHigh: 6, tone: 'free', sign: 'WALKWAYS', bottom: 0 });

  // ----------------------------------------------------------------------------------------------- the capsule lifts
  const S = (y, exit, name, min) => ({ y, exit, name, min });
  lift({ id: 'lift-sion-stack', cls: 'public', label: 'SION JUNCTION SKYGRID', at: [-70.5, 39], size: [5, 6], stops: [
    S(0, '+z', 'Sion Junction street'), S(12, '-z', 'SkyGrid level 1'), S(24, '-z', 'SkyGrid level 2 (EEH)', 5), S(38, '-z', 'SkyGrid level 3', 8)] });
  lift({ id: 'lift-eeh-w', cls: 'family', label: 'EEH CANYON WEST', at: [-96, -112], size: [4, 4], stops: [S(0, '-x', 'EEH canyon street'), S(12, '-z', 'EEH road, low'), S(24, '-z', 'EEH road, high', 5)] });
  lift({ id: 'lift-eeh-e1', cls: 'public', label: 'NEW WADALA FACE', at: [81, -112], size: [6, 4], stops: [S(0, '-x', 'EEH canyon street'), S(12, '-z', 'EEH road, low'), S(24, '-z', 'EEH road, high', 5), S(38, '+z', 'Garden Terrace', 8)] });
  lift({ id: 'lift-eeh-e2', cls: 'family', label: 'SUNRISE HEIGHTS FACE', at: [140, -112], size: [4, 4], stops: [S(0, '-x', 'EEH canyon street'), S(24, '-z', 'EEH road, high', 5), S(38, '+z', 'Sunrise Heights', 8)] });
  lift({ id: 'lift-matunga', cls: 'public', label: 'MATUNGA SKYLIFT', at: [15, 68], size: [6, 4], stops: [S(0, '-x', 'Matunga street'), S(18, '-z', 'Matunga road, low'), S(30, '-z', 'Matunga road, high', 5)] });
  lift({ id: 'lift-sewri', cls: 'family', label: 'SEWRI SKYLIFT', at: [135, 68], size: [4, 4], stops: [S(0, '-x', 'Sewri street'), S(18, '-z', 'Matunga road, low'), S(30, '-z', 'Matunga road, high', 5)] });
  lift({ id: 'lift-quay-n', cls: 'public', label: 'DHARAVI SKYLIFT', at: [-123, -89], size: [4, 6], stops: [S(0, '+x', 'Dharavi quay'), S(12, '-x', 'Quay road, low'), S(24, '-x', 'Quay road, high', 5)] });
  lift({ id: 'lift-quay-s', cls: 'family', label: 'KUMBHARWADA SKYLIFT', at: [-123, 90], size: [4, 4], stops: [S(0, '+x', 'Kumbharwada quay'), S(12, '-x', 'Quay road, low'), S(24, '-x', 'Quay road, high', 5)] });
  lift({ id: 'lift-wadala-n', cls: 'public', label: 'WADALA HIGH ROAD', at: [37, -22], size: [4, 6], stops: [S(0, '+x', 'Wadala street'), S(12, '-x', "King's Circle terrace"), S(30, '+x', 'Wadala high road', 5)] });
  lift({ id: 'lift-freight-wadala', cls: 'freight', label: 'WADALA FREIGHT', at: [37, 85], size: [4, 10], stops: [S(0, '+x', 'Wadala freight yard'), S(30, '+x', 'Wadala high road', 5)] });
  lift({ id: 'lift-freight-eeh', cls: 'freight', label: 'EEH FREIGHT', at: [-45, -112], size: [10, 4], stops: [S(0, '-x', 'EEH canyon street'), S(12, '-z', 'EEH road, low'), S(24, '-z', 'EEH road, high', 5)] });
  lift({ id: 'lift-solo-kumbhar', cls: 'solo', label: 'POTTERS SOLO', at: [-98, 51.2], size: [2.4, 2.4], stops: [S(0, '+z', 'Potters lane'), S(12, '-z', 'Kumbharwada terrace')] });
  lift({ id: 'lift-solo-wadala', cls: 'solo', label: 'WADALA SOLO', at: [86, 51.2], size: [2.4, 2.4], stops: [S(0, '+z', 'Wadala street'), S(12, '-z', 'Wadala terrace')] });
  lift({ id: 'lift-prom-solo', cls: 'solo', label: 'PROMENADE SOLO', at: [-40, 120.8], size: [2.4, 2.4], stops: [S(0, '-x', 'Mithi River steps'), S(6, '+z', 'Promenade flyover')] });
  lift({ id: 'lift-prom-b', cls: 'family', label: 'ESTUARY SKYLIFT', at: [110, 120], size: [4, 4], stops: [S(0, '-x', 'Sewri steps'), S(6, '+z', 'Promenade, low'), S(18, '+z', 'Promenade, high')] });

  // ----------------------------------------------------------------------------------------------- piers last (they step round everything above)
  for (const key of ['sj', 'eeh', 'quay', 'ew', 'mat', 'dh', 'vs', 'prom', 'wad', 'skyv', 'skyh']) piersFor({ ...R[key], kind: 'road' });

  return out;
}
