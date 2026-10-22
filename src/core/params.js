// URL parameters: seed, minutes, debug, autostart, mute, arena.
export function parseParams(search = '') {
  const q = new URLSearchParams(search);
  const flag = (k) => q.has(k) && q.get(k) !== '0' && q.get(k) !== 'false';
  const num = (k, def) => { const v = Number(q.get(k)); return q.has(k) && Number.isFinite(v) ? v : def; };
  const seedGiven = q.has('seed') && Number.isFinite(Number(q.get('seed')));
  return {
    seed: seedGiven ? Number(q.get('seed')) >>> 0 : (Math.random() * 4294967296) >>> 0,
    seedGiven,
    minutes: num('minutes', 24),   // real minutes for the 24 h flood clock (Phase 3)
    debug: flag('debug'),
    autostart: flag('autostart'),
    mute: flag('mute'),
    arena: flag('arena'),          // Phase 2 makes the city default; ?arena=1 keeps the test arena
  };
}
