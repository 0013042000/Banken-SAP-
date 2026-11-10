import { describe, expect, it } from 'vitest';
import { PLAYERS } from '../../data/players';
import { bestOf, demoWalkoutPack, drawPack, PACK_ORDER, PACKS } from '../packs';

/** Kleiner deterministischer Zufallsgenerator, damit die Prüfungen nicht schwanken. */
export const seeded = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

describe('Ziehlogik', () => {
  for (const type of PACK_ORDER) {
    for (const dream of [false, true]) {
      it(`${PACKS[type].label} (Traumglück ${dream ? 'an' : 'aus'}): fünf Karten, Garantie erfüllt, keine doppelte ID`, () => {
        const rnd = seeded(type.length * 1000 + (dream ? 7 : 3));
        for (let i = 0; i < 3000; i++) {
          const pack = drawPack(type, dream, rnd);
          expect(pack).toHaveLength(5);
          expect(new Set(pack.map((p) => p.id)).size).toBe(5);
          expect(pack.some(PACKS[type].guarantee.test)).toBe(true);
        }
      });
    }
  }

  it('Traumglück erhöht die durchschnittliche beste Karte in jedem Packtyp', () => {
    for (const type of PACK_ORDER) {
      const avg = (dream: boolean): number => {
        const rnd = seeded(42);
        let sum = 0;
        for (let i = 0; i < 4000; i++) sum += bestOf(drawPack(type, dream, rnd)).ovr;
        return sum / 4000;
      };
      expect(avg(true)).toBeGreaterThan(avg(false));
    }
  });

  it('gleicher Zufallsstand liefert dasselbe Pack (Ergebnis steht beim Öffnen fest)', () => {
    const a = drawPack('star', false, seeded(99)).map((p) => p.id);
    const b = drawPack('star', false, seeded(99)).map((p) => p.id);
    expect(a).toEqual(b);
  });

  it('Demo-Walkout: fünf verschiedene Karten mit einer Spitzenkarte ab 93', () => {
    const rnd = seeded(5);
    for (let i = 0; i < 500; i++) {
      const pack = demoWalkoutPack(rnd);
      expect(new Set(pack.map((p) => p.id)).size).toBe(5);
      expect(bestOf(pack).ovr).toBeGreaterThanOrEqual(93);
    }
  });

  it('Spielerbestand: eindeutige IDs', () => {
    expect(new Set(PLAYERS.map((p) => p.id)).size).toBe(PLAYERS.length);
  });
});
