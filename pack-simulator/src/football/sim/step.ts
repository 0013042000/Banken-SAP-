/** Der Simulationsschritt: aus Zustand + Eingaben wird der nächste Zustand. Rein und deterministisch. */
import { DT, HALF, KICKOFF_AFTER_GOAL, NONE } from './constants.ts';
import { applyAction, IDLE, resolveTackles } from './actions.ts';
import { stay, type Intent } from './ai.ts';
import { moveBall, settleInNet } from './ball.ts';
import { buttonsOf, computeIntents, pressedNow, updateControl, type Inputs } from './control.ts';
import { clampToPitch, kickoffState } from './formation.ts';
import {
  ALL_PLAYERS, attackSign, bumpPair, isKeeper, Phase, skill, specOf, TEAM_IDS, teamOf,
  type InputsByTeam, type MatchState, type Pair, type PlayerState, type SimEvent, type StepTools,
} from './model.ts';
import { createRng } from './rng.ts';
import * as T from './tuning.ts';
import { sanitizeInput } from './validate.ts';
import { add, dist, len, lerp, limit, scale, sub, unit, vec, ZERO, type Vec } from './vec.ts';

type PhaseStep = (state: MatchState, inputs: Inputs, tools: StepTools) => MatchState;

const RESTING: readonly Intent[] = Object.freeze(ALL_PLAYERS.map(() => stay(ZERO)));

const countDown = (value: number, dt: number): number => Math.max(0, value - dt);

const tickTimers = (state: MatchState, dt: number): MatchState => ({
  ...state,
  players: state.players.map((p) => ({
    ...p,
    stun: countDown(p.stun, dt),
    kickLock: countDown(p.kickLock, dt),
    cool: countDown(p.cool, dt),
    think: countDown(p.think, dt),
  })),
  ball: { ...state.ball, age: state.ball.age + dt, protect: countDown(state.ball.protect, dt) },
});

/** Lauftempo in diesem Moment: Grundtempo, KI-Stufe, Ballführung, Benommenheit. */
export const currentSpeed = (state: MatchState, player: number): number => {
  const spec = specOf(state, player);
  const setup = state.config.teams[teamOf(player)];
  const base = isKeeper(player) ? T.keeperSpeed(spec) : T.maxSpeed(spec);
  const level = setup.control === 'ai' ? T.AI_LEVELS[setup.difficulty].speed : 1;
  const carrying = state.ball.owner === player ? T.CARRY_FLOOR + T.CARRY_SPAN * skill(spec.dribble) : 1;
  const dazed = state.players[player].stun > 0 ? T.STUN_SPEED : 1;
  return base * level * carrying * dazed;
};

const facing = (p: PlayerState, move: Vec, vel: Vec, dt: number): Vec => {
  const moving = len(vel) > T.FACE_SPEED ? unit(vel, p.dir) : p.dir;
  const wanted = len(move) > T.FACE_DEAD ? unit(move, p.dir) : moving;
  return unit(lerp(p.dir, wanted, Math.min(1, T.TURN_RATE * dt)), wanted);
};

const movePlayer = (state: MatchState, player: number, intent: Intent, dt: number): PlayerState => {
  const p = state.players[player];
  const owns = state.ball.owner === player;
  const holding = owns && state.ball.held;
  const move = holding ? ZERO : limit(intent.move, 1);
  const vel = lerp(p.vel, scale(move, currentSpeed(state, player)), Math.min(1, T.ACCEL * dt));
  return {
    ...p,
    pos: clampToPitch(add(p.pos, scale(vel, dt))),
    vel,
    dir: holding ? vec(attackSign(teamOf(player)), 0) : facing(p, move, vel, dt),
    think: intent.think === NONE ? p.think : intent.think,
    hold: owns ? p.hold + dt : 0,
  };
};

/** Spieler schieben sich gegenseitig auseinander, statt ineinander zu stehen. */
const separate = (players: readonly PlayerState[]): readonly PlayerState[] =>
  players.map((p, i) => {
    const push = players.reduce((acc, q, j) => {
      const gap = dist(p.pos, q.pos);
      if (i === j || gap >= T.BODY_GAP) return acc;
      const away = unit(sub(p.pos, q.pos), vec(i < j ? -1 : 1, 0));
      return add(acc, scale(away, (T.BODY_GAP - gap) * HALF));
    }, ZERO);
    return push === ZERO ? p : { ...p, pos: clampToPitch(add(p.pos, push)) };
  });

/** Hält ein Torwart den Ball, werden Gegner aus seiner Nähe geschoben (kein Bedrängen des Torwarts). */
const clearKeeper = (state: MatchState, players: readonly PlayerState[], dt: number): readonly PlayerState[] => {
  const { owner, held } = state.ball;
  if (owner === NONE || !held) return players;
  const keeper = players[owner].pos;
  return players.map((p, i) => {
    const crowding = teamOf(i) !== teamOf(owner) && dist(p.pos, keeper) < T.KEEPER_SPACE;
    if (!crowding) return p;
    const away = unit(sub(p.pos, keeper), vec(-attackSign(teamOf(i)), 0));
    return { ...p, pos: clampToPitch(add(p.pos, scale(away, T.KEEPER_SHOVE * dt))) };
  });
};

const movePlayers = (state: MatchState, intents: readonly Intent[], dt: number): MatchState => {
  const moved = state.players.map((_, i) => movePlayer(state, i, intents[i], dt));
  return { ...state, players: separate(clearKeeper(state, moved, dt)) };
};

const countPossession = (state: MatchState): MatchState => {
  const { owner } = state.ball;
  if (owner === NONE || state.phase !== Phase.Play) return state;
  return { ...state, stats: { ...state.stats, possession: bumpPair(state.stats.possession, teamOf(owner)) } };
};

/** Die Uhr läuft nur, während gespielt wird; bei 0:00 ist sofort Schluss. */
const tickClock = (state: MatchState, tools: StepTools): MatchState => {
  if (state.phase !== Phase.Play) return state;
  const timeLeft = state.timeLeft - tools.dt;
  if (timeLeft > 0) return { ...state, timeLeft };
  tools.emit({ type: 'end' });
  return { ...state, timeLeft: 0, phase: Phase.Ended, phaseTime: 0 };
};

const playStep: PhaseStep = (state, inputs, tools) => {
  const pressed: Pair = [pressedNow(inputs[0], state.prevButtons[0]), pressedNow(inputs[1], state.prevButtons[1])];
  const timed = tickTimers(state, tools.dt);
  const controlled = TEAM_IDS.reduce((acc, team) => updateControl(acc, team, pressed[team], tools), timed);
  const intents = computeIntents(controlled, inputs, pressed, tools);
  const owner = controlled.ball.owner;
  const acted = applyAction(controlled, owner === NONE ? IDLE : intents[owner].act, tools);
  const moved = movePlayers(acted, intents, tools.dt);
  const fought = resolveTackles(moved, tools);
  return tickClock(countPossession(moveBall(fought, tools)), tools);
};

/** Anstoß- und Neustartpause: alle stehen, danach gibt der Pfiff das Spiel frei. */
const waitStep: PhaseStep = (state, _inputs, tools) => {
  const phaseTime = state.phaseTime - tools.dt;
  if (phaseTime > 0) return { ...state, phaseTime };
  tools.emit({ type: 'whistle' });
  return { ...state, phase: Phase.Play, phaseTime: 0 };
};

/** Jubelpause: Spieler laufen aus, der Ball liegt im Netz, dann Anstoß für die andere Mannschaft. */
const goalStep: PhaseStep = (state, _inputs, tools) => {
  const phaseTime = state.phaseTime - tools.dt;
  if (phaseTime <= 0) return kickoffState(state, state.restart.team, KICKOFF_AFTER_GOAL);
  const coasting = movePlayers(state, RESTING, tools.dt);
  return { ...coasting, phaseTime, ball: settleInNet(state.ball, tools.dt) };
};

const PHASE_STEPS: Readonly<Record<Phase, PhaseStep>> = {
  kickoff: waitStep,
  restart: waitStep,
  goal: goalStep,
  play: playStep,
  ended: (state) => state,
};

/**
 * Rechnet einen festen Zeitschritt weiter. Gleicher Zustand + gleiche Eingaben ergeben
 * immer denselben Folgezustand; der Zufall kommt nur aus dem im Zustand geführten Startwert.
 * Für menschlich gesteuerte Mannschaften gilt die Eingabe, alle anderen Spieler steuert die KI.
 */
export const step = (state: MatchState, inputs: InputsByTeam, dt: number = DT): MatchState => {
  if (state.phase === Phase.Ended) return state.events.length ? { ...state, events: [] } : state;
  const clean: Inputs = [sanitizeInput(inputs[0]), sanitizeInput(inputs[1])];
  const rng = createRng(state.rng);
  const events: SimEvent[] = [];
  const tools: StepTools = { rng, emit: (event) => { events.push(event); }, dt };
  const next = PHASE_STEPS[state.phase](state, clean, tools);
  return {
    ...next,
    tick: state.tick + 1,
    rng: rng.state(),
    events,
    prevButtons: [buttonsOf(clean[0]), buttonsOf(clean[1])],
  };
};
