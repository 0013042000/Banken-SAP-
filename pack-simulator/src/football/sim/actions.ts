/** Aktionen am Ball: Pass, Schuss, Zweikampf. Jede Funktion liefert einen neuen Zustand. */
import { CENTER, GOAL_HALF, GOAL_Y0, GOAL_Y1, HALF, NONE } from './constants.ts';
import {
  attackSign, bumpPair, inOwnBox, isKeeper, oppGoal, skill, specOf, teamOf, withBall, withPlayer,
  type BallState, type MatchState, type StepTools, type TeamId,
} from './model.ts';
import * as T from './tuning.ts';
import { add, clamp, dist, dot, len, rotate, scale, sub, unit, vec, type Vec } from './vec.ts';

/** Was ein Spieler in diesem Schritt mit dem Ball tun will. */
export type Action =
  | { readonly kind: 'none' }
  | { readonly kind: 'pass'; readonly target: number; readonly lob: boolean }
  | { readonly kind: 'kick'; readonly dir: Vec }
  | { readonly kind: 'shoot'; readonly aim: Vec; readonly errorScale: number };

export const IDLE: Action = Object.freeze({ kind: 'none' });

type ActionHandler<TKind extends Action['kind']> =
  (state: MatchState, player: number, action: Extract<Action, { kind: TKind }>, tools: StepTools) => MatchState;

/** Löst den Ball vom Spieler und gibt ihm eine Geschwindigkeit. */
const kickBall = (state: MatchState, player: number, patch: Partial<BallState>): MatchState => {
  const team = teamOf(player);
  const released = withPlayer(state, player, { kickLock: T.KICK_LOCK, hold: 0 });
  return withBall(released, {
    owner: NONE, held: false, vz: 0, kicker: player, lastPlayer: player, lastTeam: team,
    shot: false, judged: false, beaten: false, passTo: NONE, age: 0, protect: 0, crossY: NONE,
    ...patch,
  });
};

/**
 * Zielhilfe: Zeigt die Schussrichtung grob aufs Tor, wird der Schuss auf einen Punkt
 * knapp innerhalb der Pfosten gelenkt. Die Richtung des Sticks bestimmt weiterhin die Ecke.
 */
export const assistedAim = (team: TeamId, from: Vec, aim: Vec): Vec => {
  const goal = oppGoal(team);
  if (aim.x * attackSign(team) < T.ASSIST_MIN_FORWARD) return aim;
  const yAtLine = from.y + aim.y * ((goal.x - from.x) / aim.x);
  if (Math.abs(yAtLine - CENTER.y) > GOAL_HALF + T.ASSIST_REACH) return aim;
  const y = clamp(yAtLine, GOAL_Y0 + T.ASSIST_INSET, GOAL_Y1 - T.ASSIST_INSET);
  return unit(sub(vec(goal.x, y), from), aim);
};

const shoot: ActionHandler<'shoot'> = (state, player, action, tools) => {
  const spec = specOf(state, player);
  const team = teamOf(player);
  const power = skill(spec.shot);
  const aim = assistedAim(team, state.ball.pos, unit(action.aim, state.players[player].dir));
  const error = tools.rng.spread() * (T.SHOT_ERR_MIN + T.SHOT_ERR_SPAN * (1 - power)) * action.errorScale;
  const vel = scale(rotate(aim, error), T.SHOT_BASE + T.SHOT_SPAN * power);
  tools.emit({ type: 'shot', player });
  const kicked = kickBall(state, player, { vel, vz: T.SHOT_LIFT, shot: true });
  return { ...kicked, stats: { ...kicked.stats, shots: bumpPair(kicked.stats.shots, team) } };
};

/** Flugbahn eines hohen Balls (Abwurf): kommt nach der Flugzeit beim Ziel herunter. */
const lobVelocity = (from: Vec, to: Vec): { readonly vel: Vec; readonly vz: number } => {
  const distance = dist(from, to);
  const time = clamp(distance / T.LOB_SPEED, T.LOB_TIME_MIN, T.LOB_TIME_MAX);
  const speed = (distance * T.AIR_DRAG) / (1 - Math.exp(-T.AIR_DRAG * time));
  return { vel: scale(unit(sub(to, from)), speed), vz: T.GRAVITY * time * HALF };
};

const pass: ActionHandler<'pass'> = (state, player, action, tools) => {
  const spec = specOf(state, player);
  const team = teamOf(player);
  const mate = state.players[action.target];
  const from = state.ball.pos;
  const lead = scale(mate.vel, (dist(from, mate.pos) / T.PASS_LEAD_SPEED) * T.PASS_LEAD);
  const target = add(mate.pos, lead);
  const error = tools.rng.spread() * (T.PASS_ERR_MIN + T.PASS_ERR_SPAN * (1 - skill(spec.pass)));
  const speed = clamp(T.PASS_ARRIVE + T.DRAG * dist(from, target), T.PASS_MIN, T.PASS_MAX);
  const flat = { vel: scale(rotate(unit(sub(target, from), state.players[player].dir), error), speed), vz: 0 };
  // Ein Abwurf startet über Kopfhöhe, damit ihn kein Gegner direkt vor dem Torwart abfangen kann.
  const flight = action.lob ? { ...lobVelocity(from, target), z: T.LOB_START_Z } : flat;
  tools.emit({ type: 'pass', player });
  const kicked = kickBall(state, player, { ...flight, passTo: action.target });
  return { ...kicked, stats: { ...kicked.stats, passes: bumpPair(kicked.stats.passes, team) } };
};

/** Ball in den freien Raum spielen, wenn in Stickrichtung niemand steht. */
const kick: ActionHandler<'kick'> = (state, player, action, tools) => {
  tools.emit({ type: 'pass', player });
  return kickBall(state, player, { vel: scale(unit(action.dir, state.players[player].dir), T.FREE_KICK_SPEED) });
};

const ACTION_HANDLERS: { readonly [K in Action['kind']]: ActionHandler<K> } = {
  none: (state) => state,
  pass,
  kick,
  shoot,
};

/** Führt die Aktion des Ballführenden aus (nur wer den Ball hat, kann handeln). */
export const applyAction = (state: MatchState, action: Action, tools: StepTools): MatchState => {
  const owner = state.ball.owner;
  if (owner === NONE) return state;
  // Die Tabelle ordnet jeder Aktionsart genau ihren Handler zu; TypeScript kann das über den Indexzugriff nicht nachvollziehen.
  const handle = ACTION_HANDLERS[action.kind] as ActionHandler<Action['kind']>;
  return handle(state, owner, action, tools);
};

const levelTackleBonus = (state: MatchState, team: TeamId): number => {
  const setup = state.config.teams[team];
  return setup.control === 'ai' ? T.AI_LEVELS[setup.difficulty].tackle : 0;
};

/**
 * Zweikampf um den geführten Ball: Defensive (bzw. Torwartstärke) gegen Dribbling,
 * dazu etwas Körper. Verliert der Verteidiger, ist er kurz benommen.
 */
export const attemptTackle = (state: MatchState, defender: number, bonus: number, tools: StepTools): MatchState => {
  const owner = state.ball.owner;
  const team = teamOf(defender);
  const mine = specOf(state, defender);
  const theirs = specOf(state, owner);
  const defending = isKeeper(defender) ? skill(mine.keeping) : skill(mine.defense);
  const carrier = state.players[owner];
  // +1: Der Verteidiger steht dem Ballführenden frontal im Weg, −1: er kommt von hinten.
  const frontal = dot(carrier.dir, unit(sub(state.players[defender].pos, carrier.pos)));
  const chance = clamp(
    T.TACKLE_BASE + T.TACKLE_SKILL * (defending - skill(theirs.dribble)) + T.TACKLE_ANGLE * frontal
      + T.TACKLE_BODY * (skill(mine.physical) - skill(theirs.physical)) + bonus + levelTackleBonus(state, team),
    T.TACKLE_MIN, T.TACKLE_MAX,
  );
  if (tools.rng.next() >= chance) return withPlayer(state, defender, { stun: T.TACKLE_FAIL_STUN, cool: T.TACKLE_COOL });
  tools.emit({ type: 'tackle', player: defender });
  const beaten = withPlayer(state, owner, { stun: T.TACKLE_WIN_STUN, hold: 0 });
  const won = withPlayer(beaten, defender, { hold: 0, cool: T.TACKLE_COOL });
  const grabbed = isKeeper(defender) && inOwnBox(team, state.players[defender].pos);
  return withBall(won, {
    owner: defender, held: grabbed, lastPlayer: defender, lastTeam: team, kicker: NONE,
    shot: false, passTo: NONE, protect: T.WIN_PROTECT,
  });
};

/** Gegner in Ballnähe versuchen, dem Ballführenden den Ball abzunehmen (ein Versuch pro Schritt). */
export const resolveTackles = (state: MatchState, tools: StepTools): MatchState => {
  const { ball, players } = state;
  if (ball.owner === NONE || ball.held || ball.protect > 0) return state;
  const ownerTeam = teamOf(ball.owner);
  const challengers = players
    .map((p, i) => ({ i, gap: dist(p.pos, ball.pos), ready: teamOf(i) !== ownerTeam && p.stun <= 0 && p.cool <= 0 }))
    .filter((c) => c.ready && c.gap < T.STEAL_DIST);
  if (!challengers.length) return state;
  const nearest = challengers.reduce((best, c) => (c.gap < best.gap ? c : best), challengers[0]);
  return attemptTackle(state, nearest.i, 0, tools);
};

/** Antritt zum Ball; in Reichweite des Ballführenden ein Zweikampf mit Bonus. */
export const lunge = (state: MatchState, player: number, tools: StepTools): MatchState => {
  const p = state.players[player];
  const { ball } = state;
  if (p.stun > 0 || p.cool > 0) return state;
  const toBall = sub(ball.pos, p.pos);
  const dash = scale(unit(toBall, p.dir), T.maxSpeed(specOf(state, player)) * T.LUNGE_DASH);
  const dashed = withPlayer(state, player, { vel: dash, cool: T.LUNGE_COOL });
  const canTackle = ball.owner !== NONE && teamOf(ball.owner) !== teamOf(player) && !ball.held && ball.protect <= 0;
  if (!canTackle || len(toBall) >= T.LUNGE_RANGE) return dashed;
  const fought = attemptTackle(dashed, player, T.LUNGE_BONUS, tools);
  const missed = fought.ball.owner !== player;
  return missed ? withPlayer(fought, player, { stun: T.LUNGE_FAIL_STUN }) : fought;
};
