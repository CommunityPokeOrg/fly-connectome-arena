/**
 * A tiny, reproducible mulberry32 generator.
 *
 * Every simulation decision receives its entropy from this class. Keeping the
 * generator explicit makes recordings, unit tests, and URL seed sharing useful
 * instead of merely decorative.
 */
export class RNG {
  private state: number;

  public constructor(seed: number | string = 1) {
    this.state = RNG.hashSeed(seed);
  }

  public static hashSeed(seed: number | string): number {
    if (typeof seed === 'number' && Number.isFinite(seed)) {
      return (Math.floor(seed) >>> 0) || 0x6d2b79f5;
    }
    const text = String(seed);
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0) || 0x6d2b79f5;
  }

  public next(): number {
    this.state = (this.state + 0x6d2b79f5) | 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  }

  public range(minimum: number, maximum: number): number {
    return minimum + (maximum - minimum) * this.next();
  }

  public int(minimum: number, maximumExclusive: number): number {
    return Math.floor(this.range(minimum, maximumExclusive));
  }

  public chance(probability: number): boolean {
    return this.next() < probability;
  }

  public pick<T>(items: readonly T[]): T {
    if (items.length === 0) {
      throw new Error('RNG.pick requires a non-empty list');
    }
    return items[this.int(0, items.length)] as T;
  }

  public fork(salt: number): RNG {
    const child = new RNG(this.state ^ salt);
    child.next();
    return child;
  }

  public get currentState(): number {
    return this.state >>> 0;
  }
}

export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

/** Exponential approach toward a target; frame-rate independent. */
export function relax(value: number, target: number, dt: number, tau: number): number {
  return value + (target - value) * (1 - Math.exp(-dt / tau));
}

export function lerp(from: number, to: number, amount: number): number {
  return from + (to - from) * amount;
}

export function wrap(value: number, minimum: number, maximum: number): number {
  const width = maximum - minimum;
  return ((value - minimum) % width + width) % width + minimum;
}

export function signedAngleDifference(target: number, current: number): number {
  return Math.atan2(Math.sin(target - current), Math.cos(target - current));
}
