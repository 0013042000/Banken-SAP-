/** Kleine, unveränderliche 2D-Vektorrechnung für die Simulation. */
export interface Vec {
  readonly x: number;
  readonly y: number;
}

const EPSILON = 1e-9;

export const ZERO: Vec = Object.freeze({ x: 0, y: 0 });

export const vec = (x: number, y: number): Vec => ({ x, y });
export const add = (a: Vec, b: Vec): Vec => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec, k: number): Vec => ({ x: a.x * k, y: a.y * k });
export const len = (a: Vec): number => Math.hypot(a.x, a.y);
export const dist = (a: Vec, b: Vec): number => Math.hypot(a.x - b.x, a.y - b.y);
export const dot = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y;
export const cross = (a: Vec, b: Vec): number => a.x * b.y - a.y * b.x;
export const perp = (a: Vec): Vec => ({ x: -a.y, y: a.x });
export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
export const lerp = (a: Vec, b: Vec, t: number): Vec => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t) });

/** Einheitsvektor; bei (fast) Länge 0 der Ersatzwert. */
export const unit = (a: Vec, fallback: Vec = ZERO): Vec => {
  const l = len(a);
  return l > EPSILON ? scale(a, 1 / l) : fallback;
};

/** Begrenzt die Länge eines Vektors. */
export const limit = (a: Vec, max: number): Vec => {
  const l = len(a);
  return l > max && l > EPSILON ? scale(a, max / l) : a;
};

export const rotate = (a: Vec, angle: number): Vec => {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return { x: a.x * c - a.y * s, y: a.x * s + a.y * c };
};

/** Spiegelt v an der Fläche mit Normale n (n ist Einheitsvektor). */
export const reflect = (v: Vec, n: Vec): Vec => sub(v, scale(n, dot(v, n) + dot(v, n)));

/** Kürzester Abstand des Punktes p zur Strecke a–b. */
export const distToSegment = (p: Vec, a: Vec, b: Vec): number => {
  const ab = sub(b, a);
  const span = dot(ab, ab);
  const t = span > EPSILON ? clamp(dot(sub(p, a), ab) / span, 0, 1) : 0;
  return dist(p, add(a, scale(ab, t)));
};

export const isFiniteVec = (a: Vec): boolean => Number.isFinite(a.x) && Number.isFinite(a.y);
