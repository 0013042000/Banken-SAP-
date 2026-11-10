import type { ReactElement } from 'react';
import { useEffect, useState } from 'react';
import type { Player } from './data/players';
import { loadCollection, loadSettings, saveCollection, saveSettings, type Collection as Coll, type Settings } from './game/storage';
import { setMuted, sfx, unlockAudio } from './game/sound';
import { FreeMode } from './components/FreeMode';
import { DuelMode } from './components/DuelMode';
import { Collection } from './components/Collection';
import { Credits } from './components/Credits';

type Tab = 'frei' | 'duell' | 'sammlung' | 'credits';

export default function App(): ReactElement {
  const [tab, setTab] = useState<Tab>('frei');
  const [collection, setCollection] = useState<Coll>(() => loadCollection());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());

  useEffect(() => { saveCollection(collection); }, [collection]);
  useEffect(() => { saveSettings(settings); setMuted(settings.muted); }, [settings]);

  const collect = (cards: readonly Player[]): void => {
    setCollection((c) => { const n = { ...c }; for (const p of cards) n[p.id] = (n[p.id] ?? 0) + 1; return n; });
  };

  const go = (t: Tab): void => { unlockAudio(); sfx.tap(); setTab(t); };

  return (
    <div className="app" onPointerDown={unlockAudio}>
      <header className="topbar">
        <div className="brand"><span className="brand-ball">⚽</span><span className="brand-text"><b>Ariel's</b> Epic Packs</span></div>
        <div className="toggles">
          <button type="button" className={`toggle${settings.dreamLuck ? ' on' : ''}`} onClick={() => { sfx.tap(); setSettings((s) => ({ ...s, dreamLuck: !s.dreamLuck })); }} aria-pressed={settings.dreamLuck}>
            ✨ Traumglück
          </button>
          <button type="button" className="toggle icon" onClick={() => setSettings((s) => ({ ...s, muted: !s.muted }))} aria-label={settings.muted ? 'Ton an' : 'Ton aus'}>
            {settings.muted ? '🔇' : '🔊'}
          </button>
        </div>
      </header>

      <main className="content">
        {tab === 'frei' && <FreeMode dreamLuck={settings.dreamLuck} onCollect={collect} />}
        {tab === 'duell' && <DuelMode dreamLuck={settings.dreamLuck} />}
        {tab === 'sammlung' && <Collection collection={collection} onReset={() => setCollection({})} />}
        {tab === 'credits' && <Credits onClose={() => go('frei')} />}
        <footer className="disclaimer">
          Eigener Simulator · fiktive Bewertungen und Ziehchancen · keine Verbindung zu EA · <button type="button" onClick={() => go('credits')}>Bildnachweise</button>
        </footer>
      </main>

      <nav className="tabbar">
        <button type="button" className={tab === 'frei' ? 'active' : ''} onClick={() => go('frei')}><span>🎁</span>Packs</button>
        <button type="button" className={tab === 'duell' ? 'active' : ''} onClick={() => go('duell')}><span>⚔️</span>Duell</button>
        <button type="button" className={tab === 'sammlung' ? 'active' : ''} onClick={() => go('sammlung')}><span>🗂️</span>Sammlung</button>
      </nav>
    </div>
  );
}
