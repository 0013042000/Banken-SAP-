/** Kleiner, schneller Zufallsgenerator (mulberry32). Sein Zustand wird im Spielzustand mitgeführt. */
export interface Rng {
  /** Gleichverteilt in [0, 1). */
  readonly next: () => number;
  /** Glockenförmig um 0 mit Streuung ≈ 1. */
  readonly spread: () => number;
  /** Aktueller Zustand zum Ablegen im Spielzustand. */
  readonly state: () => number;
}

const INCREMENT = 0x6d2b79f5;
const SHIFT_A = 15;
const SHIFT_B = 7;
const SHIFT_C = 14;
const MIXER = 61;
const UINT_RANGE = 4294967296;
const SPREAD_MEAN = 1.5;
const SPREAD_SCALE = 2;

export const createRng = (seed: number): Rng => {
  let s = seed | 0;
  const next = (): number => {
    s = (s + INCREMENT) | 0;
    const a = Math.imul(s ^ (s >>> SHIFT_A), s | 1);
    const b = a ^ (a + Math.imul(a ^ (a >>> SHIFT_B), a | MIXER));
    return ((b ^ (b >>> SHIFT_C)) >>> 0) / UINT_RANGE;
  };
  return {
    next,
    spread: (): number => (next() + next() + next() - SPREAD_MEAN) * SPREAD_SCALE,
    state: (): number => s,
  };
};
