import { describe, expect, it } from 'vitest';
import { RNG } from '../src/core/rng.ts';
import {
  containWithinCircle,
  headingOf,
  integrate,
  pursue,
  separation,
  wander,
  type SteeringAgent,
  type Vec2,
  type WanderState,
} from '../src/game/steering.ts';

function makeAgent(x: number, z: number, maxSpeed = 10, maxForce = 10): SteeringAgent {
  return { position: { x, z }, velocity: { x: 0, z: 0 }, maxSpeed, maxForce };
}

describe('steering', () => {
  it('integrate is frame-rate independent for constant force', () => {
    const simulate = (dt: number) => {
      const agent = makeAgent(0, 0);
      for (let t = 0; t < 2; t += dt) {
        integrate(agent, { x: 1, z: 0 }, dt);
      }
      return agent.position.x;
    };
    const at60 = simulate(1 / 60);
    const at30 = simulate(1 / 30);
    expect(Math.abs(at60 - at30)).toBeLessThan(Math.max(at60, at30) * 0.02);
  });

  it('containWithinCircle pushes inward near the wall and is ~0 at centre', () => {
    const radius = 18;
    const margin = 2;
    const edge = makeAgent(radius - 0.2, 0);
    edge.velocity = { x: 2, z: 0 };
    const force = containWithinCircle(edge, radius, margin);
    const outward = { x: 1, z: 0 };
    expect(force.x * outward.x + force.z * outward.z).toBeLessThan(0);
    expect(Math.hypot(force.x, force.z)).toBeGreaterThanOrEqual(0.5 * edge.maxForce);
    const centre = containWithinCircle(makeAgent(0, 0), radius, margin);
    expect(Math.hypot(centre.x, centre.z)).toBeLessThan(0.001);
  });

  it('separation pushes harder from a closer neighbour', () => {
    const agent = makeAgent(0, 0);
    const near = separation(agent, [{ x: 0.5, z: 0 }], 3);
    const far = separation(agent, [{ x: 2.5, z: 0 }], 3);
    expect(Math.hypot(near.x, near.z)).toBeGreaterThan(Math.hypot(far.x, far.z));
    expect(near.x).toBeGreaterThan(0);
  });

  it('wander is deterministic for a seeded RNG and does not lock into a turn', () => {
    const run = (seed: number) => {
      const rng = new RNG(seed);
      const agent = makeAgent(0, 0);
      agent.velocity = { x: 0, z: 2 };
      const state: WanderState = { angle: 0 };
      const headings: number[] = [];
      for (let i = 0; i < 600; i += 1) {
        const force = wander(agent, state, 1 / 60, () => rng.next());
        integrate(agent, force, 1 / 60);
        headings.push(headingOf(agent.velocity, 0));
      }
      return headings;
    };
    const a = run(1234);
    const b = run(1234);
    expect(a).toEqual(b);
    const unwrapped = a.slice();
    for (let i = 1; i < unwrapped.length; i += 1) {
      const prev = unwrapped[i - 1] ?? 0;
      let current = unwrapped[i] ?? 0;
      while (current - prev > Math.PI) current -= Math.PI * 2;
      while (current - prev < -Math.PI) current += Math.PI * 2;
      unwrapped[i] = current;
    }
    const mean = unwrapped.reduce((sum, v) => sum + v, 0) / unwrapped.length;
    const std = Math.sqrt(
      unwrapped.reduce((sum, v) => sum + (v - mean) ** 2, 0) / unwrapped.length,
    );
    expect(std).toBeGreaterThan(0.3);
  });

  it('a wander+pursue+containment predator never locks into tight circles', () => {
    const rng = new RNG(7);
    const target: Vec2 = { x: 0, z: 0 };
    const agent = makeAgent(10, 0, 4.2, 12.6);
    const state: WanderState = { angle: 0 };
    const dt = 1 / 60;
    const steps = 20 * 60;
    const headings: number[] = [];
    let minDistance = Infinity;
    let maxRadius = 0;
    for (let i = 0; i < steps; i += 1) {
      const force: Vec2 = { x: 0, z: 0 };
      const p = pursue(agent, target, { x: 0, z: 0 });
      const w = wander(agent, state, dt, () => rng.next());
      const c = containWithinCircle(agent, 18, 3);
      force.x += p.x * 0.8 + w.x + c.x * 2;
      force.z += p.z * 0.8 + w.z + c.z * 2;
      integrate(agent, force, dt);
      const distance = Math.hypot(agent.position.x, agent.position.z);
      maxRadius = Math.max(maxRadius, distance);
      minDistance = Math.min(minDistance, Math.hypot(agent.position.x, agent.position.z));
      headings.push(headingOf(agent.velocity, 0));
    }
    expect(maxRadius).toBeLessThanOrEqual(18);
    expect(minDistance).toBeLessThan(2);
    const window = 90; // 1.5 s at 60 Hz
    for (let start = 0; start + window < headings.length; start += 1) {
      let net = 0;
      for (let i = start + 1; i < start + window; i += 1) {
        const prev = headings[i - 1] ?? 0;
        const current = headings[i] ?? 0;
        net += Math.atan2(Math.sin(current - prev), Math.cos(current - prev));
      }
      expect(Math.abs(net)).toBeLessThanOrEqual(2.5 * Math.PI * 2);
    }
  });
});
