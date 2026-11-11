import type { ReactElement } from 'react';
import type { Motion } from '../game/motion';
import type { AnimationMode, Settings } from '../game/storage';
import { webglSupported } from '../walkout/support';
import { Modal } from './Modal';

interface Props {
  readonly settings: Settings;
  readonly motion: Motion;
  readonly onChange: (settings: Settings) => void;
  readonly onCredits: () => void;
  readonly onClose: () => void;
}

const MODES: readonly { readonly id: AnimationMode; readonly label: string }[] = [
  { id: 'auto', label: 'Automatisch' }, { id: 'voll', label: 'Voll' }, { id: 'reduziert', label: 'Reduziert' },
];

const explain = (mode: AnimationMode, motion: Motion): string => {
  if (mode === 'voll') return 'Voller Walkout mit Spielerfigur – auch wenn dein Gerät weniger Bewegung bevorzugt.';
  if (mode === 'reduziert') return 'Ruhige Enthüllung ohne Kamerafahrt und ohne Spielerfigur.';
  return motion === 'reduced'
    ? 'Dein Gerät bevorzugt weniger Bewegung, deshalb läuft gerade die ruhige Enthüllung. Wähle „Voll“ für den Walkout mit Spielerfigur.'
    : 'Folgt der Einstellung deines Geräts. Aktuell: voller Walkout.';
};

/** Wenige, klar benannte Einstellungen plus Info-Bereich mit Version. */
export const SettingsSheet = ({ settings, motion, onChange, onCredits, onClose }: Props): ReactElement => (
  <Modal title="Einstellungen" onClose={onClose}>
    <div className="set-row">
      <div>
        <div className="set-label">Ton</div>
        <div className="set-hint">Selbst erzeugte Töne, starten erst nach dem ersten Antippen.</div>
      </div>
      <button type="button" role="switch" aria-checked={!settings.muted} className={`switch${settings.muted ? '' : ' on'}`}
        onClick={() => onChange({ ...settings, muted: !settings.muted })}>
        {settings.muted ? 'Aus' : 'An'}
      </button>
    </div>

    <div className="set-block">
      <div className="set-label" id="set-anim">Animation</div>
      <div className="filters" role="radiogroup" aria-labelledby="set-anim">
        {MODES.map((m) => (
          <button key={m.id} type="button" role="radio" aria-checked={settings.animation === m.id}
            className={`btn btn-chip${settings.animation === m.id ? ' active' : ''}`} onClick={() => onChange({ ...settings, animation: m.id })}>
            {m.label}
          </button>
        ))}
      </div>
      <p className="set-hint">{explain(settings.animation, motion)}</p>
      {!webglSupported() && (
        <p className="modal-hint">Dieser Browser kann die 3D-Spielerfigur nicht darstellen. Es erscheint eine Ersatzenthüllung ohne Figur.</p>
      )}
    </div>

    <div className="set-block set-info">
      <div className="set-label">Info</div>
      <p className="set-hint">Version <strong className="build-id">{__BUILD_ID__}</strong> · gebaut am {__BUILD_DATE__}</p>
      <p className="set-hint">Eigener Simulator mit fiktiven Bewertungen, Sonderkarten und Ziehchancen. Die Spielerfiguren sind stilisierte Avatare. Keine Verbindung zu EA.</p>
      <button type="button" className="btn btn-ghost" onClick={onCredits}>Bildnachweise ansehen</button>
    </div>
  </Modal>
);
