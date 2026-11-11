import { PLAYER_BY_ID, PLAYERS, type Player } from '../../../data/players';
import type { FormationId } from '../../team';
import type { VariantId } from '../config';
import {
  captainTargets, chooseCaptain, createDraft, openSlot, phaseOf, pickCandidate, placeCaptain, SLOT_GROUPS, slotInfo, slotsOf,
  takenPersons, variantAllows, type DraftPhase, type DraftResult, type DraftState, type Offer, type SlotRef,
} from '../engine';
import { pickOne, seededRnd, shuffled, type Rnd } from '../random';

/** Ein aufgedecktes Angebot samt dem Zustand, in dem es entstand. */
export interface OfferLog {
  readonly before: DraftState;
  readonly offer: Offer;
  readonly chosen: string;
}

export interface Run {
  readonly state: DraftState;
  readonly offers: readonly OfferLog[];
}

export interface RunPlan {
  readonly variant: VariantId;
  readonly formation: FormationId;
  readonly strategy: StrategyId;
  readonly order: OrderId;
  readonly seed: number;
}

type Strategy = (state: DraftState, candidates: readonly Player[], rnd: Rnd) => Player;
type Order = (open: readonly SlotRef[], rnd: Rnd) => SlotRef;

export const STRATEGY_IDS = ['zufall', 'besteKarte', 'vielseitigsteKarte', 'knappstePosition'] as const;
export type StrategyId = (typeof STRATEGY_IDS)[number];
export const ORDER_IDS = ['vorwaerts', 'rueckwaerts', 'gemischt'] as const;
export type OrderId = (typeof ORDER_IDS)[number];

export const must = <TValue>(value: TValue | undefined | null, what: string): TValue => {
  if (value === undefined || value === null) throw new Error(`fehlt: ${what}`);
  return value;
};
export const P = (id: string): Player => must(PLAYER_BY_ID.get(id), `Spieler ${id}`);
export const unwrap = (result: DraftResult): DraftState => {
  if (!result.ok) throw new Error(`unerwarteter Fehler: ${result.error}`);
  return result.state;
};

/** Auf wie vielen der 23 Plätze dürfte die Karte regulär stehen? */
const versatility = (state: DraftState, p: Player): number =>
  SLOT_GROUPS.flatMap(slotsOf).filter((ref) => slotInfo(state.formation, ref)?.positions.includes(p.pos)).length;

/** Wie viele Personen dieser Position sind in der Variante noch frei? Wenige = knapp. */
const supply = (state: DraftState, p: Player): number => {
  const taken = takenPersons(state);
  return new Set(PLAYERS.filter((x) => x.pos === p.pos && variantAllows(state.variant, x) && !taken.has(x.person)).map((x) => x.person)).size;
};

const maxBy = (candidates: readonly Player[], score: (p: Player) => number): Player =>
  must(candidates.toSorted((a, b) => score(b) - score(a) || a.id.localeCompare(b.id))[0], 'Kandidat');

const STRATEGIES: Readonly<Record<StrategyId, Strategy>> = {
  zufall: (_state, candidates, rnd) => must(pickOne(candidates, rnd), 'Kandidat'),
  besteKarte: (_state, candidates) => maxBy(candidates, (p) => p.ovr),
  vielseitigsteKarte: (state, candidates) => maxBy(candidates, (p) => versatility(state, p)),
  knappstePosition: (state, candidates) => maxBy(candidates, (p) => -supply(state, p)),
};

const ORDERS: Readonly<Record<OrderId, Order>> = {
  vorwaerts: (open) => must(open[0], 'freier Platz'),
  rueckwaerts: (open) => must(open.at(-1), 'freier Platz'),
  gemischt: (open, rnd) => must(shuffled(open, rnd)[0], 'freier Platz'),
};

interface Ctx {
  readonly plan: RunPlan;
  readonly rnd: Rnd;
}

const choose = (ctx: Ctx, state: DraftState, offer: Offer): string =>
  STRATEGIES[ctx.plan.strategy](state, offer.candidates.map(P), ctx.rnd).id;

const fillSlot = (run: Run, ctx: Ctx, group: SlotRef['group']): Run => {
  const open = slotsOf(group).filter((ref) => run.state[group][ref.index] === null);
  const opened = unwrap(openSlot(run.state, ORDERS[ctx.plan.order](open, ctx.rnd), ctx.rnd));
  const offer = must(opened.offer, 'Angebot');
  const chosen = choose(ctx, opened, offer);
  return { state: unwrap(pickCandidate(opened, chosen)), offers: [...run.offers, { before: run.state, offer, chosen }] };
};

const STEP: Readonly<Record<Exclude<DraftPhase, 'done'>, (run: Run, ctx: Ctx) => Run>> = {
  captain: (run, ctx) => {
    const offer = must(run.state.offer, 'Kapitänsangebot');
    const chosen = choose(ctx, run.state, offer);
    return { state: unwrap(chooseCaptain(run.state, chosen)), offers: [...run.offers, { before: run.state, offer, chosen }] };
  },
  captainPlace: (run, ctx) => {
    const target = must(pickOne(captainTargets(run.state), ctx.rnd), 'Platz für den Kapitän');
    return { ...run, state: unwrap(placeCaptain(run.state, target)) };
  },
  start: (run, ctx) => fillSlot(run, ctx, 'start'),
  bench: (run, ctx) => fillSlot(run, ctx, 'bench'),
  reserve: (run, ctx) => fillSlot(run, ctx, 'reserve'),
};

const advance = (run: Run, ctx: Ctx): Run => {
  const phase = phaseOf(run.state);
  return phase === 'done' ? run : advance(STEP[phase](run, ctx), ctx);
};

/** Spielt einen kompletten Draft mit fester Wahlstrategie, Platzreihenfolge und Startwert durch. */
export const simulate = (plan: RunPlan): Run => {
  const rnd = seededRnd(plan.seed);
  const state = createDraft({ id: `sim-${plan.seed}`, profile: 'semon', variant: plan.variant, formation: plan.formation, now: 0, rnd });
  return advance({ state, offers: [] }, { plan, rnd });
};
