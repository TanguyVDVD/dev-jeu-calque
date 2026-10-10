// The four "how to play" vignettes. Nothing is faked: each one is a tiny arena, recorded ghosts and a
// scripted player, run by the real simulation and drawn by the real renderer.
import { parseArena, type Arena } from '../shared/arena';
import { Sim, HZ, parseInputs, type Run } from '../shared/sim';
import type { Stage } from './game';
import { View, type Scene } from './render';

export interface DemoSpec {
  rows: Record<number, string>; // left-half rows that differ from an empty box
  crop: { x: number; y: number; w: number; h: number };
  start: [number, number];
  ghosts: { seat: number; at: [number, number]; ins: string }[];
  ins: string; len: number;
}

const FLOOR_Y = 284; // standing on the floor of the box
export const DEMOS: DemoSpec[] = [
  { // Your traces carry you: a ledge one tile too high, and your own head as a step.
    rows: { 15: '#...........###.....', 16: '#...........###.....', 17: '#...........###.....', 18: '#.S.........###.....' },
    crop: { x: 96, y: 200, w: 180, h: 120 }, start: [112, FLOOR_Y],
    ghosts: [{ seat: 0, at: [180, FLOOR_Y], ins: '.400' }],
    ins: '.25 R22 RJ7 R6 .14 RJ22 R14 .50', len: 200,
  },
  { // Other people's traces block and push.
    rows: {},
    crop: { x: 232, y: 200, w: 180, h: 120 }, start: [256, FLOOR_Y],
    ghosts: [{ seat: 1, at: [352, FLOOR_Y], ins: '.60 L45 .200' }],
    ins: '.15 R40 .200', len: 190,
  },
  { // Land on their head: you bounce, and that trace is gone for you.
    rows: {},
    crop: { x: 232, y: 200, w: 180, h: 120 }, start: [246, FLOOR_Y],
    ghosts: [{ seat: 1, at: [318, FLOOR_Y], ins: '.400' }],
    ins: '.20 R10 RJ5 R16 .30 L42 .60', len: 200,
  },
  { // First to the goal.
    rows: { 18: '#.S..G..............' },
    crop: { x: 440, y: 200, w: 180, h: 120 }, start: [452, FLOOR_Y],
    ghosts: [{ seat: 1, at: [444, FLOOR_Y], ins: '.50 R80' }],
    ins: '.25 R60', len: 150,
  },
];

export function buildDemo(d: DemoSpec): { arena: Arena; ghosts: Run[]; ins: number[] } {
  const rows: string[] = [];
  for (let r = 0; r < 19; r++) rows.push(d.rows[r] ?? '#' + (r === 3 ? '.G' : r === 18 ? '.S' : '').padEnd(19, '.'));
  rows.push('#'.repeat(20));
  const arena = parseArena('demo', 'name: demo\n---\n' + rows.join('\n'));
  const ghosts = d.ghosts.map((g, i) => {
    const sim = new Sim();
    sim.reset(arena, g.seat, 0, [], i + 1);
    sim.x = sim.px = sim.safeX = g.at[0]; sim.y = sim.py = sim.safeY = g.at[1];
    for (const k of parseInputs(g.ins)) sim.step(k);
    return sim.rec;
  });
  return { arena, ghosts, ins: parseInputs(d.ins) };
}

export function startDemo(sim: Sim, d: DemoSpec, arena: Arena, ghosts: Run[]) {
  sim.reset(arena, 0, 0, ghosts, d.ghosts.length + 1);
  sim.x = sim.px = sim.safeX = d.start[0]; sim.y = sim.py = sim.safeY = d.start[1];
}

export class Demo implements Stage {
  view: View;
  private sim = new Sim(); private scene: Scene; private ins: number[]; private t0 = performance.now(); private arena: Arena; private ghosts: Run[];
  constructor(canvas: HTMLCanvasElement, private spec: DemoSpec) {
    const b = buildDemo(spec);
    this.arena = b.arena; this.ghosts = b.ghosts; this.ins = b.ins;
    this.view = new View(canvas, spec.crop);
    this.view.setArena(b.arena, 0, 0);
    this.scene = { arena: b.arena, k: -1, a: 0, ghosts: b.ghosts, sim: this.sim, seat: 0, colors: [0, 1, 2, 3], live: null, newRound: 0, trail: 0 };
    startDemo(this.sim, spec, this.arena, this.ghosts);
  }
  frame(now: number) {
    const T = (((now - this.t0) * HZ) / 1000) % this.spec.len, tick = Math.floor(T), sim = this.sim;
    if (tick < sim.tick) startDemo(sim, this.spec, this.arena, this.ghosts);
    while (sim.tick < tick && !sim.done) {
      sim.step(this.ins[sim.tick] ?? 0);
      for (let i = 0; i < sim.evN; i += 2) this.view.fx(sim.ev[i], sim);
      sim.evN = 0;
    }
    this.scene.k = tick - 1; this.scene.a = T - tick;
    this.view.draw(this.scene);
  }
}
