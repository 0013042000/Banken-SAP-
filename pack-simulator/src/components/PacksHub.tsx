import { useState, type ReactElement } from 'react';
import type { Player } from '../data/players';
import type { Motion } from '../game/motion';
import { sfx } from '../game/sound';
import { DuelMode } from './DuelMode';
import { FreeMode } from './FreeMode';

export type PacksView = 'frei' | 'duell';

interface Props {
  readonly view: PacksView;
  readonly onView: (view: PacksView) => void;
  readonly dreamLuck: boolean;
  readonly onDreamLuck: (on: boolean) => void;
  readonly motion: Motion;
  readonly onCollect: (cards: readonly Player[]) => void;
  readonly onTeam: () => void;
}

/** Bereich „Packs“: freies Öffnen und das Pack-Duell auf einem Gerät. */
export const PacksHub = ({ view, onView, dreamLuck, onDreamLuck, motion, onCollect, onTeam }: Props): ReactElement => {
  // Während ein Pack geöffnet wird, treten Umschalter und Schalter zurück, damit die Bühne Platz hat.
  const [opening, setOpening] = useState(false);
  return (
    <div className="packs-hub">
      {!opening && (
        <div className="packs-controls">
          <div className="seg" role="tablist" aria-label="Pack-Modus">
            <button type="button" role="tab" aria-selected={view === 'frei'} className={`seg-btn${view === 'frei' ? ' active' : ''}`} onClick={() => { sfx.tap(); onView('frei'); }}>Packs öffnen</button>
            <button type="button" role="tab" aria-selected={view === 'duell'} className={`seg-btn${view === 'duell' ? ' active' : ''}`} onClick={() => { sfx.tap(); onView('duell'); }}>Pack-Duell</button>
          </div>
          <button type="button" role="switch" aria-checked={dreamLuck} className={`toggle luck${dreamLuck ? ' on' : ''}`} onClick={() => { sfx.tap(); onDreamLuck(!dreamLuck); }}>
            ✨ Traumglück {dreamLuck ? 'an' : 'aus'}
          </button>
        </div>
      )}
      {view === 'frei'
        ? <FreeMode dreamLuck={dreamLuck} motion={motion} onCollect={onCollect} onTeam={onTeam} onActive={setOpening} />
        : <DuelMode dreamLuck={dreamLuck} motion={motion} onTeam={onTeam} onActive={setOpening} />}
    </div>
  );
};
