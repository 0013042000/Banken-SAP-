/** Öffentliche Schnittstelle der Simulation – läuft unverändert im Browser und im Node-Server. */
export * from './constants.ts';
export { createMatch } from './formation.ts';
export { step } from './step.ts';
export { blendFrames, frameOf } from './frame.ts';
export type { Frame, FrameBall, FramePlayer } from './frame.ts';
export { isNearestToBall } from './control.ts';
export { cleanName, InvalidMatchConfigError, NEUTRAL_INPUT, sanitizeInput, sanitizeSpec, sanitizeTeam } from './validate.ts';
export { ALL_PLAYERS, isKeeper, nearestFieldPlayer, Phase, RestartKind, slotOf, TEAM_IDS, teamOf } from './model.ts';
export type {
  Control, Difficulty, GoalRecord, InputsByTeam, MatchConfig, MatchState, MatchStats, Pair, PlayerSpec,
  PlayerState, RestartInfo, SimEvent, TeamId, TeamInput, TeamSetup, TeamSpec,
} from './model.ts';
export { maxSpeed } from './tuning.ts';
export { vec } from './vec.ts';
export type { Vec } from './vec.ts';
