import {
  CylinderGeometry,
  Color,
  DirectionalLight,
  EquirectangularReflectionMapping,
  FogExp2,
  Group,
  HemisphereLight,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  TorusGeometry,
  type Object3D,
  type Texture,
} from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { RNG } from '../core/rng.ts';
import { createBarkTexture, createMossFloorTexture, createStoneTexture } from './textures.ts';
import { getTemplate } from './insect-assets.ts';

export type ArenaVariant = 'Moss Hollow' | 'Amber Grove';

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

const BASE = import.meta.env.BASE_URL;

export class Arena {
  public readonly scene = new Scene();
  public readonly radius = 18;
  public readonly obstacles: ArenaObstacle[] = [];
  public readonly foods: FoodPickup[] = [];
  public readonly landmarks = new Group();
  public readonly arenaFloorY = 0;
  public readonly rng: RNG;
  public variant: ArenaVariant;
  private elapsed = 0;
  private floorMaterial!: MeshStandardMaterial;

  public constructor(seed: number | string) {
    this.rng = new RNG(seed);
    this.variant = this.rng.int(0, 2) === 0 ? 'Moss Hollow' : 'Amber Grove';
    this.scene.background = new Color(0x0c1410);
    this.scene.fog = new FogExp2(0x0c1410, 0.018);
    this.scene.add(this.landmarks);
    this.loadEnvironmentMap();
    this.createLighting();
    this.createFloor();
    this.createArenaBoundary();
    this.createObstacles();
    this.createFoodPickups();
  }

  private loadEnvironmentMap(): void {
    if (typeof document === 'undefined') return;
    new RGBELoader().load(
      `${BASE}env/abandoned_greenhouse_1k.hdr`,
      (texture) => {
        texture.mapping = EquirectangularReflectionMapping;
        this.scene.environment = texture;
        this.scene.environmentIntensity = 0.55;
        this.scene.background = texture;
        this.scene.backgroundBlurriness = 0.6;
        this.scene.backgroundIntensity = 0.35;
      },
      undefined,
      (error) => console.warn('[arena] HDRI environment failed to load', error),
    );
  }

  private createLighting(): void {
    // IBL supplies the fill; hemisphere is a gentle top-down tint only.
    this.scene.add(new HemisphereLight(0x9fb7c8, 0x3a3d2c, 0.9));
    const sun = new DirectionalLight(0xfff1dc, 2.2);
    sun.position.set(10, 18, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.02;
    sun.shadow.camera.left = -22;
    sun.shadow.camera.right = 22;
    sun.shadow.camera.top = 22;
    sun.shadow.camera.bottom = -22;
    this.scene.add(sun);
    const fill = new DirectionalLight(0x6f86a8, 0.5);
    fill.position.set(-12, 8, -8);
    this.scene.add(fill);
  }

  /**
   * Asynchronously assign a diff/nor/rough texture set onto a material.
   * If a texture fails, the diffuse slot swaps in the procedural fallback.
   */
  private applyTextures(
    material: MeshStandardMaterial,
    name: string,
    repeat: number,
    fallback: () => Texture,
  ): void {
    if (typeof document === 'undefined') {
      material.map = fallback();
      return;
    }
    const loader = new TextureLoader();
    const assign = (
      suffix: string,
      slot: 'map' | 'normalMap' | 'roughnessMap',
      srgb: boolean,
    ): void => {
      loader.load(
        `${BASE}textures/${name}_${suffix}_1k.jpg`,
        (texture) => {
          texture.wrapS = RepeatWrapping;
          texture.wrapT = RepeatWrapping;
          texture.repeat.set(repeat, repeat);
          if (srgb) texture.colorSpace = SRGBColorSpace;
          material[slot] = texture;
          material.needsUpdate = true;
        },
        undefined,
        () => {
          if (slot === 'map') {
            material.map = fallback();
            material.needsUpdate = true;
          }
        },
      );
    };
    assign('diff', 'map', true);
    assign('nor_gl', 'normalMap', false);
    assign('rough', 'roughnessMap', false);
  }

  private createFloor(): void {
    this.floorMaterial = new MeshStandardMaterial({
      color: 0x8a9070,
      roughness: 0.95,
      metalness: 0,
    });
    this.applyTextures(this.floorMaterial, 'forest_floor', 7, () => createMossFloorTexture());
    const floor = new Mesh(
      new CylinderGeometry(this.radius, this.radius, 0.15, 64),
      this.floorMaterial,
    );
    floor.position.y = -0.12;
    floor.receiveShadow = true;
    this.scene.add(floor);
    this.createTerrainProps();
  }

  private createArenaBoundary(): void {
    const stoneMaterial = new MeshStandardMaterial({
      color: 0x9aa094,
      roughness: 0.9,
      metalness: 0,
    });
    this.applyTextures(stoneMaterial, 'mossy_stone_wall', 6, () => createStoneTexture());
    const wall = new Mesh(
      new CylinderGeometry(this.radius + 0.35, this.radius + 0.35, 1.6, 64, 1, true),
      stoneMaterial,
    );
    wall.position.y = 0.8;
    wall.receiveShadow = true;
    this.scene.add(wall);
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2;
      const post = new Mesh(
        new CylinderGeometry(0.22, 0.3, 1.9 + (index % 3) * 0.35, 8),
        stoneMaterial,
      );
      post.position.set(
        Math.cos(angle) * (this.radius + 0.35),
        0.9 + (index % 3) * 0.17,
        Math.sin(angle) * (this.radius + 0.35),
      );
      post.castShadow = true;
      post.receiveShadow = true;
      this.scene.add(post);
    }
    // Decorative boulders scattered outside the play radius.
    const rockTemplate = getTemplate('rock-large');
    for (let index = 0; index < 6; index += 1) {
      const angle = (index / 6) * Math.PI * 2 + 0.35;
      const distance = this.radius + 2.2 + (index % 3) * 1.4;
      let rock: Mesh | Group;
      if (rockTemplate) {
        rock = rockTemplate.scene.clone();
        rock.traverse((node) => {
          const mesh = node as Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            const material = mesh.material as MeshStandardMaterial;
            if ('metalness' in material) material.metalness = 0;
            if ('roughness' in material) material.roughness = Math.max(0.7, material.roughness);
          }
        });
        rock.scale.setScalar(0.02 * (1 + (index % 3) * 0.4));
      } else {
        rock = new Mesh(new SphereGeometry(0.9 + (index % 3) * 0.4, 9, 7), stoneMaterial);
        (rock as Mesh).castShadow = true;
        (rock as Mesh).receiveShadow = true;
      }
      rock.position.set(Math.cos(angle) * distance, 0.1, Math.sin(angle) * distance);
      rock.rotation.y = this.rng.range(0, Math.PI * 2);
      this.scene.add(rock);
    }
  }

  private createTerrainProps(): void {
    const platformMaterial = new MeshStandardMaterial({
      color: 0x66705c,
      roughness: 0.95,
      metalness: 0,
    });
    this.applyTextures(platformMaterial, 'mossy_stone_wall', 2, () => createStoneTexture());
    const reedMaterial = new MeshStandardMaterial({
      color: 0x8a7a4c,
      roughness: 0.9,
      metalness: 0,
    });
    this.applyTextures(reedMaterial, 'bark_brown_02', 1, () => createBarkTexture());
    const count = this.variant === 'Moss Hollow' ? 5 : 8;
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2 + 0.2;
      const distance = 5.5 + (index % 3) * 2;
      // Flat lichen-covered stone platform.
      const platform = new Mesh(
        new CylinderGeometry(1.35, 1.45, 0.3, 10),
        platformMaterial,
      );
      platform.position.set(Math.cos(angle) * distance, 0.25 + (index % 2) * 0.18, Math.sin(angle) * distance);
      platform.castShadow = true;
      platform.receiveShadow = true;
      this.landmarks.add(platform);
      this.obstacles.push({
        id: `platform-${index}`,
        object: platform,
        x: platform.position.x,
        z: platform.position.z,
        radius: 1.3,
        height: platform.position.y + 0.15,
        kind: 'pillar',
      });
      // Dry reed post.
      const post = new Mesh(
        new CylinderGeometry(0.05, 0.1, 2.8, 7),
        reedMaterial,
      );
      post.position.set(platform.position.x + 0.8, 1.4, platform.position.z);
      post.castShadow = true;
      this.landmarks.add(post);
    }
    // Hanging seed pods where the holo signs used to be.
    for (let index = 0; index < 4; index += 1) {
      const pod = new Mesh(
        new SphereGeometry(0.32, 10, 8),
        new MeshStandardMaterial({ color: 0x7a6438, roughness: 0.85 }),
      );
      pod.scale.set(1, 1.5, 1);
      pod.position.set(-9 + index * 6, 3.2, index % 2 === 0 ? -7 : 7);
      const stem = new Mesh(
        new CylinderGeometry(0.02, 0.03, 1.2, 5),
        reedMaterial,
      );
      stem.position.copy(pod.position);
      stem.position.y += 0.9;
      this.landmarks.add(pod, stem);
    }
  }

  private createObstacles(): void {
    const obstacleRng = this.rng.fork(0xabc123);
    const stoneMaterial = new MeshStandardMaterial({
      color: 0x8b8f85,
      roughness: 0.9,
      metalness: 0,
    });
    this.applyTextures(stoneMaterial, 'mossy_stone_wall', 1, () => createStoneTexture());
    const mushroomCap = new MeshStandardMaterial({ color: 0x9a7b5a, roughness: 0.8 });
    const mushroomStem = new MeshStandardMaterial({ color: 0xd8cbb2, roughness: 0.85 });
    const rockTemplate = getTemplate('rock');
    for (let index = 0; index < 14; index += 1) {
      const angle = obstacleRng.range(-Math.PI, Math.PI);
      const distance = obstacleRng.range(4.5, this.radius - 2.8);
      const radius = obstacleRng.range(0.35, 0.8);
      const height = obstacleRng.range(1.2, 3.4);
      const kind = index % 4 === 0 ? 'crystal' : 'pillar';
      let object: Object3D;
      if (kind === 'pillar') {
        if (rockTemplate) {
          const rock = rockTemplate.scene.clone(true);
          rock.traverse((node) => {
            const mesh = node as Mesh;
            if (mesh.isMesh) {
              mesh.castShadow = true;
              mesh.receiveShadow = true;
              const material = mesh.material as MeshStandardMaterial;
              if ('metalness' in material) material.metalness = 0;
              if ('roughness' in material) material.roughness = Math.max(0.7, material.roughness);
            }
          });
          rock.scale.set(radius * 0.04, height * 0.02, radius * 0.04);
          rock.rotation.y = obstacleRng.range(0, Math.PI * 2);
          const holder = new Group();
          holder.add(rock);
          object = holder;
        } else {
          object = new Mesh(
            new CylinderGeometry(radius * (0.7 + obstacleRng.next() * 0.3), radius, height, 9),
            stoneMaterial,
          );
        }
        object.castShadow = true;
        object.receiveShadow = true;
      } else {
        // Mushroom: cream stem + muted tan cap hemisphere.
        object = new Mesh(new SphereGeometry(radius, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mushroomCap);
        const stem = new Mesh(new CylinderGeometry(radius * 0.3, radius * 0.4, height * 0.6, 7), mushroomStem);
        stem.position.y = -height * 0.25;
        object.add(stem);
        object.scale.y = height / (radius * 2) * 0.5;
        object.castShadow = true;
      }
      object.position.set(Math.cos(angle) * distance, height / 2, Math.sin(angle) * distance);
      object.rotation.x = obstacleRng.range(0, 0.15);
      object.rotation.z = obstacleRng.range(0, 0.15);
      this.landmarks.add(object);
      this.obstacles.push({
        id: `obstacle-${index}`,
        object,
        x: object.position.x,
        z: object.position.z,
        radius,
        height,
        kind,
      });
    }
  }

  private createFoodPickups(): void {
    const foodRng = this.rng.fork(0xfeed123);
    const bushTemplate = getTemplate('flower-bushes');
    for (let index = 0; index < 8; index += 1) {
      const angle = foodRng.range(-Math.PI, Math.PI);
      const distance = foodRng.range(3, this.radius - 2);
      const object = new Group();
      // Nectar drop.
      const core = new Mesh(
        new SphereGeometry(0.22, 12, 10),
        new MeshPhysicalMaterial({
          color: 0xe0a640,
          transmission: 0.5,
          roughness: 0.2,
          metalness: 0,
          emissive: 0x8a5a10,
          emissiveIntensity: 0.35,
        }),
      );
      const ring = new Mesh(
        new TorusGeometry(0.38, 0.02, 6, 24),
        new MeshStandardMaterial({ color: 0xd9a441, transparent: true, opacity: 0.35, roughness: 0.7 }),
      );
      ring.rotation.x = Math.PI / 2;
      object.add(core, ring);
      // Flower-bush decoration the drop hovers over.
      if (bushTemplate) {
        const bush = bushTemplate.scene.clone(true);
        bush.traverse((node) => {
          const mesh = node as Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            const material = mesh.material as MeshStandardMaterial;
            if ('metalness' in material) material.metalness = 0;
            if ('roughness' in material) material.roughness = Math.max(0.7, material.roughness);
          }
        });
        bush.scale.setScalar(0.01);
        bush.position.y = -0.9;
        object.add(bush);
      }
      object.position.set(Math.cos(angle) * distance, 0.9, Math.sin(angle) * distance);
      this.landmarks.add(object);
      this.foods.push({
        id: `food-${index}`,
        object,
        x: object.position.x,
        z: object.position.z,
        radius: 0.65,
        active: true,
        phase: foodRng.range(0, Math.PI * 2),
      });
    }
  }

  public update(dt: number): void {
    this.elapsed += dt;
    for (const food of this.foods) {
      if (!food.active) {
        continue;
      }
      food.object.position.y = 0.9 + Math.sin(this.elapsed * 3 + food.phase) * 0.18;
      food.object.rotation.y = this.elapsed * 1.8 + food.phase;
      food.object.scale.setScalar(0.9 + Math.sin(this.elapsed * 4 + food.phase) * 0.12);
    }
  }

  public cycleVariant(): ArenaVariant {
    this.variant = this.variant === 'Moss Hollow' ? 'Amber Grove' : 'Moss Hollow';
    const tint = this.variant === 'Moss Hollow' ? 0x0c1410 : 0x141008;
    this.scene.fog = new FogExp2(tint, 0.018);
    if (this.scene.background instanceof Color) {
      this.scene.background = new Color(tint);
    }
    this.floorMaterial.color.set(this.variant === 'Moss Hollow' ? 0x8a9070 : 0x9a8a62);
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
