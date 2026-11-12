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

/** 'walk' gibt es nur mit 3D-Figur: der Lauf aus dem Tunnel ins Licht. */
export type StepKind = 'burst' | 'dark' | 'flag' | 'pos' | 'walk' | 'name' | 'card';

/**
 * Darstellungsart der Enthüllung:
 * - '3d': animierte Spielerfigur (WebGL),
 * - 'css': Ersatzenthüllung ohne Figur (wenn WebGL fehlt oder die Szene nicht lädt),
 * - 'reduced': ruhige Enthüllung ohne Bewegung.
 */
export type RevealMode = '3d' | 'css' | 'reduced';

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
  /** Mit animierter Spielerfigur. */
  figure: {
    first: {
      walkout: { dark: 1500, flag: 900, pos: 900, walk: 1700, name: 1000 },
      strong: { flag: 650, pos: 650, walk: 900 },
    },
    second: {
      walkout: { dark: 600, flag: 600, pos: 600, walk: 1300, name: 700 },
      strong: { flag: 500, pos: 500, walk: 700 },
    },
  },
  /** Ersatzenthüllung ohne Figur. */
  css: {
    first: {
      walkout: { dark: 1900, flag: 950, pos: 950, name: 1000 },
      strong: { flag: 750, pos: 750 },
    },
    second: {
      walkout: { dark: 1000, flag: 700, pos: 700, name: 750 },
      strong: { flag: 550, pos: 550 },
    },
  },
  normal: { flag: 380, pos: 380 },
  /** Zusätzliche Spannungszeit für Legenden und Spitzenkarten. */
  specialExtraDark: 300,
  rest: { flag: 300, pos: 300, card: 650 },
} as const;

const featuredSteps = (card: Player, i: number, mode: Exclude<RevealMode, 'reduced'>): RevealStep[] => {
  const T = REVEAL_TIMING;
  const st = styleFor(card);
  const order = i === 0 ? 'first' : 'second';
  const step = (kind: StepKind, dur: number): RevealStep => ({ kind, index: i, dur });
  if (st.tier === 'normal') return [step('flag', T.normal.flag), step('pos', T.normal.pos)];
  const extra = st.legend || st.elite ? T.specialExtraDark : 0;
  if (mode === '3d') {
    const t = T.figure[order];
    return st.tier === 'walkout'
      ? [step('dark', t.walkout.dark + extra), step('flag', t.walkout.flag), step('pos', t.walkout.pos), step('walk', t.walkout.walk), step('name', t.walkout.name)]
      : [step('flag', t.strong.flag), step('pos', t.strong.pos), step('walk', t.strong.walk)];
  }
  const t = T.css[order];
  return st.tier === 'walkout'
    ? [step('dark', t.walkout.dark + extra), step('flag', t.walkout.flag), step('pos', t.walkout.pos), step('name', t.walkout.name)]
    : [step('flag', t.strong.flag), step('pos', t.strong.pos)];
};

export const buildSteps = (order: readonly Player[], featured: number, mode: RevealMode = 'css'): RevealStep[] => {
  // Reduzierte Bewegung: nur die besonderen Karten als ruhiges Haltebild, danach direkt die Übersicht.
  if (mode === 'reduced') return order.slice(0, featured).map((_, i) => ({ kind: 'card' as const, index: i, dur: 0, hold: true }));
  const T = REVEAL_TIMING;
  return [
    { kind: 'burst', index: 0, dur: T.burst },
    ...order.flatMap((card, i): RevealStep[] => (i < featured
      ? [...featuredSteps(card, i, mode), { kind: 'card', index: i, dur: 0, hold: true }]
      : [{ kind: 'flag', index: i, dur: T.rest.flag }, { kind: 'pos', index: i, dur: T.rest.pos }, { kind: 'card', index: i, dur: T.rest.card }])),
  ];
};

/** Zeit bis zum ersten Haltebild (für Tests und Feinjustierung). */
export const timeToFirstHold = (steps: readonly RevealStep[]): number => {
  let t = 0;
  for (const s of steps) { if (s.hold) return t; t += s.dur; }
  return t;
};
