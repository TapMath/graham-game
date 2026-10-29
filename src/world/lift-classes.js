// The capsule lift classes (Phase 9A): how many can ride, how big the car is, what a ride costs and what the cell holds.
//
//   solo     1 rider (Mithi alone; her followers wait for the next cycle). Cheap and quick: short hops.
//   family   4 riders: the party (Mithi, Jeetu, Setu) fits.
//   public   12 riders: shared with the crowd (full at rush hour); slower, stops at more floors.
//   freight  24 riders / cargo: big, slow and dear; it carries crowds and vehicles.
//
// `cost` scales a ride's charge (capacity x height): units = metres x LIFT_TUNING.costPerM x cost (a family car is the Phase 8B price).
// `rate` scales the solar cell (a bigger car carries a bigger panel, so the refill takes about as long). `speed` m/s, `dwell` s, `cycle` s:
// how long a public or freight car takes to turn round when it is full (the "next one" you wait for), `h` the height of the glass.
export const LIFT_CLASSES = Object.freeze({
  solo: { id: 'solo', name: 'Solo capsule', cap: 1, size: [2.4, 2.4], cost: 0.6, rate: 0.7, speed: 5.5, dwell: 2, cycle: 8, h: 2.5, glass: 0x9fe8d8 },
  family: { id: 'family', name: 'Family capsule', cap: 4, size: [4, 4], cost: 1.0, rate: 1.0, speed: 4, dwell: 3, cycle: 14, h: 2.8, glass: 0xb8e0ff },
  public: { id: 'public', name: 'Public capsule', cap: 12, size: [6, 4], cost: 1.5, rate: 1.3, speed: 2.8, dwell: 6, cycle: 22, h: 3.0, glass: 0xffd9a0 },
  freight: { id: 'freight', name: 'Freight capsule', cap: 24, size: [10, 4], cost: 2.2, rate: 1.7, speed: 1.9, dwell: 9, cycle: 34, h: 3.4, glass: 0xffb86a },
});

export const liftClass = (id) => LIFT_CLASSES[id] ?? LIFT_CLASSES.family;
