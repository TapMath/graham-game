// Geometry helpers and the self-check for the Phase 9A flyover network. Pure data and arithmetic (no three.js, no DOM), so it runs in
// node (`node tools/check-network.mjs`) and in the page (`__grahan.do('validateNetwork')`).
//
//   subtractRects(rect, rects)           the pieces of `rect` that no rect in `rects` covers
//   pillarSpots(deck)                    where the classic pillar rule (structures.buildPillars) would stand pillars for a deck
//   validateNetwork(MAP)                 {errors[], warnings[], stats}: boxes that overlap, decks that cross with too little headroom, lift shafts
//                                        through decks, piers inside things, decks no one can reach, and routes that skip a health gate
//   deckArea(MAP)                        the walkable plan area above G (decks above 3 m plus tower roofs minus the towers that stand on them)
import { levelAt } from './levels.js';

export const EPS = 0.05;
const area = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0));
export const planOverlap = area;
const V = { '+x': [1, 0], '-x': [-1, 0], '+z': [0, 1], '-z': [0, -1] };

export function subtractRects(r, cuts, min = 0.01) {
  let pieces = [r];
  for (const c of cuts) {
    const next = [];
    for (const p of pieces) {
      if (c.x1 <= p.x0 + 1e-6 || c.x0 >= p.x1 - 1e-6 || c.z1 <= p.z0 + 1e-6 || c.z0 >= p.z1 - 1e-6) { next.push(p); continue; }
      if (c.z0 > p.z0) next.push({ x0: p.x0, z0: p.z0, x1: p.x1, z1: c.z0 });
      if (c.z1 < p.z1) next.push({ x0: p.x0, z0: c.z1, x1: p.x1, z1: p.z1 });
      const z0 = Math.max(p.z0, c.z0), z1 = Math.min(p.z1, c.z1);
      if (c.x0 > p.x0) next.push({ x0: p.x0, z0, x1: c.x0, z1 });
      if (c.x1 < p.x1) next.push({ x0: c.x1, z0, x1: p.x1, z1 });
    }
    pieces = next;
  }
  return pieces.filter((p) => p.x1 - p.x0 > min && p.z1 - p.z0 > min);
}

/** The classic pillar rule of structures.buildPillars, as data (no physics): [{x, z, hx, hz}]. */
export function pillarSpots(d, cutRects = []) {
  if (!d.pillars) return [];
  const long = d.x1 - d.x0 >= d.z1 - d.z0 ? 'x' : 'z';
  const len = long === 'x' ? d.x1 - d.x0 : d.z1 - d.z0, wid = long === 'x' ? d.z1 - d.z0 : d.x1 - d.x0;
  const n = Math.max(1, Math.round(len / (d.kind === 'road' ? 16 : 14)));
  const across0 = d.pillarAcross ?? (wid >= 8 ? [1.3, wid - 1.3] : [wid / 2]);
  const pw = d.kind === 'road' ? 1.2 : 0.9, size0 = d.pillarSize ?? [pw, pw];
  const out = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) * len / n;
    const along = (long === 'x' ? d.x0 : d.z0) + t;
    if (d.pillarSkip?.some(([a, b]) => along > a && along < b)) continue;
    const ov = long === 'x' ? d.pillarOverrides?.find((o) => d.x0 + t > o.x0 && d.x0 + t < o.x1) : null;
    const across = ov ? ov.across : across0, size = ov ? ov.size : size0;
    const hx = (long === 'x' ? size[0] : size[1]) / 2, hz = (long === 'x' ? size[1] : size[0]) / 2;
    for (const a of across) {
      const x = long === 'x' ? d.x0 + t : d.x0 + a, z = long === 'x' ? d.z0 + a : d.z0 + t;
      if (cutRects.some((c) => x > c.x0 - 0.8 && x < c.x1 + 0.8 && z > c.z0 - 0.8 && z < c.z1 + 0.8)) continue;
      out.push({ x, z, hx, hz });
    }
  }
  return out;
}

/** Height of a stair or ramp surface at plan point (x, z), or null outside its footprint. */
export function flightHeightAt(f, x, z) {
  if (f.kind === 'ramp') {
    if (x < f.x0 || x > f.x1 || z < f.z0 || z > f.z1) return null;
    const ax = f.dir[1], sg = f.dir[0] === '-' ? -1 : 1, u0 = ax === 'z' ? f.z0 : f.x0, u1 = ax === 'z' ? f.z1 : f.x1, u = ax === 'z' ? z : x;
    const t = (sg > 0 ? u - u0 : u1 - u) / (u1 - u0);
    return f.yLow + (f.yHigh - f.yLow) * t;
  }
  if (x < f.x0 || x > f.x1 || z < f.z0 || z > f.z1) return null;
  const ax = f.dir[1], sg = f.dir[0] === '-' ? -1 : 1, a0 = ax === 'z' ? f.z : f.x, u = ax === 'z' ? z : x;
  const run = f.run ?? 0.5, i = Math.min(f.steps, Math.max(1, Math.ceil(((u - a0) * sg) / run)));
  return f.y0 + ((f.y1 - 0.015) - f.y0) / f.steps * i;
}

/** Plan footprint of a stair record {x,z,dir,steps,run,width}. */
export function stairRect(s) {
  const run = s.run ?? 0.5, len = s.steps * run, ax = s.dir[1], sg = s.dir[0] === '-' ? -1 : 1, hw = s.width / 2;
  return ax === 'z'
    ? { x0: s.x - hw, x1: s.x + hw, z0: Math.min(s.z, s.z + sg * len), z1: Math.max(s.z, s.z + sg * len) }
    : { z0: s.z - hw, z1: s.z + hw, x0: Math.min(s.x, s.x + sg * len), x1: Math.max(s.x, s.x + sg * len) };
}

/** Every solid thing as an AABB with a kind: {id, kind, x0..z1, y0, y1, net}. */
export function solidBoxes(M) {
  const out = [];
  const add = (id, kind, r, y0, y1, net = false) => out.push({ id, kind, x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, y0, y1, net });
  for (const t of M.towers) add(t.id, 'tower', t, t.y0 ?? -2, t.h, false);
  for (const d of M.decks) add(d.id, 'deck', d, d.y - d.th, d.y, !!d.net);
  for (const p of M.piers ?? []) add(p.id, 'pier', { x0: p.x - p.hx, x1: p.x + p.hx, z0: p.z - p.hz, z1: p.z + p.hz }, p.y0, p.y1, true);
  for (const l of M.lifts) {
    const [cx, cz] = l.center, [w, d] = l.size, ys = (l.stops ?? [{ y: l.yBottom }, { y: l.yTop }]).map((s) => s.y);
    add(l.id, 'lift', { x0: cx - w / 2, x1: cx + w / 2, z0: cz - d / 2, z1: cz + d / 2 }, Math.min(...ys), Math.max(...ys) + (l.capsule ? 3.2 : 4.4), !!l.net);
  }
  for (const s of M.stairs) { if (s.from === 'U' && s.to === 'U') continue; add(s.id, 'stairs', stairRect(s), s.y0 < 1 ? Math.min(s.y0, s.y1) - 0.2 : Math.min(s.y0, s.y1) + 0.05, Math.max(s.y0, s.y1) + 1.3, !!s.net); }
  for (const r of M.ramps) add(r.id, 'ramp', { x0: Math.min(r.x0, r.x1), x1: Math.max(r.x0, r.x1), z0: Math.min(r.z0, r.z1), z1: Math.max(r.z0, r.z1) }, Math.min(r.yLow, r.yHigh), Math.max(r.yLow, r.yHigh) + 1.3, !!r.net);
  for (const b of M.buildings) add(b.id, 'building', b, b.y ?? 0, (b.y ?? 0) + b.h, false);
  const R = M.rail;
  add('rail-corridor', 'rail', { x0: R.x0, x1: R.x1, z0: R.corridor.z0 - 0.4, z1: R.corridor.z1 + 0.4 }, 0, 6, false);
  for (const st of R.stations) for (const side of ['north', 'south']) { const P = R.platforms[side]; add(`platform-${st.id}-${side}`, 'rail', { x0: st.x0 - 3.6, x1: st.x1 + 3.6, z0: P.z0 - 0.6, z1: P.z1 + 0.6 }, 0, 5, false); }
  return out;
}

function inter3(a, b) {
  const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return ox > EPS && oz > EPS && oy > EPS ? { ox, oz, oy } : null;
}

export function validateNetwork(M, { quiet = false } = {}) {
  const errors = [], warnings = [];
  const boxes = solidBoxes(M);
  const err = (m) => errors.push(m);
  // ---- pairwise: anything that involves something new
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i];
    for (let j = i + 1; j < boxes.length; j++) {
      const b = boxes[j];
      if (!a.net && !b.net) continue;
      if (a.x0 >= b.x1 || b.x0 >= a.x1 || a.z0 >= b.z1 || b.z0 >= a.z1) continue;
      const pa = area(a, b);
      if (pa <= EPS) continue;
      if (a.kind === 'deck' && b.kind === 'deck') {
        const [lo, hi] = a.y1 <= b.y1 ? [a, b] : [b, a];
        if (Math.abs(a.y1 - b.y1) < 0.02) { err(`coplanar decks overlap: ${a.id} / ${b.id} (${pa.toFixed(1)} m2)`); continue; }
        const gap = hi.y0 - lo.y1;
        if (gap < -0.02) err(`decks intersect: ${a.id} (${a.y1}) / ${b.id} (${b.y1})`);
        else if (gap < 4.3 && !(a.join || b.join)) err(`decks ${lo.id} (y ${lo.y1}) and ${hi.id} (y ${hi.y1}) cross with only ${gap.toFixed(1)} m of headroom`);
        continue;
      }
      if (a.kind === 'stairs' || b.kind === 'stairs' || a.kind === 'ramp' || b.kind === 'ramp') {
        const [f, o] = (a.kind === 'stairs' || a.kind === 'ramp') ? [a, b] : [b, a];
        if (o.kind === 'stairs' || o.kind === 'ramp') { if (inter3(a, b)) err(`${a.kind} ${a.id} and ${b.kind} ${b.id} overlap`); continue; }
        const rec = (f.kind === 'stairs' ? M.stairs : M.ramps).find((q) => q.id === f.id);
        const fl = f.kind === 'stairs' ? { ...rec, kind: 'stairs' } : { ...rec, kind: 'ramp', x0: Math.min(rec.x0, rec.x1), x1: Math.max(rec.x0, rec.x1), z0: Math.min(rec.z0, rec.z1), z1: Math.max(rec.z0, rec.z1) };
        // sample the overlap: the thing must clear the flight by 2.2 m above it, and sit no lower than the flight's own underside
        const x0 = Math.max(a.x0, b.x0), x1 = Math.min(a.x1, b.x1), z0 = Math.max(a.z0, b.z0), z1 = Math.min(a.z1, b.z1);
        let bad = false;
        for (let x = x0 + 0.1; x < x1 && !bad; x += 0.5) for (let z = z0 + 0.1; z < z1 && !bad; z += 0.5) {
          const h = flightHeightAt(fl, x, z); if (h === null) continue;
          const under = f.kind === 'stairs' ? Math.max(h - 0.9, rec.y0 - 0.02) : (rec.bottom ?? Math.min(rec.yLow, rec.yHigh));
          if (o.y1 > under + 0.02 && o.y0 < h + 2.2) bad = true;
        }
        if (bad) err(`${f.kind} ${f.id} runs into ${o.kind} ${o.id}`);
        continue;
      }
      if (a.kind === 'rail' && b.kind === 'rail') continue;
      if (inter3(a, b)) err(`${a.kind} ${a.id} overlaps ${b.kind} ${b.id}`);
    }
  }
  // ---- connectivity and the health-gate rule
  const g = routeGraph(M);
  for (const d of g.nodes) {
    if (!d.net) continue;
    if (!g.reach(12).has(d.id)) err(`unreachable: ${d.id} (y ${d.y})`);
  }
  for (const o of g.orphans) if (/lift (lift-[a-z0-9-]+)/.test(o) && !o.includes('lift-wreck')) err(o); else if (o.startsWith('stairs') || o.startsWith('ramp')) { if (!/stairs-u-|ramp-u-/.test(o)) err(o); }
  const low = g.reach(4), mid = g.reach(7);
  for (const d of g.nodes) {
    if (d.id === 'G') continue;
    if (low.has(d.id) && d.y >= 20) err(`${d.id} (y ${d.y}) is reachable with 4 rays but sits at the gated L2 height or above`);
    if (mid.has(d.id) && d.y >= 34 && !d.permit) err(`${d.id} (y ${d.y}) is reachable with 7 rays but sits at the gated L3 height`);
  }
  // spurs: new decks with a single link and no other deck beside them (dead ends are fine, but report them)
  for (const d of g.nodes) if (d.net && g.degree(d.id) < 1) warnings.push(`isolated: ${d.id}`);
  for (const sh of M.sunShafts ?? []) { const b = shaftBlockers(M, sh, boxes); if (b.length) err(`sun shaft ${sh.id} (${sh.level}) is crossed by ${[...new Set(b)].join(', ')}`); }
  if (!quiet) { /* callers print */ }
  return { errors, warnings, stats: { boxes: boxes.length, decks: M.decks.length, nodes: g.nodes.length, edges: g.edges.length, area: deckArea(M) } };
}

// ------------------------------------------------------------------------------------------------ the graph of places
/** Nodes: G and every deck / tower roof; edges: decks that touch at the same height, stairs, ramps, lift stops (with the rays they need). */
export function routeGraph(M) {
  const nodes = [{ id: 'G', y: 0, x0: M.land.minX, x1: M.land.maxX, z0: M.land.minZ, z1: M.land.maxZ, ground: true }];
  for (const d of M.decks) { if (d.level === 'G' && d.y < 3 && !d.net) continue; nodes.push({ id: d.id, y: d.y, x0: d.x0, x1: d.x1, z0: d.z0, z1: d.z1, net: !!d.net, permit: d.id.startsWith('sunrise') }); }
  for (const t of M.towers) if (t.roof) nodes.push({ id: t.id + ':roof', y: t.h, x0: t.x0, x1: t.x1, z0: t.z0, z1: t.z1, net: false });
  const edges = [], orphans = [];
  const find = (x, z, y, tol = 0.6) => {
    let best = null;
    for (const n of nodes) {
      if (n.ground) continue;
      if (Math.abs(n.y - y) > 0.35) continue;
      if (x >= n.x0 - tol && x <= n.x1 + tol && z >= n.z0 - tol && z <= n.z1 + tol) { best = n; break; }
    }
    if (!best && Math.abs(y) < 0.35) return nodes[0];
    return best;
  };
  const link = (a, b, up, down, why) => { if (a && b && a !== b) edges.push({ a: a.id, b: b.id, up, down, why }); };
  // decks touching at the same height
  for (let i = 1; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j];
    if (Math.abs(a.y - b.y) > 0.02) continue;
    const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
    if ((ox >= -0.1 && oz > 1.0) || (oz >= -0.1 && ox > 1.0)) link(a, b, 0, 0, 'touch');
  }
  const gateOf = (id) => { const q = id ? M.gates.find((k) => k.id === id) : null; return q ? (q.permit ? 99 : q.min) : 0; };   // the permit gate needs Tara's permission, not rays: the check treats it as shut
  for (const s of M.stairs) {
    if (s.from === 'U' && s.to === 'U') continue;
    const ax = s.dir[1], sg = s.dir[0] === '-' ? -1 : 1, len = s.steps * (s.run ?? 0.5);
    const lo = { x: s.x, z: s.z }, hi = ax === 'z' ? { x: s.x, z: s.z + sg * (len + 0.5) } : { x: s.x + sg * (len + 0.5), z: s.z };
    const lowPt = ax === 'z' ? { x: s.x, z: s.z - sg * 0.4 } : { x: s.x - sg * 0.4, z: s.z };
    void lo;
    { const a = find(lowPt.x, lowPt.z, s.y0), b = find(hi.x, hi.z, s.y1); if (!a || !b) orphans.push(`stairs ${s.id} ${a ? 'top' : 'foot'} lands on nothing`); link(a, b, gateOf(s.gate), 0, s.id); }
  }
  for (const r of M.ramps) {
    const ax = r.dir[1], sg = r.dir[0] === '-' ? -1 : 1, x0 = Math.min(r.x0, r.x1), x1 = Math.max(r.x0, r.x1), z0 = Math.min(r.z0, r.z1), z1 = Math.max(r.z0, r.z1);
    const lowU = ax === 'z' ? (sg > 0 ? z0 : z1) : (sg > 0 ? x0 : x1), highU = ax === 'z' ? (sg > 0 ? z1 : z0) : (sg > 0 ? x1 : x0);
    const pt = (u, off) => (ax === 'z' ? { x: (x0 + x1) / 2, z: u + off } : { x: u + off, z: (z0 + z1) / 2 });
    const lp = pt(lowU, -sg * 0.4), hp = pt(highU, sg * 0.4);
    { const a = find(lp.x, lp.z, r.yLow), b = find(hp.x, hp.z, r.yHigh); if (!a || !b) orphans.push(`ramp ${r.id} ${a ? 'top' : 'foot'} lands on nothing`); link(a, b, 0, 0, r.id); }
  }
  for (const l of M.lifts) {
    const [cx, cz] = l.center, [w, d] = l.size;
    const stops = (l.stops ?? [{ id: 'bottom', y: l.yBottom, exit: l.exits.bottom, ...(l.stopMeta?.bottom ?? {}) }, { id: 'top', y: l.yTop, exit: l.exits.top, ...(l.stopMeta?.top ?? {}) }]).slice().sort((p, q) => p.y - q.y);
    const lg = l.gate ? gateOf(l.gate) : 0;
    const at = stops.map((st) => { const v = V[st.exit]; const node = find(cx + v[0] * (w / 2 + 0.7), cz + v[1] * (d / 2 + 0.7), st.y); if (!node) orphans.push(`lift ${l.id} stop ${st.id} (y ${st.y}) opens onto nothing`); return { st, node }; });
    for (let i = 0; i < at.length; i++) for (let j = i + 1; j < at.length; j++) link(at[i].node, at[j].node, Math.max(at[j].st.min ?? 0, lg), 0, l.id);
  }
  const adj = new Map(nodes.map((n) => [n.id, []]));
  for (const e of edges) { adj.get(e.a).push({ to: e.b, need: e.up }); adj.get(e.b).push({ to: e.a, need: e.down }); }
  const reach = (rays) => {
    const seen = new Set(['G']), q = ['G'];
    while (q.length) { const id = q.pop(); for (const { to, need } of adj.get(id)) if (!seen.has(to) && rays >= need) { seen.add(to); q.push(to); } }
    return seen;
  };
  const degree = (id) => adj.get(id).length;
  return { nodes, edges, reach, degree, find, orphans };
}

/** The walkable plan area above G, in m2: decks above 3 m plus every tower roof, less the towers that rise from it. */
export function deckArea(M) {
  let a = 0;
  for (const d of M.decks) if (d.y > 3) a += (d.x1 - d.x0) * (d.z1 - d.z0);
  for (const t of M.towers) if (t.roof) {
    let cov = 0;
    for (const u of M.towers) if (u !== t && (u.y0 ?? 0) >= t.h - 0.1 && u.x0 >= t.x0 - 0.01 && u.x1 <= t.x1 + 0.01 && u.z0 >= t.z0 - 0.01 && u.z1 <= t.z1 + 0.01) cov += (u.x1 - u.x0) * (u.z1 - u.z0);
    a += (t.x1 - t.x0) * (t.z1 - t.z0) - cov;
  }
  return a;
}

export { levelAt, V as DIRVEC };

// ------------------------------------------------------------------------------------------------ sunlight shafts
const LEAN = { x: 0.16, z: -0.05 };
/** What stands in the way of a sun shaft {x, z, y0, r, height} (it leans east with height): the things whose box the slanted column crosses. */
export function shaftBlockers(M, s, boxes = solidBoxes(M), kinds = ['deck', 'pier']) {
  const out = [];
  const r = s.r + 0.4;
  for (const b of boxes) {
    if (!kinds.includes(b.kind)) continue;
    if (b.y1 <= s.y0 + 0.9 || b.y0 >= s.y0 + s.height) continue;          // below the floor of the shaft, or above its top
    // the column's centre at height h moves (LEAN.x h, LEAN.z h): test the box's lowest and highest crossing heights with a few samples
    const lo = Math.max(b.y0, s.y0 + 0.9), hi = Math.min(b.y1, s.y0 + s.height);
    for (let y = lo; y <= hi + 1e-6; y += Math.max(0.5, (hi - lo) / 6)) {
      const h = y - s.y0, cx = s.x + LEAN.x * h, cz = s.z + LEAN.z * h;
      const dx = Math.max(b.x0 - cx, 0, cx - b.x1), dz = Math.max(b.z0 - cz, 0, cz - b.z1);
      if (dx * dx + dz * dz < r * r) { out.push(`${b.kind} ${b.id}`); break; }
    }
  }
  return out;
}

/** Is (x, z) at height y a place to stand (open floor under the sky of the web)? Used to place shafts. */
export function floorFree(M, x, z, y, boxes, pad = 1.2) {
  for (const b of boxes) {
    if (b.kind === 'rail') continue;
    if (x < b.x0 - pad || x > b.x1 + pad || z < b.z0 - pad || z > b.z1 + pad) continue;
    if (b.y1 > y + 0.1 && b.y0 < y + 2.5) return false;                   // a wall or pier in the way
  }
  return true;
}
