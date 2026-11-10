import { useMemo, useState, type ReactElement } from 'react';
import { PLAYER_BY_ID, shortName, type Player } from '../data/players';
import { sfx } from '../game/sound';
import type { Collection } from '../game/storage';
import {
  autoLineup, byRating, canPlace, changeFormation, clearLineup, filledCount, fits, FORMATION_IDS, FORMATIONS, normalizeName,
  placePlayer, removeAt, ROLE_LABEL, slotIndexOf, TEAM_NAME_MAX, TEAM_SIZE, teamRating, type FormationId, type SlotDef, type Team,
} from '../game/team';
import { Portrait } from './Card';
import { Modal } from './Modal';
import { FitTag, PlayerRow } from './TeamParts';

interface Props {
  readonly team: Team;
  readonly collection: Collection;
  readonly onChange: (team: Team) => void;
  readonly onGoPacks: () => void;
}

const roles = (slots: readonly SlotDef[]): string => [...new Set(slots.map((s) => ROLE_LABEL[s.role]))].join(', ');

export const TeamView = ({ team, collection, onChange, onGoPacks }: Props): ReactElement => {
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [onlyFit, setOnlyFit] = useState(true);
  const [confirm, setConfirm] = useState<'auto' | 'clear' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const owned = useMemo(() => {
    const list: Player[] = [];
    for (const [id, n] of Object.entries(collection)) { const p = PLAYER_BY_ID.get(id); if (p && n > 0) list.push(p); }
    return list.sort(byRating);
  }, [collection]);

  const slots = FORMATIONS[team.formation];
  const rating = teamRating(team);
  const filled = filledCount(team);

  const applyAuto = (): void => {
    const result = autoLineup(team.formation, owned);
    onChange({ ...team, lineup: result.lineup });
    setConfirm(null);
    if (owned.length === 0) setNotice('Öffne dein erstes Pack, um Spieler für dein Team zu sammeln.');
    else if (result.missing.length === 0) setNotice('Beste Elf aufgestellt!');
    else setNotice(`Noch offen: ${roles(result.missing)}. Dafür fehlen passende Spieler – du kannst andere Feldspieler von Hand einsetzen.`);
  };

  const onAuto = (): void => { sfx.tap(); if (filled > 0) setConfirm('auto'); else applyAuto(); };

  const switchFormation = (to: FormationId): void => {
    if (to === team.formation) return;
    sfx.tap();
    const change = changeFormation(team, to);
    onChange(change.team);
    if (change.dropped.length > 0) {
      setNotice(`Formation ${to}: ${change.dropped.map(shortName).join(', ')} ${change.dropped.length === 1 ? 'hat' : 'haben'} keinen passenden Platz und ${change.dropped.length === 1 ? 'bleibt' : 'bleiben'} in der Sammlung. Neu zu besetzen: ${roles(change.open)}.`);
    } else if (filled > 0 && change.open.length > 0) setNotice(`Formation ${to}: Neu zu besetzen: ${roles(change.open)}.`);
    else setNotice(null);
  };

  const openSlot = (i: number): void => {
    sfx.tap();
    const role = slots[i]!.role;
    const occupantId = team.lineup[i];
    setOnlyFit(owned.some((p) => p.id !== occupantId && fits(p, role)));
    setQuery('');
    setActiveSlot(i);
  };

  const place = (i: number, p: Player): void => {
    const role = slots[i]!.role;
    onChange(placePlayer(team, i, p.id));
    setActiveSlot(null);
    setNotice(`${shortName(p)} steht jetzt auf „${ROLE_LABEL[role]}“.${fits(p, role) ? '' : ' Positionsfremd eingesetzt – die Kartenbewertung bleibt unverändert.'}`);
  };

  const dialog = (): ReactElement | null => {
    if (activeSlot === null) return null;
    const slot = slots[activeSlot]!;
    const occupant = team.lineup[activeSlot] ? PLAYER_BY_ID.get(team.lineup[activeSlot]!) : undefined;
    const q = query.trim().toLowerCase();
    const candidates = owned
      .filter((p) => p.id !== occupant?.id && canPlace(p, slot.role))
      .filter((p) => (!onlyFit || fits(p, slot.role)) && p.name.toLowerCase().includes(q))
      .sort((a, b) => Number(fits(b, slot.role)) - Number(fits(a, slot.role)) || byRating(a, b));
    return (
      <Modal title={`${ROLE_LABEL[slot.role]} besetzen`} onClose={() => setActiveSlot(null)}>
        {occupant && (
          <>
            <div className="compare-label">Aktuell auf diesem Platz</div>
            <PlayerRow player={occupant} note={<FitTag player={occupant} role={slot.role} />}>
              <button type="button" className="pick-btn pick-btn-danger" onClick={() => { onChange(removeAt(team, activeSlot)); setActiveSlot(null); setNotice(`${shortName(occupant)} wurde aus der Aufstellung genommen.`); }}>Entfernen</button>
            </PlayerRow>
          </>
        )}
        {owned.length === 0 ? (
          <p className="empty">Öffne dein erstes Pack, um Spieler für dein Team zu sammeln.</p>
        ) : (
          <>
            <input className="search" type="search" placeholder="Spieler suchen …" aria-label="Spieler suchen" value={query} onChange={(e) => setQuery(e.target.value)} />
            <div className="filters">
              <button type="button" className={`btn btn-chip${onlyFit ? ' active' : ''}`} aria-pressed={onlyFit} onClick={() => setOnlyFit(true)}>Passende</button>
              <button type="button" className={`btn btn-chip${!onlyFit ? ' active' : ''}`} aria-pressed={!onlyFit} onClick={() => setOnlyFit(false)}>Alle</button>
            </div>
            {slot.role === 'TW' && <p className="modal-hint">Im Tor können nur Torhüter stehen.</p>}
            {candidates.length === 0 ? (
              <p className="empty">{onlyFit ? 'Kein passender Spieler in deiner Sammlung. Unter „Alle“ kannst du andere Feldspieler einsetzen.' : 'Kein Spieler gefunden.'}</p>
            ) : (
              <div className="pick-list">
                {candidates.map((p) => {
                  const at = slotIndexOf(team, p.id);
                  const action = at >= 0 ? (occupant ? 'Tauschen' : 'Verschieben') : occupant ? 'Ersetzen' : 'Einsetzen';
                  return (
                    <PlayerRow key={p.id} player={p}
                      note={<><FitTag player={p} role={slot.role} />{at >= 0 && <span className="tag tag-in">im Team: {slots[at]!.role}</span>}</>}>
                      <button type="button" className="pick-btn" aria-label={`${p.name} ${action.toLowerCase()}`} onClick={() => place(activeSlot, p)}>{action}</button>
                    </PlayerRow>
                  );
                })}
              </div>
            )}
          </>
        )}
      </Modal>
    );
  };

  return (
    <section className="mode">
      <div className="team-head">
        <label className="sr-only" htmlFor="team-name">Teamname</label>
        <input id="team-name" className="team-name" type="text" maxLength={TEAM_NAME_MAX} value={team.name} autoComplete="off" spellCheck={false}
          onChange={(e) => onChange({ ...team, name: e.target.value.slice(0, TEAM_NAME_MAX) })}
          onBlur={(e) => onChange({ ...team, name: normalizeName(e.target.value) })}
          onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} />
        <div className="team-stats">
          <div className="team-stat"><b>{rating.rating ?? '—'}</b><span>{rating.count > 0 && rating.provisional ? 'vorläufige Wertung' : 'Teamwertung'}</span></div>
          <div className="team-stat"><b>{filled}/{TEAM_SIZE}</b><span>Spieler</span></div>
          <div className="team-stat"><b>{team.formation}</b><span>Formation</span></div>
        </div>
        <div className="formation-toggle" role="group" aria-label="Formation">
          {FORMATION_IDS.map((f) => (
            <button key={f} type="button" className={`btn btn-chip${team.formation === f ? ' active' : ''}`} aria-pressed={team.formation === f} onClick={() => switchFormation(f)}>{f}</button>
          ))}
        </div>
        <button type="button" className="btn btn-primary btn-big team-auto" onClick={onAuto}>⚡ Bestes Team aufstellen</button>
        <div className="team-notice" aria-live="polite">{notice}</div>
      </div>

      <div className="pitch" aria-label={`Aufstellung ${team.formation}`}>
        <div className="pitch-box pitch-box-top" /><div className="pitch-box pitch-box-bottom" />
        {slots.map((slot, i) => {
          const p = team.lineup[i] ? PLAYER_BY_ID.get(team.lineup[i]!) : undefined;
          const off = p ? !fits(p, slot.role) : false;
          return (
            <button key={slot.id} type="button" style={{ left: `${slot.x}%`, top: `${slot.y}%` }}
              className={`slot ${p ? `filled tile-${p.cat}` : 'empty'}${off ? ' offpos' : ''}`}
              aria-label={p ? `${ROLE_LABEL[slot.role]}: ${p.name}, Bewertung ${p.ovr}${off ? ', positionsfremd' : ''}. Antippen zum Ändern.` : `${ROLE_LABEL[slot.role]}: frei. Antippen zum Besetzen.`}
              onClick={() => openSlot(i)}>
              {p ? (
                <>
                  <span className="slot-ovr">{p.ovr}</span>
                  <Portrait player={p} className="slot-img" />
                  <span className="slot-name">{shortName(p)}</span>
                  <span className="slot-pos">{slot.role}{off ? ' ⚠' : ''}</span>
                </>
              ) : (
                <>
                  <span className="slot-plus" aria-hidden="true">+</span>
                  <span className="slot-pos">{slot.role}</span>
                </>
              )}
            </button>
          );
        })}
      </div>

      {owned.length === 0 && (
        <div className="team-empty">
          <p>Öffne dein erstes Pack, um Spieler für dein Team zu sammeln.</p>
          <button type="button" className="btn btn-secondary" onClick={onGoPacks}>🎁 Zu den Packs</button>
        </div>
      )}
      <p className="opening-hint">Tippe auf einen Platz, um einen Spieler einzusetzen, zu tauschen oder zu entfernen.</p>
      <button type="button" className="btn btn-danger" disabled={filled === 0} onClick={() => setConfirm('clear')}>Team leeren</button>

      {dialog()}
      {confirm === 'auto' && (
        <Modal title="Aufstellung ersetzen?" onClose={() => setConfirm(null)}>
          <p className="modal-text">Deine aktuelle Aufstellung mit {filled} Spielern wird durch die beste passende Elf ersetzt. Deine Sammlung bleibt unverändert.</p>
          <div className="modal-actions">
            <button type="button" className="btn btn-primary" onClick={applyAuto}>Ja, neu aufstellen</button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirm(null)}>Abbrechen</button>
          </div>
        </Modal>
      )}
      {confirm === 'clear' && (
        <Modal title="Team leeren?" onClose={() => setConfirm(null)}>
          <p className="modal-text">Alle {filled} Spieler werden aus der Aufstellung genommen. Teamname, Formation und Sammlung bleiben erhalten.</p>
          <div className="modal-actions">
            <button type="button" className="btn btn-danger" onClick={() => { onChange(clearLineup(team)); setConfirm(null); setNotice('Aufstellung geleert.'); }}>Ja, leeren</button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirm(null)}>Abbrechen</button>
          </div>
        </Modal>
      )}
    </section>
  );
};
