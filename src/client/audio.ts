// Every sound is synthesised with Web Audio: desk noises. Filtered noise is a pencil stroke,
// a triangle wave with a hard attack is a pencil tapped on wood. No audio file anywhere.
let ctx: AudioContext | null = null;
let master: GainNode, musicBus: GainNode, noiseBuf: AudioBuffer;
let volume = 0.7;
let probe: AnalyserNode | null = null;

function tone(freq: number, dur: number, vol: number, type: OscillatorType = 'triangle', to = freq, when = 0, bus: AudioNode = master) {
  if (!ctx) return;
  const t = Math.max(ctx.currentTime, when || ctx.currentTime), o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (to !== freq) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(bus); o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur: number, freq: number, vol: number, to = freq, when = 0, bus: AudioNode = master) {
  if (!ctx) return;
  const t = Math.max(ctx.currentTime, when || ctx.currentTime), src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuf; src.loop = true;
  f.type = 'bandpass'; f.Q.value = 1.2; f.frequency.setValueAtTime(freq, t);
  if (to !== freq) f.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(bus); src.start(t, Math.random()); src.stop(t + dur + 0.02);
}

const SFX: Record<string, () => void> = {
  jump: () => tone(330, 0.09, 0.16, 'triangle', 540),
  land: () => noise(0.05, 700, 0.14),
  dash: () => { noise(0.16, 3200, 0.2, 900); tone(190, 0.08, 0.1); },
  stomp: () => { tone(523, 0.07, 0.2); tone(784, 0.12, 0.2, 'triangle', 784, ctx!.currentTime + 0.06); noise(0.07, 2600, 0.16); },
  ko: () => { noise(0.4, 1400, 0.3, 180); tone(196, 0.3, 0.12, 'sawtooth', 62); },
  respawn: () => tone(392, 0.12, 0.12, 'triangle', 587),
  goal: () => [440, 523, 659, 880].forEach((f, i) => tone(f, 0.16, 0.2, 'triangle', f, ctx!.currentTime + i * 0.07)),
  beep: () => tone(440, 0.09, 0.14, 'square'),
  go: () => { tone(880, 0.22, 0.2, 'square'); noise(0.1, 4000, 0.12); },
  tick: () => tone(988, 0.05, 0.2, 'square'),
  click: () => { noise(0.025, 3800, 0.2); tone(150, 0.04, 0.2, 'sine', 90); },
  emote: () => tone(740, 0.07, 0.14, 'triangle', 988),
  stamp: () => { tone(120, 0.1, 0.4, 'sine', 55); noise(0.06, 500, 0.25); },
};

// ---- music: one 15-second loop (8 bars at 128 BPM) that gains a layer every round -----------------
const STEP = 60 / 128 / 4; // a sixteenth note
const semi = (n: number, base: number) => base * 2 ** (n / 12);
const X = -99;
const BASS = [0, X, X, 0, X, X, 3, X, 0, X, X, 0, X, X, -2, X, 5, X, X, 5, X, X, 3, X, 0, X, X, 0, X, 7, X, X];
const ARP = [12, 7, 10, 7, 5, 7, 10, 7, 12, 7, 10, 7, 15, 12, 10, 7];
const LEAD = [[0, 12], [12, 10], [16, 7], [24, 5], [28, 7]];
let layers = 0, step = 0, startAt = 0, timer = 0;

function schedule() {
  if (!ctx || !layers) return;
  while (startAt + step * STEP < ctx.currentTime + 0.25) {
    const t = startAt + step * STEP, s = step & 31;
    if (t >= ctx.currentTime - 0.05) {
      if (s % 4 === 0) tone(105, 0.13, 0.55, 'sine', 46, t, musicBus);
      if (layers > 1 && BASS[s] !== X) tone(semi(BASS[s], 110), 0.2, 0.3, 'triangle', semi(BASS[s], 110), t, musicBus);
      if (layers > 2 && s % 4 === 2) noise(0.04, 5200, 0.22, 5200, t, musicBus);
      if (layers > 2 && s % 8 === 7) noise(0.03, 2400, 0.12, 2400, t, musicBus);
      if (layers > 3 && s % 2 === 0) tone(semi(ARP[(s >> 1) & 15], 220), 0.11, 0.13, 'triangle', semi(ARP[(s >> 1) & 15], 220), t, musicBus);
      if (layers > 4) for (const [at, n] of LEAD) if (at === s) tone(semi(n, 440), 0.42, 0.11, 'sine', semi(n, 440), t, musicBus);
      if (layers > 5 && (s & 7) === 3) tone(semi(ARP[(s >> 3) & 15], 880), 0.06, 0.07, 'triangle', semi(ARP[(s >> 3) & 15], 880), t, musicBus);
    }
    step++;
  }
}

export const audio = {
  // Must be called from a user gesture: browsers keep audio locked until then.
  unlock() {
    if (ctx) { if (ctx.state === 'suspended') void ctx.resume(); return; }
    const AC = window.AudioContext || (window as any).webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = volume; master.connect(ctx.destination);
    musicBus = ctx.createGain(); musicBus.gain.value = 0.5; musicBus.connect(master);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  },
  // Peak level of what is being played right now, 0..1 (automated checks: is anything audible?).
  level(): number {
    if (!ctx) return 0;
    if (!probe) { probe = ctx.createAnalyser(); probe.fftSize = 2048; master.connect(probe); }
    const d = new Float32Array(probe.fftSize);
    probe.getFloatTimeDomainData(d);
    let peak = 0;
    for (const v of d) peak = Math.max(peak, Math.abs(v));
    return peak;
  },
  state: () => ctx?.state ?? 'none',
  setVolume(v: number) { volume = v; if (ctx) master.gain.setTargetAtTime(v, ctx.currentTime, 0.02); },
  sfx(name: string) { if (ctx && volume > 0) SFX[name]?.(); },
  // Starts the loop with `n` layers, `delay` seconds from now (the end of the countdown).
  music(n: number, delay: number) {
    if (!ctx) return;
    layers = Math.max(1, Math.min(6, n)); step = 0; startAt = ctx.currentTime + Math.max(0, delay);
    musicBus.gain.cancelScheduledValues(ctx.currentTime); musicBus.gain.setValueAtTime(0.5, ctx.currentTime);
    clearInterval(timer); timer = window.setInterval(schedule, 60); schedule();
  },
  stopMusic() {
    layers = 0; clearInterval(timer);
    if (ctx) musicBus.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08);
  },
};
