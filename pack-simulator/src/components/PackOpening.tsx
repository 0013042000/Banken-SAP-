import type { ReactElement } from 'react';
import { useEffect, useRef, useState } from 'react';
import { FLAGS, type Player } from '../data/players';
import { bestOf, PACKS, WALKOUT_MIN, type PackType } from '../game/packs';
import { sfx } from '../game/sound';
import { Card } from './Card';

export type Phase =
  | { kind: 'idle' }
  | { kind: 'burst' }
  | { kind: 'walkout'; index: number }
  | { kind: 'flag'; index: number }
  | { kind: 'pos'; index: number }
  | { kind: 'card'; index: number }
  | { kind: 'summary' };

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
}

const POS_NAMES: Record<string, string> = {
  TW: 'Torwart', IV: 'Innenverteidiger', LV: 'Linksverteidiger', RV: 'Rechtsverteidiger', ZDM: 'Defensives Mittelfeld',
  ZM: 'Zentrales Mittelfeld', ZOM: 'Offensives Mittelfeld', LM: 'Linkes Mittelfeld', RM: 'Rechtes Mittelfeld',
  LF: 'Linker Flügel', RF: 'Rechter Flügel', MS: 'Mittelstürmer', ST: 'Stürmer',
};

export const PackOpening = ({ packType, cards, onOpen, onDone, nextLabel, onNext, title, subtitle }: Props): ReactElement => {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const timers = useRef<number[]>([]);
  const runId = useRef(0);
  const startedAt = useRef(0);
  const cfg = PACKS[packType];

  const clearTimers = (): void => { timers.current.forEach((t) => window.clearTimeout(t)); timers.current = []; };

  // Zeitplan aufbauen, sobald ein Ergebnis vorliegt
  useEffect(() => {
    clearTimers();
    if (!cards) { setPhase({ kind: 'idle' }); return; }
    const id = ++runId.current;
    startedAt.current = Date.now();
    const steps: Array<{ at: number; run: () => void }> = [];
    let t = 0;
    steps.push({ at: t, run: () => { setPhase({ kind: 'burst' }); sfx.burst(); } });
    t += 800;
    cards.forEach((c, i) => {
      const walk = c.ovr >= WALKOUT_MIN;
      if (walk) { steps.push({ at: t, run: () => { setPhase({ kind: 'walkout', index: i }); sfx.walkout(); } }); t += 1000; }
      steps.push({ at: t, run: () => { setPhase({ kind: 'flag', index: i }); sfx.flip(); } }); t += walk ? 350 : 260;
      steps.push({ at: t, run: () => { setPhase({ kind: 'pos', index: i }); sfx.flip(); } }); t += walk ? 350 : 260;
      steps.push({ at: t, run: () => { setPhase({ kind: 'card', index: i }); sfx.reveal(c.ovr); } }); t += walk ? 1000 : 400;
    });
    steps.push({ at: t, run: () => { setPhase({ kind: 'summary' }); onDone?.(); } });
    timers.current = steps.map((s) => window.setTimeout(() => { if (runId.current === id) s.run(); }, s.at));
    return clearTimers;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);

  const skip = (fromStage = false): void => {
    if (!cards || phase.kind === 'summary') return;
    // Schutz vor Doppeltipp direkt nach dem Öffnen: Bühnen-Tipps erst nach 700 ms
    if (fromStage && Date.now() - startedAt.current < 700) return;
    runId.current++;
    clearTimers();
    setPhase({ kind: 'summary' });
    onDone?.();
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

  const idx = 'index' in phase ? phase.index : 0;
  const current = cards[idx]!;
  const f = FLAGS[current.nation] ?? { flag: '🏳️', name: current.nation };
  const walk = current.ovr >= WALKOUT_MIN;

  return (
    <div className={`opening stage${walk && phase.kind !== 'burst' ? ' stage-walkout' : ''}`} onClick={() => skip(true)} role="presentation">
      <div className="stage-lights" />
      <div className="particles">{Array.from({ length: 24 }, (_, i) => <span key={i} style={{ ['--i' as string]: i }} />)}</div>
      <div className="stage-counter">Karte {idx + 1} / {cards.length}</div>
      {phase.kind === 'burst' && <div className="burst-core" />}
      {phase.kind === 'walkout' && (
        <div className="walkout-banner">
          <div className="walkout-text">WALKOUT</div>
          <div className="walkout-sub">Eine besondere Karte kommt …</div>
        </div>
      )}
      {phase.kind === 'flag' && (
        <div className="reveal-step">
          <div className="reveal-flag">{f.flag}</div>
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
      {phase.kind === 'card' && (
        <div className={`reveal-card${walk ? ' reveal-card-walkout' : ''}`}>
          <Card player={current} size="lg" />
        </div>
      )}
      <button type="button" className="btn btn-ghost skip-btn" onClick={(e) => { e.stopPropagation(); skip(); }}>Überspringen ⏭</button>
    </div>
  );
};
