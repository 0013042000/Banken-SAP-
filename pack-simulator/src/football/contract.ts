import type { Player } from '../data/players';

/** Lokale Profile – es gibt keine Registrierung. */
export type ProfileId = 'semon' | 'ariel';

/** Ein Kader, aus dem für ein Spiel fünf Spieler (1 Torwart + 4 Feldspieler) gewählt werden. */
export interface SquadOption {
  /** Stabile Kennung, z. B. "team:semon" oder "draft:abc123". */
  readonly id: string;
  /** Anzeigename, z. B. "Semons Team" oder "Legenden-Draft · 4-3-3". */
  readonly label: string;
  readonly owner: ProfileId | 'bestand';
  readonly kind: 'team' | 'draft';
  /** Teamwertung (gerundeter Durchschnitt) oder null. */
  readonly rating: number | null;
  /** Alle verfügbaren Spieler des Kaders (0 bis 23, jede Person höchstens einmal). */
  readonly players: readonly Player[];
}

/** Einstieg in den Bereich „Spielen“ (Fußball gegen KI und Online-Raum). */
export interface PlayHubProps {
  readonly squads: readonly SquadOption[];
  /** Kader, der beim Öffnen vorausgewählt sein soll (z. B. frisch fertiggestellter Draft). */
  readonly preselectSquadId?: string | null;
  readonly muted: boolean;
  readonly onGoDraft: () => void;
  readonly onGoTeam: () => void;
}
