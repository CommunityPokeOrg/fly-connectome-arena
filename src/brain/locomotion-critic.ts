import { clamp, signedAngleDifference } from '../core/rng.ts';
import type { PlasticityEngine } from './plasticity.ts';

/** One frame of body kinematics plus the contact flags the arena reported. */
export interface LocomotionSample {
  x: number;
  z: number;
  heading: number;
  /** Ground speed in world units per second. */
  speed: number;
  /** Decoded steering command, -1..1. */
  turn: number;
  /** Decoded thrust command, 0..1. */
  thrust: number;
  wallHit: boolean;
  obstacleHit: boolean;
  /** 0..1 free distance straight ahead as seen by the compound eye. */
  frontalClearance: number;
}

export interface LocomotionAssessment {
  /** 0..1 how straight, fast and jerk-free the current step was. */
  smoothness: number;
  /** Signed forward progress this frame, world units. */
  progress: number;
  /** True when a not-recently-visited zone was entered this frame. */
  novelZone: boolean;
  stuck: boolean;
  circling: boolean;
  collided: boolean;
  /** Total appetitive amount delivered this frame. */
  reward: number;
  /** Total aversive amount delivered this frame. */
  punishment: number;
}

export interface LocomotionCriticOptions {
  /** Speed at which the locomotion reward saturates. */
  cruiseSpeed?: number;
  /** Side length of the exploration grid, world units. */
  zoneSize?: number;
  /** Seconds before a zone counts as novel again. */
  zoneMemory?: number;
  /** Window used to detect being stuck, seconds. */
  stuckWindow?: number;
  /** Displacement below which a thrusting fly counts as stuck, world units. */
  stuckDistance?: number;
  /** Accumulated rotation (radians) that counts as a repetitive loop. */
  circleTurns?: number;
  /** Net displacement below which a loop is a tight circle, world units. */
  circleRadius?: number;
}

interface TrailPoint {
  time: number;
  x: number;
  z: number;
}

/**
 * Reward shaping for the body: watches how the fly actually moves and turns
 * that into neuromodulator signals. Smooth straight flight, forward progress
 * and entering fresh zones release dopamine; collisions, wall-hugging, being
 * stuck and spinning in tight circles release octopamine. Everything is a
 * pure function of the sample stream so a seeded run is fully repeatable.
 */
export class LocomotionCritic {
  private readonly cruiseSpeed: number;
  private readonly zoneSize: number;
  private readonly zoneMemory: number;
  private readonly stuckWindow: number;
  private readonly stuckDistance: number;
  private readonly circleTurns: number;
  private readonly circleRadius: number;
  private readonly trail: TrailPoint[] = [];
  private readonly zones = new Map<string, number>();
  private time = 0;
  private primed = false;
  private lastX = 0;
  private lastZ = 0;
  private lastHeading = 0;
  private lastTurn = 0;
  private rotation = 0;
  private stuckTime = 0;
  private collisionCooldown = 0;
  private circleCooldown = 0;
  private circlingNow = false;
  private stuckNow = false;

  public constructor(
    private readonly plasticity: PlasticityEngine,
    options: LocomotionCriticOptions = {},
  ) {
    this.cruiseSpeed = options.cruiseSpeed ?? 5.5;
    this.zoneSize = options.zoneSize ?? 3;
    this.zoneMemory = options.zoneMemory ?? 25;
    this.stuckWindow = options.stuckWindow ?? 1.5;
    this.stuckDistance = options.stuckDistance ?? 0.8;
    this.circleTurns = options.circleTurns ?? Math.PI * 2 * 1.5;
    this.circleRadius = options.circleRadius ?? 3.5;
  }

  public get isCircling(): boolean {
    return this.circlingNow;
  }

  public get isStuck(): boolean {
    return this.stuckNow;
  }

  public observe(sample: LocomotionSample, dt: number): LocomotionAssessment {
    const idle: LocomotionAssessment = {
      smoothness: 0,
      progress: 0,
      novelZone: false,
      stuck: false,
      circling: false,
      collided: false,
      reward: 0,
      punishment: 0,
    };
    if (dt <= 0) {
      return idle;
    }
    this.time += dt;
    this.collisionCooldown = Math.max(0, this.collisionCooldown - dt);
    this.circleCooldown = Math.max(0, this.circleCooldown - dt);
    if (!this.primed) {
      this.primed = true;
      this.lastX = sample.x;
      this.lastZ = sample.z;
      this.lastHeading = sample.heading;
      this.lastTurn = sample.turn;
      this.trail.push({ time: this.time, x: sample.x, z: sample.z });
      this.zones.set(this.zoneKey(sample.x, sample.z), this.time);
      return idle;
    }

    let reward = 0;
    let punishment = 0;
    const dx = sample.x - this.lastX;
    const dz = sample.z - this.lastZ;
    const progress = dx * Math.sin(sample.heading) + dz * Math.cos(sample.heading);
    const collided = sample.wallHit || sample.obstacleHit;

    // Smooth linear locomotion: fast, straight and without steering jerk.
    const speedFactor = clamp(sample.speed / this.cruiseSpeed, 0, 1);
    const straightness = 1 - clamp(Math.abs(sample.turn), 0, 1);
    const jerk = clamp(Math.abs(sample.turn - this.lastTurn) / Math.max(dt * 6, 1e-3), 0, 1);
    const smoothness = collided ? 0 : speedFactor * straightness * (1 - 0.6 * jerk);
    if (smoothness > 0.35) {
      const amount = (smoothness - 0.35) * 0.22 * dt;
      this.plasticity.rewardContinuous('locomotion', amount);
      reward += amount;
    }
    if (progress > 0 && !collided) {
      const amount = clamp(progress, 0, 0.3) * 0.12;
      this.plasticity.rewardContinuous('progress', amount);
      reward += amount;
    }

    // Exploration: entering a zone not visited within `zoneMemory` seconds.
    const key = this.zoneKey(sample.x, sample.z);
    const lastVisit = this.zones.get(key);
    const novelZone = lastVisit === undefined || this.time - lastVisit > this.zoneMemory;
    if (novelZone && !collided) {
      this.plasticity.reward('exploration', 0.3);
      reward += 0.3;
    }
    this.zones.set(key, this.time);

    // Collision punishment: a discrete hit plus continuous scraping pressure.
    if (collided) {
      const scrape = 0.5 * dt;
      this.plasticity.punishContinuous('collision', scrape);
      punishment += scrape;
      if (this.collisionCooldown <= 0) {
        const amount = sample.obstacleHit ? 0.45 : 0.3;
        this.plasticity.punish('collision', amount);
        punishment += amount;
        this.collisionCooldown = 0.35;
      }
    } else if (sample.frontalClearance < 0.3 && speedFactor > 0.5) {
      // Racing at a wall the eye can already see is punished before impact
      // so avoidance is learned proactively.
      const amount = (0.3 - sample.frontalClearance) * speedFactor * 0.6 * dt;
      this.plasticity.punishContinuous('wall-approach', amount);
      punishment += amount;
    }

    // Stuck: commanded thrust but no displacement over the window.
    this.trail.push({ time: this.time, x: sample.x, z: sample.z });
    while (this.trail.length > 1 && this.time - (this.trail[0] as TrailPoint).time > this.stuckWindow) {
      this.trail.shift();
    }
    const oldest = this.trail[0] as TrailPoint;
    const windowSpan = this.time - oldest.time;
    const windowDisplacement = Math.hypot(sample.x - oldest.x, sample.z - oldest.z);
    let stuck = false;
    if (windowSpan >= this.stuckWindow * 0.95 && sample.thrust > 0.3 && windowDisplacement < this.stuckDistance) {
      this.stuckTime += dt;
      if (this.stuckTime >= 0.5) {
        stuck = true;
        this.plasticity.punish('stuck', 0.5);
        punishment += 0.5;
        this.stuckTime = -0.5;
      }
    } else {
      this.stuckTime = 0;
    }
    this.stuckNow = stuck || this.stuckTime > 0;

    // Circling: accumulated signed rotation with little net displacement.
    const dHeading = signedAngleDifference(sample.heading, this.lastHeading);
    this.rotation = this.rotation * Math.exp(-dt / 4) + dHeading;
    let circling = false;
    if (Math.abs(this.rotation) > this.circleTurns && windowDisplacement < this.circleRadius) {
      circling = true;
      if (this.circleCooldown <= 0) {
        this.plasticity.punish('circling', 0.6);
        punishment += 0.6;
        this.circleCooldown = 1.2;
      }
      const spin = 0.4 * dt;
      this.plasticity.punishContinuous('circling', spin);
      punishment += spin;
    }
    this.circlingNow = circling;
    if (circling && Math.abs(this.rotation) > this.circleTurns * 1.5) {
      this.rotation = Math.sign(this.rotation) * this.circleTurns;
    }

    this.lastX = sample.x;
    this.lastZ = sample.z;
    this.lastHeading = sample.heading;
    this.lastTurn = sample.turn;
    if (this.zones.size > 4096) {
      this.forgetStaleZones();
    }
    return { smoothness, progress, novelZone, stuck, circling, collided, reward, punishment };
  }

  public reset(): void {
    this.trail.length = 0;
    this.zones.clear();
    this.time = 0;
    this.primed = false;
    this.lastX = 0;
    this.lastZ = 0;
    this.lastHeading = 0;
    this.lastTurn = 0;
    this.rotation = 0;
    this.stuckTime = 0;
    this.collisionCooldown = 0;
    this.circleCooldown = 0;
    this.circlingNow = false;
    this.stuckNow = false;
  }

  private zoneKey(x: number, z: number): string {
    return `${Math.floor(x / this.zoneSize)}:${Math.floor(z / this.zoneSize)}`;
  }

  private forgetStaleZones(): void {
    for (const [key, visited] of this.zones) {
      if (this.time - visited > this.zoneMemory) {
        this.zones.delete(key);
      }
    }
  }
}
