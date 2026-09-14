import { clamp, relax } from '../core/rng.ts';
import {
  buildConnectome,
  type Connectome,
  type Population,
} from './connectome.ts';
import { LIFNetwork } from './lif.ts';
import { PlasticityEngine } from './plasticity.ts';
import type { SensorReadings } from '../game/sensors.ts';

export type BehaviorLabel =
  | 'At rest'
  | 'Foraging flight'
  | 'Turning left'
  | 'Turning right'
  | 'Evasive burst'
  | 'Escape flight';

export interface MotorCommand {
  turn: number;
  thrust: number;
  fire: boolean;
  evade: boolean;
  /** Human-readable autonomous behavior state for telemetry. */
  behavior: BehaviorLabel;
  /** 0..1 octopamine stress drive for erratic evasion. */
  stress: number;
  /** One-shot escape burst when stress crosses the threshold. */
  escape: boolean;
  leftRate: number;
  rightRate: number;
  forwardRate: number;
  brakeRate: number;
  fireRate: number;
  evadeRate: number;
}

export interface BrainStepOptions {
  heading: number;
  headingBumpStrength?: number;
  steps?: number;
}

export class FlyBrain {
  public readonly connectome: Connectome;
  public readonly network: LIFNetwork;
  public readonly plasticity: PlasticityEngine;
  private escapeCooldown = 0;
  private escapeArmed = true;
  private readonly smoothedRates = {
    turnLeft: 0,
    turnRight: 0,
    forward: 0,
    brake: 0,
    fire: 0,
    evade: 0,
  };
  public readonly inputCurrents: Float32Array;
  public lastSpikes: number[] = [];
  public command: MotorCommand = FlyBrain.neutralCommand();
  public fireCooldown = 0;
  private stepCounter = 0;

  public constructor(seed: number | string) {
    this.connectome = buildConnectome(seed);
    this.network = new LIFNetwork(this.connectome);
    this.plasticity = new PlasticityEngine(this.connectome, this.network);
    this.inputCurrents = new Float32Array(this.connectome.neurons.length);
  }

  public step(
    readings: SensorReadings,
    options: BrainStepOptions,
    dt = 1 / 60,
  ): MotorCommand {
    const steps = options.steps ?? 16;
    this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    this.inputCurrents.fill(0);
    this.injectSensors(readings);
    this.injectHeading(options.heading, options.headingBumpStrength ?? 22);
    this.injectTonicDrive();
    // Octopamine stress biases the network toward evasive escape.
    const stress = this.plasticity.stress;
    this.inputCurrents[this.connectome.dn.evade] =
      (this.inputCurrents[this.connectome.dn.evade] ?? 0) + stress * 520;
    this.inputCurrents[this.connectome.dn.forward] =
      (this.inputCurrents[this.connectome.dn.forward] ?? 0) + stress * 260;
    this.escapeCooldown = Math.max(0, this.escapeCooldown - dt);
    for (let step = 0; step < steps; step += 1) {
      this.lastSpikes = this.network.step(this.inputCurrents);
      this.plasticity.accumulate(0.001);
    }
    this.plasticity.observeOdor(Math.max(0, ...readings.olfactory), dt);
    this.plasticity.update(dt);
    this.stepCounter += steps;
    this.command = this.decode(dt);
    return this.command;
  }

  private injectSensors(readings: SensorReadings): void {
    const populations = this.connectome.populations;
    for (const [index, neuron] of populations.VIS.entries()) {
      this.inputCurrents[neuron] = 260 + (readings.visual[index] ?? 0) * 520;
    }
    for (const [index, neuron] of populations.TGT.entries()) {
      this.inputCurrents[neuron] = (readings.target[index] ?? 0) * 820;
    }
    for (const [index, neuron] of populations.ORN.entries()) {
      this.inputCurrents[neuron] = (readings.olfactory[index] ?? 0) * 420;
    }
    for (const [index, neuron] of populations.THR.entries()) {
      this.inputCurrents[neuron] = (readings.threat[index] ?? 0) * 920;
    }
  }

  private injectHeading(heading: number, strength: number): void {
    const ring = this.connectome.populations.CX;
    const normalized = (heading + Math.PI * 2) % (Math.PI * 2);
    const center = Math.round((normalized / (Math.PI * 2)) * ring.length) % ring.length;
    for (const [index, neuron] of ring.entries()) {
      const distance = Math.min(
        Math.abs(index - center),
        ring.length - Math.abs(index - center),
      );
      this.inputCurrents[neuron] = Math.max(
        this.inputCurrents[neuron] ?? 0,
        Math.max(0, strength - distance * 4) * 18,
      );
    }
  }

  private injectTonicDrive(): void {
    this.inputCurrents[this.connectome.dn.forward] =
      (this.inputCurrents[this.connectome.dn.forward] ?? 0) + 760;
    this.inputCurrents[this.connectome.dn.brake] =
      (this.inputCurrents[this.connectome.dn.brake] ?? 0) + 120;
  }

  private populationRate(population: Population): number {
    const neurons = this.connectome.populations[population];
    if (neurons.length === 0) {
      return 0;
    }
    let sum = 0;
    for (const neuron of neurons) {
      sum += this.network.firingRates[neuron] ?? 0;
    }
    return sum / neurons.length;
  }

  // Rate decoder adapted from Xenova/fruit-fly-simulation controller.js (MIT); see ASSETS.md
  private decode(dt: number): MotorCommand {
    const raw = {
      turnLeft: this.network.firingRates[this.connectome.dn.turnLeft] ?? 0,
      turnRight: this.network.firingRates[this.connectome.dn.turnRight] ?? 0,
      forward: this.network.firingRates[this.connectome.dn.forward] ?? 0,
      brake: this.network.firingRates[this.connectome.dn.brake] ?? 0,
      fire: this.network.firingRates[this.connectome.dn.fire] ?? 0,
      evade: this.network.firingRates[this.connectome.dn.evade] ?? 0,
    };
    // 80 ms exponential smoothing per descending-neuron rate.
    const rates = this.smoothedRates;
    for (const key of Object.keys(rates) as (keyof typeof rates)[]) {
      rates[key] = relax(rates[key], Math.max(0, raw[key]), dt, 0.08);
    }
    // Sign convention: positive turn increases heading; heading 0 faces +z
    // and positive yaw rotates forward toward +x, which the chase/top-down
    // cameras render as a right turn — so turn > 0 means "Turning right".
    const turnDrive = Math.max(0, rates.turnRight - 15) - Math.max(0, rates.turnLeft - 15);
    const turn = Math.tanh(turnDrive / 45);
    const thrust = clamp(
      0.25
        + 0.75 * Math.tanh(Math.max(0, rates.forward - 20) / 120)
        - 0.35 * Math.tanh(Math.max(0, rates.brake - 25) / 90),
      0.12,
      1,
    );
    const fire = raw.fire > 2 && this.fireCooldown <= 0;
    if (fire) {
      this.fireCooldown = 0.2;
    }
    const stress = this.plasticity.stress;
    // Escape arm/disarm hysteresis: re-arms only once stress subsides.
    if (stress < 0.3) {
      this.escapeArmed = true;
    }
    const escape = this.escapeArmed && stress > 0.55 && this.escapeCooldown <= 0;
    if (escape) {
      this.escapeArmed = false;
      this.escapeCooldown = 0.9;
    }
    const evade = rates.evade > 8;
    const behavior: BehaviorLabel = escape
      ? 'Escape flight'
      : evade
        ? 'Evasive burst'
        : Math.abs(turn) > 0.3
          ? turn < 0
            ? 'Turning left'
            : 'Turning right'
          : thrust > 0.35
            ? 'Foraging flight'
            : 'At rest';
    return {
      turn,
      thrust,
      fire,
      evade,
      behavior,
      stress,
      escape,
      leftRate: rates.turnLeft,
      rightRate: rates.turnRight,
      forwardRate: rates.forward,
      brakeRate: rates.brake,
      fireRate: rates.fire,
      evadeRate: rates.evade,
    };
  }

  public populationRates(): Record<Population, number> {
    const rates = {} as Record<Population, number>;
    for (const population of Object.keys(this.connectome.populations) as Population[]) {
      rates[population] = this.populationRate(population);
    }
    return rates;
  }

  public reset(): void {
    this.network.reset();
    this.inputCurrents.fill(0);
    this.lastSpikes = [];
    this.command = FlyBrain.neutralCommand();
    this.fireCooldown = 0;
    this.escapeCooldown = 0;
    this.escapeArmed = true;
    for (const key of Object.keys(this.smoothedRates) as (keyof typeof this.smoothedRates)[]) {
      this.smoothedRates[key] = 0;
    }
    this.plasticity.reset();
    this.stepCounter = 0;
  }

  public static neutralCommand(): MotorCommand {
    return {
      turn: 0,
      thrust: 0.5,
      fire: false,
      evade: false,
      behavior: 'At rest',
      stress: 0,
      escape: false,
      leftRate: 0,
      rightRate: 0,
      forwardRate: 0,
      brakeRate: 0,
      fireRate: 0,
      evadeRate: 0,
    };
  }

  public get simulatedMilliseconds(): number {
    return this.stepCounter;
  }
}
