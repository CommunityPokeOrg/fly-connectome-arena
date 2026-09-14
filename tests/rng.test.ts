import { describe, expect, it } from 'vitest';
import { RNG } from '../src/core/rng.ts';

describe('seeded random generator', () => {
  it('repeats an identical sequence for numeric and string seeds', () => {
    const numericA = new RNG(1234);
    const numericB = new RNG(1234);
    const stringA = new RNG('arena');
    const stringB = new RNG('arena');
    expect(Array.from({ length: 12 }, () => numericA.next())).toEqual(
      Array.from({ length: 12 }, () => numericB.next()),
    );
    expect(Array.from({ length: 12 }, () => stringA.next())).toEqual(
      Array.from({ length: 12 }, () => stringB.next()),
    );
  });
});
