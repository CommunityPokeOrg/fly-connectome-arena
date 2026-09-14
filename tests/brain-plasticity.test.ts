import { describe, expect, it } from 'vitest';
import { FlyBrain } from '../src/brain/fly-brain.ts';
import { readSensors } from '../src/game/sensors.ts';

function step(brain: FlyBrain, entities: { x: number; z: number; radius: number; kind: 'food' | 'enemy' }[]) {
  return brain.step(
    readSensors({ flyX: 0, flyZ: 0, heading: 0, arenaRadius: 18, entities }),
    { heading: 0 },
  );
}

describe('neuromodulated plasticity', () => {
  it('delivers rewards, drifts weights, stays calm without punishment', () => {
    const brain = new FlyBrain(7);
    let command = brain.command;
    for (let tick = 0; tick < 600; tick += 1) {
      command = step(brain, [{ x: 3, z: 3, radius: 0.5, kind: 'food' }]);
      if (tick % 100 === 0 && tick > 0) {
        brain.plasticity.reward('food', 1.0);
      }
    }
    const snapshot = brain.plasticity.snapshot();
    expect(snapshot.rewardsDelivered).toBe(5);
    // also drive a 6th reward then continue so eligibility traces exist
    brain.plasticity.reward('food', 1.0);
    for (let tick = 0; tick < 30; tick += 1) {
      command = step(brain, [{ x: 3, z: 3, radius: 0.5, kind: 'food' }]);
    }
    expect(brain.plasticity.snapshot().rewardsDelivered).toBe(6);
    expect(brain.plasticity.snapshot().driftFromBaseline).toBeGreaterThan(0);
    expect(command.stress).toBe(0);
  });

  it('punishment raises stress and triggers an escape burst', () => {
    const brain = new FlyBrain(7);
    brain.plasticity.punish('damage', 1.5);
    let command = step(brain, [{ x: 2, z: 0, radius: 0.7, kind: 'enemy' }]);
    expect(command.stress).toBeGreaterThan(0.5);
    let escaped = command.escape;
    for (let tick = 0; tick < 10 && !escaped; tick += 1) {
      command = step(brain, [{ x: 2, z: 0, radius: 0.7, kind: 'enemy' }]);
      escaped ||= command.escape;
    }
    expect(escaped).toBe(true);
  });
});
