/** Feste Größen der Simulation. Längen in Feld-Einheiten (≈ Meter), Zeiten in Sekunden. */
import type { Vec } from './vec.ts';

export const HALF = 0.5;
export const NONE = -1;

export const TICKS_PER_SECOND = 60;
export const DT = 1 / TICKS_PER_SECOND;
export const TEAM_SIZE = 5;
export const PLAYER_COUNT = TEAM_SIZE + TEAM_SIZE;

export const PITCH_W = 100;
export const PITCH_H = 62;
export const CENTER: Vec = Object.freeze({ x: PITCH_W * HALF, y: PITCH_H * HALF });
export const GOAL_HALF = 7.5;
export const GOAL_Y0 = CENTER.y - GOAL_HALF;
export const GOAL_Y1 = CENTER.y + GOAL_HALF;
export const GOAL_DEPTH = 3.6;
export const POST_R = 0.45;
export const BOX_DEPTH = 15;
export const BOX_HALF = 17;
export const CENTER_R = 9;

export const PLAYER_R = 1.5;
export const BALL_R = 0.72;

export const KICKOFF_COUNTDOWN = 3;
export const KICKOFF_AFTER_GOAL = 1.6;
export const GOAL_PAUSE = 2;
export const RESTART_PAUSE = 1;

const ONE_MINUTE = 60;
const THREE_MINUTES = 180;
const FIVE_MINUTES = 300;
/** Wählbare Spielzeiten in Sekunden. */
export const DURATIONS: readonly number[] = Object.freeze([ONE_MINUTE, THREE_MINUTES, FIVE_MINUTES]);
export const DEFAULT_DURATION = THREE_MINUTES;

export const NAME_MAX = 24;
export const ID_MAX = 32;
export const STAT_MIN = 1;
export const STAT_MAX = 99;
