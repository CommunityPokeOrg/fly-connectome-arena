import { Object3D, Scene } from 'three';
import { FlyBrain } from '../../src/brain/fly-brain.ts';
import type { ArenaObstacle } from '../../src/game/arena.ts';
import { Fly } from '../../src/game/fly.ts';
import { readSensors, type SensorEntity } from '../../src/game/sensors.ts';
import type { VisionFrame } from '../../src/game/vision.ts';
import { RNG } from '../../src/core/rng.ts';

export interface HeadlessOptions {
  seed?: number;
  ticks?: number;
  arenaRadius?: number;
  obstacles?: readonly { x: number; z: number; radius: number }[];
  food?: readonly { x: number; z: number; radius: number }[];
}

export interface HeadlessTrace {
  positions: { x: number; z: number }[];
  headings: number[];
  wallHits: number;
  obstacleHits: number;
  /** Fraction of ticks in which the body touched a wall or obstacle. */
  contactFraction: number;
  /** Number of distinct 3x3 zones visited. */
  zonesVisited: number;
  /** Longest continuous stretch (ticks) of tight circling flagged by the critic. */
  longestCircling: number;
  /** Longest continuous stretch (ticks) the critic flagged as stuck. */
  longestStuck: number;
  maxRadius: number;
  rewardsDelivered: number;
  punishmentsDelivered: number;
  finalWeightsChecksum: number;
  weightDrift: number;
}

export function pillarField(seed = 3, count = 7, arenaRadius = 18): { x: number; z: number; radius: number }[] {
  const rng = new RNG(seed);
  const pillars: { x: number; z: number; radius: number }[] = [];
  while (pillars.length < count) {
    const angle = rng.range(0, Math.PI * 2);
    const distance = rng.range(4, arenaRadius - 4);
    const candidate = { x: Math.sin(angle) * distance, z: Math.cos(angle) * distance, radius: rng.range(0.8, 1.5) };
    if (pillars.every((pillar) => Math.hypot(pillar.x - candidate.x, pillar.z - candidate.z) > 4)) {
      pillars.push(candidate);
    }
  }
  return pillars;
}

/**
 * Closed-loop Fly + FlyBrain + compound-eye run with no renderer, enemies or
 * projectiles: the same coupling `Game.fixedStep` performs, minus the parts
 * that need a WebGL scene.
 */
export function runHeadless(options: HeadlessOptions = {}): HeadlessTrace {
  const seed = options.seed ?? 11;
  const ticks = options.ticks ?? 60 * 30;
  const arenaRadius = options.arenaRadius ?? 18;
  const scene = new Scene();
  const brainRng = new RNG(seed);
  const fly = new Fly(scene, brainRng.fork(0xf17));
  const brain = new FlyBrain(seed);
  const obstacles: ArenaObstacle[] = (options.obstacles ?? pillarField(seed)).map((pillar, index) => ({
    id: `pillar-${index}`,
    object: new Object3D(),
    x: pillar.x,
    z: pillar.z,
    radius: pillar.radius,
    height: 1,
    kind: 'pillar',
  }));
  const food = options.food ?? [];
  const dt = 1 / 60;
  let vision: VisionFrame | undefined;
  const trace: HeadlessTrace = {
    positions: [],
    headings: [],
    wallHits: 0,
    obstacleHits: 0,
    contactFraction: 0,
    zonesVisited: 0,
    longestCircling: 0,
    longestStuck: 0,
    maxRadius: 0,
    rewardsDelivered: 0,
    punishmentsDelivered: 0,
    finalWeightsChecksum: 0,
    weightDrift: 0,
  };
  const zones = new Set<string>();
  let contactTicks = 0;
  let circlingRun = 0;
  let stuckRun = 0;
  for (let tick = 0; tick < ticks; tick += 1) {
    const entities: SensorEntity[] = [
      ...obstacles.map((obstacle) => ({ x: obstacle.x, z: obstacle.z, radius: obstacle.radius, kind: 'obstacle' as const })),
      ...food.map((item) => ({ ...item, kind: 'food' as const })),
    ];
    const readings = readSensors({
      flyX: fly.position.x,
      flyZ: fly.position.z,
      heading: fly.heading,
      arenaRadius,
      entities,
    }, vision);
    vision = readings.vision;
    const command = brain.step(readings, { heading: fly.heading, steps: 16 }, dt);
    const result = fly.update(dt, command, arenaRadius, obstacles);
    const assessment = brain.observeLocomotion({
      x: fly.position.x,
      z: fly.position.z,
      heading: fly.heading,
      speed: fly.speed,
      turn: command.turn,
      thrust: command.thrust,
      wallHit: result.wallHit,
      obstacleHit: result.obstacleHit,
    }, dt);
    if (result.wallHit) trace.wallHits += 1;
    if (result.obstacleHit) trace.obstacleHits += 1;
    if (result.wallHit || result.obstacleHit) contactTicks += 1;
    circlingRun = assessment.circling ? circlingRun + 1 : 0;
    stuckRun = brain.critic.isStuck ? stuckRun + 1 : 0;
    trace.longestCircling = Math.max(trace.longestCircling, circlingRun);
    trace.longestStuck = Math.max(trace.longestStuck, stuckRun);
    trace.positions.push({ x: fly.position.x, z: fly.position.z });
    trace.headings.push(fly.heading);
    trace.maxRadius = Math.max(trace.maxRadius, Math.hypot(fly.position.x, fly.position.z));
    zones.add(`${Math.floor(fly.position.x / 3)}:${Math.floor(fly.position.z / 3)}`);
  }
  const snapshot = brain.plasticity.snapshot();
  let checksum = 0;
  for (const [index, weight] of brain.network.weights.entries()) {
    checksum += weight * ((index % 97) + 1);
  }
  trace.contactFraction = contactTicks / ticks;
  trace.zonesVisited = zones.size;
  trace.rewardsDelivered = snapshot.rewardsDelivered;
  trace.punishmentsDelivered = snapshot.punishmentsDelivered;
  trace.finalWeightsChecksum = checksum;
  trace.weightDrift = snapshot.driftFromBaseline;
  return trace;
}
