import type { ReactElement } from 'react';
import { useRef, useState } from 'react';
import type { Player } from '../data/players';
import { demoWalkoutPack, drawPack, PACK_ORDER, PACKS, type PackType } from '../game/packs';
import { sfx } from '../game/sound';
import { PackOpening } from './PackOpening';

interface Props {
  readonly dreamLuck: boolean;
  readonly onCollect: (cards: readonly Player[]) => void;
  readonly onTeam: () => void;
}

export const FreeMode = ({ dreamLuck, onCollect, onTeam }: Props): ReactElement => {
  const [packType, setPackType] = useState<PackType>('gold');
  const [cards, setCards] = useState<readonly Player[] | null>(null);
  const [isDemo, setIsDemo] = useState(false);
  const busy = useRef(false);

  const open = (): void => {
    if (busy.current || cards) return; // Doppelklick-Schutz
    busy.current = true;
    const drawn = drawPack(packType, dreamLuck);
    onCollect(drawn); // Ergebnis steht beim Start fest
    setIsDemo(false);
    setCards(drawn);
  };

  const demo = (): void => {
    if (busy.current || cards) return;
    busy.current = true;
    sfx.tap();
    setIsDemo(true);
    setCards(demoWalkoutPack());
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
        onOpen={open}
        onNext={next}
        onTeam={isDemo ? undefined : onTeam}
        nextLabel={isDemo ? 'Demo beenden' : 'Nächstes Pack'}
        title={isDemo ? 'Demo-Walkout' : undefined}
        subtitle={isDemo ? 'Nur Vorschau – zählt nicht für Sammlung oder Duell' : (dreamLuck ? '✨ Traumglück aktiv' : undefined)}
      />
      {!cards && (
        <button type="button" className="btn btn-ghost demo-btn" onClick={demo}>
          🎬 Demo-Walkout ansehen (zählt nicht)
        </button>
      )}
    </section>
  );
};
