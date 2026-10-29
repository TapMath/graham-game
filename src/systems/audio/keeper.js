// The audio keeper: keeps Web Audio alive on every device, iPad and iPhone above all.
//
// On iOS Safari the speech voices (speechSynthesis) and the Web Audio graph (music, ambience, sound effects) are treated
// differently, which is why a player could hear the voices but not the music or effects:
//   - the ring/silent switch (or mute in Control Center) silences Web Audio, never speech, unless the page declares itself a
//     media player: `navigator.audioSession.type = 'playback'` (iOS 17+), or, on older iOS, a silent <audio> element
//     playing in a loop, which moves the page into the playback audio category;
//   - the AudioContext can be left 'suspended' (resumed outside a gesture) or become 'interrupted' (a notification, Siri,
//     the app switcher, locking the screen, and speech itself) and nothing resumes it without another user gesture.
// So this system: declares playback, keeps permanent gesture listeners that resume the context whenever it is not
// running, retries on visibility/pageshow/statechange and after each spoken line, and, if the sound stays off during play,
// shows a small "tap to bring the sound back" chip. It respects the engine's own suspend while paused or in the menu.
//
//   game.audioKeeper.state()   { ctx, session, silentEl, prompt, resumes, interruptions }

const GESTURES = ['pointerdown', 'touchend', 'click', 'keydown'];

/** A one-second silent 8 kHz mono WAV, as a Blob URL (the <audio> fallback for the silent switch on older iOS). */
function silentWavUrl() {
  const n = 8000, buf = new ArrayBuffer(44 + n), v = new DataView(buf);
  const s = (o, t) => { for (let i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
  s(0, 'RIFF'); v.setUint32(4, 36 + n, true); s(8, 'WAVE'); s(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, 8000, true); v.setUint32(28, 8000, true);
  v.setUint16(32, 1, true); v.setUint16(34, 8, true); s(36, 'data'); v.setUint32(40, n, true);
  for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);   // 8-bit silence is the midpoint
  return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
}

const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

export class AudioKeeper {
  init(game) {
    this.game = game;
    game.audioKeeper = this;
    this.resumes = 0; this.interruptions = 0; this.session = 'none'; this.silentEl = null; this._badSince = null;

    // 1. Declare a media page, so the silent switch does not mute the music and effects (iOS 17+)
    try { if (navigator.audioSession) { navigator.audioSession.type = 'playback'; this.session = navigator.audioSession.type; } } catch { /* not supported */ }

    // 2. Permanent gesture listeners: any tap or key brings a stopped context back (the engine's own listeners stop after the first start)
    const onGesture = () => this._onGesture();
    for (const n of GESTURES) window.addEventListener(n, onGesture, { capture: true, passive: true });

    // 3. Coming back to the page, and the context's own state changes
    document.addEventListener('visibilitychange', () => { if (!document.hidden) this.kick('visible'); });
    window.addEventListener('pageshow', () => this.kick('pageshow'));
    game.events.on('audio:ready', () => this._watch());
    this._watch();   // with autostart the context already exists before this system initialises
    game.events.on('mode:changed', () => this.kick('mode'));

    // 4. Speech can interrupt the audio session on iOS: retry when each line ends
    this._wrapSpeech();

    // 5. The prompt chip, shown only if the sound stays off during play
    this.chip = document.createElement('button');
    this.chip.id = 'audio-chip';
    this.chip.type = 'button';
    this.chip.textContent = 'Sound paused by the device. Tap to bring it back';
    this.chip.hidden = true;
    Object.assign(this.chip.style, {
      position: 'fixed', left: '50%', bottom: 'calc(18px + env(safe-area-inset-bottom))', transform: 'translateX(-50%)', zIndex: 40,
      font: '300 13px/1.2 system-ui, sans-serif', letterSpacing: '.04em', color: '#e9f2f5', background: 'rgba(10,20,24,.82)',
      border: '1px solid rgba(160,210,230,.5)', borderRadius: '18px', padding: '9px 16px', cursor: 'pointer',
    });
    this.chip.addEventListener('click', () => this._onGesture());
    document.body.appendChild(this.chip);

    game.debug?.addState('audioKeeper', () => this.state());
    game.debug?.addAction('audioInterrupt', () => { try { this.ctx?.suspend(); } catch { /* none */ } return this.ctx?.state; });
  }

  get ctx() { return this.game.audio?.ctx ?? null; }

  /** Should sound be playing now? The engine suspends on purpose in the pause menu and on the title. */
  _wanted() { const m = this.game.mode; return m !== 'paused' && m !== 'menu' && !this.game.audio?.failed; }

  _watch() {
    const ctx = this.ctx;
    if (!ctx || ctx._keeperWatched) return;
    ctx._keeperWatched = true;
    ctx.addEventListener?.('statechange', () => {
      if (ctx.state === 'interrupted' || (ctx.state === 'suspended' && this._wanted())) { this.interruptions++; this.kick('statechange'); }
    });
  }

  /** Try to (re)start the context outside a gesture; iOS may refuse, and the next tap or the chip will do it. */
  kick(why) {
    const ctx = this.ctx;
    if (!ctx || !this._wanted() || ctx.state === 'running') return;
    try { const p = ctx.resume(); if (p?.then) p.then(() => { if (ctx.state === 'running') this.resumes++; }).catch(() => {}); } catch { /* refused */ }
  }

  _onGesture() {
    const audio = this.game.audio;
    if (!audio) return;
    if (!this.ctx) { try { audio.ensure(); } catch { /* none */ } this._watch(); }
    if (isIOS() && this.session === 'none') this._silentElement();
    else if (this.silentEl?.paused) this.silentEl.play().catch(() => {});
    const ctx = this.ctx;
    if (ctx && ctx.state !== 'running' && this._wanted()) {
      try { const p = ctx.resume(); if (p?.then) p.then(() => { if (ctx.state === 'running') this.resumes++; }).catch(() => {}); } catch { /* refused */ }
    }
  }

  /** Older iOS (no navigator.audioSession): a looping silent <audio>, started in a gesture, puts the page in the playback category. */
  _silentElement() {
    if (this.silentEl) return;
    try {
      const el = document.createElement('audio');
      el.src = silentWavUrl(); el.loop = true; el.preload = 'auto';
      el.setAttribute('playsinline', ''); el.setAttribute('x-webkit-airplay', 'deny');
      el.play().then(() => { this.session = 'silent-element'; }).catch(() => {});
      this.silentEl = el;
      if (navigator.mediaSession && window.MediaMetadata) navigator.mediaSession.metadata = new window.MediaMetadata({ title: 'Grahan', artist: 'the search for sunrise' });
    } catch { /* no media element */ }
  }

  _wrapSpeech() {
    const ss = window.speechSynthesis;
    if (!ss || ss._keeperWrapped) return;
    const speak = ss.speak.bind(ss);
    try {
      ss.speak = (u) => {
        try { u.addEventListener('end', () => this.kick('speech')); u.addEventListener('error', () => this.kick('speech')); } catch { /* not an utterance */ }
        return speak(u);
      };
      ss._keeperWrapped = true;
    } catch { /* read-only in this browser */ }
  }

  update() {
    if (this.ctx && !this.ctx._keeperWatched) this._watch();
    // the chip: the sound should be on (playing, not paused) but the context has been stopped for over a second
    const ctx = this.ctx, bad = !!ctx && ctx.state !== 'running' && this._wanted() && this.game.audio?.started;
    if (bad) { this._badSince ??= performance.now(); } else this._badSince = null;
    const show = bad && performance.now() - this._badSince > 1000;
    if (this.chip.hidden === show) this.chip.hidden = !show;
  }

  state() {
    return { ctx: this.ctx?.state ?? 'none', session: this.session, silentEl: !!this.silentEl, prompt: !this.chip?.hidden, resumes: this.resumes, interruptions: this.interruptions };
  }
}
