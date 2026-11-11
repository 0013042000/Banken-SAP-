import type { ReactElement } from 'react';
import { PROFILE_LABEL, SQUAD_SIZE, START_SIZE, VARIANTS } from '../../game/draft/config';
import {
  draftedCount, exactCountOf, playerAt, slotInfo, squadRatingOf, teamRatingOf, type RatingInfo, type SlotRef, type Squad,
} from '../../game/draft/engine';
import { Card } from '../Card';
import { Modal } from '../Modal';

interface HeaderProps {
  readonly squad: Squad;
}

interface PeekProps {
  readonly squad: Squad;
  readonly slot: SlotRef;
  readonly onClose: () => void;
}

const NO_RATING = '—';
const ratingLabel = (name: string, info: RatingInfo): string => (info.count && info.provisional ? `${name} (vorläufig)` : name);

/** Immer sichtbare Kopfzeile: Profil, Variante, Formation, Fortschritt, Team- und Kaderwertung, Positionspassung. */
export const SquadHeader = ({ squad }: HeaderProps): ReactElement => {
  const team = teamRatingOf(squad);
  const all = squadRatingOf(squad);
  const count = draftedCount(squad);
  return (
    <div className="dr-header">
      <div className="dr-chips">
        <span className="dr-chip">👤 {PROFILE_LABEL[squad.profile]}</span>
        <span className={`dr-chip dr-chip-${squad.variant}`}>{VARIANTS[squad.variant].label}</span>
        <span className="dr-chip">{squad.formation}</span>
      </div>
      <div className="team-stats">
        <div className="team-stat"><b>{team.rating ?? NO_RATING}</b><span>{ratingLabel('Teamwertung', team)}</span></div>
        <div className="team-stat"><b>{all.rating ?? NO_RATING}</b><span>{ratingLabel('Kaderwertung', all)}</span></div>
        <div className="team-stat"><b>{count}/{SQUAD_SIZE}</b><span>Spieler gewählt</span></div>
      </div>
      <div className="dr-progress" role="progressbar" aria-label="Fortschritt des Drafts" aria-valuemin={0} aria-valuemax={SQUAD_SIZE} aria-valuenow={count}>
        <div className="dr-progress-fill" style={{ transform: `scaleX(${count / SQUAD_SIZE})` }} />
      </div>
      <p className="dr-fit">
        <b>{exactCountOf(squad)}/{START_SIZE} auf exakter Position</b> – also genau auf der Position, die auf der Karte steht.
      </p>
      <details className="dr-info">
        <summary>Was bedeuten die Zahlen?</summary>
        <p>Teamwertung: Durchschnitt der Bewertungen deiner Startelf, gerundet. Solange Plätze frei sind, ist sie vorläufig.</p>
        <p>Kaderwertung: Durchschnitt aller Spieler, die du bisher gewählt hast.</p>
        <p>Exakte Position: Verwandte Positionen passen auch auf einen Platz, zählen hier aber nicht mit. Die Bewertung der Karte bleibt immer gleich.</p>
      </details>
    </div>
  );
};

/** Karte eines bereits gewählten Spielers in Ruhe ansehen. */
export const PlayerPeek = ({ squad, slot, onClose }: PeekProps): ReactElement | null => {
  const p = playerAt(squad, slot);
  const info = slotInfo(squad.formation, slot);
  if (!p || !info) return null;
  return (
    <Modal title={info.label} onClose={onClose}>
      <div className="dr-detail">
        <Card player={p} size="md" />
        <p className="dr-cand-note">{p.id === squad.captainId ? 'Kapitän · ' : ''}fest gewählt</p>
        <button type="button" className="btn btn-ghost btn-big" onClick={onClose}>Schließen</button>
      </div>
    </Modal>
  );
};
