import { describe, expect, it } from 'vitest';
import { GridHelper, InstancedMesh, LineSegments, Mesh, MeshStandardMaterial } from 'three';
import { Arena } from '../src/game/arena.ts';

describe('arena map (Kenney chamber, procedural fallbacks in Node)', () => {
  const arena = new Arena(7);

  it('declares its CC0 map provenance', () => {
    expect(arena.mapSource).toContain('Kenney');
  });

  it('has no grid helpers or wireframe line segments', () => {
    let offending = 0;
    arena.scene.traverse((node) => {
      if (node instanceof GridHelper || node instanceof LineSegments) offending += 1;
    });
    expect(offending).toBe(0);
  });

  it('builds a walled boundary of at least 24 wall instances', () => {
    let named = 0;
    let instancedCount = 0;
    arena.scene.traverse((node) => {
      if (node.name.startsWith('arena-wall')) {
        named += 1;
        if (node instanceof InstancedMesh) instancedCount += node.count;
      }
    });
    expect(named >= 24 || instancedCount >= 24).toBe(true);
  });

  it('places at least 15 obstacles, all inside the arena', () => {
    expect(arena.obstacles.length).toBeGreaterThanOrEqual(15);
    for (const obstacle of arena.obstacles) {
      const distance = Math.hypot(obstacle.x, obstacle.z);
      expect(distance).toBeLessThanOrEqual(arena.radius - 1);
    }
  });

  it('places 8 food dishes clear of obstacles', () => {
    expect(arena.foods.length).toBe(8);
    for (const food of arena.foods) {
      for (const obstacle of arena.obstacles) {
        const distance = Math.hypot(food.x - obstacle.x, food.z - obstacle.z);
        expect(distance).toBeGreaterThanOrEqual(Math.min(1.6, obstacle.radius + 1.6 - 1e-9));
      }
    }
  });

  it('keeps materials restrained: low emissive, no neon', () => {
    arena.scene.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (!(material instanceof MeshStandardMaterial)) continue;
        expect(material.emissiveIntensity).toBeLessThanOrEqual(0.35);
        const hsl = { h: 0, s: 0, l: 0 };
        material.color.getHSL(hsl);
        const neon = hsl.s > 0.6 && hsl.l > 0.45 && hsl.h >= 0.4 && hsl.h <= 0.6;
        expect(neon).toBe(false);
      }
    });
  });
});
