// Canvas renderer. Everything that can be drawn once is: the arena goes to an offscreen canvas,
// every character variant to a sprite, every number to a glyph. A frame is a few dozen blits.
import type { Arena } from '../shared/arena';
import { COLS, ROWS, TILE, W, H, PW, PH, F_ON, F_LEFT, T_SOLID, T_SPIKE, T_ONEWAY, EV_JUMP, EV_LAND, EV_DASH, EV_STOMP, EV_KO, EV_RESPAWN, EV_GOAL, moverX, moverY, type Run, type Sim } from '../shared/sim';

export const INK = '#26221D', PAPER = '#F1EBDC', SHADE = '#E4DCC8', GRID = '#D6CDB6', GRAPHITE = '#7D766A', RED = '#C8321F', LIGHT = '#FFFDF6';
export const COLORS = ['#0072B2', '#D55E00', '#009E73', '#B0559A'];
const FX = [...COLORS, '#C9A39A', LIGHT, INK, GRAPHITE]; // particle colours: 4 = eraser crumbs
const PAD = 8, SW = PW + PAD * 2, SH = PH + PAD * 2;
// sprite variants
const ME = 0, OWN = 1, FOE = 2, NEUTRAL = 3, SOFT = 4, LIVE = 5, SPEC = 6, VARIANTS = 7;
const NPART = 256;

export interface Scene {
  arena: Arena;
  k: number; a: number; // last simulated tick (-1 before the start) and interpolation toward it
  ghosts: Run[];
  sim: Sim | null; // the local living player, if any
  seat: number; // local seat, -1 for spectators and replays
  colors: ArrayLike<number>; // seat -> colour
  live: (Run | null)[] | null; // rivals' runs of the current round, shown as outlines
  newRound: number; // ghosts born in this round flash at the start
  trail: number; // opacity of the previous round's trajectories
}

// The four head cuts double the four colours.
function body(c: CanvasRenderingContext2D, shape: number, x: number, y: number, f: number) {
  const w = PW, h = PH, l = f > 0 ? x : x + w, d = f > 0 ? 1 : -1; // l: back edge, d: toward the front
  c.beginPath();
  c.moveTo(l, y + h);
  if (shape === 0) { c.lineTo(l, y); c.lineTo(l + d * (w - 5), y); c.lineTo(l + d * w, y + 5); }
  else if (shape === 1) { c.lineTo(l, y + 5); c.lineTo(l + d * w * 0.5, y); c.lineTo(l + d * w, y + 5); }
  else if (shape === 2) { c.lineTo(l, y); c.lineTo(l + d * 3, y); c.lineTo(l + d * 3, y + 3); c.lineTo(l + d * (w - 3), y + 3); c.lineTo(l + d * (w - 3), y); c.lineTo(l + d * w, y); }
  else { c.lineTo(l, y + 6); c.arc(x + w / 2, y + 6, w / 2, f > 0 ? Math.PI : 0, f > 0 ? 0 : Math.PI, f < 0); }
  c.lineTo(l + d * w, y + h);
  c.closePath();
}

// The four fill patterns double the four colours.
function pattern(c: CanvasRenderingContext2D, kind: number, x: number, y: number) {
  c.beginPath();
  if (kind === 0) for (let i = -PH; i < PW; i += 4) { c.moveTo(x + i, y + PH); c.lineTo(x + i + PH, y); }
  else if (kind === 1) for (let j = 3; j < PH; j += 4) for (let i = 2 + ((j >> 2) & 1) * 2; i < PW; i += 4) c.rect(x + i, y + j, 1.2, 1.2);
  else if (kind === 2) for (let j = 4; j < PH; j += 4) { c.moveTo(x, y + j); c.lineTo(x + PW, y + j); }
  else for (let i = -PH; i < PW + PH; i += 5) { c.moveTo(x + i, y + PH); c.lineTo(x + i + PH, y); c.moveTo(x + i, y); c.lineTo(x + i + PH, y + PH); }
  if (kind === 1) c.fill(); else c.stroke();
}

function eyes(c: CanvasRenderingContext2D, x: number, y: number, f: number, white: string, pupil: string | null) {
  const ex = x + PW / 2 + f * 1.5;
  c.fillStyle = white;
  c.beginPath(); c.arc(ex - 2.4, y + 9, 1.9, 0, 7); c.arc(ex + 2.4, y + 9, 1.9, 0, 7); c.fill();
  if (!pupil) return;
  c.fillStyle = pupil;
  c.beginPath(); c.arc(ex - 2.4 + f * 0.7, y + 9, 0.9, 0, 7); c.arc(ex + 2.4 + f * 0.7, y + 9, 0.9, 0, 7); c.fill();
}

function drawVariant(c: CanvasRenderingContext2D, color: number, v: number, f: number) {
  const x = PAD, y = PAD, col = COLORS[color];
  c.lineJoin = 'miter'; c.lineCap = 'butt'; c.setLineDash([]);
  if (v === ME) {
    body(c, color, x, y, f); c.fillStyle = col; c.fill();
    c.strokeStyle = INK; c.lineWidth = 1.8; c.stroke();
    eyes(c, x, y, f, LIGHT, INK);
  } else if (v === OWN) {
    // Translucent, no hard edge, and a shelf across the head: something to land on.
    body(c, color, x, y, f); c.globalAlpha = 0.28; c.fillStyle = col; c.fill();
    c.save(); c.clip(); c.globalAlpha = 0.55; c.strokeStyle = c.fillStyle = col; c.lineWidth = 0.8; pattern(c, color, x, y); c.restore();
    c.globalAlpha = 1; c.fillStyle = col; c.fillRect(x - 3, y - 1, PW + 6, 2.6);
    c.fillRect(x - 3, y - 1, 1.2, 5); c.fillRect(x + PW + 1.8, y - 1, 1.2, 5);
  } else if (v === FOE || v === SPEC) {
    // Opaque, hard ink edge: it has to look solid. FOE adds the light chevron: "jump here".
    body(c, color, x, y, f); c.fillStyle = col; c.fill();
    c.save(); c.clip(); c.globalAlpha = 0.32; c.strokeStyle = c.fillStyle = INK; c.lineWidth = 0.9; pattern(c, color, x, y); c.restore();
    body(c, color, x, y, f); c.strokeStyle = INK; c.lineWidth = v === FOE ? 2 : 1.2; c.stroke();
    eyes(c, x, y, f, INK, null);
    if (v === FOE) {
      // a light marker hovering over the head, pointing down
      c.beginPath(); c.moveTo(x + 2, y - 7); c.lineTo(x + PW - 2, y - 7); c.lineTo(x + PW / 2, y - 2.2); c.closePath();
      c.fillStyle = LIGHT; c.fill(); c.strokeStyle = INK; c.lineWidth = 1; c.stroke();
    }
  } else if (v === NEUTRAL) {
    body(c, color, x, y, f); c.strokeStyle = GRAPHITE; c.globalAlpha = 0.7; c.lineWidth = 1; c.setLineDash([2, 2]); c.stroke();
  } else if (v === SOFT) {
    body(c, color, x, y, f); c.globalAlpha = 0.3; c.fillStyle = col; c.fill();
    c.globalAlpha = 0.75; c.strokeStyle = INK; c.lineWidth = 1; c.setLineDash([3, 2]); c.stroke();
  } else {
    // A living rival: a bare outline, untouchable.
    body(c, color, x, y, f); c.strokeStyle = col; c.lineWidth = 1.5; c.stroke();
    c.fillStyle = col; c.beginPath(); c.arc(x + PW / 2 + f * 1.5 - 2.4, y + 9, 1, 0, 7); c.arc(x + PW / 2 + f * 1.5 + 2.4, y + 9, 1, 0, 7); c.fill();
  }
  c.globalAlpha = 1; c.setLineDash([]);
}

const offscreen = (w: number, h: number) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

export class View {
  ctx: CanvasRenderingContext2D;
  scale = 1;
  arena: Arena | null = null; side = -1; color = 0;
  shakeOn = true;
  private bg: HTMLCanvasElement | null = null;
  private trails: HTMLCanvasElement | null = null;
  private sprites: HTMLCanvasElement[] = [];
  private nums: HTMLCanvasElement[] = [];
  private bubbles: HTMLCanvasElement[] = [];
  private bubbleText: string[] = [];
  // effects
  private shake = 0; private freeze = 0; private hk = 0; private ha = 0; private mx = 0; private my = 0;
  private squash = 0; private trailX = new Float32Array(4); private trailY = new Float32Array(4); private trailN = 0;
  private was = new Uint8Array(64); private wasKey = -1;
  private px = new Float32Array(NPART); private py = new Float32Array(NPART); private pvx = new Float32Array(NPART); private pvy = new Float32Array(NPART);
  private plife = new Float32Array(NPART); private pcol = new Uint8Array(NPART); private pi = 0;
  private emoteE = new Int8Array(4).fill(-1); private emoteT = new Float64Array(4);
  private seatX = new Float32Array(4); private seatY = new Float32Array(4); private seatOn = new Uint8Array(4);

  // `crop` shows only a part of the arena (demo vignettes), in logical pixels.
  constructor(public canvas: HTMLCanvasElement, private crop = { x: 0, y: 0, w: W, h: H }) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
  }

  setArena(arena: Arena, side: number, color: number) {
    if (arena === this.arena && side === this.side && color === this.color) return;
    this.arena = arena; this.side = side; this.color = color;
    this.build();
  }

  setEmoteTexts(t: string[]) { this.bubbleText = t; this.build(); }

  // Call when the canvas size or the fonts change.
  resize() {
    const r = this.canvas.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 3);
    const w = Math.max(1, Math.round(r.width * dpr));
    if (w === this.canvas.width && this.bg) return;
    this.canvas.width = w; this.canvas.height = Math.round((w * this.crop.h) / this.crop.w);
    this.build();
  }

  private build() {
    const s = (this.scale = this.canvas.width / this.crop.w);
    this.sprites = [];
    for (let color = 0; color < 4; color++) for (let v = 0; v < VARIANTS; v++) for (let f = 0; f < 2; f++) {
      const cv = offscreen(SW * s, SH * s), c = cv.getContext('2d')!;
      c.scale(s, s);
      drawVariant(c, color, v, f ? -1 : 1);
      this.sprites.push(cv);
    }
    // Round numbers, light for filled bodies and ink for translucent ones.
    this.nums = [];
    for (let n = 0; n <= 16; n++) for (let tint = 0; tint < 2; tint++) {
      const cv = offscreen(12 * s, 9 * s), c = cv.getContext('2d')!;
      c.scale(s, s); c.font = '500 8px "DM Mono", monospace'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillStyle = tint ? INK : LIGHT; c.fillText(String(n), 6, 5);
      this.nums.push(cv);
    }
    this.bubbles = this.bubbleText.map((t) => {
      const cv = offscreen(64 * s, 16 * s), c = cv.getContext('2d')!;
      c.scale(s, s); c.font = '9px "Architects Daughter", cursive'; c.textAlign = 'center'; c.textBaseline = 'middle';
      const w = Math.min(60, c.measureText(t).width + 8);
      c.fillStyle = LIGHT; c.strokeStyle = INK; c.lineWidth = 1;
      c.beginPath(); c.rect(32 - w / 2, 1, w, 11); c.fill(); c.stroke();
      c.beginPath(); c.moveTo(29, 12); c.lineTo(32, 15.5); c.lineTo(35, 12); c.fill(); c.stroke();
      c.fillStyle = LIGHT; c.fillRect(29.6, 11, 4.8, 1.6);
      c.fillStyle = INK; c.fillText(t, 32, 7);
      return cv;
    });
    if (this.arena) this.buildArena(this.arena);
  }

  private buildArena(A: Arena) {
    const s = this.scale, cv = (this.bg = offscreen(this.crop.w * s, this.crop.h * s)), c = cv.getContext('2d')!;
    c.scale(s, s); c.translate(-this.crop.x, -this.crop.y);
    c.fillStyle = PAPER; c.fillRect(0, 0, W, H);
    // graph paper
    c.strokeStyle = GRID; c.lineWidth = 1 / s;
    for (let i = 0; i <= COLS; i++) { c.globalAlpha = i % 5 ? 0.45 : 1; c.beginPath(); c.moveTo(i * TILE, 0); c.lineTo(i * TILE, H); c.stroke(); }
    for (let j = 0; j <= ROWS; j++) { c.globalAlpha = j % 5 ? 0.45 : 1; c.beginPath(); c.moveTo(0, j * TILE); c.lineTo(W, j * TILE); c.stroke(); }
    c.globalAlpha = 1;
    // my margins (sanctuaries): hatched in my colour, drawn on the ground
    if (this.side >= 0) {
      const col = COLORS[this.color];
      for (const z of A.sanct[this.side]) {
        c.save(); c.beginPath(); c.rect(z.x, z.y, z.w, z.h); c.clip();
        c.strokeStyle = col; c.globalAlpha = 0.2; c.lineWidth = 1; c.beginPath();
        for (let i = -z.h; i < z.w; i += 6) { c.moveTo(z.x + i, z.y + z.h); c.lineTo(z.x + i + z.h, z.y); }
        c.stroke(); c.restore();
        c.strokeStyle = col; c.globalAlpha = 0.7; c.lineWidth = 1; c.setLineDash([1, 3]); c.strokeRect(z.x + 0.5, z.y + 0.5, z.w - 1, z.h - 1); c.setLineDash([]); c.globalAlpha = 1;
      }
    }
    // tracks of the moving platforms
    c.strokeStyle = GRAPHITE; c.lineWidth = 1; c.setLineDash([2, 4]);
    for (const m of A.movers) { c.beginPath(); c.moveTo(m.x + m.w / 2, m.y + 2); c.lineTo(m.x + m.dx + m.w / 2, m.y + m.dy + 2); c.stroke(); }
    c.setLineDash([]);
    // tiles
    const t = A.tiles;
    for (let r = 0; r < ROWS; r++) for (let col = 0; col < COLS; col++) {
      const v = t[r * COLS + col], x = col * TILE, y = r * TILE;
      if (v === T_SOLID) {
        c.fillStyle = INK; c.fillRect(x, y, TILE + 0.3, TILE + 0.3);
        if (r > 0 && t[(r - 1) * COLS + col] !== T_SOLID) { c.fillStyle = PAPER; c.globalAlpha = 0.22; c.fillRect(x, y + 2, TILE, 1); c.globalAlpha = 1; }
      } else if (v === T_SPIKE) {
        c.fillStyle = RED; c.beginPath();
        c.moveTo(x, y + TILE); c.lineTo(x + 4, y + 5); c.lineTo(x + 8, y + TILE); c.lineTo(x + 12, y + 5); c.lineTo(x + 16, y + TILE); c.fill();
      } else if (v === T_ONEWAY) {
        c.fillStyle = INK; c.fillRect(x, y, TILE + 0.3, 3);
        c.globalAlpha = 0.5; for (let i = 2; i < TILE; i += 4) c.fillRect(x + i, y + 4, 1, 3); c.globalAlpha = 1;
      }
    }
    // goals: registration marks. Mine in my colour, the other side's in graphite.
    for (let side = 0; side < 2; side++) {
      const g = A.goal[side], cx = g.x + g.w / 2, cy = g.y + g.h - 13, mine = side === this.side;
      c.strokeStyle = mine ? COLORS[this.color] : GRAPHITE; c.lineWidth = mine ? 2 : 1.2;
      c.beginPath(); c.arc(cx, cy, 7, 0, 7); c.moveTo(cx - 12, cy); c.lineTo(cx + 12, cy); c.moveTo(cx, cy - 12); c.lineTo(cx, cy + 12); c.stroke();
    }
  }

  // Trajectories of the runs born in the previous round, shown during the countdown.
  setTrails(runs: Run[], colors: ArrayLike<number>) {
    const s = this.scale, cv = (this.trails = offscreen(this.crop.w * s, this.crop.h * s)), c = cv.getContext('2d')!;
    c.scale(s, s); c.translate(-this.crop.x, -this.crop.y);
    c.lineWidth = 1.4; c.setLineDash([3, 3]); c.lineJoin = 'round';
    for (const run of runs) {
      c.strokeStyle = COLORS[colors[run.seat]]; c.beginPath();
      let pen = false;
      for (let t = 0; t < run.len; t += 3) {
        if (!(run.f[t] & F_ON)) { pen = false; continue; }
        if (pen) c.lineTo(run.x[t] + PW / 2, run.y[t] + PH / 2); else c.moveTo(run.x[t] + PW / 2, run.y[t] + PH / 2);
        pen = true;
      }
      c.stroke();
    }
  }

  // ---- effects ------------------------------------------------------------------------------

  burst(x: number, y: number, n: number, col: number, speed: number) {
    for (let i = 0; i < n; i++) {
      const j = (this.pi = (this.pi + 1) % NPART), a = Math.random() * 6.283, v = speed * (0.4 + Math.random() * 0.6);
      this.px[j] = x; this.py[j] = y; this.pvx[j] = Math.cos(a) * v; this.pvy[j] = Math.sin(a) * v - speed * 0.4;
      this.plife[j] = 14 + Math.random() * 16; this.pcol[j] = col;
    }
  }

  emote(seat: number, e: number) { if (seat >= 0 && seat < 4) { this.emoteE[seat] = e; this.emoteT[seat] = performance.now(); } }

  // Feedback for a simulation event of the local player.
  fx(type: number, sim: Sim) {
    const cx = sim.x + PW / 2, feet = sim.y + PH;
    if (type === EV_LAND) { this.squash = -1; this.burst(cx, feet, 4, 7, 0.9); }
    else if (type === EV_JUMP) this.squash = 1;
    else if (type === EV_DASH) this.burst(cx, sim.y + PH / 2, 5, 5, 1.2);
    else if (type === EV_STOMP) { this.freeze = 3; this.shake = 2.5; this.squash = 1; this.burst(cx, feet, 10, 5, 1.8); }
    else if (type === EV_KO) { this.shake = 5; this.burst(cx, sim.y + PH / 2, 26, 4, 2.6); }
    else if (type === EV_RESPAWN) this.burst(sim.x + PW / 2, sim.y + PH / 2, 8, this.color, 1.2);
    else if (type === EV_GOAL) this.burst(cx, sim.y + PH / 2, 30, this.color, 2.8);
  }

  // ---- frame --------------------------------------------------------------------------------

  private sprite(color: number, v: number, left: number, x: number, y: number) {
    this.ctx.drawImage(this.sprites[(color * VARIANTS + v) * 2 + left], x - PAD, y - PAD, SW, SH);
  }

  draw(sc: Scene) {
    const c = this.ctx, s = this.scale, A = sc.arena, sim = sc.sim;
    if (!this.bg) return;
    let k = sc.k, a = sc.a;
    if (this.freeze > 0) { this.freeze--; k = this.hk; a = this.ha; } else { this.hk = k; this.ha = a; } // hit-stop is display only
    let ox = 0, oy = 0;
    if (this.shake > 0.2) {
      if (this.shakeOn) { ox = (Math.random() - 0.5) * this.shake * s; oy = (Math.random() - 0.5) * this.shake * s; }
      this.shake *= 0.82;
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    if (ox || oy) { c.fillStyle = PAPER; c.fillRect(0, 0, this.canvas.width, this.canvas.height); }
    c.drawImage(this.bg, ox, oy);
    if (sc.trail > 0.01 && this.trails) { c.globalAlpha = sc.trail; c.drawImage(this.trails, ox, oy); c.globalAlpha = 1; }
    c.setTransform(s, 0, 0, s, ox - this.crop.x * s, oy - this.crop.y * s);
    const kk = Math.max(k, 0);

    // moving platforms
    c.fillStyle = INK;
    for (let i = 0; i < A.movers.length; i++) {
      const m = A.movers[i], x0 = moverX(m, Math.max(kk - 1, 0)), y0 = moverY(m, Math.max(kk - 1, 0));
      const x = x0 + (moverX(m, kk) - x0) * a, y = y0 + (moverY(m, kk) - y0) * a;
      c.fillRect(x, y, m.w, 4); c.fillRect(x + 2, y + 4, 2, 3); c.fillRect(x + m.w - 4, y + 4, 2, 3);
    }

    // my goal breathes
    if (this.side >= 0) {
      const g = A.goal[this.side], pulse = (performance.now() % 1200) / 1200;
      c.strokeStyle = COLORS[this.color]; c.lineWidth = 1; c.globalAlpha = 1 - pulse;
      c.beginPath(); c.arc(g.x + g.w / 2, g.y + g.h - 13, 7 + pulse * 9, 0, 7); c.stroke(); c.globalAlpha = 1;
    }

    // ghosts
    if (this.wasKey !== sc.newRound) { this.wasKey = sc.newRound; this.was.fill(0); }
    const n = Math.min(sc.ghosts.length, 64);
    for (let i = 0; i < n; i++) {
      const g = sc.ghosts[i], col = sc.colors[g.seat];
      const on = kk < g.len && (g.f[kk] & F_ON) !== 0;
      if (on !== (this.was[i] === 1)) {
        // appearing or vanishing: a puff of shavings (not at the very first frame of a round)
        const t = on ? kk : Math.min(kk, g.len) - 1;
        if (k > 0 && t >= 0) this.burst(g.x[t] + PW / 2, g.y[t] + PH / 2, 6, col, 1.1);
        this.was[i] = on ? 1 : 0;
      }
      if (!on) continue;
      let x = g.x[kk], y = g.y[kk];
      if (kk > 0 && g.f[kk - 1] & F_ON) {
        const dx = x - g.x[kk - 1], dy = y - g.y[kk - 1];
        if (dx > -24 && dx < 24 && dy > -24 && dy < 24) { x -= dx * (1 - a); y -= dy * (1 - a); }
      }
      let v = SPEC;
      if (sim && i < sim.n) v = g.seat === sc.seat ? OWN : sim.neutral[i] ? NEUTRAL : sim.gSolid[i] ? FOE : SOFT;
      else if (g.seat === sc.seat) v = OWN;
      this.sprite(col, v, g.f[kk] & F_LEFT ? 1 : 0, x, y);
      if (v !== NEUTRAL) c.drawImage(this.nums[Math.min(g.round, 16) * 2 + (v === OWN || v === SOFT ? 1 : 0)], x, y + 11, 12, 9);
      if (g.round === sc.newRound && k < 45) {
        // born last round: a closing ring points it out
        const r = 20 - Math.max(k, 0) * 0.3;
        c.strokeStyle = COLORS[col]; c.lineWidth = 1.5; c.globalAlpha = 0.8; c.beginPath(); c.arc(x + PW / 2, y + PH / 2, r, 0, 7); c.stroke(); c.globalAlpha = 1;
      }
    }

    // living rivals, about 100 ms in the past
    this.seatOn.fill(0);
    if (sc.live) {
      for (let seat = 0; seat < 4; seat++) {
        const g = sc.live[seat];
        if (!g || seat === sc.seat || !g.len) continue;
        const t = Math.min(Math.max(k - 6, 0), g.len - 1);
        if (!(g.f[t] & F_ON)) continue;
        let x = g.x[t], y = g.y[t];
        if (t > 0 && t === k - 6) { x -= (x - g.x[t - 1]) * (1 - a); y -= (y - g.y[t - 1]) * (1 - a); }
        this.sprite(sc.colors[seat], sim || sc.seat >= 0 ? LIVE : ME, g.f[t] & F_LEFT ? 1 : 0, x, y);
        this.seatX[seat] = x; this.seatY[seat] = y; this.seatOn[seat] = 1;
      }
    }

    // me: the most contrasted thing on screen, the only one that squashes and stretches
    if (sim && !sim.dead && sim.finishTick < 0) {
      if (this.freeze === 0) { this.mx = sim.px + (sim.x - sim.px) * a; this.my = sim.py + (sim.y - sim.py) * a; }
      const left = sim.facing < 0 ? 1 : 0, sq = this.squash;
      this.squash *= 0.8;
      if (sim.dashT) { const j = this.trailN++ & 3; this.trailX[j] = this.mx; this.trailY[j] = this.my; }
      else if (this.trailN) this.trailN = 0;
      for (let j = 0; j < Math.min(this.trailN, 4); j++) { c.globalAlpha = 0.25; this.sprite(sc.colors[sc.seat], OWN, left, this.trailX[j], this.trailY[j]); }
      c.globalAlpha = sim.invuln && (sim.invuln >> 2) & 1 ? 0.45 : 1;
      const w = SW * (1 - sq * 0.16), h = SH * (1 + sq * 0.2);
      // scaled around the feet
      c.drawImage(this.sprites[(sc.colors[sc.seat] * VARIANTS + ME) * 2 + left], this.mx - PAD + (SW - w) / 2, this.my + PH - ((SH - PAD) * h) / SH, w, h);
      c.globalAlpha = 1;
      this.seatX[sc.seat] = this.mx; this.seatY[sc.seat] = this.my; this.seatOn[sc.seat] = 1;
    }

    // particles
    let last = -1;
    for (let j = 0; j < NPART; j++) {
      if (this.plife[j] <= 0) continue;
      this.plife[j]--; this.pvy[j] += 0.12; this.px[j] += this.pvx[j]; this.py[j] += this.pvy[j];
      if (this.pcol[j] !== last) c.fillStyle = FX[(last = this.pcol[j])];
      const z = this.plife[j] > 8 ? 2 : 1.2;
      c.fillRect(this.px[j], this.py[j], z, z);
    }

    // emotes: a note pinned above whoever said it (or above their goal once they are done)
    const now = performance.now();
    for (let seat = 0; seat < 4; seat++) {
      const e = this.emoteE[seat];
      if (e < 0 || !this.bubbles[e]) continue;
      const age = now - this.emoteT[seat];
      if (age > 1800) { this.emoteE[seat] = -1; continue; }
      const pop = Math.min(1, age / 90), bx = this.seatOn[seat] ? this.seatX[seat] + PW / 2 : W / 2 + (seat - 1.5) * 70, by = this.seatOn[seat] ? this.seatY[seat] - 4 : 20;
      c.drawImage(this.bubbles[e], Math.max(0, Math.min(W - 64, bx - 32)), Math.max(0, by - 16 * pop), 64, 16 * pop);
    }
  }
}
