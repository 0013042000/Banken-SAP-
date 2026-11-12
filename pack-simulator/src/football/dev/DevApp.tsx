import { useState, type ReactElement } from 'react';
import { PlayHub } from '../../components/football/PlayHub';
import { PLAYERS, type Player } from '../../data/players';
import '../../index.css';
import type { SquadOption } from '../contract';

const TEAM_SIZE_FULL = 11;
const DRAFT_START = 30;
const DRAFT_SIZE = 23;
const SMALL_SQUAD = 3;

const byPosition = (wanted: boolean) => (player: Player): boolean => (player.pos === 'TW') === wanted;
const rating = (players: readonly Player[]): number =>
  Math.round(players.reduce((sum, p) => sum + p.ovr, 0) / Math.max(1, players.length));

const semonPlayers = [...PLAYERS.filter(byPosition(true)).slice(0, 1), ...PLAYERS.filter(byPosition(false)).slice(0, TEAM_SIZE_FULL - 1)];
const draftPlayers = PLAYERS.slice(DRAFT_START, DRAFT_START + DRAFT_SIZE);
const noKeeperPlayers = PLAYERS.filter(byPosition(false)).slice(DRAFT_START, DRAFT_START + TEAM_SIZE_FULL);

const DEMO_SQUADS: readonly SquadOption[] = [
  { id: 'team:semon', label: 'Semons Team', owner: 'semon', kind: 'team', rating: rating(semonPlayers), players: semonPlayers },
  { id: 'draft:demo', label: 'Legenden-Draft · 4-3-3', owner: 'ariel', kind: 'draft', rating: rating(draftPlayers), players: draftPlayers },
  { id: 'draft:ohne-tw', label: 'Draft ohne Torwart', owner: 'ariel', kind: 'draft', rating: rating(noKeeperPlayers), players: noKeeperPlayers },
  { id: 'team:ariel', label: 'Ariels Team', owner: 'ariel', kind: 'team', rating: null, players: PLAYERS.slice(0, SMALL_SQUAD) },
];

const params = new URLSearchParams(window.location.search);
const squads = params.get('squads') === 'none' ? [] : DEMO_SQUADS;

/** Rahmen wie in der echten App (Kopfzeile, Inhalt, Tableiste), darin nur der Fußballmodus. */
export const DevApp = (): ReactElement => {
  const [muted, setMuted] = useState(params.get('muted') === '1');
  const [note, setNote] = useState('');
  return (
    <div className="app">
      <header className="topbar">
        <div className="brand"><span className="brand-ball">⚽</span><span className="brand-text"><b>Ariel's</b> Epic Packs</span></div>
        <div className="toggles">
          <button type="button" className="toggle icon" onClick={() => setMuted((m) => !m)} aria-label={muted ? 'Ton an' : 'Ton aus'}>{muted ? '🔇' : '🔊'}</button>
        </div>
      </header>
      <main className="content">
        {note && <p className="team-notice" role="status" data-testid="dev-note">{note}</p>}
        <PlayHub
          squads={squads}
          preselectSquadId={params.get('preselect')}
          muted={muted}
          onGoDraft={() => setNote('Navigation: Zum Draft')}
          onGoTeam={() => setNote('Navigation: Zu Mein Team')}
        />
      </main>
      <nav className="tabbar" aria-label="Hauptnavigation">
        <button type="button"><span>🎁</span>Packs</button>
        <button type="button" className="active"><span>🎮</span>Spielen</button>
        <button type="button"><span>⚽</span>Mein Team</button>
      </nav>
    </div>
  );
};
