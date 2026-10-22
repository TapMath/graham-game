// Headless smoke test for Grahan.
//
// Usage:
//   NODE_PATH=$(npm root -g) node tools/smoke.mjs [--shots tools/shots.json] [--wait 4000] [--query "seed=1"] [--out shots]
//
// Serves the repo root over HTTP, opens index.html?autostart=1&debug=1&<query> in headless
// Chromium (SwiftShader WebGL), waits, runs each shot step, and saves screenshots to --out.
// Exits non-zero if the page logs any console error or throws an uncaught exception.
//
// A shots file is a JSON array of steps:
//   [{ "name": "start", "eval": "window.__grahan.teleport(0, 2, 0)", "wait": 1000 }, ...]
// `eval` is optional JS run in the page before waiting `wait` ms and taking the screenshot.
// If `eval` returns a value it is printed, so steps double as assertions/probes.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
};
const shotsFile = opt('shots', null);
const initialWait = Number(opt('wait', 4000));
const query = opt('query', 'seed=1');
const outDir = path.resolve(root, opt('out', 'shots'));
fs.mkdirSync(outDir, { recursive: true });

const types = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2',
};
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const port = server.address().port;

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console.error: ' + m.text());
  else if (process.env.VERBOSE) console.log('[page]', m.type(), m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));

const url = `http://localhost:${port}/index.html?autostart=1&debug=1&${query}`;
console.log('Opening', url);
await page.goto(url);
await page.waitForTimeout(initialWait);
await page.screenshot({ path: path.join(outDir, '00-initial.png') });
console.log('saved 00-initial.png');

if (shotsFile) {
  const steps = JSON.parse(fs.readFileSync(path.resolve(root, shotsFile), 'utf8'));
  let i = 1;
  for (const s of steps) {
    if (s.eval) {
      try {
        const v = await page.evaluate(s.eval);
        if (v !== undefined) console.log(`[${s.name}] ->`, JSON.stringify(v));
      } catch (e) {
        errors.push(`eval failed in step ${s.name}: ${e.message}`);
      }
    }
    await page.waitForTimeout(s.wait ?? 1000);
    const file = `${String(i++).padStart(2, '0')}-${s.name}.png`;
    await page.screenshot({ path: path.join(outDir, file), timeout: 120000 });
    console.log('saved', file);
  }
}

const fps = await page.evaluate(() => window.__grahan?.fps?.() ?? null).catch(() => null);
if (fps !== null) console.log('fps (swiftshader, not representative):', fps);

await browser.close();
server.close();
if (errors.length) {
  console.error('\nFAIL: ' + errors.length + ' error(s):\n' + errors.join('\n'));
  process.exit(1);
}
console.log('\nOK: no console errors');
