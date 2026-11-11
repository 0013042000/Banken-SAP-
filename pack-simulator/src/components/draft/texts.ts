import type { Player } from '../../data/players';
import { MAX_FINISHED_PER_PROFILE, PROFILE_LABEL, SQUAD_SIZE, VARIANTS } from '../../game/draft/config';
import { draftedCount, type SlotInfo, type Squad } from '../../game/draft/engine';
import { sfx } from '../../game/sound';
import type { FormationId } from '../../game/team';

/** Abmessungen eines Elements auf dem Bildschirm – Startpunkt für den Kartenflug. */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** Eine gewählte Karte fliegt von ihrem Ort auf den Mannschaftsplatz. */
export interface Flight {
  readonly player: Player;
  readonly from: Box;
  /** Schlüssel des Zielplatzes (siehe slotKey). */
  readonly target: string;
}

export const SOUND_CUES = ['tap', 'open', 'pick', 'done'] as const;
export type SoundCue = (typeof SOUND_CUES)[number];

export const FORMATION_HINT: Readonly<Record<FormationId, string>> = Object.freeze({
  '4-3-3': 'Drei im Sturm, drei im Zentrum',
  '4-4-2': 'Klassisch mit zwei Spitzen',
  '4-2-3-1': 'Zwei Absicherer, ein Spielmacher',
  '3-5-2': 'Dreierkette, volles Mittelfeld',
  '4-1-2-1-2': 'Raute mit zwei Spitzen',
});

const CUES: Readonly<Record<SoundCue, (ovr: number) => void>> = {
  tap: () => sfx.tap(),
  open: () => sfx.flip(),
  pick: (ovr) => sfx.reveal(ovr),
  done: () => sfx.win(),
};

/** Kurzer Ton – nur wenn der Ton eingeschaltet ist; ein Fehler der Tonausgabe hält nie den Ablauf auf. */
export const playCue = (muted: boolean, cue: SoundCue, ovr: number = 0): void => {
  if (muted) return;
  try { CUES[cue](ovr); } catch { /* Ton ist nur Beiwerk */ }
};

export const boxOf = (el: Element | null | undefined): Box | null => {
  if (!el) return null;
  const { left, top, width, height } = el.getBoundingClientRect();
  return { left, top, width, height };
};

export const progressText = (squad: Squad): string => `${draftedCount(squad)}/${SQUAD_SIZE}`;
export const squadTitle = (squad: Squad): string => `${VARIANTS[squad.variant].label} · ${squad.formation}`;
export const dateText = (time: number): string => (time ? new Date(time).toLocaleDateString('de-DE') : '');

/** Steht der Kandidat hier auf seiner eigenen Kartenposition oder auf einer verwandten? */
export const fitNote = (info: SlotInfo | undefined, p: Player): string => {
  if (info?.ref.group !== 'start') return info ? `passt: ${info.short}` : '';
  return info.positions[0] === p.pos ? 'Stammposition' : 'verwandte Position';
};

export const limitText = (profile: Squad['profile']): string =>
  `${PROFILE_LABEL[profile]} hat schon ${MAX_FINISHED_PER_PROFILE} von ${MAX_FINISHED_PER_PROFILE} fertigen Drafts gespeichert. Lösche unter „Meine Drafts“ einen alten Draft – es wird nichts von allein gelöscht.`;
