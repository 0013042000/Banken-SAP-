/**
 * Zeichnet das Spiel in der Draufsicht auf ein Canvas. Kennt nur Bilder (Frame), nicht die Simulation.
 * Auf schmalen Bildschirmen folgt die Kamera dem Ball, damit die Figuren groß genug bleiben.
 */
import {
  BALL_R, BOX_DEPTH, BOX_HALF, CENTER, CENTER_R, GOAL_DEPTH, GOAL_Y0, GOAL_Y1, HALF, NONE, PITCH_H, PITCH_W, PLAYER_R,
  isKeeper, teamOf, vec, type Frame, type TeamId, type Vec,
} from './sim/index.ts';

export interface RenderView {
  /** Blick um 180° gedreht, damit die eigene Mannschaft immer nach rechts spielt. */
  readonly flip: boolean;
  readonly myTeam: TeamId;
  /** Kurznamen der zehn Spieler in Spielerreihenfolge. */
  readonly names: readonly string[];
  /** Haut- und Haarfarbe der zehn Spieler (stilisierte Avatare), damit man die eigenen Karten wiedererkennt. */
  readonly looks?: readonly PlayerLook[];
}

export interface PlayerLook {
  readonly skin: string;
  readonly hair: string;
  readonly bald: boolean;
}

export interface Renderer {
  /** Passt die Zeichenfläche an die sichtbare Größe an (CSS-Pixel). */
  readonly resize: (width: number, height: number) => void;
  readonly draw: (frame: Frame, view: RenderView) => void;
}

const MAX_PIXEL_RATIO = 2;
/** Rand um das Feld (für Tore und Auslauf), in Feld-Einheiten. */
const GOAL_MARGIN = 1.4;
const MARGIN_X = GOAL_DEPTH + GOAL_MARGIN;
const MARGIN_Y = 2.2;
const WORLD_W = PITCH_W + MARGIN_X + MARGIN_X;
const WORLD_H = PITCH_H + MARGIN_Y + MARGIN_Y;
/** Kleinster Maßstab (Pixel pro Einheit); darunter zoomt die Kamera auf den Ball. */
const MIN_SCALE = 4.6;
const CAMERA_EASE = 0.12;
const CAMERA_SNAP = 30;
const STRIPES = 10;
const LINE_WIDTH = 0.28;
const SPOT_R = 0.5;
const FULL_TURN = Math.PI + Math.PI;
const PLAYER_DRAW = 1.45;
const PLAYER_MIN_PX = 7.5;
const BALL_DRAW = 1.35;
const BALL_MIN_PX = 3.4;
const BALL_LIFT = 0.7;
const BALL_GROW = 0.12;
const SHADOW_SHIFT = 0.35;
const SHADOW_SQUASH = 0.55;
// Figur von oben: Schultern quer zur Blickrichtung, Kopf darüber, Füße im Wechselschritt.
const SHOULDER_LONG = 1.08;
const SHOULDER_SHORT = 0.62;
const HEAD_R = 0.56;
const HEAD_SHIFT = 0.1;
const HAIR_SHIFT = 0.18;
const HAIR_R = 0.5;
const FOOT_SIDE = 0.48;
const FOOT_REACH = 0.62;
const FOOT_R = 0.3;
const STEP_RATE = 1.5;
const DEFAULT_LOOK: PlayerLook = { skin: '#e9bf9d', hair: '#2b1d14', bald: false };
const BOOT = '#10131c';
const RING_GAP = 1.5;
const RING_WIDTH = 2.5;
const MARKER_RISE = 2.3;
const MARKER_SIZE = 0.75;
const NAME_SIZE = 1.9;
const NAME_MIN_PX = 10;
const NAME_MAX_PX = 15;
const NAME_GAP = 0.5;
const NAME_OUTLINE = 3;
const DAZED_ALPHA = 0.55;
const NET_STEP = 1.2;
const OUTLINE_WIDTH = 1.5;

const GRASS_A = '#17713a';
const GRASS_B = '#1a7d41';
const SURROUND = '#0b3d22';
const LINE = 'rgba(255,255,255,0.82)';
const NET = 'rgba(255,255,255,0.28)';
const GOAL_FRAME = '#f3f5fb';
const SHADOW = 'rgba(0,0,0,0.32)';
const BALL_COLOR = '#ffffff';
const BALL_EDGE = '#10131c';
const ACTIVE = '#f5c542';
const NAME_OUTLINE_COLOR = 'rgba(4,8,18,0.85)';
const OUTLINE = 'rgba(4,8,18,0.9)';

interface Kit {
  readonly body: string;
  readonly keeper: string;
  readonly name: string;
}
const MY_KIT: Kit = { body: '#38c6ff', keeper: '#a3ff6b', name: '#eafaff' };
const OPP_KIT: Kit = { body: '#ff4f7b', keeper: '#ffb347', name: '#ffe3ea' };

/** Ohne 2D-Kontext (sehr alte Browser) bleibt die Fläche leer, das Spiel läuft trotzdem. */
const NO_RENDERER: Renderer = Object.freeze({ resize: (): void => undefined, draw: (): void => undefined });

export const createRenderer = (canvas: HTMLCanvasElement): Renderer => {
  const context = canvas.getContext('2d');
  if (!context) return NO_RENDERER;
  const ctx = context;
  let width = 0;
  let height = 0;
  let ratio = 1;
  let scale = 1;
  let camera: Vec = CENTER;
  let flipped = false;

  /** Feldkoordinaten → Pixel (mit Kamera und gedrehtem Blick). */
  const toScreen = (p: Vec): Vec => {
    const world = flipped ? vec(PITCH_W - p.x, PITCH_H - p.y) : p;
    return vec((world.x - camera.x) * scale + width * HALF, (world.y - camera.y) * scale + height * HALF);
  };

  const followBall = (ball: Vec): void => {
    const world = flipped ? vec(PITCH_W - ball.x, PITCH_H - ball.y) : ball;
    const spanX = Math.max(0, (WORLD_W - width / scale) * HALF);
    const spanY = Math.max(0, (WORLD_H - height / scale) * HALF);
    const target = vec(
      Math.max(CENTER.x - spanX, Math.min(CENTER.x + spanX, world.x)),
      Math.max(CENTER.y - spanY, Math.min(CENTER.y + spanY, world.y)),
    );
    const jump = Math.hypot(target.x - camera.x, target.y - camera.y) > CAMERA_SNAP;
    const ease = jump ? 1 : CAMERA_EASE;
    camera = vec(camera.x + (target.x - camera.x) * ease, camera.y + (target.y - camera.y) * ease);
  };

  const rect = (a: Vec, b: Vec, fill: string | null): void => {
    const p = toScreen(a);
    const q = toScreen(b);
    const x = Math.min(p.x, q.x);
    const y = Math.min(p.y, q.y);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fillRect(x, y, Math.abs(q.x - p.x), Math.abs(q.y - p.y));
      return;
    }
    ctx.strokeRect(x, y, Math.abs(q.x - p.x), Math.abs(q.y - p.y));
  };

  const circle = (at: Vec, radiusPx: number): void => {
    ctx.beginPath();
    ctx.arc(at.x, at.y, radiusPx, 0, FULL_TURN);
  };

  const drawGoal = (lineX: number, depth: number): void => {
    rect(vec(lineX, GOAL_Y0), vec(lineX + depth, GOAL_Y1), NET);
    ctx.strokeStyle = NET;
    ctx.lineWidth = 1;
    const rows = Math.floor((GOAL_Y1 - GOAL_Y0) / NET_STEP);
    Array.from({ length: rows }, (_, i) => GOAL_Y0 + (i + 1) * NET_STEP).forEach((y) => {
      const from = toScreen(vec(lineX, y));
      const to = toScreen(vec(lineX + depth, y));
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    });
    ctx.strokeStyle = GOAL_FRAME;
    ctx.lineWidth = Math.max(RING_WIDTH, LINE_WIDTH * scale * RING_GAP);
    rect(vec(lineX, GOAL_Y0), vec(lineX + depth, GOAL_Y1), null);
  };

  const drawPitch = (): void => {
    ctx.fillStyle = SURROUND;
    ctx.fillRect(0, 0, width, height);
    const stripe = PITCH_W / STRIPES;
    Array.from({ length: STRIPES }, (_, i) => i).forEach((i) => {
      rect(vec(i * stripe, 0), vec((i + 1) * stripe, PITCH_H), i & 1 ? GRASS_B : GRASS_A);
    });
    ctx.strokeStyle = LINE;
    ctx.lineWidth = Math.max(1, LINE_WIDTH * scale);
    rect(vec(0, 0), vec(PITCH_W, PITCH_H), null);
    rect(vec(CENTER.x, 0), vec(CENTER.x, PITCH_H), null);
    rect(vec(0, CENTER.y - BOX_HALF), vec(BOX_DEPTH, CENTER.y + BOX_HALF), null);
    rect(vec(PITCH_W - BOX_DEPTH, CENTER.y - BOX_HALF), vec(PITCH_W, CENTER.y + BOX_HALF), null);
    circle(toScreen(CENTER), CENTER_R * scale);
    ctx.stroke();
    ctx.fillStyle = LINE;
    circle(toScreen(CENTER), SPOT_R * scale);
    ctx.fill();
    drawGoal(0, -GOAL_DEPTH);
    drawGoal(PITCH_W, GOAL_DEPTH);
  };

  const drawPlayer = (frame: Frame, view: RenderView, index: number): void => {
    const p = frame.players[index];
    const kit = teamOf(index) === view.myTeam ? MY_KIT : OPP_KIT;
    const at = toScreen(p.pos);
    const radius = Math.max(PLAYER_MIN_PX, PLAYER_R * PLAYER_DRAW * scale);
    const facing = flipped ? vec(-p.dir.x, -p.dir.y) : p.dir;
    ctx.globalAlpha = p.dazed ? DAZED_ALPHA : 1;
    ctx.fillStyle = SHADOW;
    ctx.beginPath();
    ctx.ellipse(at.x + radius * SHADOW_SHIFT, at.y + radius * SHADOW_SHIFT, radius, radius * SHADOW_SQUASH, 0, 0, FULL_TURN);
    ctx.fill();
    const look = view.looks?.[index] ?? DEFAULT_LOOK;
    const side = vec(-facing.y, facing.x);
    // Füße: wechseln mit der zurückgelegten Strecke, stehen also still, wenn die Figur steht.
    const swing = Math.sin((p.pos.x + p.pos.y) * STEP_RATE);
    ctx.fillStyle = BOOT;
    [1, -1].forEach((sign) => {
      const reach = sign * swing * FOOT_REACH;
      circle(vec(at.x + (side.x * sign * FOOT_SIDE + facing.x * reach) * radius, at.y + (side.y * sign * FOOT_SIDE + facing.y * reach) * radius), radius * FOOT_R);
      ctx.fill();
    });
    // Schultern/Trikot
    ctx.fillStyle = isKeeper(index) ? kit.keeper : kit.body;
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = OUTLINE_WIDTH;
    ctx.beginPath();
    ctx.ellipse(at.x, at.y, radius * SHOULDER_LONG, radius * SHOULDER_SHORT, Math.atan2(side.y, side.x), 0, FULL_TURN);
    ctx.fill();
    ctx.stroke();
    // Kopf mit Haaren am Hinterkopf
    const head = vec(at.x + facing.x * radius * HEAD_SHIFT, at.y + facing.y * radius * HEAD_SHIFT);
    if (!look.bald) {
      ctx.fillStyle = look.hair;
      circle(vec(head.x - facing.x * radius * HAIR_SHIFT, head.y - facing.y * radius * HAIR_SHIFT), radius * (HEAD_R + HAIR_R * HAIR_SHIFT));
      ctx.fill();
    }
    ctx.fillStyle = look.skin;
    ctx.lineWidth = 1;
    circle(vec(head.x + facing.x * radius * HAIR_SHIFT * HALF, head.y + facing.y * radius * HAIR_SHIFT * HALF), radius * HEAD_R * (look.bald ? 1 : 0.86));
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (frame.controlled[view.myTeam] !== index) return;
    ctx.strokeStyle = ACTIVE;
    ctx.lineWidth = RING_WIDTH;
    circle(at, radius + RING_GAP + RING_WIDTH);
    ctx.stroke();
    const tip = at.y - radius * MARKER_RISE;
    const half = radius * MARKER_SIZE;
    ctx.fillStyle = ACTIVE;
    ctx.beginPath();
    ctx.moveTo(at.x, tip + half);
    ctx.lineTo(at.x - half, tip - half * HALF);
    ctx.lineTo(at.x + half, tip - half * HALF);
    ctx.closePath();
    ctx.fill();
  };

  const drawName = (frame: Frame, view: RenderView, index: number): void => {
    const at = toScreen(frame.players[index].pos);
    const radius = Math.max(PLAYER_MIN_PX, PLAYER_R * PLAYER_DRAW * scale);
    const size = Math.max(NAME_MIN_PX, Math.min(NAME_MAX_PX, NAME_SIZE * scale));
    const active = frame.controlled[view.myTeam] === index;
    const y = at.y - radius - size * NAME_GAP - (active ? radius * MARKER_RISE * HALF : 0);
    ctx.font = `700 ${size}px system-ui, -apple-system, "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = NAME_OUTLINE_COLOR;
    ctx.lineWidth = NAME_OUTLINE;
    ctx.strokeText(view.names[index] ?? '', at.x, y);
    ctx.fillStyle = teamOf(index) === view.myTeam ? MY_KIT.name : OPP_KIT.name;
    ctx.fillText(view.names[index] ?? '', at.x, y);
  };

  const drawBall = (frame: Frame): void => {
    const ground = toScreen(frame.ball.pos);
    const base = Math.max(BALL_MIN_PX, BALL_R * BALL_DRAW * scale);
    const radius = base * (1 + frame.ball.z * BALL_GROW);
    ctx.fillStyle = SHADOW;
    ctx.beginPath();
    ctx.ellipse(ground.x + base * SHADOW_SHIFT, ground.y + base * SHADOW_SHIFT, base, base * SHADOW_SQUASH, 0, 0, FULL_TURN);
    ctx.fill();
    ctx.fillStyle = BALL_COLOR;
    ctx.strokeStyle = BALL_EDGE;
    ctx.lineWidth = OUTLINE_WIDTH;
    circle(vec(ground.x, ground.y - frame.ball.z * BALL_LIFT * scale), radius);
    ctx.fill();
    ctx.stroke();
  };

  return {
    resize: (cssWidth: number, cssHeight: number): void => {
      ratio = Math.min(MAX_PIXEL_RATIO, globalThis.devicePixelRatio || 1);
      width = Math.max(1, cssWidth);
      height = Math.max(1, cssHeight);
      canvas.setAttribute('width', String(Math.round(width * ratio)));
      canvas.setAttribute('height', String(Math.round(height * ratio)));
      scale = Math.max(MIN_SCALE, Math.min(width / WORLD_W, height / WORLD_H));
    },
    draw: (frame: Frame, view: RenderView): void => {
      flipped = view.flip;
      followBall(frame.ball.pos);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawPitch();
      const order = frame.players.map((_, i) => i).sort((a, b) => frame.players[a].pos.y - frame.players[b].pos.y);
      const drawOrder = flipped ? [...order].reverse() : order;
      drawOrder.forEach((i) => drawPlayer(frame, view, i));
      if (frame.ball.owner === NONE || !frame.ball.held) drawBall(frame);
      drawOrder.forEach((i) => drawName(frame, view, i));
      if (frame.ball.owner !== NONE && frame.ball.held) drawBall(frame);
    },
  };
};
