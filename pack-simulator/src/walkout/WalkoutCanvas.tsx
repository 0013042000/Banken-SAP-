import { useEffect, useRef, type ReactElement } from 'react';
import type { StepKind } from '../game/reveal';
import { createDirector, type WalkoutDirector, type WalkoutSpec } from './scene';

interface Props {
  readonly spec: WalkoutSpec;
  readonly phase: StepKind;
  /** Dauer des aktuellen Schritts in ms. */
  readonly phaseDur: number;
  /** WebGL nicht verfügbar oder Kontext verloren: Die Enthüllung wechselt auf die Ersatzdarstellung. */
  readonly onFail: () => void;
}

/** Zeichenfläche des 3D-Walkouts. Wird erst bei Bedarf nachgeladen. */
export default function WalkoutCanvas({ spec, phase, phaseDur, onFail }: Props): ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const directorRef = useRef<WalkoutDirector | null>(null);
  const startedFor = useRef<string | null>(null);
  const failRef = useRef(onFail);
  useEffect(() => { failRef.current = onFail; }, [onFail]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    let director: WalkoutDirector;
    try { director = createDirector(canvas); } catch { failRef.current(); return undefined; }
    directorRef.current = director;
    const fit = (): void => director.resize(canvas.clientWidth, canvas.clientHeight);
    fit();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(fit);
    observer?.observe(canvas);
    const lost = (e: Event): void => { e.preventDefault(); failRef.current(); };
    canvas.addEventListener('webglcontextlost', lost);
    return () => {
      observer?.disconnect();
      canvas.removeEventListener('webglcontextlost', lost);
      director.dispose();
      directorRef.current = null;
      startedFor.current = null;
    };
  }, []);

  useEffect(() => {
    const director = directorRef.current;
    if (!director) return;
    if (startedFor.current !== spec.player.id) { director.start(spec); startedFor.current = spec.player.id; }
    director.setPhase(phase, phaseDur);
  }, [spec, phase, phaseDur]);

  return <canvas ref={canvasRef} className="st-canvas" aria-hidden="true" />;
}
