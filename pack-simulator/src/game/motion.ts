import { useSyncExternalStore } from 'react';
import type { AnimationMode } from './storage';

export type Motion = 'full' | 'reduced';

const QUERY = '(prefers-reduced-motion: reduce)';
const media = (): MediaQueryList | null => { try { return window.matchMedia(QUERY); } catch { return null; } };

const subscribe = (listener: () => void): (() => void) => {
  const m = media();
  if (!m) return () => undefined;
  m.addEventListener('change', listener);
  return () => m.removeEventListener('change', listener);
};
const systemPrefersReduced = (): boolean => media()?.matches ?? false;

/**
 * Löst die Einstellung auf: „Voll“ und „Reduziert“ sind bewusste Entscheidungen,
 * „Automatisch“ folgt der Systemeinstellung für reduzierte Bewegung.
 */
export const useMotion = (mode: AnimationMode): Motion => {
  const system = useSyncExternalStore(subscribe, systemPrefersReduced, () => false);
  if (mode === 'voll') return 'full';
  if (mode === 'reduziert') return 'reduced';
  return system ? 'reduced' : 'full';
};
