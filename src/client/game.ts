// What happens on a canvas, frame by frame: an online round, the training mode, the lobby sandbox,
// the final replay. One requestAnimationFrame loop drives every visible stage.
import { ARENAS, type Arena } from '../shared/arena';
import type { RoundMsg } from '../shared/protocol';
import { Sim, HZ, ROUND_TICKS, EV_JUMP, EV_LAND, EV_DASH, EV_STOMP, EV_KO, EV_RESPAWN, EV_GOAL, KO_SPIKE, KO_FALL, type Run } from '../shared/sim';
import { audio } from './audio';
import { input } from './input';
import { View, type Scene } from './render';
import { Runner, runnerFor } from './runner';
import type { Session } from './session';
import { TX } from './texts';

export interface Stage { view: View; frame(now: number): void }

// The DOM side of the game screen (implemented in main.ts): the stage only says what changed.
export interface Hud {
  round(text: string): void;
  clock(tenths: number, late: boolean): void;
  countdown(n: number): void; // 3, 2, 1, then 0 = go
  announce(text: string): void;
  toast(text: string): void;
}

const SFX: Record<number, string> = { [EV_JUMP]: 'jump', [EV_LAND]: 'land', [EV_DASH]: 'dash', [EV_STOMP]: 'stomp', [EV_KO]: 'ko', [EV_RESPAWN]: 'respawn', [EV_GOAL]: 'goal' };
export const perf = { frames: 0, ms: 0, max: 0 };
const stages: Stage[] = [];

function loop(now: number) {
  requestAnimationFrame(loop);
  if (!stages.length) return;
  const t0 = performance.now();
  for (let i = 0; i < stages.length; i++) stages[i].frame(now);
  const dt = performance.now() - t0;
  perf.frames++; perf.ms += dt; if (dt > perf.max) perf.max = dt;
}
requestAnimationFrame(loop);

export const show = (s: Stage) => { s.view.resize(); if (!stages.includes(s)) stages.push(s); };
export const hide = (s: Stage | null) => { const i = s ? stages.indexOf(s) : -1; if (i >= 0) stages.splice(i, 1); };
export const resizeAll = () => { for (const s of stages) s.view.resize(); };

const blank = (arena: Arena): Scene => ({ arena, k: -1, a: 0, ghosts: [], sim: null, seat: -1, colors: [0, 1, 2, 3], live: null, newRound: 0, trail: 0 });

// Shared by online rounds and training: clock display, countdown, last-seconds ticks, event feedback.
abstract class Play implements Stage {
  scene: Scene; runner: Runner | null = null;
  protected over = false; // results are in: the clock stops where the round ended
  private lastCount = -1; private lastTenths = -1; private lastSec = -1;
  protected get lastShown() { return Math.max(0, this.lastTenths); }
  constructor(public view: View, protected hud: Hud, arena: Arena) { this.scene = blank(arena); }
  abstract frame(now: number): void;

  protected begin(runner: Runner | null) {
    this.runner = runner; this.over = false; this.lastCount = 4; this.lastTenths = -1; this.lastSec = 4;
    if (runner) runner.onEvent = (type, arg) => this.event(type, arg, runner.sim);
  }

  private event(type: number, arg: number, sim: Sim) {
    this.view.fx(type, sim);
    if (SFX[type]) audio.sfx(SFX[type]);
    if (type === EV_KO) this.hud.toast(arg === KO_SPIKE ? TX.ko.spike : arg === KO_FALL ? TX.ko.fall : TX.ko.crush);
    else if (type === EV_GOAL) this.hud.toast(TX.finished(sim.finishTick));
    else if (type === EV_STOMP) this.hud.toast(TX.stomped);
  }

  // T: round clock in ticks, negative during the countdown.
  protected run(T: number) {
    const tick = Math.floor(T), r = this.runner, sc = this.scene;
    if (T < 0) {
      const c = Math.ceil(-T / HZ);
      if (c !== this.lastCount) { this.lastCount = c; this.hud.countdown(c); audio.sfx('beep'); }
    } else if (this.lastCount !== 0) { this.lastCount = 0; this.hud.countdown(0); audio.sfx('go'); }
    if (r) r.update(tick, input.read);
    sc.sim = r ? r.sim : null;
    sc.k = Math.min(tick, ROUND_TICKS) - 1; sc.a = T < 0 ? 0 : T >= ROUND_TICKS ? 1 : T - tick;
    sc.trail = T < 0 ? 1 : Math.max(0, 1 - T / 24);
    if (!this.over) {
      const tenths = T < 0 ? 150 : Math.max(0, 150 - Math.floor(T / 6));
      if (tenths !== this.lastTenths) { this.lastTenths = tenths; this.hud.clock(tenths, tenths <= 30 && tenths > 0); }
      const sec = Math.ceil(tenths / 10);
      if (sec !== this.lastSec && sec <= 3 && sec > 0 && T > 0) audio.sfx('tick'); // the last three seconds are felt
      this.lastSec = sec;
    }
    this.view.draw(sc);
  }
}

export class OnlinePlay extends Play {
  msg: RoundMsg | null = null;
  games = 0; tips = true;
  constructor(view: View, hud: Hud, private s: Session) { super(view, hud, ARENAS[0]); }

  colors(): number[] {
    const c = [0, 1, 2, 3];
    for (const p of this.s.room?.players ?? []) if (p.seat >= 0 && p.color >= 0) c[p.seat] = p.color;
    return c;
  }

  onRound(m: RoundMsg) {
    const s = this.s, sc = this.scene, arena = ARENAS[m.arena], seat = s.seat, me = m.seats.find((x) => x.seat === seat);
    this.msg = m;
    this.begin(runnerFor(s, m, this.runner));
    sc.arena = arena; sc.colors = this.colors(); sc.seat = me ? seat : -1; sc.ghosts = s.ghosts(); sc.newRound = m.n - 1;
    this.view.setArena(arena, me ? me.side : -1, me ? sc.colors[seat] : 0);
    this.view.setTrails((s.runs[m.n - 2] ?? []).filter((r): r is Run => !!r && r.len > 0), sc.colors);
    this.hud.round(me ? TX.hud.round(m.n, m.total) : `${TX.hud.round(m.n, m.total)} · ${TX.hud.spectator}`);
    this.hud.announce(TX.announce(m.n, m.total, m.kind));
    if (m.n === 1 && !m.you) this.games++;
    // contextual tips, during the first game only
    if (this.tips && this.games === 1 && me && !m.you && TX.tips[m.n - 1]) this.hud.toast(TX.tips[m.n - 1]);
    audio.music(m.n, (m.startAt - s.now()) / 1000);
  }

  onResults() { audio.stopMusic(); this.over = true; this.hud.clock(this.lastShown, false); }

  frame() {
    const m = this.msg;
    if (!m) return;
    this.scene.live = this.s.runs[m.n - 1] ?? null;
    this.run(((this.s.now() - m.startAt) * HZ) / 1000);
  }
}

// One player alone, round after round on one arena: the ghosts pile up, R wipes them.
export class TrainingPlay extends Play {
  ghosts: Run[] = []; n = 0;
  private startAt = 0; private endAt = 0;
  constructor(view: View, hud: Hud, private arena: Arena, private color: number) {
    super(view, hud, arena);
    this.view.setArena(arena, 0, color);
    this.scene.seat = 0; this.scene.colors = [color, color, color, color];
    this.next(performance.now());
  }

  reset() { this.ghosts = []; this.n = 0; this.next(performance.now()); }

  private next(now: number) {
    const last = this.runner?.sim.rec;
    if (last && last.len && this.n) { this.ghosts.push(last); if (this.ghosts.length > 48) this.ghosts.shift(); }
    this.n++; this.startAt = now + 1500; this.endAt = 0;
    this.begin(new Runner(null, this.arena, 0, 0, this.ghosts.slice(), this.n));
    this.scene.ghosts = this.runner!.sim.ghosts; this.scene.newRound = this.n - 1;
    this.view.setTrails(last && this.n > 1 ? [last] : [], this.scene.colors);
    this.hud.round(TX.hud.training(this.n));
    audio.music(this.n, 1.5);
  }

  frame(now: number) {
    this.run(((now - this.startAt) * HZ) / 1000);
    if (this.runner!.sim.done) {
      if (!this.endAt) { this.endAt = now + 1200; audio.stopMusic(); }
      else if (now > this.endAt) this.next(now);
    }
  }
}

// The lobby's little practice ground: run and jump while the others arrive.
export class Sandbox implements Stage {
  scene: Scene; private sim = new Sim(); private t0 = 0;
  constructor(public view: View, arena: Arena, color: number) { this.scene = blank(arena); this.set(arena, color); }
  set(arena: Arena, color: number) {
    if (arena === this.scene.arena && color === this.scene.colors[0] && this.scene.sim) return; // lobby chatter must not send the player back to the start
    this.scene.arena = arena; this.scene.seat = 0; this.scene.colors = [color, color, color, color]; this.scene.sim = this.sim;
    this.view.setArena(arena, 0, color);
    this.sim.reset(arena, 0, 0, []); this.t0 = performance.now();
  }
  frame(now: number) {
    const sim = this.sim, T = ((now - this.t0) * HZ) / 1000, tick = Math.floor(T);
    while (sim.tick < tick && !sim.done) {
      sim.step(tick - sim.tick > 10 ? 0 : input.read(sim.tick));
      for (let i = 0; i < sim.evN; i += 2) { this.view.fx(sim.ev[i], sim); if (SFX[sim.ev[i]]) audio.sfx(SFX[sim.ev[i]]); }
      sim.evN = 0;
    }
    if (sim.done) { sim.reset(this.scene.arena, 0, 0, []); this.t0 = now; return; }
    this.scene.k = sim.tick - 1; this.scene.a = T - tick;
    this.view.draw(this.scene);
  }
}

// The final ballet: the last round replayed in a loop with every ghost, as a spectator sees it.
export class Replay implements Stage {
  scene: Scene; private len = 0; private t0 = performance.now();
  constructor(public view: View, arena: Arena, runs: Run[], colors: number[], lastRound: number) {
    this.scene = { ...blank(arena), ghosts: runs, colors, newRound: lastRound };
    this.view.setArena(arena, -1, 0);
    for (const r of runs) if (r.round === lastRound) this.len = Math.max(this.len, r.len);
    this.len = Math.max(this.len, 120) + 50;
  }
  frame(now: number) {
    const T = (((now - this.t0) * HZ) / 1000) % this.len;
    this.scene.k = Math.floor(T); this.scene.a = T - this.scene.k;
    this.view.draw(this.scene);
  }
}

// Worst case on purpose, for the performance bench: 4 players, 48 ghosts, a full round in a loop.
export class Bench implements Stage {
  private runner!: Runner; private scene: Scene; private t0 = 0; private runs: Run[] = []; private live: (Run | null)[] = [null, null, null, null];
  private seed = 12345;
  private rnd = () => (this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff) >> 16;
  private keys = 0; private hold = 0;
  private pick = () => { if (this.hold-- <= 0) { this.keys = this.rnd() & 27; this.hold = this.rnd() % 40; } return this.keys; };
  constructor(public view: View) {
    const arena = ARENAS[0];
    for (let round = 1; round <= 13; round++) for (let seat = 0; seat < 4; seat++) {
      const sim = new Sim();
      sim.reset(arena, seat, seat & 1, this.runs.slice(), round);
      while (!sim.done) sim.step(this.pick());
      if (round < 13) this.runs.push(sim.rec); else if (seat) this.live[seat] = sim.rec;
    }
    this.scene = { ...blank(arena), ghosts: this.runs, seat: 0, live: this.live, newRound: 12 };
    this.view.setArena(arena, 0, 0);
    this.restart(performance.now());
  }
  private restart(now: number) { this.runner = new Runner(null, ARENAS[0], 0, 0, this.runs, 13); this.scene.sim = this.runner.sim; this.t0 = now; }
  frame(now: number) {
    const T = ((now - this.t0) * HZ) / 1000, tick = Math.floor(T), sim = this.runner.sim;
    if (tick >= ROUND_TICKS) return this.restart(now);
    while (sim.tick < tick && !sim.done) { sim.step(this.pick()); for (let i = 0; i < sim.evN; i += 2) this.view.fx(sim.ev[i], sim); sim.evN = 0; }
    this.scene.k = tick - 1; this.scene.a = T - tick;
    this.view.draw(this.scene);
  }
}
