/** Sichtbarer Ausschnitt des Spielzustands: genug zum Zeichnen, klein genug zum Versenden. */
import type { MatchState, Pair, Phase, RestartInfo } from './model.ts';
import { dist, lerp, mix, unit, type Vec } from './vec.ts';

export interface FramePlayer {
  readonly pos: Vec;
  readonly dir: Vec;
  readonly dazed: boolean;
}

export interface FrameBall {
  readonly pos: Vec;
  readonly z: number;
  readonly owner: number;
  readonly held: boolean;
}

export interface Frame {
  readonly tick: number;
  readonly phase: Phase;
  readonly phaseTime: number;
  readonly timeLeft: number;
  readonly score: Pair;
  readonly ball: FrameBall;
  readonly players: readonly FramePlayer[];
  readonly controlled: Pair;
  readonly restart: RestartInfo;
}

/** Größere Sprünge (Neustart, Anstoß) werden nicht überblendet, sondern sofort gezeigt. */
const TELEPORT_DISTANCE = 6;

export const frameOf = (state: MatchState): Frame => ({
  tick: state.tick,
  phase: state.phase,
  phaseTime: state.phaseTime,
  timeLeft: state.timeLeft,
  score: state.score,
  ball: { pos: state.ball.pos, z: state.ball.z, owner: state.ball.owner, held: state.ball.held },
  players: state.players.map((p) => ({ pos: p.pos, dir: p.dir, dazed: p.stun > 0 })),
  controlled: state.controlled,
  restart: state.restart,
});

const blendPos = (a: Vec, b: Vec, t: number): Vec => (dist(a, b) > TELEPORT_DISTANCE ? b : lerp(a, b, t));

/** Zwischenbild zwischen zwei Zuständen (t = 0 → a, t = 1 → b) für flüssige Darstellung. */
export const blendFrames = (a: Frame, b: Frame, t: number): Frame => ({
  ...b,
  ball: { ...b.ball, pos: blendPos(a.ball.pos, b.ball.pos, t), z: mix(a.ball.z, b.ball.z, t) },
  players: b.players.map((p, i) => {
    const from = a.players[i] ?? p;
    return { ...p, pos: blendPos(from.pos, p.pos, t), dir: unit(lerp(from.dir, p.dir, t), p.dir) };
  }),
});
