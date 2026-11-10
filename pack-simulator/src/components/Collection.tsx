import type { ReactElement } from 'react';
import { useMemo, useState } from 'react';
import { PLAYER_BY_ID, type Player } from '../data/players';
import type { Collection as Coll } from '../game/storage';
import { sfx } from '../game/sound';
import { Card } from './Card';

interface Props { readonly collection: Coll; readonly onReset: () => void }
type Filter = 'alle' | 'stars' | 'legenden';

export const Collection = ({ collection, onReset }: Props): ReactElement => {
  const [filter, setFilter] = useState<Filter>('alle');
  const [q, setQ] = useState('');
  const [confirm, setConfirm] = useState(false);

  const entries = useMemo(() => {
    const list: Array<{ p: Player; n: number }> = [];
    for (const [id, n] of Object.entries(collection)) { const p = PLAYER_BY_ID.get(id); if (p && n > 0) list.push({ p, n }); }
    return list.sort((a, b) => b.p.ovr - a.p.ovr || a.p.name.localeCompare(b.p.name));
  }, [collection]);

  const total = entries.reduce((s, e) => s + e.n, 0);
  const shown = entries.filter((e) =>
    (filter === 'alle' || (filter === 'stars' && e.p.cat === 'star') || (filter === 'legenden' && e.p.cat === 'legend')) &&
    e.p.name.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <section className="mode">
      <h2 className="opening-title">Sammlung</h2>
      <p className="opening-sub">{entries.length} verschiedene Spieler · {total} Karten gezogen</p>
      <div className="filters">
        {(['alle', 'stars', 'legenden'] as const).map((f) => (
          <button key={f} type="button" className={`btn btn-chip${filter === f ? ' active' : ''}`} onClick={() => { sfx.tap(); setFilter(f); }}>
            {f === 'alle' ? 'Alle' : f === 'stars' ? 'Stars' : 'Legenden'}
          </button>
        ))}
      </div>
      <input className="search" type="search" placeholder="Spieler suchen …" value={q} onChange={(e) => setQ(e.target.value)} />
      {shown.length === 0 ? (
        <p className="empty">Noch keine Karten hier. Öffne Packs im freien Modus!</p>
      ) : (
        <div className="collection-grid">{shown.map((e) => <Card key={e.p.id} player={e.p} size="sm" count={e.n} />)}</div>
      )}
      <div className="reset-area">
        {!confirm ? (
          <button type="button" className="btn btn-danger" onClick={() => setConfirm(true)} disabled={entries.length === 0}>Sammlung zurücksetzen</button>
        ) : (
          <div className="confirm-box">
            <p>Wirklich alle {total} Karten löschen?</p>
            <div className="confirm-btns">
              <button type="button" className="btn btn-danger" onClick={() => { onReset(); setConfirm(false); }}>Ja, löschen</button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)}>Abbrechen</button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
