/**
 * Nachrichten zwischen Browser und Spielserver (JSON über WebSocket, Pfad /ws).
 * Rein und ohne Browser-/Node-Abhängigkeiten, damit Client und Server dieselbe Prüfung nutzen.
 */
import {
  DURATIONS, PLAYER_COUNT, Phase, RestartKind, sanitizeInput, sanitizeTeam, vec,
  type Frame, type FramePlayer, type GoalRecord, type Pair, type SimEvent, type TeamId, type TeamInput, type TeamSpec,
} from '../sim/index.ts';

export const WS_PATH = '/ws';
export const DEFAULT_PORT = 8787;
export const CODE_LENGTH = 4;
/** Gut lesbare Zeichen: ohne 0/O und 1/I. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const HASH_PREFIX = '#raum-';
export const TOKEN_MAX = 64;
export const MAX_MESSAGE_BYTES = 4096;

export const RoomStatus = { Lobby: 'lobby', Playing: 'playing', Paused: 'paused', Ended: 'ended' } as const;
export type RoomStatus = (typeof RoomStatus)[keyof typeof RoomStatus];

export const EndReason = { Finished: 'finished', Abandoned: 'abandoned' } as const;
export type EndReason = (typeof EndReason)[keyof typeof EndReason];

export const ErrorCode = {
  UnknownRoom: 'unknown_room',
  RoomFull: 'room_full',
  BadMessage: 'bad_message',
  BadTeam: 'bad_team',
  NotAllowed: 'not_allowed',
  Expired: 'expired',
  TooFast: 'too_fast',
} as const;
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** Verständliche Meldungen zu den Fehlercodes des Servers. */
export const ERROR_TEXT: Readonly<Record<ErrorCode, string>> = Object.freeze({
  unknown_room: 'Diesen Raum gibt es nicht (mehr). Prüfe den Code oder erstelle einen neuen Raum.',
  room_full: 'Der Raum ist schon voll – es können nur zwei Geräte mitspielen.',
  bad_message: 'Der Server hat eine Nachricht nicht verstanden.',
  bad_team: 'Die Aufstellung ist ungültig. Wähle genau fünf Spieler.',
  not_allowed: 'Das geht gerade nicht.',
  expired: 'Die Sitzung ist abgelaufen. Bitte tritt dem Raum neu bei.',
  too_fast: 'Zu viele Nachrichten – die Verbindung wurde getrennt.',
});

export interface SeatView {
  /** Mannschaftsname, sobald eine Aufstellung gewählt wurde. */
  readonly name: string | null;
  readonly connected: boolean;
  readonly hasTeam: boolean;
  readonly ready: boolean;
  readonly rematch: boolean;
}

export interface MatchResult {
  readonly reason: EndReason;
  readonly score: Pair;
  readonly goals: readonly GoalRecord[];
  /** Platz des Spielers, der das Spiel verlassen hat (nur bei Abbruch). */
  readonly leaver: number | null;
}

export interface RoomView {
  readonly code: string;
  readonly status: RoomStatus;
  readonly duration: number;
  readonly seats: readonly [SeatView | null, SeatView | null];
  /** Bei Unterbrechung: wer fehlt und wie lange noch gewartet wird. */
  readonly pause: { readonly seat: number; readonly msLeft: number } | null;
  readonly result: MatchResult | null;
}

export type ClientMessage =
  | { readonly t: 'create' }
  | { readonly t: 'join'; readonly code: string }
  | { readonly t: 'rejoin'; readonly code: string; readonly token: string }
  | { readonly t: 'team'; readonly team: TeamSpec }
  | { readonly t: 'ready'; readonly ready: boolean }
  | { readonly t: 'duration'; readonly seconds: number }
  | { readonly t: 'input'; readonly input: TeamInput }
  | { readonly t: 'rematch'; readonly want: boolean }
  | { readonly t: 'leave' }
  | { readonly t: 'ping'; readonly n: number };

export type ServerMessage =
  | { readonly t: 'joined'; readonly code: string; readonly token: string; readonly seat: TeamId; readonly graceMs: number }
  | { readonly t: 'room'; readonly room: RoomView }
  | { readonly t: 'start'; readonly teams: readonly [TeamSpec, TeamSpec]; readonly duration: number; readonly frame: readonly number[] }
  | { readonly t: 'snap'; readonly f: readonly number[]; readonly e: readonly SimEvent[] }
  | { readonly t: 'error'; readonly code: ErrorCode }
  | { readonly t: 'closed' }
  | { readonly t: 'pong'; readonly n: number };

type Json = Record<string, unknown>;

const PHASES: readonly Phase[] = Object.values(Phase);
const RESTART_KINDS: readonly RestartKind[] = Object.values(RestartKind);
const ROOM_STATUSES: readonly string[] = Object.values(RoomStatus);
const ERROR_CODES: readonly string[] = Object.values(ErrorCode);
const EVENT_TYPES: readonly string[] = ['whistle', 'end', 'pass', 'shot', 'save', 'post', 'tackle', 'out', 'goal'];
const SEAT_COUNT = 2;
const PRECISION = 100;
const HEADER_LENGTH = 15;
const PLAYER_STRIDE = 5;
const FRAME_LENGTH = HEADER_LENGTH + PLAYER_COUNT * PLAYER_STRIDE;
const DX_OFFSET = 2;
const DY_OFFSET = 3;
const DAZED_OFFSET = 4;

const isRecord = (raw: unknown): raw is Json => typeof raw === 'object' && raw !== null && !Array.isArray(raw);
const isFiniteNumber = (raw: unknown): raw is number => typeof raw === 'number' && Number.isFinite(raw);
const isSeat = (raw: unknown): raw is TeamId => raw === 0 || raw === 1;
const round = (value: number): number => Math.round(value * PRECISION) / PRECISION;

const parseJson = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    // Ungültiges JSON ist ein erwarteter Fall an der Grenze und wird als "keine Nachricht" gemeldet.
    return null;
  }
};

/** Raumcode in Großbuchstaben, wenn er gültig ist – sonst null. */
export const normalizeCode = (raw: unknown): string | null => {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return code.length === CODE_LENGTH && [...code].every((ch) => CODE_ALPHABET.includes(ch)) ? code : null;
};

/** Liest den Raumcode aus einem Einladungslink (`#raum-CODE`). */
export const roomCodeFromHash = (hash: string): string | null =>
  (hash.toLowerCase().startsWith(HASH_PREFIX) ? normalizeCode(hash.slice(HASH_PREFIX.length)) : null);

export const hashForRoom = (code: string): string => `${HASH_PREFIX}${code}`;

// ---- Bild (Frame) als flache Zahlenliste ----

/** Packt ein Bild in eine kompakte Zahlenliste (zwei Nachkommastellen). */
export const encodeFrame = (frame: Frame): readonly number[] => [
  frame.tick, PHASES.indexOf(frame.phase), round(frame.phaseTime), round(frame.timeLeft),
  frame.score[0], frame.score[1],
  round(frame.ball.pos.x), round(frame.ball.pos.y), round(frame.ball.z), frame.ball.owner, Number(frame.ball.held),
  frame.controlled[0], frame.controlled[1],
  RESTART_KINDS.indexOf(frame.restart.kind), frame.restart.team,
  ...frame.players.flatMap((p) => [round(p.pos.x), round(p.pos.y), round(p.dir.x), round(p.dir.y), Number(p.dazed)]),
];

const decodePlayer = (raw: readonly number[], index: number): FramePlayer => {
  const at = HEADER_LENGTH + index * PLAYER_STRIDE;
  return {
    pos: vec(raw[at], raw[at + 1]),
    dir: vec(raw[at + DX_OFFSET], raw[at + DY_OFFSET]),
    dazed: Boolean(raw[at + DAZED_OFFSET]),
  };
};

/** Liest ein Bild zurück; unvollständige oder unsinnige Daten ergeben null. */
export const decodeFrame = (raw: unknown): Frame | null => {
  if (!Array.isArray(raw) || raw.length !== FRAME_LENGTH || !raw.every(isFiniteNumber)) return null;
  const [tick, phaseIndex, phaseTime, timeLeft, home, away, bx, by, bz, owner, held, c0, c1, kindIndex, restartTeam] = raw;
  const phase = PHASES[phaseIndex];
  const kind = RESTART_KINDS[kindIndex];
  if (!phase || !kind || !isSeat(restartTeam)) return null;
  return {
    tick, phase, phaseTime, timeLeft,
    score: [home, away],
    ball: { pos: vec(bx, by), z: bz, owner, held: Boolean(held) },
    players: Array.from({ length: PLAYER_COUNT }, (_, i) => decodePlayer(raw, i)),
    controlled: [c0, c1],
    restart: { kind, team: restartTeam },
  };
};

// ---- Nachrichten vom Client (prüft der Server) ----

type ClientParser = (raw: Json) => ClientMessage | null;

const CLIENT_PARSERS: Readonly<Record<ClientMessage['t'], ClientParser>> = {
  create: () => ({ t: 'create' }),
  join: (raw) => {
    const code = normalizeCode(raw['code']);
    return code ? { t: 'join', code } : null;
  },
  rejoin: (raw) => {
    const code = normalizeCode(raw['code']);
    const token = raw['token'];
    return code && typeof token === 'string' && token && token.length <= TOKEN_MAX ? { t: 'rejoin', code, token } : null;
  },
  team: (raw) => {
    const team = sanitizeTeam(raw['team']);
    return team ? { t: 'team', team } : null;
  },
  ready: (raw) => (typeof raw['ready'] === 'boolean' ? { t: 'ready', ready: raw['ready'] } : null),
  duration: (raw) => {
    const seconds = raw['seconds'];
    return isFiniteNumber(seconds) && DURATIONS.includes(seconds) ? { t: 'duration', seconds } : null;
  },
  input: (raw) => (isRecord(raw['input']) ? { t: 'input', input: sanitizeInput(raw['input']) } : null),
  rematch: (raw) => (typeof raw['want'] === 'boolean' ? { t: 'rematch', want: raw['want'] } : null),
  leave: () => ({ t: 'leave' }),
  ping: (raw) => (isFiniteNumber(raw['n']) ? { t: 'ping', n: raw['n'] } : null),
};

const isClientType = (raw: unknown): raw is ClientMessage['t'] => typeof raw === 'string' && Object.hasOwn(CLIENT_PARSERS, raw);

/** Prüft eine Nachricht des Clients vollständig; alles Ungültige ergibt null. */
export const parseClientMessage = (text: string): ClientMessage | null => {
  const raw = parseJson(text);
  if (!isRecord(raw) || !isClientType(raw['t'])) return null;
  return CLIENT_PARSERS[raw['t']](raw);
};

// ---- Nachrichten vom Server (prüft der Client) ----

const parseSeatView = (raw: unknown): SeatView | null | undefined => {
  if (raw === null) return null;
  if (!isRecord(raw)) return undefined;
  const name = raw['name'];
  return {
    name: typeof name === 'string' ? name : null,
    connected: raw['connected'] === true,
    hasTeam: raw['hasTeam'] === true,
    ready: raw['ready'] === true,
    rematch: raw['rematch'] === true,
  };
};

const parseGoal = (raw: unknown): GoalRecord | null => {
  if (!isRecord(raw) || !isSeat(raw['team']) || !isFiniteNumber(raw['player']) || !isFiniteNumber(raw['time'])) return null;
  return { team: raw['team'], player: raw['player'], own: raw['own'] === true, time: raw['time'] };
};

const parsePair = (raw: unknown): Pair | null =>
  (Array.isArray(raw) && raw.length === SEAT_COUNT && isFiniteNumber(raw[0]) && isFiniteNumber(raw[1]) ? [raw[0], raw[1]] : null);

const parseResult = (raw: unknown): MatchResult | null => {
  if (!isRecord(raw)) return null;
  const score = parsePair(raw['score']);
  const abandoned = raw['reason'] === EndReason.Abandoned;
  const finished = raw['reason'] === EndReason.Finished;
  const goals = Array.isArray(raw['goals']) ? raw['goals'].map(parseGoal).filter((g) => g !== null) : [];
  if (!score || (!abandoned && !finished)) return null;
  return { reason: abandoned ? EndReason.Abandoned : EndReason.Finished, score, goals, leaver: isSeat(raw['leaver']) ? raw['leaver'] : null };
};

const parsePause = (raw: unknown): RoomView['pause'] =>
  (isRecord(raw) && isFiniteNumber(raw['seat']) && isFiniteNumber(raw['msLeft']) ? { seat: raw['seat'], msLeft: raw['msLeft'] } : null);

const parseRoom = (raw: unknown): RoomView | null => {
  if (!isRecord(raw)) return null;
  const code = normalizeCode(raw['code']);
  const status = ROOM_STATUSES.find((s) => s === raw['status']);
  const seats = Array.isArray(raw['seats']) ? raw['seats'].map(parseSeatView) : [];
  const [first, second] = seats;
  if (!code || !status || !isFiniteNumber(raw['duration']) || seats.length !== SEAT_COUNT) return null;
  if (first === undefined || second === undefined) return null;
  return {
    code,
    // Der Wert stammt aus ROOM_STATUSES, also aus RoomStatus; `find` verliert nur den engen Typ.
    status: status as RoomStatus,
    duration: raw['duration'],
    seats: [first, second],
    pause: parsePause(raw['pause']),
    result: parseResult(raw['result']),
  };
};

const parseEvent = (raw: unknown): SimEvent | null => {
  if (!isRecord(raw) || typeof raw['type'] !== 'string' || !EVENT_TYPES.includes(raw['type'])) return null;
  const numbersOk = ['player', 'team'].every((key) => raw[key] === undefined || isFiniteNumber(raw[key]));
  // Typ und Zahlenfelder sind geprüft; die übrigen Felder der Ereignisse sind einfache Wahrheitswerte bzw. Texte aus der Simulation.
  return numbersOk ? (raw as unknown as SimEvent) : null;
};

const numbers = (raw: unknown): readonly number[] | null => (Array.isArray(raw) && raw.every(isFiniteNumber) ? raw : null);

type ServerParser = (raw: Json) => ServerMessage | null;

const SERVER_PARSERS: Readonly<Record<ServerMessage['t'], ServerParser>> = {
  joined: (raw) => {
    const code = normalizeCode(raw['code']);
    const { token, seat, graceMs } = raw;
    return code && typeof token === 'string' && isSeat(seat) && isFiniteNumber(graceMs) ? { t: 'joined', code, token, seat, graceMs } : null;
  },
  room: (raw) => {
    const room = parseRoom(raw['room']);
    return room ? { t: 'room', room } : null;
  },
  start: (raw) => {
    const teams = Array.isArray(raw['teams']) ? raw['teams'].map(sanitizeTeam) : [];
    const [home, away] = teams;
    const frame = numbers(raw['frame']);
    return home && away && frame && isFiniteNumber(raw['duration'])
      ? { t: 'start', teams: [home, away], duration: raw['duration'], frame }
      : null;
  },
  snap: (raw) => {
    const f = numbers(raw['f']);
    const e = Array.isArray(raw['e']) ? raw['e'].map(parseEvent).filter((event) => event !== null) : [];
    return f ? { t: 'snap', f, e } : null;
  },
  error: (raw) => {
    const code = ERROR_CODES.find((c) => c === raw['code']);
    // Der Wert stammt aus ERROR_CODES, also aus ErrorCode; `find` verliert nur den engen Typ.
    return code ? { t: 'error', code: code as ErrorCode } : null;
  },
  closed: () => ({ t: 'closed' }),
  pong: (raw) => (isFiniteNumber(raw['n']) ? { t: 'pong', n: raw['n'] } : null),
};

const isServerType = (raw: unknown): raw is ServerMessage['t'] => typeof raw === 'string' && Object.hasOwn(SERVER_PARSERS, raw);

/** Prüft eine Nachricht des Servers; alles Ungültige ergibt null. */
export const parseServerMessage = (text: string): ServerMessage | null => {
  const raw = parseJson(text);
  if (!isRecord(raw) || !isServerType(raw['t'])) return null;
  return SERVER_PARSERS[raw['t']](raw);
};

export const encodeMessage = (message: ClientMessage | ServerMessage): string => JSON.stringify(message);
