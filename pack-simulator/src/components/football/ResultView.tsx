import type { ReactElement, ReactNode } from 'react';
import type { ScorerLine } from '../../football/match';
import type { TeamId } from '../../football/sim/index.ts';

interface Props {
  readonly myTeam: TeamId;
  readonly names: readonly [string, string];
  readonly score: readonly [number, number];
  readonly scorers: readonly ScorerLine[];
  /** Zusätzliche Erklärung, z. B. bei einem abgebrochenen Online-Spiel. */
  readonly note?: string | null;
  readonly children: ReactNode;
}

const headline = (mine: number, theirs: number): string => {
  if (mine === theirs) return 'Unentschieden';
  return mine > theirs ? 'Sieg!' : 'Niederlage';
};

/** Endstand mit Torschützen; die Knöpfe darunter bestimmt der Aufrufer. */
export const ResultView = ({ myTeam, names, score, scorers, note = null, children }: Props): ReactElement => {
  const other: TeamId = myTeam ? 0 : 1;
  return (
    <div className="mode fb-result">
      <h2 className="fb-title" data-testid="fb-result-title">{headline(score[myTeam], score[other])}</h2>
      {note && <p className="fb-hint" role="status">{note}</p>}
      <div className="fb-final" data-testid="fb-final">
        <span className="fb-final-team fb-team-mine">{names[myTeam]}</span>
        <strong className="fb-final-score">{score[myTeam]} : {score[other]}</strong>
        <span className="fb-final-team fb-team-theirs">{names[other]}</span>
      </div>
      <section className="fb-panel" aria-label="Torschützen">
        <h3 className="fb-panel-title">Torschützen</h3>
        {scorers.length ? (
          <ul className="fb-scorers">
            {scorers.map((line, index) => (
              <li key={`${line.clock}-${index}`} className={line.team === myTeam ? 'fb-team-mine' : 'fb-team-theirs'}>
                <span>{line.clock}</span>
                <span>⚽ {line.name}{line.own ? ' (Eigentor)' : ''}</span>
                <span>{names[line.team]}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="fb-sub">Keine Tore – beim nächsten Mal klappt es.</p>
        )}
      </section>
      <div className="fb-actions">{children}</div>
    </div>
  );
};
