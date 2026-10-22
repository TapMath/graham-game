// Phase 5 systems are optional senses and sound: a bug in one of them must never stop the simulation loop.
// `guarded(system, name)` wraps its update(): an exception is logged (the first few times) and swallowed.
export function guarded(system, name) {
  const update = system.update ? system.update.bind(system) : null;
  if (!update) return system;
  let n = 0;
  system.update = (dt, game) => {
    try { update(dt, game); } catch (e) { if (n++ < 3) console.error(`[${name}] update failed:`, e); }
  };
  return system;
}
