import type { ReactElement } from 'react';
import credits from '../data/credits.json';
import { PLAYER_BY_ID } from '../data/players';

interface Credit { readonly file: string; readonly author: string; readonly license: string; readonly url: string }

const ENTRIES = Object.entries(credits as Record<string, Credit>)
  .map(([id, c]) => ({ id, name: PLAYER_BY_ID.get(id)?.name ?? id, ...c }))
  .sort((a, b) => a.name.localeCompare(b.name));

export const Credits = ({ onClose }: { readonly onClose: () => void }): ReactElement => (
  <section className="mode">
    <h2 className="opening-title">Bildnachweise</h2>
    <p className="opening-sub">Spielerporträts stammen aus Wikimedia Commons und stehen unter den jeweils genannten freien Lizenzen. Ausschnitte wurden zugeschnitten und verkleinert.</p>
    <ul className="credits">
      {ENTRIES.map((e) => (
        <li key={e.id}>
          <strong>{e.name}</strong>: <a href={e.url} target="_blank" rel="noreferrer">{e.file}</a> · {e.author} · {e.license}
        </li>
      ))}
    </ul>
    <button type="button" className="btn btn-primary btn-big" onClick={onClose}>Zurück</button>
  </section>
);
