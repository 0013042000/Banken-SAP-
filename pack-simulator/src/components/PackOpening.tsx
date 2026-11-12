import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement } from 'react';
import { FLAGS, type Player } from '../data/players';
import type { Motion } from '../game/motion';
import { bestOf, PACKS, type PackType } from '../game/packs';
import { buildSteps, revealOrder, styleFor, type RevealMode, type RevealStep, type RevealStyle, type StepKind } from '../game/reveal';
import { sfx, stopAllSounds } from '../game/sound';
import type { WalkoutSpec } from '../walkout/scene';
import { markWebglFailed, webglSupported } from '../walkout/support';
import { Boundary } from './Boundary';
import { Card } from './Card';

/** Die 3D-Szene wird erst geladen, wenn eine besondere Karte ansteht. */
const WalkoutCanvas = lazy(() => import('../walkout/WalkoutCanvas'));

/** Vibration ist optional und wird nicht von jedem Gerät unterstützt – darf nie blockieren. */
const buzz = (pattern: number | number[]): void => { try { navigator.vibrate?.(pattern); } catch { /* nicht unterstützt */ } };

/** Schutz vor Doppeltipps: direkt nach dem Öffnen bzw. nach Erreichen eines Haltebilds. */
const START_GUARD_MS = 700;
const HOLD_GUARD_MS = 500;

type Phase = { kind: 'idle' } | { kind: 'summary' } | { kind: StepKind; index: number; hold: boolean; dur: number };

interface Props {
  readonly packType: PackType;
  /** Fest ermitteltes Pack-Ergebnis. Wenn null: Pack noch nicht geöffnet. */
  readonly cards: readonly Player[] | null;
  /** Aufgelöste Animationseinstellung (Voll oder Reduziert). */
  readonly motion: Motion;
  readonly onOpen: () => void;
  readonly onDone?: () => void;
  readonly nextLabel?: string;
  readonly onNext?: () => void;
  /** Optionaler Einstieg in „Mein Team“ aus der Packübersicht. */
  readonly onTeam?: () => void;
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

// Feste, begrenzte Dekor-Elemente der Ersatzenthüllung (keine Zufallswerte pro Render).
const EMBERS = Array.from({ length: 16 }, (_, i) => ({ left: (i * 61 + 7) % 100, delay: ((i * 37) % 26) / 10, dur: 2.6 + (i % 5) * 0.35, size: 3 + (i % 3) * 2 }));
const CONFETTI = Array.from({ length: 28 }, (_, i) => ({ left: (i * 37 + 5) % 100, delay: (i % 7) * 0.13, dur: 1.9 + (i % 5) * 0.25, tone: i % 5 }));
const STARS = Array.from({ length: 12 }, (_, i) => ({ left: ((i * 29 + 8) % 88) + 6, top: ((i * 53 + 11) % 64) + 8, delay: (i % 6) * 0.35, size: 10 + (i % 4) * 4 }));
const TUNNEL = [0, 1, 2, 3, 4];
const cssVar = (name: string, value: string | number): CSSProperties => ({ [name]: value } as CSSProperties);

const nameTag = (st: RevealStyle): string => {
  if (st.legend && st.elite) return 'LEGENDÄRE WELTKLASSE';
  if (st.legend) return 'LEGENDE';
  if (st.elite) return 'WELTKLASSE';
  return st.tier === 'walkout' ? 'WALKOUT' : 'STARKER FUND';
};
const darkText = (st: RevealStyle, first: boolean): string => {
  if (!first) return 'Und da kommt noch einer …';
  if (st.legend) return 'Eine Legende betritt den Rasen …';
  if (st.elite) return 'Das Stadion hält den Atem an …';
  return 'Da kommt was Großes …';
};
const holdText = (st: RevealStyle, first: boolean): string => {
  if (!first) return '💥 Und noch ein Volltreffer!';
  if (st.legend && st.elite) return '👑 Legendäre Weltklasse!';
  if (st.legend) return '👑 Legende gezogen!';
  if (st.elite) return '💎 Weltklasse!';
  if (st.tier === 'walkout') return '⭐ Walkout!';
  if (st.tier === 'strong') return '🔥 Starker Fund!';
  return 'Beste Karte des Packs';
};

const NORMAL_STYLE: RevealStyle = { tier: 'normal', legend: false, elite: false };

export const PackOpening = ({ packType, cards, motion, onOpen, onDone, nextLabel, onNext, onTeam, title, subtitle, revealed = false }: Props): ReactElement => {
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  /** Darstellungsart des laufenden Packs; wird beim Öffnen festgelegt. */
  const [mode, setMode] = useState<RevealMode>('css');
  const timer = useRef<number | null>(null);
  const runId = useRef(0);
  const startedAt = useRef(0);
  const holdAt = useRef(0);
  const stepsRef = useRef<RevealStep[]>([]);
  const stepIdx = useRef(0);
  const cfg = PACKS[packType];
  const reveal = useMemo(() => (cards ? revealOrder(cards) : { order: [] as readonly Player[], featured: 0 }), [cards]);

  const clearTimer = (): void => { if (timer.current !== null) { window.clearTimeout(timer.current); timer.current = null; } };
  const stopEffects = (): void => { clearTimer(); stopAllSounds(); buzz(0); };

  const finish = (): void => { stopEffects(); setPhase({ kind: 'summary' }); onDone?.(); };

  const play = (step: RevealStep, index: number, order: readonly Player[], featured: number): void => {
    const c = order[step.index];
    if (!c) return;
    const st = styleFor(c);
    stepIdx.current = index;
    if (step.hold) holdAt.current = Date.now();
    setPhase({ kind: step.kind, index: step.index, hold: Boolean(step.hold), dur: step.dur });
    switch (step.kind) {
      case 'burst': sfx.burst(); break;
      case 'dark': sfx.suspense(step.dur); buzz([30, 220, 30, 220, 30]); break;
      case 'flag': case 'pos': sfx.flip(); break;
      case 'walk': sfx.entrance(step.dur); buzz([20, 120, 20, 120, 40]); break;
      case 'name': sfx.flip(); buzz(40); break;
      case 'card':
        if (step.index >= featured) { sfx.reveal(c.ovr); buzz(25); break; }
        if (st.tier === 'walkout') {
          if (st.legend) sfx.legend(); else sfx.walkout();
          if (st.elite) sfx.elite();
          sfx.crowd();
          buzz([60, 40, 60, 40, 160]);
        } else if (st.tier === 'strong') { sfx.strong(); buzz([40, 30, 80]); }
        else { sfx.reveal(c.ovr); buzz(30); }
        break;
    }
  };

  /** Führt Schritt i aus und plant den nächsten, außer der Schritt ist ein Haltebild. */
  const runFrom = (i: number, id: number, order: readonly Player[], featured: number): void => {
    clearTimer();
    if (runId.current !== id) return;
    const steps = stepsRef.current;
    const step = steps[i];
    if (!step) { finish(); return; }
    play(step, i, order, featured);
    if (step.hold) return;
    timer.current = window.setTimeout(() => runFrom(i + 1, id, order, featured), step.dur);
  };

  useEffect(() => {
    stopEffects();
    if (!cards) { setPhase({ kind: 'idle' }); return undefined; }
    const id = ++runId.current;
    startedAt.current = Date.now();
    const { order, featured } = revealOrder(cards);
    const nextMode: RevealMode = motion === 'reduced' ? 'reduced' : webglSupported() ? '3d' : 'css';
    setMode(nextMode);
    stepsRef.current = buildSteps(order, featured, nextMode);
    if (revealed) { setPhase({ kind: 'summary' }); return undefined; }
    runFrom(0, id, order, featured);
    // Aufräumen beim Verlassen: Timer, Töne und Vibration stoppen. Ohne Timer läuft kein Schritt mehr nach.
    return stopEffects;
    // Die Darstellungsart wird beim Öffnen festgelegt und während eines laufenden Packs nicht gewechselt.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cards]);

  const active = cards !== null && phase.kind !== 'summary' && phase.kind !== 'idle';

  const skip = (): void => {
    if (!active) return;
    runId.current++;
    finish();
  };

  /** Weiter nach einem Haltebild – oder Vorspulen bis zur nächsten besonderen Karte. */
  const advance = (): void => {
    if (!active || !('hold' in phase)) return;
    const now = Date.now();
    if (now - startedAt.current < START_GUARD_MS) return;
    const id = runId.current;
    const steps = stepsRef.current;
    if (phase.hold) {
      // Dieselbe Eingabe darf nicht das Vorspulen beenden und zugleich das Haltebild überspringen.
      if (now - holdAt.current < HOLD_GUARD_MS) return;
      sfx.tap();
      runFrom(stepIdx.current + 1, id, reveal.order, reveal.featured);
      return;
    }
    const next = steps.findIndex((s, i) => i > stepIdx.current && s.hold);
    stopAllSounds();
    if (next >= 0) runFrom(next, id, reveal.order, reveal.featured); else skip();
  };

  /** 3D-Szene nicht verfügbar: für den Rest der Sitzung gilt die Ersatzenthüllung. */
  const on3dFail = (): void => { markWebglFailed(); setMode((m) => (m === '3d' ? 'css' : m)); };

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
        {onTeam && <button type="button" className="btn btn-secondary btn-big" onClick={() => { sfx.tap(); onTeam(); }}>⚽ Zum Team</button>}
      </div>
    );
  }

  const { order, featured } = reveal;
  const idx = phase.index;
  const current = order[idx];
  if (!current) return <div className="opening" />;
  const f = FLAGS[current.nation] ?? { flag: '🏳️', name: current.nation };
  const featuredCard = idx < featured;
  const cardStyle = featuredCard ? styleFor(current) : NORMAL_STYLE;
  // Während des Lichtblitzes bleibt die Bühne neutral, damit er nichts verrät.
  const st: RevealStyle = phase.kind === 'burst' ? NORMAL_STYLE : cardStyle;
  const first = idx === 0;
  const holding = phase.kind === 'card' && phase.hold;
  const special = st.tier !== 'normal';
  const figure = mode === '3d' && cardStyle.tier !== 'normal';
  const reduced = mode === 'reduced';
  const stageClass = [
    'stage', `tier-${st.tier}`, `ph-${phase.kind}`,
    st.legend ? 'is-legend' : '', st.elite ? 'is-elite' : '', holding ? 'is-hold' : '', reduced ? 'is-reduced' : '', figure ? 'has-3d' : '',
  ].filter(Boolean).join(' ');
  const remaining = order.length > featured && !reduced;
  const continueLabel = idx + 1 < featured ? 'Weiter – da ist noch einer' : remaining ? 'Restliche Karten zeigen' : 'Zur Packübersicht';
  const spec: WalkoutSpec | null = figure
    ? { player: current, tier: cardStyle.tier, legend: cardStyle.legend, elite: cardStyle.elite }
    : null;

  const fallbackLayers = (
    <>
      <div className="st-lamps" />
      <div className="st-flood st-flood-l" />
      <div className="st-flood st-flood-r" />
      <div className="st-crowd" />
      {phase.kind === 'dark' && (
        <div className="st-tunnel">{TUNNEL.map((i) => <span key={i} style={cssVar('--i', i)} />)}</div>
      )}
      {special && phase.kind !== 'dark' && <div className="st-rays" />}
      {special && (
        <div className="st-embers">
          {EMBERS.map((e, i) => <span key={i} style={{ left: `${e.left}%`, width: e.size, height: e.size, animationDuration: `${e.dur}s`, animationDelay: `-${e.delay}s` }} />)}
        </div>
      )}
      {st.legend && (
        <div className="st-stars">
          {STARS.map((s, i) => <span key={i} style={{ left: `${s.left}%`, top: `${s.top}%`, fontSize: s.size, animationDelay: `${s.delay}s` }}>✦</span>)}
        </div>
      )}
      {phase.kind === 'card' && st.elite && (
        <>
          <div className="st-ring" key={`ring-${idx}`} />
          <div className="st-confetti" key={`confetti-${idx}`}>
            {CONFETTI.map((c, i) => <span key={i} className={`cf-${c.tone}`} style={{ left: `${c.left}%`, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }} />)}
          </div>
        </>
      )}
    </>
  );

  return (
    <div className={stageClass} onClick={advance} role="presentation">
      <div className="st-bg" aria-hidden="true">
        {spec ? (
          <Boundary fallback={fallbackLayers} onError={on3dFail}>
            <Suspense fallback={null}>
              <WalkoutCanvas spec={spec} phase={phase.kind} phaseDur={phase.dur} onFail={on3dFail} />
            </Suspense>
          </Boundary>
        ) : fallbackLayers}
        {phase.kind === 'card' && special && <div className="st-flash" key={`flash-${idx}`} />}
      </div>

      <div className="st-top">
        <span className="st-counter">{phase.kind === 'burst' ? '' : `Karte ${idx + 1} / ${order.length}`}</span>
        <button type="button" className="st-skip" onClick={(e) => { e.stopPropagation(); skip(); }}>Überspringen ⏭</button>
      </div>

      <div className="st-center">
        {phase.kind === 'burst' && <div className="burst-core" />}
        {phase.kind === 'dark' && (
          <div className="rv-step rv-dark" key={`dark-${idx}`}>
            <div className="rv-dark-text">{darkText(st, first)}</div>
            <div className="rv-dots"><span /><span /><span /></div>
          </div>
        )}
        {phase.kind === 'flag' && (
          <div className="rv-step" key={`flag-${idx}`}>
            <div className={`rv-flag${special ? ' big' : ''}`}>{f.flag}</div>
            <div className="rv-label">{f.name}</div>
          </div>
        )}
        {phase.kind === 'pos' && (
          <div className="rv-step" key={`pos-${idx}`}>
            <div className="rv-flag small">{f.flag}</div>
            <div className="rv-pos">{current.pos}</div>
            <div className="rv-label">{POS_NAMES[current.pos] ?? current.pos}</div>
          </div>
        )}
        {phase.kind === 'walk' && (
          <div className="rv-step rv-chip" key={`walk-${idx}`}>
            <span className="rv-chip-flag">{f.flag}</span>
            <span className="rv-chip-pos">{current.pos}</span>
            <span className="rv-chip-text">{POS_NAMES[current.pos] ?? current.pos}</span>
          </div>
        )}
        {phase.kind === 'name' && (
          <div className="rv-step rv-lower" key={`name-${idx}`}>
            <div className="rv-flag small">{f.flag} <span className="rv-pos-mini">{current.pos}</span></div>
            <div className="rv-name">{current.name}</div>
            <div className="rv-tag">{nameTag(st)}</div>
          </div>
        )}
        {phase.kind === 'card' && (
          <div className={`rv-card rv-card-${st.tier}`} key={`card-${idx}`}>
            <div className="rv-halo" />
            <Card player={current} size="lg" />
          </div>
        )}
      </div>

      <div className="st-bottom">
        {holding ? (
          <>
            <div className="hold-text">{holdText(st, first)}</div>
            <button type="button" className="btn btn-primary btn-big" onClick={(e) => { e.stopPropagation(); advance(); }}>{continueLabel}</button>
          </>
        ) : (
          <div className="st-hint">Tippen = vorspulen</div>
        )}
      </div>
      <div className="sr-only" aria-live="polite">{phase.kind === 'card' ? `${current.name}, ${current.pos}, Bewertung ${current.ovr}` : ''}</div>
    </div>
  );
};
