import { describe, expect, it } from 'vitest';
import {
  BALL_R, CENTER, GOAL_PAUSE, GOAL_Y0, GOAL_Y1, KICKOFF_AFTER_GOAL, NONE, PITCH_H, PITCH_W, RESTART_PAUSE,
} from '../sim/constants.ts';
import { createMatch } from '../sim/formation.ts';
import { isKeeper, keeperOf, Phase, RestartKind, teamOf, toWorld } from '../sim/model.ts';
import { vec } from '../sim/vec.ts';
import { makeConfig, NO_INPUT, openPlay, run, runUntil, seconds } from './helpers.ts';

const SHOT_SPEED = 40;
const START_X = 92;
const INSIDE = 1.2;
const OUTSIDE = 1.6;
const ONE_SECOND = seconds(1);
const HOME = 0;
const AWAY = 1;
const SIDE_Y = 4;
const NEAR_LINE = 0.3;
const TOP_HALF_Y = 20;
const SHORT_MATCH = 2;
const EXTRA_STEPS = 50;
const KICKOFF_STEPS = seconds(KICKOFF_AFTER_GOAL) + 1;

const shotAt = (y: number, lastTeam: number = HOME): ReturnType<typeof openPlay> =>
  openPlay(vec(START_X, y), vec(SHOT_SPEED, 0), lastTeam);

describe('Torerkennung', () => {
  it.each([
    { name: 'Mitte des Tors', y: CENTER.y },
    { name: 'knapp innerhalb des oberen Pfostens', y: GOAL_Y0 + INSIDE },
    { name: 'knapp innerhalb des unteren Pfostens', y: GOAL_Y1 - INSIDE },
  ])('Tor: $name', ({ y }) => {
    const { state, events } = run(shotAt(y), ONE_SECOND);
    expect(state.score).toEqual([1, 0]);
    expect(state.phase).toBe(Phase.Goal);
    expect(events.filter((e) => e.type === 'goal')).toHaveLength(1);
    expect(state.goals[0]).toMatchObject({ team: HOME, own: false });
  });

  it.each([
    { name: 'knapp über dem oberen Pfosten vorbei', y: GOAL_Y0 - OUTSIDE },
    { name: 'knapp unter dem unteren Pfosten vorbei', y: GOAL_Y1 + OUTSIDE },
  ])('kein Tor: $name → Abstoß', ({ y }) => {
    const { state, events } = run(shotAt(y), ONE_SECOND);
    expect(state.score).toEqual([0, 0]);
    expect(events.some((e) => e.type === 'goal')).toBe(false);
    expect(state.restart).toEqual({ kind: RestartKind.GoalKick, team: AWAY });
  });

  it('der Ball muss die Linie vollständig überquert haben', () => {
    const justShort = openPlay(vec(PITCH_W + BALL_R - NEAR_LINE, CENTER.y), vec(0, 0), HOME);
    expect(run(justShort, 1).state.phase).toBe(Phase.Play);
    const fullyOver = openPlay(vec(PITCH_W - NEAR_LINE, CENTER.y), vec(SHOT_SPEED, 0), HOME);
    expect(run(fullyOver, ONE_SECOND).state.score).toEqual([1, 0]);
  });

  it('Pfostentreffer prallt ab und zählt nicht', () => {
    const { state, events } = run(shotAt(GOAL_Y0), ONE_SECOND);
    expect(events.some((e) => e.type === 'post')).toBe(true);
    expect(state.score).toEqual([0, 0]);
  });

  it('Tor ins eigene Netz zählt für den Gegner als Eigentor', () => {
    const ownGoal = openPlay(vec(PITCH_W - START_X, CENTER.y), vec(-SHOT_SPEED, 0), HOME);
    const { state } = run(ownGoal, ONE_SECOND);
    expect(state.score).toEqual([0, 1]);
    expect(state.goals[0]).toMatchObject({ team: AWAY, own: true });
  });
});

describe('Ball im Aus', () => {
  it('Seitenaus: Einkick für die andere Mannschaft von der Linie, nach kurzer Pause geht es weiter', () => {
    const { state, events } = run(openPlay(vec(CENTER.x, SIDE_Y), vec(0, -SHOT_SPEED), HOME), ONE_SECOND);
    expect(events).toContainEqual({ type: 'out', kind: RestartKind.KickIn, team: AWAY });
    expect(state.phase).toBe(Phase.Restart);
    expect(state.restart).toEqual({ kind: RestartKind.KickIn, team: AWAY });
    expect(teamOf(state.ball.owner)).toBe(AWAY);
    expect(isKeeper(state.ball.owner)).toBe(false);
    expect(state.ball.pos.y).toBeGreaterThan(0);
    expect(state.ball.pos.y).toBeLessThan(SIDE_Y);
    const resumed = runUntil(state, (s) => s.phase === Phase.Play, seconds(RESTART_PAUSE) + 1);
    expect(resumed.phase).toBe(Phase.Play);
    expect(teamOf(resumed.ball.owner)).toBe(AWAY);
  });

  it('Seitenaus: Gegner halten Abstand, alle stehen im Feld', () => {
    const { state } = run(openPlay(vec(CENTER.x, PITCH_H - SIDE_Y), vec(0, SHOT_SPEED), AWAY), ONE_SECOND);
    expect(state.restart).toEqual({ kind: RestartKind.KickIn, team: HOME });
    const tooClose = state.players.filter((p, i) => teamOf(i) === AWAY && Math.hypot(p.pos.x - state.ball.pos.x, p.pos.y - state.ball.pos.y) < SIDE_Y);
    expect(tooClose).toHaveLength(0);
    expect(state.players.every((p) => p.pos.x >= 0 && p.pos.x <= PITCH_W && p.pos.y >= 0 && p.pos.y <= PITCH_H)).toBe(true);
  });

  it('Toraus durch die Angreifer: Abstoß, der Torwart hält den Ball', () => {
    const { state } = run(shotAt(TOP_HALF_Y, HOME), ONE_SECOND);
    expect(state.restart).toEqual({ kind: RestartKind.GoalKick, team: AWAY });
    expect(state.ball.owner).toBe(keeperOf(AWAY));
    expect(state.ball.held).toBe(true);
  });

  it('Toraus durch die Verteidiger: Ecke für die Angreifer an der nächsten Eckfahne', () => {
    const { state } = run(shotAt(TOP_HALF_Y, AWAY), ONE_SECOND);
    expect(state.restart).toEqual({ kind: RestartKind.Corner, team: HOME });
    expect(teamOf(state.ball.owner)).toBe(HOME);
    expect(state.ball.pos.x).toBeGreaterThan(PITCH_W - SIDE_Y);
    expect(state.ball.pos.y).toBeLessThan(SIDE_Y);
  });
});

describe('Anstoß', () => {
  it('Spielbeginn: Countdown, alle in der eigenen Hälfte, Ball am Mittelpunkt', () => {
    const state = createMatch(makeConfig());
    expect(state.phase).toBe(Phase.Kickoff);
    expect(state.ball.pos).toEqual(CENTER);
    expect(teamOf(state.ball.owner)).toBe(HOME);
    expect(state.players.every((p, i) => toWorld(teamOf(i), p.pos).x <= CENTER.x)).toBe(true);
    expect(run(state, 1).state.timeLeft).toBe(state.timeLeft);
  });

  it('nach einem Tor: Jubelpause, dann geordneter Anstoß für die andere Mannschaft', () => {
    const scored = runUntil(shotAt(CENTER.y), (s) => s.phase === Phase.Goal, ONE_SECOND);
    expect(scored.phase).toBe(Phase.Goal);
    const celebrating = run(scored, seconds(GOAL_PAUSE) - 1).state;
    expect(celebrating.phase).toBe(Phase.Goal);
    const kickoff = runUntil(celebrating, (s) => s.phase === Phase.Kickoff, ONE_SECOND);
    expect(kickoff.phase).toBe(Phase.Kickoff);
    expect(kickoff.restart).toEqual({ kind: RestartKind.Kickoff, team: AWAY });
    expect(kickoff.ball.pos).toEqual(CENTER);
    expect(teamOf(kickoff.ball.owner)).toBe(AWAY);
    expect(kickoff.players.every((p, i) => toWorld(teamOf(i), p.pos).x <= CENTER.x)).toBe(true);
    expect(kickoff.players.every((p) => p.stun === 0)).toBe(true);
    const playing = runUntil(kickoff, (s) => s.phase === Phase.Play, KICKOFF_STEPS);
    expect(playing.phase).toBe(Phase.Play);
    expect(playing.score).toEqual([1, 0]);
  });

  it('die Uhr steht während Jubel und Anstoß', () => {
    const scored = runUntil(shotAt(CENTER.y), (s) => s.phase === Phase.Goal, ONE_SECOND);
    const later = run(scored, seconds(GOAL_PAUSE)).state;
    expect(later.timeLeft).toBe(scored.timeLeft);
  });
});

describe('Spielende', () => {
  it('nach Ablauf der Spielzeit ist Schluss und der Zustand ändert sich nicht mehr', () => {
    const start = openPlay(CENTER, vec(0, 0), NONE, makeConfig({ durationSec: SHORT_MATCH }));
    const { state, events } = run(start, seconds(SHORT_MATCH) + EXTRA_STEPS);
    expect(state.phase).toBe(Phase.Ended);
    expect(state.timeLeft).toBe(0);
    expect(events.filter((e) => e.type === 'end')).toHaveLength(1);
    const after = run(state, EXTRA_STEPS, NO_INPUT).state;
    expect(after.tick).toBe(state.tick);
    expect(after.ball).toEqual(state.ball);
    expect(after.events).toHaveLength(0);
  });
});
