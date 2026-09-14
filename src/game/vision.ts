import { clamp, signedAngleDifference } from '../core/rng.ts';

export type RayHit = 'none' | 'wall' | 'obstacle' | 'enemy';

export interface VisionRay {
  angle: number;
  distance: number;
  hit: RayHit;
}

export interface VisionFrame {
  rays: VisionRay[];
  intensity: number[];
  looming: number[];
  range: number;
}

export interface VisionEntity {
  x: number;
  z: number;
  radius: number;
  kind: 'obstacle' | 'enemy' | 'food' | 'projectile';
  active?: boolean;
}

export interface SensorWorld {
  flyX: number;
  flyZ: number;
  heading: number;
  arenaRadius: number;
  entities: readonly VisionEntity[];
}

export const OMMATIDIA = 24;
export const VISION_FOV = Math.PI * (4 / 3);
export const VISION_RANGE = 9;

/** Return the nearest positive intersection distance, or null for a miss. */
export function rayCircleDistance(
  ox: number,
  oz: number,
  dx: number,
  dz: number,
  cx: number,
  cz: number,
  radius: number,
): number | null {
  const rx = ox - cx;
  const rz = oz - cz;
  const b = rx * dx + rz * dz;
  const c = rx * rx + rz * rz - radius * radius;
  const discriminant = b * b - c;
  if (discriminant < 0) return null;
  const root = Math.sqrt(discriminant);
  const near = -b - root;
  const far = -b + root;
  if (near > 1e-6) return near;
  if (far > 1e-6) return far;
  return null;
}

export function castCompoundEye(world: SensorWorld, previous?: VisionFrame): VisionFrame {
  const rays: VisionRay[] = [];
  const intensity: number[] = [];
  const looming: number[] = [];
  const halfFov = VISION_FOV / 2;
  const step = VISION_FOV / OMMATIDIA;

  for (let index = 0; index < OMMATIDIA; index += 1) {
    const angle = -halfFov + step * (index + 0.5);
    const worldAngle = world.heading + angle;
    const dx = Math.sin(worldAngle);
    const dz = Math.cos(worldAngle);
    let distance = VISION_RANGE;
    let hit: RayHit = 'none';

    const wallDistance = rayCircleDistance(
      world.flyX,
      world.flyZ,
      dx,
      dz,
      0,
      0,
      world.arenaRadius,
    );
    if (wallDistance !== null && wallDistance < distance) {
      distance = wallDistance;
      hit = 'wall';
    }

    for (const entity of world.entities) {
      if (entity.active === false || (entity.kind !== 'obstacle' && entity.kind !== 'enemy')) {
        continue;
      }
      const entityDistance = rayCircleDistance(
        world.flyX,
        world.flyZ,
        dx,
        dz,
        entity.x,
        entity.z,
        entity.radius,
      );
      if (entityDistance !== null && entityDistance < distance) {
        distance = entityDistance;
        hit = entity.kind;
      }
    }

    const currentIntensity = clamp(1 - distance / VISION_RANGE, 0, 1);
    const previousIntensity = previous?.intensity[index] ?? 0;
    rays.push({ angle, distance, hit });
    intensity.push(currentIntensity);
    looming.push(previous ? clamp((currentIntensity - previousIntensity) * 12, 0, 1) : 0);
  }

  return { rays, intensity, looming, range: VISION_RANGE };
}

/** Convert a ray angle into the same signed-angle convention used by sensors. */
export function relativeRayAngle(worldAngle: number, heading: number): number {
  return signedAngleDifference(worldAngle, heading);
}
