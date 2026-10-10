import { parseArena, type Arena } from '../src/shared/arena';
import { Sim, newRun, COLS, PH, F_ON, T_SOLID, IN_L, IN_R, IN_D, IN_J, IN_X, type Run } from '../src/shared/sim';

export const FLOOR = 304; // top of the floor row in the test arena
export const GROUND_Y = FLOOR - PH;

// An empty box: walls, a floor, start bottom-left, goal out of reach top-right.
export function flat(): Arena {
  const rows: string[] = [];
  for (let r = 0; r < 19; r++) rows.push('#' + (r === 3 ? '.G' : r === 18 ? '.S' : '').padEnd(19, '.'));
  rows.push('#'.repeat(20));
  return parseArena('test', 'name: test\n---\n' + rows.join('\n'));
}

export function box(a: Arena, c0: number, r0: number, c1 = c0, r1 = r0, t = T_SOLID) {
  for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) a.tiles[r * COLS + c] = t;
}

const BITS: Record<string, number> = { L: IN_L, R: IN_R, D: IN_D, J: IN_J, X: IN_X, '.': 0 };

// "R30 RJ12 .5" -> 30 ticks right, 12 ticks right+jump, 5 ticks idle
export function inputs(s: string): number[] {
  const out: number[] = [];
  for (const tok of s.trim().split(/\s+/)) {
    const m = /^([LRDJX.]+)(\d*)$/.exec(tok);
    if (!m) throw new Error(`bad input token "${tok}"`);
    let bits = 0;
    for (const ch of m[1]) bits |= BITS[ch];
    for (let i = Number(m[2] || 1); i > 0; i--) out.push(bits);
  }
  return out;
}

export interface Opts { seat?: number; side?: number; ghosts?: Run[]; x?: number; y?: number; round?: number }

export function start(arena: Arena, o: Opts = {}): Sim {
  const sim = new Sim();
  sim.reset(arena, o.seat ?? 0, o.side ?? 0, o.ghosts ?? [], o.round ?? 0);
  if (o.x !== undefined) sim.x = sim.px = sim.safeX = o.x;
  if (o.y !== undefined) sim.y = sim.py = sim.safeY = o.y;
  return sim;
}

export function play(sim: Sim, ins: string | number[]): Sim {
  for (const i of typeof ins === 'string' ? inputs(ins) : ins) sim.step(i);
  return sim;
}

export const record = (arena: Arena, ins: string | number[], o: Opts = {}): Run => play(start(arena, o), ins).rec;

// A hand-made recording: fn returns the position at tick t, or null when absent.
export function synth(seat: number, len: number, fn: (t: number) => [number, number] | null, round = 0): Run {
  const run = newRun(seat, round);
  for (let t = 0; t < len; t++) {
    const p = fn(t);
    if (p) { run.x[t] = p[0]; run.y[t] = p[1]; run.f[t] = F_ON; }
  }
  run.len = len;
  return run;
}

export const still = (seat: number, x: number, y: number, len = 900) => synth(seat, len, () => [x, y]);

export function events(sim: Sim, type: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < sim.evN; i += 2) if (sim.ev[i] === type) out.push(sim.ev[i + 1]);
  return out;
}

export function insideSolid(sim: Sim): boolean {
  return sim.tileSolid(sim.x, sim.y) || sim.ghostHit(sim.x, sim.y) >= 0;
}
