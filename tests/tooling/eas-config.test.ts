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

describe('first build evidence', () => {
  it('device-evidence.md records the preview APK build', async () => {
    const doc = await readFile('docs/verification/device-evidence.md', 'utf8');
    expect(doc).toMatch(/EAS build ID:\s*\S+/);
    expect(doc).toMatch(/Artifact SHA-256:\s*[0-9a-f]{64}/i);
    expect(doc).toMatch(/za\.co\.strandcue\.app/);
  });

  it('device-evidence.md records install and first launch', async () => {
    const doc = await readFile('docs/verification/device-evidence.md', 'utf8');
    expect(doc).toMatch(/Installed on:\s*\S+/);
    expect(doc).toMatch(/First launch:\s*\S+/);
    expect(doc).toMatch(/Signup screen visible|Begin your hair record/);
  });
});
