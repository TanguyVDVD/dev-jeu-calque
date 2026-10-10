import { describe, it, expect } from 'vitest';
import { PW, PH, TILE, H, P, F_ON, T_SPIKE, EV_STOMP, EV_KO, EV_RESPAWN, EV_LADDER, EV_GOAL, KO_SPIKE, KO_FALL, IN_J, IN_R, type Run } from '../src/shared/sim';
import { parseArena } from '../src/shared/arena';
import { flat, box, start, play, inputs, record, synth, still, events, insideSolid, GROUND_Y, FLOOR } from './helpers';

const ME = 0, FOE = 1;
const X0 = 200; // well outside the sanctuaries of the test arena

describe('recording and replay', () => {
  it('a ghost occupies exactly its recorded positions, tick by tick, for its owner and for the others', () => {
    let seed = 3;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 16;
    const a = flat();
    const run = record(a, Array.from({ length: 900 }, () => rnd() & 31), { seat: FOE, x: X0, y: GROUND_Y });
    for (const seat of [ME, FOE]) {
      const sim = start(a, { seat, ghosts: [run] });
      for (let t = 0; t < 900; t++) {
        sim.step(rnd() & 31);
        expect(sim.gOn[0]).toBe(run.f[t] & F_ON);
        if (sim.gOn[0]) expect([sim.gx[0], sim.gy[0]]).toEqual([run.x[t], run.y[t]]);
      }
    }
  });

  it('a ghost that reached the goal disappears at that tick; one that did not stays the full 15 s', () => {
    const a = flat();
    const g = a.goal[0];
    box(a, 33, 4, 38, 4); // a ledge under the goal
    const fast = play(start(a, { x: g.x - 40, y: 4 * TILE - PH }), 'R60');
    expect(fast.done).toBe(true);
    expect(fast.finishTick).toBe(fast.rec.len);
    expect(events(fast, EV_GOAL)).toHaveLength(1);
    const slow = play(start(a), '.900');
    expect(slow.finishTick).toBe(-1);
    expect(slow.rec.len).toBe(900);
    const sim = play(start(a, { seat: FOE, ghosts: [fast.rec, slow.rec] }), `.${fast.rec.len + 1}`);
    expect(sim.gOn[0]).toBe(0);
    expect(sim.gOn[1]).toBe(1);
  });
});

describe('my own ghosts are one-way platforms', () => {
  it('I pass through them from the sides and from below, and land on them from above', () => {
    const a = flat();
    const sim = start(a, { x: X0 - 40, y: GROUND_Y, ghosts: [still(ME, X0, GROUND_Y)] });
    play(sim, 'R40');
    expect(sim.x).toBeGreaterThan(X0 + PW); // walked straight through
    const up = play(start(a, { x: X0, y: GROUND_Y, ghosts: [still(ME, X0, GROUND_Y - 30)] }), 'J14');
    expect(up.y).toBeLessThan(GROUND_Y - 30); // jumped through from below
    play(up, '.40');
    expect(up.y).toBe(GROUND_Y - 30 - PH); // and landed on its head
    expect(up.grounded).toBe(true);
  });

  it('down + jump drops through', () => {
    const sim = start(flat(), { x: X0, y: GROUND_Y - 40 - PH, ghosts: [still(ME, X0, GROUND_Y - 40)] });
    play(sim, '.5');
    expect(sim.y).toBe(GROUND_Y - 40 - PH);
    play(sim, 'DJ2 .30');
    expect(sim.y).toBe(GROUND_Y);
  });

  it('they carry me when they move', () => {
    const a = flat();
    const ghost = record(a, '.10 R60 RJ20 R40', { x: X0, y: GROUND_Y });
    const sim = start(a, { x: X0, y: GROUND_Y - PH, ghosts: [ghost] });
    for (let t = 0; t < 130; t++) {
      sim.step(0);
      expect([sim.x, sim.y + PH]).toEqual([ghost.x[t], ghost.y[t]]);
    }
  });

  it('jumping as my ghost jumps goes clearly higher (the leg-up), and counts as one', () => {
    const a = flat();
    const apex = (ghost: Run) => {
      const sim = start(a, { x: X0, y: GROUND_Y - PH, ghosts: [ghost] });
      let top = sim.y;
      for (const i of inputs('.20 J60')) { sim.step(i); top = Math.min(top, sim.y); }
      expect(events(sim, EV_LADDER)).toEqual([0]);
      return GROUND_Y - PH - top;
    };
    const plain = apex(still(ME, X0, GROUND_Y));
    const boosted = apex(record(a, '.20 J60', { x: X0, y: GROUND_Y }));
    expect(boosted - plain).toBeGreaterThan(2 * TILE);
  });

  it('walking off a moving ghost keeps its momentum for a few ticks', () => {
    const a = flat();
    const ghost = synth(ME, 15, (t) => [X0 + 6 * t, GROUND_Y - 60]);
    const jumper = play(start(a, { x: X0, y: GROUND_Y - 60 - PH, ghosts: [ghost] }), '.10 J1');
    expect(jumper.x).toBeGreaterThanOrEqual(X0 + 60);
    expect(jumper.vx).toBeGreaterThan(P.RUN);
    expect(jumper.vx).toBeLessThanOrEqual(P.LIFT_X); // capped
    const dropped = play(start(a, { x: X0, y: GROUND_Y - 60 - PH, ghosts: [ghost] }), '.16'); // the ghost ends under me
    expect(dropped.vx).toBeGreaterThan(P.RUN);
  });

  it('a ghost lifting me into a ceiling never blocks or hurts me: I pass through it', () => {
    const a = flat();
    box(a, 10, 15, 16, 15); // ceiling 28 px above a standing head: room for the ghost, not for both
    const ghost = record(a, '.10 J50', { x: X0, y: GROUND_Y });
    expect(Math.min(...ghost.y.subarray(0, 60))).toBe(16 * TILE);
    const sim = start(a, { x: X0, y: GROUND_Y - PH, ghosts: [ghost] });
    for (let t = 0; t < 60; t++) {
      sim.step(0);
      expect(sim.dead).toBe(0);
      expect(insideSolid(sim)).toBe(false);
    }
    expect(sim.y).toBe(GROUND_Y); // the ghost went up through me; I ended on the floor
  });
});

describe('opposing ghosts are solid bodies', () => {
  it('they block from the sides and from below', () => {
    const a = flat();
    const side = play(start(a, { x: X0 - 60, y: GROUND_Y, ghosts: [still(FOE, X0, GROUND_Y)] }), 'R80');
    expect(side.x).toBe(X0 - PW);
    const below = play(start(a, { x: X0, y: GROUND_Y, ghosts: [still(FOE, X0, GROUND_Y - 30)] }), 'J20');
    expect(below.y).toBeGreaterThanOrEqual(GROUND_Y - 10);
  });

  it('they push me along and hand me their speed: a dashing ghost launches me', () => {
    const a = flat();
    const walker = record(a, 'R60', { seat: FOE, x: X0 - 60, y: GROUND_Y });
    const sim = play(start(a, { x: X0, y: GROUND_Y, ghosts: [walker] }), '.60');
    expect(sim.x).toBeGreaterThanOrEqual(walker.x[59] + PW);
    expect(sim.x).toBeLessThan(walker.x[59] + PW + 4);
    expect(sim.dead).toBe(0);

    const dasher = record(a, 'R10 RX1 R8', { seat: FOE, x: X0 - 80, y: GROUND_Y });
    const hit = start(a, { x: X0, y: GROUND_Y - 30, ghosts: [dasher] }); // airborne: no ground friction
    let fastest = 0;
    for (let t = 0; t < dasher.len; t++) { hit.step(0); fastest = Math.max(fastest, hit.vx); }
    expect(fastest).toBeGreaterThan(P.DASH_V - 1);
  });

  it('pushed against a wall: KO, absent from the recording for 1 s, back on the last firm ground with 0.5 s of invulnerability', () => {
    const a = flat();
    box(a, 16, 14, 16, 18); // wall at x = 256
    const pusher = synth(FOE, 200, (t) => [X0 - 60 + Math.min(t, 49) * 2, GROUND_Y]); // ends 6 px into where I get pinned
    const sim = start(a, { x: 220, y: GROUND_Y, ghosts: [pusher] });
    let koTick = -1;
    for (let t = 0; t < 200 && koTick < 0; t++) { sim.step(0); if (sim.dead) koTick = t; }
    expect(events(sim, EV_KO)).toEqual([0]); // crushed by ghost 0
    sim.evN = 0;
    play(sim, `.${P.KO_T}`);
    expect(events(sim, EV_RESPAWN)).toHaveLength(1);
    expect([sim.x, sim.y]).toEqual([16 * TILE - PW, GROUND_Y]); // where I last stood: against the wall
    expect(sim.invuln).toBe(P.INVULN);
    const f = sim.rec.f;
    expect(f[koTick - 1] & F_ON).toBe(F_ON);
    for (let t = koTick; t < koTick + P.KO_T - 1; t++) expect(f[t] & F_ON).toBe(0);
    expect(f[koTick + P.KO_T] & F_ON).toBe(F_ON);
    // The ghost is still there: while invulnerable it is intangible, then the overlap rule keeps it so.
    play(sim, `.${P.INVULN + 20}`);
    expect(sim.dead).toBe(0);
    expect(sim.lock[0]).toBe(1);
  });

  it('crushed between two opposing ghosts', () => {
    const a = flat();
    const left = synth(FOE, 200, (t) => [X0 - 60 + Math.min(t, 100), GROUND_Y]);
    const sim = start(a, { x: X0 + 30, y: GROUND_Y, ghosts: [left, still(2, X0 + 30 + PW, GROUND_Y)] });
    play(sim, '.120');
    expect(events(sim, EV_KO)).toEqual([0]);
  });

  it('a few pixels of tolerance: clipped by a corner, I am nudged out instead of crushed', () => {
    const a = flat();
    const falling = (dx: number) => synth(FOE, 200, (t) => [X0 + dx, Math.min(GROUND_Y - 100 + t * 3, GROUND_Y)]);
    const clipped = play(start(a, { x: X0, y: GROUND_Y, ghosts: [falling(PW - 3)] }), '.80');
    expect(clipped.dead).toBe(0);
    expect(events(clipped, EV_KO)).toHaveLength(0);
    expect(clipped.x).toBe(X0 - 3);
    const square = play(start(a, { x: X0, y: GROUND_Y, ghosts: [falling(2)] }), '.80');
    expect(events(square, EV_KO)).toEqual([0]);
  });

  it('whoever is on top wins: one falling on my head while I stand on the ground crushes me', () => {
    const a = flat();
    const anvil = synth(FOE, 200, (t) => [X0, Math.min(GROUND_Y - 120 + t * 4, GROUND_Y)]);
    const sim = play(start(a, { x: X0, y: GROUND_Y, ghosts: [anvil] }), '.60');
    expect(events(sim, EV_KO)).toEqual([0]);
    expect(events(sim, EV_STOMP)).toHaveLength(0);
  });

  it('landing on its head: I bounce, my dash is back, and it stops existing for me until the round ends', () => {
    const a = flat();
    const sim = start(a, { x: X0, y: GROUND_Y - 80, ghosts: [still(FOE, X0, GROUND_Y)] });
    sim.dashReady = false; sim.dashCd = 30; // dash already spent in this airtime
    play(sim, '.40');
    expect(events(sim, EV_STOMP)).toEqual([0]);
    expect(sim.neutral[0]).toBe(1);
    expect(sim.dashReady).toBe(true);
    const top = Math.min(...sim.rec.y.subarray(0, sim.tick));
    expect(top).toBeLessThan(GROUND_Y - PH - 2 * TILE); // bounced well above the head
    play(sim, '.60 L60 R60 .10'); // fall back through it and walk across: nothing there any more
    expect(events(sim, EV_STOMP)).toHaveLength(1);
    expect(sim.dead).toBe(0);
    expect(sim.gSolid[0]).toBe(0);
  });

  it('the bounce equals a full jump, and reaches about 4.5 tiles with jump held', () => {
    const a = flat();
    const rise = (ins: string) => {
      const sim = start(a, { x: X0, y: GROUND_Y - 60, ghosts: [still(FOE, X0, GROUND_Y)] });
      let top = sim.y, hit = 0;
      for (const i of inputs(ins)) { sim.step(i); if (sim.neutral[0] && !hit) hit = sim.y; top = Math.min(top, sim.y); }
      return (hit - top) / TILE;
    };
    expect(rise('.90')).toBeGreaterThan(3.1);
    expect(rise('.90')).toBeLessThan(3.6);
    expect(rise('J90')).toBeGreaterThan(4.2);
    expect(rise('J90')).toBeLessThan(4.8);
  });

  it('it rising under my feet is also a contact from above', () => {
    const a = flat();
    const riser = synth(FOE, 100, (t) => [X0, GROUND_Y - Math.min(t * 4, 100)]);
    const sim = play(start(a, { x: X0, y: GROUND_Y - 150, ghosts: [riser] }), '.40');
    expect(events(sim, EV_STOMP)).toEqual([0]);
    expect(sim.dead).toBe(0);
  });

  it('it stays intact for its owner and for third players', () => {
    const a = flat();
    const g = still(FOE, X0, GROUND_Y);
    play(start(a, { x: X0, y: GROUND_Y - 80, ghosts: [g] }), '.60');
    const third = play(start(a, { seat: 2, x: X0 - 60, y: GROUND_Y, ghosts: [g] }), 'R80');
    expect(third.x).toBe(X0 - PW);
    const owner = play(start(a, { seat: FOE, x: X0 - 60, y: GROUND_Y, ghosts: [g] }), 'R80');
    expect(owner.x).toBeGreaterThan(X0);
  });

  it('a position jump is never a sweep: the ghost vanishes and reappears', () => {
    const a = flat();
    const blink = synth(FOE, 200, (t) => (t < 20 ? [X0 - 100, GROUND_Y] : t < 80 ? null : [X0 + (t > 120 ? t - 120 : 0), GROUND_Y]));
    const hop = synth(2, 200, (t) => [t < 30 ? X0 - 40 : X0 + 40, GROUND_Y]); // jumps across me in one tick
    const sim = start(a, { x: X0, y: GROUND_Y, ghosts: [blink, hop] });
    play(sim, '.100');
    expect([sim.x, sim.dead, sim.evN]).toEqual([X0, 0, 0]);
    expect(sim.lock[0]).toBe(1); // reappeared on top of me: intangible until we separate
    play(sim, '.60');
    expect(sim.lock[0]).toBe(0);
    expect(sim.gSolid[0]).toBe(1);
  });
});

describe('safeguards', () => {
  it('sanctuaries: opposing ghosts are intangible around my start and my goal', () => {
    const a = flat();
    const [startZone, goalZone] = a.sanct[0];
    const camper = still(FOE, a.spawn[0].x + 20, GROUND_Y);
    const sim = play(start(a, { ghosts: [camper] }), 'R40');
    expect(sim.x).toBeGreaterThan(camper.x[0] + PW);
    expect(startZone.x + startZone.w).toBeGreaterThan(camper.x[0]);
    const sitter = still(FOE, a.goal[0].x, a.goal[0].y);
    box(a, 33, 4, 38, 4);
    const goal = play(start(a, { x: goalZone.x - 30, y: 4 * TILE - PH, ghosts: [sitter] }), 'R60');
    expect(goal.done).toBe(true);
    // For the other side those zones mean nothing: the same ghost blocks.
    const other = play(start(a, { side: 1, seat: 2, x: 120, y: GROUND_Y, ghosts: [camper] }), 'L80');
    expect(other.x).toBe(camper.x[0] + PW);
  });

  it('overlap rule: a ghost leaving my sanctuary on top of me stays intangible until we separate', () => {
    const a = flat();
    const edge = a.sanct[0][0].x + a.sanct[0][0].w;
    const mate = record(a, 'R100 .100', { seat: FOE }); // same start as me: shared spawn
    const sim = start(a, { ghosts: [mate] });
    for (const i of inputs('R100')) {
      sim.step(i);
      expect(sim.gSolid[0]).toBe(0);
      expect(sim.dead).toBe(0);
    }
    expect(sim.x).toBeGreaterThan(edge);
    expect(sim.lock[0]).toBe(1);
    play(sim, 'L40'); // step away
    expect(sim.lock[0]).toBe(0);
    expect(sim.gSolid[0]).toBe(1);
    play(sim, 'R60'); // now it is a wall
    expect(sim.x).toBe(mate.x[199] - PW);
  });

  it('spikes and falling out of the arena are KOs; the respawn point is firm ground away from danger', () => {
    const rows: string[] = [];
    for (let r = 0; r < 19; r++) rows.push('#' + (r === 3 ? '.G' : r === 18 ? '.S......^' : '').padEnd(19, '.'));
    rows.push('#'.repeat(12) + '.'.repeat(8)); // a pit in the middle of the arena
    const a = parseArena('t', 'name: t\n---\n' + rows.join('\n'));
    expect(a.tiles[18 * 40 + 9]).toBe(T_SPIKE);
    const spiked = play(start(a), 'R80');
    expect(events(spiked, EV_KO)).toEqual([KO_SPIKE]);
    play(spiked, `.${P.KO_T}`);
    expect(spiked.x + PW).toBeLessThanOrEqual(9 * TILE - 8); // not right next to the spikes
    expect(spiked.tileSolid(spiked.x, spiked.y + 1)).toBe(true);

    const fell = start(a, { x: 12 * TILE - 20, y: GROUND_Y });
    play(fell, 'R60');
    expect(events(fell, EV_KO)).toEqual([KO_FALL]);
    play(fell, `.${P.KO_T}`);
    expect(fell.y).toBe(GROUND_Y);
    expect(fell.x + PW / 2).toBeLessThan(12 * TILE);
  });

  it('moving platforms follow a fixed cycle, carry me, and ignore what I do', () => {
    const rows: string[] = [];
    for (let r = 0; r < 19; r++) rows.push('#' + (r === 3 ? '.G' : r === 18 ? '.S' : '').padEnd(19, '.'));
    rows.push('#'.repeat(20));
    const a = parseArena('t', 'name: t\nmover: 6 15 3 4 0 120 0\n---\n' + rows.join('\n'));
    expect(a.movers).toHaveLength(2); // mirrored
    const rider = start(a, { x: 6 * TILE + 10, y: 15 * TILE - PH });
    const idle = start(a);
    for (let t = 0; t < 240; t++) {
      rider.step(0); idle.step(t % 7 ? IN_R : IN_J);
      expect([rider.mx[0], rider.my[0]]).toEqual([idle.mx[0], idle.my[0]]);
      expect(rider.x).toBe(rider.mx[0] + 10);
      expect(rider.y).toBe(15 * TILE - PH);
    }
    play(rider, '.1');
    expect(rider.mx[0]).toBe(6 * TILE); // back where it started after two full cycles
    play(rider, '.30');
    expect(rider.mx[0]).toBe(6 * TILE + 32);
  });

  it('the arena floor is where the test helpers think it is', () => {
    expect(start(flat()).y + PH).toBe(FLOOR);
    expect(H).toBe(320);
  });
});
