// What the crash site says in the first minutes (src/systems/story/opening.js). Mithi hears all of it: shouts across the pile, people
// on their phones, a man telling himself what he saw, a constable at the tape. `who` is the speaker's label in the feed; `thought` lines
// are said under the breath, close by, and are shown in Mithi's italic narration instead of as speech.
const S = (who, text) => ({ who, text });
const T = (who, text) => ({ who, text, thought: true });

export const LINES = {
  // what happened: everyone trying to make sense of it
  what: [
    S('Man', 'The whole junction folded. Like a ladder. Top one first, then the next, then the next.'),
    S('Woman', 'I heard it go from Dharavi side. Boom, boom, boom. Five times. I counted.'),
    S('Rickshaw driver', 'I was right under it! I was right under it and then I was not under anything!'),
    S('Boy', 'Bhaiya, was it a bomb? Everyone is saying bomb.'),
    S('Old woman', 'No bomb. It was cracked for a month. Water coming through the joints. Everybody saw. Nobody did anything.'),
    S('Man on a phone', 'Haan, Sion. Sion Junction. All five levels. Switch on the news. No, I am fine. I am fine, I said.'),
    S('Engineer', 'Those piers were never meant for five decks. Three, maybe. They kept adding.'),
    S('Woman on a phone', 'The bus, Ma. The 7 Limited. He takes the 7 Limited. He is not picking up.'),
    S('Vendor', 'My stall was here. Here. I am standing on it.'),
    S('Man', 'SURYA built it. SURYA built it, SURYA signed it, now let SURYA come and dig.'),
    S('Student', 'It is already on every feed. Drone footage. They had drones up before the dust came down.'),
    S('Man', 'Diwali morning. Diwali morning, and this.'),
  ],
  // the rescue itself
  rescue: [
    S('Rescuer', 'Chain! Make a chain! Pass it back, pass it back, do not throw!'),
    S('Rescuer', 'Quiet near the slab! If anyone is calling we have to hear them!'),
    S('Rescuer', 'Jack! Bring the jack! This one is pinned at the leg!'),
    S('Rescuer', 'Two of you on this beam. On three. Ek, do, teen!'),
    S('Volunteer', 'Water! Who has water? The man by the bus needs water!'),
    S('Rescuer', 'Do not pull him. Do not pull! Hold his head, we lift the concrete, not the man.'),
    S('Nurse', 'Red tag, this one. Red. Next ambulance, him first.'),
    S('Rescuer', 'Torch here! Shine it in the gap! There, there, I can see a hand!'),
    S('Volunteer', 'Bhabhi, sit, sit. You are bleeding. Let them look at you first.'),
    S('Rescuer', 'Stretcher! We need a stretcher at the taxi!'),
  ],
  // the ambulances that do not come
  noAmbulance: [
    S('Woman', 'Where are the ambulances? It has been twenty minutes!'),
    S('Volunteer', 'The road is blocked at King\'s Circle. They are coming the long way, through the bazaar.'),
    S('Man', 'Sirens. I can hear sirens. Why are they not getting closer?'),
    S('Nurse', 'Four critical and no ambulance. Keep them flat. Keep them warm. Keep them talking.'),
    S('Rescuer', 'Call 108 again! Somebody call again!'),
  ],
  ambulance: [
    S('Constable', 'Ambulance! Side! Side! Raasta do, make way!'),
    S('Nurse', 'Red tags first! The boy and the woman with the leg!'),
    S('Volunteer', 'One more coming behind it, they say. One at a time. The lane only takes one.'),
  ],
  // hard hats
  hats: [
    S('Volunteer', 'Hard hats! Everybody near the pile, a hard hat! It is still coming down!'),
    S('Volunteer', 'Helmet, uncle, helmet first, then you dig.'),
    S('Constable', 'No helmet, no pile. Go to the red crate.'),
  ],
  // debris still falling from the broken decks above
  falling: [
    S('Rescuer', 'Upar! Look up! It is still coming!'),
    S('Man', 'Bhago! Move, move, move!'),
    S('Rescuer', 'Stay out from under the walkway ends! The rebar is letting go!'),
    S('Woman', 'Hai Ram! That nearly hit him!'),
  ],
  // families searching
  searching: [
    S('Woman', 'Ravi! Raviii! Has anyone seen a boy in a blue school shirt?'),
    S('Man', 'My brother drives the water tanker. A blue tanker. Has anyone seen a blue tanker?'),
    S('Girl', 'Papa was on the top deck. He said he would bring jalebi.'),
    S('Old man', 'My shop. My shop was under there. Never mind the shop. Has anyone seen my son?'),
  ],
  // under the breath, close by: what people think and do not say
  thoughts: [
    T('a man beside you', 'I was on that deck ten minutes ago. Ten minutes.'),
    T('a woman, to herself', 'Do not look at the sheets. Do not count the sheets.'),
    T('a rescuer, catching his breath', 'Twelve hours on shift already. Keep going. Keep going.'),
    T('a boy, whispering', 'If I had not stopped for chai I would have been on the bus.'),
    T('a woman praying', 'Ganpati Bappa, just this one. Just let him be under the bus and breathing.'),
    T('a constable, under his breath', 'They will blame us for the cordon. They always blame the cordon.'),
    T('a vendor, to nobody', 'Fifty diyas I lit last night. Fifty. For this.'),
  ],
  // a constable at the tape, when Mithi pushes at it
  cordon: [
    S('Constable', 'Peeche, madam, peeche! Nobody crosses the line while it is still falling. Help here or stand clear.'),
    S('Constable', 'Line is shut. Orders. When the pile is safe, we open it.'),
    S('Constable', 'Madam, you cannot see the tape? It is here. Feel. Here. Stay inside, help the rescuers.'),
    S('Constable', 'No one leaves till they have counted. You want to be the one they cannot count?'),
  ],
};

// the scripted calls of the sequence (Mithi's first actions)
export const CALLS = {
  hatShout: 'Hard hats! Hard hats here, by the red crate! It is still falling, cover your heads!',
  hatGiven: 'Pehno, didi. Put it on. Strap under the chin. Good.',
  pileCall: ['Didi, here, the pile is here! Grab a piece, any piece!', 'This side! The chain needs one more!', 'Here, here! Follow my voice!'],
  heapCall: ['Idhar! Over here! The heap is here!', 'Here, didi! Throw it on the heap!', 'This way, keep coming, keep coming!'],
  dropped: ['Shabash! Again!', 'Good! One more, didi!', 'That is how. Back to the pile.'],
  bearerAsk: 'Ek aur haath! One more pair of hands on this stretcher! Anyone!',
  bearerStart: 'You have the back? Good. I go slow. Follow my voice. Do not let go.',
  bearerLead: ['Straight now. Straight.', 'Rubble on the left, step wide.', 'Slowly. Slowly. She is hurting.', 'Almost there. The tents are just ahead.', 'Left a little. Now straight.'],
  bearerWait: 'Ruko, ruko! Didi, this way. Follow my voice.',
  bearerDropped: 'Arre! You let go! Come back to the handles!',
  setDown: 'Set her down. Gently. Gently. There. The ambulance will take her. They come one at a time, the road is still blocked.',
  injuredThanks: 'Shukriya, beti. Shukriya.',
  quiet: 'SHHH! Sab chup! Everybody quiet! Quiet! ... Listen.',
  open: 'Line kholo! Open the line! Anyone who has somewhere to be, go, go now, keep clear of the pile!',
};
