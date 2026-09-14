import {
  AdditiveBlending,
  BoxGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  PointLight,
  SphereGeometry,
  TorusGeometry,
  Vector3,
  type Scene,
} from 'three';
import { RNG } from '../core/rng.ts';
import { createWarningStripeTexture } from './textures.ts';

export interface Hazard {
  id: string;
  group: Group;
  x: number;
  z: number;
  radius: number;
  damage: number;
  phase: number;
  kind: 'laser' | 'electric';
  active: boolean;
}

export class Hazards {
  public readonly items: Hazard[] = [];
  private elapsed = 0;

  public constructor(scene: Scene, rng: RNG, arenaRadius: number) {
    const hazardRng = rng.fork(0x9e3779b9);
    for (let index = 0; index < 8; index += 1) {
      const angle = hazardRng.range(-Math.PI, Math.PI);
      const distance = hazardRng.range(5, arenaRadius - 3);
      const kind = index % 2 === 0 ? 'laser' : 'electric';
      const group = new Group();
      group.position.set(Math.cos(angle) * distance, 0, Math.sin(angle) * distance);
      if (kind === 'laser') {
        this.createLaserGate(group, index);
      } else {
        this.createElectricPillar(group, index);
      }
      scene.add(group);
      this.items.push({
        id: `hazard-${index}`,
        group,
        x: group.position.x,
        z: group.position.z,
        radius: kind === 'laser' ? 1.2 : 0.95,
        damage: kind === 'laser' ? 18 : 13,
        phase: hazardRng.range(0, Math.PI * 2),
        kind,
        active: true,
      });
    }
  }

  private createLaserGate(group: Group, index: number): void {
    const frameMaterial = new MeshBasicMaterial({ color: 0x4f3d9e, wireframe: true });
    const warningTexture = createWarningStripeTexture();
    const beamMaterial = new MeshBasicMaterial({
      color: index % 4 === 0 ? 0x37f5ff : 0xff3eae,
      transparent: true,
      opacity: 0.9,
      blending: AdditiveBlending,
      map: warningTexture,
    });
    const frame = new Mesh(new TorusGeometry(1.25, 0.06, 8, 28), frameMaterial);
    frame.rotation.x = Math.PI / 2;
    const beam = new Mesh(new BoxGeometry(2.7, 0.08, 0.08), beamMaterial);
    beam.position.y = 0.72;
    const beamGlow = new Mesh(new BoxGeometry(2.9, 0.16, 0.16), beamMaterial.clone());
    beamGlow.position.y = 0.72;
    group.add(frame, beam, beamGlow);
    const light = new PointLight(index % 4 === 0 ? 0x37f5ff : 0xff3eae, 2.4, 5);
    light.position.y = 0.75;
    group.add(light);
  }

  private createElectricPillar(group: Group, index: number): void {
    const pillarMaterial = new MeshBasicMaterial({
      color: index % 3 === 0 ? 0x52f5d0 : 0xff3cbb,
      wireframe: true,
    });
    const pillar = new Mesh(new BoxGeometry(0.7, 2.7, 0.7), pillarMaterial);
    pillar.position.y = 1.35;
    const coil = new Mesh(
      new TorusGeometry(0.63, 0.035, 6, 24),
      new MeshBasicMaterial({ color: 0xfff071, blending: AdditiveBlending }),
    );
    coil.rotation.x = Math.PI / 2;
    coil.position.y = 1;
    const cap = new Mesh(
      new SphereGeometry(0.23, 10, 8),
      new MeshBasicMaterial({ color: 0xfff6a4, blending: AdditiveBlending }),
    );
    cap.position.y = 2.8;
    group.add(pillar, coil, cap);
    const light = new PointLight(0xff3cbb, 2, 4);
    light.position.y = 1.4;
    group.add(light);
  }

  public update(dt: number): void {
    this.elapsed += dt;
    for (const hazard of this.items) {
      if (!hazard.active) {
        continue;
      }
      hazard.group.rotation.y = hazard.kind === 'laser'
        ? this.elapsed * (0.7 + hazard.phase * 0.05)
        : Math.sin(this.elapsed + hazard.phase) * 0.08;
      const pulse = 0.86 + Math.sin(this.elapsed * 7 + hazard.phase) * 0.14;
      hazard.group.scale.setScalar(pulse);
      hazard.group.position.y = hazard.kind === 'laser'
        ? 0.1 + Math.sin(this.elapsed * 2 + hazard.phase) * 0.12
        : 0;
    }
  }

  public collides(position: Vector3): Hazard | undefined {
    return this.items.find((hazard) => {
      if (!hazard.active) {
        return false;
      }
      const dx = position.x - hazard.x;
      const dz = position.z - hazard.z;
      return dx * dx + dz * dz < (hazard.radius + 0.5) ** 2;
    });
  }

  public entities(): { x: number; z: number; radius: number; kind: 'obstacle' }[] {
    return this.items
      .filter((hazard) => hazard.active)
      .map((hazard) => ({ x: hazard.x, z: hazard.z, radius: hazard.radius, kind: 'obstacle' as const }));
  }

  public reset(): void {
    for (const hazard of this.items) {
      hazard.active = true;
      hazard.group.visible = true;
    }
  }
}
