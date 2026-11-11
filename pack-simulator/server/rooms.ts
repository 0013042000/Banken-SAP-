/**
 * Autoritativer Spielserver: private Räume für zwei Geräte.
 * Der Server führt die Simulation aus; Clients schicken nur Eingaben und bekommen Zustandsbilder.
 * Räume und Verbindungen liegen als unveränderliche Datensätze in zwei Maps.
 */
import { randomBytes, randomInt } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket, WebSocketServer, type RawData } from 'ws';
import {
  CODE_ALPHABET, CODE_LENGTH, encodeFrame, encodeMessage, EndReason, ErrorCode, MAX_MESSAGE_BYTES, parseClientMessage,
  RoomStatus, WS_PATH,
  type ClientMessage, type MatchResult, type RoomView, type SeatView, type ServerMessage,
} from '../src/football/net/protocol.ts';
import {
  createMatch, DEFAULT_DURATION, DT, frameOf, NEUTRAL_INPUT, Phase, step, TEAM_IDS,
  type MatchState, type SimEvent, type TeamId, type TeamInput, type TeamSetup, type TeamSpec,
} from '../src/football/sim/index.ts';
import { createHttpHandler } from './static.ts';

export interface GameServerOptions {
  /** 0 wählt einen freien Port (für Tests). */
  readonly port?: number;
  readonly host?: string;
  /** Ordner mit dem gebauten Frontend oder null. */
  readonly staticDir?: string | null;
  /** Frist für den Wiederbeitritt nach einem Verbindungsabbruch. */
  readonly graceMs?: number;
  /** Nach dieser Zeit ohne Aktivität wird ein wartender oder beendeter Raum geschlossen. */
  readonly idleMs?: number;
  readonly heartbeatMs?: number;
  readonly sweepMs?: number;
  /** Beschleunigt die Simulation (nur für Tests). */
  readonly timeScale?: number;
  readonly seed?: () => number;
}

export interface GameServer {
  readonly port: number;
  readonly roomCount: () => number;
  readonly close: () => Promise<void>;
}

interface Seat {
  readonly token: string;
  readonly socket: WebSocket | null;
  /** Zeitpunkt des Verbindungsverlusts (nur ohne Socket von Bedeutung). */
  readonly lostAt: number;
  readonly team: TeamSpec | null;
  readonly ready: boolean;
  readonly rematch: boolean;
  readonly input: TeamInput;
  /** Tastendrücke seit dem letzten Simulationsschritt, damit kurze Tipper nicht verloren gehen. */
  readonly latched: TeamInput;
}

type Seats = readonly [Seat | null, Seat | null];

interface Room {
  readonly code: string;
  readonly seats: Seats;
  readonly status: RoomStatus;
  readonly duration: number;
  readonly match: MatchState | null;
  readonly result: MatchResult | null;
  /** Ereignisse seit dem letzten versendeten Bild. */
  readonly events: readonly SimEvent[];
  readonly pausedSeat: number;
  readonly pauseUntil: number;
  readonly touchedAt: number;
  /** Zeitpunkt des letzten Simulationslaufs und noch nicht verrechnete Spielzeit. */
  readonly clock: number;
  readonly debt: number;
}

interface Session {
  readonly code: string | null;
  readonly seat: TeamId;
  readonly tokens: number;
  readonly refilledAt: number;
  readonly strikes: number;
  readonly alive: boolean;
}

type Handler<TType extends ClientMessage['t']> =
  (socket: WebSocket, session: Session, message: Extract<ClientMessage, { t: TType }>) => void;

const DEFAULT_GRACE_MS = 25_000;
const DEFAULT_IDLE_MS = 900_000;
const DEFAULT_HEARTBEAT_MS = 5_000;
const DEFAULT_SWEEP_MS = 250;
const LOOP_MS = 8;
const MS_PER_SECOND = 1000;
/** Nach einer Hänger-Pause wird höchstens so viel Zeit nachgeholt. */
const MAX_CATCHUP_MS = 250;
/** Jedes dritte Simulationsbild geht an die Clients (20 pro Sekunde). */
const SNAPSHOT_EVERY = 3;
const TOKEN_BYTES = 16;
const MAX_SEED = 2_147_483_647;
const BUCKET_CAPACITY = 90;
const BUCKET_PER_SECOND = 70;
const MAX_STRIKES = 8;
const CLOSE_POLICY = 1008;
const CLOSE_GOING_AWAY = 1001;
const CODE_ATTEMPTS = 50;
const MEDIUM = 1;
const NO_SEAT = -1;

const newSeat = (socket: WebSocket): Seat => ({
  token: randomBytes(TOKEN_BYTES).toString('hex'),
  socket, lostAt: 0, team: null, ready: false, rematch: false, input: NEUTRAL_INPUT, latched: NEUTRAL_INPUT,
});

const setSeat = (seats: Seats, index: TeamId, seat: Seat | null): Seats => (index ? [seats[0], seat] : [seat, seats[1]]);
const patchSeat = (room: Room, index: TeamId, patch: Partial<Seat>): Room => {
  const seat = room.seats[index];
  return seat ? { ...room, seats: setSeat(room.seats, index, { ...seat, ...patch }) } : room;
};
const mapSeats = (room: Room, change: (seat: Seat) => Seat): Room =>
  ({ ...room, seats: [room.seats[0] && change(room.seats[0]), room.seats[1] && change(room.seats[1])] });
const isOnline = (seat: Seat | null): boolean => seat !== null && seat.socket !== null;
const mergeInput = (held: TeamInput, latched: TeamInput): TeamInput => ({
  ...held,
  pass: held.pass || latched.pass,
  shoot: held.shoot || latched.shoot,
  switchOrTackle: held.switchOrTackle || latched.switchOrTackle,
});

const send = (socket: WebSocket | null, message: ServerMessage): void => {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(encodeMessage(message));
};

const seatView = (seat: Seat | null): SeatView | null => (seat && {
  name: seat.team?.name ?? null,
  connected: seat.socket !== null,
  hasTeam: seat.team !== null,
  ready: seat.ready,
  rematch: seat.rematch,
});

const viewOf = (room: Room, now: number): RoomView => ({
  code: room.code,
  status: room.status,
  duration: room.duration,
  seats: [seatView(room.seats[0]), seatView(room.seats[1])],
  pause: room.status === RoomStatus.Paused ? { seat: room.pausedSeat, msLeft: Math.max(0, room.pauseUntil - now) } : null,
  result: room.result,
});

const toSetup = (team: TeamSpec): TeamSetup => ({ ...team, control: 'human', difficulty: MEDIUM });

const rawToText = (data: RawData): string => {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  return Buffer.isBuffer(data) ? data.toString('utf8') : Buffer.from(data).toString('utf8');
};

/** Startet HTTP- und WebSocket-Server und gibt Port sowie eine Funktion zum Beenden zurück. */
export const startGameServer = async (options: GameServerOptions = {}): Promise<GameServer> => {
  const graceMs = options.graceMs ?? DEFAULT_GRACE_MS;
  const idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
  const timeScale = options.timeScale ?? 1;
  const nextSeed = options.seed ?? ((): number => randomInt(1, MAX_SEED));
  const rooms = new Map<string, Room>();
  const sessions = new Map<WebSocket, Session>();
  const now = (): number => performance.now();

  const broadcast = (room: Room): void => {
    const view = viewOf(room, now());
    room.seats.forEach((seat) => send(seat?.socket ?? null, { t: 'room', room: view }));
  };

  /** Speichert den Raum, informiert beide Plätze und löscht ihn, wenn niemand mehr dazugehört. */
  const commit = (room: Room): void => {
    if (room.seats.every((seat) => seat === null)) {
      rooms.delete(room.code);
      return;
    }
    rooms.set(room.code, room);
    broadcast(room);
  };

  const freshCode = (): string | null => {
    const candidates = Array.from({ length: CODE_ATTEMPTS }, () =>
      Array.from({ length: CODE_LENGTH }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join(''));
    return candidates.find((code) => !rooms.has(code)) ?? null;
  };

  const roomOf = (session: Session): Room | null => (session.code ? rooms.get(session.code) ?? null : null);
  const fail = (socket: WebSocket, code: ErrorCode): void => send(socket, { t: 'error', code });
  const leaveSession = (socket: WebSocket): void => {
    const session = sessions.get(socket);
    if (session) sessions.set(socket, { ...session, code: null });
  };

  const sendStart = (room: Room, socket: WebSocket | null): void => {
    const match = room.match;
    if (!match) return;
    const [home, away] = match.config.teams;
    const teams: readonly [TeamSpec, TeamSpec] = [{ name: home.name, players: home.players }, { name: away.name, players: away.players }];
    send(socket, { t: 'start', teams, duration: match.config.durationSec, frame: encodeFrame(frameOf(match)) });
  };

  const startMatch = (room: Room): void => {
    const [home, away] = room.seats;
    if (!home?.team || !away?.team) return;
    const match = createMatch({ seed: nextSeed(), durationSec: room.duration, teams: [toSetup(home.team), toSetup(away.team)] });
    const reset = mapSeats(room, (seat) => ({ ...seat, ready: false, rematch: false, input: NEUTRAL_INPUT, latched: NEUTRAL_INPUT }));
    const started: Room = {
      ...reset, status: RoomStatus.Playing, match, result: null, events: [], clock: now(), debt: 0, touchedAt: now(),
    };
    rooms.set(started.code, started);
    started.seats.forEach((seat) => sendStart(started, seat?.socket ?? null));
    broadcast(started);
  };

  const bothAgree = (room: Room, flag: (seat: Seat) => boolean): boolean =>
    room.seats.every((seat) => seat !== null && isOnline(seat) && seat.team !== null && flag(seat));

  /** Spielabbruch: Wer fehlt, verliert seinen Platz; der andere sieht den Stand und eine klare Meldung. */
  const abandon = (room: Room, leaver: TeamId): void => {
    const match = room.match;
    const result: MatchResult | null = match
      ? { reason: EndReason.Abandoned, score: match.score, goals: match.goals, leaver }
      : null;
    commit({ ...room, seats: setSeat(room.seats, leaver, null), status: RoomStatus.Ended, result, pauseUntil: 0, pausedSeat: NO_SEAT, touchedAt: now() });
  };

  const removeSeat = (room: Room, index: TeamId): void => {
    const inMatch = room.status === RoomStatus.Playing || room.status === RoomStatus.Paused;
    if (inMatch) return abandon(room, index);
    const emptied = { ...room, seats: setSeat(room.seats, index, null), touchedAt: now() };
    return commit(mapSeats(emptied, (seat) => ({ ...seat, ready: false, rematch: false })));
  };

  const handlers: { readonly [K in ClientMessage['t']]: Handler<K> } = {
    create: (socket, session) => {
      const code = session.code ? null : freshCode();
      if (!code) return fail(socket, ErrorCode.NotAllowed);
      const seat = newSeat(socket);
      const room: Room = {
        code, seats: [seat, null], status: RoomStatus.Lobby, duration: DEFAULT_DURATION, match: null, result: null,
        events: [], pausedSeat: NO_SEAT, pauseUntil: 0, touchedAt: now(), clock: now(), debt: 0,
      };
      sessions.set(socket, { ...session, code, seat: 0 });
      send(socket, { t: 'joined', code, token: seat.token, seat: 0, graceMs });
      return commit(room);
    },
    join: (socket, session, message) => {
      const room = rooms.get(message.code);
      if (session.code) return fail(socket, ErrorCode.NotAllowed);
      if (!room) return fail(socket, ErrorCode.UnknownRoom);
      const free = TEAM_IDS.find((index) => room.seats[index] === null);
      if (free === undefined || room.status !== RoomStatus.Lobby) return fail(socket, ErrorCode.RoomFull);
      const seat = newSeat(socket);
      sessions.set(socket, { ...session, code: room.code, seat: free });
      send(socket, { t: 'joined', code: room.code, token: seat.token, seat: free, graceMs });
      return commit({ ...room, seats: setSeat(room.seats, free, seat), touchedAt: now() });
    },
    rejoin: (socket, session, message) => {
      const room = rooms.get(message.code);
      const index = room ? TEAM_IDS.find((i) => room.seats[i]?.token === message.token) : undefined;
      const seat = room && index !== undefined ? room.seats[index] : null;
      if (session.code || !room || index === undefined || !seat) return fail(socket, ErrorCode.Expired);
      const stale = seat.socket;
      if (stale && stale !== socket) {
        leaveSession(stale);
        stale.close(CLOSE_GOING_AWAY);
      }
      sessions.set(socket, { ...session, code: room.code, seat: index });
      const attached = patchSeat(room, index, { socket, lostAt: 0, input: NEUTRAL_INPUT, latched: NEUTRAL_INPUT });
      const complete = attached.seats.every(isOnline);
      const resumed: Room = attached.status === RoomStatus.Paused && complete
        ? { ...attached, status: RoomStatus.Playing, pauseUntil: 0, pausedSeat: NO_SEAT, clock: now(), debt: 0 }
        : attached;
      send(socket, { t: 'joined', code: room.code, token: seat.token, seat: index, graceMs });
      if (resumed.status !== RoomStatus.Lobby) sendStart(resumed, socket);
      return commit({ ...resumed, touchedAt: now() });
    },
    team: (socket, session, message) => {
      const room = roomOf(session);
      if (!room || room.status !== RoomStatus.Lobby) return fail(socket, ErrorCode.NotAllowed);
      return commit(patchSeat({ ...room, touchedAt: now() }, session.seat, { team: message.team, ready: false }));
    },
    ready: (socket, session, message) => {
      const room = roomOf(session);
      if (!room || room.status !== RoomStatus.Lobby) return fail(socket, ErrorCode.NotAllowed);
      if (!room.seats[session.seat]?.team) return fail(socket, ErrorCode.BadTeam);
      const updated = patchSeat({ ...room, touchedAt: now() }, session.seat, { ready: message.ready });
      return bothAgree(updated, (seat) => seat.ready) ? startMatch(updated) : commit(updated);
    },
    duration: (socket, session, message) => {
      const room = roomOf(session);
      if (!room || room.status !== RoomStatus.Lobby || session.seat) return fail(socket, ErrorCode.NotAllowed);
      return commit({ ...room, duration: message.seconds, touchedAt: now() });
    },
    input: (_socket, session, message) => {
      const room = roomOf(session);
      const seat = room?.seats[session.seat];
      if (!room || !seat || room.status !== RoomStatus.Playing) return;
      rooms.set(room.code, patchSeat(room, session.seat, { input: message.input, latched: mergeInput(message.input, seat.latched) }));
    },
    rematch: (socket, session, message) => {
      const room = roomOf(session);
      const finished = room?.status === RoomStatus.Ended && room.result?.reason === EndReason.Finished;
      if (!room || !finished) return fail(socket, ErrorCode.NotAllowed);
      const updated = patchSeat({ ...room, touchedAt: now() }, session.seat, { rematch: message.want });
      return bothAgree(updated, (seat) => seat.rematch) ? startMatch(updated) : commit(updated);
    },
    leave: (socket, session) => {
      const room = roomOf(session);
      leaveSession(socket);
      if (room && room.seats[session.seat]?.socket === socket) removeSeat(room, session.seat);
    },
    ping: (socket, _session, message) => send(socket, { t: 'pong', n: message.n }),
  };

  /** Füllt das Nachrichtenkontingent auf; ist es leer, wird die Verbindung getrennt. */
  const admit = (socket: WebSocket, session: Session): Session | null => {
    const at = now();
    const tokens = Math.min(BUCKET_CAPACITY, session.tokens + ((at - session.refilledAt) * BUCKET_PER_SECOND) / MS_PER_SECOND);
    if (tokens < 1) {
      fail(socket, ErrorCode.TooFast);
      socket.close(CLOSE_POLICY);
      return null;
    }
    return { ...session, tokens: tokens - 1, refilledAt: at };
  };

  const reject = (socket: WebSocket, session: Session): void => {
    const strikes = session.strikes + 1;
    sessions.set(socket, { ...session, strikes });
    fail(socket, ErrorCode.BadMessage);
    if (strikes >= MAX_STRIKES) socket.close(CLOSE_POLICY);
  };

  const onMessage = (socket: WebSocket, data: RawData, isBinary: boolean): void => {
    const known = sessions.get(socket);
    const session = known ? admit(socket, known) : null;
    if (!session) return;
    sessions.set(socket, session);
    const message = isBinary ? null : parseClientMessage(rawToText(data));
    if (!message) return reject(socket, session);
    // Die Tabelle ordnet jedem Nachrichtentyp genau seinen Handler zu; TypeScript kann das über den Indexzugriff nicht nachvollziehen.
    const handle = handlers[message.t] as Handler<ClientMessage['t']>;
    return handle(socket, session, message);
  };

  const onClose = (socket: WebSocket): void => {
    const session = sessions.get(socket);
    sessions.delete(socket);
    const room = session ? roomOf(session) : null;
    if (!session || !room || room.seats[session.seat]?.socket !== socket) return;
    const at = now();
    const detached = patchSeat(room, session.seat, { socket: null, lostAt: at, ready: false, rematch: false });
    const paused: Room = room.status === RoomStatus.Playing
      ? { ...detached, status: RoomStatus.Paused, pausedSeat: session.seat, pauseUntil: at + graceMs }
      : detached;
    commit(paused);
  };

  const sendSnapshot = (room: Room, match: MatchState, events: readonly SimEvent[]): void => {
    const message: ServerMessage = { t: 'snap', f: encodeFrame(frameOf(match)), e: events };
    room.seats.forEach((seat) => send(seat?.socket ?? null, message));
  };

  const stepRoom = (room: Room): Room => {
    const { match } = room;
    if (!match || match.phase === Phase.Ended) return room;
    const [home, away] = room.seats;
    const next = step(match, [home && mergeInput(home.input, home.latched), away && mergeInput(away.input, away.latched)]);
    const events = [...room.events, ...next.events];
    const due = !(next.tick % SNAPSHOT_EVERY) || next.phase === Phase.Ended;
    if (due) sendSnapshot(room, next, events);
    return { ...mapSeats(room, (seat) => ({ ...seat, latched: NEUTRAL_INPUT })), match: next, events: due ? [] : events };
  };

  /** Rechnet die seit dem letzten Lauf vergangene Zeit in festen Schritten nach. */
  const advance = (room: Room, at: number): Room => {
    const elapsed = (Math.min(at - room.clock, MAX_CATCHUP_MS) / MS_PER_SECOND) * timeScale;
    const debt = room.debt + elapsed;
    const steps = Math.floor(debt / DT);
    const stepped = Array.from({ length: steps }).reduce<Room>((acc) => stepRoom(acc), room);
    return { ...stepped, clock: at, debt: debt - steps * DT };
  };

  const finish = (room: Room, match: MatchState): void => {
    const result: MatchResult = { reason: EndReason.Finished, score: match.score, goals: match.goals, leaver: null };
    commit({ ...room, status: RoomStatus.Ended, result, touchedAt: now() });
  };

  const runLoop = (): void => {
    const at = now();
    [...rooms.values()].filter((room) => room.status === RoomStatus.Playing).forEach((room) => {
      const advanced = advance(room, at);
      rooms.set(advanced.code, advanced);
      if (advanced.match?.phase === Phase.Ended) finish(advanced, advanced.match);
    });
  };

  const closeRoom = (room: Room): void => {
    room.seats.forEach((seat) => {
      send(seat?.socket ?? null, { t: 'closed' });
      if (seat?.socket) leaveSession(seat.socket);
    });
    rooms.delete(room.code);
  };

  /** Fristen: abgelaufene Wiederbeitritte, verwaiste Plätze und alte Räume. */
  const sweepRoom = (room: Room, at: number): void => {
    const missing = TEAM_IDS.filter((index) => room.seats[index] !== null && !isOnline(room.seats[index]));
    if (room.status === RoomStatus.Paused) {
      if (at < room.pauseUntil) return;
      if (missing.length === room.seats.filter((seat) => seat !== null).length) return closeRoom(room);
      return abandon(room, missing[0]);
    }
    const expired = missing.find((index) => at - (room.seats[index]?.lostAt ?? at) >= graceMs);
    if (expired !== undefined) return removeSeat(room, expired);
    if (room.status !== RoomStatus.Playing && at - room.touchedAt >= idleMs) closeRoom(room);
  };

  const sweep = (): void => {
    const at = now();
    [...rooms.values()].forEach((room) => sweepRoom(room, at));
  };

  const heartbeat = (): void => {
    [...sessions.entries()].forEach(([socket, session]) => {
      if (!session.alive) return socket.terminate();
      sessions.set(socket, { ...session, alive: false });
      return socket.ping();
    });
  };

  const http = createServer((request, response) => {
    void createHttpHandler(options.staticDir ?? null, () => rooms.size)(request, response);
  });
  const sockets = new WebSocketServer({ noServer: true, maxPayload: MAX_MESSAGE_BYTES });

  sockets.on('connection', (socket: WebSocket) => {
    sessions.set(socket, { code: null, seat: 0, tokens: BUCKET_CAPACITY, refilledAt: now(), strikes: 0, alive: true });
    socket.on('message', (data, isBinary) => onMessage(socket, data, isBinary));
    socket.on('pong', () => {
      const session = sessions.get(socket);
      if (session) sessions.set(socket, { ...session, alive: true });
    });
    socket.on('close', () => onClose(socket));
    socket.on('error', () => socket.terminate());
  });

  http.on('upgrade', (request, socket, head) => {
    const path = new URL(request.url ?? '/', 'http://localhost').pathname;
    if (path !== WS_PATH) return socket.destroy();
    return sockets.handleUpgrade(request, socket, head, (ws) => sockets.emit('connection', ws, request));
  });

  const timers = [
    setInterval(runLoop, LOOP_MS),
    setInterval(sweep, options.sweepMs ?? DEFAULT_SWEEP_MS),
    setInterval(heartbeat, options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS),
  ];

  await new Promise<void>((resolve, rejectListen) => {
    http.once('error', rejectListen);
    http.listen(options.port ?? 0, options.host, () => resolve());
  });

  const close = async (): Promise<void> => {
    timers.forEach((timer) => clearInterval(timer));
    [...sessions.keys()].forEach((socket) => socket.terminate());
    await new Promise<void>((resolve) => { sockets.close(() => resolve()); });
    await new Promise<void>((resolve) => { http.close(() => resolve()); });
    rooms.clear();
  };

  // Nach `listen` auf einem TCP-Port liefert `address()` immer ein AddressInfo-Objekt (kein Pipe-Name).
  const { port } = http.address() as AddressInfo;
  return { port, roomCount: () => rooms.size, close };
};
