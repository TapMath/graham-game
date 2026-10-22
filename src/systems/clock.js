// The game clock (PLAN sections 1b, 6). Game time runs from 05:40 on day 1 (just after the collapse) to
// 06:00 on day 2 (the flood, and the sunrise at the bridge).
//
//   game.clock.t            absolute game hours: 5.667 at the start .. 30.0 at the end (24 = midnight)
//   game.clock.hour         0..24 hour of day            .day  1 | 2           .hhmm  'HH:MM'
//   game.clock.start / end  5.667 / 30
//   game.clock.hoursPerSec  game hours per simulated second (default 1 game hour = 1.25 real minutes,
//                           i.e. about 30 real minutes; ?minutes=N sets the total real length)
//   game.clock.hoursLeft    hours until the flood (06:00 day 2)
//   game.clock.advance(h, reason)   time penalty (vendors, detention): jumps forward; emits 'clock:advanced'
//   game.clock.setTime(hour)        debug jump (0..24 hour of day, or an absolute value > 24); emits 'clock:set'
//   game.clock.fmt(t) / fmtDuration(h)
//
// Events: 'clock:hour' {hour, t} on each new game hour, 'clock:advanced' {from, to, hours, reason},
// 'clock:set' {from, to}, 'clock:end' {} once, when the clock reaches 06:00 day 2.
//
// Each step it drives sky.setTimeOfDay (and so the sun shafts: off at night).
import { GAME_HOURS } from '../core/params.js';

export const CLOCK_START = 5 + 40 / 60;
export const CLOCK_END = 30;

export class ClockSystem {
  init(game) {
    this.game = game;
    game.clock = this;
    this.start = CLOCK_START; this.end = CLOCK_END;
    this.hoursPerSec = GAME_HOURS / (game.params.minutes * 60);
    this.paused = false;
    this.reset();
    game.events.on('debug:setTime', ({ hour }) => this.setTime(hour));
    game.debug?.addState('clock', () => ({
      t: +this.t.toFixed(3), hour: +this.hour.toFixed(3), day: this.day, hhmm: this.hhmm, hoursLeft: +this.hoursLeft.toFixed(3),
      hoursPerSec: +this.hoursPerSec.toFixed(5), secondsPerHour: +(1 / this.hoursPerSec).toFixed(1), phase: game.sky?.phase,
    }));
    game.debug?.addAction('clockAdvance', (g, h) => { this.advance(h, 'debug'); return this.hhmm; });
    game.debug?.addSetter('clockRate', (g, minutesTotal) => { this.hoursPerSec = GAME_HOURS / (minutesTotal * 60); });
    this._sky();
  }

  reset() {
    this.t = this.start; this._lastHour = Math.floor(this.t); this._ended = false;
  }

  get hour() { return this.t % 24; }
  get day() { return this.t >= 24 ? 2 : 1; }
  get hoursLeft() { return Math.max(0, this.end - this.t); }
  get hhmm() { return this.fmt(this.t); }
  /** 0..1 over the whole run. */
  get progress() { return (this.t - this.start) / (this.end - this.start); }

  fmt(t) {
    const h = ((t % 24) + 24) % 24, hh = Math.floor(h), mm = Math.floor((h - hh) * 60 + 1e-6);
    return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
  }
  /** 'Xh Ym' */
  fmtDuration(h) {
    const m = Math.max(0, Math.round(h * 60));
    return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
  }

  advance(hours, reason = '') {
    if (!(hours > 0)) return this.t;
    const from = this.t;
    this.t = Math.min(this.end, this.t + hours);
    this.game.events.emit('clock:advanced', { from, to: this.t, hours: this.t - from, reason });
    this._sky();
    return this.t;
  }

  /** Debug jump. 0..24 means the next occurrence of that hour of day (before 05:40 is day 2). */
  setTime(h) {
    const from = this.t;
    this.t = h >= 24 ? Math.min(h, this.end + 24) : (h >= this.start ? h : h + 24);
    this._lastHour = Math.floor(this.t); this._ended = this.t >= this.end;
    this.game.events.emit('clock:set', { from, to: this.t });
    this._sky();
  }

  _sky() { this.game.sky?.setTimeOfDay(this.hour); }

  update(dt, game) {
    if (!this.paused && !game.modal && !this._ended) {
      this.t += dt * this.hoursPerSec;
      if (this.t >= this.end) { this.t = this.end; this._ended = true; game.events.emit('clock:end', {}); }
    }
    const h = Math.floor(this.t);
    if (h !== this._lastHour) { this._lastHour = h; game.events.emit('clock:hour', { hour: h % 24, t: this.t }); }
    this._sky();
  }
}
