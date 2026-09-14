import {
  AdditiveBlending,
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
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
  private readonly wingLeft: Mesh;
  private readonly wingRight: Mesh;
  private readonly wingGlowLeft: Mesh;
  private readonly wingGlowRight: Mesh;
  private readonly body: Mesh;
  private readonly head: Mesh;
  private wingPhase = 0;
  private hurtFlash = 0;
  private evadeTimer = 0;
  private readonly insectRig: InsectRig;

  public constructor(scene: Scene) {
    this.insectRig = createInsectMesh('fly', 0.4);
    this.insectRig.root.scale.setScalar(1.12);
    this.group.add(this.insectRig.root);
    this.body = new Mesh(
      new SphereGeometry(0.54, 20, 14),
      new MeshStandardMaterial({
        color: 0x2ad8bd,
        emissive: 0x0b6059,
        emissiveIntensity: 1.4,
        roughness: 0.4,
        metalness: 0.5,
      }),
    );
    this.body.scale.set(1.45, 0.72, 1);
    this.group.add(this.body);

    this.head = new Mesh(
      new SphereGeometry(0.38, 16, 12),
      new MeshStandardMaterial({
        color: 0x202941,
        emissive: 0x131933,
        emissiveIntensity: 1.4,
      }),
    );
    this.head.position.z = -0.56;
    this.group.add(this.head);
    this.createEyes();
    this.createAntennae();

    const wingMaterial = new MeshStandardMaterial({
      color: 0x85f7ff,
      emissive: 0x147f9e,
      emissiveIntensity: 1.2,
      transparent: true,
      opacity: 0.36,
      side: 2,
    });
    this.wingLeft = new Mesh(new PlaneGeometry(1.7, 0.7), wingMaterial);
    this.wingRight = new Mesh(new PlaneGeometry(1.7, 0.7), wingMaterial.clone());
    this.wingLeft.position.set(-0.68, 0.38, 0.05);
    this.wingRight.position.set(0.68, 0.38, 0.05);
    this.wingLeft.rotation.y = -0.18;
    this.wingRight.rotation.y = 0.18;
    this.group.add(this.wingLeft, this.wingRight);

    const glowMaterial = new MeshBasicMaterial({
      color: 0x49f2ff,
      transparent: true,
      opacity: 0.46,
      blending: AdditiveBlending,
      side: 2,
    });
    this.wingGlowLeft = new Mesh(new PlaneGeometry(1.8, 0.08), glowMaterial);
    this.wingGlowRight = new Mesh(new PlaneGeometry(1.8, 0.08), glowMaterial.clone());
    this.wingGlowLeft.position.set(-0.68, 0.4, 0.03);
    this.wingGlowRight.position.set(0.68, 0.4, 0.03);
    this.group.add(this.wingGlowLeft, this.wingGlowRight);

    const abdomenStripe = new Mesh(
      new BoxGeometry(0.65, 0.12, 0.7),
      new MeshBasicMaterial({ color: 0xffd447 }),
    );
    abdomenStripe.position.y = 0.13;
    this.group.add(abdomenStripe);
    this.group.position.set(0, 0.9, 0);
    scene.add(this.group);
  }

  private createEyes(): void {
    const eyeMaterial = new MeshStandardMaterial({
      color: 0xff274f,
      emissive: 0xc90842,
      emissiveIntensity: 2.8,
      roughness: 0.2,
    });
    for (const side of [-1, 1]) {
      const eye = new Mesh(new SphereGeometry(0.14, 10, 8), eyeMaterial);
      eye.position.set(side * 0.23, 0.08, -0.82);
      this.group.add(eye);
    }
  }

  private createAntennae(): void {
    const material = new MeshBasicMaterial({ color: 0xffb24a });
    for (const side of [-1, 1]) {
      const antenna = new Mesh(new BoxGeometry(0.025, 0.025, 0.55), material);
      antenna.position.set(side * 0.15, 0.28, -0.84);
      antenna.rotation.x = side * 0.32;
      antenna.rotation.y = side * 0.18;
      this.group.add(antenna);
    }
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
    this.animateWings(dt);
    animateInsect(this.insectRig, dt, Math.max(0.2, this.speed));
    this.updateMuzzle(direction);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);
    (this.body.material as MeshStandardMaterial).emissiveIntensity =
      this.hurtFlash > 0 ? 4.2 : 1.4;
    return {
      wallHit: bounded.collided,
      obstacleHit,
      damage: bounded.collided ? 4 : obstacleHit ? 10 : 0,
    };
  }

  private animateWings(dt: number): void {
    this.wingPhase += dt * 64;
    const flap = Math.sin(this.wingPhase) * 0.34;
    this.wingLeft.rotation.z = -0.22 + flap;
    this.wingRight.rotation.z = 0.22 - flap;
    this.wingGlowLeft.rotation.z = -0.22 + flap;
    this.wingGlowRight.rotation.z = 0.22 - flap;
    const scale = 0.92 + Math.sin(this.wingPhase * 2) * 0.08;
    this.wingLeft.scale.y = scale;
    this.wingRight.scale.y = scale;
  }

  private updateMuzzle(direction: Vector3): void {
    this.muzzle.copy(this.position).addScaledVector(direction, 1.08);
    this.muzzle.y += 0.02;
  }

  public takeDamage(amount: number): boolean {
    this.health = Math.max(0, this.health - amount);
    this.hurtFlash = 0.15;
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
