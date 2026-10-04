import { describe, expect, it } from 'vitest';
import worker from '../../scripts/cloudflare-worker.ts';
import { validateReleaseLinks } from '../../scripts/release-links.ts';

const fingerprint = Array.from({ length: 32 }, () => 'AA').join(':');
const url = 'https://strandcue.adonisgptacc.workers.dev/.well-known/assetlinks.json';

describe('Cloudflare Android association handler', () => {
  it('serves the configured local signing certificate as matching JSON without redirect', async () => {
    const response = await worker.fetch(new Request(url), { ANDROID_CERT_SHA256: fingerprint });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(response.headers.get('location')).toBeNull();
    expect(validateReleaseLinks(await response.json(), { packageName: 'za.co.strandcue.app', fingerprint })).toEqual([]);
  });

  it('fails closed until a valid public signing fingerprint is configured', async () => {
    for (const value of ['', 'debug-key', 'AA:BB']) {
      expect((await worker.fetch(new Request(url), { ANDROID_CERT_SHA256: value })).status).toBe(503);
    }
  });

  it('supports both signing certificates during the transition to Play App Signing', async () => {
    const play = Array.from({ length: 32 }, () => 'BB').join(':');
    const response = await worker.fetch(new Request(url), { ANDROID_CERT_SHA256: `${fingerprint},${play}` });
    const body = await response.json();
    for (const certificate of [fingerprint, play]) {
      expect(validateReleaseLinks(body, { packageName: 'za.co.strandcue.app', fingerprint: certificate })).toEqual([]);
    }
  });

  it('does not accept writes or redirect authentication parameters elsewhere', async () => {
    expect((await worker.fetch(new Request(url, { method: 'POST' }), { ANDROID_CERT_SHA256: fingerprint })).status).toBe(405);
    const other = await worker.fetch(new Request('https://strandcue.adonisgptacc.workers.dev/auth/callback?code=test'), { ANDROID_CERT_SHA256: fingerprint });
    expect(other.status).toBe(404);
    expect(other.headers.get('location')).toBeNull();
    expect(await other.text()).not.toContain('code=test');
  });

  it('returns association headers without a body for HEAD requests', async () => {
    const response = await worker.fetch(new Request(url, { method: 'HEAD' }), { ANDROID_CERT_SHA256: fingerprint });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.text()).toBe('');
  });
});
