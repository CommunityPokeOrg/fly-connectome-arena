import { describe, expect, it } from 'vitest';
import { buildConnectome } from '../src/brain/connectome.ts';
import { LIFNetwork } from '../src/brain/lif.ts';
import { PlasticityEngine } from '../src/brain/plasticity.ts';

function setup(seed = 7, options = {}) {
  const connectome = buildConnectome(seed);
  const network = new LIFNetwork(connectome);
  const engine = new PlasticityEngine(connectome, network, options);
  return { connectome, network, engine };
}

/** Drive the centre target sensors and the tonic forward channel for `frames` frames. */
function driveTargetPursuit(
  connectome: ReturnType<typeof buildConnectome>,
  network: LIFNetwork,
  engine: PlasticityEngine,
  frames: number,
  onFrame?: (frame: number) => void,
): number {
  const input = new Float32Array(connectome.neurons.length);
  const centre = [connectome.populations.TGT[5], connectome.populations.TGT[6]] as number[];
  let fireRate = 0;
  for (let frame = 0; frame < frames; frame += 1) {
    input.fill(0);
    for (const neuron of centre) {
      input[neuron] = 620;
    }
    input[connectome.dn.forward] = 760;
    for (let step = 0; step < 16; step += 1) {
      network.step(input);
      engine.accumulate(0.001);
    }
    onFrame?.(frame);
    engine.update(1 / 60);
    fireRate = network.firingRates[connectome.dn.fire] ?? 0;
  }
  return fireRate;
}

describe('neuromodulators', () => {
  it('reward raises dopamine and it decays back toward zero', () => {
    const { engine } = setup();
    engine.reward('food', 1);
    expect(engine.dopamine).toBeCloseTo(1, 5);
    for (let i = 0; i < 60 * 5; i += 1) {
      engine.update(1 / 60);
    }
    expect(engine.dopamine).toBeLessThan(0.02);
    expect(engine.dopamine).toBeGreaterThanOrEqual(0);
    expect(engine.snapshot().rewardsDelivered).toBe(1);
  });

  it('punishment raises octopamine, stress, and the aversive state', () => {
    const { engine } = setup();
    engine.punish('damage', 1.2);
    expect(engine.octopamine).toBeCloseTo(1.2, 5);
    expect(engine.stress).toBeGreaterThan(0.5);
    expect(engine.snapshot().state).toBe('aversive');
    for (let i = 0; i < 60 * 8; i += 1) {
      engine.update(1 / 60);
    }
    expect(engine.octopamine).toBeLessThan(0.02);
    expect(engine.snapshot().state).toBe('baseline');
  });

  it('modulator levels are capped', () => {
    const { engine } = setup();
    for (let i = 0; i < 50; i += 1) {
      engine.reward('food', 5);
      engine.punish('damage', 5);
    }
    expect(engine.dopamine).toBeLessThanOrEqual(3);
    expect(engine.octopamine).toBeLessThanOrEqual(3);
    expect(engine.serotonin).toBeLessThanOrEqual(2);
  });

  it('serotonin lowers the effective learning rate as reward accumulates', () => {
    const { engine } = setup();
    const before = engine.effectiveLearningRate();
    for (let i = 0; i < 10; i += 1) {
      engine.reward('food', 1);
    }
    expect(engine.effectiveLearningRate()).toBeLessThan(before);
    expect(engine.snapshot().learningRate).toBeCloseTo(before, 6);
  });

  it('odor gradient ascent releases dopamine but descent does not', () => {
    const { engine } = setup();
    let ascent = 0;
    for (let i = 1; i <= 30; i += 1) {
      ascent += engine.observeOdor(i / 30, 1 / 60);
      engine.update(1 / 60);
    }
    expect(ascent).toBeGreaterThan(0);
    expect(engine.snapshot().recentEvents.some((event) => event.kind === 'odor-gradient')).toBe(true);
    const { engine: descending } = setup();
    let descent = 0;
    for (let i = 30; i >= 1; i -= 1) {
      descent += descending.observeOdor(i / 30, 1 / 60);
      descending.update(1 / 60);
    }
    expect(descent).toBe(0);
  });
});

describe('weight updates', () => {
  it('keeps every plastic weight inside its bounds and sign under extreme reinforcement', () => {
    const { connectome, network, engine } = setup(7, { learningRate: 5 });
    driveTargetPursuit(connectome, network, engine, 240, () => {
      engine.reward('target-hit', 3);
      engine.punish('damage', 3);
    });
    for (const [index, synapse] of connectome.synapses.entries()) {
      const w0 = synapse.weight;
      const w = network.weights[index] ?? 0;
      expect(Math.sign(w)).toBe(Math.sign(w0));
      expect(Math.abs(w)).toBeGreaterThanOrEqual(Math.abs(w0) * 0.3 - 1e-4);
      expect(Math.abs(w)).toBeLessThanOrEqual(Math.abs(w0) * 2.1 + 1e-4);
    }
    const snapshot = engine.snapshot();
    expect(snapshot.driftFromBaseline).toBeGreaterThan(0);
    expect(snapshot.saturatedFraction).toBeGreaterThan(0);
    expect(snapshot.saturatedFraction).toBeLessThanOrEqual(1);
  });

  it('does not change weights without eligibility or modulators', () => {
    const { network, engine } = setup();
    for (let i = 0; i < 120; i += 1) {
      engine.update(1 / 60);
    }
    expect(network.weights).toEqual(network.baselineWeights);
    expect(engine.snapshot().stepWeightShift).toBe(0);
  });

  it('decays perturbed weights back toward baseline', () => {
    const { connectome, network, engine } = setup(7, { baselineDecayTau: 2 });
    driveTargetPursuit(connectome, network, engine, 90, () => engine.reward('target-hit', 2));
    const driftAfterLearning = engine.snapshot().driftFromBaseline;
    expect(driftAfterLearning).toBeGreaterThan(0.001);
    for (let i = 0; i < 60 * 12; i += 1) {
      engine.update(1 / 60);
    }
    expect(engine.snapshot().driftFromBaseline).toBeLessThan(driftAfterLearning * 0.05);
  });

  it('is deterministic for identical inputs', () => {
    const a = setup(11);
    const b = setup(11);
    driveTargetPursuit(a.connectome, a.network, a.engine, 60, (frame) => {
      if (frame % 10 === 0) a.engine.reward('food', 1);
    });
    driveTargetPursuit(b.connectome, b.network, b.engine, 60, (frame) => {
      if (frame % 10 === 0) b.engine.reward('food', 1);
    });
    expect(Array.from(a.network.weights)).toEqual(Array.from(b.network.weights));
    expect(a.engine.snapshot()).toEqual(b.engine.snapshot());
  });
});

describe('behavioural adaptation', () => {
  it('dopamine strengthens the active target→fire pathway and raises the fire rate', () => {
    const trained = setup(7);
    const control = setup(7);
    const fireIndices = trained.connectome.synapses
      .map((synapse, index) => ({ synapse, index }))
      .filter(
        ({ synapse }) =>
          synapse.target === trained.connectome.dn.fire &&
          trained.connectome.neurons[synapse.source]?.population === 'TGT',
      )
      .map(({ index }) => index);
    expect(fireIndices.length).toBeGreaterThan(0);

    driveTargetPursuit(trained.connectome, trained.network, trained.engine, 180, (frame) => {
      if (frame % 20 === 0) trained.engine.reward('target-hit', 1.5);
    });
    driveTargetPursuit(control.connectome, control.network, control.engine, 180);

    for (const index of fireIndices) {
      expect(trained.network.weights[index] ?? 0).toBeGreaterThan(
        trained.network.baselineWeights[index] ?? 0,
      );
    }
    const trainedRate = driveTargetPursuit(trained.connectome, trained.network, trained.engine, 30);
    const controlRate = driveTargetPursuit(control.connectome, control.network, control.engine, 30);
    expect(trainedRate).toBeGreaterThanOrEqual(controlRate);
    expect(trained.engine.snapshot().appetitiveBias).toBeGreaterThan(control.engine.snapshot().appetitiveBias);
  });

  it('octopamine potentiates threat→escape synapses (fear conditioning)', () => {
    const { connectome, network, engine } = setup(7);
    const escapeIndices = connectome.synapses
      .map((synapse, index) => ({ synapse, index }))
      .filter(
        ({ synapse }) =>
          synapse.target === connectome.dn.evade &&
          connectome.neurons[synapse.source]?.population === 'THR',
      )
      .map(({ index }) => index);
    const input = new Float32Array(connectome.neurons.length);
    for (let frame = 0; frame < 120; frame += 1) {
      input.fill(0);
      for (const neuron of connectome.populations.THR) {
        input[neuron] = 900;
      }
      for (let step = 0; step < 16; step += 1) {
        network.step(input);
        engine.accumulate(0.001);
      }
      if (frame % 15 === 0) engine.punish('threat-proximity', 1);
      engine.update(1 / 60);
    }
    for (const index of escapeIndices) {
      expect(network.weights[index] ?? 0).toBeGreaterThan(network.baselineWeights[index] ?? 0);
    }
    expect(engine.snapshot().aversiveBias).toBeGreaterThan(0);
  });
});
