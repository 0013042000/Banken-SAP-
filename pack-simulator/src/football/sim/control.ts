/** Menschliche Steuerung: Tasten, aktiver Spieler, Passziel. */
import { NONE } from './constants.ts';
import { IDLE, lunge, type Action } from './actions.ts';
import { aiIntent, interceptPoint, laneOpen, moveTo, teamViews, type Intent } from './ai.ts';
import {
  ALL_PLAYERS, isKeeper, nearestFieldPlayer, setPair, teamOf, withBall,
  type MatchState, type Pair, type StepTools, type TeamId, type TeamInput,
} from './model.ts';
import * as T from './tuning.ts';
import { dist, dot, len, sub, unit, vec, type Vec } from './vec.ts';

const PASS_BIT = 1;
const SHOOT_BIT = 2;
const SWITCH_BIT = 4;

export type Inputs = readonly [TeamInput, TeamInput];

export const buttonsOf = (input: TeamInput): number =>
  (input.pass ? PASS_BIT : 0) | (input.shoot ? SHOOT_BIT : 0) | (input.switchOrTackle ? SWITCH_BIT : 0);

/** Tasten, die in diesem Schritt neu gedrückt wurden (steigende Flanke). */
export const pressedNow = (input: TeamInput, previous: number): number => buttonsOf(input) & ~previous;

/** Sagt der Oberfläche, ob die dritte Taste gerade „Ball holen“ oder „Wechsel“ bedeutet. */
export const isNearestToBall = (positions: readonly Vec[], team: TeamId, ball: Vec, controlled: number): boolean =>
  nearestFieldPlayer(positions, team, ball) === controlled;

/**
 * Aktiver Spieler: bei Ballbesitz der Ballführende, bei einem Pass der Angespielte.
 * Die Wechseltaste holt beim Verteidigen den ballnächsten Spieler; ist der schon aktiv,
 * geht er mit einem Antritt auf den Ball.
 */
export const updateControl = (state: MatchState, team: TeamId, pressed: number, tools: StepTools): MatchState => {
  if (state.config.teams[team].control !== 'human') return state;
  const { ball } = state;
  const positions = state.players.map((p) => p.pos);
  const weOwn = ball.owner !== NONE && teamOf(ball.owner) === team;
  const wantsSwitch = Boolean(pressed & SWITCH_BIT) && !weOwn;
  const called = ball.passTo !== NONE && teamOf(ball.passTo) === team && !isKeeper(ball.passTo) && !wantsSwitch;
  const nearest = nearestFieldPlayer(positions, team, ball.pos);
  const previous = state.controlled[team];
  const valid = previous !== NONE && teamOf(previous) === team && !isKeeper(previous);
  const kept = valid ? previous : nearest;
  const byPass = called ? ball.passTo : kept;
  const automatic = weOwn && !isKeeper(ball.owner) ? ball.owner : byPass;
  if (!wantsSwitch) return { ...state, controlled: setPair(state.controlled, team, automatic) };
  const switched = { ...state, controlled: setPair(state.controlled, team, nearest) };
  const passWasOurs = ball.passTo !== NONE && teamOf(ball.passTo) === team;
  const released = passWasOurs ? withBall(switched, { passTo: NONE }) : switched;
  return nearest === automatic ? lunge(released, nearest, tools) : released;
};

/** Mitspieler in Blickrichtung; ohne passenden Mitspieler geht der Ball in den freien Raum. */
const choosePass = (state: MatchState, player: number, aim: Vec, stickActive: boolean): Action => {
  const team = teamOf(player);
  const from = state.players[player].pos;
  const rated = ALL_PLAYERS.filter((i) => teamOf(i) === team && i !== player).map((mate) => {
    const to = state.players[mate].pos;
    const facing = dot(unit(sub(to, from), aim), aim);
    const blocked = laneOpen(state, from, to, team, T.LANE_WIDTH) ? 0 : T.BLOCK_PENALTY;
    const keeper = isKeeper(mate) ? T.KEEPER_PENALTY : 0;
    return { mate, facing, score: facing * T.AIM_WEIGHT - Math.abs(dist(from, to) - T.PASS_IDEAL) * T.DIST_WEIGHT - blocked - keeper };
  });
  const inView = rated.filter((r) => r.facing > T.AIM_MIN_COS);
  const pool = inView.length || stickActive ? inView : rated;
  if (!pool.length) return { kind: 'kick', dir: aim };
  const best = pool.reduce((a, b) => (b.score > a.score ? b : a), pool[0]);
  return { kind: 'pass', target: best.mate, lob: false };
};

const humanAction = (state: MatchState, player: number, aim: Vec, stickActive: boolean, pressed: number): Action => {
  if (pressed & SHOOT_BIT) return { kind: 'shoot', aim, errorScale: 1 };
  return pressed & PASS_BIT ? choosePass(state, player, aim, stickActive) : IDLE;
};

/** Wunsch des menschlich gesteuerten Spielers; ein angespielter Spieler läuft dem Ball von selbst entgegen. */
const humanIntent = (state: MatchState, player: number, input: TeamInput, pressed: number): Intent => {
  const p = state.players[player];
  const stick = vec(input.moveX, input.moveY);
  const stickActive = len(stick) > T.STICK_DEAD;
  const aim = stickActive ? unit(stick, p.dir) : p.dir;
  const owns = state.ball.owner === player;
  const receiving = !stickActive && state.ball.owner === NONE && state.ball.passTo === player;
  return {
    move: receiving ? moveTo(p.pos, interceptPoint(state, player).point) : stick,
    act: owns ? humanAction(state, player, aim, stickActive, pressed) : IDLE,
    think: NONE,
  };
};

/** Wünsche aller zehn Spieler: Menschen über ihre Eingabe, alle anderen über die KI. */
export const computeIntents = (state: MatchState, inputs: Inputs, pressed: Pair, tools: StepTools): readonly Intent[] => {
  const views = teamViews(state);
  return ALL_PLAYERS.map((i) => {
    const team = teamOf(i);
    return i === views[team].human
      ? humanIntent(state, i, inputs[team], pressed[team])
      : aiIntent(state, i, views[team], tools);
  });
};
