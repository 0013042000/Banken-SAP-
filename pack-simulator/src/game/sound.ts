/** Kleine, selbst erzeugte Sounds über WebAudio. Wird erst nach Nutzerinteraktion aktiviert. */
let ctx: AudioContext | null = null;
let muted = false;

export const setMuted = (m: boolean): void => { muted = m; };

export const unlockAudio = (): void => {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { ctx = null; }
};

const tone = (freq: number, dur: number, type: OscillatorType, gain: number, when = 0): void => {
  if (!ctx || muted) return;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, ctx.currentTime + when);
    g.gain.exponentialRampToValueAtTime(gain, ctx.currentTime + when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + when + dur);
    o.connect(g); g.connect(ctx.destination);
    o.start(ctx.currentTime + when); o.stop(ctx.currentTime + when + dur + 0.05);
  } catch { /* ignore */ }
};

export const sfx = {
  tap: (): void => tone(440, 0.08, 'square', 0.08),
  burst: (): void => { tone(180, 0.5, 'sawtooth', 0.12); tone(900, 0.25, 'triangle', 0.08, 0.05); },
  flip: (): void => tone(660, 0.12, 'triangle', 0.1),
  reveal: (ovr: number): void => { tone(520 + ovr * 4, 0.18, 'triangle', 0.12); tone(780 + ovr * 4, 0.22, 'sine', 0.1, 0.08); },
  walkout: (): void => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.45, 'triangle', 0.14, i * 0.14)); tone(130, 1.2, 'sawtooth', 0.1); },
  win: (): void => { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.35, 'sine', 0.14, i * 0.12)); },
};
