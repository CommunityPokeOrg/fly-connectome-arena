import { describe, expect, it } from 'vitest';
import { buildConnectome } from '../src/brain/connectome.ts';
import { FlyBrain } from '../src/brain/fly-brain.ts';
import { readSensors } from '../src/game/sensors.ts';

describe('connectome model', () => {
  it('is deterministic for a seed', () => { expect(buildConnectome(42)).toEqual(buildConnectome(42)); expect(buildConnectome(42).synapses).not.toEqual(buildConnectome(43).synapses); });
  it('produces bounded motor commands from spatial readings', () => {
    const brain = new FlyBrain(42);
    const command = brain.step(readSensors({
      flyX: 0,
      flyZ: 0,
      heading: 0,
      arenaRadius: 18,
      entities: [{ x: 0, z: 5, radius: 0.5, kind: 'enemy' }],
    }), { heading: 0 });
    expect(command.turn).toBeGreaterThanOrEqual(-1);
    expect(command.turn).toBeLessThanOrEqual(1);
    expect(command.thrust).toBeGreaterThan(0);
  });

  it('keeps a seeded agent moving and firing for 3000 ticks', () => {
    const brain = new FlyBrain(99);
    let x = 0;
    let z = 0;
    let heading = 0;
    let fired = false;
    let idleTicks = 0;
    let maxIdleTicks = 0;
    for (let tick = 0; tick < 3000; tick += 1) {
      const readings = readSensors({
        flyX: x,
        flyZ: z,
        heading,
        arenaRadius: 18,
        entities: [
          { x: x + Math.sin(heading) * 5, z: z + Math.cos(heading) * 5, radius: 0.7, kind: 'enemy' },
          { x: -8, z: 6, radius: 0.5, kind: 'food' },
        ],
      });
      const command = brain.step(readings, { heading });
      fired ||= command.fire;
      const speed = command.thrust * 4;
      heading += command.turn * 2.2 / 60;
      x += Math.sin(heading) * speed / 60;
      z += Math.cos(heading) * speed / 60;
      const distance = Math.hypot(x, z);
      if (distance > 17.4) {
        const scale = 17.4 / distance;
        x *= scale;
        z *= scale;
      }
      if (speed < 0.05) idleTicks += 1;
      else idleTicks = 0;
      maxIdleTicks = Math.max(maxIdleTicks, idleTicks);
    }
    expect(Math.hypot(x, z)).toBeLessThanOrEqual(17.4);
    expect(maxIdleTicks).toBeLessThanOrEqual(120);
    expect(fired).toBe(true);
  });
});
