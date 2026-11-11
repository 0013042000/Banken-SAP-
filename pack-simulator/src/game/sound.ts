/** Kleine, selbst erzeugte Sounds über WebAudio. Wird erst nach Nutzerinteraktion aktiviert. */
let ctx: AudioContext | null = null;
let muted = false;
const active = new Set<AudioScheduledSourceNode>();

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
    active.add(o);
    o.onended = (): void => { active.delete(o); };
  } catch { /* ignore */ }
};

/** Rauschen mit Tiefpass – für Publikum und Windstoß. Lautstärke schwillt an und klingt aus. */
const noise = (dur: number, gain: number, cutoff: number, when = 0): void => {
  if (!ctx || muted) return;
  try {
    const frames = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass'; filter.frequency.value = cutoff;
    const g = ctx.createGain();
    const t0 = ctx.currentTime + when;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter); filter.connect(g); g.connect(ctx.destination);
    src.start(t0); src.stop(t0 + dur + 0.05);
    active.add(src);
    src.onended = (): void => { active.delete(src); };
  } catch { /* ignore */ }
};

/** Bricht alle laufenden und geplanten Töne ab (z. B. beim Überspringen oder Verlassen). */
export const stopAllSounds = (): void => {
  for (const o of active) { try { o.stop(); } catch { /* bereits beendet */ } }
  active.clear();
};

export const sfx = {
  tap: (): void => tone(440, 0.08, 'square', 0.08),
  burst: (): void => { tone(180, 0.5, 'sawtooth', 0.12); tone(900, 0.25, 'triangle', 0.08, 0.05); },
  flip: (): void => tone(660, 0.12, 'triangle', 0.1),
  reveal: (ovr: number): void => { tone(520 + ovr * 4, 0.18, 'triangle', 0.12); tone(780 + ovr * 4, 0.22, 'sine', 0.1, 0.08); },
  /** Herzschlag, der über die angegebene Dauer schneller wird. */
  suspense: (durMs = 2000): void => {
    const total = Math.max(0.6, durMs / 1000);
    let t = 0; let gap = 0.52; let i = 0;
    while (t < total - 0.15 && i < 12) { tone(84 + i * 9, 0.22, 'sine', 0.17, t); tone(60, 0.18, 'sine', 0.1, t + 0.09); t += gap; gap = Math.max(0.2, gap * 0.86); i++; }
    tone(1800, total * 0.7, 'sine', 0.018, total * 0.25);
  },
  /** Die Figur läuft aus dem Tunnel: anschwellender Ton und Publikum. */
  entrance: (durMs = 1700): void => {
    const total = Math.max(0.5, durMs / 1000);
    [196, 247, 294, 370].forEach((f, i) => tone(f, total * 0.5, 'triangle', 0.07, (i * total) / 6));
    noise(total + 0.9, 0.09, 900, total * 0.25);
  },
  /** Jubel des Publikums. */
  crowd: (dur = 2.2): void => noise(dur, 0.12, 1400),
  /** 86–89: kurzer, kräftiger Akzent. */
  strong: (): void => { [392, 523, 659].forEach((f, i) => tone(f, 0.3, 'triangle', 0.13, i * 0.09)); tone(110, 0.5, 'sawtooth', 0.07); },
  /** Legende: warme, getragene Fanfare. */
  legend: (): void => { [262, 330, 392, 523, 659].forEach((f, i) => tone(f, 0.7, 'sine', 0.13, i * 0.16)); [131, 196].forEach((f) => tone(f, 1.6, 'triangle', 0.09)); },
  /** 95+: funkelnder Zusatz über der Fanfare. */
  elite: (): void => { [1568, 2093, 2637, 3136, 2637, 3520].forEach((f, i) => tone(f, 0.22, 'sine', 0.06, 0.25 + i * 0.1)); },
  walkout: (): void => { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.45, 'triangle', 0.14, i * 0.14)); tone(130, 1.2, 'sawtooth', 0.1); },
  win: (): void => { [523, 659, 784, 1046, 1318].forEach((f, i) => tone(f, 0.35, 'sine', 0.14, i * 0.12)); },
};
