import { useState, type ReactElement } from 'react';
import { shortName, type Player } from '../data/players';
import { canPlace, fits, FORMATIONS, ROLE_LABEL, slotIndexOf, type SlotRole, type Team } from '../game/team';
import { Portrait } from './Card';
import { Modal } from './Modal';

/** Kompakte Zeile mit Porträt, Name, Position und Bewertung – für Listen und Vergleiche. */
export const PlayerRow = ({ player, children, note }: { readonly player: Player; readonly children?: ReactElement | null; readonly note?: ReactElement | string | null }): ReactElement => (
  <div className={`pick-row pick-${player.cat}`}>
    <Portrait player={player} className="pick-img" />
    <div className="pick-info">
      <div className="pick-name">{player.name}</div>
      <div className="pick-meta">{player.pos}{note ? <> · {note}</> : null}</div>
    </div>
    <div className="pick-ovr" aria-label={`Bewertung ${player.ovr}`}>{player.ovr}</div>
    {children}
  </div>
);

export const FitTag = ({ player, role }: { readonly player: Player; readonly role: SlotRole }): ReactElement =>
  fits(player, role) ? <span className="tag tag-fit">passt</span> : <span className="tag tag-off">positionsfremd</span>;

interface PickerProps {
  readonly player: Player;
  readonly team: Team;
  readonly lookup: (id: string) => Player | undefined;
  readonly onPlace: (slotIndex: number) => void;
  readonly onClose: () => void;
}

/** „Ins Team“: Platz für einen Spieler wählen; bei besetztem Platz erst Vergleich, dann Bestätigung. */
export const SlotPicker = ({ player, team, lookup, onPlace, onClose }: PickerProps): ReactElement => {
  const [target, setTarget] = useState<number | null>(null);
  const slots = FORMATIONS[team.formation];
  const currentIndex = slotIndexOf(team, player.id);
  const order = slots.map((slot, i) => ({ slot, i })).filter(({ slot }) => canPlace(player, slot.role))
    .sort((a, b) => Number(fits(player, b.slot.role)) - Number(fits(player, a.slot.role)) || a.i - b.i);

  if (target !== null) {
    const slot = slots[target]!;
    const occupant = team.lineup[target] ? lookup(team.lineup[target]!) : undefined;
    const swap = currentIndex >= 0;
    return (
      <Modal title={swap ? 'Spieler tauschen?' : 'Spieler ersetzen?'} onClose={onClose}>
        <p className="modal-text">Platz: <strong>{ROLE_LABEL[slot.role]}</strong></p>
        {occupant && (<><div className="compare-label">Aktuell</div><PlayerRow player={occupant} note={<FitTag player={occupant} role={slot.role} />} /></>)}
        <div className="compare-label">Neu</div>
        <PlayerRow player={player} note={<FitTag player={player} role={slot.role} />} />
        {occupant && swap && <p className="modal-text">{shortName(occupant)} wechselt dafür auf „{ROLE_LABEL[slots[currentIndex]!.role]}“.</p>}
        {occupant && !swap && <p className="modal-text">{shortName(occupant)} bleibt in deiner Sammlung.</p>}
        {!fits(player, slot.role) && <p className="modal-hint">Positionsfremd: Die Kartenbewertung bleibt unverändert.</p>}
        <div className="modal-actions">
          <button type="button" className="btn btn-primary" onClick={() => onPlace(target)}>{swap ? 'Tauschen' : 'Ersetzen'}</button>
          <button type="button" className="btn btn-ghost" onClick={() => setTarget(null)}>Zurück</button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title={`${shortName(player)} ins Team`} onClose={onClose}>
      <PlayerRow player={player} note={currentIndex >= 0 ? <span className="tag tag-in">im Team: {slots[currentIndex]!.role}</span> : null} />
      <p className="modal-text">
        {currentIndex >= 0 ? 'Wähle einen Platz zum Verschieben oder Tauschen.' : 'Wähle einen Platz in der Aufstellung.'}
        {player.pos === 'TW' ? ' Torhüter können nur im Tor stehen.' : ''}
      </p>
      <div className="slot-list">
        {order.map(({ slot, i }) => {
          const occupant = team.lineup[i] ? lookup(team.lineup[i]!) : undefined;
          const isCurrent = i === currentIndex;
          return (
            <button key={slot.id} type="button" className="slot-option" disabled={isCurrent}
              onClick={() => { if (occupant) setTarget(i); else onPlace(i); }}>
              <span className="slot-option-role">{slot.role}</span>
              <span className="slot-option-info">
                <span className="slot-option-name">{ROLE_LABEL[slot.role]}</span>
                <span className="slot-option-sub">{isCurrent ? 'steht hier bereits' : occupant ? `besetzt: ${shortName(occupant)} (${occupant.ovr})` : 'frei'}</span>
              </span>
              <FitTag player={player} role={slot.role} />
            </button>
          );
        })}
      </div>
    </Modal>
  );
};
