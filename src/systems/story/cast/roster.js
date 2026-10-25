// The cast of PLAN 1b as data: who stands where, in what clothes. Positions come from `game.world.story` (Phase 2 POIs) plus
// small offsets so nobody stands in a prop. Specs are Phase 3's `npcSpec` / `NPC_PRESETS` with story-specific tweaks
// (a bandaged arm, a sari and dark glasses, the Big Man's build...). Each entry is one of:
//   kind 'static'  one merged mesh, 1 draw call (baked rest pose, lying or standing)
//   kind 'anim'    a walking `Character` (5 draw calls) - only the ones that move: Jeetu, Gautam
//   kind 'group'   several bystanders merged into ONE mesh (1 draw call), world-space geometry
import { NPC_PRESETS, SKIN, npcSpec } from '../../../characters/humanoid.js';

const P = NPC_PRESETS;
const rot = (n) => n * Math.PI / 180;

export const SPECS = {
  // Jeetu, nine, in the red tee he wore up the flyover, a bandaged arm and head from the hospital
  jeetu: npcSpec({ ...P.jeetu, name: 'Jeetu', props: ['bandage', 'headBand'], variants: { torch: { props: ['bandage', 'torch'] }, plain: { props: ['bandage'] } } }),
  // an elegant actress: a deep teal sari with a gold border, a cream-and-gold pallu over the left shoulder, a low bun, dark glasses
  tara: npcSpec({ name: 'Tara Shahjehan', height: 1.68, build: 'slim', sex: 'f', skin: SKIN.light, glasses: 'dark', bindi: '#8a2a30', age: 0.1,
    hair: { style: 'bunLow', color: 0x1c120e }, top: { color: 0xc9a24a, trim: 0xe3c46a, length: 'sari', sleeves: 'short' }, bottom: { color: 0x14595a, style: 'skirt' }, shoes: 0xc8a850,
    scarf: { color: 0x1c7a78, trim: 0xe3c46a, style: 'sash' }, props: ['bangles'], gestures: ['explain', 'chest', 'wring', 'shrug'] }),
  // the film star, in a hospital gown, a bandage round his head
  sameer: npcSpec({ name: 'Sameer Shahjehan', height: 1.82, build: 'normal', sex: 'm', skin: SKIN.light, hair: { style: 'side', color: 0x1a120e }, top: { color: 0xc9d9dc, trim: 0x99aabb, length: 'tee', sleeves: 'short' }, bottom: { color: 0xc9d9dc, style: 'trousers' }, props: ['bandage', 'headBand'] }),
  gautam: npcSpec({ ...P.gautam, name: 'Gautam', top: { color: 0x6a7480, trim: 0xa8b0b8, length: 'shirt', sleeves: 'long' }, props: ['bandage'], gestures: ['explain', 'emphasis', 'hips', 'shrug'] }),
  aayat: npcSpec({ ...P.aayat, name: 'Aayat', top: { color: 0x8a7a58, trim: 0xc8b890, length: 'kurta', sleeves: 'long' }, hair: { style: 'braid', color: 0x14100e, tie: 0x9a3a2a },
    scarf: { color: 0x7a3a32, trim: 0xc8a040, style: 'neck' }, gestures: ['explain', 'shrug', 'point'] }),
  // the Big Man: a wide, heavy man in a dark waistcoat over a cream kurta, a dark-red turban, a moustache
  kaalu: npcSpec({ ...P.kaalu, name: 'Kaalu Seth', build: 'big', height: 1.86, age: 0.35, top: { color: 0x1a1a1e, trim: 0xd0a840, inner: 0xd8cfae, length: 'coat', sleeves: 'long' }, gestures: ['wide', 'emphasis', 'hips', 'point'] }),
  // the contractor: pressed beige safari shirt, a SURYA hard hat, clear glasses, grey at the temples
  contractor: npcSpec({ name: 'The contractor', height: 1.84, build: 'slim', sex: 'm', skin: SKIN.tan, glasses: 'clear', age: 0.45, hair: { style: 'side', color: 0x6a6a68 },
    top: { color: 0xb4ae92, trim: 0xd8d4b8, length: 'shirt', sleeves: 'long' }, bottom: { color: 0x3c3c3a, style: 'trousers' }, shoes: 0x1a1612, props: ['bag', 'hardHat', 'badge'], gestures: ['explain', 'cross', 'shrug'] }),
  doctor: npcSpec({ ...P.doctor, name: 'The doctor', props: ['headLamp'], glasses: 'clear', gestures: ['cross', 'explain', 'shrug', 'chest'] }),
  oldman: npcSpec({ name: 'Old man', height: 1.62, build: 'slim', sex: 'm', age: 0.85, skin: SKIN.dark, hair: { style: 'balding', color: 0xb8b4aa },
    top: { color: 0xb4ac98, trim: 0xd8d0b8, length: 'kurta', sleeves: 'long' }, bottom: { color: 0xc8c0aa, style: 'lungi' }, barefoot: true, shoes: null, props: [], gestures: ['chest', 'explain', 'beckon'] }),
  boyA: npcSpec({ name: 'Raju', height: 1.2, build: 'child', sex: 'm', skin: SKIN.brown, hair: { style: 'crop', color: 0x16110e }, top: { color: 0xd0a030, trim: 0xe8d080, length: 'tee', sleeves: 'short' }, bottom: { color: 0x44505e, style: 'shorts' }, barefoot: true, shoes: null, props: ['torch'] }),
  boyB: npcSpec({ name: 'Bunty', height: 1.12, build: 'child', sex: 'm', skin: SKIN.dark, hair: { style: 'short', color: 0x2a1a12 }, top: { color: 0x7a3a3a, trim: 0xc08080, length: 'tee', sleeves: 'short' }, bottom: { color: 0x303030, style: 'shorts' }, barefoot: true, shoes: null }),
  patient: npcSpec({ ...P.tunnelDweller, name: 'Patient', sex: 'm', hair: { style: 'crop', color: 0x1a1512 }, top: { color: 0xb4cac6, trim: 0xd8e8e4, length: 'tee', sleeves: 'short' }, bottom: { color: 0xb4cac6, style: 'trousers' }, props: ['bandage'] }),
  patientB: npcSpec({ ...P.tunnelDweller, name: 'Patient', skin: SKIN.brown, hair: { style: 'long', color: 0x1a1210 }, top: { color: 0xb4cac6, trim: 0xd8e8e4, length: 'tee', sleeves: 'short' }, bottom: { color: 0xb4cac6, style: 'trousers' }, props: ['headBand'] }),
};

const rescuer = (jacket, skin = SKIN.brown, hat = true, hair = 'crop') => npcSpec({ ...P.rescuer, skin, jacket: { color: jacket, stripe: 0xe8e8a0 }, hair: { style: hat ? 'crop' : hair, color: 0x14100e }, props: hat ? ['hardHat'] : [] });
const nurse = (hair, top) => npcSpec({ ...P.nurse, hair: { style: hair, color: 0x14100e }, top: { color: top, trim: 0xe0f0f0, length: 'kurta', sleeves: 'short' }, props: ['badge'] });
const dweller = (top, skin = SKIN.deep, hair = 'long') => npcSpec({ ...P.tunnelDweller, skin, hair: { style: hair, color: 0x0e0c0a }, top: { color: top, trim: 0x706a60, length: 'kurta', sleeves: 'long' } });

/** All cast entries. `S` is game.world.story. */
export function buildRoster(S) {
  const h = S.hospital, cat = S.catacombs, bs = S.boringSite, cl = S.clinic;
  return [
    // ---- named, single
    { id: 'jeetu', kind: 'anim', mood: 'worry', spec: SPECS.jeetu, name: 'Jeetu', role: 'FRIEND', portrait: 'boy', color: '#ff9f8a', x: -60, y: 0.76, z: 90.15, yaw: 0, lying: true, level: 'G', radius: 3.2, talkAt: { x: -58.4, z: 90.5 } },
    { id: 'tara', kind: 'anim', mood: 'worry', spec: SPECS.tara, name: 'Tara Shahjehan', role: 'ACTRESS', portrait: 'woman', color: '#7fe0d8', x: h.taraRoom.x, z: h.taraRoom.z, yaw: rot(8), arms: { armR: 0.35, armL: 0.1 }, level: 'G', radius: 3 },
    { id: 'sameer', kind: 'static', spec: SPECS.sameer, name: 'Sameer Shahjehan', role: 'ICU', portrait: 'man', color: '#ffdf9a', x: h.icu.x, y: 0.76, z: 89.35, yaw: 0, lying: true, level: 'G', radius: 3.2 },
    { id: 'gautam', kind: 'anim', spec: SPECS.gautam, name: 'Gautam', role: 'IN CUSTODY', portrait: 'man', color: '#a8c4e8', x: S.policeStation.cell.x, z: S.policeStation.cell.z, yaw: Math.PI, level: 'G', radius: 7 },   // Phase 7b: he is behind the bars at z -81, so the player stands 5.5+ m away (it was 3.6: unreachable)
    { id: 'aayat', kind: 'anim', mood: 'worry', spec: SPECS.aayat, name: 'Aayat', role: 'THE TUNNELS', portrait: 'girl', color: '#f0c890', x: cat.aayatHome.x - 1.4, y: -8, z: cat.aayatHome.z + 1.6, yaw: Math.PI * 0.95, arms: { armR: 0.15 }, level: 'U', radius: 3 },
    { id: 'kaalu', kind: 'anim', mood: 'smirk', spec: SPECS.kaalu, name: 'Kaalu Seth', role: 'THE BIG MAN', portrait: 'big', color: '#ff9a70', x: bs.foreman.x + 0.5, y: -8, z: bs.foreman.z + 1.4, yaw: rot(80), arms: { armR: 0.7, armL: 0.2 }, level: 'U', radius: 3.4 },
    { id: 'contractor', kind: 'anim', spec: SPECS.contractor, name: 'The contractor', role: 'SURYA SUBCONTRACT', portrait: 'man', color: '#c8d0a0', x: bs.x + 8.5, y: -8, z: bs.z + 2.2, yaw: rot(-35), arms: { armR: 0.3 }, level: 'U', radius: 3.2 },
    { id: 'doctor', kind: 'anim', mood: 'worry', spec: SPECS.doctor, name: 'The doctor', role: 'CLINIC', portrait: 'doctor', color: '#cfe8e0', x: cl.x - 2.6, y: -8, z: cl.z - 2.4, yaw: rot(60), arms: { armR: 0.25, armL: 0.25 }, level: 'U', radius: 3.2 },
    { id: 'oldman', kind: 'oldman', spec: SPECS.oldman, name: 'Old man', role: 'UNDER THE RUBBLE', portrait: 'old', color: '#dccfae', x: -38.2, z: -26.3, yaw: rot(-70), level: 'G', radius: 2.7 },
    // ---- bystander groups, one draw call each
    { id: 'rescuers-collapse', kind: 'group', name: 'Rescuer', role: 'RESCUE', portrait: 'worker', color: '#ffa84a', level: 'G', radius: 2.6, centre: { x: -45, z: -26 },
      members: [
        { spec: rescuer(0xe88a20), x: -49.6, z: -21.4, yaw: rot(200), arms: { armR: 0.9 } },
        { spec: rescuer(0xd8c020, SKIN.tan), x: -40.8, z: -21.8, yaw: rot(140), arms: { armR: 0.4, armL: 0.6 } },
        { spec: rescuer(0xe86a20, SKIN.dark, false), x: -35.3, z: -29.8, yaw: rot(70), arms: { armL: 0.7 } },
        { spec: rescuer(0xe88a20, SKIN.brown), x: -53.6, z: -30.6, yaw: rot(-60), arms: { armR: 0.5, armL: 0.5 } },
        { spec: rescuer(0xc0d040, SKIN.tan), x: -47.4, z: -33.4, yaw: rot(10), arms: { armR: 0.8 } },
      ] },
    { id: 'rescuers-triage', kind: 'group', name: 'Rescuer', role: 'TRIAGE', portrait: 'worker', color: '#ff9a86', level: 'G', radius: 2.6, centre: { x: -46, z: -6 },
      members: [
        { spec: rescuer(0xe8e8e0, SKIN.brown, false), x: -51.5, z: -6.3, yaw: rot(190), arms: { armR: 0.4 } },
        { spec: rescuer(0xe8e8e0, SKIN.tan, false), x: -44.6, z: -6.8, yaw: rot(150) },
        { spec: rescuer(0xd86a30, SKIN.dark), x: -38.2, z: -6.4, yaw: rot(230), arms: { armL: 0.8 } },
      ] },
    { id: 'nurses', kind: 'group', name: 'Nurse', role: 'SION GENERAL', portrait: 'nurse', color: '#9ae0d8', level: 'G', radius: 2.6, centre: { x: -48, z: 78 },
      members: [
        { spec: nurse('bun', 0x58a0a0), x: -50.8, z: 77.2, yaw: rot(170), arms: { armR: 0.5 } },
        { spec: nurse('long', 0x6a8ec0), x: -45.6, z: 76.2, yaw: rot(200) },
        { spec: nurse('bun', 0x58a0a0), x: -57.3, z: 85.1, yaw: rot(260), arms: { armL: 0.5 } },
        { spec: nurse('long', 0x7aa890), x: -52.2, z: 88.6, yaw: rot(110) },
      ] },
    { id: 'patients', kind: 'group', name: 'Patient', role: 'SION GENERAL', portrait: 'man', color: '#b4cac6', level: 'G', radius: 2.4, centre: { x: -50, z: 86 }, talkable: false,
      members: [
        { spec: SPECS.patient, x: -60, y: 0.76, z: 82.2, yaw: 0, lying: true }, { spec: SPECS.patientB, x: -60, y: 0.76, z: 86.2, yaw: 0, lying: true },
        { spec: SPECS.patientB, x: -56, y: 0.76, z: 82.7, yaw: 0, lying: true }, { spec: SPECS.patient, x: -52, y: 0.76, z: 82.7, yaw: 0, lying: true },
        { spec: SPECS.patient, x: -50, y: 0.76, z: 91.2, yaw: 0, lying: true }, { spec: SPECS.patientB, x: -44.5, y: 0.76, z: 82.7, yaw: 0, lying: true },
        { spec: SPECS.patient, x: -39, y: 0.76, z: 82.7, yaw: 0, lying: true },
      ] },
    { id: 'torchBoys', kind: 'group', name: 'The torch boys', role: 'NEAR THE SLUM', portrait: 'boy', color: '#ffd080', level: 'G', radius: 3, centre: { x: -82, z: -69 },
      members: [{ spec: SPECS.boyA, x: -82.2, z: -69.6, yaw: rot(-70), arms: { armR: 0.9 } }, { spec: SPECS.boyB, x: -80.6, z: -67.8, yaw: rot(-110), arms: { armL: 0.3 } }] },
    { id: 'sleepers', kind: 'group', name: 'A sleeper', role: 'THE CATACOMBS', portrait: 'man', color: '#9a9488', level: 'U', radius: 2.4, centre: { x: -98, z: 22 },
      members: [
        { spec: dweller(0x5a4a40), x: -108.2, y: -7.76, z: 14.5, yaw: rot(90), lying: true }, { spec: dweller(0x40505a, SKIN.dark, 'bun'), x: -88.2, y: -7.76, z: 14.5, yaw: rot(90), lying: true },
        { spec: dweller(0x4a4a3a), x: -108.2, y: -7.76, z: 29.5, yaw: rot(90), lying: true }, { spec: dweller(0x5a3a3a, SKIN.brown, 'bun'), x: -98.7, y: -7.76, z: 29.5, yaw: rot(90), lying: true },
        { spec: dweller(0x3a4a4a), x: -89.2, y: -7.76, z: 29.5, yaw: rot(90), lying: true },
      ] },
  ];
}
