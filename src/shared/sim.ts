// Pure, deterministic simulation core: no DOM, no clock, no allocation per tick.
// Physics follows the "actors and solids" model (integer positions, sub-pixel remainders).
import type { Arena } from './arena';

export const TILE = 16, COLS = 40, ROWS = 20, W = COLS * TILE, H = ROWS * TILE;
export const HZ = 60, ROUND_TICKS = 15 * HZ;
export const PW = 12, PH = 20;
export const MAX_GHOSTS = 64;

// input bits
export const IN_L = 1, IN_R = 2, IN_D = 4, IN_J = 8, IN_X = 16;
// recorded flag bits (bit 7 is reserved by the wire codec)
export const F_ON = 1, F_LEFT = 2, F_DASH = 4, F_AIR = 8, F_RUN = 16;
// tiles
export const T_SOLID = 1, T_SPIKE = 2, T_ONEWAY = 3;
// events: pairs (type, arg) in Sim.ev
export const EV_JUMP = 1, EV_LAND = 2, EV_DASH = 3, EV_STOMP = 4, EV_KO = 5, EV_RESPAWN = 6, EV_GOAL = 7, EV_LADDER = 8;
// KO causes (EV_KO arg); values >= 0 are the index of the crushing ghost
export const KO_SPIKE = -1, KO_FALL = -2;

// Tunables, in pixels and ticks.
export const P = {
  RUN: 2.4, ACC: 0.4, DEC: 0.8, AIR_ACC: 0.3, AIR_DEC: 0.1,
  JUMP: 5.3, G_UP: 0.272, G_DOWN: 0.5, APEX: 0.7, MAX_FALL: 6.5, CUT: 0.45,
  COYOTE: 6, BUFFER: 6, CORNER: 3,
  DASH_V: 8, DASH_T: 9, DASH_CD: 36,
  BOUNCE: 5.6, BOUNCE_HI: 6.35,
  LIFT_T: 6, LIFT_X: 4, LIFT_Y: 2.5,
  STOMP: 5, WIGGLE: 4, KO_T: 60, INVULN: 30, DROP_T: 8, TELEPORT: 24,
};

export interface Run { seat: number; round: number; len: number; x: Int16Array; y: Int16Array; f: Uint8Array }

export function newRun(seat: number, round: number): Run {
  return { seat, round, len: 0, x: new Int16Array(ROUND_TICKS), y: new Int16Array(ROUND_TICKS), f: new Uint8Array(ROUND_TICKS) };
}

const approach = (v: number, target: number, step: number) => (v < target ? Math.min(v + step, target) : Math.max(v - step, target));
// Rounds half away from zero, so that left and right behave as exact mirrors.
const round = (v: number) => (v < 0 ? -Math.round(-v) : Math.round(v));
const clampLift = (v: number) => Math.max(-P.LIFT_X, Math.min(P.LIFT_X, v));

export class Sim {
  arena!: Arena; seat = 0; side = 0; ghosts: Run[] = []; n = 0; rec!: Run;
  tick = 0; done = false; finishTick = -1;
  x = 0; y = 0; px = 0; py = 0; vx = 0; vy = 0; rx = 0; ry = 0;
  facing = 1; grounded = false; coyote = 0; buffer = 0; jumping = false;
  dashT = 0; dashDir = 1; dashCd = 0; dashReady = true; dropT = 0;
  liftX = 0; liftY = 0; liftT = 0; carried = false; wasCarried = false; rideId = -1;
  dead = 0; invuln = 0; safeX = 0; safeY = 0; prevIn = 0;
  ev = new Int16Array(64); evN = 0;
  // per-ghost state for this round
  gx = new Int16Array(MAX_GHOSTS); gy = new Int16Array(MAX_GHOSTS);
  gOn = new Uint8Array(MAX_GHOSTS); gSolid = new Uint8Array(MAX_GHOSTS);
  lock = new Uint8Array(MAX_GHOSTS); neutral = new Uint8Array(MAX_GHOSTS);
  mx = new Int16Array(16); my = new Int16Array(16);

  reset(arena: Arena, seat: number, side: number, ghosts: Run[], round = 0) {
    this.arena = arena; this.seat = seat; this.side = side;
    this.ghosts = ghosts; this.n = Math.min(ghosts.length, MAX_GHOSTS);
    this.rec = newRun(seat, round);
    this.tick = 0; this.done = false; this.finishTick = -1;
    const s = arena.spawn[side];
    this.x = this.px = this.safeX = s.x; this.y = this.py = this.safeY = s.y;
    this.vx = this.vy = this.rx = this.ry = 0;
    this.facing = side ? -1 : 1; this.grounded = true; this.coyote = 0; this.buffer = 0; this.jumping = false;
    this.dashT = 0; this.dashCd = 0; this.dashReady = true; this.dropT = 0;
    this.liftX = this.liftY = this.liftT = 0; this.carried = this.wasCarried = false; this.rideId = -1;
    this.dead = 0; this.invuln = 0; this.prevIn = 0; this.evN = 0;
    this.gOn.fill(0); this.gSolid.fill(0); this.lock.fill(0); this.neutral.fill(0);
    for (let i = 0; i < arena.movers.length; i++) this.moverAt(i, 0);
  }

  // Fixed cycle, never reacts to players: a triangle wave between (x,y) and (x+dx,y+dy).
  moverAt(i: number, t: number) {
    const m = this.arena.movers[i], half = m.period >> 1;
    const p = (t + m.phase) % m.period, k = p < half ? p : m.period - p;
    this.mx[i] = m.x + round((m.dx * k) / half);
    this.my[i] = m.y + round((m.dy * k) / half);
  }

  private emit(type: number, arg: number) {
    if (this.evN < 62) { this.ev[this.evN++] = type; this.ev[this.evN++] = arg; }
  }

  tileSolid(x: number, y: number): boolean {
    const t = this.arena.tiles;
    const c1 = (x + PW - 1) >> 4, r1 = Math.min((y + PH - 1) >> 4, ROWS - 1);
    for (let r = Math.max(y >> 4, 0); r <= r1; r++) for (let c = x >> 4; c <= c1; c++) if (t[r * COLS + c] === T_SOLID) return true;
    return false;
  }

  ghostHit(x: number, y: number): number {
    for (let i = 0; i < this.n; i++) {
      if (this.gSolid[i] && x < this.gx[i] + PW && x + PW > this.gx[i] && y < this.gy[i] + PH && y + PH > this.gy[i]) return i;
    }
    return -1;
  }

  blocked(x: number, y: number): boolean {
    return x < 0 || x + PW > W || y < 0 || this.tileSolid(x, y) || this.ghostHit(x, y) >= 0;
  }

  private overlap(bx: number, by: number): boolean {
    return this.x < bx + PW && this.x + PW > bx && this.y < by + PH && this.y + PH > by;
  }

  inSanct(bx: number, by: number): boolean {
    const z = this.arena.sanct[this.side];
    for (let i = 0; i < z.length; i++) {
      const r = z[i];
      if (bx < r.x + r.w && bx + PW > r.x && by < r.y + r.h && by + PH > r.y) return true;
    }
    return false;
  }

  // 0 = airborne, 1 = solid tile, 2 = one-way surface (platform tile, mover, own ghost)
  private groundKind(): number {
    if (this.vy < 0) return 0;
    if (this.tileSolid(this.x, this.y + 1)) return 1;
    return !this.dropT && this.onewayBelow() ? 2 : 0;
  }

  private onewayBelow(): boolean {
    const feet = this.y + PH, x = this.x, A = this.arena;
    if ((feet & 15) === 0 && feet < H) {
      const r = feet >> 4, c1 = (x + PW - 1) >> 4;
      for (let c = x >> 4; c <= c1; c++) if (A.tiles[r * COLS + c] === T_ONEWAY) return true;
    }
    for (let i = 0; i < A.movers.length; i++) {
      if (this.my[i] === feet && x + PW > this.mx[i] && x < this.mx[i] + A.movers[i].w) return true;
    }
    for (let i = 0; i < this.n; i++) {
      if (this.gOn[i] && this.ghosts[i].seat === this.seat && this.gy[i] === feet && x + PW > this.gx[i] && x < this.gx[i] + PW) return true;
    }
    return false;
  }

  // A one-way surface moved from (ox,oy) to (nx,ny): carry the player standing on it, or scoop it up.
  private carry(ox: number, oy: number, nx: number, ny: number, w: number, id: number) {
    if (this.dropT || this.carried) return;
    const feet = this.y + PH;
    if (this.vy >= 0 && feet === oy && this.x + PW > ox && this.x < ox + w) {
      this.slide(nx - ox, 0); this.slide(0, ny - oy);
    } else if (ny < oy && feet <= oy && feet > ny && this.x + PW > nx && this.x < nx + w && this.vy > ny - oy) {
      this.slide(0, ny - feet);
      if (this.vy > 0) { this.vy = 0; this.ry = 0; }
    } else return;
    this.carried = true; this.rideId = id;
    this.liftX = nx - ox; this.liftY = ny - oy; this.liftT = P.LIFT_T;
  }

  // Move by whole pixels, stopping at the first obstacle. Returns false if cut short.
  private slide(dx: number, dy: number): boolean {
    const sx = Math.sign(dx), sy = Math.sign(dy);
    for (let m = Math.abs(dx) + Math.abs(dy); m > 0; m--) {
      if (this.blocked(this.x + sx, this.y + sy)) return false;
      this.x += sx; this.y += sy;
    }
    return true;
  }

  private moveGhost(i: number, t: number) {
    const g = this.ghosts[i];
    if (t >= g.len || !(g.f[t] & F_ON)) { this.gOn[i] = 0; this.gSolid[i] = 0; this.lock[i] = 0; return; }
    const nx = g.x[t], ny = g.y[t], ox = this.gx[i], oy = this.gy[i];
    // A position jump (respawn) is a disappearance followed by an appearance, never a sweep.
    const jump = !this.gOn[i] || Math.abs(nx - ox) > P.TELEPORT || Math.abs(ny - oy) > P.TELEPORT;
    this.gOn[i] = 1;
    if (g.seat === this.seat) {
      this.gx[i] = nx; this.gy[i] = ny;
      if (!this.dead && !jump) this.carry(ox, oy, nx, ny, PW, i);
      return;
    }
    const want = !this.dead && !this.neutral[i] && !this.invuln && !this.inSanct(nx, ny);
    if (!want || !this.gSolid[i] || jump) {
      this.gx[i] = nx; this.gy[i] = ny;
      // Overlap rule: a ghost turning solid on top of the player stays intangible until they separate.
      const over = want && this.overlap(nx, ny);
      this.gSolid[i] = want && !over ? 1 : 0; this.lock[i] = over ? 1 : 0;
      return;
    }
    if (nx !== ox) {
      this.gx[i] = nx;
      if (this.overlap(nx, oy)) {
        if (this.y + PH <= oy + P.STOMP) this.stomp(i);
        else this.push(i, nx > ox ? nx + PW - this.x : nx - (this.x + PW), 0, nx - ox);
      }
    }
    this.gy[i] = ny;
    if (ny !== oy && this.gSolid[i] && !this.dead && this.overlap(nx, ny)) {
      if (ny < oy) this.stomp(i); // it rose under the player's feet
      else this.push(i, 0, ny + PH - this.y, ny - oy);
    }
  }

  private push(i: number, dx: number, dy: number, gv: number) {
    this.gSolid[i] = 0; // the pusher never blocks the actor it pushes
    const ok = this.slide(dx, dy);
    this.gSolid[i] = 1;
    if (dx) { if (gv > 0 ? this.vx < gv : this.vx > gv) this.vx = gv; }
    else if (this.vy < gv) this.vy = gv;
    if (ok) return;
    // Squeezed: try to slip out sideways by a few pixels before calling it a crush.
    for (let d = 1; d <= P.WIGGLE; d++) {
      for (let k = -1; k <= 1; k += 2) {
        const s = dy ? k * this.facing : k; // sideways slips mirror with the facing; vertical ones try up first
        const tx = this.x + (dy ? s * d : 0), ty = this.y + (dx ? s * d : 0);
        if (!this.blocked(tx, ty)) { this.x = tx; this.y = ty; return; }
      }
    }
    this.ko(i);
  }

  private stomp(i: number) {
    this.neutral[i] = 1; this.gSolid[i] = 0;
    this.vy = -(this.prevIn & IN_J ? P.BOUNCE_HI : P.BOUNCE); this.ry = 0;
    this.dashReady = true; this.dashCd = 0; this.dashT = 0; this.jumping = false; this.coyote = 0;
    this.emit(EV_STOMP, i);
  }

  private ko(cause: number) {
    if (this.dead) return;
    this.dead = P.KO_T; this.vx = this.vy = this.rx = this.ry = 0; this.dashT = 0;
    this.emit(EV_KO, cause);
  }

  private moveX(amount: number) {
    this.rx += amount;
    let m = round(this.rx);
    if (!m) return;
    this.rx -= m;
    const s = m > 0 ? 1 : -1;
    for (; m; m -= s) {
      const nx = this.x + s;
      if (nx < 0 || nx + PW > W || this.tileSolid(nx, this.y)) { this.vx = 0; this.rx = 0; return; }
      const gi = this.ghostHit(nx, this.y);
      if (gi >= 0) {
        if (this.y + PH <= this.gy[gi] + P.STOMP) this.stomp(gi);
        else { this.vx = 0; this.rx = 0; return; }
      }
      this.x = nx;
    }
  }

  private moveY(amount: number) {
    this.ry += amount;
    let m = round(this.ry);
    if (!m) return;
    this.ry -= m;
    if (m < 0) {
      for (; m; m++) {
        const ny = this.y - 1;
        if (this.blocked(this.x, ny)) {
          // Corner correction: nudge sideways past a corner instead of bonking.
          let d = 1;
          for (; d <= P.CORNER; d++) {
            if (!this.blocked(this.x + d * this.facing, ny)) { this.x += d * this.facing; break; }
            if (!this.blocked(this.x - d * this.facing, ny)) { this.x -= d * this.facing; break; }
          }
          if (d > P.CORNER) { this.vy = 0; this.ry = 0; return; }
        }
        this.y = ny;
      }
    } else {
      for (; m; m--) {
        if (this.tileSolid(this.x, this.y + 1) || (!this.dropT && this.onewayBelow())) { this.vy = 0; this.ry = 0; return; }
        const gi = this.ghostHit(this.x, this.y + 1);
        if (gi >= 0) { this.stomp(gi); return; }
        this.y++;
      }
    }
  }

  private update(inp: number) {
    const pressed = inp & ~this.prevIn;
    this.prevIn = inp;
    if (this.invuln) this.invuln--;
    if (this.dropT) this.dropT--;
    if (this.dashCd) this.dashCd--;
    if (this.liftT && --this.liftT === 0) this.liftX = this.liftY = 0;

    let gk = this.groundKind();
    if (gk) {
      if (!this.grounded) this.emit(EV_LAND, 0);
      this.coyote = P.COYOTE;
      if (!this.dashT) this.dashReady = true;
      if (this.vy > 0) this.vy = 0;
      this.ry = 0;
      if (gk === 1) this.markSafe();
    } else if (this.coyote) this.coyote--;
    this.grounded = gk !== 0;

    const dir = (inp & IN_R ? 1 : 0) - (inp & IN_L ? 1 : 0);
    if (dir) this.facing = dir;

    let left = false; // left the ground on purpose this tick
    if (pressed & IN_J) this.buffer = P.BUFFER; else if (this.buffer) this.buffer--;
    if (this.buffer) {
      if (inp & IN_D && gk === 2) {
        this.dropT = P.DROP_T; this.buffer = 0; this.coyote = 0; gk = 0; left = true;
      } else if (this.coyote) {
        this.vy = -P.JUMP;
        if (this.dashT) { this.dashT = 0; this.vx = this.dashDir * P.RUN; } // no dash speed carried into a jump
        if (this.liftT) {
          this.vx += clampLift(this.liftX);
          if (this.liftY < 0) this.vy += Math.max(this.liftY, -P.LIFT_Y);
          if (this.rideId >= 0) this.emit(EV_LADDER, this.rideId);
        }
        this.liftX = this.liftY = this.liftT = 0;
        this.buffer = 0; this.coyote = 0; this.jumping = true; gk = 0; left = true;
        this.emit(EV_JUMP, 0);
      }
    }
    // Stepping off (or losing) a carrier keeps its momentum.
    if (this.wasCarried && !this.carried && !gk && !left && this.liftT) {
      this.vx += clampLift(this.liftX);
      if (this.liftY < 0) this.vy += Math.max(this.liftY, -P.LIFT_Y);
      this.liftX = this.liftY = this.liftT = 0;
    }

    if (pressed & IN_X && this.dashReady && !this.dashCd) {
      this.dashT = P.DASH_T; this.dashDir = dir || this.facing; this.dashReady = false; this.dashCd = P.DASH_CD;
      this.jumping = false; this.ry = 0;
      this.emit(EV_DASH, 0);
    }

    let dashEnd = false;
    if (this.dashT) {
      this.vx = this.dashDir * P.DASH_V; this.vy = 0;
      dashEnd = --this.dashT === 0;
    } else {
      let a: number;
      if (dir && Math.abs(this.vx) > P.RUN && Math.sign(this.vx) === dir) a = 0.1; // borrowed momentum fades slowly
      else if (gk) a = dir && Math.sign(this.vx) !== -dir ? P.ACC : P.DEC;
      else a = dir ? P.AIR_ACC : P.AIR_DEC;
      this.vx = approach(this.vx, dir * P.RUN, a);
      if (!gk && !left) {
        let g = this.vy < 0 ? P.G_UP : P.G_DOWN;
        if (inp & IN_J && Math.abs(this.vy) < P.APEX) g *= 0.5; // softer apex
        this.vy = Math.min(this.vy + g, P.MAX_FALL);
      }
      if (this.jumping && this.vy < 0 && !(inp & IN_J)) { this.vy *= P.CUT; this.jumping = false; }
      if (this.vy >= 0) this.jumping = false;
    }
    this.moveX(this.vx);
    this.moveY(this.vy);
    if (dashEnd && this.vx) this.vx = this.dashDir * P.RUN; // a dash ends at running speed
  }

  // Last firm ground: a fixed tile under the body centre, with no spikes next to it.
  private markSafe() {
    const t = this.arena.tiles, c = (this.x + PW / 2) >> 4, r = (this.y + PH) >> 4;
    if (r >= ROWS || t[r * COLS + c] !== T_SOLID) return;
    for (let d = -1; d <= 1; d++) if (t[(r - 1) * COLS + c + d] === T_SPIKE) return;
    this.safeX = this.x; this.safeY = this.y;
  }

  private hazards() {
    if (this.y > H) { this.ko(KO_FALL); return; }
    const A = this.arena, t = A.tiles;
    if (!this.invuln) {
      const c1 = (this.x + PW - 1) >> 4, r1 = Math.min((this.y + PH - 1) >> 4, ROWS - 1);
      for (let r = Math.max(this.y >> 4, 0); r <= r1; r++) {
        for (let c = this.x >> 4; c <= c1; c++) {
          if (t[r * COLS + c] === T_SPIKE && this.y + PH > r * TILE + 6) { this.ko(KO_SPIKE); return; }
        }
      }
    }
    const g = A.goal[this.side];
    if (this.x < g.x + g.w && this.x + PW > g.x && this.y < g.y + g.h && this.y + PH > g.y) {
      this.done = true; this.finishTick = this.tick + 1;
      this.emit(EV_GOAL, 0);
    }
  }

  // One tick: 1) movers and ghosts take their position, pushing or carrying the player;
  // 2) the player moves; 3) hazards and goal; 4) the tick is recorded.
  step(input: number) {
    if (this.done) return;
    const t = this.tick, A = this.arena, alive = !this.dead;
    this.px = this.x; this.py = this.y;
    this.wasCarried = this.carried; this.carried = false;
    for (let i = 0; i < A.movers.length; i++) {
      const ox = this.mx[i], oy = this.my[i];
      this.moverAt(i, t);
      if (alive) this.carry(ox, oy, this.mx[i], this.my[i], A.movers[i].w, -1 - i);
    }
    for (let i = 0; i < this.n; i++) this.moveGhost(i, t);

    if (this.dead) {
      if (!alive && --this.dead === 0) {
        this.x = this.px = this.safeX; this.y = this.py = this.safeY;
        this.invuln = P.INVULN; this.dashReady = true; this.dashCd = 0; this.coyote = 0; this.buffer = 0;
        this.emit(EV_RESPAWN, 0);
      }
      this.prevIn = input;
    } else {
      this.update(input);
      if (!this.dead) this.hazards();
    }

    const r = this.rec;
    r.x[t] = this.x; r.y[t] = this.y;
    r.f[t] = (this.dead ? 0 : F_ON) | (this.facing < 0 ? F_LEFT : 0) | (this.dashT ? F_DASH : 0) | (this.grounded ? 0 : F_AIR) | (Math.abs(this.vx) > 0.5 ? F_RUN : 0);
    r.len = this.tick = t + 1;
    if (this.tick >= ROUND_TICKS) this.done = true;
  }
}
