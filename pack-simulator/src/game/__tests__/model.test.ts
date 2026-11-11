import { describe, expect, it } from 'vitest';
import { PERSON_IDS, PLAYER_BY_ID, PLAYERS } from '../../data/players';
import { drawPack, PACK_ORDER } from '../packs';
import {
  assignBest, autoLineup, DEFAULT_TEAM_NAMES, emptyTeam, fits, FORMATION_IDS, FORMATIONS, placePlayer, ROLE_ACCEPTS, ROLE_LABEL,
  sanitizeTeam, sanitizeTeamBook, TEAM_SIZE,
} from '../team';
import { seeded } from './packs.test';

const ids = (lineup: readonly (string | null)[]): string[] => lineup.filter((x): x is string => x !== null);

describe('Spielerbestand', () => {
  it('mindestens 120 reale Personen, davon mindestens 40 Legenden', () => {
    expect(PERSON_IDS.length).toBeGreaterThanOrEqual(120);
    expect(new Set(PLAYERS.filter((p) => p.cat === 'legend').map((p) => p.person)).size).toBeGreaterThanOrEqual(40);
  });

  it('jede Kartenversion verweist auf eine vorhandene Basiskarte derselben Person', () => {
    for (const p of PLAYERS) {
      if (!p.version) { expect(p.person).toBe(p.id); continue; }
      const base = PLAYER_BY_ID.get(p.person);
      expect(base, p.id).toBeDefined();
      expect(base!.name).toBe(p.name);
    }
  });

  it('gewünschte Namen sind enthalten', () => {
    const names = new Set(PLAYERS.map((p) => p.name));
    for (const n of ['Ronaldinho', 'Ronaldo Nazário', 'Zinédine Zidane', 'Pelé', 'Diego Maradona', 'Johan Cruyff', 'Thierry Henry', 'Kaká',
      'Paolo Maldini', 'Roberto Carlos', 'Cafu', 'Franz Beckenbauer', 'Lothar Matthäus', 'Ruud Gullit', 'Patrick Vieira', 'David Beckham',
      'Andrea Pirlo', 'Gianluigi Buffon', 'Iker Casillas', 'Didier Drogba', 'Lionel Messi', 'Cristiano Ronaldo', 'Neymar Jr', 'Kylian Mbappé',
      'Erling Haaland', 'Jude Bellingham', 'Vinícius Júnior', 'Lamine Yamal', 'Jamal Musiala', 'Florian Wirtz']) expect(names.has(n), n).toBe(true);
  });
});

describe('Packs und Personen', () => {
  it('keine reale Person doppelt in einem Pack, auch nicht als andere Kartenversion', () => {
    const rnd = seeded(77);
    for (const type of PACK_ORDER) for (let i = 0; i < 4000; i++) {
      const pack = drawPack(type, true, rnd);
      expect(new Set(pack.map((p) => p.person)).size).toBe(5);
    }
  });
});

describe('Formationen', () => {
  it('fünf Formationen mit je elf Plätzen, genau einem Tor und beschrifteten Rollen', () => {
    expect(FORMATION_IDS).toHaveLength(5);
    for (const f of FORMATION_IDS) {
      const slots = FORMATIONS[f];
      expect(slots, f).toHaveLength(TEAM_SIZE);
      expect(slots.filter((s) => s.role === 'TW')).toHaveLength(1);
      expect(new Set(slots.map((s) => s.id)).size).toBe(TEAM_SIZE);
      for (const s of slots) { expect(ROLE_LABEL[s.role]).toBeTruthy(); expect(ROLE_ACCEPTS[s.role].length).toBeGreaterThan(0); }
    }
  });

  it('Plätze überlappen sich auf dem Spielfeld in keiner Formation', () => {
    const W = 9.6; const H = 9.3; // halbe Kachelgröße in Prozent
    for (const f of FORMATION_IDS) {
      const slots = FORMATIONS[f];
      for (let i = 0; i < slots.length; i++) for (let j = i + 1; j < slots.length; j++) {
        const a = slots[i]!; const b = slots[j]!;
        const overlap = Math.abs(a.x - b.x) < 2 * W - 0.6 && Math.abs(a.y - b.y) < 2 * H - 0.6;
        expect(overlap, `${f}: ${a.id}/${b.id}`).toBe(false);
      }
    }
  });

  it('beste Elf lässt sich in jeder Formation vollständig und passend aufstellen', () => {
    for (const f of FORMATION_IDS) {
      const r = autoLineup(f, PLAYERS);
      expect(ids(r.lineup), f).toHaveLength(11);
      expect(new Set(ids(r.lineup).map((id) => PLAYER_BY_ID.get(id)!.person)).size).toBe(11);
      expect(r.lineup.every((id, i) => fits(PLAYER_BY_ID.get(id!)!, FORMATIONS[f][i]!.role))).toBe(true);
    }
  });
});

describe('Kartenversionen im Team', () => {
  it('automatische Aufstellung nimmt von einer Person nur die beste Karte', () => {
    const r = assignBest('4-3-3', [PLAYER_BY_ID.get('messi')!, PLAYER_BY_ID.get('messi-prime')!]);
    expect(ids(r)).toEqual(['messi-prime']);
  });

  it('andere Kartenversion ersetzt die bisherige Karte derselben Person statt sie zu verdoppeln', () => {
    const rf = FORMATIONS['4-3-3'].findIndex((s) => s.id === 'RF');
    const lf = FORMATIONS['4-3-3'].findIndex((s) => s.id === 'LF');
    let t = placePlayer(emptyTeam('4-3-3'), rf, 'messi');
    t = placePlayer(t, lf, 'messi-prime');
    expect(ids(t.lineup)).toEqual(['messi-prime']);
    t = placePlayer(t, lf, 'messi');
    expect(ids(t.lineup)).toEqual(['messi']);
  });

  it('gespeichertes Team mit zwei Versionen derselben Person wird bereinigt', () => {
    const lineup: (string | null)[] = Array.from({ length: 11 }, () => null);
    lineup[8] = 'messi'; lineup[10] = 'messi-prime';
    const t = sanitizeTeam({ formation: '4-3-3', lineup }, new Set(['messi', 'messi-prime']));
    expect(ids(t.lineup)).toEqual(['messi']);
  });
});

describe('Mannschaften je Profil', () => {
  const owned = new Set(['haaland', 'neuer', 'mbappe']);
  const legacy = { name: 'Ariels Dream Team', formation: '4-4-2', lineup: ['neuer', null, null, null, null, null, null, null, null, 'haaland', 'mbappe'] };

  it('ohne alte Daten: leere Teams für Semon und Ariel, kein Bestandsteam', () => {
    const b = sanitizeTeamBook(null, null, owned);
    expect(b.active).toBe('semon');
    expect(b.teams.bestand).toBeUndefined();
    expect(b.teams.semon.name).toBe(DEFAULT_TEAM_NAMES.semon);
    expect(b.teams.ariel.name).toBe(DEFAULT_TEAM_NAMES.ariel);
  });

  it('vorhandenes gemeinsames Team wird als Bestandsteam übernommen, nicht gelöscht', () => {
    const b = sanitizeTeamBook(null, legacy, owned);
    expect(b.active).toBe('bestand');
    expect(b.teams.bestand?.formation).toBe('4-4-2');
    expect(ids(b.teams.bestand!.lineup)).toEqual(['neuer', 'haaland', 'mbappe']);
    expect(b.teams.bestand!.name).toBe(DEFAULT_TEAM_NAMES.bestand);
    expect(ids(b.teams.semon.lineup)).toHaveLength(0);
  });

  it('eigener Name des alten Teams bleibt erhalten', () => {
    expect(sanitizeTeamBook(null, { ...legacy, name: 'FC Wohnzimmer' }, owned).teams.bestand?.name).toBe('FC Wohnzimmer');
  });

  it('leeres altes Standardteam erzeugt kein Bestandsteam', () => {
    expect(sanitizeTeamBook(null, { name: 'Ariels Dream Team', formation: '4-3-3', lineup: [] }, owned).teams.bestand).toBeUndefined();
  });

  it('neues Format hat Vorrang und wird validiert', () => {
    const b = sanitizeTeamBook({ active: 'ariel', teams: { semon: 'kaputt', ariel: { name: 'A', formation: '3-5-2', lineup: ['neuer', 'messi'] } } }, legacy, owned);
    expect(b.active).toBe('ariel');
    expect(b.teams.ariel.formation).toBe('3-5-2');
    expect(ids(b.teams.ariel.lineup)).toEqual(['neuer']);
    expect(b.teams.semon.name).toBe(DEFAULT_TEAM_NAMES.semon);
    expect(b.teams.bestand).toBeUndefined();
  });

  it('aktives Bestandsteam ohne Bestandsteam fällt auf Semon zurück', () => {
    expect(sanitizeTeamBook({ active: 'bestand', teams: {} }, null, owned).active).toBe('semon');
  });
});
