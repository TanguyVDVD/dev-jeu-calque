import { describe, it, expect, afterEach } from 'vitest';
import WebSocket from 'ws';
import { ARENAS } from '../src/shared/arena';
import { realClock, type Clock } from '../src/shared/clock';
import { AUTO_ROUNDS, PROTOCOL, ROUND_DOUBLE, ROUND_NORMAL, ROUND_TIEBREAK, T } from '../src/shared/protocol';
import { HZ, type Run } from '../src/shared/sim';
import { Runner } from '../src/client/runner';
import { createServer, type Server } from '../src/server/server';
import { Bot, base, idle, sameRun, until } from './bot';
import { start, play } from './helpers';
import { ROUTES, routeInputs } from './routes';

const COLONNE = 1;
let server: Server, clock: Clock, url: string, bots: Bot[] = [];

async function boot(scale: number) {
  clock = realClock(scale);
  server = await createServer({ clock });
  url = `ws://localhost:${server.port}/ws`;
}
const bot = (name: string, o = {}) => { const b = new Bot(url, name, clock, o); bots.push(b); return b; };
afterEach(async () => { for (const b of bots) b.stop(); bots = []; await server?.close(); });

async function lobby(names: string[], settings: object) {
  const all = [bot(names[0]).join()];
  await until(() => !!all[0].s.room, 'room creation');
  for (const n of names.slice(1)) {
    const b = bot(n).join(all[0].s.code);
    all.push(b);
    await until(() => b.s.seat >= 0 || (b.s.room?.players.length ?? 0) > 4, `${n} joining`);
  }
  all[0].s.send({ t: 'set', ...settings });
  for (const b of all.slice(1)) b.s.send({ t: 'set', ready: true });
  await until(() => all[0].s.room!.players.filter((p) => p.ready).length >= Math.min(all.length, 4) - 1, 'ready');
  return all;
}

// What the rules say a round's result must be, recomputed offline from the inputs each seat played and
// from the ghosts the server distributed. `inputsOf` returns the inputs of a seat for that round.
function expectRound(obs: Bot, i: number, inputsOf: (n: number, seat: number, side: number) => number[], before: number[]) {
  const res = obs.results[i], m = obs.rounds.filter((r) => !r.you)[i], arena = ARENAS[m.arena];
  expect(m.n).toBe(res.n);
  const ghosts: Run[] = [];
  for (let r = 0; r < m.n - 1; r++) for (const run of obs.s.runs[r]) if (run && run.len) ghosts.push(run);
  const ticks = m.seats.map(({ seat, side }) => {
    const sim = play(start(arena, { seat, side, ghosts, round: m.n }), inputsOf(m.n, seat, side));
    while (!sim.done) sim.step(0);
    return sim.finishTick;
  });
  const first = Math.min(...ticks.filter((t) => t > 0));
  const mult = res.kind === ROUND_DOUBLE ? 2 : 1;
  const want = m.seats.map(({ seat }, k) => ({ seat, tick: ticks[k], pts: ticks[k] < 0 ? 0 : (ticks[k] === first ? 3 : 1) * mult }));
  expect([...res.rows].sort((x, y) => x.seat - y.seat)).toEqual(want);
  const scores = [...before];
  for (const w of want) scores[w.seat] += w.pts;
  expect(res.scores).toEqual(scores);
  const order = res.rows.map((r) => (r.tick < 0 ? 1e9 : r.tick)); // rows come sorted by arrival
  expect(order).toEqual([...order].sort((x, y) => x - y));
  return scores;
}

describe('a whole game between simulated clients', () => {
  it('two players: lobby, rounds, ghosts, scores, doubled round, podium, then a rematch ending in tiebreaks', async () => {
    await boot(15);
    const [a, b] = await lobby(['Ada', 'Bob'], { arena: COLONNE, rounds: 4 });
    expect(a.s.room!.host).toBe(a.s.id);
    expect([a.s.seat, b.s.seat]).toEqual([0, 1]);

    // Lobby rules: only the host changes settings; a colour belongs to one player.
    b.s.send({ t: 'set', arena: 2, color: 0 });
    b.s.send({ t: 'set', color: 2 });
    await until(() => a.s.room!.players[1].color === 2, 'colour change');
    expect(a.s.room!.arena).toBe(COLONNE);
    expect(a.s.room!.players[0].color).toBe(0);

    // Game 1: Ada runs every round, Bob never moves.
    b.plan = idle;
    b.s.send({ t: 'start' }); // not the host: ignored
    a.s.send({ t: 'start' });
    await until(() => a.podiums.length === 1 && b.podiums.length === 1, 'first podium');
    let scores = [0, 0, 0, 0];
    for (let i = 0; i < 4; i++) scores = expectRound(b, i, (n, seat, side) => (seat === 0 ? base(a.rounds[i], side) : []), scores);
    expect(a.results.map((r) => r.kind)).toEqual([ROUND_NORMAL, ROUND_NORMAL, ROUND_NORMAL, ROUND_DOUBLE]);
    expect(a.results.map((r) => r.scores.slice(0, 2))).toEqual([[3, 0], [6, 0], [9, 0], [15, 0]]); // last round counts double
    expect(a.results.map((r) => r.next)).toEqual(['round', 'round', 'round', 'podium']);
    expect(a.podiums[0]).toMatchObject({ winners: [0], rank: [0, 1], rounds: 4 });
    expect(a.podiums[0].awards.find((w) => w.k === 'fastest')).toMatchObject({ seat: 0, v: Math.min(...a.recs.map((r) => r.len)) });
    expect(b.results).toEqual(a.results);

    // Ghost distribution: at round n everyone replays the 2(n-1) previous runs.
    expect(a.ghostCounts).toEqual([0, 2, 4, 6]);
    expect(b.ghostCounts).toEqual([0, 2, 4, 6]);
    // Ghosts are identical on every client, tick by tick, and identical to what their owner lived locally.
    for (let r = 0; r < 4; r++) {
      for (const seat of [0, 1]) expect(sameRun(a.s.runs[r][seat], b.s.runs[r][seat])).toBe(true);
      expect(sameRun(a.s.runs[r][0], a.recs[r])).toBe(true);
      expect(sameRun(b.s.runs[r][1], b.recs[r])).toBe(true);
    }
    // A run that reached the goal is short, one that did not lasts the whole 15 s.
    expect(a.s.runs[0][0]!.len).toBeLessThan(11 * HZ);
    expect(a.s.runs[0][1]!.len).toBe(15 * HZ);

    // Rematch: sides are swapped. Both run round 1 from mirrored sides: same tick, both first.
    // Then nobody moves: still tied after the last round, three tiebreaks at most, then a shared win.
    const side1 = a.rounds[0].seats.map((s) => s.side);
    a.plan = b.plan = (m, side) => (m.n === 1 ? base(m, side) : idle());
    a.s.send({ t: 'rematch' });
    await until(() => a.podiums.length === 2, 'second podium');
    expect(a.rounds[4].n).toBe(1);
    expect(a.rounds[4].seats.map((s) => s.side)).toEqual(side1.map((s) => 1 - s));
    const g2 = a.results.slice(4);
    expect(g2[0].rows[0].tick).toBe(g2[0].rows[1].tick);
    expect(g2[0].rows.map((r) => r.pts)).toEqual([3, 3]);
    expect(g2.map((r) => r.kind)).toEqual([ROUND_NORMAL, ROUND_NORMAL, ROUND_NORMAL, ROUND_DOUBLE, ROUND_TIEBREAK, ROUND_TIEBREAK, ROUND_TIEBREAK]);
    expect(g2.map((r) => r.next)).toEqual(['round', 'round', 'round', 'tiebreak', 'tiebreak', 'tiebreak', 'podium']);
    expect(a.podiums[1].winners).toEqual([0, 1]);

    a.s.send({ t: 'lobby' });
    await until(() => b.s.room!.phase === 'lobby', 'back to the lobby');
  });

  it('four players and a spectator: two per side, results follow the rules, everyone holds the same ghosts', async () => {
    await boot(15);
    const all = await lobby(['A', 'B', 'C', 'D', 'Eve'], { arena: COLONNE, rounds: 4 });
    const eve = all[4];
    expect(all.map((b) => b.s.seat)).toEqual([0, 1, 2, 3, -1]);
    // Everyone runs round 1; afterwards seat k gives up from round k + 2 on. Ghosts get in the way: that is the game.
    const runs = (n: number, seat: number) => n === 1 || n <= seat + 1;
    all.forEach((b) => (b.plan = (m, side) => (runs(m.n, b.s.seat) ? base(m, side) : idle())));
    all[0].s.send({ t: 'start' });
    await until(() => all.every((b) => b.podiums.length === 1), 'podium');
    expect(all[0].rounds[0].seats.map((s) => s.side)).toEqual([0, 1, 0, 1]);
    // Round 1, no ghost yet: four mirrored runs, same tick, all first.
    expect(eve.results[0].rows.map((r) => r.pts)).toEqual([3, 3, 3, 3]);
    let scores = [0, 0, 0, 0];
    for (let i = 0; i < eve.results.length; i++) scores = expectRound(eve, i, (n, seat, side) => (runs(n, seat) ? base(eve.rounds[i], side) : []), scores);
    const last = eve.results.at(-1)!;
    const top = Math.max(...last.scores);
    expect(eve.podiums[0].winners).toEqual([0, 1, 2, 3].filter((s) => last.scores[s] === top));
    expect(eve.recs).toHaveLength(0);
    for (let r = 0; r < eve.results.length; r++) for (let seat = 0; seat < 4; seat++) for (const b of all) expect(sameRun(b.s.runs[r][seat], all[0].s.runs[r][seat])).toBe(true);
    expect(all[3].ghostCounts.slice(0, 4)).toEqual([0, 4, 8, 12]);

    // Back in the lobby the spectator gets a freed seat; with three players the lonely side rotates at each rematch.
    all[3].stop();
    all[0].s.send({ t: 'lobby' });
    await until(() => eve.s.seat === 3, 'spectator seated');
    all[1].stop();
    await until(() => all[0].s.room!.players.length === 3, 'three left');
    const three = [all[0], all[2], eve];
    for (const b of three) { b.plan = base; b.s.send({ t: 'set', ready: true }); }
    await until(() => all[0].s.room!.players.filter((p) => p.ready).length === 3, 'ready');
    const seen = all[0].rounds.length;
    all[0].s.send({ t: 'start' });
    await until(() => all[0].rounds.length > seen, 'three-player round');
    expect(all[0].rounds[seen].total).toBe(4);
    const lonely = (seats: { seat: number; side: number }[]) => seats.find((s) => seats.filter((o) => o.side === s.side).length === 1)!.seat;
    const first = lonely(all[0].rounds[seen].seats);
    await until(() => all[0].podiums.length === 2, 'three-player podium');
    const seen2 = all[0].rounds.length;
    all[0].s.send({ t: 'rematch' });
    await until(() => all[0].rounds.length > seen2, 'rematch');
    expect(lonely(all[0].rounds[seen2].seats)).not.toBe(first);
  });

  it('a disconnection never blocks the others, and coming back resynchronises everything', async () => {
    await boot(12);
    const store = new Map<string, string>();
    const mem = { get: (k: string) => store.get(k) ?? null, set: (k: string, v: string) => void store.set(k, v) };
    const [a] = await lobby(['Ada'], { arena: COLONNE, rounds: 4 });
    let b = bot('Bob', { store: mem }).join(a.s.code);
    await until(() => b.s.seat === 1, 'Bob seated');
    b.s.send({ t: 'set', ready: true });
    await until(() => a.s.room!.players[1].ready, 'ready');
    a.s.send({ t: 'start' });

    // Round 1: the network drops mid-run, the page survives. The run goes on locally and nothing is lost.
    await until(() => (b.runner?.sim.tick ?? 0) > 120, 'round 1 under way');
    b.s.cut();
    await until(() => a.results.length === 1, 'round 1 results');
    expect(b.s.online).toBe(true);
    expect(a.results[0].rows.map((r) => r.pts)).toEqual([3, 3]);
    expect(a.results[0].rows[0].tick).toBe(a.results[0].rows[1].tick);
    expect(sameRun(a.s.runs[0][1], b.recs[0])).toBe(true);

    // Round 2: the tab dies mid-run and a new one opens with the stored token. The round does not wait.
    await until(() => b.runner?.round === 2 && b.runner.sim.tick > 100, 'round 2 under way');
    const lived = b.runner!.sim.tick;
    b.kill();
    await until(() => !a.s.room!.players[1].on, 'Bob seen offline');
    b = bot('Bob', { store: mem }).join(a.s.code);
    await until(() => a.results.length === 2, 'round 2 results');
    expect(a.results[1].rows.find((r) => r.seat === 1)).toEqual({ seat: 1, tick: -1, pts: 0 });
    expect(a.results[1].rows.find((r) => r.seat === 0)!.tick).toBe(a.recs[1].len === 900 ? -1 : a.recs[1].len);
    expect(clock.now() - a.rounds[1].startAt).toBeLessThan(T.ROUND + T.GRACE + 500);
    await until(() => b.s.seat === 1 && b.s.runs.length >= 2 && !!b.s.results, 'Bob resynchronised');
    expect(b.recs).toHaveLength(0); // could not resume: sat the round out
    // An interrupted run becomes a ghost that vanishes where its data stops.
    const cutRun = a.s.runs[1][1]!;
    expect(cutRun.len).toBeGreaterThan(90);
    expect(cutRun.len).toBeLessThanOrEqual(lived + 3);
    // Full resync: the new tab holds every run, identical to the other client's.
    for (let r = 0; r < 2; r++) for (const seat of [0, 1]) expect(sameRun(b.s.runs[r][seat], a.s.runs[r][seat])).toBe(true);

    // Round 3: back in the game with all four ghosts, and still credited with the points of round 1.
    await until(() => a.results.length === 3, 'round 3 results');
    expect(b.ghostCounts).toEqual([4]);
    expect(b.recs).toHaveLength(1);
    expect(sameRun(a.s.runs[2][1], b.recs[0])).toBe(true);
    expect(a.results[2].scores[1]).toBeGreaterThanOrEqual(3);

    // Round 4: the host leaves for good. The next player becomes host and the game still ends.
    await until(() => a.rounds.filter((r) => !r.you).length === 4, 'round 4');
    a.kill();
    await until(() => b.podiums.length === 1, 'podium without the host');
    expect(b.s.isHost).toBe(true);
    expect(b.podiums[0].rounds).toBeGreaterThanOrEqual(4);
  });
});

describe('one seat, one connection', () => {
  it('a second tab with the same token takes the seat, and the first one lets go instead of fighting back', async () => {
    await boot(10);
    const store = new Map<string, string>();
    const mem = { get: (k: string) => store.get(k) ?? null, set: (k: string, v: string) => void store.set(k, v) };
    const first = bot('Ada', { store: mem }).join();
    await until(() => !!first.s.room, 'room');
    const second = bot('Ada', { store: mem }).join(first.s.code);
    await until(() => first.errors.includes('taken'), 'first tab told');
    await new Promise((r) => setTimeout(r, 300)); // long enough for several reconnection attempts, if there were any
    expect(second.s.online).toBe(true);
    expect(first.s.online).toBe(false);
    expect(second.s.room!.players).toHaveLength(1);
    expect(second.s.id).toBe(first.s.id);
  });

  it('a cut during the countdown costs nothing: the run starts on the round clock after the reconnection', async () => {
    await boot(10);
    const [a, b] = await lobby(['Ada', 'Bob'], { arena: COLONNE, rounds: 4 });
    a.s.send({ t: 'start' });
    await until(() => b.rounds.length === 1, 'round announced');
    b.runner = null; // as if the announcement had been missed
    b.s.cut();
    await until(() => a.results.length === 1, 'results');
    expect(a.results[0].rows.map((r) => [r.tick, r.pts])).toEqual([[a.recs[0].len, 3], [a.recs[0].len, 3]]);
  });
});

describe('the network never touches the local simulation', () => {
  it('with 300 ms of latency each way, the local trajectory is exactly the offline one and nobody loses rank', async () => {
    await boot(6);
    const a = bot('Laggy', { delay: 300 }).join();
    await until(() => !!a.s.room, 'room');
    const b = bot('Local').join(a.s.code);
    await until(() => b.s.seat === 1, 'seated');
    a.s.send({ t: 'set', arena: 0 });
    b.s.send({ t: 'set', ready: true });
    await until(() => a.s.room!.players[1]?.ready === true, 'ready');
    a.s.send({ t: 'start' });
    await until(() => a.results.length === 2 && b.results.length === 2, 'two rounds');
    expect(a.s.rtt).toBeGreaterThanOrEqual(600);
    expect(a.rounds[0].total).toBe(8); // default length of a two-player game
    expect(AUTO_ROUNDS.slice(2)).toEqual([8, 7, 6]); // by number of players: 2, 3, 4

    const arena = ARENAS[0], ins = routeInputs(ROUTES.atelier.base, 0);
    // Round 1, no ghost; round 2, among the two ghosts of round 1 as distributed by the server.
    const ghosts: Run[] = [];
    for (let r = 0; r < 2; r++) {
      const offline = play(start(arena, { seat: 0, side: 0, ghosts: [...ghosts], round: r + 1 }), ins);
      while (!offline.done) offline.step(0);
      expect(sameRun(a.recs[r], offline.rec)).toBe(true);
      expect(sameRun(a.s.runs[r][0], offline.rec)).toBe(true); // and that is the ghost everyone received
      ghosts.push(a.s.runs[r][0]!, a.s.runs[r][1]!);
    }
    // Ranking uses the declared finish tick, not the arrival time of the message: the lagging player ties.
    expect(b.results[0].rows.map((r) => [r.tick, r.pts])).toEqual([[a.recs[0].len, 3], [a.recs[0].len, 3]]);
    let scores = [0, 0, 0, 0];
    for (let i = 0; i < 2; i++) scores = expectRound(b, i, (n, seat, side) => base(b.rounds[i], side), scores);
  });

  it('a client that falls behind catches up with the round clock at once, with neutral inputs for the old ticks', () => {
    const asked: number[] = [];
    const r = new Runner(null, ARENAS[0], 0, 0, [], 1);
    const input = (t: number) => { asked.push(t); return 2; };
    r.update(5, input);
    expect(r.sim.tick).toBe(5);
    asked.length = 0;
    r.update(305, input); // a 5-second hitch (background tab)
    expect(r.sim.tick).toBe(305); // not one tick of slow motion
    expect(asked).toEqual([295, 296, 297, 298, 299, 300, 301, 302, 303, 304]);
    r.update(2000, input);
    expect(r.sim.tick).toBe(900);
    expect(r.sim.done).toBe(true);
  });

  it('a stalled player loses time, the game does not wait: the round still closes on the server clock', async () => {
    await boot(10);
    const [a, b] = await lobby(['Ada', 'Bob'], { arena: COLONNE, rounds: 4 });
    b.exact = false;
    a.s.send({ t: 'start' });
    await until(() => (b.runner?.sim.tick ?? 0) > 60, 'round under way');
    const t0 = b.runner!.sim.tick;
    b.stall(400); // 4 s of game time without a single frame
    await until(() => b.runner!.sim.tick > t0 + 200, 'catch-up');
    expect(Math.abs(b.runner!.sim.tick - Math.min(b.s.tick(), 900))).toBeLessThanOrEqual(30);
    await until(() => a.results.length === 1, 'results');
    expect(clock.now() - a.rounds[0].startAt).toBeLessThan(T.ROUND + T.GRACE + 500);
    expect(a.results[0].rows[0]).toEqual({ seat: 0, tick: a.recs[0].len, pts: 3 });
  });
});

describe('the server is exposed to the Internet', () => {
  const within = <V>(p: Promise<V>, what: string) => Promise.race([p, new Promise<V>((_, rej) => setTimeout(() => rej(new Error('timeout: ' + what)), 4000))]);
  const raw = () => within(new Promise<WebSocket>((res) => { const ws = new WebSocket(url); ws.on('open', () => res(ws)); }), 'open');
  // Collects the next `n` text messages.
  const next = (ws: WebSocket, what: string, n = 1) => within(new Promise<any[]>((res) => {
    const got: any[] = [];
    const on = (d: WebSocket.RawData, bin: boolean) => { if (!bin) got.push(JSON.parse(String(d))); if (got.length === n) { ws.off('message', on); res(got); } };
    ws.on('message', on);
  }), what);
  const closed = (ws: WebSocket, what: string) => within(new Promise<number>((res) => ws.once('close', (code) => res(code))), what);

  it('answers /healthz, survives garbage, validates, caps sizes and rates', async () => {
    await boot(1);
    const http = `http://localhost:${server.port}`;
    const health = await fetch(http + '/healthz');
    expect([health.status, await health.text()]).toEqual([200, 'ok']);
    expect((await fetch(http + '/..%2f..%2fetc/passwd')).status).toBe(404);
    expect((await fetch(http + '/healthz', { method: 'POST' })).status).toBe(405);

    const ws = await raw();
    let reply = next(ws, 'pong');
    ws.send('not json'); ws.send('{"t":42}'); ws.send('[]'); ws.send(new Uint8Array([1, 2, 3]));
    ws.send(JSON.stringify({ t: 'start' })); // not in a room: ignored
    ws.send(JSON.stringify({ t: 'ping', c: 7 }));
    expect((await reply)[0]).toMatchObject({ t: 'pong', c: 7 });

    reply = next(ws, 'version error');
    ws.send(JSON.stringify({ t: 'join', v: PROTOCOL + 1, name: 'x' }));
    expect(await reply).toEqual([{ t: 'err', code: 'version' }]);
    reply = next(ws, 'unknown code');
    ws.send(JSON.stringify({ t: 'join', v: PROTOCOL, name: 'x', code: 'ZZZZ' }));
    expect(await reply).toEqual([{ t: 'err', code: 'nocode' }]);

    // A name is never markup, and never long.
    reply = next(ws, 'hi + room', 2);
    ws.send(JSON.stringify({ t: 'join', v: PROTOCOL, name: '<img src=x onerror=alert(1)>AAAAAAAAAAAAAAAAAAAAAAAAAAAA' }));
    const [hi, roomMsg] = await reply;
    expect(hi.t).toBe('hi');
    expect(roomMsg.players[0].name).toBe('img src=x oner');
    // Settings out of range are ignored.
    reply = next(ws, 'room after set');
    ws.send(JSON.stringify({ t: 'set', arena: 99, rounds: 500, color: -3, name: { toString: 1 } }));
    const [after] = await reply;
    expect([after.arena, after.rounds, after.players[0].color, after.players[0].name]).toEqual([0, 0, 0, 'Anonyme']);

    // Too big: the socket is closed before the message is even parsed.
    const big = await raw();
    big.send('x'.repeat(7000));
    expect(await closed(big, 'oversize')).toBe(1009);
    // Too fast: closed with a policy violation.
    const flood = await raw();
    const gone = closed(flood, 'flood');
    for (let i = 0; i < 400; i++) flood.send('{"t":"ping","c":1}');
    expect(await gone).toBe(1008);

    // An empty room is closed.
    expect(server.rooms.size).toBe(1);
    const left = closed(ws, 'leave');
    ws.send(JSON.stringify({ t: 'leave' }));
    await left;
    expect(server.rooms.size).toBe(0);
  });
});
