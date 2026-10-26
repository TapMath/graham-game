// Who is who (Phase 8C): the spec format, the skin palette, Mithi, Setu and the starting looks for everyone else.
//
// A spec describes a person (every field but name/height/build is optional):
//   { name, height, build:'slim'|'normal'|'stocky'|'child'|'teen'|'big', sex:'f'|'m', age:0..1 (grey, lines, stoop),
//     skin, glasses:true|'dark'|'clear', facial:'moustache'|'beard'|'stubble', bindi:colour,
//     hair:{color, style:'braid'|'long'|'bob'|'short'|'crop'|'side'|'slick'|'bun'|'bunLow'|'cap'|'hood'|'bald'|'balding'|'turban', tie},
//     top:{color, trim, inner, length:'shirt'|'kurta'|'longKurta'|'coat'|'sari'|'tee', sleeves:'short'|'long'},
//     bottom:{color, style:'trousers'|'salwar'|'shorts'|'lungi'|'skirt'}, shoes:colour|null, barefoot:true,
//     scarf:{color, trim, style:'neck'|'sash'}|null, jacket:{color, stripe}|null,
//     props:['cane','mouthOrgan','torch','bag','hardHat','bandage','headBand','headLamp','bangles','badge'],
//     gestures:[...names], variants:{ name: {...fields to override} } }
// Everything is in metres. `height` is the whole person; proportions follow (about 7.5 heads for adults, 5.5 for children).

export const SKIN = { light: 0xe0b48f, tan: 0xc48d62, brown: 0xa5724a, dark: 0x7e5036, deep: 0x5a3826 };

export const MITHI = Object.freeze({
  name: 'Mithi', height: 1.62, build: 'slim', sex: 'f', skin: SKIN.brown, glasses: 'dark',
  hair: { color: 0x120d0b, style: 'braid', tie: 0xb8302a },
  // a plain dark kurta with a thin embroidered neckline, churidar, a plum dupatta with a gold border
  top: { color: 0x2c3556, trim: 0x9aa4c8, length: 'longKurta', sleeves: 'long' },
  bottom: { color: 0x1c2036, style: 'salwar' }, shoes: 0x2b211c,
  scarf: { color: 0x6a2f52, trim: 0xd0a84a, style: 'neck' },
  jacket: null,
  props: ['cane', 'bangles'],
  gestures: ['chest', 'explain', 'shrug'],
  // the blue Metro-worker jacket from the dead neighbour's flat (PLAN 1b disguise)
  variants: { jacket: { jacket: { color: 0x2f6db3, stripe: 0xe8e060 }, scarf: null } },
});

export const SETU = Object.freeze({
  name: 'Setu', height: 1.2, build: 'child', sex: 'm', skin: SKIN.brown,
  hair: { color: 0x15110f, style: 'short' },
  top: { color: 0xd49a2c, trim: 0xf0d27a, length: 'tee', sleeves: 'short' },
  bottom: { color: 0x3a4a6a, style: 'shorts' }, shoes: 0x7a3a2a,
  scarf: null, jacket: null,
  props: ['mouthOrgan'],
  gestures: ['explain', 'emphasis', 'point'],
});

/** A generic adult/child with sensible defaults; the cast and bystanders build on npcSpec({...}). */
export const NPC_DEFAULT = Object.freeze({
  name: 'npc', height: 1.7, build: 'normal', sex: 'm', skin: SKIN.tan,
  hair: { color: 0x1a1512, style: 'short' },
  top: { color: 0x59695f, trim: 0x9aa8a0, length: 'shirt', sleeves: 'long' },
  bottom: { color: 0x33343c, style: 'trousers' }, shoes: 0x1f1a17,
  scarf: null, jacket: null, props: [],
});
export function npcSpec(over = {}) {
  const s = { ...NPC_DEFAULT, ...over };
  for (const k of ['hair', 'top', 'bottom']) s[k] = { ...NPC_DEFAULT[k], ...(over[k] ?? {}) };
  return s;
}

/** Starting looks for the cast and bystanders (the spec is the whole contract: tweak colours, props, height). */
export const NPC_PRESETS = Object.freeze({
  jeetu: npcSpec({ name: 'Jeetu', height: 1.28, build: 'child', sex: 'm', skin: SKIN.tan, hair: { style: 'short', color: 0x1a1512 }, top: { color: 0xb8483a, trim: 0xf0b8a0, length: 'tee', sleeves: 'short' }, bottom: { color: 0x2f3b52, style: 'shorts' }, shoes: 0x2a2a2a, props: ['torch'], gestures: ['explain', 'emphasis', 'point', 'shrug'] }),
  tara: npcSpec({ name: 'Tara', height: 1.67, build: 'slim', sex: 'f', skin: SKIN.light, hair: { style: 'long', color: 0x2a1812 }, top: { color: 0x1f6a6a, trim: 0xe0c070, length: 'kurta', sleeves: 'long' }, bottom: { color: 0xe8e0d0, style: 'trousers' }, shoes: 0x6a4a2a, scarf: { color: 0xe0c070, trim: 0xa04a3a, style: 'neck' } }),
  gautam: npcSpec({ name: 'Gautam', height: 1.77, build: 'normal', sex: 'm', skin: SKIN.tan, hair: { style: 'side', color: 0x1e1814 }, facial: 'stubble', top: { color: 0x6a7480, trim: 0xa8b0b8, length: 'shirt', sleeves: 'long' }, bottom: { color: 0x2c2f38, style: 'trousers' } }),
  aayat: npcSpec({ name: 'Aayat', height: 1.16, build: 'child', sex: 'f', skin: SKIN.dark, hair: { style: 'bun', color: 0x14100e }, top: { color: 0x7a6a50, trim: 0xb0a080, length: 'kurta', sleeves: 'long' }, bottom: { color: 0x4a4038, style: 'salwar' }, barefoot: true, shoes: null }),
  kaalu: npcSpec({ name: 'Kaalu Seth', height: 1.84, build: 'stocky', sex: 'm', skin: SKIN.dark, hair: { style: 'turban', color: 0x8a2a20 }, facial: 'moustache', top: { color: 0x1a1a1e, trim: 0xc8a040, length: 'coat', sleeves: 'long' }, bottom: { color: 0x26262a, style: 'trousers' }, shoes: 0x181412 }),
  doctor: npcSpec({ name: 'Doctor', height: 1.72, build: 'normal', sex: 'm', age: 0.6, skin: SKIN.brown, hair: { style: 'balding', color: 0x9a9a98 }, top: { color: 0xd8dcd8, trim: 0x8aa0a8, inner: 0x7a8f9a, length: 'coat', sleeves: 'long' }, bottom: { color: 0x3a4048, style: 'trousers' } }),
  guard: npcSpec({ name: 'Guard', height: 1.8, build: 'stocky', sex: 'm', skin: SKIN.tan, hair: { style: 'cap', color: 0x1c2a44 }, facial: 'moustache', top: { color: 0x2a3a58, trim: 0xd0c070, length: 'shirt', sleeves: 'long' }, bottom: { color: 0x1c2438, style: 'trousers' }, shoes: 0x101010 }),
  nurse: npcSpec({ name: 'Nurse', height: 1.6, build: 'slim', sex: 'f', skin: SKIN.brown, hair: { style: 'bun', color: 0x14100e }, top: { color: 0x58a0a0, trim: 0xe0f0f0, length: 'kurta', sleeves: 'short' }, bottom: { color: 0xe8ecec, style: 'salwar' }, shoes: 0xe0e0e0 }),
  rescuer: npcSpec({ name: 'Rescuer', height: 1.74, build: 'normal', sex: 'm', skin: SKIN.brown, hair: { style: 'crop', color: 0x14100e }, top: { color: 0x4a4a42, length: 'shirt', sleeves: 'long' }, bottom: { color: 0x30323a, style: 'trousers' }, jacket: { color: 0xe88a20, stripe: 0xe8e8a0 }, props: ['hardHat'] }),
  tunnelDweller: npcSpec({ name: 'Dweller', height: 1.6, build: 'slim', sex: 'f', skin: SKIN.deep, hair: { style: 'long', color: 0x0e0c0a }, top: { color: 0x4a4440, trim: 0x706a60, length: 'kurta', sleeves: 'long' }, bottom: { color: 0x2a2622, style: 'salwar' }, shoes: 0x2a2018, barefoot: true }),
});

export function mergeSpec(spec, over) {
  const s = { ...spec, ...over };
  if (over) for (const k of ['hair', 'top', 'bottom']) s[k] = { ...spec[k], ...(over[k] ?? {}) };
  return s;
}
