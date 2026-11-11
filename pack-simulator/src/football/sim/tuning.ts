/**
 * Stellschrauben des Spielgefühls. Spielerwerte wirken bewusst nur in engen Bändern,
 * damit ein höher bewertetes Team nicht automatisch gewinnt.
 */
import { BALL_R, PLAYER_R } from './constants.ts';
import { skill, type PlayerSpec } from './model.ts';

// ---- Bewegung ----
/** Grundtempo eines Feldspielers (Einheiten pro Sekunde). */
export const BASE_SPEED = 19;
/** Tempo-Band: langsamster Spieler 93 %, schnellster 107 % des Grundtempos. */
export const SPEED_FLOOR = 0.93;
export const SPEED_SPAN = 0.14;
export const KEEPER_SPEED_BASE = 13;
export const KEEPER_SPEED_SPAN = 6;
export const ACCEL = 10;
export const TURN_RATE = 16;
export const FACE_DEAD = 0.2;
export const FACE_SPEED = 1.5;
/** Mit Ball ist man etwas langsamer; gute Dribbler verlieren weniger Tempo. */
export const CARRY_FLOOR = 0.82;
export const CARRY_SPAN = 0.07;
export const STUN_SPEED = 0.3;
export const PLAYER_MARGIN = 0.8;
export const BODY_GAP = 2.8;
export const ARRIVE_STOP = 0.4;
export const ARRIVE_RADIUS = 2.5;

// ---- Ballführung ----
export const CARRY_DIST = 1.95;
export const CARRY_RATE = 13;
export const CARRY_RATE_SPAN = 11;
export const HAND_DIST = 0.9;
export const HAND_Z = 1.1;

// ---- Ballphysik ----
export const DRAG = 0.5;
export const AIR_DRAG = 0.18;
export const GRAVITY = 22;
export const GROUND_Z = 0.05;
export const BOUNCE = 0.45;
export const BOUNCE_MIN = 1.2;
export const STOP_SPEED = 0.6;
export const SUBSTEP_LENGTH = 0.45;
export const POST_KEEP = 0.6;
export const POST_HEIGHT = 2.6;
export const NET_DRAG = 9;
/** Ab dieser Höhe fliegt der Ball über die Spieler hinweg. */
export const OVERHEAD_Z = 2;
const PICKUP_SLACK = 0.25;
export const PICKUP_DIST = PLAYER_R + BALL_R + PICKUP_SLACK;
export const CONTROL_SPEED = 38;
export const CONTROL_SPEED_SPAN = 12;
export const DEFLECT_KEEP = 0.35;
export const DEFLECT_LOCK = 0.25;
export const TRAP_PROTECT = 0.25;
/** Nach der Ballannahme braucht die KI einen Moment, bevor sie weiterspielt. */
export const FIRST_TOUCH = 0.5;
export const KICK_LOCK = 0.3;

// ---- Pass ----
export const PASS_ARRIVE = 22;
export const PASS_MIN = 26;
export const PASS_MAX = 52;
export const PASS_LEAD_SPEED = 32;
export const PASS_LEAD = 0.75;
export const PASS_ERR_MIN = 0.015;
export const PASS_ERR_SPAN = 0.07;
export const FREE_KICK_SPEED = 34;
export const LOB_SPEED = 27;
export const LOB_TIME_MIN = 0.6;
export const LOB_TIME_MAX = 1.5;
/** Passwahl des Menschen: Blickrichtung zählt am meisten. */
export const AIM_WEIGHT = 40;
export const AIM_MIN_COS = 0.25;
export const PASS_IDEAL = 22;
export const DIST_WEIGHT = 0.4;
export const BLOCK_PENALTY = 25;
export const KEEPER_PENALTY = 18;
export const LANE_WIDTH = 2.4;

// ---- Schuss ----
export const SHOT_BASE = 55;
export const SHOT_SPAN = 17;
export const SHOT_ERR_MIN = 0.03;
export const SHOT_ERR_SPAN = 0.08;
export const SHOT_LIFT = 4;
export const ASSIST_MIN_FORWARD = 0.15;
export const ASSIST_REACH = 12;
export const ASSIST_INSET = 1.4;

// ---- Zweikampf ----
const STEAL_SLACK = 0.4;
export const STEAL_DIST = PLAYER_R + BALL_R + STEAL_SLACK;
export const LUNGE_RANGE = 5.2;
export const LUNGE_BONUS = 0.12;
export const LUNGE_DASH = 1.7;
export const LUNGE_COOL = 0.7;
export const TACKLE_BASE = 0.5;
export const TACKLE_SKILL = 0.3;
export const TACKLE_BODY = 0.1;
export const TACKLE_MIN = 0.15;
export const TACKLE_MAX = 0.82;
export const TACKLE_FAIL_STUN = 0.55;
export const TACKLE_WIN_STUN = 0.45;
export const TACKLE_COOL = 0.9;
export const WIN_PROTECT = 0.35;

// ---- Torwart ----
export const KEEPER_REACH_MIN = 0.9;
export const KEEPER_REACH_SPAN = 1.1;
export const KEEPER_REACT_MAX = 0.24;
export const KEEPER_REACT_SPAN = 0.12;
export const KEEPER_ALERT_SPEED = 12;
export const KEEPER_LOOKAHEAD = 1.6;
export const KEEPER_Y_MARGIN = 3;
export const KEEPER_CLAIM_SPEED = 14;
export const KEEPER_CLAIM_MARGIN = 2;
export const KEEPER_OUT = 3.2;
export const KEEPER_MIN_X = 1.2;
export const KEEPER_MAX_X = 6;
export const KEEPER_POST_GAP = 0.8;
export const KEEPER_HOLD = 1.1;
export const KEEPER_EASY_SPEED = 24;
export const SAVE_BASE = 0.7;
export const SAVE_SKILL = 0.32;
export const SAVE_POWER = 0.24;
export const SAVE_MIN = 0.25;
export const SAVE_MAX = 0.95;
export const POWER_FLOOR = 30;
export const POWER_RANGE = 40;
export const CATCH_BASE = 0.45;
export const CATCH_SKILL = 0.35;
export const CATCH_POWER = 0.35;
export const PARRY_SPEED = 0.45;
export const PARRY_SIDE = 0.9;
export const PARRY_LOCK = 0.45;
export const KEEPER_THROW_IDEAL = 28;
export const KEEPER_THROW_OPEN = 1.5;
export const KEEPER_THROW_DIST = 0.3;

// ---- Neustart ----
export const RESTART_PROTECT = 1.3;
export const RESTART_DISTANCE = 9;
export const BOX_CLEARANCE = 3;
export const CORNER_INSET = 0.9;
export const LINE_INSET = 0.9;
export const KICKIN_MARGIN = 2;
export const GOAL_KICK_X = 5;

// ---- Grundordnung ----
export const KEEPER_X = 3;
export const BACK_X = 25;
export const MID_X = 43;
export const FRONT_X = 62;
export const WING_OFFSET = 17;
export const KICKOFF_BACK_X = 24;
export const KICKOFF_MID_X = 38;
export const KICKOFF_WING = 13;
export const KICKOFF_GAP = 2;
export const FOLLOW_X = 0.55;
export const FOLLOW_Y = 0.3;
export const LEAN_ATTACK = 7;
export const LEAN_DEFEND = -5;
export const HOME_MIN_X = 8;
export const HOME_MAX_X = 90;
export const HOME_MARGIN = 4;

// ---- KI ----
export const OPEN_CAP = 12;
export const INTERCEPT_STEP = 0.1;
export const INTERCEPT_SAMPLES = 24;
export const HUMAN_FAR = 22;
export const PRESS_LEAD = 0.15;
export const CONTAIN_DIST = 6.5;
export const MARK_GAP = 3.5;
export const MARK_BLEND = 0.6;
export const BACK_GAP = 12;
export const BACK_MIN_X = 16;
export const MID_AHEAD = 6;
export const FRONT_AHEAD = 13;
export const SUPPORT_MAX_X = 91;
export const WOBBLE_RATE_X = 0.021;
export const WOBBLE_RATE_Y = 0.017;
export const WOBBLE_PHASE = 2.1;
export const WOBBLE_X = 5;
export const WOBBLE_Y = 6;
export const UNMARK_DIST = 4.5;
export const UNMARK_SHIFT = 4;
export const AVOID_RANGE = 10;
export const AVOID_GAIN = 1.3;
export const EDGE_ZONE = 6;
export const EDGE_PUSH = 0.8;
export const THINK_MIN = 0.8;
export const THINK_VAR = 0.4;
export const PRESSURE_DIST = 4.5;
export const HOLD_LIMIT = 4.5;
export const PROTECT_PASS = 0.5;
export const PASS_OK = 8;
export const PASS_GOOD = 16;
export const PASS_PROGRESS = 10;
export const W_PROGRESS = 0.6;
export const W_OPEN = 1.2;
export const W_LANE = 8;
export const W_BLOCKED = 30;
export const PASS_FAR = 45;
export const W_FAR = 15;
export const PASS_NEAR = 8;
export const W_NEAR = 10;
export const SHOT_SURE_RANGE = 15;
export const SHOT_CLEAR_CHANCE = 0.55;
export const SHOT_BLOCKED_CHANCE = 0.12;
export const SHOT_LANE = 2.2;
export const SHOT_MIN_DEPTH = 4;
export const AI_CORNER_INSET = 1.8;
export const STICK_DEAD = 0.25;

/** Stärke der KI je Schwierigkeit. */
export interface AiTuning {
  /** Faktor auf das Lauftempo der KI-Mannschaft. */
  readonly speed: number;
  /** Sekunden zwischen zwei Entscheidungen am Ball. */
  readonly think: number;
  /** Faktor auf die Schussstreuung. */
  readonly shotError: number;
  /** Wahrscheinlichkeit, einen guten Pass nach vorn auch ohne Druck zu spielen. */
  readonly passEager: number;
  /** Aufschlag auf die Zweikampfchance. */
  readonly tackle: number;
  readonly shootRange: number;
  /** Zweiter Mann rückt beim Pressing nach. */
  readonly doublePress: boolean;
  /** Bis zu dieser Tiefe (eigene Koordinaten) wird der Ballführende angelaufen. */
  readonly pressLine: number;
}

const EASY_SPEED = 0.89;
const EASY_THINK = 0.55;
const EASY_SHOT_ERROR = 2.4;
const EASY_PASS_EAGER = 0.1;
const EASY_TACKLE = -0.12;
const EASY_SHOOT_RANGE = 23;
const EASY_PRESS_LINE = 58;
const MEDIUM_SPEED = 0.96;
const MEDIUM_THINK = 0.34;
const MEDIUM_SHOT_ERROR = 1.5;
const MEDIUM_PASS_EAGER = 0.18;
const MEDIUM_TACKLE = -0.03;
const MEDIUM_SHOOT_RANGE = 27;
const MEDIUM_PRESS_LINE = 80;
const HARD_THINK = 0.2;
const HARD_PASS_EAGER = 0.28;
const HARD_TACKLE = 0.04;
const HARD_SHOOT_RANGE = 30;
const HARD_PRESS_LINE = 100;

/** Index = Schwierigkeit (0 Leicht, 1 Mittel, 2 Schwer). */
export const AI_LEVELS: readonly AiTuning[] = Object.freeze([
  {
    speed: EASY_SPEED, think: EASY_THINK, shotError: EASY_SHOT_ERROR, passEager: EASY_PASS_EAGER,
    tackle: EASY_TACKLE, shootRange: EASY_SHOOT_RANGE, doublePress: false, pressLine: EASY_PRESS_LINE,
  },
  {
    speed: MEDIUM_SPEED, think: MEDIUM_THINK, shotError: MEDIUM_SHOT_ERROR, passEager: MEDIUM_PASS_EAGER,
    tackle: MEDIUM_TACKLE, shootRange: MEDIUM_SHOOT_RANGE, doublePress: true, pressLine: MEDIUM_PRESS_LINE,
  },
  {
    speed: 1, think: HARD_THINK, shotError: 1, passEager: HARD_PASS_EAGER,
    tackle: HARD_TACKLE, shootRange: HARD_SHOOT_RANGE, doublePress: true, pressLine: HARD_PRESS_LINE,
  },
]);

/** Mitspieler eines Menschen: volles Tempo, mittlere Spielintelligenz. */
export const MATE_TUNING: AiTuning = Object.freeze({
  speed: 1, think: MEDIUM_THINK, shotError: 1, passEager: MEDIUM_PASS_EAGER,
  tackle: 0, shootRange: MEDIUM_SHOOT_RANGE, doublePress: false, pressLine: HARD_PRESS_LINE,
});

/** Höchsttempo eines Feldspielers: Tempo wirkt nur in einem engen Band (±7 %). */
export const maxSpeed = (spec: PlayerSpec): number => BASE_SPEED * (SPEED_FLOOR + SPEED_SPAN * skill(spec.pace));

export const keeperSpeed = (spec: PlayerSpec): number => KEEPER_SPEED_BASE + KEEPER_SPEED_SPAN * skill(spec.keeping);

/** Reichweite, in der ein Torwart im eigenen Strafraum an den Ball kommt. */
export const keeperReach = (spec: PlayerSpec): number =>
  PICKUP_DIST + KEEPER_REACH_MIN + KEEPER_REACH_SPAN * skill(spec.keeping);
