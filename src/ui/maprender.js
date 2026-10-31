// Drawing the city onto a 2D canvas context, in world metres. One painter for both maps: the minimap (dark glass) and the full map
// (the pale transit sheet) differ only by the `style` they pass. Everything here is static (a level's layout, the Harbour Line, the
// stairs, ramps, lifts and gates as footprints); the live things (sunlight, trains, lift charge, people) are drawn by the callers.
//
//   paintLevel(ctx, level, style, view)   `ctx` must already be transformed so that 1 unit = 1 metre (x east, y = world z, south down);
//                                         `view` = {x0, z0, x1, z1} the world rectangle to cover (for culling); `px` = metres per pixel.
import { levelData, linksAt, gatesAt, RAIL, BOUNDS } from './mapdata.js';
import { MAP } from '../world/map.js';

export const DARK = {
  name: 'dark', bg: '#071017', sea: '#0a1a24', ground: '#15222a', street: '#2a4352', streetLine: 'rgba(201,225,238,.1)', zone: 0.0,
  walk: '#314a5a', walkEdge: '#78a4ba', deckByKind: {}, solid: '#0b1217', solidEdge: '#4d6c7c', shack: '#34454d', shackEdge: 'rgba(0,0,0,.35)',
  building: '#2a3e48', buildingWall: '#9ab9c9', uFloor: '#2c4350', uEdge: '#6e98ad', uWall: '#0b1217',
  track: '#5a9fd4', platform: '#486d86', corridor: '#101a21', sleeper: 'rgba(120,170,210,.35)',
  stairs: '#ffb347', stairsFill: 'rgba(255,179,71,.34)', ramp: '#ffcf86', lift: '#8fd8d0', gate: '#ff8068',
  tree: '#2a4a3a', rubble: 'rgba(160,150,130,.18)', metro: '#6fa8dc', text: '#dde9f4', textDim: 'rgba(221,233,244,.6)',
  lineScale: 1,
};
/** The minimap's CRT phosphor: a near-black screen, cyan/teal lines, magenta gates, amber stairs. Fills stay dim so the sunlight (gold, drawn live) and the objective stay the brightest things. */
export const NEON = {
  name: 'neon', bg: '#03080b', sea: '#041218', ground: '#07151a', street: '#0d2a31', streetLine: 'rgba(90,255,235,.16)', zone: 0.0,
  walk: '#0f3a42', walkEdge: '#33e6e0', deckByKind: {}, solid: '#04090c', solidEdge: '#1f8f98', shack: '#0c2a30', shackEdge: 'rgba(0,0,0,.4)',
  building: '#0b2d35', buildingWall: '#3fd9d0', uFloor: '#0e343c', uEdge: '#2fc9c9', uWall: '#04090c',
  track: '#46b4ff', platform: '#14506a', corridor: '#061014', sleeper: 'rgba(90,190,255,.4)',
  stairs: '#ffb000', stairsFill: 'rgba(255,176,0,.3)', ramp: '#ffc640', lift: '#2dffd0', gate: '#ff3cac',
  tree: '#0f3a30', rubble: 'rgba(120,200,190,.16)', metro: '#46b4ff', text: '#bffcf4', textDim: 'rgba(150,255,240,.6)',
  lineScale: 1,
};
export const PAPER = {
  name: 'paper', bg: '#e9eef1', sea: '#bcd8e8', ground: '#f7f9f9', street: '#ffffff', streetLine: 'rgba(120,140,155,.28)', zone: 1,
  walk: '#ffffff', walkEdge: '#2b3d4a', deckByKind: { walkway: '#e8742f', road: '#f0a020', bridge: '#2e6bd1', pier: '#9aa7ad', terrace: '#f1c3a0', garden: '#bfe0b0' },
  solid: '#cbd3d7', solidEdge: '#8e9ca4', shack: '#dde3e6', shackEdge: '#b4bfc5',
  building: '#f1e4d3', buildingWall: '#52606a', uFloor: '#fbfbf8', uEdge: '#2b3d4a', uWall: '#cbd3d7',
  track: '#1c6fb8', platform: '#8fb4d3', corridor: '#dbe4ea', sleeper: 'rgba(28,111,184,.35)',
  stairs: '#c4521a', stairsFill: 'rgba(232,116,47,.32)', ramp: '#d96a2a', lift: '#007c78', gate: '#d1362b',
  tree: '#b9d6b2', rubble: 'rgba(120,110,100,.22)', metro: '#1c6fb8', text: '#1b2a36', textDim: 'rgba(27,42,54,.6)',
  lineScale: 1,
};

const overlaps = (r, v) => r.x1 >= v.x0 && r.x0 <= v.x1 && r.z1 >= v.z0 && r.z0 <= v.z1;

function hatch(ctx, r, px, color, step = 5, width = 1) {
  ctx.save(); ctx.beginPath(); ctx.rect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0); ctx.clip();
  ctx.strokeStyle = color; ctx.lineWidth = width * px;
  ctx.beginPath();
  for (let k = r.x0 - (r.z1 - r.z0); k < r.x1; k += step) { ctx.moveTo(k, r.z1); ctx.lineTo(k + (r.z1 - r.z0), r.z0); }
  ctx.stroke(); ctx.restore();
}

/** Paint one level's layout. */
export function paintLevel(ctx, level, st, view, px) {
  const D = levelData(level);
  const v = view ?? BOUNDS;
  const lw = (n) => n * px;
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  if (level === 'U') return paintUnderground(ctx, D, st, v, px);

  // ---- ground: the land (G only), zones and street bands
  for (const w of D.walk) {
    if (w.kind !== 'land') continue;
    ctx.fillStyle = st.ground; ctx.fillRect(w.x0, w.z0, w.x1 - w.x0, w.z1 - w.z0);
  }
  if (st.zone) for (const z of D.zones) { ctx.fillStyle = 'rgba(150,170,150,.18)'; if (z.id === 'courtyard' || z.id === 'clover-w' || z.id === 'clover-e') ctx.fillRect(z.x0, z.z0, z.x1 - z.x0, z.z1 - z.z0); }
  if (level === 'G') {
    for (const s of D.streets) { ctx.fillStyle = st.street; ctx.fillRect(s.x0, s.z0, s.x1 - s.x0, s.z1 - s.z0); }
    ctx.strokeStyle = st.streetLine; ctx.lineWidth = lw(1); ctx.setLineDash([lw(5), lw(5)]);
    for (const s of D.streets) {
      ctx.beginPath();
      if (s.x1 - s.x0 < s.z1 - s.z0) { const x = (s.x0 + s.x1) / 2; ctx.moveTo(x, s.z0); ctx.lineTo(x, s.z1); } else { const z = (s.z0 + s.z1) / 2; ctx.moveTo(s.x0, z); ctx.lineTo(s.x1, z); }
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
  // ---- raised walking surfaces (decks, terraces, bridges)
  for (const w of D.walk) {
    if (w.kind === 'land' || !overlaps(w, v)) continue;
    const col = st.deckByKind[w.kind] ?? st.walk;
    if (st.name === 'paper') {
      ctx.fillStyle = w.kind === 'terrace' || w.kind === 'garden' ? col : '#fff'; ctx.fillRect(w.x0, w.z0, w.x1 - w.x0, w.z1 - w.z0);
      ctx.strokeStyle = col; ctx.lineWidth = lw(w.kind === 'road' ? 2.2 : 1.8); ctx.strokeRect(w.x0, w.z0, w.x1 - w.x0, w.z1 - w.z0);
    } else {
      ctx.fillStyle = col; ctx.fillRect(w.x0, w.z0, w.x1 - w.x0, w.z1 - w.z0);
      ctx.strokeStyle = st.walkEdge; ctx.lineWidth = lw(1.3); ctx.strokeRect(w.x0, w.z0, w.x1 - w.x0, w.z1 - w.z0);
      if (w.kind === 'road') { ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.setLineDash([lw(6), lw(6)]); ctx.lineWidth = lw(1); ctx.beginPath(); if (w.x1 - w.x0 > w.z1 - w.z0) { const z = (w.z0 + w.z1) / 2; ctx.moveTo(w.x0, z); ctx.lineTo(w.x1, z); } else { const x = (w.x0 + w.x1) / 2; ctx.moveTo(x, w.z0); ctx.lineTo(x, w.z1); } ctx.stroke(); ctx.setLineDash([]); }
      if (w.broken) { ctx.fillStyle = 'rgba(255,128,104,.55)'; const bx = w.broken === '+x' ? w.x1 - 1.4 : w.x0; ctx.fillRect(bx, w.z0, 1.4, w.z1 - w.z0); }
    }
  }
  // ---- the decks that are not at their level's own height (the Phase 9A skywalks and flyovers at 6, 18 and 30 m, or one level up from a terrace): a small height tag
  if (px < 0.6) {
    ctx.font = `700 ${8.5 * px}px Inter, Helvetica, Arial, sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const w of D.walk) {
      if (w.y === undefined || w.kind === 'land' || Math.abs(w.y - D.y) < 2 || !overlaps(w, v)) continue;
      if (Math.min(w.x1 - w.x0, w.z1 - w.z0) < 2.6 || Math.max(w.x1 - w.x0, w.z1 - w.z0) < 14 * px * 4) continue;
      ctx.fillStyle = st.name === 'paper' ? 'rgba(27,42,54,.72)' : 'rgba(221,233,244,.62)';
      ctx.fillText(`${w.y} m`, (w.x0 + w.x1) / 2, (w.z0 + w.z1) / 2);
    }
  }
  // ---- solids: towers and podium blocks
  for (const s of D.solids) {
    if (!overlaps(s, v)) continue;
    ctx.fillStyle = st.solid; ctx.fillRect(s.x0, s.z0, s.x1 - s.x0, s.z1 - s.z0);
    if (st.name === 'paper') hatch(ctx, s, px, 'rgba(110,126,136,.35)', 4.5, 0.8);
    ctx.strokeStyle = st.solidEdge; ctx.lineWidth = lw(1.1); ctx.strokeRect(s.x0, s.z0, s.x1 - s.x0, s.z1 - s.z0);
  }
  // ---- G dressing: shacks, buildings you can enter, the dead tree and the rubble field
  if (level === 'G') {
    for (const s of D.shacks) { ctx.fillStyle = st.shack; ctx.fillRect(s.x0, s.z0, s.x1 - s.x0, s.z1 - s.z0); }
    const r = MAP.rubble; ctx.fillStyle = st.rubble; ctx.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0);
    if (st.name === 'paper') hatch(ctx, r, px, 'rgba(120,110,100,.35)', 3, 0.7);
    for (const b of D.buildings) {
      ctx.fillStyle = st.building; ctx.fillRect(b.x0, b.z0, b.x1 - b.x0, b.z1 - b.z0);
      ctx.strokeStyle = st.buildingWall; ctx.lineWidth = lw(st.name === 'paper' ? 1.8 : 1.5);
      const gaps = { n: [], s: [], e: [], w: [] }; for (const d of b.doors ?? []) if (!d.low) gaps[d.side].push([d.c - d.w / 2, d.c + d.w / 2]);
      const edge = (x0, z0, x1, z1, g, alongX) => {
        const a = alongX ? x0 : z0, c = alongX ? x1 : z1; let at = a;
        for (const [g0, g1] of [...g].sort((p, q) => p[0] - q[0])) { seg(at, g0); at = g1; }
        seg(at, c);
        function seg(p, q) { if (q <= p) return; ctx.beginPath(); if (alongX) { ctx.moveTo(p, z0); ctx.lineTo(q, z0); } else { ctx.moveTo(x0, p); ctx.lineTo(x0, q); } ctx.stroke(); }
      };
      edge(b.x0, b.z0, b.x1, b.z0, gaps.n, true); edge(b.x0, b.z1, b.x1, b.z1, gaps.s, true); edge(b.x0, b.z0, b.x0, b.z1, gaps.w, false); edge(b.x1, b.z0, b.x1, b.z1, gaps.e, false);
      ctx.lineWidth = lw(0.9);
      for (const p of b.partitions ?? []) { ctx.beginPath(); if (p.axis === 'x') { ctx.moveTo(p.a, p.at); ctx.lineTo(p.b, p.at); } else { ctx.moveTo(p.at, p.a); ctx.lineTo(p.at, p.b); } ctx.stroke(); }
    }
    const t = MAP.deadTree; ctx.fillStyle = st.tree; ctx.beginPath(); ctx.arc(t.x, t.z, 4.2, 0, 7); ctx.fill();
    paintRail(ctx, st, px);
    // metro entrances: the two canopies over the stairs down
    ctx.fillStyle = st.name === 'paper' ? 'rgba(28,111,184,.18)' : 'rgba(111,168,220,.20)'; ctx.strokeStyle = st.metro; ctx.lineWidth = lw(1.2);
    for (const [z0, z1] of [[-21, -4], [51, 67.5]]) { ctx.fillRect(39, z0, 12, z1 - z0); ctx.strokeRect(39, z0, 12, z1 - z0); }
  }
  paintLinks(ctx, level, st, px);
}

function paintRail(ctx, st, px) {
  const R = RAIL, lw = (n) => n * px;
  ctx.fillStyle = st.corridor; ctx.fillRect(R.x0, R.corridor.z0, R.x1 - R.x0, R.corridor.z1 - R.corridor.z0);
  // platforms at the stations
  ctx.fillStyle = st.platform;
  for (const s of R.stations) for (const p of [R.platforms.north, R.platforms.south]) ctx.fillRect(s.x0, p.z0, s.x1 - s.x0, p.z1 - p.z0);
  // sleepers and the two rails
  ctx.strokeStyle = st.sleeper; ctx.lineWidth = lw(0.9); ctx.setLineDash([lw(1.3), lw(3.2)]);
  for (const z of R.trackZ) { ctx.beginPath(); ctx.moveTo(R.x0, z); ctx.lineTo(R.x1, z); ctx.stroke(); }
  ctx.setLineDash([]);
  ctx.strokeStyle = st.track; ctx.lineWidth = lw(st.name === 'paper' ? 1.5 : 1.2);
  for (const z of R.trackZ) { ctx.beginPath(); ctx.moveTo(R.x0, z); ctx.lineTo(R.x1, z); ctx.stroke(); }
}

function paintUnderground(ctx, D, st, v, px) {
  const lw = (n) => n * px;
  for (const f of D.walk) {
    if (!overlaps(f, v)) continue;
    ctx.fillStyle = st.uFloor; ctx.fillRect(f.x0, f.z0, f.x1 - f.x0, f.z1 - f.z0);
    if (f.tracks) {
      const t = f.tracks; ctx.fillStyle = st.name === 'paper' ? '#dbe4ea' : '#0f171c'; ctx.fillRect(t.x0, t.z0, t.x1 - t.x0, t.z1 - t.z0);
      ctx.strokeStyle = st.track; ctx.lineWidth = lw(1.1);
      for (const x of [t.x0 + 3, t.x0 + 4.45, t.x1 - 4.45, t.x1 - 3]) { ctx.beginPath(); ctx.moveTo(x, t.z0); ctx.lineTo(x, t.z1); ctx.stroke(); }
    }
    if (f.sump) { const s = f.sump; ctx.fillStyle = st.name === 'paper' ? '#9fc4dc' : '#0a1d29'; ctx.fillRect(s.x0, s.z0, s.x1 - s.x0, s.z1 - s.z0); }
    ctx.strokeStyle = st.uEdge; ctx.lineWidth = lw(st.name === 'paper' ? 1.8 : 1.4); ctx.strokeRect(f.x0, f.z0, f.x1 - f.x0, f.z1 - f.z0);
  }
  // join the rooms: re-fill the openings between touching rooms so doorways read as open
  ctx.fillStyle = st.uFloor;
  for (const f of D.walk) for (const g of D.walk) {
    if (f === g) continue;
    const ox0 = Math.max(f.x0, g.x0), ox1 = Math.min(f.x1, g.x1), oz0 = Math.max(f.z0, g.z0), oz1 = Math.min(f.z1, g.z1);
    if (ox1 - ox0 > 0.2 && oz1 - oz0 >= 0 && oz1 - oz0 < 0.5) ctx.fillRect(ox0 + 0.6, oz0 - 0.5, ox1 - ox0 - 1.2, 1.0 + (oz1 - oz0));
    if (oz1 - oz0 > 0.2 && ox1 - ox0 >= 0 && ox1 - ox0 < 0.5) ctx.fillRect(ox0 - 0.5, oz0 + 0.6, 1.0 + (ox1 - ox0), oz1 - oz0 - 1.2);
  }
  paintLinks(ctx, 'U', st, px);
}

function arrowAt(ctx, x, z, ax, az, size, color, px) {
  const nx = -az, nz = ax;
  ctx.fillStyle = color; ctx.beginPath();
  ctx.moveTo(x + ax * size, z + az * size); ctx.lineTo(x - ax * size * 0.6 + nx * size * 0.75, z - az * size * 0.6 + nz * size * 0.75); ctx.lineTo(x - ax * size * 0.15, z - az * size * 0.15); ctx.lineTo(x - ax * size * 0.6 - nx * size * 0.75, z - az * size * 0.6 - nz * size * 0.75); ctx.closePath(); ctx.fill();
  void px;
}

/** Stairs and ramps (striped footprints with an arrow up), lift cars, gate doors. */
export function paintLinks(ctx, level, st, px) {
  const lw = (n) => n * px;
  for (const l of linksAt(level)) {
    if (l.kind === 'lift') {
      ctx.fillStyle = st.name === 'paper' ? '#e1f2f0' : 'rgba(143,216,208,.22)'; ctx.fillRect(l.x0, l.z0, l.x1 - l.x0, l.z1 - l.z0);
      ctx.strokeStyle = st.lift; ctx.lineWidth = lw(st.name === 'paper' ? 1.8 : 1.5); ctx.strokeRect(l.x0, l.z0, l.x1 - l.x0, l.z1 - l.z0);
      ctx.beginPath(); ctx.moveTo(l.x0, l.z0); ctx.lineTo(l.x1, l.z1); ctx.moveTo(l.x1, l.z0); ctx.lineTo(l.x0, l.z1); ctx.lineWidth = lw(0.8); ctx.stroke();
      continue;
    }
    const up = l.lo === level;                                  // this level is the foot of the flight (you climb from here)
    const r = l;
    ctx.fillStyle = l.kind === 'ramp' ? (st.name === 'paper' ? 'rgba(217,106,42,.2)' : 'rgba(255,207,134,.22)') : st.stairsFill; ctx.fillRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0);
    // treads
    ctx.strokeStyle = l.kind === 'ramp' ? st.ramp : st.stairs; ctx.lineWidth = lw(0.9); ctx.beginPath();
    if (l.az) { for (let z = r.z0 + 1; z < r.z1; z += l.kind === 'ramp' ? 3 : 1.8) { ctx.moveTo(r.x0, z); ctx.lineTo(r.x1, z); } }
    else { for (let x = r.x0 + 1; x < r.x1; x += l.kind === 'ramp' ? 3 : 1.8) { ctx.moveTo(x, r.z0); ctx.lineTo(x, r.z1); } }
    ctx.stroke();
    ctx.strokeStyle = l.kind === 'ramp' ? st.ramp : st.stairs; ctx.lineWidth = lw(1.4); ctx.strokeRect(r.x0, r.z0, r.x1 - r.x0, r.z1 - r.z0);
    // an arrow in the middle: up the flight from its foot, down from its head
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, dirx = up ? l.ax : -l.ax, dirz = up ? l.az : -l.az;
    arrowAt(ctx, cx, cz, dirx, dirz, Math.min(3.4, Math.max(2, (l.w ?? 4) * 0.5)), st.name === 'paper' ? '#9a3b0e' : '#fff3cf', px);
  }
  for (const g of gatesAt(level)) {
    const hw = g.width / 2;
    ctx.strokeStyle = st.gate; ctx.lineWidth = lw(st.name === 'paper' ? 3 : 2.6); ctx.lineCap = 'butt';
    ctx.beginPath();
    if (g.axis === 'x') { ctx.moveTo(g.x - hw, g.z); ctx.lineTo(g.x + hw, g.z); } else { ctx.moveTo(g.x, g.z - hw); ctx.lineTo(g.x, g.z + hw); }
    ctx.stroke(); ctx.lineCap = 'round';
  }
}
