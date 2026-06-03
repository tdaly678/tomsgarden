/**
 * Deterministic, seedable PRNG (mulberry32) plus helpers.
 *
 * Used for tile-bag shuffling and any other randomness so that, given a seed,
 * a game is fully reproducible and testable. The engine never calls Math.random.
 */

export interface Rng {
  /** Returns a float in [0, 1). */
  next(): number;
  /** Returns an integer in [0, maxExclusive). */
  int(maxExclusive: number): number;
  /** The current internal state (so it can be persisted with the game state). */
  state(): number;
}

/** Create a deterministic RNG from a 32-bit unsigned integer seed/state. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (maxExclusive: number) => Math.floor(next() * maxExclusive),
    state: () => a >>> 0,
  };
}

/**
 * Fisher–Yates shuffle returning a NEW array (does not mutate the input).
 * Deterministic for a given rng state.
 */
export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}
