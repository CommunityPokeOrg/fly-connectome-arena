import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const FORBIDDEN = /4eeeff|32dff4|00ffff|39ff14|ff00ff|164a73|0a213d/i;

function* walk(directory: string): Generator<string> {
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) yield* walk(path);
    else if (path.endsWith('.ts')) yield path;
  }
}

describe('no legacy neon palette survives', () => {
  it('styles.css has no neon hexes or `0 0 ` glow blur', () => {
    const css = readFileSync('src/styles.css', 'utf8');
    expect(FORBIDDEN.test(css)).toBe(false);
    const glow = /text-shadow\s*:[^;]*0 0 /i.test(css);
    expect(glow).toBe(false);
  });

  it('no source file contains legacy neon hexes', () => {
    const offenders: string[] = [];
    for (const file of walk('src')) {
      if (FORBIDDEN.test(readFileSync(file, 'utf8'))) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
