import { describe, it, expect } from 'vitest';
import { P, PW, TILE, EV_DASH, IN_R } from '../src/shared/sim';
import { flat, box, start, play, inputs, still, events, GROUND_Y, FLOOR, type Opts } from './helpers';
import type { Arena } from '../src/shared/arena';

const X0 = 200;
const at = (a: Arena, o: Opts = {}) => start(a, { x: X0, y: GROUND_Y, ...o });

function jumpStats(hold: number) {
  const sim = at(flat());
  let top = sim.y, air = 0;
  for (const i of inputs(`J${hold} .${90 - hold}`)) {
    sim.step(i);
    top = Math.min(top, sim.y);
    if (sim.y < GROUND_Y) air++;
  }
  return { height: GROUND_Y - top, air };
}

// Tries every jump timing (and an optional dash) to climb a ledge `tiles` high standing at column 14.
function canClimb(tiles: number, o: Opts = {}): boolean {
  const a = flat();
  box(a, 14, 19 - tiles, 16, 18);
  const top = FLOOR - tiles * TILE;
  for (let wait = 0; wait < 14; wait++) {
    for (let hold = 4; hold <= 40; hold += 4) {
      for (const dash of [0, 6, 12, 18, 24]) {
        const sim = start(a, { x: 14 * TILE - PW - 20, y: GROUND_Y, ...o });
        for (const i of inputs(`R${wait} RJ${hold} ${dash ? `R${dash} RX1 ` : ''}R30`)) {
          sim.step(i);
          if (sim.grounded && sim.y + 20 === top) return true;
        }
      }
    }
  }
  return false;
}

describe('character feel', () => {
  it('runs at 9 tiles per second, reached in about 0.1 s', () => {
    const sim = play(at(flat()), 'R6');
    expect(sim.vx).toBeCloseTo(P.RUN);
    const x = sim.x;
    play(sim, 'R60');
    expect((sim.x - x) / TILE).toBeCloseTo(9, 0);
  });

  it('stops dead on the ground', () => {
    const sim = play(at(flat()), 'R30');
    const x = sim.x;
    play(sim, '.10');
    expect(sim.vx).toBe(0);
    expect(sim.x - x).toBeLessThanOrEqual(5);
  });

  it('full jump: about 3.4 tiles high and 0.6 s in the air', () => {
    const { height, air } = jumpStats(60);
    expect(height / TILE).toBeGreaterThan(3.2);
    expect(height / TILE).toBeLessThan(3.6);
    expect(air).toBeGreaterThanOrEqual(32);
    expect(air).toBeLessThanOrEqual(40);
  });

  it('jump height follows how long the button is held', () => {
    expect(jumpStats(3).height).toBeLessThan(jumpStats(60).height / 2);
    expect(jumpStats(10).height).toBeLessThan(jumpStats(60).height);
  });

  it('falls faster than it rises', () => {
    const sim = at(flat());
    let up = 0, down = 0, prev = sim.y;
    for (const i of inputs('J60')) { sim.step(i); if (sim.y < prev) up++; else if (sim.y > prev) down++; prev = sim.y; }
    expect(down).toBeLessThan(up);
  });

  it('dash: about 4.5 tiles in 0.15 s, horizontal, one per airtime', () => {
    const sim = play(at(flat()), 'J12');
    const x = sim.x, y = sim.y;
    play(sim, 'JX1 J8');
    expect((sim.x - x) / TILE).toBeCloseTo(4.5, 1);
    expect(sim.y).toBe(y);
    sim.evN = 0;
    play(sim, 'J2 JX1 J3'); // second dash in the same airtime: refused
    expect(events(sim, EV_DASH)).toHaveLength(0);
    play(sim, '.60 X1'); // recharged on the ground
    expect(events(sim, EV_DASH)).toHaveLength(1);
  });

  it('coyote time: can still jump a few ticks after walking off a ledge', () => {
    const a = flat();
    box(a, 10, 8, 12, 18); // tall enough that the jump buffer cannot save a late press
    const run = (late: number) => {
      const sim = start(a, { x: 12 * TILE, y: 8 * TILE - 20 });
      while (sim.grounded) sim.step(IN_R); // first airborne tick
      play(sim, `R${late} RJ4`);
      return sim.vy < 0;
    };
    expect(run(2)).toBe(true);
    expect(run(P.COYOTE + 4)).toBe(false);
  });

  it('jump buffer: a press just before landing still jumps', () => {
    const sim = play(at(flat()), 'J20 .1');
    while (sim.y < GROUND_Y - 6) sim.step(0);
    play(sim, 'J8');
    expect(sim.y).toBeLessThan(GROUND_Y);
    expect(sim.vy).toBeLessThan(0);
  });

  it('corner correction: clipping a ceiling corner by a few pixels does not stop the jump', () => {
    const a = flat();
    box(a, 14, 16, 16, 16);
    const clipped = play(start(a, { x: 14 * TILE - PW + 2, y: GROUND_Y }), 'J20');
    expect(clipped.y).toBeLessThan(16 * TILE);
    const under = play(start(a, { x: 14 * TILE + 8, y: GROUND_Y }), 'J20');
    expect(under.y).toBeGreaterThanOrEqual(17 * TILE);
  });

  it('a 3-tile ledge is climbable alone, a 4-tile one is not (no wall jump, no upward dash)', () => {
    expect(canClimb(3)).toBe(true);
    expect(canClimb(4)).toBe(false);
  });

  it('one own ghost gives one more tile, two stacked give two', () => {
    const gx = 14 * TILE - PW - 20;
    const one = [still(0, gx, GROUND_Y)];
    const two = [...one, still(0, gx, GROUND_Y - 20)];
    expect(canClimb(4, { ghosts: one, y: GROUND_Y - 20 })).toBe(true);
    expect(canClimb(5, { ghosts: one, y: GROUND_Y - 20 })).toBe(false);
    expect(canClimb(5, { ghosts: two, y: GROUND_Y - 40 })).toBe(true);
    expect(canClimb(6, { ghosts: two, y: GROUND_Y - 40 })).toBe(false);
  });

  it('is deterministic: the same inputs give the same trajectory', () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 16;
    const ins = Array.from({ length: 900 }, () => rnd() & 31);
    const a = flat(), g = [still(1, 300, GROUND_Y), still(0, 400, GROUND_Y)];
    const r1 = play(start(a, { ghosts: g }), ins).rec, r2 = play(start(a, { ghosts: g }), ins).rec;
    expect(Array.from(r1.x)).toEqual(Array.from(r2.x));
    expect(Array.from(r1.y)).toEqual(Array.from(r2.y));
    expect(Array.from(r1.f)).toEqual(Array.from(r2.f));
  });
});
