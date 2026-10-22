// Styles for the Phase 6a story UI (conversation cards, inventory row, optional objectives, the dig ring).
// Injected from JS so this file is the only place that owns them. Same visual language as the HUD (PLAN 3b):
// pale blue-white thin sans-serif, safety-card pictograms, a scrawled correction in the margin.
const CSS = `
#convo { position: fixed; inset: 0; z-index: 26; display: flex; align-items: flex-end; justify-content: center; padding: 0 0 5vh;
  background: radial-gradient(ellipse at 50% 85%, rgba(4, 8, 14, .66), rgba(4, 8, 14, 0) 68%); font-family: var(--sans); color: var(--ink); pointer-events: none; }
#convo[hidden] { display: none; }
.cv-card { pointer-events: auto; width: min(660px, 94vw); background: rgba(7, 13, 20, .88); border: 1px solid rgba(221, 233, 244, .3);
  padding: 16px 22px 18px; backdrop-filter: blur(3px); box-shadow: 0 0 44px rgba(0, 0, 0, .55); position: relative; }
@keyframes cvIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
.cv-top { display: flex; gap: 16px; align-items: flex-start; }
.cv-portrait { flex: 0 0 62px; height: 78px; border: 1px solid rgba(221, 233, 244, .34); background: rgba(221, 233, 244, .05); position: relative; display: flex; align-items: center; justify-content: center; }
.cv-portrait svg { width: 46px; height: 66px; overflow: visible; }
.cv-portrait::after { content: ''; position: absolute; right: -1px; bottom: -1px; width: 9px; height: 9px; border-right: 2px solid var(--cvc, #ffdf9a); border-bottom: 2px solid var(--cvc, #ffdf9a); }
.cv-fig { fill: none; stroke: var(--cvc, #ffdf9a); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; filter: drop-shadow(0 0 4px rgba(255, 223, 154, .25)); }
.cv-fig .fill { fill: var(--cvc, #ffdf9a); fill-opacity: .18; }
.cv-main { flex: 1; min-width: 0; }
.cv-head { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; margin-bottom: 7px; }
.cv-tag { font-size: 9.5px; letter-spacing: .3em; color: #7dffb0; border: 1px solid rgba(125, 255, 176, .5); padding: 2px 7px; font-weight: 400; text-transform: uppercase; }
.cv-name { margin: 0; font-weight: 200; font-size: 24px; letter-spacing: .09em; }
.cv-scrawl { font-family: var(--hand); font-style: italic; font-size: 15px; color: var(--sun); transform: rotate(-3deg); display: inline-block; }
.cv-text { margin: 0; min-height: 3.9em; font-size: 17.5px; line-height: 1.45; font-weight: 300; letter-spacing: .015em; color: #eef4fa; }
.cv-text.narr { font-family: Georgia, 'Times New Roman', serif; font-style: italic; color: #f4ead2; font-size: 17px; }
.cv-text.mithi { color: #cfe6ff; }
.cv-text i.cv-cursor { display: inline-block; width: .5em; height: 1px; background: var(--sun); margin-left: 3px; vertical-align: baseline; animation: cvBlink .8s steps(2) infinite; }
@keyframes cvBlink { 50% { opacity: 0; } }
.cv-foot { display: flex; justify-content: space-between; align-items: center; margin-top: 8px; font-size: 10px; letter-spacing: .22em; text-transform: uppercase; color: var(--ink-dim); }
.cv-next { cursor: pointer; display: inline-flex; align-items: center; gap: 8px; padding: 6px 4px; }
.cv-next kbd, .cv-choice kbd { font: 400 12px var(--sans); border: 1px solid rgba(255, 223, 154, .8); color: var(--sun-hot); min-width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; border-radius: 3px; text-shadow: none; flex: none; }
.cv-choices { margin-top: 12px; display: flex; flex-direction: column; gap: 8px; }
.cv-choice { display: flex; align-items: center; gap: 14px; text-align: left; width: 100%; min-height: 52px; padding: 10px 14px; font: 300 16px var(--sans); letter-spacing: .03em; color: var(--ink);
  background: rgba(221, 233, 244, .04); border: 1px solid rgba(221, 233, 244, .34); cursor: pointer; -webkit-tap-highlight-color: transparent; }
.cv-choice:hover, .cv-choice.on { border-color: var(--sun); background: rgba(255, 223, 154, .09); }
.cv-choice .lab { flex: 1; line-height: 1.3; }
.cv-choice .note { font-family: var(--hand); font-style: italic; font-size: 14.5px; color: var(--sun); text-align: right; }
.cv-choice.off { opacity: .42; cursor: not-allowed; border-style: dashed; } .cv-choice.off:hover { border-color: rgba(221, 233, 244, .34); background: rgba(221, 233, 244, .04); }
.cv-count { font-variant-numeric: tabular-nums; }

.hud-items { position: absolute; left: 20px; top: 126px; display: flex; gap: 6px; flex-wrap: wrap; max-width: 300px; }
.hud-items .it { width: 34px; height: 34px; border: 1px solid rgba(221, 233, 244, .38); background: rgba(7, 13, 20, .5); display: flex; align-items: center; justify-content: center; position: relative; backdrop-filter: blur(2px); }
.hud-items .it svg { width: 24px; height: 24px; fill: none; stroke: var(--ink); stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.hud-items .it.new { animation: itPop 1.2s ease-out; border-color: var(--sun); } .hud-items .it.new svg { stroke: var(--sun-hot); }
.hud-items .it.on svg { stroke: var(--sun); }
@keyframes itPop { 0% { transform: scale(1.7); box-shadow: 0 0 18px rgba(255, 223, 154, .8); } 100% { transform: none; box-shadow: none; } }
.hud-items .it::after { content: attr(data-name); position: absolute; left: 0; top: 38px; white-space: nowrap; font-size: 9.5px; letter-spacing: .2em; text-transform: uppercase; color: var(--ink-dim); opacity: 0; transition: opacity .25s; pointer-events: none; }
.hud-items .it.new::after { opacity: 1; }

.hud-optional { margin-top: 8px; display: flex; flex-direction: column; gap: 3px; align-items: center; }
.hud-optional .op { font-size: 12px; line-height: 1.3; color: var(--ink-dim); font-weight: 300; text-align: center; max-width: 520px; }
.hud-optional .op b { font-weight: 400; font-size: 8.5px; letter-spacing: .26em; color: var(--cool); margin-right: 8px; text-transform: uppercase; opacity: .85; }
.hud-optional .op.new { animation: objIn .9s ease-out; }

.hud-party { position: absolute; left: 20px; top: 194px; font-size: 9.5px; letter-spacing: .24em; text-transform: uppercase; color: var(--ink-dim); display: flex; align-items: center; gap: 8px; }
.hud-party kbd { font: 400 11px var(--sans); border: 1px solid rgba(191, 228, 255, .6); color: var(--cool); min-width: 30px; height: 20px; display: inline-flex; align-items: center; justify-content: center; border-radius: 3px; text-shadow: none; }
.hud-party b { font-weight: 400; color: var(--sun-hot); }

.hud-hold { position: absolute; left: 50%; top: 56%; width: 150px; margin-left: -75px; text-align: center; }
.hud-hold .lbl { margin-bottom: 6px; }
.hud-hold .bar { height: 3px; background: rgba(205, 225, 245, .22); position: relative; }
.hud-hold .bar i { display: block; height: 100%; width: 0; background: var(--sun-hot); box-shadow: 0 0 8px rgba(255, 223, 154, .9); }
.hud-hold .scrawl { margin: 5px 0 0; }
`;

let installed = false;
export function installStoryCss() {
  if (installed) return;
  installed = true;
  const st = document.createElement('style');
  st.id = 'story-css';
  st.textContent = CSS;
  document.head.appendChild(st);
}
