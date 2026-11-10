import type { Player } from '../data/players';
import { FEATURE_MIN, WALKOUT_MIN } from './packs';

/** Ab dieser Bewertung gibt es den zusätzlichen Höhepunkt (Lichtausbruch + Konfetti). */
export const ELITE_MIN = 95;

/** Stufe der Inszenierung einer einzelnen Karte. */
export type RevealTier = 'normal' | 'strong' | 'walkout';

export interface RevealStyle {
  readonly tier: RevealTier;
  /** Legende ab 90: eigene goldene/elfenbeinfarbene Inszenierung. */
  readonly legend: boolean;
  /** Spitzenkarte ab 95: zusätzlicher Höhepunkt. */
  readonly elite: boolean;
}

export const styleFor = (p: Player): RevealStyle => {
  const tier: RevealTier = p.ovr >= WALKOUT_MIN ? 'walkout' : p.ovr >= FEATURE_MIN ? 'strong' : 'normal';
  return { tier, legend: p.cat === 'legend' && p.ovr >= WALKOUT_MIN, elite: p.ovr >= ELITE_MIN };
};

export type StepKind = 'burst' | 'dark' | 'flag' | 'pos' | 'name' | 'card';

export interface RevealStep {
  readonly kind: StepKind;
  /** Index in der Enthüllungsreihenfolge. */
  readonly index: number;
  /** Dauer in ms, bevor automatisch der nächste Schritt folgt. */
  readonly dur: number;
  /** Haltebild: wartet auf eine bewusste Eingabe. */
  readonly hold?: boolean;
}

/**
 * Enthüllungsreihenfolge: beste Karte zuerst, eine zweitbeste ab FEATURE_MIN bekommt
 * ebenfalls einen eigenen Auftritt, der Rest folgt aufsteigend.
 * Verändert das Pack nicht, sondern sortiert nur eine Kopie.
 */
export const revealOrder = (cards: readonly Player[]): { readonly order: readonly Player[]; readonly featured: number } => {
  const desc = [...cards].sort((a, b) => b.ovr - a.ovr);
  const featured = desc.length > 1 && desc[1]!.ovr >= FEATURE_MIN ? 2 : Math.min(1, desc.length);
  const head = desc.slice(0, featured);
  const rest = desc.slice(featured).sort((a, b) => a.ovr - b.ovr);
  return { order: [...head, ...rest], featured };
};

/** Zentrale Zeitsteuerung (ms). Erster Auftritt ausführlich, zweiter in kürzerer Form. */
export const REVEAL_TIMING = {
  burst: 800,
  first: {
    walkout: { dark: 1900, flag: 950, pos: 950, name: 1000 },
    strong: { flag: 750, pos: 750 },
    normal: { flag: 380, pos: 380 },
  },
  second: {
    walkout: { dark: 1000, flag: 700, pos: 700, name: 750 },
    strong: { flag: 550, pos: 550 },
  },
  /** Zusätzliche Spannungszeit für Legenden und Spitzenkarten. */
  specialExtraDark: 300,
  rest: { flag: 300, pos: 300, card: 650 },
} as const;

export const buildSteps = (order: readonly Player[], featured: number, reducedMotion = false): RevealStep[] => {
  // Reduzierte Bewegung: nur die besonderen Karten als ruhiges Haltebild, danach direkt die Übersicht.
  if (reducedMotion) return order.slice(0, featured).map((_, i) => ({ kind: 'card' as const, index: i, dur: 0, hold: true }));

  const T = REVEAL_TIMING;
  const steps: RevealStep[] = [{ kind: 'burst', index: 0, dur: T.burst }];
  order.forEach((card, i) => {
    if (i >= featured) {
      steps.push({ kind: 'flag', index: i, dur: T.rest.flag }, { kind: 'pos', index: i, dur: T.rest.pos }, { kind: 'card', index: i, dur: T.rest.card });
      return;
    }
    const st = styleFor(card);
    const first = i === 0;
    if (st.tier === 'walkout') {
      const t = first ? T.first.walkout : T.second.walkout;
      const extra = st.legend || st.elite ? T.specialExtraDark : 0;
      steps.push({ kind: 'dark', index: i, dur: t.dark + extra }, { kind: 'flag', index: i, dur: t.flag }, { kind: 'pos', index: i, dur: t.pos }, { kind: 'name', index: i, dur: t.name });
    } else if (st.tier === 'strong') {
      const t = first ? T.first.strong : T.second.strong;
      steps.push({ kind: 'flag', index: i, dur: t.flag }, { kind: 'pos', index: i, dur: t.pos });
    } else {
      steps.push({ kind: 'flag', index: i, dur: T.first.normal.flag }, { kind: 'pos', index: i, dur: T.first.normal.pos });
    }
    steps.push({ kind: 'card', index: i, dur: 0, hold: true });
  });
  return steps;
};

/** Zeit bis zum ersten Haltebild (für Tests und Feinjustierung). */
export const timeToFirstHold = (steps: readonly RevealStep[]): number => {
  let t = 0;
  for (const s of steps) { if (s.hold) return t; t += s.dur; }
  return t;
};
