import { describe, expect, it } from 'vitest';
import {
  CODE_LENGTH, decodeFrame, encodeFrame, encodeMessage, hashForRoom, normalizeCode, parseClientMessage,
  parseServerMessage, roomCodeFromHash, type ClientMessage,
} from '../net/protocol.ts';
import { isLocalHost, resolveServerUrl } from '../net/serverUrl.ts';
import { createMatch } from '../sim/formation.ts';
import { frameOf } from '../sim/frame.ts';
import { DURATIONS, NAME_MAX } from '../sim/constants.ts';
import { AVERAGE, makeConfig, makeTeam, run, seconds } from './helpers.ts';

const PLAY_SECONDS = 5;
const ROUNDING = 0.006;
const BAD_DURATION = 17;
const HUGE = 1e12;
const LONG_TEXT = 500;
const TEAM = makeTeam('A', AVERAGE, 'human');
const PLAIN_TEAM = { name: TEAM.name, players: TEAM.players };

describe('Raumcode und Einladungslink', () => {
  it.each([
    { raw: 'k7mq', code: 'K7MQ' },
    { raw: ' ABCD ', code: 'ABCD' },
    { raw: 'AB0D', code: null },
    { raw: 'ABID', code: null },
    { raw: 'ABC', code: null },
    { raw: 'ABCDE', code: null },
    { raw: 'AB-D', code: null },
  ])('normalizeCode("$raw") → $code', ({ raw, code }) => {
    expect(normalizeCode(raw)).toBe(code);
  });

  it('der Hash trägt nur „raum-CODE“ und lässt sich zurücklesen', () => {
    expect(hashForRoom('K7MQ')).toBe('#raum-K7MQ');
    expect(roomCodeFromHash('#raum-K7MQ')).toBe('K7MQ');
    expect(roomCodeFromHash('#raum-k7mq')).toBe('K7MQ');
    expect(roomCodeFromHash('#team')).toBeNull();
    expect(roomCodeFromHash('#raum-<script>')).toBeNull();
    expect(hashForRoom('K7MQ')).toHaveLength('#raum-'.length + CODE_LENGTH);
  });
});

describe('Zustandsbild auf der Leitung', () => {
  it('kommt nach dem Packen und Entpacken (bis auf Rundung) gleich an', () => {
    const state = run(createMatch(makeConfig()), seconds(PLAY_SECONDS)).state;
    const frame = frameOf(state);
    const back = decodeFrame(JSON.parse(JSON.stringify(encodeFrame(frame))));
    expect(back).not.toBeNull();
    expect(back?.phase).toBe(frame.phase);
    expect(back?.score).toEqual(frame.score);
    expect(back?.controlled).toEqual(frame.controlled);
    expect(back?.restart).toEqual(frame.restart);
    expect(back?.ball.owner).toBe(frame.ball.owner);
    expect(Math.abs((back?.ball.pos.x ?? 0) - frame.ball.pos.x)).toBeLessThan(ROUNDING);
    back?.players.forEach((p, i) => {
      expect(Math.abs(p.pos.x - frame.players[i].pos.x)).toBeLessThan(ROUNDING);
      expect(Math.abs(p.pos.y - frame.players[i].pos.y)).toBeLessThan(ROUNDING);
    });
  });

  it.each([
    { name: 'kein Feld', raw: 'frame' },
    { name: 'zu kurz', raw: [1, 0, 0] },
    { name: 'mit Text', raw: Array.from({ length: encodeFrame(frameOf(createMatch(makeConfig()))).length }, () => 'x') },
  ])('ungültiges Bild ($name) wird verworfen', ({ raw }) => {
    expect(decodeFrame(raw)).toBeNull();
  });
});

describe('Nachrichten vom Client', () => {
  const valid: readonly ClientMessage[] = [
    { t: 'create' },
    { t: 'join', code: 'K7MQ' },
    { t: 'rejoin', code: 'K7MQ', token: 'abc' },
    { t: 'team', team: PLAIN_TEAM },
    { t: 'ready', ready: true },
    { t: 'duration', seconds: DURATIONS[0] },
    { t: 'input', input: { moveX: 1, moveY: 0, pass: true, shoot: false, switchOrTackle: false } },
    { t: 'rematch', want: true },
    { t: 'leave' },
    { t: 'ping', n: 1 },
  ];

  it.each(valid.map((message) => ({ message })))('gültig: $message.t', ({ message }) => {
    expect(parseClientMessage(encodeMessage(message))).toEqual(message);
  });

  it.each([
    { name: 'kein JSON', text: '{oops' },
    { name: 'kein Objekt', text: '[1,2]' },
    { name: 'unbekannter Typ', text: '{"t":"hack"}' },
    { name: 'geerbter Schlüssel als Typ', text: '{"t":"toString"}' },
    { name: 'Code mit falschen Zeichen', text: '{"t":"join","code":"<img>"}' },
    { name: 'bereit ohne Wahrheitswert', text: '{"t":"ready","ready":"ja"}' },
    { name: 'nicht wählbare Spielzeit', text: JSON.stringify({ t: 'duration', seconds: BAD_DURATION }) },
    { name: 'Mannschaft mit vier Spielern', text: JSON.stringify({ t: 'team', team: { ...PLAIN_TEAM, players: PLAIN_TEAM.players.slice(1) } }) },
    { name: 'Mannschaft mit Wert über 99', text: JSON.stringify({ t: 'team', team: { ...PLAIN_TEAM, players: PLAIN_TEAM.players.map((p) => ({ ...p, pace: HUGE })) } }) },
    { name: 'Eingabe ohne Objekt', text: '{"t":"input","input":5}' },
  ])('ungültig: $name', ({ text }) => {
    expect(parseClientMessage(text)).toBeNull();
  });

  it('Eingaben werden beim Lesen begrenzt', () => {
    const parsed = parseClientMessage(JSON.stringify({ t: 'input', input: { moveX: HUGE, moveY: HUGE, pass: 'x' } }));
    expect(parsed?.t).toBe('input');
    const input = parsed?.t === 'input' ? parsed.input : null;
    expect(Math.hypot(input?.moveX ?? HUGE, input?.moveY ?? HUGE)).toBeLessThanOrEqual(1 + ROUNDING);
    expect(input?.pass).toBe(false);
  });

  it('zu lange Namen werden gekürzt, Steuerzeichen entfernt', () => {
    const noisy = { ...PLAIN_TEAM, name: `  Team\u0000\u0007 ${'x'.repeat(LONG_TEXT)}` };
    const parsed = parseClientMessage(JSON.stringify({ t: 'team', team: noisy }));
    const name = parsed?.t === 'team' ? parsed.team.name : '';
    expect(name.startsWith('Team x')).toBe(true);
    expect(name).toHaveLength(NAME_MAX);
  });
});

describe('Nachrichten vom Server', () => {
  it('Raumzustand und Fehler werden gelesen, Unbekanntes verworfen', () => {
    const room = {
      code: 'K7MQ', status: 'lobby', duration: DURATIONS[1],
      seats: [{ name: 'A', connected: true, hasTeam: true, ready: false, rematch: false }, null], pause: null, result: null,
    };
    expect(parseServerMessage(JSON.stringify({ t: 'room', room }))).toEqual({ t: 'room', room });
    expect(parseServerMessage('{"t":"error","code":"room_full"}')).toEqual({ t: 'error', code: 'room_full' });
    expect(parseServerMessage('{"t":"error","code":"???"}')).toBeNull();
    expect(parseServerMessage('{"t":"room","room":{"status":"party"}}')).toBeNull();
    expect(parseServerMessage('nope')).toBeNull();
  });
});

describe('Adresse des Spielservers', () => {
  it.each([
    { name: 'fest eingestellt', env: 'wss://spiel.example/ws', page: { protocol: 'https:', hostname: 'x.example', host: 'x.example' }, url: 'wss://spiel.example/ws' },
    { name: 'localhost', env: undefined, page: { protocol: 'http:', hostname: 'localhost', host: 'localhost:5173' }, url: 'ws://localhost:8787/ws' },
    { name: '127.0.0.1', env: '', page: { protocol: 'http:', hostname: '127.0.0.1', host: '127.0.0.1:4173' }, url: 'ws://127.0.0.1:8787/ws' },
    { name: 'Heimnetz', env: undefined, page: { protocol: 'http:', hostname: '192.168.1.20', host: '192.168.1.20:5173' }, url: 'ws://192.168.1.20:8787/ws' },
    { name: 'öffentliche Seite', env: undefined, page: { protocol: 'https:', hostname: 'spiel.example', host: 'spiel.example' }, url: 'wss://spiel.example/ws' },
    { name: 'öffentliche Seite mit Port', env: undefined, page: { protocol: 'http:', hostname: 'spiel.example', host: 'spiel.example:8080' }, url: 'ws://spiel.example:8080/ws' },
  ])('$name → $url', ({ env, page, url }) => {
    expect(resolveServerUrl(env, page)).toBe(url);
  });

  it.each([
    { host: '10.0.0.5', local: true },
    { host: '172.16.4.1', local: true },
    { host: '172.32.0.1', local: false },
    { host: '192.168.178.44', local: true },
    { host: '193.168.1.1', local: false },
    { host: 'mein-pc.local', local: true },
    { host: 'example.com', local: false },
  ])('isLocalHost($host) = $local', ({ host, local }) => {
    expect(isLocalHost(host)).toBe(local);
  });
});
