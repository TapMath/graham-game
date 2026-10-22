// What everyone says (PLAN 1b cast, PLAN 3b voice: spare and melancholy; the human voices warm, Mumbai-flavoured English).
// Each entry is `(game, ctx) => spec` for `game.dialogue.open`. ctx = { actor, idx, n (times talked before), d (the director) }.
// Mithi's own lines are sensory: sound, smell, heat, never sight. Everyone who knows something about Setu answers from where
// he REALLY is on his timeline (`setuStage`), so what they say always points the right way.
export const STAGES = ['liftWreck', 'catacombs', 'boringSite', 'clinic', 'ventExit', 'triageTents', 'bridge'];

/** 0..6 = Setu's current timeline window; -1 once he has been found (he is with you). */
export function setuStage(game) {
  const s = game.setu;
  if (!s) return 0;
  if (s.found || s.following) return -1;
  const i = STAGES.indexOf(s.windowId);
  return i < 0 ? 0 : i;
}

const N = (text) => ({ narr: text });
const M = (text) => ({ who: 'Mithi', text });
const cont = (label = 'Go on.', onChoose) => ({ label, onChoose });
const bye = (label = 'Goodbye.', onChoose) => ({ label, onChoose });
const pick = (arr, n) => arr[n % arr.length];

export const CONVERSATIONS = {
  // ---------------------------------------------------------------------------------------------- collapse site
  oldman(game, { d, n }) {
    if (!game.flags.oldManFreed) return { lines: [N('A hand, grey with dust, closes on your wrist. Under the slab, someone is still breathing.')], choices: [bye('Hold on. I am digging.')] };
    if (d.justFreed) {
      d.justFreed = false;
      return {
        lines: [
          N('The slab tips. Under your hands a man breathes, thin as paper, grey to the eyelashes.'),
          'Beti... arre, beti. Bless your hands. I thought the sky had come down for good.',
          'You were calling for someone. I heard. Two boys, yes? Before the light, I saw them go up the flyover. One coughing, one holding his hand.',
          'They took the hurt children to Sion General. South, past the dead tree. Go, beti. Go. I have people to find too.',
        ],
        choices: [{ label: 'Thank you, Baba. Stay with the rescuers.', onChoose: () => { d.learn('hospital'); } }],
      };
    }
    return { lines: ['Go to the hospital, beti. Sion General, south past the dead tree. Do not stand here with an old man.'], choices: [bye('I am going.')] };
  },

  'rescuers-collapse'(game, { d, idx, n }) {
    const free = game.flags.oldManFreed;
    const tell = [
      ['Mind the slab! It is still moving. (a cough, a breath) A boy? Beti, I have pulled out forty boys.', 'Two went up that flyover before dawn, someone said. The hurt children go to Sion General. South, past the dead tree. Ask there.'],
      free ? ['You pulled him out? Good hands. We need hands.', 'Hospital, beti. Sion General. If your boy is breathing, that is where they put him.'] : ['Listen. Quiet, everyone, quiet! There. A moan, under the heap, east. Nobody has hands to spare.', 'If you are not digging, go. Sion General is south. The injured children are there.'],
      ['Water? No. Go. The rubble is warm, can you feel it? Things are still settling.', 'Names on the tents, bodies by the north wall. Hospital first, beti. The living first.'],
      ['Eight years old? Thin, a cough? I saw a boy with a bandaged arm, they carried him south on a door. Sion General.', 'Hold on to the rope when you cross the plates.'],
      ['Stay off the heap! Do you want to join them?', 'The children went to Sion General. Please. Go.'],
    ];
    const t = tell[(idx + n) % tell.length];
    return { lines: t, choices: [{ label: 'Thank you.', onChoose: () => { d.learn('hospital'); } }] };
  },

  'rescuers-triage'(game, { idx, n }) {
    const T = [
      ['Name? Age? (a long, tired breath) No. Nobody that small here. I am sorry.', 'The bodies are by the north wall. Do not go alone, beti. Take someone.'],
      ['Sit. Drink. You are shaking. Is it you who is hurt?', 'Boys come through here asking for sisters, for mothers. I write the names down. I write everything down.'],
      ['Setu? Hmm. (paper rustles) No Setu. Not in this book. Not yet.', 'Come back later. People turn up. Sometimes people turn up.'],
    ];
    return { lines: T[(idx + n) % T.length], choices: [bye('Thank you.')] };
  },

  // ---------------------------------------------------------------------------------------------- hospital
  nurses(game, { d, idx, n }) {
    const T = [
      ['Visitors outside! (a trolley rattles past) Oh. You are the sister? The boy with the bandaged arm and the bandaged head, east ward, the bed by the wall. He keeps saying "Didi will come."', 'Go. Call him. He answers to voices.'],
      ['Beds are full. Blood is short. B-positive most of all. (she looks you over) You are B-positive? There is an actress in the middle ward. Her husband is in the ICU. She is begging every corridor for a donor.', 'Ask her. Her name is Tara Shahjehan.'],
      ['Shh. He is sleeping. They are all sleeping, or nearly.', 'Whoever you are looking for, he is not in this ward. Try the east end. The bed by the wall.'],
      ['Madam Tara? The middle ward. She has not sat down since the flyover fell. Her husband is at the far end, in the ICU.', 'Be gentle with her. She is brave in the way that costs.'],
    ];
    const i = Math.min(T.length - 1, (idx + n) % T.length);
    return { lines: T[i], choices: [{ label: 'Thank you, Sister.', onChoose: () => { d.learn('jeetuBed'); } }] };
  },

  jeetu(game, { d, n }) {
    const f = game.flags, joined = !!game.party?.jeetu;
    if (!joined) {
      const first = !f.jeetuTalked;
      f.jeetuTalked = true;
      return {
        lines: first ? [
          N('A small voice from the bed by the wall. Cracked at the edges, and trying to be brave.'),
          'Didi! I knew it was you. I heard you. (a cough) My arm is nothing, it is only a bandage, they put a bandage on everything.',
          'Didi, Setu. I saw him. He got into the maintenance lift behind the pillar, the one with the ladder. He was going down. And then... then the whole sky came down.',
          'I was angry with him, Didi. I said he was a baby. He turned back because he could not breathe and I said he was a baby.',
          M('It is not your fault, Jeetu. Can you walk?'),
          'I can walk. I can run if you need. Take me, Didi. You cannot see, and I can. Chal.',
        ] : ['Didi? Take me with you. I can walk. I can be your eyes.'],
        choices: [
          { label: 'Come with me, Jeetu.', onChoose: () => { d.joinJeetu(); return { lines: [N('The bed creaks. A small, warm hand finds your sleeve and does not let go.'), 'Chal, Didi. I know the way down: the lift had a ladder at the back, behind the market hut, east of the Metro. But the Metro is guarded, everyone knows. They shout at children.', 'It will be dark down there, Didi. The kind of dark that has weight. We will need a light. (a breath) And if you press Tab, I will go first, and you can follow my voice.'], choices: [cont('Stay close.')] }; } },
          { label: 'Rest. I will come back for you.', onChoose: () => ({ lines: ['Okay, Didi. Okay. I will be here. Do not forget me.'], choices: [bye('I will not.')] }) },
        ],
      };
    }
    // in the party
    const hasTorch = game.items?.has('torch');
    const lines = hasTorch ? ['Light is good, Didi. Light is very good. I will go first when you say.'] : ['It will be black down there, Didi. Black-black. I need a light, a real one.'];
    return {
      lines,
      choices: [
        { label: 'Where do we go down?', onChoose: () => { f.knowsShaft = true; return { lines: ['Two ways. The Metro: stairs, shutters, guards at every turn. Or the maintenance lift, east of the Metro, the little hut: the ladder behind it goes all the way down to the tunnels. I climbed it with Setu.', game.items?.has('jacket') ? 'You have the jacket, Didi! They will think you work there. Do not run. Do not sing near them.' : 'And our neighbour sold tickets at the Metro. His jacket is still on its hook, in his flat. A blue one. They let staff through.'], choices: [cont('Thank you, Jeetu.')] }; } },
        { label: 'How do I swap with you?', onChoose: () => ({ lines: ['Tab, Didi. Press Tab and I take the front, with my eyes and my torch. You walk behind me. I am slow, my arm hurts, and I cannot sing to the dogs. But I can read the signs.'], choices: [cont('Good.')] }) },
        bye('Stay close.'),
      ],
    };
  },

  tara(game, { d, n }) {
    const f = game.flags, rays = game.player.rays;
    f.metTara = true;
    const evid = f.breachKnown && game.items?.has('breachEvidence') && !f.cityWarned;
    const warn = { label: 'Show her the evidence. Put it on TV.', note: 'warn the city', onChoose: () => d.warnViaTara() };
    if (f.bloodGiven) {
      if (!f.bridgePermit) {
        d.grantPermit('talk');
        return {
          lines: [
            N('A hand finds yours. Warm, dry, a ring of soft metal on every finger.'),
            'Sameer is breathing on his own. Your blood is in him, child, I cannot say thank you enough times.',
            'I have been on the telephone since you left. The Bridge Authority owes Sameer\'s studio more than one favour. There is a pier gate on the east quay. Your name is on its list now, and your brother\'s. Show your face and it will open.',
            'Find Setu. Bring him to the bridge. That is all I ask.',
          ],
          choices: evid ? [warn, bye('Thank you, Tara.')] : [bye('Thank you, Tara.')],
        };
      }
      return {
        lines: pick([
          ['The pier gate will open for you. East quay, the lift beyond it. Go. Please. The sun comes whether we are ready or not.'],
          ['Sameer opened his eyes for a moment. He said a name. I think it was mine. Go, child. Bring Setu to the light.'],
        ], n),
        choices: evid ? [warn, bye('I will.')] : [bye('I will.')],
      };
    }
    // blood not yet given
    const first = n === 0;
    const canGive = rays >= 4;
    return {
      lines: first ? [
        N('A voice you know from a thousand radio jingles: smooth, tired, kind. It stops the corridor around it.'),
        'Child, you are shaking. Sit. No, please. I am Tara. (a breath that is almost a laugh) You have heard of me, everyone has.',
        'My husband was driving on the top level when it came down. He needs blood. B-positive. They have none. The nurses say you are B-positive.',
      ] : ['Please. He is breathing through a machine, and the machine is hungry. B-positive. Only that.'],
      choices: [
        { label: 'I am B-positive. Take mine.', note: '-2 rays, a quarter hour', enabled: canGive, why: 'You are too weak to give blood. Find some light first.', onChoose: () => d.giveBlood() },
        { label: 'My brother is missing. I cannot stop now.', onChoose: () => ({ lines: ['Then go. I understand. I would do the same.', 'If you change your mind, I will be here.'], choices: evid ? [warn, bye('Thank you.')] : [bye('Thank you.')] }) },
        ...(f.jeetuJoined || f.jeetuTalked ? [] : [{ label: 'Have you seen a boy called Jeetu?', onChoose: () => ({ lines: ['The one with the bandaged arm? East ward, by the wall. I asked the nurses to watch him. Go to him, child.'], choices: [bye('Thank you.', () => d.learn('jeetuBed'))] }) }]),
      ],
    };
  },

  sameer(game, { n }) {
    const given = game.flags.bloodGiven;
    return {
      lines: [
        N('A machine counts him in small green beeps. Under the tube, a breath you could mistake for a sleeper\'s.'),
        N(given ? 'There is a rhythm in it now. Some of it is yours.' : 'The smell is iodine and expensive flowers. The beeps do not slow, and do not speed.'),
        N('This is the face on every billboard on the way to school. It does not look like a face anyone could idolise now.'),
      ],
      choices: [bye('Rest.')],
    };
  },

  // ---------------------------------------------------------------------------------------------- police station
  gautam(game, { d, n }) {
    const f = game.flags;
    if (f.gautamFree) {
      const live = d.gautamDistracting();
      return {
        lines: live ? ['The guards are watching me, not you. Go now while I still have their ears, Mithi. Walk. Do not run. Do not sing.', 'And Mithi. Find him.'] : ['They have stopped listening to me. Go quietly. Go the way you came.'],
        choices: [bye('Thank you, Gautam.')],
      };
    }
    f.metGautam = true;
    return {
      lines: n === 0 ? [
        N('Behind the bars: a dry voice, cracked at the edges, trying a joke.'),
        'Mithi? (a short laugh) Of course it is you. Nobody else walks so quietly into a police station.',
        'I hit a sergeant. In my defence he was standing between a hundred people and the Metro stairs. The bail was five hundred. Then it was two thousand. Every time I argue the number gets taller.',
        'Setu is missing? Mithi... Listen. Get me out, and I will go to the Metro gate and make so much noise those guards will forget their own names. You walk past. Do not run. Do not sing.',
      ] : ['Mithi. The offer stands. Out of here, to the Metro gate, shouting.'],
      choices: [
        { label: 'Pay his bail, in light.', note: '-3 rays', enabled: game.player.rays >= 5, why: 'You cannot spare that much light.', onChoose: () => d.payBail('rays') },
        { label: 'Pay his bail, in time.', note: '+2 hours of forms', onChoose: () => d.payBail('time') },
        bye('Not yet, Gautam.'),
      ],
    };
  },

  // ---------------------------------------------------------------------------------------------- underground
  aayat(game, { d, n }) {
    const st = setuStage(game);
    const info = () => {
      const L = {
        '-1': ['You have him! Setu! (the first small laugh you have heard in the dark) Take care of him, Didi. He counts his steps.'],
        0: ['A box fell from the sky, east, near where the trains stopped. A boy walked out. Coughing. He blows into a tin thing and it sings. He is not here yet.', 'Go east, along the tracks. By the broken lift.'],
        1: ['Setu? He is here. Behind me, in my room, by the diya. He is afraid of the dark; he counts his steps out loud.', 'He gave me his music box. First time I smiled. Go to him, Didi.'],
        2: ['The Big Man took the children to the machine at the bell. Setu too. He dropped the music box and I could not find it in the dark.', 'North, past the cages, where the walls drip. Go quietly. Seth shouts.'],
        3: ['They sold him. The Big Man sold him to the contractor, and the contractor took him south, to the doctor. Setu coughs too much, Didi.', 'South. The long tunnel with the red lamp.'],
        4: ['He came back here! He asked how to go up. I showed him the vent by the doctor\'s. He is small, he fits. He is not here.', 'You cannot go in the vent, Didi. Go round, up the stairs, to the street. The stack is on the east side of the hospital.'],
        5: ['He went up the vent, hours ago. He said Didi would be at the old house, at the tents. He had his music box again, I stole it back.', 'Go up. Tents, Didi, near where the road fell.'],
        6: ['He said "Didi promised the bridge, the one where I was found." East, Didi, where the sun comes. He went to wait.', 'He is very small to walk so far.'],
      };
      return L[st];
    };
    return {
      lines: n === 0 ? [
        N('Someone stands very still in the dark. A small child\'s breath, held. You can smell lamp oil and wet stone.'),
        'You are... outside people. You talk loud. (a pause) You are looking for someone.',
      ] : ['Didi?'],
      choices: [
        { label: 'A boy, eight. Coughs. His name is Setu.', onChoose: () => { d.learnSetu('aayat'); return { lines: info(), choices: [cont('Thank you, Aayat.')] }; } },
        { label: 'Where do the air vents go?', onChoose: () => ({ lines: ['Up. All the way to the street. Too small for you. For a boy, yes.', 'Most are shut since the roof fell. Only three left.'], choices: [cont('I see.')] }) },
        bye('Stay safe, Aayat.'),
      ],
    };
  },

  kaalu(game, { d, n }) {
    const st = setuStage(game);
    const L = {
      '-1': ['You have him already? Then why are you in my tunnel? (smoke, a rough laugh) Go.'],
      0: ['A lift fell on the east side this morning. They say a boy walked out of it. Not mine. Not yet.', 'East. Along the old rails, by the Metro.'],
      1: ['The girl Aayat found a new boy. Hiding in her room, in the catacombs, west. (a laugh) Finders keepers. By the afternoon bell he will be mine.'],
      2: ['The little one with the music box? He is here, by the cutter. (he coughs and spits) The contractor has already paid a deposit on him; he comes at the evening bell.', 'Be quick, blind girl. Business is business.'],
      3: ['Sold. The contractor took him, south, to the doctor: the boy was wheezing like a bellows. Hours ago.', 'Ask the contractor. He is by the machine. Do not ask me for a refund.'],
      4: ['Gone. The doctor lost him, they say: climbed out through a vent. The contractor is in a foul mood. Ask him.'],
      5: ['Up? Out? What is it to me. I do not keep children who do not stay.'],
      6: ['Boy? What boy? I have forty boys. Go and annoy someone else.'],
    };
    return {
      lines: n === 0 ? [
        N('A voice like a cart on gravel. Cigarette smoke, hot iron, the machine ticking as it cools. Somewhere behind him, small feet shift in a cage.'),
        'Who lets a blind girl into my tunnel? (a laugh) Sit, sit. Everyone who comes down here wants something.',
      ] : ['What now?'],
      choices: [
        { label: 'I am looking for my brother. Setu.', onChoose: () => { d.learnSetu('kaalu'); return { lines: L[st], choices: [cont('...')] }; } },
        { label: 'Why are those children in cages?', onChoose: () => ({ lines: ['Cages? Beds. They sleep better than you do. (a long drag) They dig, they eat, they sleep. In this city who does better?', N('Behind him, a small sound. Quickly hushed.')], choices: [cont('...')] }) },
        bye('Never mind.'),
      ],
    };
  },

  contractor(game, { d, n }) {
    const st = setuStage(game);
    const L = {
      '-1': ['Found him already? Good for you. I only bought labour. I never touched the boy.'],
      0: ['A boy? I buy children from Seth, the Big Man, by the cabin there. Nothing that coughs. Ask him.'],
      1: ['A new boy? Seth will have him by the afternoon bell. Ask Seth, by the cabin.'],
      2: ['The coughing one. Seth is showing him off. I will take him to the doctor when the bell rings; he is no use to me wheezing.', 'Wait. Or take the long tunnel south, to the clinic, the doctor\'s lamp is red. I do not care who walks there.'],
      3: ['He wheezed, so I took him to the doctor. South, the long tunnel, the clinic with the red lamp. The doctor kept him. Go.'],
      4: ['The doctor sent word: your boy slipped out. A vent. I do not want trouble, I only buy labour.', 'Clinic vent, at the far end. It comes out on the street, east of the hospital.'],
      5: ['Slipped out? Hours ago. I have not seen him. He is somebody else\'s problem now.'],
      6: ['Your brother? I never heard of a bridge. I never heard of any boy.'],
    };
    return {
      lines: n === 0 ? [
        N('Pressed cloth, cold cologne under the iron smell. A voice that has never raised itself, because it has never had to.'),
        'This is a restricted site, miss. SURYA subcontract. (a polite cough) Are you lost?',
      ] : ['Miss?'],
      choices: [
        { label: 'A boy, eight. Setu. Seth said you bought him.', onChoose: () => { d.learnSetu('contractor'); return { lines: L[st], choices: [cont('...')] }; } },
        { label: 'What are you boring toward?', onChoose: () => { game.flags.heardBoring = true; return { lines: ['West, toward the old pumping chamber. The engineers said stop. The engineers say a lot of things.', 'The walls weep now, down there. It is only condensation. (his voice does not quite agree with his words)'], choices: [cont('Condensation.')] }; } },
        bye('I am leaving.'),
      ],
    };
  },

  doctor(game, { d, n }) {
    const st = setuStage(game);
    const L = {
      '-1': ['You have your boy. Good. His lungs are good: clean air all his life, then this. Keep him away from dust.'],
      0: ['No boy here. If the contractor brings a coughing one, I will see him. Clinic is quiet today. (a cough of his own)'],
      1: ['No boy here yet. They breed asthma in the catacombs. If he comes, I will see him.'],
      2: ['Not yet. The contractor sometimes sends me children when they wheeze. Come back after the evening bell.'],
      3: ['He is on the cot at the end. Asthma, and not underground-born: I know the lungs of this place and his are not. I gave him a second inhaler. He is tracing a map on the floor with his finger. Counting.', 'Take him. Gently.'],
      4: ['Gone. I was stitching a man and turned my back: he slipped out. He asked me about a vent, I will swear. The one at the far end climbs to the street, east of the hospital.', 'Small enough to fit. You, no. Go round: the stairs, the street, the stack.'],
      5: ['He left hours ago. The contractor was furious. Up the vent, I think. He asked about a girl with a flute.'],
      6: ['I told him the sun would come soon enough. He said: not here. East.'],
    };
    return {
      lines: n === 0 ? [
        N('Antiseptic. A red lamp ticking above a cot. A tired man\'s voice, patient the way a well is patient.'),
        'Sit, sit. Cough or fever? (he stops) You are not sick. Who are you looking for?',
      ] : ['Yes?'],
      choices: [
        { label: 'A boy, eight. Setu.', onChoose: () => { d.learnSetu('doctor'); return { lines: L[st], choices: [cont('Thank you, Doctor.')] }; } },
        bye('Never mind.'),
      ],
    };
  },

  sleepers(game, { n }) {
    const lit = game.items?.has('torch') && game.party?.active === 'jeetu';
    return {
      lines: lit ? [N('The torch finds faces: ghostly, hollow, flinching. A child bolts into the dark, bare feet slapping. Nobody speaks.')] : pick([
        [N('Shoulders against shoulders on a damp floor. A voice, half asleep: "Is it the bell?"'), N('Another turns away from where your voice is.')],
        [N('Breathing. A dozen sleepers. Somebody mutters in their sleep and, very softly, somebody else answers them.')],
      ], n),
      choices: [bye(lit ? 'Sorry. Sorry.' : 'Quietly.')],
    };
  },

  // ---------------------------------------------------------------------------------------------- near the slum
  torchBoys(game, { d, n }) {
    const f = game.flags, has = game.items?.has('torch'), jeetu = !!game.party?.jeetu;
    if (has) return { lines: ['You have one already, didi! Mind the batteries, they never last.'], choices: [bye('I will.')] };
    return {
      lines: [
        N('Two boys, giggling, then hushed. A metal click, a thin buzz of a small beam: you can hear it more than see it.'),
        'Torch, didi? Good torch, special torch. Where we live a torch is worth more than a pair of shoes.',
        ...(jeetu ? [{ speaker: 'Jeetu', text: 'Arre, Raju! It is me, Jeetu! Do not rob us, we are in a hurry.' }] : []),
        'Two rays of yours, or one hour carrying our water cans. Or no torch. Your choice, didi.',
      ],
      choices: [
        { label: 'Take two rays of light.', note: '-2 rays', enabled: game.player.rays >= 4, why: 'You cannot spare the light.', onChoose: () => d.buyTorch('rays') },
        { label: 'Carry the water cans.', note: '+1 hour', onChoose: () => d.buyTorch('time') },
        bye('Not now.'),
      ],
    };
  },
};
