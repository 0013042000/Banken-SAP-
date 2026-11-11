import type { CSSProperties, ReactElement } from 'react';
import { shortName } from '../../data/players';
import { BENCH_SIZE, RESERVE_SIZE } from '../../game/draft/config';
import { groupTitle, playerAt, slotInfo, slotKey, slotsOf, type SlotGroup, type SlotRef, type Squad } from '../../game/draft/engine';
import { FORMATIONS } from '../../game/team';
import { Portrait } from '../Card';

/** Zustand eines freien Platzes: frei, als Nächstes empfohlen, Auswahl offen, gesperrt, Ziel für den Kapitän. */
export type SlotMark = 'free' | 'next' | 'offer' | 'locked' | 'target';

interface FieldProps {
  readonly squad: Squad;
  readonly markOf: (slot: SlotRef) => SlotMark;
  readonly onSlot: (slot: SlotRef) => void;
  /** Platz, dessen Karte gerade noch im Anflug ist. */
  readonly landingKey: string | null;
  /** Hinweis, warum ein Abschnitt noch gesperrt ist; null = offen. */
  readonly noteOf: (group: SlotGroup) => string | null;
}

interface SlotProps {
  readonly squad: Squad;
  readonly slot: SlotRef;
  readonly mark: SlotMark;
  readonly landing: boolean;
  readonly base: string;
  readonly style?: CSSProperties;
  readonly onSlot: (slot: SlotRef) => void;
}

const MARK_GLYPH: Readonly<Record<SlotMark, string>> = { free: '+', next: '+', target: '+', offer: '?', locked: '🔒' };
const MARK_HINT: Readonly<Record<SlotMark, string>> = {
  free: 'frei. Antippen, um fünf Spieler aufzudecken.',
  next: 'frei – als Nächstes dran. Antippen, um fünf Spieler aufzudecken.',
  target: 'frei. Antippen, um den Kapitän hier aufzustellen.',
  offer: 'Auswahl offen. Antippen, um zur Auswahl zurückzukehren.',
  locked: 'noch gesperrt.',
};
const BENCH_GROUPS: readonly (readonly [group: SlotGroup, size: number])[] = [['bench', BENCH_SIZE], ['reserve', RESERVE_SIZE]];

const SlotButton = ({ squad, slot, mark, landing, base, style, onSlot }: SlotProps): ReactElement | null => {
  const info = slotInfo(squad.formation, slot);
  const p = playerAt(squad, slot);
  if (!info) return null;
  const captain = p !== undefined && p.id === squad.captainId;
  const label = p
    ? `${info.label}: ${p.name}, Bewertung ${p.ovr}${captain ? ', Kapitän' : ''}. Antippen für die Karte.`
    : `${info.label}: ${MARK_HINT[mark]}`;
  return (
    <button type="button" data-dr-slot={slotKey(slot)} style={style} aria-label={label}
      className={`${base} ${p ? `filled tile-${p.cat}` : `empty dr-${mark}`}${landing ? ' dr-landing' : ''}`}
      onClick={() => onSlot(slot)}>
      {p ? (
        <>
          <span className="slot-ovr">{p.ovr}</span>
          {captain && <span className="dr-cap" aria-hidden="true">C</span>}
          <Portrait player={p} className="slot-img" />
          <span className="slot-name">{shortName(p)}</span>
          <span className="slot-pos">{info.short}</span>
        </>
      ) : (
        <>
          <span className="slot-plus" aria-hidden="true">{MARK_GLYPH[mark]}</span>
          <span className="slot-pos">{info.short}</span>
        </>
      )}
    </button>
  );
};

/** Spielfeld mit elf Plätzen, darunter Bank und Reserve – für den laufenden und den fertigen Kader. */
export const SquadField = ({ squad, markOf, onSlot, landingKey, noteOf }: FieldProps): ReactElement => (
  <>
    <div className="pitch dr-pitch" aria-label={`Startelf in der Formation ${squad.formation}`}>
      <div className="pitch-box pitch-box-top" /><div className="pitch-box pitch-box-bottom" />
      {slotsOf('start').map((slot) => {
        const def = FORMATIONS[squad.formation][slot.index];
        return def ? (
          <SlotButton key={slotKey(slot)} squad={squad} slot={slot} mark={markOf(slot)} landing={landingKey === slotKey(slot)}
            base="slot" style={{ left: `${def.x}%`, top: `${def.y}%` }} onSlot={onSlot} />
        ) : null;
      })}
    </div>
    {BENCH_GROUPS.map(([group, size]) => {
      const note = noteOf(group);
      const filled = squad[group].filter((id) => id !== null).length;
      return (
        <section key={group} className={`dr-group${note ? ' dr-group-locked' : ''}`} aria-label={groupTitle(group)}>
          <div className="dr-group-head">
            <h3>{groupTitle(group)}</h3>
            <span className="dr-group-count">{filled}/{size}</span>
          </div>
          {note && <p className="dr-group-note">🔒 {note}</p>}
          <div className="dr-seats">
            {slotsOf(group).map((slot) => (
              <SlotButton key={slotKey(slot)} squad={squad} slot={slot} mark={markOf(slot)} landing={landingKey === slotKey(slot)}
                base="dr-seat" onSlot={onSlot} />
            ))}
          </div>
        </section>
      );
    })}
  </>
);
