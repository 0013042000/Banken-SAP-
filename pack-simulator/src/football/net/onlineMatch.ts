/**
 * Online-Spiel aus Sicht des Clients: Eingaben gehen an den Server, gezeigt wird ausschließlich,
 * was der Server schickt. Zwischen den Zustandsbildern wird für flüssige Bewegung überblendet.
 */
import type { MatchDriver } from '../match.ts';
import { blendFrames, type Frame, type SimEvent, type TeamId } from '../sim/index.ts';
import type { RoomClient, StartInfo } from './client.ts';

export interface OnlineMatch extends MatchDriver {
  /** Beginnt, Zustandsbilder vom Server anzunehmen. */
  readonly attach: () => void;
  readonly dispose: () => void;
}

interface Stamped {
  readonly at: number;
  readonly frame: Frame;
}

/** Die Anzeige läuft dem Empfang leicht hinterher, damit immer zwei Bilder zum Überblenden da sind. */
const INTERPOLATION_DELAY_MS = 100;
/** Eingaben gehen 30-mal pro Sekunde an den Server. */
const INPUT_INTERVAL_MS = 33;
const BUFFER_SIZE = 12;

export const createOnlineMatch = (client: RoomClient, start: StartInfo, seat: TeamId): OnlineMatch => {
  let buffer: readonly Stamped[] = [{ at: performance.now(), frame: start.frame }];
  let events: SimEvent[] = [];
  let lastSentAt = 0;

  const receive = (frame: Frame, fresh: readonly SimEvent[]): void => {
    buffer = [...buffer, { at: performance.now(), frame }].slice(-BUFFER_SIZE);
    events.push(...fresh);
  };

  const frameAt = (target: number): Frame => {
    const nextIndex = buffer.findIndex((entry) => entry.at > target);
    const newest = buffer[buffer.length - 1];
    if (nextIndex < 0) return newest.frame;
    if (!nextIndex) return buffer[0].frame;
    const from = buffer[nextIndex - 1];
    const to = buffer[nextIndex];
    return blendFrames(from.frame, to.frame, (target - from.at) / (to.at - from.at));
  };

  return {
    meta: { teams: start.teams, myTeam: seat, durationSec: start.duration },
    advance: (nowMs, sample): Frame => {
      if (nowMs - lastSentAt >= INPUT_INTERVAL_MS) {
        lastSentAt = nowMs;
        client.send({ t: 'input', input: sample() });
      }
      return frameAt(nowMs - INTERPOLATION_DELAY_MS);
    },
    drainEvents: (): readonly SimEvent[] => {
      const drained = events;
      events = [];
      return drained;
    },
    setPaused: (): void => undefined,
    attach: (): void => client.onSnapshot(receive),
    dispose: (): void => client.onSnapshot(null),
  };
};
