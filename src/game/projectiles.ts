import {
  AdditiveBlending,
  Color,
  Mesh,
  MeshBasicMaterial,
  SphereGeometry,
  Vector3,
  type Object3D,
  type Scene,
} from 'three';
import { sphereSphere } from './collisions.ts';

export type ProjectileOwner = 'fly' | 'enemy';

export interface ProjectileOptions {
  owner: ProjectileOwner;
  damage: number;
  speed: number;
  radius?: number;
  lifetime?: number;
  color?: number;
}

export interface Projectile {
  mesh: Mesh;
  velocity: Vector3;
  owner: ProjectileOwner;
  damage: number;
  radius: number;
  lifetime: number;
  maxLifetime: number;
  active: boolean;
}

export class ProjectilePool {
  public readonly items: Projectile[] = [];
  private readonly geometry = new SphereGeometry(0.12, 10, 8);
  private readonly scene: Scene;

  public constructor(scene: Scene, initialCapacity = 24) {
    this.scene = scene;
    for (let index = 0; index < initialCapacity; index += 1) {
      this.items.push(this.createInactive());
    }
  }

  private createInactive(): Projectile {
    const material = new MeshBasicMaterial({
      color: 0x4ff6ff,
      transparent: true,
      opacity: 0.95,
      blending: AdditiveBlending,
    });
    const mesh = new Mesh(this.geometry, material);
    mesh.visible = false;
    this.scene.add(mesh);
    return {
      mesh,
      velocity: new Vector3(),
      owner: 'fly',
      damage: 1,
      radius: 0.12,
      lifetime: 0,
      maxLifetime: 0,
      active: false,
    };
  }

  private findFree(): Projectile {
    const free = this.items.find((item) => !item.active);
    if (free) {
      return free;
    }
    const extra = this.createInactive();
    this.items.push(extra);
    return extra;
  }

  public fire(position: Vector3, direction: Vector3, options: ProjectileOptions): Projectile {
    const projectile = this.findFree();
    projectile.owner = options.owner;
    projectile.damage = options.damage;
    projectile.radius = options.radius ?? 0.12;
    projectile.maxLifetime = options.lifetime ?? 2.2;
    projectile.lifetime = projectile.maxLifetime;
    projectile.velocity.copy(direction).normalize().multiplyScalar(options.speed);
    projectile.mesh.position.copy(position);
    projectile.mesh.scale.setScalar(projectile.radius / 0.12);
    projectile.mesh.visible = true;
    const material = projectile.mesh.material as MeshBasicMaterial;
    material.color = new Color(options.color ?? (options.owner === 'fly' ? 0x4ff6ff : 0xff3e8c));
    projectile.active = true;
    return projectile;
  }

  public update(dt: number, arenaRadius: number): void {
    for (const projectile of this.items) {
      if (!projectile.active) {
        continue;
      }
      projectile.mesh.position.addScaledVector(projectile.velocity, dt);
      projectile.lifetime -= dt;
      projectile.mesh.rotation.x += dt * 12;
      projectile.mesh.rotation.y += dt * 9;
      const outside = Math.hypot(projectile.mesh.position.x, projectile.mesh.position.z) > arenaRadius + 2;
      if (projectile.lifetime <= 0 || outside) {
        this.deactivate(projectile);
      }
    }
  }

  public hitSphere(position: Vector3, radius: number, owner: ProjectileOwner): Projectile | undefined {
    for (const projectile of this.items) {
      if (
        projectile.active &&
        projectile.owner === owner &&
        sphereSphere(projectile.mesh.position, projectile.radius, position, radius)
      ) {
        return projectile;
      }
    }
    return undefined;
  }

  public consume(projectile: Projectile): void {
    this.deactivate(projectile);
  }

  public clear(): void {
    for (const projectile of this.items) {
      this.deactivate(projectile);
    }
  }

  private deactivate(projectile: Projectile): void {
    projectile.active = false;
    projectile.lifetime = 0;
    projectile.mesh.visible = false;
  }

  public activeCount(owner?: ProjectileOwner): number {
    return this.items.reduce(
      (count, projectile) => count + Number(projectile.active && (!owner || projectile.owner === owner)),
      0,
    );
  }

  public meshes(): Object3D[] {
    return this.items.map((projectile) => projectile.mesh);
  }
}

export class ProjectileTrail {
  public readonly points: Vector3[] = [];
  private readonly maximum = 8;

  public record(position: Vector3): void {
    this.points.push(position.clone());
    while (this.points.length > this.maximum) {
      this.points.shift();
    }
  }

  public latest(): Vector3 | undefined {
    return this.points[this.points.length - 1];
  }
}
