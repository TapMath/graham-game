// D-shot vendors (PLAN section 2, 6). Four of the six `world.vendorSpots` are open on a given seed. Each sells
// one kind of illegal health jab, rolled per vendor per run:
//
//   offer = { potency: 2..6 rays, hours: 0.5..3 (the price: time cut from the flood clock while they "fetch it"),
//             risk: 0..0.35 (chance the shot is cut/contaminated), line: flavour text hinting at honesty }
//
// Accepting: the screen fades, `clock.advance(hours)` (Setu's breath keeps draining for that time), then either
// +potency rays, or, if contaminated, -2 rays and a 20 s blur. Repeat buys cost 25% more time each. Declining walks away.
//
//   game.vendors.active           [{id, spot, offer, sold, interactable}]       .stats {shots, contaminated, hours}
//   game.vendors.open(id)         open the dialog as if the player had pressed E at that booth
//   game.vendors.state            'idle' | 'dialog' | 'waiting'
// Events: 'vendor:open' {id}, 'vendor:decline' {id}, 'vendor:purchase' {id, potency, hours, contaminated, rays}.
// Debug: __grahan.do('vendorOpen', id) , __grahan.do('vendorRoll', id, {potency,hours,risk}) to force an offer,
//        state().vendors.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildCharacter, characterMaterial, npcSpec, SKIN } from '../characters/humanoid.js';

export const DSHOT = Object.freeze({ active: 4, potency: [2, 6], hours: [0.5, 0.75, 1, 1.5, 2, 2.5, 3], riskMax: 0.35, contaminationDamage: 2, blurSeconds: 20, repeatMul: 1.25 });

const LINES = {
  clean: [
    'Clean needle, boiled twice. My mother\'s diya burns on it, didi.',
    'Pharmacy grade. I keep the receipts. Do not ask to see the receipts.',
    'Look at my hands. Steady. Sit, breathe, this one is honest.',
  ],
  shaky: [
    'Same lot as last week. Mostly good. Mostly.',
    'Arre, the label rubbed off, but the colour is right. The colour is always right.',
    'It is the real thing, cut a little. Everybody cuts a little.',
  ],
  dodgy: [
    'Special price, festival price! Light for everyone, no? Do not look at the bottle, look at me.',
    'Cheap, fast, my cousin\'s cousin made it. That smell? Lemon. Mostly lemon.',
    'No refunds, no questions. Hurry, the drone is coming back.',
  ],
};
const POTENCY_WORD = { 2: 'a small top-up', 3: 'a decent top-up', 4: 'a proper dose', 5: 'a strong dose', 6: 'the full sun in a syringe' };

const VENDOR_LOOKS = [
  { hair: { style: 'hood', color: 0x2a3a3a }, top: { color: 0x3b5a4a, trim: 0x8ac0a0, length: 'coat' } },
  { hair: { style: 'cap', color: 0x5a2a2a }, top: { color: 0x6a4a2a, trim: 0xd0a060, length: 'shirt', sleeves: 'long' } },
  { hair: { style: 'turban', color: 0x8a3a2a }, top: { color: 0x2a2a3a, trim: 0x9a9ab0, length: 'kurta', sleeves: 'long' } },
  { hair: { style: 'bun', color: 0x1a1412 }, top: { color: 0x7a4a6a, trim: 0xe0b0d0, length: 'kurta', sleeves: 'long' } },
  { hair: { style: 'short', color: 0x2a2218 }, top: { color: 0x4a5a7a, trim: 0xa0b0d0, length: 'shirt', sleeves: 'short' } },
  { hair: { style: 'hood', color: 0x3a2a4a }, top: { color: 0x2a4a4a, trim: 0x80d0c0, length: 'coat' } },
];

const fmtHours = (h) => { const m = Math.round(h * 60); return m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ' ' + String(m % 60).padStart(2, '0') + 'm' : ''}` : `${m} min`; };

export class VendorSystem {
  init(game) {
    this.game = game;
    game.vendors = this;
    this.rng = game.rng.fork('vendors');
    this.state = 'idle';
    this.stats = { shots: 0, contaminated: 0, hours: 0, declined: 0 };
    this.wait = null;
    const spots = game.world.vendorSpots ?? [];
    const open = new Set(this.rng.shuffle(spots.map((s) => s.id)).slice(0, DSHOT.active));
    this.active = [];
    const geos = [];
    spots.forEach((spot, i) => {
      if (!open.has(spot.id)) return;
      const offer = this.rollOffer(spot);
      const v = { id: spot.id, spot, offer, sold: 0, interactable: null };
      this.active.push(v);
      // the figure: a person standing behind the counter under the tarp, facing the customers
      const look = VENDOR_LOOKS[(i + this.rng.int(0, 5)) % VENDOR_LOOKS.length];
      const ch = buildCharacter(npcSpec({ name: 'vendor', height: this.rng.range(1.58, 1.76), skin: this.rng.pick([SKIN.tan, SKIN.brown, SKIN.dark]), hair: look.hair, top: look.top,
        bottom: { color: 0x2a2a30, style: 'trousers' }, glasses: false }), game);
      ch.group.position.set(spot.x, spot.y, spot.z);
      ch.group.rotation.y = spot.yaw;
      geos.push(ch.toStaticGeometry({ armR: 0.95, armL: -0.35 }));
      ch.dispose?.();
      // interact point: in front of the counter
      const fx = -Math.round(Math.sin(spot.yaw)), fz = -Math.round(Math.cos(spot.yaw));
      v.interactable = game.interactables.add({
        id: 'vendor:' + spot.id, pos: { x: spot.x + fx * 2.3, y: spot.y, z: spot.z + fz * 2.3 }, radius: 2.4, height: 2.6,
        prompt: () => (v.sold ? 'Buy another D-shot' : 'Talk to the D-shot vendor'),
        enabled: () => this.state === 'idle',
        onInteract: () => this.open(spot.id),
      });
    });
    if (geos.length) {
      const g = mergeGeometries(geos, false);
      geos.forEach((x) => x.dispose());
      this.mesh = new THREE.Mesh(g, characterMaterial(game));
      this.mesh.name = 'vendors';
      game.scene.add(this.mesh);
    }
    game.debug?.addState('vendors', () => ({
      state: this.state, stats: { ...this.stats },
      active: this.active.map((v) => ({ id: v.id, level: v.spot.level, ...v.offer, line: undefined, sold: v.sold })),
    }));
    game.debug?.addAction('vendorOpen', (g, id) => { this.open(id ?? this.active[0].id); return this.state; });
    game.debug?.addAction('vendorRoll', (g, id, o) => { const v = this._get(id); Object.assign(v.offer, o); return v.offer; });
    game.debug?.addAction('tpVendor', (g, id) => {
      const v = this._get(id ?? this.active[0].id), s = v.spot;
      const fx = -Math.round(Math.sin(s.yaw)), fz = -Math.round(Math.cos(s.yaw));
      g.player.teleport(s.x + fx * 3, s.y, s.z + fz * 3, s.yaw + Math.PI);
      return { id: v.id, level: s.level };
    });
  }

  reset() { this.state = 'idle'; this.wait = null; this.game.modal = false; }

  _get(id) { return this.active.find((v) => v.id === id) ?? this.active[0]; }

  rollOffer(spot) {
    const r = this.rng;
    const potency = r.int(DSHOT.potency[0], DSHOT.potency[1]);
    const hours = r.pick(DSHOT.hours);
    // cheap sellers tend to be worse, but not always (the deck: unpredictable costs by seller)
    const cheap = 1 - (DSHOT.hours.indexOf(hours) / (DSHOT.hours.length - 1));
    const risk = Math.min(DSHOT.riskMax, Math.max(0, DSHOT.riskMax * (0.55 * r.next() + 0.45 * cheap * r.next() * 1.4)));
    const bucket = risk < 0.1 ? 'clean' : risk < 0.22 ? 'shaky' : 'dodgy';
    return { potency, hours, risk: Math.round(risk * 1000) / 1000, bucket, line: r.pick(LINES[bucket]), spotName: spot.name };
  }

  price(v) { return v.offer.hours * Math.pow(DSHOT.repeatMul, v.sold); }

  open(id) {
    const v = this._get(id), game = this.game;
    if (!v || this.state !== 'idle') return;
    this.state = 'dialog';
    const hours = this.price(v);
    game.events.emit('vendor:open', { id: v.id });
    game.dialog.open({
      tag: 'D-SHOT', title: v.spot.name ?? 'Vendor',
      quote: v.sold ? `"Again? Prices go up, didi. ${v.offer.line}"` : `"${v.offer.line}"`,
      rows: [['Offers', `+${v.offer.potency} rays, ${POTENCY_WORD[v.offer.potency]}`], ['Price', `${fmtHours(hours)} of your day`]],
      note: `You wait while they fetch it. The flood clock keeps running, and so does Setu's breath.`,
      choices: [
        { id: 'accept', label: 'Take the shot', keys: ['KeyY', 'Enter', 'Digit1'], hint: 'Y' },
        { id: 'decline', label: 'Walk away', keys: ['KeyN', 'Escape', 'Digit2'], hint: 'N' },
      ],
      onChoose: (choice) => (choice === 'accept' ? this._accept(v, hours) : this._decline(v)),
    });
  }

  _decline(v) {
    this.state = 'idle'; this.stats.declined++;
    this.game.events.emit('vendor:decline', { id: v.id });
    this.game.messages?.say('You shake your head. The vendor shrugs and goes back to his phone.', { kind: 'system', ttl: 4 });
  }

  _accept(v, hours) {
    this.state = 'waiting';
    this.game.modal = true;
    this.wait = { v, hours, t: 0, applied: false };
    this.game.screenfx.fade(1, 0.6, '#000');
  }

  _apply(w) {
    const game = this.game, v = w.v;
    const contaminated = this.rng.chance(v.offer.risk);
    v.sold++; this.stats.shots++; this.stats.hours += w.hours;
    game.clock.advance(w.hours, 'dshot');
    const rays0 = game.player.rays;
    if (contaminated) {
      this.stats.contaminated++;
      game.health.damage(DSHOT.contaminationDamage, 'dshot');
      game.screenfx.blur(7, DSHOT.blurSeconds);
      game.screenfx.flash('#a0ff40', 600, 0.25);
      game.messages?.say('Wrong. The syringe tastes of lemon and tin. The world smears at the edges and your stomach turns. (-2 rays)', { kind: 'story', ttl: 9 });
    } else {
      game.health.heal(v.offer.potency, 'dshot');
      game.messages?.say(`Cold, then warm, then a little like sunlight under the skin. (+${game.player.rays - rays0} rays)`, { kind: 'story', ttl: 7 });
    }
    game.messages?.say(`${fmtHours(w.hours)} gone. It is ${game.clock.hhmm}.`, { kind: 'system', ttl: 6 });
    game.events.emit('vendor:purchase', { id: v.id, potency: v.offer.potency, hours: w.hours, contaminated, rays: game.player.rays });
  }

  update(dt) {
    const w = this.wait;
    if (!w) return;
    w.t += dt;
    if (!w.applied && w.t >= 0.7) { w.applied = true; this._apply(w); this.game.screenfx.fade(0, 0.8, '#000'); }
    if (w.t >= 1.6) { this.wait = null; this.state = 'idle'; this.game.modal = false; }
  }
}
