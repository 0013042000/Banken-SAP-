/**
 * KI für alle nicht von Menschen gesteuerten Spieler: Torwart, Ballführender,
 * freilaufende Mitspieler und verteidigende Spieler.
 */
import { CENTER, GOAL_HALF, GOAL_Y0, GOAL_Y1, NONE, PITCH_H, PITCH_W, TEAM_SIZE } from './constants.ts';
import { IDLE, type Action } from './actions.ts';
import { clampToPitch, homeLocal, homeSpot } from './formation.ts';
import {
  attackSign, fieldPlayers, inOwnBox, isKeeper, keeperOf, oppGoal, otherTeam, ownGoal, skill, slotOf, specOf, teamOf, toWorld,
  type BallState, type MatchState, type StepTools, type TeamId,
} from './model.ts';
import * as T from './tuning.ts';
import {
  add, clamp, cross, dist, distToSegment, dot, len, lerp, perp, scale, sub, unit, vec, ZERO, type Vec,
} from './vec.ts';

/** Bewegungswunsch und Aktion eines Spielers für einen Schritt. */
export interface Intent {
  /** Richtung mal Krafteinsatz (Länge höchstens 1). */
  readonly move: Vec;
  readonly act: Action;
  /** Neuer Wert für die Entscheidungspause oder NONE. */
  readonly think: number;
}

const Possession = { Own: 'own', Opp: 'opp', Loose: 'loose' } as const;
type Possession = (typeof Possession)[keyof typeof Possession];

/** Rollenverteilung einer Mannschaft in diesem Schritt. */
export interface TeamView {
  readonly team: TeamId;
  readonly tuning: T.AiTuning;
  /** Vom Menschen gesteuerter Spieler oder NONE. */
  readonly human: number;
  readonly possession: Possession;
  /** Geht zum Ball (freier Ball) bzw. läuft den Ballführenden an. */
  readonly chaser: number;
  /** Sichert zwischen Ball und eigenem Tor ab. */
  readonly cover: number;
  /** Je Aufstellungsplatz: zu deckender Gegner oder NONE. */
  readonly marks: readonly number[];
}

const NO_MARKS: readonly number[] = Object.freeze(Array.from({ length: TEAM_SIZE }, () => NONE));
const INTERCEPT_TIMES: readonly number[] = Object.freeze(
  Array.from({ length: T.INTERCEPT_SAMPLES }, (_, k) => (k + 1) * T.INTERCEPT_STEP),
);
const LAST_INTERCEPT_TIME = T.INTERCEPT_SAMPLES * T.INTERCEPT_STEP;

export const stay = (move: Vec): Intent => ({ move, act: IDLE, think: NONE });

/** Laufrichtung zum Ziel; kurz vor dem Ziel wird abgebremst. */
export const moveTo = (from: Vec, target: Vec): Vec => {
  const delta = sub(target, from);
  const distance = len(delta);
  return distance < T.ARRIVE_STOP ? ZERO : scale(delta, Math.min(1, distance / T.ARRIVE_RADIUS) / distance);
};

/** Mit vollem Tempo auf das Ziel zu, ohne vorher abzubremsen (Anlaufen des Ballführenden). */
const charge = (from: Vec, target: Vec): Vec => unit(sub(target, from));

/** Ballposition nach t Sekunden freiem Rollen. */
export const ballAfter = (ball: BallState, t: number): Vec =>
  add(ball.pos, scale(ball.vel, (1 - Math.exp(-T.DRAG * t)) / T.DRAG));

/** Frühester Punkt, an dem der Spieler den rollenden Ball erreichen kann. */
export const interceptPoint = (state: MatchState, player: number): { readonly point: Vec; readonly eta: number } => {
  const p = state.players[player];
  const speed = T.maxSpeed(specOf(state, player));
  const hit = INTERCEPT_TIMES.find((t) => dist(p.pos, ballAfter(state.ball, t)) - T.PICKUP_DIST <= speed * t);
  const point = ballAfter(state.ball, hit ?? LAST_INTERCEPT_TIME);
  return { point, eta: hit ?? LAST_INTERCEPT_TIME + dist(p.pos, point) / speed };
};

/** Abstand zum nächsten gegnerischen Feldspieler (gedeckelt). */
const openness = (state: MatchState, at: Vec, team: TeamId): number =>
  fieldPlayers(otherTeam(team)).reduce((best, o) => Math.min(best, dist(state.players[o].pos, at)), T.OPEN_CAP);

export const laneOpen = (state: MatchState, from: Vec, to: Vec, team: TeamId, width: number): boolean =>
  fieldPlayers(otherTeam(team)).every((o) => distToSegment(state.players[o].pos, from, to) > width);

const possessionOf = (owner: number, team: TeamId): Possession => {
  if (owner === NONE) return Possession.Loose;
  return teamOf(owner) === team ? Possession.Own : Possession.Opp;
};

const reachTime = (state: MatchState, player: number): number =>
  (state.ball.owner === NONE
    ? interceptPoint(state, player).eta
    : dist(state.players[player].pos, state.ball.pos) / T.maxSpeed(specOf(state, player)));

interface Roles {
  readonly chaser: number;
  readonly cover: number;
}

interface RoleInput {
  readonly state: MatchState;
  readonly team: TeamId;
  readonly human: number;
  readonly tuning: T.AiTuning;
  /** Feldspieler, nach Zeit zum Ball sortiert. */
  readonly ranked: readonly number[];
}

/**
 * Wer läuft den Ballführenden an? Bei KI-Mannschaften der Nächste. Neben einem Menschen sichert
 * der nächste Mitspieler nur ab – außer es wird gefährlich (Ball nah am eigenen Tor oder der
 * Mensch ist weit weg), dann greift er selbst an.
 */
const pressRoles = ({ state, team, human, tuning, ranked }: RoleInput): Roles => {
  const [first, second] = ranked;
  if (human === NONE) return { chaser: first, cover: tuning.doublePress ? second : NONE };
  const helper = human === first ? second : first;
  const danger = toWorld(team, state.ball.pos).x < T.DANGER_ZONE;
  const humanFar = dist(state.players[human].pos, state.ball.pos) > T.HUMAN_FAR;
  return danger || humanFar ? { chaser: helper, cover: NONE } : { chaser: NONE, cover: helper };
};

const looseRoles = ({ state, team, ranked }: RoleInput): Roles => {
  const target = state.ball.passTo;
  const called = target !== NONE && teamOf(target) === team && !isKeeper(target);
  return { chaser: called ? target : ranked[0], cover: NONE };
};

const NO_ROLES: Roles = Object.freeze({ chaser: NONE, cover: NONE });

const ROLE_PICKERS: Readonly<Record<Possession, (input: RoleInput) => Roles>> = {
  own: () => NO_ROLES,
  opp: pressRoles,
  loose: looseRoles,
};

/** Grobe Manndeckung: Jeder freie Verteidiger nimmt den Gegner, der seiner Heimatposition am nächsten ist. */
const assignMarks = (state: MatchState, team: TeamId, busy: readonly number[]): readonly number[] => {
  const markers = fieldPlayers(team).filter((i) => !busy.includes(i));
  const threats = fieldPlayers(otherTeam(team)).filter((o) => o !== state.ball.owner);
  const start: { readonly marks: readonly number[]; readonly free: readonly number[] } = { marks: NO_MARKS, free: threats };
  return markers.reduce((acc, marker) => {
    if (!acc.free.length) return acc;
    const home = homeSpot(team, slotOf(marker), state.ball.pos, T.LEAN_DEFEND);
    const gap = (o: number): number => dist(state.players[o].pos, home);
    const pick = acc.free.reduce((best, o) => (gap(o) < gap(best) ? o : best), acc.free[0]);
    return {
      marks: acc.marks.map((value, slot) => (slot === slotOf(marker) ? pick : value)),
      free: acc.free.filter((o) => o !== pick),
    };
  }, start).marks;
};

const viewFor = (state: MatchState, team: TeamId): TeamView => {
  const setup = state.config.teams[team];
  const isHuman = setup.control === 'human';
  const human = isHuman ? state.controlled[team] : NONE;
  const tuning = isHuman ? T.MATE_TUNING : T.AI_LEVELS[setup.difficulty];
  const possession = possessionOf(state.ball.owner, team);
  const ranked = fieldPlayers(team)
    .map((i) => ({ i, eta: reachTime(state, i) }))
    .sort((a, b) => a.eta - b.eta)
    .map((entry) => entry.i);
  // Hält der gegnerische Torwart den Ball, läuft ihn niemand an – alle ordnen sich.
  const settled = possession === Possession.Opp && state.ball.held;
  const roles = settled ? NO_ROLES : ROLE_PICKERS[possession]({ state, team, human, tuning, ranked });
  const marks = possession === Possession.Own ? NO_MARKS : assignMarks(state, team, [roles.chaser, roles.cover, human]);
  return { team, tuning, human, possession, ...roles, marks };
};

// ---- Torwart ----

/** Punkt auf der Linie, an dem ein heranfliegender Ball den Torwart passiert – oder null. */
const shotIntercept = (state: MatchState, keeper: number, team: TeamId): Vec | null => {
  const { ball } = state;
  const reaction = T.KEEPER_REACT_MAX - T.KEEPER_REACT_SPAN * skill(specOf(state, keeper).keeping);
  if (ball.owner !== NONE || ball.age < reaction) return null;
  const me = toWorld(team, state.players[keeper].pos);
  const at = toWorld(team, ball.pos);
  const vel = scale(ball.vel, attackSign(team));
  if (vel.x > -T.KEEPER_ALERT_SPEED) return null;
  const time = (me.x - at.x) / vel.x;
  const y = at.y + vel.y * time;
  const relevant = time >= 0 && time <= T.KEEPER_LOOKAHEAD && Math.abs(y - CENTER.y) <= GOAL_HALF + T.KEEPER_Y_MARGIN;
  return relevant ? toWorld(team, vec(me.x, y)) : null;
};

/** Langsamer, freier Ball im eigenen Strafraum, an den der Torwart als Erster kommt. */
const canClaim = (state: MatchState, keeper: number, team: TeamId): boolean => {
  const { ball, players } = state;
  if (ball.owner !== NONE || !inOwnBox(team, ball.pos) || len(ball.vel) > T.KEEPER_CLAIM_SPEED) return false;
  const mine = dist(players[keeper].pos, ball.pos);
  return fieldPlayers(otherTeam(team)).every((o) => dist(players[o].pos, ball.pos) > mine + T.KEEPER_CLAIM_MARGIN);
};

/** Eins gegen eins: Dringt ein Gegner mit Ball in den Strafraum ein, stürzt der Torwart heraus. */
const shouldRush = (state: MatchState, keeper: number, team: TeamId): boolean => {
  const { ball, players } = state;
  const hostile = ball.owner !== NONE && teamOf(ball.owner) !== team;
  return hostile && inOwnBox(team, ball.pos) && dist(players[keeper].pos, ball.pos) < T.KEEPER_RUSH_RANGE;
};

/** Stellt sich auf die Linie zwischen Ball und Tormitte, knapp vor dem Tor. */
const guardSpot = (team: TeamId, ballPos: Vec): Vec => {
  const goal = ownGoal(team);
  const closeness = clamp((T.KEEPER_FAR_RANGE - dist(ballPos, goal)) / (T.KEEPER_FAR_RANGE - T.KEEPER_NEAR_RANGE), 0, 1);
  const depth = T.KEEPER_OUT + (T.KEEPER_OUT_NEAR - T.KEEPER_OUT) * closeness;
  const out = add(goal, scale(unit(sub(ballPos, goal), vec(attackSign(team), 0)), depth));
  const local = toWorld(team, out);
  return toWorld(team, vec(
    clamp(local.x, T.KEEPER_MIN_X, T.KEEPER_MAX_X),
    clamp(local.y, GOAL_Y0 + T.KEEPER_POST_GAP, GOAL_Y1 - T.KEEPER_POST_GAP),
  ));
};

/** Abwurfziel: frei stehender Mitspieler in angenehmer Entfernung. */
const throwTarget = (state: MatchState, keeper: number, team: TeamId): number => {
  const from = state.players[keeper].pos;
  const value = (mate: number): number => {
    const at = state.players[mate].pos;
    return openness(state, at, team) * T.KEEPER_THROW_OPEN - Math.abs(dist(from, at) - T.KEEPER_THROW_IDEAL) * T.KEEPER_THROW_DIST;
  };
  return fieldPlayers(team).reduce((best, mate) => (value(mate) > value(best) ? mate : best), fieldPlayers(team)[0]);
};

const keeperIntent = (state: MatchState, keeper: number, view: TeamView): Intent => {
  const p = state.players[keeper];
  const { team } = view;
  if (state.ball.owner === keeper) {
    const ready = p.hold >= T.KEEPER_HOLD;
    const act: Action = ready ? { kind: 'pass', target: throwTarget(state, keeper, team), lob: state.ball.held } : IDLE;
    return { move: ZERO, act, think: NONE };
  }
  const incoming = shotIntercept(state, keeper, team);
  if (incoming) return stay(moveTo(p.pos, incoming));
  if (shouldRush(state, keeper, team)) return stay(charge(p.pos, state.ball.pos));
  const target = canClaim(state, keeper, team) ? state.ball.pos : guardSpot(team, state.ball.pos);
  return stay(moveTo(p.pos, target));
};

// ---- Ballführender ----

interface PassOption {
  readonly target: number;
  readonly score: number;
  readonly progress: number;
}

const passOption = (state: MatchState, player: number, mate: number, team: TeamId): PassOption => {
  const from = state.players[player].pos;
  const to = state.players[mate].pos;
  const progress = toWorld(team, to).x - toWorld(team, from).x;
  const distance = dist(from, to);
  const lane = laneOpen(state, from, to, team, T.LANE_WIDTH) ? T.W_LANE : -T.W_BLOCKED;
  const far = distance > T.PASS_FAR ? T.W_FAR : 0;
  const near = distance < T.PASS_NEAR ? T.W_NEAR : 0;
  return { target: mate, progress, score: progress * T.W_PROGRESS + openness(state, to, team) * T.W_OPEN + lane - far - near };
};

const passChoice = (state: MatchState, player: number, view: TeamView, tools: StepTools): Action | null => {
  const p = state.players[player];
  const { team, tuning } = view;
  const options = fieldPlayers(team).filter((mate) => mate !== player).map((mate) => passOption(state, player, mate, team));
  const best = options.reduce((a, b) => (b.score > a.score ? b : a), options[0]);
  const urgent = openness(state, p.pos, team) < T.PRESSURE_DIST || p.hold > T.HOLD_LIMIT || state.ball.protect > T.PROTECT_PASS;
  const tempting = best.progress > T.PASS_PROGRESS && best.score > T.PASS_GOOD && tools.rng.next() < tuning.passEager;
  const wants = urgent ? best.score > T.PASS_OK : tempting;
  return wants ? { kind: 'pass', target: best.target, lob: false } : null;
};

const shotChoice = (state: MatchState, player: number, view: TeamView, tools: StepTools): Action | null => {
  const p = state.players[player];
  const { team, tuning } = view;
  const goal = oppGoal(team);
  const range = dist(p.pos, goal);
  const local = toWorld(team, p.pos);
  const tooAcute = local.x > PITCH_W - T.SHOT_MIN_DEPTH && Math.abs(local.y - CENTER.y) > GOAL_HALF;
  if (range > tuning.shootRange || tooAcute) return null;
  const keeperY = state.players[keeperOf(otherTeam(team))].pos.y;
  const corner = vec(goal.x, keeperY > CENTER.y ? GOAL_Y0 + T.AI_CORNER_INSET : GOAL_Y1 - T.AI_CORNER_INSET);
  const clearChance = laneOpen(state, p.pos, corner, team, T.SHOT_LANE) ? T.SHOT_CLEAR_CHANCE : T.SHOT_BLOCKED_CHANCE;
  const chance = range < T.SHOT_SURE_RANGE ? 1 : clearChance;
  return tools.rng.next() < chance ? { kind: 'shoot', aim: unit(sub(corner, p.pos)), errorScale: tuning.shotError } : null;
};

/** Richtung Tor, mit Ausweichen vor Gegnern im Weg und Abstand zur Seitenlinie. */
const carrierSteer = (state: MatchState, player: number, team: TeamId): Vec => {
  const p = state.players[player];
  const goalDir = unit(sub(oppGoal(team), p.pos), vec(attackSign(team), 0));
  const side = perp(goalDir);
  const avoid = fieldPlayers(otherTeam(team)).reduce((acc, o) => {
    const rel = sub(state.players[o].pos, p.pos);
    const gap = len(rel);
    if (gap > T.AVOID_RANGE || dot(rel, goalDir) <= 0) return acc;
    const away = cross(goalDir, rel) >= 0 ? -1 : 1;
    return add(acc, scale(side, (away * (T.AVOID_RANGE - gap) * T.AVOID_GAIN) / T.AVOID_RANGE));
  }, ZERO);
  const fromTop = p.pos.y < T.EDGE_ZONE ? T.EDGE_PUSH : 0;
  const fromBottom = p.pos.y > PITCH_H - T.EDGE_ZONE ? -T.EDGE_PUSH : 0;
  return unit(add(add(goalDir, avoid), vec(0, fromTop + fromBottom)), goalDir);
};

const carrierIntent = (state: MatchState, player: number, view: TeamView, tools: StepTools): Intent => {
  const move = carrierSteer(state, player, view.team);
  if (state.players[player].think > 0) return stay(move);
  const act = shotChoice(state, player, view, tools) ?? passChoice(state, player, view, tools) ?? IDLE;
  return { move, act, think: view.tuning.think * (T.THINK_MIN + T.THINK_VAR * tools.rng.next()) };
};

// ---- Ohne Ball ----

type DepthRule = (homeX: number, ballX: number) => number;

/** Tiefe beim eigenen Angriff je Aufstellungsplatz: hinten absichern, außen mitgehen, vorne anbieten. */
const SUPPORT_DEPTH: readonly DepthRule[] = [
  (homeX) => homeX,
  (homeX, ballX) => Math.max(T.BACK_MIN_X, Math.min(homeX, ballX - T.BACK_GAP)),
  (homeX, ballX) => Math.max(homeX, ballX + T.MID_AHEAD),
  (homeX, ballX) => Math.max(homeX, ballX + T.MID_AHEAD),
  (homeX, ballX) => Math.max(homeX, ballX + T.FRONT_AHEAD),
];

/** Freilaufen: Heimatposition plus langsame Laufwege, weg vom nächsten Gegner. */
const supportIntent = (state: MatchState, player: number, team: TeamId): Intent => {
  const slot = slotOf(player);
  const home = homeLocal(team, slot, state.ball.pos, T.LEAN_ATTACK);
  const ballX = toWorld(team, state.ball.pos).x;
  const drift = vec(
    Math.sin(state.tick * T.WOBBLE_RATE_X + player * T.WOBBLE_PHASE) * T.WOBBLE_X,
    Math.cos(state.tick * T.WOBBLE_RATE_Y + player) * T.WOBBLE_Y,
  );
  const spot = toWorld(team, vec(
    clamp(SUPPORT_DEPTH[slot](home.x, ballX) + drift.x, T.HOME_MIN_X, T.SUPPORT_MAX_X),
    clamp(home.y + drift.y, T.HOME_MARGIN, PITCH_H - T.HOME_MARGIN),
  ));
  const crowd = fieldPlayers(otherTeam(team))
    .map((o) => state.players[o].pos)
    .find((pos) => dist(pos, spot) < T.UNMARK_DIST);
  const free = crowd ? add(spot, scale(unit(sub(spot, crowd), vec(0, 1)), T.UNMARK_SHIFT)) : spot;
  return stay(moveTo(state.players[player].pos, clampToPitch(free)));
};

/** Stellung zwischen Ball und eigenem Tor. */
const containSpot = (state: MatchState, team: TeamId): Vec =>
  add(state.ball.pos, scale(unit(sub(ownGoal(team), state.ball.pos)), T.CONTAIN_DIST));

const chaseIntent = (state: MatchState, player: number, view: TeamView): Intent => {
  const p = state.players[player];
  const { ball } = state;
  if (ball.owner === NONE) return stay(moveTo(p.pos, interceptPoint(state, player).point));
  if (toWorld(view.team, ball.pos).x > view.tuning.pressLine) return stay(moveTo(p.pos, containSpot(state, view.team)));
  return stay(charge(p.pos, add(ball.pos, scale(state.players[ball.owner].vel, T.PRESS_LEAD))));
};

const defendIntent = (state: MatchState, player: number, view: TeamView): Intent => {
  const p = state.players[player];
  const { team } = view;
  if (player === view.cover) {
    const danger = toWorld(team, state.ball.pos).x < T.DANGER_ZONE;
    return stay(danger ? charge(p.pos, state.ball.pos) : moveTo(p.pos, containSpot(state, team)));
  }
  const home = homeSpot(team, slotOf(player), state.ball.pos, T.LEAN_DEFEND);
  const mark = view.marks[slotOf(player)];
  if (mark === NONE) return stay(moveTo(p.pos, home));
  const threat = state.players[mark].pos;
  const goalSide = add(threat, scale(unit(sub(ownGoal(team), threat)), T.MARK_GAP));
  return stay(moveTo(p.pos, lerp(home, goalSide, T.MARK_BLEND)));
};

const fieldIntent = (state: MatchState, player: number, view: TeamView, tools: StepTools): Intent => {
  if (state.ball.owner === player) return carrierIntent(state, player, view, tools);
  if (player === view.chaser) return chaseIntent(state, player, view);
  const attacking = view.possession === Possession.Own
    || (view.possession === Possession.Loose && state.ball.lastTeam === view.team);
  return attacking ? supportIntent(state, player, view.team) : defendIntent(state, player, view);
};

/** KI-Wunsch für einen einzelnen Spieler. */
export const aiIntent = (state: MatchState, player: number, view: TeamView, tools: StepTools): Intent =>
  (isKeeper(player) ? keeperIntent(state, player, view) : fieldIntent(state, player, view, tools));

/** Rollenverteilung beider Mannschaften für diesen Schritt. */
export const teamViews = (state: MatchState): readonly [TeamView, TeamView] => [viewFor(state, 0), viewFor(state, 1)];
