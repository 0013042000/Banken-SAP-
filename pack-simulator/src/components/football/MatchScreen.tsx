import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { createMatchAudio, type MatchAudio } from '../../football/audio';
import { goalText, hudOf, sameHud, type Hud } from '../../football/hud';
import { createInput } from '../../football/input';
import type { MatchDriver } from '../../football/match';
import { createRenderer, type PlayerLook, type RenderView } from '../../football/render';
import { lookFor } from '../../data/looks';
import { PLAYER_BY_ID } from '../../data/players';
import { Phase, type SimEvent, type TeamInput } from '../../football/sim/index.ts';
import { Modal } from '../Modal';

interface Props {
  readonly driver: MatchDriver;
  readonly muted: boolean;
  /** Online läuft das Spiel im Menü weiter; gegen den Computer hält die Pause die Uhr an. */
  readonly online: boolean;
  /** Hinweis über dem Feld, z. B. „Verbindung wird wiederhergestellt …“. */
  readonly notice: string | null;
  /** Kleiner Verbindungsstatus in der Kopfzeile (nur online). */
  readonly statusLabel: string | null;
  readonly onEnded: () => void;
  readonly onQuit: () => void;
}

interface LockedStyles {
  readonly overflow: string;
  readonly overscroll: string;
}

const ENDED_DELAY_MS = 1600;
const PORTRAIT_QUERY = '(orientation: portrait)';

const flipInput = (input: TeamInput): TeamInput => ({ ...input, moveX: -input.moveX, moveY: -input.moveY });

/**
 * Sperrt Scrollen und Gummiband-Effekt der Seite, solange das Spiel läuft, und stellt danach alles wieder her.
 * Gesperrt wird bewusst am Wurzelelement und nicht am body: Der Pause-Dialog (Modal) merkt sich body.style.overflow
 * selbst und würde beim gemeinsamen Schließen sonst einen veralteten Wert zurückschreiben.
 */
const lockPageScroll = (): (() => void) => {
  const root = document.documentElement;
  const before: LockedStyles = { overflow: root.style.overflow, overscroll: root.style.overscrollBehavior };
  root.style.setProperty('overflow', 'hidden');
  root.style.setProperty('overscroll-behavior', 'none');
  const blockZoom = (event: Event): void => event.preventDefault();
  document.addEventListener('gesturestart', blockZoom);
  return (): void => {
    root.style.setProperty('overflow', before.overflow);
    root.style.setProperty('overscroll-behavior', before.overscroll);
    document.removeEventListener('gesturestart', blockZoom);
  };
};

/** Das eigentliche Spiel: Feld, Anzeige, Touch-Steuerung, Pause. Füllt den ganzen Bildschirm. */
const NEUTRAL_LOOK: PlayerLook = { skin: '#e9bf9d', hair: '#2b1d14', bald: false };
/** Haut- und Haarfarbe des stilisierten Avatars zu einer Karte. */
const lookOfCard = (cardId: string): PlayerLook => {
  const card = PLAYER_BY_ID.get(cardId);
  if (!card) return NEUTRAL_LOOK;
  const look = lookFor(card);
  return { skin: look.skin, hair: look.hairColor, bald: look.hair === 'glatze' };
};

export const MatchScreen = ({ driver, muted, online, notice, statusLabel, onEnded, onQuit }: Props): ReactElement => {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zoneRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const passRef = useRef<HTMLButtonElement>(null);
  const shootRef = useRef<HTMLButtonElement>(null);
  const swapRef = useRef<HTMLButtonElement>(null);
  const audioRef = useRef<MatchAudio | null>(null);
  const pausedRef = useRef(false);
  const endedRef = useRef(onEnded);
  const mutedRef = useRef(muted);

  const [hud, setHud] = useState<Hud | null>(null);
  const [paused, setPausedState] = useState(false);
  const [rotateHint, setRotateHint] = useState(() => window.matchMedia(PORTRAIT_QUERY).matches);
  const [fullscreen, setFullscreen] = useState(false);
  const [canFullscreen] = useState(() => document.fullscreenEnabled);

  useEffect(() => { endedRef.current = onEnded; }, [onEnded]);
  useEffect(() => {
    mutedRef.current = muted;
    audioRef.current?.setMuted(muted);
  }, [muted]);

  const setPaused = useCallback((next: boolean): void => {
    pausedRef.current = next;
    driver.setPaused(next && !online);
    setPausedState(next);
  }, [driver, online]);

  useEffect(() => lockPageScroll(), []);

  useEffect(() => {
    const audio = createMatchAudio(mutedRef.current);
    audioRef.current = audio;
    audio.unlock();
    return (): void => {
      audio.dispose();
      audioRef.current = null;
    };
  }, []);

  useEffect(() => {
    const query = window.matchMedia(PORTRAIT_QUERY);
    const onChange = (): void => { if (!query.matches) setRotateHint(false); };
    const onFullscreen = (): void => setFullscreen(document.fullscreenElement !== null);
    query.addEventListener('change', onChange);
    document.addEventListener('fullscreenchange', onFullscreen);
    return (): void => {
      query.removeEventListener('change', onChange);
      document.removeEventListener('fullscreenchange', onFullscreen);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const stage = stageRef.current;
    const parts = {
      stickZone: zoneRef.current, stickBase: baseRef.current, stickKnob: knobRef.current,
      pass: passRef.current, shoot: shootRef.current, swap: swapRef.current,
    };
    const { stickZone, stickBase, stickKnob, pass, shoot, swap } = parts;
    if (!canvas || !stage || !stickZone || !stickBase || !stickKnob || !pass || !shoot || !swap) return undefined;

    const { meta } = driver;
    const flip = meta.myTeam === 1;
    const view: RenderView = {
      flip,
      myTeam: meta.myTeam,
      names: [...meta.teams[0].players, ...meta.teams[1].players].map((p) => p.name),
      looks: [...meta.teams[0].players, ...meta.teams[1].players].map((spec) => lookOfCard(spec.id)),
    };
    const renderer = createRenderer(canvas);
    const input = createInput({ stickZone, stickBase, stickKnob, pass, shoot, swap }, () => {
      audioRef.current?.unlock();
      setPaused(!pausedRef.current);
    }, () => !pausedRef.current);
    const sample = (): TeamInput => (flip ? flipInput(input.sample()) : input.sample());
    const resize = (): void => renderer.resize(stage.clientWidth, stage.clientHeight);
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();

    let lastGoal: string | null = null;
    let shown: Hud | null = null;
    let endTimer: ReturnType<typeof setTimeout> | null = null;
    let raf = 0;

    const onEvent = (event: SimEvent): void => {
      audioRef.current?.play(event);
      if (event.type === 'goal') lastGoal = goalText(event, meta);
    };

    const loop = (now: number): void => {
      raf = requestAnimationFrame(loop);
      const frame = driver.advance(now, sample);
      renderer.draw(frame, view);
      driver.drainEvents().forEach(onEvent);
      const next = hudOf(frame, meta, lastGoal);
      if (!shown || !sameHud(shown, next)) {
        shown = next;
        setHud(next);
      }
      if (frame.phase === Phase.Ended && endTimer === null) {
        endTimer = setTimeout(() => endedRef.current(), ENDED_DELAY_MS);
      }
    };
    raf = requestAnimationFrame(loop);

    return (): void => {
      cancelAnimationFrame(raf);
      if (endTimer !== null) clearTimeout(endTimer);
      observer.disconnect();
      input.dispose();
    };
  }, [driver, setPaused]);

  const toggleFullscreen = async (): Promise<void> => {
    audioRef.current?.unlock();
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await rootRef.current?.requestFullscreen();
      // Querformat festhalten, wo der Browser es erlaubt (meist nur Android im Vollbild).
      await window.screen.orientation?.lock?.('landscape');
    } catch {
      // Vollbild oder Drehsperre abgelehnt bzw. nicht unterstützt: Das Spiel läuft normal weiter.
    }
  };

  const { meta } = driver;
  const mine = meta.teams[meta.myTeam];
  const theirs = meta.teams[meta.myTeam ? 0 : 1];

  return (
    <div className="fb-match" ref={rootRef} data-ball={hud?.ball} data-phase={hud?.phase} onPointerDown={() => audioRef.current?.unlock()}>
      <header className="fb-hud">
        {/* pointerup zusätzlich zu click: Direkt nach einer Wischbewegung unterdrücken Browser den Klick eines Tipps. */}
        <button type="button" className="fb-hud-btn" onClick={() => setPaused(true)} onPointerUp={() => setPaused(true)} aria-label="Pause">⏸</button>
        <div className="fb-score" aria-live="polite">
          <span className="fb-team fb-team-mine">{mine.name}</span>
          <span className="fb-goals" data-testid="fb-score">{hud?.mine ?? 0} : {hud?.theirs ?? 0}</span>
          <span className="fb-team fb-team-theirs">{theirs.name}</span>
        </div>
        <span className="fb-clock" data-testid="fb-clock">{hud?.clock ?? ''}</span>
        {statusLabel && <span className="fb-conn">{statusLabel}</span>}
        {canFullscreen && (
          <button type="button" className="fb-hud-btn" onClick={() => { void toggleFullscreen(); }} aria-label={fullscreen ? 'Vollbild verlassen' : 'Vollbild'}>
            {fullscreen ? '🗗' : '⛶'}
          </button>
        )}
      </header>

      <div className="fb-stage" ref={stageRef}>
        <canvas ref={canvasRef} className="fb-canvas" aria-label="Spielfeld" />
        {hud?.banner && (
          <div className="fb-banner" data-testid="fb-banner">
            <strong>{hud.banner}</strong>
            {hud.detail && <span>{hud.detail}</span>}
          </div>
        )}
        {notice && <div className="fb-notice-box" role="status">{notice}</div>}
      </div>

      <div className="fb-controls">
        {rotateHint && (
          <div className="fb-rotate" role="note">
            <span>📱 Handy drehen für mehr Übersicht</span>
            <button type="button" onClick={() => setRotateHint(false)} aria-label="Hinweis schließen">✕</button>
          </div>
        )}
        <div className="fb-stick-zone" ref={zoneRef}>
          <div className="fb-stick-base" ref={baseRef}><div className="fb-stick-knob" ref={knobRef} /></div>
          <span className="fb-stick-hint">Laufen</span>
        </div>
        <div className="fb-buttons">
          <button type="button" tabIndex={-1} className="fb-action fb-action-swap" ref={swapRef}>{hud?.swapLabel ?? 'Wechsel'}</button>
          <button type="button" tabIndex={-1} className="fb-action fb-action-pass" ref={passRef}>Pass</button>
          <button type="button" tabIndex={-1} className="fb-action fb-action-shoot" ref={shootRef}>Schuss</button>
        </div>
      </div>

      {paused && (
        <Modal title={online ? 'Spielmenü' : 'Pause'} onClose={() => setPaused(false)}>
          <p className="modal-text">
            {online ? 'Online läuft das Spiel weiter, während dieses Menü offen ist.' : 'Das Spiel ist angehalten.'}
          </p>
          <p className="fb-keys">Tastatur: WASD/Pfeile laufen · J oder Leertaste Pass · K Schuss · L Wechsel/Ball holen · P Pause</p>
          <div className="modal-actions">
            <button type="button" className="btn btn-primary" onClick={() => setPaused(false)}>Weiter</button>
            <button type="button" className="btn btn-danger" onClick={onQuit}>Spiel beenden</button>
          </div>
        </Modal>
      )}
    </div>
  );
};
