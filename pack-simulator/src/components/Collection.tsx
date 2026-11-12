import { useMemo, useState, type ReactElement } from 'react';
import { PLAYER_BY_ID, shortName, type Player } from '../data/players';
import type { Collection as Coll } from '../game/storage';
import { sfx } from '../game/sound';
import { fits, FORMATIONS, placePlayer, ROLE_LABEL, slotIndexOfPerson, type Team } from '../game/team';
import { Card } from './Card';
import { Modal } from './Modal';
import { SlotPicker } from './TeamParts';

interface Props {
  readonly collection: Coll;
  readonly team: Team;
  /** Name des Profils, dessen Mannschaft gerade bearbeitet wird. */
  readonly teamLabel: string;
  readonly onTeamChange: (team: Team) => void;
  readonly onGoTeam: () => void;
  readonly onReset: () => void;
}
type Filter = 'alle' | 'stars' | 'legenden';

export const Collection = ({ collection, team, teamLabel, onTeamChange, onGoTeam, onReset }: Props): ReactElement => {
  const [filter, setFilter] = useState<Filter>('alle');
  const [q, setQ] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [picking, setPicking] = useState<Player | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const entries = useMemo(() => {
    const list: Array<{ p: Player; n: number }> = [];
    for (const [id, n] of Object.entries(collection)) { const p = PLAYER_BY_ID.get(id); if (p && n > 0) list.push({ p, n }); }
    return list.sort((a, b) => b.p.ovr - a.p.ovr || a.p.name.localeCompare(b.p.name));
  }, [collection]);

  const total = entries.reduce((s, e) => s + e.n, 0);
  const shown = entries.filter((e) =>
    (filter === 'alle' || (filter === 'stars' && e.p.cat === 'star') || (filter === 'legenden' && e.p.cat === 'legend')) &&
    e.p.name.toLowerCase().includes(q.trim().toLowerCase()));
  const slots = FORMATIONS[team.formation];

  const placeInTeam = (slotIndex: number): void => {
    if (!picking) return;
    const role = slots[slotIndex]!.role;
    onTeamChange(placePlayer(team, slotIndex, picking.id));
    setNotice(`${shortName(picking)} steht jetzt auf „${ROLE_LABEL[role]}“.${fits(picking, role) ? '' : ' Positionsfremd eingesetzt – die Kartenbewertung bleibt unverändert.'}`);
    setPicking(null);
  };

  return (
    <section className="mode">
      <h2 className="opening-title">Sammlung</h2>
      <p className="opening-sub">{entries.length} verschiedene Karten · {total} Karten gezogen</p>
      <p className="opening-hint">„Ins Team“ stellt in die Mannschaft von {teamLabel}.</p>
      <div className="filters">
        {(['alle', 'stars', 'legenden'] as const).map((f) => (
          <button key={f} type="button" className={`btn btn-chip${filter === f ? ' active' : ''}`} onClick={() => { sfx.tap(); setFilter(f); }}>
            {f === 'alle' ? 'Alle' : f === 'stars' ? 'Stars' : 'Legenden'}
          </button>
        ))}
      </div>
      <input className="search" type="search" placeholder="Spieler suchen …" aria-label="Spieler suchen" value={q} onChange={(e) => setQ(e.target.value)} />
      {notice && (
        <div className="team-notice team-notice-box" aria-live="polite">
          <span>{notice}</span>
          <button type="button" className="btn btn-secondary" onClick={onGoTeam}>⚽ Zum Team</button>
        </div>
      )}
      {shown.length === 0 ? (
        <p className="empty">{entries.length === 0 ? 'Noch keine Karten hier. Öffne dein erstes Pack, um Spieler für dein Team zu sammeln.' : 'Kein Spieler gefunden.'}</p>
      ) : (
        <div className="collection-grid">
          {shown.map((e) => {
            const at = slotIndexOfPerson(team, e.p.person);
            return (
              <div key={e.p.id} className="coll-item">
                <Card player={e.p} size="sm" count={e.n} />
                <button type="button" className={`btn btn-team${at >= 0 ? ' in-team' : ''}`} aria-label={`${e.p.name}${e.p.version ? ` ${e.p.version}` : ''} ins Team`}
                  onClick={() => { sfx.tap(); setPicking(e.p); }}>
                  {at >= 0 ? `Im Team · ${slots[at]!.role}` : 'Ins Team'}
                </button>
              </div>
            );
          })}
        </div>
      )}
      <div className="reset-area">
        <button type="button" className="btn btn-danger" onClick={() => setConfirm(true)} disabled={entries.length === 0}>Sammlung zurücksetzen</button>
      </div>

      {picking && <SlotPicker player={picking} team={team} lookup={(id) => PLAYER_BY_ID.get(id)} onPlace={placeInTeam} onClose={() => setPicking(null)} />}
      {confirm && (
        <Modal title="Sammlung zurücksetzen?" onClose={() => setConfirm(false)}>
          <p className="modal-text">Wirklich alle {total} Karten löschen? <strong>Alle Mannschaften werden dabei ebenfalls geleert</strong>, weil nur gezogene Spieler aufgestellt werden können.</p>
          <div className="modal-actions">
            <button type="button" className="btn btn-danger" onClick={() => { onReset(); setConfirm(false); setNotice(null); }}>Ja, löschen</button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)}>Abbrechen</button>
          </div>
        </Modal>
      )}
    </section>
  );
};
