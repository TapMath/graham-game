// The objective chain of PLAN 1b "Game flow" (steps 1 to 4 and 6; 5 is Setu's own timeline, in setu.js, and 6b's trail clues).
// Rule-driven entries for `game.objectives` (src/systems/story/objectives.js): `when` shows the goal, `done` is checked whatever way
// the player got there, so nothing is a gate. One primary at a time (first applicable), up to two optional ones (by priority).
//
//   collapse     dig the old man out                   done: he is free, or you reached the hospital, or Jeetu is with you
//   hospital     find Jeetu (sing, he answers)         done: Jeetu joined
//   below        get below (shaft, jacket, Gautam)     done: you stood in the tunnels (or Setu is already found)
//   underground  find Setu in the tunnels              text follows the last lead (Aayat, Kaalu, the contractor, the doctor)
//   bridge       take Setu to the Sunrise Bridge       text mentions Tara's permit
//   optional:    warn (evidence -> Tara), permit (Tara's call), light (torch), bail (Gautam), blood (Tara's husband)
import { STAGES } from './cast/conversations.js';

const LEAD_TEXT = {
  liftWreck: 'Setu fell with the maintenance lift: look east, along the old rails by Dharavi Metro, near the wrecked lift car.',
  catacombs: 'Setu is in the Neeche Dharavi catacomb homes to the west, with Aayat.',
  boringSite: 'Setu is at the boring machine, north of the catacombs. Go quietly: Kaalu Seth shouts.',
  contractor: 'Seth sold Setu to a contractor: find him near the boring machine.',
  clinic: 'The contractor took Setu to the underground doctor, south in the long tunnel with the red lamp.',
  vent: 'Setu slipped out through a clinic air vent: look for the grille on the street east of Sion Hospital.',
  tents: 'Setu climbed out and went looking for you: try the triage tents at Sion Junction.',
  bridge: 'Setu went to wait at the Atal Setu at Sewri, east, where the sun comes up.',
};

export function defineChain(game, d) {
  const O = game.objectives, f = () => game.flags;
  const has = (id) => game.items?.has(id);
  const joined = () => !!game.party?.jeetu;
  const setuFound = () => !!(game.setu?.found || game.setu?.following);

  O.define({ id: 'collapse', order: 10, text: 'Under the roar at Sion Junction there is a moan, east, under the rubble. Find the old man and dig (hold E).',
    when: () => true, done: () => f().oldManFreed || f().knowsHospital || f().visitedHospital || joined() || f().reachedBelow });

  O.define({ id: 'hospital', order: 20,
    text: () => (f().jeetuCalled ? 'Jeetu is calling for you. Follow his voice to the bed by the east wall.' : 'Jeetu was taken to Sion Hospital, south of the dead tree. Inside, sing or call out: he will answer.'),
    when: () => f().oldManFreed || f().knowsHospital || f().visitedHospital, done: () => joined() || f().reachedBelow });

  O.define({ id: 'below', order: 30,
    text: () => {
      if (has('jacket')) return 'Walk into the Metro in the jacket: do not run, do not sing, do not linger in a guard\'s light. Or take the maintenance shaft.';
      if (f().gautamAtMetro && game.clock.t < d.gautamUntil) return 'Gautam is shouting at the guards: slip into the Metro now, or take the maintenance shaft east of it.';
      return 'Get below. Dharavi Metro is guarded. Jeetu knows the maintenance shaft behind the market hut; a blue Metro jacket from the neighbour\'s flat in Dharavi would get you through the main gate.';
    },
    when: () => joined(), done: () => f().reachedBelow || setuFound() });

  O.define({ id: 'underground', order: 40,
    text: () => LEAD_TEXT[f().setuLead] ?? 'Search the tunnels for Setu. Ask the people who live below: Aayat, the Big Man, the contractor, the doctor.',
    when: () => f().reachedBelow && !setuFound(), done: () => setuFound() });

  O.define({ id: 'search', order: 45,
    text: () => LEAD_TEXT[f().setuLead] ?? 'Find Setu. Listen for his mouth organ.',
    when: () => joined() && !f().reachedBelow && !setuFound() && !!f().setuLead, done: () => setuFound() });

  O.define({ id: 'bridge', order: 50,
    text: () => {
      if (f().bridgePermit) return 'Take Setu to the Atal Setu on the east edge, at Sewri. Tara\'s permit opens the pier gate on the quay.';
      if (f().taraFavour) return 'Take Setu to the Atal Setu at Sewri. Tara can arrange a permit: talk to her at Sion Hospital. Or climb the gates (8 rays).';
      return 'Take Setu to the Atal Setu at Sewri. The pier gate needs a permit; the way up through New Wadala needs 8 rays of light.';
    },
    when: () => setuFound(), done: () => false });

  // ---- optional (priority order: first listed wins when more than two apply)
  O.define({ id: 'warn', optional: true, order: 100, text: 'Take the evidence to Tara: she can put the breach on every screen. (Or the Control Tower terminal.)',
    when: () => f().breachKnown && has('breachEvidence') && !f().cityWarned, done: () => f().cityWarned });
  O.define({ id: 'permit', optional: true, order: 110, text: 'Tara is arranging a bridge permit: talk to her again.',
    when: () => f().bloodGiven && !f().bridgePermit, done: () => f().bridgePermit });
  O.define({ id: 'light', optional: true, order: 120, text: 'Get a light for Jeetu: buy a torch from the boys near the slum (2 rays or an hour), or take the batteries from the TV remote at home.',
    when: () => joined() && !has('torch'), done: () => has('torch') });
  O.define({ id: 'bail', optional: true, order: 130, text: 'Gautam is in a cell at the police station: pay his bail and he will distract the Metro guards.',
    when: () => f().metGautam && !f().gautamFree, done: () => f().gautamFree });
  O.define({ id: 'blood', optional: true, order: 140, text: 'Tara\'s husband needs B-positive blood: give blood (3 rays) and she will help you later.',
    when: () => f().metTara && !f().bloodGiven, done: () => f().bloodGiven });
  void STAGES;
}
