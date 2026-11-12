import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_FINISHED_PER_PROFILE, OFFER_SIZE, SQUAD_SIZE, START_SIZE } from '../config';
import {
  captainTargets, chooseCaptain, createDraft, draftedCount, openSlot, phaseOf, pickCandidate, placeCaptain, teamRatingOf,
  type DraftState,
} from '../engine';
import { seededRnd } from '../random';
import {
  DRAFTS_KEY, emptyBook, finishDraft, finishedOf, hasRoomFor, listDraftSquads, loadDraftBook, newDraftId, removeFinished,
  sanitizeDraftBook, saveDraftBook, squadOptionId, toSquadOptions, withActive, type DraftBook, type FinishedDraft,
} from '../store';
import { must, P, simulate, unwrap } from './simulate';

const SEED = 7;
const NOW = 1_700_000_000_000;
const LATER = NOW + 1;
const PICKS_BEFORE_RELOAD = 4;

type Json = Record<string, unknown>;

const memoryStorage = (): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> => {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: (key) => { data.delete(key); },
  };
};

const brokenStorage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> = {
  getItem: () => { throw new Error('gesperrt'); },
  setItem: () => { throw new Error('voll'); },
  removeItem: () => { throw new Error('gesperrt'); },
};

const firstCandidate = (state: DraftState): string => must(must(state.offer, 'Angebot').candidates[0], 'Kandidat');

/** Laufender Draft mit Kapitän und einigen Spielern; am Ende ist ein Angebot offen. */
const midDraft = (picks: number = PICKS_BEFORE_RELOAD): DraftState => {
  const rnd = seededRnd(SEED);
  const created = createDraft({ id: 'lauf', profile: 'semon', variant: 'legend', formation: '4-2-3-1', now: NOW, rnd });
  const chosen = unwrap(chooseCaptain(created, firstCandidate(created)));
  const placed = unwrap(placeCaptain(chosen, must(captainTargets(chosen)[0], 'Platz')));
  const open = (state: DraftState): DraftState => unwrap(openSlot(state, { group: 'start', index: state.start.indexOf(null) }, rnd));
  const filled = Array.from({ length: picks }).reduce<DraftState>((state) => {
    const opened = open(state);
    return unwrap(pickCandidate(opened, firstCandidate(opened)));
  }, placed);
  return open(filled);
};

const complete = (id: string, seed: number = SEED, profile: 'semon' | 'ariel' = 'semon'): DraftState =>
  ({ ...simulate({ variant: 'legend', formation: '4-3-3', strategy: 'zufall', order: 'vorwaerts', seed }).state, id, profile });

const bookWith = (states: readonly DraftState[]): DraftBook =>
  states.reduce<DraftBook>((book, state, i) => {
    const result = finishDraft(book, state, NOW + i);
    if (!result.ok) throw new Error(result.error);
    return result.book;
  }, emptyBook());

/** Gespeicherte Rohdaten als frei veränderbare Kopie. */
const rawOf = (book: DraftBook): { active: Record<string, Json | null>; finished: Json[] } => {
  saveDraftBook(book);
  // Testhilfe: Die Rohdaten werden absichtlich untypisiert verändert, um beschädigte Speicherstände nachzustellen.
  return JSON.parse(must(localStorage.getItem(DRAFTS_KEY), 'Speicherstand')) as { active: Record<string, Json | null>; finished: Json[] };
};
const swapFirst = (list: unknown, id: string | null): unknown[] => [id, ...(Array.isArray(list) ? list.slice(1) : [])];
const swapFirstTwo = (list: unknown): unknown[] => {
  const [first, second, ...rest]: unknown[] = Array.isArray(list) ? list : [];
  return [second, first, ...rest];
};

beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
afterEach(() => { vi.unstubAllGlobals(); });

describe('Speichern und Wiederherstellen', () => {
  it('ein offenes Angebot bleibt nach dem Neuladen identisch', () => {
    const state = midDraft();
    expect(saveDraftBook(withActive(emptyBook(), 'semon', state))).toBe(true);
    const loaded = loadDraftBook();
    expect(loaded.active.semon).toEqual(state);
    expect(loaded.active.semon?.offer?.candidates).toEqual(state.offer?.candidates);
    expect(loaded.active.semon?.offer?.candidates).toHaveLength(OFFER_SIZE);
    expect(loaded.active.ariel).toBeNull();
    expect(loadDraftBook()).toEqual(loaded);
  });

  it('auch das Kapitänsangebot und der noch nicht zugeordnete Kapitän bleiben erhalten', () => {
    const created = createDraft({ id: 'neu', profile: 'ariel', variant: 'dream', formation: '3-5-2', now: NOW, rnd: seededRnd(SEED) });
    saveDraftBook(withActive(emptyBook(), 'ariel', created));
    expect(loadDraftBook().active.ariel).toEqual(created);
    const chosen = unwrap(chooseCaptain(created, firstCandidate(created)));
    saveDraftBook(withActive(emptyBook(), 'ariel', chosen));
    expect(loadDraftBook().active.ariel).toEqual(chosen);
    expect(phaseOf(must(loadDraftBook().active.ariel, 'Draft'))).toBe('captainPlace');
  });

  it('gespeichert werden nur Karten-IDs, keine Spielerdatensätze', () => {
    saveDraftBook(withActive(bookWith([complete('a')]), 'semon', midDraft()));
    const text = must(localStorage.getItem(DRAFTS_KEY), 'Speicherstand');
    expect(text).not.toMatch('"name"');
    expect(text).not.toMatch('"ovr"');
    expect(text).not.toMatch('"nation"');
    expect(text).toContain('"version":1');
  });

  it('nicht verfügbarer Speicher: Laden liefert einen leeren Stand, Speichern meldet false', () => {
    vi.stubGlobal('localStorage', brokenStorage);
    expect(loadDraftBook()).toEqual(emptyBook());
    expect(saveDraftBook(emptyBook())).toBe(false);
    expect(listDraftSquads()).toEqual([]);
  });
});

describe('Beschädigte Speicherdaten', () => {
  it.each([
    ['kein JSON', '{kaputt'],
    ['leere Zeichenkette', ''],
    ['Zahl', '42'],
    ['Liste', '[1,2,3]'],
    ['null', 'null'],
    ['falsche Typen', '{"active":"x","finished":{"a":1}}'],
    ['Einträge ohne Inhalt', '{"active":{"semon":7,"ariel":[]},"finished":[null,3,"x",{}]}'],
  ])('%s → leerer Stand ohne Absturz', (_name, text) => {
    localStorage.setItem(DRAFTS_KEY, text);
    expect(loadDraftBook()).toEqual(emptyBook());
    expect(listDraftSquads()).toEqual([]);
  });

  const good = (): DraftBook => bookWith([complete('gut', SEED), complete('auch-gut', SEED + 1)]);
  const firstStart = (book: DraftBook): string => must(must(book.finished[0], 'Draft').start[0], 'Torwart');

  it.each<[string, (entry: Json, book: DraftBook) => Json]>([
    ['unbekannte Spieler-ID', (entry) => ({ ...entry, start: swapFirst(entry.start, 'gibt-es-nicht') })],
    ['fehlender Spieler', (entry) => ({ ...entry, start: swapFirst(entry.start, null) })],
    ['doppelte Person', (entry, book) => ({ ...entry, bench: swapFirst(entry.bench, firstStart(book)) })],
    ['Feldspieler im Tor, Torwart in der Abwehr', (entry) => ({ ...entry, start: swapFirstTwo(entry.start) })],
    ['Torwart auf dem Abwehrplatz der Bank', (entry) => ({ ...entry, bench: swapFirstTwo(entry.bench) })],
    ['zu kurze Startelf', (entry) => ({ ...entry, start: Array.isArray(entry.start) ? entry.start.slice(1) : [] })],
    ['unbekannte Formation', (entry) => ({ ...entry, formation: '5-5-5' })],
    ['unbekannte Variante', (entry) => ({ ...entry, variant: 'gratis' })],
    ['unbekanntes Profil', (entry) => ({ ...entry, profile: 'fremd' })],
    ['fehlende Kennung', (entry) => ({ ...entry, id: '' })],
    ['Spielerliste als Text', (entry) => ({ ...entry, reserve: 'alle' })],
  ])('fertiger Draft mit Fehler „%s“ wird übersprungen, der Rest bleibt', (_name, damage) => {
    const book = good();
    const raw = rawOf(book);
    const damaged = { ...raw, finished: [damage(must(raw.finished[0], 'Eintrag'), book), ...raw.finished.slice(1)] };
    const clean = sanitizeDraftBook(damaged);
    expect(clean.finished.map((f) => f.id)).toEqual(['auch-gut']);
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(damaged));
    expect(listDraftSquads().map((s) => s.id)).toEqual([squadOptionId('auch-gut')]);
  });

  it('doppelte Kennungen werden nur einmal übernommen', () => {
    const raw = rawOf(good());
    const clean = sanitizeDraftBook({ ...raw, finished: [...raw.finished, ...raw.finished] });
    expect(clean.finished.map((f) => f.id)).toEqual(['gut', 'auch-gut']);
  });

  it('kaputtes offenes Angebot: gewählte Spieler bleiben, das Angebot wird verworfen', () => {
    const state = midDraft();
    const raw = rawOf(withActive(emptyBook(), 'semon', state));
    const taken = must(state.start.find((id) => id !== null), 'gedrafteter Spieler');
    const active = { ...raw.active, semon: { ...raw.active.semon, offer: { kind: 'slot', slot: { group: 'start', index: state.start.indexOf(null) }, candidates: [taken], relaxed: 0 } } };
    const clean = must(sanitizeDraftBook({ ...raw, active }).active.semon, 'Draft');
    expect(clean.offer).toBeNull();
    expect(clean.start).toEqual(state.start);
    expect(draftedCount(clean)).toBe(PICKS_BEFORE_RELOAD + 1);
  });

  it.each<[string, (offer: Json) => Json]>([
    ['Angebot für einen besetzten Platz', (offer) => ({ ...offer, slot: { group: 'start', index: 0 } })],
    ['Angebot für einen späteren Abschnitt', (offer) => ({ ...offer, slot: { group: 'reserve', index: 0 } })],
    ['Angebot mit unbekannter Karte', (offer) => ({ ...offer, candidates: ['gibt-es-nicht'] })],
    ['Angebot mit zwei Karten derselben Person', (offer) => ({ ...offer, candidates: ['r9', 'r9'] })],
    ['Angebot ohne Kandidaten', (offer) => ({ ...offer, candidates: [] })],
    ['Angebot unbekannter Art', (offer) => ({ ...offer, kind: 'geschenk' })],
    ['Kapitänsangebot mitten im Draft', (offer) => ({ ...offer, kind: 'captain' })],
  ])('%s wird verworfen', (_name, damage) => {
    const state = midDraft();
    const raw = rawOf(withActive(emptyBook(), 'semon', state));
    const semon = must(raw.active.semon, 'Draft');
    // Das gespeicherte Angebot ist ein JSON-Objekt; die Testhilfe verändert es gezielt.
    const active = { ...raw.active, semon: { ...semon, offer: damage(semon.offer as Json) } };
    expect(must(sanitizeDraftBook({ ...raw, active }).active.semon, 'Draft').offer).toBeNull();
  });

  it('laufender Draft ohne gültiges Kapitänsangebot oder im falschen Profil wird verworfen', () => {
    const created = createDraft({ id: 'neu', profile: 'semon', variant: 'mixed', formation: '4-4-2', now: NOW, rnd: seededRnd(SEED) });
    const raw = rawOf(withActive(emptyBook(), 'semon', created));
    expect(sanitizeDraftBook({ ...raw, active: { semon: { ...raw.active.semon, offer: null } } }).active.semon).toBeNull();
    expect(sanitizeDraftBook({ ...raw, active: { ariel: raw.active.semon } }).active.ariel).toBeNull();
  });

  it('Bankspieler ohne volle Startelf machen den laufenden Draft ungültig', () => {
    const state = midDraft();
    const raw = rawOf(withActive(emptyBook(), 'semon', state));
    const active = { semon: { ...raw.active.semon, bench: swapFirst(must(raw.active.semon, 'Draft').bench, 'buffon') } };
    expect(sanitizeDraftBook({ ...raw, active }).active.semon).toBeNull();
  });
});

describe('Fertige Drafts', () => {
  it('ein unvollständiger Draft lässt sich nicht abschließen', () => {
    expect(finishDraft(emptyBook(), midDraft(), NOW)).toEqual({ ok: false, error: 'incomplete' });
  });

  it('Abschließen legt den Kader ab und beendet den laufenden Draft des Profils', () => {
    const state = complete('fertig');
    const other = midDraft();
    const before = withActive(withActive(emptyBook(), 'semon', state), 'ariel', { ...other, profile: 'ariel' });
    const result = finishDraft(before, state, LATER);
    if (!result.ok) throw new Error(result.error);
    expect(result.book.active.semon).toBeNull();
    expect(result.book.active.ariel).not.toBeNull();
    expect(result.finished).toMatchObject({ id: 'fertig', profile: 'semon', finishedAt: LATER, start: state.start, bench: state.bench, reserve: state.reserve });
    expect(result.finished).not.toHaveProperty('offer');
    saveDraftBook(result.book);
    expect(loadDraftBook()).toEqual(result.book);
  });

  it('Obergrenze je Profil: kein stilles Löschen, das andere Profil bleibt frei', () => {
    const full = bookWith(Array.from({ length: MAX_FINISHED_PER_PROFILE }, (_, i) => complete(`s${i}`, SEED + i)));
    expect(finishedOf(full, 'semon')).toHaveLength(MAX_FINISHED_PER_PROFILE);
    expect(hasRoomFor(full, 'semon')).toBe(false);
    expect(hasRoomFor(full, 'ariel')).toBe(true);
    expect(finishDraft(full, complete('zuviel'), LATER)).toEqual({ ok: false, error: 'limit' });
    expect(finishDraft(full, complete('ariel-1', SEED, 'ariel'), LATER).ok).toBe(true);
    const freed = removeFinished(full, 's0');
    expect(hasRoomFor(freed, 'semon')).toBe(true);
    expect(finishDraft(freed, complete('passt'), LATER).ok).toBe(true);
    saveDraftBook(full);
    expect(loadDraftBook().finished).toHaveLength(MAX_FINISHED_PER_PROFILE);
  });

  it('Löschen entfernt genau einen fertigen Draft', () => {
    const book = bookWith([complete('a', SEED), complete('b', SEED + 1)]);
    expect(removeFinished(book, 'a').finished.map((f) => f.id)).toEqual(['b']);
    expect(removeFinished(book, 'gibt-es-nicht')).toEqual(book);
  });

  it('neue Kennungen sind eindeutig genug und enthalten keine Sonderzeichen', () => {
    const ids = Array.from({ length: MAX_FINISHED_PER_PROFILE }, (_, i) => newDraftId(NOW + i, seededRnd(i)));
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id.split('').every((ch) => 'abcdefghijklmnopqrstuvwxyz0123456789'.includes(ch))).toBe(true));
  });
});

describe('listDraftSquads', () => {
  it('liefert ohne Speicherstand eine leere Liste', () => {
    expect(listDraftSquads()).toEqual([]);
  });

  it('laufende Drafts erscheinen nicht, fertige als vollständiger Kader', () => {
    const state = complete('x1');
    saveDraftBook(withActive(bookWith([state]), 'ariel', { ...midDraft(), profile: 'ariel' }));
    const squads = listDraftSquads();
    expect(squads).toHaveLength(1);
    const squad = must(squads[0], 'Kader');
    expect(squad).toMatchObject({ id: 'draft:x1', kind: 'draft', owner: 'semon', label: 'Legenden-Draft · 4-3-3' });
    expect(squad.players).toHaveLength(SQUAD_SIZE);
    expect(new Set(squad.players.map((p) => p.person)).size).toBe(SQUAD_SIZE);
    expect(squad.players.slice(0, START_SIZE).map((p) => p.id)).toEqual(state.start);
    expect(squad.players.every((p) => p === P(p.id))).toBe(true);
    const startOvr = state.start.map((id) => P(must(id, 'Startspieler')).ovr);
    expect(squad.rating).toBe(Math.round(startOvr.reduce((a, b) => a + b, 0) / START_SIZE));
    expect(squad.rating).toBe(teamRatingOf(state).rating);
  });

  it('neueste zuerst; gleichartige Drafts eines Profils werden durchnummeriert', () => {
    const book = bookWith([complete('alt', SEED), complete('neu', SEED + 1), complete('ariel', SEED + 1 + 1, 'ariel')]);
    const squads = toSquadOptions(book);
    expect(squads.map((s) => s.id)).toEqual(['draft:ariel', 'draft:neu', 'draft:alt']);
    expect(squads.map((s) => s.label)).toEqual(['Legenden-Draft · 4-3-3', 'Legenden-Draft · 4-3-3 (2)', 'Legenden-Draft · 4-3-3 (1)']);
    expect(squads.map((s) => s.owner)).toEqual(['ariel', 'semon', 'semon']);
  });

  it('jeder gespeicherte fertige Draft ist ein gültiger FinishedDraft mit 23 IDs', () => {
    saveDraftBook(bookWith([complete('p1'), complete('p2', SEED + 1, 'ariel')]));
    const stored: readonly FinishedDraft[] = loadDraftBook().finished;
    stored.forEach((f) => expect([...f.start, ...f.bench, ...f.reserve].filter((id) => typeof id === 'string')).toHaveLength(SQUAD_SIZE));
  });
});
