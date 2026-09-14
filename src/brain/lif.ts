import type { Connectome } from './connectome.ts';

export interface LIFSnapshot {
  time: number;
  spikes: number[];
  firingRates: Float32Array;
}

interface OutgoingSynapse {
  target: number;
  weight: number;
  delaySteps: number;
}

/**
 * Current-based leaky integrate-and-fire network.
 *
 * All mutable numerical state lives in typed arrays. A binary one-hundred
 * millisecond history gives an exact count/window firing rate and a separate
 * per-neuron timestamp ring supplies the two-second visualizer raster.
 */
export class LIFNetwork {
  public readonly voltages: Float32Array;
  public readonly synapticCurrents: Float32Array;
  public readonly firingRates: Float32Array;
  public readonly refractoryRemaining: Float32Array;
  public readonly spikeHistory: Uint8Array;
  public readonly spikeTimeRing: Float32Array;
  public readonly spikeRingCursor: Uint16Array;
  public readonly spikeRingCount: Uint16Array;
  public readonly lastSpikes: number[] = [];
  public readonly spikeFlags: Uint8Array;

  private readonly outgoing: OutgoingSynapse[][];
  private readonly historyCounts: Uint16Array;
  private readonly decay: number;
  private readonly historyLength: number;
  private readonly dt: number;
  private readonly tau: number;
  private readonly vRest: number;
  private readonly vReset: number;
  private readonly vThreshold: number;
  private readonly refractoryDuration: number;
  private readonly maximumSpikeHistory = 128;
  private time = 0;
  private historyCursor = 0;

  public constructor(
    connectome: Connectome,
    dt = 0.001,
    options: {
      tau?: number;
      vRest?: number;
      vReset?: number;
      vThreshold?: number;
      refractory?: number;
      rateWindow?: number;
    } = {},
  ) {
    this.dt = dt;
    this.tau = options.tau ?? 0.02;
    this.vRest = options.vRest ?? -65;
    this.vReset = options.vReset ?? -68;
    this.vThreshold = options.vThreshold ?? -50;
    this.refractoryDuration = options.refractory ?? 0.002;
    this.historyLength = Math.max(1, Math.round((options.rateWindow ?? 0.1) / dt));
    const count = connectome.neurons.length;
    this.voltages = new Float32Array(count).fill(this.vRest);
    this.synapticCurrents = new Float32Array(count);
    this.firingRates = new Float32Array(count);
    this.refractoryRemaining = new Float32Array(count);
    this.spikeHistory = new Uint8Array(count * this.historyLength);
    this.historyCounts = new Uint16Array(count);
    this.spikeTimeRing = new Float32Array(count * this.maximumSpikeHistory);
    this.spikeRingCursor = new Uint16Array(count);
    this.spikeRingCount = new Uint16Array(count);
    this.spikeFlags = new Uint8Array(count);
    this.decay = Math.exp(-this.dt / 0.018);
    this.outgoing = Array.from({ length: count }, () => []);
    for (const synapse of connectome.synapses) {
      this.outgoing[synapse.source]?.push({
        target: synapse.target,
        weight: synapse.weight,
        delaySteps: Math.max(0, Math.round(synapse.delay / this.dt)),
      });
    }
  }

  public step(input: Float32Array): number[] {
    if (input.length !== this.voltages.length) {
      throw new Error(`Expected ${this.voltages.length} currents, received ${input.length}`);
    }
    this.time += this.dt;
    this.lastSpikes.length = 0;
    this.spikeFlags.fill(0);
    for (let neuron = 0; neuron < this.voltages.length; neuron += 1) {
      const historyOffset = neuron * this.historyLength + this.historyCursor;
      const expired = this.spikeHistory[historyOffset] ?? 0;
      this.historyCounts[neuron] = Math.max(0, (this.historyCounts[neuron] ?? 0) - expired);
      this.spikeHistory[historyOffset] = 0;
      this.synapticCurrents[neuron] =
        (this.synapticCurrents[neuron] ?? 0) * this.decay + (input[neuron] ?? 0);
      this.refractoryRemaining[neuron] = Math.max(
        0,
        (this.refractoryRemaining[neuron] ?? 0) - this.dt,
      );
      if ((this.refractoryRemaining[neuron] ?? 0) > 0) {
        continue;
      }
      const voltage = this.voltages[neuron] ?? this.vRest;
      const current = this.synapticCurrents[neuron] ?? 0;
      const nextVoltage =
        voltage + this.dt * (-(voltage - this.vRest) / this.tau + current);
      this.voltages[neuron] = nextVoltage;
      if (nextVoltage >= this.vThreshold) {
        this.voltages[neuron] = this.vReset;
        this.refractoryRemaining[neuron] = this.refractoryDuration;
        this.spikeFlags[neuron] = 1;
        this.spikeHistory[historyOffset] = 1;
        this.historyCounts[neuron] = (this.historyCounts[neuron] ?? 0) + 1;
        this.recordSpike(neuron);
        this.lastSpikes.push(neuron);
      }
    }
    for (const source of this.lastSpikes) {
      for (const synapse of this.outgoing[source] ?? []) {
        this.synapticCurrents[synapse.target] =
          (this.synapticCurrents[synapse.target] ?? 0) + synapse.weight;
      }
    }
    for (let neuron = 0; neuron < this.voltages.length; neuron += 1) {
      this.firingRates[neuron] =
        ((this.historyCounts[neuron] ?? 0) / this.historyLength) * 1000;
    }
    this.historyCursor = (this.historyCursor + 1) % this.historyLength;
    return this.lastSpikes;
  }

  private recordSpike(neuron: number): void {
    const ringOffset = neuron * this.maximumSpikeHistory;
    const cursor = this.spikeRingCursor[neuron] ?? 0;
    this.spikeTimeRing[ringOffset + cursor] = this.time;
    this.spikeRingCursor[neuron] = (cursor + 1) % this.maximumSpikeHistory;
    this.spikeRingCount[neuron] = Math.min(
      this.maximumSpikeHistory,
      (this.spikeRingCount[neuron] ?? 0) + 1,
    );
  }

  public recentSpikes(neuron: number, seconds = 2): number[] {
    const count = this.spikeRingCount[neuron] ?? 0;
    const cursor = this.spikeRingCursor[neuron] ?? 0;
    const offset = neuron * this.maximumSpikeHistory;
    const result: number[] = [];
    for (let index = 0; index < count; index += 1) {
      const slot =
        (cursor - count + index + this.maximumSpikeHistory) % this.maximumSpikeHistory;
      const spikeTime = this.spikeTimeRing[offset + slot] ?? 0;
      if (this.time - spikeTime <= seconds) {
        result.push(spikeTime);
      }
    }
    return result;
  }

  public snapshot(): LIFSnapshot {
    return {
      time: this.time,
      spikes: [...this.lastSpikes],
      firingRates: this.firingRates,
    };
  }

  public reset(): void {
    this.voltages.fill(this.vRest);
    this.synapticCurrents.fill(0);
    this.firingRates.fill(0);
    this.refractoryRemaining.fill(0);
    this.spikeHistory.fill(0);
    this.historyCounts.fill(0);
    this.spikeTimeRing.fill(0);
    this.spikeRingCursor.fill(0);
    this.spikeRingCount.fill(0);
    this.spikeFlags.fill(0);
    this.lastSpikes.length = 0;
    this.historyCursor = 0;
    this.time = 0;
  }

  public get simulationTime(): number {
    return this.time;
  }

  public get neuronCount(): number {
    return this.voltages.length;
  }
}
