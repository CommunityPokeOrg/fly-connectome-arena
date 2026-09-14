import { clamp } from '../core/rng.ts';
import {
  buildConnectome,
  type Connectome,
  type Population,
} from './connectome.ts';
import { LIFNetwork } from './lif.ts';
import { PlasticityEngine } from './plasticity.ts';
import type { SensorReadings } from '../game/sensors.ts';

export interface MotorCommand {
  turn: number;
  thrust: number;
  fire: boolean;
  evade: boolean;
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
    this.command = this.decode();
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

  private decode(): MotorCommand {
    const turnLeft = this.network.firingRates[this.connectome.dn.turnLeft] ?? 0;
    const turnRight = this.network.firingRates[this.connectome.dn.turnRight] ?? 0;
    const forwardRate = this.network.firingRates[this.connectome.dn.forward] ?? 0;
    const brakeRate = this.network.firingRates[this.connectome.dn.brake] ?? 0;
    const fireRate = this.network.firingRates[this.connectome.dn.fire] ?? 0;
    const evadeRate = this.network.firingRates[this.connectome.dn.evade] ?? 0;
    const turn = clamp((turnRight - turnLeft) / 40, -1, 1);
    const turnWithDeadzone = Math.abs(turn) < 0.06 ? 0 : turn;
    const thrust = clamp(0.3 + (forwardRate - brakeRate) / 45, 0.12, 1);
    const fire = fireRate > 2 && this.fireCooldown <= 0;
    if (fire) {
      this.fireCooldown = 0.2;
    }
    const stress = this.plasticity.stress;
    const escape = stress > 0.55 && this.escapeCooldown <= 0;
    if (escape) {
      this.escapeCooldown = 0.9;
    }
    return {
      turn: turnWithDeadzone,
      thrust,
      fire,
      evade: evadeRate > 8,
      stress,
      escape,
      leftRate: turnLeft,
      rightRate: turnRight,
      forwardRate,
      brakeRate,
      fireRate,
      evadeRate,
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
    this.plasticity.reset();
    this.stepCounter = 0;
  }

  public static neutralCommand(): MotorCommand {
    return {
      turn: 0,
      thrust: 0.5,
      fire: false,
      evade: false,
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
