// Binary run frames: 9-byte header, then 3 bytes per tick (flags, dx, dy), positions delta-coded.
// A delta that does not fit in a signed byte (respawn) is escaped: flags|0x80 followed by absolute x, y (int16).
import { ROUND_TICKS, W, H, type Run } from './sim';

export const FRAME_CHUNK = 1; // live piece of a run, appended in order
export const FRAME_FULL = 2; // authoritative copy of a whole run, replaces what the client had
export const HEADER = 9;
export const MAX_FRAME = HEADER + ROUND_TICKS * 5;
const ESC = 0x80;

export function encodeRun(type: number, run: Run, from: number, to: number, out: Uint8Array): number {
  const v = new DataView(out.buffer, out.byteOffset);
  let px = run.x[from > 0 ? from - 1 : from], py = run.y[from > 0 ? from - 1 : from];
  out[0] = type; out[1] = run.round; out[2] = run.seat;
  v.setUint16(3, from, true); v.setInt16(5, px, true); v.setInt16(7, py, true);
  let o = HEADER;
  for (let t = from; t < to; t++) {
    const x = run.x[t], y = run.y[t], dx = x - px, dy = y - py;
    if (dx < -128 || dx > 127 || dy < -128 || dy > 127) {
      out[o++] = run.f[t] | ESC; v.setInt16(o, x, true); v.setInt16(o + 2, y, true); o += 4;
    } else {
      out[o++] = run.f[t]; v.setInt8(o++, dx); v.setInt8(o++, dy);
    }
    px = x; py = y;
  }
  return o;
}

// Appends the frame's ticks to `run`. Returns false (run untouched) on anything malformed or out of order.
export function decodeRun(buf: Uint8Array, run: Run): boolean {
  if (buf.length < HEADER || buf.length > MAX_FRAME) return false;
  const v = new DataView(buf.buffer, buf.byteOffset, buf.length);
  const from = v.getUint16(3, true);
  if (from !== run.len) return false;
  let px = v.getInt16(5, true), py = v.getInt16(7, true), t = from, o = HEADER;
  while (o < buf.length) {
    if (t >= ROUND_TICKS) return false;
    const f = buf[o++];
    if (f & ESC) {
      if (o + 4 > buf.length) return false;
      px = v.getInt16(o, true); py = v.getInt16(o + 2, true); o += 4;
    } else {
      if (o + 2 > buf.length) return false;
      px += v.getInt8(o++); py += v.getInt8(o++);
    }
    // Clients are trusted on gameplay, not on memory safety: keep positions in a sane box.
    if (px < -64 || px > W + 64 || py < -64 || py > H + 64) return false;
    run.x[t] = px; run.y[t] = py; run.f[t] = f & ~ESC;
    t++;
  }
  run.len = t;
  return true;
}
