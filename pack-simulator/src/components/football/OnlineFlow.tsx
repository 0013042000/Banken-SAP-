import { useEffect, useState, useSyncExternalStore, type ReactElement } from 'react';
import { toTeam } from '../../football/lineup';
import { scorerLines } from '../../football/match';
import { ConnStatus, createRoomClient, type RoomClient, type StartInfo } from '../../football/net/client';
import { createOnlineMatch, type OnlineMatch } from '../../football/net/onlineMatch';
import {
  CODE_LENGTH, EndReason, ERROR_TEXT, hashForRoom, normalizeCode, roomCodeFromHash, RoomStatus, type RoomView, type SeatView,
} from '../../football/net/protocol';
import { gameServerUrl } from '../../football/net/serverUrl';
import { DURATIONS, type TeamId } from '../../football/sim/index.ts';
import { MatchScreen } from './MatchScreen';
import { ResultView } from './ResultView';
import { TeamSetup } from './TeamSetup';
import type { SquadChoice } from './useSquadChoice';

interface Props {
  readonly choice: SquadChoice;
  readonly muted: boolean;
  /** Raumcode aus einem Einladungslink oder null. */
  readonly initialCode: string | null;
  readonly onBack: () => void;
  readonly onGoDraft: () => void;
  readonly onGoTeam: () => void;
}

interface RoomProps extends Props {
  readonly client: RoomClient;
}

type CopyState = 'idle' | 'copied' | 'failed';

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
const UNAVAILABLE_TEXT = 'Online-Spiel ist auf dieser Seite noch nicht verfügbar – es braucht einen eigenen Spielserver.';
const LOST_TEXT = 'Die Verbindung zum Spiel ist abgerissen und konnte nicht wiederhergestellt werden.';
const RECONNECTING_TEXT = 'Verbindung wird wiederhergestellt …';

const CONN_LABEL: Readonly<Record<ConnStatus, string>> = Object.freeze({
  idle: 'Nicht verbunden',
  connecting: 'Verbinde …',
  connected: 'Verbunden',
  reconnecting: RECONNECTING_TEXT,
  unavailable: 'Nicht verfügbar',
  lost: 'Getrennt',
});

const COPY_TEXT: Readonly<Record<CopyState, string>> = Object.freeze({
  idle: 'Link kopieren',
  copied: 'Kopiert ✓',
  failed: 'Bitte Link von Hand markieren',
});

const inviteLink = (code: string): string =>
  `${window.location.origin}${window.location.pathname}${window.location.search}${hashForRoom(code)}`;

const setHash = (code: string | null): void => {
  const target = code ? hashForRoom(code) : `${window.location.pathname}${window.location.search}`;
  const isRoomHash = roomCodeFromHash(window.location.hash) !== null;
  if (code || isRoomHash) window.history.replaceState(null, '', target);
};

const ConnBadge = ({ status }: { readonly status: ConnStatus }): ReactElement => (
  <span className={`fb-badge fb-badge-${status}`} role="status" data-testid="fb-conn">● {CONN_LABEL[status]}</span>
);

const seatStatus = (seat: SeatView): string => {
  if (!seat.connected) return 'Verbindung unterbrochen';
  if (seat.ready) return 'Bereit ✓';
  return seat.hasTeam ? 'Aufstellung gewählt' : 'Wählt noch die Aufstellung';
};

interface MatchViewProps {
  readonly client: RoomClient;
  readonly start: StartInfo;
  readonly seat: TeamId;
  readonly room: RoomView;
  readonly status: ConnStatus;
  readonly muted: boolean;
}

const pauseNotice = (room: RoomView, seat: TeamId, status: ConnStatus): string | null => {
  if (status === ConnStatus.Reconnecting) return RECONNECTING_TEXT;
  if (!room.pause) return null;
  if (room.pause.seat === seat) return RECONNECTING_TEXT;
  const seconds = Math.ceil(room.pause.msLeft / MS_PER_SECOND);
  return `Dein Gegner hat die Verbindung verloren. Das Spiel ist kurz angehalten – wir warten bis zu ${seconds} Sekunden.`;
};

const OnlineMatchView = ({ client, start, seat, room, status, muted }: MatchViewProps): ReactElement => {
  // Das Erzeugen hat keine Nebenwirkung; erst `attach` meldet den Treiber beim Client an.
  const [driver] = useState<OnlineMatch>(() => createOnlineMatch(client, start, seat));
  useEffect(() => {
    driver.attach();
    return (): void => driver.dispose();
  }, [driver]);

  return (
    <MatchScreen
      driver={driver}
      muted={muted}
      online
      notice={pauseNotice(room, seat, status)}
      statusLabel={status === ConnStatus.Connected ? '● Online' : '● …'}
      onEnded={() => undefined}
      onQuit={client.leave}
    />
  );
};

const OnlineRoom = ({ client, choice, muted, initialCode, onBack, onGoDraft, onGoTeam }: RoomProps): ReactElement => {
  const { status, room, seat, start, error } = useSyncExternalStore(client.subscribe, client.getState);
  const [codeInput, setCodeInput] = useState(initialCode ?? '');
  const [copy, setCopy] = useState<CopyState>('idle');
  const roomCode = room?.code ?? null;

  useEffect(() => {
    setHash(roomCode);
    return (): void => setHash(null);
  }, [roomCode]);

  const leave = (): void => {
    client.leave();
    setCopy('idle');
  };
  const exit = (): void => {
    client.leave();
    onBack();
  };

  if (status === ConnStatus.Unavailable || status === ConnStatus.Lost) {
    const lostText = error ? ERROR_TEXT[error] : LOST_TEXT;
    return (
      <div className="mode">
        <h2 className="fb-title">Online gegen einen Freund</h2>
        <p className="fb-alert" role="alert" data-testid="fb-online-problem">{status === ConnStatus.Unavailable ? UNAVAILABLE_TEXT : lostText}</p>
        {status === ConnStatus.Unavailable && (
          <p className="fb-sub">Gegen den Computer kannst du jederzeit spielen. Für das Spiel zu zweit muss ein eigener Spielserver laufen.</p>
        )}
        <div className="fb-actions">
          <button type="button" className="btn btn-primary btn-big" onClick={leave}>Erneut versuchen</button>
          <button type="button" className="btn btn-ghost" onClick={exit}>Zurück</button>
        </div>
      </div>
    );
  }

  if (!room || seat === null) {
    const code = normalizeCode(codeInput);
    const busy = status === ConnStatus.Connecting;
    return (
      <div className="mode">
        <h2 className="fb-title">Online gegen einen Freund</h2>
        <p className="fb-sub">Erstelle einen privaten Raum und teile den Code – oder tritt mit einem Code bei. Ohne Anmeldung, nur für zwei Geräte.</p>
        {busy && <p className="fb-sub" role="status">Verbinde mit dem Spielserver …</p>}
        {error && <p className="fb-alert" role="alert" data-testid="fb-online-error">{ERROR_TEXT[error]}</p>}
        <button type="button" className="btn btn-primary btn-big" disabled={busy} onClick={client.create}>Raum erstellen</button>
        <div className="fb-join">
          <label className="fb-join-label" htmlFor="fb-code">Raumcode</label>
          <input
            id="fb-code"
            className="fb-code-input"
            value={codeInput}
            maxLength={CODE_LENGTH}
            autoCapitalize="characters"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="z. B. K7MQ"
            onChange={(event) => setCodeInput(event.target.value.toUpperCase())}
          />
          <button type="button" className="btn btn-secondary" disabled={busy || !code} onClick={() => { if (code) client.join(code); }}>Beitreten</button>
        </div>
        <button type="button" className="btn btn-ghost" onClick={exit}>Zurück</button>
      </div>
    );
  }

  const inMatch = room.status === RoomStatus.Playing || room.status === RoomStatus.Paused;
  if (inMatch && start) {
    return <OnlineMatchView key={start.serial} client={client} start={start} seat={seat} room={room} status={status} muted={muted} />;
  }

  const otherSeat: TeamId = seat ? 0 : 1;
  const me = room.seats[seat];
  const opponent = room.seats[otherSeat];

  if (room.status === RoomStatus.Ended && room.result && start) {
    const { result } = room;
    const abandoned = result.reason === EndReason.Abandoned;
    const canRematch = !abandoned && opponent !== null;
    return (
      <ResultView
        myTeam={seat}
        names={[start.teams[0].name, start.teams[1].name]}
        score={result.score}
        scorers={scorerLines(result.goals, start.teams)}
        note={abandoned ? 'Dein Gegner hat das Spiel verlassen – es wurde beim aktuellen Stand beendet.' : null}
      >
        <ConnBadge status={status} />
        {!abandoned && !opponent && <p className="fb-hint" role="status">Dein Gegner hat den Raum verlassen.</p>}
        {canRematch && opponent.rematch && !me?.rematch && <p className="fb-hint" role="status">Dein Gegner möchte eine Revanche!</p>}
        {canRematch && me?.rematch && <p className="fb-sub" role="status">Warte auf die Zustimmung deines Gegners …</p>}
        {canRematch && (
          <button type="button" className="btn btn-primary btn-big" onClick={() => client.send({ t: 'rematch', want: !me?.rematch })}>
            {me?.rematch ? 'Revanche zurückziehen' : 'Revanche'}
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={leave}>Raum verlassen</button>
      </ResultView>
    );
  }

  const iAmReady = me?.ready === true;
  const unready = (): void => {
    if (iAmReady) client.send({ t: 'ready', ready: false });
  };
  const toggleReady = (): void => {
    if (iAmReady || !choice.five) return unready();
    client.send({ t: 'team', team: toTeam(choice.squad.label, choice.five) });
    return client.send({ t: 'ready', ready: true });
  };
  const copyLink = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(inviteLink(room.code));
      setCopy('copied');
    } catch {
      // Zwischenablage gesperrt (z. B. in eingebetteten Seiten): Der Link steht sichtbar daneben und lässt sich markieren.
      setCopy('failed');
    }
  };

  return (
    <div className="mode">
      <h2 className="fb-title">Privater Raum</h2>
      <ConnBadge status={status} />
      <section className="fb-panel fb-room" aria-label="Einladung">
        <p className="fb-sub">Raumcode</p>
        <p className="fb-code" data-testid="fb-room-code">{room.code}</p>
        <input className="fb-link" readOnly value={inviteLink(room.code)} aria-label="Einladungslink" onFocus={(event) => event.target.select()} />
        <button type="button" className="btn btn-chip" onClick={() => { void copyLink(); }}>{COPY_TEXT[copy]}</button>
      </section>

      <section className="fb-panel" aria-label="Spieler im Raum">
        <ul className="fb-seats">
          <li className="fb-seat fb-team-mine"><b>Du</b><span>{me?.name ?? 'Noch ohne Aufstellung'}</span><em>{me ? seatStatus(me) : ''}</em></li>
          <li className="fb-seat fb-team-theirs" data-testid="fb-opponent">
            <b>Gegner</b>
            <span>{opponent ? opponent.name ?? 'Im Raum' : 'Noch niemand da'}</span>
            <em>{opponent ? seatStatus(opponent) : 'Teile den Code oder den Link.'}</em>
          </li>
        </ul>
        <div className="fb-row">
          <span className="fb-sub">Spielzeit</span>
          {DURATIONS.map((seconds) => (
            <button
              key={seconds}
              type="button"
              className={`btn btn-chip${room.duration === seconds ? ' active' : ''}`}
              disabled={seat !== 0}
              aria-pressed={room.duration === seconds}
              onClick={() => client.send({ t: 'duration', seconds })}
            >
              {seconds / SECONDS_PER_MINUTE} Min
            </button>
          ))}
        </div>
        {seat !== 0 && <p className="fb-sub">Die Spielzeit legt fest, wer den Raum erstellt hat.</p>}
      </section>

      <TeamSetup
        squads={choice.squads}
        squadId={choice.squad.id}
        selection={choice.selection}
        onSquad={(id) => { unready(); choice.setSquadId(id); }}
        onSelection={(selection) => { unready(); choice.setSelection(selection); }}
        onGoDraft={onGoDraft}
        onGoTeam={onGoTeam}
      />

      {error && <p className="fb-alert" role="alert">{ERROR_TEXT[error]}</p>}
      <div className="fb-actions fb-sticky">
        {iAmReady && <p className="fb-sub" role="status">{opponent ? 'Warte auf deinen Gegner …' : 'Warte auf einen Mitspieler …'}</p>}
        {!choice.five && <p className="fb-hint">Wähle erst einen Torwart und vier Feldspieler.</p>}
        <button type="button" className={`btn btn-big ${iAmReady ? 'btn-secondary' : 'btn-primary'}`} disabled={!choice.five && !iAmReady} onClick={toggleReady} data-testid="fb-ready">
          {iAmReady ? 'Doch nicht bereit' : 'Bereit'}
        </button>
        <button type="button" className="btn btn-ghost" onClick={leave}>Raum verlassen</button>
      </div>
    </div>
  );
};

/** Online-Spiel zu zweit: Raum erstellen oder beitreten, Aufstellung, Spiel, Endstand, Revanche. */
export const OnlineFlow = (props: Props): ReactElement => {
  // Das Erzeugen öffnet noch keine Verbindung; erst „Raum erstellen“ bzw. „Beitreten“ verbindet.
  const [client] = useState<RoomClient>(() => createRoomClient(gameServerUrl()));
  useEffect(() => (): void => client.dispose(), [client]);
  return <OnlineRoom {...props} client={client} />;
};
