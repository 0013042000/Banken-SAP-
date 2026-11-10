import { describe, expect, it } from 'vitest';
import type { Category, Player, Position } from '../../data/players';
import { buildSteps, revealOrder, styleFor, timeToFirstHold } from '../reveal';

const mk = (id: string, ovr: number, cat: Category = 'gold', pos: Position = 'ST'): Player => ({ id, name: id, nation: 'GER', pos, cat, ovr });

describe('Enthüllungsreihenfolge', () => {
  it('zeigt die beste Karte zuerst und verändert das Pack nicht', () => {
    const pack = [mk('a', 78), mk('b', 91), mk('c', 80), mk('d', 84), mk('e', 77)];
    const before = pack.map((p) => p.id);
    const { order, featured } = revealOrder(pack);
    expect(order[0]!.id).toBe('b');
    expect(featured).toBe(1);
    expect(order.slice(1).map((p) => p.ovr)).toEqual([77, 78, 80, 84]);
    expect(pack.map((p) => p.id)).toEqual(before);
    expect([...order].map((p) => p.id).sort()).toEqual([...before].sort());
  });

  it('gibt der zweitbesten Karte ab 86 einen eigenen Auftritt, darunter nicht', () => {
    expect(revealOrder([mk('a', 92), mk('b', 86), mk('c', 70), mk('d', 71), mk('e', 72)]).featured).toBe(2);
    expect(revealOrder([mk('a', 92), mk('b', 85), mk('c', 70), mk('d', 71), mk('e', 72)]).featured).toBe(1);
  });
});

describe('Inszenierungsstufen', () => {
  it('ordnet Bewertungen den Stufen zu', () => {
    expect(styleFor(mk('x', 85)).tier).toBe('normal');
    expect(styleFor(mk('x', 86)).tier).toBe('strong');
    expect(styleFor(mk('x', 89)).tier).toBe('strong');
    expect(styleFor(mk('x', 90)).tier).toBe('walkout');
  });

  it('erkennt Legenden ab 90 und Spitzenkarten ab 95 – auch gemeinsam', () => {
    expect(styleFor(mk('x', 89, 'legend')).legend).toBe(false);
    expect(styleFor(mk('x', 90, 'legend'))).toEqual({ tier: 'walkout', legend: true, elite: false });
    expect(styleFor(mk('x', 95, 'star'))).toEqual({ tier: 'walkout', legend: false, elite: true });
    expect(styleFor(mk('x', 97, 'legend'))).toEqual({ tier: 'walkout', legend: true, elite: true });
  });
});

describe('Ablauf', () => {
  const rest = [mk('c', 70), mk('d', 71), mk('e', 72)];
  const stepsFor = (cards: Player[], reduced = false) => { const { order, featured } = revealOrder(cards); return { steps: buildSteps(order, featured, reduced), featured }; };

  it('hält genau bei den besonderen Karten an', () => {
    expect(stepsFor([mk('a', 92), mk('b', 88), ...rest]).steps.filter((s) => s.hold)).toHaveLength(2);
    expect(stepsFor([mk('a', 84), mk('b', 80), ...rest]).steps.filter((s) => s.hold)).toHaveLength(1);
  });

  it('Walkout dauert vier bis sechs Sekunden bis zum Haltebild, starke und normale Karten deutlich kürzer', () => {
    const walk = timeToFirstHold(stepsFor([mk('a', 92), mk('b', 80), ...rest]).steps);
    const legend = timeToFirstHold(stepsFor([mk('a', 97, 'legend'), mk('b', 80), ...rest]).steps);
    const strong = timeToFirstHold(stepsFor([mk('a', 87), mk('b', 80), ...rest]).steps);
    const normal = timeToFirstHold(stepsFor([mk('a', 84), mk('b', 80), ...rest]).steps);
    for (const t of [walk, legend]) { expect(t).toBeGreaterThanOrEqual(4000); expect(t).toBeLessThanOrEqual(6000); }
    expect(strong).toBeLessThan(walk);
    expect(normal).toBeLessThan(strong);
    expect(normal).toBeLessThan(2000);
  });

  it('zweiter Auftritt ist kürzer als der erste', () => {
    const { steps } = stepsFor([mk('a', 93), mk('b', 92), ...rest]);
    const dur = (index: number): number => steps.filter((s) => s.index === index && s.kind !== 'burst').reduce((t, s) => t + s.dur, 0);
    expect(dur(1)).toBeLessThan(dur(0));
    expect(steps.some((s) => s.index === 1 && s.kind === 'dark')).toBe(true);
  });

  it('reduzierte Bewegung: nur ruhige Haltebilder der besonderen Karten', () => {
    const { steps, featured } = stepsFor([mk('a', 96), mk('b', 90), ...rest], true);
    expect(steps).toHaveLength(featured);
    expect(steps.every((s) => s.kind === 'card' && s.hold)).toBe(true);
  });
});
