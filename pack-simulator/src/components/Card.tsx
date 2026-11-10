import type { ReactElement } from 'react';
import { FLAGS, initials, statsFor, type Player } from '../data/players';

interface Props {
  readonly player: Player;
  readonly size?: 'sm' | 'md' | 'lg';
  readonly highlight?: boolean;
  readonly count?: number;
}

const CAT_LABEL: Record<Player['cat'], string> = { gold: 'Gold', star: 'Star', legend: 'Legende' };

export const Silhouette = (): ReactElement => (
  <svg viewBox="0 0 100 100" className="silhouette" aria-hidden="true">
    <circle cx="50" cy="30" r="16" />
    <path d="M22 98 C22 66 32 54 50 54 C68 54 78 66 78 98 Z" />
  </svg>
);

export const Card = ({ player, size = 'md', highlight = false, count }: Props): ReactElement => {
  const f = FLAGS[player.nation] ?? { flag: '🏳️', name: player.nation };
  const stats = statsFor(player);
  return (
    <div className={`card card-${player.cat} card-${size}${highlight ? ' card-highlight' : ''}`}>
      <div className="card-top">
        <div className="card-ovr">{player.ovr}</div>
        <div className="card-pos">{player.pos}</div>
        <div className="card-flag" title={f.name}>{f.flag}</div>
      </div>
      <div className="card-figure">
        <Silhouette />
        <div className="card-initials">{initials(player.name)}</div>
      </div>
      <div className="card-name">{player.name}</div>
      <div className="card-cat">{CAT_LABEL[player.cat]}</div>
      <div className="card-stats">
        {stats.map((s) => (
          <div key={s.label} className="stat"><span className="stat-v">{s.value}</span><span className="stat-l">{s.label}</span></div>
        ))}
      </div>
      {count !== undefined && count > 1 && <div className="card-count">×{count}</div>}
    </div>
  );
};
