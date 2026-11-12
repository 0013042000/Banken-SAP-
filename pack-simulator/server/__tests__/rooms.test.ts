/** Spielserver mit echten WebSocket-Clients: Raum, Spiel, Wiederbeitritt, Abbruch, Abwehr ungültiger Daten. */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import {
  CODE_LENGTH, decodeFrame, encodeMessage, EndReason, ErrorCode, MAX_MESSAGE_BYTES, parseServerMessage, RoomStatus, WS_PATH,
  type ClientMessage, type RoomView, type ServerMessage,
} from '../../src/football/net/protocol.ts';
import { DURATIONS, Phase, TEAM_SIZE, type TeamInput, type TeamSpec } from '../../src/football/sim/index.ts';
import { startGameServer, type GameServer, type GameServerOptions } from '../rooms.ts';

type Of<TType extends ServerMessage['t']> = Extract<ServerMessage, { t: TType }>;

interface Waiter {
  readonly accept: (message: ServerMessage) => boolean;
  readonly resolve: (message: ServerMessage) => void;
}

interface TestClient {
  readonly socket: WebSocket;
  /** Alle bisher empfangenen Nachrichten in Empfangsreihenfolge. */
  readonly all: ServerMessage[];
  readonly send: (message: ClientMessage) => void;
  readonly sendRaw: (text: string) => void;
  /** Wartet auf die nächste (noch nicht abgeholte) Nachricht dieses Typs, die die Bedingung erfüllt. */
  readonly next: <TType extends ServerMessage['t']>(type: TType, accept?: (message: Of<TType>) => boolean) => Promise<Of<TType>>;
  readonly closed: Promise<number>;
}

const WAIT_MS = 4000;
const TEST_TIMEOUT_MS = 20_000;
const FAST = 30;
const SHORT_GRACE_MS = 300;
const SHORT_IDLE_MS = 250;
const SWEEP_MS = 20;
const SETTLE_MS = 150;
const STAT = 80;
const ONE_MINUTE = DURATIONS[0];
/** Dauerfeuer weit über dem Tempolimit. */
const FLOOD = 1200;
/** Kurzer Schwall, wie er nach einem Funkloch gestaut ankommen kann. */
const BURST = 200;
const BURST_SETTLE_MS = 1500;
const STRIKES = 8;
const MIN_ADVANCE = 3;
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const CLOSE_TOO_BIG = 1009;
const CLOSE_POLICY = 1008;
const FRONT_PLAYER = TEAM_SIZE - 1;
const TICK_INDEX = 0;
const RUN_RIGHT: TeamInput = { moveX: 1, moveY: 0, pass: false, shoot: false, switchOrTackle: false };

const servers: GameServer[] = [];
const sockets: WebSocket[] = [];

const pause = async (ms: number): Promise<void> => {
  await new Promise<void>((resolve) => { setTimeout(resolve, ms); });
};

const makeTeam = (name: string): TeamSpec => ({
  name,
  players: Array.from({ length: TEAM_SIZE }, (_, slot) => ({
    id: `${name.toLowerCase()}-${slot}`, name: `${name} ${slot}`,
    pace: STAT, shot: STAT, pass: STAT, dribble: STAT, defense: STAT, physical: STAT, keeping: STAT,
  })),
});

const boot = async (options: GameServerOptions = {}): Promise<GameServer> => {
  const server = await startGameServer({ port: 0, host: '127.0.0.1', sweepMs: SWEEP_MS, ...options });
  servers.push(server);
  return server;
};

const connect = async (server: GameServer): Promise<TestClient> => {
  const socket = new WebSocket(`ws://127.0.0.1:${server.port}${WS_PATH}`);
  sockets.push(socket);
  const all: ServerMessage[] = [];
  const unread: ServerMessage[] = [];
  const waiters: Waiter[] = [];
  socket.on('message', (data) => {
    const message = parseServerMessage(String(data));
    if (!message) return;
    all.push(message);
    const index = waiters.findIndex((waiter) => waiter.accept(message));
    if (index < 0) {
      unread.push(message);
      return;
    }
    waiters.splice(index, 1)[0].resolve(message);
  });
  const closed = new Promise<number>((resolve) => { socket.on('close', (code) => resolve(code)); });
  socket.on('error', () => undefined);
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });

  const next: TestClient['next'] = async (type, accept = () => true) => {
    // Der Typ-Schlüssel `t` wurde geprüft, damit hat die Nachricht die Form des gesuchten Typs.
    const matches = (message: ServerMessage): boolean => message.t === type && accept(message as Of<typeof type>);
    const ready = unread.findIndex(matches);
    const message = ready >= 0
      ? unread.splice(ready, 1)[0]
      : await new Promise<ServerMessage>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Keine Nachricht „${type}“ innerhalb von ${WAIT_MS} ms`)), WAIT_MS);
        waiters.push({ accept: matches, resolve: (found) => { clearTimeout(timer); resolve(found); } });
      });
    return message as Of<typeof type>;
  };

  return {
    socket, all, next, closed,
    send: (message) => socket.send(encodeMessage(message)),
    sendRaw: (text) => socket.send(text),
  };
};

const roomWith = (status: RoomStatus) => (message: Of<'room'>): boolean => message.room.status === status;

/** Erstellt einen Raum mit zwei Spielern, die beide ihre Aufstellung gewählt haben. */
const seatBoth = async (server: GameServer): Promise<{ a: TestClient; b: TestClient; code: string; tokenA: string; tokenB: string }> => {
  const a = await connect(server);
  a.send({ t: 'create' });
  const joinedA = await a.next('joined');
  const b = await connect(server);
  b.send({ t: 'join', code: joinedA.code });
  const joinedB = await b.next('joined');
  expect(joinedA.seat).toBe(0);
  expect(joinedB.seat).toBe(1);
  a.send({ t: 'team', team: makeTeam('Alpha') });
  b.send({ t: 'team', team: makeTeam('Beta') });
  await a.next('room', (m) => m.room.seats[1]?.hasTeam === true);
  return { a, b, code: joinedA.code, tokenA: joinedA.token, tokenB: joinedB.token };
};

const startMatch = async (server: GameServer): Promise<Awaited<ReturnType<typeof seatBoth>>> => {
  const seated = await seatBoth(server);
  seated.a.send({ t: 'ready', ready: true });
  seated.b.send({ t: 'ready', ready: true });
  await seated.a.next('start');
  await seated.b.next('start');
  return seated;
};

const snaps = (client: TestClient): readonly Of<'snap'>[] => client.all.filter((m) => m.t === 'snap');
const lastRoom = (client: TestClient): RoomView | undefined => client.all.filter((m) => m.t === 'room').at(-1)?.room;

const httpGet = async (port: number, path: string): Promise<{ readonly status: number; readonly body: string }> =>
  new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });

afterEach(async () => {
  sockets.splice(0).forEach((socket) => socket.terminate());
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe('Raum und Spiel', () => {
  it('erstellen, beitreten, bereit, gemeinsamer Start – beide sehen dasselbe Spiel bis zum Endstand', async () => {
    const server = await boot({ timeScale: FAST });
    const { a, b, code } = await seatBoth(server);
    expect(code).toHaveLength(CODE_LENGTH);
    a.send({ t: 'duration', seconds: ONE_MINUTE });
    await b.next('room', (m) => m.room.duration === ONE_MINUTE);

    a.send({ t: 'ready', ready: true });
    const waiting = await b.next('room', (m) => m.room.seats[0]?.ready === true);
    expect(waiting.room.status).toBe(RoomStatus.Lobby);
    b.send({ t: 'ready', ready: true });
    const startA = await a.next('start');
    const startB = await b.next('start');
    expect(startA.teams.map((team) => team.name)).toEqual(['Alpha', 'Beta']);
    expect(startB).toEqual(startA);
    expect(startA.duration).toBe(ONE_MINUTE);

    a.send({ t: 'input', input: RUN_RIGHT });
    const endA = await a.next('room', roomWith(RoomStatus.Ended));
    const endB = await b.next('room', roomWith(RoomStatus.Ended));
    expect(endA.room.result?.reason).toBe(EndReason.Finished);
    expect(endB.room.result).toEqual(endA.room.result);

    const framesA = new Map(snaps(a).map((snap) => [snap.f[TICK_INDEX], snap]));
    const shared = snaps(b).filter((snap) => framesA.has(snap.f[TICK_INDEX]));
    expect(shared.length).toBeGreaterThan(FAST);
    shared.forEach((snap) => expect(snap).toEqual(framesA.get(snap.f[TICK_INDEX])));

    const final = decodeFrame(snaps(a).at(-1)?.f);
    expect(final?.phase).toBe(Phase.Ended);
    expect(final?.score).toEqual(endA.room.result?.score);
    const goalEvents = (client: TestClient): number => snaps(client).flatMap((snap) => snap.e).filter((event) => event.type === 'goal').length;
    const totalGoals = (endA.room.result?.score[0] ?? 0) + (endA.room.result?.score[1] ?? 0);
    expect(goalEvents(a)).toBe(totalGoals);
    expect(goalEvents(b)).toBe(totalGoals);
    expect(endA.room.result?.goals).toHaveLength(totalGoals);
  }, TEST_TIMEOUT_MS);

  it('Eingaben wirken: der eigene Spieler läuft los, ohne Eingabe bleibt er stehen', async () => {
    const server = await boot({ timeScale: FAST });
    const { a } = await startMatch(server);
    const playing = (snap: Of<'snap'>): boolean => decodeFrame(snap.f)?.phase === Phase.Play;
    const before = await a.next('snap', playing);
    a.send({ t: 'input', input: RUN_RIGHT });
    const later = await a.next('snap', (snap) => snap.f[TICK_INDEX] > before.f[TICK_INDEX] + FAST);
    const frontX = (snap: Of<'snap'>): number => decodeFrame(snap.f)?.players[FRONT_PLAYER].pos.x ?? Number.NaN;
    expect(frontX(later) - frontX(before)).toBeGreaterThan(MIN_ADVANCE);
  }, TEST_TIMEOUT_MS);

  it('Revanche erst, wenn beide zustimmen', async () => {
    const server = await boot({ timeScale: FAST });
    const { a, b } = await seatBoth(server);
    a.send({ t: 'duration', seconds: ONE_MINUTE });
    a.send({ t: 'ready', ready: true });
    b.send({ t: 'ready', ready: true });
    await a.next('start');
    await a.next('room', roomWith(RoomStatus.Ended));
    a.send({ t: 'rematch', want: true });
    const asked = await b.next('room', (m) => m.room.seats[0]?.rematch === true);
    expect(asked.room.status).toBe(RoomStatus.Ended);
    b.send({ t: 'rematch', want: true });
    const again = await a.next('start');
    expect(again.teams.map((team) => team.name)).toEqual(['Alpha', 'Beta']);
    const running = await a.next('room', roomWith(RoomStatus.Playing));
    expect(running.room.result).toBeNull();
  }, TEST_TIMEOUT_MS);
});

describe('Verbindungsabbruch', () => {
  it('kurze Unterbrechung: Spiel pausiert, Wiederbeitritt mit Token setzt es fort', async () => {
    const server = await boot();
    const { a, b, code, tokenB } = await startMatch(server);
    await a.next('snap');
    b.socket.terminate();
    const paused = await a.next('room', roomWith(RoomStatus.Paused));
    expect(paused.room.pause?.seat).toBe(1);
    expect(paused.room.seats[1]?.connected).toBe(false);
    await pause(SETTLE_MS);
    const frozenAt = snaps(a).at(-1)?.f[TICK_INDEX] ?? 0;
    await pause(SETTLE_MS);
    expect(snaps(a).at(-1)?.f[TICK_INDEX]).toBe(frozenAt);

    const back = await connect(server);
    back.send({ t: 'rejoin', code, token: tokenB });
    const rejoined = await back.next('joined');
    expect(rejoined.seat).toBe(1);
    const resumedStart = await back.next('start');
    expect(resumedStart.frame[TICK_INDEX]).toBeGreaterThanOrEqual(frozenAt);
    const resumed = await a.next('room', roomWith(RoomStatus.Playing));
    expect(resumed.room.seats[1]?.connected).toBe(true);
    const moving = await a.next('snap', (snap) => snap.f[TICK_INDEX] > frozenAt);
    expect(moving.f[TICK_INDEX]).toBeGreaterThan(frozenAt);
    await back.next('snap');
  }, TEST_TIMEOUT_MS);

  it('nach Ablauf der Frist: geordneter Abbruch mit Meldung, Token ist verfallen, Raum wird aufgeräumt', async () => {
    const server = await boot({ graceMs: SHORT_GRACE_MS });
    const { a, b, code, tokenB } = await startMatch(server);
    b.socket.terminate();
    await a.next('room', roomWith(RoomStatus.Paused));
    const ended = await a.next('room', roomWith(RoomStatus.Ended));
    expect(ended.room.result).toMatchObject({ reason: EndReason.Abandoned, leaver: 1 });
    expect(ended.room.seats[1]).toBeNull();

    const late = await connect(server);
    late.send({ t: 'rejoin', code, token: tokenB });
    expect((await late.next('error')).code).toBe(ErrorCode.Expired);

    expect(server.roomCount()).toBe(1);
    a.send({ t: 'leave' });
    await pause(SETTLE_MS);
    expect(server.roomCount()).toBe(0);
  }, TEST_TIMEOUT_MS);

  it('wer das Spiel verlässt, beendet es sofort für den anderen', async () => {
    const server = await boot();
    const { a, b } = await startMatch(server);
    b.send({ t: 'leave' });
    const ended = await a.next('room', roomWith(RoomStatus.Ended));
    expect(ended.room.result).toMatchObject({ reason: EndReason.Abandoned, leaver: 1 });
    a.send({ t: 'rematch', want: true });
    expect((await a.next('error')).code).toBe(ErrorCode.NotAllowed);
  }, TEST_TIMEOUT_MS);

  it('verlassene und untätige Räume werden geschlossen', async () => {
    const server = await boot({ graceMs: SHORT_GRACE_MS, idleMs: SHORT_IDLE_MS });
    const lonely = await connect(server);
    lonely.send({ t: 'create' });
    await lonely.next('joined');
    expect(server.roomCount()).toBe(1);
    await lonely.next('closed');
    expect(server.roomCount()).toBe(0);

    const gone = await connect(server);
    gone.send({ t: 'create' });
    await gone.next('joined');
    gone.socket.terminate();
    await pause(SHORT_GRACE_MS + SETTLE_MS);
    expect(server.roomCount()).toBe(0);
  }, TEST_TIMEOUT_MS);
});

describe('Abwehr ungültiger Daten', () => {
  it('unbekannter Code, voller Raum und Unsinn werden verständlich abgewiesen', async () => {
    const server = await boot();
    const { a, b, code } = await seatBoth(server);
    const stranger = await connect(server);
    stranger.send({ t: 'join', code: code === 'ZZZZ' ? 'YYYY' : 'ZZZZ' });
    expect((await stranger.next('error')).code).toBe(ErrorCode.UnknownRoom);
    stranger.send({ t: 'join', code });
    expect((await stranger.next('error')).code).toBe(ErrorCode.RoomFull);

    stranger.sendRaw('kein json');
    expect((await stranger.next('error')).code).toBe(ErrorCode.BadMessage);
    stranger.sendRaw(JSON.stringify({ t: 'team', team: { name: 'X', players: [] } }));
    expect((await stranger.next('error')).code).toBe(ErrorCode.BadMessage);
    stranger.socket.send(Buffer.from([0, 1]), { binary: true });
    expect((await stranger.next('error')).code).toBe(ErrorCode.BadMessage);
    stranger.send({ t: 'input', input: RUN_RIGHT });
    stranger.send({ t: 'ready', ready: true });
    expect((await stranger.next('error')).code).toBe(ErrorCode.NotAllowed);

    b.send({ t: 'duration', seconds: ONE_MINUTE });
    expect((await b.next('error')).code).toBe(ErrorCode.NotAllowed);
    expect(lastRoom(a)?.status).toBe(RoomStatus.Lobby);
    expect(server.roomCount()).toBe(1);
  }, TEST_TIMEOUT_MS);

  it('bereit ohne Aufstellung geht nicht', async () => {
    const server = await boot();
    const a = await connect(server);
    a.send({ t: 'create' });
    await a.next('joined');
    a.send({ t: 'ready', ready: true });
    expect((await a.next('error')).code).toBe(ErrorCode.BadTeam);
  }, TEST_TIMEOUT_MS);

  it('wiederholter Unsinn, zu große Nachrichten und Nachrichtenfluten trennen die Verbindung', async () => {
    const server = await boot();
    const noisy = await connect(server);
    Array.from({ length: STRIKES }).forEach(() => noisy.sendRaw('{"t":"???"}'));
    expect(await noisy.closed).toBe(CLOSE_POLICY);

    const big = await connect(server);
    big.sendRaw(JSON.stringify({ t: 'ping', n: 1, pad: 'x'.repeat(MAX_MESSAGE_BYTES) }));
    expect(await big.closed).toBe(CLOSE_TOO_BIG);

    const flood = await connect(server);
    Array.from({ length: FLOOD }).forEach((_, n) => flood.send({ t: 'ping', n }));
    expect((await flood.next('error')).code).toBe(ErrorCode.TooFast);
    expect(await flood.closed).toBe(CLOSE_POLICY);
    expect(flood.all.filter((m) => m.t === 'pong').length).toBeLessThan(FLOOD);
  }, TEST_TIMEOUT_MS);

  it('ein kurzer Schwall (z. B. nach einem Funkloch) wird verworfen, ohne die Verbindung zu trennen', async () => {
    const server = await boot();
    const burst = await connect(server);
    Array.from({ length: BURST }).forEach((_, n) => burst.send({ t: 'ping', n }));
    await new Promise((resolve) => { setTimeout(resolve, BURST_SETTLE_MS); });
    expect(burst.all.some((m) => m.t === 'error')).toBe(false);
    expect(burst.all.filter((m) => m.t === 'pong').length).toBeLessThan(BURST);
    // Danach funktioniert die Verbindung normal weiter.
    burst.send({ t: 'create' });
    expect((await burst.next('joined')).code).toMatch(/^[A-Z2-9]+$/);
  }, TEST_TIMEOUT_MS);
});

describe('HTTP', () => {
  it('meldet seinen Zustand und liefert das gebaute Frontend aus, aber nichts außerhalb davon', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'fb-dist-'));
    await writeFile(join(dir, 'index.html'), '<!doctype html><title>Testseite</title>');
    await writeFile(join(dir, 'app.js'), 'console.log(1)');
    const server = await boot({ staticDir: dir });
    try {
      const health = await httpGet(server.port, '/health');
      expect(health.status).toBe(HTTP_OK);
      expect(JSON.parse(health.body)).toEqual({ ok: true, rooms: 0 });
      expect((await httpGet(server.port, '/')).body).toContain('Testseite');
      expect((await httpGet(server.port, '/app.js')).body).toBe('console.log(1)');
      expect((await httpGet(server.port, '/unterseite')).body).toContain('Testseite');
      expect((await httpGet(server.port, '/fehlt.js')).status).toBe(HTTP_NOT_FOUND);
      expect((await httpGet(server.port, '/..%2f..%2f..%2fetc%2fpasswd')).status).toBe(HTTP_NOT_FOUND);
      expect((await httpGet(server.port, '/%E0%A4%A')).status).toBe(HTTP_NOT_FOUND);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }, TEST_TIMEOUT_MS);
});
