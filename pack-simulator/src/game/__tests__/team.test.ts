import { describe, expect, it } from 'vitest';
import { PLAYER_BY_ID, PLAYERS, type Player, type Position } from '../../data/players';
import { sanitizeCollection } from '../storage';
import {
  assignBest, autoLineup, canPlace, changeFormation, clearLineup, DEFAULT_TEAM_NAME, emptyTeam, fits, FORMATIONS,
  placePlayer, removeAt, sanitizeTeam, TEAM_NAME_MAX, teamRating, type FormationId, type Team,
} from '../team';
import { seeded } from './packs.test';

const P = (id: string): Player => { const p = PLAYER_BY_ID.get(id); if (!p) throw new Error(`Spieler fehlt: ${id}`); return p; };
const idx = (f: FormationId, slotId: string): number => FORMATIONS[f].findIndex((s) => s.id === slotId);
const ids = (lineup: readonly (string | null)[]): string[] => lineup.filter((x): x is string => x !== null);
const total = (lineup: readonly (string | null)[]): number => ids(lineup).reduce((s, id) => s + P(id).ovr, 0);
const allFit = (f: FormationId, lineup: readonly (string | null)[]): boolean =>
  lineup.every((id, i) => id === null || fits(P(id), FORMATIONS[f][i]!.role));

describe('Positionszuordnung', () => {
  it('jede vorhandene Spielerposition passt auf mindestens einen Platz jeder Formation', () => {
    const positions = [...new Set(PLAYERS.map((p) => p.pos))] as Position[];
    for (const f of ['4-3-3', '4-4-2'] as const) {
      for (const pos of positions) {
        const sample = PLAYERS.find((p) => p.pos === pos)!;
        expect(FORMATIONS[f].some((s) => fits(sample, s.role)), `${pos} in ${f}`).toBe(true);
      }
    }
  });

  it('Torhüter nur im Tor, Feldspieler nie im Tor', () => {
    expect(canPlace(P('neuer'), 'TW')).toBe(true);
    expect(canPlace(P('neuer'), 'ST')).toBe(false);
    expect(canPlace(P('haaland'), 'TW')).toBe(false);
    expect(canPlace(P('haaland'), 'IV')).toBe(true); // positionsfremd, aber manuell erlaubt
  });
});

describe('Bestes Team aufstellen', () => {
  it('leere Sammlung: alles leer, elf Plätze fehlen, kein Fehler', () => {
    const r = autoLineup('4-3-3', []);
    expect(ids(r.lineup)).toHaveLength(0);
    expect(r.missing).toHaveLength(11);
  });

  it('kleine Sammlung: besetzt nur passende Plätze und meldet die fehlenden', () => {
    const r = autoLineup('4-3-3', [P('neuer'), P('haaland'), P('musiala')]);
    expect(r.lineup[idx('4-3-3', 'TW')]).toBe('neuer');
    expect(r.lineup[idx('4-3-3', 'ST')]).toBe('haaland');
    expect(ids(r.lineup)).toHaveLength(3);
    expect(r.missing).toHaveLength(8);
    expect(allFit('4-3-3', r.lineup)).toBe(true);
  });

  it('vollständige Sammlung: elf verschiedene, passende Spieler in beiden Formationen', () => {
    for (const f of ['4-3-3', '4-4-2'] as const) {
      const r = autoLineup(f, PLAYERS);
      expect(ids(r.lineup)).toHaveLength(11);
      expect(new Set(ids(r.lineup)).size).toBe(11);
      expect(allFit(f, r.lineup)).toBe(true);
      expect(r.missing).toHaveLength(0);
    }
  });

  it('mehrfach gezogener Spieler wird nur einmal aufgestellt', () => {
    const r = autoLineup('4-4-2', [P('haaland'), P('haaland'), P('haaland')]);
    expect(ids(r.lineup)).toEqual(['haaland']);
  });

  it('Positionskonflikt: vielseitiger Spieler blockiert keinen Platz, der sonst leer bliebe', () => {
    // Rodri (ZDM) passt in die Innenverteidigung und ins Mittelfeld; die beiden Innenverteidiger nur hinten.
    const r = assignBest('4-3-3', [P('rodri'), P('vandijk'), P('saliba')]);
    expect(ids(r).sort()).toEqual(['rodri', 'saliba', 'vandijk']);
    expect([r[idx('4-3-3', 'IV1')], r[idx('4-3-3', 'IV2')]].sort()).toEqual(['saliba', 'vandijk']);
  });

  it('bevorzugt bei gleicher Summe die exakte Position', () => {
    const r = assignBest('4-3-3', [P('hakimi'), P('lahm')]); // zwei Rechtsverteidiger, kein Linksverteidiger
    expect(ids(r)).toHaveLength(2);
    expect(r[idx('4-3-3', 'RV')]).toBe('lahm'); // der stärkere bleibt rechts
    expect(r[idx('4-3-3', 'LV')]).toBe('hakimi');
  });

  it('liefert bei gleicher Eingabe dieselbe Aufstellung, unabhängig von der Reihenfolge', () => {
    const a = autoLineup('4-3-3', PLAYERS).lineup;
    const b = autoLineup('4-3-3', [...PLAYERS].reverse()).lineup;
    expect(b).toEqual(a);
  });

  it('ist optimal: Vergleich mit vollständiger Suche auf zufälligen kleinen Sammlungen', () => {
    const rnd = seeded(2026);
    for (let trial = 0; trial < 120; trial++) {
      const f: FormationId = trial % 2 === 0 ? '4-3-3' : '4-4-2';
      const pool = [...PLAYERS].sort(() => rnd() - 0.5).slice(0, 3 + Math.floor(rnd() * 5));
      const slots = FORMATIONS[f];
      let best = { count: -1, sum: -1 };
      const dfs = (i: number, usedSlots: Set<number>, count: number, sum: number): void => {
        if (i === pool.length) { if (count > best.count || (count === best.count && sum > best.sum)) best = { count, sum }; return; }
        dfs(i + 1, usedSlots, count, sum);
        slots.forEach((s, si) => {
          if (usedSlots.has(si) || !fits(pool[i]!, s.role)) return;
          usedSlots.add(si); dfs(i + 1, usedSlots, count + 1, sum + pool[i]!.ovr); usedSlots.delete(si);
        });
      };
      dfs(0, new Set(), 0, 0);
      const got = assignBest(f, pool);
      expect(allFit(f, got)).toBe(true);
      expect({ count: ids(got).length, sum: total(got) }).toEqual(best);
    }
  });
});

describe('Manuelles Aufstellen', () => {
  const base = emptyTeam('4-3-3');

  it('einsetzen, ersetzen und entfernen', () => {
    let t = placePlayer(base, idx('4-3-3', 'ST'), 'haaland');
    expect(t.lineup[idx('4-3-3', 'ST')]).toBe('haaland');
    t = placePlayer(t, idx('4-3-3', 'ST'), 'mbappe');
    expect(ids(t.lineup)).toEqual(['mbappe']);
    t = removeAt(t, idx('4-3-3', 'ST'));
    expect(ids(t.lineup)).toHaveLength(0);
  });

  it('bereits aufgestellter Spieler wird verschoben bzw. getauscht, nie dupliziert', () => {
    let t = placePlayer(base, idx('4-3-3', 'ST'), 'haaland');
    t = placePlayer(t, idx('4-3-3', 'LF'), 'mbappe');
    t = placePlayer(t, idx('4-3-3', 'LF'), 'haaland'); // Tausch
    expect(t.lineup[idx('4-3-3', 'LF')]).toBe('haaland');
    expect(t.lineup[idx('4-3-3', 'ST')]).toBe('mbappe');
    t = placePlayer(t, idx('4-3-3', 'RF'), 'haaland'); // Verschieben auf leeren Platz
    expect(ids(t.lineup).filter((id) => id === 'haaland')).toHaveLength(1);
    expect(t.lineup[idx('4-3-3', 'LF')]).toBeNull();
  });

  it('positionsfremder Feldspieler ist erlaubt, Torwartregel und unbekannte IDs nicht', () => {
    expect(placePlayer(base, idx('4-3-3', 'IV1'), 'haaland').lineup[idx('4-3-3', 'IV1')]).toBe('haaland');
    expect(placePlayer(base, idx('4-3-3', 'TW'), 'haaland')).toBe(base);
    expect(placePlayer(base, idx('4-3-3', 'ST'), 'neuer')).toBe(base);
    expect(placePlayer(base, idx('4-3-3', 'ST'), 'gibt-es-nicht')).toBe(base);
    expect(placePlayer(base, 99, 'haaland')).toBe(base);
  });
});

describe('Formationswechsel', () => {
  it('übernimmt Spieler auf passende Plätze, dupliziert nichts und meldet offene Plätze', () => {
    const full: Team = { ...emptyTeam('4-3-3'), lineup: autoLineup('4-3-3', PLAYERS).lineup };
    const before = ids(full.lineup);
    const change = changeFormation(full, '4-4-2');
    const after = ids(change.team.lineup);
    expect(change.team.formation).toBe('4-4-2');
    expect(new Set(after).size).toBe(after.length);
    expect(after.every((id) => before.includes(id))).toBe(true);
    expect(allFit('4-4-2', change.team.lineup)).toBe(true);
    expect(after.length + change.dropped.length).toBe(before.length);
    expect(change.open).toHaveLength(11 - after.length);
    expect(after.length).toBeGreaterThanOrEqual(9); // Tor, Abwehr, zwei ZM, Flügel und ein Stürmer bleiben
  });

  it('gleiche Formation lässt das Team unverändert', () => {
    const t = placePlayer(emptyTeam('4-3-3'), idx('4-3-3', 'ST'), 'haaland');
    expect(changeFormation(t, '4-3-3').team).toBe(t);
  });
});

describe('Teamwertung', () => {
  it('leer: keine Wertung', () => {
    expect(teamRating(emptyTeam())).toEqual({ count: 0, rating: null, provisional: true });
  });

  it('Durchschnitt, kaufmännisch gerundet, unvollständig = vorläufig', () => {
    let t = placePlayer(emptyTeam('4-3-3'), idx('4-3-3', 'ST'), 'haaland'); // 91
    t = placePlayer(t, idx('4-3-3', 'TW'), 'neuer'); // 84
    expect(teamRating(t)).toEqual({ count: 2, rating: 88, provisional: true }); // 87,5 → 88
  });

  it('vollständiges Team ist nicht mehr vorläufig', () => {
    const t: Team = { ...emptyTeam('4-3-3'), lineup: autoLineup('4-3-3', PLAYERS).lineup };
    const r = teamRating(t);
    expect(r.count).toBe(11);
    expect(r.provisional).toBe(false);
    expect(r.rating).toBe(Math.round(total(t.lineup) / 11));
  });
});

describe('Gespeicherte Daten validieren', () => {
  const owned = new Set(['haaland', 'neuer', 'mbappe']);

  it('beschädigte Daten ergeben ein leeres Standardteam', () => {
    for (const raw of [null, undefined, 42, 'kaputt', [], [1, 2], { lineup: 'x' }, { formation: 7, lineup: {} }]) {
      const t = sanitizeTeam(raw, owned);
      expect(t.formation).toBe('4-3-3');
      expect(t.name).toBe(DEFAULT_TEAM_NAME);
      expect(t.lineup).toHaveLength(11);
      expect(ids(t.lineup)).toHaveLength(0);
    }
  });

  it('entfernt unbekannte, nicht besessene, doppelte und regelwidrig platzierte Spieler', () => {
    const lineup: unknown[] = Array.from({ length: 14 }, () => null);
    lineup[idx('4-3-3', 'TW')] = 'haaland'; // Feldspieler im Tor
    lineup[idx('4-3-3', 'ST')] = 'haaland';
    lineup[idx('4-3-3', 'RF')] = 'haaland'; // doppelt (späterer Platz)
    lineup[idx('4-3-3', 'LF')] = 'messi'; // nicht besessen
    lineup[idx('4-3-3', 'ZM1')] = 'gibt-es-nicht';
    lineup[idx('4-3-3', 'ZM2')] = 123;
    lineup[idx('4-3-3', 'IV1')] = 'neuer'; // Torwart im Feld
    const t = sanitizeTeam({ name: 'x'.repeat(80), formation: '4-3-3', lineup }, owned);
    expect(ids(t.lineup)).toEqual(['haaland']);
    expect(t.lineup[idx('4-3-3', 'ST')]).toBe('haaland');
    expect(t.name).toHaveLength(TEAM_NAME_MAX);
  });

  it('ungültige Formation fällt auf 4-3-3 zurück, gültige bleibt erhalten', () => {
    expect(sanitizeTeam({ formation: '3-5-2', lineup: [] }, owned).formation).toBe('4-3-3');
    expect(sanitizeTeam({ formation: '4-4-2', lineup: [] }, owned).formation).toBe('4-4-2');
  });

  it('zurückgesetzte Sammlung leert die Aufstellung, Team leeren behält Name und Formation', () => {
    const t = placePlayer({ ...emptyTeam('4-4-2'), name: 'FC Test' }, idx('4-4-2', 'ST1'), 'haaland');
    expect(ids(sanitizeTeam(t, new Set()).lineup)).toHaveLength(0);
    const cleared = clearLineup(t);
    expect(cleared.name).toBe('FC Test');
    expect(cleared.formation).toBe('4-4-2');
    expect(ids(cleared.lineup)).toHaveLength(0);
  });

  it('Sammlung: verwirft kaputte Einträge und unbekannte IDs', () => {
    expect(sanitizeCollection(null)).toEqual({});
    expect(sanitizeCollection([1, 2, 3])).toEqual({});
    expect(sanitizeCollection({ haaland: 2, messi: '3', gibtsnicht: 4, neuer: 0, mbappe: 1.9, pele: -1 })).toEqual({ haaland: 2, mbappe: 1 });
  });
});
