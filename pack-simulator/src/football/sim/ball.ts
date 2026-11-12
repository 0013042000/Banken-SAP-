/** Ball: Führung am Fuß, freier Flug, Pfosten, Ballannahme, Paraden, Tor und Aus. */
import {
  BALL_R, CENTER, GOAL_DEPTH, GOAL_PAUSE, GOAL_Y0, GOAL_Y1, NONE, PITCH_H, PITCH_W, POST_R,
} from './constants.ts';
import { restartState } from './formation.ts';
import {
  attackSign, bumpPair, inOwnBox, isKeeper, keeperOf, otherTeam, Phase, RestartKind, skill, specOf, teamOf,
  withBall, withPlayer,
  type BallState, type MatchState, type StepTools, type TeamId,
} from './model.ts';
import * as T from './tuning.ts';
import {
  add, clamp, dist, dot, len, lerp, mix, reflect, scale, sub, unit, vec, ZERO, type Vec,
} from './vec.ts';

const POSTS: readonly Vec[] = [vec(0, GOAL_Y0), vec(0, GOAL_Y1), vec(PITCH_W, GOAL_Y0), vec(PITCH_W, GOAL_Y1)];
const POST_GAP = POST_R + BALL_R;
const LEFT: TeamId = 0;
const RIGHT: TeamId = 1;

/** Merkt sich, auf welcher Höhe die Ballmitte die Torlinie überquert hat. */
const crossingY = (from: Vec, to: Vec, known: number): number => {
  if (to.x >= 0 && to.x <= PITCH_W) return NONE;
  if (known !== NONE) return known;
  const lineX = to.x < 0 ? 0 : PITCH_W;
  const dx = to.x - from.x;
  const t = dx ? clamp((lineX - from.x) / dx, 0, 1) : 1;
  return Math.max(0, mix(from.y, to.y, t));
};

const scoreGoal = (state: MatchState, team: TeamId, tools: StepTools): MatchState => {
  const { ball } = state;
  const byKicker = ball.kicker !== NONE && teamOf(ball.kicker) === team;
  const lastTouch = ball.lastPlayer === NONE ? keeperOf(otherTeam(team)) : ball.lastPlayer;
  const player = byKicker ? ball.kicker : lastTouch;
  const own = teamOf(player) !== team;
  tools.emit({ type: 'goal', team, player, own });
  return {
    ...state,
    phase: Phase.Goal,
    phaseTime: GOAL_PAUSE,
    score: bumpPair(state.score, team),
    goals: [...state.goals, { team, player, own, time: state.config.durationSec - state.timeLeft }],
    ball: { ...ball, owner: NONE, held: false, passTo: NONE },
    restart: { kind: RestartKind.Kickoff, team: otherTeam(team) },
  };
};

/** Toraus: Ecke, wenn die verteidigende Mannschaft zuletzt am Ball war, sonst Abstoß. */
const goalLineOut = (state: MatchState, defending: TeamId, tools: StepTools): MatchState => {
  const { ball } = state;
  const isCorner = ball.lastTeam === defending;
  const kind = isCorner ? RestartKind.Corner : RestartKind.GoalKick;
  const team = isCorner ? otherTeam(defending) : defending;
  const cornerX = defending === RIGHT ? PITCH_W - T.CORNER_INSET : T.CORNER_INSET;
  const cornerY = ball.pos.y < CENTER.y ? T.CORNER_INSET : PITCH_H - T.CORNER_INSET;
  tools.emit({ type: 'out', kind, team });
  return restartState(state, kind, team, vec(cornerX, cornerY));
};

/** Seitenaus: Einkick für die Mannschaft, die den Ball nicht zuletzt berührt hat. */
const sideOut = (state: MatchState, tools: StepTools): MatchState => {
  const { ball } = state;
  const team: TeamId = ball.lastTeam === LEFT ? RIGHT : LEFT;
  const spot = vec(
    clamp(ball.pos.x, T.KICKIN_MARGIN, PITCH_W - T.KICKIN_MARGIN),
    ball.pos.y < CENTER.y ? T.LINE_INSET : PITCH_H - T.LINE_INSET,
  );
  tools.emit({ type: 'out', kind: RestartKind.KickIn, team });
  return restartState(state, RestartKind.KickIn, team, spot);
};

/**
 * Tor und Aus zählen erst, wenn der Ball die Linie vollständig überquert hat.
 * Ein Tor ist es nur, wenn die Ballmitte die Torlinie zwischen den Pfosten überquert hat.
 */
const checkBounds = (state: MatchState, tools: StepTools): MatchState => {
  const { pos, crossY } = state.ball;
  const overRight = pos.x - BALL_R > PITCH_W;
  const overLeft = pos.x + BALL_R < 0;
  if (overRight || overLeft) {
    const defending = overRight ? RIGHT : LEFT;
    const betweenPosts = crossY > GOAL_Y0 && crossY < GOAL_Y1;
    return betweenPosts ? scoreGoal(state, otherTeam(defending), tools) : goalLineOut(state, defending, tools);
  }
  return pos.y + BALL_R < 0 || pos.y - BALL_R > PITCH_H ? sideOut(state, tools) : state;
};

/** Ein Teilschritt freier Bewegung: Bremsung, Flug, Aufprall. */
const integrate = (ball: BallState, h: number): BallState => {
  const airborne = ball.z > T.GROUND_Z;
  const slowed = scale(ball.vel, Math.exp(-(airborne ? T.AIR_DRAG : T.DRAG) * h));
  const vel = !airborne && len(slowed) < T.STOP_SPEED ? ZERO : slowed;
  const pos = add(ball.pos, scale(vel, h));
  const fallSpeed = ball.vz - T.GRAVITY * h;
  const height = ball.z + fallSpeed * h;
  const rebound = -fallSpeed * T.BOUNCE;
  const landed = height <= 0;
  const bounceSpeed = rebound > T.BOUNCE_MIN ? rebound : 0;
  return {
    ...ball, pos, vel,
    z: landed ? 0 : height,
    vz: landed ? bounceSpeed : fallSpeed,
    crossY: crossingY(ball.pos, pos, ball.crossY),
  };
};

const bouncePost = (ball: BallState, tools: StepTools): BallState => {
  const post = POSTS.find((at) => dist(at, ball.pos) < POST_GAP);
  if (!post || ball.z > T.POST_HEIGHT) return ball;
  const normal = unit(sub(ball.pos, post), vec(ball.pos.x < CENTER.x ? 1 : -1, 0));
  const inbound = dot(ball.vel, normal) < 0;
  if (inbound) tools.emit({ type: 'post' });
  return {
    ...ball,
    pos: add(post, scale(normal, POST_GAP)),
    vel: inbound ? scale(reflect(ball.vel, normal), T.POST_KEEP) : ball.vel,
  };
};

const reachOf = (state: MatchState, player: number): number => {
  const guarding = isKeeper(player) && inOwnBox(teamOf(player), state.players[player].pos);
  return guarding ? T.keeperReach(specOf(state, player)) : T.PICKUP_DIST;
};

/** Spieler, der den freien Ball in diesem Teilschritt berührt, oder NONE. */
const toucher = (state: MatchState): number => {
  const { ball, players } = state;
  if (ball.z >= T.OVERHEAD_Z) return NONE;
  const near = players
    .map((p, i) => ({ i, gap: dist(p.pos, ball.pos), able: p.stun <= 0 && !(i === ball.lastPlayer && p.kickLock > 0) }))
    .filter((c) => c.able && c.gap < reachOf(state, c.i));
  return near.length ? near.reduce((best, c) => (c.gap < best.gap ? c : best), near[0]).i : NONE;
};

const takeBall = (state: MatchState, player: number, held: boolean): MatchState => {
  const taken = withPlayer(state, player, { hold: 0, think: T.FIRST_TOUCH });
  return withBall(taken, {
    owner: player, held, z: held ? T.HAND_Z : 0, vz: 0, lastPlayer: player, lastTeam: teamOf(player),
    kicker: NONE, shot: false, judged: false, beaten: false, passTo: NONE, protect: T.TRAP_PROTECT,
  });
};

/** Zu scharfer Ball: prallt vom Spieler ab, statt angenommen zu werden. */
const deflect = (state: MatchState, player: number, keep: number, lock: number): MatchState => {
  const { ball } = state;
  const p = state.players[player];
  const normal = unit(sub(ball.pos, p.pos), p.dir);
  const inbound = dot(ball.vel, normal) < 0;
  const locked = withPlayer(state, player, { kickLock: lock });
  return withBall(locked, {
    pos: add(p.pos, scale(normal, T.PICKUP_DIST)),
    vel: scale(inbound ? reflect(ball.vel, normal) : ball.vel, keep),
    lastPlayer: player, lastTeam: teamOf(player), passTo: NONE, judged: false, beaten: false,
  });
};

/** Abwehr zur Seite: Der Ball springt vom Tor weg, schräg nach außen. */
const parry = (state: MatchState, keeper: number): MatchState => {
  const { ball } = state;
  const team = teamOf(keeper);
  const p = state.players[keeper];
  const side = ball.pos.y >= p.pos.y ? T.PARRY_SIDE : -T.PARRY_SIDE;
  const out = unit(vec(attackSign(team), side));
  const locked = withPlayer(state, keeper, { kickLock: T.PARRY_LOCK });
  return withBall(locked, {
    vel: scale(out, len(ball.vel) * T.PARRY_SPEED), vz: T.SHOT_LIFT,
    lastPlayer: keeper, lastTeam: team, kicker: NONE, shot: false, passTo: NONE, judged: false, beaten: false,
  });
};

/**
 * Torwart am Ball: Harmlose Bälle nimmt er auf. Bei scharfen gegnerischen Bällen entscheidet
 * ein Wurf aus Torwartstärke gegen Schussstärke, ob er hält (fängt oder abwehrt) oder geschlagen ist.
 */
const keeperTouch = (state: MatchState, keeper: number, tools: StepTools): MatchState => {
  const { ball } = state;
  const team = teamOf(keeper);
  const speed = len(ball.vel);
  const hostile = ball.kicker !== NONE && teamOf(ball.kicker) !== team && speed > T.KEEPER_EASY_SPEED;
  if (!hostile) return takeBall(state, keeper, true);
  if (ball.judged) return state;
  const ability = skill(specOf(state, keeper).keeping);
  const power = clamp((speed - T.POWER_FLOOR) / T.POWER_RANGE, 0, 1);
  const setup = state.config.teams[team];
  const level = setup.control === 'ai' ? T.AI_LEVELS[setup.difficulty].keeper : 0;
  const saveChance = clamp(T.SAVE_BASE + T.SAVE_SKILL * ability - T.SAVE_POWER * power + level, T.SAVE_MIN, T.SAVE_MAX);
  if (tools.rng.next() >= saveChance) return withBall(state, { judged: true, beaten: true });
  tools.emit({ type: 'save', player: keeper });
  const saved = { ...state, stats: { ...state.stats, saves: bumpPair(state.stats.saves, team) } };
  const catches = tools.rng.next() < T.CATCH_BASE + T.CATCH_SKILL * ability - T.CATCH_POWER * power;
  return catches ? takeBall(saved, keeper, true) : parry(saved, keeper);
};

const fieldTouch = (state: MatchState, player: number): MatchState => {
  const { ball } = state;
  const limitSpeed = T.CONTROL_SPEED + T.CONTROL_SPEED_SPAN * skill(specOf(state, player).dribble);
  const tooHot = len(ball.vel) > limitSpeed && ball.passTo !== player;
  return tooHot ? deflect(state, player, T.DEFLECT_KEEP, T.DEFLECT_LOCK) : takeBall(state, player, false);
};

const touchBall = (state: MatchState, tools: StepTools): MatchState => {
  const player = toucher(state);
  if (player === NONE) return state;
  const guarding = isKeeper(player) && inOwnBox(teamOf(player), state.players[player].pos);
  return guarding ? keeperTouch(state, player, tools) : fieldTouch(state, player);
};

/** Freier Ball in kleinen Teilschritten, damit er weder Pfosten noch Spieler überspringt. */
const fly = (state: MatchState, stepsLeft: number, h: number, tools: StepTools): MatchState => {
  if (!stepsLeft || state.phase !== Phase.Play || state.ball.owner !== NONE) return state;
  const moved = { ...state, ball: bouncePost(integrate(state.ball, h), tools) };
  const ruled = checkBounds(moved, tools);
  const touched = ruled.phase === Phase.Play ? touchBall(ruled, tools) : ruled;
  return fly(touched, stepsLeft - 1, h, tools);
};

/** Geführter Ball: klebt locker vor dem Fuß; gute Dribbler führen ihn enger. */
const carry = (state: MatchState, tools: StepTools): MatchState => {
  const { ball } = state;
  const p = state.players[ball.owner];
  if (ball.held) {
    return withBall(state, { pos: add(p.pos, scale(p.dir, T.HAND_DIST)), vel: p.vel, z: T.HAND_Z, vz: 0 });
  }
  const spot = add(p.pos, scale(p.dir, T.CARRY_DIST));
  const grip = Math.min(1, (T.CARRY_RATE + T.CARRY_RATE_SPAN * skill(specOf(state, ball.owner).dribble)) * tools.dt);
  const pos = lerp(ball.pos, spot, grip);
  const moved = withBall(state, { pos, vel: p.vel, z: 0, vz: 0, crossY: crossingY(ball.pos, pos, ball.crossY) });
  return checkBounds(moved, tools);
};

/** Bewegt den Ball für einen Simulationsschritt. */
export const moveBall = (state: MatchState, tools: StepTools): MatchState => {
  if (state.ball.owner !== NONE) return carry(state, tools);
  const substeps = Math.max(1, Math.ceil((len(state.ball.vel) * tools.dt) / T.SUBSTEP_LENGTH));
  return fly(state, substeps, tools.dt / substeps, tools);
};

/** Nach einem Tor rollt der Ball im Netz aus. */
export const settleInNet = (ball: BallState, dt: number): BallState => {
  const vel = scale(ball.vel, Math.exp(-T.NET_DRAG * dt));
  const pos = add(ball.pos, scale(vel, dt));
  const right = pos.x > CENTER.x;
  const x = right
    ? clamp(pos.x, PITCH_W + BALL_R, PITCH_W + GOAL_DEPTH - BALL_R)
    : clamp(pos.x, BALL_R - GOAL_DEPTH, -BALL_R);
  return { ...ball, vel, pos: vec(x, clamp(pos.y, GOAL_Y0 + BALL_R, GOAL_Y1 - BALL_R)), z: ball.z * Math.exp(-T.NET_DRAG * dt), vz: 0 };
};
