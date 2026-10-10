// Arenas are plain text files: only the left half is described, the right half is its mirror.
import { COLS, ROWS, TILE, W, PH, T_SOLID, T_SPIKE, T_ONEWAY } from './sim';

export interface Rect { x: number; y: number; w: number; h: number }
export interface Mover { x: number; y: number; w: number; dx: number; dy: number; period: number; phase: number }
export interface Arena {
  id: string; name: string; tiles: Uint8Array;
  spawn: [{ x: number; y: number }, { x: number; y: number }]; // per side: 0 = left, 1 = right
  goal: [Rect, Rect];
  sanct: [Rect[], Rect[]];
  movers: Mover[];
}

const HALF = COLS / 2;
const mirror = (r: Rect): Rect => ({ x: W - r.x - r.w, y: r.y, w: r.w, h: r.h });
const zone = (c: number, r: number, up: number): Rect => {
  const c0 = Math.max(c - 2, 0), r0 = Math.max(r - up, 0);
  return { x: c0 * TILE, y: r0 * TILE, w: (Math.min(c + 2, HALF - 1) - c0 + 1) * TILE, h: (r - r0 + 1) * TILE };
};

export function parseArena(id: string, src: string): Arena {
  const [head, body] = src.replace(/\r/g, '').split(/\n---\n/);
  if (body === undefined) throw new Error(`${id}: missing --- separator`);
  const rows = body.split('\n').filter((l) => l.length > 0);
  if (rows.length !== ROWS || rows.some((l) => l.length !== HALF)) throw new Error(`${id}: grid must be ${ROWS} rows of ${HALF} characters`);
  let name = id;
  const movers: Mover[] = [];
  for (const line of head.split('\n')) {
    const m = /^(\w+):\s*(.*?)\s*(#.*)?$/.exec(line);
    if (!m) continue;
    if (m[1] === 'name') name = m[2];
    if (m[1] === 'mover') {
      // x y w dx dy period phase — tiles and ticks; y is the row whose top edge is the platform surface
      const [x, y, w, dx, dy, period, phase = 0] = m[2].split(/\s+/).map(Number);
      if (![x, y, w, dx, dy, period, phase].every(Number.isFinite) || period < 2 || period % 2) throw new Error(`${id}: bad mover "${m[2]}"`);
      const mv = { x: x * TILE, y: y * TILE, w: w * TILE, dx: dx * TILE, dy: dy * TILE, period, phase };
      movers.push(mv, { ...mv, x: W - mv.x - mv.w, dx: -mv.dx });
    }
  }
  const tiles = new Uint8Array(COLS * ROWS);
  let start: Rect | null = null, startZone: Rect | null = null, goal: Rect | null = null, goalZone: Rect | null = null;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < HALF; c++) {
      const ch = rows[r][c];
      const t = ch === '#' ? T_SOLID : ch === '^' ? T_SPIKE : ch === '=' ? T_ONEWAY : 0;
      tiles[r * COLS + c] = tiles[r * COLS + COLS - 1 - c] = t;
      if (ch === 'S') { start = { x: c * TILE + 2, y: (r + 1) * TILE - PH, w: 0, h: 0 }; startZone = zone(c, r, 2); }
      if (ch === 'G') { goal = { x: c * TILE - 4, y: r * TILE - TILE, w: 24, h: 32 }; goalZone = zone(c, r, 3); }
    }
  }
  if (!start || !goal || !startZone || !goalZone) throw new Error(`${id}: needs one S and one G`);
  // S is the left players' start; G (drawn on the left) is the goal of the players starting on the right.
  const rs = mirror({ ...start, w: 12 });
  return {
    id, name, tiles, movers,
    spawn: [{ x: start.x, y: start.y }, { x: rs.x, y: rs.y }],
    goal: [mirror(goal), goal],
    sanct: [[startZone, mirror(goalZone)], [mirror(startZone), goalZone]],
  };
}

const files = import.meta.glob('./arenas/*.txt', { query: '?raw', eager: true, import: 'default' }) as Record<string, string>;

export const ARENAS: Arena[] = Object.keys(files).sort().map((path) => parseArena(path.replace(/^.*\/\d*-?|\.txt$/g, ''), files[path]));
