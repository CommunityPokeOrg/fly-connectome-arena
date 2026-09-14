import { describe, expect, it } from 'vitest';
import { pillarField, runHeadless } from './helpers/headless-arena.ts';

const SEEDS = [11, 42, 99];

describe('headless closed-loop behaviour', () => {
  it('is bit-for-bit deterministic for a seed', () => {
    const a = runHeadless({ seed: 11, ticks: 60 * 8 });
    const b = runHeadless({ seed: 11, ticks: 60 * 8 });
    expect(a.positions).toEqual(b.positions);
    expect(a.headings).toEqual(b.headings);
    expect(a.finalWeightsChecksum).toBe(b.finalWeightsChecksum);
    const other = runHeadless({ seed: 12, ticks: 60 * 8 });
    expect(other.positions).not.toEqual(a.positions);
  });

  it.each(SEEDS)('seed %i stays in bounds, keeps moving and rarely touches anything', (seed) => {
    const trace = runHeadless({ seed, ticks: 60 * 40 });
    expect(trace.maxRadius).toBeLessThanOrEqual(18);
    expect(trace.contactFraction).toBeLessThan(0.01);
    expect(trace.obstacleHits).toBeLessThan(6);
    expect(trace.zonesVisited).toBeGreaterThan(25);
    expect(trace.longestStuck).toBeLessThan(60);
  });

  it.each(SEEDS)('seed %i never settles into a sustained tight loop', (seed) => {
    const trace = runHeadless({ seed, ticks: 60 * 40 });
    expect(trace.longestCircling).toBeLessThan(90);
    // Position spread over any 6 s window must stay wide: a loop would collapse it.
    const window = 60 * 6;
    let narrowest = Number.POSITIVE_INFINITY;
    for (let start = 60 * 4; start + window <= trace.positions.length; start += 60) {
      let minX = Infinity;
      let maxX = -Infinity;
      let minZ = Infinity;
      let maxZ = -Infinity;
      for (let index = start; index < start + window; index += 1) {
        const point = trace.positions[index] as { x: number; z: number };
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minZ = Math.min(minZ, point.z);
        maxZ = Math.max(maxZ, point.z);
      }
      narrowest = Math.min(narrowest, Math.max(maxX - minX, maxZ - minZ));
    }
    expect(narrowest).toBeGreaterThan(4);
  });

  it('learns: locomotion rewards dominate punishments and drift the connectome', () => {
    const trace = runHeadless({ seed: 42, ticks: 60 * 30 });
    expect(trace.rewardsDelivered).toBeGreaterThan(trace.punishmentsDelivered * 4);
    expect(trace.weightDrift).toBeGreaterThan(0.02);
    expect(trace.weightDrift).toBeLessThan(1);
  });

  it('handles a dense pillar field without getting stuck', () => {
    const trace = runHeadless({ seed: 7, ticks: 60 * 30, obstacles: pillarField(21, 12) });
    expect(trace.contactFraction).toBeLessThan(0.03);
    expect(trace.longestStuck).toBeLessThan(90);
    expect(trace.zonesVisited).toBeGreaterThan(15);
  });
});
