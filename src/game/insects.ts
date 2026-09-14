import {
  BufferGeometry,
  CapsuleGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  IcosahedronGeometry,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  TorusGeometry,
  Float32BufferAttribute,
} from 'three';

export type InsectVariant = 'fly' | 'wasp' | 'beetle' | 'drone-hornet';

export interface LegRig {
  hip: Group;
  knee: Group;
  ankle: Group;
  side: number;
  index: number;
}

export interface WingRig {
  pivot: Group;
  membrane: Mesh;
  veins: LineSegments;
}

export interface InsectRig {
  root: Group;
  head: Group;
  thorax: Mesh;
  abdomen: Mesh;
  eyes: Mesh[];
  antennae: Group[];
  legs: LegRig[];
  wings: WingRig[];
  materials: MeshStandardMaterial[];
  baseEmissive: number[];
  phase: number;
  hitTimer: number;
  deathTimer: number;
  variant: InsectVariant;
}

interface Palette {
  head: number;
  thorax: number;
  abdomen: number;
  accent: number;
  wing: number;
  eye: number;
  eyeEmissive: number;
  leg: number;
  tibia: number;
}

const palettes: Record<InsectVariant, Palette> = {
  fly: {
    head: 0x24344a,
    thorax: 0x148d8c,
    abdomen: 0x1f4951,
    accent: 0xffd447,
    wing: 0x75f7ff,
    eye: 0xff5a36,
    eyeEmissive: 0xd82e1d,
    leg: 0x243d48,
    tibia: 0x466875,
  },
  wasp: {
    head: 0x281a1a,
    thorax: 0xd28728,
    abdomen: 0x21151b,
    accent: 0xf6c53e,
    wing: 0xffe69a,
    eye: 0x9a4c14,
    eyeEmissive: 0x6d250c,
    leg: 0x3d251c,
    tibia: 0x74502b,
  },
  beetle: {
    head: 0x121b2e,
    thorax: 0x164a69,
    abdomen: 0x092435,
    accent: 0x4eeeff,
    wing: 0x4db6d0,
    eye: 0xffd76a,
    eyeEmissive: 0xd66b1b,
    leg: 0x0c1325,
    tibia: 0x293c61,
  },
  'drone-hornet': {
    head: 0x24122b,
    thorax: 0x8e3fb8,
    abdomen: 0x34174b,
    accent: 0xff4ba8,
    wing: 0xa78aff,
    eye: 0xd847b6,
    eyeEmissive: 0x9d1e8d,
    leg: 0x251533,
    tibia: 0x52315d,
  },
};

const wingLengths: Record<InsectVariant, number> = {
  fly: 1.2,
  wasp: 1.35,
  beetle: 0.9,
  'drone-hornet': 1.5,
};

function standard(
  color: number,
  emissive = color,
  emissiveIntensity = 0.15,
  metalness = 0.35,
  roughness = 0.45,
): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity,
    metalness,
    roughness,
  });
}

function registerMaterial(rig: InsectRig, material: MeshStandardMaterial): MeshStandardMaterial {
  rig.materials.push(material);
  rig.baseEmissive.push(material.emissiveIntensity);
  material.userData.baseEmissiveColor = material.emissive.getHex();
  return material;
}

function addMesh<T extends Mesh>(parent: Group | Mesh, object: T): T {
  object.castShadow = true;
  object.receiveShadow = false;
  parent.add(object);
  return object;
}

function makeCapsule(
  radius: number,
  length: number,
  material: MeshStandardMaterial,
  position: [number, number, number],
  scale: [number, number, number] = [1, 1, 1],
): Mesh {
  const object = new Mesh(new CapsuleGeometry(radius, length, 10, 16), material);
  object.position.set(...position);
  object.scale.set(...scale);
  object.rotation.x = Math.PI / 2;
  return object;
}

function addEyes(rig: InsectRig, palette: Palette, head: Group): void {
  const eyeMaterial = registerMaterial(
    rig,
    new MeshStandardMaterial({
      color: palette.eye,
      emissive: palette.eyeEmissive,
      emissiveIntensity: 0.35,
      metalness: 0.1,
      roughness: 0.15,
      flatShading: true,
    }),
  );
  const facetMaterial = registerMaterial(
    rig,
    new MeshStandardMaterial({
      color: palette.eye,
      emissive: palette.eyeEmissive,
      emissiveIntensity: 0.45,
      metalness: 0.08,
      roughness: 0.12,
    }),
  );
  for (const side of [-1, 1]) {
    const eye = addMesh(head, new Mesh(new IcosahedronGeometry(0.17, 2), eyeMaterial));
    eye.position.set(side * 0.27, 0.07, 0.2);
    eye.rotation.y = side * 0.25;
    eye.scale.set(0.85, 1.1, 1);
    rig.eyes.push(eye);
    for (let facet = 0; facet < 12; facet += 1) {
      const longitude = (facet % 4) * Math.PI / 2 + Math.PI / 4;
      const latitude = facet < 4 ? 0.35 : facet < 8 ? 0.95 : 1.45;
      const point = addMesh(eye, new Mesh(new SphereGeometry(0.02, 5, 4), facetMaterial));
      point.position.set(
        Math.sin(latitude) * Math.cos(longitude) * 0.17,
        Math.cos(latitude) * 0.17,
        Math.sin(latitude) * Math.sin(longitude) * 0.17,
      );
    }
  }
  for (let index = 0; index < 3; index += 1) {
    const angle = (index / 3) * Math.PI * 2 + Math.PI / 6;
    const ocellus = addMesh(head, new Mesh(new SphereGeometry(0.035, 7, 5), facetMaterial));
    ocellus.position.set(Math.cos(angle) * 0.07, 0.29, Math.sin(angle) * 0.04);
  }
}

function addAntennae(rig: InsectRig, palette: Palette, variant: InsectVariant, head: Group): void {
  const material = registerMaterial(rig, standard(palette.accent, palette.accent, 0.12, 0.28, 0.4));
  const length = variant === 'fly' ? 0.28 : variant === 'beetle' ? 0.38 : 0.5;
  for (const side of [-1, 1]) {
    const antenna = new Group();
    antenna.position.set(side * 0.12, 0.27, 0.02);
    antenna.rotation.z = side * 0.18;
    antenna.userData.baseRotationZ = antenna.rotation.z;
    head.add(antenna);
    rig.antennae.push(antenna);
    const scape = addMesh(
      antenna,
      new Mesh(new CylinderGeometry(0.022, 0.032, length * 0.55, 7), material),
    );
    scape.position.y = length * 0.275;
    const flagellum = addMesh(
      antenna,
      new Mesh(new CylinderGeometry(0.012, 0.018, length * 0.65, 7), material),
    );
    flagellum.position.set(side * length * 0.08, length * 0.78, 0.02);
    flagellum.rotation.z = -side * 0.2;
    const tip = addMesh(antenna, new Mesh(new SphereGeometry(variant === 'beetle' ? 0.07 : 0.035, 8, 6), material));
    tip.position.set(side * length * 0.16, length * 1.12, 0.03);
    if (variant === 'fly') {
      const arista = addMesh(
        antenna,
        new Mesh(
          new PlaneGeometry(0.012, 0.2),
          new MeshStandardMaterial({
            color: palette.accent,
            emissive: palette.accent,
            emissiveIntensity: 0.08,
            transparent: true,
            opacity: 0.8,
            side: DoubleSide,
          }),
        ),
      );
      arista.position.set(side * 0.16, length * 1.16, 0);
      arista.rotation.z = side * 0.35;
    }
  }
}

function addMandibles(rig: InsectRig, palette: Palette, head: Group): void {
  const material = registerMaterial(rig, standard(palette.accent, palette.accent, 0.12, 0.4, 0.35));
  for (const side of [-1, 1]) {
    const mandible = addMesh(head, new Mesh(new ConeGeometry(0.055, 0.3, 7), material));
    mandible.position.set(side * 0.12, -0.08, 0.34);
    mandible.rotation.x = Math.PI / 2;
    mandible.rotation.z = side * 0.25;
  }
}

function addThoraxDetails(rig: InsectRig, palette: Palette, variant: InsectVariant, thorax: Mesh): void {
  if (variant === 'fly' || variant === 'wasp') {
    const bump = addMesh(thorax, new Mesh(new SphereGeometry(0.18, 10, 7), registerMaterial(rig, standard(palette.accent))));
    bump.position.set(0, 0.32, -0.16);
    bump.scale.set(1, 0.55, 0.8);
  }
  if (variant === 'drone-hornet') {
    const material = registerMaterial(rig, standard(palette.accent, palette.accent, 0.2, 0.4, 0.3));
    for (const side of [-1, 1]) {
      const vent = addMesh(thorax, new Mesh(new CylinderGeometry(0.05, 0.05, 0.24, 8), material));
      vent.position.set(side * 0.34, 0.04, 0);
      vent.rotation.z = Math.PI / 2;
    }
  }
}

function addAbdomenDetails(rig: InsectRig, palette: Palette, variant: InsectVariant, abdomen: Mesh): void {
  if (variant === 'wasp' || variant === 'drone-hornet') {
    const waist = addMesh(rig.root, new Mesh(new CylinderGeometry(0.1, 0.14, 0.22, 10), registerMaterial(rig, standard(palette.head))));
    waist.position.set(0, 0, -0.36);
    waist.rotation.x = Math.PI / 2;
    const stripeMaterial = registerMaterial(rig, standard(palette.accent, palette.accent, 0.16, 0.38, 0.34));
    const stripeRadii = [0.29, 0.27, 0.24];
    for (let index = 0; index < stripeRadii.length; index += 1) {
      const stripe = addMesh(
        rig.root,
        new Mesh(new TorusGeometry(stripeRadii[index] ?? 0.24, 0.03, 8, 20), stripeMaterial),
      );
      stripe.position.set(0, 0, -0.55 - index * 0.23);
    }
    const stinger = addMesh(rig.root, new Mesh(new ConeGeometry(0.08, 0.34, 8), registerMaterial(rig, standard(palette.accent))));
    stinger.position.set(0, 0, -1.24);
    stinger.rotation.x = -Math.PI / 2;
  } else if (variant === 'beetle') {
    const shellMaterial = registerMaterial(rig, standard(palette.abdomen, palette.accent, 0.16, 0.7, 0.25));
    for (const side of [-1, 1]) {
      const elytron = addMesh(
        rig.root,
        new Mesh(new SphereGeometry(0.5, 16, 12, side < 0 ? 0 : Math.PI, Math.PI), shellMaterial),
      );
      elytron.position.set(side * 0.035, 0.18, -0.68);
      elytron.scale.set(1, 0.55, 1.35);
    }
    const pronotum = addMesh(rig.root, new Mesh(new SphereGeometry(0.38, 12, 8), shellMaterial));
    pronotum.position.set(0, 0.2, -0.3);
    pronotum.scale.set(1.05, 0.35, 0.65);
  } else {
    const ringMaterial = registerMaterial(rig, standard(palette.head, palette.head, 0.08, 0.3, 0.5));
    for (let index = 0; index < 4; index += 1) {
      const ring = addMesh(rig.root, new Mesh(new TorusGeometry(0.295, 0.018, 7, 18), ringMaterial));
      ring.position.set(0, 0, -0.5 - index * 0.2);
    }
    const haltereMaterial = registerMaterial(rig, standard(palette.accent, palette.accent, 0.1));
    for (const side of [-1, 1]) {
      const stalk = addMesh(rig.root, new Mesh(new CylinderGeometry(0.012, 0.018, 0.18, 6), haltereMaterial));
      stalk.position.set(side * 0.36, 0.16, -0.36);
      stalk.rotation.z = side * 0.55;
      const ball = addMesh(rig.root, new Mesh(new SphereGeometry(0.06, 7, 5), haltereMaterial));
      ball.position.set(side * 0.45, 0.16, -0.38);
    }
  }
  abdomen.userData.baseRotationX = abdomen.rotation.x;
}

function createWingGeometry(length: number): ShapeGeometry {
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.lineTo(length * 0.42, length * 0.12);
  shape.lineTo(length * 0.84, length * 0.2);
  shape.lineTo(length, length * 0.08);
  shape.lineTo(length * 0.78, -length * 0.12);
  shape.lineTo(length * 0.35, -length * 0.08);
  shape.lineTo(0, 0);
  const geometry = new ShapeGeometry(shape, 12);
  const positions = geometry.getAttribute('position');
  for (let index = 0; index < positions.count; index += 1) {
    const span = Math.max(0, Math.min(1, positions.getX(index) / length));
    positions.setY(index, positions.getY(index) + 0.06 * Math.sin(Math.PI * span));
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  return geometry;
}

function addWing(
  rig: InsectRig,
  palette: Palette,
  variant: InsectVariant,
  side: number,
  length: number,
  hind = false,
): void {
  const pivot = new Group();
  pivot.position.set(side * 0.22, 0.3, hind ? -0.18 : 0.05);
  pivot.rotation.y = side * (0.42 + (hind ? 0.08 : 0));
  pivot.rotation.x = -Math.PI / 2;
  pivot.rotation.z = side * 0.15;
  pivot.scale.x = side;
  rig.root.add(pivot);
  const membraneMaterial = new MeshPhysicalMaterial({
    color: palette.wing,
    emissive: palette.wing,
    emissiveIntensity: 0.35,
    transparent: true,
    opacity: variant === 'beetle' ? 0.3 : 0.45,
    roughness: 0.15,
    metalness: 0,
    transmission: 0,
    iridescence: 0.6,
    iridescenceIOR: 1.3,
    clearcoat: 0.8,
    side: DoubleSide,
    depthWrite: false,
  });
  const membrane = addMesh(pivot, new Mesh(createWingGeometry(length), membraneMaterial));
  membrane.name = `${variant}-wing-membrane`;
  const points: number[] = [];
  for (let index = 1; index <= 5; index += 1) {
    const span = index / 6;
    points.push(0, 0, 0, length * span, length * (0.18 - span * 0.08), 0);
  }
  points.push(0, 0, 0, length * 0.75, length * 0.19, 0);
  points.push(0, 0, 0, length * 0.5, -length * 0.1, 0);
  const veinGeometry = new BufferGeometry();
  veinGeometry.setAttribute('position', new Float32BufferAttribute(points, 3));
  const veins = new LineSegments(
    veinGeometry,
    new LineBasicMaterial({ color: palette.accent, transparent: true, opacity: 0.7 }),
  );
  veins.castShadow = false;
  pivot.add(veins);
  rig.wings.push({ pivot, membrane, veins });
}

function addWings(rig: InsectRig, palette: Palette, variant: InsectVariant): void {
  const length = wingLengths[variant];
  addWing(rig, palette, variant, -1, length);
  addWing(rig, palette, variant, 1, length);
  if (variant === 'drone-hornet') {
    addWing(rig, palette, variant, -1, length * 0.68, true);
    addWing(rig, palette, variant, 1, length * 0.68, true);
  } else if (variant === 'beetle') {
    addWing(rig, palette, variant, -1, length * 0.6, true);
    addWing(rig, palette, variant, 1, length * 0.6, true);
    for (const wing of rig.wings.slice(2)) {
      wing.pivot.scale.multiplyScalar(0.6);
      (wing.membrane.material as MeshPhysicalMaterial).opacity = 0.3;
    }
  }
}

function addLeg(rig: InsectRig, palette: Palette, side: number, index: number): void {
  const hip = new Group();
  hip.position.set(side * 0.28, -0.17, 0.32 - index * 0.32);
  hip.rotation.z = side * 0.9;
  hip.rotation.x = index === 0 ? 0.5 : index === 2 ? -0.6 : 0;
  hip.userData.baseRotationX = hip.rotation.x;
  rig.root.add(hip);
  const femurMaterial = rig.materials.find((material) => material.color.getHex() === palette.leg)
    ?? registerMaterial(rig, standard(palette.leg, palette.leg, 0.08, 0.25, 0.5));
  const tibiaMaterial = rig.materials.find((material) => material.color.getHex() === palette.tibia)
    ?? registerMaterial(rig, standard(palette.tibia, palette.tibia, 0.06, 0.25, 0.48));
  const femurLength = 0.45;
  const tibiaLength = 0.42;
  const femur = addMesh(hip, new Mesh(new CylinderGeometry(0.035, 0.05, femurLength, 7), femurMaterial));
  femur.position.y = -femurLength / 2;
  const knee = new Group();
  knee.position.y = -femurLength;
  knee.rotation.z = -side * 1.1;
  knee.userData.baseRotationZ = knee.rotation.z;
  hip.add(knee);
  const tibia = addMesh(knee, new Mesh(new CylinderGeometry(0.022, 0.033, tibiaLength, 7), tibiaMaterial));
  tibia.position.y = -tibiaLength / 2;
  const ankle = new Group();
  ankle.position.y = -tibiaLength;
  knee.add(ankle);
  const tarsus = addMesh(ankle, new Mesh(new CylinderGeometry(0.012, 0.02, 0.22, 7), tibiaMaterial));
  tarsus.position.y = -0.11;
  const claw = addMesh(ankle, new Mesh(new SphereGeometry(0.035, 6, 5), femurMaterial));
  claw.position.y = -0.23;
  rig.legs.push({ hip, knee, ankle, side, index });
}

function addLegs(rig: InsectRig, palette: Palette): void {
  for (const side of [-1, 1]) {
    for (let index = 0; index < 3; index += 1) {
      addLeg(rig, palette, side, index);
    }
  }
}

function restoreMaterial(material: MeshStandardMaterial, index: number, rig: InsectRig): void {
  material.emissive.setHex(material.userData.baseEmissiveColor as number);
  material.emissiveIntensity = rig.baseEmissive[index] ?? 0.15;
}

export function createInsectMesh(variant: InsectVariant, phase = 0): InsectRig {
  const palette = palettes[variant];
  const root = new Group();
  root.name = `${variant}-procedural-insect`;
  const rig: InsectRig = {
    root,
    head: new Group(),
    thorax: new Mesh(),
    abdomen: new Mesh(),
    eyes: [],
    antennae: [],
    legs: [],
    wings: [],
    materials: [],
    baseEmissive: [],
    phase,
    hitTimer: 0,
    deathTimer: 0,
    variant,
  };
  rig.head.position.set(0, 0.04, 0.62);
  root.add(rig.head);
  const headMaterial = registerMaterial(rig, standard(palette.head, palette.head, 0.2));
  const thoraxMaterial = registerMaterial(
    rig,
    standard(
      palette.thorax,
      palette.thorax,
      0.22,
      variant === 'beetle' ? 0.7 : 0.35,
      variant === 'beetle' ? 0.25 : 0.45,
    ),
  );
  const abdomenMaterial = registerMaterial(
    rig,
    standard(
      palette.abdomen,
      palette.abdomen,
      0.22,
      variant === 'beetle' ? 0.7 : 0.35,
      variant === 'beetle' ? 0.25 : 0.45,
    ),
  );
  const headMesh = addMesh(rig.head, new Mesh(new SphereGeometry(0.32, 16, 12), headMaterial));
  headMesh.scale.set(1, 0.9, 1.05);
  rig.thorax = addMesh(rig.root, makeCapsule(0.38, 0.52, thoraxMaterial, [0, 0, 0], [1, 0.95, 1]));
  rig.abdomen = addMesh(
    rig.root,
    makeCapsule(
      variant === 'beetle' ? 0.38 : 0.32,
      variant === 'beetle' ? 0.72 : 0.66,
      abdomenMaterial,
      [0, variant === 'beetle' ? 0.04 : 0, -0.75],
      variant === 'beetle' ? [1.1, 0.8, 1.2] : [1, 0.88, variant === 'wasp' || variant === 'drone-hornet' ? 1.3 : 1.1],
    ),
  );
  if (variant === 'wasp' || variant === 'drone-hornet') {
    rig.abdomen.rotation.x = variant === 'drone-hornet' ? 0.08 : 0.05;
  }
  addEyes(rig, palette, rig.head);
  addAntennae(rig, palette, variant, rig.head);
  if (variant === 'beetle' || variant === 'drone-hornet') {
    addMandibles(rig, palette, rig.head);
  }
  addThoraxDetails(rig, palette, variant, rig.thorax);
  addAbdomenDetails(rig, palette, variant, rig.abdomen);
  addWings(rig, palette, variant);
  addLegs(rig, palette);
  rig.root.traverse((object) => {
    if (object instanceof Mesh) {
      object.castShadow = true;
      object.receiveShadow = false;
    }
  });
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
  rig.root.scale.setScalar(1);
  rig.phase += dt * (12 + locomotion * 3);
  for (const leg of rig.legs) {
    const tripod = (leg.side < 0 && leg.index % 2 === 0) || (leg.side > 0 && leg.index === 1);
    const motion = rig.phase + (tripod ? 0 : Math.PI);
    leg.hip.rotation.x = (leg.hip.userData.baseRotationX as number) + Math.sin(motion) * 0.35 * locomotion;
    leg.knee.rotation.z =
      (leg.knee.userData.baseRotationZ as number) - Math.max(0, Math.sin(motion)) * leg.side * 0.5 * locomotion;
  }
  const wingPhase = rig.phase * (rig.variant === 'fly' ? 3 : 2.2);
  for (const [index, wing] of rig.wings.entries()) {
    const side = index % 2 === 0 ? -1 : 1;
    wing.pivot.rotation.z = side * (0.15 + Math.sin(wingPhase) * 0.55);
    wing.pivot.rotation.x = -Math.PI / 2 + Math.sin(wingPhase + Math.PI / 2) * 0.15;
  }
  for (const [index, antenna] of rig.antennae.entries()) {
    antenna.rotation.z = (antenna.userData.baseRotationZ as number) + Math.sin(rig.phase * 0.4 + index) * 0.08;
  }
  rig.abdomen.rotation.x = (rig.abdomen.userData.baseRotationX as number ?? 0) + Math.sin(rig.phase * 0.6) * 0.05;
  if (rig.hitTimer > 0) {
    rig.hitTimer = Math.max(0, rig.hitTimer - dt);
    for (const material of rig.materials) {
      material.emissive.setHex(0xffffff);
      material.emissiveIntensity = 4;
    }
  } else {
    for (const [index, material] of rig.materials.entries()) {
      restoreMaterial(material, index, rig);
    }
  }
}

export function flashInsect(rig: InsectRig): void {
  rig.hitTimer = 0.14;
}

export function killInsect(rig: InsectRig): void {
  rig.deathTimer = 0.8;
}
