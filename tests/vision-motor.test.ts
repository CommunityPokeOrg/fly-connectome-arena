import { describe, expect, it } from 'vitest';
import { FlyBrain, summarizeClearance } from '../src/brain/fly-brain.ts';
import { readSensors, type SensorReadings } from '../src/game/sensors.ts';
import { OMMATIDIA, VISION_FOV, VISION_RANGE, type VisionFrame } from '../src/game/vision.ts';

/** Build a synthetic compound-eye frame from a per-ray distance function. */
function frame(distanceAt: (angle: number) => number): VisionFrame {
  const step = VISION_FOV / OMMATIDIA;
  const rays = Array.from({ length: OMMATIDIA }, (_, index) => {
    const angle = -VISION_FOV / 2 + step * (index + 0.5);
    const distance = Math.min(VISION_RANGE, distanceAt(angle));
    return { angle, distance, hit: distance < VISION_RANGE ? ('wall' as const) : ('none' as const) };
  });
  return {
    rays,
    intensity: rays.map((ray) => 1 - ray.distance / VISION_RANGE),
    looming: rays.map(() => 0),
    range: VISION_RANGE,
  };
}

function readingsFrom(vision: VisionFrame): SensorReadings {
  return {
    visual: vision.intensity,
    looming: vision.looming,
    vision,
    target: new Array(12).fill(0),
    olfactory: new Array(16).fill(0),
    threat: new Array(8).fill(0),
    nearestEnemyAngle: 0,
    nearestFoodAngle: 0,
  };
}

function settle(brain: FlyBrain, readings: SensorReadings, frames = 120) {
  let command = brain.step(readings, { heading: 0, steps: 16 });
  for (let step = 0; step < frames; step += 1) {
    command = brain.step(readings, { heading: 0, steps: 16 });
  }
  return command;
}

describe('summarizeClearance', () => {
  it('reports full clearance when no ray hits anything', () => {
    const field = summarizeClearance(frame(() => VISION_RANGE));
    expect(field).toEqual({ frontal: 1, left: 1, right: 1, openness: 0 });
  });

  it('detects a wall on the left as openness toward the right', () => {
    const field = summarizeClearance(frame((angle) => (angle < 0 ? 2 : VISION_RANGE)));
    expect(field.left).toBeLessThan(0.4);
    expect(field.right).toBe(1);
    expect(field.openness).toBeGreaterThan(0.5);
  });

  it('measures frontal clearance from the nearest central ray', () => {
    const field = summarizeClearance(frame((angle) => (Math.abs(angle) < 0.1 ? 1.8 : VISION_RANGE)));
    expect(field.frontal).toBeCloseTo(0.2, 5);
    expect(Math.abs(field.openness)).toBeLessThan(1e-6);
  });

  it('matches the raycaster for a real off-centre pillar', () => {
    const readings = readSensors({
      flyX: 0,
      flyZ: 0,
      heading: 0,
      arenaRadius: 40,
      entities: [{ x: -2.5, z: 4, radius: 1.4, kind: 'obstacle' }],
    });
    const field = summarizeClearance(readings.vision);
    expect(field.left).toBeLessThan(field.right);
    expect(field.openness).toBeGreaterThan(0.1);
  });
});

describe('raycast-to-motor integration', () => {
  it('steers toward the open side when a wall fills the left visual field', () => {
    const brain = new FlyBrain(7);
    const command = settle(brain, readingsFrom(frame((angle) => (angle < 0 ? 2.5 : VISION_RANGE))));
    expect(command.turn).toBeGreaterThan(0.2);
    expect(command.clearance.openness).toBeGreaterThan(0.3);
  });

  it('steers toward the open side when a wall fills the right visual field', () => {
    const brain = new FlyBrain(7);
    const command = settle(brain, readingsFrom(frame((angle) => (angle > 0 ? 2.5 : VISION_RANGE))));
    expect(command.turn).toBeLessThan(-0.2);
  });

  it('brakes and commits to a turn when a wall is dead ahead, cruises when clear', () => {
    const clearBrain = new FlyBrain(7);
    const clear = settle(clearBrain, readingsFrom(frame(() => VISION_RANGE)));
    const blockedBrain = new FlyBrain(7);
    const blocked = settle(
      blockedBrain,
      readingsFrom(frame((angle) => (Math.abs(angle) < 0.6 ? 1.2 : VISION_RANGE))),
    );
    expect(clear.thrust).toBeGreaterThan(0.6);
    expect(Math.abs(clear.turn)).toBeLessThan(0.2);
    expect(blocked.brakeRate).toBeGreaterThan(clear.brakeRate);
    expect(blocked.thrust).toBeLessThan(clear.thrust);
    expect(Math.abs(blocked.turn)).toBeGreaterThan(0.25);
  });

  it('turns away from a real pillar seen by the compound eye before touching it', () => {
    const brain = new FlyBrain(11);
    const readings = readSensors({
      flyX: 0,
      flyZ: 0,
      heading: 0,
      arenaRadius: 40,
      entities: [{ x: 1.2, z: 4.5, radius: 1.3, kind: 'obstacle' }],
    });
    const command = settle(brain, readings, 90);
    expect(command.turn).toBeLessThan(-0.15);
  });

  it('is deterministic for identical visual input', () => {
    const readings = readingsFrom(frame((angle) => (angle < -0.3 ? 3 : VISION_RANGE)));
    const a = settle(new FlyBrain(5), readings, 60);
    const b = settle(new FlyBrain(5), readings, 60);
    expect(a).toEqual(b);
  });
});
