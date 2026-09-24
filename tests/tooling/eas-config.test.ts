import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('EAS project link', () => {
  it('app.json carries the EAS projectId for builds', async () => {
    const config = JSON.parse(await readFile('apps/mobile/app.json', 'utf8'));
    expect(typeof config.expo?.extra?.eas?.projectId).toBe('string');
    expect(config.expo.extra.eas.projectId.length).toBeGreaterThan(0);
  });

  it('keeps the decided Android package alongside the link', async () => {
    const config = JSON.parse(await readFile('apps/mobile/app.json', 'utf8'));
    expect(config.expo?.android?.package).toBe('za.co.strandcue.app');
  });
});
