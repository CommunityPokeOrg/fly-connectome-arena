import {
  AdditiveBlending,
  AmbientLight,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DirectionalLight,
  HemisphereLight,
  FogExp2,
  Float32BufferAttribute,
  GridHelper,
  Group,
  LineBasicMaterial,
  LineLoop,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  Points,
  PointsMaterial,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from 'three';
import { RNG } from '../core/rng.ts';
import { createHexPlateTexture, createMetalWallTexture } from './textures.ts';

export type ArenaVariant = 'Hive Core' | 'Neon Foundry';

export interface ArenaObstacle {
  id: string;
  object: Mesh;
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

export class Arena {
  public readonly scene = new Scene();
  public readonly radius = 18;
  public readonly obstacles: ArenaObstacle[] = [];
  public readonly foods: FoodPickup[] = [];
  public readonly landmarks = new Group();
  public readonly arenaFloorY = 0;
  public readonly rng: RNG;
  public variant: ArenaVariant;
  private readonly movingLights: PointLight[] = [];
  private elapsed = 0;

  public constructor(seed: number | string) {
    this.rng = new RNG(seed);
    this.variant = this.rng.int(0, 2) === 0 ? 'Hive Core' : 'Neon Foundry';
    this.scene.background = new Color(0x02040e);
    this.scene.fog = new FogExp2(0x02040e, 0.022);
    this.scene.add(this.landmarks);
    this.createLighting();
    this.createFloor();
    this.createArenaBoundary();
    this.createObstacles();
    this.createFoodPickups();
    this.createStarField();
  }

  private createLighting(): void {
    this.scene.add(new HemisphereLight(0x668bc8, 0x090d1c, 1.5));
    this.scene.add(new AmbientLight(0x26365f, 0.7));
    const moon = new DirectionalLight(0x9fc4ff, 2.4);
    moon.position.set(-8, 16, 4);
    moon.castShadow = true;
    moon.shadow.bias = -0.0005;
    moon.shadow.normalBias = 0.02;
    moon.shadow.mapSize.set(1024, 1024);
    moon.shadow.camera.left = -22;
    moon.shadow.camera.right = 22;
    moon.shadow.camera.top = 22;
    moon.shadow.camera.bottom = -22;
    this.scene.add(moon);
    const cyan = new PointLight(0x18eaff, 5, 16);
    cyan.position.set(-8, 4, -3);
    this.scene.add(cyan);
    const magenta = new PointLight(0xff1f9e, 5, 16);
    magenta.position.set(8, 4, 5);
    this.scene.add(magenta);
    this.movingLights.push(cyan, magenta);
  }

  private createFloor(): void {
    const floor = new Mesh(
      new CylinderGeometry(this.radius, this.radius, 0.15, 64),
      new MeshStandardMaterial({
        color: 0x050b1d,
        map: createHexPlateTexture(),
        roughness: 0.84,
        metalness: 0.4,
      }),
    );
    floor.position.y = -0.12;
    floor.receiveShadow = true;
    this.scene.add(floor);
    const grid = new GridHelper(this.radius * 2, 36, 0x164a73, 0x0a213d);
    grid.position.y = 0.01;
    this.scene.add(grid);
    const innerGrid = new GridHelper(this.radius * 1.1, 18, 0x40215c, 0x17152f);
    innerGrid.position.y = 0.02;
    this.scene.add(innerGrid);
    this.createTerrainProps();
  }

  private createArenaBoundary(): void {
    const points: Vector3[] = [];
    for (let index = 0; index < 64; index += 1) {
      const angle = (index / 64) * Math.PI * 2;
      points.push(new Vector3(Math.cos(angle) * this.radius, 0.3, Math.sin(angle) * this.radius));
    }
    const ring = new LineLoop(
      new BufferGeometry().setFromPoints(points),
      new LineBasicMaterial({ color: 0x29eaff, transparent: true, opacity: 0.8 }),
    );
    this.scene.add(ring);
    const upper = new Mesh(
      new TorusGeometry(this.radius, 0.035, 8, 96),
      new MeshBasicMaterial({ color: 0xff36b7, transparent: true, opacity: 0.55 }),
    );
    upper.rotation.x = Math.PI / 2;
    upper.position.y = 3.8;
    this.scene.add(upper);
    const wall = new Mesh(
      new CylinderGeometry(this.radius + 0.35, this.radius + 0.35, 3.1, 64, 1, true),
      new MeshStandardMaterial({
        color: 0x182339,
        map: createMetalWallTexture(),
        emissive: 0x103b58,
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 0.48,
        side: 2,
      }),
    );
    wall.position.y = 1.55;
    this.scene.add(wall);
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2;
      const beacon = new Mesh(
        new CylinderGeometry(0.08, 0.15, 4, 8),
        new MeshBasicMaterial({ color: index % 2 === 0 ? 0x24efff : 0xff319c, wireframe: true }),
      );
      beacon.position.set(Math.cos(angle) * this.radius, 2, Math.sin(angle) * this.radius);
      this.scene.add(beacon);
    }
  }

  private createTerrainProps(): void {
    const count = this.variant === 'Hive Core' ? 5 : 8;
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2 + 0.2;
      const distance = 5.5 + (index % 3) * 2;
      const platform = new Mesh(
        new CylinderGeometry(1.35, 1.45, 0.3, 8),
        new MeshStandardMaterial({
          color: this.variant === 'Hive Core' ? 0x153752 : 0x422052,
          emissive: this.variant === 'Hive Core' ? 0x0f5478 : 0x72245e,
          emissiveIntensity: 1.1,
          metalness: 0.65,
          roughness: 0.32,
        }),
      );
      platform.castShadow = true;
      platform.receiveShadow = true;
      platform.position.set(Math.cos(angle) * distance, 0.25 + (index % 2) * 0.18, Math.sin(angle) * distance);
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
      const post = new Mesh(
        new CylinderGeometry(0.07, 0.12, 2.8, 8),
        new MeshStandardMaterial({ color: 0x4eeeff, emissive: 0x32dff4, emissiveIntensity: 2 }),
      );
      post.castShadow = true;
      post.receiveShadow = true;
      post.position.set(platform.position.x + 0.8, 1.4, platform.position.z);
      this.landmarks.add(post);
    }
    for (let index = 0; index < 4; index += 1) {
      const sign = new Mesh(
        new CylinderGeometry(0.55, 0.55, 0.06, 6),
        new MeshStandardMaterial({ color: 0xff319c, emissive: 0xff319c, emissiveIntensity: 2 }),
      );
      sign.position.set(-9 + index * 6, 3.2, index % 2 === 0 ? -7 : 7);
      sign.rotation.x = Math.PI / 2;
      this.landmarks.add(sign);
    }
  }

  private createObstacles(): void {
    const obstacleRng = this.rng.fork(0xabc123);
    for (let index = 0; index < 14; index += 1) {
      const angle = obstacleRng.range(-Math.PI, Math.PI);
      const distance = obstacleRng.range(4.5, this.radius - 2.8);
      const radius = obstacleRng.range(0.35, 0.8);
      const height = obstacleRng.range(1.2, 3.4);
      const kind = index % 4 === 0 ? 'crystal' : 'pillar';
      const object = kind === 'pillar'
        ? new Mesh(
          new CylinderGeometry(radius * 0.8, radius, height, 8),
          new MeshStandardMaterial({
            color: 0x201d59,
            emissive: 0x441064,
            emissiveIntensity: 1.2,
            wireframe: index % 3 === 0,
          }),
        )
        : new Mesh(
          new SphereGeometry(radius, 8, 6),
          new MeshStandardMaterial({
            color: 0x0d7c89,
            emissive: 0x0a5b68,
            emissiveIntensity: 2,
            wireframe: true,
          }),
        );
      object.position.set(Math.cos(angle) * distance, height / 2, Math.sin(angle) * distance);
      object.rotation.set(obstacleRng.range(0, 0.5), obstacleRng.range(0, Math.PI), obstacleRng.range(0, 0.5));
      object.castShadow = true;
      object.receiveShadow = true;
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
      const light = new PointLight(kind === 'pillar' ? 0xff2d9f : 0x31efff, 1.2, 3.5);
      light.position.copy(object.position);
      light.position.y = 0.5;
      this.landmarks.add(light);
    }
  }

  private createFoodPickups(): void {
    const foodRng = this.rng.fork(0xfeed123);
    for (let index = 0; index < 8; index += 1) {
      const angle = foodRng.range(-Math.PI, Math.PI);
      const distance = foodRng.range(3, this.radius - 2);
      const object = new Group();
      const core = new Mesh(
        new SphereGeometry(0.22, 10, 8),
        new MeshStandardMaterial({ color: 0xffdc68, emissive: 0xff7b12, emissiveIntensity: 2.5 }),
      );
      const ring = new Mesh(
        new TorusGeometry(0.38, 0.025, 6, 24),
        new MeshBasicMaterial({ color: 0xfff08a, transparent: true, opacity: 0.9 }),
      );
      ring.rotation.x = Math.PI / 2;
      object.add(core, ring);
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

  private createStarField(): void {
    const stars = new Float32Array(900);
    for (let index = 0; index < 300; index += 1) {
      stars[index * 3] = this.rng.range(-50, 50);
      stars[index * 3 + 1] = this.rng.range(5, 34);
      stars[index * 3 + 2] = this.rng.range(-50, 50);
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', new Float32BufferAttribute(stars, 3));
    const points = new Points(
      geometry,
      new PointsMaterial({
        color: 0x82ddff,
        size: 0.08,
        transparent: true,
        opacity: 0.9,
        blending: AdditiveBlending,
      }),
    );
    this.scene.add(points);
  }

  public update(dt: number): void {
    this.elapsed += dt;
    for (const [index, light] of this.movingLights.entries()) {
      light.intensity = 3.5 + Math.sin(this.elapsed * 2.5 + index * Math.PI) * 1.5;
      light.position.x = Math.sin(this.elapsed * 0.31 + index) * 12;
      light.position.z = Math.cos(this.elapsed * 0.43 + index) * 10;
    }
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
    this.variant = this.variant === 'Hive Core' ? 'Neon Foundry' : 'Hive Core';
    this.scene.background = new Color(this.variant === 'Hive Core' ? 0x02040e : 0x0b0314);
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
