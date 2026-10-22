// The catalogue of sound kinds: the contract kinds from PLAN section 9 (Phase 4 <-> Phase 5) plus a few of our own
// (drip, bird, ...). Per kind: mix gain, default loudness, a minimum gap between plays, a concurrency cap, the
// ripple tone (how Mithi sees it), and an optional caption.
//
// Audibility is one rule shared by the audio and the ripples: a sound is heard (and seen as a ripple) only inside
// `audibleRange`, which grows with loudness and shrinks where it is loud around the listener.

export const KINDS = {
  // dogs
  bark: { gain: 0.9, loud: 0.7, gap: 0.12, max: 4, tone: 'threat', caption: 'A dog barks', dur: 0.8 },
  growl: { gain: 0.8, loud: 0.5, gap: 0.5, max: 3, tone: 'threat', dur: 1.6 },
  bite: { gain: 0.9, loud: 0.6, gap: 0.3, max: 2, tone: 'threat', dur: 0.9 },
  whimper: { gain: 0.6, loud: 0.35, gap: 0.5, max: 2, tone: 'neutral', dur: 1.6 },
  // machines
  drone: { gain: 0.7, loud: 0.5, gap: 0.4, max: 3, tone: 'machine', dur: 1.2 },
  'drone-alert': { gain: 0.8, loud: 0.8, gap: 0.8, max: 2, tone: 'threat', caption: 'A drone shrills an alert', dur: 1.0 },
  'camera-alert': { gain: 0.7, loud: 0.6, gap: 0.8, max: 2, tone: 'threat', caption: 'A camera chirps', dur: 0.7 },
  // structure
  crack: { gain: 0.9, loud: 0.8, gap: 0.2, max: 3, tone: 'neutral', caption: 'Concrete cracks', dur: 0.9 },
  collapse: { gain: 1.0, loud: 1.0, gap: 1.0, max: 2, tone: 'neutral', caption: 'Something heavy collapses', dur: 3.7 },
  // people
  mutter: { gain: 0.7, loud: 0.35, gap: 0.5, max: 3, tone: 'neutral', dur: 1.4 },
  grab: { gain: 0.8, loud: 0.55, gap: 0.5, max: 2, tone: 'threat', dur: 1.2 },
  cough: { gain: 0.7, loud: 0.3, gap: 0.3, max: 3, tone: 'neutral', dur: 1.0 },
  wheeze: { gain: 0.5, loud: 0.2, gap: 1.0, max: 1, tone: 'setu', dur: 1.7 },
  'guard-shout': { gain: 0.9, loud: 0.8, gap: 0.6, max: 2, tone: 'threat', caption: 'A guard shouts', dur: 1.0 },
  footstep: { gain: 0.7, loud: 0.25, gap: 0.08, max: 6, tone: 'step', dur: 0.4 },
  'vendor-call': { gain: 0.7, loud: 0.5, gap: 1.0, max: 2, tone: 'neutral', caption: 'A vendor calls out', dur: 1.3 },
  // water
  splash: { gain: 0.8, loud: 0.45, gap: 0.2, max: 3, tone: 'water', dur: 1.0 },
  'water-rush': { gain: 0.9, loud: 0.8, gap: 1.0, max: 2, tone: 'water', dur: 3.3 },
  // Setu
  mouthorgan: { gain: 1.0, loud: 0.75, gap: 0.5, max: 2, tone: 'setu', caption: 'A mouth organ, far off', dur: 3.2 },
  // ambience one-shots (our own kinds)
  clank: { gain: 0.6, loud: 0.2, gap: 1, max: 2, tone: 'machine', dur: 1.6 },
  drip: { gain: 0.45, loud: 0.12, gap: 0.05, max: 6, tone: 'drip', dur: 0.4 },
  bird: { gain: 0.5, loud: 0.25, gap: 0.5, max: 3, tone: null, dur: 1.2 },
  // the player's own
  caneTap: { gain: 0.55, loud: 0.2, gap: 0.1, max: 3, tone: null, dur: 0.2 },
  jump: { gain: 0.5, loud: 0.2, gap: 0.2, max: 2, tone: null, dur: 0.3 },
  land: { gain: 0.8, loud: 0.4, gap: 0.2, max: 2, tone: null, dur: 0.6 },
  breath: { gain: 0.7, loud: 0.3, gap: 0.3, max: 2, tone: null, dur: 0.8 },
  hurt: { gain: 0.8, loud: 0.5, gap: 0.3, max: 2, tone: null, dur: 0.6 },
  heal: { gain: 0.5, loud: 0.3, gap: 1.2, max: 1, tone: null, dur: 1.5 },
  heartbeat: { gain: 0.8, loud: 0.3, gap: 0.5, max: 1, tone: null, dur: 0.8 },
  'gate-buzz': { gain: 0.7, loud: 0.5, gap: 0.5, max: 1, tone: 'machine', dur: 0.7 },
  'gate-chime': { gain: 0.6, loud: 0.5, gap: 0.5, max: 1, tone: null, dur: 1.4 },
  'vision-sting': { gain: 0.9, loud: 0.5, gap: 1, max: 1, tone: null, dur: 3 },
  'pa-chime': { gain: 0.6, loud: 0.5, gap: 1, max: 1, tone: null, dur: 1.6 },
  'pa-squelch': { gain: 0.5, loud: 0.5, gap: 0.1, max: 2, tone: null, dur: 0.3 },
  'pa-babble': { gain: 0.6, loud: 0.5, gap: 1, max: 1, tone: null, dur: 5 },
};

/** Loop kinds from the contract (plus our own: lift, neon). */
export const LOOP_KINDS = ['drone', 'water', 'smog-wind', 'machine', 'crowd', 'dog-pant', 'lift', 'neon'];

const COLLAPSE = { x: -44, z: -30, r: 65 };

/**
 * 1 = quiet around the listener, down to 0.6 where it is loud: the crash site and its rescue noise on the ground,
 * traffic on the flyovers. Only the player is ever the listener.
 */
export function loudZoneFactor(game) {
  const p = game.player; if (!p) return 1;
  const lvl = p.level;
  if (lvl === 'G' && Math.hypot(p.pos.x - COLLAPSE.x, p.pos.z - COLLAPSE.z) < COLLAPSE.r) return 0.6;
  if (lvl === 'L2') return 0.6;
  return 1;
}

/** Metres at which a sound of `loud` (0..1) stops being heard. loud 0.75 reaches 150 m when it is quiet, 90 m when loud around. */
export function audibleRange(game, loud) {
  return (25 + 170 * Math.max(0, Math.min(1, loud))) * loudZoneFactor(game);
}
