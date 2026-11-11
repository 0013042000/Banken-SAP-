/** Brücke zwischen Karten (Player) und Simulation (PlayerSpec): Aufstellung, Schnellstart, Gegnerwahl. */
import { PLAYERS, shortName, statsFor, type Player, type Position } from '../data/players';
import type { SquadOption } from './contract';
import { NAME_MAX, STAT_MAX, STAT_MIN, TEAM_SIZE, type PlayerSpec, type TeamSpec } from './sim/index.ts';

/** Gewählte Fünf: ein Spieler im Tor, vier im Feld. */
export interface Selection {
  readonly keeperId: string | null;
  readonly fieldIds: readonly string[];
}

export const FIELD_COUNT = TEAM_SIZE - 1;
export const KEEPER_POS: Position = 'TW';
export const QUICK_SQUAD_ID = 'schnellstart';

/** Von defensiv (0) nach offensiv (8) – bestimmt, wer hinten, außen und vorne spielt. */
const LINE_ORDER: readonly (readonly Position[])[] = [
  ['IV'], ['LV', 'RV'], ['ZDM'], ['TW', 'ZM'], ['LM', 'RM'], ['ZOM'], ['LF', 'RF'], ['MS'], ['ST'],
];
const rankOf = (pos: Position): number => LINE_ORDER.findIndex((group) => group.includes(pos));
const DEFENDER_MAX_RANK = rankOf('ZDM');
const ATTACKER_MIN_RANK = rankOf('LF');
const LEFT_SIDED: readonly Position[] = ['LV', 'LM', 'LF'];
const RIGHT_SIDED: readonly Position[] = ['RV', 'RM', 'RF'];

/** Feldspieler im Tor halten deutlich schwächer als echte Torhüter. */
const EMERGENCY_KEEPING_BASE = 22;
const EMERGENCY_KEEPING_SHARE = 0.15;
const KEEPER_AS_FIELD_SKILL = 55;
const KEEPER_STAT_COUNT = 4;

const QUICK_SKIP = 4;
const QUICK_FIELD_SKIP = 10;
const QUICK_KEEPERS = 2;
const QUICK_PER_LINE = 4;
const OPPONENT_POOL = 6;
const HARD_BONUS = 1;
const EASY_MALUS = -2;
const OPPONENT_SHIFT: readonly number[] = [EASY_MALUS, 0, HARD_BONUS];
const OPPONENT_NAMES: readonly string[] = ['FC Flutlicht', 'Dynamo Pixel', 'Sturm Blitz 05', 'Roboter United', 'Eintracht Eckfahne', 'SV Kunstrasen'];

const clampStat = (value: number): number => Math.max(STAT_MIN, Math.min(STAT_MAX, Math.round(value)));
const average = (values: readonly number[]): number => values.reduce((sum, v) => sum + v, 0) / Math.max(1, values.length);
const isKeeperCard = (player: Player): boolean => player.pos === KEEPER_POS;
const byRating = (a: Player, b: Player): number => b.ovr - a.ovr;

const statMap = (player: Player): Readonly<Record<string, number>> =>
  Object.fromEntries(statsFor(player).map((line) => [line.label, line.value]));

const keeperSpec = (player: Player): PlayerSpec => {
  const s = statMap(player);
  const keeping = (s['TWA'] + s['HAN'] + s['REF'] + s['POS']) / KEEPER_STAT_COUNT;
  return {
    id: player.id, name: shortName(player).slice(0, NAME_MAX),
    pace: clampStat(s['SCH']), shot: KEEPER_AS_FIELD_SKILL, pass: clampStat(s['ABS']), dribble: KEEPER_AS_FIELD_SKILL,
    defense: KEEPER_AS_FIELD_SKILL, physical: clampStat(player.ovr), keeping: clampStat(keeping),
  };
};

const fieldSpec = (player: Player): PlayerSpec => {
  const s = statMap(player);
  return {
    id: player.id, name: shortName(player).slice(0, NAME_MAX),
    pace: clampStat(s['TEM']), shot: clampStat(s['SCH']), pass: clampStat(s['PAS']), dribble: clampStat(s['DRI']),
    defense: clampStat(s['DEF']), physical: clampStat(s['PHY']),
    keeping: clampStat(EMERGENCY_KEEPING_BASE + (s['DEF'] + s['PHY']) * EMERGENCY_KEEPING_SHARE),
  };
};

/** Werte einer Karte für die Simulation. Die Kartenwerte kommen unverändert aus `statsFor`. */
export const toSpec = (player: Player): PlayerSpec => (isKeeperCard(player) ? keeperSpec(player) : fieldSpec(player));

export const hasKeeper = (players: readonly Player[]): boolean => players.some(isKeeperCard);
export const isPlayable = (players: readonly Player[]): boolean => players.length >= TEAM_SIZE;

/** Wer als Feldspieler zur Wahl steht: Torhüter nur, wenn sonst keine vier zusammenkommen. */
export const fieldCandidates = (players: readonly Player[], keeperId: string | null): readonly Player[] => {
  const others = players.filter((p) => p.id !== keeperId);
  const outfield = others.filter((p) => !isKeeperCard(p));
  return outfield.length >= FIELD_COUNT ? outfield : others;
};

/** Wer ins Tor darf: Torhüter, und nur wenn es keinen gibt, alle Feldspieler. */
export const keeperCandidates = (players: readonly Player[]): readonly Player[] =>
  (hasKeeper(players) ? players.filter(isKeeperCard) : players);

/** Sortiert vier Feldspieler auf die Plätze hinten, links, rechts, vorne. */
export const arrangeField = (players: readonly Player[]): readonly Player[] => {
  const ordered = [...players].sort((a, b) => rankOf(a.pos) - rankOf(b.pos) || byRating(a, b));
  if (ordered.length !== FIELD_COUNT) return ordered;
  const [back, first, second, front] = ordered;
  const swap = RIGHT_SIDED.includes(first.pos) || (LEFT_SIDED.includes(second.pos) && !LEFT_SIDED.includes(first.pos));
  return swap ? [back, second, first, front] : [back, first, second, front];
};

/** Vorschlag „Beste Fünf“: bester Torwart, dazu ein Abwehrspieler, ein Angreifer und die zwei besten übrigen. */
export const bestFive = (players: readonly Player[]): Selection => {
  if (!isPlayable(players)) return { keeperId: null, fieldIds: [] };
  const keepers = [...players].filter(isKeeperCard).sort(byRating);
  const outfield = [...players].filter((p) => !isKeeperCard(p)).sort(byRating);
  const defender = outfield.find((p) => rankOf(p.pos) <= DEFENDER_MAX_RANK);
  const attacker = outfield.find((p) => rankOf(p.pos) >= ATTACKER_MIN_RANK);
  const core = [defender, attacker].filter((p) => p !== undefined);
  const rest = outfield.filter((p) => !core.includes(p));
  const spareKeepers = keepers.slice(1);
  const field = [...core, ...rest, ...spareKeepers].slice(0, FIELD_COUNT);
  const emergency = [...outfield].filter((p) => !field.includes(p)).sort((a, b) => toSpec(b).keeping - toSpec(a).keeping)[0];
  const keeper = keepers[0] ?? emergency ?? null;
  return { keeperId: keeper?.id ?? null, fieldIds: arrangeField(field).map((p) => p.id) };
};

export const isComplete = (selection: Selection): boolean =>
  selection.keeperId !== null && selection.fieldIds.length === FIELD_COUNT;

/** Die gewählten Karten in Spielreihenfolge (Tor, hinten, links, rechts, vorne) oder null. */
export const selectedPlayers = (players: readonly Player[], selection: Selection): readonly Player[] | null => {
  const byId = new Map(players.map((p) => [p.id, p]));
  const keeper = selection.keeperId === null ? undefined : byId.get(selection.keeperId);
  const field = selection.fieldIds.map((id) => byId.get(id)).filter((p) => p !== undefined);
  const distinct = new Set([selection.keeperId, ...selection.fieldIds]).size === TEAM_SIZE;
  if (!keeper || field.length !== FIELD_COUNT || !distinct) return null;
  return [keeper, ...arrangeField(field)];
};

/** Baut aus fünf Karten (Torwart zuerst) eine Mannschaft für die Simulation. */
export const toTeam = (name: string, five: readonly Player[]): TeamSpec => ({
  name: name.slice(0, NAME_MAX) || 'Mein Team',
  players: five.map(toSpec),
});

export const teamRating = (five: readonly Player[]): number => Math.round(average(five.map((p) => p.ovr)));

const lineOf = (player: Player): 'keeper' | 'back' | 'mid' | 'front' => {
  if (isKeeperCard(player)) return 'keeper';
  const rank = rankOf(player.pos);
  if (rank <= DEFENDER_MAX_RANK) return 'back';
  return rank >= ATTACKER_MIN_RANK ? 'front' : 'mid';
};

const quickPick = (line: ReturnType<typeof lineOf>, skip: number, count: number): readonly Player[] =>
  PLAYERS.filter((p) => lineOf(p) === line).sort(byRating).slice(skip, skip + count);

const QUICK_PLAYERS: readonly Player[] = [
  ...quickPick('keeper', QUICK_SKIP, QUICK_KEEPERS), ...quickPick('back', QUICK_FIELD_SKIP, QUICK_PER_LINE),
  ...quickPick('mid', QUICK_FIELD_SKIP, QUICK_PER_LINE), ...quickPick('front', QUICK_FIELD_SKIP, QUICK_PER_LINE),
];

/** Eingebauter Kader, mit dem man ohne eigene Karten sofort spielen kann. */
export const QUICK_SQUAD: SquadOption = Object.freeze({
  id: QUICK_SQUAD_ID,
  label: 'Schnellstart-Auswahl',
  owner: 'bestand',
  kind: 'team',
  rating: Math.round(average(QUICK_PLAYERS.map((p) => p.ovr))),
  players: QUICK_PLAYERS,
});

const pickNear = (pool: readonly Player[], target: number, random: () => number): Player | undefined => {
  const nearest = [...pool].sort((a, b) => Math.abs(a.ovr - target) - Math.abs(b.ovr - target)).slice(0, OPPONENT_POOL);
  return nearest[Math.floor(random() * nearest.length)];
};

/**
 * Stellt dem Computer eine zufällige Fünf zusammen, die zur eigenen Stärke passt
 * (Torwart, Abwehr, zwei Mittelfeld, Sturm) und keine der eigenen Personen enthält.
 */
export const pickOpponents = (mine: readonly Player[], difficulty: number, random: () => number): readonly Player[] => {
  const target = average(mine.map((p) => p.ovr)) + (OPPONENT_SHIFT[difficulty] ?? 0);
  const lines = ['keeper', 'back', 'mid', 'mid', 'front'] as const;
  return lines.reduce<readonly Player[]>((chosen, line) => {
    const taken = new Set([...mine, ...chosen].map((p) => p.id));
    const free = PLAYERS.filter((p) => !taken.has(p.id));
    const pick = pickNear(free.filter((p) => lineOf(p) === line), target, random) ?? pickNear(free, target, random);
    return pick ? [...chosen, pick] : chosen;
  }, []);
};

export const opponentName = (random: () => number): string =>
  OPPONENT_NAMES[Math.floor(random() * OPPONENT_NAMES.length)] ?? OPPONENT_NAMES[0];
