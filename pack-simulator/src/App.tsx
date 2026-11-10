import { useEffect, useMemo, useState, useSyncExternalStore, type ReactElement } from 'react';
import type { Player } from './data/players';
import {
  getStorageOk, loadCollection, loadSettings, loadTeamRaw, saveCollection, saveSettings, saveTeam, subscribeStorageStatus,
  type Collection as Coll, type Settings,
} from './game/storage';
import { setMuted, sfx, unlockAudio } from './game/sound';
import { sameTeam, sanitizeTeam, type Team } from './game/team';
import { FreeMode } from './components/FreeMode';
import { DuelMode } from './components/DuelMode';
import { Collection } from './components/Collection';
import { Credits } from './components/Credits';
import { TeamView } from './components/TeamView';

type Tab = 'frei' | 'duell' | 'team' | 'sammlung' | 'credits';

const ownedSet = (c: Coll): Set<string> => new Set(Object.keys(c).filter((id) => (c[id] ?? 0) > 0));

export default function App(): ReactElement {
  const [tab, setTab] = useState<Tab>('frei');
  const [collection, setCollection] = useState<Coll>(() => loadCollection());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [rawTeam, setTeam] = useState<Team>(() => sanitizeTeam(loadTeamRaw(), ownedSet(loadCollection())));
  const storageOk = useSyncExternalStore(subscribeStorageStatus, getStorageOk);

  const owned = useMemo(() => ownedSet(collection), [collection]);
  // Nur besessene Spieler dürfen aufgestellt sein (z. B. nach dem Zurücksetzen der Sammlung).
  // Das gültige Team wird beim Rendern abgeleitet; der Name bleibt beim Tippen unangetastet.
  const team = useMemo(() => {
    const clean = { ...sanitizeTeam(rawTeam, owned), name: rawTeam.name };
    return sameTeam(clean, rawTeam) ? rawTeam : clean;
  }, [rawTeam, owned]);

  useEffect(() => { saveCollection(collection); }, [collection]);
  useEffect(() => { saveSettings(settings); setMuted(settings.muted); }, [settings]);
  useEffect(() => { saveTeam(team); }, [team]);

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
        {!storageOk && (
          <p className="storage-warning" role="status">Speichern ist in diesem Browser gerade nicht möglich. Du kannst weiterspielen, aber Änderungen bleiben nach dem Schließen eventuell nicht erhalten.</p>
        )}
        {tab === 'frei' && <FreeMode dreamLuck={settings.dreamLuck} onCollect={collect} onTeam={() => go('team')} />}
        {tab === 'duell' && <DuelMode dreamLuck={settings.dreamLuck} onTeam={() => go('team')} />}
        {tab === 'team' && <TeamView team={team} collection={collection} onChange={setTeam} onGoPacks={() => go('frei')} />}
        {tab === 'sammlung' && <Collection collection={collection} team={team} onTeamChange={setTeam} onGoTeam={() => go('team')} onReset={() => setCollection({})} />}
        {tab === 'credits' && <Credits onClose={() => go('frei')} />}
        <footer className="disclaimer">
          Eigener Simulator · fiktive Bewertungen und Ziehchancen · keine Verbindung zu EA · <button type="button" onClick={() => go('credits')}>Bildnachweise</button>
        </footer>
      </main>

      <nav className="tabbar" aria-label="Hauptnavigation">
        <button type="button" className={tab === 'frei' ? 'active' : ''} aria-current={tab === 'frei' ? 'page' : undefined} onClick={() => go('frei')}><span>🎁</span>Packs</button>
        <button type="button" className={tab === 'duell' ? 'active' : ''} aria-current={tab === 'duell' ? 'page' : undefined} onClick={() => go('duell')}><span>⚔️</span>Duell</button>
        <button type="button" className={tab === 'team' ? 'active' : ''} aria-current={tab === 'team' ? 'page' : undefined} onClick={() => go('team')}><span>⚽</span>Mein Team</button>
        <button type="button" className={tab === 'sammlung' ? 'active' : ''} aria-current={tab === 'sammlung' ? 'page' : undefined} onClick={() => go('sammlung')}><span>🗂️</span>Sammlung</button>
      </nav>
    </div>
  );
}
