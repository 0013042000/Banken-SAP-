import { describe, expect, it } from 'vitest';
import { fits, FORMATION_IDS, FORMATIONS, type FormationId } from '../../team';
import { BENCH_SIZE, OFFER_SIZE, RESERVE_SIZE, SQUAD_SIZE, START_SIZE, VARIANT_IDS } from '../config';
import {
  captainTargets, chooseCaptain, createDraft, draftedCount, exactCountOf, isComplete, nextOpenSlot, openSlot, phaseOf, pickCandidate,
  placeCaptain, squadPlayers, squadRatingOf, teamRatingOf, type DraftError, type DraftResult, type DraftState, type Squad,
} from '../engine';
import { seededRnd } from '../random';
import { must, P, simulate, unwrap } from './simulate';

const SEED = 42;
const OTHER_SEED = 43;
const UNKNOWN_INDEX = 99;

const fresh = (formation: FormationId = '4-3-3', seed: number = SEED): DraftState =>
  createDraft({ id: 'test', profile: 'semon', variant: 'mixed', formation, now: 1, rnd: seededRnd(seed) });
const errorOf = (result: DraftResult): DraftError | null => (result.ok ? null : result.error);
const firstCandidate = (state: DraftState): string => must(must(state.offer, 'Angebot').candidates[0], 'Kandidat');

/** Zustand nach gewähltem Kapitän (noch nicht zugeordnet). */
const withCaptainChosen = (): DraftState => { const s = fresh(); return unwrap(chooseCaptain(s, firstCandidate(s))); };
/** Zustand mit zugeordnetem Kapitän: bereit für die Startelf. */
const readyForStart = (): DraftState => { const s = withCaptainChosen(); return unwrap(placeCaptain(s, must(captainTargets(s)[0], 'Platz'))); };
const freeStartIndex = (state: DraftState, nth: number = 0): number =>
  must(state.start.flatMap((id, i) => (id === null ? [i] : []))[nth], 'freier Startplatz');

describe('Zustandsautomat', () => {
  it('beginnt mit einem gespeicherten Kapitänsangebot aus fünf Karten', () => {
    const s = fresh();
    expect(phaseOf(s)).toBe('captain');
    expect(s.offer?.kind).toBe('captain');
    expect(s.offer?.candidates).toHaveLength(OFFER_SIZE);
    expect(draftedCount(s)).toBe(0);
  });

  it('ist mit gleichem Startwert wiederholbar und mit anderem verschieden', () => {
    expect(fresh('4-4-2', SEED)).toEqual(fresh('4-4-2', SEED));
    expect(fresh('4-4-2', SEED).offer).not.toEqual(fresh('4-4-2', OTHER_SEED).offer);
  });

  it('vor der Kapitänswahl lässt sich kein Platz öffnen und nichts anderes wählen', () => {
    const s = fresh();
    expect(errorOf(openSlot(s, { group: 'start', index: 0 }, seededRnd(SEED)))).toBe('offer-open');
    expect(errorOf(pickCandidate(s, firstCandidate(s)))).toBe('no-offer');
    expect(errorOf(chooseCaptain(s, 'gibt-es-nicht'))).toBe('not-offered');
    expect(errorOf(placeCaptain(s, 0))).toBe('wrong-phase');
  });

  it('der Kapitän muss zuerst einem passenden Platz zugeordnet werden', () => {
    const s = withCaptainChosen();
    const captain = P(must(s.captainId, 'Kapitän'));
    expect(phaseOf(s)).toBe('captainPlace');
    expect(s.offer).toBeNull();
    expect(draftedCount(s)).toBe(0);
    expect(errorOf(openSlot(s, { group: 'start', index: 0 }, seededRnd(SEED)))).toBe('wrong-phase');
    expect(errorOf(placeCaptain(s, UNKNOWN_INDEX))).toBe('unknown-slot');
    const targets = captainTargets(s);
    expect(targets.length).toBeGreaterThan(0);
    FORMATIONS[s.formation].forEach((slot, i) => {
      expect(targets.includes(i)).toBe(fits(captain, slot.role));
      expect(errorOf(placeCaptain(s, i))).toBe(fits(captain, slot.role) ? null : 'not-fitting');
    });
    const placed = unwrap(placeCaptain(s, must(targets[0], 'Platz')));
    expect(placed.start[must(targets[0], 'Platz')]).toBe(captain.id);
    expect(phaseOf(placed)).toBe('start');
    expect(errorOf(chooseCaptain(placed, captain.id))).toBe('no-offer');
  });

  it('es gibt immer nur ein offenes Angebot', () => {
    const s = readyForStart();
    const a = freeStartIndex(s, 0);
    const b = freeStartIndex(s, 1);
    const opened = unwrap(openSlot(s, { group: 'start', index: a }, seededRnd(SEED)));
    expect(opened.offer).toMatchObject({ kind: 'slot', slot: { group: 'start', index: a } });
    expect(errorOf(openSlot(opened, { group: 'start', index: b }, seededRnd(SEED)))).toBe('offer-open');
    expect(errorOf(openSlot(opened, { group: 'start', index: a }, seededRnd(OTHER_SEED)))).toBe('offer-open');
    expect(nextOpenSlot(opened)).toBeNull();
    expect(errorOf(pickCandidate(opened, 'gibt-es-nicht'))).toBe('not-offered');
    const picked = unwrap(pickCandidate(opened, firstCandidate(opened)));
    expect(picked.start[a]).toBe(firstCandidate(opened));
    expect(picked.offer).toBeNull();
    expect(errorOf(pickCandidate(picked, firstCandidate(opened)))).toBe('no-offer');
    expect(unwrap(openSlot(picked, { group: 'start', index: b }, seededRnd(SEED))).offer?.kind).toBe('slot');
  });

  it.each([
    { name: 'besetzter Platz', ref: (s: DraftState) => ({ group: 'start' as const, index: s.start.findIndex((id) => id !== null) }), error: 'slot-taken' },
    { name: 'Bank vor voller Startelf', ref: () => ({ group: 'bench' as const, index: 0 }), error: 'wrong-phase' },
    { name: 'Reserve vor voller Bank', ref: () => ({ group: 'reserve' as const, index: 0 }), error: 'wrong-phase' },
    { name: 'unbekannter Platz', ref: () => ({ group: 'start' as const, index: UNKNOWN_INDEX }), error: 'unknown-slot' },
    { name: 'negativer Platz', ref: () => ({ group: 'start' as const, index: -1 }), error: 'unknown-slot' },
  ])('öffnet nicht: $name', ({ ref, error }) => {
    const s = readyForStart();
    const result = openSlot(s, ref(s), seededRnd(SEED));
    expect(errorOf(result)).toBe(error);
  });

  it('fehlgeschlagene Schritte lassen den Zustand unangetastet', () => {
    const s = readyForStart();
    const before = JSON.stringify(s);
    openSlot(s, { group: 'bench', index: 0 }, seededRnd(SEED));
    pickCandidate(s, 'mbappe');
    placeCaptain(s, 0);
    expect(JSON.stringify(s)).toBe(before);
  });

  it.each(VARIANT_IDS.flatMap((variant) => FORMATION_IDS.map((formation) => ({ variant, formation }))))(
    'Reihenfolge Kapitän → Startelf → Bank → Reserve, am Ende 23 ohne Doppelperson ($variant, $formation)',
    ({ variant, formation }) => {
      const run = simulate({ variant, formation, strategy: 'zufall', order: 'gemischt', seed: SEED });
      const groups = run.offers.map((log) => (log.offer.kind === 'slot' ? log.offer.slot.group : 'captain'));
      expect(groups).toEqual([
        'captain',
        ...Array.from({ length: START_SIZE - 1 }, () => 'start'),
        ...Array.from({ length: BENCH_SIZE }, () => 'bench'),
        ...Array.from({ length: RESERVE_SIZE }, () => 'reserve'),
      ]);
      expect(isComplete(run.state)).toBe(true);
      expect(phaseOf(run.state)).toBe('done');
      expect(run.state.offer).toBeNull();
      expect(nextOpenSlot(run.state)).toBeNull();
      const players = squadPlayers(run.state);
      expect(players).toHaveLength(SQUAD_SIZE);
      expect(new Set(players.map((p) => p.person)).size).toBe(SQUAD_SIZE);
      expect(run.state.start).toContain(run.state.captainId);
      run.state.start.forEach((id, i) => expect(fits(P(must(id, 'Startspieler')), must(FORMATIONS[formation][i], 'Platz').role)).toBe(true));
      expect(players.filter((p) => p.pos === 'TW')).toHaveLength(['start', 'bench', 'reserve'].length);
      expect(errorOf(openSlot(run.state, { group: 'reserve', index: 0 }, seededRnd(SEED)))).toBe('wrong-phase');
    },
  );

  it('nextOpenSlot zeigt den ersten freien Platz des aktuellen Abschnitts', () => {
    const s = readyForStart();
    expect(nextOpenSlot(s)).toEqual({ group: 'start', index: freeStartIndex(s) });
    expect(nextOpenSlot(fresh())).toBeNull();
  });
});

describe('Wertungen', () => {
  const EMPTY_START = Array.from({ length: START_SIZE }, () => null);
  const squad = (start: readonly (string | null)[], bench: readonly (string | null)[] = []): Squad => ({
    id: 'w', profile: 'ariel', variant: 'mixed', formation: '4-3-3', createdAt: 0, captainId: null,
    start: [...start, ...EMPTY_START].slice(0, START_SIZE),
    bench: [...bench, ...EMPTY_START].slice(0, BENCH_SIZE),
    reserve: EMPTY_START.slice(0, RESERVE_SIZE),
  });
  const roundedAverage = (ids: readonly string[]): number => Math.round(ids.reduce((sum, id) => sum + P(id).ovr, 0) / ids.length);

  it('leerer Kader: keine Wertung, vorläufig', () => {
    expect(teamRatingOf(squad([]))).toEqual({ rating: null, count: 0, provisional: true });
    expect(squadRatingOf(squad([]))).toEqual({ rating: null, count: 0, provisional: true });
    expect(exactCountOf(squad([]))).toBe(0);
  });

  it('Teamwertung zählt nur die Startelf, Kaderwertung alle gedrafteten Spieler', () => {
    const start = ['neuer', 'theo', 'vandijk'];
    const bench = ['buffon', 'maldini'];
    const s = squad(start, bench);
    expect(teamRatingOf(s)).toEqual({ rating: roundedAverage(start), count: start.length, provisional: true });
    expect(squadRatingOf(s)).toEqual({ rating: roundedAverage([...start, ...bench]), count: start.length + bench.length, provisional: true });
  });

  it('volle Startelf ist nicht mehr vorläufig; der volle Kader auch nicht', () => {
    const run = simulate({ variant: 'dream', formation: '4-4-2', strategy: 'besteKarte', order: 'vorwaerts', seed: SEED });
    const ids = run.state.start.map((id) => must(id, 'Startspieler'));
    expect(teamRatingOf(run.state)).toEqual({ rating: roundedAverage(ids), count: START_SIZE, provisional: false });
    expect(squadRatingOf(run.state)).toEqual({ rating: roundedAverage(squadPlayers(run.state).map((p) => p.id)), count: SQUAD_SIZE, provisional: false });
  });

  it('Positionspassung zählt nur exakte Kartenpositionen', () => {
    // 4-3-3: Platz 0 = TW, Platz 1 = LV, Platz 2 = IV. Ein Rechtsverteidiger passt links, steht dort aber nicht exakt.
    const exactAll = squad(['neuer', 'theo', 'vandijk']);
    const oneRelated = squad(['neuer', 'hakimi', 'vandijk']);
    expect(exactCountOf(exactAll)).toBe(exactAll.start.filter((id) => id !== null).length);
    expect(exactCountOf(oneRelated)).toBe(exactCountOf(exactAll) - 1);
  });
});
