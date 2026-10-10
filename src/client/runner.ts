// Runs the local player's simulation against the round clock and streams the recording.
// Nothing here waits for the network: the ghosts are known in advance and living rivals are intangible.
import { ARENAS, type Arena } from '../shared/arena';
import { encodeRun, FRAME_CHUNK, MAX_FRAME } from '../shared/codec';
import { ghostId, type RoundMsg } from '../shared/protocol';
import { Sim, ROUND_TICKS, EV_STOMP, EV_KO, EV_LADDER, type Run } from '../shared/sim';
import type { Session } from './session';

export const CATCHUP = 10; // ticks of lag replayed with the current inputs; older ones get neutral inputs
const CHUNK = 3; // ticks per network frame: 50 ms

export class Runner {
  sim = new Sim();
  sent = 0; reported = false;
  stomps = new Int16Array(64); nStomps = 0; crushes = new Int16Array(64); nCrushes = 0; ladders = 0; kos = 0;
  onEvent: ((type: number, arg: number) => void) | null = null;
  private buf = new Uint8Array(MAX_FRAME);

  constructor(private session: Session | null, arena: Arena, seat: number, side: number, ghosts: Run[], readonly round: number) {
    this.sim.reset(arena, seat, side, ghosts, round);
  }

  // After a reconnection: the server says how much of this run it already holds.
  resume(len: number, done: boolean) { this.sent = Math.min(len, this.sim.rec.len); this.reported = done; }

  // Brings the simulation up to `clockTick`. A late client simulates the missing ticks at once and never
  // plays in slow motion; `exact` (scripted players) feeds the real input of every tick instead of neutral ones.
  update(clockTick: number, input: (tick: number) => number, exact = false) {
    const sim = this.sim, target = Math.min(clockTick, ROUND_TICKS);
    while (sim.tick < target && !sim.done) {
      sim.step(!exact && target - sim.tick > CATCHUP ? 0 : input(sim.tick));
      for (let i = 0; i < sim.evN; i += 2) {
        const type = sim.ev[i], arg = sim.ev[i + 1];
        if (type === EV_STOMP && this.nStomps < 64) this.stomps[this.nStomps++] = ghostId(sim.ghosts[arg].round, sim.ghosts[arg].seat);
        else if (type === EV_KO) { this.kos++; if (arg >= 0 && this.nCrushes < 64) this.crushes[this.nCrushes++] = ghostId(sim.ghosts[arg].round, sim.ghosts[arg].seat); }
        else if (type === EV_LADDER) this.ladders++;
        this.onEvent?.(type, arg);
      }
      sim.evN = 0;
    }
    const s = this.session, len = sim.rec.len;
    if (!s) return;
    if (len - this.sent >= CHUNK || (sim.done && len > this.sent)) {
      s.sendBin(this.buf.subarray(0, encodeRun(FRAME_CHUNK, sim.rec, this.sent, len, this.buf)));
      this.sent = len;
    }
    if (sim.done && !this.reported) {
      this.reported = true;
      s.send({ t: 'done', n: this.round, tick: sim.finishTick, st: Array.from(this.stomps.subarray(0, this.nStomps)), cr: Array.from(this.crushes.subarray(0, this.nCrushes)), ld: this.ladders, ko: this.kos });
    }
  }
}

// Decides what the local client does with a round announcement.
// `m.you` is only present on a resync: with the round's runner still alive (the page survived the
// network cut) the run simply continues; without it the run cannot be resumed, so we sit this one out.
export function runnerFor(s: Session, m: RoundMsg, prev: Runner | null): Runner | null {
  const me = m.seats.find((x) => x.seat === s.seat);
  if (!me) return null; // spectator
  if (m.you) {
    if (prev && prev.round === m.n) { prev.resume(m.you.len, m.you.done); return prev; }
    if (!m.you.done) s.send({ t: 'done', n: m.n, tick: -1, st: [], cr: [], ld: 0, ko: 0 });
    return null;
  }
  return new Runner(s, ARENAS[m.arena], me.seat, me.side, s.ghosts(), m.n);
}
