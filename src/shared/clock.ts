// The only source of time for server and client logic. `scale` speeds game time up in tests.
export interface Clock { now(): number; after(ms: number, fn: () => void): () => void }

export function realClock(scale = 1): Clock {
  const t0 = performance.now();
  return {
    now: () => (performance.now() - t0) * scale,
    after: (ms, fn) => {
      const h = setTimeout(fn, ms / scale);
      return () => clearTimeout(h);
    },
  };
}
