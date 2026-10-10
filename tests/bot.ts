// A simulated client: the real Session and Runner, the real simulation, scripted inputs.
import WebSocket from 'ws';
import { ARENAS } from '../src/shared/arena';
import type { Clock } from '../src/shared/clock';
import type { PodiumMsg, ResultsMsg, RoundMsg } from '../src/shared/protocol';
import type { Run } from '../src/shared/sim';
import { Runner, runnerFor } from '../src/client/runner';
import { Session, type SessionOpts } from '../src/client/session';
import { ROUTES, routeInputs } from './routes';

export const base = (m: RoundMsg, side: number) => routeInputs(ROUTES[ARENAS[m.arena].id].base, side);
export const idle = () => [] as number[];

export class Bot {
  s: Session; runner: Runner | null = null;
  rounds: RoundMsg[] = []; results: ResultsMsg[] = []; podiums: PodiumMsg[] = []; errors: string[] = [];
  recs: Run[] = []; // my own local recordings, one per round I played
  ghostCounts: number[] = [];
  plan: (m: RoundMsg, side: number) => number[] = base;
  exact = true; // false: behave like a keyboard player (neutral inputs when catching up)
  asked = 0; // how many ticks asked for an input
  stalledUntil = 0;
  private ins: number[] = [];
  private timer: ReturnType<typeof setInterval>;

  constructor(url: string, readonly name: string, clock: Clock, o: Partial<SessionOpts> = {}) {
    this.s = new Session({ url, WS: WebSocket, clock, copy: true, ...o });
    this.s.on.round = (m) => {
      this.rounds.push(m);
      const prev = this.runner;
      this.runner = runnerFor(this.s, m, prev);
      if (this.runner && this.runner !== prev) {
        this.ins = this.plan(m, this.runner.sim.side);
        this.ghostCounts.push(this.runner.sim.n);
      }
    };
    this.s.on.results = (m) => this.results.push(m);
    this.s.on.podium = (m) => this.podiums.push(m);
    this.s.on.error = (c) => this.errors.push(c);
    this.timer = setInterval(() => this.frame(), 1);
  }

  private frame() {
    const r = this.runner, round = this.s.round;
    if (!r || !round || r.round !== round.n || Date.now() < this.stalledUntil) return;
    const was = r.sim.done;
    r.update(this.s.tick(), (t) => { this.asked++; return this.ins[t] ?? 0; }, this.exact);
    if (!was && r.sim.done) this.recs.push(r.sim.rec);
  }

  join(code = '') { this.s.connect(this.name, code); return this; }
  stall(realMs: number) { this.stalledUntil = Date.now() + realMs; }
  kill() { clearInterval(this.timer); (this.s as any).stopped = true; this.s.cut(); } // the tab dies, no goodbye
  stop() { clearInterval(this.timer); this.s.leave(); }
}

export async function until(cond: () => boolean, what: string, ms = 25000) {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error('timeout waiting for ' + what);
    await new Promise((r) => setTimeout(r, 3));
  }
}

export function sameRun(a: Run | null | undefined, b: Run | null | undefined): boolean {
  if (!a || !b || a.len !== b.len || a.seat !== b.seat) return false;
  for (let t = 0; t < a.len; t++) if (a.x[t] !== b.x[t] || a.y[t] !== b.y[t] || a.f[t] !== b.f[t]) return false;
  return true;
}
