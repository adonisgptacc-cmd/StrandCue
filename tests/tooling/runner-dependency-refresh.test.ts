import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('compatible runner dependency refresh', () => {
  it.each([
    ['tools/eas-runner', 'minimatch', '5.1.9'],
    ['tools/eas-runner', 'nanoid', '3.3.20'],
    ['tools/eas-runner', 'tar', '7.5.22'],
    ['tools/eas-runner', 'ajv', '8.18.0'],
    ['tools/eas-runner', 'yaml', '2.8.3'],
    ['tools/mutation-runner', 'qs', '6.16.1'],
  ])('refreshes %s %s within its existing major', (tree, name, minimum) => {
    const lock = JSON.parse(readFileSync(`${tree}/package-lock.json`, 'utf8'));
    const version = lock.packages[`node_modules/${name}`].version;
    const parts = (value: string) => value.split('.').map(Number);
    expect(parts(version)[0]).toBe(parts(minimum)[0]);
    expect(parts(version)[1] * 1000 + parts(version)[2])
      .toBeGreaterThanOrEqual(parts(minimum)[1] * 1000 + parts(minimum)[2]);
  });
});
