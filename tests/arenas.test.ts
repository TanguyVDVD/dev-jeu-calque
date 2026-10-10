import { describe, it, expect } from 'vitest';
import { ARENAS } from '../src/shared/arena';
import { COLS, ROWS, W, H, PW, HZ, T_SOLID, T_SPIKE, type Run } from '../src/shared/sim';
import { start, play } from './helpers';
import { GRAND, ROUTES, routeInputs } from './routes';

describe('arenas', () => {
  it('there are three, each with reference runs', () => {
    expect(ARENAS.map((a) => a.id)).toEqual(['atelier', 'colonne', 'passerelle']);
    for (const a of ARENAS) expect(ROUTES[a.id]).toBeDefined();
  });

  for (const a of ARENAS) {
    describe(a.name, () => {
      const r = ROUTES[a.id];

      it('is left-right symmetric: tiles, starts, goals, sanctuaries, movers', () => {
        for (let row = 0; row < ROWS; row++) for (let c = 0; c < COLS; c++) expect(a.tiles[row * COLS + c]).toBe(a.tiles[row * COLS + COLS - 1 - c]);
        expect(a.spawn[1]).toEqual({ x: W - a.spawn[0].x - PW, y: a.spawn[0].y });
        const mir = (z: { x: number; y: number; w: number; h: number }) => ({ ...z, x: W - z.x - z.w });
        expect(a.goal[1]).toEqual(mir(a.goal[0]));
        expect(a.sanct[1]).toEqual(a.sanct[0].map(mir));
        expect(a.movers.length % 2).toBe(0);
        for (let i = 0; i < a.movers.length; i += 2) expect(a.movers[i + 1]).toEqual({ ...a.movers[i], x: W - a.movers[i].x - a.movers[i].w, dx: -a.movers[i].dx });
      });

      it('each player starts low on one side and aims high on the other', () => {
        expect(a.spawn[0].x).toBeLessThan(W / 4);
        expect(a.goal[0].x).toBeGreaterThan(W / 2);
        expect(a.goal[0].y).toBeLessThan(a.spawn[0].y - 4 * 16);
      });

      it('base route: reaches the goal with no ghost in under 11 s, from either side', () => {
        const left = play(start(a), routeInputs(r.base));
        expect(left.finishTick).toBeGreaterThan(0);
        expect(left.finishTick).toBeLessThan(11 * HZ);
        const right = play(start(a, { side: 1, seat: 1 }), routeInputs(r.base, 1));
        expect(right.finishTick).toBe(left.finishTick); // equity by construction
        console.log(`${a.name}: base ${(left.finishTick / HZ).toFixed(2)} s`);
      });

      it('shortcut: faster thanks to an allied ghost left by a first run, impossible without it', () => {
        const base = play(start(a), routeInputs(r.base)).finishTick;
        const setup = play(start(a), routeInputs(r.setup)).rec;
        const sc = play(start(a, { ghosts: [setup] }), routeInputs(r.shortcut));
        expect(sc.finishTick).toBeGreaterThan(0);
        expect(sc.finishTick).toBeLessThan(base);
        const alone = play(start(a), routeInputs(r.shortcut));
        expect(alone.finishTick === -1 || alone.finishTick > base).toBe(true);
        console.log(`${a.name}: shortcut ${(sc.finishTick / HZ).toFixed(2)} s (gain ${((base - sc.finishTick) / HZ).toFixed(2)} s)`);
      });

      const grand = GRAND[a.id];
      if (grand) it('grand shortcut: needs two allied ghosts, and beats the one-ghost shortcut', () => {
        const base = play(start(a), routeInputs(r.base)).finishTick;
        const one = play(start(a, { ghosts: [play(start(a), routeInputs(r.setup)).rec] }), routeInputs(r.shortcut)).finishTick;
        const g1 = play(start(a, { round: 1 }), routeInputs(grand.setups[0])).rec;
        const g2 = play(start(a, { ghosts: [g1], round: 2 }), routeInputs(grand.setups[1])).rec;
        const run = play(start(a, { ghosts: [g1, g2], round: 3 }), routeInputs(grand.run));
        expect(run.finishTick).toBeGreaterThan(0);
        expect(run.finishTick).toBeLessThan(one);
        for (const ghosts of [[], [g1]]) expect(play(start(a, { ghosts }), routeInputs(grand.run)).finishTick).toBe(-1);
        console.log(`${a.name}: grand shortcut ${(run.finishTick / HZ).toFixed(2)} s (gain ${((base - run.finishTick) / HZ).toFixed(2)} s)`);
      });
    });
  }
});

describe('robustness', () => {
  it('random inputs among random ghosts: never inside a tile or a solid ghost, never out of bounds, never stuck', () => {
    let seed = 20240607;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 8) % n;
    let ticks = 0, kos = 0, stomps = 0;
    for (const a of ARENAS) {
      const ghosts: Run[] = [];
      for (let round = 0; round < 6; round++) {
        const recs: Run[] = [];
        for (let seat = 0; seat < 4; seat++) {
          const sim = start(a, { seat, side: seat & 1, ghosts, round });
          let inp = 0, hold = 0, lastMove = 0, lx = sim.x, ly = sim.y;
          while (!sim.done) {
            if (hold-- <= 0) { inp = rnd(32); if (rnd(3)) inp &= ~4; hold = rnd(40); }
            sim.step(inp);
            ticks++;
            if (sim.x !== lx || sim.y !== ly) { lastMove = sim.tick; lx = sim.x; ly = sim.y; }
            if (sim.dead) continue;
            expect(sim.x).toBeGreaterThanOrEqual(0);
            expect(sim.x + PW).toBeLessThanOrEqual(W);
            expect(sim.y).toBeGreaterThanOrEqual(0);
            expect(sim.y).toBeLessThanOrEqual(H + 20);
            if (sim.tileSolid(sim.x, sim.y) || sim.ghostHit(sim.x, sim.y) >= 0) {
              throw new Error(`${a.id} round ${round} seat ${seat} tick ${sim.tick}: inside a solid at ${sim.x},${sim.y}`);
            }
          }
          for (let i = 0; i < sim.evN; i += 2) { if (sim.ev[i] === 5) kos++; if (sim.ev[i] === 4) stomps++; }
          // Not stuck: random inputs kept moving the player until the end.
          expect(sim.tick - lastMove).toBeLessThan(400);
          recs.push(sim.rec);
        }
        ghosts.push(...recs);
      }
    }
    console.log(`fuzz: ${ticks} ticks, up to 20 ghosts, ${kos}+ KO, ${stomps}+ stomps seen in the last ticks`);
    expect(ticks).toBeGreaterThan(40000);
  });

  it('dangers exist only as spikes and the void: the grid has nothing else', () => {
    for (const a of ARENAS) for (const t of a.tiles) expect([0, T_SOLID, T_SPIKE, 3]).toContain(t);
  });
});
