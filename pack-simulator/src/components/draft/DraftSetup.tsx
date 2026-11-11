import type { ReactElement, ReactNode } from 'react';
import type { ProfileId } from '../../football/contract';
import { MAX_FINISHED_PER_PROFILE, PROFILE_IDS, PROFILE_LABEL, VARIANT_IDS, VARIANTS, type VariantId } from '../../game/draft/config';
import { finishedOf, type DraftBook } from '../../game/draft/store';
import { FORMATION_IDS, FORMATIONS, type FormationId } from '../../game/team';
import { FORMATION_HINT, progressText } from './texts';

interface FrameProps {
  readonly step: number;
  readonly title: string;
  readonly sub: string;
  readonly onBack: () => void;
  readonly children: ReactNode;
}

interface ProfileProps {
  readonly book: DraftBook;
  readonly onPick: (profile: ProfileId) => void;
  readonly onBack: () => void;
}

interface VariantProps {
  readonly profile: ProfileId;
  readonly onPick: (variant: VariantId) => void;
  readonly onBack: () => void;
}

interface FormationProps {
  readonly profile: ProfileId;
  readonly variant: VariantId;
  readonly onPick: (formation: FormationId) => void;
  readonly onBack: () => void;
}

const SETUP_STEPS = 3;
const STEP_PROFILE = 1;
const STEP_VARIANT = 2;
const STEP_FORMATION = 3;

const StepFrame = ({ step, title, sub, onBack, children }: FrameProps): ReactElement => (
  <section className="mode dr-root" aria-label={title}>
    <div className="dr-top">
      <button type="button" className="btn btn-ghost dr-small" onClick={onBack}>‹ Zurück</button>
      <span className="dr-step">Schritt {step} von {SETUP_STEPS}</span>
    </div>
    <h2 className="opening-title">{title}</h2>
    <p className="opening-sub">{sub}</p>
    {children}
  </section>
);

const profileStatus = (book: DraftBook, profile: ProfileId): string => {
  const active = book.active[profile];
  const saved = `${finishedOf(book, profile).length} von ${MAX_FINISHED_PER_PROFILE} fertigen Drafts`;
  return active ? `Laufender Draft: ${progressText(active)} Spieler · ${saved}` : saved;
};

/** Schritt 1: Wer draftet? */
export const ProfileStep = ({ book, onPick, onBack }: ProfileProps): ReactElement => (
  <StepFrame step={STEP_PROFILE} title="Wer draftet?" sub="Jeder hat seine eigenen Drafts." onBack={onBack}>
    <div className="dr-options">
      {PROFILE_IDS.map((profile) => (
        <button key={profile} type="button" className="dr-option" onClick={() => onPick(profile)}>
          <span className="dr-option-name">👤 {PROFILE_LABEL[profile]}</span>
          <span className="dr-option-sub">{profileStatus(book, profile)}</span>
        </button>
      ))}
    </div>
  </StepFrame>
);

/** Schritt 2: Welche Karten kommen in die Angebote? */
export const VariantStep = ({ profile, onPick, onBack }: VariantProps): ReactElement => (
  <StepFrame step={STEP_VARIANT} title="Welcher Draft?" sub={`${PROFILE_LABEL[profile]}, such dir eine Variante aus.`} onBack={onBack}>
    <div className="dr-options">
      {VARIANT_IDS.map((id) => (
        <button key={id} type="button" className={`dr-option dr-option-${id}`} onClick={() => onPick(id)}>
          <span className="dr-option-name">{VARIANTS[id].label}</span>
          <span className="dr-option-tag">{VARIANTS[id].tagline}</span>
          <span className="dr-option-sub">{VARIANTS[id].description}</span>
        </button>
      ))}
    </div>
  </StepFrame>
);

/** Schritt 3: Formation mit kleinem Spielfeld zur Orientierung. */
export const FormationStep = ({ profile, variant, onPick, onBack }: FormationProps): ReactElement => (
  <StepFrame step={STEP_FORMATION} title="Welche Formation?" sub={`${VARIANTS[variant].label} für ${PROFILE_LABEL[profile]} – die Formation bleibt für den ganzen Draft.`} onBack={onBack}>
    <div className="dr-formations">
      {FORMATION_IDS.map((id) => (
        <button key={id} type="button" className="dr-formation" aria-label={`Formation ${id}: ${FORMATION_HINT[id]}`} onClick={() => onPick(id)}>
          <span className="dr-mini" aria-hidden="true">
            {FORMATIONS[id].map((slot) => <span key={slot.id} className="dr-mini-dot" style={{ left: `${slot.x}%`, top: `${slot.y}%` }} />)}
          </span>
          <span className="dr-option-name">{id}</span>
          <span className="dr-option-sub">{FORMATION_HINT[id]}</span>
        </button>
      ))}
    </div>
  </StepFrame>
);
