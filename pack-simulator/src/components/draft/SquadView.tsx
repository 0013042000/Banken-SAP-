import { useState, type ReactElement } from 'react';
import { PROFILE_LABEL } from '../../game/draft/config';
import type { SlotRef } from '../../game/draft/engine';
import type { FinishedDraft } from '../../game/draft/store';
import { SquadField, type SlotMark } from './SquadField';
import { PlayerPeek, SquadHeader } from './SquadParts';
import { dateText } from './texts';

interface Props {
  readonly draft: FinishedDraft;
  readonly label: string;
  /** Gerade eben fertig geworden: Glückwunsch statt nüchterner Überschrift. */
  readonly fresh: boolean;
  readonly reducedMotion: boolean;
  readonly landingKey: string | null;
  readonly onPlay: () => void;
  readonly onNew: () => void;
  readonly onHome: () => void;
  readonly onDelete: () => void;
}

const FILLED: SlotMark = 'free';

/** Fertiger Kader mit 23 Spielern: ansehen, damit spielen, neuen Draft starten oder löschen. */
export const SquadView = ({ draft, label, fresh, reducedMotion, landingKey, onPlay, onNew, onHome, onDelete }: Props): ReactElement => {
  const [inspect, setInspect] = useState<SlotRef | null>(null);
  const when = dateText(draft.finishedAt);
  return (
    <section className={`mode dr-root${reducedMotion ? ' dr-calm' : ''}`} aria-label="Fertiger Kader">
      <div className="dr-top">
        <button type="button" className="btn btn-ghost dr-small" onClick={onHome}>‹ Übersicht</button>
      </div>
      <h2 className="opening-title">{fresh ? 'Dein Kader steht! 🎉' : label}</h2>
      <p className="opening-sub">
        {fresh ? `${label} · gespeichert für ${PROFILE_LABEL[draft.profile]}` : `Fertiger Kader von ${PROFILE_LABEL[draft.profile]}${when ? ` · ${when}` : ''}`}
      </p>
      <SquadHeader squad={draft} />
      <div className="dr-actions">
        <button type="button" className="btn btn-primary btn-big" onClick={onPlay}>⚽ Mit diesem Kader spielen</button>
        <button type="button" className="btn btn-secondary btn-big" onClick={onNew}>Neuer Draft</button>
      </div>
      <SquadField squad={draft} markOf={() => FILLED} onSlot={setInspect} landingKey={landingKey} noteOf={() => null} />
      <p className="dr-fine">Tippe einen Spieler an, um seine Karte zu sehen.</p>
      <button type="button" className="btn btn-danger" onClick={onDelete}>Diesen Draft löschen</button>
      {inspect && <PlayerPeek squad={draft} slot={inspect} onClose={() => setInspect(null)} />}
    </section>
  );
};
