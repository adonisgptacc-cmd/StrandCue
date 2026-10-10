import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('assetlinks runbook contract', () => {
  it('documents the exact assetlinks.json for the D2 host', async () => {
    const doc = await readFile('docs/runbooks/assetlinks.md', 'utf8');
    expect(doc).toContain('"package_name": "za.co.strandcue.app"');
    expect(doc).toContain('"relation": ["delegate_permission/common.handle_all_urls"]');
    // Documentation is a template, not proof that the release certificate is deployed.
    expect(doc).toContain('<RELEASE-KEYSTORE-SHA256>');
    expect(doc).toContain('npm run check:release-links');
    expect(doc).toContain('STRANDCUE_ANDROID_CERT_SHA256');
    expect(doc).toContain('strandcue.adonisgptacc.workers.dev/.well-known/assetlinks.json');
  });
});
