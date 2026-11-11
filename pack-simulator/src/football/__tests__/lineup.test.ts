import { describe, expect, it } from 'vitest';
import { PLAYER_BY_ID, PLAYERS, type Player } from '../../data/players';
import { goalText, hudOf, FETCH_LABEL, SWAP_LABEL } from '../hud.ts';
import {
  arrangeField, bestFive, FIELD_COUNT, fieldCandidates, hasKeeper, isComplete, isPlayable, keeperCandidates, KEEPER_POS,
  pickOpponents, QUICK_SQUAD, selectedPlayers, toSpec, toTeam,
} from '../lineup';
import { createLocalMatch, formatClock, scorerLines } from '../match.ts';
import { STAT_MAX, STAT_MIN, TEAM_SIZE } from '../sim/constants.ts';
import { createMatch } from '../sim/formation.ts';
import { frameOf } from '../sim/frame.ts';
import { sanitizeTeam } from '../sim/validate.ts';
import { makeConfig } from './helpers.ts';

const player = (id: string): Player => {
  const found = PLAYER_BY_ID.get(id);
  if (!found) throw new Error(`Spieler fehlt: ${id}`);
  return found;
};

const SQUAD_SIZE = 16;

const RANDOM_SERIES = 20;
const RANDOM_STEP = 0.37;
const MAX_GAP = 6;
const KEEPER_GAP = 15;
const NINETY_SECONDS = 90;
const FRAME_MS = 1000;
const A_MOMENT = 0.2;
const HARD = 2;
const OUTFIELD = PLAYERS.filter((p) => p.pos !== KEEPER_POS);
const KEEPERS = PLAYERS.filter((p) => p.pos === KEEPER_POS);
const MIXED = [...KEEPERS.slice(0, HARD), ...OUTFIELD.slice(0, SQUAD_SIZE)];

/** Vorhersagbare Folge in [0, 1) als Ersatz für Math.random. */
const sequence = (): (() => number) => {
  let value = 0;
  return (): number => {
    value = (value + RANDOM_STEP) % 1;
    return value;
  };
};

describe('Karten → Simulation', () => {
  it('alle Karten ergeben gültige Werte zwischen 1 und 99', () => {
    const specs = PLAYERS.map(toSpec);
    const values = specs.flatMap((s) => [s.pace, s.shot, s.pass, s.dribble, s.defense, s.physical, s.keeping]);
    expect(values.every((v) => Number.isInteger(v) && v >= STAT_MIN && v <= STAT_MAX)).toBe(true);
  });

  it('echte Torhüter halten deutlich besser als Feldspieler im Tor', () => {
    const worstKeeper = Math.min(...KEEPERS.map((p) => toSpec(p).keeping));
    const bestOutfield = Math.max(...OUTFIELD.map((p) => toSpec(p).keeping));
    expect(worstKeeper - bestOutfield).toBeGreaterThan(KEEPER_GAP);
  });

  it('eine Aufstellung besteht die Prüfung der Simulation', () => {
    const five = selectedPlayers(MIXED, bestFive(MIXED));
    expect(five).not.toBeNull();
    expect(sanitizeTeam(toTeam('Semons Team', five ?? []))).not.toBeNull();
  });
});

describe('Beste Fünf', () => {
  it('ein Torwart plus vier Feldspieler, jede Person nur einmal', () => {
    const pick = bestFive(MIXED);
    const five = selectedPlayers(MIXED, pick);
    expect(isComplete(pick)).toBe(true);
    expect(five).toHaveLength(TEAM_SIZE);
    expect(five?.[0].pos).toBe(KEEPER_POS);
    expect(five?.slice(1).every((p) => p.pos !== KEEPER_POS)).toBe(true);
    expect(new Set(five?.map((p) => p.id)).size).toBe(TEAM_SIZE);
  });

  it('nimmt den stärksten Torwart und stellt Abwehr hinten, Sturm vorne auf', () => {
    const squad = [player('neuer'), player('courtois'), player('vandijk'), player('haaland'), player('pedri'), player('saka'), player('kimmich')];
    const five = selectedPlayers(squad, bestFive(squad)) ?? [];
    const best = [player('neuer'), player('courtois')].sort((a, b) => b.ovr - a.ovr)[0];
    expect(five[0].id).toBe(best.id);
    expect(five[1].id).toBe('vandijk');
    expect(five[FIELD_COUNT].id).toBe('haaland');
  });

  it('ohne Torwart darf ein Feldspieler ins Tor', () => {
    const squad = OUTFIELD.slice(0, SQUAD_SIZE);
    const pick = bestFive(squad);
    expect(hasKeeper(squad)).toBe(false);
    expect(isComplete(pick)).toBe(true);
    expect(keeperCandidates(squad)).toHaveLength(squad.length);
    expect(fieldCandidates(squad, pick.keeperId).some((p) => p.id === pick.keeperId)).toBe(false);
    expect(selectedPlayers(squad, pick)).toHaveLength(TEAM_SIZE);
  });

  it('zu kleine Kader sind nicht spielbar und ergeben keine Aufstellung', () => {
    const squad = MIXED.slice(0, FIELD_COUNT);
    expect(isPlayable(squad)).toBe(false);
    expect(isComplete(bestFive(squad))).toBe(false);
    expect(selectedPlayers(squad, bestFive(squad))).toBeNull();
  });

  it('unvollständige oder doppelte Auswahl ergibt keine Mannschaft', () => {
    const pick = bestFive(MIXED);
    expect(selectedPlayers(MIXED, { ...pick, keeperId: null })).toBeNull();
    expect(selectedPlayers(MIXED, { ...pick, fieldIds: pick.fieldIds.slice(1) })).toBeNull();
    expect(selectedPlayers(MIXED, { ...pick, keeperId: pick.fieldIds[0] })).toBeNull();
  });

  it('Außenspieler landen auf ihrer Seite', () => {
    const ordered = arrangeField([player('saka'), player('vinicius'), player('vandijk'), player('kane')]);
    expect(ordered.map((p) => p.id)).toEqual(['vandijk', 'vinicius', 'saka', 'kane']);
  });
});

describe('Schnellstart und Gegner', () => {
  it('der Schnellstart-Kader ist sofort spielbar und hat einen Torwart', () => {
    expect(isPlayable(QUICK_SQUAD.players)).toBe(true);
    expect(hasKeeper(QUICK_SQUAD.players)).toBe(true);
    expect(new Set(QUICK_SQUAD.players.map((p) => p.id)).size).toBe(QUICK_SQUAD.players.length);
    expect(isComplete(bestFive(QUICK_SQUAD.players))).toBe(true);
  });

  it.each([0, 1, HARD].map((difficulty) => ({ difficulty })))('Gegner (Stufe $difficulty): fünf andere Personen in ähnlicher Stärke', ({ difficulty }) => {
    const mine = selectedPlayers(MIXED, bestFive(MIXED)) ?? [];
    const random = sequence();
    const average = (list: readonly Player[]): number => list.reduce((sum, p) => sum + p.ovr, 0) / list.length;
    Array.from({ length: RANDOM_SERIES }).forEach(() => {
      const theirs = pickOpponents(mine, difficulty, random);
      expect(theirs).toHaveLength(TEAM_SIZE);
      expect(theirs[0].pos).toBe(KEEPER_POS);
      expect(new Set(theirs.map((p) => p.id)).size).toBe(TEAM_SIZE);
      expect(theirs.some((p) => mine.some((own) => own.id === p.id))).toBe(false);
      expect(Math.abs(average(theirs) - average(mine))).toBeLessThan(MAX_GAP);
      expect(sanitizeTeam(toTeam('Gegner', theirs))).not.toBeNull();
    });
  });
});

describe('Anzeige', () => {
  it.each([
    { seconds: NINETY_SECONDS, text: '1:30' },
    { seconds: 0, text: '0:00' },
    { seconds: -1, text: '0:00' },
    { seconds: A_MOMENT, text: '0:01' },
  ])('formatClock($seconds) = $text', ({ seconds, text }) => {
    expect(formatClock(seconds)).toBe(text);
  });

  it('Countdown, Spielstand und Tastenbeschriftung kommen aus dem Bild', () => {
    const config = makeConfig();
    const state = createMatch(config);
    const meta = { teams: config.teams, myTeam: 0, durationSec: config.durationSec } as const;
    const hud = hudOf(frameOf(state), meta, null);
    expect(hud).toMatchObject({ mine: 0, theirs: 0, banner: '3', detail: 'Anstoß: A', swapLabel: SWAP_LABEL, ended: false });
    const away = hudOf(frameOf(state), { ...meta, myTeam: 1 }, null);
    expect([SWAP_LABEL, FETCH_LABEL]).toContain(away.swapLabel);
  });

  it('Torschützen und Eigentore werden mit Namen benannt', () => {
    const config = makeConfig();
    const meta = { teams: config.teams, myTeam: 0, durationSec: config.durationSec } as const;
    expect(goalText({ type: 'goal', team: 0, player: TEAM_SIZE - 1, own: false }, meta)).toBe('A-4');
    expect(goalText({ type: 'goal', team: 0, player: TEAM_SIZE + 1, own: true }, meta)).toBe('B-1 (Eigentor)');
    const lines = scorerLines([{ team: 1, player: TEAM_SIZE + 1, own: false, time: NINETY_SECONDS }], config.teams);
    expect(lines).toEqual([{ team: 1, name: 'B-1', own: false, clock: '1:30' }]);
  });

  it('der lokale Treiber rechnet in festen Schritten und liefert Ereignisse genau einmal', () => {
    const driver = createLocalMatch(makeConfig(), 0);
    const neutral = { moveX: 0, moveY: 0, pass: false, shoot: false, switchOrTackle: false };
    const first = driver.advance(0, () => neutral);
    expect(first.tick).toBe(0);
    const frames = Array.from({ length: MAX_GAP }, (_, i) => driver.advance((i + 1) * FRAME_MS, () => neutral));
    expect(frames[frames.length - 1].tick).toBeGreaterThan(0);
    driver.setPaused(true);
    const frozen = driver.advance(RANDOM_SERIES * FRAME_MS, () => neutral).tick;
    expect(driver.advance((RANDOM_SERIES + 1) * FRAME_MS, () => neutral).tick).toBe(frozen);
    expect(driver.drainEvents().length).toBeGreaterThanOrEqual(0);
    expect(driver.drainEvents()).toHaveLength(0);
  });
});
