// Mix check for the real audio engine (Phase 7b): music vs ambience vs events vs voice, measured at the master meter.
//
// Usage: NODE_PATH=$(npm root -g) node tools/audio-mix.mjs [--query "seed=1"]
//
// Where audio-check.mjs renders each recipe offline, this plays the real engine graph in the running game (headless Chromium
// really runs the AudioContext) and reads `game.audio.level()`, the meter after the compressor and before the master volume, with
// ONE bus audible at a time (the others are set to 0, then restored). It measures
//   amb    the ground-level ambience bed (rain, traffic, crowd)            continuous
//   music  the generative score                                            continuous (9 s: a chord and an arpeggio)
//   events one-shots at a plausible distance (a bark at 14 m, a bite at 2 m, the mouth organ at 30 m ...)
//   sing   Mithi's song, and the PA (chime, hiss; the browser speech voice is outside the graph)
// and prints RMS, the loudest 46 ms window ("max") and the peak, all in dBFS. Then it asserts the intended ordering and exits
// non-zero if it is broken:   music < ambience < events,   voice and PA clearly above the events.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const qi = process.argv.indexOf('--query');
const query = qi >= 0 ? process.argv[qi + 1] : 'seed=1';

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:${port}/index.html?autostart=1&debug=1&hazards=0&${query}`);
await page.waitForTimeout(3500);

const R = await page.evaluate(async () => {
  const A = window.__grahan, G = A.game, au = G.audio;
  A.set('invulnerable', true);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  au.ensure(); await sleep(1500);
  const out = { context: au.ctx && au.ctx.state };
  const names = ['music', 'sfx', 'voice', 'amb'];
  const base = { ...au.volumes };
  async function sample(ms, every = 30) {
    let sum = 0, n = 0, peak = -120, max = -120;
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      const l = au.level();
      if (l) { sum += Math.pow(10, l.rmsDb / 20) ** 2; n++; peak = Math.max(peak, l.peakDb); max = Math.max(max, l.rmsDb); }
      await sleep(every);
    }
    return { rms: n ? +(10 * Math.log10(sum / n)).toFixed(1) : -120, max, peak };
  }
  const only = (b) => { for (const k of names) au.setVolume(k, k === b ? base[k] : 0); };
  const p = G.player.pos;
  only('amb'); await sleep(700); out.amb = await sample(3000);
  only('music'); await sleep(300); out.music = await sample(9000);
  only('sfx'); await sleep(500);
  out.events = {};
  for (const [k, d, loud] of [['bark', 14, 0.8], ['growl', 10, 0.7], ['crack', 12, 0.9], ['collapse', 40, 1], ['cough', 6, 0.5], ['mutter', 8, 0.5], ['drone-alert', 20, 0.8], ['guard-shout', 15, 0.95], ['mouthorgan', 30, 0.7], ['vendor-call', 12, 0.6], ['bite', 2, 1], ['gate-buzz', 4, 0.8], ['splash', 5, 0.6], ['hurt', 0, 0.8], ['footstep', 0, 0.5]]) {
    au.play(k, d ? { x: p.x + d, y: p.y + 1, z: p.z } : null, { loud });
    out.events[k] = await sample(1800); await sleep(700);
  }
  only('voice'); await sleep(300);
  au.sing(0); out.sing = await sample(5200); await sleep(1500);
  try { G.pa.say(0); } catch { /* ok */ }
  out.pa = await sample(5200); await sleep(500);
  for (const k of names) au.setVolume(k, base[k]);
  return out;
});

await browser.close(); server.close();
const f = (v) => String(v).padStart(7);
console.log('source'.padEnd(14), 'rms dB'.padStart(7), 'max dB'.padStart(7), 'peak dB'.padStart(7));
const row = (n, r) => console.log(n.padEnd(14), f(r.rms), f(r.max), f(r.peak));
row('ambience (G)', R.amb); row('music', R.music);
for (const [k, r] of Object.entries(R.events)) row('event ' + k, r);
row('voice (sing)', R.sing); row('PA', R.pa);
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const evMax = med(Object.values(R.events).map((r) => r.max));
const checks = [
  ['music sits under the ambience (RMS, at least 2 dB)', R.music.rms <= R.amb.rms - 2],
  ['the ambience sits under the events (median event max window vs the ambience max window, at least 1 dB)', evMax >= R.amb.max + 1],
  ['the sung voice is clearly above the events (max window, at least 6 dB)', R.sing.max >= evMax + 6],
  ['the PA is clearly above the events (max window, at least 3 dB)', R.pa.max >= evMax + 3],
  ['nothing clips the meter', [R.amb, R.music, R.sing, R.pa, ...Object.values(R.events)].every((r) => r.peak < -0.3)],
];
console.log(`\nmedian event max window ${evMax} dB`);
let bad = 0;
for (const [msg, ok] of checks) { console.log(ok ? 'ok  ' : 'FAIL', msg); if (!ok) bad++; }
if (R.context !== 'running') { console.log('FAIL the AudioContext is not running: ' + R.context); bad++; }
if (errors.length) { console.error('console errors:\n' + errors.join('\n')); bad++; }
process.exit(bad ? 1 : 0);
