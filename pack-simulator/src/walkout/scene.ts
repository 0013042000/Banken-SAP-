import {
  ACESFilmicToneMapping, AdditiveBlending, AmbientLight, BoxGeometry, CanvasTexture, CircleGeometry, Color, ConeGeometry, DirectionalLight,
  DoubleSide, Fog, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, PerspectiveCamera, PlaneGeometry, PointLight, Quaternion,
  RepeatWrapping, RingGeometry, Scene, Sprite, SpriteMaterial, SRGBColorSpace, Vector3, WebGLRenderer,
  type BufferGeometry, type Material, type Texture,
} from 'three';
import { kitFor, lookFor, numberFor } from '../data/looks';
import type { Player } from '../data/players';
import type { StepKind } from '../game/reveal';
import { createAvatar, type Avatar } from './avatar';
import { createEmitter } from './particles';
import { celebrationPose, clamp01, ease, idlePose, locomotionPose, mix, REST } from './pose';

export interface WalkoutSpec {
  readonly player: Player;
  /** 'walkout' = vollständiger Auftritt aus dem Tunnel, 'strong' = kurzer Auftritt. */
  readonly tier: 'strong' | 'walkout';
  readonly legend: boolean;
  readonly elite: boolean;
}

export interface WalkoutDirector {
  /** Neue Karte: Figur bauen, Bühne einfärben, alles auf Anfang. */
  readonly start: (spec: WalkoutSpec) => void;
  /** Enthüllungsschritt wechseln; die Szene blendet in durMs zum Zielbild des Schritts. */
  readonly setPhase: (kind: StepKind, durMs: number) => void;
  readonly resize: (width: number, height: number) => void;
  readonly dispose: () => void;
}

// ---- Bühnenmaße (Meter). Die Figur läuft entlang +Z auf die Kamera zu. ----
const MARK_Z = 1.6;
const MOUTH_Z = -3;
const TUNNEL_END_Z = -17;
const TUNNEL_W = 3.4;
const TUNNEL_H = 2.8;
const FOV = 42;
const HOLD_DISTANCE = 4.9;

interface Palette { readonly accent: string; readonly accent2: string; readonly sky: string; readonly facade: string; readonly key: string; readonly carpet: boolean }
const PALETTES = {
  strong: { accent: '#38f2ff', accent2: '#8c82ff', sky: '#030712', facade: '#0d1730', key: '#e8f6ff', carpet: false },
  walkout: { accent: '#5fd9ff', accent2: '#ffa53a', sky: '#03060f', facade: '#0d1730', key: '#f1f7ff', carpet: false },
  elite: { accent: '#f5c542', accent2: '#ff5fd2', sky: '#070410', facade: '#150f2a', key: '#fff6e0', carpet: false },
  legend: { accent: '#ffe6a8', accent2: '#d6a03c', sky: '#0a0703', facade: '#2b2112', key: '#fff1d0', carpet: true },
} as const satisfies Record<string, Palette>;

const paletteFor = (spec: WalkoutSpec): Palette => {
  if (spec.legend) return PALETTES.legend;
  if (spec.elite) return PALETTES.elite;
  return spec.tier === 'walkout' ? PALETTES.walkout : PALETTES.strong;
};

/** Kamera- und Lichtzustand, zwischen dem pro Schritt weich überblendet wird. */
interface View { cx: number; cy: number; cz: number; lx: number; ly: number; lz: number; key: number; glow: number }
const VIEW_KEYS = ['cx', 'cy', 'cz', 'lx', 'ly', 'lz', 'key', 'glow'] as const;
const lerpView = (a: View, b: View, k: number): View =>
  Object.fromEntries(VIEW_KEYS.map((key) => [key, a[key] + (b[key] - a[key]) * k])) as unknown as View;

type FigureMode = 'hidden' | 'stand' | 'move' | 'celebrate';
interface Leg { readonly view: View; readonly figFrom: number; readonly figTo: number; readonly mode: FigureMode; readonly intensity: number }

/** Drehbuch des vollständigen Walkouts: dunkler Tunnel → Silhouette → Lauf ins Licht → Jubel. */
const FULL: Readonly<Record<Exclude<StepKind, 'card'>, Leg>> = {
  burst: { view: { cx: 0, cy: 1.75, cz: 10.6, lx: 0, ly: 1.5, lz: -4, key: 0.03, glow: 0 }, figFrom: -12, figTo: -12, mode: 'hidden', intensity: 0 },
  dark: { view: { cx: 0, cy: 1.45, cz: 7.7, lx: 0, ly: 1.3, lz: -6, key: 0.04, glow: 0.32 }, figFrom: -12, figTo: -12, mode: 'hidden', intensity: 0 },
  flag: { view: { cx: -0.55, cy: 1.35, cz: 6.9, lx: 0, ly: 1.2, lz: -8, key: 0.05, glow: 1 }, figFrom: -12.4, figTo: -10, mode: 'move', intensity: 0.12 },
  pos: { view: { cx: 0.5, cy: 1.25, cz: 6.3, lx: 0, ly: 1.12, lz: -7, key: 0.07, glow: 1 }, figFrom: -10, figTo: -6.6, mode: 'move', intensity: 0.36 },
  walk: { view: { cx: 0.8, cy: 0.95, cz: 6.6, lx: 0, ly: 1.05, lz: MARK_Z, key: 1, glow: 0.75 }, figFrom: -6.6, figTo: MARK_Z, mode: 'move', intensity: 0.62 },
  name: { view: { cx: 0.35, cy: 0.9, cz: 5.9, lx: 0, ly: 1.08, lz: MARK_Z, key: 1, glow: 0.6 }, figFrom: MARK_Z, figTo: MARK_Z, mode: 'celebrate', intensity: 0 },
};

/** Kurzer Auftritt (86–89): Stadion ist schon hell, die Figur joggt aus dem Tunnel. */
const SHORT: Readonly<Record<Exclude<StepKind, 'card'>, Leg>> = {
  burst: { view: { cx: 0.2, cy: 1.5, cz: 8, lx: 0, ly: 1.2, lz: -3, key: 0.5, glow: 0.6 }, figFrom: -8, figTo: -8, mode: 'hidden', intensity: 0 },
  dark: { view: { cx: 0.2, cy: 1.5, cz: 7.6, lx: 0, ly: 1.2, lz: -3, key: 0.6, glow: 0.7 }, figFrom: -8, figTo: -8, mode: 'hidden', intensity: 0 },
  flag: { view: { cx: 0.4, cy: 1.4, cz: 7.1, lx: 0, ly: 1.15, lz: -3, key: 0.85, glow: 0.9 }, figFrom: -7.6, figTo: -4.6, mode: 'move', intensity: 0.45 },
  pos: { view: { cx: 0.5, cy: 1.3, cz: 6.6, lx: 0, ly: 1.05, lz: -1, key: 0.95, glow: 0.8 }, figFrom: -4.6, figTo: -1.4, mode: 'move', intensity: 0.5 },
  walk: { view: { cx: 0.6, cy: 1.15, cz: 6.1, lx: 0, ly: 0.95, lz: MARK_Z, key: 1, glow: 0.7 }, figFrom: -1.4, figTo: MARK_Z, mode: 'move', intensity: 0.5 },
  name: { view: { cx: 0.4, cy: 1.12, cz: 5.8, lx: 0, ly: 0.92, lz: MARK_Z, key: 1, glow: 0.6 }, figFrom: MARK_Z, figTo: MARK_Z, mode: 'celebrate', intensity: 0 },
};

const canvasTexture = (w: number, h: number, draw: (g: CanvasRenderingContext2D) => void): Texture => {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  if (g) draw(g);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
};

/** Feste Pseudozufallsfolge, damit Tribüne und Staub bei jedem Start gleich aussehen. */
const seededRandom = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
};

export const createDirector = (canvas: HTMLCanvasElement): WalkoutDirector => {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;

  const scene = new Scene();
  const fog = new Fog('#03060f', 14, 70);
  scene.fog = fog;
  scene.background = new Color('#03060f');
  const camera = new PerspectiveCamera(FOV, 1, 0.1, 140);

  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const textures: Texture[] = [];
  const geo = <T extends BufferGeometry>(g: T): T => { geometries.push(g); return g; };
  const keep = <T extends Material>(m: T): T => { materials.push(m); return m; };
  const tex = (t: Texture): Texture => { textures.push(t); return t; };
  const add = (g: BufferGeometry, m: Material, x: number, y: number, z: number, parent: Group | Scene = scene): Mesh => {
    const o = new Mesh(g, m); o.position.set(x, y, z); parent.add(o); return o;
  };

  // ---- Licht ----
  const ambient = new AmbientLight('#ffffff', 0.05);
  const keyLight = new DirectionalLight('#ffffff', 0);
  keyLight.position.set(4, 9, 10);
  keyLight.target.position.set(0, 1, MARK_Z);
  const fillLight = new DirectionalLight('#ffffff', 0);
  fillLight.position.set(-6, 4, 6);
  fillLight.target.position.set(0, 1, MARK_Z);
  const tunnelLight = new PointLight('#ffffff', 0, 26, 1.3);
  tunnelLight.position.set(0, 2.1, -14.5);
  scene.add(ambient, keyLight, keyLight.target, fillLight, fillLight.target, tunnelLight);

  // ---- Rasen ----
  const pitchTex = tex(canvasTexture(8, 64, (g) => { g.fillStyle = '#17713a'; g.fillRect(0, 0, 8, 32); g.fillStyle = '#135f31'; g.fillRect(0, 32, 8, 32); }));
  pitchTex.wrapS = RepeatWrapping; pitchTex.wrapT = RepeatWrapping; pitchTex.repeat.set(1, 6);
  const pitch = add(geo(new PlaneGeometry(60, 34)), keep(new MeshLambertMaterial({ map: pitchTex })), 0, 0, 9);
  pitch.rotation.x = -Math.PI / 2;

  // ---- Stadionwand mit Tunnelöffnung ----
  const facadeMat = keep(new MeshLambertMaterial({ color: '#0d1730' }));
  const WALL_W = 26; const WALL_H = 3.15;
  add(geo(new BoxGeometry(WALL_W, WALL_H, 0.6)), facadeMat, -(TUNNEL_W / 2 + WALL_W / 2), WALL_H / 2, MOUTH_Z - 0.3);
  add(geo(new BoxGeometry(WALL_W, WALL_H, 0.6)), facadeMat, TUNNEL_W / 2 + WALL_W / 2, WALL_H / 2, MOUTH_Z - 0.3);
  add(geo(new BoxGeometry(TUNNEL_W, WALL_H - TUNNEL_H, 0.6)), facadeMat, 0, TUNNEL_H + (WALL_H - TUNNEL_H) / 2, MOUTH_Z - 0.3);

  // Stadionwand gliedern: Pfeiler und ein Leuchtband an der Oberkante.
  const pillarGeo = geo(new BoxGeometry(0.35, WALL_H, 0.25));
  [-13, -9.5, -6, -3.2, 3.2, 6, 9.5, 13].forEach((x) => add(pillarGeo, facadeMat, x, WALL_H / 2, MOUTH_Z + 0.1));
  const bandMat = keep(new MeshBasicMaterial({ color: '#000000' }));
  add(geo(new BoxGeometry(WALL_W * 2 + TUNNEL_W, 0.14, 0.12)), bandMat, 0, WALL_H + 0.02, MOUTH_Z + 0.05);

  // Leuchtband um die Öffnung und entlang des Tunnels: gibt bei der Kamerafahrt Tiefe.
  const ledMat = keep(new MeshBasicMaterial({ color: '#5fd9ff' }));
  const ledPost = geo(new BoxGeometry(0.09, TUNNEL_H, 0.09));
  const ledBar = geo(new BoxGeometry(TUNNEL_W + 0.1, 0.09, 0.09));
  [MOUTH_Z + 0.02, -5.5, -8, -10.5, -13, -15.5].forEach((z) => {
    add(ledPost, ledMat, -TUNNEL_W / 2 + 0.03, TUNNEL_H / 2, z);
    add(ledPost, ledMat, TUNNEL_W / 2 - 0.03, TUNNEL_H / 2, z);
    add(ledBar, ledMat, 0, TUNNEL_H - 0.03, z);
  });
  const TUNNEL_LEN = MOUTH_Z - TUNNEL_END_Z;
  const tunnelMid = (MOUTH_Z + TUNNEL_END_Z) / 2;
  const ledRail = geo(new BoxGeometry(0.06, 0.06, TUNNEL_LEN));
  [[-1, 0.05], [1, 0.05], [-1, TUNNEL_H - 0.08], [1, TUNNEL_H - 0.08]].forEach(([side, y]) =>
    add(ledRail, ledMat, (side ?? 1) * (TUNNEL_W / 2 - 0.05), y ?? 0, tunnelMid));

  const tunnelMat = keep(new MeshLambertMaterial({ color: '#8d97ab' }));
  add(geo(new BoxGeometry(TUNNEL_W, 0.1, TUNNEL_LEN)), tunnelMat, 0, -0.045, tunnelMid);
  add(geo(new BoxGeometry(0.2, TUNNEL_H, TUNNEL_LEN)), tunnelMat, -TUNNEL_W / 2 - 0.1, TUNNEL_H / 2, tunnelMid);
  add(geo(new BoxGeometry(0.2, TUNNEL_H, TUNNEL_LEN)), tunnelMat, TUNNEL_W / 2 + 0.1, TUNNEL_H / 2, tunnelMid);
  add(geo(new BoxGeometry(TUNNEL_W + 0.4, 0.2, TUNNEL_LEN)), tunnelMat, 0, TUNNEL_H + 0.1, tunnelMid);

  // Lichtwand am Tunnelende: vor ihr erscheint die Figur zuerst als Silhouette.
  const wallMat = keep(new MeshBasicMaterial({ color: '#000000' }));
  add(geo(new PlaneGeometry(TUNNEL_W, TUNNEL_H)), wallMat, 0, TUNNEL_H / 2, TUNNEL_END_Z + 0.05);
  const glowTex = tex(canvasTexture(128, 128, (g) => {
    const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.35, 'rgba(255,255,255,0.45)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, 128, 128);
  }));
  const sprite = (size: number, x: number, y: number, z: number): { s: Sprite; m: SpriteMaterial } => {
    const m = keep(new SpriteMaterial({ map: glowTex, blending: AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false }));
    const s = new Sprite(m); s.scale.setScalar(size); s.position.set(x, y, z); scene.add(s);
    return { s, m };
  };
  const tunnelGlow = sprite(8, 0, TUNNEL_H / 2, TUNNEL_END_Z + 1.2);
  const mouthGlow = sprite(9, 0, TUNNEL_H / 2, MOUTH_Z + 0.4);

  // ---- Tribüne mit Publikum und Flutlicht ----
  const rnd = seededRandom(7);
  const crowdTex = tex(canvasTexture(256, 128, (g) => {
    g.fillStyle = '#080b14'; g.fillRect(0, 0, 256, 128);
    const tones = ['#e8e2d6', '#c94a4a', '#3d6fd1', '#e0b84a', '#7d8799', '#f2f2f2', '#2f9a5a'];
    for (let row = 0; row < 11; row++) for (let i = 0; i < 46; i++) {
      g.fillStyle = tones[Math.floor(rnd() * tones.length)] ?? '#ffffff';
      g.globalAlpha = 0.35 + rnd() * 0.6;
      g.beginPath(); g.arc(i * 5.6 + (row % 2) * 2.8 + rnd() * 1.5, 8 + row * 11 + rnd() * 2, 2.1, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  }));
  crowdTex.wrapS = RepeatWrapping; crowdTex.wrapT = RepeatWrapping; crowdTex.repeat.set(7, 3);
  const crowdMat = keep(new MeshBasicMaterial({ map: crowdTex, color: '#000000' }));
  const STAND_H = 17; const STAND_TILT = 0.98;
  const stand = add(geo(new PlaneGeometry(64, STAND_H)), crowdMat, 0, WALL_H + (STAND_H / 2) * Math.cos(STAND_TILT), MOUTH_Z - 0.6 - (STAND_H / 2) * Math.sin(STAND_TILT));
  stand.rotation.x = -STAND_TILT;
  const floods = [sprite(8, -9, 9.6, -12), sprite(8, 9, 9.6, -12), sprite(5, -3.2, 10.2, -12.5), sprite(5, 3.2, 10.2, -12.5)];

  // Lichtkegel vom Flutlicht auf den Rasen.
  const beamMat = keep(new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, fog: false }));
  const beamGeo = geo(new ConeGeometry(2.6, 17, 22, 1, true));
  const beams = [-9, 9].map((x) => {
    const source = new Vector3(x, 9.6, -12); const target = new Vector3(x * 0.12, 0, MARK_Z);
    const b = new Mesh(beamGeo, beamMat);
    b.position.copy(source).add(target).multiplyScalar(0.5);
    b.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 1, 0), source.clone().sub(target).normalize()));
    scene.add(b);
    return { mesh: b, base: b.quaternion.clone(), side: Math.sign(x) };
  });

  // Markierung, Schatten und (für Legenden) der goldene Läufer.
  const ringMat = keep(new MeshBasicMaterial({ color: '#5fd9ff', transparent: true, opacity: 0, depthWrite: false }));
  const ring = add(geo(new RingGeometry(0.62, 0.7, 40)), ringMat, 0, 0.015, MARK_Z);
  ring.rotation.x = -Math.PI / 2;
  const shadowMat = keep(new MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.42, depthWrite: false }));
  const shadow = add(geo(new CircleGeometry(0.44, 24)), shadowMat, 0, 0.02, MARK_Z);
  shadow.rotation.x = -Math.PI / 2;
  const carpetMat = keep(new MeshLambertMaterial({ color: '#8f6b18', emissive: '#2a1e06' }));
  const carpet = add(geo(new PlaneGeometry(2.1, MARK_Z + 1.2 - TUNNEL_END_Z)), carpetMat, 0, 0.012, (MARK_Z + 1.2 + TUNNEL_END_Z) / 2);
  carpet.rotation.x = -Math.PI / 2;
  carpet.visible = false;

  // ---- Partikel (begrenzt) ----
  const sparks = createEmitter({ count: 180, size: 0.11, gravity: 5.5, drag: 0.6, additive: true });
  const dust = createEmitter({ count: 110, size: 0.07, gravity: -0.12, drag: 0.25, additive: true });
  const confetti = createEmitter({ count: 220, size: 0.13, gravity: 1.5, drag: 1.4, additive: false });
  const fireworks = createEmitter({ count: 260, size: 0.34, gravity: 1.6, drag: 0.9, additive: true });
  scene.add(sparks.points, dust.points, confetti.points, fireworks.points);

  // ---- Zustand ----
  let spec: WalkoutSpec | null = null;
  let palette: Palette = PALETTES.walkout;
  let avatar: Avatar | null = null;
  let script = FULL;
  let phase: StepKind = 'burst';
  let from: View = { ...FULL.burst.view };
  let to: View = { ...FULL.burst.view };
  let cur: View = { ...FULL.burst.view };
  let phaseT = 0;
  let phaseDur = 0.001;
  let figZ = FULL.burst.figFrom;
  let figFrom = figZ;
  let figTo = figZ;
  let figMode: FigureMode = 'hidden';
  let intensity = 0;
  let stride = 0;
  let celebT = 0;
  let clock = 0;
  let nextFirework = 0;
  let confettiLeft = 0;
  let sparkLeft = 0;
  let aspect = 1;
  let disposed = false;
  let frame = 0;
  let last = 0;
  const accent = new Color(); const accent2 = new Color(); const tmp = new Color();
  const fxRnd = seededRandom(99);

  /** Zielbild am Haltepunkt: Figur links, rechts bleibt Platz für die Karte. */
  const holdView = (): View => {
    const halfWidth = Math.tan((FOV * Math.PI) / 360) * HOLD_DISTANCE * aspect;
    const shift = halfWidth * 0.5;
    return { cx: shift * 0.92, cy: 0.92, cz: MARK_Z + HOLD_DISTANCE, lx: shift, ly: 0.98, lz: MARK_Z, key: 1, glow: 0.55 };
  };

  const applyPalette = (): void => {
    accent.set(palette.accent); accent2.set(palette.accent2);
    (scene.background as Color).set(palette.sky); fog.color.set(palette.sky);
    facadeMat.color.set(palette.facade);
    keyLight.color.set(palette.key); fillLight.color.copy(accent); tunnelLight.color.copy(accent);
    ringMat.color.copy(accent); beamMat.color.set(palette.key);
    [tunnelGlow, mouthGlow, ...floods].forEach((f) => f.m.color.copy(accent));
    carpet.visible = palette.carpet;
  };

  const start = (next: WalkoutSpec): void => {
    spec = next;
    palette = paletteFor(next);
    script = next.tier === 'walkout' ? FULL : SHORT;
    applyPalette();
    avatar?.dispose();
    avatar = createAvatar({ look: lookFor(next.player), kit: kitFor(next.player), number: numberFor(next.player), keeper: next.player.pos === 'TW' });
    scene.add(avatar.root);
    avatar.root.visible = false;
    phase = 'burst';
    from = { ...script.burst.view }; to = { ...script.burst.view }; cur = { ...script.burst.view };
    figZ = script.burst.figFrom; figFrom = figZ; figTo = figZ; figMode = 'hidden';
    phaseT = 0; phaseDur = 0.001; stride = 0; celebT = 0; intensity = 0; confettiLeft = 0; sparkLeft = 0; nextFirework = 0;
    [sparks, confetti, fireworks].forEach((e) => e.clear());
  };

  const setPhase = (kind: StepKind, durMs: number): void => {
    if (!spec) return;
    const previous = phase;
    phase = kind;
    from = { ...cur };
    phaseT = 0;
    if (kind === 'card') {
      to = holdView();
      phaseDur = 0.7;
      // Vorspulen: Figur direkt an die Markierung, Jubel beginnt von vorn.
      if (figMode !== 'celebrate') { celebT = 0; from = { ...from, key: Math.max(from.key, 0.55) }; }
      figZ = MARK_Z; figFrom = MARK_Z; figTo = MARK_Z; figMode = 'celebrate';
      if (spec.elite) { confettiLeft = 2.4; nextFirework = Math.min(nextFirework, 0.25); }
      return;
    }
    const leg = script[kind];
    to = { ...leg.view };
    phaseDur = Math.max(0.05, durMs / 1000);
    // Läuft die Figur schon, setzt sie nahtlos an ihrer aktuellen Stelle fort.
    figFrom = previous !== 'burst' && previous !== 'dark' && leg.mode === 'move' && figMode === 'move' ? figZ : leg.figFrom;
    figTo = leg.figTo;
    figZ = figFrom;
    intensity = leg.intensity;
    if (leg.mode === 'celebrate' && figMode !== 'celebrate') celebT = 0;
    figMode = leg.mode;
    if (kind === 'walk') sparkLeft = spec.tier === 'walkout' ? 1.3 : 0;
    if (kind === 'name' && spec.elite) nextFirework = 0.15;
  };

  const burstFirework = (): void => {
    const cx = cur.lx + (fxRnd() - 0.5) * 9; const cy = 3.9 + fxRnd() * 2.2; const cz = MOUTH_Z - 1 - fxRnd() * 3;
    tmp.copy(fxRnd() > 0.5 ? accent : accent2);
    for (let i = 0; i < 70; i++) {
      const a = fxRnd() * Math.PI * 2; const b = Math.acos(2 * fxRnd() - 1); const sp = 3.2 + fxRnd() * 2.4;
      fireworks.spawn(cx, cy, cz, Math.sin(b) * Math.cos(a) * sp, Math.cos(b) * sp, Math.sin(b) * Math.sin(a) * sp, 1.2 + fxRnd() * 0.7, tmp);
    }
  };

  const update = (dt: number): void => {
    clock += dt;
    phaseT += dt;
    const k = clamp01(phaseT / phaseDur);
    cur = lerpView(from, to, ease(k));

    // Figur bewegen: im Lauf gegen Ende abbremsen, Schrittphase an die zurückgelegte Strecke koppeln.
    const prevZ = figZ;
    if (figMode === 'move') {
      const travel = phase === 'walk' ? 1 - Math.pow(1 - k, 1.7) : k;
      figZ = figFrom + (figTo - figFrom) * travel;
      const speed = Math.max(0, (figZ - prevZ) / Math.max(dt, 0.001));
      const strideLength = 1.35 + intensity * 1.5;
      stride += ((figZ - prevZ) / strideLength) * Math.PI * 2;
      const live = clamp01(speed / 5.5) * 0.5 + intensity * 0.6;
      avatar?.apply(k >= 1 ? mix(locomotionPose(stride, live), REST, 0.6) : locomotionPose(stride, live));
    } else if (figMode === 'celebrate' && spec) {
      celebT += dt;
      avatar?.apply(celebrationPose(lookFor(spec.player).celebration, celebT, spec.elite));
    } else {
      avatar?.apply(idlePose(clock));
    }
    if (avatar) {
      avatar.root.visible = figMode !== 'hidden';
      avatar.root.position.set(0, 0, figZ);
      shadow.visible = avatar.root.visible && figZ > MOUTH_Z;
      shadow.position.set(0, 0.02, figZ);
    }

    // Licht: Flutlicht geht an, sobald die Figur aus dem Tunnel tritt.
    const emerged = phase === 'walk' ? ease((figZ - (MOUTH_Z - 1.5)) / 3) : 1;
    const key = cur.key * (phase === 'walk' ? Math.max(from.key, emerged) : 1);
    const pulse = 0.72 + 0.28 * Math.sin(clock * 2.3);
    ambient.intensity = 0.05 + 0.55 * key;
    keyLight.intensity = 2.6 * key;
    fillLight.intensity = 0.9 * key;
    tunnelLight.intensity = 120 * cur.glow * pulse;
    ledMat.color.copy(accent).multiplyScalar(0.12 + 0.88 * cur.glow * pulse);
    bandMat.color.copy(accent).multiplyScalar(0.08 + 0.75 * key);
    wallMat.color.copy(accent).lerp(tmp.set('#ffffff'), 0.55).multiplyScalar(cur.glow);
    tunnelGlow.m.opacity = 0.9 * cur.glow;
    mouthGlow.m.opacity = 0.2 * cur.glow * pulse;
    crowdMat.color.setScalar(0.04 + 0.9 * key);
    floods.forEach((f) => { f.m.opacity = 0.95 * key; });
    beamMat.opacity = 0.075 * key;
    ringMat.opacity = 0.75 * key * (0.7 + 0.3 * pulse);
    beams.forEach((b) => { b.mesh.quaternion.copy(b.base); b.mesh.rotateZ(Math.sin(clock * 0.45 + b.side) * 0.05); });
    carpetMat.emissive.copy(accent2).multiplyScalar(0.05 + 0.1 * key);

    // Partikel
    if (fxRnd() < dt * 14 * cur.glow) {
      dust.spawn((fxRnd() - 0.5) * TUNNEL_W, fxRnd() * TUNNEL_H, MOUTH_Z - fxRnd() * 9, (fxRnd() - 0.5) * 0.2, 0.05, 0.25 + fxRnd() * 0.3, 2.4, tmp.copy(accent).multiplyScalar(0.5));
    }
    if (spec?.legend && key > 0.4 && fxRnd() < dt * 40) {
      const a = fxRnd() * Math.PI * 2; const r = 0.5 + fxRnd() * 1.6;
      dust.spawn(Math.cos(a) * r, fxRnd() * 0.4, MARK_Z + Math.sin(a) * r * 0.6, 0, 0.5 + fxRnd() * 0.5, 0, 2.2, tmp.copy(accent2));
    }
    if (sparkLeft > 0 && emerged > 0.05) {
      sparkLeft -= dt;
      [-1, 1].forEach((side) => {
        for (let i = 0; i < 3; i++) {
          sparks.spawn(side * (TUNNEL_W / 2 + 0.5), 0.1, MOUTH_Z + 0.5, (fxRnd() - 0.5) * 1.2, 5 + fxRnd() * 3.5, (fxRnd() - 0.5) * 1.2, 0.7 + fxRnd() * 0.5, tmp.copy(accent2));
        }
      });
    }
    // Konfetti: kräftiger Schauer zum Auftakt, danach rieselt es ruhig weiter.
    const drizzle = spec?.elite === true && phase === 'card' && confettiLeft <= 0 && fxRnd() < dt * 22;
    if (confettiLeft > 0 || drizzle) {
      confettiLeft -= dt;
      const tones = [accent, accent2, tmp.set('#ffffff')];
      for (let i = 0; i < (drizzle ? 1 : 4); i++) {
        confetti.spawn(cur.lx + (fxRnd() - 0.5) * 6, 4.4 + fxRnd(), MARK_Z + (fxRnd() - 0.5) * 3, (fxRnd() - 0.5) * 1.4, -0.4, (fxRnd() - 0.5) * 1.4, 3.2, tones[i % tones.length] ?? accent);
      }
    }
    if (spec?.elite && (phase === 'name' || phase === 'card')) {
      nextFirework -= dt;
      if (nextFirework <= 0) { burstFirework(); nextFirework = 1.25 + fxRnd() * 0.5; }
    }
    [sparks, dust, confetti, fireworks].forEach((e) => e.update(dt));

    camera.position.set(cur.cx, cur.cy, cur.cz);
    camera.lookAt(cur.lx, cur.ly, cur.lz);
    renderer.render(scene, camera);
  };

  const loop = (now: number): void => {
    if (disposed) return;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    update(dt);
    frame = requestAnimationFrame(loop);
  };
  frame = requestAnimationFrame(loop);

  const resize = (width: number, height: number): void => {
    if (width <= 0 || height <= 0) return;
    aspect = width / height;
    renderer.setSize(width, height, false);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (phase === 'card') to = holdView();
  };

  const dispose = (): void => {
    disposed = true;
    cancelAnimationFrame(frame);
    avatar?.dispose();
    [sparks, dust, confetti, fireworks].forEach((e) => e.dispose());
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    renderer.dispose();
  };

  return { start, setPhase, resize, dispose };
};
