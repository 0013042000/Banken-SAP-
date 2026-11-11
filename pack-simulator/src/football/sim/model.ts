/** Zustandsmodell der reinen Fußballsimulation (keine DOM-/React-Abhängigkeiten). */
import { BOX_DEPTH, BOX_HALF, CENTER, NONE, PITCH_H, PITCH_W, PLAYER_COUNT, TEAM_SIZE } from './constants.ts';
import { clamp, vec, ZERO, type Vec } from './vec.ts';

/** Ein aufgestellter Spieler. Alle Werte liegen zwischen 1 und 99. */
export interface PlayerSpec {
  readonly id: string;
  /** Kurzname für die Anzeige über der Figur. */
  readonly name: string;
  readonly pace: number;
  readonly shot: number;
  readonly pass: number;
  readonly dribble: number;
  readonly defense: number;
  readonly physical: number;
  /** Torwartstärke (nur für den Spieler im Tor relevant). */
  readonly keeping: number;
}

/** Fünf Spieler: Index 0 steht im Tor, 1 = hinten, 2 = links, 3 = rechts, 4 = vorne. */
export interface TeamSpec {
  readonly name: string;
  readonly players: readonly PlayerSpec[];
}

export type TeamId = 0 | 1;
/** 0 = Leicht, 1 = Mittel, 2 = Schwer. */
export type Difficulty = 0 | 1 | 2;
export type Control = 'human' | 'ai';

export interface TeamSetup extends TeamSpec {
  readonly control: Control;
  readonly difficulty: Difficulty;
}

export interface MatchConfig {
  readonly seed: number;
  readonly durationSec: number;
  readonly teams: readonly [TeamSetup, TeamSetup];
}

/** Eingabe eines menschlichen Spielers für einen Simulationsschritt. */
export interface TeamInput {
  /** Bewegung in Feldkoordinaten, Betrag höchstens 1. */
  readonly moveX: number;
  readonly moveY: number;
  readonly pass: boolean;
  readonly shoot: boolean;
  readonly switchOrTackle: boolean;
}

export type InputsByTeam = readonly [TeamInput | null | undefined, TeamInput | null | undefined];

export interface PlayerState {
  readonly pos: Vec;
  readonly vel: Vec;
  /** Blickrichtung (Einheitsvektor). */
  readonly dir: Vec;
  /** Benommen nach verlorenem Zweikampf: kann den Ball kurz nicht gewinnen. */
  readonly stun: number;
  /** Sperre, damit der eigene Tritt nicht sofort wieder aufgenommen wird. */
  readonly kickLock: number;
  /** Abklingzeit für Zweikämpfe und Antritte. */
  readonly cool: number;
  /** Zeit bis zur nächsten KI-Entscheidung am Ball. */
  readonly think: number;
  /** Sekunden im aktuellen Ballbesitz. */
  readonly hold: number;
}

export interface BallState {
  readonly pos: Vec;
  readonly z: number;
  readonly vel: Vec;
  readonly vz: number;
  /** Index des ballführenden Spielers oder NONE. */
  readonly owner: number;
  /** Der Torwart hält den Ball in der Hand. */
  readonly held: boolean;
  /** Mannschaft und Spieler der letzten Ballberührung (NONE = niemand). */
  readonly lastTeam: number;
  readonly lastPlayer: number;
  /** Spieler, der den Ball zuletzt getreten hat (für den Torschützen), sonst NONE. */
  readonly kicker: number;
  /** Letzter Tritt war ein Schuss. */
  readonly shot: boolean;
  /** Der Torwart hat über diesen Schuss bereits entschieden … */
  readonly judged: boolean;
  /** … und ist geschlagen. */
  readonly beaten: boolean;
  /** Angespielter Mitspieler oder NONE. */
  readonly passTo: number;
  /** Sekunden seit dem letzten Tritt. */
  readonly age: number;
  /** Schutzzeit nach Neustart oder Ballgewinn: kein Zweikampf möglich. */
  readonly protect: number;
  /** y-Position der Ballmitte beim Überqueren der Torlinie oder NONE. */
  readonly crossY: number;
}

export const Phase = { Kickoff: 'kickoff', Play: 'play', Goal: 'goal', Restart: 'restart', Ended: 'ended' } as const;
export type Phase = (typeof Phase)[keyof typeof Phase];

export const RestartKind = { Kickoff: 'kickoff', KickIn: 'kickin', Corner: 'corner', GoalKick: 'goalkick' } as const;
export type RestartKind = (typeof RestartKind)[keyof typeof RestartKind];

export interface RestartInfo {
  readonly kind: RestartKind;
  readonly team: TeamId;
}

export interface GoalRecord {
  readonly team: TeamId;
  /** Spielerindex (0–9) des Torschützen. */
  readonly player: number;
  readonly own: boolean;
  /** Gespielte Sekunden zum Zeitpunkt des Tors. */
  readonly time: number;
}

export type SimEvent =
  | { readonly type: 'whistle' }
  | { readonly type: 'end' }
  | { readonly type: 'pass'; readonly player: number }
  | { readonly type: 'shot'; readonly player: number }
  | { readonly type: 'save'; readonly player: number }
  | { readonly type: 'post' }
  | { readonly type: 'tackle'; readonly player: number }
  | { readonly type: 'out'; readonly kind: RestartKind; readonly team: TeamId }
  | { readonly type: 'goal'; readonly team: TeamId; readonly player: number; readonly own: boolean };

export type Pair = readonly [number, number];

export interface MatchStats {
  readonly shots: Pair;
  readonly saves: Pair;
  readonly passes: Pair;
  /** Schritte in Ballbesitz je Mannschaft. */
  readonly possession: Pair;
}

/** Vollständiger, serialisierbarer Spielzustand. Jeder Schritt erzeugt einen neuen Zustand. */
export interface MatchState {
  readonly config: MatchConfig;
  readonly tick: number;
  /** Zustand des Zufallsgenerators. */
  readonly rng: number;
  readonly phase: Phase;
  /** Restdauer der aktuellen Pause (Anstoß, Jubel, Neustart). */
  readonly phaseTime: number;
  readonly timeLeft: number;
  readonly score: Pair;
  readonly players: readonly PlayerState[];
  readonly ball: BallState;
  /** Aktiver Spieler je Mannschaft (bei KI-Mannschaften ohne Bedeutung). */
  readonly controlled: Pair;
  /** Tastenzustand des letzten Schritts (Bitmaske) zur Flankenerkennung. */
  readonly prevButtons: Pair;
  readonly restart: RestartInfo;
  readonly goals: readonly GoalRecord[];
  readonly stats: MatchStats;
  /** Ereignisse des letzten Schritts (für Ton und Anzeige). */
  readonly events: readonly SimEvent[];
}

/** Werkzeuge eines Simulationsschritts: Zufall und Ereignisablage. */
export interface StepTools {
  readonly rng: { readonly next: () => number; readonly spread: () => number };
  readonly emit: (event: SimEvent) => void;
  readonly dt: number;
}

const SKILL_FLOOR = 40;
const SKILL_RANGE = 59;

export const TEAM_IDS: readonly TeamId[] = Object.freeze([0, 1] as const);
export const ALL_PLAYERS: readonly number[] = Object.freeze(Array.from({ length: PLAYER_COUNT }, (_, i) => i));

export const teamOf = (index: number): TeamId => (index < TEAM_SIZE ? 0 : 1);
export const otherTeam = (team: TeamId): TeamId => (team ? 0 : 1);
export const slotOf = (index: number): number => index % TEAM_SIZE;
export const isKeeper = (index: number): boolean => !slotOf(index);
export const keeperOf = (team: TeamId): number => team * TEAM_SIZE;
export const playerIndex = (team: TeamId, slot: number): number => team * TEAM_SIZE + slot;

const FIELD_BY_TEAM: readonly (readonly number[])[] = TEAM_IDS.map((team) =>
  ALL_PLAYERS.filter((i) => teamOf(i) === team && !isKeeper(i)));
/** Die vier Feldspieler einer Mannschaft. */
export const fieldPlayers = (team: TeamId): readonly number[] => FIELD_BY_TEAM[team];

/** +1: Mannschaft greift nach rechts an, −1: nach links. */
export const attackSign = (team: TeamId): number => (team ? -1 : 1);

/** Rechnet mannschaftseigene Koordinaten (eigenes Tor bei x = 0) in Feldkoordinaten um – und zurück. */
export const toWorld = (team: TeamId, local: Vec): Vec =>
  (team ? vec(PITCH_W - local.x, PITCH_H - local.y) : local);
export const ownGoal = (team: TeamId): Vec => toWorld(team, vec(0, CENTER.y));
export const oppGoal = (team: TeamId): Vec => toWorld(team, vec(PITCH_W, CENTER.y));

export const inOwnBox = (team: TeamId, pos: Vec): boolean => {
  const local = toWorld(team, pos);
  return local.x <= BOX_DEPTH && Math.abs(local.y - CENTER.y) <= BOX_HALF;
};

export const specOf = (state: MatchState, index: number): PlayerSpec =>
  state.config.teams[teamOf(index)].players[slotOf(index)];

/** Bildet einen Spielerwert (1–99) auf 0–1 ab; übliche Werte liegen zwischen 0,3 und 0,95. */
export const skill = (value: number): number => clamp((value - SKILL_FLOOR) / SKILL_RANGE, 0, 1);

export const setPair = (pair: Pair, team: TeamId, value: number): Pair =>
  (team ? [pair[0], value] : [value, pair[1]]);
export const bumpPair = (pair: Pair, team: TeamId): Pair => setPair(pair, team, pair[team] + 1);

export const freshPlayer = (pos: Vec, dir: Vec): PlayerState =>
  ({ pos, vel: ZERO, dir, stun: 0, kickLock: 0, cool: 0, think: 0, hold: 0 });

export const looseBall = (pos: Vec): BallState => ({
  pos, z: 0, vel: ZERO, vz: 0, owner: NONE, held: false, lastTeam: NONE, lastPlayer: NONE, kicker: NONE,
  shot: false, judged: false, beaten: false, passTo: NONE, age: 0, protect: 0, crossY: NONE,
});

export const withPlayer = (state: MatchState, index: number, patch: Partial<PlayerState>): MatchState =>
  ({ ...state, players: state.players.map((p, i) => (i === index ? { ...p, ...patch } : p)) });

export const withBall = (state: MatchState, patch: Partial<BallState>): MatchState =>
  ({ ...state, ball: { ...state.ball, ...patch } });

/** Feldspieler der Mannschaft, der dem Punkt am nächsten steht. */
export const nearestFieldPlayer = (positions: readonly Vec[], team: TeamId, target: Vec): number =>
  fieldPlayers(team).reduce((best, i) => {
    const d = Math.hypot(positions[i].x - target.x, positions[i].y - target.y);
    const bestD = Math.hypot(positions[best].x - target.x, positions[best].y - target.y);
    return d < bestD ? i : best;
  }, fieldPlayers(team)[0]);
