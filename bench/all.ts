// One bench per budget of the brief (section 9). Run after `npm run build`: npm run bench
// Exits with an error if any budget is exceeded.
import { spawn, execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { ARENAS } from '../src/shared/arena';
import { realClock } from '../src/shared/clock';
import { encodeRun, FRAME_CHUNK, MAX_FRAME } from '../src/shared/codec';
import { Sim, HZ, ROUND_TICKS, type Run } from '../src/shared/sim';
import { Bot, until } from '../tests/bot';
import { play, start } from '../tests/helpers';
import { ROUTES, routeInputs } from '../tests/routes';

const rows: [string, string, string, boolean | null][] = [];
const check = (name: string, value: number, unit: string, budget: number, digits = 2) => rows.push([name, `${value.toFixed(digits)} ${unit}`, `< ${budget} ${unit}`, value < budget]);
const skip = (name: string, why: string) => rows.push([name, why, '', null]);

// Worst case of the brief: 4 players, 48 ghosts (10 rounds + 3 tiebreaks = 12 previous rounds).
let seed = 99;
const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 16;
let keys = 0, hold = 0;
const pick = () => { if (hold-- <= 0) { keys = rnd() & 27; hold = rnd() % 40; } return keys; };
const ghosts: Run[] = [];
for (let round = 1; round <= 12; round++) for (let seat = 0; seat < 4; seat++) {
  const sim = new Sim();
  sim.reset(ARENAS[0], seat, seat & 1, ghosts.slice(), round);
  while (!sim.done) sim.step(pick());
  ghosts.push(sim.rec);
}

// 1. simulation tick
{
  const sim = new Sim(), REPS = 40;
  let ticks = 0;
  const t0 = performance.now();
  for (let r = 0; r < REPS; r++) { sim.reset(ARENAS[0], 0, 0, ghosts, 13); while (!sim.done) { sim.step(pick()); ticks++; } }
  check('simulation, per tick (48 ghosts)', (performance.now() - t0) / ticks, 'ms', 0.2, 4);
}

// 2. network: a real run sent in 50 ms frames, and the biggest possible full run
{
  const run = play(start(ARENAS[0]), routeInputs(ROUTES.atelier.base)).rec, buf = new Uint8Array(MAX_FRAME);
  let bytes = 0;
  for (let t = 0; t < run.len; t += 3) bytes += encodeRun(FRAME_CHUNK, run, t, Math.min(t + 3, run.len), buf);
  check('upload during a run', bytes / (run.len / HZ) / 1024, 'kB/s', 3);
  const worst = Math.max(...ghosts.map((g) => encodeRun(FRAME_CHUNK, g, 0, g.len, buf)));
  check(`a complete run (${ROUND_TICKS} ticks, worst of 48)`, worst / 1024, 'kB', 10);
}

// 3. client weight: everything the browser downloads to play, as served
const DIST = 'dist/client';
if (!existsSync(DIST)) skip('client weight', 'no dist/: run npm run build'); else {
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
  let br = 0, gz = 0;
  for (const f of walk(DIST)) {
    if (/\.(br|gz)$/.test(f) || /og\.png$|404\.html$/.test(f)) continue; // og.png is only fetched by link previews
    const raw = statSync(f).size;
    br += existsSync(f + '.br') ? statSync(f + '.br').size : /\.html$/.test(f) ? gzipSync(readFileSync(f)).length : raw;
    gz += existsSync(f + '.gz') ? statSync(f + '.gz').size : /\.html$/.test(f) ? gzipSync(readFileSync(f)).length : raw;
  }
  check('client weight, gzip (fonts included)', gz / 1024, 'kB', 300, 1);
  check('client weight, brotli (fonts included)', br / 1024, 'kB', 300, 1);
}

// 4. server: ten active rooms of four players, memory and idle CPU, on the built server in its own process
if (!existsSync('dist/server/main.js')) skip('server', 'no dist/: run npm run build'); else {
  const PORT = 3917, stats: { rss: number; cpu: { user: number; system: number } }[] = [];
  const child = spawn(process.execPath, ['dist/server/main.js'], { env: { ...process.env, PORT: String(PORT), STATS: '1' } });
  child.stdout.on('data', (d) => { for (const l of String(d).split('\n')) if (l.startsWith('stats ')) stats.push(JSON.parse(l.slice(6))); });
  await new Promise((r) => setTimeout(r, 800));
  const clock = realClock(), url = `ws://localhost:${PORT}/ws`, bots: Bot[] = [];
  for (let room = 0; room < 10; room++) {
    const host = new Bot(url, 'h' + room, clock).join();
    await until(() => !!host.s.room, 'room');
    const guests = [1, 2, 3].map((i) => new Bot(url, 'g' + i, clock).join(host.s.code));
    await until(() => guests.every((g) => g.s.seat >= 0), 'seats');
    host.s.send({ t: 'set', arena: 1, rounds: 4 });
    for (const g of guests) g.s.send({ t: 'set', ready: true });
    await until(() => host.s.room!.players.filter((p) => p.ready).length === 3, 'ready');
    host.s.send({ t: 'start' });
    bots.push(host, ...guests);
  }
  await until(() => bots.every((b) => b.results.length >= 2), 'two rounds in ten rooms', 120000);
  await new Promise((r) => setTimeout(r, 2100));
  const busy = stats.at(-1)!;
  check('server memory, 10 rooms x 4 players in play', Math.max(...stats.map((s) => s.rss)) / 2 ** 20, 'MB', 100, 1);
  for (const b of bots) b.plan = () => []; // everyone stands still: only heartbeats and run frames of idle players
  await until(() => bots.every((b) => b.podiums.length >= 1 || b.results.length >= 3), 'next round', 120000);
  // idle CPU: 40 connected clients in ten lobbies, nothing but heartbeats
  for (const b of bots) if (b.s.isHost) b.s.send({ t: 'lobby' });
  await until(() => bots.every((b) => b.podiums.length >= 1), 'podiums', 240000);
  for (const b of bots) if (b.s.isHost) b.s.send({ t: 'lobby' });
  await until(() => bots.every((b) => b.s.room?.phase === 'lobby'), 'lobbies', 20000);
  await new Promise((r) => setTimeout(r, 2500));
  const a = stats.at(-1)!;
  await new Promise((r) => setTimeout(r, 10000));
  const z = stats.at(-1)!;
  check('server CPU at rest (10 lobbies, 40 clients)', ((z.cpu.user + z.cpu.system - a.cpu.user - a.cpu.system) / 1e6 / 10) * 100, '% of a core', 2);
  void busy;
  for (const b of bots) b.stop();
  child.kill();
}

// 5. script time per frame, worst case, in a real browser
if (!existsSync('dist/server/main.js')) skip('frame', 'no dist/'); else {
  const PORT = 3918, child = spawn(process.execPath, ['dist/server/main.js'], { env: { ...process.env, PORT: String(PORT) } });
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ args: ['--enable-precise-memory-info'] });
    const page = await (await browser.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
    await page.goto(`http://localhost:${PORT}/?bench`);
    await page.waitForTimeout(3000); // warm-up: JIT, sprites
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('HeapProfiler.enable');
    await cdp.send('HeapProfiler.collectGarbage');
    const m0 = await page.evaluate(() => { const p = (window as any).__calque.perf; p.frames = 0; p.ms = 0; p.max = 0; return (performance as any).memory.usedJSHeapSize; });
    await page.waitForTimeout(2000);
    const heap = await page.evaluate(() => (performance as any).memory.usedJSHeapSize);
    await page.waitForTimeout(13000);
    const p = await page.evaluate(() => (window as any).__calque.perf);
    check('script per frame at 1080p (4 players, 48 ghosts, sim + render)', p.ms / p.frames, 'ms', 4, 3);
    rows.push(['  frames measured / slowest frame', `${p.frames} / ${p.max.toFixed(2)} ms`, '', null]);
    // Allocation check: heap growth over 2 s of play right after a full GC (no collection can hide it).
    check('heap growth per frame in the game loop', Math.max(0, heap - m0) / 120 / 1024, 'kB', 1, 3);
    await browser.close();
  } catch (e) { skip('script per frame', 'no headless browser: ' + String(e).slice(0, 60)); }
  child.kill();
}

// 6. Docker image
try {
  check('Docker image', Number(execSync('docker image inspect calque-game --format {{.Size}}', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })) / 1e6, 'MB', 200, 1);
} catch { skip('Docker image', 'not built: docker compose build'); }

const w = Math.max(...rows.map((r) => r[0].length));
console.log('\n' + rows.map(([n, v, b, ok]) => `${ok === null ? '  -  ' : ok ? ' ok  ' : 'FAIL '} ${n.padEnd(w)}  ${v.padStart(14)}  ${b}`).join('\n') + '\n');
const failed = rows.filter((r) => r[3] === false).length;
console.log(failed ? `${failed} budget(s) exceeded` : 'all budgets held');
process.exit(failed ? 1 : 0);
