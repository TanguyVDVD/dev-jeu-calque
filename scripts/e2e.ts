// End-to-end checks against a running server (local, container or tunnel).
//   npm run e2e -- bots  [url] [players]   Node clients in real time: a whole game, then a rematch
//   npm run e2e -- tabs  [url]             two automated browser tabs: lobby -> podium -> rematch, with screenshots
//   npm run e2e -- shots [url]             a screenshot of every other screen
//   npm run e2e -- ws    [url]             /healthz, then a WebSocket ping through whatever sits in front
import { mkdirSync } from 'node:fs';
import WebSocket from 'ws';
import { ARENAS } from '../src/shared/arena';
import { realClock } from '../src/shared/clock';
import { Bot, sameRun, until } from '../tests/bot';
import { ROUTES, routeInputs } from '../tests/routes';

const [, , mode = 'bots', base = 'http://localhost:3000', arg] = process.argv;
const http = base.replace(/\/$/, ''), wsUrl = http.replace(/^http/, 'ws') + '/ws';
const ARENA = 1; // Colonne: the shortest base route
const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function bots(n: number) {
  const clock = realClock(), all: Bot[] = [];
  for (let i = 0; i < n; i++) {
    const b = new Bot(wsUrl, ['Ada', 'Bob', 'Cléo', 'Dan'][i], clock).join(all[0]?.s.code ?? '');
    all.push(b);
    await until(() => b.s.seat === i, `${b.name} seated`);
  }
  const host = all[0];
  log(`room ${host.s.code}: ${all.map((b) => b.name).join(', ')} — rtt ${all.map((b) => Math.round(b.s.rtt) + ' ms').join(', ')}`);
  host.s.send({ t: 'set', arena: ARENA, rounds: 4 });
  for (const b of all.slice(1)) b.s.send({ t: 'set', ready: true });
  await until(() => host.s.room!.players.filter((p) => p.ready).length === n - 1, 'ready');
  for (let game = 1; game <= 2; game++) {
    const seen = host.results.length;
    host.s.send(game === 1 ? { t: 'start' } : { t: 'rematch' });
    let shown = seen;
    await until(() => {
      for (; shown < host.results.length; shown++) {
        const r = host.results[shown];
        log(`game ${game} round ${r.n}${['', ' (double)', ' (tiebreak)'][r.kind]}: ` + r.rows.map((x) => `${all[x.seat].name} ${x.tick > 0 ? (x.tick / 60).toFixed(2) + ' s' : 'DNF'} +${x.pts}`).join(' | ') + `  -> ${r.scores.slice(0, n).join('-')}`);
      }
      return host.podiums.length === game;
    }, `podium of game ${game}`, 400000);
    const p = host.podiums[game - 1];
    log(`game ${game} podium: winner(s) ${p.winners.map((s) => all[s].name).join(' & ')}, sides ${host.rounds.filter((r) => r.n === 1)[game - 1].seats.map((s) => 'LR'[s.side]).join('')}, awards ${p.awards.map((a) => a.k).join(',')}`);
    // every client holds the same ghosts
    for (let r = 0; r < p.rounds; r++) for (let seat = 0; seat < n; seat++) for (const b of all) if (!sameRun(b.s.runs[r][seat], host.s.runs[r][seat])) throw new Error(`run mismatch at round ${r + 1} seat ${seat}`);
    log(`game ${game}: ${p.rounds * n} runs identical on ${n} clients`);
  }
  for (const b of all) b.stop();
  log('OK — lobby, game, podium, rematch');
}

async function browser() {
  const { chromium } = await import('playwright');
  const b = await chromium.launch();
  mkdirSync('shots', { recursive: true });
  return b;
}

async function tabs() {
  const b = await browser();
  const routes = ARENAS.map((a) => [0, 1].map((side) => routeInputs(ROUTES[a.id].base, side)));
  const open = async (name: string, path = '/') => {
    const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }), page = await ctx.newPage();
    page.on('pageerror', (e) => { console.error(`[${name}] page error:`, e.message); process.exitCode = 1; });
    await page.goto(http + path);
    await page.fill('#h-name', name);
    // scripted player: at each round, replay the reference run of its side
    await page.evaluate((r) => {
      const c = (window as any).__calque; let key = '';
      setInterval(() => {
        const s = c.session, m = s?.round, me = m?.seats.find((x: any) => x.seat === s.seat);
        if (!me || key === m.n + ':' + m.startAt) return;
        key = m.n + ':' + m.startAt;
        const ins = r[m.arena][me.side];
        c.input.script = (t: number) => ins[t] || 0;
      }, 30);
    }, routes);
    return page;
  };
  const a = await open('Ada');
  await a.click('#h-create');
  await a.waitForSelector('#s-lobby:not([hidden])');
  const code = await a.textContent('#l-code');
  log('room', code);
  const z = await open('Zoé', '/r/' + code);
  await z.click('#h-join');
  await z.waitForSelector('#s-lobby:not([hidden])');
  await z.click('#l-colors button[data-i="3"]');
  await z.click('#l-ready');
  await a.click(`#l-arenas button[data-i="${ARENA}"]`);
  await a.click('#l-more'); // auto -> 4 rounds
  await a.waitForSelector('#l-start:not([disabled])');
  await a.waitForTimeout(600);
  await a.screenshot({ path: 'shots/lobby-host.png' });
  await z.screenshot({ path: 'shots/lobby-guest.png' });
  for (let game = 1; game <= 2; game++) {
    await a.click(game === 1 ? '#l-start' : '#p-rematch');
    await a.waitForSelector('#hud:not([hidden])');
    if (game === 1) {
      await a.waitForTimeout(1500); await a.screenshot({ path: 'shots/countdown.png' });
      await a.waitForTimeout(5000); await a.screenshot({ path: 'shots/round1.png' });
      await a.waitForSelector('#results:not([hidden])', { timeout: 30000 }); await a.screenshot({ path: 'shots/results.png' });
      await a.waitForFunction(() => (window as any).__calque.session.round?.n === 3 && (window as any).__calque.session.tick() > 200, null, { timeout: 90000 });
      await a.screenshot({ path: 'shots/round3-host.png' }); await z.screenshot({ path: 'shots/round3-guest.png' });
    }
    await a.waitForSelector('#s-podium:not([hidden])', { timeout: 400000 });
    await z.waitForSelector('#s-podium:not([hidden])', { timeout: 10000 });
    await a.waitForTimeout(2500);
    await a.screenshot({ path: `shots/podium-${game}.png` });
    const sum = await a.evaluate(() => {
      const s = (window as any).__calque.session;
      return { rounds: s.podium.rounds, scores: s.podium.scores, winners: s.podium.winners, sides: s.round.seats.map((x: any) => x.side), fps: Math.round(1000 / ((window as any).__calque.perf.ms / (window as any).__calque.perf.frames || 1)) };
    });
    log(`game ${game}: ${sum.rounds} rounds, scores ${sum.scores.slice(0, 2).join('-')}, winners ${sum.winners}, sides ${sum.sides}`);
  }
  await a.click('#p-lobby');
  await z.waitForSelector('#s-lobby:not([hidden])');
  await b.close();
  log('OK — two tabs: lobby, game, podium, rematch, back to the lobby');
}

async function shots() {
  const b = await browser();
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 } }), p = await ctx.newPage();
  p.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
  await p.goto(http);
  await p.waitForTimeout(700);
  await p.screenshot({ path: 'shots/home.png' });
  await p.click('#h-howto'); await p.waitForTimeout(1800); await p.screenshot({ path: 'shots/howto.png' });
  await p.click('#w-back'); await p.click('#h-settings'); await p.waitForTimeout(300); await p.screenshot({ path: 'shots/settings.png' });
  await p.click('#o-close'); await p.click('#h-train'); await p.click('#h-arenas button[data-i="0"]');
  // training: two scripted rounds so that a trace is on screen
  const ins = routeInputs(ROUTES.atelier.setup);
  await p.evaluate((r) => { (window as any).__calque.input.script = (t: number) => r[t] || 0; }, ins);
  await p.waitForTimeout(16500);
  await p.screenshot({ path: 'shots/training.png' });
  await p.goto(http + '/nulle-part'); await p.waitForTimeout(400); await p.screenshot({ path: 'shots/404.png' });
  const m = await (await b.newContext({ viewport: { width: 390, height: 780 }, hasTouch: true, isMobile: true })).newPage();
  await m.goto(http); await m.waitForTimeout(500); await m.screenshot({ path: 'shots/mobile.png' });
  const og = await p.goto(http + '/og.png');
  log('og.png', og?.status(), og?.headers()['content-type']);
  await b.close();
  log('OK — screenshots in shots/');
}

// Real key events, a simulated gamepad and the audio output, in the training mode of a real browser.
async function controls() {
  const b = await browser();
  const p = await (await b.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
  p.on('pageerror', (e) => { console.error('page error:', e.message); process.exitCode = 1; });
  await p.goto(http);
  await p.click('#h-train'); await p.click('#h-arenas button[data-i="0"]');
  const sim = () => p.evaluate(() => { const s = (window as any).__calque.training.runner.sim; return { x: s.x, y: s.y, tick: s.tick, dash: s.dashT, facing: s.facing }; });
  const fail = (what: string) => { console.error('FAIL', what); process.exitCode = 1; };
  await p.waitForFunction(() => (window as any).__calque.training.runner.sim.tick > 5);
  const start = await sim();
  // keyboard, by physical position: arrows, then the WASD/ZQSD block, Space, Shift
  await p.keyboard.down('ArrowRight'); await p.waitForTimeout(500); await p.keyboard.up('ArrowRight');
  const a = await sim();
  log(`ArrowRight 0.5 s: x ${start.x} -> ${a.x}`); if (a.x < start.x + 40) fail('ArrowRight');
  await p.keyboard.down('KeyA'); await p.waitForTimeout(300); await p.keyboard.up('KeyA');
  const l = await sim();
  log(`KeyA (Q on AZERTY) 0.3 s: x ${a.x} -> ${l.x}, facing ${l.facing}`); if (l.x > a.x - 20) fail('KeyA');
  await p.keyboard.down('Space'); await p.waitForTimeout(180);
  const j = await sim(); await p.keyboard.up('Space');
  log(`Space: y ${l.y} -> ${j.y}`); if (j.y > l.y - 20) fail('Space');
  await p.waitForTimeout(700);
  const d0 = await sim();
  await p.keyboard.down('KeyD'); await p.keyboard.down('ShiftLeft'); await p.waitForTimeout(60);
  const d = await sim(); await p.keyboard.up('ShiftLeft'); await p.waitForTimeout(200); await p.keyboard.up('KeyD');
  const d1 = await sim();
  log(`KeyD + Shift: dashing ${d.dash > 0}, x ${d0.x} -> ${d1.x} in 0.26 s`); if (d1.x < d0.x + 60) fail('dash');
  // sound: unlocked by those key presses; a jump must put signal on the output
  await p.keyboard.press('Space');
  let peak = 0;
  for (let i = 0; i < 12; i++) { peak = Math.max(peak, await p.evaluate(() => (window as any).__calque.audio.level())); await p.waitForTimeout(15); }
  const state = await p.evaluate(() => (window as any).__calque.audio.state());
  log(`audio: context ${state}, peak level ${peak.toFixed(3)} (jump + music)`); if (state !== 'running' || peak < 0.01) fail('audio');
  await p.evaluate(() => (window as any).__calque.audio.setVolume(0)); await p.waitForTimeout(250);
  const muted = await p.evaluate(() => (window as any).__calque.audio.level());
  log(`audio muted: peak ${muted.toFixed(4)}`); if (muted > 0.005) fail('mute');
  // gamepad: a standard pad with the stick pushed right, then button 0 (jump)
  await p.waitForTimeout(600);
  const g0 = await sim();
  await p.evaluate(() => {
    const pad = { axes: [1, 0, 0, 0], buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })), connected: true, id: 'test pad', index: 0, mapping: 'standard', timestamp: 0 };
    (window as any).__pad = pad;
    navigator.getGamepads = () => [pad as any];
    window.dispatchEvent(new Event('gamepadconnected'));
  });
  await p.waitForTimeout(400);
  const g1 = await sim();
  await p.evaluate(() => { (window as any).__pad.buttons[0].pressed = true; }); await p.waitForTimeout(180);
  const g2 = await sim();
  log(`gamepad: stick right 0.4 s x ${g0.x} -> ${g1.x}; button A y ${g1.y} -> ${g2.y}`); if (g1.x < g0.x + 30 || g2.y > g1.y - 20) fail('gamepad');
  await b.close();
  log(process.exitCode ? 'FAILED' : 'OK — keyboard, sound and gamepad drive the game in a real browser');
}

async function ws() {
  const health = await fetch(http + '/healthz');
  log('/healthz', health.status, await health.text());
  const html = await (await fetch(http + '/')).text();
  log('og:image', /property="og:image" content="([^"]+)"/.exec(html)?.[1]);
  const sock = new WebSocket(wsUrl), t0 = Date.now();
  await new Promise<void>((res, rej) => {
    sock.on('open', () => sock.send(JSON.stringify({ t: 'ping', c: 1 })));
    sock.on('message', (d) => { log('WebSocket', wsUrl, '->', String(d), `(${Date.now() - t0} ms)`); sock.close(); res(); });
    sock.on('error', rej);
  });
}

await ({ bots: () => bots(Number(arg) || 2), tabs, shots, ws, controls } as Record<string, () => Promise<void>>)[mode]();
process.exit(process.exitCode ?? 0);
