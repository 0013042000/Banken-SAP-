/**
 * Spielablauf für die Oberfläche: Ein MatchDriver liefert pro Bildschirmbild ein Frame.
 * Der lokale Treiber rechnet die Simulation selbst (gegen die KI), der Online-Treiber
 * (net/onlineMatch.ts) zeigt nur, was der Server schickt.
 */
import {
  blendFrames, createMatch, DT, frameOf, slotOf, step, teamOf,
  type Frame, type GoalRecord, type InputsByTeam, type MatchConfig, type Pair, type SimEvent, type TeamId,
  type TeamInput, type TeamSpec,
} from './sim/index.ts';

export interface MatchMeta {
  readonly teams: readonly [TeamSpec, TeamSpec];
  readonly myTeam: TeamId;
  readonly durationSec: number;
}

export interface MatchDriver {
  readonly meta: MatchMeta;
  /** Rückt die Zeit vor und liefert das Bild für jetzt. `sample` wird nur aufgerufen, wenn eine Eingabe gebraucht wird. */
  readonly advance: (nowMs: number, sample: () => TeamInput) => Frame;
  /** Ereignisse (für Ton und Einblendungen) seit dem letzten Aufruf. */
  readonly drainEvents: () => readonly SimEvent[];
  readonly setPaused: (paused: boolean) => void;
}

export interface LocalMatch extends MatchDriver {
  readonly score: () => Pair;
  readonly goals: () => readonly GoalRecord[];
}

export interface ScorerLine {
  readonly team: TeamId;
  readonly name: string;
  readonly own: boolean;
  /** Spielminute und -sekunde als Text, z. B. „1:24“. */
  readonly clock: string;
}

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const CLOCK_DIGITS = 2;
/** Nach einem Hänger (Tab im Hintergrund) wird höchstens so viel Zeit nachgeholt. */
const MAX_FRAME_MS = 100;
const TEST_SPEED_KEY = '__FB_TEST_SPEED__';
const MAX_TEST_SPEED = 30;

/** Uhrzeit-Anzeige „m:ss“ für eine Zeit in Sekunden. */
export const formatClock = (seconds: number): string => {
  const whole = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(whole / SECONDS_PER_MINUTE)}:${String(whole % SECONDS_PER_MINUTE).padStart(CLOCK_DIGITS, '0')}`;
};

/** Torschützenliste mit Namen aus den Aufstellungen. */
export const scorerLines = (goals: readonly GoalRecord[], teams: readonly [TeamSpec, TeamSpec]): readonly ScorerLine[] =>
  goals.map((goal) => ({
    team: goal.team,
    name: teams[teamOf(goal.player)].players[slotOf(goal.player)]?.name ?? '?',
    own: goal.own,
    clock: formatClock(Math.floor(goal.time)),
  }));

/**
 * Nur für automatische Browsertests: `window.__FB_TEST_SPEED__ = 8` lässt die Spieluhr schneller laufen.
 * Ohne diesen Wert läuft das Spiel in Echtzeit.
 */
const testSpeed = (): number => {
  const raw = (globalThis as Record<string, unknown>)[TEST_SPEED_KEY];
  return typeof raw === 'number' && raw >= 1 && raw <= MAX_TEST_SPEED ? raw : 1;
};

/** Spiel gegen die KI: fester Zeitschritt mit Akkumulator, Zwischenbilder für flüssige Darstellung. */
export const createLocalMatch = (config: MatchConfig, myTeam: TeamId): LocalMatch => {
  const speed = testSpeed();
  let state = createMatch(config);
  let previous = frameOf(state);
  let current = previous;
  let lastMs: number | null = null;
  let debt = 0;
  let paused = false;
  let events: SimEvent[] = [];

  const runSteps = (count: number, input: TeamInput): void => {
    const inputs: InputsByTeam = myTeam ? [null, input] : [input, null];
    Array.from({ length: count }).forEach(() => {
      previous = current;
      state = step(state, inputs);
      current = frameOf(state);
      events.push(...state.events);
    });
  };

  return {
    meta: { teams: [state.config.teams[0], state.config.teams[1]], myTeam, durationSec: state.config.durationSec },
    advance: (nowMs, sample): Frame => {
      const elapsedMs = lastMs === null || paused ? 0 : Math.min(nowMs - lastMs, MAX_FRAME_MS);
      lastMs = nowMs;
      debt += (elapsedMs / MS_PER_SECOND) * speed;
      const count = Math.floor(debt / DT);
      if (count) {
        runSteps(count, sample());
        debt -= count * DT;
      }
      return blendFrames(previous, current, debt / DT);
    },
    drainEvents: (): readonly SimEvent[] => {
      const drained = events;
      events = [];
      return drained;
    },
    setPaused: (next: boolean): void => { paused = next; },
    score: (): Pair => state.score,
    goals: (): readonly GoalRecord[] => state.goals,
  };
};
