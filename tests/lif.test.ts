import { describe, expect, it } from 'vitest';
import { buildConnectome } from '../src/brain/connectome.ts';
import { LIFNetwork } from '../src/brain/lif.ts';

describe('LIF network', () => {
  it('produces identical spike trains for identical seeded inputs', () => {
    const connectome = buildConnectome('lif-seed');
    const first = new LIFNetwork(connectome);
    const second = new LIFNetwork(buildConnectome('lif-seed'));
    const currents = new Float32Array(connectome.neurons.length);
    currents[0] = 90;
    const firstSpikes: number[][] = [];
    const secondSpikes: number[][] = [];
    for (let tick = 0; tick < 400; tick += 1) {
      firstSpikes.push([...first.step(currents)]);
      secondSpikes.push([...second.step(currents)]);
    }
    expect(secondSpikes).toEqual(firstSpikes);
    expect(first.recentSpikes(0, 0.1).length).toBeGreaterThan(0);
  });
});
