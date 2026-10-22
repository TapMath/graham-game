// Offline audio check for the procedural sound recipes (Phase 5).
//
// Usage: NODE_PATH=$(npm root -g) node tools/audio-check.mjs [kind ...] [--wav outdir]
//
// Serves the repo, opens a blank module page in headless Chromium and renders every recipe (one-shots, loops, the sung
// phrase, the mouth organ, the ambience beds and the music) through an OfflineAudioContext. Prints peak and RMS in dBFS,
// the spectral centroid and the length of each, and flags NaNs, silence and clipping. Nothing is played. With --wav the
// renders are also written as 16-bit mono WAV files so they can be auditioned by hand.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const wavIdx = argv.indexOf('--wav');
const wavDir = wavIdx >= 0 ? path.resolve(argv[wavIdx + 1]) : null;
const only = argv.filter((a, i) => !a.startsWith('--') && i !== (wavIdx >= 0 ? wavIdx + 1 : -2));
if (wavDir) fs.mkdirSync(wavDir, { recursive: true });

const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/blank') { res.writeHead(200, { 'Content-Type': 'text/html' }); res.end('<!doctype html><title>audio</title>'); return; }
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:${port}/blank`);

const results = await page.evaluate(async ({ only, wantWav }) => {
  const S = await import('/src/systems/audio/synth.js');
  const { Ambience } = await import('/src/systems/audio/ambience.js');
  const { Music } = await import('/src/systems/audio/music.js');
  const SR = 44100;
  const out = [];
  function analyse(buf) {
    const d = buf.getChannelData(0); let peak = 0, sum = 0, n = 0, nan = 0, last = 0;
    for (let i = 0; i < d.length; i++) { const v = d[i]; if (Number.isNaN(v)) { nan++; continue; } const a = Math.abs(v); if (a > peak) peak = a; if (a > 1e-4) { sum += v * v; n++; last = i; } }
    const rms = n ? Math.sqrt(sum / n) : 0;
    // spectrum of the loudest 4096-sample window (radix-2 FFT, Hann): centroid and the strongest peaks
    const N = 4096; let best = 0, bi = 0;
    for (let i = 0; i + N < d.length; i += 1024) { let e = 0; for (let j = 0; j < N; j += 4) e += d[i + j] * d[i + j]; if (e > best) { best = e; bi = i; } }
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let j = 0; j < N; j++) re[j] = (d[bi + j] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * j / N));
    for (let i = 1, j = 0; i < N; i++) { let bit = N >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= N; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < N; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr; re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
    }
    const mag = new Float64Array(N / 2); let num = 0, den = 0, mx = 0;
    for (let k = 1; k < N / 2; k++) { mag[k] = Math.hypot(re[k], im[k]); const f = k * SR / N; num += f * mag[k]; den += mag[k]; if (mag[k] > mx) mx = mag[k]; }
    const peaks = [];
    for (let k = 2; k < N / 2 - 2; k++) if (mag[k] > mx * 0.18 && mag[k] >= mag[k - 1] && mag[k] > mag[k + 1] && mag[k] >= mag[k - 2] && mag[k] > mag[k + 2]) peaks.push([Math.round(k * SR / N), mag[k]]);
    peaks.sort((x, y) => y[1] - x[1]);
    const top = peaks.slice(0, 5).map((x) => x[0]).sort((x, y) => x - y);
    const centroid = den ? Math.round(num / den) : 0;
    return { peakDb: peak ? 20 * Math.log10(peak) : -Infinity, rmsDb: rms ? 20 * Math.log10(rms) : -Infinity, centroid, top, len: +(last / SR).toFixed(2), nan };
  }
  async function render(name, secs, build) {
    if (only.length && !only.includes(name)) return;
    try {
      const ctx = new OfflineAudioContext(1, Math.ceil(SR * secs), SR);
      const master = ctx.createGain(); master.gain.value = 1; master.connect(ctx.destination);
      const info = await build(ctx, master);
      const buf = await ctx.startRendering();
      const a = analyse(buf);
      out.push({ name, ...a, ret: info && info.ret != null ? +(+info.ret).toFixed(2) : null, wav: wantWav ? Array.from(buf.getChannelData(0)) : null });
    } catch (e) { out.push({ name, error: String(e && e.stack || e) }); }
  }
  for (const k of Object.keys(S.ONESHOT)) await render(k, 5, (ctx, m) => ({ ret: S.ONESHOT[k](ctx, m, 0.02, { loud: 0.6, rnd: Math.random, notes: undefined, weak: 0, surface: 'wet' }) }));
  for (const k of Object.keys(S.LOOPS)) await render('loop:' + k, 3, (ctx, m) => { S.LOOPS[k](ctx, m, {}); return {}; });
  await render('sing', 7, (ctx, m) => { const r = S.singPhrase(ctx, m, 0.05, { phrase: S.RAGA.phrases[0] }); return { ret: r.dur }; });
  await render('sing2', 7, (ctx, m) => { const r = S.singPhrase(ctx, m, 0.05, { phrase: S.RAGA.phrases[2] }); return { ret: r.dur }; });
  await render('organ-weak', 5, (ctx, m) => { const r = S.mouthOrgan(ctx, m, 0.05, { weak: 0.7 }); return { ret: r.dur }; });
  for (const lvl of ['U', 'G', 'L1', 'L2', 'L3']) {
    await render('amb:' + lvl, 4, (ctx, m) => {
      const game = { time: 0, player: { pos: { x: -44, y: 0, z: -30 } }, events: { on() {}, emit() {} }, sky: { dayFactor: 1, hour: 12 }, mode: 'playing' };
      const eng = { ctx, game, buses: { amb: m } };
      const a = new Ambience(eng);
      for (const n of Object.keys(a.weights)) a.weights[n] = n === lvl ? 1 : 0;
      a.update(0.016);
      for (const n of Object.keys(a.beds)) if (n !== lvl) { try { a.beds[n].trim.disconnect(); } catch { /* ok */ } }
      a.beds[lvl].trim.connect(m);
      a.beds[lvl].out.gain.value = 1.05;
      return {};
    });
  }
  await render('music-day', 30, (ctx, m) => {
    const game = { time: 0, player: { pos: { x: 0, y: 0, z: 0 } }, events: { on() {}, emit() {} }, sky: { dayFactor: 1, hour: 12 }, mode: 'playing', setu: null };
    const eng = { ctx, game, buses: { music: m }, reverbIn: ctx.createGain() };
    const mu = new Music(eng);
    mu._chord(0.1);
    mu._arp(5, 146.83 * 2, { arp: [0, 7, 10, 14, 15, 19, 22] }, 'day', 1);
    return {};
  });
  return out;
}, { only, wantWav: !!wavDir });

const bad = [];
console.log('name'.padEnd(22), 'peak dB'.padStart(8), 'rms dB'.padStart(8), 'centroid'.padStart(9), 'tail s'.padStart(7), 'ret s'.padStart(6), ' strongest partials (Hz)');
for (const r of results) {
  if (r.error) { console.log(r.name.padEnd(22), 'ERROR', r.error.split('\n')[0]); bad.push(r.name); continue; }
  const flags = [];
  if (r.nan) flags.push('NaN');
  if (r.peakDb === -Infinity) flags.push('SILENT');
  if (r.peakDb > -0.5) flags.push('CLIP');
  if (flags.length) bad.push(r.name + ':' + flags.join(','));
  console.log(r.name.padEnd(22), String(r.peakDb === -Infinity ? '-inf' : r.peakDb.toFixed(1)).padStart(8), String(r.rmsDb === -Infinity ? '-inf' : r.rmsDb.toFixed(1)).padStart(8), String(r.centroid).padStart(9), String(r.len).padStart(7), String(r.ret ?? '').padStart(6), ' ', (r.top || []).join(' '), flags.join(' '));
  if (wavDir && r.wav) {
    const n = r.wav.length, buf = Buffer.alloc(44 + n * 2);
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
    buf.writeUInt32LE(44100, 24); buf.writeUInt32LE(88200, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
    for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(r.wav[i] * 32767))), 44 + i * 2);
    fs.writeFileSync(path.join(wavDir, r.name.replace(/[^a-z0-9-]/gi, '_') + '.wav'), buf);
  }
}
await browser.close(); server.close();
if (errors.length) { console.error('\nconsole errors:\n' + errors.join('\n')); }
if (bad.length || errors.length) { console.error('\nPROBLEMS: ' + bad.join(' ')); process.exit(1); }
console.log('\nOK');
