import { useCallback, useState, type MouseEvent, type ReactElement } from 'react';
import type { Player } from '../../data/players';
import { Card } from '../Card';
import { Modal } from '../Modal';
import { boxOf, type Box } from './texts';

interface Props {
  readonly title: string;
  readonly intro: string;
  readonly candidates: readonly Player[];
  /** Kurzer Hinweis je Kandidat, z. B. „Stammposition“. */
  readonly noteOf: (p: Player) => string;
  readonly confirmLabel: string;
  /** Gestaffelte Enthüllung beim ersten Aufdecken; aus bei reduzierter Bewegung. */
  readonly reveal: boolean;
  readonly onLook: () => void;
  readonly onConfirm: (player: Player, from: Box | null) => void;
  readonly onClose: () => void;
}

interface Focus {
  readonly id: string;
  /** Zeitpunkt des Antippens – schützt vor einem Doppeltipp, der sonst sofort bestätigen würde. */
  readonly at: number;
}

const STAGGER_MS = 90;
const CONFIRM_GUARD_MS = 350;

/**
 * Auswahl aus einem Angebot: fünf Karten zum Wischen, Antippen zeigt eine Karte groß,
 * erst die ausdrückliche Bestätigung legt den Spieler fest.
 */
export const OfferSheet = ({ title, intro, candidates, noteOf, confirmLabel, reveal, onLook, onConfirm, onClose }: Props): ReactElement => {
  const [focus, setFocus] = useState<Focus | null>(null);
  const focusOnMount = useCallback((el: HTMLElement | null) => { el?.focus({ preventScroll: true }); }, []);
  const chosen = focus ? candidates.find((p) => p.id === focus.id) : undefined;

  const confirm = (e: MouseEvent<HTMLButtonElement>): void => {
    if (!chosen || !focus || e.timeStamp - focus.at < CONFIRM_GUARD_MS) return;
    onConfirm(chosen, boxOf(e.currentTarget.closest('.dr-detail')?.querySelector('.card')));
  };

  return (
    <Modal title={title} onClose={onClose}>
      {chosen ? (
        <div className="dr-detail" tabIndex={-1} ref={focusOnMount} aria-label={`${chosen.name} groß ansehen`}>
          <Card player={chosen} size="lg" />
          <p className="dr-cand-note">{noteOf(chosen)}</p>
          <button type="button" className="btn btn-primary btn-big" onClick={confirm}>{confirmLabel}</button>
          <button type="button" className="btn btn-ghost btn-big" onClick={() => setFocus(null)}>Zurück zur Auswahl</button>
          <p className="dr-fine">Erst mit „{confirmLabel}“ ist die Wahl fest. Danach lässt sie sich nicht mehr ändern.</p>
        </div>
      ) : (
        <>
          <p className="modal-text">{intro}</p>
          <div className="dr-cands" role="list" aria-label={`${candidates.length} Kandidaten`}>
            {candidates.map((p, i) => (
              <div key={p.id} role="listitem" className={`dr-cand-item${reveal ? ' dr-reveal' : ''}`} style={{ animationDelay: `${i * STAGGER_MS}ms` }}>
                <button type="button" className="dr-cand" aria-label={`${p.name}, ${p.pos}, Bewertung ${p.ovr}. Antippen, um die Karte groß zu sehen.`}
                  onClick={(e) => { onLook(); setFocus({ id: p.id, at: e.timeStamp }); }}>
                  <Card player={p} size="md" />
                </button>
                <span className="dr-cand-note">{i + 1}/{candidates.length} · {noteOf(p)}</span>
              </div>
            ))}
          </div>
          <p className="dr-fine">👉 Wische zur Seite, um alle {candidates.length} Karten zu sehen. Antippen zeigt die Karte groß – gewählt wird erst danach.</p>
          <button type="button" className="btn btn-ghost" onClick={onClose}>Erst das Team ansehen</button>
        </>
      )}
    </Modal>
  );
};
