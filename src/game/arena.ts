import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  Color,
  DirectionalLight,
  EquirectangularReflectionMapping,
  FogExp2,
  Group,
  HemisphereLight,
  InstancedMesh,
  Material,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  Scene,
  SphereGeometry,
} from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { RNG } from '../core/rng.ts';
import { getTemplate, type ModelAssetName } from './insect-assets.ts';

export type ArenaVariant = 'Bench Lab' | 'Night Lab';

export interface ArenaObstacle {
  id: string;
  object: Object3D;
  x: number;
  z: number;
  radius: number;
  height: number;
  kind: 'pillar' | 'crystal';
}

export interface FoodPickup {
  id: string;
  object: Group;
  x: number;
  z: number;
  radius: number;
  active: boolean;
  phase: number;
}

interface Placement {
  x: number;
  y: number;
  z: number;
  yaw: number;
  scale: number;
}

const BASE = import.meta.env.BASE_URL;
const WALL_POLYGON_SIDES = 24;
const WALL_SEGMENTS_PER_EDGE = 3;

function neutralize(material: Material): void {
  const std = material as MeshStandardMaterial;
  if ('metalness' in std) std.metalness = 0;
  if ('roughness' in std) std.roughness = Math.max(0.75, std.roughness);
  if ('emissive' in std) {
    std.emissive.set(0x000000);
    std.emissiveIntensity = 0;
  }
}

function neutralizeTree(object: Object3D): void {
  object.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) neutralize(material);
  });
}

export class Arena {
  public readonly scene = new Scene();
  public readonly radius = 18;
  public readonly obstacles: ArenaObstacle[] = [];
  public readonly foods: FoodPickup[] = [];
  public readonly landmarks = new Group();
  public readonly arenaFloorY = 0;
  public readonly rng: RNG;
  public readonly mapSource =
    'Kenney Building Kit (CC0 1.0) + OpenGameArt 3D Interior Home Assets (CC0 1.0)';
  public variant: ArenaVariant;
  private elapsed = 0;
  private readonly keyLight = new DirectionalLight(0xfff1dc, 2.0);

  public constructor(seed: number | string) {
    this.rng = new RNG(seed);
    this.variant = this.rng.int(0, 2) === 0 ? 'Bench Lab' : 'Night Lab';
    this.scene.background = new Color(0x1b1f24);
    this.scene.fog = new FogExp2(0x1b1f24, 0.006);
    this.scene.add(this.landmarks);
    this.loadEnvironmentMap();
    this.createLighting();
    this.createFloor();
    this.createArenaBoundary();
    this.createObstacles();
    this.createFoodPickups();
    this.applyVariant();
  }

  /** HDRI is used for image-based lighting only; the background stays a flat neutral. */
  private loadEnvironmentMap(): void {
    if (typeof document === 'undefined') return;
    new RGBELoader().load(
      `${BASE}env/abandoned_greenhouse_1k.hdr`,
      (texture) => {
        texture.mapping = EquirectangularReflectionMapping;
        this.scene.environment = texture;
        this.scene.environmentIntensity = 0.55;
      },
      undefined,
      (error) => console.warn('[arena] HDRI environment failed to load', error),
    );
  }

  private createLighting(): void {
    this.scene.add(new HemisphereLight(0x9fb7c8, 0x3a3d2c, 0.7));
    this.keyLight.position.set(8, 20, 6);
    this.keyLight.castShadow = true;
    this.keyLight.shadow.mapSize.set(2048, 2048);
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.keyLight.shadow.camera.left = -22;
    this.keyLight.shadow.camera.right = 22;
    this.keyLight.shadow.camera.top = 22;
    this.keyLight.shadow.camera.bottom = -22;
    this.scene.add(this.keyLight);
    const fill = new DirectionalLight(0x6f86a8, 0.5);
    fill.position.set(-12, 8, -8);
    this.scene.add(fill);
  }

  /**
   * Build one InstancedMesh per mesh in the loaded template so the whole
   * kit piece (frame + glazing, multi-part details) renders per instance.
   * Falls back to a single neutral InstancedMesh when the asset is missing.
   */
  private instancedFromTemplate(
    name: string,
    assetName: ModelAssetName,
    placements: readonly Placement[],
    fallbackGeometry: BufferGeometry,
    fallbackMaterial: Material,
  ): Group {
    const group = new Group();
    const template = getTemplate(assetName);
    const meshes: Mesh[] = [];
    if (template) {
      template.scene.updateMatrixWorld(true);
      neutralizeTree(template.scene);
      template.scene.traverse((node) => {
        if ((node as Mesh).isMesh) meshes.push(node as Mesh);
      });
    }
    const dummy = new Object3D();
    if (meshes.length === 0) {
      const instanced = new InstancedMesh(fallbackGeometry, fallbackMaterial, placements.length);
      instanced.name = name;
      instanced.castShadow = true;
      instanced.receiveShadow = true;
      placements.forEach((placement, index) => {
        dummy.position.set(placement.x, placement.y, placement.z);
        dummy.rotation.set(0, placement.yaw, 0);
        dummy.scale.setScalar(placement.scale);
        dummy.updateMatrix();
        instanced.setMatrixAt(index, dummy.matrix);
      });
      group.add(instanced);
      return group;
    }
    for (const mesh of meshes) {
      const instanced = new InstancedMesh(mesh.geometry, mesh.material, placements.length);
      instanced.name = name;
      instanced.castShadow = true;
      instanced.receiveShadow = true;
      const local = mesh.matrixWorld.clone();
      placements.forEach((placement, index) => {
        dummy.position.set(placement.x, placement.y, placement.z);
        dummy.rotation.set(0, placement.yaw, 0);
        dummy.scale.setScalar(placement.scale);
        dummy.updateMatrix();
        instanced.setMatrixAt(index, dummy.matrix.clone().multiply(local));
      });
      group.add(instanced);
    }
    return group;
  }

  private cloneAt(
    assetName: ModelAssetName,
    x: number,
    y: number,
    z: number,
    yaw: number,
    scale: number,
    fallback: () => Mesh,
  ): Object3D {
    const template = getTemplate(assetName);
    if (!template) {
      const mesh = fallback();
      mesh.position.set(x, y, z);
      mesh.rotation.y = yaw;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      return mesh;
    }
    const clone = template.scene.clone(true);
    neutralizeTree(clone);
    clone.position.set(x, y, z);
    clone.rotation.y = yaw;
    clone.scale.setScalar(scale);
    return clone;
  }

  private createFloor(): void {
    const placements: Placement[] = [];
    for (let gx = -20; gx < 20; gx += 2) {
      for (let gz = -20; gz < 20; gz += 2) {
        placements.push({ x: gx + 1, y: -0.1, z: gz + 1, yaw: 0, scale: 1 });
      }
    }
    const floor = this.instancedFromTemplate(
      'arena-floor',
      'kit-floor',
      placements,
      new BoxGeometry(2, 0.1, 2),
      new MeshStandardMaterial({ color: 0x8e8f99, roughness: 0.95, metalness: 0, emissiveIntensity: 0 }),
    );
    this.scene.add(floor);
  }

  private createArenaBoundary(): void {
    const boundaryRadius = this.radius + 0.6;
    const wallPlacements: Placement[] = [];
    const windowPlacements: Placement[] = [];
    const columnPlacements: Placement[] = [];
    let pieceIndex = 0;
    for (let side = 0; side < WALL_POLYGON_SIDES; side += 1) {
      const a0 = (side / WALL_POLYGON_SIDES) * Math.PI * 2;
      const a1 = ((side + 1) / WALL_POLYGON_SIDES) * Math.PI * 2;
      const v0 = { x: Math.cos(a0) * boundaryRadius, z: Math.sin(a0) * boundaryRadius };
      const v1 = { x: Math.cos(a1) * boundaryRadius, z: Math.sin(a1) * boundaryRadius };
      columnPlacements.push({ x: v0.x, y: 0, z: v0.z, yaw: a0, scale: 1 });
      for (let piece = 0; piece < WALL_SEGMENTS_PER_EDGE; piece += 1) {
        const t = (piece + 0.5) / WALL_SEGMENTS_PER_EDGE;
        const x = v0.x + (v1.x - v0.x) * t;
        const z = v0.z + (v1.z - v0.z) * t;
        // Kit walls run along local +z; yaw aligns +z with the edge tangent.
        const yaw = Math.atan2(v1.x - v0.x, v1.z - v0.z);
        const placement = { x, y: 0, z, yaw, scale: 1 };
        if (pieceIndex % 3 === 0) windowPlacements.push(placement);
        else wallPlacements.push(placement);
        pieceIndex += 1;
      }
    }
    this.scene.add(
      this.instancedFromTemplate(
        'arena-wall',
        'kit-wall',
        wallPlacements,
        new BoxGeometry(2, 2.4, 0.15),
        new MeshStandardMaterial({ color: 0x8e8f99, roughness: 0.9, metalness: 0, emissiveIntensity: 0 }),
      ),
      this.instancedFromTemplate(
        'arena-wall-window',
        'kit-wall-window',
        windowPlacements,
        new BoxGeometry(2, 2.4, 0.15),
        new MeshStandardMaterial({ color: 0x7d8a99, roughness: 0.85, metalness: 0, emissiveIntensity: 0 }),
      ),
      this.instancedFromTemplate(
        'arena-column',
        'kit-column',
        columnPlacements,
        new CylinderGeometry(0.28, 0.32, 2.4, 8),
        new MeshStandardMaterial({ color: 0x9a9d94, roughness: 0.9, metalness: 0, emissiveIntensity: 0 }),
      ),
    );
  }

  private createObstacles(): void {
    const obstacleRng = this.rng.fork(0xabc123);
    const fallbackWallMat = new MeshStandardMaterial({ color: 0x8e8f99, roughness: 0.9, metalness: 0, emissiveIntensity: 0 });
    const benchMat = new MeshStandardMaterial({ color: 0x7a6a55, roughness: 0.85, metalness: 0, emissiveIntensity: 0 });
    const maxR = this.radius - 1.5;

    // (i) Column ring.
    const columnPlacements: Placement[] = [];
    for (let index = 0; index < 6; index += 1) {
      const angle = (index / 6) * Math.PI * 2 + obstacleRng.range(-0.15, 0.15);
      const distance = 7 + obstacleRng.range(-0.4, 0.4);
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      columnPlacements.push({ x, y: 0, z, yaw: angle, scale: 1 });
      this.obstacles.push({
        id: `column-${index}`,
        object: this.landmarks,
        x,
        z,
        radius: 0.45,
        height: 2.4,
        kind: 'pillar',
      });
    }
    this.landmarks.add(
      this.instancedFromTemplate(
        'lab-column',
        'kit-column',
        columnPlacements,
        new CylinderGeometry(0.4, 0.45, 2.4, 8),
        fallbackWallMat,
      ),
    );

    // (ii) Straight partitions: 3 low-wall pieces in a radial line, 3 circles each.
    for (let index = 0; index < 3; index += 1) {
      const angle = (index / 3) * Math.PI * 2 + obstacleRng.range(0.2, 0.9);
      const distance = 11.5 + obstacleRng.range(-0.5, 0.5);
      const cx = Math.cos(angle) * distance;
      const cz = Math.sin(angle) * distance;
      // Partition runs radially: kit walls are 2 long along local +z, and
      // yaw maps +z to (sin yaw, cos yaw), so yaw = PI/2 - angle aligns +z
      // with the radial direction (cos angle, sin angle).
      const yaw = Math.PI / 2 - angle;
      const placements: Placement[] = [];
      for (let piece = 0; piece < 3; piece += 1) {
        const offset = (piece - 1) * 2;
        const px = cx + Math.cos(angle) * offset;
        const pz = cz + Math.sin(angle) * offset;
        placements.push({ x: px, y: 0, z: pz, yaw, scale: 1 });
        this.obstacles.push({
          id: `partition-${index}-${piece}`,
          object: this.landmarks,
          x: px,
          z: pz,
          radius: 0.7,
          height: 1.2,
          kind: 'pillar',
        });
      }
      this.landmarks.add(
        this.instancedFromTemplate(
          `lab-partition-${index}`,
          'kit-partition',
          placements,
          new BoxGeometry(2, 1.2, 0.15),
          fallbackWallMat,
        ),
      );
    }

    // (iii) Lab benches (OGA tables), long side ≈ 3 units, 2 collision circles each.
    for (let index = 0; index < 4; index += 1) {
      const angle = obstacleRng.range(-Math.PI, Math.PI);
      const distance = obstacleRng.range(4, 15);
      const x = Math.cos(angle) * Math.min(distance, maxR);
      const z = Math.sin(angle) * Math.min(distance, maxR);
      const yaw = obstacleRng.range(0, Math.PI * 2);
      const table = this.cloneAt('lab-table', x, 0, z, yaw, 3 / 1.843, () =>
        new Mesh(new BoxGeometry(3, 1.1, 1.5), benchMat),
      );
      // The OGA table's long axis is local +x, which yaw maps to
      // (cos yaw, -sin yaw) in world space.
      const dx = Math.cos(yaw);
      const dz = -Math.sin(yaw);
      this.landmarks.add(table);
      for (const offset of [-1.0, 1.0]) {
        this.obstacles.push({
          id: `bench-${index}-${offset < 0 ? 'a' : 'b'}`,
          object: table,
          x: x + dx * offset,
          z: z + dz * offset,
          radius: 0.9,
          height: 1.1,
          kind: 'pillar',
        });
      }
    }

    // (iv) Bookcases against the wall interior.
    for (let index = 0; index < 2; index += 1) {
      const angle = obstacleRng.range(-Math.PI, Math.PI);
      const distance = 16.5;
      const x = Math.cos(angle) * distance;
      const z = Math.sin(angle) * distance;
      const yaw = Math.atan2(-x, -z) + Math.PI / 2; // face inward
      const bookcase = this.cloneAt('lab-bookcase', x, 0, z, yaw, 1.6, () =>
        new Mesh(new BoxGeometry(1.1, 2.4, 0.8), benchMat),
      );
      this.landmarks.add(bookcase);
      this.obstacles.push({
        id: `bookcase-${index}`,
        object: bookcase,
        x,
        z,
        radius: 0.9,
        height: 2.4,
        kind: 'pillar',
      });
    }

    // (v) Decorative shelves + pipes along wall segments (no collision).
    for (let index = 0; index < 2; index += 1) {
      const angle = (index / 2) * Math.PI * 2 + 0.5;
      const x = Math.cos(angle) * (this.radius - 0.6);
      const z = Math.sin(angle) * (this.radius - 0.6);
      const shelf = this.cloneAt('lab-shelf', x, 1.3, z, Math.atan2(-x, -z) + Math.PI / 2, 1.2, () =>
        new Mesh(new BoxGeometry(1.4, 0.08, 0.4), benchMat),
      );
      this.landmarks.add(shelf);
    }
    const pipePlacements: Placement[] = [];
    for (let index = 0; index < 8; index += 1) {
      const angle = (index / 8) * Math.PI * 2 + 0.25;
      pipePlacements.push({
        x: Math.cos(angle) * (this.radius + 0.1),
        y: 2.6,
        z: Math.sin(angle) * (this.radius + 0.1),
        yaw: angle,
        scale: 1.6,
      });
    }
    this.landmarks.add(
      this.instancedFromTemplate(
        'lab-pipe',
        'kit-pipe',
        pipePlacements,
        new CylinderGeometry(0.08, 0.08, 2.2, 6),
        fallbackWallMat,
      ),
    );
  }

  private createFoodPickups(): void {
    const foodRng = this.rng.fork(0xfeed123);
    const dishMaterial = new MeshPhysicalMaterial({
      color: 0xdfe6ea,
      transmission: 0.35,
      roughness: 0.15,
      metalness: 0,
      emissiveIntensity: 0,
    });
    const dropletMaterial = new MeshPhysicalMaterial({
      color: 0xd9a441,
      roughness: 0.2,
      metalness: 0,
      emissive: 0x8a5a10,
      emissiveIntensity: 0.2,
    });
    for (let index = 0; index < 8; index += 1) {
      let x = 0;
      let z = 0;
      for (let attempt = 0; attempt < 40; attempt += 1) {
        const angle = foodRng.range(-Math.PI, Math.PI);
        const distance = foodRng.range(3, this.radius - 2);
        const cx = Math.cos(angle) * distance;
        const cz = Math.sin(angle) * distance;
        const overlaps = this.obstacles.some(
          (obstacle) =>
            Math.hypot(cx - obstacle.x, cz - obstacle.z) < obstacle.radius + 1.6,
        );
        if (!overlaps) {
          x = cx;
          z = cz;
          break;
        }
        x = cx;
        z = cz;
      }
      const object = new Group();
      const dish = new Mesh(new CylinderGeometry(0.55, 0.55, 0.08, 24), dishMaterial);
      dish.position.y = 0.04;
      dish.receiveShadow = true;
      const droplet = new Mesh(new SphereGeometry(0.18, 12, 10), dropletMaterial);
      droplet.name = 'droplet';
      droplet.position.y = 0.2;
      object.add(dish, droplet);
      object.position.set(x, 0.01, z);
      this.landmarks.add(object);
      this.foods.push({
        id: `food-${index}`,
        object,
        x,
        z,
        radius: 0.65,
        active: true,
        phase: foodRng.range(0, Math.PI * 2),
      });
    }
  }

  public update(dt: number): void {
    this.elapsed += dt;
    for (const food of this.foods) {
      if (!food.active) continue;
      const droplet = food.object.getObjectByName('droplet');
      if (droplet) {
        droplet.position.y = 0.2 + Math.sin(this.elapsed * 2.2 + food.phase) * 0.05;
      }
    }
  }

  private applyVariant(): void {
    const night = this.variant === 'Night Lab';
    this.scene.background = new Color(night ? 0x11141a : 0x1b1f24);
    this.scene.fog = new FogExp2(night ? 0x11141a : 0x1b1f24, 0.006);
    this.keyLight.color.set(night ? 0xc9d6ff : 0xfff1dc);
    this.keyLight.intensity = night ? 1.1 : 2.0;
  }

  public cycleVariant(): ArenaVariant {
    this.variant = this.variant === 'Bench Lab' ? 'Night Lab' : 'Bench Lab';
    this.applyVariant();
    return this.variant;
  }

  public collectFood(id: string): FoodPickup | undefined {
    const food = this.foods.find((item) => item.id === id && item.active);
    if (food) {
      food.active = false;
      food.object.visible = false;
    }
    return food;
  }

  public resetFood(): void {
    for (const food of this.foods) {
      food.active = true;
      food.object.visible = true;
    }
  }

  public obstacleEntities(): { x: number; z: number; radius: number }[] {
    return this.obstacles.map((obstacle) => ({
      x: obstacle.x,
      z: obstacle.z,
      radius: obstacle.radius,
    }));
  }
}
