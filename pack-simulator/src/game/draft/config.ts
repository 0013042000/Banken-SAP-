import type { Category, Position } from '../../data/players';
import type { ProfileId } from '../../football/contract';
import { TEAM_SIZE, type SlotRole } from '../team';

/**
 * Zentrale Einstellungen des Draft-Modus. Alle Gewichte hier sind eigene Draft-Werte
 * und unabhängig von der Pack-Logik.
 */

export const VARIANT_IDS = ['mixed', 'legend', 'dream'] as const;
export type VariantId = (typeof VARIANT_IDS)[number];

/** Bewertungsstufen des Drafts, von schwach nach stark. */
export const DRAFT_TIERS = ['unter80', 'ab80', 'ab84', 'ab86', 'ab88', 'ab90', 'ab92'] as const;
export type DraftTier = (typeof DRAFT_TIERS)[number];

/** Breite Linien für Bank und Reserve. */
export const LINE_IDS = ['TW', 'ABW', 'MIT', 'ANG'] as const;
export type LineId = (typeof LINE_IDS)[number];

export interface VariantConfig {
  readonly id: VariantId;
  readonly label: string;
  readonly tagline: string;
  readonly description: string;
  /** Erlaubte Kartenkategorien. */
  readonly categories: readonly Category[];
  /** Anteil je Bewertungsstufe an einer Ziehung; 0 schließt die Stufe aus. */
  readonly weights: Readonly<Record<DraftTier, number>>;
  /** Mindestbewertung im Kapitänsangebot. */
  readonly captainMinOvr: number;
}

/* eslint-disable ts-patterns/no-magic-numbers -- zentrale Wertetabellen: jede Zahl steht genau hier und trägt ihren Namen über den Schlüssel */

/** Untergrenze je Stufe, absteigend sortiert: Die erste erreichte Grenze bestimmt die Stufe. */
export const TIER_FLOORS: readonly (readonly [tier: DraftTier, minOvr: number])[] = Object.freeze([
  ['ab92', 92], ['ab90', 90], ['ab88', 88], ['ab86', 86], ['ab84', 84], ['ab80', 80], ['unter80', 0],
] as const);

export const VARIANTS = Object.freeze({
  mixed: {
    id: 'mixed', label: 'Gemischter Draft', tagline: 'Stars, Kultspieler und Legenden',
    description: 'Bunte Mischung aus allen Karten – von soliden Spielern bis zu den ganz Großen.',
    categories: ['gold', 'star', 'legend'],
    weights: { unter80: 8, ab80: 14, ab84: 16, ab86: 22, ab88: 20, ab90: 13, ab92: 7 },
    captainMinOvr: 88,
  },
  legend: {
    id: 'legend', label: 'Legenden-Draft', tagline: 'Nur Legenden',
    description: 'Jeder Platz wird mit einer Legende besetzt – ein Kader voller Ikonen.',
    categories: ['legend'],
    weights: { unter80: 0, ab80: 0, ab84: 0, ab86: 22, ab88: 32, ab90: 28, ab92: 18 },
    captainMinOvr: 90,
  },
  dream: {
    id: 'dream', label: 'Traum-Draft', tagline: 'Besonders starke Angebote',
    description: 'Nur Karten ab 86, meistens 88 und mehr – mehr als die Hälfte der Angebote hat 90 oder mehr.',
    categories: ['gold', 'star', 'legend'],
    weights: { unter80: 0, ab80: 0, ab84: 0, ab86: 10, ab88: 34, ab90: 32, ab92: 24 },
    captainMinOvr: 92,
  },
} as const satisfies Record<VariantId, VariantConfig>);

/* eslint-enable ts-patterns/no-magic-numbers */

/** Gleichgewicht über alle Stufen: gilt, wenn die Variante im Notfall gelockert wird, und im Kapitänsangebot. */
export const FLAT_WEIGHTS: Readonly<Record<DraftTier, number>> = Object.freeze({
  unter80: 1, ab80: 1, ab84: 1, ab86: 1, ab88: 1, ab90: 1, ab92: 1,
});

export const LINE_ACCEPTS: Readonly<Record<LineId, readonly Position[]>> = Object.freeze({
  TW: ['TW'],
  ABW: ['IV', 'LV', 'RV'],
  MIT: ['ZDM', 'ZM', 'ZOM', 'LM', 'RM'],
  ANG: ['LF', 'RF', 'MS', 'ST'],
});

export const LINE_LABEL: Readonly<Record<LineId, string>> = Object.freeze({
  TW: 'Tor', ABW: 'Abwehr', MIT: 'Mittelfeld', ANG: 'Angriff',
});

/** Linie eines Startplatzes – nur für den Notfall „breite Linie“ und die Prüfung gespeicherter Daten. */
export const LINE_OF_ROLE: Readonly<Record<SlotRole, LineId>> = Object.freeze({
  TW: 'TW', LV: 'ABW', IV: 'ABW', RV: 'ABW',
  ZDM: 'MIT', ZM: 'MIT', ZOM: 'MIT', LM: 'MIT', RM: 'MIT',
  LF: 'ANG', RF: 'ANG', ST: 'ANG',
});

export const BENCH_ROLES: readonly LineId[] = Object.freeze(['TW', 'ABW', 'ABW', 'MIT', 'MIT', 'ANG', 'ANG']);
export const RESERVE_ROLES: readonly LineId[] = Object.freeze(['TW', 'ABW', 'MIT', 'MIT', 'ANG']);

export const START_SIZE = TEAM_SIZE;
export const BENCH_SIZE = BENCH_ROLES.length;
export const RESERVE_SIZE = RESERVE_ROLES.length;
export const SQUAD_SIZE = START_SIZE + BENCH_SIZE + RESERVE_SIZE;

/** Anzahl der Kandidaten je Angebot. */
export const OFFER_SIZE = 5;
/** Obergrenze fertiger Drafts je Profil. */
export const MAX_FINISHED_PER_PROFILE = 20;

export const PROFILE_IDS: readonly ProfileId[] = Object.freeze(['semon', 'ariel']);
export const PROFILE_LABEL: Readonly<Record<ProfileId, string>> = Object.freeze({ semon: 'Semon', ariel: 'Ariel' });
