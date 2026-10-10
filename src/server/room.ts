// One room: lobby, rounds, scores, run storage and relay. Event-driven, a single timer per phase.
// The server simulates nothing: it keeps time, keeps score, stores the runs and relays them.
import { randomBytes } from 'node:crypto';
import { ARENAS } from '../shared/arena';
import type { Clock } from '../shared/clock';
import { decodeRun, encodeRun, FRAME_CHUNK, FRAME_FULL, MAX_FRAME } from '../shared/codec';
import {
  AUTO_ROUNDS, MAX_ROUNDS, MAX_SEATS, MAX_SPECTATORS, MAX_TIEBREAKS, MIN_ROUNDS, PROTOCOL, ROUND_DOUBLE, ROUND_NORMAL, ROUND_TIEBREAK, T,
  cleanName, type Award, type ClientMsg, type Phase, type PodiumMsg, type ResultsMsg, type RoundMsg, type ServerMsg,
} from '../shared/protocol';
import { ROUND_TICKS, newRun, type Run } from '../shared/sim';

export interface Conn { send(data: string | Uint8Array): void; close(): void }

export interface Player { id: number; token: string; name: string; color: number; ready: boolean; seat: number; conn: Conn | null }

interface Game {
  rematch: number; n: number; total: number; tiebreaks: number; kind: number; startAt: number;
  seats: number[]; side: number[]; scores: number[];
  runs: (Run | null)[][]; // runs[round - 1][seat]
  done: boolean[]; finish: number[]; acks: Set<number>;
  stomped: Map<number, number>; crushed: Map<number, number>; ladders: number[]; kos: number[];
  best: { tick: number; seat: number; round: number };
  results: ResultsMsg | null; podium: PodiumMsg | null;
}

const out = new Uint8Array(MAX_FRAME);
const isInt = (v: unknown, lo: number, hi: number): v is number => Number.isInteger(v) && (v as number) >= lo && (v as number) <= hi;
const idList = (v: unknown): number[] => (Array.isArray(v) && v.length <= 64 && v.every((x) => isInt(x, 0, (MAX_ROUNDS + MAX_TIEBREAKS) * MAX_SEATS)) ? v : []);

export class Room {
  players: Player[] = [];
  host = -1; phase: Phase = 'lobby';
  arena = 0; rounds = 0; double = true;
  game: Game | null = null;
  private nextId = 1; private rematches = 0;
  private timer: (() => void) | null = null;
  private emptyTimer: (() => void) | null = null;

  constructor(readonly code: string, private clock: Clock, private onClose: () => void) {}

  // ---- membership -------------------------------------------------------------------------

  join(conn: Conn, name: unknown, token: unknown): Player | null {
    let p = typeof token === 'string' ? this.players.find((q) => q.token === token) : undefined;
    if (p) {
      p.conn?.close(); // the newest connection wins the seat
      p.conn = conn;
    } else {
      const seated = this.players.filter((q) => q.seat >= 0);
      if (this.players.length - seated.length >= MAX_SPECTATORS && (this.phase !== 'lobby' || seated.length >= MAX_SEATS)) return null;
      p = { id: this.nextId++, token: randomBytes(12).toString('hex'), name: cleanName(name), color: -1, ready: false, seat: -1, conn };
      this.players.push(p);
      if (this.phase === 'lobby') this.seat(p);
    }
    this.emptyTimer?.(); this.emptyTimer = null;
    this.fixHost();
    this.send(p, { t: 'hi', v: PROTOCOL, id: p.id, token: p.token, code: this.code });
    this.broadcastRoom();
    this.resync(p);
    return p;
  }

  // Gives the first free seat and the first free colour, if any.
  private seat(p: Player) {
    const taken = this.players.filter((q) => q.seat >= 0);
    if (p.seat >= 0 || taken.length >= MAX_SEATS) return;
    for (let s = 0; s < MAX_SEATS; s++) if (!taken.some((q) => q.seat === s)) { p.seat = s; break; }
    for (let c = 0; c < MAX_SEATS; c++) if (!taken.some((q) => q.color === c)) { p.color = c; break; }
  }

  // The connection dropped. The seat is kept: during a game until it ends, in the lobby for a while.
  drop(p: Player, conn: Conn) {
    if (p.conn !== conn) return; // already replaced by a reconnection
    p.conn = null; p.ready = false;
    this.fixHost();
    if (this.phase === 'lobby') this.clock.after(T.LOBBY_SEAT, () => { if (!p.conn && this.phase === 'lobby') this.remove(p); });
    if (this.phase === 'round') this.checkRoundOver();
    this.broadcastRoom();
    if (!this.players.some((q) => q.conn)) {
      this.emptyTimer?.();
      this.emptyTimer = this.clock.after(T.EMPTY, () => { if (!this.players.some((q) => q.conn)) this.close(); });
    }
  }

  private remove(p: Player) {
    this.players = this.players.filter((q) => q !== p);
    this.fixHost();
    if (this.phase === 'lobby') for (const q of this.players) this.seat(q);
    if (!this.players.length) this.close(); else this.broadcastRoom();
  }

  close() {
    this.timer?.(); this.emptyTimer?.();
    for (const p of this.players) p.conn?.close();
    this.players = [];
    this.onClose();
  }

  // If the host is gone, the next player takes over.
  private fixHost() {
    if (this.players.some((p) => p.id === this.host && p.conn)) return;
    const on = this.players.filter((p) => p.conn).sort((a, b) => (a.seat < 0 ? 9 : a.seat) - (b.seat < 0 ? 9 : b.seat));
    if (on.length) this.host = on[0].id;
  }

  // ---- sending ----------------------------------------------------------------------------

  private send(p: Player, msg: ServerMsg) { p.conn?.send(JSON.stringify(msg)); }
  private broadcast(msg: ServerMsg) { const s = JSON.stringify(msg); for (const p of this.players) p.conn?.send(s); }

  private broadcastRoom() {
    this.broadcast({
      t: 'room', code: this.code, host: this.host, phase: this.phase, arena: this.arena, rounds: this.rounds, double: this.double,
      players: this.players.map((p) => ({ id: p.id, name: p.name, color: p.color, ready: p.ready, on: !!p.conn, seat: p.seat })),
    });
  }

  private frame(type: number, run: Run): Uint8Array { return out.slice(0, encodeRun(type, run, 0, run.len, out)); }

  private roundMsg(g: Game): RoundMsg {
    return { t: 'round', n: g.n, total: g.total, kind: g.kind, startAt: g.startAt, arena: this.arena, seats: g.seats.map((seat) => ({ seat, side: g.side[seat] })), scores: g.scores };
  }

  // Full resynchronisation of one client: every stored run, then where the game stands.
  private resync(p: Player) {
    const g = this.game;
    if (!g || !g.n) return;
    const live = this.phase === 'round';
    for (let r = 0; r < g.n - (live ? 1 : 0); r++) for (const run of g.runs[r]) if (run) p.conn?.send(this.frame(FRAME_FULL, run));
    const msg = this.roundMsg(g);
    if (p.seat >= 0 && g.seats.includes(p.seat)) msg.you = { len: g.runs[g.n - 1][p.seat]?.len ?? 0, done: !live || g.done[p.seat] };
    this.send(p, msg);
    if (live) for (const run of g.runs[g.n - 1]) if (run && run.seat !== p.seat && run.len) p.conn?.send(this.frame(FRAME_CHUNK, run));
    if (this.phase === 'results' && g.results) this.send(p, g.results);
    if (this.phase === 'podium' && g.podium) this.send(p, g.podium);
  }

  // ---- messages ---------------------------------------------------------------------------

  onMessage(p: Player, m: ClientMsg) {
    const g = this.game, isHost = p.id === this.host;
    switch (m.t) {
      case 'set':
        if (this.phase !== 'lobby') return;
        if (m.name !== undefined) p.name = cleanName(m.name);
        if (typeof m.ready === 'boolean' && p.seat >= 0) p.ready = m.ready;
        if (isInt(m.color, 0, MAX_SEATS - 1) && p.seat >= 0 && !this.players.some((q) => q !== p && q.color === m.color)) p.color = m.color;
        if (isHost) {
          if (isInt(m.arena, 0, ARENAS.length - 1)) this.arena = m.arena;
          if (m.rounds === 0 || isInt(m.rounds, MIN_ROUNDS, MAX_ROUNDS)) this.rounds = m.rounds;
          if (typeof m.double === 'boolean') this.double = m.double;
        }
        this.broadcastRoom();
        return;
      case 'start':
        if (isHost && this.phase === 'lobby') this.newGame();
        return;
      case 'rematch':
        if (isHost && this.phase === 'podium') { this.rematches++; this.toLobby(false); this.newGame(true); if ((this.phase as Phase) === 'lobby') this.broadcastRoom(); }
        return;
      case 'lobby':
        if (isHost && this.phase === 'podium') this.toLobby(true);
        return;
      case 'leave':
        if (this.phase === 'lobby') { const c = p.conn; p.conn = null; c?.close(); this.remove(p); } else if (p.conn) { const c = p.conn; this.drop(p, c); c.close(); }
        return;
      case 'emote':
        if (p.seat >= 0 && isInt(m.e, 0, 3)) this.broadcast({ t: 'emote', seat: p.seat, e: m.e });
        return;
      case 'have':
        if (g && m.n === g.n) g.acks.add(p.id);
        return;
      case 'done': {
        if (!g || this.phase !== 'round' || m.n !== g.n || !g.seats.includes(p.seat) || g.done[p.seat]) return;
        g.done[p.seat] = true;
        // The declared finish tick ranks the player, not the arrival time of this message.
        g.finish[p.seat] = isInt(m.tick, 1, ROUND_TICKS) ? m.tick : -1;
        for (const id of idList(m.st)) g.stomped.set(id, (g.stomped.get(id) ?? 0) + 1);
        for (const id of idList(m.cr)) g.crushed.set(id, (g.crushed.get(id) ?? 0) + 1);
        if (isInt(m.ld, 0, 999)) g.ladders[p.seat] += m.ld;
        if (isInt(m.ko, 0, 999)) g.kos[p.seat] += m.ko;
        this.checkRoundOver();
        return;
      }
    }
  }

  // A piece of a run: stored (it is the future ghost) and relayed to the others (live outline).
  onFrame(p: Player, buf: Uint8Array) {
    const g = this.game;
    if (!g || this.phase !== 'round' || buf.length < 9 || buf[0] !== FRAME_CHUNK || buf[1] !== g.n) return;
    const run = g.runs[g.n - 1][p.seat];
    if (!run || g.done[p.seat] || !decodeRun(buf, run)) return;
    buf[2] = p.seat; // never trust the sender about who they are
    for (const q of this.players) if (q !== p) q.conn?.send(buf);
  }

  // ---- game flow --------------------------------------------------------------------------

  private newGame(rematch = false) {
    const playing = this.players.filter((p) => p.seat >= 0 && p.conn);
    const ready = playing.filter((p) => p.ready || p.id === this.host || rematch);
    if (playing.length < 2 || ready.length < 2) return;
    const seats = playing.map((p) => p.seat).sort((a, b) => a - b);
    // Sides swap at every rematch; with three players the lonely side rotates.
    const r = this.rematches % seats.length, order = seats.slice(r).concat(seats.slice(0, r));
    const side = [0, 0, 0, 0];
    order.forEach((s, i) => (side[s] = i % 2));
    this.game = {
      rematch: this.rematches, n: 0, total: this.rounds || AUTO_ROUNDS[seats.length], tiebreaks: 0, kind: ROUND_NORMAL, startAt: 0,
      seats, side, scores: [0, 0, 0, 0], runs: [], done: [], finish: [], acks: new Set(),
      stomped: new Map(), crushed: new Map(), ladders: [0, 0, 0, 0], kos: [0, 0, 0, 0],
      best: { tick: ROUND_TICKS + 1, seat: -1, round: 0 }, results: null, podium: null,
    };
    this.beginRound();
  }

  private setTimer(ms: number, fn: () => void) { this.timer?.(); this.timer = this.clock.after(ms, fn); }

  private beginRound() {
    const g = this.game!;
    g.n++;
    g.kind = g.n > g.total ? ROUND_TIEBREAK : this.double && g.n === g.total ? ROUND_DOUBLE : ROUND_NORMAL;
    g.done = [true, true, true, true]; g.finish = [-1, -1, -1, -1]; g.acks = new Set();
    const runs: (Run | null)[] = [null, null, null, null];
    for (const s of g.seats) { runs[s] = newRun(s, g.n); g.done[s] = false; }
    g.runs.push(runs);
    g.startAt = this.clock.now() + T.COUNTDOWN; // announced at least 3 s ahead
    this.phase = 'round';
    this.broadcastRoom();
    this.broadcast(this.roundMsg(g));
    this.setTimer(T.COUNTDOWN + T.ROUND + T.GRACE, () => this.endRound());
  }

  // Nothing ever waits for someone absent: only connected players can hold a round open.
  private checkRoundOver() {
    const g = this.game!;
    if (this.phase === 'round' && g.seats.every((s) => g.done[s] || !this.players.some((p) => p.seat === s && p.conn))) this.endRound();
  }

  private endRound() {
    const g = this.game!;
    if (this.phase !== 'round') return;
    this.phase = 'results';
    const arrived = g.seats.filter((s) => g.finish[s] > 0);
    const first = Math.min(...arrived.map((s) => g.finish[s]));
    const mult = g.kind === ROUND_DOUBLE ? 2 : 1;
    const rows = g.seats.map((seat) => {
      const tick = g.finish[seat], pts = tick < 0 ? 0 : (tick === first ? 3 : 1) * mult; // same tick: all first
      g.scores[seat] += pts;
      if (tick > 0 && tick < g.best.tick) g.best = { tick, seat, round: g.n };
      return { seat, tick, pts };
    }).sort((a, b) => (a.tick < 0 ? 1e9 : a.tick) - (b.tick < 0 ? 1e9 : b.tick));
    const top = Math.max(...g.seats.map((s) => g.scores[s]));
    const tied = g.seats.filter((s) => g.scores[s] === top).length > 1;
    const next = g.n < g.total ? 'round' : tied && g.tiebreaks < MAX_TIEBREAKS ? 'tiebreak' : 'podium';
    // The server's copy of each run is the ghost everyone will replay: send it whole.
    for (const run of g.runs[g.n - 1]) if (run) { const f = this.frame(FRAME_FULL, run); for (const p of this.players) p.conn?.send(f); }
    g.results = { t: 'results', n: g.n, kind: g.kind, rows, scores: g.scores, next };
    this.broadcast(g.results);
    this.broadcastRoom();
    const go = () => {
      if (next === 'podium') return this.podium();
      if (next === 'tiebreak') g.tiebreaks++;
      this.beginRound();
    };
    // Before the next round, every connected client must confirm it holds every run, within a deadline.
    this.setTimer(T.RESULTS, () => {
      if (this.players.every((p) => !p.conn || g.acks.has(p.id))) go(); else this.setTimer(T.HAVE, go);
    });
  }

  private podium() {
    const g = this.game!;
    this.phase = 'podium';
    const rank = [...g.seats].sort((a, b) => g.scores[b] - g.scores[a]);
    const awards: Award[] = [];
    const top = (m: Map<number, number>, k: Award['k']) => {
      let best = -1, v = 0;
      for (const [id, n] of m) if (n > v) { v = n; best = id; }
      if (best >= 0) awards.push({ k, seat: best % MAX_SEATS, round: Math.floor(best / MAX_SEATS) + 1, v });
    };
    const most = (a: number[], k: Award['k']) => { const v = Math.max(...a); if (v > 0) awards.push({ k, seat: a.indexOf(v), round: 0, v }); };
    top(g.stomped, 'stomped'); top(g.crushed, 'blocker'); most(g.ladders, 'ladder');
    if (g.best.seat >= 0) awards.push({ k: 'fastest', seat: g.best.seat, round: g.best.round, v: g.best.tick });
    most(g.kos, 'erased');
    g.podium = { t: 'podium', rank, winners: rank.filter((s) => g.scores[s] === g.scores[rank[0]]), scores: g.scores, awards, rounds: g.n, arena: this.arena };
    this.broadcastRoom();
    this.broadcast(g.podium);
    this.setTimer(T.PODIUM, () => this.toLobby(true));
  }

  private toLobby(announce: boolean) {
    this.timer?.(); this.timer = null;
    this.phase = 'lobby'; this.game = null;
    this.players = this.players.filter((p) => p.conn); // seats of the absent are freed
    for (const p of this.players) { p.ready = false; this.seat(p); } // spectators get the free seats
    this.fixHost();
    if (!this.players.length) return this.close();
    if (announce) this.broadcastRoom();
  }
}
