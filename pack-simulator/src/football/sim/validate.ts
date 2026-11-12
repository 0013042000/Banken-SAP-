/** Prüfung und Begrenzung aller Daten, die von außen in die Simulation gelangen. */
import { ID_MAX, NAME_MAX, STAT_MAX, STAT_MIN, TEAM_SIZE } from './constants.ts';
import type { Difficulty, MatchConfig, PlayerSpec, TeamInput, TeamSetup, TeamSpec } from './model.ts';
import { limit, vec } from './vec.ts';

export class InvalidMatchConfigError extends Error {
  constructor(detail: string) {
    super(`Ungültige Spielkonfiguration: ${detail}`);
    this.name = 'InvalidMatchConfigError';
  }
}

const STAT_KEYS = ['pace', 'shot', 'pass', 'dribble', 'defense', 'physical', 'keeping'] as const;
const ID_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-:';
const FIRST_PRINTABLE = ' ';
const DELETE_CHAR = '\u007f';
const MAX_DURATION = 3600;
const HARD: Difficulty = 2;
const DIFFICULTIES: readonly number[] = [0, 1, HARD];
const FALLBACK_DIFFICULTY: Difficulty = 1;

export const NEUTRAL_INPUT: TeamInput = Object.freeze({ moveX: 0, moveY: 0, pass: false, shoot: false, switchOrTackle: false });

const isRecord = (raw: unknown): raw is Record<string, unknown> => typeof raw === 'object' && raw !== null;
const finiteOr = (raw: unknown, fallback: number): number =>
  (typeof raw === 'number' && Number.isFinite(raw) ? raw : fallback);

/**
 * Macht aus beliebigen Daten eine gültige Eingabe: nur endliche Zahlen,
 * Bewegungsvektor höchstens Länge 1, Tasten nur bei echtem `true`.
 */
export const sanitizeInput = (raw: unknown): TeamInput => {
  if (!isRecord(raw)) return NEUTRAL_INPUT;
  const move = limit(vec(finiteOr(raw['moveX'], 0), finiteOr(raw['moveY'], 0)), 1);
  return {
    moveX: move.x,
    moveY: move.y,
    pass: raw['pass'] === true,
    shoot: raw['shoot'] === true,
    switchOrTackle: raw['switchOrTackle'] === true,
  };
};

/** Entfernt Steuerzeichen, kürzt auf die erlaubte Länge; leer → null. */
export const cleanName = (raw: unknown, max: number = NAME_MAX): string | null => {
  if (typeof raw !== 'string') return null;
  const text = [...raw].filter((ch) => ch >= FIRST_PRINTABLE && ch !== DELETE_CHAR).join('').trim();
  return text ? [...text].slice(0, max).join('') : null;
};

const cleanId = (raw: unknown): string | null => {
  if (typeof raw !== 'string' || !raw || raw.length > ID_MAX) return null;
  return [...raw].every((ch) => ID_CHARS.includes(ch)) ? raw : null;
};

const cleanStat = (raw: unknown): number | null => {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  const rounded = Math.round(raw);
  return rounded >= STAT_MIN && rounded <= STAT_MAX ? rounded : null;
};

/** Ein Spieler ist nur gültig, wenn Kennung, Name und alle sieben Werte (1–99) stimmen. */
export const sanitizeSpec = (raw: unknown): PlayerSpec | null => {
  if (!isRecord(raw)) return null;
  const id = cleanId(raw['id']);
  const name = cleanName(raw['name']);
  const stats = STAT_KEYS.map((key) => cleanStat(raw[key]));
  if (id === null || name === null || stats.some((value) => value === null)) return null;
  const [pace, shot, pass, dribble, defense, physical, keeping] = stats.map((value) => value ?? STAT_MIN);
  return { id, name, pace, shot, pass, dribble, defense, physical, keeping };
};

/** Genau fünf gültige Spieler mit unterschiedlichen Kennungen und ein Mannschaftsname. */
export const sanitizeTeam = (raw: unknown): TeamSpec | null => {
  if (!isRecord(raw)) return null;
  const name = cleanName(raw['name']);
  const list = raw['players'];
  if (name === null || !Array.isArray(list) || list.length !== TEAM_SIZE) return null;
  const players = list.map((entry: unknown) => sanitizeSpec(entry)).filter((spec) => spec !== null);
  const distinct = new Set(players.map((spec) => spec.id)).size;
  return players.length === TEAM_SIZE && distinct === TEAM_SIZE ? { name, players } : null;
};

const sanitizeSetup = (raw: TeamSetup, label: string): TeamSetup => {
  const team = sanitizeTeam(raw);
  if (!team) throw new InvalidMatchConfigError(`${label} braucht genau ${TEAM_SIZE} gültige Spieler`);
  const difficulty = DIFFICULTIES.includes(raw.difficulty) ? raw.difficulty : FALLBACK_DIFFICULTY;
  return { ...team, control: raw.control === 'human' ? 'human' : 'ai', difficulty };
};

/** Prüft eine Spielkonfiguration; ungültige Mannschaften lösen einen Fehler aus. */
export const sanitizeConfig = (config: MatchConfig): MatchConfig => {
  const duration = finiteOr(config.durationSec, 0);
  if (duration <= 0 || duration > MAX_DURATION) throw new InvalidMatchConfigError('Spielzeit außerhalb des erlaubten Bereichs');
  return {
    seed: Math.trunc(finiteOr(config.seed, 1)) | 0,
    durationSec: duration,
    teams: [sanitizeSetup(config.teams[0], 'Mannschaft 1'), sanitizeSetup(config.teams[1], 'Mannschaft 2')],
  };
};
