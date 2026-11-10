import { PLAYER_BY_ID, type Player, type Position } from '../data/players';

export type FormationId = '4-3-3' | '4-4-2';
export type SlotRole = 'TW' | 'LV' | 'IV' | 'RV' | 'ZM' | 'LM' | 'RM' | 'LF' | 'RF' | 'ST';

export interface SlotDef {
  readonly id: string;
  readonly role: SlotRole;
  /** Position auf dem Spielfeld in Prozent (x von links, y von oben; Angriff oben). */
  readonly x: number;
  readonly y: number;
}

/**
 * Zentrale Zuordnung: Welche Spielerpositionen passen auf welchen Aufstellungsplatz?
 * Die erste Position ist die exakte, die weiteren gelten als verwandt und ebenfalls passend.
 */
export const ROLE_ACCEPTS: Readonly<Record<SlotRole, readonly Position[]>> = {
  TW: ['TW'],
  LV: ['LV', 'RV'],
  RV: ['RV', 'LV'],
  IV: ['IV', 'ZDM'],
  ZM: ['ZM', 'ZDM', 'ZOM'],
  LM: ['LM', 'LF', 'RM'],
  RM: ['RM', 'RF', 'LM'],
  LF: ['LF', 'LM', 'RF'],
  RF: ['RF', 'RM', 'LF'],
  ST: ['ST', 'MS'],
};

/** Deutsche Bezeichnung der Aufstellungsplätze. */
export const ROLE_LABEL: Readonly<Record<SlotRole, string>> = {
  TW: 'Tor', LV: 'Linke Abwehr', IV: 'Innenverteidigung', RV: 'Rechte Abwehr', ZM: 'Zentrales Mittelfeld',
  LM: 'Linkes Mittelfeld', RM: 'Rechtes Mittelfeld', LF: 'Linker Flügel', RF: 'Rechter Flügel', ST: 'Sturm',
};

const DEFENCE: readonly SlotDef[] = [
  { id: 'LV', role: 'LV', x: 13, y: 67 },
  { id: 'IV1', role: 'IV', x: 37, y: 71 },
  { id: 'IV2', role: 'IV', x: 63, y: 71 },
  { id: 'RV', role: 'RV', x: 87, y: 67 },
];
const KEEPER: SlotDef = { id: 'TW', role: 'TW', x: 50, y: 90 };

export const FORMATIONS: Readonly<Record<FormationId, readonly SlotDef[]>> = {
  '4-3-3': [
    KEEPER, ...DEFENCE,
    { id: 'ZM1', role: 'ZM', x: 22, y: 44 }, { id: 'ZM2', role: 'ZM', x: 50, y: 48 }, { id: 'ZM3', role: 'ZM', x: 78, y: 44 },
    { id: 'LF', role: 'LF', x: 18, y: 19 }, { id: 'ST', role: 'ST', x: 50, y: 13 }, { id: 'RF', role: 'RF', x: 82, y: 19 },
  ],
  '4-4-2': [
    KEEPER, ...DEFENCE,
    { id: 'LM', role: 'LM', x: 13, y: 41 }, { id: 'ZM1', role: 'ZM', x: 37, y: 46 }, { id: 'ZM2', role: 'ZM', x: 63, y: 46 }, { id: 'RM', role: 'RM', x: 87, y: 41 },
    { id: 'ST1', role: 'ST', x: 35, y: 15 }, { id: 'ST2', role: 'ST', x: 65, y: 15 },
  ],
};

export const FORMATION_IDS: readonly FormationId[] = ['4-3-3', '4-4-2'];
export const DEFAULT_FORMATION: FormationId = '4-3-3';
export const DEFAULT_TEAM_NAME = 'Ariels Dream Team';
export const TEAM_NAME_MAX = 24;
export const TEAM_SIZE = 11;

export interface Team {
  readonly name: string;
  readonly formation: FormationId;
  /** Spieler-ID je Platz in der Reihenfolge von FORMATIONS[formation]; null = leer. */
  readonly lineup: readonly (string | null)[];
}

export const emptyLineup = (): (string | null)[] => Array.from({ length: TEAM_SIZE }, () => null);
export const emptyTeam = (formation: FormationId = DEFAULT_FORMATION, name: string = DEFAULT_TEAM_NAME): Team =>
  ({ name, formation, lineup: emptyLineup() });

/** Passt die Spielerposition laut zentraler Zuordnung auf den Platz? */
export const fits = (p: Player, role: SlotRole): boolean => ROLE_ACCEPTS[role].includes(p.pos);
export const isExact = (p: Player, role: SlotRole): boolean => ROLE_ACCEPTS[role][0] === p.pos;
/**
 * Darf der Spieler dort überhaupt stehen? Torhüter nur im Tor, im Tor nur Torhüter.
 * Feldspieler dürfen manuell auch positionsfremd auf jeden Feldspielerplatz.
 */
export const canPlace = (p: Player, role: SlotRole): boolean => (role === 'TW') === (p.pos === 'TW');

export const slotIndexOf = (team: Team, playerId: string): number => team.lineup.indexOf(playerId);
export const lineupPlayers = (team: Team): Player[] =>
  team.lineup.map((id) => (id ? PLAYER_BY_ID.get(id) : undefined)).filter((p): p is Player => p !== undefined);
export const filledCount = (team: Team): number => team.lineup.filter((id) => id !== null).length;

export const normalizeName = (raw: unknown): string => {
  if (typeof raw !== 'string') return DEFAULT_TEAM_NAME;
  const clean = raw.replace(/\s+/g, ' ').trim().slice(0, TEAM_NAME_MAX);
  return clean.length > 0 ? clean : DEFAULT_TEAM_NAME;
};

/**
 * Bereinigt beliebige (auch beschädigte) Daten zu einem gültigen Team.
 * Entfernt unbekannte, nicht besessene, doppelte und regelwidrig platzierte Spieler.
 */
export const sanitizeTeam = (raw: unknown, owned: ReadonlySet<string>): Team => {
  const obj = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const formation = FORMATION_IDS.includes(obj.formation as FormationId) ? (obj.formation as FormationId) : DEFAULT_FORMATION;
  const slots = FORMATIONS[formation];
  const rawLineup = Array.isArray(obj.lineup) ? (obj.lineup as unknown[]) : [];
  const seen = new Set<string>();
  const lineup = slots.map((slot, i) => {
    const id = rawLineup[i];
    if (typeof id !== 'string' || seen.has(id) || !owned.has(id)) return null;
    const p = PLAYER_BY_ID.get(id);
    if (!p || !canPlace(p, slot.role)) return null;
    seen.add(id);
    return id;
  });
  return { name: normalizeName(obj.name), formation, lineup };
};

export const sameTeam = (a: Team, b: Team): boolean =>
  a.name === b.name && a.formation === b.formation && a.lineup.length === b.lineup.length && a.lineup.every((id, i) => id === b.lineup[i]);

export interface TeamRating {
  readonly count: number;
  /** Durchschnitt der Gesamtbewertungen, gerundet; null bei leerem Team. */
  readonly rating: number | null;
  /** true, solange weniger als elf Spieler aufgestellt sind. */
  readonly provisional: boolean;
}

export const teamRating = (team: Team): TeamRating => {
  const ps = lineupPlayers(team);
  if (ps.length === 0) return { count: 0, rating: null, provisional: true };
  const avg = ps.reduce((s, p) => s + p.ovr, 0) / ps.length;
  return { count: ps.length, rating: Math.round(avg), provisional: ps.length < TEAM_SIZE };
};

/** Stabile Reihenfolge: Bewertung absteigend, dann Name, dann ID. */
export const byRating = (a: Player, b: Player): number =>
  b.ovr - a.ovr || a.name.localeCompare(b.name, 'de') || a.id.localeCompare(b.id);

// ---- Optimale Zuordnung (Ungarische Methode) ----

/** Minimiert die Summe der Kosten; rows <= cols. Liefert je Zeile die gewählte Spalte. */
const hungarian = (cost: readonly (readonly number[])[]): number[] => {
  const n = cost.length;
  const m = n > 0 ? cost[0]!.length : 0;
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  const p = new Array<number>(m + 1).fill(0);
  const way = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(m + 1).fill(Infinity);
    const used = new Array<boolean>(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0]!;
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1]![j - 1]! - u[i0]! - v[j]!;
        if (cur < minv[j]!) { minv[j] = cur; way[j] = j0; }
        if (minv[j]! < delta) { delta = minv[j]!; j1 = j; }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[p[j]!]! += delta; v[j]! -= delta; } else { minv[j]! -= delta; }
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]!; p[j0] = p[j1]!; j0 = j1; } while (j0 !== 0);
  }
  const res = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]! > 0) res[p[j]! - 1] = j - 1;
  return res;
};

/**
 * Gewicht: zuerst möglichst viele Plätze besetzen, dann höchste Summe, dann exakte Position
 * (bei mehreren Möglichkeiten bleibt der stärkere Spieler auf seiner exakten Position), dann stabile Reihenfolge.
 */
const FILL_BONUS = 10_000;
const EXACT_BONUS = 0.01;
const ORDER_EPS = 1e-6;
const FORBIDDEN = 1e9;

/**
 * Beste passende Zuordnung der Kandidaten auf die Plätze einer Formation.
 * Betrachtet die gesamte Mannschaft: Ein vielseitiger Spieler blockiert keinen Platz,
 * wenn dadurch ein anderer vermeidbar leer bliebe. Nicht passend besetzbare Plätze bleiben leer.
 */
export const assignBest = (formation: FormationId, candidates: readonly Player[]): (string | null)[] => {
  const slots = FORMATIONS[formation];
  const unique = [...new Map(candidates.map((p) => [p.id, p])).values()].sort(byRating);
  if (unique.length === 0) return emptyLineup();
  const top = FILL_BONUS + 200;
  const cost = slots.map((slot) => [
    ...unique.map((p, idx) => (fits(p, slot.role) ? top - (FILL_BONUS + p.ovr + (isExact(p, slot.role) ? EXACT_BONUS * (p.ovr / 100) : 0) - idx * ORDER_EPS) : FORBIDDEN)),
    ...slots.map(() => top), // Platzhalter-Spalten: Platz bleibt leer
  ]);
  const chosen = hungarian(cost);
  return slots.map((slot, i) => {
    const col = chosen[i]!;
    const p = col >= 0 && col < unique.length ? unique[col]! : undefined;
    return p && fits(p, slot.role) ? p.id : null;
  });
};

export interface AutoResult {
  readonly lineup: (string | null)[];
  /** Plätze, für die kein passender Spieler vorhanden war. */
  readonly missing: readonly SlotDef[];
}

export const autoLineup = (formation: FormationId, ownedPlayers: readonly Player[]): AutoResult => {
  const lineup = assignBest(formation, ownedPlayers);
  return { lineup, missing: FORMATIONS[formation].filter((_, i) => lineup[i] === null) };
};

export interface FormationChange {
  readonly team: Team;
  /** Spieler, die in der neuen Formation keinen passenden Platz gefunden haben (bleiben in der Sammlung). */
  readonly dropped: readonly Player[];
  /** Plätze, die neu besetzt werden müssen. */
  readonly open: readonly SlotDef[];
}

/** Formationswechsel: übernimmt aufgestellte Spieler auf passende Plätze, ohne zu duplizieren. */
export const changeFormation = (team: Team, to: FormationId): FormationChange => {
  if (team.formation === to) return { team, dropped: [], open: FORMATIONS[to].filter((_, i) => team.lineup[i] === null) };
  const current = lineupPlayers(team);
  const lineup = assignBest(to, current);
  const kept = new Set(lineup.filter((id): id is string => id !== null));
  return {
    team: { ...team, formation: to, lineup },
    dropped: current.filter((p) => !kept.has(p.id)).sort(byRating),
    open: FORMATIONS[to].filter((_, i) => lineup[i] === null),
  };
};

/**
 * Setzt einen Spieler auf einen Platz. Steht er bereits im Team, wird er verschoben
 * (bzw. mit dem bisherigen Spieler des Zielplatzes getauscht) – nie dupliziert.
 * Regelwidrige Einsätze (Torwartregel, unbekannte ID) lassen das Team unverändert.
 */
export const placePlayer = (team: Team, slotIndex: number, playerId: string): Team => {
  const slots = FORMATIONS[team.formation];
  const slot = slots[slotIndex];
  const p = PLAYER_BY_ID.get(playerId);
  if (!slot || !p || !canPlace(p, slot.role)) return team;
  const from = slotIndexOf(team, playerId);
  if (from === slotIndex) return team;
  const lineup = [...team.lineup];
  const previous = lineup[slotIndex] ?? null;
  lineup[slotIndex] = playerId;
  if (from >= 0) {
    const prevPlayer = previous ? PLAYER_BY_ID.get(previous) : undefined;
    lineup[from] = prevPlayer && canPlace(prevPlayer, slots[from]!.role) ? previous : null;
  }
  return { ...team, lineup };
};

export const removeAt = (team: Team, slotIndex: number): Team => {
  if (slotIndex < 0 || slotIndex >= team.lineup.length || team.lineup[slotIndex] === null) return team;
  const lineup = [...team.lineup];
  lineup[slotIndex] = null;
  return { ...team, lineup };
};

export const clearLineup = (team: Team): Team => ({ ...team, lineup: emptyLineup() });
