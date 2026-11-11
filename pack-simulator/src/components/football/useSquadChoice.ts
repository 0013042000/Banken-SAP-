import { useMemo, useState } from 'react';
import type { Player } from '../../data/players';
import type { SquadOption } from '../../football/contract';
import { bestFive, isPlayable, QUICK_SQUAD, selectedPlayers, type Selection } from '../../football/lineup';

export interface SquadChoice {
  /** Eigene Kader plus die eingebaute Schnellstart-Auswahl. */
  readonly squads: readonly SquadOption[];
  readonly squad: SquadOption;
  readonly selection: Selection;
  /** Die fünf gewählten Karten (Torwart zuerst) oder null, solange die Aufstellung unvollständig ist. */
  readonly five: readonly Player[] | null;
  readonly setSquadId: (id: string) => void;
  readonly setSelection: (selection: Selection) => void;
}

const idsExist = (players: readonly Player[], selection: Selection): boolean => {
  const known = new Set(players.map((p) => p.id));
  const keeperOk = selection.keeperId === null || known.has(selection.keeperId);
  return keeperOk && selection.fieldIds.every((id) => known.has(id));
};

/**
 * Merkt sich Kader und Aufstellung. Ohne eigene Wahl gilt der vorausgewählte Kader
 * (z. B. ein frisch fertiggestellter Draft), sonst der erste spielbare, sonst der Schnellstart.
 */
export const useSquadChoice = (own: readonly SquadOption[], preselectId: string | null | undefined): SquadChoice => {
  const [chosenId, setChosenId] = useState<string | null>(null);
  const [picks, setPicks] = useState<Readonly<Record<string, Selection>>>({});
  const squads = useMemo(() => [...own, QUICK_SQUAD], [own]);

  return useMemo(() => {
    const playable = squads.filter((option) => isPlayable(option.players));
    const automatic = playable.find((option) => option.id === preselectId) ?? playable[0] ?? QUICK_SQUAD;
    const squad = playable.find((option) => option.id === chosenId) ?? automatic;
    const stored = picks[squad.id];
    const selection = stored && idsExist(squad.players, stored) ? stored : bestFive(squad.players);
    return {
      squads,
      squad,
      selection,
      five: selectedPlayers(squad.players, selection),
      setSquadId: setChosenId,
      setSelection: (next: Selection): void => setPicks((current) => ({ ...current, [squad.id]: next })),
    };
  }, [squads, preselectId, chosenId, picks]);
};
