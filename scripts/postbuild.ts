// After `vite build`: draws the link-preview image (no font, no browser: a tiny rasteriser and a PNG
// encoder), then precompresses every text asset with Brotli and gzip.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { brotliCompressSync, constants, deflateSync, gzipSync } from 'node:zlib';
import { LOGO_LAYERS, logoStrokes } from '../src/shared/logo';

const OUT = 'dist/client';

// ---- og.png -------------------------------------------------------------------------------------
const W = 1200, H = 630, px = new Uint8Array(W * H * 3);
const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
const PAPER = hex('#F1EBDC'), GRID = hex('#D6CDB6'), INK = hex('#26221D'), LIGHT = hex('#FFFDF6');
const PLAYERS = ['#0072B2', '#D55E00', '#009E73', '#B0559A'].map(hex);

function put(x: number, y: number, c: number[], a: number) {
  if (x < 0 || y < 0 || x >= W || y >= H || a <= 0) return;
  const i = (y * W + x) * 3;
  for (let k = 0; k < 3; k++) px[i + k] = Math.round(px[i + k] * (1 - a) + c[k] * a);
}
const segDist = (x: number, y: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(x - ax - dx * t, y - ay - dy * t);
};
// Thick anti-aliased polyline.
function stroke(pts: number[], width: number, c: number[], alpha: number) {
  const xs = pts.filter((_, i) => i % 2 === 0), ys = pts.filter((_, i) => i % 2 === 1), r = width / 2;
  for (let y = Math.floor(Math.min(...ys) - r - 1); y <= Math.max(...ys) + r + 1; y++) {
    for (let x = Math.floor(Math.min(...xs) - r - 1); x <= Math.max(...xs) + r + 1; x++) {
      let d = 1e9;
      for (let i = 0; i + 3 < pts.length; i += 2) d = Math.min(d, segDist(x, y, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]));
      put(x, y, c, alpha * Math.max(0, Math.min(1, r - d + 0.5)));
    }
  }
}
function fill(pts: number[], c: number[], alpha: number, hatch = 0) {
  const xs = pts.filter((_, i) => i % 2 === 0), ys = pts.filter((_, i) => i % 2 === 1), n = pts.length / 2;
  for (let y = Math.floor(Math.min(...ys)); y <= Math.max(...ys); y++) {
    for (let x = Math.floor(Math.min(...xs)); x <= Math.max(...xs); x++) {
      let inside = false;
      for (let i = 0, j = n - 1; i < n; j = i++) {
        const xi = pts[i * 2], yi = pts[i * 2 + 1], xj = pts[j * 2], yj = pts[j * 2 + 1];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (inside && (!hatch || (x + y) % hatch < 3)) put(x, y, c, alpha);
    }
  }
}

for (let i = 0; i < px.length; i += 3) px.set(PAPER, i);
for (let x = 0; x < W; x += 30) for (let y = 0; y < H; y++) put(x, y, GRID, x % 150 ? 0.5 : 1);
for (let y = 0; y < H; y += 30) for (let x = 0; x < W; x++) put(x, y, GRID, y % 150 ? 0.5 : 1);

// the logo: three misaligned sheets under one ink line
const logo = logoStrokes(), U = 27, lx = (W - logo.width * U) / 2, ly = 110;
for (const l of LOGO_LAYERS) {
  for (const s of logo.strokes) stroke(s.map((v, k) => (k % 2 ? ly + (v + l.dy) * U : lx + (v + l.dx) * U)), 0.62 * U, hex(l.color), l.alpha);
}

// the cast: the four head cuts, each with a translucent trace of itself behind
const S = 7.5, bw = 12 * S, bh = 20 * S;
const HEADS = [
  [0, 20, 0, 0, 7, 0, 12, 5, 12, 20],
  [0, 20, 0, 5, 6, 0, 12, 5, 12, 20],
  [0, 20, 0, 0, 3, 0, 3, 3, 9, 3, 9, 0, 12, 0, 12, 20],
  [0, 20, 0, 6, 0.8, 3, 3, 0.8, 6, 0, 9, 0.8, 11.2, 3, 12, 6, 12, 20],
];
HEADS.forEach((shape, i) => {
  const x0 = 210 + i * 225, y0 = 372 - (i % 2) * 34;
  const at = (dx: number, dy: number) => shape.map((v, k) => (k % 2 ? y0 + dy + v * S : x0 + dx + v * S));
  fill(at(-58, 26), PLAYERS[i], 0.3);
  fill(at(-58, 26), PLAYERS[i], 0.35, 14);
  stroke([x0 - 58 - 14, y0 + 26, x0 - 58 + bw + 14, y0 + 26], 9, PLAYERS[i], 0.9); // the shelf on a friendly trace
  const p = at(0, 0);
  fill(p, PLAYERS[i], 1);
  stroke([...p, p[0], p[1]], 9, INK, 1);
  for (const ex of [0.38, 0.78]) {
    for (let y = -11; y <= 11; y++) for (let x = -11; x <= 11; x++) {
      const d = Math.hypot(x, y);
      put(Math.round(x0 + bw * ex + x), Math.round(y0 + bh * 0.44 + y), d < 5 ? INK : LIGHT, Math.max(0, Math.min(1, 10.5 - d)));
    }
  }
});
stroke([60, 560, 1140, 560], 10, INK, 1); // the ground line

const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc = (b: Uint8Array) => { let c = 0xffffffff; for (const v of b) c = crcTable[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function chunk(type: string, data: Uint8Array): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]), out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc(body), body.length + 4);
  return out;
}
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) Buffer.from(px.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1);
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', new Uint8Array(0))]);
writeFileSync(join(OUT, 'og.png'), png);
console.log(`og.png  ${W}x${H}  ${(png.length / 1024).toFixed(1)} kB`);

// ---- precompression ---------------------------------------------------------------------------
// index.html and 404.html are templated per request (public address in the Open Graph tags): left as is.
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
for (const f of walk(OUT)) {
  if (!/\.(js|css|svg|json|txt)$/.test(f)) continue;
  const data = readFileSync(f);
  writeFileSync(f + '.br', brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 11, [constants.BROTLI_PARAM_SIZE_HINT]: data.length } }));
  writeFileSync(f + '.gz', gzipSync(data, { level: 9 }));
}
console.log('precompressed: ' + walk(OUT).filter((f) => f.endsWith('.br')).length + ' files (.br and .gz)');
