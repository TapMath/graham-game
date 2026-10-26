// What everyone says (PLAN 1b cast, PLAN 3b voice, PLAN 12 "dialogue, much better").
// Each entry is `(game, ctx) => spec` for `game.dialogue.open`. ctx = { actor, idx, n (times talked before), d (the director), as }.
// `ctx.as` is who is being played: 'mithi' (sound, touch, smell; never sight; wary of kindness, and slowly less so) or 'jeetu' (nine,
// sighted, scared and brave and funny). The same person says different things to a blind girl of eighteen and a boy of nine, and the
// narration is written from the player's own senses. Where only Mithi can act (blood, singing), Jeetu offers to fetch her.
//
// Everyone who knows something about Setu answers from where he REALLY is on his timeline (`setuStage`), so what they say always points
// the right way: 0 the wrecked lift (east) 1 Aayat's room (west) 2 the boring machine (north) 3 the doctor (south) 4 the vent 5 the
// triage tents at Sion Junction 6 the bridge (east, Sewri, Atal Setu).
//
// Lines: a string, { narr }, or { who|speaker, text, mood, g, listen }. `mood` is the speaker's face (neutral smile grin smirk worry sad
// angry scared pain shout awe), `g` a gesture (explain emphasis chest point shrug beckon wave wide cross hips wring shout face reach).
import { COSTS } from '../costs.js';
export const STAGES = ['liftWreck', 'catacombs', 'boringSite', 'clinic', 'ventExit', 'triageTents', 'bridge'];

/** 0..6 = Setu's current timeline window; -1 once he has been found (he is with you). */
export function setuStage(game) {
  const s = game.setu;
  if (!s) return 0;
  if (s.found || s.following) return -1;
  const i = STAGES.indexOf(s.windowId);
  return i < 0 ? 0 : i;
}

/** How far Mithi has let people in: 0 (nobody has earned it) to 5. Her answers soften as it grows. */
export function trustOf(game) {
  const f = game.flags;
  return [f.oldManFreed, f.jeetuJoined, f.metTara, f.metGautam, f.bloodGiven || f.gautamFree || f.torch].filter(Boolean).length;
}

const pick = (arr, n) => arr[n % arr.length];

/** The helpers every conversation uses, bound to who is asking. */
function H(game, ctx) {
  const A = ctx.as === 'jeetu';
  const me = A ? 'Jeetu' : 'Mithi';
  return {
    A, me,
    N: (m, j) => { const t = A ? (j ?? m) : m; return t == null ? null : { narr: t }; },
    ME: (m, j, mood) => { const t = A ? (j ?? m) : m; return t == null ? null : { who: me, text: t, ...(mood ? { mood } : {}) }; },
    P: (m, j) => (A ? (j ?? m) : m),                       // a plain string by perspective
    L: (text, mood, g, listen) => ({ text, ...(mood ? { mood } : {}), ...(g ? { g } : {}), ...(listen ? { listen } : {}) }),
    cont: (label = 'Go on.', onChoose) => ({ label, onChoose }),
    bye: (label = 'Goodbye.', onChoose) => ({ label, onChoose }),
    trust: trustOf(game),
  };
}

export const CONVERSATIONS = {
  // ---------------------------------------------------------------------------------------------- Sion Junction, 05:40
  oldman(game, ctx) {
    const { d, n } = ctx, { A, N, ME, L, bye, P, trust } = H(game, ctx);
    if (!game.flags.oldManFreed) {
      return {
        mood: 'pain',
        lines: [N('A hand, grey with dust, closes on your wrist. Under the slab, somebody is still breathing: short, wet, afraid.', 'A grey hand sticks out of the rubble and grips your ankle. Under the slab there is a face, white with dust, and two wet eyes looking right at you.')],
        choices: [bye(P('Hold on. I am digging.', 'Baba, hold on! I will get help! (...no. I will dig.)'))],
      };
    }
    if (d.justFreed) {
      d.justFreed = false;
      return {
        mood: 'worry',
        lines: [
          N('The slab tips. Under your hands a man breathes, thin as paper, grey to the eyelashes. He smells of chai and cement.', 'The slab tips. He crawls out of the dust: an old man in a torn kurta, grey from head to foot, shaking like a leaf in the wind.'),
          L('Beti... arre, beti. Allah bless those hands. I was lying there thinking: this is how it ends, under the road I have been selling tea beneath for forty years.'.replace('beti', P('beti', 'beta')), 'worry', 'chest'),
          L(P('You were calling a name. I heard it through the stone: "Setu." Your brother?', 'You were shouting for someone. Setu? I know that name. Two boys, before the light.'), 'worry'),
          L('Before dawn they came up the steps behind my stall, the bigger one pulling the little one by the hand. "Chal, bas thoda aur," he kept saying. One more bit. One more bit. Up to the SkyGrid, the top deck. I told them: "Beta, it is not allowed." They laughed.', 'sad', 'point'),
          L('Then the whole sky sat down on Sion Junction.', 'sad'),
          L('They took the hurt children to Sion Hospital. South of here, past the dead tree. Go. Do not stand here with an old man; I have a grandson to find too.', 'worry', 'point'),
        ],
        choices: [{ label: trust > 2 ? P('Thank you, Baba. Stay with the rescuers.', 'Thank you, Baba. Go to the tents, they will help you.') : P('Do not thank me, Baba. Stay with the rescuers.', 'Baba, go to the tents. They will help you. I have to go.'), onChoose: () => { d.learn('hospital'); } }],
      };
    }
    return {
      mood: 'worry',
      lines: [L(n % 2 ? 'Is the boy found? No? Then why are you standing here talking to a chai-wallah? Sion Hospital, beti. South past the dead tree. Go.'.replace('beti', P('beti', 'beta')) : 'My tea tin is under all that. Forty years. Leave it. Sion Hospital, south past the dead tree. Go, go.', 'worry', 'point')],
      choices: [bye(P('I am going.', 'I am going, Baba.'))],
    };
  },

  'rescuers-collapse'(game, ctx) {
    const { d, idx, n } = ctx, { A, N, ME, L, P } = H(game, ctx);
    const free = game.flags.oldManFreed;
    const tell = [
      [L('Hey! Mind the slab, it is still settling! (a cough, a breath) A boy? Madam, I have pulled out forty boys since five o\'clock.', 'worry', 'point'),
        L('Two went up that flyover before dawn, someone said. The hurt children go to Sion Hospital. South, past the dead tree. Ask there.', 'neutral', 'point')],
      free ? [L('You pulled him out? Good hands. We need hands. Everybody else is filming.', 'smile', 'explain'), L('Sion Hospital, beti. If your boy is breathing, that is where they put him. Ambulances cannot get in: the Sion Panvel connector is under that.'.replace('beti', P('beti', 'beta')), 'worry', 'point')]
        : [L('Quiet! Everyone, quiet! (he cups his ear) There. A moan, under that heap, east. Nobody has hands to spare.', 'shout', 'point'), L('If you are not digging, go. Sion Hospital is south, past the dead tree. The injured children are there.', 'worry', 'point')],
      [L('Water? No. Go. The rubble is warm, can you feel it? Everything is still settling. Dharavi Fire Brigade says two hours before the cranes can come.', 'worry', 'explain'), L('Names go on the tents, bodies by the north wall. Hospital first. The living first.', 'sad')],
      [L('Eight years old? Thin, coughing? I saw a boy with a bandaged arm, they carried him south on a door. Sion Hospital.', 'worry', 'point'), L('Hold on to the rope when you cross the plates. They shift.', 'worry')],
      [L('Get off the heap! Do you want to join them?', 'shout', 'shout'), L('The children went to Sion Hospital. Please. Go.', 'worry')],
    ];
    const t = tell[(idx + n) % tell.length];
    return { lines: t, choices: [{ label: P('Thank you.', 'Okay. Thank you, uncle.'), onChoose: () => { d.learn('hospital'); } }] };
  },

  'rescuers-triage'(game, ctx) {
    const { idx, n } = ctx, { A, N, L, bye, P } = H(game, ctx);
    const T = [
      [L('Name? Age? (a long, tired breath) No. Nobody that small here. I am sorry.', 'sad'), L(P('The bodies are by the north wall. Do not go alone. Take someone.', 'The bodies are by the north wall. Not you, beta. Not alone. Take your elders.'), 'sad', 'point')],
      [L(P('Sit. Drink. You are shaking. Are you the one who is hurt?', 'Beta, sit. Drink this. You are shaking like a leaf. Where are your parents?'), 'worry', 'beckon'), L('Boys come through here asking for sisters, for mothers. I write the names down. I write everything down.', 'sad')],
      [L('Setu? Hmm. (paper rustles) No Setu. Not in this book. Not yet.', 'worry'), L('Come back later. People turn up. Sometimes people turn up.', 'sad')],
    ];
    return { lines: T[(idx + n) % T.length], choices: [bye('Thank you.')] };
  },

  // ---------------------------------------------------------------------------------------------- Sion Hospital
  nurses(game, ctx) {
    const { d, idx, n } = ctx, { A, N, L, P } = H(game, ctx);
    const T = [
      [L(P('Visitors outside! (a trolley rattles past) Oh. You are the sister? The boy with the bandaged arm and head, the bed by the east wall. He keeps saying "Didi will come."', 'Arre, you again! Get back to your bed, you are not discharged! (she stops) No. You are the other one. The sister\'s boy. Your friend with the bandaged head is calling for his Didi on the east side, but...'), 'worry', 'point'),
        L(P('Go. Call him. He answers to voices.', 'No wait. You are the one who is up. Go find her. Tell her Tara madam is looking for a B-positive donor. Middle ward.'), 'worry', 'beckon')],
      [L('Beds are full. Blood is short. B-positive most of all, nothing in the bank since the flyover. (she looks you over)', 'worry', 'explain'),
        L(P('You are B-positive? There is an actress in the middle ward. Her husband is in the ICU. She is begging every corridor for a donor. Tara Shahjehan.', 'Is your sister B-positive? Because there is an actress in the middle ward, Tara Shahjehan, begging every corridor for a donor. Her husband is in the ICU.'), 'worry', 'point')],
      [L('Shh. He is sleeping. They are all sleeping, or nearly.', 'worry'), L(P('Whoever you are looking for, he is not in this ward. Try the east end. The bed by the wall.', 'The boy with the bandage? East end, bed by the wall. Do not wake the others, madam, please.'), 'worry', 'point')],
      [L('Madam Tara? The middle ward. She has not sat down since the flyover fell. Her husband is at the far end, in the ICU.', 'worry', 'point'), L('Be gentle with her. She is brave in the way that costs.', 'sad')],
    ];
    const i = Math.min(T.length - 1, (idx + n) % T.length);
    return { lines: T[i], choices: [{ label: P('Thank you, Sister.', 'Thank you, Sister. I will go.'), onChoose: () => { d.learn('jeetuBed'); } }] };
  },

  // ---------------------------------------------------------------------------------------------- Jeetu
  jeetu(game, ctx) {
    const { d, n } = ctx, { N, ME, L, cont, bye, trust } = H(game, ctx);
    const f = game.flags, joined = !!game.party?.jeetu;
    if (!joined) {
      const first = !f.jeetuTalked;
      f.jeetuTalked = true;
      return {
        mood: 'worry',
        lines: first ? [
          N('A small voice from the bed by the wall. Cracked at the edges, and trying very hard to be brave. It smells of Dettol and old blood.'),
          L('Didi! I knew it was you! I heard you. (a cough) My arm is nothing, it is only a bandage, they put a bandage on everything here. Even my head. Look, I look like a pirate. Arre, you cannot see. I look like a pirate.', 'smile', 'explain'),
          L('Didi... Setu. I saw him. He got into the maintenance lift, the one behind the pillar with the ladder. He was going down. And then... then the whole sky came down.', 'scared', 'point'),
          L('I was angry with him, Didi. He turned back because he could not breathe, and I told him he was a baby. I said, "Bas ek floor aur, baby!" And he went. And I stood there like a hero.', 'sad'),
          ME('It is not your fault, Jeetu. Can you walk?', null, 'worry'),
          L('I can walk. I can run if you want. Take me, Didi, you cannot see, and I can. I am your eyes. Chal!', 'grin', 'beckon'),
        ] : [L('Didi? Take me with you. I can walk. I can be your eyes.', 'worry', 'beckon')],
        choices: [
          { label: 'Come with me, Jeetu.', onChoose: () => { d.joinJeetu(); return { mood: 'smile', lines: [N('The bed creaks. A small, warm hand finds your sleeve and does not let go.'), L('Chal, Didi! I know the way down: the lift has a ladder at the back, behind the market hut, east of the Metro. But the Metro is guarded, everyone knows, they shout at children.', 'explain', 'point'), L('It will be dark down there, Didi. The kind of dark that has weight. We will need a light.', 'scared'), L('And when you press Tab, I will go first and be your eyes, and you can follow my voice. But I cannot sing to the dogs. Only you can.', 'smile', 'explain')], choices: [cont('Stay close.')] }; } },
          { label: 'Rest. I will come back for you.', onChoose: () => ({ lines: [L('Okay, Didi. Okay. I will be here. Do not forget me.', 'sad')], choices: [bye('I will not.')] }) },
        ],
      };
    }
    // in the party: topics, and what the day has done to him
    const hasTorch = game.items?.has('torch');
    const topics = [
      { label: 'Where do we go down?', onChoose: () => { f.knowsShaft = true; return { lines: [L('Two ways. The Metro: stairs, shutters, guards at every turn. Or the maintenance lift, east of the Metro, the little hut: the ladder behind it goes all the way down to the tunnels. I climbed it with Setu.', 'neutral', 'point'), game.items?.has('jacket') ? L('You have the jacket, Didi! They will think you work there. Do not run. Do not sing near the guards.', 'grin', 'explain') : L('And our neighbour sold tickets at the Dharavi Metro. His blue jacket is still on its hook in his flat. Staff walk through.', 'neutral', 'explain')], choices: [cont('Thank you, Jeetu.')] }; } },
      { label: 'How do we swap places?', onChoose: () => ({ lines: [L('Tab, Didi. Press Tab and I take the front, with my eyes and my torch, and you walk behind me. I am slow, my arm hurts, and I cannot sing. But I can read the signs, and I can climb.', 'neutral', 'explain')], choices: [cont('Good.')] }) },
      { label: 'Tell me about Setu.', onChoose: () => ({ lines: [L('He counts everything. Steps, stairs, how many fans on the ceiling. Do you know he has never seen a sunrise? Not once. That is why we went. I said I knew the way.', 'neutral', 'explain'), L('I do not know the way, Didi. My bhaiya took me once. I remembered the first three floors.', 'sad')], choices: [cont('Hm.')] }) },
    ];
    if (n % 3 === 1) topics.push({ label: 'Are you all right?', onChoose: () => ({ lines: [L('My arm hurts. My head hurts. And I keep hearing it, Didi. The noise. It goes on and on, even when it is quiet. (a sniff) I am not crying. It is the dust.', 'sad', 'face'), L('Promise me we will find him before it is dark. Promise, Didi.', 'scared')], choices: [cont('I promise. (She does not know if she can keep it.)', () => {}), cont('Do not make me promise, Jeetu.')] }) });
    const lines = hasTorch
      ? [L(pick(['Light is good, Didi. Light is very good. I will go first when you say.', 'Torch is working, na? Do not waste it, the batteries are from the remote. If it dies, we are in the dark and I will say a lot of silly things.'], n), 'smile', 'explain')]
      : [L(pick(['It will be black down there, Didi. Black-black. I need a light, a real one.', 'Where do we get a torch? The boys near the slum sell them for a fortune. Or... the TV remote, Didi. Think. Batteries.'], n), 'worry', 'shrug')];
    return { mood: 'neutral', lines, choices: [...topics.slice(0, 3), bye('Stay close.')] };
  },

  // ---------------------------------------------------------------------------------------------- Tara
  tara(game, ctx) {
    const { d, n } = ctx, { A, N, ME, L, cont, bye, P, trust } = H(game, ctx);
    const f = game.flags, rays = game.player.rays;
    f.metTara = true;
    const evid = f.breachKnown && game.items?.has('breachEvidence') && !f.cityWarned;
    const warn = { label: 'Show her the evidence. Put it on TV.', note: 'warn the city', onChoose: () => d.warnViaTara() };
    const fetch = { label: 'Didi will give blood. I will get her.', onChoose: () => d.handTo('mithi', ctx.actor) };
    if (f.bloodGiven) {
      if (!f.bridgePermit) {
        d.grantPermit('talk');
        return {
          mood: 'smile',
          lines: [
            N('A hand finds yours. Warm, dry, with a ring of soft metal on every finger. It smells of jasmine, hospital soap, and fear that has been scrubbed off.', 'Tara madam, in the same crumpled sari from the morning, her kajal smudged, but her chin up. She looks at you like a person looks at a medal.'),
            L(P('Sameer is breathing on his own, child. Your blood is in him. I cannot say thank you enough times.', 'Sameer is breathing on his own, Jeetu. Your Didi\'s blood is in him. I cannot say thank you enough times.'), 'smile', 'chest'),
            L('I have been on the telephone since you left. The Bridge Authority owes Sameer\'s studio more than one favour. There is a pier gate on the Sewri quay. Your names are on its list now, yours and Setu\'s. Show your face and it will open.', 'explain', 'explain'),
            L('Find him. Bring him to the bridge. That is all I ask.', 'worry', 'chest'),
          ],
          choices: evid ? [warn, bye(P('Thank you, Tara.', 'Thank you, madam.'))] : [bye(P('Thank you, Tara.', 'Thank you, madam.'))],
        };
      }
      return {
        mood: 'worry',
        lines: pick([
          [L('The pier gate will open for you. Sewri quay, then the lift beyond it. Go. Please. The sun comes whether we are ready or not.', 'worry', 'point')],
          [L('Sameer opened his eyes for a moment. He said a name. I think it was mine. Go, child. Bring Setu to the light.', 'smile', 'chest')],
          [L('They keep asking me for a statement. "Tara madam, a word." I have said everything I know to the walls. Go, go.', 'sad', 'shrug')],
        ], n),
        choices: evid ? [warn, bye('I will.')] : [bye('I will.')],
      };
    }
    const first = n === 0;
    const canGive = rays >= COSTS.blood.min;
    if (A) {
      // Jeetu: she knows him (the boy with the arm), and he cannot give what she needs: his Didi can
      return {
        mood: 'worry',
        lines: first ? [
          N('Tara madam, from the posters: huge dark glasses pushed up on her head, her sari creased, kajal run down to her chin. She is holding a phone like a weapon. Jeetu has been in a bed beside her ward all morning.'),
          L('Jeetu! You are walking? (she kneels) Beta, you gave the nurses such a fright. Where is your didi? The blind one with the beautiful voice?', 'worry', 'beckon'),
          L('My husband was driving on the top deck of the SkyGrid when it went. He needs blood. B-positive. The nurses told me your sister is B-positive. Is it true?', 'scared', 'wring'),
        ] : [L('Please, Jeetu. B-positive. Only that. Where is your didi?', 'worry', 'wring')],
        choices: [
          fetch,
          { label: 'Please do not tell Setu\'s Didi I was out of bed.', onChoose: () => ({ lines: [L('(a very small laugh) I have told nobody a thing in twenty years of film sets. Go.', 'smile')], choices: [bye('Okay, madam.')] }) },
        ],
      };
    }
    return {
      mood: 'worry',
      lines: first ? [
        N('A voice you know from a thousand radio jingles: smooth, tired, kind. It stops the corridor around it.'),
        L(trust > 1 ? 'Child, you are shaking. Sit. No, please, sit. I am Tara. (a breath that is almost a laugh) You have heard of me. Everyone has.' : 'Child, you are shaking. Sit. No, please. I am Tara. (a breath that is almost a laugh) You have heard of me, everyone has. Do not worry, I am not going to ask for a selfie.', 'smile', 'chest'),
        L('My husband was driving on the top deck of the SkyGrid when it came down. He needs blood. B-positive. The bank at Sion has nothing. The nurses say you are B-positive.', 'scared', 'wring'),
      ] : [L('Please. He is breathing through a machine, and the machine is hungry. B-positive. Only that.', 'worry', 'wring')],
      choices: [
        { label: 'I am B-positive. Take mine.', note: `-${COSTS.blood.rays} rays, a quarter hour`, enabled: canGive, why: 'You are too weak to give blood. Find some light first.', onChoose: () => d.giveBlood() },
        { label: 'My brother is missing. I cannot stop now.', onChoose: () => ({ lines: [L('Then go. I understand. I would do the same.', 'sad', 'chest'), L('If you change your mind, I will be here. I am not leaving this corridor.', 'worry')], choices: evid ? [warn, bye('Thank you.')] : [bye('Thank you.')] }) },
        ...(f.jeetuJoined || f.jeetuTalked ? [] : [{ label: 'Have you seen a boy called Jeetu?', onChoose: () => ({ lines: [L('The one with the bandaged arm? East ward, by the wall. I asked the nurses to watch him. Go to him, child.', 'smile', 'point')], choices: [bye('Thank you.', () => d.learn('jeetuBed'))] }) }]),
      ],
    };
  },

  sameer(game, ctx) {
    const { N, ME, L, bye, P, A } = H(game, ctx);
    const given = game.flags.bloodGiven;
    return {
      lines: A ? [
        N(null, 'On the bed under a thin sheet: the man from every poster in Setu\'s room. Sameer Shahjehan, with a tube in his nose and a bandage on his head. He looks like nobody Jeetu has ever seen on a screen. Smaller.'),
        N(null, given ? 'A line on the monitor goes up and down with a patient rhythm. The nurse says it is steady now.' : 'The monitor beeps. The line on the screen goes up and down and does not speed or slow.'),
        ME(null, 'Setu will not believe this. He has been saying he will meet him for two years. (a pause) He does not look like a hero, Didi would say.'),
      ] : [
        N('A machine counts him in small green beeps. Under the tube, a breath you could mistake for a sleeper\'s.'),
        N(given ? 'There is a rhythm in it now. Some of it is yours.' : 'The smell is iodine and expensive flowers. The beeps do not slow, and do not speed.'),
        N('This is the face on every billboard on the way to school. It does not look like a face anyone could idolise now.'),
      ],
      mood: 'sleep',
      choices: [bye(P('Rest.', 'Get well, Sameer sir.'))],
    };
  },

  // ---------------------------------------------------------------------------------------------- Sion Police Station
  gautam(game, ctx) {
    const { d, n } = ctx, { A, N, ME, L, bye, P, trust } = H(game, ctx);
    const f = game.flags;
    if (f.gautamFree) {
      const live = d.gautamDistracting();
      return {
        mood: live ? 'worry' : 'neutral',
        lines: live ? [L(P('The guards are watching me, not you. Go now while I still have their ears, Mithi. Walk. Do not run. Do not sing.', 'The guards are all looking at me. Go, Jeetu, now! Take Didi in by the side stairs. And do not let her sing in the light.'), 'worry', 'point'), L('And Mithi. Find him.', 'smile', 'chest')]
          : [L('They have stopped listening to me. Go quietly. Go the way you came.', 'sad', 'shrug')],
        choices: [bye(P('Thank you, Gautam.', 'Okay. Thank you, Gautam sir.'))],
      };
    }
    f.metGautam = true;
    const pay = [
      { label: 'Pay his bail, in light.', note: `-${COSTS.bail.rays} rays`, enabled: game.player.rays >= COSTS.bail.min, why: 'You cannot spare that much light.', onChoose: () => d.payBail('rays') },
      { label: 'Pay his bail, in time.', note: `+${COSTS.bail.hours} hours of forms`, onChoose: () => d.payBail('time') },
      bye('Not yet, Gautam.'),
    ];
    return {
      mood: n === 0 ? 'smirk' : 'neutral',
      lines: n === 0 ? [
        N('Behind the bars: a dry voice, cracked at the edges, trying a joke. The cell smells of phenyl and damp. Somewhere a fan clicks, and a sergeant yawns.', 'A dim cell at Sion Police Station, bars painted so often they have gone fat. Gautam sits on a bench with a swollen eye and a torn shirt, grinning like a boy who has been caught with a cricket ball.'),
        L(P('Mithi? (a short laugh) Of course it is you. Nobody else walks so quietly into a police station.', 'Jeetu?! (he stands) What are you doing here, where is Mithi? No. Do not tell me. She sent you ahead. Of course she did.'), 'smile', 'explain'),
        L('I hit a sergeant. In my defence, he was standing between a hundred people and the Metro stairs at Dharavi. The bail was five hundred rupees. Then it was two thousand. Every time I argue, the number grows taller.', 'smirk', 'hips'),
        L('Setu is missing? Mithi... (his voice drops) I was at the shutters all morning. They are digging by hand, you know, the big machines cannot reach the lowest level. I told them: let me go down, I have two hands. They said I was a nuisance.', 'worry', 'chest'),
        L('Listen. Get me out, and I will go to the Metro gate and make so much noise those guards will forget their own names. You walk past. Do not run. Do not sing.', 'explain', 'point'),
      ] : [L(P('Mithi. The offer stands. Out of here, to the Metro gate, shouting. I have been practising my voice.', 'Jeetu, the offer stands. You get me out, I get you in. And I will shout. I am very good at shouting.'), 'smirk', 'beckon')],
      choices: A ? [...pay.slice(0, 2).map((c) => ({ ...c })), pay[2]] : pay,
    };
  },

  // ---------------------------------------------------------------------------------------------- Neeche Dharavi
  aayat(game, ctx) {
    const { d, n } = ctx, { A, N, ME, L, cont, bye, P } = H(game, ctx);
    const st = setuStage(game);
    const info = () => {
      const T = {
        '-1': [L('You have him! Setu! (the first small laugh you have heard in the dark) Take care of him. He counts his steps. He will count them even when he is happy.', 'smile', 'explain')],
        0: [L('A box fell from the sky, east, by where the trains stopped. A boy walked out of it. Coughing. He blows into a tin thing and it sings. He is not here yet.', 'worry', 'point'), L('Go east, along the old rails. By the broken lift.', 'neutral', 'point')],
        1: [L('Setu? He is here. Behind me, in my room, by the diya. He is scared of the dark; he counts his steps out loud.', 'neutral', 'point'), L('He gave me his music box. First time I... (she stops) Go to him.', 'smile', 'chest')],
        2: [L('Seth took the children to the machine at the bell. Setu too. He dropped the music box and I could not find it in the dark.', 'worry', 'explain'), L('North, past the cages, where the walls drip. Go quiet. Seth shouts.', 'scared', 'point')],
        3: [L('They sold him. Seth sold him to the contractor, and the contractor took him south, to the doctor. Setu coughs too much.', 'sad', 'explain'), L('South. The long tunnel with the red lamp.', 'neutral', 'point')],
        4: [L('He came back here! He asked how to go up. I showed him the vent by the doctor. He is small, he fits. He is not here.', 'neutral', 'explain'), L(P('You cannot go in the vent. Go round, up the stairs, to the street. The stack is on the east side of the hospital.', 'You are too big for the vent. Go round, up the stairs, to the street. The stack is east of the hospital.'), 'neutral', 'point')],
        5: [L('He went up the vent, hours ago. He said Didi would be at the old house, near where the road fell. He had his music box again. I stole it back for him.', 'smile', 'chest'), L('Go up. Tents, near where the road fell. Sion Junction.', 'neutral', 'point')],
        6: [L('He said "Didi promised the bridge, the one where I was found." East, towards where the sun comes. He went to wait.', 'neutral', 'point'), L('He is very small to walk so far.', 'worry')],
      };
      return T[st];
    };
    const first = n === 0;
    return {
      mood: 'worry',
      lines: first ? [
        N('Someone stands very still in the dark. A small child\'s breath, held. You can smell lamp oil, wet stone, and a clothes line that never dries.', 'In the lamp-glow: a girl, about Setu\'s age, thin as a reed, barefoot, with a plait and a look that has already decided not to like you. Behind her the tunnel is carved into little rooms, curtains of sacking, a diya.'),
        L(P('You are... outside people. You talk loud. (a pause) You are looking for someone.', 'Tum bahar ke ho? Outside people. You wear shoes. (she looks at his torch) Who are you looking for?'), 'neutral', 'cross'),
      ] : [L(P('Didi?', 'Torch-boy?'), 'neutral')],
      choices: [
        { label: P('A boy, eight. Coughs. His name is Setu.', 'My friend Setu. Eight, thin, cough. He plays the mouth organ.'), onChoose: () => { d.learnSetu('aayat'); return { lines: info(), choices: [cont(P('Thank you, Aayat.', 'Thanks, Aayat. You are brave.'))] }; } },
        { label: 'Where do the air vents go?', onChoose: () => ({ lines: [L('Up. All the way to the street. Too small for you. For a boy, yes.', 'neutral', 'point'), L('Most are shut since the roof fell. Only three left.', 'worry')], choices: [cont('I see.')] }) },
        ...(st !== 0 ? [{ label: P('What was it like, his music?', 'What was it like? His tin music.'), onChoose: () => ({ lines: [
          L('(she is quiet for a long time) Like when the bell does not ring. Like the day Seth forgot to shout.', 'sad'),
          L('He blew in it and my chest went... open. Nobody gave me anything before. People take. Seth takes. The bell takes.', 'sad', 'chest'),
          L('He said it is called mouth organ. I said what is organ. He said: it makes the inside of you loud.', 'smile'),
          L('(the smallest smile you will ever hear, and then it is gone, like a match) I gave it back. He needs it more. Or... I will give it back.', 'worry', 'chest'),
        ], choices: [cont(P('Thank you for telling me.', 'Thanks, Aayat. He will want to hear that from you.'))] }) }] : []),
        bye('Stay safe, Aayat.'),
      ],
    };
  },

  kaalu(game, ctx) {
    const { d, n } = ctx, { A, N, ME, L, cont, bye, P } = H(game, ctx);
    const st = setuStage(game);
    const T = {
      '-1': [L('You have him already? Then why are you in my tunnel? (smoke, a rough laugh) Go. Do not come back.', 'angry', 'point')],
      0: [L('A lift fell on the east side this morning. They say a boy walked out of it. Not mine. Not yet.', 'smirk', 'explain'), L('East. Along the old rails, by the Metro.', 'neutral', 'point')],
      1: [L('The girl Aayat found a new boy. Hiding in her room, west, in the catacombs. (a laugh) Finders keepers. By the afternoon bell he will be mine.', 'smirk', 'explain')],
      2: [L('The little one with the tin music box? He is here, by the cutter. (he coughs, spits) The contractor has paid a deposit on him; he comes at the evening bell.', 'smirk', 'point'), L(P('Be quick, blind girl. Business is business.', 'You want him back, pay for him. Eh? You have a rupee? No? Then run along.'), 'angry', 'hips')],
      3: [L('Sold. The contractor took him south, to the doctor: the boy was wheezing like a bellows. Hours ago.', 'neutral', 'point'), L('Ask the contractor. He is by the machine. Do not ask me for a refund.', 'smirk', 'shrug')],
      4: [L('Gone. The doctor lost him, they say: climbed out through a vent. The contractor is in a foul mood. Ask him.', 'angry', 'point')],
      5: [L('Up? Out? What is it to me. I do not keep children who do not stay.', 'smirk', 'shrug')],
      6: [L('Boy? What boy? I have forty boys. Go and annoy someone else.', 'angry', 'point')],
    };
    return {
      mood: 'smirk',
      lines: n === 0 ? [
        N('A voice like a cart on gravel. Beedi smoke, hot iron, the machine ticking as it cools. Somewhere behind him, small feet shift behind bars.', 'A huge man behind a rusted desk, a ledger open in front of him, a beedi in the corner of his mouth. Behind him, a row of little faces behind wire, very quiet. The cutter head glints in the dark like a giant\'s tooth.'),
        L(P('Who lets a blind girl into my tunnel? (a laugh) Sit, sit. Everyone who comes down here wants something.', 'Chhotu, who let you in? Eh? (he looks at you the way a butcher looks at a goat) How old? Ten? Good hands. You want a job? Forty rupees a day and a roti.'), 'smirk', 'wide'),
      ] : [L('What now?', 'angry', 'hips')],
      choices: [
        { label: P('I am looking for my brother. Setu.', 'My friend Setu. A boy. He has a mouth organ.'), onChoose: () => { d.learnSetu('kaalu'); return { lines: T[st], choices: [cont('...')] }; } },
        { label: 'Why are those children behind wire?', onChoose: () => ({ lines: [L('Wire? Beds. They sleep better than you do. (a long drag) Forty rupees, a roti, a bell. The ones who cry get the bell later. In this city, who does better?', 'smirk', 'wide'), L('In my tunnel nobody is a child. A child is an expense. A hand is a hand.', 'angry', 'hips'), N('Behind him, a small sound. Quickly hushed.', 'Behind him, a very small face turns away from the wire.')], choices: [cont('...')] }) },
        bye('Never mind.'),
      ],
    };
  },

  contractor(game, ctx) {
    const { d, n } = ctx, { A, N, ME, L, cont, bye, P } = H(game, ctx);
    const st = setuStage(game);
    const T = {
      '-1': [L('Found him already? Good for you. I only bought labour. I never touched the boy.', 'neutral', 'cross')],
      0: [L('A boy? I buy labour from Seth, by the cabin there. Nothing that coughs. Ask him.', 'neutral', 'point')],
      1: [L('A new boy? Seth will have him by the afternoon bell. Ask Seth, by the cabin.', 'neutral', 'point')],
      2: [L('The coughing one. Seth is showing him off. I will take him to the doctor when the bell rings; he is no use to me wheezing.', 'neutral', 'explain'), L('Wait. Or take the long tunnel south, to the clinic, the doctor\'s lamp is red. I do not care who walks there.', 'smirk', 'point')],
      3: [L('He wheezed, so I took him to the doctor. South, the long tunnel, the clinic with the red lamp. The doctor kept him. Go.', 'neutral', 'point')],
      4: [L('The doctor sent word: your boy slipped out. A vent. I do not want trouble, I only buy labour.', 'worry', 'shrug'), L('Clinic vent, at the far end. It comes out on the street, east of the hospital.', 'neutral', 'point')],
      5: [L('Slipped out? Hours ago. I have not seen him. He is somebody else\'s problem now.', 'neutral', 'shrug')],
      6: [L('Your brother? I never heard of a bridge. I never heard of any boy.', 'neutral', 'cross')],
    };
    return {
      mood: 'neutral',
      lines: n === 0 ? [
        N('Pressed cloth, cold cologne under the iron smell. A voice that has never raised itself, because it has never had to.', 'A man in a pressed beige safari shirt and a SURYA hard hat, spotless in the middle of the mud. A badge on his chest, a file in his hand, and the careful face of someone reading from a script.'),
        L(P('This is a restricted site, miss. SURYA subcontract, Mithi Line, Phase C. (a polite cough) Are you lost?', 'This is a restricted site, young man. SURYA subcontract. Mithi Line, Phase C. Does your mother know you are here?'), 'neutral', 'cross'),
      ] : [L(P('Miss?', 'Run along, young man.'), 'neutral')],
      choices: [
        { label: P('A boy, eight. Setu. Seth said you bought him.', 'My friend Setu, eight. Seth said you bought him.'), onChoose: () => { d.learnSetu('contractor'); return { lines: T[st], choices: [cont('...')] }; } },
        { label: P('What are you boring toward?', 'Why is the floor wet, sir?'), onChoose: () => { game.flags.heardBoring = true; return { lines: [L('West, toward the old pumping chamber. The engineers said stop. The engineers say a lot of things.', 'worry', 'point'), L('The walls weep now, down there. It is only condensation. (his voice does not quite agree with his words)', 'worry', 'shrug')], choices: [cont('Condensation.')] }; } },
        bye('I am leaving.'),
      ],
    };
  },

  doctor(game, ctx) {
    const { d, n } = ctx, { A, N, ME, L, cont, bye, P } = H(game, ctx);
    const st = setuStage(game);
    const T = {
      '-1': [L('You have your boy. Good. His lungs are good: clean air all his life, then this. Keep him away from dust.', 'neutral', 'explain')],
      0: [L('No boy here. If the contractor brings a coughing one, I will see him. Clinic is quiet today. (a cough of his own)', 'neutral', 'shrug')],
      1: [L('No boy here yet. They breed asthma in the catacombs. If he comes, I will see him.', 'neutral', 'shrug')],
      2: [L('Not yet. The contractor sometimes sends me children when they wheeze. Come back after the evening bell.', 'neutral', 'shrug')],
      3: [L('He is on the cot at the end. Asthma, and not underground-born: I know the lungs of this place and his are not. I gave him a second inhaler. He is tracing a map on the floor with his finger. Counting.', 'worry', 'point'), L('Take him. Gently.', 'sad')],
      4: [L('Gone. I was stitching a man and turned my back: he slipped out. He asked me about a vent, I will swear. The one at the far end climbs to the street, east of the hospital.', 'worry', 'point'), L(P('Small enough to fit. You, no. Go round: the stairs, the street, the stack.', 'Small enough to fit, you are not. Go round: the stairs, the street, the stack.'), 'neutral', 'point')],
      5: [L('He left hours ago. The contractor was furious. Up the vent, I think. He asked about a girl with a flute.', 'neutral', 'shrug')],
      6: [L('I told him the sun would come soon enough. He said: not here. East.', 'sad')],
    };
    const suspicious = n === 0;
    return {
      mood: 'worry',
      lines: n === 0 ? [
        N('Antiseptic. A red lamp ticking above a cot. A tired man\'s voice, patient the way a well is patient, and wary the way a well should be.', 'A thin man in a stained white coat that was probably clean in another life, a headlamp pushed up over a bald scalp, glasses mended with tape. A red lamp, a row of cots, and a man who has stopped being surprised.'),
        L(P('Sit, sit. Cough or fever? (he stops) You are not sick. Nobody comes to this clinic healthy. Who sent you? Not the police? Not SURYA?', 'Sit, sit. Cough? Fever? (he stops) You are not sick. And you are not from here. Who sent a child down here with a torch? Not the police?'), 'worry', 'cross'),
        L(P('I ask because last night a boy came with that same look you have. Above-ground. The lungs of someone who has breathed clean air. I told someone about him. I will not say whom.', 'I ask because last night a boy came with the same look you have. Above-ground lungs. I reported him to someone. I will not say whom.'), 'worry', 'shrug'),
      ] : [L('Yes?', 'neutral')],
      choices: [
        { label: P('A boy, eight. Setu.', 'My friend, eight. Setu. Wheezes.'), onChoose: () => { d.learnSetu('doctor'); return { lines: T[st], choices: [cont(P('Thank you, Doctor.', 'Thank you, Doctor uncle.'))] }; } },
        ...(n === 0 ? [{ label: P('I am his sister. Not police. Not SURYA.', 'Her brother, I mean, his sister is with me. We are not police.'), onChoose: () => { d.learnSetu('doctor'); return { lines: [
          L(P('(he looks at the white cane, and for a moment he looks very old) Sister. Forgive me. Last month two men in clean shoes came to count my patients and my licence. I do not have a licence. I have a lamp.', '(he looks at your torch, then at your bandages, and sighs) Forgive me. Last month two men in clean shoes came to count my patients and my licence. I do not have a licence. I have a lamp.'), 'sad', 'chest'),
          ...T[st]], choices: [cont(P('Thank you, Doctor.', 'Thank you, Doctor uncle.'))] }; } }] : []),
        bye('Never mind.'),
      ],
    };
  },

  sleepers(game, ctx) {
    const { N, bye, P, A, L, ME } = H(game, ctx);
    const n = ctx.n;
    const lit = game.items?.has('torch') && game.party?.active === 'jeetu';
    return {
      lines: lit ? [N(null, 'The torch finds faces: ghostly, hollow, flinching. A child bolts into the dark, bare feet slapping the stone. A woman puts her arm over her eyes. Nobody speaks.'), ME(null, 'Sorry. Sorry. (he turns the beam to the floor) Sorry.')] : pick([
        [N('Shoulders against shoulders on a damp floor. A voice, half asleep: "Is it the bell?"', 'Dozens of people asleep on the floor, shoulder to shoulder, in whatever they were wearing at the bell. A man opens one eye and closes it again.'), N('Another turns away from where your voice is.', 'A woman murmurs, "Is it the bell?" and turns her face to the wall.')],
        [N('Breathing. A dozen sleepers. Somebody mutters in their sleep and, very softly, somebody else answers them.', 'A dozen sleepers, a dozen breaths. Somebody mutters in their sleep, and somebody else answers them without waking.')],
      ], n),
      choices: [bye(lit ? 'Sorry. Sorry.' : 'Quietly.')],
    };
  },

  // ---------------------------------------------------------------------------------------------- near Dharavi
  torchBoys(game, ctx) {
    const { d, n } = ctx, { A, N, ME, L, bye, P } = H(game, ctx);
    const f = game.flags, has = game.items?.has('torch'), jeetu = !!game.party?.jeetu;
    if (has) return { lines: [L('You have one already, didi! Mind the batteries, they never last. Gold ones from Chor Bazaar last longer.'.replace('didi', P('didi', 'bhai')), 'grin', 'point')], choices: [bye('I will.')] };
    return {
      mood: 'smirk',
      lines: [
        N('Two boys, giggling, then hushed. A metal click, a thin buzz of a small beam: you can hear it more than see it. They smell of kerosene and fried dough.', 'Two boys on a pile of tyres, one with a torch tucked under his arm like a cricket bat. Raju, Bunty. Both with bare feet and big grins and a sign scratched into the tyre: TORCH 10.'),
        L(P('Torch, didi? Good torch, special torch. Where we live a torch is worth more than a pair of shoes.', 'Arre Jeetu bhai! Torch lene aaya? Good torch, special torch. Where we live a torch is worth two pairs of shoes!'), 'grin', 'explain'),
        ...(jeetu && !A ? [{ speaker: 'Jeetu', text: 'Arre, Raju! It is me, Jeetu! Do not rob us, we are in a hurry!', mood: 'shout', g: 'wave' }] : []),
        L('Two rays of yours, or one hour carrying our water cans from the Dharavi tank. Or no torch. Your choice, bhai.'.replace('bhai', P('didi', 'bhai')), 'smirk', 'wide'),
      ],
      choices: [
        { label: 'Take two rays of light.', note: `-${COSTS.torch.rays} rays`, enabled: game.player.rays >= COSTS.torch.min, why: 'You cannot spare the light.', onChoose: () => d.buyTorch('rays') },
        { label: 'Carry the water cans.', note: `+${COSTS.torch.hours} hour`, onChoose: () => d.buyTorch('time') },
        bye('Not now.'),
      ],
    };
  },
};
