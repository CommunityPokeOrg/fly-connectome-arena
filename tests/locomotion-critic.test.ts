import { describe, expect, it } from 'vitest';
import { buildConnectome } from '../src/brain/connectome.ts';
import { LIFNetwork } from '../src/brain/lif.ts';
import { LocomotionCritic, type LocomotionSample } from '../src/brain/locomotion-critic.ts';
import { PlasticityEngine } from '../src/brain/plasticity.ts';

const DT = 1 / 60;

function setup(options = {}) {
  const connectome = buildConnectome(7);
  const network = new LIFNetwork(connectome);
  const engine = new PlasticityEngine(connectome, network);
  const critic = new LocomotionCritic(engine, options);
  return { engine, critic };
}

function sample(overrides: Partial<LocomotionSample> = {}): LocomotionSample {
  return {
    x: 0,
    z: 0,
    heading: 0,
    speed: 6,
    turn: 0,
    thrust: 0.8,
    wallHit: false,
    obstacleHit: false,
    frontalClearance: 1,
    ...overrides,
  };
}

/** Drive a body along a path for `seconds`, returning summed reward/punishment. */
function drive(
  critic: LocomotionCritic,
  engine: PlasticityEngine,
  seconds: number,
  body: (time: number) => LocomotionSample,
) {
  let reward = 0;
  let punishment = 0;
  const kinds = new Set<string>();
  for (let tick = 0; tick < seconds * 60; tick += 1) {
    const assessment = critic.observe(body(tick * DT), DT);
    reward += assessment.reward;
    punishment += assessment.punishment;
    engine.update(DT);
    for (const event of engine.recentEvents) {
      kinds.add(event.kind);
    }
  }
  return { reward, punishment, kinds };
}

describe('locomotion critic: reward shaping', () => {
  it('rewards smooth straight flight with locomotion and progress dopamine', () => {
    const { engine, critic } = setup({ zoneSize: 1000 });
    const result = drive(critic, engine, 3, (time) => sample({ z: time * 6 }));
    expect(result.reward).toBeGreaterThan(0.5);
    expect(result.punishment).toBe(0);
    expect(result.kinds.has('locomotion')).toBe(true);
    expect(result.kinds.has('progress')).toBe(true);
    expect(engine.snapshot().rewardRate).toBeGreaterThan(0);
  });

  it('rewards straight flight more than jerky, slow, hard-turning flight', () => {
    const smooth = setup({ zoneSize: 1000 });
    const jerky = setup({ zoneSize: 1000 });
    const straight = drive(smooth.critic, smooth.engine, 3, (time) => sample({ z: time * 6 }));
    const wobble = drive(jerky.critic, jerky.engine, 3, (time, tick = Math.round(time * 60)) => sample({
      z: time * 1.5,
      speed: 1.5,
      turn: tick % 2 === 0 ? 0.9 : -0.9,
    }));
    expect(straight.reward).toBeGreaterThan(wobble.reward * 3);
  });

  it('does not reward backward drift as progress', () => {
    const { engine, critic } = setup({ zoneSize: 1000 });
    const result = drive(critic, engine, 2, (time) => sample({ z: 500 - time * 4, speed: 0 }));
    expect(result.kinds.has('progress')).toBe(false);
    expect(result.kinds.has('locomotion')).toBe(false);
    expect(result.reward).toBe(0);
  });

  it('delivers a discrete exploration reward on entering a fresh zone only', () => {
    const { engine, critic } = setup({ zoneSize: 3, zoneMemory: 60 });
    critic.observe(sample(), DT);
    let first = critic.observe(sample({ z: 3.5, speed: 0 }), DT);
    expect(first.novelZone).toBe(true);
    expect(engine.snapshot().rewardsDelivered).toBe(1);
    // Staying in the same zone: nothing more.
    first = critic.observe(sample({ z: 3.6, speed: 0 }), DT);
    expect(first.novelZone).toBe(false);
    expect(engine.snapshot().rewardsDelivered).toBe(1);
    // Going back to the origin zone shortly afterwards: already visited.
    critic.observe(sample({ z: 0.2, speed: 0 }), DT);
    expect(engine.snapshot().rewardsDelivered).toBe(1);
    expect(engine.recentEvents.some((event) => event.kind === 'exploration')).toBe(true);
  });
});

describe('locomotion critic: penalties', () => {
  it('punishes collisions with a discrete octopamine event plus scraping pressure', () => {
    const { engine, critic } = setup({ zoneSize: 1000 });
    critic.observe(sample(), DT);
    const hit = critic.observe(sample({ z: 0.1, obstacleHit: true }), DT);
    expect(hit.collided).toBe(true);
    expect(hit.punishment).toBeGreaterThan(0.4);
    expect(hit.reward).toBe(0);
    expect(engine.octopamine).toBeGreaterThan(0.4);
    expect(engine.snapshot().punishmentsDelivered).toBe(1);
    // Within the cooldown only the continuous scrape is applied.
    const scrape = critic.observe(sample({ z: 0.2, obstacleHit: true }), DT);
    expect(scrape.punishment).toBeLessThan(0.05);
    expect(engine.snapshot().punishmentsDelivered).toBe(1);
    expect(engine.snapshot().state).toBe('aversive');
  });

  it('punishes racing toward a visible wall before impact', () => {
    const { engine, critic } = setup({ zoneSize: 1000 });
    const result = drive(critic, engine, 1, (time) => sample({ z: time * 6, frontalClearance: 0.1 }));
    expect(result.kinds.has('wall-approach')).toBe(true);
    expect(result.punishment).toBeGreaterThan(0);
    const clear = setup({ zoneSize: 1000 });
    const safe = drive(clear.critic, clear.engine, 1, (time) => sample({ z: time * 6, frontalClearance: 0.9 }));
    expect(safe.kinds.has('wall-approach')).toBe(false);
  });

  it('flags a thrusting but motionless fly as stuck and punishes it periodically', () => {
    const { engine, critic } = setup({ zoneSize: 1000, stuckWindow: 1 });
    const result = drive(critic, engine, 4, () => sample({ speed: 0, thrust: 0.9 }));
    expect(result.kinds.has('stuck')).toBe(true);
    expect(engine.snapshot().punishmentsDelivered).toBeGreaterThanOrEqual(2);
    expect(engine.snapshot().punishmentsDelivered).toBeLessThanOrEqual(4);
    expect(result.reward).toBe(0);
  });

  it('does not flag a coasting fly with no thrust command as stuck', () => {
    const { engine, critic } = setup({ zoneSize: 1000, stuckWindow: 1 });
    const result = drive(critic, engine, 4, () => sample({ speed: 0, thrust: 0.1 }));
    expect(result.kinds.has('stuck')).toBe(false);
  });

  it('punishes spinning in a tight repetitive circle', () => {
    const { engine, critic } = setup({ zoneSize: 1000 });
    const radius = 0.8;
    const angularSpeed = Math.PI * 2 / 1.2;
    const result = drive(critic, engine, 6, (time) => sample({
      x: Math.cos(time * angularSpeed) * radius,
      z: Math.sin(time * angularSpeed) * radius,
      heading: time * angularSpeed,
      speed: radius * angularSpeed,
      turn: 0.9,
    }));
    expect(result.kinds.has('circling')).toBe(true);
    expect(critic.isCircling).toBe(true);
    expect(engine.snapshot().punishmentsDelivered).toBeGreaterThanOrEqual(2);
    expect(result.punishment).toBeGreaterThan(result.reward);
  });

  it('does not punish a wide arc that covers ground', () => {
    const { engine, critic } = setup({ zoneSize: 1000 });
    const radius = 9;
    const angularSpeed = 6 / radius;
    const result = drive(critic, engine, 6, (time) => sample({
      x: Math.cos(time * angularSpeed) * radius,
      z: Math.sin(time * angularSpeed) * radius,
      heading: time * angularSpeed,
      speed: 6,
      turn: 0.2,
    }));
    expect(result.kinds.has('circling')).toBe(false);
    expect(result.punishment).toBe(0);
  });
});

describe('locomotion critic: determinism', () => {
  it('produces identical modulator trajectories for identical sample streams', () => {
    const run = () => {
      const { engine, critic } = setup();
      const trace: number[] = [];
      for (let tick = 0; tick < 240; tick += 1) {
        const time = tick * DT;
        critic.observe(sample({
          x: Math.sin(time) * 4,
          z: time * 3,
          heading: Math.sin(time * 0.5) * 2,
          turn: Math.sin(time * 3),
          obstacleHit: tick % 97 === 0,
        }), DT);
        engine.update(DT);
        trace.push(engine.dopamine, engine.octopamine, engine.serotonin);
      }
      return trace;
    };
    expect(run()).toEqual(run());
  });

  it('reset clears zone memory and rotation state', () => {
    const { engine, critic } = setup({ zoneSize: 3 });
    critic.observe(sample(), DT);
    critic.observe(sample({ z: 3.5 }), DT);
    expect(engine.snapshot().rewardsDelivered).toBe(1);
    critic.reset();
    engine.reset();
    critic.observe(sample(), DT);
    critic.observe(sample({ z: 3.5 }), DT);
    expect(engine.snapshot().rewardsDelivered).toBe(1);
    expect(critic.isCircling).toBe(false);
    expect(critic.isStuck).toBe(false);
  });
});
