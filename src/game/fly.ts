import {
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3,
  type Scene,
} from 'three';
import { clamp } from '../core/rng.ts';
import { clampToArena, resolveSphereAgainstCircle } from './collisions.ts';
import type { MotorCommand } from '../brain/fly-brain.ts';
import type { ArenaObstacle } from './arena.ts';
import { animateInsect, createInsectMesh, flashInsect, type InsectRig } from './insects.ts';

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
  private readonly body: Mesh;
  private evadeTimer = 0;
  private readonly insectRig: InsectRig;

  public constructor(scene: Scene) {
    this.insectRig = createInsectMesh('fly', 0.4);
    this.insectRig.root.scale.setScalar(1.12);
    this.group.add(this.insectRig.root);
    this.body = this.insectRig.thorax;
    this.group.position.set(0, 0.9, 0);
    scene.add(this.group);
  }

  public update(
    dt: number,
    command: MotorCommand,
    arenaRadius: number,
    obstacles: readonly ArenaObstacle[],
    manualTurn = 0,
    manualThrust: number | undefined = undefined,
  ): FlyUpdateResult {
    const requestedTurn = manualTurn !== 0 ? manualTurn : command.turn;
    const thrust = manualThrust ?? command.thrust;
    const evade = command.evade;
    if (evade) {
      this.evadeTimer = Math.max(this.evadeTimer, 0.22);
    }
    this.evadeTimer = Math.max(0, this.evadeTimer - dt);
    const turnRate = this.evadeTimer > 0 ? 3.7 : 2.65;
    this.heading += requestedTurn * turnRate * dt;
    const targetSpeed = 2.4 + clamp(thrust, 0, 1) * 5.6;
    this.speed += (targetSpeed - this.speed) * Math.min(1, dt * 4.5);
    const direction = new Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const lateral = new Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
    const dodge = this.evadeTimer > 0 ? lateral.multiplyScalar(Math.sin(this.heading * 3) * 2.2) : new Vector3();
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
    this.group.rotation.z = -requestedTurn * 0.09;
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
    this.group.visible = true;
  }

  public forwardVector(): Vector3 {
    return new Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  public rightVector(): Vector3 {
    return new Vector3(Math.cos(this.heading), 0, -Math.sin(this.heading));
  }

  public tint(color: number): void {
    (this.body.material as MeshStandardMaterial).color = new Color(color);
  }
}
