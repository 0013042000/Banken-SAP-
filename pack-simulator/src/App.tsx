import { useEffect, useMemo, useState, useSyncExternalStore, type ReactElement } from 'react';
import type { Player } from './data/players';
import type { SquadOption } from './football/contract';
import { useMotion } from './game/motion';
import {
  getStorageOk, loadCollection, loadSettings, loadTeamRaw, loadTeamsRaw, saveCollection, saveSettings, saveTeams, subscribeStorageStatus,
  type Collection as Coll, type Settings,
} from './game/storage';
import { setMuted, sfx, unlockAudio } from './game/sound';
import {
  lineupPlayers, OWNER_LABEL, ownersOf, pruneBook, sanitizeTeamBook, teamOf, teamRating, withTeam, type Team, type TeamBook, type TeamOwner,
} from './game/team';
import { listDraftSquads } from './game/draft/store';
import { Collection } from './components/Collection';
import { DraftHub } from './components/draft/DraftHub';
import { PlayHub } from './components/football/PlayHub';
import { Credits } from './components/Credits';
import { PacksHub, type PacksView } from './components/PacksHub';
import { SettingsSheet } from './components/SettingsSheet';
import { TeamView } from './components/TeamView';

type Tab = 'packs' | 'sammlung' | 'team' | 'draft' | 'spielen' | 'credits';

const TABS: readonly { readonly id: Exclude<Tab, 'credits'>; readonly icon: string; readonly label: string }[] = [
  { id: 'packs', icon: '🎁', label: 'Packs' },
  { id: 'sammlung', icon: '🗂️', label: 'Sammlung' },
  { id: 'team', icon: '📋', label: 'Mein Team' },
  { id: 'draft', icon: '🃏', label: 'Draft' },
  { id: 'spielen', icon: '⚽', label: 'Spielen' },
];

const ownedSet = (c: Coll): Set<string> => new Set(Object.keys(c).filter((id) => (c[id] ?? 0) > 0));

export default function App(): ReactElement {
  const [tab, setTab] = useState<Tab>('packs');
  const [packsView, setPacksView] = useState<PacksView>('frei');
  const [collection, setCollection] = useState<Coll>(() => loadCollection());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [rawBook, setBook] = useState<TeamBook>(() => sanitizeTeamBook(loadTeamsRaw(), loadTeamRaw(), ownedSet(loadCollection())));
  const [showSettings, setShowSettings] = useState(false);
  /** Fertige Drafts als Kader; wird neu gelesen, sobald der Draft-Bereich eine Änderung meldet. */
  const [draftSquads, setDraftSquads] = useState<SquadOption[]>(() => listDraftSquads());
  const [preselectSquad, setPreselectSquad] = useState<string | null>(null);
  const storageOk = useSyncExternalStore(subscribeStorageStatus, getStorageOk);

  const motion = useMotion(settings.animation);
  const owned = useMemo(() => ownedSet(collection), [collection]);
  // Nur besessene Spieler dürfen aufgestellt sein; das gültige Team-Buch wird beim Rendern abgeleitet.
  const book = useMemo(() => pruneBook(rawBook, owned), [rawBook, owned]);
  const owner = book.active;
  const team = teamOf(book, owner);
  const setTeam = (next: Team): void => setBook((b) => withTeam(b, b.active, next));
  const setOwner = (next: TeamOwner): void => setBook((b) => ({ ...b, active: next }));

  useEffect(() => { saveCollection(collection); }, [collection]);
  useEffect(() => { saveSettings(settings); setMuted(settings.muted); }, [settings]);
  useEffect(() => { saveTeams(book); }, [book]);
  // Ruhige Darstellung als Klasse am Wurzelelement, damit auch reine CSS-Animationen folgen.
  useEffect(() => { document.documentElement.classList.toggle('motion-reduced', motion === 'reduced'); }, [motion]);

  /** Aufgestellte Mannschaften als Kader für den Fußballmodus. */
  const teamSquads = useMemo<SquadOption[]>(() => ownersOf(book)
    .map((o) => { const t = teamOf(book, o); return { id: `team:${o}`, label: t.name, owner: o, kind: 'team' as const, rating: teamRating(t).rating, players: lineupPlayers(t) }; })
    .filter((s) => s.players.length > 0), [book]);
  const squads = useMemo(() => [...teamSquads, ...draftSquads], [teamSquads, draftSquads]);

  const collect = (cards: readonly Player[]): void => {
    setCollection((c) => { const n = { ...c }; for (const p of cards) n[p.id] = (n[p.id] ?? 0) + 1; return n; });
  };

  const go = (t: Tab): void => { unlockAudio(); sfx.tap(); setTab(t); };

  return (
    <div className="app" onPointerDown={unlockAudio}>
      <header className="topbar">
        <div className="brand"><span className="brand-ball">⚽</span><span className="brand-text"><b>Ariel's</b> Epic Packs</span></div>
        <div className="toggles">
          <button type="button" className="toggle icon" onClick={() => setSettings((s) => ({ ...s, muted: !s.muted }))} aria-label={settings.muted ? 'Ton einschalten' : 'Ton ausschalten'}>
            {settings.muted ? '🔇' : '🔊'}
          </button>
          <button type="button" className="toggle icon" onClick={() => { sfx.tap(); setShowSettings(true); }} aria-label="Einstellungen">⚙️</button>
        </div>
      </header>

      <main className="content">
        {!storageOk && (
          <p className="storage-warning" role="status">Speichern ist in diesem Browser gerade nicht möglich. Du kannst weiterspielen, aber Änderungen bleiben nach dem Schließen eventuell nicht erhalten.</p>
        )}
        {tab === 'packs' && (
          <PacksHub view={packsView} onView={setPacksView} dreamLuck={settings.dreamLuck} onDreamLuck={(on) => setSettings((s) => ({ ...s, dreamLuck: on }))}
            motion={motion} onCollect={collect} onTeam={() => go('team')} />
        )}
        {tab === 'sammlung' && (
          <Collection collection={collection} team={team} teamLabel={OWNER_LABEL[owner]} onTeamChange={setTeam} onGoTeam={() => go('team')} onReset={() => setCollection({})} />
        )}
        {tab === 'team' && (
          <TeamView team={team} owner={owner} owners={ownersOf(book)} onOwner={setOwner} collection={collection} onChange={setTeam} onGoPacks={() => go('packs')} />
        )}
        {tab === 'draft' && (
          <DraftHub reducedMotion={motion === 'reduced'} muted={settings.muted} onChanged={() => setDraftSquads(listDraftSquads())}
            onPlaySquad={(id) => { setPreselectSquad(id); go('spielen'); }} />
        )}
        {tab === 'spielen' && (
          <PlayHub squads={squads} preselectSquadId={preselectSquad} muted={settings.muted} onGoDraft={() => go('draft')} onGoTeam={() => go('team')} />
        )}
        {tab === 'credits' && <Credits onClose={() => go('packs')} />}
        <footer className="disclaimer">
          Eigener Simulator · fiktive Bewertungen und Ziehchancen · keine Verbindung zu EA · Version {__BUILD_ID__}
        </footer>
      </main>

      <nav className="tabbar" aria-label="Hauptnavigation">
        {TABS.map((t) => (
          <button key={t.id} type="button" className={tab === t.id ? 'active' : ''} aria-current={tab === t.id ? 'page' : undefined} onClick={() => go(t.id)}>
            <span>{t.icon}</span>{t.label}
          </button>
        ))}
      </nav>

      {showSettings && (
        <SettingsSheet settings={settings} motion={motion} onChange={setSettings} onClose={() => setShowSettings(false)}
          onCredits={() => { setShowSettings(false); go('credits'); }} />
      )}
    </div>
  );
}
