// Reference runs: plain timed input sequences for a player starting on the left (side 0).
// They were authored with the route DSL of tests/helpers.ts (drive) and baked with rle().
// base: reaches the goal with no ghost at all.
// setup: a first run that leaves an allied ghost where the shortcut needs it.
// shortcut: reaches the goal faster thanks to that ghost, and fails without it.
import { IN_L, IN_R } from '../src/shared/sim';
import { inputs } from './helpers';

export const ROUTES: Record<string, { base: string; setup: string; shortcut: string }> = {
  // The setup run pauses one second under the first trapdoor, then finishes normally.
  atelier: {
    base: 'R90 RJ12 R13 RJ6 R20 RJ18 R63 RJ14 R13 LJ26 L57 LJ12 L13 R12 RJ20 R52 RJ14 R13 LJ26 L58',
    setup: 'R90 RJ12 R13 RJ6 R20 RJ18 R12 .60 R52 RJ14 R13 LJ26 L57 LJ12 L13 R12 RJ20 R52 RJ14 R13 LJ26 L58',
    shortcut: 'R90 RJ12 R13 RJ6 R20 RJ18 R12 .3 J8 .16 J22 .8 L6 LJ12 L13 R12 RJ20 R53 RJ14 R13 LJ26 L59',
  },
  // The setup run is sacrificed: it waits at the foot of the upper chimney for the whole round.
  colonne: {
    base: 'R27 RJ22 R7 L14 LJ24 L6 R17 RJ24 R6 L17 LJ24 L6 R17 RJ24 R23 RJ12 R162',
    setup: 'R27 RJ22 R7 L14 LJ24 L6 R17 RJ24 R50 .760',
    shortcut: 'R27 RJ22 R7 L14 LJ24 L6 R17 RJ24 R50 J20 .14 RJ30 R140',
  },
  // The setup run stays on the edge of the dock; the shortcut uses it to reach the high walkway
  // and catch the lift one cycle early.
  passerelle: {
    base: 'R49 .11 R13 .133 R22 .56 R10 RJ3 R44 .181 RJ6 R16',
    setup: 'R49 .851',
    shortcut: 'R49 .3 J8 .16 RJ24 R110 .112 RJ6 R16',
  },
};

// Grand shortcuts: two allied ghosts, left by two earlier runs (the second one uses the first).
export const GRAND: Record<string, { setups: [string, string]; run: string }> = {
  // One trace under the first trapdoor, one under the third: two levels are skipped twice.
  atelier: {
    setups: [ROUTES.atelier.setup, 'R90 RJ12 R13 RJ6 R20 RJ18 R12 .3 J8 .16 J22 .8 L6 LJ12 L13 R12 RJ20 R12 L14 .583'],
    run: 'R90 RJ12 R13 RJ6 R20 RJ18 R12 .3 J8 .16 J22 .8 L6 LJ12 L13 R12 RJ20 R12 L14 .3 J8 .16 J22 .8 L9',
  },
  // Two traces stacked at the foot of the column: the low tunnel, five tiles up.
  colonne: {
    setups: ['R27 RJ22 R30 RX1 R23 .797', 'R27 RJ22 R30 RX1 R23 .3 J8 .786'],
    run: 'R27 RJ22 R30 RX1 R23 .3 J14 .6 RJ30 R40 .19 RJ24 R33 RJ24 R2',
  },
};

// The arena is symmetric: a player starting on the right plays the same run with left and right swapped.
export function routeInputs(s: string, side = 0): number[] {
  const ins = inputs(s);
  if (!side) return ins;
  return ins.map((i) => (i & ~(IN_L | IN_R)) | (i & IN_L ? IN_R : 0) | (i & IN_R ? IN_L : 0));
}
