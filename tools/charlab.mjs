// Character lab: renders people in a plain three.js scene (no game) for quick visual iteration.
//   node tools/charlab.mjs <shots.json> [--out dir]
// shots.json: [{ name, names:[...], gap, yaw, mood, talking, pre:"js run in page (lab.* available)", cam:{pos:[x,y,z], at:[x,y,z], fov}, steps:{dt,n,speed}, post:"js" }]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';

const require = createRequire(import.meta.url);
function loadPW() {
  try { return require('playwright'); } catch { /* fall through */ }
  const r = execSync('npm root -g', { encoding: 'utf8' }).trim();
  return createRequire(path.join(r, 'x.js'))('playwright');
}
const { chromium } = loadPW();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const shots = JSON.parse(fs.readFileSync(path.resolve(args[0]), 'utf8'));
const out = path.resolve(args.includes('--out') ? args[args.indexOf('--out') + 1] : 'shots/lab');
fs.mkdirSync(out, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(root, p);
  if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text()); });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message + '\n' + e.stack));
await page.goto(`http://localhost:${server.address().port}/tools/charlab.html`);
await page.waitForFunction('window.labReady === true', null, { timeout: 60000 }).catch(() => {});
let i = 0;
for (const s of shots) {
  try {
    const info = await page.evaluate((shot) => {
      const L = window.lab;
      L.show(shot.names, shot);
      if (shot.pre) (0, eval)(shot.pre);
      if (shot.steps) L.step(shot.steps.dt ?? 0.016, shot.steps.n ?? 1, shot.steps.speed ?? 0, shot.steps.opts ?? {});
      if (shot.post) (0, eval)(shot.post);
      if (shot.cam) L.look(shot.cam.pos, shot.cam.at, shot.cam.fov ?? 35);
      return { calls: L.render() };
    }, s);
    const file = path.join(out, `${String(++i).padStart(2, '0')}-${s.name}.png`);
    await page.screenshot({ path: file });
    console.log('saved', path.basename(file), JSON.stringify(info));
  } catch (e) { console.log('FAILED', s.name, e.message.split('\n')[0]); errs.push(`${s.name}: ${e.message}`); }
}
await browser.close();
server.close();
if (errs.length) { console.log('\nERRORS:\n' + errs.slice(0, 20).join('\n')); process.exit(1); }
