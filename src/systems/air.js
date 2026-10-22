// Air quality. One place to ask "how bad is the air here?" so health, Setu's breath and (Phase 4) the
// smog visuals agree.
//
//   game.air.at(pos) -> { smog: 0..1, dust: 0..1, tunnel: 0|1 }     (a shared object, do not keep it)
//   game.air.addSource((pos, out) => { out.smog = Math.max(out.smog, ...) })   Phase 4 plugs hazards in here
//
// Default sources: the smog volumes (Phase 4: game.hazards.smog, seeded; falls back to world.hazardZones.smog rects when
// there is no hazard system) and "tunnel" = underground.
export class AirSystem {
  init(game) {
    this.game = game;
    game.air = this;
    this.out = { smog: 0, dust: 0, tunnel: 0 };
    this.sources = [(pos, out) => {
      // Phase 4: the hazard system owns the smog volumes (seeded margins, off when hazards are off) and collapse dust
      if (this.hazardSmog) this.hazardSmog.smogAt(pos, out);
      else { const zones = game.world?.hazardZones?.smog;
      if (zones) for (const z of zones) {
        if (pos.x >= z.x0 && pos.x <= z.x1 && pos.z >= z.z0 && pos.z <= z.z1 && pos.y >= z.y0 - 0.5 && pos.y <= z.y1) { out.smog = 1; break; }
      } }
      if (pos.y < -4) out.tunnel = 1;
    }];
  }
  addSource(fn) { this.sources.push(fn); }
  at(pos) {
    const o = this.out; o.smog = 0; o.dust = 0; o.tunnel = 0;
    for (const s of this.sources) s(pos, o);
    return o;
  }
}
