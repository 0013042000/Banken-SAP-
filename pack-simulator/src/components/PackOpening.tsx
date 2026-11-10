import { useEffect, useRef, useState, type ReactElement } from 'react';
import { FLAGS, type Player } from '../data/players';
import { bestOf, FEATURE_MIN, PACKS, WALKOUT_MIN, type PackType } from '../game/packs';
import { sfx } from '../game/sound';
import { Card } from './Card';

const buzz = (pattern: number | number[]): void => { try { navigator.vibrate?.(pattern); } catch { /* nicht unterstützt */ } };

type Kind = 'burst' | 'suspense' | 'flag' | 'pos' | 'name' | 'card';
interface Step { readonly kind: Kind; readonly index: number; readonly dur: number; readonly hold?: boolean }

export type Phase = { kind: 'idle' } | { kind: 'summary' } | { kind: Kind; index: number; hold: boolean };

interface Props {
  readonly packType: PackType;
  /** Fest ermitteltes Pack-Ergebnis. Wenn null: Pack noch nicht geöffnet. */
  readonly cards: readonly Player[] | null;
  readonly onOpen: () => void;
  readonly onDone?: () => void;
  readonly nextLabel?: string;
  readonly onNext?: () => void;
  readonly title?: string;
  readonly subtitle?: string;
  /** Pack ohne Animation direkt als Zusammenfassung zeigen (z. B. nach Neuladen). */
  readonly revealed?: boolean;
}

const POS_NAMES: Record<string, string> = {
  TW: 'Torwart', IV: 'Innenverteidiger', LV: 'Linksverteidiger', RV: 'Rechtsverteidiger', ZDM: 'Defensives Mittelfeld',
  ZM: 'Zentrales Mittelfeld', ZOM: 'Offensives Mittelfeld', LM: 'Linkes Mittelfeld', RM: 'Rechtes Mittelfeld',
  LF: 'Linker Flügel', RF: 'Rechter Flügel', MS: 'Mittelstürmer', ST: 'Stürmer',
};

/** Enthüllungsreihenfolge: beste Karte zuerst (Walkout), ggf. zweitbeste, dann der Rest aufsteigend. */
export const revealOrder = (cards: readonly Player[]): { order: readonly Player[]; featured: number } => {
  const desc = [...cards].sort((a, b) => b.ovr - a.ovr);
  const featured = desc.length > 1 && desc[1]!.ovr >= FEATURE_MIN ? 2 : 1;
  const head = desc.slice(0, featured);
  const rest = desc.slice(featured).sort((a, b) => a.ovr - b.ovr);
  return { order: [...head, ...rest], featured };
};

const buildSteps = (order: readonly Player[], featured: number): Step[] => {
  const steps: Step[] = [{ kind: 'burst', index: 0, dur: 900 }];
  order.forEach((_, i) => {
    if (i < featured) {
      const first = i === 0;
      steps.push({ kind: 'suspense', index: i, dur: first ? 2400 : 1400 });
      steps.push({ kind: 'flag', index: i, dur: first ? 1100 : 900 });
      steps.push({ kind: 'pos', index: i, dur: first ? 1100 : 900 });
      steps.push({ kind: 'name', index: i, dur: first ? 1200 : 1000 });
      steps.push({ kind: 'card', index: i, dur: 0, hold: true });
    } else {
      steps.push({ kind: 'flag', index: i, dur: 320 });
      steps.push({ kind: 'pos', index: i, dur: 320 });
      steps.push({ kind: 'card', index: i, dur: 650 });
    }
  });
  return steps;
};

export const PackOpening = ({ packType, cards, onOpen, onDone, nextLabel, onNext, title, subtitle, revealed = false }: Props): ReactElement => {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const timer = useRef<number | null>(null);
  const runId = useRef(0);
  const startedAt = useRef(0);
  const stepsRef = useRef<Step[]>([]);
  const stepIdx = useRef(0);
  const orderRef = useRef<{ order: readonly Player[]; featured: number }>({ order: [], featured: 0 });
  const cfg = PACKS[packType];

  const clearTimer = (): void => { if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; } };

  const finish = (): void => { clearTimer(); setPhase({ kind: 'summary' }); onDone?.(); };

  const play = (step: Step, index: number): void => {
    const c = orderRef.current.order[step.index]!;
    stepIdx.current = index;
    setPhase({ kind: step.kind, index: step.index, hold: !!step.hold });
    switch (step.kind) {
      case 'burst': sfx.burst(); break;
      case 'suspense': sfx.suspense(); buzz([30, 200, 30, 200, 30]); break;
      case 'flag': case 'pos': sfx.flip(); break;
      case 'name': sfx.flip(); buzz(40); break;
      case 'card':
        if (step.hold) { if (c.ovr >= WALKOUT_MIN) sfx.walkout(); else sfx.reveal(c.ovr); buzz([60, 40, 60, 40, 160]); }
        else { sfx.reveal(c.ovr); buzz(25); }
        break;
    }
  };

  /** Führt Schritt i aus und plant den nächsten, außer der Schritt hält an. */
  const runFrom = (i: number, id: number): void => {
    clearTimer();
    if (runId.current !== id) return;
    const steps = stepsRef.current;
    if (i >= steps.length) { finish(); return; }
    const step = steps[i]!;
    play(step, i);
    if (step.hold) return;
    timer.current = window.setTimeout(() => runFrom(i + 1, id), step.dur);
  };

  useEffect(() => {
    clearTimer();
    if (!cards) { setPhase({ kind: 'idle' }); return; }
    const id = ++runId.current;
    startedAt.current = Date.now();
    orderRef.current = revealOrder(cards);
    stepsRef.current = buildSteps(orderRef.current.order, orderRef.current.featured);
    if (revealed) { setPhase({ kind: 'summary' }); return; }
    runFrom(0, id);
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);

  const skip = (): void => {
    if (!cards || phase.kind === 'summary' || phase.kind === 'idle') return;
    runId.current++;
    finish();
  };

  /** Weiter nach einer Haltestelle – oder Vorspulen bis zur nächsten großen Karte. */
  const advance = (): void => {
    if (!cards || phase.kind === 'summary' || phase.kind === 'idle') return;
    if (Date.now() - startedAt.current < 700) return; // Doppeltipp-Schutz direkt nach dem Öffnen
    const id = runId.current;
    const steps = stepsRef.current;
    if ('hold' in phase && phase.hold) { sfx.tap(); runFrom(stepIdx.current + 1, id); return; }
    // Vorspulen: zur nächsten Haltestelle springen, sonst zur Zusammenfassung
    let j = stepIdx.current + 1;
    while (j < steps.length && !steps[j]!.hold) j++;
    if (j < steps.length) runFrom(j, id); else skip();
  };

  if (!cards || phase.kind === 'idle') {
    return (
      <div className="opening">
        {title && <h2 className="opening-title">{title}</h2>}
        {subtitle && <p className="opening-sub">{subtitle}</p>}
        <button type="button" className={`pack pack-${packType}`} onClick={() => { sfx.tap(); onOpen(); }} aria-label={`${cfg.label} öffnen`}>
          <div className="pack-shine" />
          <div className="pack-label">{cfg.label}</div>
          <div className="pack-cards">5 Karten</div>
          <div className="pack-cta">Antippen zum Öffnen</div>
        </button>
        <p className="opening-hint">{cfg.guarantee.text}</p>
      </div>
    );
  }

  if (phase.kind === 'summary') {
    const best = bestOf(cards);
    return (
      <div className="opening">
        <h2 className="opening-title">Dein Pack</h2>
        <p className="opening-sub">Beste Karte: <strong>{best.name} · {best.ovr}</strong></p>
        <div className="summary-grid">
          {[...cards].sort((a, b) => b.ovr - a.ovr).map((c) => <Card key={c.id} player={c} size="sm" highlight={c.id === best.id} />)}
        </div>
        {onNext && <button type="button" className="btn btn-primary btn-big" onClick={() => { sfx.tap(); onNext(); }}>{nextLabel ?? 'Nächstes Pack'}</button>}
      </div>
    );
  }

  const { order, featured } = orderRef.current;
  const idx = phase.index;
  const current = order[idx]!;
  const f = FLAGS[current.nation] ?? { flag: '🏳️', name: current.nation };
  const isFeatured = idx < featured;
  const isWalkout = current.ovr >= WALKOUT_MIN;
  const big = isFeatured && phase.kind !== 'burst';
  const holding = phase.kind === 'card' && phase.hold;

  return (
    <div className={`stage${big ? ' stage-walkout' : ''}${phase.kind === 'suspense' ? ' stage-suspense' : ''}`} onClick={advance} role="presentation">
      <div className="stage-lights" />
      <div className="particles">{Array.from({ length: 24 }, (_, i) => <span key={i} style={{ ['--i' as string]: i }} />)}</div>
      <div className="stage-counter">Karte {idx + 1} / {order.length}</div>
      {phase.kind === 'burst' && <div className="burst-core" />}
      {phase.kind === 'suspense' && (
        <div className="suspense">
          <div className="suspense-text">{idx === 0 ? 'Da kommt was …' : 'Und noch einer …'}</div>
          <div className="suspense-dots"><span /><span /><span /></div>
        </div>
      )}
      {phase.kind === 'flag' && (
        <div className="reveal-step">
          <div className={`reveal-flag${big ? ' huge' : ''}`}>{f.flag}</div>
          <div className="reveal-label">{f.name}</div>
        </div>
      )}
      {phase.kind === 'pos' && (
        <div className="reveal-step">
          <div className="reveal-flag small">{f.flag}</div>
          <div className="reveal-pos">{current.pos}</div>
          <div className="reveal-label">{POS_NAMES[current.pos] ?? current.pos}</div>
        </div>
      )}
      {phase.kind === 'name' && (
        <div className="reveal-step">
          <div className="reveal-flag small">{f.flag}</div>
          <div className="reveal-name">{current.name}</div>
          <div className="reveal-label">{isWalkout ? 'WALKOUT' : 'TOP-KARTE'}</div>
        </div>
      )}
      {phase.kind === 'card' && (
        <div className={`reveal-card${isFeatured ? ' reveal-card-walkout' : ''}`}>
          <Card player={current} size="lg" />
        </div>
      )}
      {holding && (
        <div className="hold-bar">
          <div className="hold-text">{idx === 0 ? '🔥 Beste Karte des Packs!' : '💥 Zweiter Volltreffer!'}</div>
          <button type="button" className="btn btn-primary btn-big" onClick={(e) => { e.stopPropagation(); advance(); }}>
            {idx + 1 < featured ? 'Weiter – da ist noch einer' : 'Restliche Karten zeigen'}
          </button>
        </div>
      )}
      {!holding && <div className="stage-hint">Tippen = vorspulen</div>}
      <button type="button" className="btn btn-ghost skip-btn" onClick={(e) => { e.stopPropagation(); skip(); }}>Überspringen ⏭</button>
    </div>
  );
};
