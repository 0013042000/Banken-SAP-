import { useState, type ReactElement } from 'react';
import { shortName, type Player } from '../../data/players';
import type { SquadOption } from '../../football/contract';
import {
  bestFive, FIELD_COUNT, fieldCandidates, hasKeeper, isPlayable, keeperCandidates, QUICK_SQUAD_ID, type Selection,
} from '../../football/lineup';
import { TEAM_SIZE } from '../../football/sim/index.ts';
import { Portrait } from '../Card';

interface Props {
  readonly squads: readonly SquadOption[];
  readonly squadId: string;
  readonly selection: Selection;
  readonly onSquad: (id: string) => void;
  readonly onSelection: (selection: Selection) => void;
  readonly onGoDraft: () => void;
  readonly onGoTeam: () => void;
}

const OWNER_LABEL: Readonly<Record<SquadOption['owner'], string>> = { semon: 'Semon', ariel: 'Ariel', bestand: 'Sofort spielbar' };
const KIND_LABEL: Readonly<Record<SquadOption['kind'], string>> = { team: 'Team', draft: 'Draft' };
const FULL_NOTICE = 'Es sind schon vier Feldspieler gewählt – tippe erst einen an, um ihn abzuwählen.';

interface TileProps {
  readonly player: Player;
  readonly picked: boolean;
  readonly onPick: () => void;
}

const PlayerTile = ({ player, picked, onPick }: TileProps): ReactElement => (
  <button type="button" className={`fb-pick${picked ? ' is-picked' : ''}`} aria-pressed={picked} onClick={onPick}>
    <Portrait player={player} className="fb-pick-portrait" />
    <span className="fb-pick-name">{shortName(player)}</span>
    <span className="fb-pick-meta">{player.pos} · {player.ovr}</span>
  </button>
);

/** Kaderwahl und Aufstellung der fünf Spieler (1 Torwart + 4 Feldspieler). */
export const TeamSetup = ({ squads, squadId, selection, onSquad, onSelection, onGoDraft, onGoTeam }: Props): ReactElement => {
  const [notice, setNotice] = useState('');
  const squad = squads.find((option) => option.id === squadId) ?? squads[squads.length - 1];
  const players = squad?.players ?? [];
  const ownPlayable = squads.some((option) => option.id !== QUICK_SQUAD_ID && isPlayable(option.players));
  const keepers = keeperCandidates(players);
  const field = fieldCandidates(players, selection.keeperId);
  const fieldFull = selection.fieldIds.length >= FIELD_COUNT;

  const pickKeeper = (id: string): void => {
    setNotice('');
    onSelection({
      keeperId: selection.keeperId === id ? null : id,
      fieldIds: selection.fieldIds.filter((fieldId) => fieldId !== id),
    });
  };

  const pickField = (id: string): void => {
    const chosen = selection.fieldIds.includes(id);
    if (!chosen && fieldFull) {
      setNotice(FULL_NOTICE);
      return;
    }
    setNotice('');
    onSelection({
      keeperId: selection.keeperId,
      fieldIds: chosen ? selection.fieldIds.filter((fieldId) => fieldId !== id) : [...selection.fieldIds, id],
    });
  };

  const chooseSquad = (id: string): void => {
    setNotice('');
    onSquad(id);
  };

  return (
    <>
      <section className="fb-panel" aria-label="Kader wählen">
        <h3 className="fb-panel-title">1. Kader wählen</h3>
        {!ownPlayable && (
          <div className="fb-empty">
            <p>Du hast noch keinen eigenen Kader mit mindestens fünf Spielern. Stell dir im Draft oder unter „Mein Team“ eine Mannschaft zusammen – oder leg mit der Schnellstart-Auswahl sofort los.</p>
            <div className="fb-row">
              <button type="button" className="btn btn-secondary" onClick={onGoDraft}>Zum Draft</button>
              <button type="button" className="btn btn-secondary" onClick={onGoTeam}>Zu Mein Team</button>
            </div>
          </div>
        )}
        <div className="fb-squads">
          {squads.map((option) => {
            const playable = isPlayable(option.players);
            return (
              <button
                key={option.id}
                type="button"
                className={`fb-squad${option.id === squad?.id ? ' is-picked' : ''}`}
                aria-pressed={option.id === squad?.id}
                disabled={!playable}
                onClick={() => chooseSquad(option.id)}
              >
                <span className="fb-squad-name">{option.label}</span>
                <span className="fb-squad-meta">
                  {OWNER_LABEL[option.owner]} · {KIND_LABEL[option.kind]} · {option.players.length} Spieler
                  {option.rating !== null && <> · Wertung {option.rating}</>}
                </span>
                {!playable && <span className="fb-squad-warn">Zu wenige Spieler ({option.players.length}/{TEAM_SIZE})</span>}
              </button>
            );
          })}
        </div>
      </section>

      <section className="fb-panel" aria-label="Aufstellung">
        <div className="fb-panel-head">
          <h3 className="fb-panel-title">2. Deine Fünf</h3>
          <button type="button" className="btn btn-chip" onClick={() => { setNotice(''); onSelection(bestFive(players)); }}>Beste Fünf</button>
        </div>
        <p className="fb-sub">1 Torwart + 4 Feldspieler – antippen zum Wählen und Abwählen.</p>

        <h4 className="fb-group">Tor <span>{selection.keeperId ? '1/1' : '0/1'}</span></h4>
        {!hasKeeper(players) && (
          <p className="fb-hint" role="note">Dieser Kader hat keinen Torwart. Wähle einen Feldspieler fürs Tor – er hält deutlich schwächer als ein echter Torwart.</p>
        )}
        <div className="fb-picks">
          {keepers.map((player) => (
            <PlayerTile key={player.id} player={player} picked={selection.keeperId === player.id} onPick={() => pickKeeper(player.id)} />
          ))}
        </div>

        <h4 className="fb-group">Feld <span>{selection.fieldIds.length}/{FIELD_COUNT}</span></h4>
        <div className="fb-picks">
          {field.map((player) => (
            <PlayerTile key={player.id} player={player} picked={selection.fieldIds.includes(player.id)} onPick={() => pickField(player.id)} />
          ))}
        </div>
        <p className="fb-notice" role="status">{notice}</p>
      </section>
    </>
  );
};
