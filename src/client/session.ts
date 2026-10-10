// Connection to a room: state mirror, clock sync, run storage, automatic reconnection.
// No DOM here: the browser and the simulated test clients share this file.
import type { Clock } from '../shared/clock';
import { decodeRun, FRAME_FULL } from '../shared/codec';
import { CLOSE_REPLACED, PROTOCOL, T, type ClientMsg, type PodiumMsg, type ResultsMsg, type RoundMsg, type ServerMsg } from '../shared/protocol';
import { HZ, newRun, type Run } from '../shared/sim';

export type RoomMsg = Extract<ServerMsg, { t: 'room' }>;
export interface Store { get(k: string): string | null; set(k: string, v: string): void }
export interface SessionOpts {
  url: string; WS: any; clock: Clock; store?: Store;
  delay?: number; // artificial one-way latency in ms (tests)
  copy?: boolean; // copy outgoing frames (needed where send() does not copy synchronously)
}
export interface Handlers {
  room?(m: RoomMsg): void; round?(m: RoundMsg): void; results?(m: ResultsMsg): void; podium?(m: PodiumMsg): void;
  emote?(seat: number, e: number): void; error?(code: string): void; status?(online: boolean): void;
}

export class Session {
  room: RoomMsg | null = null; id = -1; token = ''; code = '';
  offset = 0; rtt = Infinity; online = false;
  runs: (Run | null)[][] = []; // runs[round - 1][seat]
  round: RoundMsg | null = null; results: ResultsMsg | null = null; podium: PodiumMsg | null = null;
  on: Handlers = {};
  private ws: any = null; private name = ''; private stopped = false; private retries = 0;
  private best = Infinity; private cancelPing: (() => void) | null = null;

  constructor(private o: SessionOpts) {}

  get seat(): number { return this.room?.players.find((p) => p.id === this.id)?.seat ?? -1; }
  get isHost(): boolean { return !!this.room && this.room.host === this.id; }

  // Server time, and the current tick of the round clock (negative during the countdown).
  now(): number { return this.o.clock.now() + this.offset; }
  tick(): number { return this.round ? Math.floor(((this.now() - this.round.startAt) * HZ) / 1000) : 0; }

  // Every finished run of the previous rounds: the ghosts of the current one.
  ghosts(): Run[] {
    const out: Run[] = [], n = this.round ? this.round.n - 1 : this.runs.length;
    for (let r = 0; r < n; r++) for (const run of this.runs[r] ?? []) if (run && run.len) out.push(run);
    return out;
  }

  connect(name: string, code = '') {
    this.name = name; this.code = code.toUpperCase(); this.stopped = false;
    this.token = (this.code && this.o.store?.get('seat:' + this.code)) || '';
    this.open();
  }

  private open() {
    const ws = (this.ws = new this.o.WS(this.o.url));
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => {
      this.best = Infinity;
      this.send({ t: 'join', v: PROTOCOL, name: this.name, code: this.code || undefined, token: this.token || undefined });
      this.pings(6);
    };
    ws.onmessage = (ev: { data: string | ArrayBuffer }) => {
      if (ws !== this.ws) return;
      const d = ev.data;
      if (this.o.delay) this.o.clock.after(this.o.delay, () => this.receive(d)); else this.receive(d);
    };
    ws.onclose = (ev: { code?: number }) => {
      if (ws !== this.ws) return;
      this.cancelPing?.();
      // The same seat was opened elsewhere (second tab): give up instead of fighting over it.
      if (ev?.code === CLOSE_REPLACED && !this.stopped) { this.stopped = true; this.online = false; this.on.error?.('taken'); return; }
      if (this.online) { this.online = false; this.on.status?.(false); }
      // The seat is kept server-side: come back with the token and get a full resync.
      if (!this.stopped) this.o.clock.after(Math.min(400 * 2 ** this.retries++, 3000), () => { if (!this.stopped) this.open(); });
    };
    ws.onerror = () => {};
  }

  // A few quick pings to settle the clock offset, then the regular heartbeat.
  private pings(quick: number) {
    this.cancelPing?.();
    this.send({ t: 'ping', c: this.o.clock.now() });
    this.cancelPing = this.o.clock.after(quick > 0 ? 150 : T.PING, () => this.pings(quick - 1));
  }

  private receive(d: string | ArrayBuffer) {
    if (typeof d !== 'string') {
      const buf = new Uint8Array(d), r = buf[1] - 1, seat = buf[2];
      if (buf.length < 9 || r < 0 || r > 20 || seat > 3) return;
      const row = (this.runs[r] ??= [null, null, null, null]);
      const run = (row[seat] ??= newRun(seat, r + 1));
      if (buf[0] === FRAME_FULL) run.len = 0; // authoritative copy: replaces whatever was there
      decodeRun(buf, run);
      return;
    }
    let m: ServerMsg;
    try { m = JSON.parse(d); } catch { return; }
    switch (m.t) {
      case 'pong': {
        const now = this.o.clock.now(), rtt = now - m.c;
        this.best *= 1.1; // old measurements fade, so the estimate follows clock drift
        if (rtt <= this.best) { this.best = this.rtt = rtt; this.offset = m.s - (m.c + rtt / 2); }
        return;
      }
      case 'hi':
        this.id = m.id; this.token = m.token; this.code = m.code; this.retries = 0;
        this.o.store?.set('seat:' + m.code, m.token);
        this.online = true; this.on.status?.(true);
        return;
      case 'room': this.room = m; this.on.room?.(m); return;
      case 'round': {
        this.round = m; this.results = null; this.podium = null;
        if (m.n === 1) this.runs = [];
        const row = (this.runs[m.n - 1] = [null, null, null, null] as (Run | null)[]);
        for (const s of m.seats) row[s.seat] = newRun(s.seat, m.n);
        this.on.round?.(m);
        return;
      }
      case 'results':
        this.results = m;
        this.send({ t: 'have', n: m.n }); // frames arrive in order before this message: every run is here
        this.on.results?.(m);
        return;
      case 'podium': this.podium = m; this.on.podium?.(m); return;
      case 'emote': this.on.emote?.(m.seat, m.e); return;
      case 'err':
        if (m.code !== 'bad') { this.stopped = true; this.ws?.close(); }
        this.on.error?.(m.code);
        return;
    }
  }

  private raw(d: string | Uint8Array) {
    const ws = this.ws;
    if (!ws || ws.readyState !== 1) return;
    if (this.o.delay) this.o.clock.after(this.o.delay, () => { if (ws.readyState === 1) ws.send(d); }); else ws.send(d);
  }
  send(m: ClientMsg) { this.raw(JSON.stringify(m)); }
  sendBin(b: Uint8Array) { this.raw(this.o.copy || this.o.delay ? b.slice() : b); }

  leave() {
    this.stopped = true;
    this.send({ t: 'leave' });
    this.cancelPing?.();
    this.ws?.close();
    this.room = null; this.round = null; this.results = null; this.podium = null; this.runs = [];
  }

  // Simulates a network loss (tests, and the "connection lost" path): the session reconnects by itself.
  cut() { this.ws?.close(); }
}
