import { describe, expect, it } from 'vitest';
import { attemptTackle, assistedAim } from '../sim/actions.ts';
import { createMatch } from '../sim/formation.ts';
import { CENTER, GOAL_Y0, GOAL_Y1, HALF, NONE, PITCH_W, TEAM_SIZE } from '../sim/constants.ts';
import {
  keeperOf, Phase, playerIndex, teamOf, withBall, withPlayer,
  type Difficulty, type SimEvent, type StepTools,
} from '../sim/model.ts';
import { createRng } from '../sim/rng.ts';
import * as T from '../sim/tuning.ts';
import { dist, vec } from '../sim/vec.ts';
import { AVERAGE, makeConfig, makeSpec, makeTeam, openPlay, run, runUntil, SEED, seconds } from './helpers.ts';

const HOME = 0;
const AWAY = 1;
const FRONT = TEAM_SIZE - 1;
const TRIALS = 60;
const SEED_STEP = 7919;
const STRONG_KEEPER = 95;
const WEAK_KEEPER = 40;
const SHOT_FROM_X = 74;
const SHOT_SPEED = 54;
const SHOT_DRIFT = 4;
const SHOT_WATCH = seconds(1);
const CROWD_GAP = 2.5;
const HALF_SECOND = seconds(HALF);
const THROW_WAIT = seconds(T.KEEPER_HOLD + 1);
const AFTER_THROW = seconds(T.KICK_LOCK);
const FRONT_GAP = 2.4;
const EASY: Difficulty = 0;
const HARD: Difficulty = 2;
const LEVEL_GAMES = 5;
const LEVEL_SECONDS = 60;
const PAUSE_ALLOWANCE = 3;
const LEVEL_LIMIT = seconds(LEVEL_SECONDS) * PAUSE_ALLOWANCE;
const SLIGHT = 0.3;
const INSIDE = 1;

const keeperConfig = (keeping: number, seed: number): ReturnType<typeof makeConfig> => {
  const away = makeTeam('B', AVERAGE, 'ai');
  return makeConfig({
    seed,
    teams: [makeTeam('A', AVERAGE, 'ai'), { ...away, players: away.players.map((p, slot) => (slot ? p : makeSpec(p.id, AVERAGE, keeping))) }],
  });
};

/** Schuss aus der Distanz leicht neben die Tormitte; nur der Torwart greift ein. */
const goalsAgainst = (keeping: number): number =>
  Array.from({ length: TRIALS }, (_, i) => {
    const start = openPlay(vec(SHOT_FROM_X, CENTER.y), vec(SHOT_SPEED, SHOT_DRIFT), HOME, keeperConfig(keeping, SEED + i * SEED_STEP), [keeperOf(AWAY)]);
    const shot = withBall(start, { kicker: playerIndex(HOME, FRONT), shot: true });
    return run(shot, SHOT_WATCH).state.score[HOME];
  }).reduce((sum, goals) => sum + goals, 0);

const toolsFor = (seed: number): StepTools & { readonly events: SimEvent[] } => {
  const events: SimEvent[] = [];
  return { rng: createRng(seed), emit: (event) => { events.push(event); }, dt: 0, events };
};

/** Zweikampfquote, wenn der Verteidiger um `offsetX` versetzt zum nach rechts laufenden Ballführenden steht. */
const tackleRate = (offsetX: number): number => {
  const carrier = playerIndex(HOME, FRONT);
  const defender = playerIndex(AWAY, FRONT);
  const base = openPlay(CENTER, vec(0, 0), HOME, makeConfig(), [carrier, defender]);
  const placed = withPlayer(withPlayer(base, carrier, { pos: CENTER, dir: vec(1, 0) }), defender, { pos: vec(CENTER.x + offsetX, CENTER.y) });
  const owned = withBall(placed, { owner: carrier });
  const wins = Array.from({ length: TRIALS }, (_, i) => attemptTackle(owned, defender, 0, toolsFor(SEED + i)).ball.owner === defender);
  return wins.filter(Boolean).length / TRIALS;
};

describe('Torwart', () => {
  it('ein starker Torwart hält mehr als ein schwacher – aber keiner hält alles oder nichts', () => {
    const strong = goalsAgainst(STRONG_KEEPER);
    const weak = goalsAgainst(WEAK_KEEPER);
    expect(weak).toBeGreaterThan(strong);
    expect(strong).toBeLessThan(TRIALS);
    expect(weak).toBeGreaterThan(0);
  });

  it('hält er den Ball, müssen Gegner Abstand halten; der Abwurf fliegt über sie hinweg', () => {
    const keeper = keeperOf(AWAY);
    const rival = playerIndex(HOME, FRONT);
    const base = openPlay(CENTER, vec(0, 0), AWAY, makeConfig(), [keeper, rival, playerIndex(AWAY, 1), playerIndex(AWAY, FRONT)]);
    const keeperPos = base.players[keeper].pos;
    const crowded = withPlayer(base, rival, { pos: vec(keeperPos.x - CROWD_GAP, keeperPos.y) });
    const held = withBall(crowded, { pos: keeperPos, owner: keeper, held: true, lastTeam: AWAY, lastPlayer: keeper });
    const pushed = run(held, HALF_SECOND).state;
    expect(pushed.ball.owner).toBe(keeper);
    expect(dist(pushed.players[rival].pos, pushed.players[keeper].pos)).toBeGreaterThan(CROWD_GAP + CROWD_GAP);

    const thrown = runUntil(pushed, (s) => s.ball.owner === NONE, THROW_WAIT);
    expect(thrown.ball.owner).toBe(NONE);
    expect(thrown.ball.z).toBeGreaterThanOrEqual(T.OVERHEAD_Z);
    const later = run(thrown, AFTER_THROW).state;
    expect(later.ball.owner === NONE || teamOf(later.ball.owner) === AWAY).toBe(true);
  });
});

describe('Zweikampf', () => {
  it('von vorn ist der Ball leichter zu erobern als von hinten, sicher ist nichts', () => {
    const front = tackleRate(FRONT_GAP);
    const behind = tackleRate(-FRONT_GAP);
    expect(front).toBeGreaterThan(behind);
    expect(front).toBeLessThan(1);
    expect(behind).toBeGreaterThan(0);
  });

  it('ein verlorener Zweikampf macht den Verteidiger kurz benommen, ein gewonnener den Ballführenden', () => {
    const carrier = playerIndex(HOME, FRONT);
    const defender = playerIndex(AWAY, FRONT);
    const base = withBall(openPlay(CENTER, vec(0, 0), HOME, makeConfig(), [carrier, defender]), { owner: carrier });
    const outcomes = Array.from({ length: TRIALS }, (_, i) => attemptTackle(base, defender, 0, toolsFor(SEED + i)));
    const won = outcomes.find((s) => s.ball.owner === defender);
    const lost = outcomes.find((s) => s.ball.owner === carrier);
    expect(won?.players[carrier].stun).toBeGreaterThan(0);
    expect(won?.players[defender].stun).toBe(0);
    expect(lost?.players[defender].stun).toBeGreaterThan(0);
    expect(lost?.players[carrier].stun).toBe(0);
  });
});

describe('Schuss', () => {
  it.each([
    { name: 'gerade aufs Tor', aimY: 0, low: GOAL_Y0, high: GOAL_Y1 },
    { name: 'schräg nach oben → obere Ecke', aimY: -SLIGHT, low: GOAL_Y0, high: CENTER.y },
    { name: 'schräg nach unten → untere Ecke', aimY: SLIGHT, low: CENTER.y, high: GOAL_Y1 },
  ])('Zielhilfe: $name landet zwischen den Pfosten', ({ aimY, low, high }) => {
    const from = vec(SHOT_FROM_X, CENTER.y);
    const aim = assistedAim(HOME, from, vec(1, aimY));
    const yAtLine = from.y + aim.y * ((PITCH_W - from.x) / aim.x);
    expect(yAtLine).toBeGreaterThan(low + INSIDE - SLIGHT);
    expect(yAtLine).toBeLessThan(high - INSIDE + SLIGHT);
  });

  it('weg vom Tor gibt es keine Zielhilfe', () => {
    const away = vec(-1, 0);
    expect(assistedAim(HOME, vec(SHOT_FROM_X, CENTER.y), away)).toEqual(away);
  });
});

describe('Schwierigkeit', () => {
  it('„Schwer“ ist gegen „Leicht“ über mehrere Spiele klar überlegen', () => {
    const totals = Array.from({ length: LEVEL_GAMES }, (_, i) => {
      const config = makeConfig({
        seed: SEED + i * SEED_STEP,
        durationSec: LEVEL_SECONDS,
        teams: [makeTeam('Leicht', AVERAGE, 'ai', EASY), makeTeam('Schwer', AVERAGE, 'ai', HARD)],
      });
      return runUntil(createMatch(config), (s) => s.phase === Phase.Ended, LEVEL_LIMIT).score;
    }).reduce((sum, [easy, hard]) => [sum[0] + easy, sum[1] + hard], [0, 0]);
    expect(totals[1]).toBeGreaterThan(totals[0]);
  });
});
