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

  it('documents the compatibility window, the unfinished operator checklist and fingerprint separation', async () => {
    const doc = await readFile('docs/runbooks/assetlinks.md', 'utf8');
    expect(doc).toContain('Compatibility window');
    expect(doc).toContain('NOT DONE');
    expect(doc).toContain('bomudijjqmoommndhxib');
    expect(doc).toContain('https://strandcue.adonisgptacc.workers.dev/auth/callback');
    expect(doc).toContain('Play App Signing');
  });

  it('gives the compatibility window a resolvable owner instead of a dangling pointer', async () => {
    const doc = await readFile('docs/runbooks/assetlinks.md', 'utf8');
    // The required field, verbatim: the window must name an accountable person.
    expect(doc).toContain('Cutover owner: <UNASSIGNED - must be named before the first release cut>');
    expect(doc).toMatch(/assign/i);
    // Closing the window is blocked while the field is unassigned.
    expect(doc).toMatch(/removing the\s+compatibility branch[^.]*blocked until/i);
    // The old pointer led to a record that names no owner; it must be gone.
    expect(doc).not.toContain('docs/verification/android-acceptance-checklist.md');
  });

  it('forbids cutting a release from this tree before the operator checklist steps land', async () => {
    const doc = await readFile('docs/runbooks/assetlinks.md', 'utf8');
    expect(doc).toContain('Do not cut a release from the HTTPS-only tree before checklist steps 1-4 are recorded');
    // The reason, stated: without the hosted allowlist entry a recovery link is dead.
    expect(doc).toContain('a recovery link does not open the app');
  });

  it('warns that Supabase matches the allow list including the PKCE query string', async () => {
    const doc = await readFile('docs/runbooks/assetlinks.md', 'utf8');
    // L3: the client appends sb_flow_id, so the exact entry may not match verbatim.
    expect(doc).toContain('sb_flow_id');
    expect(doc).toMatch(/query string/i);
    // The primary instruction stays the canonical exact entry.
    expect(doc).toContain('Redirect URLs, add exactly');
    // The documented fallback stays on the app's own origin.
    expect(doc).toContain('https://strandcue.adonisgptacc.workers.dev/auth/callback**');
    // And it must be confirmed by the real device tap in step 4.
    expect(doc).toMatch(/tapping a real link \(step 4\)/);
  });
});
