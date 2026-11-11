/** Zufallsquelle mit Werten in [0, 1). Im Spiel Math.random, in Tests ein Generator mit festem Startwert. */
export type Rnd = () => number;

const MULBERRY_STEP = 0x6d2b79f5;
const SHIFT_A = 15;
const SHIFT_B = 7;
const SHIFT_C = 14;
const MIX_B = 61;
const UINT32_RANGE = 4294967296;

/** Wiederholbarer Zufallsgenerator (Mulberry32) für Tests und Simulationen. */
export const seededRnd = (seed: number): Rnd => {
  let state = seed >>> 0;
  return (): number => {
    state = (state + MULBERRY_STEP) >>> 0;
    const a = Math.imul(state ^ (state >>> SHIFT_A), state | 1);
    const b = a ^ (a + Math.imul(a ^ (a >>> SHIFT_B), a | MIX_B));
    return ((b ^ (b >>> SHIFT_C)) >>> 0) / UINT32_RANGE;
  };
};

/** Gleichverteilter Index in [0, length); auch bei einem Zufallswert von genau 1 gültig. */
export const pickIndex = (length: number, rnd: Rnd): number =>
  Math.max(0, Math.min(length - 1, Math.floor(rnd() * length)));

export const pickOne = <TItem>(items: readonly TItem[], rnd: Rnd): TItem | undefined => items[pickIndex(items.length, rnd)];

/**
 * Zentrale gewichtete Ziehung: wählt einen Eintrag mit Wahrscheinlichkeit proportional zu seinem Gewicht.
 * Einträge mit Gewicht 0 oder weniger werden nie gezogen.
 */
export const pickWeighted = <TItem>(entries: readonly (readonly [item: TItem, weight: number])[], rnd: Rnd): TItem | undefined => {
  const usable = entries.filter(([, weight]) => weight > 0);
  const total = usable.reduce((sum, [, weight]) => sum + weight, 0);
  const mark = rnd() * total;
  const hit = usable.reduce<{ readonly left: number; readonly item: TItem | undefined; readonly found: boolean }>(
    (acc, [item, weight]) => (acc.found ? acc : { left: acc.left - weight, item, found: acc.left - weight < 0 }),
    { left: mark, item: undefined, found: false },
  );
  return hit.item;
};

/** Mischt eine Liste, ohne sie zu verändern (Fisher-Yates über eine Kopie). */
export const shuffled = <TItem>(items: readonly TItem[], rnd: Rnd): TItem[] =>
  items.reduce<TItem[]>((out, item) => {
    const at = pickIndex(out.length + 1, rnd);
    return [...out.slice(0, at), item, ...out.slice(at)];
  }, []);
