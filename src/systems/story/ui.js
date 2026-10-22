// Phase 6b UI: one injected stylesheet (so no shared file needs editing) for the fragment cards, the cinematic
// letterbox / captions / title card / bloom, and small helpers. The look is PLAN 3b's OK Computer collage: pale paper,
// typewriter text, scrawled annotations and strikethroughs, safety-card pictograms.

export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const CSS = `
:root { --paper: #e9e3d1; --ink-t: #25221d; --pen: #1f3d9c; --red-pen: #c22a2a; }
/* ------------------------------------------------------------------ fragment card */
#frag { position: fixed; inset: 0; z-index: 26; display: flex; align-items: center; justify-content: center; padding: 16px;
  background: radial-gradient(ellipse at 50% 55%, rgba(6, 10, 14, .55), rgba(3, 5, 8, .86) 78%); font-family: var(--sans, Helvetica, Arial, sans-serif); animation: fragIn .35s ease-out; }
#frag[hidden] { display: none; }
@keyframes fragIn { from { opacity: 0; transform: scale(1.03); } to { opacity: 1; transform: none; } }
.fr-paper { position: relative; width: min(600px, 92vw); max-height: 88vh; overflow: hidden; padding: 24px 30px 18px; transform: rotate(-1.1deg);
  color: var(--ink-t); background:
    radial-gradient(circle at 16% 12%, rgba(120, 90, 50, .10), transparent 28%),
    radial-gradient(circle at 88% 92%, rgba(120, 90, 50, .14), transparent 34%),
    repeating-linear-gradient(0deg, rgba(0, 0, 0, .025) 0 1px, transparent 1px 3px),
    linear-gradient(172deg, #f0ebdb, var(--paper) 55%, #ddd5bd);
  box-shadow: 0 18px 50px rgba(0, 0, 0, .7), 0 0 0 1px rgba(60, 50, 30, .25); }
.fr-paper::before { content: ''; position: absolute; top: -9px; left: 38%; width: 118px; height: 24px; transform: rotate(2.5deg);
  background: rgba(214, 200, 140, .62); box-shadow: 0 1px 3px rgba(0, 0, 0, .25); }
.fr-paper::after { content: ''; position: absolute; right: 34px; bottom: 22px; width: 74px; height: 74px; border-radius: 50%;
  border: 6px solid rgba(110, 70, 30, .10); box-shadow: inset 0 0 0 3px rgba(110, 70, 30, .05); transform: rotate(14deg); pointer-events: none; }
.fr-card-audio .fr-paper { background:
    radial-gradient(circle at 80% 8%, rgba(255, 255, 255, .10), transparent 40%),
    repeating-linear-gradient(0deg, rgba(0, 0, 0, .06) 0 1px, transparent 1px 3px),
    linear-gradient(172deg, #d9dcd2, #c8ccc0 60%, #bcc1b3); }
.fr-head { display: flex; align-items: center; gap: 12px; padding-bottom: 8px; border-bottom: 2px solid var(--ink-t); margin-bottom: 4px; }
.fr-head svg { width: 30px; height: 40px; flex: none; fill: none; stroke: var(--ink-t); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.fr-head .fr-src { flex: 1; font: 600 10.5px var(--sans, Helvetica, Arial, sans-serif); letter-spacing: .24em; text-transform: uppercase; line-height: 1.5; }
.fr-head .fr-src i { display: block; font-style: normal; font-weight: 400; color: rgba(37, 34, 29, .62); letter-spacing: .18em; }
.fr-head .fr-n { font: 400 11px var(--sans, Helvetica, Arial, sans-serif); letter-spacing: .2em; color: rgba(37, 34, 29, .6); }
.fr-rule { height: 0; border-bottom: 1px solid var(--ink-t); margin-bottom: 14px; }
.fr-title { font: 700 17px 'Courier New', 'Liberation Mono', monospace; letter-spacing: .12em; text-transform: uppercase; margin: 6px 0 12px; }
.fr-body { font: 400 14.5px/1.6 'Courier New', 'Liberation Mono', 'DejaVu Sans Mono', monospace; white-space: pre-wrap; min-height: 150px; }
.fr-body s { text-decoration-color: var(--red-pen); text-decoration-thickness: 2px; color: rgba(37, 34, 29, .65); }
.fr-body em.circ { font-style: normal; display: inline-block; border: 2px solid var(--red-pen); border-radius: 48% 52% 50% 46% / 60% 50% 60% 50%; padding: 0 6px; margin: 0 -2px; transform: rotate(-1.6deg); }
.fr-body b { font-weight: 700; }
.fr-body .redact { background: #25221d; color: #25221d; user-select: none; padding: 0 2px; }
.fr-body .cur { display: inline-block; width: .55em; height: 1em; background: var(--ink-t); vertical-align: -2px; animation: curBlink .8s steps(1) infinite; }
@keyframes curBlink { 50% { opacity: 0; } }
.fr-scrawls { position: relative; margin-top: 8px; min-height: 10px; opacity: 0; transition: opacity .9s .1s; display: flex; flex-direction: column; align-items: flex-start; gap: 4px; }
.fr-done .fr-scrawls { opacity: 1; }
.fr-scrawl { display: block; white-space: nowrap; font: italic 400 20px var(--hand, 'Segoe Print', 'Comic Sans MS', cursive); color: var(--pen); line-height: 1.15; text-shadow: none; }
.fr-scrawl:nth-child(1) { transform: rotate(-2.6deg); } .fr-scrawl:nth-child(2) { transform: rotate(1.8deg) translateX(34px); color: var(--red-pen); } .fr-scrawl:nth-child(3) { transform: rotate(-1deg) translateX(12px); }
.fr-blind { margin-top: 12px; padding: 9px 12px; border-left: 3px solid var(--pen); font: italic 400 15px/1.45 Georgia, 'Times New Roman', serif; color: #2b3552; background: rgba(31, 61, 156, .06); }
.fr-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; padding-top: 8px; border-top: 1px dashed rgba(37, 34, 29, .4);
  font: 400 10.5px var(--sans, Helvetica, Arial, sans-serif); letter-spacing: .2em; text-transform: uppercase; color: rgba(37, 34, 29, .65); }
.fr-foot kbd { font: 600 11px var(--sans, Helvetica, Arial, sans-serif); border: 1px solid var(--ink-t); padding: 1px 7px; margin: 0 4px; color: var(--ink-t); }
.fr-evid { color: var(--red-pen); font-weight: 600; transform: rotate(-3deg); border: 2px solid var(--red-pen); padding: 1px 8px; letter-spacing: .22em; }
.fr-seal { position: absolute; right: 20px; top: 54px; width: 66px; height: 66px; opacity: .5; transform: rotate(12deg); pointer-events: none; }

/* ------------------------------------------------------------------ cinematics */
.cine-bar { position: fixed; left: 0; right: 0; height: 0; background: #000; z-index: 27; transition: height 1.1s cubic-bezier(.3, .1, .2, 1); pointer-events: none; }
.cine-bar.top { top: 0; } .cine-bar.bot { bottom: 0; }
body.cine .cine-bar { height: 11.5vh; }
body.cine #hud, body.cine #crosshair, body.cine #dialog { opacity: 0 !important; transition: opacity .5s; pointer-events: none; }
#cine-cap { position: fixed; left: 50%; bottom: 14.5vh; transform: translateX(-50%); z-index: 28; width: min(820px, 90vw); text-align: center; pointer-events: none;
  font: 400 clamp(15px, 2.1vw, 21px)/1.5 Georgia, 'Times New Roman', serif; color: #f4ecd6; letter-spacing: .02em; text-shadow: 0 0 10px rgba(0, 0, 0, .95), 0 2px 3px rgba(0, 0, 0, .9); opacity: 0; transition: opacity .6s; }
#cine-cap.on { opacity: 1; }
#cine-cap .who { display: block; font: 600 10.5px var(--sans, Helvetica, Arial, sans-serif); letter-spacing: .3em; text-transform: uppercase; color: #ffdf9a; margin-bottom: 3px; }
#cine-cap.pa { font: 400 clamp(11px, 1.4vw, 14px)/1.5 var(--sans, Helvetica, Arial, sans-serif); letter-spacing: .16em; text-transform: uppercase; color: #cfe6f7; }
#cine-cap.pa .who { color: #8fc4e6; }
#cine-cap.scrawl { font: italic 400 clamp(20px, 2.8vw, 28px)/1.3 var(--hand, 'Segoe Print', 'Comic Sans MS', cursive); color: #ffe6a8; }
#cine-skip { position: fixed; right: 20px; bottom: 3.2vh; z-index: 28; font: 400 10.5px var(--sans, Helvetica, Arial, sans-serif); letter-spacing: .26em; text-transform: uppercase; color: rgba(255, 255, 255, .5); opacity: 0; transition: opacity .8s; pointer-events: none; }
body.cine #cine-skip { opacity: 1; }
#cine-skip kbd { font: 600 10px var(--sans, Helvetica, Arial, sans-serif); border: 1px solid rgba(255, 255, 255, .5); padding: 1px 6px; margin: 0 3px; }
#cine-title { position: fixed; inset: 0; z-index: 31; display: flex; flex-direction: column; align-items: center; justify-content: center; pointer-events: none; opacity: 0; transition: opacity 1.6s ease; background: #000; }
#cine-title.on { opacity: 1; }
#cine-title h1 { margin: 0; font: 100 clamp(56px, 11vw, 150px)/1 var(--sans, Helvetica, Arial, sans-serif); letter-spacing: .5em; padding-left: .5em; color: #f2ecdc; text-shadow: 0 0 40px rgba(255, 220, 150, .35); }
#cine-title h1 s { text-decoration: none; position: relative; }
#cine-title p { margin: 22px 0 0; font: italic 400 clamp(17px, 2.4vw, 28px) var(--hand, 'Segoe Print', 'Comic Sans MS', cursive); color: #ffdf9a; letter-spacing: .06em; opacity: 0; transition: opacity 1.8s ease 1.4s; }
#cine-title.on p { opacity: 1; }
#cine-title .rule { width: 0; height: 1px; background: rgba(255, 255, 255, .5); margin-top: 18px; transition: width 2.6s ease .4s; }
#cine-title.on .rule { width: min(360px, 60vw); }
#cine-stamp { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: 30; text-align: center; pointer-events: none; opacity: 0; transition: opacity 1.2s;
  font: 200 clamp(30px, 6vw, 72px) var(--sans, Helvetica, Arial, sans-serif); letter-spacing: .3em; padding-left: .3em; color: #cfe6f7; }
#cine-stamp.on { opacity: 1; }
#cine-stamp small { display: block; margin-top: 10px; font: italic 400 clamp(14px, 1.9vw, 22px) var(--hand, 'Segoe Print', 'Comic Sans MS', cursive); letter-spacing: .04em; color: #ffdf9a; }
#cine-white { position: fixed; inset: 0; z-index: 29; pointer-events: none; opacity: 0; background: #cfc8b8; }
#cine-bloom { position: fixed; inset: 0; z-index: 28; pointer-events: none; opacity: 0; mix-blend-mode: screen;
  background: radial-gradient(ellipse at var(--bx, 60%) var(--by, 46%), rgba(255, 240, 190, .95) 0, rgba(255, 196, 110, .55) 22%, rgba(255, 140, 70, .22) 48%, transparent 75%); }
#cine-vig { position: fixed; inset: 0; z-index: 27; pointer-events: none; opacity: 0; background: radial-gradient(ellipse at 50% 50%, transparent 30%, rgba(0, 0, 0, .94) 100%); }
#cine-fireglow { position: fixed; inset: 0; z-index: 7; pointer-events: none; opacity: 0; mix-blend-mode: screen; }
#cine-blink { position: fixed; inset: 0; z-index: 29; pointer-events: none; opacity: 0; background: #020304; }
`;

let injected = false;
export function ensureStyles() {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const s = document.createElement('style');
  s.id = 'story6b-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}

export const STICK_FIGURE = '<svg viewBox="0 0 40 52"><circle cx="20" cy="8" r="5.5"/><path d="M20 14 V32 M20 19 L8 28 M20 19 L32 28 M20 32 L11 48 M20 32 L29 48"/></svg>';
export const STICK_LISTEN = '<svg viewBox="0 0 40 52"><circle cx="20" cy="8" r="5.5"/><path d="M20 14 V32 M20 19 L8 28 M20 19 L27 13 M20 32 L11 48 M20 32 L29 48"/><path d="M30 6 q4 3 0 8 M34 3 q7 6 0 14"/></svg>';
export const STICK_READ = '<svg viewBox="0 0 40 52"><circle cx="20" cy="8" r="5.5"/><path d="M20 14 V32 M20 19 L10 27 M20 19 L30 27 M20 32 L11 48 M20 32 L29 48"/><rect x="11" y="24" width="18" height="11" rx="1"/></svg>';
export const STICK_HAND = '<svg viewBox="0 0 40 52"><circle cx="20" cy="8" r="5.5"/><path d="M20 14 V32 M20 19 L8 28 M20 19 L33 24 M20 32 L11 48 M20 32 L29 48"/><path d="M33 24 l4 -3 M33 24 l5 0 M33 24 l4 3"/></svg>';
