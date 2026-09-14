import { Box3, Mesh, MeshBasicMaterial, MeshStandardMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import { animateInsect, createInsectMesh, killInsect, type InsectVariant } from '../src/game/insects.ts';

const variants: InsectVariant[] = ['fly', 'wasp', 'beetle', 'drone-hornet'];

describe('procedural insect rigs', () => {
  it.each(variants)('builds a lit articulated %s rig', (variant) => {
    const rig = createInsectMesh(variant);
    expect(rig.legs).toHaveLength(6);
    for (const leg of rig.legs) {
      expect(leg.hip).toBeDefined();
      expect(leg.knee).toBeDefined();
      expect(leg.ankle).toBeDefined();
      let meshes = 0;
      leg.hip.traverse((object) => {
        if (object instanceof Mesh) meshes += 1;
      });
      expect(meshes).toBeGreaterThanOrEqual(3);
    }
    expect(rig.wings.length).toBeGreaterThanOrEqual(2);
    for (const wing of rig.wings) {
      const positions = wing.membrane.geometry.getAttribute('position');
      const ys = Array.from({ length: positions.count }, (_, index) => positions.getY(index));
      expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(0);
    }
    expect(rig.eyes).toHaveLength(2);
    for (const eye of rig.eyes) {
      expect((eye.material as MeshStandardMaterial).flatShading).toBe(true);
    }
    expect(rig.head.position.z).toBeGreaterThan(rig.thorax.position.z);
    expect(rig.thorax.position.z).toBeGreaterThan(rig.abdomen.position.z);
    rig.root.traverse((object) => {
      if (object instanceof Mesh) {
        expect(object.castShadow).toBe(true);
        expect(object.material).not.toBeInstanceOf(MeshBasicMaterial);
      }
    });
    const bounds = new Box3().setFromObject(rig.root);
    expect(bounds.max.z - bounds.min.z).toBeGreaterThan(1.8);
    expect(bounds.max.y - bounds.min.y).toBeGreaterThan(0.6);
    expect(bounds.max.x - bounds.min.x).toBeGreaterThan(1.5);
  });

  it('animates locomotion and completes the death sequence', () => {
    const rig = createInsectMesh('fly');
    const initialHip = rig.legs[0]?.hip.rotation.x ?? 0;
    const initialWing = rig.wings[0]?.pivot.rotation.z ?? 0;
    animateInsect(rig, 0.1, 1);
    expect(rig.legs[0]?.hip.rotation.x).not.toBe(initialHip);
    expect(rig.wings[0]?.pivot.rotation.z).not.toBe(initialWing);
    killInsect(rig);
    animateInsect(rig, 1, 0);
    expect(rig.deathTimer).toBe(0);
    expect(rig.root.scale.x).toBe(0);
  });

  it('places fly eyes on the +Z-facing head', () => {
    const rig = createInsectMesh('fly');
    expect(rig.eyes.every((eye) => eye.position.z > 0)).toBe(true);
  });
});
