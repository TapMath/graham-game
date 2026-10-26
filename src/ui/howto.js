// "How to play": a set of cards in the safety-card pictogram style of the pitch deck and PLAN 3b: pale card, thick ink line
// drawings of stick figures, a red mark where something is forbidden, and a scrawled correction in the margin.
// `howToHtml({touch})` returns the markup; the stylesheet (`.htp-*`, `.pg*`) lives in src/styles.css.

// A stick figure, hip at the origin: head (0,-27), shoulders (0,-14), feet at about y = +22. `s` scales it, (x, y) places the hip.
function fig(x, y, s = 1, { arms = [[-12, 10], [12, 10]], legs = [[-9, 22], [9, 22]], cls = '' } = {}) {
  const [a0, a1] = arms, [l0, l1] = legs;
  return `<g class="fig ${cls}" transform="translate(${x} ${y}) scale(${s})"><circle cx="0" cy="-27" r="6.4"/>` +
    `<path d="M0 -20.5 V2 M0 -14 L${a0[0]} ${-14 + a0[1]} M0 -14 L${a1[0]} ${-14 + a1[1]} M0 2 L${l0[0]} ${2 + l0[1]} M0 2 L${l1[0]} ${2 + l1[1]}"/></g>`;
}
const cane = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M0 0 L16 40"/><path class="ac" d="M5.5 14 L8 19.5"/></g>`;
const sunRays = (cx, cy, r0, r1, n, off = 0, lost = []) => Array.from({ length: n }, (_, i) => {
  const a = (i / n) * Math.PI * 2 - Math.PI / 2 + off, r2 = i % 2 ? r1 : r1 + 4;
  return `<path class="${lost.includes(i) ? 'dim' : 'sn'}" d="M${(cx + Math.cos(a) * r0).toFixed(1)} ${(cy + Math.sin(a) * r0).toFixed(1)} L${(cx + Math.cos(a) * r2).toFixed(1)} ${(cy + Math.sin(a) * r2).toFixed(1)}"/>`;
}).join('');
const halfRays = (cx, cy, r0, r1, n) => Array.from({ length: n }, (_, i) => {
  const a = Math.PI + (i / (n - 1)) * Math.PI, r2 = i % 2 ? r1 : r1 + 4;
  return `<path class="sn" d="M${(cx + Math.cos(a) * r0).toFixed(1)} ${(cy + Math.sin(a) * r0).toFixed(1)} L${(cx + Math.cos(a) * r2).toFixed(1)} ${(cy + Math.sin(a) * r2).toFixed(1)}"/>`;
}).join('');
const wrap = (inner) => `<svg class="pg" viewBox="0 0 160 100" aria-hidden="true">${inner}<path class="gnd" d="M6 88 H154"/></svg>`;
const notes = (x, y) => `<g class="gold"><circle cx="${x}" cy="${y}" r="2.6" class="fillg"/><path d="M${x + 2.6} ${y} V${y - 11} l5 2"/></g>`;

const PICTO = {
  goal: wrap(
    `<path d="M96 88 A24 24 0 0 1 144 88 Z" class="sn fillsn"/>${halfRays(120, 88, 29, 35, 9)}` +
    `<path d="M66 70 Q108 58 152 70 M66 78 Q108 66 152 78 M80 70 V88 M102 64 V88 M126 64 V88"/>` +
    fig(30, 66, 0.95, { arms: [[-11, 9], [10, 3]], legs: [[-9, 22], [11, 20]] }) + cane(40, 50, 0.9) +
    fig(56, 72, 0.6, { arms: [[-9, 8], [-14, 4]], legs: [[-7, 22], [8, 21]] })),
  keys: wrap(
    fig(52, 66, 1, { arms: [[-14, 6], [13, 12]], legs: [[-8, 22], [14, 17]] }) +
    `<path class="mv" d="M22 52 h-14 M24 62 h-18 M22 72 h-12"/>` +
    `<rect x="100" y="24" width="30" height="44" rx="15"/><path d="M115 24 V44 M100 44 H130"/><path class="ac" d="M115 29 V40"/>` +
    `<path class="mv" d="M138 30 q8 6 0 14 M143 26 q13 10 0 22"/>`),
  touch: wrap(
    `<rect x="14" y="16" width="132" height="64" rx="10"/><path class="mv" d="M128 16 v64"/>` +
    `<circle cx="44" cy="54" r="15" class="dash"/><circle cx="48" cy="50" r="6.5" class="fillink"/>` +
    `<circle cx="104" cy="36" r="6.5"/><circle cx="88" cy="56" r="6.5"/><circle cx="112" cy="60" r="8.5" class="ac"/>` +
    `<path d="M98 28 l-2 -8 M100 24 l-6 -3" class="mv"/>`),
  health: wrap(
    `<circle cx="80" cy="48" r="10" class="sn fillsn"/>${sunRays(80, 48, 16, 24, 12, 0, [8, 9, 10, 11, 7])}` +
    `<path class="ac" d="M80 12 l-4 -7 h8 z"/>` +
    `<path class="mv" d="M26 48 h8 M126 48 h8"/>`),
  light: wrap(
    `<path class="shaft" d="M36 6 H78 L112 88 H58 Z"/><path class="mv" d="M48 6 L74 88 M62 6 L90 88"/>` +
    fig(88, 64, 1, { arms: [[-10, -12], [10, -12]], legs: [[-8, 22], [8, 22]] }) +
    `<g class="sn"><path d="M122 38 v-12 M117 31 l5 -5 l5 5"/><path d="M136 56 v-12 M131 49 l5 -5 l5 5"/></g>`),
  sing: wrap(
    fig(36, 66, 1, { arms: [[-11, 12], [11, 12]], legs: [[-8, 22], [8, 22]] }) + cane(52, 52, 0.9) +
    `<g class="gold"><path d="M52 40 a12 12 0 0 1 0 -14 M60 44 a20 20 0 0 0 0 -22 M68 48 a28 28 0 0 0 0 -30" transform="translate(0 4)"/></g>` +
    `<ellipse cx="124" cy="76" rx="14" ry="8"/><circle cx="141" cy="64" r="6.5"/><path d="M137 58 l-2 -8 l6 4 M147 58 l3 -7 l-1 8 M116 84 v4 M130 84 v4 M110 72 q-8 -6 -6 -14"/>` +
    `<g class="ac"><circle cx="122" cy="26" r="13"/><path d="M113 35 L131 17"/></g><path d="M112 26 h20 M117 22 l-4 -4 M127 22 l4 -4"/>`),
  organ: wrap(
    `<rect x="62" y="16" width="14" height="72" class="wall"/><path class="mv" d="M62 30 L76 22 M62 46 L76 38 M62 62 L76 54 M62 78 L76 70"/>` +
    fig(30, 66, 1, { arms: [[-11, 12], [11, 12]], legs: [[-8, 22], [8, 22]] }) +
    `<path class="ear" d="M20 36 q10 -14 22 0"/><rect x="16" y="35" width="5" height="8" rx="2" class="fillink"/><rect x="40" y="35" width="5" height="8" rx="2" class="fillink"/>` +
    `<g class="gold"><circle cx="108" cy="70" r="14" class="dash"/><circle cx="108" cy="70" r="26" class="dash"/><circle cx="108" cy="70" r="38" class="dash"/></g>` +
    `<circle cx="108" cy="52" r="5.5"/><path d="M108 58 V78 M108 64 L100 72 M108 64 L117 72 M108 78 L102 88 M108 78 L114 88"/><rect x="100" y="55" width="16" height="4" rx="1.4" class="fillg"/>` +
    notes(132, 40) + notes(142, 30)),
  tab: wrap(
    fig(40, 66, 1, { arms: [[-11, 12], [11, 12]], legs: [[-8, 22], [8, 22]] }) + cane(54, 52, 0.9) +
    fig(120, 66, 1, { arms: [[-11, 12], [12, -2]], legs: [[-8, 22], [8, 22]] }) +
    `<path class="sn" d="M132 46 l12 -6 M132 46 l12 4 M132 46 l10 -14"/>` +
    `<g class="ac"><path d="M30 16 Q80 -2 128 16"/><path d="M122 9 l7 8 l-10 2"/><path d="M130 30 Q80 46 34 30" transform="translate(0 -4)"/><path d="M40 21 l-8 3 l8 7" transform="translate(0 -3)"/></g>` +
    `<path d="M104 20 q10 -10 20 0 q-10 10 -20 0 z M114 20 h0.1"/><circle cx="114" cy="20" r="2.4" class="fillink"/>`),
  view: wrap(
    `<g transform="translate(60 0)"><circle cx="20" cy="52" r="7"/><path d="M6 86 Q8 62 20 62 Q32 62 34 86"/><path d="M20 60 V86"/></g>` +
    cane(94, 66, 0.55) +
    `<rect x="112" y="14" width="28" height="18" rx="3"/><circle cx="126" cy="23" r="5.5"/><path d="M118 14 l3 -4 h10 l3 4"/>` +
    `<path class="mv dash" d="M110 32 L88 58"/><path class="ac" d="M30 40 Q36 20 54 18 M48 12 l8 6 l-9 5"/>`),
  clock: wrap(
    `<circle cx="52" cy="46" r="30"/><path d="M52 46 V26 M52 46 L66 54"/><circle cx="52" cy="46" r="2.5" class="fillink"/>` +
    `<path class="mv" d="M52 18 v4 M52 70 v4 M24 46 h4 M76 46 h4"/>` +
    `<path class="water" d="M96 78 q8 -8 16 0 t16 0 t16 0 M96 66 q8 -8 16 0 t16 0 t16 0"/><path class="ac" d="M122 52 V30 M115 38 l7 -9 l7 9"/>`),
  dshot: wrap(
    `<g transform="rotate(-32 70 52)"><rect x="34" y="42" width="52" height="16" rx="3"/><path d="M34 50 h-10 M24 42 v16 M86 50 h26 M112 50 l16 0"/><path class="mv" d="M46 42 v8 M56 42 v8 M66 42 v8 M76 42 v8"/><rect x="40" y="45" width="22" height="10" class="fillsn"/></g>` +
    `<path class="water" d="M30 82 q4 -6 8 0 q-4 6 -8 0 z"/>` +
    `<path d="M120 28 h22 M120 78 h22 M123 28 q0 18 9 25 q9 -7 9 -25 M123 78 q0 -18 9 -25 q9 7 9 25"/><path class="sn" d="M126 72 h12"/>`),
};

const KEY = (k) => `<kbd>${k}</kbd>`;
const row = (keys, text) => `<li><i class="kk">${keys}</i><span>${text}</span></li>`;

export function howToCards({ touch = false } = {}) {
  const kbCard = {
    id: 'keys', n: 'KEYBOARD AND MOUSE', pic: PICTO.keys, title: 'Walk, listen, use',
    body: `<ul class="keys">${[
      row(KEY('W') + KEY('A') + KEY('S') + KEY('D'), 'walk'), row(KEY('Shift'), 'sprint'), row(KEY('Space'), 'jump'), row(KEY('Mouse'), 'look'),
      row(KEY('E'), 'use, talk, read (hold to dig)'), row(KEY('Q'), 'sing (hold: second sight)'), row(KEY('Tab'), 'switch to Jeetu'), row(KEY('V'), 'third person'), row(KEY('M'), 'city map'), row(KEY('Esc'), 'pause'),
    ].join('')}</ul>`,
  };
  const touchCard = {
    id: 'touch', n: 'TOUCH', pic: PICTO.touch, title: 'Two thumbs',
    body: `<ul class="keys">${[
      row('<b class="ic">&#9678;</b>', 'left thumb: stick. Push it to the edge to sprint'), row('<b class="ic">&#9998;</b>', 'right thumb: drag anywhere to look'),
      row(KEY('E'), 'use, talk, read (hold to dig)'), row(KEY('Q'), 'sing (hold: second sight)'), row(KEY('&#8645;'), 'switch to Jeetu'), row(KEY('V'), 'third person'), row('<b class="ic">&#9707;</b>', 'tap the little map: the city map'),
      row('<b class="ic">&#10074;&#10074;</b>', 'pause and settings'),
    ].join('')}</ul><p>Tap an answer to speak. Tap a card to close it.</p>`,
  };
  const cards = [
    { id: 'goal', n: '01', pic: PICTO.goal, title: 'Find Setu', scrawl: 'he has never seen a sunrise',
      body: `<p>Setu fell with the lift into the tunnels. You are Mithi, eighteen and blind, and you carry his pills and inhaler. Find him before his breath runs out, then take him to the Sunrise Bridge on the east edge.</p><p>The heartbeat on screen is his breath. Something is also wrong with the water below.</p>` },
    touch ? touchCard : kbCard,
    touch ? kbCard : touchCard,
    { id: 'health', n: '02', pic: PICTO.health, title: 'Health is a sun', scrawl: 'count your rays',
      body: `<p>You have twelve rays and start with seven. Darkness eats them: fastest underground, slowly on the walkways, never on the flyovers. At zero, Mithi is gone.</p><p>Health is also the currency. Favours cost rays.</p>` },
    { id: 'light', n: '03', pic: PICTO.light, title: 'Stand in the light', scrawl: 'higher = brighter',
      body: `<p>Shafts of sunlight heal one ray every few seconds. There are more of them the higher you go, and you can go higher the more health you carry: bio-scanner gates want 5 rays for the flyovers and 8 for the upper decks.</p><p>Mithi feels the sun on her skin: a soft glow on the edge of the screen points to the nearest light you can reach, and grows as you near it. Painted arrows and <b>SUN</b> signs mark the ways up. ${KEY('M')} opens the city map, which shows where the sunlight is right now.</p>` },
    { id: 'sing', n: '04', pic: PICTO.sing, title: 'Sing', kbd: 'Q', scrawl: 'police hate it',
      body: `<p>Tap ${KEY('Q')}. A wave of sound shows you the shape of the world, and Setu may answer. Singing calms dogs and frightened people.</p><p class="warn">Police, drones and guards treat it as unregistered singing. Hold ${KEY('Q')} for two seconds for second sight: a glimpse from Setu's side.</p>` },
    { id: 'organ', n: '05', pic: PICTO.organ, title: 'Listen for the mouth organ', scrawl: 'headphones help',
      body: `<p>Setu plays the mouth organ you gave him: when you sing, and now and then on his own. Gold rings mark where it comes from, even through walls. Sound is how you see.</p>` },
    { id: 'tab', n: '06', pic: PICTO.tab, title: 'Jeetu is your eyes', kbd: 'Tab', scrawl: 'he can read',
      body: `<p>Once Jeetu joins you, ${KEY('Tab')} swaps who you control. Jeetu can read signs and documents, climb, and carry a torch in the dark. He cannot sing. Mithi hears, sings and comforts Setu. Whoever you leave follows you.</p>` },
    { id: 'view', n: '07', pic: PICTO.view, title: 'Third person', kbd: 'V',
      body: `<p>Press ${KEY('V')} to see Mithi from behind and above. Nothing else changes. You can set the default view in Settings.</p>` },
    { id: 'clock', n: '08', pic: PICTO.clock, title: 'The clock and the flood', scrawl: 'the water is coming',
      body: `<p>Municipal time runs from before dawn to dawn the next day, in real time. Read what you find. Once you know about the breach a flood timer appears.</p><p>Warn the city through Tara, or at the Control Tower terminal on level three.</p>` },
    { id: 'dshot', n: '09', pic: PICTO.dshot, title: 'D-shots', scrawl: 'read the seller',
      body: `<p>Black-market health jabs. Every seller is different: the rays it gives, the hours it takes from your clock, and the chance it is cut with something. Accept, or walk away.</p>` },
  ];
  return cards;
}

export function howToHtml(opts = {}) {
  const cards = howToCards(opts);
  return `<div class="htp-grid">${cards.map((c) => `
    <article class="htp-card htp-${c.id}">
      <header><span class="htp-n">${c.n}</span>${c.kbd ? `<kbd>${c.kbd}</kbd>` : ''}</header>
      <div class="htp-pic">${c.pic}</div>
      <h3>${c.title}</h3>
      <div class="htp-body">${c.body}</div>
      ${c.scrawl ? `<span class="htp-scrawl">${c.scrawl}</span>` : ''}
    </article>`).join('')}</div>`;
}
