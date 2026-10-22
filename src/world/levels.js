// The five vertical layers of the city (see PLAN.md section 3). Walk-surface Y values.
export const LEVELS = [
  { id: 'U',  name: 'Underground', y: -8 },
  { id: 'G',  name: 'Ground',      y: 0 },
  { id: 'L1', name: 'Walkways',    y: 12 },
  { id: 'L2', name: 'Flyovers',    y: 24 },
  { id: 'L3', name: 'Upper decks', y: 38 },
];

/** Level id for a feet Y: nearest walk surface at or below (+ a little slack for steps/jumps). */
export function levelAt(y) {
  let id = LEVELS[0].id;
  for (const l of LEVELS) if (y >= l.y - 4) id = l.id;
  return id;
}
