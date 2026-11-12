import { useState, type ReactElement } from 'react';
import type { Player } from '../../data/players';
import type { PlayHubProps } from '../../football/contract';
import '../../football/football.css';
import { opponentName, pickOpponents, toTeam } from '../../football/lineup';
import { createLocalMatch, scorerLines, type LocalMatch } from '../../football/match';
import { roomCodeFromHash } from '../../football/net/protocol';
import { DEFAULT_DURATION, DURATIONS, type Difficulty, type MatchConfig, type TeamSpec } from '../../football/sim/index.ts';
import { MatchScreen } from './MatchScreen';
import { OnlineFlow } from './OnlineFlow';
import { ResultView } from './ResultView';
import { TeamSetup } from './TeamSetup';
import { useSquadChoice } from './useSquadChoice';

type Screen = 'menu' | 'setup' | 'match' | 'result' | 'online';

/** Ein laufendes oder beendetes Spiel gegen den Computer. */
interface Game {
  readonly serial: number;
  readonly driver: LocalMatch;
  readonly mine: TeamSpec;
  readonly theirs: TeamSpec;
}

const SECONDS_PER_MINUTE = 60;
const MAX_SEED = 2_147_483_647;
const EASY: Difficulty = 0;
const MEDIUM: Difficulty = 1;
const HARD: Difficulty = 2;
const DIFFICULTIES: readonly { readonly level: Difficulty; readonly label: string }[] = [
  { level: EASY, label: 'Leicht' },
  { level: MEDIUM, label: 'Mittel' },
  { level: HARD, label: 'Schwer' },
];

const randomSeed = (): number => Math.floor(Math.random() * MAX_SEED) + 1;

const buildConfig = (mine: TeamSpec, theirs: TeamSpec, difficulty: Difficulty, durationSec: number): MatchConfig => ({
  seed: randomSeed(),
  durationSec,
  teams: [{ ...mine, control: 'human', difficulty: MEDIUM }, { ...theirs, control: 'ai', difficulty }],
});

/** Bereich „Spielen“: Fußball gegen den Computer oder online gegen einen Freund. */
export const PlayHub = ({ squads, preselectSquadId, muted, onGoDraft, onGoTeam }: PlayHubProps): ReactElement => {
  const choice = useSquadChoice(squads, preselectSquadId);
  const [inviteCode] = useState(() => roomCodeFromHash(window.location.hash));
  const [screen, setScreen] = useState<Screen>(inviteCode ? 'online' : 'menu');
  const [difficulty, setDifficulty] = useState<Difficulty>(MEDIUM);
  const [duration, setDuration] = useState(DEFAULT_DURATION);
  const [game, setGame] = useState<Game | null>(null);

  const startGame = (mine: TeamSpec, theirs: TeamSpec): void => {
    const driver = createLocalMatch(buildConfig(mine, theirs, difficulty, duration), 0);
    setGame((previous) => ({ serial: (previous?.serial ?? 0) + 1, driver, mine, theirs }));
    setScreen('match');
  };

  const kickOff = (five: readonly Player[]): void => {
    const opponents = pickOpponents(five, difficulty, Math.random);
    startGame(toTeam(choice.squad.label, five), toTeam(opponentName(Math.random), opponents));
  };

  if (screen === 'online') {
    return (
      <OnlineFlow
        choice={choice}
        muted={muted}
        initialCode={inviteCode}
        onBack={() => setScreen('menu')}
        onGoDraft={onGoDraft}
        onGoTeam={onGoTeam}
      />
    );
  }

  if (screen === 'match' && game) {
    return (
      <MatchScreen
        key={game.serial}
        driver={game.driver}
        muted={muted}
        online={false}
        notice={null}
        statusLabel={null}
        onEnded={() => setScreen('result')}
        onQuit={() => setScreen('setup')}
      />
    );
  }

  if (screen === 'result' && game) {
    const teams: readonly [TeamSpec, TeamSpec] = [game.mine, game.theirs];
    return (
      <ResultView myTeam={0} names={[game.mine.name, game.theirs.name]} score={game.driver.score()} scorers={scorerLines(game.driver.goals(), teams)}>
        <button type="button" className="btn btn-primary btn-big" onClick={() => startGame(game.mine, game.theirs)}>Nochmal spielen</button>
        <button type="button" className="btn btn-secondary btn-big" onClick={() => setScreen('setup')}>Anderes Team</button>
        <button type="button" className="btn btn-ghost" onClick={() => setScreen('menu')}>Zum Spielmenü</button>
      </ResultView>
    );
  }

  if (screen === 'setup') {
    const { five } = choice;
    return (
      <div className="mode">
        <h2 className="fb-title">Gegen den Computer</h2>
        <TeamSetup
          squads={choice.squads}
          squadId={choice.squad.id}
          selection={choice.selection}
          onSquad={choice.setSquadId}
          onSelection={choice.setSelection}
          onGoDraft={onGoDraft}
          onGoTeam={onGoTeam}
        />
        <section className="fb-panel" aria-label="Spieleinstellungen">
          <h3 className="fb-panel-title">3. Spiel</h3>
          <div className="fb-row" role="group" aria-label="Schwierigkeit">
            <span className="fb-sub">Gegner</span>
            {DIFFICULTIES.map(({ level, label }) => (
              <button key={level} type="button" className={`btn btn-chip${difficulty === level ? ' active' : ''}`} aria-pressed={difficulty === level} onClick={() => setDifficulty(level)}>{label}</button>
            ))}
          </div>
          <div className="fb-row" role="group" aria-label="Spielzeit">
            <span className="fb-sub">Spielzeit</span>
            {DURATIONS.map((seconds) => (
              <button key={seconds} type="button" className={`btn btn-chip${duration === seconds ? ' active' : ''}`} aria-pressed={duration === seconds} onClick={() => setDuration(seconds)}>{seconds / SECONDS_PER_MINUTE} Min</button>
            ))}
          </div>
          <p className="fb-sub">Der Computer bekommt eine zufällige Fünf, die zu deiner Stärke passt.</p>
        </section>
        <div className="fb-actions fb-sticky">
          {!five && <p className="fb-hint">Wähle erst einen Torwart und vier Feldspieler.</p>}
          <button type="button" className="btn btn-primary btn-big" disabled={!five} onClick={() => { if (five) kickOff(five); }}>Anpfiff</button>
          <button type="button" className="btn btn-ghost" onClick={() => setScreen('menu')}>Zurück</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mode">
      <h2 className="fb-title">Spielen</h2>
      <p className="fb-sub">Fünf gegen fünf mit deinen Karten – du steuerst immer den markierten Spieler.</p>
      <div className="fb-modes">
        <button type="button" className="fb-mode fb-mode-ai" onClick={() => setScreen('setup')}>
          <span className="fb-mode-icon" aria-hidden="true">🤖</span>
          <span className="fb-mode-name">Gegen den Computer</span>
          <span className="fb-mode-sub">Sofort spielen – Leicht, Mittel oder Schwer</span>
        </button>
        <button type="button" className="fb-mode fb-mode-online" onClick={() => setScreen('online')}>
          <span className="fb-mode-icon" aria-hidden="true">🌐</span>
          <span className="fb-mode-name">Online gegen einen Freund</span>
          <span className="fb-mode-sub">Privater Raum mit Code für zwei Geräte</span>
        </button>
      </div>
      <section className="fb-panel" aria-label="Steuerung">
        <h3 className="fb-panel-title">Steuerung</h3>
        <p className="fb-sub"><b>Handy:</b> links laufen (Daumen aufsetzen und ziehen), rechts „Pass“, „Schuss“ und „Wechsel / Ball holen“. Im Querformat siehst du am meisten.</p>
        <p className="fb-sub"><b>Tastatur:</b> WASD oder Pfeiltasten laufen · J oder Leertaste Pass · K Schuss · L Wechsel / Ball holen · P oder Esc Pause.</p>
      </section>
    </div>
  );
};
