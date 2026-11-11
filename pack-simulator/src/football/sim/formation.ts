/** Grundordnung, Anstoß und Neustarts: Wer steht wo, wenn der Ball ruht? */
import {
  BOX_DEPTH, CENTER, CENTER_R, KICKOFF_COUNTDOWN, NONE, PITCH_H, PITCH_W, RESTART_PAUSE, TEAM_SIZE,
} from './constants.ts';
import {
  ALL_PLAYERS, attackSign, fieldPlayers, freshPlayer, isKeeper, keeperOf, looseBall, Phase, playerIndex,
  RestartKind, setPair, slotOf, teamOf, toWorld,
  type MatchConfig, type MatchState, type PlayerState, type TeamId,
} from './model.ts';
import * as T from './tuning.ts';
import { sanitizeConfig } from './validate.ts';
import { add, clamp, dist, scale, sub, unit, vec, type Vec } from './vec.ts';

const FRONT_SLOT = TEAM_SIZE - 1;

/** Grundpositionen in mannschaftseigenen Koordinaten (eigenes Tor bei x = 0). */
const SLOT_SPOTS: readonly Vec[] = [
  vec(T.KEEPER_X, CENTER.y),
  vec(T.BACK_X, CENTER.y),
  vec(T.MID_X, CENTER.y - T.WING_OFFSET),
  vec(T.MID_X, CENTER.y + T.WING_OFFSET),
  vec(T.FRONT_X, CENTER.y),
];

const KICKOFF_SPOTS: readonly Vec[] = [
  vec(T.KEEPER_X, CENTER.y),
  vec(T.KICKOFF_BACK_X, CENTER.y),
  vec(T.KICKOFF_MID_X, CENTER.y - T.KICKOFF_WING),
  vec(T.KICKOFF_MID_X, CENTER.y + T.KICKOFF_WING),
  vec(CENTER.x - CENTER_R - T.KICKOFF_GAP, CENTER.y),
];
const TAKER_SPOT = vec(CENTER.x - T.CARRY_DIST, CENTER.y);
const GOAL_KICK_SPOT = vec(T.GOAL_KICK_X, CENTER.y);

export const clampToPitch = (pos: Vec): Vec => vec(
  clamp(pos.x, T.PLAYER_MARGIN, PITCH_W - T.PLAYER_MARGIN),
  clamp(pos.y, T.PLAYER_MARGIN, PITCH_H - T.PLAYER_MARGIN),
);

/** Heimatposition in mannschaftseigenen Koordinaten; verschiebt sich mit dem Ball. */
export const homeLocal = (team: TeamId, slot: number, ball: Vec, lean: number): Vec => {
  const localBall = toWorld(team, ball);
  const base = SLOT_SPOTS[slot];
  if (!slot) return base;
  return vec(
    clamp(base.x + (localBall.x - CENTER.x) * T.FOLLOW_X + lean, T.HOME_MIN_X, T.HOME_MAX_X),
    clamp(base.y + (localBall.y - CENTER.y) * T.FOLLOW_Y, T.HOME_MARGIN, PITCH_H - T.HOME_MARGIN),
  );
};

export const homeSpot = (team: TeamId, slot: number, ball: Vec, lean: number): Vec =>
  toWorld(team, homeLocal(team, slot, ball, lean));

const facingGoal = (team: TeamId): Vec => vec(attackSign(team), 0);

/** Alle zurück in die eigene Hälfte; die anstoßende Mannschaft hat den Ball am Mittelpunkt. */
export const kickoffState = (state: MatchState, kickTeam: TeamId, countdown: number): MatchState => {
  const taker = playerIndex(kickTeam, FRONT_SLOT);
  const players = ALL_PLAYERS.map((i) => {
    const team = teamOf(i);
    const spot = i === taker ? TAKER_SPOT : KICKOFF_SPOTS[slotOf(i)];
    return freshPlayer(toWorld(team, spot), facingGoal(team));
  });
  return {
    ...state,
    phase: Phase.Kickoff,
    phaseTime: countdown,
    players,
    ball: { ...looseBall(CENTER), owner: taker, lastTeam: kickTeam, lastPlayer: taker, protect: T.RESTART_PROTECT },
    controlled: [playerIndex(0, FRONT_SLOT), playerIndex(1, FRONT_SLOT)],
    restart: { kind: RestartKind.Kickoff, team: kickTeam },
  };
};

/** Gegner halten Abstand zum ruhenden Ball; beim Abstoß verlassen sie zusätzlich den Strafraum. */
const keepAway = (home: Vec, ballSpot: Vec, team: TeamId, isGoalKick: boolean): Vec => {
  const away = unit(sub(home, ballSpot), facingGoal(team));
  const spaced = dist(home, ballSpot) < T.RESTART_DISTANCE ? add(ballSpot, scale(away, T.RESTART_DISTANCE)) : home;
  if (!isGoalKick) return spaced;
  const local = toWorld(team, spaced);
  return toWorld(team, vec(Math.max(local.x, BOX_DEPTH + T.BOX_CLEARANCE), local.y));
};

const nearestTo = (candidates: readonly number[], spots: readonly Vec[], target: Vec): number =>
  candidates.reduce((best, i) => (dist(spots[i], target) < dist(spots[best], target) ? i : best), candidates[0]);

/**
 * Neustart nach Ball im Aus: alle Spieler zurück in die Grundordnung (am Ball ausgerichtet),
 * der Ausführende steht mit Ball bereit, Gegner halten Abstand.
 */
export const restartState = (state: MatchState, kind: RestartKind, team: TeamId, spot: Vec): MatchState => {
  const isGoalKick = kind === RestartKind.GoalKick;
  const ballSpot = isGoalKick ? toWorld(team, GOAL_KICK_SPOT) : spot;
  const inward = unit(sub(CENTER, ballSpot), facingGoal(team));
  const homes = ALL_PLAYERS.map((i) =>
    homeSpot(teamOf(i), slotOf(i), ballSpot, teamOf(i) === team ? T.LEAN_ATTACK : T.LEAN_DEFEND));
  const taker = isGoalKick ? keeperOf(team) : nearestTo(fieldPlayers(team), homes, ballSpot);
  const takerPos = isGoalKick ? ballSpot : clampToPitch(sub(ballSpot, scale(inward, T.CARRY_DIST)));
  const players = ALL_PLAYERS.map((i): PlayerState => {
    if (i === taker) return freshPlayer(takerPos, inward);
    const spotFor = teamOf(i) === team || isKeeper(i) ? homes[i] : keepAway(homes[i], ballSpot, team, isGoalKick);
    const pos = clampToPitch(spotFor);
    return freshPlayer(pos, unit(sub(ballSpot, pos), facingGoal(teamOf(i))));
  });
  const ballPos = isGoalKick ? takerPos : add(takerPos, scale(inward, T.CARRY_DIST));
  return {
    ...state,
    phase: Phase.Restart,
    phaseTime: RESTART_PAUSE,
    players,
    ball: {
      ...looseBall(ballPos), owner: taker, held: isGoalKick, z: isGoalKick ? T.HAND_Z : 0,
      lastTeam: team, lastPlayer: taker, protect: T.RESTART_PROTECT,
    },
    controlled: isGoalKick ? state.controlled : setPair(state.controlled, team, taker),
    restart: { kind, team },
  };
};

/** Erzeugt den Anfangszustand: Anstoß für Mannschaft 1, Countdown läuft. */
export const createMatch = (config: MatchConfig): MatchState => {
  const clean = sanitizeConfig(config);
  const blank: MatchState = {
    config: clean,
    tick: 0,
    rng: clean.seed,
    phase: Phase.Kickoff,
    phaseTime: KICKOFF_COUNTDOWN,
    timeLeft: clean.durationSec,
    score: [0, 0],
    players: [],
    ball: looseBall(CENTER),
    controlled: [NONE, NONE],
    prevButtons: [0, 0],
    restart: { kind: RestartKind.Kickoff, team: 0 },
    goals: [],
    stats: { shots: [0, 0], saves: [0, 0], passes: [0, 0], possession: [0, 0] },
    events: [],
  };
  return kickoffState(blank, 0, KICKOFF_COUNTDOWN);
};
