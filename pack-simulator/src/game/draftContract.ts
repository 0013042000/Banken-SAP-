import type { SquadOption } from '../football/contract';

/** Einstieg in den Hauptbereich „Draft“. */
export interface DraftHubProps {
  /** true, wenn Animationen ruhig bleiben sollen (Einstellung „Reduziert“ oder Systemvorgabe). */
  readonly reducedMotion: boolean;
  readonly muted: boolean;
  /** Fertigen Draft direkt im Fußballmodus verwenden; id entspricht SquadOption.id. */
  readonly onPlaySquad: (squadId: string) => void;
  /** Wird nach jeder gespeicherten Änderung an fertigen Drafts aufgerufen. */
  readonly onChanged: () => void;
}

/** Liefert alle fertigen Drafts als auswählbare Kader für den Fußballmodus. */
export type ListDraftSquads = () => SquadOption[];
