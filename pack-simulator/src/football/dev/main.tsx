/**
 * Entwicklungsansicht für den Fußballmodus, solange er noch nicht in die App-Navigation eingebunden ist.
 * Aufruf: `npm run dev` und dann /src/football/dev/index.html
 *   ?squads=none  → ohne eigene Kader (leerer Zustand)
 *   ?muted=1      → Ton aus
 */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { DevApp } from './DevApp';

const root = document.getElementById('root');
if (root) createRoot(root).render(<StrictMode><DevApp /></StrictMode>);
