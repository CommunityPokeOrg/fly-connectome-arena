import { clamp, signedAngleDifference, wrap } from '../core/rng.ts';
import {
  castCompoundEye,
  type SensorWorld,
  type VisionFrame,
} from './vision.ts';

export type { SensorWorld } from './vision.ts';

export interface SensorEntity {
  x: number;
  z: number;
  radius: number;
  kind: 'obstacle' | 'enemy' | 'food' | 'projectile';
  active?: boolean;
}

export interface SensorReadings {
  visual: number[];
  looming: number[];
  vision: VisionFrame;
  target: number[];
  olfactory: number[];
  threat: number[];
  nearestEnemyAngle: number;
  nearestFoodAngle: number;
}

interface BinConfig {
  count: number;
  start: number;
  end: number;
  range: number;
}

function sampleBins(
  world: SensorWorld,
  config: BinConfig,
  filter: (entity: SensorEntity) => boolean,
): number[] {
  const result = Array.from({ length: config.count }, () => 0);
  const nearest = Array.from({ length: config.count }, () => Number.POSITIVE_INFINITY);
  for (const entity of world.entities) {
    if (entity.active === false || !filter(entity)) {
      continue;
    }
    const dx = entity.x - world.flyX;
    const dz = entity.z - world.flyZ;
    const distance = Math.max(0.05, Math.hypot(dx, dz) - entity.radius);
    const relative = signedAngleDifference(Math.atan2(dx, dz), world.heading);
    if (relative < config.start || relative > config.end || distance > config.range) {
      continue;
    }
    const bin = clamp(
      Math.floor(((relative - config.start) / (config.end - config.start)) * config.count),
      0,
      config.count - 1,
    );
    nearest[bin] = Math.min(nearest[bin] ?? Number.POSITIVE_INFINITY, distance);
  }
  for (let index = 0; index < result.length; index += 1) {
    const distance = nearest[index] ?? Number.POSITIVE_INFINITY;
    result[index] = Number.isFinite(distance) ? clamp(1 - distance / config.range, 0, 1) : 0;
  }
  return result;
}

function nearestAngle(
  world: SensorWorld,
  filter: (entity: SensorEntity) => boolean,
): number {
  let bestDistance = Number.POSITIVE_INFINITY;
  let bestAngle = 0;
  for (const entity of world.entities) {
    if (entity.active === false || !filter(entity)) {
      continue;
    }
    const dx = entity.x - world.flyX;
    const dz = entity.z - world.flyZ;
    const distance = Math.hypot(dx, dz);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestAngle = signedAngleDifference(Math.atan2(dx, dz), world.heading);
    }
  }
  return bestAngle;
}

export function readSensors(world: SensorWorld, previousVision?: VisionFrame): SensorReadings {
  const vision = castCompoundEye(world, previousVision);
  return {
    visual: vision.intensity,
    looming: vision.looming,
    vision,
    target: sampleBins(
      world,
      { count: 12, start: -Math.PI / 2, end: Math.PI / 2, range: 15 },
      (entity) => entity.kind === 'enemy',
    ),
    olfactory: sampleBins(
      world,
      { count: 16, start: -Math.PI, end: Math.PI, range: 18 },
      (entity) => entity.kind === 'food',
    ),
    threat: sampleBins(
      world,
      { count: 8, start: -Math.PI, end: Math.PI, range: 12 },
      (entity) => entity.kind === 'projectile',
    ),
    nearestEnemyAngle: nearestAngle(world, (entity) => entity.kind === 'enemy'),
    nearestFoodAngle: nearestAngle(world, (entity) => entity.kind === 'food'),
  };
}

export function sensorDirection(index: number, count: number, start: number, end: number): number {
  const width = (end - start) / count;
  return wrap(start + (index + 0.5) * width, -Math.PI, Math.PI);
}
