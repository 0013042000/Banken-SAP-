import { PLAYER_BY_ID, PLAYERS, type Player, type Position } from '../../data/players';
import type { ProfileId } from '../../football/contract';
import { fits, FORMATIONS, isExact, ROLE_ACCEPTS, ROLE_LABEL, type FormationId } from '../team';
import {
  BENCH_ROLES, BENCH_SIZE, DRAFT_TIERS, FLAT_WEIGHTS, LINE_ACCEPTS, LINE_LABEL, LINE_OF_ROLE, OFFER_SIZE, RESERVE_ROLES,
  RESERVE_SIZE, SQUAD_SIZE, START_SIZE, TIER_FLOORS, VARIANTS, type DraftTier, type LineId, type VariantConfig, type VariantId,
} from './config';
import { pickOne, pickWeighted, type Rnd } from './random';

// ---- Datenmodell ----

export const SLOT_GROUPS = ['start', 'bench', 'reserve'] as const;
export type SlotGroup = (typeof SLOT_GROUPS)[number];

export interface SlotRef {
  readonly group: SlotGroup;
  readonly index: number;
}

/** Karten-ID je Platz; null = noch frei. */
export type Lineup = readonly (string | null)[];

/** Gemeinsame Form von laufendem und fertigem Kader. Gespeichert werden nur Karten-IDs. */
export interface Squad {
  readonly id: string;
  readonly profile: ProfileId;
  readonly variant: VariantId;
  readonly formation: FormationId;
  readonly createdAt: number;
  /** Gewählter Kapitän; steht nach dem Zuordnen auch in `start`. */
  readonly captainId: string | null;
  readonly start: Lineup;
  readonly bench: Lineup;
  readonly reserve: Lineup;
}

interface OfferBase {
  readonly candidates: readonly string[];
  /** 0 = regulär gezogen; höher = Notfallstufe (breite Linie, Variante gelockert). */
  readonly relaxed: number;
}
export interface CaptainOffer extends OfferBase { readonly kind: 'captain' }
export interface SlotOffer extends OfferBase { readonly kind: 'slot'; readonly slot: SlotRef }
export type Offer = CaptainOffer | SlotOffer;

/** Laufender Draft. Das offene Angebot gehört zum Zustand, damit Neuladen nicht neu würfelt. */
export interface DraftState extends Squad {
  readonly offer: Offer | null;
}

export const DRAFT_PHASES = ['captain', 'captainPlace', 'start', 'bench', 'reserve', 'done'] as const;
export type DraftPhase = (typeof DRAFT_PHASES)[number];

export const DRAFT_ERRORS = ['offer-open', 'no-offer', 'wrong-phase', 'slot-taken', 'unknown-slot', 'not-offered', 'not-fitting'] as const;
export type DraftError = (typeof DRAFT_ERRORS)[number];

export type DraftResult =
  | { readonly ok: true; readonly state: DraftState }
  | { readonly ok: false; readonly error: DraftError };

export interface SlotInfo {
  readonly ref: SlotRef;
  /** Kurzbeschriftung auf dem Platz, z. B. „ZM“ oder „Abwehr“. */
  readonly short: string;
  /** Ausführliche Bezeichnung, z. B. „Zentrales Mittelfeld“ oder „Bank · Abwehr“. */
  readonly label: string;
  /** Regulär zulässige Positionen. */
  readonly positions: readonly Position[];
  readonly line: LineId;
}

export interface DraftSeed {
  readonly id: string;
  readonly profile: ProfileId;
  readonly variant: VariantId;
  readonly formation: FormationId;
  readonly now: number;
  readonly rnd: Rnd;
}

export interface RatingInfo {
  /** Gerundeter Durchschnitt; null ohne Spieler. */
  readonly rating: number | null;
  readonly count: number;
  /** true, solange noch Spieler fehlen. */
  readonly provisional: boolean;
}

// ---- Plätze ----

const GROUP_SIZE: Readonly<Record<SlotGroup, number>> = { start: START_SIZE, bench: BENCH_SIZE, reserve: RESERVE_SIZE };
const GROUP_TITLE: Readonly<Record<SlotGroup, string>> = { start: 'Startelf', bench: 'Bank', reserve: 'Reserve' };
const LOWEST_TIER: DraftTier = DRAFT_TIERS[0];

export const slotKey = (ref: SlotRef): string => `${ref.group}:${ref.index}`;
export const sameSlot = (a: SlotRef, b: SlotRef): boolean => a.group === b.group && a.index === b.index;
export const slotsOf = (group: SlotGroup): SlotRef[] => Array.from({ length: GROUP_SIZE[group] }, (_, index) => ({ group, index }));
export const groupTitle = (group: SlotGroup): string => GROUP_TITLE[group];

const lineInfo = (ref: SlotRef, line: LineId | undefined): SlotInfo | undefined =>
  line && { ref, short: LINE_LABEL[line], label: `${GROUP_TITLE[ref.group]} · ${LINE_LABEL[line]}`, positions: LINE_ACCEPTS[line], line };

const INFO_BY_GROUP: Readonly<Record<SlotGroup, (formation: FormationId, ref: SlotRef) => SlotInfo | undefined>> = {
  start: (formation, ref) => {
    const def = FORMATIONS[formation][ref.index];
    return def && { ref, short: def.role, label: ROLE_LABEL[def.role], positions: ROLE_ACCEPTS[def.role], line: LINE_OF_ROLE[def.role] };
  },
  bench: (_formation, ref) => lineInfo(ref, BENCH_ROLES[ref.index]),
  reserve: (_formation, ref) => lineInfo(ref, RESERVE_ROLES[ref.index]),
};

/** Beschreibung eines Platzes; undefined bei unbekanntem Platz. */
export const slotInfo = (formation: FormationId, ref: SlotRef): SlotInfo | undefined =>
  Number.isInteger(ref.index) && ref.index >= 0 ? INFO_BY_GROUP[ref.group](formation, ref) : undefined;

/** Reguläre Positionen plus die breite Linie des Platzes (Notfallstufe und Prüfung gespeicherter Daten). */
export const widePositions = (info: SlotInfo): readonly Position[] => [...new Set([...info.positions, ...LINE_ACCEPTS[info.line]])];

// ---- Abfragen ----

const known = (id: string | null): Player | undefined => (id === null ? undefined : PLAYER_BY_ID.get(id));
const isPlayer = (p: Player | undefined): p is Player => p !== undefined;

export const playerAt = (squad: Squad, ref: SlotRef): Player | undefined => known(squad[ref.group][ref.index] ?? null);
export const squadIds = (squad: Squad): string[] => SLOT_GROUPS.flatMap((g) => squad[g]).filter((id): id is string => id !== null);
export const squadPlayers = (squad: Squad): Player[] => squadIds(squad).map((id) => PLAYER_BY_ID.get(id)).filter(isPlayer);
export const captainOf = (squad: Squad): Player | undefined => known(squad.captainId);
export const draftedCount = (squad: Squad): number => squadIds(squad).length;
export const isComplete = (squad: Squad): boolean => draftedCount(squad) === SQUAD_SIZE;

/** Alle vergebenen Personen – auch der gewählte, aber noch nicht zugeordnete Kapitän. */
export const takenPersons = (squad: Squad): Set<string> =>
  new Set([...squadPlayers(squad), captainOf(squad)].filter(isPlayer).map((p) => p.person));

const PHASE_RULES: readonly (readonly [applies: (s: Squad) => boolean, phase: DraftPhase])[] = [
  [(s) => s.captainId === null, 'captain'],
  [(s) => !s.start.includes(s.captainId), 'captainPlace'],
  [(s) => s.start.includes(null), 'start'],
  [(s) => s.bench.includes(null), 'bench'],
  [(s) => s.reserve.includes(null), 'reserve'],
];

/** Aktueller Schritt: Kapitän wählen, Kapitän zuordnen, Startelf, Bank, Reserve, fertig. */
export const phaseOf = (squad: Squad): DraftPhase => PHASE_RULES.find(([applies]) => applies(squad))?.[1] ?? 'done';

const isSlotGroup = (phase: DraftPhase): phase is SlotGroup => SLOT_GROUPS.some((g) => g === phase);

/** Erster freier Platz des aktuellen Abschnitts; null, wenn gerade kein Platz geöffnet werden kann. */
export const nextOpenSlot = (state: DraftState): SlotRef | null => {
  const phase = phaseOf(state);
  if (state.offer || !isSlotGroup(phase)) return null;
  const index = state[phase].indexOf(null);
  return index >= 0 ? { group: phase, index } : null;
};

/** Startplätze, auf die der gewählte Kapitän gesetzt werden darf. */
export const captainTargets = (state: DraftState): number[] => {
  const captain = captainOf(state);
  if (!captain || phaseOf(state) !== 'captainPlace') return [];
  return FORMATIONS[state.formation].flatMap((slot, i) => (fits(captain, slot.role) && state.start[i] === null ? [i] : []));
};

// ---- Wertungen ----

const average = (players: readonly Player[], full: number): RatingInfo => ({
  rating: players.length ? Math.round(players.reduce((sum, p) => sum + p.ovr, 0) / players.length) : null,
  count: players.length,
  provisional: players.length < full,
});

/** Teamwertung: gerundeter Durchschnitt der Startelf. */
export const teamRatingOf = (squad: Squad): RatingInfo => average(squad.start.map(known).filter(isPlayer), START_SIZE);
/** Kaderwertung: gerundeter Durchschnitt aller bisher gedrafteten Spieler. */
export const squadRatingOf = (squad: Squad): RatingInfo => average(squadPlayers(squad), SQUAD_SIZE);
/** Anzahl der Startspieler, die genau auf ihrer Kartenposition stehen. */
export const exactCountOf = (squad: Squad): number =>
  FORMATIONS[squad.formation].filter((slot, i) => {
    const p = known(squad.start[i] ?? null);
    return p !== undefined && isExact(p, slot.role);
  }).length;

// ---- Angebote ----

interface PoolLevel {
  /** Wird erst berechnet, wenn die Stufe wirklich gebraucht wird. */
  readonly pool: () => readonly Player[];
  readonly weights: Readonly<Record<DraftTier, number>>;
}
interface Draw {
  readonly picked: readonly Player[];
  readonly rest: readonly Player[];
}
interface Fill {
  readonly picked: readonly Player[];
  readonly relaxed: number;
}

export const tierOf = (p: Player): DraftTier => TIER_FLOORS.find(([, minOvr]) => p.ovr >= minOvr)?.[0] ?? LOWEST_TIER;

/** Gehört die Karte zum regulären Bestand der Variante? */
export const variantAllows = (variant: VariantId, p: Player): boolean => {
  const cfg: VariantConfig = VARIANTS[variant];
  return cfg.categories.includes(p.cat) && cfg.weights[tierOf(p)] > 0;
};

/** Eine Karte: erst die Bewertungsstufe nach Gewicht, dann gleichverteilt innerhalb der Stufe. */
const drawOne = (pool: readonly Player[], weights: Readonly<Record<DraftTier, number>>, rnd: Rnd): Player | undefined => {
  const present = DRAFT_TIERS.filter((tier) => pool.some((p) => tierOf(p) === tier));
  const tier = pickWeighted(present.map((t) => [t, weights[t]] as const), rnd);
  return pickOne(tier === undefined ? pool : pool.filter((p) => tierOf(p) === tier), rnd);
};

/** Zieht bis zu `count` Karten verschiedener Personen. */
const drawDistinct = (pool: readonly Player[], weights: Readonly<Record<DraftTier, number>>, count: number, rnd: Rnd): readonly Player[] =>
  Array.from({ length: count }).reduce<Draw>((acc) => {
    const next = drawOne(acc.rest, weights, rnd);
    return next ? { picked: [...acc.picked, next], rest: acc.rest.filter((p) => p.person !== next.person) } : acc;
  }, { picked: [], rest: pool }).picked;

/**
 * Füllt ein Angebot Stufe für Stufe auf. Regulär reicht die erste Stufe; die weiteren
 * sichern ab, dass ein Platz nie unbesetzbar wird.
 */
const fillOffer = (levels: readonly PoolLevel[], taken: ReadonlySet<string>, rnd: Rnd): OfferBase => {
  const fill = levels.reduce<Fill>((acc, level, index) => {
    const missing = OFFER_SIZE - acc.picked.length;
    if (!missing) return acc;
    const used = new Set([...taken, ...acc.picked.map((p) => p.person)]);
    const added = drawDistinct(level.pool().filter((p) => !used.has(p.person)), level.weights, missing, rnd);
    return added.length ? { picked: [...acc.picked, ...added], relaxed: index } : acc;
  }, { picked: [], relaxed: 0 });
  return { candidates: fill.picked.map((p) => p.id), relaxed: fill.relaxed };
};

/** Reihenfolge der Absicherung: passende Position, breite Linie, Variante gelockert, beides gelockert. */
const slotLevels = (variant: VariantId, info: SlotInfo): readonly PoolLevel[] => {
  const strict = (): readonly Player[] => PLAYERS.filter((p) => info.positions.includes(p.pos));
  const broad = (): readonly Player[] => PLAYERS.filter((p) => widePositions(info).includes(p.pos));
  const weights = VARIANTS[variant].weights;
  return [
    { pool: () => strict().filter((p) => variantAllows(variant, p)), weights },
    { pool: () => broad().filter((p) => variantAllows(variant, p)), weights },
    { pool: strict, weights: FLAT_WEIGHTS },
    { pool: broad, weights: FLAT_WEIGHTS },
  ];
};

/** Kapitäne: starke Karten der Variante mit mindestens einem passenden Startplatz. */
const captainLevels = (variant: VariantId, formation: FormationId): readonly PoolLevel[] => {
  const placeable = (): readonly Player[] => PLAYERS.filter((p) => FORMATIONS[formation].some((slot) => fits(p, slot.role)));
  const inVariant = (): readonly Player[] => placeable().filter((p) => variantAllows(variant, p));
  return [
    { pool: () => inVariant().filter((p) => p.ovr >= VARIANTS[variant].captainMinOvr), weights: FLAT_WEIGHTS },
    { pool: inVariant, weights: FLAT_WEIGHTS },
    { pool: placeable, weights: FLAT_WEIGHTS },
  ];
};

// ---- Zustandsübergänge ----

const fail = (error: DraftError): DraftResult => ({ ok: false, error });
const next = (state: DraftState): DraftResult => ({ ok: true, state });
const emptyLineup = (size: number): Lineup => Array.from({ length: size }, () => null);
const withSlot = (state: DraftState, ref: SlotRef, id: string): DraftState =>
  ({ ...state, [ref.group]: state[ref.group].map((current, i) => (i === ref.index ? id : current)), offer: null });

/** Neuer Draft: Das Kapitänsangebot wird sofort gezogen und gehört zum gespeicherten Zustand. */
export const createDraft = (seed: DraftSeed): DraftState => ({
  id: seed.id, profile: seed.profile, variant: seed.variant, formation: seed.formation, createdAt: seed.now,
  captainId: null,
  start: emptyLineup(START_SIZE), bench: emptyLineup(BENCH_SIZE), reserve: emptyLineup(RESERVE_SIZE),
  offer: { kind: 'captain', ...fillOffer(captainLevels(seed.variant, seed.formation), new Set(), seed.rnd) },
});

export const chooseCaptain = (state: DraftState, playerId: string): DraftResult => {
  if (state.offer?.kind !== 'captain') return fail('no-offer');
  if (!state.offer.candidates.includes(playerId)) return fail('not-offered');
  return next({ ...state, captainId: playerId, offer: null });
};

export const placeCaptain = (state: DraftState, startIndex: number): DraftResult => {
  const captain = captainOf(state);
  if (!captain || phaseOf(state) !== 'captainPlace') return fail('wrong-phase');
  const slot = FORMATIONS[state.formation][startIndex];
  if (!slot) return fail('unknown-slot');
  if (state.start[startIndex] !== null) return fail('slot-taken');
  if (!fits(captain, slot.role)) return fail('not-fitting');
  return next(withSlot(state, { group: 'start', index: startIndex }, captain.id));
};

/** Öffnet einen freien Platz des aktuellen Abschnitts. Solange ein Angebot offen ist, bleibt jeder andere Platz zu. */
export const openSlot = (state: DraftState, ref: SlotRef, rnd: Rnd): DraftResult => {
  if (state.offer) return fail('offer-open');
  if (phaseOf(state) !== ref.group) return fail('wrong-phase');
  const info = slotInfo(state.formation, ref);
  if (!info || ref.index >= state[ref.group].length) return fail('unknown-slot');
  if (state[ref.group][ref.index] !== null) return fail('slot-taken');
  return next({ ...state, offer: { kind: 'slot', slot: ref, ...fillOffer(slotLevels(state.variant, info), takenPersons(state), rnd) } });
};

/** Übernimmt genau einen Kandidaten des offenen Angebots fest auf dessen Platz. */
export const pickCandidate = (state: DraftState, playerId: string): DraftResult => {
  if (state.offer?.kind !== 'slot') return fail('no-offer');
  if (!state.offer.candidates.includes(playerId)) return fail('not-offered');
  return next(withSlot(state, state.offer.slot, playerId));
};

// ---- Prüfung gespeicherter Daten ----

const hasDistinctPersons = (players: readonly Player[]): boolean => new Set(players.map((p) => p.person)).size === players.length;
const isEmpty = (lineup: Lineup): boolean => lineup.every((id) => id === null);
const isFull = (lineup: Lineup): boolean => !lineup.includes(null);

const slotIsLegal = (squad: Squad, ref: SlotRef): boolean => {
  const id = squad[ref.group][ref.index] ?? null;
  const info = slotInfo(squad.formation, ref);
  const p = known(id);
  return id === null || (info !== undefined && p !== undefined && widePositions(info).includes(p.pos));
};

/**
 * Hält ein Kader alle Regeln ein? Bekannte Karten, jede Person einmal, zulässige Positionen
 * (Torhüter nur im Tor) und die feste Reihenfolge Kapitän → Startelf → Bank → Reserve.
 */
export const isLegalSquad = (squad: Squad): boolean => {
  const sized = SLOT_GROUPS.every((g) => squad[g].length === GROUP_SIZE[g]);
  if (!sized || (squad.captainId !== null && !captainOf(squad))) return false;
  const ids = squadIds(squad);
  const players = squadPlayers(squad);
  const captainPlaced = squad.captainId !== null && squad.start.includes(squad.captainId);
  return players.length === ids.length
    && hasDistinctPersons(players)
    && SLOT_GROUPS.flatMap(slotsOf).every((ref) => slotIsLegal(squad, ref))
    && (captainPlaced || isEmpty(squad.start))
    && (isFull(squad.start) || isEmpty(squad.bench))
    && (isFull(squad.bench) || isEmpty(squad.reserve));
};

const OFFER_FITS: Readonly<{ [K in Offer['kind']]: (state: DraftState, offer: Extract<Offer, { kind: K }>, players: readonly Player[]) => boolean }> = {
  captain: (state) => phaseOf(state) === 'captain',
  slot: (state, offer, players) => {
    const info = slotInfo(state.formation, offer.slot);
    return info !== undefined
      && phaseOf(state) === offer.slot.group
      && state[offer.slot.group][offer.slot.index] === null
      && players.every((p) => widePositions(info).includes(p.pos));
  },
};

/** Passt ein gespeichertes Angebot noch zum Zustand (Abschnitt, freier Platz, zulässige und freie Kandidaten)? */
export const isLegalOffer = (state: DraftState, offer: Offer): boolean => {
  const players = offer.candidates.map((id) => PLAYER_BY_ID.get(id)).filter(isPlayer);
  const taken = takenPersons(state);
  // Die Tabelle ordnet jeder Angebotsart genau ihre Prüfung zu; TypeScript kann das über den Indexzugriff nicht nachvollziehen.
  const fitsState = OFFER_FITS[offer.kind] as (state: DraftState, offer: Offer, players: readonly Player[]) => boolean;
  return players.length === offer.candidates.length
    && players.length >= 1
    && players.length <= OFFER_SIZE
    && hasDistinctPersons(players)
    && players.every((p) => !taken.has(p.person))
    && fitsState(state, offer, players);
};
