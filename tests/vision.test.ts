import { describe, expect, it } from 'vitest';
import {
  castCompoundEye,
  rayCircleDistance,
  VISION_RANGE,
  type SensorWorld,
} from '../src/game/vision.ts';

const world = (overrides: Partial<SensorWorld> = {}): SensorWorld => ({
  flyX: 0,
  flyZ: 0,
  heading: 0,
  arenaRadius: 18,
  entities: [],
  ...overrides,
});

describe('compound-eye ray geometry', () => {
  it('computes nearest ray-circle intersections', () => {
    expect(rayCircleDistance(0, 0, 0, 1, 0, 5, 1)).toBe(4);
    expect(rayCircleDistance(0, 0, 0, 1, 3, 5, 1)).toBeNull();
    expect(rayCircleDistance(0, 0, 0, 1, 0, 0, 1)).toBe(1);
  });

  it('sees an obstacle on the right side of the eye', () => {
    const frame = castCompoundEye(world({
      entities: [{ x: 3, z: 6, radius: 1, kind: 'obstacle' }],
    }));
    const obstacleRays = frame.rays.filter((ray) => ray.hit === 'obstacle');
    expect(obstacleRays.length).toBeGreaterThan(0);
    expect(frame.rays.findIndex((ray) => ray.hit === 'obstacle')).toBeGreaterThanOrEqual(12);
    expect(obstacleRays.every((ray) => ray.distance < VISION_RANGE)).toBe(true);
    expect(frame.rays.slice(0, 10).every((ray) => ray.hit === 'none' && ray.distance === VISION_RANGE)).toBe(true);
  });

  it('reports positive looming only where an obstacle approaches', () => {
    const previous = castCompoundEye(world({
      entities: [{ x: 3, z: 8, radius: 1, kind: 'obstacle' }],
    }));
    const current = castCompoundEye(world({
      entities: [{ x: 3, z: 6, radius: 1, kind: 'obstacle' }],
    }), previous);
    const hitIndices = current.rays.flatMap((ray, index) => ray.hit === 'obstacle' ? [index] : []);
    expect(hitIndices.length).toBeGreaterThan(0);
    expect(hitIndices.some((index) => (current.looming[index] ?? 0) > 0)).toBe(true);
    expect(current.looming.filter((value) => value > 0).length).toBeLessThanOrEqual(hitIndices.length);
  });

  it('sees the wall at approximately one unit when facing outward', () => {
    const frame = castCompoundEye(world({ flyX: 17, heading: Math.PI / 2 }));
    const frontal = frame.rays[11];
    expect(frontal?.hit).toBe('wall');
    expect(frontal?.distance).toBeCloseTo(1, 1);
    expect(frame.intensity[11]).toBeCloseTo(0.89, 1);
  });

  it('is deterministic for identical inputs', () => {
    const input = world({
      entities: [
        { x: 3, z: 6, radius: 1, kind: 'obstacle' },
        { x: -2, z: 4, radius: 0.5, kind: 'enemy', active: true },
      ],
    });
    expect(castCompoundEye(input)).toEqual(castCompoundEye(input));
  });
});
