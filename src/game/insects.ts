import {
  AnimationMixer,
  Box3,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  LoopOnce,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  Vector3,
  type AnimationAction,
  type Material,
  type Object3D,
} from 'three';
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { getTemplate, type InsectAssetName } from './insect-assets.ts';
import { createWingVenationTexture } from './textures.ts';

export type InsectVariant = 'fly' | 'wasp' | 'beetle' | 'drone-hornet';

export interface InsectRig {
  root: Group;
  legs: Group[];
  wings: Mesh[];
  wingsLeft?: Group;
  wingsRight?: Group;
  materials: Material[];
  phase: number;
  hitTimer: number;
  deathTimer: number;
  mixer?: AnimationMixer;
  actions?: Record<string, AnimationAction>;
}

const ASSET_NAMES: Record<InsectVariant, InsectAssetName> = {
  fly: 'fly',
  wasp: 'wasp',
  beetle: 'ladybird',
  'drone-hornet': 'bee-enemy',
};

/** Target body length (z extent) after normalisation, in arena units. */
const TARGET_LENGTH: Record<InsectVariant, number> = {
  fly: 1.15,
  wasp: 1.3,
  beetle: 1.2,
  'drone-hornet': 1.4,
};

/* ------------------------------------------------------------------ */
/* Materials (shared by the GLB path and the procedural fallback)      */
/* ------------------------------------------------------------------ */

function chitin(color: number, roughness = 0.62, sheen = 0.3): MeshPhysicalMaterial {
  return new MeshPhysicalMaterial({
    color,
    roughness,
    metalness: 0,
    clearcoat: 0.35,
    clearcoatRoughness: 0.4,
    sheen,
    sheenColor: 0x6b5a48,
    emissive: 0x000000,
    emissiveIntensity: 0,
  });
}

function compoundEye(): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({
    color: 0x5a1f1a,
    roughness: 0.25,
    metalness: 0,
    clearcoat: 1,
    iridescence: 0.9,
    iridescenceIOR: 1.6,
    iridescenceThicknessRange: [120, 480],
    emissive: 0x000000,
    emissiveIntensity: 0,
  });
  material.userData['keepColor'] = true;
  return material;
}

function wingMembrane(): MeshPhysicalMaterial {
  const material = new MeshPhysicalMaterial({
    color: 0xcfc6ae,
    transparent: true,
    opacity: 0.42,
    transmission: 0.6,
    roughness: 0.15,
    metalness: 0,
    ior: 1.35,
    iridescence: 0.5,
    side: DoubleSide,
    depthWrite: false,
    emissive: 0x000000,
    emissiveIntensity: 0,
  });
  if (typeof document !== 'undefined') {
    material.map = createWingVenationTexture();
  }
  material.userData['keepColor'] = true;
  return material;
}

const BODY_MATERIAL_NAMES: Record<InsectVariant, Record<string, () => Material>> = {
  fly: {
    Body: () => chitin(0x3a2f2a, 0.6, 0.35),
    Thorax: () => chitin(0x6b5a48),
    Eyes: () => compoundEye(),
    Wings: () => wingMembrane(),
  },
  wasp: {
    Black: () => chitin(0x1c1710, 0.58),
    Orange: () => chitin(0xc98a2a, 0.55, 0.35),
    Yellow: () => chitin(0xc98a2a, 0.55, 0.35),
    LightBlue: () => wingMembrane(),
  },
  beetle: {
    red: () => chitin(0x9c2f22, 0.55, 0.4),
    black: () => chitin(0x14110f, 0.6),
    'black.001': () => chitin(0x14110f, 0.6),
  },
  'drone-hornet': {
    Main: () => chitin(0x8a6a2c, 0.6, 0.35),
    Main_2: () => chitin(0x1a1512, 0.62),
    Eyes: () => compoundEye(),
    Wings: () => wingMembrane(),
    Tongue: () => chitin(0x4a3325, 0.7, 0),
    Teeth: () => chitin(0x6a5c48, 0.7, 0),
  },
};

function materialFor(name: string, variant: InsectVariant): Material {
  const factory = BODY_MATERIAL_NAMES[variant][name];
  return factory ? factory() : chitin(0x4a3d30);
}

/* ------------------------------------------------------------------ */
/* GLB-backed rigs                                                     */
/* ------------------------------------------------------------------ */

function meshCentroidZ(mesh: Mesh): number {
  const geometry = mesh.geometry as BufferGeometry;
  const position = geometry.getAttribute('position') as BufferAttribute | undefined;
  if (!position) return 0;
  const point = new Vector3();
  let sum = 0;
  for (let index = 0; index < position.count; index += 1) {
    point.fromBufferAttribute(position, index);
    mesh.localToWorld(point);
    sum += point.z;
  }
  return position.count > 0 ? sum / position.count : 0;
}

/**
 * Find the world-space z of the "head" end of the model so it can be rotated
 * to face +z. Uses named bones for skinned models and material centroids for
 * static ones.
 */
function headZ(inner: Object3D, variant: InsectVariant): number {
  inner.updateWorldMatrix(true, true);
  const boneZ = (name: string): number | undefined => {
    const node = inner.getObjectByName(name);
    if (!node) return undefined;
    return node.getWorldPosition(new Vector3()).z;
  };
  if (variant === 'wasp') {
    const head = boneZ('Head');
    const sting = boneZ('Sting');
    if (head !== undefined && sting !== undefined) {
      return head - sting;
    }
  }
  if (variant === 'drone-hornet') {
    const mouth = boneZ('Mouth') ?? boneZ('Head');
    const body = boneZ('Body');
    if (mouth !== undefined && body !== undefined) {
      return mouth - body;
    }
  }
  // static models: centroid of the head-ish material (eyes / black head parts)
  const headMaterialNames = variant === 'fly' ? ['Eyes'] : ['black', 'black.001'];
  let sum = 0;
  let count = 0;
  inner.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (materials.some((material) => headMaterialNames.includes(material?.name ?? ''))) {
      sum += meshCentroidZ(mesh);
      count += 1;
    }
  });
  return count > 0 ? sum : 0;
}

function splitWings(inner: Object3D, rig: InsectRig): void {
  let wingMesh: Mesh | undefined;
  inner.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh || wingMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    if (materials.some((material) => material?.name === 'Wings')) {
      wingMesh = mesh;
    }
  });
  if (!wingMesh) return;
  const geometry = wingMesh.geometry as BufferGeometry;
  const position = geometry.getAttribute('position') as BufferAttribute;
  const normal = geometry.getAttribute('normal') as BufferAttribute | undefined;
  const uv = geometry.getAttribute('uv') as BufferAttribute | undefined;
  const index = geometry.getIndex();
  const triangleCount = index ? index.count / 3 : position.count / 3;
  const vertexAt = (i: number) => (index ? index.getX(i) : i);

  const left: number[] = [];
  const right: number[] = [];
  const centroid = new Vector3();
  for (let t = 0; t < triangleCount; t += 1) {
    centroid.set(0, 0, 0);
    for (let k = 0; k < 3; k += 1) {
      centroid.x += position.getX(vertexAt(t * 3 + k));
    }
    (centroid.x < 0 ? left : right).push(t);
  }

  const buildHalf = (triangles: number[]): { geometry: BufferGeometry; root: Vector3 } => {
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    let minAbsX = Infinity;
    for (const t of triangles) {
      for (let k = 0; k < 3; k += 1) {
        minAbsX = Math.min(minAbsX, Math.abs(position.getX(vertexAt(t * 3 + k))));
      }
    }
    const root = new Vector3();
    let rootCount = 0;
    for (const t of triangles) {
      for (let k = 0; k < 3; k += 1) {
        const v = vertexAt(t * 3 + k);
        positions.push(position.getX(v), position.getY(v), position.getZ(v));
        if (normal) normals.push(normal.getX(v), normal.getY(v), normal.getZ(v));
        if (uv) uvs.push(uv.getX(v), uv.getY(v));
        if (Math.abs(position.getX(v)) <= minAbsX * 1.5) {
          root.add(new Vector3(position.getX(v), position.getY(v), position.getZ(v)));
          rootCount += 1;
        }
      }
    }
    if (rootCount > 0) root.divideScalar(rootCount);
    const half = new BufferGeometry();
    half.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
    if (normals.length === positions.length) {
      half.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
    } else {
      half.computeVertexNormals();
    }
    if (uvs.length > 0) half.setAttribute('uv', new BufferAttribute(new Float32Array(uvs), 2));
    return { geometry: half, root };
  };

  const parent = wingMesh.parent ?? inner;
  const holder = new Group();
  holder.name = 'wings-split';
  holder.position.copy(wingMesh.position);
  holder.quaternion.copy(wingMesh.quaternion);
  holder.scale.copy(wingMesh.scale);
  parent.add(holder);
  parent.remove(wingMesh);

  const membrane = wingMembrane();
  const halves: [Group | undefined, number[]][] = [[undefined, left], [undefined, right]];
  const pivots: Group[] = [];
  for (const [, triangles] of halves) {
    if (triangles.length === 0) continue;
    const { geometry: half, root } = buildHalf(triangles);
    const pivot = new Group();
    pivot.position.copy(root);
    const mesh = new Mesh(half, membrane);
    mesh.castShadow = true;
    mesh.position.set(-root.x, -root.y, -root.z);
    pivot.add(mesh);
    holder.add(pivot);
    pivots.push(pivot);
  }
  // left wing = negative x side
  rig.wingsLeft = pivots.find((p) => p.position.x < 0) ?? pivots[0];
  rig.wingsRight = pivots.find((p) => p.position.x >= 0) ?? pivots[1] ?? pivots[0];
}

function addBeetleLegs(rig: InsectRig): void {
  const material = chitin(0x14110f, 0.7, 0);
  for (const side of [-1, 1]) {
    for (let index = 0; index < 3; index += 1) {
      const leg = new Group();
      const limb = new Mesh(new CylinderGeometry(0.02, 0.035, 0.5, 6), material);
      limb.position.y = -0.22;
      limb.rotation.z = side * 0.5;
      leg.add(limb);
      leg.position.set(side * (0.28 + index * 0.06), -0.28, (index - 1) * 0.35);
      rig.root.add(leg);
      rig.legs.push(leg);
    }
  }
}

function tryLoadRig(variant: InsectVariant, phase: number): InsectRig | undefined {
  const template = getTemplate(ASSET_NAMES[variant]);
  if (!template) {
    return undefined;
  }
  const inner = cloneSkeleton(template.scene);
  const root = new Group();
  root.name = `${variant}-glb-insect`;
  root.add(inner);
  const rig: InsectRig = {
    root, legs: [], wings: [], materials: [], phase, hitTimer: 0, deathTimer: 0,
  };

  // Face +z: rotate so the longest horizontal axis is z, then check which
  // end the head is on.
  inner.updateWorldMatrix(true, true);
  let box = new Box3().setFromObject(inner);
  let size = box.getSize(new Vector3());
  if (size.x > size.z) {
    inner.rotateY(Math.PI / 2);
    inner.updateWorldMatrix(true, true);
  }
  if (headZ(inner, variant) < 0) {
    inner.rotateY(Math.PI);
    inner.updateWorldMatrix(true, true);
  }

  // Normalise scale (body length along z) and centre at the origin.
  box = new Box3().setFromObject(inner);
  size = box.getSize(new Vector3());
  const scale = TARGET_LENGTH[variant] / Math.max(1e-4, size.z);
  inner.scale.multiplyScalar(scale);
  inner.updateWorldMatrix(true, true);
  box = new Box3().setFromObject(inner);
  const center = box.getCenter(new Vector3());
  inner.position.sub(center);

  if (variant === 'fly') {
    splitWings(inner, rig);
  }
  if (variant === 'beetle') {
    addBeetleLegs(rig);
  }

  // Replace materials with the project's chitin/eye/membrane set.
  inner.traverse((node) => {
    const mesh = node as Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const replaced = materials.map((material) => materialFor(material?.name ?? '', variant));
    mesh.material = Array.isArray(mesh.material) ? replaced : replaced[0]!;
    for (const material of replaced) {
      // Wing membranes are transparent and stay out of the flash set.
      if (!(material instanceof MeshPhysicalMaterial && material.transparent)
        && !rig.materials.includes(material)) {
        rig.materials.push(material);
      }
    }
  });

  // Animations for skinned models.
  if (template.animations.length > 0) {
    rig.mixer = new AnimationMixer(inner);
    rig.actions = {};
    for (const clip of template.animations) {
      rig.actions[clip.name] = rig.mixer.clipAction(clip);
    }
    const flying = Object.entries(rig.actions).find(([name]) => /flying/i.test(name));
    if (flying) {
      flying[1].play();
    }
  }

  root.userData.insectRig = rig;
  return rig;
}

/* ------------------------------------------------------------------ */
/* Procedural fallback rig (organic night-garden palette)              */
/* ------------------------------------------------------------------ */

const palettes: Record<InsectVariant, {
  head: number;
  thorax: number;
  abdomen: number;
  accent: number;
}> = {
  fly: { head: 0x2a211b, thorax: 0x6b5a48, abdomen: 0x3a2f2a, accent: 0x8a7a4c },
  wasp: { head: 0x1c1710, thorax: 0xc98a2a, abdomen: 0x1c1710, accent: 0xc98a2a },
  beetle: { head: 0x14110f, thorax: 0x3a3030, abdomen: 0x9c2f22, accent: 0x66705c },
  'drone-hornet': { head: 0x1a1512, thorax: 0x8a6a2c, abdomen: 0x1a1512, accent: 0xd9a441 },
};

function addSegment(
  root: Group,
  geometry: CapsuleGeometry | SphereGeometry,
  material: MeshPhysicalMaterial,
  position: [number, number, number],
  scale: [number, number, number],
): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  mesh.castShadow = true;
  root.add(mesh);
  return mesh;
}

function addLeg(rig: InsectRig, side: number, index: number, material: MeshPhysicalMaterial): void {
  const leg = new Group();
  const upper = new Mesh(new CylinderGeometry(0.03, 0.05, 0.48, 6), material);
  const lower = new Mesh(new CylinderGeometry(0.018, 0.03, 0.42, 6), material);
  upper.rotation.z = side * (0.72 + index * 0.08);
  lower.position.y = -0.25;
  lower.rotation.z = side * (0.48 + index * 0.08);
  leg.position.set(side * (0.24 + index * 0.1), -0.17, (index - 1) * 0.25);
  leg.add(upper, lower);
  rig.root.add(leg);
  rig.legs.push(leg);
}

function addAntennae(root: Group, material: MeshPhysicalMaterial): void {
  for (const side of [-1, 1]) {
    const antenna = new Mesh(new CylinderGeometry(0.018, 0.026, 0.62, 6), material);
    antenna.position.set(side * 0.15, 0.34, -0.7);
    antenna.rotation.set(side * 0.35, side * 0.18, side * 0.28);
    root.add(antenna);
    const tip = new Mesh(new SphereGeometry(0.045, 8, 6), material);
    tip.position.set(side * 0.26, 0.58, -0.94);
    root.add(tip);
  }
}

function addEyes(root: Group, rig: InsectRig): void {
  const eyeMaterial = compoundEye();
  rig.materials.push(eyeMaterial);
  for (const side of [-1, 1]) {
    const eye = new Mesh(new SphereGeometry(0.16, 10, 8), eyeMaterial);
    eye.position.set(side * 0.22, 0.11, -0.72);
    eye.scale.set(1, 1.15, 0.8);
    root.add(eye);
  }
}

function addWings(rig: InsectRig, variant: InsectVariant): void {
  for (const side of [-1, 1]) {
    const wing = new Mesh(
      new CapsuleGeometry(0.07, variant === 'beetle' ? 0.58 : 0.82, 5, 8),
      wingMembrane(),
    );
    wing.position.set(side * 0.48, 0.28, 0.02);
    wing.rotation.set(0.08, side * 0.5, side * 0.18);
    wing.scale.set(1.2, 0.55, 0.2);
    rig.root.add(wing);
    rig.wings.push(wing);
  }
}

function addVariantDetails(root: Group, variant: InsectVariant, palette: (typeof palettes)[InsectVariant]): void {
  if (variant === 'wasp' || variant === 'drone-hornet') {
    const stripeMaterial = chitin(palette.accent, 0.55, 0.3);
    for (let index = 0; index < 3; index += 1) {
      const stripe = new Mesh(new BoxGeometry(0.56, 0.09, 0.72), stripeMaterial);
      stripe.position.set(0, 0.12, 0.32 - index * 0.27);
      root.add(stripe);
    }
    const stinger = new Mesh(
      new CylinderGeometry(0.015, 0.09, 0.46, 7),
      chitin(0x3a3128, 0.7, 0),
    );
    stinger.position.set(0, 0.02, 0.72);
    stinger.rotation.x = Math.PI / 2;
    root.add(stinger);
  }
  if (variant === 'beetle') {
    const shell = new Mesh(new SphereGeometry(0.58, 14, 9), chitin(palette.abdomen, 0.55, 0.4));
    shell.position.set(0, 0.14, 0.22);
    shell.scale.set(1.03, 0.68, 1.2);
    shell.castShadow = true;
    root.add(shell);
  }
}

function proceduralRig(variant: InsectVariant, phase: number): InsectRig {
  const palette = palettes[variant];
  const root = new Group();
  root.name = `${variant}-procedural-insect`;
  const rig: InsectRig = {
    root, legs: [], wings: [], materials: [], phase, hitTimer: 0, deathTimer: 0,
  };
  const head = chitin(palette.head, 0.6);
  const thorax = chitin(palette.thorax, 0.58, 0.35);
  const abdomen = chitin(palette.abdomen, 0.6, 0.35);
  const legMaterial = chitin(0x241d16, 0.7, 0);
  rig.materials.push(head, thorax, abdomen);
  addSegment(root, new SphereGeometry(0.35, 14, 10), head, [0, 0.05, -0.54], [1, 0.9, 1.05]);
  addSegment(root, new CapsuleGeometry(0.42, 0.52, 10, 14), thorax, [0, 0.08, -0.05], [1, 0.95, 1]);
  addSegment(root, new CapsuleGeometry(0.34, variant === 'beetle' ? 0.8 : 0.66, 10, 14), abdomen, [0, 0.08, 0.58], [1, 0.86, 1.1]);
  addEyes(root, rig);
  addAntennae(root, head);
  addWings(rig, variant);
  addVariantDetails(root, variant, palette);
  for (const side of [-1, 1]) {
    for (let index = 0; index < 3; index += 1) {
      addLeg(rig, side, index, legMaterial);
    }
  }
  root.userData.insectRig = rig;
  return rig;
}

export function createInsectMesh(variant: InsectVariant, phase = 0): InsectRig {
  return tryLoadRig(variant, phase) ?? proceduralRig(variant, phase);
}

/* ------------------------------------------------------------------ */
/* Animation + hit/death                                               */
/* ------------------------------------------------------------------ */

function findAction(rig: InsectRig, pattern: RegExp): AnimationAction | undefined {
  if (!rig.actions) return undefined;
  const entry = Object.entries(rig.actions).find(([name]) => pattern.test(name));
  return entry?.[1];
}

export function animateInsect(rig: InsectRig, dt: number, locomotion = 1): void {
  rig.mixer?.update(dt);
  if (rig.deathTimer > 0) {
    rig.deathTimer = Math.max(0, rig.deathTimer - dt);
    rig.root.rotation.z += dt * 7;
    rig.root.rotation.x += dt * 3;
    rig.root.scale.setScalar(Math.max(0, rig.deathTimer / 0.8));
    return;
  }
  rig.phase += dt * (12 + locomotion * 3);
  for (const [index, leg] of rig.legs.entries()) {
    const side = index < 3 ? 1 : -1;
    const legIndex = index % 3;
    leg.rotation.x = Math.sin(rig.phase + legIndex * 1.7) * 0.18 * locomotion;
    leg.rotation.y = side * Math.cos(rig.phase + legIndex) * 0.12 * locomotion;
  }
  if (rig.wingsLeft && rig.wingsRight) {
    const flap = Math.sin(rig.phase * 1.7) * 0.55;
    rig.wingsLeft.rotation.z = -(0.14 + flap);
    rig.wingsRight.rotation.z = 0.14 + flap;
  } else {
    const flap = Math.sin(rig.phase * 1.7) * 0.42;
    for (const [index, wing] of rig.wings.entries()) {
      wing.rotation.z = (index === 0 ? -1 : 1) * (0.14 + flap);
    }
  }
  const flashing = rig.hitTimer > 0;
  if (flashing) {
    rig.hitTimer = Math.max(0, rig.hitTimer - dt);
  }
  for (const material of rig.materials) {
    if ('emissive' in material) {
      const standardMaterial = material as MeshStandardMaterial;
      if (flashing) {
        standardMaterial.emissive.setHex(0xffffff);
        standardMaterial.emissiveIntensity = 1.2;
      } else {
        standardMaterial.emissiveIntensity = 0;
      }
    }
  }
}

export function flashInsect(rig: InsectRig): void {
  rig.hitTimer = 0.14;
  const hit = findAction(rig, /HitRecieve|Attack/i);
  if (hit) {
    hit.reset();
    hit.setLoop(LoopOnce, 1);
    hit.play();
  }
}

export function killInsect(rig: InsectRig): void {
  rig.deathTimer = 0.8;
  const death = findAction(rig, /Death/i);
  if (death) {
    death.reset();
    death.setLoop(LoopOnce, 1);
    death.clampWhenFinished = true;
    death.play();
  }
}
