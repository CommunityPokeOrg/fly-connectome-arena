import {
  AdditiveBlending,
  BoxGeometry,
  CapsuleGeometry,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
  type Material,
} from 'three';

export type InsectVariant = 'fly' | 'wasp' | 'beetle' | 'drone-hornet';

export interface InsectRig {
  root: Group;
  legs: Group[];
  wings: Mesh[];
  materials: Material[];
  phase: number;
  hitTimer: number;
  deathTimer: number;
}

const palettes: Record<InsectVariant, {
  head: number;
  thorax: number;
  abdomen: number;
  accent: number;
  wing: number;
}> = {
  fly: { head: 0x24344a, thorax: 0x148d8c, abdomen: 0x1f4951, accent: 0xffd447, wing: 0x75f7ff },
  wasp: { head: 0x1b1420, thorax: 0xf0a52d, abdomen: 0x171421, accent: 0xffd34f, wing: 0xfff0a1 },
  beetle: { head: 0x121b2e, thorax: 0x164a69, abdomen: 0x092435, accent: 0x4eeeff, wing: 0x4db6d0 },
  'drone-hornet': { head: 0x24122b, thorax: 0xb947e8, abdomen: 0x34174b, accent: 0xff4ba8, wing: 0x9e6cff },
};

function standard(color: number, emissive = color, intensity = 0.6): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: intensity,
    metalness: 0.42,
    roughness: 0.38,
  });
}

function addSegment(
  root: Group,
  geometry: CapsuleGeometry | SphereGeometry,
  material: MeshStandardMaterial,
  position: [number, number, number],
  scale: [number, number, number],
): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.position.set(...position);
  mesh.scale.set(...scale);
  root.add(mesh);
  return mesh;
}

function addLeg(rig: InsectRig, side: number, index: number): void {
  const leg = new Group();
  const upper = new Mesh(
    new CylinderGeometry(0.035, 0.055, 0.48, 6),
    standard(palettes.fly.accent, palettes.fly.accent, 0.3),
  );
  const lower = new Mesh(
    new CylinderGeometry(0.022, 0.035, 0.42, 6),
    standard(0x9fb7c4, 0x172b3e, 0.25),
  );
  upper.rotation.z = side * (0.72 + index * 0.08);
  lower.position.y = -0.25;
  lower.rotation.z = side * (0.48 + index * 0.08);
  leg.position.set(side * (0.24 + index * 0.1), -0.17, (index - 1) * 0.25);
  leg.add(upper, lower);
  rig.root.add(leg);
  rig.legs.push(leg);
}

function addAntennae(root: Group, material: MeshStandardMaterial): void {
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

function addEyes(root: Group, variant: InsectVariant): void {
  const eyeMaterial = new MeshStandardMaterial({
    color: variant === 'beetle' ? 0xffd76a : 0xff174f,
    emissive: variant === 'beetle' ? 0xff6f21 : 0xe10044,
    emissiveIntensity: 3.4,
    metalness: 0.2,
    roughness: 0.2,
  });
  for (const side of [-1, 1]) {
    const eye = new Mesh(new SphereGeometry(0.16, 10, 8), eyeMaterial);
    eye.position.set(side * 0.22, 0.11, -0.72);
    eye.scale.set(1, 1.15, 0.8);
    root.add(eye);
  }
}

function addWings(rig: InsectRig, palette: (typeof palettes)[InsectVariant], variant: InsectVariant): void {
  const wingMaterial = new MeshStandardMaterial({
    color: palette.wing,
    emissive: palette.wing,
    emissiveIntensity: 1.1,
    transparent: true,
    opacity: variant === 'beetle' ? 0.18 : 0.38,
    side: 2,
    blending: AdditiveBlending,
  });
  for (const side of [-1, 1]) {
    const wing = new Mesh(new CapsuleGeometry(0.07, variant === 'beetle' ? 0.58 : 0.82, 5, 8), wingMaterial.clone());
    wing.position.set(side * 0.48, 0.28, 0.02);
    wing.rotation.set(0.08, side * 0.5, side * 0.18);
    wing.scale.set(1.2, 0.55, 0.2);
    rig.root.add(wing);
    rig.wings.push(wing);
  }
}

function addVariantDetails(root: Group, variant: InsectVariant, palette: (typeof palettes)[InsectVariant]): void {
  if (variant === 'wasp' || variant === 'drone-hornet') {
    for (let index = 0; index < 3; index += 1) {
      const stripe = new Mesh(
        new BoxGeometry(0.56, 0.09, 0.72),
        new MeshBasicMaterial({ color: palette.accent }),
      );
      stripe.position.set(0, 0.12, 0.32 - index * 0.27);
      root.add(stripe);
    }
    const stinger = new Mesh(
      new CylinderGeometry(0.015, 0.09, 0.46, 7),
      standard(0xd9efff, 0x8faabd, 0.5),
    );
    stinger.position.set(0, 0.02, 0.72);
    stinger.rotation.x = Math.PI / 2;
    root.add(stinger);
  }
  if (variant === 'beetle') {
    const shell = new Mesh(
      new SphereGeometry(0.58, 14, 9),
      standard(palette.abdomen, palette.accent, 1.1),
    );
    shell.position.set(0, 0.14, 0.22);
    shell.scale.set(1.03, 0.68, 1.2);
    root.add(shell);
    const seam = new Mesh(
      new BoxGeometry(0.025, 0.55, 0.68),
      new MeshBasicMaterial({ color: palette.accent }),
    );
    seam.position.set(0, 0.42, 0.22);
    root.add(seam);
  }
}

export function createInsectMesh(variant: InsectVariant, phase = 0): InsectRig {
  const palette = palettes[variant];
  const root = new Group();
  root.name = `${variant}-procedural-insect`;
  const rig: InsectRig = { root, legs: [], wings: [], materials: [], phase, hitTimer: 0, deathTimer: 0 };
  const head = standard(palette.head, palette.accent, 0.75);
  const thorax = standard(palette.thorax, palette.accent, 0.85);
  const abdomen = standard(palette.abdomen, palette.accent, 0.7);
  rig.materials.push(head, thorax, abdomen);
  addSegment(root, new SphereGeometry(0.35, 14, 10), head, [0, 0.05, -0.54], [1, 0.9, 1.05]);
  addSegment(root, new CapsuleGeometry(0.42, 0.52, 10, 14), thorax, [0, 0.08, -0.05], [1, 0.95, 1]);
  addSegment(root, new CapsuleGeometry(0.34, variant === 'beetle' ? 0.8 : 0.66, 10, 14), abdomen, [0, 0.08, 0.58], [1, 0.86, 1.1]);
  addEyes(root, variant);
  addAntennae(root, head);
  addWings(rig, palette, variant);
  addVariantDetails(root, variant, palette);
  for (const side of [-1, 1]) {
    for (let index = 0; index < 3; index += 1) {
      addLeg(rig, side, index);
    }
  }
  root.userData.insectRig = rig;
  return rig;
}

export function animateInsect(rig: InsectRig, dt: number, locomotion = 1): void {
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
  const flap = Math.sin(rig.phase * 1.7) * 0.42;
  for (const [index, wing] of rig.wings.entries()) {
    wing.rotation.z = (index === 0 ? -1 : 1) * (0.14 + flap);
  }
  if (rig.hitTimer > 0) {
    rig.hitTimer = Math.max(0, rig.hitTimer - dt);
    for (const material of rig.materials) {
      if ('emissive' in material) {
        const standardMaterial = material as MeshStandardMaterial;
        standardMaterial.emissive.setHex(0xffffff);
        standardMaterial.emissiveIntensity = 4;
      }
    }
  } else {
    for (const material of rig.materials) {
      if ('emissiveIntensity' in material) {
        (material as MeshStandardMaterial).emissiveIntensity = 0.8;
      }
    }
  }
}

export function flashInsect(rig: InsectRig): void {
  rig.hitTimer = 0.14;
}

export function killInsect(rig: InsectRig): void {
  rig.deathTimer = 0.8;
}
