import { describe, expect, it } from 'vitest';
import { hasLook, kitFor, lookFor, numberFor, orphanLooks } from '../../data/looks';
import { PERSON_IDS, PLAYER_BY_ID, PLAYERS } from '../../data/players';
import { bestOf, FEATURE_MIN, PREVIEW_KINDS, previewPack, WALKOUT_MIN } from '../packs';
import { revealOrder, styleFor } from '../reveal';
import { celebrationPose, idlePose, locomotionPose, REST, type Pose } from '../../walkout/pose';
import { seeded } from './packs.test';

const finite = (p: Pose): boolean => Object.values(p).every((v) => Number.isFinite(v));
const distance = (a: Pose, b: Pose): number => (Object.keys(a) as (keyof Pose)[]).reduce((s, k) => s + Math.abs(a[k] - b[k]), 0);

describe('Avatar-Aussehen', () => {
  it('jede Person hat ein Aussehen, Trikot und eine Nummer; keine verwaisten Einträge', () => {
    expect(PERSON_IDS.filter((p) => !hasLook(p))).toEqual([]);
    expect(orphanLooks()).toEqual([]);
    for (const p of PLAYERS) {
      const look = lookFor(p);
      expect(look.skin).toMatch(/^#[0-9a-f]{6}$/);
      expect(kitFor(p).shirt).toMatch(/^#[0-9a-f]{6}$/);
      expect(numberFor(p).length).toBeGreaterThan(0);
    }
  });

  it('Kartenversionen derselben Person sehen gleich aus', () => {
    expect(lookFor(PLAYER_BY_ID.get('messi-prime')!)).toEqual(lookFor(PLAYER_BY_ID.get('messi')!));
  });

  it('Avatare unterscheiden sich sichtbar: mehrere Hauttöne, Frisuren, Staturen und Jubel', () => {
    const looks = PERSON_IDS.map((id) => lookFor(PLAYER_BY_ID.get(id)!));
    expect(new Set(looks.map((l) => l.skin)).size).toBe(5);
    expect(new Set(looks.map((l) => l.hair)).size).toBeGreaterThanOrEqual(8);
    expect(new Set(looks.map((l) => l.build)).size).toBe(3);
    expect(new Set(looks.map((l) => l.celebration)).size).toBeGreaterThanOrEqual(9);
    expect(kitFor(PLAYER_BY_ID.get('neuer')!).shirt).not.toBe(kitFor(PLAYER_BY_ID.get('musiala')!).shirt);
  });
});

describe('Bewegung der Figur', () => {
  it('beim Laufen schwingen Beine und Arme gegengleich und die Knie beugen', () => {
    const quarter = locomotionPose(Math.PI / 2, 0.6);
    const opposite = locomotionPose((3 * Math.PI) / 2, 0.6);
    expect(Math.sign(quarter.hipLx)).toBe(-Math.sign(quarter.hipRx));
    expect(Math.sign(quarter.hipLx)).toBe(-Math.sign(quarter.shLx));
    expect(Math.sign(quarter.hipLx)).toBe(-Math.sign(opposite.hipLx));
    expect(Math.abs(quarter.hipLx)).toBeGreaterThan(0.4);
    expect(Math.max(locomotionPose(0, 0.6).knL, locomotionPose(Math.PI, 0.6).knR)).toBeGreaterThan(0.8);
  });

  it('Sprint bewegt Gliedmaßen stärker als Gehen', () => {
    expect(Math.abs(locomotionPose(Math.PI / 2, 1).hipLx)).toBeGreaterThan(Math.abs(locomotionPose(Math.PI / 2, 0).hipLx));
  });

  it('jede Jubelpose weicht deutlich von der Ruhehaltung ab und bleibt über die Zeit gültig', () => {
    const kinds = ['arme', 'faust', 'himmel', 'einarm', 'rutsche', 'stolz', 'kreuz', 'siu', 'samba', 'frieren', 'maske'] as const;
    for (const kind of kinds) {
      for (const t of [0, 0.1, 0.4, 0.9, 1.5, 2.2, 3.5, 8]) expect(finite(celebrationPose(kind, t, true)), `${kind}@${t}`).toBe(true);
      expect(distance(celebrationPose(kind, 1.2, false), REST), kind).toBeGreaterThan(0.8);
    }
    expect(finite(idlePose(3))).toBe(true);
  });

  it('Spitzenkarten bekommen ein zusätzliches Finale', () => {
    expect(distance(celebrationPose('kreuz', 2.6, true), celebrationPose('kreuz', 2.6, false))).toBeGreaterThan(1);
  });
});

describe('Vorschau der Enthüllungsstufen', () => {
  it('vier Vorschauen, jede trifft ihre Stufe und enthält fünf verschiedene Personen', () => {
    expect(PREVIEW_KINDS.map((p) => p.kind)).toEqual(['normal', 'star', 'legend', 'elite']);
    const rnd = seeded(11);
    for (let i = 0; i < 300; i++) {
      const normal = revealOrder(previewPack('normal', rnd));
      expect(bestOf(normal.order).ovr).toBeLessThan(FEATURE_MIN);
      const star = revealOrder(previewPack('star', rnd));
      expect(styleFor(star.order[0]!)).toEqual({ tier: 'walkout', legend: false, elite: false });
      expect(star.featured).toBe(2);
      expect(styleFor(star.order[1]!).tier).toBe('strong');
      const legend = revealOrder(previewPack('legend', rnd));
      expect(styleFor(legend.order[0]!)).toEqual({ tier: 'walkout', legend: true, elite: false });
      const elite = revealOrder(previewPack('elite', rnd));
      expect(styleFor(elite.order[0]!).elite).toBe(true);
      expect(elite.order[0]!.ovr).toBeGreaterThanOrEqual(WALKOUT_MIN);
      for (const pack of [normal, star, legend, elite]) expect(new Set(pack.order.map((p) => p.person)).size).toBe(5);
    }
  });
});
