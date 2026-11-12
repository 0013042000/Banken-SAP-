import { useState, type ReactElement } from 'react';
import { DraftHub } from './DraftHub';

/**
 * Prüfseite für den Draft-Modus ohne die App-Navigation. Nur für Entwicklung und Browserprüfung:
 * erreichbar über den Vite-Dev-Server (/src/components/draft/dev.html), nicht im Produktionsbuild.
 * Adresszusätze: ?calm=1 schaltet die reduzierte Bewegung ein, ?ton=1 den Ton.
 */
export const DevHarness = (): ReactElement => {
  const params = new URLSearchParams(window.location.search);
  const [log, setLog] = useState<readonly string[]>([]);
  const note = (entry: string): void => setLog((entries) => [...entries, entry]);
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="brand-ball">⚽</span><span className="brand-text"><b>Draft</b> Prüfseite</span></div>
      </header>
      <main className="content">
        <DraftHub reducedMotion={params.has('calm')} muted={!params.has('ton')}
          onPlaySquad={(id) => note(`spielen:${id}`)} onChanged={() => note('geändert')} />
        <output id="dev-log" className="disclaimer" style={{ display: 'block', whiteSpace: 'pre-wrap' }}>{log.join('\n')}</output>
      </main>
      <nav className="tabbar" aria-label="Platzhalter für die Navigation">
        <button type="button" className="active"><span>🃏</span>Draft</button>
        <button type="button"><span>⚽</span>Spielen</button>
      </nav>
    </div>
  );
};
