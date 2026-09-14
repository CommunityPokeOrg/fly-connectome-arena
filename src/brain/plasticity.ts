import type { Connectome, Population } from './connectome.ts';
import type { LIFNetwork } from './lif.ts';
import { clamp } from '../core/rng.ts';

export type RewardKind =
  | 'food'
  | 'odor-gradient'
  | 'target-hit'
  | 'energy'
  | 'damage'
  | 'threat-proximity'
  | 'collision';

export interface RewardEvent {
  time: number;
  kind: RewardKind;
  /** Signed magnitude: positive = appetitive (dopamine), negative = aversive (octopamine). */
  value: number;
}

export type PlasticityState =
  | 'baseline'
  | 'reinforcing'
  | 'aversive'
  | 'consolidating';

export interface PlasticitySnapshot {
  dopamine: number;
  octopamine: number;
  serotonin: number;
  /** Nominal learning rate configured for the engine. */
  learningRate: number;
  /** Learning rate after serotonergic gating (what is actually applied). */
  effectiveLearningRate: number;
  /** Sum of |Δw| applied on the most recent update, normalised by Σ|w0|. */
  stepWeightShift: number;
  /** Σ|w − w0| / Σ|w0| over the plastic set: how far the connectome has drifted. */
  driftFromBaseline: number;
  /** Mean signed change of appetitive pathways relative to baseline (−1..1). */
  appetitiveBias: number;
  /** Mean signed change of aversive (threat → escape) pathways relative to baseline. */
  aversiveBias: number;
  plasticSynapses: number;
  /** Fraction of plastic synapses pinned at a bound. */
  saturatedFraction: number;
  state: PlasticityState;
  rewardRate: number;
  punishmentRate: number;
  rewardsDelivered: number;
  punishmentsDelivered: number;
  recentEvents: RewardEvent[];
  /** 0..1 stress drive that the motor system reads for erratic escape behaviour. */
  stress: number;
}

export interface PlasticityOptions {
  learningRate?: number;
  weightFloor?: number;
  weightCeiling?: number;
  baselineDecayTau?: number;
  eligibilityTau?: number;
  dopamineTau?: number;
  octopamineTau?: number;
  serotoninTau?: number;
}

const APPETITIVE_TARGETS: ReadonlySet<Population> = new Set(['LAL_L', 'LAL_R', 'DN', 'MBON']);

interface PlasticSynapse {
  index: number;
  source: number;
  target: number;
  pathway: 'appetitive' | 'aversive';
  sign: 1 | -1;
}

/**
 * Three-factor, neuromodulator-gated synaptic plasticity.
 *
 * Every plastic synapse keeps an eligibility trace that grows when the
 * presynaptic neuron spikes while the postsynaptic neuron is active, and
 * decays with `eligibilityTau`. Weight change is the product of that trace
 * and a global modulator signal: dopamine reinforces recently used
 * sensory→steering/motor pathways (appetitive learning), octopamine
 * potentiates threat→escape pathways and depresses appetitive drive
 * (aversive learning). Serotonin integrates cumulative reward slowly and
 * lowers the effective learning rate, so a well-fed network consolidates
 * instead of chasing every transient. Weights are clamped to
 * `[floor, ceiling] × |w0|` (sign preserved) and relax toward baseline with
 * `baselineDecayTau` so the connectome can never run away.
 */
export class PlasticityEngine {
  public dopamine = 0;
  public octopamine = 0;
  public serotonin = 0;

  private readonly plastic: PlasticSynapse[] = [];
  private readonly eligibility: Float32Array;
  private readonly baselineAbsSum: number;
  private readonly learningRate: number;
  private readonly weightFloor: number;
  private readonly weightCeiling: number;
  private readonly baselineDecayTau: number;
  private readonly eligibilityTau: number;
  private readonly dopamineTau: number;
  private readonly octopamineTau: number;
  private readonly serotoninTau: number;
  private readonly events: RewardEvent[] = [];
  private stepShift = 0;
  private rewardRate = 0;
  private punishmentRate = 0;
  private rewardsDelivered = 0;
  private punishmentsDelivered = 0;
  private odorMemory = 0;
  private odorPrimed = false;
  private time = 0;

  public constructor(
    connectome: Connectome,
    private readonly network: LIFNetwork,
    options: PlasticityOptions = {},
  ) {
    this.learningRate = options.learningRate ?? 0.035;
    this.weightFloor = options.weightFloor ?? 0.3;
    this.weightCeiling = options.weightCeiling ?? 2.1;
    this.baselineDecayTau = options.baselineDecayTau ?? 90;
    this.eligibilityTau = options.eligibilityTau ?? 0.45;
    this.dopamineTau = options.dopamineTau ?? 1.1;
    this.octopamineTau = options.octopamineTau ?? 1.6;
    this.serotoninTau = options.serotoninTau ?? 14;
    let absSum = 0;
    for (const [index, synapse] of connectome.synapses.entries()) {
      const sourcePopulation = connectome.neurons[synapse.source]?.population;
      const targetPopulation = connectome.neurons[synapse.target]?.population;
      if (!sourcePopulation || !targetPopulation) {
        continue;
      }
      if (sourcePopulation === 'THR') {
        this.plastic.push({
          index,
          source: synapse.source,
          target: synapse.target,
          pathway: 'aversive',
          sign: synapse.weight < 0 ? -1 : 1,
        });
        absSum += Math.abs(synapse.weight);
      } else if (
        APPETITIVE_TARGETS.has(targetPopulation) &&
        sourcePopulation !== 'DN' &&
        sourcePopulation !== 'LAL_L' &&
        sourcePopulation !== 'LAL_R'
      ) {
        this.plastic.push({
          index,
          source: synapse.source,
          target: synapse.target,
          pathway: 'appetitive',
          sign: synapse.weight < 0 ? -1 : 1,
        });
        absSum += Math.abs(synapse.weight);
      }
    }
    this.baselineAbsSum = Math.max(1e-6, absSum);
    this.eligibility = new Float32Array(this.plastic.length);
  }

  public get plasticSynapseCount(): number {
    return this.plastic.length;
  }

  public get recentEvents(): readonly RewardEvent[] {
    return this.events;
  }

  /** Deliver an appetitive signal (dopamine). `value` > 0. */
  public reward(kind: RewardKind, value: number): void {
    const amount = Math.max(0, value);
    if (amount <= 0) {
      return;
    }
    this.dopamine = Math.min(3, this.dopamine + amount);
    this.serotonin = Math.min(2, this.serotonin + amount * 0.18);
    this.rewardRate += amount;
    this.rewardsDelivered += 1;
    this.pushEvent({ time: this.time, kind, value: amount });
  }

  /** Deliver an aversive signal (octopamine / stress). `value` > 0. */
  public punish(kind: RewardKind, value: number): void {
    const amount = Math.max(0, value);
    if (amount <= 0) {
      return;
    }
    this.octopamine = Math.min(3, this.octopamine + amount);
    this.serotonin = Math.max(0, this.serotonin - amount * 0.08);
    this.punishmentRate += amount;
    this.punishmentsDelivered += 1;
    this.pushEvent({ time: this.time, kind, value: -amount });
  }

  /**
   * Continuous sucrose/odor-gradient reinforcement: climbing an odor
   * gradient releases a small dopamine transient proportional to the rate of
   * increase; descending releases nothing.
   */
  public observeOdor(intensity: number, dt: number): number {
    const level = clamp(intensity, 0, 1);
    if (!this.odorPrimed) {
      this.odorMemory = level;
      this.odorPrimed = true;
      return 0;
    }
    const delta = level - this.odorMemory;
    this.odorMemory += delta * Math.min(1, dt * 10);
    if (delta <= 0.002 || dt <= 0) {
      return 0;
    }
    const gain = Math.min(0.06, (delta / dt) * 0.015 * level);
    if (gain > 0.003) {
      this.dopamine = Math.min(3, this.dopamine + gain);
      this.rewardRate += gain;
      this.pushEvent({ time: this.time, kind: 'odor-gradient', value: gain }, true);
    }
    return gain;
  }

  /**
   * Call once per LIF step to update eligibility traces from the network's
   * spike flags and postsynaptic rates. Cheap: O(plastic synapses).
   */
  public accumulate(dt: number): void {
    const decay = Math.exp(-dt / this.eligibilityTau);
    const flags = this.network.spikeFlags;
    const rates = this.network.firingRates;
    for (let i = 0; i < this.plastic.length; i += 1) {
      const synapse = this.plastic[i] as PlasticSynapse;
      let trace = (this.eligibility[i] ?? 0) * decay;
      if (flags[synapse.source]) {
        trace = Math.min(1.5, trace + 0.15 + (rates[synapse.target] ?? 0) / 60);
      }
      this.eligibility[i] = trace;
    }
  }

  /** Call once per simulation frame; applies weight updates and decays modulators. */
  public update(dt: number): void {
    if (dt <= 0) {
      return;
    }
    this.time += dt;
    const effective = this.effectiveLearningRate();
    const appetitiveDrive = this.dopamine - 0.55 * this.octopamine;
    const aversiveDrive = this.octopamine;
    const weights = this.network.weights;
    const baseline = this.network.baselineWeights;
    const relax = 1 - Math.exp(-dt / this.baselineDecayTau);
    let shift = 0;
    for (let i = 0; i < this.plastic.length; i += 1) {
      const synapse = this.plastic[i] as PlasticSynapse;
      const w0 = baseline[synapse.index] ?? 0;
      const current = weights[synapse.index] ?? w0;
      const trace = this.eligibility[i] ?? 0;
      const drive = synapse.pathway === 'appetitive' ? appetitiveDrive : aversiveDrive;
      const magnitude = Math.abs(w0);
      let next = current + synapse.sign * effective * drive * trace * magnitude * dt;
      next += (w0 - next) * relax;
      const lower = magnitude * this.weightFloor;
      const upper = magnitude * this.weightCeiling;
      const bounded = synapse.sign > 0 ? clamp(next, lower, upper) : clamp(next, -upper, -lower);
      shift += Math.abs(bounded - current);
      weights[synapse.index] = bounded;
    }
    this.stepShift = shift / this.baselineAbsSum;
    this.dopamine *= Math.exp(-dt / this.dopamineTau);
    this.octopamine *= Math.exp(-dt / this.octopamineTau);
    this.serotonin *= Math.exp(-dt / this.serotoninTau);
    const rateDecay = Math.exp(-dt / 4);
    this.rewardRate *= rateDecay;
    this.punishmentRate *= rateDecay;
  }

  public effectiveLearningRate(): number {
    return this.learningRate / (1 + this.serotonin * 1.4);
  }

  /** 0..1 stress drive derived from octopamine. */
  public get stress(): number {
    return clamp(this.octopamine / 1.6, 0, 1);
  }

  public snapshot(): PlasticitySnapshot {
    const weights = this.network.weights;
    const baseline = this.network.baselineWeights;
    let drift = 0;
    let saturated = 0;
    let appetitiveSum = 0;
    let appetitiveCount = 0;
    let aversiveSum = 0;
    let aversiveCount = 0;
    for (const synapse of this.plastic) {
      const w0 = baseline[synapse.index] ?? 0;
      const w = weights[synapse.index] ?? w0;
      const magnitude = Math.abs(w0);
      drift += Math.abs(w - w0);
      const ratio = magnitude > 0 ? Math.abs(w) / magnitude : 1;
      if (ratio <= this.weightFloor + 1e-4 || ratio >= this.weightCeiling - 1e-4) {
        saturated += 1;
      }
      const signed = magnitude > 0 ? (Math.abs(w) - magnitude) / magnitude : 0;
      if (synapse.pathway === 'appetitive') {
        appetitiveSum += signed;
        appetitiveCount += 1;
      } else {
        aversiveSum += signed;
        aversiveCount += 1;
      }
    }
    const stress = this.stress;
    let state: PlasticityState = 'baseline';
    if (this.octopamine > 0.35 && this.octopamine >= this.dopamine) {
      state = 'aversive';
    } else if (this.dopamine > 0.25) {
      state = 'reinforcing';
    } else if (this.serotonin > 0.6) {
      state = 'consolidating';
    }
    return {
      dopamine: this.dopamine,
      octopamine: this.octopamine,
      serotonin: this.serotonin,
      learningRate: this.learningRate,
      effectiveLearningRate: this.effectiveLearningRate(),
      stepWeightShift: this.stepShift,
      driftFromBaseline: drift / this.baselineAbsSum,
      appetitiveBias: appetitiveCount > 0 ? appetitiveSum / appetitiveCount : 0,
      aversiveBias: aversiveCount > 0 ? aversiveSum / aversiveCount : 0,
      plasticSynapses: this.plastic.length,
      saturatedFraction: this.plastic.length > 0 ? saturated / this.plastic.length : 0,
      state,
      rewardRate: this.rewardRate,
      punishmentRate: this.punishmentRate,
      rewardsDelivered: this.rewardsDelivered,
      punishmentsDelivered: this.punishmentsDelivered,
      recentEvents: [...this.events],
      stress,
    };
  }

  public reset(): void {
    this.dopamine = 0;
    this.octopamine = 0;
    this.serotonin = 0;
    this.eligibility.fill(0);
    this.events.length = 0;
    this.stepShift = 0;
    this.rewardRate = 0;
    this.punishmentRate = 0;
    this.rewardsDelivered = 0;
    this.punishmentsDelivered = 0;
    this.odorMemory = 0;
    this.odorPrimed = false;
    this.time = 0;
    this.network.weights.set(this.network.baselineWeights);
  }

  private pushEvent(event: RewardEvent, coalesce = false): void {
    if (coalesce) {
      const last = this.events[this.events.length - 1];
      if (last && last.kind === event.kind && this.time - last.time < 0.5) {
        last.value += event.value;
        last.time = event.time;
        return;
      }
    }
    this.events.push(event);
    if (this.events.length > 12) {
      this.events.shift();
    }
  }
}
