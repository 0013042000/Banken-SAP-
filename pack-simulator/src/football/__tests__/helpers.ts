/** Gemeinsame Bausteine für die Simulationstests. */
import { TEAM_SIZE, TICKS_PER_SECOND } from '../sim/constants.ts';
import { createMatch } from '../sim/formation.ts';
import {
  looseBall, Phase,
  type Control, type Difficulty, type InputsByTeam, type MatchConfig, type MatchState, type PlayerSpec, type SimEvent,
  type TeamSetup,
} from '../sim/model.ts';
import { step } from '../sim/step.ts';
import { vec, type Vec } from '../sim/vec.ts';

export const SEED = 4711;
export const AVERAGE = 85;
export const MEDIUM: Difficulty = 1;
export const NO_INPUT: InputsByTeam = [null, null];
const SLOTS = Array.from({ length: TEAM_SIZE }, (_, slot) => slot);
/** Lange Benommenheit: Spieler greifen in Regeltests nicht ins Geschehen ein. */
const FROZEN = 999;
const PARK_X = 50;
const PARK_Y = 3;
const PARK_STEP = 2;

export const seconds = (value: number): number => Math.round(value * TICKS_PER_SECOND);

export const makeSpec = (id: string, value: number, keeping: number = value): PlayerSpec => ({
  id, name: id, pace: value, shot: value, pass: value, dribble: value, defense: value, physical: value, keeping,
});

export const makeTeam = (name: string, value: number, control: Control, difficulty: Difficulty = MEDIUM): TeamSetup => ({
  name,
  players: SLOTS.map((slot) => makeSpec(`${name}-${slot}`, value)),
  control,
  difficulty,
});

export const makeConfig = (overrides: Partial<MatchConfig> = {}): MatchConfig => ({
  seed: SEED,
  durationSec: TICKS_PER_SECOND,
  teams: [makeTeam('A', AVERAGE, 'ai'), makeTeam('B', AVERAGE, 'ai')],
  ...overrides,
});

/** Rechnet `count` Schritte und sammelt alle Ereignisse. */
export const run = (
  state: MatchState, count: number, inputs: InputsByTeam = NO_INPUT,
): { readonly state: MatchState; readonly events: readonly SimEvent[] } =>
  Array.from({ length: count }).reduce<{ state: MatchState; events: SimEvent[] }>((acc) => {
    const next = step(acc.state, inputs);
    return { state: next, events: [...acc.events, ...next.events] };
  }, { state, events: [] });

/** Rechnet, bis die Bedingung erfüllt ist (höchstens `limit` Schritte). */
export const runUntil = (
  state: MatchState, done: (state: MatchState) => boolean, limit: number, inputs: InputsByTeam = NO_INPUT,
): MatchState => Array.from({ length: limit }).reduce<MatchState>((acc) => (done(acc) ? acc : step(acc, inputs)), state);

/**
 * Laufendes Spiel mit freiem Ball und ohne eingreifende Spieler:
 * alle stehen benommen an der Seitenlinie. So lassen sich Regeln isoliert prüfen.
 */
export const openPlay = (ballPos: Vec, ballVel: Vec, lastTeam: number, config: MatchConfig = makeConfig()): MatchState => {
  const base = createMatch(config);
  return {
    ...base,
    phase: Phase.Play,
    phaseTime: 0,
    players: base.players.map((p, i) => ({ ...p, pos: vec(PARK_X + (i - TEAM_SIZE) * PARK_STEP, PARK_Y), stun: FROZEN })),
    ball: { ...looseBall(ballPos), vel: ballVel, lastTeam, lastPlayer: lastTeam * TEAM_SIZE + 1 },
  };
};

export const allFinite = (state: MatchState): boolean =>
  [state.ball.pos, state.ball.vel, ...state.players.flatMap((p) => [p.pos, p.vel, p.dir])]
    .every((v) => Number.isFinite(v.x) && Number.isFinite(v.y))
  && Number.isFinite(state.ball.z) && Number.isFinite(state.timeLeft);
