import { useEffect, useRef, type ReactElement } from 'react';
import { Card } from '../Card';
import { boxOf, type Box, type Flight } from './texts';

interface Props {
  readonly flight: Flight;
  readonly onDone: () => void;
}

const FLIGHT_MS = 520;
const GUARD_MS = 400;
const FLIGHT_EASING = 'cubic-bezier(.3,.7,.2,1)';
const LANDING_OPACITY = 0.75;
const HALF = 0.5;

const centerX = (box: Box): number => box.left + box.width * HALF;
const centerY = (box: Box): number => box.top + box.height * HALF;

/**
 * Lässt die gewählte Karte sichtbar von ihrem Ort auf den Mannschaftsplatz fliegen.
 * Bewegt werden nur transform und opacity; der Platz selbst zeigt die Karte, sobald sie landet.
 */
export const FlightGhost = ({ flight, onDone }: Props): ReactElement => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ghost = ref.current;
    const target = document.querySelector<HTMLElement>(`[data-dr-slot="${flight.target}"]`);
    target?.scrollIntoView({ block: 'nearest' });
    const to = boxOf(target);
    if (!ghost || !to || typeof ghost.animate !== 'function') {
      const timer = window.setTimeout(onDone, 0);
      return (): void => window.clearTimeout(timer);
    }
    const size: Box = { left: 0, top: 0, width: ghost.offsetWidth, height: ghost.offsetHeight };
    const frame = (at: Box, opacity: number): Keyframe => ({
      transform: `translate(${centerX(at) - centerX(size)}px, ${centerY(at) - centerY(size)}px) scale(${at.width / size.width})`,
      opacity,
    });
    const animation = ghost.animate([frame(flight.from, 1), frame(to, LANDING_OPACITY)], { duration: FLIGHT_MS, easing: FLIGHT_EASING, fill: 'forwards' });
    animation.addEventListener('finish', onDone);
    // Läuft die Animation nicht zu Ende (z. B. Seite im Hintergrund), darf der Platz nicht verborgen bleiben.
    const guard = window.setTimeout(onDone, FLIGHT_MS + GUARD_MS);
    return (): void => {
      window.clearTimeout(guard);
      animation.removeEventListener('finish', onDone);
      animation.cancel();
    };
  }, [flight, onDone]);

  return (
    <div className="dr-ghost" ref={ref} aria-hidden="true">
      <Card player={flight.player} size="md" />
    </div>
  );
};
