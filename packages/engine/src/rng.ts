// mulberry32 — small deterministic PRNG (per TZ T-B1).
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function nextInt(state: number): [number, number] {
  // returns [newState, randomUint32] — pure, so engine can thread rng in state.
  const a = (state + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  const out = (t ^ (t >>> 14)) >>> 0;
  return [a >>> 0, out];
}

/** Fisher-Yates shuffle threading rng state; returns [newState, shuffled]. */
export function shuffle<T>(state: number, arr: T[]): [number, T[]] {
  const a = arr.slice();
  let s = state;
  for (let i = a.length - 1; i > 0; i--) {
    let r: number;
    [s, r] = nextInt(s);
    const j = r % (i + 1);
    const tmp = a[i] as T;
    a[i] = a[j] as T;
    a[j] = tmp;
  }
  return [s, a];
}
