import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import type { Player } from '../data/players';
import type { Motion } from '../game/motion';
import { drawPack, PACK_ORDER, PACKS, PREVIEW_KINDS, previewPack, type PackType, type PreviewKind } from '../game/packs';
import { sfx } from '../game/sound';
import { Modal } from './Modal';
import { PackOpening } from './PackOpening';

interface Props {
  readonly dreamLuck: boolean;
  readonly motion: Motion;
  readonly onCollect: (cards: readonly Player[]) => void;
  readonly onTeam: () => void;
  /** Meldet, ob gerade ein Pack geöffnet ist. */
  readonly onActive?: (active: boolean) => void;
}

export const FreeMode = ({ dreamLuck, motion, onCollect, onTeam, onActive }: Props): ReactElement => {
  const [packType, setPackType] = useState<PackType>('gold');
  const [cards, setCards] = useState<readonly Player[] | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const busy = useRef(false);
  const isOpen = cards !== null;
  useEffect(() => { onActive?.(isOpen); return () => onActive?.(false); }, [isOpen, onActive]);

  const open = (): void => {
    if (busy.current || cards) return; // Doppelklick-Schutz
    busy.current = true;
    const drawn = drawPack(packType, dreamLuck);
    onCollect(drawn); // Ergebnis steht beim Start fest
    setIsDemo(false);
    setCards(drawn);
  };

  /** Vorschau einer Enthüllungsstufe: zählt nicht für Sammlung, Team oder Duell. */
  const preview = (kind: PreviewKind): void => {
    if (busy.current || cards) return;
    busy.current = true;
    sfx.tap();
    setChoosing(false);
    setIsDemo(true);
    setCards(previewPack(kind));
  };

  const next = (): void => { busy.current = false; setCards(null); setIsDemo(false); };

  return (
    <section className="mode">
      {!cards && (
        <div className="pack-select" role="tablist" aria-label="Packtyp">
          {PACK_ORDER.map((t) => (
            <button key={t} type="button" role="tab" aria-selected={packType === t}
              className={`pack-tab pack-tab-${t}${packType === t ? ' active' : ''}`}
              onClick={() => { sfx.tap(); setPackType(t); }}>
              <span className="pack-tab-name">{PACKS[t].label}</span>
              <span className="pack-tab-sub">{PACKS[t].tagline}</span>
            </button>
          ))}
        </div>
      )}
      <PackOpening
        packType={packType}
        cards={cards}
        motion={motion}
        onOpen={open}
        onNext={next}
        onTeam={isDemo ? undefined : onTeam}
        nextLabel={isDemo ? 'Vorschau beenden' : 'Nächstes Pack'}
        title={isDemo ? 'Vorschau' : undefined}
        subtitle={isDemo ? 'Nur Vorschau – zählt nicht für Sammlung oder Duell' : (dreamLuck ? '✨ Traumglück aktiv' : undefined)}
      />
      {!cards && (
        <button type="button" className="btn btn-secondary demo-btn" onClick={() => { sfx.tap(); setChoosing(true); }}>
          🎬 Walkout-Vorschau ansehen
        </button>
      )}
      {choosing && (
        <Modal title="Walkout-Vorschau" onClose={() => setChoosing(false)}>
          <p className="modal-text">Sieh dir jede Enthüllung gezielt an. Die Vorschau zählt nicht: Sammlung, Teams und Spielstände bleiben unverändert.</p>
          <div className="slot-list">
            {PREVIEW_KINDS.map((p) => (
              <button key={p.kind} type="button" className="slot-option" onClick={() => preview(p.kind)}>
                <span className="slot-option-role" aria-hidden="true">▶</span>
                <span className="slot-option-info">
                  <span className="slot-option-name">{p.label}</span>
                  <span className="slot-option-sub">{p.hint}</span>
                </span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </section>
  );
};
