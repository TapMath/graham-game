// Character voices (Phase 8C): every person speaks their lines through `speechSynthesis`, each with a voice of their own.
//
//   game.voices.say({ who: 'tara', text, onBoundary(charIndexInText), onEnd() })   speak a line (returns { speaking, duration })
//   game.voices.cancel()
//   game.voices.profileOf(name | id)       -> { id, sex, pitch, rate, ... }
//   game.voices.pace(text, id)             -> seconds the line takes to speak (estimate)
//   game.voices.available                  true once the browser has English voices to offer
//
// Voice choice: en-IN first (iOS: Rishi and Veena, Windows: Heera, Ravi, Neerja, Prabhat), then hi-IN, then en-GB, then any English.
// Within that list the voices are dealt out by sex, so a woman is a woman and two people with the same sex get different voices when the
// device has more than one; where it has not, pitch and rate keep them apart. With no voices (headless, some Linux browsers) or with the
// "Character voices" setting off, nothing is spoken and the card just types at a speakable pace. Narration is never spoken.
// Volume follows the voice slider and the master volume; muting the game mutes the people too.
const P = (sex, pitch, rate, extra = {}) => ({ sex, pitch, rate, ...extra });
/** pitch 0..2 (1 = the voice's own), rate 0.1..10 (1 = normal). Children are high and quick, the Big Man low and slow. */
export const PROFILES = {
  mithi: P('f', 1.0, 0.94, { slot: 0 }),
  jeetu: P('m', 1.62, 1.14, { child: true, slot: 1 }),
  setu: P('m', 1.72, 1.08, { child: true, slot: 2 }),
  aayat: P('f', 1.58, 0.92, { child: true, slot: 1 }),
  tara: P('f', 0.96, 0.9, { slot: 1 }),
  nurse: P('f', 1.12, 1.16, { slot: 2 }),
  patient: P('f', 0.9, 0.82, { slot: 2 }),
  gautam: P('m', 1.0, 1.0, { slot: 0 }),
  kaalu: P('m', 0.5, 0.8, { slot: 1 }),
  contractor: P('m', 0.9, 0.93, { slot: 2 }),
  doctor: P('m', 0.74, 0.84, { slot: 3 }),
  oldman: P('m', 0.62, 0.72, { slot: 3 }),
  rescuer: P('m', 0.88, 1.12, { slot: 0 }),
  torchboys: P('m', 1.5, 1.2, { child: true, slot: 2 }),
  guard: P('m', 0.82, 1.08, { slot: 3 }),
  vendor: P('m', 1.0, 1.05, { slot: 1 }),
  sameer: P('m', 0.9, 0.8, { slot: 0 }),
  sleeper: P('f', 0.85, 0.7, { slot: 3 }),
  stranger: P('m', 1.0, 1.0, { slot: 0 }),
};
const ALIASES = [
  [/mithi/, 'mithi'], [/jeetu/, 'jeetu'], [/setu/, 'setu'], [/aayat/, 'aayat'], [/tara/, 'tara'], [/sameer/, 'sameer'], [/gautam/, 'gautam'], [/kaalu|seth|big man/, 'kaalu'],
  [/contractor/, 'contractor'], [/doctor/, 'doctor'], [/nurse|sister/, 'nurse'], [/rescuer|volunteer/, 'rescuer'], [/old man|baba/, 'oldman'], [/torch|raju|bunty|boys/, 'torchboys'],
  [/guard|police|sergeant|constable/, 'guard'], [/vendor|seller/, 'vendor'], [/sleeper/, 'sleeper'], [/patient/, 'patient'],
];
export function profileKey(name = '') {
  const n = String(name).toLowerCase();
  for (const [re, id] of ALIASES) if (re.test(n)) return id;
  return 'stranger';
}

const FEMALE = /female|woman|veena|heera|neerja|zira|hazel|susan|samantha|karen|moira|tessa|fiona|victoria|serena|kalpana|aria|jenny|priya|lekha|swara|sara|google (uk|us) english female|google हिन्दी|hindi/i;
const MALE = /\bmale\b|rishi|ravi|prabhat|hemant|madhur|daniel|alex|fred|david|mark|guy|ryan|james|george|google (uk|us) english male|aaron/i;
const sexOfVoice = (v) => (MALE.test(v.name) && !/female/i.test(v.name) ? 'm' : FEMALE.test(v.name) ? 'f' : '?');
const rank = (v) => { const l = (v.lang || '').replace('_', '-').toLowerCase(); return l === 'en-in' ? 0 : l.startsWith('hi') ? 1 : l === 'en-gb' ? 2 : l.startsWith('en-au') ? 3 : l.startsWith('en') ? 4 : 9; };

const strip = (t) => {
  // spoken text and a map back to the shown text (so the reveal can follow the voice)
  const map = []; let out = '';
  const src = String(t);
  let depth = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === '(' || c === '[') { depth++; continue; }
    if (c === ')' || c === ']') { depth = Math.max(0, depth - 1); if (out && !/\s$/.test(out)) { out += ' '; map.push(i); } continue; }
    if (depth) continue;
    if (c === '—' || c === '–') { out += ', '; map.push(i, i); continue; }
    out += c; map.push(i);
  }
  return { text: out.replace(/\s+/g, ' ').trim(), map };
};

export class VoiceSystem {
  init(game) {
    this.game = game;
    game.voices = this;
    this.ss = typeof window !== 'undefined' && window.speechSynthesis && typeof window.SpeechSynthesisUtterance !== 'undefined' ? window.speechSynthesis : null;
    this.voices = []; this.available = false; this.assigned = new Map(); this.current = null; this.stats = { spoken: 0, cancelled: 0 };
    try {
      if (this.ss) { this._load(); this.ss.addEventListener?.('voiceschanged', () => this._load()); }
    } catch { this.ss = null; }
    game.events.on('dialogue:close', () => this.cancel());
    game.debug?.addState('voices', () => ({ available: this.available, count: this.voices.length, spoken: this.stats.spoken, current: this.current ? this.current.who : null, assigned: [...this.assigned].map(([k, v]) => k + ':' + (v?.name ?? '-')) }));
  }

  get enabled() {
    const g = this.game;
    return !!this.ss && this.available && g.settings?.get?.('speech') !== false && !(g.audio && g.audio.muted) && this.volume > 0.01;
  }
  get volume() { const a = this.game.audio?.volumes; return Math.max(0, Math.min(1, (a?.voice ?? 1) * (a?.master ?? 1))); }

  _load() {
    const vs = (this.ss.getVoices?.() ?? []).filter((v) => /^(en|hi)/i.test(v.lang));
    this.voices = vs.sort((a, b) => rank(a) - rank(b));
    this.available = this.voices.length > 0;
    this.assigned.clear();
  }

  profileOf(name) { const id = PROFILES[name] ? name : profileKey(name); return { id, ...PROFILES[id] }; }

  _voiceFor(id) {
    if (this.assigned.has(id)) return this.assigned.get(id);
    const pr = PROFILES[id] ?? PROFILES.stranger;
    // the best-ranked voices of the right sex (unknown-sex voices count for either), dealt out by the profile's slot
    const best = rank(this.voices[0] ?? { lang: '' });
    const pool = this.voices.filter((v) => rank(v) <= Math.max(best, 2) && (sexOfVoice(v) === pr.sex || sexOfVoice(v) === '?'));
    const sure = pool.filter((v) => sexOfVoice(v) === pr.sex);
    const list = sure.length ? sure : pool.length ? pool : this.voices;
    const v = list.length ? list[pr.slot % list.length] : null;
    this.assigned.set(id, v);
    return v;
  }

  /** Estimated seconds to speak `text` at this person's rate. */
  pace(text, id = 'stranger') {
    const pr = PROFILES[id] ?? PROFILES.stranger, s = strip(text).text;
    const words = s ? s.split(/\s+/).length : 0;
    const pauses = (s.match(/[.!?]/g)?.length ?? 0) * 0.32 + (s.match(/[,;:]/g)?.length ?? 0) * 0.14;
    return Math.max(0.6, words * 0.38 / pr.rate + pauses);
  }

  /** Speak one line. Returns { speaking, duration }. */
  say({ who = 'stranger', text, onBoundary, onEnd }) {
    const id = PROFILES[who] ? who : profileKey(who);
    const duration = this.pace(text, id);
    if (!this.enabled) { return { speaking: false, duration, id }; }
    const { text: spoken, map } = strip(text);
    if (!spoken) return { speaking: false, duration, id };
    try {
      this.ss.cancel();
      const u = new SpeechSynthesisUtterance(spoken);
      const pr = PROFILES[id] ?? PROFILES.stranger, v = this._voiceFor(id);
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = 'en-IN';
      u.rate = Math.max(0.5, Math.min(1.6, pr.rate)); u.pitch = Math.max(0.3, Math.min(2, pr.pitch)); u.volume = this.volume;
      u.onboundary = (e) => { if (onBoundary && e.name !== 'sentence') { const i = Math.min(map.length - 1, e.charIndex + (e.charLength || 0)); onBoundary(map[Math.max(0, i)] ?? text.length); } };
      u.onend = () => { if (this.current?.u === u) this.current = null; onEnd?.(); };
      u.onerror = () => { if (this.current?.u === u) this.current = null; onEnd?.(); };
      this.current = { u, who: id };
      // Chrome drops a speak() that directly follows a cancel(): give it a tick
      setTimeout(() => { try { if (this.current?.u === u) this.ss.speak(u); } catch { /* the card already shows the text */ } }, 40);
      this.stats.spoken++;
      return { speaking: true, duration, id };
    } catch { return { speaking: false, duration, id }; }
  }

  cancel() {
    if (this.current) this.stats.cancelled++;
    this.current = null;
    try { this.ss?.cancel(); } catch { /* ok */ }
  }
}
