// The logo is stencil lettering: straight strokes on a 4 x 6 grid, no font involved.
// The same strokes feed the in-page SVG and the PNG rasteriser of the link preview.
import { GAME_NAME } from './name';

type Stroke = number[]; // x0, y0, x1, y1, ...
const GLYPHS: Record<string, Stroke[]> = {
  A: [[0, 6, 0, 2, 2, 0, 4, 2, 4, 6], [0, 4, 4, 4]],
  C: [[4, 1, 3, 0, 1, 0, 0, 1, 0, 5, 1, 6, 3, 6, 4, 5]],
  E: [[4, 0, 0, 0, 0, 6, 4, 6], [0, 3, 3, 3]],
  L: [[0, 0, 0, 6, 4, 6]],
  Q: [[1, 0, 3, 0, 4, 1, 4, 5, 3, 6, 1, 6, 0, 5, 0, 1, 1, 0], [2.5, 4.5, 4.6, 6.6]],
  U: [[0, 0, 0, 5, 1, 6, 3, 6, 4, 5, 4, 0]],
};
const ADVANCE = 5.7;

// Polylines of the game's name, in grid units, starting at (0, 0).
export function logoStrokes(text = GAME_NAME.toUpperCase()): { strokes: Stroke[]; width: number; height: number } {
  const strokes: Stroke[] = [];
  [...text].forEach((ch, i) => {
    for (const s of GLYPHS[ch] ?? []) strokes.push(s.map((v, k) => (k % 2 ? v : v + i * ADVANCE)));
  });
  return { strokes, width: (text.length - 1) * ADVANCE + 4, height: 6 };
}

// Three misaligned tracing sheets under one ink line.
export const LOGO_LAYERS: { dx: number; dy: number; color: string; alpha: number }[] = [
  { dx: -0.34, dy: 0.3, color: '#0072B2', alpha: 0.55 },
  { dx: 0.3, dy: -0.26, color: '#D55E00', alpha: 0.55 },
  { dx: 0.12, dy: 0.42, color: '#009E73', alpha: 0.5 },
  { dx: 0, dy: 0, color: '#26221D', alpha: 1 },
];

export function logoSvg(): string {
  const { strokes, width, height } = logoStrokes();
  const path = strokes.map((s) => 'M' + s.map((v, k) => v + (k % 2 ? ' ' : ',')).join('').trim().replace(/ (?=\S)/g, 'L')).join('');
  const layers = LOGO_LAYERS.map((l) => `<path d="${path}" transform="translate(${l.dx} ${l.dy})" stroke="${l.color}" stroke-opacity="${l.alpha}"/>`).join('');
  return `<svg viewBox="-1 -1 ${width + 2} ${height + 2.2}" role="img" aria-label="${GAME_NAME}" fill="none" stroke-width="0.62" stroke-linecap="square" stroke-linejoin="miter">${layers}</svg>`;
}
