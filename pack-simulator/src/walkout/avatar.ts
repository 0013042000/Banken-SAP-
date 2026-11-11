import {
  BoxGeometry, CanvasTexture, CapsuleGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, PlaneGeometry,
  SphereGeometry, SRGBColorSpace, TorusGeometry, type BufferGeometry, type Material, type Texture,
} from 'three';
import type { Build, HairStyle, Kit, Look } from '../data/looks';
import type { Pose } from './pose';

export interface AvatarSpec {
  readonly look: Look;
  readonly kit: Kit;
  readonly number: string;
  readonly keeper: boolean;
}

export interface Avatar {
  readonly root: Group;
  /** Wendet eine Pose an (Gelenkwinkel, Sprunghöhe, Drehung). */
  readonly apply: (pose: Pose) => void;
  readonly dispose: () => void;
}

// Maße in Metern, bezogen auf eine 1,80 m große Figur.
const THIGH = 0.45;
const SHIN = 0.43;
const FOOT_H = 0.07;
const HIP_Y = THIGH + SHIN + FOOT_H * 0.5;
const TORSO = 0.56;
const HEAD_R = 0.15;
const UPPER_ARM = 0.28;
const FOREARM = 0.26;
const MODEL_HEIGHT = HIP_Y + TORSO + 0.07 + HEAD_R * 2.05;
const TARGET_HEIGHT = 1.8;

const BUILD_WIDTH: Readonly<Record<Build, number>> = { schlank: 0.9, normal: 1, kraeftig: 1.14 };
const BOOT_COLORS = ['#f2f2f2', '#16181d', '#ff5a36', '#c7ff3d', '#38d6ff'] as const;
const GLOVE = '#f4f4f4';

const luminance = (hex: string): number => {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
};

/** Trikot-Textur: Grundfarbe mit optionalem Muster (eigene Entwürfe). */
const shirtTexture = (kit: Kit): Texture | null => {
  if (!kit.pattern || !kit.patternColor) return null;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  if (!g) return null;
  g.fillStyle = kit.shirt; g.fillRect(0, 0, size, size);
  g.fillStyle = kit.patternColor;
  if (kit.pattern === 'streifen') { for (let i = 0; i < 8; i += 2) g.fillRect((i * size) / 8, 0, size / 8, size); }
  if (kit.pattern === 'karo') { for (let y = 0; y < 8; y++) for (let x = y % 2; x < 8; x += 2) g.fillRect((x * size) / 8, (y * size) / 8, size / 8, size / 8); }
  if (kit.pattern === 'balken') g.fillRect(0, size * 0.3, size, size * 0.22);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
};

const numberTexture = (text: string, color: string): Texture | null => {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  if (!g) return null;
  g.clearRect(0, 0, size, size);
  g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 ${text.length > 1 ? 78 : 96}px system-ui, sans-serif`;
  g.fillText(text, size / 2, size / 2 + 4);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
};

export const createAvatar = (spec: AvatarSpec): Avatar => {
  const { look, kit } = spec;
  const w = BUILD_WIDTH[look.build];
  const geometries: BufferGeometry[] = [];
  const materials: Material[] = [];
  const textures: Texture[] = [];

  const mat = (color: string): MeshLambertMaterial => { const m = new MeshLambertMaterial({ color }); materials.push(m); return m; };
  const geo = <T extends BufferGeometry>(g: T): T => { geometries.push(g); return g; };
  const mesh = (g: BufferGeometry, m: Material, x = 0, y = 0, z = 0): Mesh => { const o = new Mesh(g, m); o.position.set(x, y, z); return o; };

  const skin = mat(look.skin);
  const shirtMap = shirtTexture(kit);
  if (shirtMap) textures.push(shirtMap);
  const shirt = new MeshLambertMaterial(shirtMap ? { map: shirtMap } : { color: kit.shirt });
  materials.push(shirt);
  const sleeve = mat(kit.shirt);
  const trim = mat(kit.trim);
  const shorts = mat(kit.shorts);
  const socks = mat(kit.socks);
  const hair = mat(look.hairColor);
  const dark = mat('#16110d');
  const bootIndex = [...spec.number + look.hairColor].reduce((a, ch) => a + ch.charCodeAt(0), 0) % BOOT_COLORS.length;
  const boots = mat(BOOT_COLORS[bootIndex] ?? BOOT_COLORS[0]);
  const hands = spec.keeper ? mat(GLOVE) : skin;

  const root = new Group();
  const body = new Group(); // Sprunghöhe und Drehung wirken hier, damit root die Position auf dem Rasen bleibt
  root.add(body);
  const hips = new Group();
  hips.position.y = HIP_Y;
  body.add(hips);

  // Hose
  const shortsMesh = mesh(geo(new CylinderGeometry(0.19 * w, 0.205 * w, 0.26, 14)), shorts, 0, -0.07, 0);
  shortsMesh.scale.z = 0.74;
  hips.add(shortsMesh);

  // Oberkörper
  const spine = new Group();
  spine.position.y = 0.02;
  hips.add(spine);
  const shoulderW = 0.215 * w;
  const torso = mesh(geo(new CylinderGeometry(shoulderW, shoulderW * 0.82, TORSO, 16)), shirt, 0, TORSO / 2, 0);
  torso.scale.z = 0.6;
  spine.add(torso);
  const collar = mesh(geo(new TorusGeometry(0.075, 0.018, 6, 14)), trim, 0, TORSO + 0.005, 0);
  collar.rotation.x = Math.PI / 2;
  spine.add(collar);
  const numberColor = luminance(kit.shirt) > 0.6 ? '#141414' : '#ffffff';
  const numTex = numberTexture(spec.number, numberColor);
  if (numTex) {
    textures.push(numTex);
    const numMat = new MeshBasicMaterial({ map: numTex, transparent: true, depthWrite: false });
    materials.push(numMat);
    const depth = shoulderW * 0.6 * 0.93;
    const front = mesh(geo(new PlaneGeometry(0.15, 0.15)), numMat, 0.07 * w, TORSO * 0.7, depth + 0.004);
    const backPlane = mesh(geo(new PlaneGeometry(0.26, 0.26)), numMat, 0, TORSO * 0.58, -depth - 0.004);
    backPlane.rotation.y = Math.PI;
    spine.add(front, backPlane);
  }
  spine.add(mesh(geo(new CylinderGeometry(0.05, 0.058, 0.09, 10)), skin, 0, TORSO + 0.035, 0));

  // Kopf
  const head = new Group();
  head.position.y = TORSO + 0.07 + HEAD_R * 0.95;
  spine.add(head);
  const skull = mesh(geo(new SphereGeometry(HEAD_R, 20, 16)), skin);
  skull.scale.set(0.94, 1.08, 1);
  head.add(skull);
  const eyeGeo = geo(new SphereGeometry(0.017, 8, 8));
  head.add(mesh(eyeGeo, dark, 0.052, 0.015, HEAD_R * 0.93), mesh(eyeGeo, dark, -0.052, 0.015, HEAD_R * 0.93));
  head.add(mesh(geo(new SphereGeometry(0.02, 8, 8)), skin, 0, -0.022, HEAD_R * 0.99));
  const earGeo = geo(new SphereGeometry(0.03, 8, 8));
  head.add(mesh(earGeo, skin, HEAD_R * 0.92, 0, 0), mesh(earGeo, skin, -HEAD_R * 0.92, 0, 0));
  if (look.beard) {
    const beard = mesh(geo(new SphereGeometry(HEAD_R * 1.03, 16, 10, 0, Math.PI * 2, Math.PI * 0.6, Math.PI * 0.4)), hair, 0, 0.005, 0.012);
    beard.scale.set(0.94, 1.08, 1);
    head.add(beard);
  }
  if (look.headband) {
    const band = mesh(geo(new TorusGeometry(HEAD_R * 0.98, 0.014, 6, 20)), mat('#f4f4f4'), 0, 0.075, -0.01);
    band.rotation.x = Math.PI / 2 - 0.2;
    head.add(band);
  }
  addHair(head, look.hair, hair, geo, mesh);

  // Arme
  const arm = (side: 1 | -1): { shoulder: Group; elbow: Group } => {
    const shoulder = new Group();
    shoulder.position.set(side * (shoulderW + 0.012), TORSO - 0.055, 0);
    spine.add(shoulder);
    shoulder.add(mesh(geo(new SphereGeometry(0.066 * w, 10, 8)), sleeve));
    shoulder.add(mesh(geo(new CapsuleGeometry(0.058 * w, 0.1, 4, 8)), sleeve, 0, -0.09, 0));
    shoulder.add(mesh(geo(new CapsuleGeometry(0.046 * w, UPPER_ARM - 0.17, 4, 8)), spec.keeper ? sleeve : skin, 0, -0.2, 0));
    const elbow = new Group();
    elbow.position.y = -UPPER_ARM;
    shoulder.add(elbow);
    elbow.add(mesh(geo(new CapsuleGeometry(0.041 * w, FOREARM - 0.1, 4, 8)), spec.keeper ? sleeve : skin, 0, -FOREARM / 2 + 0.01, 0));
    elbow.add(mesh(geo(new SphereGeometry(spec.keeper ? 0.062 : 0.048, 10, 8)), hands, 0, -FOREARM, 0));
    return { shoulder, elbow };
  };
  const armL = arm(1);
  const armR = arm(-1);

  // Beine
  const leg = (side: 1 | -1): { hip: Group; knee: Group } => {
    const hip = new Group();
    hip.position.set(side * 0.095 * w, 0, 0);
    hips.add(hip);
    hip.add(mesh(geo(new CapsuleGeometry(0.078 * w, THIGH - 0.16, 4, 10)), skin, 0, -THIGH / 2, 0));
    const knee = new Group();
    knee.position.y = -THIGH;
    hip.add(knee);
    knee.add(mesh(geo(new CapsuleGeometry(0.058 * w, SHIN - 0.14, 4, 10)), socks, 0, -SHIN / 2 + 0.02, 0));
    knee.add(mesh(geo(new BoxGeometry(0.095, FOOT_H, 0.25)), boots, 0, -SHIN, 0.055));
    return { hip, knee };
  };
  const legL = leg(1);
  const legR = leg(-1);

  root.scale.setScalar((TARGET_HEIGHT / MODEL_HEIGHT) * look.height);

  const apply = (p: Pose): void => {
    body.position.set(0, p.rootY, p.slideZ);
    body.rotation.y = p.rootRotY;
    spine.rotation.set(p.spineX, p.spineY, p.spineZ);
    head.rotation.set(p.headX, p.headY, 0);
    armL.shoulder.rotation.set(p.shLx, 0, p.shLz);
    armR.shoulder.rotation.set(p.shRx, 0, -p.shRz);
    armL.elbow.rotation.x = -p.elL;
    armR.elbow.rotation.x = -p.elR;
    legL.hip.rotation.set(p.hipLx, 0, p.hipLz);
    legR.hip.rotation.set(p.hipRx, 0, -p.hipRz);
    legL.knee.rotation.x = p.knL;
    legR.knee.rotation.x = p.knR;
  };

  const dispose = (): void => {
    geometries.forEach((g) => g.dispose());
    materials.forEach((m) => m.dispose());
    textures.forEach((t) => t.dispose());
    root.removeFromParent();
  };

  return { root, apply, dispose };
};

type MeshFn = (g: BufferGeometry, m: Material, x?: number, y?: number, z?: number) => Mesh;
type GeoFn = <T extends BufferGeometry>(g: T) => T;

/** Frisuren als einfache, klar unterscheidbare Formen. */
const addHair = (head: Group, style: HairStyle, hair: Material, geo: GeoFn, mesh: MeshFn): void => {
  if (style === 'glatze') return;
  const cap = (scale: number, tilt = -0.32): Mesh => {
    const m = mesh(geo(new SphereGeometry(HEAD_R * scale, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.52)), hair, 0, 0.012, -0.006);
    m.scale.set(0.95, 1.08, 1.01);
    m.rotation.x = tilt;
    return m;
  };
  const CAP_SCALE: Readonly<Record<Exclude<HairStyle, 'glatze'>, number>> = {
    stoppel: 1.02, kurz: 1.07, mittel: 1.13, lang: 1.1, locken: 1.08, dreads: 1.08, zopf: 1.06, tolle: 1.07,
  };
  head.add(cap(CAP_SCALE[style]));
  if (style === 'mittel') head.add(mesh(geo(new SphereGeometry(HEAD_R * 0.98, 14, 10)), hair, 0, -0.03, -0.055));
  if (style === 'lang') {
    const curtain = mesh(geo(new CapsuleGeometry(0.115, 0.2, 4, 10)), hair, 0, -0.12, -0.075);
    curtain.scale.z = 0.55;
    head.add(curtain);
  }
  if (style === 'locken') {
    const afro = mesh(geo(new SphereGeometry(HEAD_R * 1.34, 16, 12)), hair, 0, 0.065, -0.07);
    afro.scale.z = 0.9;
    head.add(afro);
  }
  if (style === 'dreads') {
    const strand = geo(new CapsuleGeometry(0.018, 0.2, 3, 6));
    Array.from({ length: 11 }, (_, i) => Math.PI * (0.12 + (i / 10) * 0.76)).forEach((a) => {
      const s = mesh(strand, hair, Math.cos(a) * HEAD_R * 0.98, -0.07, -Math.sin(a) * HEAD_R * 0.98);
      s.rotation.z = Math.cos(a) * -0.18;
      head.add(s);
    });
  }
  if (style === 'zopf') head.add(mesh(geo(new SphereGeometry(0.062, 10, 8)), hair, 0, 0.1, -0.15));
  if (style === 'tolle') {
    const quiff = mesh(geo(new BoxGeometry(0.2, 0.06, 0.13)), hair, 0, 0.158, 0.035);
    quiff.rotation.x = -0.25;
    head.add(quiff);
  }
};
