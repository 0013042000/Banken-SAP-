/**
 * Verbindung zum Spielserver: Raum erstellen/beitreten, Zustand des Raums, automatischer
 * Wiederbeitritt mit Sitzungstoken nach kurzen Unterbrechungen.
 * Kommt gar keine Verbindung zustande, endet der Versuch mit dem Status „unavailable“ – ohne Dauerschleife.
 */
import {
  decodeFrame, encodeMessage, ErrorCode, parseServerMessage,
  type ClientMessage, type RoomView, type ServerMessage,
} from './protocol.ts';
import type { Frame, SimEvent, TeamId, TeamSpec } from '../sim/index.ts';

export const ConnStatus = {
  Idle: 'idle',
  Connecting: 'connecting',
  Connected: 'connected',
  Reconnecting: 'reconnecting',
  /** Der Server war nie erreichbar (z. B. auf einem Hosting ohne Spielserver). */
  Unavailable: 'unavailable',
  /** Verbindung endgültig verloren oder Raum geschlossen. */
  Lost: 'lost',
} as const;
export type ConnStatus = (typeof ConnStatus)[keyof typeof ConnStatus];

/** Beginn eines Spiels; `serial` ändert sich mit jedem neuen Start (auch nach Wiederbeitritt). */
export interface StartInfo {
  readonly serial: number;
  readonly teams: readonly [TeamSpec, TeamSpec];
  readonly duration: number;
  readonly frame: Frame;
}

export interface ClientState {
  readonly status: ConnStatus;
  readonly seat: TeamId | null;
  readonly room: RoomView | null;
  readonly error: ErrorCode | null;
  readonly start: StartInfo | null;
}

export type SnapshotListener = (frame: Frame, events: readonly SimEvent[]) => void;

export interface RoomClient {
  readonly getState: () => ClientState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly create: () => void;
  readonly join: (code: string) => void;
  readonly send: (message: ClientMessage) => void;
  readonly onSnapshot: (listener: SnapshotListener | null) => void;
  /** Raum verlassen und Verbindung schließen. */
  readonly leave: () => void;
  readonly dispose: () => void;
}

interface Session {
  readonly code: string;
  readonly token: string;
  readonly graceMs: number;
}

type Timer = ReturnType<typeof setTimeout>;
type MessageHandler<TType extends ServerMessage['t']> = (message: Extract<ServerMessage, { t: TType }>) => void;

const CONNECT_TIMEOUT_MS = 6000;
const RETRY_MS = 1200;
const PING_MS = 2000;
/** So lange ohne jede Nachricht gilt die Verbindung als abgerissen. */
const STALE_MS = 7000;

const INITIAL: ClientState = Object.freeze({ status: ConnStatus.Idle, seat: null, room: null, error: null, start: null });

export const createRoomClient = (url: string): RoomClient => {
  let state: ClientState = INITIAL;
  let socket: WebSocket | null = null;
  let session: Session | null = null;
  let lastMessageAt = 0;
  let reconnectUntil = 0;
  let serial = 0;
  let pings = 0;
  let snapshotListener: SnapshotListener | null = null;
  let connectTimer: Timer | null = null;
  let retryTimer: Timer | null = null;
  let pingTimer: Timer | null = null;
  const listeners = new Set<() => void>();

  const update = (patch: Partial<ClientState>): void => {
    state = { ...state, ...patch };
    listeners.forEach((listener) => listener());
  };

  const clearTimers = (): void => {
    if (connectTimer) clearTimeout(connectTimer);
    if (retryTimer) clearTimeout(retryTimer);
    connectTimer = null;
    retryTimer = null;
  };

  /** Trennt den aktuellen Socket ab, ohne dass sein close-Ereignis noch etwas auslöst. */
  const dropSocket = (): void => {
    const old = socket;
    socket = null;
    if (!old) return;
    try {
      old.close();
    } catch {
      // Ein bereits geschlossener Socket ist hier das gewünschte Ergebnis.
    }
  };

  const sendNow = (message: ClientMessage): void => {
    if (socket?.readyState === WebSocket.OPEN) socket.send(encodeMessage(message));
  };

  const giveUp = (status: ConnStatus): void => {
    session = null;
    setHeartbeat(false);
    clearTimers();
    dropSocket();
    update({ status, room: null, start: null });
  };

  const handlers: { readonly [K in ServerMessage['t']]: MessageHandler<K> } = {
    joined: (message) => {
      session = { code: message.code, token: message.token, graceMs: message.graceMs };
      update({ status: ConnStatus.Connected, seat: message.seat, error: null });
    },
    room: (message) => update({ room: message.room }),
    start: (message) => {
      const frame = decodeFrame(message.frame);
      if (!frame) return;
      serial += 1;
      update({ start: { serial, teams: message.teams, duration: message.duration, frame } });
    },
    snap: (message) => {
      const frame = decodeFrame(message.f);
      if (frame) snapshotListener?.(frame, message.e);
    },
    error: (message) => {
      if (message.code === ErrorCode.Expired || message.code === ErrorCode.TooFast) {
        giveUp(ConnStatus.Lost);
        update({ error: message.code });
        return;
      }
      if (session) {
        update({ error: message.code });
        return;
      }
      giveUp(ConnStatus.Idle);
      update({ error: message.code });
    },
    closed: () => giveUp(ConnStatus.Lost),
    pong: () => undefined,
  };

  const onMessage = (data: unknown): void => {
    lastMessageAt = Date.now();
    const message = typeof data === 'string' ? parseServerMessage(data) : null;
    if (!message) return;
    // Die Tabelle ordnet jedem Nachrichtentyp genau seinen Handler zu; TypeScript kann das über den Indexzugriff nicht nachvollziehen.
    const handle = handlers[message.t] as MessageHandler<ServerMessage['t']>;
    handle(message);
  };

  /** Verbindung weg: mit Sitzung wird neu verbunden, ohne Sitzung war der Server nicht erreichbar. */
  const onDown = (): void => {
    clearTimers();
    if (!session) {
      if (state.status === ConnStatus.Connecting) update({ status: ConnStatus.Unavailable });
      return;
    }
    if (state.status !== ConnStatus.Reconnecting) {
      reconnectUntil = Date.now() + session.graceMs;
      update({ status: ConnStatus.Reconnecting });
    }
    retryTimer = setTimeout(retry, RETRY_MS);
  };

  const open = (first: ClientMessage): void => {
    clearTimers();
    dropSocket();
    try {
      const ws = new WebSocket(url);
      socket = ws;
      connectTimer = setTimeout(() => {
        if (socket === ws && ws.readyState !== WebSocket.OPEN) {
          dropSocket();
          onDown();
        }
      }, CONNECT_TIMEOUT_MS);
      ws.addEventListener('open', () => {
        if (socket !== ws) return;
        lastMessageAt = Date.now();
        ws.send(encodeMessage(first));
      });
      ws.addEventListener('message', (event) => {
        if (socket === ws) onMessage(event.data);
      });
      ws.addEventListener('close', () => {
        if (socket !== ws) return;
        socket = null;
        onDown();
      });
    } catch {
      // Der Browser hat die Verbindung gar nicht erst erlaubt (z. B. Sicherheitsrichtlinie der Seite).
      socket = null;
      onDown();
    }
  };

  function retry(): void {
    retryTimer = null;
    if (!session) return;
    if (Date.now() > reconnectUntil) {
      giveUp(ConnStatus.Lost);
      return;
    }
    open({ t: 'rejoin', code: session.code, token: session.token });
  }

  const checkAlive = (): void => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (Date.now() - lastMessageAt > STALE_MS) {
      dropSocket();
      onDown();
      return;
    }
    pings += 1;
    sendNow({ t: 'ping', n: pings });
  };

  /** Der Herzschlag läuft nur, solange ein Raum betreten oder gesucht wird. */
  const setHeartbeat = (on: boolean): void => {
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = on ? setInterval(checkAlive, PING_MS) : null;
  };

  const begin = (first: ClientMessage): void => {
    session = null;
    setHeartbeat(true);
    update({ ...INITIAL, status: ConnStatus.Connecting });
    open(first);
  };

  const leave = (): void => {
    sendNow({ t: 'leave' });
    session = null;
    setHeartbeat(false);
    clearTimers();
    dropSocket();
    update(INITIAL);
  };

  return {
    getState: (): ClientState => state,
    subscribe: (listener): (() => void) => {
      listeners.add(listener);
      return (): void => { listeners.delete(listener); };
    },
    create: (): void => begin({ t: 'create' }),
    join: (code): void => begin({ t: 'join', code }),
    send: sendNow,
    onSnapshot: (listener): void => { snapshotListener = listener; },
    leave,
    dispose: (): void => {
      leave();
      snapshotListener = null;
    },
  };
};
