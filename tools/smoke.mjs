// Headless smoke test for Grahan.
//
// Usage:
//   NODE_PATH=$(npm root -g) node tools/smoke.mjs [--shots tools/shots.json] [--wait 4000] [--query "seed=1"] [--out shots]
//        [--no-autostart] [--mobile] [--orientation portrait|landscape] [--viewport 390x844]
//   (NODE_PATH is optional: playwright is also looked up in the global npm root.)
//
//   --no-autostart   open index.html without autostart=1 (the title screen shows, the opening cinematic plays on Begin).
//   --mobile         emulate a phone: touch, mobile user agent, device scale factor 2 (default 844x390 landscape; use
//                    --orientation portrait for 390x844, or --viewport WxH for anything else). Pairs with `?touch=1`.
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
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  try { return require('playwright'); } catch { /* fall back to the global npm root */ }
  const roots = [process.env.NODE_PATH, (() => { try { return execSync('npm root -g', { encoding: 'utf8' }).trim(); } catch { return null; } })()].filter(Boolean);
  for (const r of roots) { try { return createRequire(path.join(r, 'x.js'))('playwright'); } catch { /* next */ } }
  throw new Error('playwright not found (install it globally or set NODE_PATH)');
}
const { chromium } = loadPlaywright();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : def;
};
const flag = (name) => args.includes('--' + name);
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
const mobile = flag('mobile');
const orientation = opt('orientation', 'landscape');
let vp = mobile ? (orientation === 'portrait' ? { width: 390, height: 844 } : { width: 844, height: 390 }) : { width: 1280, height: 720 };
if (opt('viewport', null)) { const [w, h] = opt('viewport').split('x').map(Number); vp = { width: w, height: h }; }
const context = await browser.newContext(mobile ? {
  viewport: vp, deviceScaleFactor: 2, hasTouch: true, isMobile: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36',
} : { viewport: vp });
const page = await context.newPage();
let cdp = null;   // lazily created for touch gestures
const live = new Map();   // touch points currently down
const getCdp = async () => (cdp ??= await context.newCDPSession(page));
const errors = [];
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('console.error: ' + m.text());
  else if (process.env.VERBOSE) console.log('[page]', m.type(), m.text());
});
page.on('pageerror', (e) => errors.push('pageerror: ' + (e.stack || e.message)));
page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));

const startQuery = (flag('no-autostart') ? '' : 'autostart=1&') + `debug=1&${query}`;
const url = `http://localhost:${port}/index.html?${startQuery}`;
console.log('Opening', url);
await page.goto(url);
await page.waitForTimeout(initialWait);
await page.screenshot({ path: path.join(outDir, '00-initial.png') });
console.log('saved 00-initial.png');

if (shotsFile) {
  const steps = JSON.parse(fs.readFileSync(path.resolve(root, shotsFile), 'utf8'));
  let i = 1;
  for (const s of steps) {
    try {
      if (s.waitFor) await page.waitForFunction(s.waitFor, null, { timeout: s.waitForTimeout ?? 180000, polling: 500 });   // e.g. after a step that navigates
      if (s.viewport) await page.setViewportSize({ width: s.viewport[0], height: s.viewport[1] });
      if (s.reload !== undefined) {      // reload with a new query (e.g. to prove a setting persists); s.reload = "seed=1" or true
        const auto = s.autostart ?? !flag('no-autostart');            // a reload step may flip autostart (e.g. to see the title on a run that otherwise skips it)
        const q = s.reload === true ? startQuery : (auto ? 'autostart=1&' : '') + `debug=1&${s.reload}`;
        await page.goto(`http://localhost:${port}/index.html?${q}`);
        live.clear();
        await page.waitForTimeout(s.reloadWait ?? initialWait);
      }
      if (s.css) await page.addStyleTag({ content: s.css });
      if (s.key) await page.keyboard.press(s.key);
      if (s.click) await page.click(s.click, { timeout: 60000, force: !!s.force });   // force skips the "stable" wait, which SwiftShader's slow frames can starve
      if (s.tap) await page.locator(s.tap).first().tap({ timeout: 60000 });
      if (s.touch) {                     // [{t:'start'|'move'|'end', id, x, y, wait}] raw touch points through CDP
        const c = await getCdp();
        // CDP wants the full set of active points on every event; the set lives across steps so a finger can go down in one step and up in a later one
        for (const a of s.touch) {
          const id = a.id ?? 1;
          if (a.t === 'start' || a.t === 'move') live.set(id, { x: a.x, y: a.y, id });
          else if (a.t === 'end') live.delete(id);
          const type = a.t === 'start' ? 'touchStart' : a.t === 'move' ? 'touchMove' : 'touchEnd';
          await c.send('Input.dispatchTouchEvent', { type, touchPoints: [...live.values()] });
          if (a.wait) await page.waitForTimeout(a.wait);
        }
      }
      if (s.eval) {
        const v = await page.evaluate(s.eval);
        if (v !== undefined) console.log(`[${s.name}] ->`, JSON.stringify(v));
      }
    } catch (e) {
      errors.push(`step ${s.name} failed: ${e.message}`);
    }
    await page.waitForTimeout(s.wait ?? 1000);
    if (s.shot === false) continue;
    const file = `${String(i++).padStart(2, '0')}-${s.name}.png`;
    // SwiftShader can stall a frame for minutes on a loaded machine: retry a timed-out screenshot before calling it a failure
    let shotErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { await page.screenshot({ path: path.join(outDir, file), timeout: 120000 }); shotErr = null; break; } catch (e) { shotErr = e; console.log(`screenshot ${file} timed out (attempt ${attempt + 1})`); await page.waitForTimeout(3000); }
    }
    if (shotErr) { errors.push(`screenshot ${file} failed: ${shotErr.message.split('\n')[0]}`); continue; }
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
