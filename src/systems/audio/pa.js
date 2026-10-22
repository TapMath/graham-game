// The municipal PA announcer: a calm, sterile voice at intervals (OK Computer / SURYA Corp). Always captioned in the
// message feed (kind 'pa'); the voice is optional: speechSynthesis with a calm English voice, low rate and pitch, wrapped
// in a radio feel (a two-note chime, a hiss bed and squelch clicks synthesised around it). With no speech voices, a flat
// synthetic babble stands in. Everything is guarded so headless runs never throw.
//
//   game.pa.say(index | text | undefined)   speak a line now (undefined = pick one that fits the moment)
//   game.pa.lines                           the ~28 lines {text, when(ctx)}
//   game.pa.stats {said, spoken, babbled, captions}   game.pa.last
//   game.pa.enabled / game.pa.voiceEnabled  switches for Phase 7 settings (captions always stay on)
//
// Timing: the first announcement about the collapse comes ~25 s into the run, then every 70 to 130 s of play; singing can
// summon a "report unregistered singing" line.
import { filt, gainNode, noiseSrc } from './synth.js';

const L = (text, when) => ({ text, when });
export const PA_LINES = [
  L('Attention, residents. A structural event has occurred in Sector Four. Remain calm. Sunlight is a privilege, not a right.', (c) => c.collapse),
  L('Rescue operations are ongoing. Please do not approach the collapsed structures. Your concern has been noted.', (c) => c.collapse || c.morning),
  L('Citizens are reminded that unregistered singing is a violation of Municipal Code eleven. Please report any melodic disturbance to your nearest light warden.', () => true),
  L('SURYA Corporation reminds you: the light you deserve is the light you subscribe to. Upgrade today.', () => true),
  L('Welcome to the Festival of Lights. Diyas are permitted at ground level between sunset and nine p.m. Sunlight remains a premium service.', (c) => !c.night),
  L('Good morning. Today is a day celebrating light. Please celebrate responsibly and quietly.', (c) => c.morning),
  L('Good evening. The lamps of the festival are lit. Please look up. Not that far up.', (c) => c.evening),
  L('Curfew begins at midnight. Please return to your registered dwelling. Have a pleasant night.', (c) => c.curfew),
  L('It is late. Lights should be dimmed. The sun will return at six oh two, subject to availability.', (c) => c.night),
  L('Air quality is acceptable. Breathing is encouraged within normal limits.', () => true),
  L('A reminder: there is no emergency. There is only an event. Remain calm.', () => true),
  L('Residents without a daily light allowance may apply at the Ministry of Dawn. Long queues are expected.', () => true),
  L('The sun will rise at six oh two. Viewing access is available to premium subscribers.', (c) => c.night || c.morning),
  L('Unattended children should be reported to the nearest guardian. If you are the unattended child, please remain where you are. A warden will find you.', () => true),
  L('Metro services are suspended until further notice. Underground access is restricted to authorised personnel.', () => true),
  L('Thank you for your patience. Patience is a renewable resource.', () => true),
  L('Tonight, fireworks will be visible from the upper decks. Ground level residents may enjoy the sound.', (c) => !c.morning),
  L('Reminder: shadows are not a medical condition. Please do not consult a doctor about shadows.', () => true),
  L('Citizens experiencing breathlessness should move to an upper level. Please maintain your daily ration of light.', () => true),
  L('Rumours of water in the tunnels are unregistered. Please do not spread unregistered rumours.', () => true),
  L('Drones are present for your safety. Drones are your friends. Please do not wave at your friends.', () => true),
  L('Please remain on registered pathways. Walkways above level one require a health clearance.', () => true),
  L('This message is automated. If you are hearing it, you are being kept safe.', () => true),
  L('Count your blessings. Count your steps. Please do not count the missing.', (c) => c.collapse || c.curfew),
  L('A friendly reminder: the dark is only the absence of a subscription.', () => true),
  L('Light is a service. Thank you for choosing SURYA.', () => true),
  L('Noise complaints should be filed in writing. Silence is complimentary.', () => true),
  L('Unregistered singing has been detected in your sector. Please cease. Have a pleasant day.', (c) => c.sing),
];
const SING_LINE = PA_LINES.length - 1;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

export class PASystem {
  init(game) {
    this.game = game;
    game.pa = this;
    this.lines = PA_LINES; this.enabled = true; this.voiceEnabled = true;
    this.rng = game.rng.fork('pa');
    this.recent = []; this.stats = { said: 0, spoken: 0, babbled: 0, captions: 0 }; this.last = null;
    this.nextAt = 25; this.pendingSing = null; this.speaking = false; this.voice = null; this.voicesReady = false;
    this._ss = typeof window !== 'undefined' && window.speechSynthesis && typeof window.SpeechSynthesisUtterance !== 'undefined' ? window.speechSynthesis : null;
    try {
      if (this._ss) { this._pickVoice(); if (this._ss.addEventListener) this._ss.addEventListener('voiceschanged', () => this._pickVoice()); }
    } catch { this._ss = null; }
    game.events.on('sing:start', () => {
      if (!this.enabled || this.game.time - (this.last?.at ?? -99) < 25 || this.pendingSing) return;
      if (this.rng.chance(0.35)) this.pendingSing = this.game.time + 5 + this.rng.range(0, 3);
    });
    game.debug?.addAction('pa', (g, idx) => { const r = this.say(idx, { force: true }); return r ? { idx: r.idx, text: r.text, mode: r.mode } : null; });
    game.debug?.addState('pa', () => ({ ...this.stats, last: this.last ? { idx: this.last.idx, text: this.last.text.slice(0, 48), mode: this.last.mode } : null, speech: !!this._ss, voice: this.voice ? this.voice.name : null, speaking: this.speaking, nextIn: +(this.nextAt - game.time).toFixed(1) }));
  }

  _pickVoice() {
    const vs = this._ss.getVoices ? this._ss.getVoices() : [];
    this.voicesReady = vs.length > 0;
    if (!vs.length) return;
    const en = vs.filter((v) => /^en/i.test(v.lang));
    const pref = [/Google UK English Female/i, /Samantha/i, /Microsoft (Zira|Hazel|Aria|Susan)/i, /Karen|Moira|Tessa|Serena|Fiona/i, /female/i, /en[-_]GB/i, /en[-_]IN/i];
    let best = null;
    for (const re of pref) { best = en.find((v) => re.test(v.name) || re.test(v.lang)); if (best) break; }
    this.voice = best ?? en[0] ?? null;
  }

  _context() {
    const g = this.game, h = g.clock ? g.clock.hour : 8, t = g.clock ? g.clock.t : 6;
    return { h, t, collapse: t < 10.5, morning: h >= 5 && h < 11, evening: h >= 17 && h < 21, night: h >= 21 || h < 5, curfew: h >= 22 || h < 4, sing: false, breach: !!g.flags.breachKnown };
  }

  _pick() {
    const ctx = this._context();
    const pool = PA_LINES.map((l, i) => ({ l, i })).filter(({ l, i }) => i !== SING_LINE && l.when(ctx) && !this.recent.includes(i));
    const list = pool.length ? pool : PA_LINES.map((l, i) => ({ l, i })).filter(({ i }) => i !== SING_LINE);
    // the collapse announcement comes first
    if (this.stats.said === 0 && ctx.collapse) return 0;
    return this.rng.pick(list).i;
  }

  /** Speak a line now. `which`: index, text, or undefined (pick). Returns {idx,text,mode} (mode: speech | babble | caption). */
  say(which, opts = {}) {
    const g = this.game;
    if (!this.enabled && !opts.force) return null;
    let idx = -1, text;
    if (typeof which === 'string') text = which;
    else { idx = which == null ? this._pick() : ((which % PA_LINES.length) + PA_LINES.length) % PA_LINES.length; text = PA_LINES[idx].text; }
    this.recent.push(idx); if (this.recent.length > 8) this.recent.shift();
    const words = text.split(/\s+/).length, rate = 0.84, est = words * 0.42 / rate + 0.6;
    this.stats.said++; this.stats.captions++;
    g.messages?.say(text, { kind: 'pa', ttl: est + 5 });
    let mode = 'caption';
    const audio = g.audio;
    const canSound = !!audio && audio.running() && this.voiceEnabled && !audio.muted;
    if (audio) { audio.play('pa-chime', null); audio.duck(0.55, est + 3); }
    if (this._ss && this.voicesReady && this.voiceEnabled && !(audio && audio.muted)) {
      mode = 'speech';
      setTimeout(() => this._speak(text, rate), 1250);
      this.stats.spoken++;
    } else if (canSound) {
      mode = 'babble';
      audio.play('pa-babble', null, { syllables: Math.round(words * 1.8), gain: 0.9 });
      this.stats.babbled++;
    }
    if (canSound) this._bed(est + 1.3);
    this.speaking = true;
    this.last = { idx, text, mode, at: g.time };
    clearTimeout(this._endT);
    this._endT = setTimeout(() => { this.speaking = false; }, (est + 1.5) * 1000);
    g.events.emit('pa:say', { idx, text, mode });
    return this.last;
  }

  _speak(text, rate) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      if (this.voice) { u.voice = this.voice; u.lang = this.voice.lang; } else u.lang = 'en-GB';
      u.rate = rate; u.pitch = 0.72; u.volume = clamp(0.8 * (this.game.audio?.volumes?.voice ?? 1) * (this.game.audio?.volumes?.master ?? 1), 0, 1);
      u.onend = () => { this.speaking = false; this.game.audio?.play('pa-squelch', null); };
      u.onerror = () => { this.speaking = false; };
      this._ss.cancel();
      this._ss.speak(u);
    } catch { /* the caption is already up */ }
  }

  /** A radio hiss bed (band-limited noise with slow crackle) under the speech. */
  _bed(seconds) {
    const a = this.game.audio; if (!a || !a.running()) return;
    try {
      const ctx = a.ctx, t = ctx.currentTime + 0.05;
      const n = noiseSrc(ctx, 'white'), bp = filt(ctx, 'bandpass', 1900, 0.5), hp = filt(ctx, 'highpass', 500, 0.7), g = gainNode(ctx, 0);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.05, t + 0.15); g.gain.setValueAtTime(0.05, t + seconds - 0.3); g.gain.setTargetAtTime(0, t + seconds - 0.3, 0.1);
      for (let k = 0; k < Math.floor(seconds * 3); k++) { const c = t + rand(0.2, seconds - 0.3); g.gain.setValueAtTime(0.05, c - 0.001); g.gain.linearRampToValueAtTime(0.14, c); g.gain.setTargetAtTime(0.05, c, 0.012); }
      n.connect(bp); bp.connect(hp); hp.connect(g); g.connect(a.voiceIn);
      n.start(t, n.__off); n.stop(t + seconds + 0.4);
      setTimeout(() => { try { g.disconnect(); } catch { /* ok */ } }, (seconds + 1) * 1000);
    } catch { /* ok */ }
  }

  update(dt, game) {
    if (game.mode !== 'playing' || game.modal || !this.enabled) return;
    const t = game.time;
    if (this.pendingSing != null && t >= this.pendingSing) { this.pendingSing = null; this.say(SING_LINE); this.nextAt = Math.max(this.nextAt, t + 40); return; }
    if (t >= this.nextAt && !this.speaking) {
      this.say();
      this.nextAt = t + rand(70, 130);
    }
  }
}
