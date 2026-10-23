// Setu's timetable and breath curve as pure functions (no DOM, no three.js), so they can be tuned in node.
//
// The map's `setuTimeline` (PLAN 1b step 5) lists where Setu is, in game hours from 00:00 day 1:
//   liftWreck 5.67-9 -> catacombs 9-14 -> boringSite 14-18 -> clinic 18-23 -> ventExit 23-23.5 -> triageTents 23.5-28 -> bridge 28-
// `buildSchedule` jitters the window boundaries by a seeded +-1 h (the vent exit is a short fixed 0.5 h hop
// right after the clinic) and keeps them ordered.
//
// Breath: health 100 -> 0 (BREATH.perHour % per game hour at normal air). Tuned (Phase 7b) so that a Setu who is never
// found dies at about 04:15 (in game; the node sim in tools says 03:53, the vent hop and dust add 20 minutes) (the doctor's visit at the clinic window start gives +BREATH.doctorBoost).
export const BREATH = Object.freeze({
  perHour: 5.15,          // % lost per game hour in ordinary air (Phase 7b: 5.34 -> 5.15, a never-found Setu now dies at about 04:15, not 03:08)
  tunnelMul: 1.25,       // stale tunnel air (underground)
  smogMul: 2.5,
  dustMul: 1.8,
  ventMul: 0.2,          // standing by an air vent
  doctorBoost: 36,       // the underground doctor's inhaler
  foundMul: 1 / 3,       // after the pill and inhaler: a third of the rate
  jitter: 1.0,           // +- hours on the window boundaries
});

/** Returns [{id, level, x, y, z, from, to}] with jittered, ordered windows. `rng` needs range(a, b). */
export function buildSchedule(timeline, rng, jitter = BREATH.jitter) {
  const n = timeline.length;
  const out = timeline.map((w) => ({ ...w }));
  // shared boundary i is between window i and i+1
  let prev = out[0].from;
  for (let i = 0; i < n - 1; i++) {
    let b;
    if (timeline[i].id === 'ventExit') b = out[i].from + (timeline[i].to - timeline[i].from);   // the vent hop keeps its 0.5 h
    else { const j = timeline[i].jitter ?? jitter; b = timeline[i].to + rng.range(-j, j); }
    b = Math.max(b, prev + 0.5);
    out[i].to = b; out[i + 1].from = b; prev = b;
  }
  out[n - 1].to = 99;
  return out;
}

/** The window (and index) Setu occupies at absolute hour t. */
export function windowAt(schedule, t) {
  for (let i = schedule.length - 1; i >= 0; i--) if (t >= schedule[i].from) return i;
  return 0;
}

/** Breath lost per game hour at a place. env: {level:'U'|'G'|.., smog, dust, nearVent, found} */
export function breathRate(env) {
  let r = BREATH.perHour;
  if (env.level === 'U' || env.tunnel) r *= BREATH.tunnelMul;
  if (env.smog) r *= BREATH.smogMul;
  if (env.dust) r *= BREATH.dustMul;
  if (env.nearVent) r *= BREATH.ventMul;
  if (env.found) r *= BREATH.foundMul;
  return r;
}
