import { useState, type ReactElement } from 'react';
import { PLAYER_BY_ID, shortName, type Player } from '../../data/players';
import { SQUAD_SIZE } from '../../game/draft/config';
import {
  captainOf, captainTargets, chooseCaptain, draftedCount, nextOpenSlot, openSlot, phaseOf, pickCandidate, placeCaptain, playerAt, sameSlot, slotInfo,
  slotKey, type DraftPhase, type DraftState, type SlotGroup, type SlotRef,
} from '../../game/draft/engine';
import { fits, FORMATIONS } from '../../game/team';
import { Portrait } from '../Card';
import { Modal } from '../Modal';
import { OfferSheet } from './OfferSheet';
import { SquadField, type SlotMark } from './SquadField';
import { PlayerPeek, SquadHeader } from './SquadParts';
import { boxOf, fitNote, limitText, playCue, type Box, type Flight } from './texts';

interface Props {
  readonly draft: DraftState;
  /** Ist für das Profil noch Platz für einen weiteren fertigen Draft? */
  readonly hasRoom: boolean;
  /** Frisch gestarteter Draft: Die Kapitäne werden mit Enthüllung gezeigt. */
  readonly fresh: boolean;
  readonly reducedMotion: boolean;
  readonly muted: boolean;
  readonly landingKey: string | null;
  readonly onChange: (next: DraftState, flight: Flight | null) => void;
  readonly onHome: () => void;
  readonly onRestart: () => void;
}

interface Banner {
  readonly text: string;
  readonly action?: { readonly label: string; readonly run: () => void };
}

interface Hint {
  readonly title: string;
  readonly text: string;
}

type HintId = 'offer' | 'captainPlace' | 'bench' | 'reserve';

const HINT_OF_GROUP: Readonly<Record<SlotGroup, HintId>> = { start: 'captainPlace', bench: 'bench', reserve: 'reserve' };
/** Abschnitte, in denen Bank bzw. Reserve noch gesperrt sind. */
const LOCKED_DURING: Readonly<Record<SlotGroup, readonly DraftPhase[]>> = {
  start: [],
  bench: ['captain', 'captainPlace', 'start'],
  reserve: ['captain', 'captainPlace', 'start', 'bench'],
};
const LOCK_NOTE: Readonly<Record<SlotGroup, string>> = {
  start: '',
  bench: 'Erst die Startelf füllen – dann ist die Bank dran.',
  reserve: 'Erst Startelf und Bank füllen – dann ist die Reserve dran.',
};
const PHASE_TEXT: Readonly<Record<SlotGroup, string>> = {
  start: 'Tippe einen freien Platz auf dem Feld an – die Reihenfolge bestimmst du.',
  bench: 'Die Startelf steht! Jetzt kommen die sieben Bankplätze.',
  reserve: 'Fast geschafft: Es fehlen nur noch die Reserveplätze.',
};
const CAPTAIN_INTRO = 'Dein Kapitän ist dein erster Spieler. Tippe eine Karte an, um sie groß zu sehen.';

/** Laufender Draft: Feld, Bank und Reserve mit dem jeweils nächsten Schritt. */
export const DraftBoard = ({ draft, hasRoom, fresh, reducedMotion, muted, landingKey, onChange, onHome, onRestart }: Props): ReactElement => {
  const [sheetOpen, setSheetOpen] = useState(draft.offer !== null);
  const [reveal, setReveal] = useState(fresh);
  const [inspect, setInspect] = useState<SlotRef | null>(null);
  const [hintId, setHintId] = useState<HintId | null>(null);

  const phase = phaseOf(draft);
  const offer = draft.offer;
  const captain = captainOf(draft);
  const targets = captainTargets(draft);
  const nextSlot = nextOpenSlot(draft);
  const offerInfo = offer?.kind === 'slot' ? slotInfo(draft.formation, offer.slot) : undefined;
  const offerLabel = offerInfo?.label ?? 'Kapitän';
  const turn = `Wahl ${draftedCount(draft) + 1} von ${SQUAD_SIZE}`;
  const candidates = (offer?.candidates ?? []).map((id) => PLAYER_BY_ID.get(id)).filter((p): p is Player => p !== undefined);

  const hints: Readonly<Record<HintId, Hint>> = {
    offer: { title: 'Erst die offene Auswahl', text: `Für „${offerLabel}“ sind schon fünf Spieler aufgedeckt. Wähle dort zuerst einen aus – danach kannst du den nächsten Platz öffnen.` },
    captainPlace: { title: 'Dein Kapitän braucht einen Platz', text: `${captain ? shortName(captain) : 'Dein Kapitän'} passt nur auf die leuchtenden Plätze. Tippe einen davon an.` },
    bench: { title: 'Bank noch gesperrt', text: LOCK_NOTE.bench },
    reserve: { title: 'Reserve noch gesperrt', text: LOCK_NOTE.reserve },
  };

  const showOffer = (): void => { setHintId(null); setSheetOpen(true); };
  const hideOffer = (): void => { setSheetOpen(false); setReveal(false); };
  const captainNote = (p: Player): string => {
    const fitting = FORMATIONS[draft.formation].filter((slot) => fits(p, slot.role)).length;
    return fitting === 1 ? 'passt auf einen Platz' : `passt auf ${fitting} Plätze`;
  };

  const open = (slot: SlotRef): void => {
    const result = openSlot(draft, slot, Math.random);
    if (!result.ok) return;
    playCue(muted, 'open');
    onChange(result.state, null);
    setReveal(true);
    setSheetOpen(true);
  };

  const place = (slot: SlotRef): void => {
    const result = slot.group === 'start' ? placeCaptain(draft, slot.index) : null;
    if (!result?.ok || !captain) { setHintId('captainPlace'); return; }
    playCue(muted, 'pick', captain.ovr);
    const from = boxOf(document.querySelector('.dr-hand .portrait'));
    onChange(result.state, from ? { player: captain, from, target: slotKey(slot) } : null);
  };

  const confirm = (player: Player, from: Box | null): void => {
    if (!offer) return;
    const result = offer.kind === 'captain' ? chooseCaptain(draft, player.id) : pickCandidate(draft, player.id);
    if (!result.ok) return;
    playCue(muted, 'pick', player.ovr);
    setSheetOpen(false);
    setReveal(false);
    onChange(result.state, offer.kind === 'slot' && from ? { player, from, target: slotKey(offer.slot) } : null);
  };

  const tapSlot = (slot: SlotRef): void => {
    playCue(muted, 'tap');
    if (playerAt(draft, slot)) { setInspect(slot); return; }
    if (offer) {
      if (offer.kind === 'captain' || sameSlot(offer.slot, slot)) showOffer(); else setHintId('offer');
      return;
    }
    if (phase === 'captainPlace') { place(slot); return; }
    if (slot.group !== phase) { setHintId(HINT_OF_GROUP[slot.group]); return; }
    open(slot);
  };

  const markOf = (slot: SlotRef): SlotMark => {
    if (phase === 'captainPlace') return slot.group === 'start' && targets.includes(slot.index) ? 'target' : 'locked';
    if (offer?.kind === 'slot') return sameSlot(offer.slot, slot) ? 'offer' : 'locked';
    if (offer || slot.group !== phase) return 'locked';
    return nextSlot && sameSlot(nextSlot, slot) ? 'next' : 'free';
  };

  const banner = (): Banner => {
    if (offer?.kind === 'captain') return { text: 'Wähle zuerst deinen Kapitän – fünf starke Spieler stehen bereit.', action: { label: 'Kapitän wählen', run: showOffer } };
    if (offer) return { text: `Für „${offerLabel}“ sind fünf Spieler aufgedeckt. Erst dort wählen, dann geht es weiter.`, action: { label: 'Zurück zur offenen Auswahl', run: showOffer } };
    if (phase === 'captainPlace') return { text: 'Wohin mit deinem Kapitän? Tippe auf einen leuchtenden Platz.' };
    if (nextSlot) return { text: PHASE_TEXT[nextSlot.group], action: { label: `Nächster Platz: ${slotInfo(draft.formation, nextSlot)?.label ?? ''}`, run: () => open(nextSlot) } };
    if (hasRoom) return { text: 'Dein Kader ist fertig, aber noch nicht abgelegt.', action: { label: 'Kader sichern', run: () => onChange(draft, null) } };
    return { text: limitText(draft.profile), action: { label: 'Zu „Meine Drafts“', run: onHome } };
  };

  const step = banner();
  const hint = hintId ? hints[hintId] : null;

  return (
    <section className={`mode dr-root${reducedMotion ? ' dr-calm' : ''}`} aria-label="Laufender Draft">
      <div className="dr-top">
        <button type="button" className="btn btn-ghost dr-small" onClick={onHome}>‹ Übersicht</button>
        <button type="button" className="btn btn-ghost dr-small" onClick={onRestart}>Neu starten</button>
      </div>
      <SquadHeader squad={draft} />

      <div className="dr-banner" aria-live="polite">
        <p>{step.text}</p>
        {phase === 'captainPlace' && captain && (
          <div className={`pick-row pick-${captain.cat} dr-hand`}>
            <Portrait player={captain} className="pick-img" />
            <div className="pick-info">
              <div className="pick-name">{captain.name}</div>
              <div className="pick-meta">Kapitän · {captain.pos}</div>
            </div>
            <div className="pick-ovr" aria-label={`Bewertung ${captain.ovr}`}>{captain.ovr}</div>
          </div>
        )}
        {step.action && <button type="button" className="btn btn-primary btn-big dr-next-btn" onClick={step.action.run}>{step.action.label}</button>}
      </div>

      <SquadField squad={draft} markOf={markOf} onSlot={tapSlot} landingKey={landingKey}
        noteOf={(group) => (LOCKED_DURING[group].includes(phase) ? LOCK_NOTE[group] : null)} />
      <p className="dr-fine">Dein Draft wird automatisch gespeichert. Du kannst jederzeit unterbrechen und später weitermachen.</p>

      {offer && sheetOpen && (
        <OfferSheet title={offer.kind === 'captain' ? 'Kapitän wählen' : `${offerLabel} besetzen`}
          intro={offer.kind === 'captain' ? `${turn}: ${CAPTAIN_INTRO}` : `${turn}: Fünf Spieler für „${offerLabel}“. Tippe eine Karte an, um sie groß zu sehen.`}
          candidates={candidates} noteOf={(p) => (offer.kind === 'captain' ? captainNote(p) : fitNote(offerInfo, p))}
          confirmLabel={offer.kind === 'captain' ? 'Als Kapitän wählen' : 'Diesen Spieler wählen'}
          reveal={reveal && !reducedMotion} onLook={() => playCue(muted, 'tap')} onConfirm={confirm} onClose={hideOffer} />
      )}
      {inspect && <PlayerPeek squad={draft} slot={inspect} onClose={() => setInspect(null)} />}
      {hint && (
        <Modal title={hint.title} onClose={() => setHintId(null)}>
          <p className="modal-text">{hint.text}</p>
          <div className="modal-actions">
            {hintId === 'offer' && <button type="button" className="btn btn-primary" onClick={showOffer}>Zur offenen Auswahl</button>}
            <button type="button" className="btn btn-ghost" onClick={() => setHintId(null)}>{hintId === 'offer' ? 'Team weiter ansehen' : 'Verstanden'}</button>
          </div>
        </Modal>
      )}
    </section>
  );
};
