import type { ProfileId, SquadOption } from '../../football/contract';
import type { ListDraftSquads } from '../draftContract';
import { FORMATION_IDS } from '../team';
import { MAX_FINISHED_PER_PROFILE, PROFILE_IDS, VARIANT_IDS, VARIANTS } from './config';
import {
  isComplete, isLegalOffer, isLegalSquad, phaseOf, SLOT_GROUPS, squadPlayers, teamRatingOf,
  type DraftState, type Lineup, type Offer, type SlotRef, type Squad,
} from './engine';
import type { Rnd } from './random';

/** Fertiger Kader mit 23 Spielern. */
export interface FinishedDraft extends Squad {
  readonly finishedAt: number;
}

/** Gesamter gespeicherter Stand: je Profil höchstens ein laufender Draft, dazu alle fertigen Drafts. */
export interface DraftBook {
  readonly active: Readonly<Record<ProfileId, DraftState | null>>;
  readonly finished: readonly FinishedDraft[];
}

export const FINISH_ERRORS = ['incomplete', 'limit'] as const;
export type FinishError = (typeof FINISH_ERRORS)[number];

export type FinishResult =
  | { readonly ok: true; readonly book: DraftBook; readonly finished: FinishedDraft }
  | { readonly ok: false; readonly error: FinishError };

type Raw = Record<string, unknown>;

export const DRAFTS_KEY = 'fps.drafts.v1';
export const SQUAD_ID_PREFIX = 'draft:';
const STORE_VERSION = 1;
const ID_RADIX = 36;
const ID_NOISE = 1679616;

// ---- Reine Hilfen ----

export const emptyBook = (): DraftBook => ({ active: { semon: null, ariel: null }, finished: [] });
export const squadOptionId = (draftId: string): string => `${SQUAD_ID_PREFIX}${draftId}`;
export const newDraftId = (now: number, rnd: Rnd): string => `d${now.toString(ID_RADIX)}${Math.floor(rnd() * ID_NOISE).toString(ID_RADIX)}`;
export const finishedOf = (book: DraftBook, profile: ProfileId): FinishedDraft[] => book.finished.filter((f) => f.profile === profile);
export const finishedById = (book: DraftBook, id: string): FinishedDraft | undefined => book.finished.find((f) => f.id === id);
export const hasRoomFor = (book: DraftBook, profile: ProfileId): boolean => finishedOf(book, profile).length < MAX_FINISHED_PER_PROFILE;
export const withActive = (book: DraftBook, profile: ProfileId, state: DraftState | null): DraftBook =>
  ({ ...book, active: { ...book.active, [profile]: state } });
export const removeFinished = (book: DraftBook, id: string): DraftBook => ({ ...book, finished: book.finished.filter((f) => f.id !== id) });

/**
 * Legt einen vollständigen Draft als fertigen Kader ab und beendet den laufenden Draft des Profils.
 * Ist die Obergrenze erreicht, bleibt alles unverändert – es wird nie still etwas gelöscht.
 */
export const finishDraft = (book: DraftBook, state: DraftState, now: number): FinishResult => {
  if (!isComplete(state)) return { ok: false, error: 'incomplete' };
  if (!hasRoomFor(book, state.profile)) return { ok: false, error: 'limit' };
  const finished: FinishedDraft = {
    id: state.id, profile: state.profile, variant: state.variant, formation: state.formation, createdAt: state.createdAt,
    captainId: state.captainId, start: state.start, bench: state.bench, reserve: state.reserve, finishedAt: now,
  };
  const others = book.finished.filter((f) => f.id !== finished.id);
  return { ok: true, finished, book: { active: { ...book.active, [state.profile]: null }, finished: [...others, finished] } };
};

const sameKind = (a: Squad, b: Squad): boolean => a.profile === b.profile && a.variant === b.variant && a.formation === b.formation;

/** Anzeigename, z. B. „Legenden-Draft · 4-3-3“; gleichartige Drafts eines Profils werden durchnummeriert. */
export const finishedLabel = (book: DraftBook, draft: FinishedDraft): string => {
  const base = `${VARIANTS[draft.variant].label} · ${draft.formation}`;
  const alike = book.finished.filter((f) => sameKind(f, draft));
  return alike.length > 1 ? `${base} (${alike.findIndex((f) => f.id === draft.id) + 1})` : base;
};

/** Neueste zuerst. Kopie plus sort statt toSorted, damit auch ältere Handy-Browser mitkommen. */
export const newestFirst = (drafts: readonly FinishedDraft[]): FinishedDraft[] => [...drafts].sort((a, b) => b.finishedAt - a.finishedAt);

/** Alle fertigen Drafts als auswählbare Kader, neueste zuerst. */
export const toSquadOptions = (book: DraftBook): SquadOption[] =>
  newestFirst(book.finished).map((draft) => ({
    id: squadOptionId(draft.id),
    label: finishedLabel(book, draft),
    owner: draft.profile,
    kind: 'draft',
    rating: teamRatingOf(draft).rating,
    players: squadPlayers(draft),
  }));

// ---- Prüfung beim Laden: Alles von außen ist zunächst unbekannt ----

const isRecord = (v: unknown): v is Raw => v !== null && typeof v === 'object' && !Array.isArray(v);
const isOneOf = <TValue extends string>(allowed: readonly TValue[], v: unknown): v is TValue => allowed.some((x) => x === v);
const isLineup = (v: unknown): v is Lineup => Array.isArray(v) && v.every((x) => x === null || typeof x === 'string');
const isIdList = (v: unknown): v is readonly string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const timeOf = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const isFound = <TValue>(v: TValue | null): v is TValue => v !== null;

const parseSquad = (raw: unknown): Squad | null => {
  if (!isRecord(raw)) return null;
  const { id, profile, variant, formation, captainId, start, bench, reserve } = raw;
  const captainOk = captainId === null || typeof captainId === 'string';
  if (typeof id !== 'string' || !id || !captainOk) return null;
  if (!isOneOf(PROFILE_IDS, profile) || !isOneOf(VARIANT_IDS, variant) || !isOneOf(FORMATION_IDS, formation)) return null;
  if (!isLineup(start) || !isLineup(bench) || !isLineup(reserve)) return null;
  const squad: Squad = { id, profile, variant, formation, createdAt: timeOf(raw.createdAt), captainId, start, bench, reserve };
  return isLegalSquad(squad) ? squad : null;
};

const parseSlotRef = (raw: unknown): SlotRef | null =>
  (isRecord(raw) && isOneOf(SLOT_GROUPS, raw.group) && isCount(raw.index) ? { group: raw.group, index: raw.index } : null);

const parseOffer = (raw: unknown): Offer | null => {
  if (!isRecord(raw) || !isIdList(raw.candidates)) return null;
  const base = { candidates: raw.candidates, relaxed: isCount(raw.relaxed) ? raw.relaxed : 0 };
  if (raw.kind === 'captain') return { kind: 'captain', ...base };
  const slot = parseSlotRef(raw.slot);
  return raw.kind === 'slot' && slot ? { kind: 'slot', slot, ...base } : null;
};

/**
 * Laufender Draft: Ein kaputtes Angebot wird verworfen, die bereits gewählten Spieler bleiben.
 * Fehlt das Kapitänsangebot, ist noch nichts gewählt – dann wird der Draft ganz verworfen.
 */
const parseActive = (raw: unknown, profile: ProfileId): DraftState | null => {
  const squad = parseSquad(raw);
  if (!squad || squad.profile !== profile || !isRecord(raw)) return null;
  const bare: DraftState = { ...squad, offer: null };
  const parsed = parseOffer(raw.offer);
  const offer = parsed && isLegalOffer(bare, parsed) ? parsed : null;
  return phaseOf(bare) === 'captain' && !offer ? null : { ...bare, offer };
};

const parseFinished = (raw: unknown): FinishedDraft | null => {
  const squad = parseSquad(raw);
  return squad && isComplete(squad) && isRecord(raw) ? { ...squad, finishedAt: timeOf(raw.finishedAt) } : null;
};

/** Bereinigt beliebige (auch beschädigte) Daten: Kaputte Einträge werden übersprungen, nie ein Absturz. */
export const sanitizeDraftBook = (raw: unknown): DraftBook => {
  const root = isRecord(raw) ? raw : {};
  const active = isRecord(root.active) ? root.active : {};
  const list: readonly unknown[] = Array.isArray(root.finished) ? root.finished : [];
  const finished = list.map(parseFinished).filter(isFound);
  return {
    active: { semon: parseActive(active.semon, 'semon'), ariel: parseActive(active.ariel, 'ariel') },
    finished: finished.filter((f, i) => finished.findIndex((other) => other.id === f.id) === i),
  };
};

// ---- Speicher ----

const readRaw = (): unknown => {
  try {
    const text = localStorage.getItem(DRAFTS_KEY);
    const parsed: unknown = text ? JSON.parse(text) : null;
    return parsed;
  } catch { return null; }
};

export const loadDraftBook = (): DraftBook => sanitizeDraftBook(readRaw());

/** Schreibt den Stand; liefert false, wenn der Speicher nicht verfügbar ist. */
export const saveDraftBook = (book: DraftBook): boolean => {
  try {
    localStorage.setItem(DRAFTS_KEY, JSON.stringify({ version: STORE_VERSION, active: book.active, finished: book.finished }));
    return true;
  } catch { return false; }
};

/** Liefert alle fertigen Drafts als auswählbare Kader für den Fußballmodus. */
export const listDraftSquads: ListDraftSquads = () => toSquadOptions(loadDraftBook());
