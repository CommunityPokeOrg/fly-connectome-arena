import { describe, expect, it } from 'vitest';
import { Scene, Object3D } from 'three';
import { readFileSync } from 'node:fs';
import { Fly } from '../src/game/fly.ts';
import { FlyBrain } from '../src/brain/fly-brain.ts';
import type { ArenaObstacle } from '../src/game/arena.ts';
import type { MotorCommand } from '../src/brain/fly-brain.ts';

const stillCommand: MotorCommand = {
  turn: 1,
  thrust: 0.6,
  fire: false,
  evade: false,
  behavior: 'At rest',
  stress: 0,
  escape: false,
  leftRate: 0,
  rightRate: 0,
  forwardRate: 0,
  brakeRate: 0,
  fireRate: 0,
  evadeRate: 0,
};

describe('autonomous fly', () => {
  it('update() no longer takes manual control parameters', () => {
    expect(Fly.prototype.update.length).toBeLessThanOrEqual(4);
  });

  it('game and fly source contain no manual-control tokens', () => {
    const gameSource = readFileSync('src/game/game.ts', 'utf8');
    const flySource = readFileSync('src/game/fly.ts', 'utf8');
    for (const source of [gameSource, flySource]) {
      expect(/manualOverride|manualTurn|manualThrust/.test(source)).toBe(false);
    }
  });

  it('circle breaker prevents a sustained tight orbit under a hard turn', () => {
    const scene = new Scene();
    const fly = new Fly(scene);
    const command: MotorCommand = { ...stillCommand };
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let step = 0; step < 12 * 60; step += 1) {
      fly.update(1 / 60, command, 18, []);
      minX = Math.min(minX, fly.position.x);
      maxX = Math.max(maxX, fly.position.x);
      minZ = Math.min(minZ, fly.position.z);
      maxZ = Math.max(maxZ, fly.position.z);
      expect(Math.hypot(fly.position.x, fly.position.z)).toBeLessThanOrEqual(18);
    }
    expect(maxX - minX).toBeGreaterThan(6);
    expect(maxZ - minZ).toBeGreaterThan(6);
  });

  it('reflex steering avoids a head-on obstacle', () => {
    const scene = new Scene();
    const fly = new Fly(scene);
    const obstacle: ArenaObstacle = {
      id: 'test-obstacle',
      object: new Object3D(),
      x: 0,
      z: 6,
      radius: 1,
      height: 1,
      kind: 'pillar',
    };
    const command: MotorCommand = { ...stillCommand, turn: 0, thrust: 1 };
    for (let step = 0; step < 4 * 60; step += 1) {
      const result = fly.update(1 / 60, command, 18, [obstacle]);
      expect(result.obstacleHit).toBe(false);
    }
  });
});

describe('graded decoder + escape hysteresis', () => {
  const oneSidedOdor = {
    visual: new Array(24).fill(0),
    target: new Array(12).fill(0),
    olfactory: Object.assign(new Array(16).fill(0), { 12: 1 }),
    threat: new Array(8).fill(0),
    nearestEnemyAngle: 0,
    nearestFoodAngle: 0,
  };

  it('olfactory steering produces a graded, non-saturated turn', () => {
    const brain = new FlyBrain(7);
    let command = brain.step(oneSidedOdor, { heading: 0, steps: 16 });
    for (let step = 0; step < 3 * 60; step += 1) {
      command = brain.step(oneSidedOdor, { heading: 0, steps: 16 });
    }
    expect(Math.abs(command.turn)).toBeGreaterThan(0);
    expect(Math.abs(command.turn)).toBeLessThan(0.999);
    expect([
      'At rest',
      'Foraging flight',
      'Turning left',
      'Turning right',
      'Evasive burst',
      'Escape flight',
    ]).toContain(command.behavior);
  });

  it('escape fires at most once under continuously high stress', () => {
    const brain = new FlyBrain(7);
    let escapeFrames = 0;
    for (let step = 0; step < 2 * 60; step += 1) {
      brain.plasticity.punish('damage', 3);
      const command = brain.step(oneSidedOdor, { heading: 0, steps: 16 });
      if (command.escape) escapeFrames += 1;
    }
    expect(escapeFrames).toBeGreaterThan(0);
    expect(escapeFrames).toBeLessThanOrEqual(3);
  });
});
