import { PLAYERS, type Player } from '../data/players';

export type PackType = 'gold' | 'star' | 'legend';

export interface PackConfig {
  readonly type: PackType;
  readonly label: string;
  readonly tagline: string;
  readonly cards: number;
  /** Gewichte nach Bewertungsstufe (Tier-Schlüssel siehe TIERS). */
  readonly weights: Readonly<Record<Tier, number>>;
  /** Garantie: mindestens eine Karte, die dieses Prädikat erfüllt. */
  readonly guarantee: { readonly text: string; readonly test: (p: Player) => boolean };
}

export type Tier = 'basis' | 'silber' | 'gold' | 'elite' | 'star' | 'top';

export const TIERS: Readonly<Record<Tier, (p: Player) => boolean>> = {
  basis: (p) => p.ovr < 78,
  silber: (p) => p.ovr >= 78 && p.ovr < 82,
  gold: (p) => p.ovr >= 82 && p.ovr < 86,
  elite: (p) => p.ovr >= 86 && p.ovr < 88,
  star: (p) => p.ovr >= 88 && p.ovr < 90,
  top: (p) => p.ovr >= 90,
};

/** Traumglück: Multiplikator je Tier (verschiebt die Masse deutlich nach oben). */
export const DREAM_LUCK_MULTIPLIER: Readonly<Record<Tier, number>> = {
  basis: 0.35, silber: 0.6, gold: 1, elite: 2.5, star: 4, top: 6,
};

export const PACKS: Readonly<Record<PackType, PackConfig>> = {
  gold: {
    type: 'gold', label: 'Gold-Pack', tagline: 'Gemischte Spieler · mind. 1× 80+', cards: 5,
    weights: { basis: 22, silber: 26, gold: 26, elite: 13, star: 8, top: 5 },
    guarantee: { text: 'Mindestens eine Karte mit 80+', test: (p) => p.ovr >= 80 },
  },
  star: {
    type: 'star', label: 'Star-Pack', tagline: 'Starke Auswahl · mind. 1× 88+', cards: 5,
    weights: { basis: 8, silber: 16, gold: 28, elite: 20, star: 16, top: 12 },
    guarantee: { text: 'Mindestens eine Karte mit 88+', test: (p) => p.ovr >= 88 },
  },
  legend: {
    type: 'legend', label: 'Legenden-Pack', tagline: 'Ikonen · mind. 1 Legende mit 90+', cards: 5,
    weights: { basis: 5, silber: 10, gold: 24, elite: 21, star: 18, top: 22 },
    guarantee: { text: 'Mindestens eine Legende mit 90+', test: (p) => p.cat === 'legend' && p.ovr >= 90 },
  },
};

export const PACK_ORDER: readonly PackType[] = ['gold', 'star', 'legend'];

export const WALKOUT_MIN = 90;
/** Ab dieser Bewertung bekommt auch die zweitbeste Karte einen eigenen Auftritt. */
export const FEATURE_MIN = 86;

const pick = <T,>(arr: readonly T[], rnd: () => number): T => arr[Math.floor(rnd() * arr.length)]!;

const tierOf = (p: Player): Tier => {
  for (const t of Object.keys(TIERS) as Tier[]) if (TIERS[t](p)) return t;
  return 'basis';
};

const weightedTier = (weights: Readonly<Record<Tier, number>>, rnd: () => number): Tier => {
  const entries = (Object.keys(weights) as Tier[]).map((t) => [t, weights[t]] as const);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [t, w] of entries) { r -= w; if (r < 0) return t; }
  return entries[entries.length - 1]![0];
};

/**
 * Zieht ein Pack. Garantie wird zuerst erfüllt, danach gewichtete Tier-Ziehung.
 * Keine doppelte Spieler-ID innerhalb eines Packs. Ergebnis ist in Enthüllungs-
 * Reihenfolge (beste Karte zuletzt).
 */
export const drawPack = (type: PackType, dreamLuck: boolean, rnd: () => number = Math.random): readonly Player[] => {
  const cfg = PACKS[type];
  const weights = { ...cfg.weights };
  if (dreamLuck) for (const t of Object.keys(weights) as Tier[]) weights[t] *= DREAM_LUCK_MULTIPLIER[t];

  // Keine reale Person doppelt im Pack – auch nicht als andere Kartenversion.
  const used = new Set<string>();
  const result: Player[] = [];

  const byTier = new Map<Tier, Player[]>();
  for (const pl of PLAYERS) {
    const t = tierOf(pl);
    if (!byTier.has(t)) byTier.set(t, []);
    byTier.get(t)!.push(pl);
  }

  // Garantie-Karte: ebenfalls tier-gewichtet, aber nur aus Tiers mit passenden Spielern
  const gWeights = { ...weights };
  for (const t of Object.keys(gWeights) as Tier[]) {
    if (!(byTier.get(t) ?? []).some(cfg.guarantee.test)) gWeights[t] = 0;
  }
  const gTier = weightedTier(gWeights, rnd);
  const g = pick((byTier.get(gTier) ?? []).filter(cfg.guarantee.test), rnd);
  used.add(g.person); result.push(g);

  let guard = 0;
  while (result.length < cfg.cards && guard++ < 500) {
    const t = weightedTier(weights, rnd);
    const pool = (byTier.get(t) ?? []).filter((x) => !used.has(x.person));
    if (pool.length === 0) continue;
    const pl = pick(pool, rnd);
    used.add(pl.person); result.push(pl);
  }
  // Notfall-Auffüllung, falls ein Tier leer war (sollte nicht vorkommen)
  while (result.length < cfg.cards) {
    const pool = PLAYERS.filter((x) => !used.has(x.person));
    const pl = pick(pool, rnd); used.add(pl.person); result.push(pl);
  }

  // Enthüllung: aufsteigend, beste Karte zuletzt – mehr Spannung
  return [...result].sort((a, b) => a.ovr - b.ovr);
};

export const bestOf = (cards: readonly Player[]): Player =>
  cards.reduce((b, c) => (c.ovr > b.ovr ? c : b), cards[0]!);

/** Demo-Walkout: eine besonders starke Karte, ohne Sammlung/Duell zu verändern. */
export const demoWalkoutPack = (rnd: () => number = Math.random): readonly Player[] => {
  const top = PLAYERS.filter((p) => p.ovr >= 93);
  const star = pick(top, rnd);
  const rest = PLAYERS.filter((p) => p.ovr >= 82 && p.ovr < 90 && p.person !== star.person);
  const chosen: Player[] = [];
  const used = new Set<string>();
  while (chosen.length < 4) { const c = pick(rest, rnd); if (!used.has(c.id)) { used.add(c.id); chosen.push(c); } }
  return [...chosen.sort((a, b) => a.ovr - b.ovr), star];
};
