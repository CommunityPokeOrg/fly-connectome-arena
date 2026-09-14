import { describe, expect, it } from 'vitest';
import { Scene, Vector3 } from 'three';
import { RNG } from '../src/core/rng.ts';
import { Enemies } from '../src/game/enemies.ts';

describe('enemy steering AI (node, procedural rigs)', () => {
  it('keeps enemies inside the arena, moving over a wide area, no NaN', () => {
    const scene = new Scene();
    const enemies = new Enemies(scene, new RNG(7));
    enemies.spawnWave(3, 18);
    const dt = 1 / 60;
    const steps = 30 * 60;
    const flyPosition = new Vector3(0, 0, 0);
    const flyVelocity = new Vector3(0, 0, 0);
    const tracks = new Map<string, { minX: number; maxX: number; minZ: number; maxZ: number; path: number; last: Vector3; dashed: boolean }>();
    for (const enemy of enemies.items) {
      tracks.set(enemy.id, {
        minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity,
        path: 0, last: enemy.group.position.clone(), dashed: false,
      });
    }
    for (let i = 0; i < steps; i += 1) {
      enemies.update(dt, flyPosition, flyVelocity, 18, []);
      for (const enemy of enemies.items) {
        const track = tracks.get(enemy.id)!;
        const position = enemy.group.position;
        expect(Number.isFinite(position.x)).toBe(true);
        expect(Number.isFinite(position.z)).toBe(true);
        expect(Math.hypot(position.x, position.z)).toBeLessThanOrEqual(18);
        track.minX = Math.min(track.minX, position.x);
        track.maxX = Math.max(track.maxX, position.x);
        track.minZ = Math.min(track.minZ, position.z);
        track.maxZ = Math.max(track.maxZ, position.z);
        track.path += position.distanceTo(track.last);
        track.last.copy(position);
        if (enemy.mode === 'dash' || enemy.mode === 'charge') track.dashed = true;
      }
    }
    let anyDash = false;
    for (const enemy of enemies.items) {
      const track = tracks.get(enemy.id)!;
      if (enemy.kind !== 'wasp') continue;
      expect(track.path).toBeGreaterThan(40);
      expect(track.maxX - track.minX).toBeGreaterThan(6);
      expect(track.maxZ - track.minZ).toBeGreaterThan(6);
      anyDash ||= track.dashed;
    }
    expect(anyDash).toBe(true);
  });
});
