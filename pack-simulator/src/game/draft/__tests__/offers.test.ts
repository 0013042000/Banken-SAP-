import { describe, expect, it } from 'vitest';
import { PLAYERS, type Player } from '../../../data/players';
import { fits, FORMATION_IDS, FORMATIONS, type FormationId } from '../../team';
import { OFFER_SIZE, SQUAD_SIZE, VARIANT_IDS, VARIANTS, type VariantId } from '../config';
import {
  createDraft, isLegalSquad, openSlot, phaseOf, placeCaptain, SLOT_GROUPS, slotInfo, slotsOf, squadPlayers, takenPersons, variantAllows,
  type DraftState, type SlotGroup, type SlotInfo,
} from '../engine';
import { seededRnd } from '../random';
import { must, ORDER_IDS, P, simulate, STRATEGY_IDS, unwrap, type OfferLog, type Run, type RunPlan } from './simulate';

const SEEDS_PER_PLAN = 8;
const SEED_STRIDE = 7919;
const REROLLS = 300;
const TOP_OVR = 90;
const STRONG_OVR = 88;
const DREAM_FLOOR = 86;
const DREAM_MIN_STRONG_SHARE = 0.75;
const DREAM_MIN_TOP_SHARE = 0.5;
const MIXED_LOW_OVR = 84;
const OFFERS_PER_DRAFT = SQUAD_SIZE;

const COMBOS = VARIANT_IDS.flatMap((variant) => FORMATION_IDS.map((formation) => ({ variant, formation })));

const plansFor = (variant: VariantId, formation: FormationId): RunPlan[] =>
  STRATEGY_IDS.flatMap((strategy, s) => ORDER_IDS.flatMap((order, o) =>
    Array.from({ length: SEEDS_PER_PLAN }, (_, i) => ({ variant, formation, strategy, order, seed: (s + 1) * SEED_STRIDE + o * SEEDS_PER_PLAN + i }))));

const persons = (players: readonly Player[]): Set<string> => new Set(players.map((p) => p.person));

/** Regulär zulässig: Startplätze nach `fits`, Bank und Reserve nach ihrer Linie; der Kapitän braucht einen Startplatz und die Mindestbewertung. */
const allowedHere = (log: OfferLog, p: Player): boolean => {
  if (log.offer.kind === 'captain') {
    return p.ovr >= VARIANTS[log.before.variant].captainMinOvr && FORMATIONS[log.before.formation].some((slot) => fits(p, slot.role));
  }
  const info = must(slotInfo(log.before.formation, log.offer.slot), 'Platz');
  const role = FORMATIONS[log.before.formation][log.offer.slot.index]?.role;
  return info.positions.includes(p.pos) && (log.offer.slot.group !== 'start' || (role !== undefined && fits(p, role)));
};

const RULES: readonly (readonly [name: string, holds: (log: OfferLog, players: readonly Player[]) => boolean])[] = [
  ['genau fünf Kandidaten', (_log, players) => players.length === OFFER_SIZE],
  ['fünf verschiedene Personen', (_log, players) => persons(players).size === players.length],
  ['keine bereits gedraftete Person', (log, players) => players.every((p) => !takenPersons(log.before).has(p.person))],
  ['gehört zur Variante', (log, players) => players.every((p) => variantAllows(log.before.variant, p))],
  ['passt auf den Platz', (log, players) => players.every((p) => allowedHere(log, p))],
  ['ohne Notfallstufe', (log) => !log.offer.relaxed],
];

const problemsOf = (run: Run): string[] =>
  run.offers.flatMap((log, step) => RULES.filter(([, holds]) => !holds(log, log.offer.candidates.map(P))).map(([name]) => `Schritt ${step + 1}: ${name}`));

describe('Machbarkeit: jeder der 23 Schritte hat fünf zulässige Kandidaten', () => {
  it.each(COMBOS)('$variant in $formation – alle Strategien und Reihenfolgen', ({ variant, formation }) => {
    const runs = plansFor(variant, formation).map(simulate);
    expect(runs).toHaveLength(STRATEGY_IDS.length * ORDER_IDS.length * SEEDS_PER_PLAN);
    expect(runs.flatMap(problemsOf)).toEqual([]);
    const fallbackUses = runs.flatMap((run) => run.offers).filter((log) => log.offer.relaxed).length;
    expect(fallbackUses).toBe(0);
    runs.forEach((run) => {
      expect(run.offers).toHaveLength(OFFERS_PER_DRAFT);
      expect(phaseOf(run.state)).toBe('done');
      expect(squadPlayers(run.state)).toHaveLength(SQUAD_SIZE);
      expect(persons(squadPlayers(run.state)).size).toBe(SQUAD_SIZE);
      expect(isLegalSquad(run.state)).toBe(true);
    });
  });
});

describe('Bestand reicht rechnerisch für jede Wahl', () => {
  const rankOf = (group: SlotGroup): number => SLOT_GROUPS.indexOf(group);
  const allSlots = (formation: FormationId): SlotInfo[] => SLOT_GROUPS.flatMap(slotsOf).map((ref) => must(slotInfo(formation, ref), 'Platz'));
  const supplyOf = (variant: VariantId, info: SlotInfo): Set<string> =>
    persons(PLAYERS.filter((p) => variantAllows(variant, p) && info.positions.includes(p.pos)));

  // Schlechtester Fall: Jeder früher oder im selben Abschnitt besetzte Platz, der dieselben
  // Positionen annimmt, hat dem Platz schon eine Person weggenommen. Reicht der Rest für ein
  // volles Angebot, kann keine Wahlstrategie den Platz unbesetzbar machen.
  it.each(COMBOS)('$variant in $formation', ({ variant, formation }) => {
    const slots = allSlots(formation);
    const short = slots.flatMap((info) => {
      const supply = supplyOf(variant, info);
      const rivals = slots.filter((other) => other !== info
        && rankOf(other.ref.group) <= rankOf(info.ref.group)
        && [...supplyOf(variant, other)].some((person) => supply.has(person)));
      return supply.size - rivals.length >= OFFER_SIZE ? [] : [`${info.label}: ${supply.size} Personen, ${rivals.length} mögliche Vorgänger`];
    });
    expect(short).toEqual([]);
  });

  it.each(COMBOS)('Kapitänsangebot in $variant / $formation hat genug starke, platzierbare Personen', ({ variant, formation }) => {
    const strong = PLAYERS.filter((p) => variantAllows(variant, p) && p.ovr >= VARIANTS[variant].captainMinOvr
      && FORMATIONS[formation].some((slot) => fits(p, slot.role)));
    expect(persons(strong).size).toBeGreaterThanOrEqual(OFFER_SIZE);
  });
});

describe('Kapitän', () => {
  it.each(COMBOS)('ist in $variant / $formation immer platzierbar', ({ variant, formation }) => {
    Array.from({ length: REROLLS }, (_, seed) => createDraft({ id: 'k', profile: 'ariel', variant, formation, now: 0, rnd: seededRnd(seed) }))
      .forEach((draft) => {
        const candidates = must(draft.offer, 'Kapitänsangebot').candidates.map(P);
        expect(candidates).toHaveLength(OFFER_SIZE);
        expect(persons(candidates).size).toBe(OFFER_SIZE);
        candidates.forEach((p) => expect(FORMATIONS[formation].some((slot) => fits(p, slot.role)), `${p.name} in ${formation}`).toBe(true));
      });
  });
});

describe('Keine doppelte Person – auch nicht als andere Kartenversion', () => {
  const withCaptain = (captainId: string, formation: FormationId, slotId: string): DraftState => {
    const draft = createDraft({ id: 'v', profile: 'semon', variant: 'mixed', formation, now: 0, rnd: seededRnd(1) });
    const index = FORMATIONS[formation].findIndex((slot) => slot.id === slotId);
    return unwrap(placeCaptain({ ...draft, captainId, offer: null }, index));
  };

  it.each([
    { captain: 'messi', other: 'messi-prime', slot: 'RF', open: 'LF' },
    { captain: 'messi-prime', other: 'messi', slot: 'RF', open: 'LF' },
    { captain: 'cr7', other: 'cr7-prime', slot: 'ST1', open: 'ST2' },
  ])('$captain im Kader: $other wird nie angeboten', ({ captain, other, slot, open }) => {
    const formation: FormationId = slot === 'RF' ? '4-3-3' : '4-4-2';
    const state = withCaptain(captain, formation, slot);
    const index = FORMATIONS[formation].findIndex((s) => s.id === open);
    const role = must(FORMATIONS[formation][index], 'Platz').role;
    expect(P(other).person).toBe(P(captain).person);
    expect(fits(P(other), role) && variantAllows('mixed', P(other))).toBe(true);
    const offered = Array.from({ length: REROLLS }, (_, seed) => unwrap(openSlot(state, { group: 'start', index }, seededRnd(seed))))
      .flatMap((s) => must(s.offer, 'Angebot').candidates);
    expect(offered).not.toContain(other);
    expect(offered).not.toContain(captain);
    expect(new Set(offered).size).toBeGreaterThan(OFFER_SIZE);
  });

  it('ein Angebot enthält nie zwei Karten derselben Person', () => {
    const state = withCaptain('haaland', '4-3-3', 'ST');
    const index = FORMATIONS['4-3-3'].findIndex((s) => s.id === 'RF');
    const doubles = Array.from({ length: REROLLS }, (_, seed) => must(unwrap(openSlot(state, { group: 'start', index }, seededRnd(seed))).offer, 'Angebot'))
      .filter((offer) => persons(offer.candidates.map(P)).size !== offer.candidates.length);
    expect(doubles).toEqual([]);
  });
});

describe('Varianten', () => {
  const offered = (variant: VariantId): Player[] =>
    FORMATION_IDS.flatMap((formation) => plansFor(variant, formation)).filter((plan) => plan.strategy === 'zufall')
      .flatMap((plan) => simulate(plan).offers).filter((log) => log.offer.kind === 'slot').flatMap((log) => log.offer.candidates.map(P));
  const share = (players: readonly Player[], minOvr: number): number => players.filter((p) => p.ovr >= minOvr).length / players.length;

  it('Legenden-Draft bietet nur Legenden an und kann jede Position besetzen', () => {
    const cards = offered('legend');
    expect(cards.every((p) => p.cat === 'legend')).toBe(true);
    expect(new Set(cards.map((p) => p.pos))).toEqual(new Set(PLAYERS.map((p) => p.pos)));
  });

  it('Traum-Draft: nur starke Karten, Schwerpunkt 88+, hoher Anteil 90+', () => {
    const cards = offered('dream');
    expect(Math.min(...cards.map((p) => p.ovr))).toBeGreaterThanOrEqual(DREAM_FLOOR);
    expect(share(cards, STRONG_OVR)).toBeGreaterThan(DREAM_MIN_STRONG_SHARE);
    expect(share(cards, TOP_OVR)).toBeGreaterThan(DREAM_MIN_TOP_SHARE);
  });

  it('Gemischter Draft mischt alle Kategorien und Bewertungsstufen', () => {
    const cards = offered('mixed');
    expect(new Set(cards.map((p) => p.cat))).toEqual(new Set(['gold', 'star', 'legend']));
    expect(cards.some((p) => p.ovr < MIXED_LOW_OVR)).toBe(true);
    expect(cards.some((p) => p.ovr >= TOP_OVR)).toBe(true);
    expect(share(cards, TOP_OVR)).toBeLessThan(share(offered('dream'), TOP_OVR));
  });
});
