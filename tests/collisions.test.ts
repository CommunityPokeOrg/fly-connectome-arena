import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { sphereSphere, sphereWall } from '../src/game/collisions.ts';

describe('collision helpers', () => {
  it('detects sphere overlap deterministically', () => { expect(sphereSphere(new Vector3(0, 0, 0), 1, new Vector3(1.5, 0, 0), 1)).toBe(true); expect(sphereSphere(new Vector3(0, 0, 0), 1, new Vector3(3, 0, 0), 1)).toBe(false); });
  it('clamps a sphere inside arena wall', () => { const bounded = sphereWall(new Vector3(20, 1, 0), 1, 16); expect(bounded.x).toBeCloseTo(15); expect(bounded.y).toBe(1); });
});
