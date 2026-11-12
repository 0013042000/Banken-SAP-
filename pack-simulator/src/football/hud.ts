/** Anzeige über dem Spielfeld: Spielstand, Uhr, Einblendungen, Beschriftung der dritten Taste. */
import { formatClock, type MatchMeta } from './match.ts';
import {
  isNearestToBall, NONE, Phase, slotOf, teamOf,
  type Frame, type RestartKind, type SimEvent, type TeamId,
} from './sim/index.ts';

export type BallSide = 'mine' | 'theirs' | 'loose';

export interface Hud {
  readonly mine: number;
  readonly theirs: number;
  readonly clock: string;
  /** Große Einblendung (Countdown, „TOR!“, „Ecke“ …) oder null. */
  readonly banner: string | null;
  readonly detail: string | null;
  readonly swapLabel: string;
  /** Wer gerade den Ball hat (für Gestaltung und Tests). */
  readonly ball: BallSide;
  readonly phase: Phase;
  readonly ended: boolean;
}

interface BannerInput {
  readonly frame: Frame;
  readonly meta: MatchMeta;
  readonly goalText: string | null;
}

interface Banner {
  readonly banner: string | null;
  readonly detail: string | null;
}

export const SWAP_LABEL = 'Wechsel';
export const FETCH_LABEL = 'Ball holen';

const RESTART_LABEL: Readonly<Record<RestartKind, string>> = Object.freeze({
  kickoff: 'Anstoß', kickin: 'Einkick', corner: 'Ecke', goalkick: 'Abstoß',
});

const NO_BANNER: Banner = Object.freeze({ banner: null, detail: null });

const restartTeam = ({ frame, meta }: BannerInput): string => meta.teams[frame.restart.team].name;

const BANNERS: Readonly<Record<Phase, (input: BannerInput) => Banner>> = {
  kickoff: (input) => ({ banner: String(Math.max(1, Math.ceil(input.frame.phaseTime))), detail: `Anstoß: ${restartTeam(input)}` }),
  restart: (input) => ({ banner: RESTART_LABEL[input.frame.restart.kind], detail: restartTeam(input) }),
  goal: (input) => ({ banner: 'TOR!', detail: input.goalText }),
  play: () => NO_BANNER,
  ended: () => ({ banner: 'Abpfiff!', detail: null }),
};

const otherSide = (team: TeamId): TeamId => (team ? 0 : 1);

/** Text zur Tor-Einblendung, z. B. „Musiala“ oder „Rüdiger (Eigentor)“. */
export const goalText = (event: Extract<SimEvent, { type: 'goal' }>, meta: MatchMeta): string => {
  const name = meta.teams[teamOf(event.player)].players[slotOf(event.player)]?.name ?? '';
  return event.own ? `${name} (Eigentor)` : name;
};

/** Die dritte Taste holt den ballnächsten Spieler – oder schickt ihn, wenn er schon aktiv ist, auf den Ball. */
const swapLabel = (frame: Frame, myTeam: TeamId): string => {
  const { owner } = frame.ball;
  if (owner !== NONE && teamOf(owner) === myTeam) return SWAP_LABEL;
  const positions = frame.players.map((p) => p.pos);
  return isNearestToBall(positions, myTeam, frame.ball.pos, frame.controlled[myTeam]) ? FETCH_LABEL : SWAP_LABEL;
};

const ballSide = (frame: Frame, myTeam: TeamId): BallSide => {
  const { owner } = frame.ball;
  if (owner === NONE) return 'loose';
  return teamOf(owner) === myTeam ? 'mine' : 'theirs';
};

export const hudOf = (frame: Frame, meta: MatchMeta, lastGoal: string | null): Hud => ({
  mine: frame.score[meta.myTeam],
  theirs: frame.score[otherSide(meta.myTeam)],
  clock: formatClock(frame.timeLeft),
  ...BANNERS[frame.phase]({ frame, meta, goalText: lastGoal }),
  swapLabel: swapLabel(frame, meta.myTeam),
  ball: ballSide(frame, meta.myTeam),
  phase: frame.phase,
  ended: frame.phase === Phase.Ended,
});

export const sameHud = (a: Hud, b: Hud): boolean =>
  a.mine === b.mine && a.theirs === b.theirs && a.clock === b.clock && a.banner === b.banner
  && a.detail === b.detail && a.swapLabel === b.swapLabel && a.ball === b.ball && a.phase === b.phase && a.ended === b.ended;
