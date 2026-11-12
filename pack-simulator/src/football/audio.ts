/**
 * Kurze, selbst erzeugte Spieltöne über WebAudio. Der Ton wird erst nach einer Nutzerinteraktion
 * aktiviert; fehlendes oder blockiertes Audio darf das Spiel nie aufhalten.
 */
import type { SimEvent } from './sim/index.ts';

export interface MatchAudio {
  /** In einem Klick-/Tastenhandler aufrufen, damit der Browser Ton erlaubt. */
  readonly unlock: () => void;
  readonly setMuted: (muted: boolean) => void;
  readonly play: (event: SimEvent) => void;
  readonly dispose: () => void;
}

interface Tone {
  readonly freq: number;
  readonly duration: number;
  readonly type: OscillatorType;
  readonly gain: number;
  readonly delay: number;
}

const SILENT = 0.0001;
const ATTACK = 0.01;
const TAIL = 0.05;
const WHISTLE_FREQ = 2350;
const WHISTLE_WOBBLE = 2500;
const WHISTLE_LONG = 0.42;
const WHISTLE_SHORT = 0.16;
const WHISTLE_GAIN = 0.07;
const WHISTLE_GAP = 0.24;
const WHISTLE_END_AT = 0.48;
const KICK_FREQ = 150;
const KICK_DURATION = 0.11;
const KICK_GAIN = 0.2;
const PASS_FREQ = 210;
const PASS_DURATION = 0.07;
const PASS_GAIN = 0.11;
const THUD_FREQ = 95;
const THUD_DURATION = 0.14;
const THUD_GAIN = 0.16;
const POST_FREQ = 880;
const POST_DURATION = 0.2;
const POST_GAIN = 0.1;
const NOTE_C5 = 523;
const NOTE_E5 = 659;
const NOTE_G5 = 784;
const NOTE_C6 = 1047;
const FANFARE: readonly number[] = [NOTE_C5, NOTE_E5, NOTE_G5, NOTE_C6];
const FANFARE_STEP = 0.11;
const FANFARE_DURATION = 0.32;
const FANFARE_GAIN = 0.12;
const CHEER_DURATION = 1.6;
const CHEER_GAIN = 0.16;
const CHEER_FREQ = 1100;
const CHEER_Q = 0.6;
const CHEER_SWELL = 0.25;
const NOISE_CENTER = 0.5;
const NOISE_SPAN = 2;

const tone = (freq: number, duration: number, type: OscillatorType, gain: number, delay = 0): Tone =>
  ({ freq, duration, type, gain, delay });

const WHISTLE: readonly Tone[] = [
  tone(WHISTLE_FREQ, WHISTLE_LONG, 'square', WHISTLE_GAIN),
  tone(WHISTLE_WOBBLE, WHISTLE_LONG, 'sine', WHISTLE_GAIN),
];
const SHORT_WHISTLE: readonly Tone[] = [tone(WHISTLE_FREQ, WHISTLE_SHORT, 'square', WHISTLE_GAIN)];
const FINAL_WHISTLE: readonly Tone[] = [
  tone(WHISTLE_FREQ, WHISTLE_SHORT, 'square', WHISTLE_GAIN),
  tone(WHISTLE_FREQ, WHISTLE_SHORT, 'square', WHISTLE_GAIN, WHISTLE_GAP),
  tone(WHISTLE_FREQ, WHISTLE_LONG, 'square', WHISTLE_GAIN, WHISTLE_END_AT),
];
const KICK: readonly Tone[] = [tone(KICK_FREQ, KICK_DURATION, 'triangle', KICK_GAIN)];
const PASS: readonly Tone[] = [tone(PASS_FREQ, PASS_DURATION, 'triangle', PASS_GAIN)];
const THUD: readonly Tone[] = [tone(THUD_FREQ, THUD_DURATION, 'sine', THUD_GAIN)];
const POST: readonly Tone[] = [tone(POST_FREQ, POST_DURATION, 'triangle', POST_GAIN)];
const GOAL: readonly Tone[] = FANFARE.map((freq, i) => tone(freq, FANFARE_DURATION, 'triangle', FANFARE_GAIN, i * FANFARE_STEP));

interface Sound {
  readonly tones: readonly Tone[];
  readonly cheer: boolean;
}

const SOUNDS: Readonly<Record<SimEvent['type'], Sound>> = Object.freeze({
  whistle: { tones: WHISTLE, cheer: false },
  end: { tones: FINAL_WHISTLE, cheer: false },
  pass: { tones: PASS, cheer: false },
  shot: { tones: KICK, cheer: false },
  save: { tones: THUD, cheer: false },
  post: { tones: POST, cheer: false },
  tackle: { tones: THUD, cheer: false },
  out: { tones: SHORT_WHISTLE, cheer: false },
  goal: { tones: GOAL, cheer: true },
});

type AudioContextClass = typeof AudioContext;

const contextClass = (): AudioContextClass | null => {
  // Ältere Safari-Versionen kennen nur den Namen mit Präfix.
  const legacy = (globalThis as { webkitAudioContext?: AudioContextClass }).webkitAudioContext;
  return globalThis.AudioContext ?? legacy ?? null;
};

export const createMatchAudio = (initiallyMuted: boolean): MatchAudio => {
  let ctx: AudioContext | null = null;
  let muted = initiallyMuted;
  const live = new Set<AudioScheduledSourceNode>();

  const track = (node: AudioScheduledSourceNode): void => {
    live.add(node);
    node.addEventListener('ended', () => { live.delete(node); });
  };

  const playTone = (audio: AudioContext, spec: Tone): void => {
    const start = audio.currentTime + spec.delay;
    const osc = audio.createOscillator();
    const amp = audio.createGain();
    osc.type = spec.type;
    osc.frequency.value = spec.freq;
    amp.gain.setValueAtTime(SILENT, start);
    amp.gain.exponentialRampToValueAtTime(spec.gain, start + ATTACK);
    amp.gain.exponentialRampToValueAtTime(SILENT, start + spec.duration);
    osc.connect(amp);
    amp.connect(audio.destination);
    osc.start(start);
    osc.stop(start + spec.duration + TAIL);
    track(osc);
  };

  /** Jubel: gefiltertes Rauschen, das kurz anschwillt und ausklingt. */
  const playCheer = (audio: AudioContext): void => {
    const frames = Math.floor(audio.sampleRate * CHEER_DURATION);
    const buffer = audio.createBuffer(1, frames, audio.sampleRate);
    buffer.copyToChannel(Float32Array.from({ length: frames }, () => (Math.random() - NOISE_CENTER) * NOISE_SPAN), 0);
    const source = audio.createBufferSource();
    const filter = audio.createBiquadFilter();
    const amp = audio.createGain();
    source.buffer = buffer;
    filter.type = 'bandpass';
    filter.frequency.value = CHEER_FREQ;
    filter.Q.value = CHEER_Q;
    amp.gain.setValueAtTime(SILENT, audio.currentTime);
    amp.gain.exponentialRampToValueAtTime(CHEER_GAIN, audio.currentTime + CHEER_SWELL);
    amp.gain.exponentialRampToValueAtTime(SILENT, audio.currentTime + CHEER_DURATION);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(audio.destination);
    source.start();
    track(source);
  };

  const stopAll = (): void => {
    live.forEach((node) => {
      try {
        node.stop();
      } catch {
        // Bereits beendete Töne lassen sich nicht erneut stoppen – das ist unkritisch.
      }
    });
    live.clear();
  };

  return {
    unlock: (): void => {
      try {
        const Ctor = contextClass();
        ctx ??= Ctor ? new Ctor() : null;
        if (ctx?.state === 'suspended') void ctx.resume();
      } catch {
        // Ohne Audio läuft das Spiel stumm weiter.
        ctx = null;
      }
    },
    setMuted: (next: boolean): void => {
      muted = next;
      if (next) stopAll();
    },
    play: (event: SimEvent): void => {
      if (!ctx || muted || ctx.state !== 'running') return;
      const audio = ctx;
      const sound = SOUNDS[event.type];
      try {
        sound.tones.forEach((spec) => playTone(audio, spec));
        if (sound.cheer) playCheer(audio);
      } catch {
        // Ein fehlgeschlagener Ton darf den Spielablauf nicht stören.
      }
    },
    dispose: (): void => {
      stopAll();
      const closing = ctx;
      ctx = null;
      if (closing && closing.state !== 'closed') void closing.close();
    },
  };
};
