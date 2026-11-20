import { describe, expect, it } from 'vitest';
import { validateReleaseLinks } from '../../scripts/release-links.ts';

const fingerprint = Array(32).fill('AB').join(':');
const expected = { packageName: 'za.co.strandcue.app', fingerprint };
const association = {
  relation: ['delegate_permission/common.handle_all_urls'],
  target: {
    namespace: 'android_app',
    package_name: expected.packageName,
    sha256_cert_fingerprints: [fingerprint],
  },
};

describe('verified Android link association', () => {
  it('accepts only an association for the expected app and reviewed signing certificate', () => {
    expect(validateReleaseLinks([association], expected)).toEqual([]);
  });

  it.each([
    ['missing document', null],
    ['missing entry', []],
    ['placeholder certificate', [{ ...association, target: { ...association.target, sha256_cert_fingerprints: ['<RELEASE-KEYSTORE-SHA256>'] } }]],
    ['another certificate', [{ ...association, target: { ...association.target, sha256_cert_fingerprints: [Array(32).fill('CD').join(':')] } }]],
    ['another package', [{ ...association, target: { ...association.target, package_name: 'other.app' } }]],
    ['another namespace', [{ ...association, target: { ...association.target, namespace: 'web' } }]],
    ['missing relation', [{ ...association, relation: [] }]],
  ])('rejects %s', (_reason, body) => {
    expect(validateReleaseLinks(body, expected).length).toBeGreaterThan(0);
  });

  it('rejects a missing or malformed expected certificate before accepting remote data', () => {
    expect(validateReleaseLinks([association], { ...expected, fingerprint: '' }).length).toBeGreaterThan(0);
    expect(validateReleaseLinks([association], { ...expected, fingerprint: 'AB:CD' }).length).toBeGreaterThan(0);
  });
});
