import type { Celebration } from '../data/looks';

/**
 * Gelenkwinkel der Figur in Bogenmaß. Vorzeichen:
 * - Schulter/Hüfte x: positiv = Gliedmaße schwingt nach hinten, negativ = nach vorn.
 * - Schulter/Hüfte z: positiv = nach außen abspreizen (für beide Seiten gleich gemeint).
 * - Ellbogen/Knie: positiv = beugen.
 * - spineX: positiv = Oberkörper nach vorn; headX: negativ = nach oben schauen.
 */
export interface Pose {
  rootY: number; rootRotY: number; slideZ: number;
  spineX: number; spineY: number; spineZ: number; headX: number; headY: number;
  shLx: number; shLz: number; shRx: number; shRz: number; elL: number; elR: number;
  hipLx: number; hipLz: number; hipRx: number; hipRz: number; knL: number; knR: number;
}

const ARM_REST = 0.1;
export const REST: Pose = {
  rootY: 0, rootRotY: 0, slideZ: 0, spineX: 0, spineY: 0, spineZ: 0, headX: 0, headY: 0,
  shLx: 0, shLz: ARM_REST, shRx: 0, shRz: ARM_REST, elL: 0.15, elR: 0.15,
  hipLx: 0, hipLz: 0, hipRx: 0, hipRz: 0, knL: 0, knR: 0,
};

const KEYS = Object.keys(REST) as (keyof Pose)[];
export const mix = (a: Pose, b: Pose, k: number): Pose =>
  Object.fromEntries(KEYS.map((key) => [key, a[key] + (b[key] - a[key]) * k])) as unknown as Pose;
const pose = (over: Partial<Pose>): Pose => ({ ...REST, ...over });

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
export const ease = (x: number): number => { const c = clamp01(x); return c * c * (3 - 2 * c); };
const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;
/** Parabel 0 → 1 → 0 über u in [0, 1] – für Sprünge. */
const arc = (u: number): number => { const c = clamp01(u); return 4 * c * (1 - c); };

/** Ruhiges Stehen mit Atmung. */
export const idlePose = (t: number): Pose => pose({ spineX: 0.02 * Math.sin(t * 1.6), shLz: ARM_REST + 0.02 * Math.sin(t * 1.6), shRz: ARM_REST + 0.02 * Math.sin(t * 1.6) });

/**
 * Gehen bis Laufen. phase = Schrittphase in Bogenmaß, intensity 0 (Gehen) bis 1 (Sprint).
 * Arme schwingen gegengleich zu den Beinen, das Knie beugt beim Durchschwingen.
 */
export const locomotionPose = (phase: number, intensity: number): Pose => {
  const i = clamp01(intensity);
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const leg = lerp(0.42, 0.9, i);
  const knee = lerp(0.85, 1.75, i);
  const arm = lerp(0.35, 0.95, i);
  const elbow = lerp(0.35, 1.45, i);
  return pose({
    rootY: -Math.cos(phase * 2) * lerp(0.012, 0.045, i),
    spineX: lerp(0.04, 0.2, i), spineY: 0.12 * s * i,
    hipLx: -leg * s, hipRx: leg * s,
    knL: knee * Math.max(0, c) + 0.12, knR: knee * Math.max(0, -c) + 0.12,
    shLx: arm * s, shRx: -arm * s, shLz: 0.12, shRz: 0.12, elL: elbow, elR: elbow,
  });
};

const UP = -2.95; // Arm gestreckt nach oben (über vorn)
const CROSSED: Partial<Pose> = { shLx: -0.95, shRx: -0.95, shLz: -0.38, shRz: -0.38, elL: 2.05, elR: 2.05 };
const WIDE: Partial<Pose> = { hipLz: 0.14, hipRz: 0.14 };

type CelebrationFn = (t: number) => Pose;

const CELEBRATIONS: Readonly<Record<Celebration, CelebrationFn>> = {
  // Beide Arme weit zum V ausgebreitet, Blick nach oben, leichtes Federn.
  arme: (t) => pose({ ...WIDE, shLz: 2.3, shRz: 2.3, elL: 0.12, elR: 0.12, headX: -0.28, spineX: -0.08, rootY: 0.05 * Math.abs(Math.sin(t * 5)) * Math.exp(-t * 0.8) }),
  // Tiefe Hocke, Sprung mit Faust nach oben, danach Faustpumpen.
  faust: (t) => {
    const air = arc((t - 0.2) / 0.6);
    const crouch = t < 0.2 ? ease(t / 0.2) * (1 - ease((t - 0.15) / 0.05)) : 0;
    const pump = t > 0.9 ? Math.sin((t - 0.9) * 9) * Math.exp(-(t - 0.9) * 0.9) : 0;
    const up = air > 0 ? 1 : 0;
    return pose({
      ...WIDE, rootY: 0.5 * air - 0.12 * crouch, knL: 0.5 * crouch + 0.5 * air, knR: 0.5 * crouch + 0.2 * air, hipLx: -0.35 * air,
      shRx: lerp(-1.25 + 0.35 * pump, UP, up * air), elR: lerp(1.9, 0.25, up * air), shLx: 0.35, shLz: 0.2, elL: 1.2, headX: -0.2 * air, spineX: -0.06,
    });
  },
  // Beide Arme gestreckt zum Himmel, Blick nach oben.
  himmel: (t) => pose({ shLx: UP, shRx: UP, shLz: 0.16, shRz: 0.16, elL: 0.1, elR: 0.1, headX: -0.45, spineX: -0.1, rootY: 0.02 * Math.sin(t * 3) }),
  // Ein Arm gestreckt nach oben, lockeres Auslaufen auf der Stelle.
  einarm: (t) => pose({ shRx: UP, shRz: 0.12, elR: 0.1, shLz: 0.28, elL: 0.55, headX: -0.12, rootY: 0.035 * Math.abs(Math.sin(t * 6)), knL: 0.25 * Math.max(0, Math.sin(t * 6)), knR: 0.25 * Math.max(0, -Math.sin(t * 6)) }),
  // Knie-Rutscher mit ausgebreiteten Armen, gleitet nach vorn aus.
  rutsche: (t) => {
    const down = ease(t / 0.28);
    return pose({
      rootY: -0.41 * down, slideZ: 1.3 * (1 - Math.exp(-t * 2.4)), knL: 1.6 * down, knR: 1.6 * down, hipLx: -0.05 * down, hipRx: -0.05 * down, hipLz: 0.18 * down, hipRz: 0.18 * down,
      spineX: -0.28 * down, headX: -0.3 * down, shLz: 1.9 * down + ARM_REST, shRz: 1.9 * down + ARM_REST, elL: 0.15, elR: 0.15,
    });
  },
  // Aufrecht, Brust raus, Arme leicht geöffnet – die Pose des Stolzen.
  stolz: (t) => pose({ ...WIDE, spineX: -0.1, headX: -0.15 + 0.04 * Math.sin(t * 2.2), shLz: 0.55, shRz: 0.55, elL: 0.25, elR: 0.25, shLx: 0.1, shRx: 0.1 }),
  // Arme vor der Brust verschränkt, Kinn hoch.
  kreuz: (t) => pose({ ...WIDE, ...CROSSED, headX: -0.14, spineX: -0.05, rootY: 0.01 * Math.sin(t * 2) }),
  // Sprung mit halber Drehung, Landung breitbeinig mit nach unten gestoßenen Armen, dann zurückdrehen.
  siu: (t) => {
    const crouch = t < 0.18 ? ease(t / 0.18) : 0;
    const air = arc((t - 0.18) / 0.62);
    const landed = ease((t - 0.8) / 0.12);
    const back = ease((t - 1.55) / 0.45);
    return pose({
      hipLz: 0.14 + 0.16 * landed, hipRz: 0.14 + 0.16 * landed, rootY: 0.55 * air - 0.12 * crouch * (1 - air), rootRotY: Math.PI * ease((t - 0.2) / 0.55) + Math.PI * back,
      knL: 0.45 * crouch + 0.6 * air + 0.22 * landed * (1 - back), knR: 0.45 * crouch + 0.3 * air + 0.22 * landed * (1 - back),
      shLx: lerp(-2.2 * air, 0.45, landed), shRx: lerp(-2.2 * air, 0.45, landed), shLz: 0.25 + 0.4 * landed, shRz: 0.25 + 0.4 * landed, elL: 0.12, elR: 0.12,
      spineX: -0.12 * landed, headX: -0.2 * landed,
    });
  },
  // Kleiner Tanz: Hüfte und Arme im Wechsel, federnde Knie.
  samba: (t) => {
    const s = Math.sin(t * 5.2);
    return pose({
      rootY: 0.035 * Math.abs(s), rootRotY: 0.28 * s, spineZ: 0.1 * s, spineY: -0.2 * s,
      shLx: -0.55 + 0.5 * s, shRx: -0.55 - 0.5 * s, shLz: 0.35, shRz: 0.35, elL: 1.35, elR: 1.35,
      knL: 0.35 * Math.max(0, s) + 0.1, knR: 0.35 * Math.max(0, -s) + 0.1, hipLz: 0.1, hipRz: 0.1, headY: 0.15 * s,
    });
  },
  // Verschränkte Arme mit leichtem, langsamem Frösteln.
  frieren: (t) => pose({ ...CROSSED, spineX: 0.12, spineY: 0.035 * Math.sin(t * 11), rootY: 0.008 * Math.sin(t * 11), headX: 0.05, hipLz: 0.05, hipRz: 0.05 }),
  // Beide Hände vor dem Gesicht verschränkt.
  maske: (t) => pose({ ...WIDE, shLx: -1.3, shRx: -1.3, shLz: -0.5, shRz: -0.5, elL: 2.2, elR: 2.2, headX: 0.06, spineX: 0.02 * Math.sin(t * 2) }),
};

const BLEND_IN = 0.3;
const FINALE_AT = 1.9;
const FINALE_BLEND = 0.35;

/**
 * Jubelpose zum Zeitpunkt t (Sekunden seit Beginn). Spitzenkarten hängen ein Finale an:
 * ein Sprung mit weit ausgebreiteten Armen.
 */
export const celebrationPose = (kind: Celebration, t: number, finale: boolean): Pose => {
  const base = mix(REST, CELEBRATIONS[kind](t), ease(t / BLEND_IN));
  if (!finale || t < FINALE_AT) return base;
  const u = t - FINALE_AT;
  const jump = CELEBRATIONS.arme(u);
  const end = { ...jump, rootY: jump.rootY + 0.42 * arc(u / 0.6), knL: 0.4 * arc(u / 0.6), knR: 0.4 * arc(u / 0.6), slideZ: base.slideZ, rootRotY: base.rootRotY };
  // Nach einem Knie-Rutscher steht die Figur fürs Finale wieder auf.
  return mix({ ...base }, end, ease(u / FINALE_BLEND));
};
