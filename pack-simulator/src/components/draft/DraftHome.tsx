import type { ReactElement } from 'react';
import type { ProfileId } from '../../football/contract';
import { MAX_FINISHED_PER_PROFILE, PROFILE_IDS, PROFILE_LABEL, SQUAD_SIZE } from '../../game/draft/config';
import { squadRatingOf, teamRatingOf, type DraftState } from '../../game/draft/engine';
import { finishedLabel, finishedOf, type DraftBook } from '../../game/draft/store';
import { dateText, progressText, squadTitle } from './texts';

interface Props {
  readonly book: DraftBook;
  readonly onStart: () => void;
  readonly onResume: (profile: ProfileId) => void;
  readonly onDiscard: (profile: ProfileId) => void;
  readonly onView: (id: string) => void;
  readonly onPlay: (id: string) => void;
  readonly onDelete: (id: string) => void;
}

const HOW_TO: readonly string[] = [
  'Profil, Variante und Formation wählen.',
  'Kapitän aus fünf starken Spielern aussuchen.',
  'Platz antippen, fünf Spieler aufdecken, einen behalten.',
  `Am Ende steht dein Kader mit ${SQUAD_SIZE} Spielern – bereit zum Spielen.`,
];

/** Einstieg: laufende Drafts fortsetzen, neuen Draft starten, fertige Drafts verwalten. */
export const DraftHome = ({ book, onStart, onResume, onDiscard, onView, onPlay, onDelete }: Props): ReactElement => {
  const running = PROFILE_IDS.map((profile) => book.active[profile]).filter((d): d is DraftState => d !== null);
  return (
    <section className="mode dr-root" aria-label="Draft">
      <h2 className="opening-title">Draft</h2>
      <p className="opening-sub">Stell dir aus Fünfer-Angeboten einen Kader mit {SQUAD_SIZE} Spielern zusammen. Deine Sammlung brauchst du dafür nicht.</p>

      {running.map((draft) => (
        <div key={draft.id} className="dr-panel dr-running">
          <div className="dr-panel-title">Laufender Draft von {PROFILE_LABEL[draft.profile]}</div>
          <div className="dr-panel-sub">{squadTitle(draft)} · {progressText(draft)} Spieler gewählt</div>
          <div className="dr-row">
            <button type="button" className="btn btn-primary" onClick={() => onResume(draft.profile)}>Weiter draften</button>
            <button type="button" className="btn btn-ghost" onClick={() => onDiscard(draft.profile)}>Verwerfen</button>
          </div>
        </div>
      ))}

      <button type="button" className={`btn btn-big ${running.length ? 'btn-secondary' : 'btn-primary'}`} onClick={onStart}>Draft starten</button>

      {!running.length && !book.finished.length && (
        <div className="dr-panel">
          <div className="dr-panel-title">So geht’s</div>
          <ol className="dr-howto">{HOW_TO.map((line) => <li key={line}>{line}</li>)}</ol>
        </div>
      )}

      <h3 className="dr-heading">Meine Drafts</h3>
      {!book.finished.length && <p className="dr-empty">Noch kein fertiger Draft. Starte deinen ersten – danach findest du ihn hier.</p>}
      {PROFILE_IDS.map((profile) => {
        const list = finishedOf(book, profile).toSorted((a, b) => b.finishedAt - a.finishedAt);
        return list.length ? (
          <div key={profile} className="dr-saved-group">
            <div className="dr-saved-owner">
              <span>👤 {PROFILE_LABEL[profile]}</span>
              <span>{list.length} von {MAX_FINISHED_PER_PROFILE}</span>
            </div>
            {list.length >= MAX_FINISHED_PER_PROFILE && (
              <p className="dr-warning">Die Liste von {PROFILE_LABEL[profile]} ist voll. Für einen neuen Draft musst du erst einen alten löschen.</p>
            )}
            {list.map((draft) => (
              <div key={draft.id} className="dr-panel dr-saved">
                <div className="dr-saved-head">
                  <div className="dr-saved-info">
                    <div className="dr-panel-title">{finishedLabel(book, draft)}</div>
                    <div className="dr-panel-sub">Kaderwertung {squadRatingOf(draft).rating}{draft.finishedAt ? ` · ${dateText(draft.finishedAt)}` : ''}</div>
                  </div>
                  <div className="dr-saved-rating" aria-label={`Teamwertung ${teamRatingOf(draft).rating}`}>
                    <b>{teamRatingOf(draft).rating}</b>
                    <span aria-hidden="true">Team</span>
                  </div>
                </div>
                <div className="dr-row">
                  <button type="button" className="btn btn-chip dr-grow" onClick={() => onView(draft.id)}>Ansehen</button>
                  <button type="button" className="btn btn-chip btn-secondary dr-grow" onClick={() => onPlay(draft.id)}>Spielen</button>
                  <button type="button" className="btn btn-chip btn-danger" aria-label={`${finishedLabel(book, draft)} löschen`} onClick={() => onDelete(draft.id)}>Löschen</button>
                </div>
              </div>
            ))}
          </div>
        ) : null;
      })}
    </section>
  );
};
