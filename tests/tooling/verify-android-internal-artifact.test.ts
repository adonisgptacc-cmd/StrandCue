import { describe, expect, it } from 'vitest';

import { verifyAndroidArtifact, type AndroidArtifactMetadata } from '../../scripts/verify-android-artifact';
import {
  INTERNAL_ARTIFACT_STATEMENT,
  locateResourceFile,
  manifestDeclaresGlobalCleartext,
  manifestHasNetworkSecurityConfig,
  parseNetworkSecurityConfig,
  scanBundleStrings,
  TASK_2_5_INTERNAL_PROFILE,
  verifyAndroidInternalArtifact,
  type InternalArtifactEvidence,
  type InternalArtifactProfile,
} from '../../scripts/verify-android-internal-artifact';

const COMMIT = '2e18aba9573d800f632952e0b8d5d1306694222e';
const DEBUG_CERT = 'aa'.repeat(32);
const APK_HASH = 'bb'.repeat(32);
const MANIFEST_HASH = 'cc'.repeat(32);
const ALPHA_CERT = 'b930b12ee536b12f2b9c562f2baf69aca8449bc21dea95386cc46986dd551fbe';

const profile: InternalArtifactProfile = {
  packageName: 'za.co.strandcue.app', versionName: '0.1.0', versionCode: '1', sourceCommit: COMMIT,
  abis: ['arm64-v8a', 'x86_64'], nativeManifestSha256: MANIFEST_HASH, signerSha256: DEBUG_CERT, localBackendHost: '10.0.2.2',
};

const metadata = (overrides: Partial<AndroidArtifactMetadata> = {}): AndroidArtifactMetadata => ({
  packageName: 'za.co.strandcue.app', versionName: '0.1.0', versionCode: '1', sourceCommit: COMMIT, inputApkSha256: APK_HASH, abi: ['arm64-v8a', 'x86_64'],
  nativeManifestSha256: MANIFEST_HASH, signerCount: 1, signerSha256: DEBUG_CERT, apkSha256: APK_HASH, sourceReceiptPresent: true, parseErrors: [],
  extractNativeLibs: false, nativeZipEntries: Array.from({ length: 44 }, (_, index) => ({ name: `lib/x/${index}.so`, compressionMethod: 0, dataOffset: 16384 * (index + 1) })), ...overrides,
});

const evidence = (overrides: Partial<InternalArtifactEvidence> = {}): InternalArtifactEvidence => ({
  receipt: { classification: 'internal-debug-signed-emulator-acceptance', backend: 'loopback-local-supabase', statement: INTERNAL_ARTIFACT_STATEMENT, notApprovedForDistribution: true, cleartextScope: 'loopback-test-backend-only' },
  globalCleartext: false, networkSecurityConfig: { baseCleartext: false, cleartextDomains: ['10.0.2.2'] },
  scan: { productionSupabaseHosts: [], serviceRoleMaterial: 0, secretKeys: 0, secretKeyPrefixLiterals: 0, supabaseEndpoints: ['http://10.0.2.2:54321'], otherCleartextHosts: [] },
  ...overrides,
});

describe('the internal Task 2.5 emulator artifact profile', () => {
  it('accepts the debug-signed loopback artifact only under the internal classification', () => {
    expect(verifyAndroidInternalArtifact(metadata(), evidence(), profile)).toEqual({ status: 'PASS', errors: [] });
  });

  it.each([
    ['a receipt with no classification', evidence({ receipt: { statement: INTERNAL_ARTIFACT_STATEMENT } }), 'CLASSIFICATION_MISMATCH'],
    ['a receipt claiming a release classification', evidence({ receipt: { ...evidence().receipt, classification: 'release' } }), 'CLASSIFICATION_MISMATCH'],
    ['a receipt for a different backend', evidence({ receipt: { ...evidence().receipt, backend: 'hosted-supabase' } }), 'BACKEND_CLASSIFICATION_MISMATCH'],
    ['a receipt without the required wording', evidence({ receipt: { ...evidence().receipt, statement: 'Approved for release' } }), 'STATEMENT_MISMATCH'],
    ['a receipt that does not mark it unapproved for distribution', evidence({ receipt: { ...evidence().receipt, notApprovedForDistribution: false } }), 'DISTRIBUTION_FLAG_MISMATCH'],
    ['a receipt with the wrong cleartext scope', evidence({ receipt: { ...evidence().receipt, cleartextScope: 'everywhere' } }), 'CLEARTEXT_SCOPE_MISMATCH'],
    ['a global cleartext allowance', evidence({ globalCleartext: true }), 'GLOBAL_CLEARTEXT'],
    ['cleartext that is not restricted at the base', evidence({ networkSecurityConfig: { baseCleartext: true, cleartextDomains: ['10.0.2.2'] } }), 'CLEARTEXT_NOT_RESTRICTED'],
    ['cleartext allowed for another host', evidence({ networkSecurityConfig: { baseCleartext: false, cleartextDomains: ['10.0.2.2', 'example.com'] } }), 'CLEARTEXT_HOST_MISMATCH'],
    ['cleartext allowed for no host at all', evidence({ networkSecurityConfig: { baseCleartext: false, cleartextDomains: [] } }), 'CLEARTEXT_HOST_MISMATCH'],
    ['no network security config at all', evidence({ networkSecurityConfig: null }), 'NETWORK_SECURITY_CONFIG_MISSING'],
    ['a bundled production Supabase host', evidence({ scan: { ...evidence().scan, productionSupabaseHosts: ['abcdefghijklmnopqrst.supabase.co'] } }), 'PRODUCTION_HOST_BUNDLED'],
    ['bundled service-role material', evidence({ scan: { ...evidence().scan, serviceRoleMaterial: 1 } }), 'SERVICE_ROLE_BUNDLED'],
    ['a bundled secret key', evidence({ scan: { ...evidence().scan, secretKeys: 1 } }), 'SECRET_KEY_BUNDLED'],
    ['a Supabase endpoint that is not the local test backend', evidence({ scan: { ...evidence().scan, supabaseEndpoints: ['http://10.0.2.2:54321', 'https://api.example.com'] } }), 'BACKEND_ENDPOINT_MISMATCH'],
    ['no Supabase endpoint at all', evidence({ scan: { ...evidence().scan, supabaseEndpoints: [] } }), 'BACKEND_ENDPOINT_MISSING'],
  ])('holds for %s', (_name, given, code) => {
    const result = verifyAndroidInternalArtifact(metadata(), given, profile);
    expect(result.status).toBe('HOLD');
    expect(result.errors).toContain(code);
  });

  it('holds when the signer is the alpha identity, a different debug key, or the source or ABI differs', () => {
    expect(verifyAndroidInternalArtifact(metadata({ signerSha256: ALPHA_CERT }), evidence(), profile).errors).toContain('SIGNER_FINGERPRINT_MISMATCH');
    expect(verifyAndroidInternalArtifact(metadata({ signerSha256: 'dd'.repeat(32) }), evidence(), profile).errors).toContain('SIGNER_FINGERPRINT_MISMATCH');
    expect(verifyAndroidInternalArtifact(metadata({ sourceCommit: '1c9fff7' + '0'.repeat(33) }), evidence(), profile).errors).toContain('SOURCE_MISMATCH');
    expect(verifyAndroidInternalArtifact(metadata({ abi: ['x86_64'] }), evidence(), profile).errors).toContain('ABI_SET_MISMATCH');
  });

  it('is not the release verifier: the release profile still rejects this internal artifact', () => {
    const release = verifyAndroidArtifact(metadata(), {
      packageName: 'za.co.strandcue.app', sourceCommit: 'd8c2818a7fac0e996910a5a33d6784875800993b',
      inputApkSha256: 'd582bdf4110ce73cba386cfe16ad6cb16de97560862b35a26a9ea8b96b635b16', abis: ['arm64-v8a', 'x86_64'],
      nativeManifestSha256: 'c459015a3b52af685ebadf3e529f5fa952d1c89c923493d903eef545c519b6cd', versionName: '0.1.0', expectedVersionCode: '1', signerCount: 1, signerSha256: ALPHA_CERT,
    });
    expect(release.status).toBe('HOLD');
    expect(release.errors).toEqual(expect.arrayContaining(['SOURCE_MISMATCH', 'INPUT_APK_HASH_MISMATCH', 'SIGNER_FINGERPRINT_MISMATCH']));
  });

  it('pins the Task 2.5 profile in tracked code, apart from the release pins', () => {
    expect(TASK_2_5_INTERNAL_PROFILE.sourceCommit).toBe(COMMIT);
    expect(TASK_2_5_INTERNAL_PROFILE.signerSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(TASK_2_5_INTERNAL_PROFILE.signerSha256).not.toBe(ALPHA_CERT);
    expect(TASK_2_5_INTERNAL_PROFILE.signerSha256).toBe('fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c');
    expect(TASK_2_5_INTERNAL_PROFILE.nativeManifestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(TASK_2_5_INTERNAL_PROFILE.localBackendHost).toBe('10.0.2.2');
    expect(INTERNAL_ARTIFACT_STATEMENT).toBe('Internal debug-signed emulator acceptance artifact configured for the loopback local Supabase test stack. This artifact is not approved for distribution.');
  });
});

describe('scanning bundled configuration', () => {
  const jwt = (role: string) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.signature`;

  it('finds the local backend and reports nothing else for a clean bundle', () => {
    const result = scanBundleStrings(Buffer.from('xx http://10.0.2.2:54321 yy https://strandcue.adonisgptacc.workers.dev/auth/callback http://schemas.android.com/apk/res/android http://localhost:8081 http://localhost:9999'));
    // The React Native dev-server literals are not the backend: only the Supabase endpoint is.
    expect(result.supabaseEndpoints).toEqual(['http://10.0.2.2:54321']);
    expect(result.productionSupabaseHosts).toEqual([]);
    expect(result.serviceRoleMaterial).toBe(0);
    expect(result.secretKeys).toBe(0);
    expect(result.otherCleartextHosts).toEqual(['localhost', 'schemas.android.com']);
  });

  it('finds a hosted Supabase project, a service-role token and a known secret value, and never returns their values', () => {
    const result = scanBundleStrings(Buffer.from(`https://abcdefghijklmnopqrst.supabase.co ${jwt('service_role')} sb_secret_abcdefghijk ${jwt('anon')}`), ['sb_secret_abcdefghijk']);
    expect(result.productionSupabaseHosts).toEqual(['abcdefghijklmnopqrst.supabase.co']);
    expect(result.serviceRoleMaterial).toBe(1);
    expect(result.secretKeys).toBe(1);
    expect(JSON.stringify(result)).not.toContain('sb_secret_abcdefghijk');
    expect(JSON.stringify(result)).not.toContain('signature');
  });

  it('does not mistake a library string that starts like a secret key for a key: only a known secret value counts', () => {
    // Hermes stores adjacent strings back to back, so a bare prefix literal is followed by unrelated text.
    const bundle = Buffer.from('cannot be used on object schemas containing refinementsb_secret_ confidencev');
    const result = scanBundleStrings(bundle, ['sb_secret_realvalue0123456789']);
    expect(result.secretKeys).toBe(0);
    expect(result.secretKeyPrefixLiterals).toBe(1);
    expect(scanBundleStrings(Buffer.from('xx sb_secret_realvalue0123456789 yy'), ['sb_secret_realvalue0123456789']).secretKeys).toBe(1);
  });

  it('treats a malformed token as not service-role material and handles empty input', () => {
    expect(scanBundleStrings(Buffer.from('eyJnotajwt.@@@.x')).serviceRoleMaterial).toBe(0);
    expect(scanBundleStrings(Buffer.alloc(0)).supabaseEndpoints).toEqual([]);
  });
});

describe('reading the real aapt output formats', () => {
  const lines = (...parts: string[]) => `${parts.join('\r\n')}\r\n`;
  const manifest = lines('      A: android:extractNativeLibs(0x010104ea)=(type 0x12)0x0', '      A: android:networkSecurityConfig(0x01010527)=@0x7f140005');
  const config = lines(
    'E: network-security-config (line=3)', '  E: base-config (line=4)', '    A: cleartextTrafficPermitted=(type 0x12)0x0',
    '  E: domain-config (line=5)', '    A: cleartextTrafficPermitted=(type 0x12)0xffffffff', '    E: domain (line=6)',
    '      A: includeSubdomains=(type 0x12)0x0', '      C: "10.0.2.2"',
  );

  it('reads the cleartext policy a network security config grants', () => {
    expect(parseNetworkSecurityConfig(config)).toEqual({ baseCleartext: false, cleartextDomains: ['10.0.2.2'] });
    const permissiveBase = config.replace('E: base-config (line=4)\r\n    A: cleartextTrafficPermitted=(type 0x12)0x0', 'E: base-config (line=4)\r\n    A: cleartextTrafficPermitted=(type 0x12)0xffffffff');
    expect(parseNetworkSecurityConfig(permissiveBase)?.baseCleartext).toBe(true);
    // A domain-config that does not permit cleartext grants nothing.
    const closedDomain = config.replace('A: cleartextTrafficPermitted=(type 0x12)0xffffffff', 'A: cleartextTrafficPermitted=(type 0x12)0x0');
    expect(parseNetworkSecurityConfig(closedDomain)?.cleartextDomains).toEqual([]);
    expect(parseNetworkSecurityConfig('E: something-else')).toBeNull();
  });

  it('tells a global cleartext flag from a network security config, in the manifest', () => {
    expect(manifestHasNetworkSecurityConfig(manifest)).toBe(true);
    expect(manifestDeclaresGlobalCleartext(manifest)).toBe(false);
    expect(manifestDeclaresGlobalCleartext(`${manifest}      A: android:usesCleartextTraffic(0x010104ec)=(type 0x12)0xffffffff\r\n`)).toBe(true);
    expect(manifestDeclaresGlobalCleartext(`${manifest}      A: android:usesCleartextTraffic(0x010104ec)=(type 0x12)0x0\r\n`)).toBe(false);
    expect(manifestHasNetworkSecurityConfig('')).toBe(false);
  });

  it('finds the file a named resource lives in from the values dump', () => {
    const dump = lines(
      '        resource 0x7f140005 za.co.strandcue.app:xml/network_security_config: t=0x03 d=0x00000043 (s=0x0008 r=0x00)', '          (string8) "res/8G.xml"',
      '        resource 0x7f140006 za.co.strandcue.app:xml/rn_dev_preferences: t=0x03 d=0x000000d9 (s=0x0008 r=0x00)', '          (string8) "res/Aa.xml"',
    );
    expect(locateResourceFile(dump, 'xml/network_security_config')).toBe('res/8G.xml');
    expect(locateResourceFile(dump, 'xml/rn_dev_preferences')).toBe('res/Aa.xml');
    expect(locateResourceFile(dump, 'xml/missing')).toBeNull();
  });
});
