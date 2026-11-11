import { PLAYER_BY_ID, type Player, type Position } from '../data/players';

export type FormationId = '4-3-3' | '4-4-2' | '4-2-3-1' | '3-5-2' | '4-1-2-1-2';
export type SlotRole = 'TW' | 'LV' | 'IV' | 'RV' | 'ZDM' | 'ZM' | 'ZOM' | 'LM' | 'RM' | 'LF' | 'RF' | 'ST';

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
  ZDM: ['ZDM', 'ZM'],
  ZM: ['ZM', 'ZDM', 'ZOM'],
  ZOM: ['ZOM', 'ZM', 'MS'],
  LM: ['LM', 'LF', 'RM'],
  RM: ['RM', 'RF', 'LM'],
  LF: ['LF', 'LM', 'RF'],
  RF: ['RF', 'RM', 'LF'],
  ST: ['ST', 'MS'],
};

/** Deutsche Bezeichnung der Aufstellungsplätze. */
export const ROLE_LABEL: Readonly<Record<SlotRole, string>> = {
  TW: 'Tor', LV: 'Linke Abwehr', IV: 'Innenverteidigung', RV: 'Rechte Abwehr', ZDM: 'Defensives Mittelfeld',
  ZM: 'Zentrales Mittelfeld', ZOM: 'Offensives Mittelfeld',
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
  '4-2-3-1': [
    KEEPER, ...DEFENCE,
    { id: 'ZDM1', role: 'ZDM', x: 36, y: 52 }, { id: 'ZDM2', role: 'ZDM', x: 64, y: 52 },
    { id: 'LF', role: 'LF', x: 16, y: 30 }, { id: 'ZOM', role: 'ZOM', x: 50, y: 33 }, { id: 'RF', role: 'RF', x: 84, y: 30 },
    { id: 'ST', role: 'ST', x: 50, y: 12 },
  ],
  '3-5-2': [
    KEEPER,
    { id: 'IV1', role: 'IV', x: 24, y: 70 }, { id: 'IV2', role: 'IV', x: 50, y: 71 }, { id: 'IV3', role: 'IV', x: 76, y: 70 },
    { id: 'LM', role: 'LM', x: 11, y: 38 }, { id: 'ZM1', role: 'ZM', x: 30.5, y: 46 }, { id: 'ZDM', role: 'ZDM', x: 50, y: 52 },
    { id: 'ZM2', role: 'ZM', x: 69.5, y: 46 }, { id: 'RM', role: 'RM', x: 89, y: 38 },
    { id: 'ST1', role: 'ST', x: 35, y: 15 }, { id: 'ST2', role: 'ST', x: 65, y: 15 },
  ],
  '4-1-2-1-2': [
    KEEPER, ...DEFENCE,
    { id: 'ZDM', role: 'ZDM', x: 50, y: 52 }, { id: 'ZM1', role: 'ZM', x: 27, y: 42 }, { id: 'ZM2', role: 'ZM', x: 73, y: 42 },
    { id: 'ZOM', role: 'ZOM', x: 50, y: 31 },
    { id: 'ST1', role: 'ST', x: 32, y: 13 }, { id: 'ST2', role: 'ST', x: 68, y: 13 },
  ],
};

export const FORMATION_IDS: readonly FormationId[] = ['4-3-3', '4-4-2', '4-2-3-1', '3-5-2', '4-1-2-1-2'];
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
/** Platz, auf dem dieselbe reale Person steht – auch mit einer anderen Kartenversion. */
export const slotIndexOfPerson = (team: Team, person: string): number =>
  team.lineup.findIndex((id) => id !== null && PLAYER_BY_ID.get(id)?.person === person);
export const lineupPlayers = (team: Team): Player[] =>
  team.lineup.map((id) => (id ? PLAYER_BY_ID.get(id) : undefined)).filter((p): p is Player => p !== undefined);
export const filledCount = (team: Team): number => team.lineup.filter((id) => id !== null).length;

export const normalizeName = (raw: unknown, fallback: string = DEFAULT_TEAM_NAME): string => {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.replace(/\s+/g, ' ').trim().slice(0, TEAM_NAME_MAX);
  return clean.length > 0 ? clean : fallback;
};

/**
 * Bereinigt beliebige (auch beschädigte) Daten zu einem gültigen Team.
 * Entfernt unbekannte, nicht besessene, doppelte und regelwidrig platzierte Spieler.
 */
export const sanitizeTeam = (raw: unknown, owned: ReadonlySet<string>, fallbackName: string = DEFAULT_TEAM_NAME): Team => {
  const obj = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const formation = FORMATION_IDS.includes(obj.formation as FormationId) ? (obj.formation as FormationId) : DEFAULT_FORMATION;
  const slots = FORMATIONS[formation];
  const rawLineup = Array.isArray(obj.lineup) ? (obj.lineup as unknown[]) : [];
  const seen = new Set<string>();
  const lineup = slots.map((slot, i) => {
    const id = rawLineup[i];
    if (typeof id !== 'string' || !owned.has(id)) return null;
    const p = PLAYER_BY_ID.get(id);
    if (!p || seen.has(p.person) || !canPlace(p, slot.role)) return null;
    seen.add(p.person);
    return id;
  });
  return { name: normalizeName(obj.name, fallbackName), formation, lineup };
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
  // Jede reale Person höchstens einmal: von mehreren Kartenversionen zählt die beste.
  const bestByPerson = new Map<string, Player>();
  for (const p of [...candidates].sort(byRating)) if (!bestByPerson.has(p.person)) bestByPerson.set(p.person, p);
  const unique = [...bestByPerson.values()].sort(byRating);
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
  // Dieselbe Person (auch als andere Kartenversion) gilt als bereits aufgestellt und wird verschoben.
  const from = slotIndexOfPerson(team, p.person);
  if (from === slotIndex && team.lineup[slotIndex] === playerId) return team;
  const lineup = [...team.lineup];
  const previous = lineup[slotIndex] ?? null;
  lineup[slotIndex] = playerId;
  if (from >= 0 && from !== slotIndex) {
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

// ---- Eigene Mannschaften für Semon und Ariel, vorhandenes gemeinsames Team bleibt als Bestandsteam ----

export type TeamOwner = 'semon' | 'ariel' | 'bestand';
export const PROFILE_OWNERS: readonly TeamOwner[] = ['semon', 'ariel'];
export const OWNER_LABEL: Readonly<Record<TeamOwner, string>> = { semon: 'Semon', ariel: 'Ariel', bestand: 'Gemeinsam' };
export const DEFAULT_TEAM_NAMES: Readonly<Record<TeamOwner, string>> = {
  semon: 'Semons Team', ariel: 'Ariels Dream Team', bestand: 'Gemeinsames Team',
};

export interface TeamBook {
  readonly active: TeamOwner;
  /** semon und ariel sind immer vorhanden; bestand nur, wenn ein altes gemeinsames Team übernommen wurde. */
  readonly teams: Readonly<{ semon: Team; ariel: Team; bestand?: Team }>;
}

const isObj = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Lädt die Mannschaften. Gibt es noch keinen neuen Speicherstand, wird ein vorhandenes
 * gemeinsames Team (altes Format) als Bestandsteam übernommen statt gelöscht.
 */
export const sanitizeTeamBook = (rawBook: unknown, rawLegacyTeam: unknown, owned: ReadonlySet<string>): TeamBook => {
  if (isObj(rawBook) && isObj(rawBook.teams)) {
    const t = rawBook.teams;
    const bestand = isObj(t.bestand) ? sanitizeTeam(t.bestand, owned, DEFAULT_TEAM_NAMES.bestand) : undefined;
    const active: TeamOwner = rawBook.active === 'ariel' ? 'ariel' : rawBook.active === 'bestand' && bestand ? 'bestand' : 'semon';
    return {
      active,
      teams: {
        semon: sanitizeTeam(t.semon, owned, DEFAULT_TEAM_NAMES.semon),
        ariel: sanitizeTeam(t.ariel, owned, DEFAULT_TEAM_NAMES.ariel),
        ...(bestand ? { bestand } : {}),
      },
    };
  }
  const fresh = { semon: emptyTeam(DEFAULT_FORMATION, DEFAULT_TEAM_NAMES.semon), ariel: emptyTeam(DEFAULT_FORMATION, DEFAULT_TEAM_NAMES.ariel) };
  if (isObj(rawLegacyTeam)) {
    const legacy = sanitizeTeam(rawLegacyTeam, owned, DEFAULT_TEAM_NAMES.bestand);
    const customName = legacy.name !== DEFAULT_TEAM_NAME && legacy.name !== DEFAULT_TEAM_NAMES.bestand;
    if (filledCount(legacy) > 0 || customName) {
      const name = legacy.name === DEFAULT_TEAM_NAME ? DEFAULT_TEAM_NAMES.bestand : legacy.name;
      return { active: 'bestand', teams: { ...fresh, bestand: { ...legacy, name } } };
    }
  }
  return { active: 'semon', teams: fresh };
};

export const teamOf = (book: TeamBook, owner: TeamOwner): Team => book.teams[owner] ?? book.teams.semon;

/**
 * Entfernt nicht mehr besessene Spieler aus allen Mannschaften (z. B. nach dem Zurücksetzen der Sammlung).
 * Namen bleiben wie eingegeben. Liefert dasselbe Objekt zurück, wenn sich nichts ändert.
 */
export const pruneBook = (book: TeamBook, owned: ReadonlySet<string>): TeamBook => {
  const prune = (t: Team): Team => { const clean = { ...sanitizeTeam(t, owned, t.name), name: t.name }; return sameTeam(clean, t) ? t : clean; };
  const semon = prune(book.teams.semon);
  const ariel = prune(book.teams.ariel);
  const bestand = book.teams.bestand ? prune(book.teams.bestand) : undefined;
  if (semon === book.teams.semon && ariel === book.teams.ariel && bestand === book.teams.bestand) return book;
  return { ...book, teams: { semon, ariel, ...(bestand ? { bestand } : {}) } };
};
export const ownersOf = (book: TeamBook): TeamOwner[] => (book.teams.bestand ? ['semon', 'ariel', 'bestand'] : ['semon', 'ariel']);
export const withTeam = (book: TeamBook, owner: TeamOwner, team: Team): TeamBook =>
  ({ ...book, teams: { ...book.teams, [owner]: team } });
