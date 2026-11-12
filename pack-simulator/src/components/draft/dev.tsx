import { createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../../index.css';
import { listDraftSquads } from '../../game/draft/store';
import { DevHarness } from './DevHarness';

// Einstieg der Prüfseite (siehe DevHarness). Für die Browserprüfung ist die Kaderliste
// erreichbar, wie sie der Fußballmodus bekommt.
Object.assign(window, { draftDev: { listDraftSquads } });

const root = document.getElementById('root');
if (root) createRoot(root).render(createElement(StrictMode, null, createElement(DevHarness)));
