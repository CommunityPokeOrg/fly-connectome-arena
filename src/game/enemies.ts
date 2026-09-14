import {
  AdditiveBlending,
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Scene,
} from 'three';
import { RNG, clamp } from '../core/rng.ts';
import { sphereSphere } from './collisions.ts';
import { ProjectilePool } from './projectiles.ts';
import { animateInsect, createInsectMesh, flashInsect, killInsect, type InsectRig } from './insects.ts';

export type EnemyKind = 'wasp' | 'beetle' | 'drone';

export interface Enemy {
  id: string;
  group: Group;
  body: Mesh;
  kind: EnemyKind;
  health: number;
  maxHealth: number;
  radius: number;
  speed: number;
  cooldown: number;
  phase: number;
  active: boolean;
  hitFlash: number;
  orbitAngle: number;
  orbitRadius: number;
  insect: InsectRig;
}

export interface Explosion {
  group: Group;
  life: number;
  maxLife: number;
  particles: Mesh[];
}

export class Enemies {
  public readonly items: Enemy[] = [];
  public readonly projectiles: ProjectilePool;
  public readonly explosions: Explosion[] = [];
  private readonly scene: Scene;
  private readonly rng: RNG;
  private readonly explosionGeometry = new SphereGeometry(0.1, 6, 5);
  private waveNumber = 0;
  private elapsed = 0;

  public constructor(scene: Scene, rng: RNG) {
    this.scene = scene;
    this.rng = rng;
    this.projectiles = new ProjectilePool(scene, 36);
  }

  public spawnWave(wave: number, arenaRadius: number): void {
    this.waveNumber = wave;
    const count = Math.min(14, 2 + Math.floor(wave * 1.2));
    for (let index = 0; index < count; index += 1) {
      this.spawnEnemy(index, wave, arenaRadius);
    }
  }

  private spawnEnemy(index: number, wave: number, arenaRadius: number): void {
    const kind: EnemyKind = index % 3 === 0 ? 'drone' : index % 3 === 1 ? 'wasp' : 'beetle';
    const angle = this.rng.range(-Math.PI, Math.PI);
    const distance = this.rng.range(arenaRadius * 0.55, arenaRadius - 2);
    const group = new Group();
    const body = this.createEnemyMesh(kind, index);
    const insect = createInsectMesh(kind === 'drone' ? 'drone-hornet' : kind, index * 0.7);
    insect.root.scale.setScalar(kind === 'beetle' ? 1.25 : kind === 'drone' ? 1.08 : 1);
    group.add(body);
    group.add(insect.root);
    group.position.set(Math.cos(angle) * distance, kind === 'drone' ? 1.5 : 1.1, Math.sin(angle) * distance);
    this.scene.add(group);
    const health = kind === 'drone'
      ? 3 + Math.floor(wave / 3)
      : kind === 'beetle' ? 4 + Math.floor(wave / 2) : 1 + Math.floor(wave / 5);
    this.items.push({
      id: `wave-${wave}-enemy-${index}-${this.items.length}`,
      group,
      body,
      kind,
      health,
      maxHealth: health,
      radius: kind === 'drone' ? 0.68 : 0.46,
      speed: (kind === 'drone' ? 1.1 : kind === 'beetle' ? 0.85 : 2.2) + Math.min(1.4, wave * 0.06),
      cooldown: this.rng.range(0.4, 1.5),
      phase: this.rng.range(0, Math.PI * 2),
      active: true,
      hitFlash: 0,
      orbitAngle: angle,
      orbitRadius: distance,
      insect,
    });
  }

  private createEnemyMesh(kind: EnemyKind, index: number): Mesh {
    if (kind === 'wasp' || kind === 'beetle') {
      const body = new Mesh(
        new SphereGeometry(0.42, 12, 8),
        new MeshStandardMaterial({
          color: kind === 'beetle' ? 0x15516d : 0xf36b28,
          emissive: 0x7b180c,
          emissiveIntensity: 1.7,
        }),
      );
      body.scale.set(kind === 'beetle' ? 1.2 : 1.5, kind === 'beetle' ? 0.9 : 0.7, 0.8);
      const wingMaterial = new MeshBasicMaterial({
        color: 0xffc04d,
        transparent: true,
        opacity: 0.48,
        side: 2,
      });
      const wingGeometry = new TorusGeometry(kind === 'beetle' ? 0.34 : 0.42, 0.045, 5, 18, Math.PI);
      const wingLeft = new Mesh(wingGeometry, wingMaterial);
      const wingRight = new Mesh(wingGeometry, wingMaterial.clone());
      wingLeft.position.x = -0.33;
      wingRight.position.x = 0.33;
      wingLeft.rotation.y = Math.PI / 2;
      wingRight.rotation.y = -Math.PI / 2;
      body.add(wingLeft, wingRight);
      return body;
    }
    const material = new MeshStandardMaterial({
      color: index % 2 === 0 ? 0x923fff : 0x355bff,
      emissive: 0x321184,
      emissiveIntensity: 2,
      metalness: 0.6,
      roughness: 0.25,
    });
    const body = new Mesh(new ConeGeometry(0.62, 1.1, 8), material);
    body.rotation.x = Math.PI / 2;
    const eye = new Mesh(
      new SphereGeometry(0.15, 8, 6),
      new MeshBasicMaterial({ color: 0xffec61, blending: AdditiveBlending }),
    );
    eye.position.z = -0.48;
    body.add(eye);
    const light = new PointLight(0x894aff, 2, 4);
    light.position.z = 0.1;
    body.add(light);
    return body;
  }

  public update(dt: number, flyPosition: Vector3, arenaRadius: number): void {
    this.elapsed += dt;
    for (const enemy of this.items) {
      if (!enemy.active) {
        if (enemy.insect.deathTimer > 0) {
          animateInsect(enemy.insect, dt, 0);
          if (enemy.insect.deathTimer <= 0) enemy.group.visible = false;
        }
        continue;
      }
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
      const dx = flyPosition.x - enemy.group.position.x;
      const dz = flyPosition.z - enemy.group.position.z;
      const distance = Math.hypot(dx, dz);
      if (enemy.kind === 'wasp') {
        this.updateWasp(enemy, dx, dz, dt);
      } else if (enemy.kind === 'beetle') {
        this.updateBeetle(enemy, dx, dz, distance, dt);
      } else {
        this.updateDrone(enemy, flyPosition, distance, dt);
      }
      enemy.group.position.x = clamp(enemy.group.position.x, -arenaRadius + 1, arenaRadius - 1);
      enemy.group.position.z = clamp(enemy.group.position.z, -arenaRadius + 1, arenaRadius - 1);
      enemy.group.position.y = enemy.kind === 'drone'
        ? 1.35 + Math.sin(this.elapsed * 2 + enemy.phase) * 0.3
        : 1.05 + Math.sin(this.elapsed * 6 + enemy.phase) * 0.16;
      enemy.group.rotation.y += dt * (enemy.kind === 'drone' ? 0.4 : 2.8);
      const material = enemy.body.material as MeshStandardMaterial;
      material.emissiveIntensity = enemy.hitFlash > 0 ? 6 : 1.7;
      animateInsect(enemy.insect, dt, enemy.speed);
    }
    this.projectiles.update(dt, arenaRadius);
    this.updateExplosions(dt);
  }

  private updateWasp(enemy: Enemy, dx: number, dz: number, dt: number): void {
    const distance = Math.max(0.001, Math.hypot(dx, dz));
    const side = Math.sin(this.elapsed * 4 + enemy.phase) * 0.32;
    enemy.group.position.x += (dx / distance * enemy.speed + (-dz / distance) * side) * dt;
    enemy.group.position.z += (dz / distance * enemy.speed + (dx / distance) * side) * dt;
  }

  private updateBeetle(enemy: Enemy, dx: number, dz: number, distance: number, dt: number): void {
    const normalized = Math.max(0.001, distance);
    const ram = distance < 5 ? 1.25 : 0.72;
    enemy.group.position.x += (dx / normalized) * enemy.speed * ram * dt;
    enemy.group.position.z += (dz / normalized) * enemy.speed * ram * dt;
  }

  private updateDrone(enemy: Enemy, flyPosition: Vector3, distance: number, dt: number): void {
    enemy.orbitAngle += dt * 0.35;
    const desiredX = flyPosition.x + Math.cos(enemy.orbitAngle + enemy.phase) * Math.min(8, enemy.orbitRadius);
    const desiredZ = flyPosition.z + Math.sin(enemy.orbitAngle + enemy.phase) * Math.min(8, enemy.orbitRadius);
    enemy.group.position.x += (desiredX - enemy.group.position.x) * dt * 0.55;
    enemy.group.position.z += (desiredZ - enemy.group.position.z) * dt * 0.55;
    enemy.cooldown -= dt;
    if (enemy.cooldown <= 0 && distance < 15) {
      const direction = flyPosition.clone().sub(enemy.group.position).normalize();
      this.projectiles.fire(enemy.group.position, direction, {
        owner: 'enemy',
        damage: 17,
        speed: 7.5 + Math.min(4, this.waveNumber * 0.15),
        radius: 0.14,
        lifetime: 4,
        color: 0xff327c,
      });
      enemy.cooldown = Math.max(0.65, 1.7 - this.waveNumber * 0.04);
    }
  }

  public hit(position: Vector3, radius: number, damage: number): Enemy | undefined {
    for (const enemy of this.items) {
      if (!enemy.active || !sphereSphere(enemy.group.position, enemy.radius, position, radius)) {
        continue;
      }
      enemy.health -= damage;
      enemy.hitFlash = 0.12;
      flashInsect(enemy.insect);
      const away = enemy.group.position.clone().sub(position).normalize();
      enemy.group.position.addScaledVector(away, 0.3);
      if (enemy.health <= 0) {
        this.kill(enemy);
      }
      return enemy;
    }
    return undefined;
  }

  private kill(enemy: Enemy): void {
    enemy.active = false;
    enemy.group.visible = true;
    killInsect(enemy.insect);
    this.createExplosion(enemy.group.position, enemy.kind === 'drone' ? 0xff45d0 : 0xff8b3e);
  }

  public eliminate(id: string): Enemy | undefined {
    const enemy = this.items.find((item) => item.id === id && item.active);
    if (enemy) this.kill(enemy);
    return enemy;
  }

  private createExplosion(position: Vector3, color: number): void {
    const group = new Group();
    group.position.copy(position);
    const particles: Mesh[] = [];
    for (let index = 0; index < 18; index += 1) {
      const material = new MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: AdditiveBlending });
      const particle = new Mesh(this.explosionGeometry, material);
      particle.userData.velocity = new Vector3(
        this.rng.range(-3, 3),
        this.rng.range(-1, 3),
        this.rng.range(-3, 3),
      );
      group.add(particle);
      particles.push(particle);
    }
    const light = new PointLight(color, 6, 5);
    group.add(light);
    this.scene.add(group);
    this.explosions.push({ group, life: 0.7, maxLife: 0.7, particles });
  }

  private updateExplosions(dt: number): void {
    for (const explosion of this.explosions) {
      explosion.life -= dt;
      for (const particle of explosion.particles) {
        const velocity = particle.userData.velocity as Vector3;
        velocity.y -= dt * 3;
        particle.position.addScaledVector(velocity, dt);
        particle.scale.setScalar(Math.max(0.1, explosion.life / explosion.maxLife));
        (particle.material as MeshBasicMaterial).opacity = Math.max(0, explosion.life / explosion.maxLife);
      }
      explosion.group.scale.multiplyScalar(1 + dt * 1.5);
    }
    for (let index = this.explosions.length - 1; index >= 0; index -= 1) {
      const explosion = this.explosions[index];
      if (explosion && explosion.life <= 0) {
        this.scene.remove(explosion.group);
        this.explosions.splice(index, 1);
      }
    }
  }

  public remaining(): number {
    return this.items.reduce((count, enemy) => count + Number(enemy.active), 0);
  }

  public activeEntities(): { x: number; z: number; radius: number; kind: 'enemy' }[] {
    return this.items
      .filter((enemy) => enemy.active)
      .map((enemy) => ({
        x: enemy.group.position.x,
        z: enemy.group.position.z,
        radius: enemy.radius,
        kind: 'enemy' as const,
      }));
  }

  public projectileEntities(): { x: number; z: number; radius: number; kind: 'projectile' }[] {
    return this.projectiles.items
      .filter((projectile) => projectile.active && projectile.owner === 'enemy')
      .map((projectile) => ({
        x: projectile.mesh.position.x,
        z: projectile.mesh.position.z,
        radius: projectile.radius,
        kind: 'projectile' as const,
      }));
  }

  public reset(): void {
    for (const enemy of this.items) {
      enemy.active = false;
      enemy.group.visible = false;
    }
    this.projectiles.clear();
    for (const explosion of this.explosions) {
      this.scene.remove(explosion.group);
    }
    this.explosions.length = 0;
  }
}
