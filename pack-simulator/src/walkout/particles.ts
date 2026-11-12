import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, NormalBlending, Points, PointsMaterial } from 'three';

export interface Emitter {
  readonly points: Points;
  readonly spawn: (x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, color: Color) => void;
  readonly update: (dt: number) => void;
  readonly clear: () => void;
  readonly dispose: () => void;
}

interface EmitterOptions {
  readonly count: number;
  readonly size: number;
  readonly gravity: number;
  readonly drag: number;
  readonly additive: boolean;
}

const HIDDEN_Y = -999;

/** Kleiner, begrenzter Partikelvorrat: Funken, Goldstaub, Konfetti, Feuerwerk. */
export const createEmitter = (opt: EmitterOptions): Emitter => {
  const pos = new Float32Array(opt.count * 3).fill(HIDDEN_Y);
  const col = new Float32Array(opt.count * 3);
  const vel = new Float32Array(opt.count * 3);
  const life = new Float32Array(opt.count);
  const total = new Float32Array(opt.count);
  const base = new Float32Array(opt.count * 3);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(pos, 3));
  geometry.setAttribute('color', new BufferAttribute(col, 3));
  const material = new PointsMaterial({
    size: opt.size, vertexColors: true, transparent: true, depthWrite: false, sizeAttenuation: true,
    blending: opt.additive ? AdditiveBlending : NormalBlending,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  let cursor = 0;

  const spawn: Emitter['spawn'] = (x, y, z, vx, vy, vz, lifeSec, color) => {
    const i = cursor;
    cursor = (cursor + 1) % opt.count;
    pos.set([x, y, z], i * 3);
    vel.set([vx, vy, vz], i * 3);
    base.set([color.r, color.g, color.b], i * 3);
    col.set([color.r, color.g, color.b], i * 3);
    life[i] = lifeSec;
    total[i] = lifeSec;
  };

  const update = (dt: number): void => {
    const damp = Math.max(0, 1 - opt.drag * dt);
    for (let i = 0; i < opt.count; i++) {
      const l = life[i] ?? 0;
      if (l <= 0) continue;
      const j = i * 3;
      const left = l - dt;
      life[i] = left;
      if (left <= 0) { pos[j + 1] = HIDDEN_Y; continue; }
      vel[j] = (vel[j] ?? 0) * damp;
      vel[j + 1] = ((vel[j + 1] ?? 0) - opt.gravity * dt) * damp;
      vel[j + 2] = (vel[j + 2] ?? 0) * damp;
      pos[j] = (pos[j] ?? 0) + (vel[j] ?? 0) * dt;
      pos[j + 1] = (pos[j + 1] ?? 0) + (vel[j + 1] ?? 0) * dt;
      pos[j + 2] = (pos[j + 2] ?? 0) + (vel[j + 2] ?? 0) * dt;
      // Additive Partikel blenden über die Helligkeit aus.
      const fade = opt.additive ? Math.min(1, (left / (total[i] || 1)) * 1.6) : 1;
      col[j] = (base[j] ?? 0) * fade;
      col[j + 1] = (base[j + 1] ?? 0) * fade;
      col[j + 2] = (base[j + 2] ?? 0) * fade;
    }
    (geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (geometry.getAttribute('color') as BufferAttribute).needsUpdate = true;
  };

  const clear = (): void => { life.fill(0); pos.fill(HIDDEN_Y); (geometry.getAttribute('position') as BufferAttribute).needsUpdate = true; };
  const dispose = (): void => { geometry.dispose(); material.dispose(); points.removeFromParent(); };
  return { points, spawn, update, clear, dispose };
};
