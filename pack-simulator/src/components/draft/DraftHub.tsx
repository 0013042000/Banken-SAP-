import { useCallback, useState, type ReactElement } from 'react';
import type { ProfileId } from '../../football/contract';
import { PROFILE_LABEL, type VariantId } from '../../game/draft/config';
import { createDraft, isComplete, type DraftState } from '../../game/draft/engine';
import {
  finishDraft, finishedById, finishedLabel, hasRoomFor, loadDraftBook, newDraftId, removeFinished, saveDraftBook, squadOptionId,
  withActive, type DraftBook,
} from '../../game/draft/store';
import type { DraftHubProps } from '../../game/draftContract';
import type { FormationId } from '../../game/team';
import { Modal } from '../Modal';
import { DraftBoard } from './DraftBoard';
import { DraftHome } from './DraftHome';
import { FormationStep, ProfileStep, VariantStep } from './DraftSetup';
import { FlightGhost } from './FlightGhost';
import { SquadView } from './SquadView';
import { limitText, playCue, progressText, squadTitle, type Flight } from './texts';
import './draft.css';

type Screen =
  | { readonly name: 'home' }
  | { readonly name: 'profile' }
  | { readonly name: 'variant'; readonly profile: ProfileId }
  | { readonly name: 'formation'; readonly profile: ProfileId; readonly variant: VariantId }
  | { readonly name: 'board'; readonly profile: ProfileId; readonly fresh: boolean }
  | { readonly name: 'squad'; readonly id: string; readonly fresh: boolean };

type Dialog =
  | { readonly kind: 'resume'; readonly profile: ProfileId }
  | { readonly kind: 'discard'; readonly profile: ProfileId }
  | { readonly kind: 'full'; readonly profile: ProfileId }
  | { readonly kind: 'delete'; readonly id: string };

const HOME: Screen = { name: 'home' };

/** Hauptbereich „Draft“: Start, Einrichtung, laufender Draft, fertige Kader. */
export const DraftHub = ({ reducedMotion, muted, onPlaySquad, onChanged }: DraftHubProps): ReactElement => {
  const [book, setBook] = useState<DraftBook>(loadDraftBook);
  const [screen, setScreen] = useState<Screen>(HOME);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const endFlight = useCallback(() => setFlight(null), []);

  const go = (next: Screen): void => { playCue(muted, 'tap'); setDialog(null); setScreen(next); };

  const persist = (next: DraftBook, finishedChanged: boolean): void => {
    setBook(next);
    setSaveFailed(!saveDraftBook(next));
    if (finishedChanged) onChanged();
  };

  /** Neuer Draft nur, wenn in der Liste des Profils noch Platz ist – sonst ein klarer Hinweis. */
  const beginSetup = (profile: ProfileId): void => {
    if (hasRoomFor(book, profile)) go({ name: 'variant', profile });
    else { playCue(muted, 'tap'); setDialog({ kind: 'full', profile }); }
  };

  const pickProfile = (profile: ProfileId): void => {
    if (book.active[profile]) { playCue(muted, 'tap'); setDialog({ kind: 'resume', profile }); } else beginSetup(profile);
  };

  const startDraft = (profile: ProfileId, variant: VariantId, formation: FormationId): void => {
    const now = Date.now();
    const draft = createDraft({ id: newDraftId(now, Math.random), profile, variant, formation, now, rnd: Math.random });
    persist(withActive(book, profile, draft), false);
    playCue(muted, 'open');
    setScreen({ name: 'board', profile, fresh: true });
  };

  const changeDraft = (next: DraftState, fly: Flight | null): void => {
    const result = isComplete(next) ? finishDraft(book, next, Date.now()) : null;
    if (result?.ok) {
      persist(result.book, true);
      playCue(muted, 'done');
      setScreen({ name: 'squad', id: result.finished.id, fresh: true });
    } else persist(withActive(book, next.profile, next), false);
    setFlight(reducedMotion ? null : fly);
  };

  const discard = (profile: ProfileId, restart: boolean): void => {
    persist(withActive(book, profile, null), false);
    setDialog(null);
    if (restart) beginSetup(profile); else setScreen(HOME);
  };

  const deleteFinished = (id: string): void => {
    persist(removeFinished(book, id), true);
    setDialog(null);
    if (screen.name === 'squad') setScreen(HOME);
  };

  const boardDraft = screen.name === 'board' ? book.active[screen.profile] : null;
  const squad = screen.name === 'squad' ? finishedById(book, screen.id) : undefined;
  const showHome = screen.name === 'home' || (screen.name === 'board' && !boardDraft) || (screen.name === 'squad' && !squad);
  const landingKey = flight?.target ?? null;
  const dialogDraft = dialog && dialog.kind !== 'delete' ? book.active[dialog.profile] : null;
  const dialogSquad = dialog?.kind === 'delete' ? finishedById(book, dialog.id) : undefined;

  return (
    <div className="dr-hub">
      {saveFailed && (
        <p className="dr-warning" role="status">Speichern ist in diesem Browser gerade nicht möglich. Du kannst weiterdraften, aber nach dem Schließen ist der Stand eventuell weg.</p>
      )}

      {showHome && (
        <DraftHome book={book} onStart={() => go({ name: 'profile' })}
          onResume={(profile) => go({ name: 'board', profile, fresh: false })}
          onDiscard={(profile) => setDialog({ kind: 'discard', profile })}
          onView={(id) => go({ name: 'squad', id, fresh: false })}
          onPlay={(id) => onPlaySquad(squadOptionId(id))}
          onDelete={(id) => setDialog({ kind: 'delete', id })} />
      )}
      {screen.name === 'profile' && <ProfileStep book={book} onPick={pickProfile} onBack={() => go(HOME)} />}
      {screen.name === 'variant' && (
        <VariantStep profile={screen.profile} onBack={() => go({ name: 'profile' })}
          onPick={(variant) => go({ name: 'formation', profile: screen.profile, variant })} />
      )}
      {screen.name === 'formation' && (
        <FormationStep profile={screen.profile} variant={screen.variant} onBack={() => go({ name: 'variant', profile: screen.profile })}
          onPick={(formation) => startDraft(screen.profile, screen.variant, formation)} />
      )}
      {screen.name === 'board' && boardDraft && (
        <DraftBoard key={boardDraft.id} draft={boardDraft} hasRoom={hasRoomFor(book, boardDraft.profile)} fresh={screen.fresh}
          reducedMotion={reducedMotion} muted={muted} landingKey={landingKey} onChange={changeDraft}
          onHome={() => go(HOME)} onRestart={() => setDialog({ kind: 'discard', profile: boardDraft.profile })} />
      )}
      {screen.name === 'squad' && squad && (
        <SquadView key={squad.id} draft={squad} label={finishedLabel(book, squad)} fresh={screen.fresh} reducedMotion={reducedMotion}
          landingKey={landingKey} onPlay={() => onPlaySquad(squadOptionId(squad.id))} onNew={() => go({ name: 'profile' })}
          onHome={() => go(HOME)} onDelete={() => setDialog({ kind: 'delete', id: squad.id })} />
      )}

      {dialog?.kind === 'resume' && dialogDraft && (
        <Modal title="Laufender Draft" onClose={() => setDialog(null)}>
          <p className="modal-text">{PROFILE_LABEL[dialog.profile]} hat noch einen laufenden Draft: {squadTitle(dialogDraft)}, {progressText(dialogDraft)} Spieler gewählt.</p>
          <p className="modal-hint">Ein Neustart verwirft diesen Draft endgültig.</p>
          <div className="modal-actions">
            <button type="button" className="btn btn-primary" onClick={() => go({ name: 'board', profile: dialog.profile, fresh: false })}>Weiter draften</button>
            <button type="button" className="btn btn-danger" onClick={() => discard(dialog.profile, true)}>Verwerfen und neu starten</button>
            <button type="button" className="btn btn-ghost" onClick={() => setDialog(null)}>Abbrechen</button>
          </div>
        </Modal>
      )}
      {dialog?.kind === 'discard' && dialogDraft && (
        <Modal title="Draft verwerfen?" onClose={() => setDialog(null)}>
          <p className="modal-text">Der laufende Draft von {PROFILE_LABEL[dialog.profile]} ({squadTitle(dialogDraft)}, {progressText(dialogDraft)} Spieler gewählt) wird endgültig gelöscht.</p>
          <p className="modal-hint">Das lässt sich nicht rückgängig machen. Fertige Drafts bleiben erhalten.</p>
          <div className="modal-actions">
            <button type="button" className="btn btn-danger" onClick={() => discard(dialog.profile, true)}>Verwerfen und neu starten</button>
            <button type="button" className="btn btn-danger" onClick={() => discard(dialog.profile, false)}>Nur verwerfen</button>
            <button type="button" className="btn btn-ghost" onClick={() => setDialog(null)}>Abbrechen</button>
          </div>
        </Modal>
      )}
      {dialog?.kind === 'full' && (
        <Modal title="Die Liste ist voll" onClose={() => setDialog(null)}>
          <p className="modal-text">{limitText(dialog.profile)}</p>
          <div className="modal-actions">
            <button type="button" className="btn btn-primary" onClick={() => go(HOME)}>Zu „Meine Drafts“</button>
            <button type="button" className="btn btn-ghost" onClick={() => setDialog(null)}>Schließen</button>
          </div>
        </Modal>
      )}
      {dialog?.kind === 'delete' && dialogSquad && (
        <Modal title="Draft löschen?" onClose={() => setDialog(null)}>
          <p className="modal-text">„{finishedLabel(book, dialogSquad)}“ von {PROFILE_LABEL[dialogSquad.profile]} wird endgültig gelöscht.</p>
          <p className="modal-hint">Das lässt sich nicht rückgängig machen.</p>
          <div className="modal-actions">
            <button type="button" className="btn btn-danger" onClick={() => deleteFinished(dialogSquad.id)}>Ja, löschen</button>
            <button type="button" className="btn btn-ghost" onClick={() => setDialog(null)}>Abbrechen</button>
          </div>
        </Modal>
      )}

      {flight && <FlightGhost key={flight.target} flight={flight} onDone={endFlight} />}
    </div>
  );
};
