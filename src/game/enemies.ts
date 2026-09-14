import {
  Group,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  SphereGeometry,
  Vector3,
  type Scene,
} from 'three';
import { RNG, clamp } from '../core/rng.ts';
import { sphereSphere } from './collisions.ts';
import { ProjectilePool } from './projectiles.ts';
import { animateInsect, createInsectMesh, flashInsect, killInsect, type InsectRig } from './insects.ts';
import {
  alignment,
  avoidCircles,
  cohesion,
  containWithinCircle,
  headingOf,
  integrate,
  pursue,
  seek,
  separation,
  turnToward,
  wander,
  type SteeringAgent,
  type Vec2,
  type WanderState,
} from './steering.ts';

export type EnemyKind = 'wasp' | 'beetle' | 'drone';
export type EnemyMode =
  | 'roam'
  | 'stalk'
  | 'dash'
  | 'recover'
  | 'evade'
  | 'charge'
  | 'windup'
  | 'strafe';

export interface Enemy {
  id: string;
  group: Group;
  kind: EnemyKind;
  health: number;
  maxHealth: number;
  radius: number;
  speed: number;
  cooldown: number;
  phase: number;
  active: boolean;
  hitFlash: number;
  insect: InsectRig;
  velocity: Vector3;
  wander: WanderState;
  mode: EnemyMode;
  modeTimer: number;
  yaw: number;
  dashDir: Vec2;
  orbitDir: number;
  orbitAngle: number;
  flipTimer: number;
  strafeTimer: number;
  evadeSide: number;
}

export interface Explosion {
  group: Group;
  life: number;
  maxLife: number;
  particles: Mesh[];
  light: PointLight;
}

const CONTAIN_MARGIN = 2.5;

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
    const insect = createInsectMesh(kind === 'drone' ? 'drone-hornet' : kind, index * 0.7);
    insect.root.scale.setScalar(kind === 'beetle' ? 1.25 : kind === 'drone' ? 1.08 : 1);
    group.add(insect.root);
    group.position.set(Math.cos(angle) * distance, kind === 'drone' ? 1.5 : 1.1, Math.sin(angle) * distance);
    this.scene.add(group);
    const health = kind === 'drone'
      ? 3 + Math.floor(wave / 3)
      : kind === 'beetle' ? 4 + Math.floor(wave / 2) : 1 + Math.floor(wave / 5);
    const maxSpeed = kind === 'wasp'
      ? 4.2 + wave * 0.08
      : kind === 'beetle' ? 1.6 : 2.6;
    const x = group.position.x;
    const z = group.position.z;
    this.items.push({
      id: `wave-${wave}-enemy-${index}-${this.items.length}`,
      group,
      kind,
      health,
      maxHealth: health,
      radius: kind === 'drone' ? 0.68 : 0.46,
      speed: maxSpeed,
      cooldown: this.rng.range(0.4, 1.5),
      phase: this.rng.range(0, Math.PI * 2),
      active: true,
      hitFlash: 0,
      insect,
      velocity: new Vector3(),
      wander: { angle: this.rng.range(0, Math.PI * 2) },
      mode: 'roam',
      modeTimer: this.rng.range(3, 6),
      yaw: Math.atan2(-x, -z),
      dashDir: { x: 0, z: 1 },
      orbitDir: this.rng.chance(0.5) ? 1 : -1,
      orbitAngle: angle,
      flipTimer: this.rng.range(1, 2),
      strafeTimer: this.rng.range(3, 5),
      evadeSide: 1,
    });
  }

  public update(
    dt: number,
    flyPosition: Vector3,
    flyVelocity: Vector3,
    arenaRadius: number,
    obstacles: readonly { x: number; z: number; radius: number }[],
  ): void {
    this.elapsed += dt;
    const threats = this.projectileThreats();
    for (const enemy of this.items) {
      if (!enemy.active) {
        if (enemy.insect.deathTimer > 0) {
          animateInsect(enemy.insect, dt, 0);
          if (enemy.insect.deathTimer <= 0) enemy.group.visible = false;
        }
        continue;
      }
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
      enemy.modeTimer -= dt;
      const agent = this.agentFor(enemy);
      if (enemy.kind === 'wasp') {
        this.updateWasp(enemy, agent, flyPosition, flyVelocity, threats, arenaRadius, dt);
      } else if (enemy.kind === 'beetle') {
        this.updateBeetle(enemy, agent, flyPosition, obstacles, arenaRadius, dt);
      } else {
        this.updateDrone(enemy, agent, flyPosition, threats, arenaRadius, dt);
      }
      enemy.velocity.set(agent.velocity.x, 0, agent.velocity.z);
      enemy.group.position.x = clamp(agent.position.x, -arenaRadius + 1, arenaRadius - 1);
      enemy.group.position.z = clamp(agent.position.z, -arenaRadius + 1, arenaRadius - 1);
      enemy.group.position.y = enemy.kind === 'drone'
        ? 1.35 + Math.sin(this.elapsed * 2 + enemy.phase) * 0.3
        : enemy.kind === 'beetle'
          ? 0.55
          : 1.05 + Math.sin(this.elapsed * 6 + enemy.phase) * 0.16;
      const targetYaw = headingOf(agent.velocity, enemy.yaw);
      const newYaw = turnToward(enemy.yaw, targetYaw, dt * 7);
      const yawRate = dt > 0 ? (newYaw - enemy.yaw) / dt : 0;
      enemy.yaw = newYaw;
      enemy.group.rotation.y = enemy.yaw;
      if (enemy.kind !== 'beetle') {
        enemy.group.rotation.z = -clamp(yawRate * 0.15, -0.5, 0.5);
      }
      animateInsect(enemy.insect, dt, Math.hypot(agent.velocity.x, agent.velocity.z));
    }
    this.projectiles.update(dt, arenaRadius);
    this.updateExplosions(dt);
  }

  private agentFor(enemy: Enemy): SteeringAgent {
    return {
      position: { x: enemy.group.position.x, z: enemy.group.position.z },
      velocity: { x: enemy.velocity.x, z: enemy.velocity.z },
      maxSpeed: enemy.speed,
      maxForce: enemy.speed * 3,
    };
  }

  private sum(...forces: Vec2[]): Vec2 {
    const total = { x: 0, z: 0 };
    for (const force of forces) {
      total.x += force.x;
      total.z += force.z;
    }
    return total;
  }

  private waspNeighbors(enemy: Enemy): { positions: Vec2[]; velocities: Vec2[] } {
    const positions: Vec2[] = [];
    const velocities: Vec2[] = [];
    for (const other of this.items) {
      if (other === enemy || !other.active || other.kind !== 'wasp') {
        continue;
      }
      positions.push({ x: other.group.position.x, z: other.group.position.z });
      velocities.push({ x: other.velocity.x, z: other.velocity.z });
    }
    return { positions, velocities };
  }

  private updateWasp(
    enemy: Enemy,
    agent: SteeringAgent,
    flyPosition: Vector3,
    flyVelocity: Vector3,
    threats: readonly { x: number; z: number; vx: number; vz: number }[],
    arenaRadius: number,
    dt: number,
  ): void {
    const fly = { x: flyPosition.x, z: flyPosition.z };
    const distance = Math.hypot(fly.x - agent.position.x, fly.z - agent.position.z);
    const { positions, velocities } = this.waspNeighbors(enemy);
    const sep = separation(agent, positions, 1.6);
    const contain = containWithinCircle(agent, arenaRadius, CONTAIN_MARGIN);

    // Jink away from incoming fly fire.
    if (enemy.mode !== 'evade' && this.threatenedBy(agent, threats, 2.5)) {
      enemy.mode = 'evade';
      enemy.modeTimer = 0.3;
      enemy.evadeSide = this.rng.chance(0.5) ? 1 : -1;
    }

    let force: Vec2;
    switch (enemy.mode) {
      case 'evade': {
        const side = perpendicular(agent.velocity, enemy.evadeSide);
        force = this.sum(
          { x: side.x * agent.maxForce * 1.4, z: side.z * agent.maxForce * 1.4 },
          contain,
        );
        if (enemy.modeTimer <= 0) {
          enemy.mode = 'stalk';
          enemy.modeTimer = this.rng.range(1.5, 3);
          enemy.flipTimer = this.rng.range(1, 2);
        }
        break;
      }
      case 'stalk': {
        agent.maxSpeed = enemy.speed * 0.8;
        enemy.flipTimer -= dt;
        if (enemy.flipTimer <= 0) {
          enemy.orbitDir = -enemy.orbitDir;
          enemy.flipTimer = this.rng.range(1, 2);
        }
        // Aim beside the fly rather than at it so the orbit direction keeps
        // changing instead of settling into a fixed circle.
        const toFly = { x: fly.x - agent.position.x, z: fly.z - agent.position.z };
        const d = Math.max(0.001, Math.hypot(toFly.x, toFly.z));
        const target = {
          x: fly.x + (-toFly.z / d) * enemy.orbitDir * 2.2,
          z: fly.z + (toFly.x / d) * enemy.orbitDir * 2.2,
        };
        force = this.sum(
          scale(pursue(agent, target, { x: flyVelocity.x, z: flyVelocity.z }), 1),
          wander(agent, enemy.wander, dt, () => this.rng.next()),
          scale(sep, -1.4),
          scale(contain, 2),
        );
        if (enemy.modeTimer <= 0 && distance < 7) {
          const prediction = Math.min(1.2, distance / Math.max(0.001, agent.maxSpeed));
          const aim = {
            x: fly.x + flyVelocity.x * prediction - agent.position.x,
            z: fly.z + flyVelocity.z * prediction - agent.position.z,
          };
          const aimLength = Math.max(0.001, Math.hypot(aim.x, aim.z));
          enemy.dashDir = { x: aim.x / aimLength, z: aim.z / aimLength };
          enemy.mode = 'dash';
          enemy.modeTimer = 0.45;
        }
        break;
      }
      case 'dash': {
        agent.maxSpeed = enemy.speed * 2.2;
        force = {
          x: enemy.dashDir.x * agent.maxForce,
          z: enemy.dashDir.z * agent.maxForce,
        };
        if (enemy.modeTimer <= 0) {
          enemy.mode = 'recover';
          enemy.modeTimer = this.rng.range(0.8, 1.4);
        }
        break;
      }
      case 'recover': {
        force = this.sum(
          wander(agent, enemy.wander, dt, () => this.rng.next()),
          scale(contain, 2),
        );
        integrate(agent, force, dt, 2.5);
        if (enemy.modeTimer <= 0) {
          enemy.mode = distance < 9 ? 'stalk' : 'roam';
          enemy.modeTimer = enemy.mode === 'stalk' ? this.rng.range(1.5, 3) : this.rng.range(3, 6);
        }
        return;
      }
      default: {
        // roam: loose flocking with a weak draw toward the fly.
        force = this.sum(
          wander(agent, enemy.wander, dt, () => this.rng.next()),
          scale(cohesion(agent, positions), 0.6),
          scale(alignment(agent, velocities), 0.5),
          scale(sep, -1.4),
          scale(seek(agent, fly), 0.35),
          scale(contain, 2),
        );
        if (distance < 9 || enemy.modeTimer <= 0) {
          enemy.mode = 'stalk';
          enemy.modeTimer = this.rng.range(1.5, 3);
          enemy.flipTimer = this.rng.range(1, 2);
        }
        break;
      }
    }
    integrate(agent, force, dt);
  }

  private updateBeetle(
    enemy: Enemy,
    agent: SteeringAgent,
    flyPosition: Vector3,
    obstacles: readonly { x: number; z: number; radius: number }[],
    arenaRadius: number,
    dt: number,
  ): void {
    const fly = { x: flyPosition.x, z: flyPosition.z };
    const distance = Math.hypot(fly.x - agent.position.x, fly.z - agent.position.z);
    // Containment dominates everything else so rams never pin on the wall.
    const contain = scale(containWithinCircle(agent, arenaRadius, CONTAIN_MARGIN), 3);

    let force: Vec2;
    let damping = 0;
    switch (enemy.mode) {
      case 'windup': {
        damping = 6;
        force = contain;
        if (enemy.modeTimer <= 0) {
          const aim = {
            x: fly.x - agent.position.x,
            z: fly.z - agent.position.z,
          };
          const aimLength = Math.max(0.001, Math.hypot(aim.x, aim.z));
          enemy.dashDir = { x: aim.x / aimLength, z: aim.z / aimLength };
          enemy.mode = 'charge';
          enemy.modeTimer = 0.9;
        }
        break;
      }
      case 'charge': {
        agent.maxSpeed = enemy.speed * 3.2;
        force = this.sum(
          { x: enemy.dashDir.x * agent.maxForce, z: enemy.dashDir.z * agent.maxForce },
          contain,
        );
        if (enemy.modeTimer <= 0) {
          enemy.mode = 'recover';
          enemy.modeTimer = 1.2;
        }
        break;
      }
      case 'recover': {
        damping = 2.5;
        force = this.sum(
          wander(agent, enemy.wander, dt, () => this.rng.next()),
          contain,
        );
        if (enemy.modeTimer <= 0) {
          enemy.mode = 'roam';
          enemy.modeTimer = this.rng.range(3, 6);
        }
        break;
      }
      default: {
        agent.maxSpeed = enemy.speed;
        force = this.sum(
          wander(agent, enemy.wander, dt, () => this.rng.next()),
          scale(seek(agent, fly), 0.5),
          avoidCircles(agent, obstacles, 2.2),
          contain,
        );
        if (distance < 6) {
          const speed = Math.hypot(agent.velocity.x, agent.velocity.z);
          if (speed > 0.2) {
            const dot = ((agent.velocity.x / speed) * (fly.x - agent.position.x)
              + (agent.velocity.z / speed) * (fly.z - agent.position.z)) / Math.max(0.001, distance);
            if (dot > 0.8) {
              enemy.mode = 'windup';
              enemy.modeTimer = 0.5;
            }
          }
        }
        break;
      }
    }
    integrate(agent, force, dt, damping);
  }

  private updateDrone(
    enemy: Enemy,
    agent: SteeringAgent,
    flyPosition: Vector3,
    threats: readonly { x: number; z: number; vx: number; vz: number }[],
    arenaRadius: number,
    dt: number,
  ): void {
    const fly = { x: flyPosition.x, z: flyPosition.z };
    const distance = Math.hypot(fly.x - agent.position.x, fly.z - agent.position.z);
    const allPositions = this.items
      .filter((other) => other !== enemy && other.active)
      .map((other) => ({ x: other.group.position.x, z: other.group.position.z }));
    const sep = separation(agent, allPositions, 2.4);
    const contain = scale(containWithinCircle(agent, arenaRadius, CONTAIN_MARGIN), 2);

    if (enemy.mode !== 'evade' && this.threatenedBy(agent, threats, 2.5)) {
      enemy.mode = 'evade';
      enemy.modeTimer = 0.3;
      enemy.evadeSide = this.rng.chance(0.5) ? 1 : -1;
    }

    let force: Vec2;
    if (enemy.mode === 'evade') {
      const side = perpendicular(agent.velocity, enemy.evadeSide);
      force = this.sum(
        { x: side.x * agent.maxForce * 1.4, z: side.z * agent.maxForce * 1.4 },
        contain,
      );
      if (enemy.modeTimer <= 0) {
        enemy.mode = 'roam';
      }
    } else if (enemy.mode === 'strafe') {
      const toFly = normalize2(fly.x - agent.position.x, fly.z - agent.position.z);
      const side = { x: -toFly.z * enemy.orbitDir, z: toFly.x * enemy.orbitDir };
      force = this.sum(
        { x: side.x * agent.maxForce, z: side.z * agent.maxForce },
        scale(sep, -1.2),
        contain,
      );
      if (enemy.modeTimer <= 0) {
        enemy.mode = 'roam';
      }
    } else {
      // Loose standoff ring: the orbit angle drifts on wander noise and
      // periodically reverses, so the hover path never becomes a fixed circle.
      enemy.flipTimer -= dt;
      if (enemy.flipTimer <= 0) {
        enemy.orbitDir = -enemy.orbitDir;
        enemy.flipTimer = this.rng.range(2, 4);
      }
      enemy.orbitAngle += dt * enemy.orbitDir * 0.5 + (this.rng.next() - 0.5) * dt * 4;
      const standoff = 7.5;
      const target = {
        x: fly.x + Math.cos(enemy.orbitAngle + enemy.phase) * standoff,
        z: fly.z + Math.sin(enemy.orbitAngle + enemy.phase) * standoff,
      };
      force = this.sum(
        seek(agent, target, 2.5),
        wander(agent, enemy.wander, dt, () => this.rng.next()),
        scale(sep, -1.2),
        contain,
      );
      enemy.strafeTimer -= dt;
      if (enemy.strafeTimer <= 0) {
        enemy.mode = 'strafe';
        enemy.modeTimer = 0.4;
        enemy.strafeTimer = this.rng.range(3, 5);
      }
    }
    integrate(agent, force, dt);

    enemy.cooldown -= dt;
    if (enemy.cooldown <= 0 && distance < 15) {
      const direction = flyPosition.clone().sub(enemy.group.position).normalize();
      this.projectiles.fire(enemy.group.position, direction, {
        owner: 'enemy',
        damage: 17,
        speed: 7.5 + Math.min(4, this.waveNumber * 0.15),
        radius: 0.14,
        lifetime: 4,
        color: 0xc0602a,
      });
      enemy.cooldown = Math.max(0.65, 1.7 - this.waveNumber * 0.04);
    }
  }

  private threatenedBy(
    agent: SteeringAgent,
    threats: readonly { x: number; z: number; vx: number; vz: number }[],
    radius: number,
  ): boolean {
    for (const threat of threats) {
      const dx = agent.position.x - threat.x;
      const dz = agent.position.z - threat.z;
      const distance = Math.hypot(dx, dz);
      if (distance > radius || distance < 1e-4) {
        continue;
      }
      const approaching = (threat.vx * dx + threat.vz * dz) / distance > 0;
      if (approaching) {
        return true;
      }
    }
    return false;
  }

  public projectileThreats(): { x: number; z: number; vx: number; vz: number }[] {
    return this.projectiles.items
      .filter((projectile) => projectile.active && projectile.owner === 'fly')
      .map((projectile) => ({
        x: projectile.mesh.position.x,
        z: projectile.mesh.position.z,
        vx: projectile.velocity.x,
        vz: projectile.velocity.z,
      }));
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
      enemy.velocity.addScaledVector(away, 3);
      if (enemy.kind !== 'beetle' && enemy.mode !== 'dash') {
        enemy.mode = 'evade';
        enemy.modeTimer = 0.3;
        enemy.evadeSide = this.rng.chance(0.5) ? 1 : -1;
      }
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
    this.createExplosion(enemy.group.position);
  }

  public eliminate(id: string): Enemy | undefined {
    const enemy = this.items.find((item) => item.id === id && item.active);
    if (enemy) this.kill(enemy);
    return enemy;
  }

  private createExplosion(position: Vector3): void {
    const group = new Group();
    group.position.copy(position);
    const particles: Mesh[] = [];
    for (let index = 0; index < 18; index += 1) {
      const ember = index % 4 === 0;
      const material = new MeshStandardMaterial({
        color: ember ? 0xd9a441 : 0x241d16,
        emissive: ember ? 0xd9a441 : 0x000000,
        emissiveIntensity: ember ? 1.6 : 0,
        roughness: 0.7,
        transparent: true,
        opacity: 1,
      });
      const particle = new Mesh(this.explosionGeometry, material);
      particle.userData.velocity = new Vector3(
        this.rng.range(-3, 3),
        this.rng.range(-1, 3),
        this.rng.range(-3, 3),
      );
      group.add(particle);
      particles.push(particle);
    }
    const light = new PointLight(0xd9a441, 2, 5);
    group.add(light);
    this.scene.add(group);
    this.explosions.push({ group, life: 0.7, maxLife: 0.7, particles, light });
  }

  private updateExplosions(dt: number): void {
    for (const explosion of this.explosions) {
      explosion.life -= dt;
      const t = Math.max(0, explosion.life / explosion.maxLife);
      for (const particle of explosion.particles) {
        const velocity = particle.userData.velocity as Vector3;
        velocity.y -= dt * 3;
        particle.position.addScaledVector(velocity, dt);
        particle.scale.setScalar(Math.max(0.1, t));
        (particle.material as MeshStandardMaterial).opacity = t;
      }
      explosion.light.intensity = 2 * t;
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
      enemy.velocity.set(0, 0, 0);
    }
    this.projectiles.clear();
    for (const explosion of this.explosions) {
      this.scene.remove(explosion.group);
    }
    this.explosions.length = 0;
  }
}

function scale(v: Vec2, factor: number): Vec2 {
  return { x: v.x * factor, z: v.z * factor };
}

function perpendicular(v: Vec2, side: number): Vec2 {
  const len = Math.hypot(v.x, v.z);
  if (len < 1e-4) {
    return { x: side, z: 0 };
  }
  return { x: (-v.z / len) * side, z: (v.x / len) * side };
}

function normalize2(x: number, z: number): Vec2 {
  const len = Math.hypot(x, z);
  if (len < 1e-4) {
    return { x: 0, z: 1 };
  }
  return { x: x / len, z: z / len };
}
