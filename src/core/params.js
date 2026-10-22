// URL parameters: seed, minutes, debug, autostart, mute, arena.
// `minutes` = total real-time length of the run (05:40 day 1 to 06:00 day 2). Default: 1 game hour = 1.25 real minutes.
export const GAME_HOURS = 24 + 20 / 60;                 // 05:40 -> 06:00 next day
export const DEFAULT_MINUTES = GAME_HOURS * 1.25;       // about 30.4 real minutes
export function parseParams(search = '') {
  const q = new URLSearchParams(search);
  const flag = (k) => q.has(k) && q.get(k) !== '0' && q.get(k) !== 'false';
  const num = (k, def) => { const v = Number(q.get(k)); return q.has(k) && Number.isFinite(v) ? v : def; };
  const seedGiven = q.has('seed') && Number.isFinite(Number(q.get('seed')));
  return {
    seed: seedGiven ? Number(q.get('seed')) >>> 0 : (Math.random() * 4294967296) >>> 0,
    seedGiven,
    minutes: Math.max(0.5, num('minutes', DEFAULT_MINUTES)),   // total real minutes of the run (the clock, Phase 3)
    minutesGiven: q.has('minutes'),
    debug: flag('debug'),
    autostart: flag('autostart'),
    mute: flag('mute'),
    arena: flag('arena'),          // Phase 2 makes the city default; ?arena=1 keeps the test arena
  };
}
