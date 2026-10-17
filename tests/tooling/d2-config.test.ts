import { readdir, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const APP_ID = 'za.co.strandcue.app';
const DEEP_LINK_HOST = 'strandcue.adonisgptacc.workers.dev';

async function maestroSources(): Promise<string[]> {
  const names = (await readdir('.maestro')).filter(name => name.endsWith('.yaml')).sort();
  return Promise.all(names.map(name => readFile(`.maestro/${name}`, 'utf8')));
}

describe('D2 decided values are wired into device surfaces', () => {
  it('every Maestro flow launches the decided applicationId', async () => {
    const flows = await maestroSources();
    expect(flows.length).toBeGreaterThanOrEqual(3);
    for (const source of flows) {
      expect(source).toMatch(/^appId:\s*za\.co\.strandcue\.app\s*$/m);
      expect(source).not.toContain('com.strandcue.dev');
    }
  });

  it('app.json declares the decided Android package', async () => {
    const config = JSON.parse(await readFile('apps/mobile/app.json', 'utf8'));
    expect(config.expo?.android?.package).toBe(APP_ID);
  });

  it('app.json intent filters claim the decided HTTPS host for auth links', async () => {
    const config = JSON.parse(await readFile('apps/mobile/app.json', 'utf8'));
    const filters = config.expo?.android?.intentFilters ?? [];
    const https = filters.filter((filter: { action?: string; autoVerify?: boolean; data?: { scheme: string; host: string }[] }) =>
      filter.action === 'VIEW' && filter.autoVerify === true &&
      (filter.data ?? []).some(datum => datum.scheme === 'https' && datum.host === DEEP_LINK_HOST));
    expect(https.length).toBeGreaterThanOrEqual(1);
  });

  it('redirects recovery to the verified HTTPS callback and keeps the legacy scheme branch', async () => {
    // docs/superpowers/plans/2026-09-24-assetlinks-cutover.md:144,152:
    // the cutover replaces this scheme-only guard with a dual-link guard.
    const auth = await readFile('apps/mobile/src/auth.tsx', 'utf8');
    const contracts = await readFile('apps/mobile/src/contracts.ts', 'utf8');
    expect(auth).toContain(`const authCallbackUrl = 'https://${DEEP_LINK_HOST}/auth/callback'`);
    expect(auth).toContain('redirectTo: authCallbackUrl');
    expect(auth).toContain('isApprovedAuthCallback');
    expect(contracts).toContain('strandcue://auth/callback');
  });
});
