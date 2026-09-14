import {
  Color,
  Group,
  MeshStandardMaterial,
  Vector3,
  type Scene,
} from 'three';
import { clamp, RNG } from '../core/rng.ts';
import { clampToArena, resolveSphereAgainstCircle } from './collisions.ts';
import type { MotorCommand } from '../brain/fly-brain.ts';
import type { ArenaObstacle } from './arena.ts';
import { animateInsect, createInsectMesh, flashInsect, type InsectRig } from './insects.ts';
import {
  add,
  avoidCircles,
  containWithinCircle,
  scale,
  type SteeringAgent,
} from './steering.ts';

export interface FlyUpdateResult {
  wallHit: boolean;
  obstacleHit: boolean;
  damage: number;
}

export class Fly {
  public readonly group = new Group();
  public readonly position = this.group.position;
  public readonly velocity = new Vector3();
  public heading = 0;
  public speed = 0;
  public health = 100;
  public lives = 3;
  public score = 0;
  public radius = 0.62;
  public readonly muzzle = new Vector3();
  private readonly insectRig: InsectRig;
  private turnSmoothed = 0;
  private circleAccumulator = 0;
  private straightTimer = 0;
  private evadeTimer = 0;
  private evadeSide = 1;
  private escapeTimer = 0;
  private escapeSide = 1;
  private reflexTimer = 0;
  private reflexSide = 1;
  private elapsed = 0;
  private readonly rng: RNG;

  public constructor(scene: Scene, rng: RNG = new RNG(1)) {
    this.rng = rng;
    this.insectRig = createInsectMesh('fly', 0.4);
    this.insectRig.root.scale.setScalar(1.12);
    this.group.add(this.insectRig.root);
    this.group.position.set(0, 0.9, 0);
    scene.add(this.group);
  }

  public update(
    dt: number,
    command: MotorCommand,
    arenaRadius: number,
    obstacles: readonly ArenaObstacle[],
  ): FlyUpdateResult {
    this.elapsed += dt;
    const requestedTurn = command.turn;
    let thrust = command.thrust;

    if (command.evade && this.evadeTimer <= 0) {
      // Deterministic dodge side: hash the deci-second tick so no Math.random.
      this.evadeSide = ((Math.floor(this.elapsed * 10) * 2654435761) >>> 0) % 2 === 0 ? 1 : -1;
      this.evadeTimer = 0.3;
    }
    if (command.escape && this.escapeTimer <= 0) {
      // Stress-driven escape jump: a stronger, longer lateral dart.
      this.escapeSide = this.rng.chance(0.5) ? 1 : -1;
      this.escapeTimer = 0.45;
    }
    this.evadeTimer = Math.max(0, this.evadeTimer - dt);
    this.escapeTimer = Math.max(0, this.escapeTimer - dt);

    const turnRate = this.evadeTimer > 0 ? 3.7 : 2.65;
    this.turnSmoothed += (requestedTurn - this.turnSmoothed) * (1 - Math.exp(-dt * 6));
    let appliedTurn = this.turnSmoothed;

    // Saccade-style circle breaker: if the fly has circled almost a full loop
    // within ~1.5 s, dart straight with full thrust for a second.
    this.circleAccumulator = this.circleAccumulator * Math.exp(-dt / 1.5)
      + appliedTurn * turnRate * dt;
    if (Math.abs(this.circleAccumulator) > 0.55 * Math.PI * 2) {
      this.straightTimer = 1.0;
      this.circleAccumulator = 0;
    }
    this.straightTimer = Math.max(0, this.straightTimer - dt);
    if (this.straightTimer > 0) {
      appliedTurn *= 0.15;
      thrust = 1.0;
    }
    // Octopamine stress makes steering erratic; escape adds a thrust burst.
    appliedTurn += (this.rng.next() * 2 - 1) * command.stress * 0.9;
    if (this.escapeTimer > 0) {
      thrust = Math.max(thrust, 1.0);
    }

    // Reflex steering layer: the connectome command stays primary, but an
    // obstacle/containment force projected onto the lateral axis nudges the
    // fly aside from imminent collisions it would otherwise fly into.
    const agent: SteeringAgent = {
      position: { x: this.position.x, z: this.position.z },
      velocity: { x: this.velocity.x, z: this.velocity.z },
      maxSpeed: 8,
      maxForce: 12,
    };
    const reflex = add(
      avoidCircles(agent, obstacles, 2.6),
      scale(containWithinCircle(agent, arenaRadius, 2.5), 1.5),
    );
    const lateralReflex = reflex.x * Math.cos(this.heading) - reflex.z * Math.sin(this.heading);
    appliedTurn += clamp(lateralReflex * 0.12, -0.9, 0.9);
    // A strong reflex (obstacle nearly head-on) commits to a short dodge so
    // the turn does not fade the moment the lookahead point slides past the
    // obstacle's edge.
    if (Math.abs(lateralReflex) >= 5) {
      this.reflexSide = Math.sign(lateralReflex);
      this.reflexTimer = 0.45;
    }
    this.reflexTimer = Math.max(0, this.reflexTimer - dt);
    if (this.reflexTimer > 0) {
      appliedTurn = this.reflexSide * 0.9 + appliedTurn * 0.25;
    }

    this.heading += appliedTurn * turnRate * dt;
    const targetSpeed = 2.4 + clamp(thrust, 0, 1) * 5.6;
    this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-dt * 4.5));
    const direction = new Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const lateral = new Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
    const dodge = new Vector3();
    if (this.evadeTimer > 0) {
      dodge.addScaledVector(lateral, this.evadeSide * 2.2 * (this.evadeTimer / 0.3));
    }
    if (this.escapeTimer > 0) {
      dodge.addScaledVector(lateral, this.escapeSide * 3.5 * (this.escapeTimer / 0.45));
    }
    this.velocity.copy(direction).multiplyScalar(this.speed).add(dodge);
    this.position.addScaledVector(this.velocity, dt);

    const bounded = clampToArena(this.position, this.radius, arenaRadius);
    this.position.copy(bounded.position);
    if (bounded.collided) {
      this.velocity.reflect(bounded.normal).multiplyScalar(0.2);
      this.heading += Math.PI * 0.12;
    }
    let obstacleHit = false;
    for (const obstacle of obstacles) {
      const resolution = resolveSphereAgainstCircle(
        this.position,
        this.radius,
        { x: obstacle.x, z: obstacle.z, radius: obstacle.radius },
      );
      if (resolution) {
        obstacleHit = true;
        this.position.copy(resolution.position);
        this.velocity.reflect(resolution.normal).multiplyScalar(0.28);
      }
    }
    this.group.rotation.y = this.heading;
    this.group.rotation.z = -appliedTurn * 0.09;
    animateInsect(this.insectRig, dt, Math.max(0.2, this.speed));
    this.updateMuzzle(direction);
    return {
      wallHit: bounded.collided,
      obstacleHit,
      damage: bounded.collided ? 4 : obstacleHit ? 10 : 0,
    };
  }

  private updateMuzzle(direction: Vector3): void {
    this.muzzle.copy(this.position).addScaledVector(direction, 1.08);
    this.muzzle.y += 0.02;
  }

  public takeDamage(amount: number): boolean {
    this.health = Math.max(0, this.health - amount);
    flashInsect(this.insectRig);
    if (this.health > 0) {
      return false;
    }
    this.lives -= 1;
    if (this.lives <= 0) {
      return true;
    }
    this.health = 100;
    this.position.set(0, 0.9, 0);
    this.velocity.set(0, 0, 0);
    this.heading = 0;
    return false;
  }

  public heal(amount: number): void {
    this.health = Math.min(100, this.health + amount);
  }

  public reset(): void {
    this.position.set(0, 0.9, 0);
    this.velocity.set(0, 0, 0);
    this.heading = 0;
    this.speed = 0;
    this.health = 100;
    this.lives = 3;
    this.score = 0;
    this.turnSmoothed = 0;
    this.circleAccumulator = 0;
    this.straightTimer = 0;
    this.evadeTimer = 0;
    this.escapeTimer = 0;
    this.reflexTimer = 0;
    this.group.visible = true;
  }

  public forwardVector(): Vector3 {
    return new Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  public rightVector(): Vector3 {
    return new Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
  }

  public tint(color: number): void {
    for (const material of this.insectRig.materials) {
      if ('color' in material && !material.userData['keepColor']) {
        (material as MeshStandardMaterial).color = new Color(color);
      }
    }
  }
}
