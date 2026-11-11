import { describe, expect, it } from 'vitest';
import { KICKOFF_COUNTDOWN, PITCH_H, PITCH_W, STAT_MAX, STAT_MIN, TICKS_PER_SECOND } from '../sim/constants.ts';
import { createMatch } from '../sim/formation.ts';
import { Phase, specOf, type InputsByTeam, type MatchState, type TeamInput } from '../sim/model.ts';
import { currentSpeed, step } from '../sim/step.ts';
import * as T from '../sim/tuning.ts';
import { InvalidMatchConfigError, sanitizeInput, sanitizeTeam } from '../sim/validate.ts';
import { len } from '../sim/vec.ts';
import { allFinite, AVERAGE, makeConfig, makeSpec, makeTeam, MEDIUM, run, runUntil, seconds, SEED } from './helpers.ts';

const OTHER_SEED = 99;
const SCRIPT_SECONDS = 12;
const SCRIPT_STEPS = seconds(SCRIPT_SECONDS);
const HUGE = 1e9;
const TOLERANCE = 1e-9;
const MAX_SPEED_RATIO = 1.2;
const MAX_SHOT_RATIO = 1.4;
const FULL_MATCH = 60;
/** Reichlich Luft für Pausen (Anstoß, Jubel, Neustarts) über die reine Spielzeit hinaus. */
const PAUSE_ALLOWANCE = 3;
const MATCH_STEP_LIMIT = seconds(FULL_MATCH) * PAUSE_ALLOWANCE;
const STUCK_SECONDS = 8;
const STUCK_LIMIT = seconds(STUCK_SECONDS);
const TO_KICKOFF = seconds(KICKOFF_COUNTDOWN) + 1;
const MIN_SHOTS = 2;
const MIN_PASSES = 10;
const SERIES = 14;
const WEAKER = 83;
const STRONGER = 87;
const SEED_STEP = 7919;
const SWITCH_EVERY = 45;
const SHOOT_EVERY = 70;
const PASS_EVERY = 31;
const QUARTER_TURN = 0.02;

/** Fest vorgegebene, vom Schritt abhängige Eingabe – simuliert einen Menschen reproduzierbar. */
const scripted = (tick: number): TeamInput => ({
  moveX: Math.cos(tick * QUARTER_TURN),
  moveY: Math.sin(tick * QUARTER_TURN),
  pass: !(tick % PASS_EVERY),
  shoot: !(tick % SHOOT_EVERY),
  switchOrTackle: !(tick % SWITCH_EVERY),
});

const humanConfig = (seed: number): ReturnType<typeof makeConfig> =>
  makeConfig({ seed, teams: [makeTeam('A', AVERAGE, 'human'), makeTeam('B', AVERAGE, 'ai')] });

const playScript = (seed: number, steps: number): MatchState =>
  Array.from({ length: steps }).reduce<MatchState>(
    (state) => step(state, [scripted(state.tick), null]),
    createMatch(humanConfig(seed)),
  );

describe('Determinismus', () => {
  it('gleicher Startwert + gleiche Eingaben → exakt gleicher Zustand', () => {
    const first = playScript(SEED, SCRIPT_STEPS);
    const second = playScript(SEED, SCRIPT_STEPS);
    expect(second).toEqual(first);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('anderer Startwert → anderer Verlauf', () => {
    expect(playScript(OTHER_SEED, SCRIPT_STEPS).players).not.toEqual(playScript(SEED, SCRIPT_STEPS).players);
  });

  it('der Zustand ist serialisierbar und läuft nach dem Wiederherstellen identisch weiter', () => {
    const half = playScript(SEED, SCRIPT_STEPS);
    // Der Zustand besteht nur aus JSON-Daten; nach dem Einlesen hat er wieder die Form MatchState.
    const restored = JSON.parse(JSON.stringify(half)) as MatchState;
    const inputs: InputsByTeam = [scripted(1), null];
    expect(run(restored, TICKS_PER_SECOND, inputs).state).toEqual(run(half, TICKS_PER_SECOND, inputs).state);
  });

  it('ein Schritt verändert den übergebenen Zustand nicht', () => {
    const state = playScript(SEED, TICKS_PER_SECOND);
    const before = JSON.stringify(state);
    step(state, [scripted(1), null]);
    expect(JSON.stringify(state)).toBe(before);
  });
});

describe('Eingabebegrenzung', () => {
  it.each([
    { name: 'übergroßer Vektor', raw: { moveX: HUGE, moveY: HUGE }, maxLength: 1 },
    { name: 'negativ übergroß', raw: { moveX: -HUGE, moveY: 0 }, maxLength: 1 },
    { name: 'keine Zahlen', raw: { moveX: Number.NaN, moveY: Number.POSITIVE_INFINITY }, maxLength: 0 },
    { name: 'Text statt Zahlen', raw: { moveX: '1', moveY: '1' }, maxLength: 0 },
    { name: 'gar kein Objekt', raw: 'links', maxLength: 0 },
    { name: 'null', raw: null, maxLength: 0 },
  ])('$name wird begrenzt', ({ raw, maxLength }) => {
    const input = sanitizeInput(raw);
    expect(Math.hypot(input.moveX, input.moveY)).toBeLessThanOrEqual(maxLength + TOLERANCE);
    expect(Number.isFinite(input.moveX) && Number.isFinite(input.moveY)).toBe(true);
  });

  it('Tasten zählen nur bei echtem true', () => {
    const input = sanitizeInput({ moveX: 0, moveY: 0, pass: 1, shoot: 'ja', switchOrTackle: true });
    expect(input).toMatchObject({ pass: false, shoot: false, switchOrTackle: true });
  });

  it('auch mit übergroßer Eingabe läuft niemand schneller als sein Höchsttempo', () => {
    // Bewusst ungültige Eingabe, wie sie ein manipulierter Client schicken könnte.
    const cheat = { moveX: HUGE, moveY: HUGE, pass: false, shoot: false, switchOrTackle: false } as TeamInput;
    const start = runUntil(createMatch(humanConfig(SEED)), (s) => s.phase === Phase.Play, TO_KICKOFF);
    const fastest = Array.from({ length: seconds(1) }).reduce<{ state: MatchState; top: number }>((acc) => {
      const next = step(acc.state, [cheat, null]);
      const active = next.controlled[0];
      const allowed = T.maxSpeed(specOf(next, active));
      return { state: next, top: Math.max(acc.top, len(next.players[active].vel) / allowed) };
    }, { state: start, top: 0 });
    expect(fastest.top).toBeLessThanOrEqual(1 + TOLERANCE);
    expect(allFinite(fastest.state)).toBe(true);
  });

  it('ungültige Mannschaften werden abgewiesen', () => {
    const good = makeTeam('A', AVERAGE, 'ai');
    expect(sanitizeTeam(good)).not.toBeNull();
    expect(sanitizeTeam({ ...good, players: good.players.slice(1) })).toBeNull();
    expect(sanitizeTeam({ ...good, players: good.players.map((p) => ({ ...p, id: 'gleich' })) })).toBeNull();
    expect(sanitizeTeam({ ...good, players: good.players.map((p) => ({ ...p, shot: STAT_MAX + 1 })) })).toBeNull();
    expect(sanitizeTeam({ ...good, players: good.players.map((p) => ({ ...p, pace: STAT_MIN - 1 })) })).toBeNull();
    expect(sanitizeTeam({ ...good, name: '' })).toBeNull();
    expect(() => createMatch(makeConfig({ teams: [{ ...good, players: [] }, good] }))).toThrow(InvalidMatchConfigError);
  });
});

describe('Wertebänder', () => {
  it('der schnellste Spieler ist nur moderat schneller als der langsamste', () => {
    const slow = T.maxSpeed(makeSpec('langsam', STAT_MIN));
    const fast = T.maxSpeed(makeSpec('schnell', STAT_MAX));
    expect(fast).toBeGreaterThan(slow);
    expect(fast / slow).toBeLessThanOrEqual(MAX_SPEED_RATIO);
  });

  it('Schussstärke und Torwartreichweite bleiben in engen Bändern', () => {
    expect((T.SHOT_BASE + T.SHOT_SPAN) / T.SHOT_BASE).toBeLessThanOrEqual(MAX_SHOT_RATIO);
    expect(T.keeperReach(makeSpec('gut', STAT_MAX))).toBeGreaterThan(T.keeperReach(makeSpec('schwach', STAT_MIN)));
    expect(T.TACKLE_MIN).toBeGreaterThan(0);
    expect(T.TACKLE_MAX).toBeLessThan(1);
    expect(T.SAVE_MAX).toBeLessThan(1);
  });

  it('mit Ball ist ein Spieler langsamer als ohne', () => {
    const state = runUntil(createMatch(makeConfig()), (s) => s.phase === Phase.Play, TO_KICKOFF);
    const owner = state.ball.owner;
    expect(currentSpeed(state, owner)).toBeLessThan(T.maxSpeed(state.config.teams[0].players[1]) * T.AI_LEVELS[MEDIUM].speed);
  });
});

interface Watch {
  readonly state: MatchState;
  readonly finite: boolean;
  readonly inBounds: boolean;
  readonly still: number;
  readonly longestStill: number;
}

/** Spielt eine Partie KI gegen KI zu Ende und beobachtet dabei jeden Schritt. */
const watchMatch = (config: ReturnType<typeof makeConfig>): Watch =>
  Array.from({ length: MATCH_STEP_LIMIT }).reduce<Watch>((acc) => {
    if (acc.state.phase === Phase.Ended) return acc;
    const next = step(acc.state, [null, null]);
    const moved = next.ball.pos.x !== acc.state.ball.pos.x || next.ball.pos.y !== acc.state.ball.pos.y;
    const still = moved || next.phase !== Phase.Play ? 0 : acc.still + 1;
    const inBounds = next.players.every((p) => p.pos.x >= 0 && p.pos.x <= PITCH_W && p.pos.y >= 0 && p.pos.y <= PITCH_H);
    return {
      state: next,
      finite: acc.finite && allFinite(next),
      inBounds: acc.inBounds && inBounds,
      still,
      longestStill: Math.max(acc.longestStill, still),
    };
  }, { state: createMatch(config), finite: true, inBounds: true, still: 0, longestStill: 0 });

describe('KI gegen KI', () => {
  it('ein ganzes Spiel läuft ohne NaN und ohne Hänger durch und bringt Torchancen', () => {
    const watch = watchMatch(makeConfig({ durationSec: FULL_MATCH }));
    const { stats } = watch.state;
    expect(watch.state.phase).toBe(Phase.Ended);
    expect(watch.finite).toBe(true);
    expect(watch.inBounds).toBe(true);
    expect(watch.longestStill).toBeLessThan(STUCK_LIMIT);
    expect(stats.shots[0] + stats.shots[1]).toBeGreaterThanOrEqual(MIN_SHOTS);
    expect(stats.passes[0] + stats.passes[1]).toBeGreaterThanOrEqual(MIN_PASSES);
    expect(stats.possession[0]).toBeGreaterThan(0);
    expect(stats.possession[1]).toBeGreaterThan(0);
    expect(watch.state.goals).toHaveLength(watch.state.score[0] + watch.state.score[1]);
  });

  it('das höher bewertete Team gewinnt nicht automatisch', () => {
    const results = Array.from({ length: SERIES }, (_, i) => {
      const config = makeConfig({
        seed: SEED + i * SEED_STEP,
        durationSec: FULL_MATCH,
        teams: [makeTeam('Schwach', WEAKER, 'ai'), makeTeam('Stark', STRONGER, 'ai')],
      });
      return watchMatch(config).state.score;
    });
    const notLost = results.filter(([weak, strong]) => weak >= strong).length;
    const goals = results.reduce((sum, [weak, strong]) => sum + weak + strong, 0);
    expect(notLost).toBeGreaterThan(0);
    expect(goals).toBeGreaterThan(0);
  });
});
