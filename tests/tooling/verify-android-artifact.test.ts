import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseArtifactInspectionOutputs,
  runAndroidInspectionCommand,
  verifyAndroidArtifactCli,
  verifyAndroidArtifact,
  validateAndroidNativeManifest,
  inspectAndroidNativeManifest,
  validateAndroidNativeZipEntries,
  type AndroidNativeManifest,
  type AndroidArtifactMetadata,
  type AndroidArtifactExpectation,
} from '../../scripts/verify-android-artifact.ts';

const fingerprint = 'b930b12ee536b12f2b9c562f2baf69aca8449bc21dea95386cc46986dd551fbe';
const sourceCommit = 'd8c2818a7fac0e996910a5a33d6784875800993b';
const inputApkSha256 = 'd582bdf4110ce73cba386cfe16ad6cb16de97560862b35a26a9ea8b96b635b16';
const nativeManifestSha256 = 'c459015a3b52af685ebadf3e529f5fa952d1c89c923493d903eef545c519b6cd';

const expected: AndroidArtifactExpectation = {
  packageName: 'za.co.strandcue.app',
  sourceCommit,
  inputApkSha256,
  abis: ['arm64-v8a', 'x86_64'],
  nativeManifestSha256,
  versionName: '0.1.0',
  expectedVersionCode: '1',
  signerCount: 1,
  signerSha256: fingerprint,
};

const valid: AndroidArtifactMetadata = {
  packageName: 'za.co.strandcue.app',
  versionName: '0.1.0',
  versionCode: '1',
  sourceCommit,
  inputApkSha256,
  abi: ['arm64-v8a', 'x86_64'],
  nativeManifestSha256,
  signerCount: 1,
  signerSha256: fingerprint,
  apkSha256: 'b'.repeat(64),
  sourceReceiptPresent: true,
  parseErrors: [],
  extractNativeLibs: false,
  nativeZipEntries: Array.from({ length: 44 }, (_, i) => ({ name: `lib/${i < 22 ? 'arm64-v8a' : 'x86_64'}/lib${i % 22}.so`, compressionMethod: 0, dataOffset: 16384 * (i + 1) })),
};

const nativeNames = [
  'libandroidx.graphics.path.so', 'libappmodules.so', 'libc++_shared.so', 'libexpo-modules-core.so',
  'libfbjni.so', 'libgesturehandler.so', 'libgifimage.so', 'libhermestooling.so', 'libhermesvm.so',
  'libimagepipeline.so', 'libjsi.so', 'libnative-filters.so', 'libnative-imagetranscoder.so',
  'libreact_codegen_rngesturehandler_codegen.so', 'libreact_codegen_rnscreens.so',
  'libreact_codegen_safeareacontext.so', 'libreactnative.so', 'libreanimated.so', 'librnscreens.so',
  'libstatic-webp.so', 'libworklets.so', 'libzstd-kmp.so',
];
const nativeManifest = (): AndroidNativeManifest => ({
  'arm64-v8a': nativeNames.map((name) => ({ name, machine: 'AArch64', needed: ['libc.so'] })),
  x86_64: nativeNames.map((name) => ({ name, machine: 'Advanced Micro Devices X86-64', needed: ['libc.so'] })),
});
const nativeArchiveListing = (arm = nativeNames, x86 = nativeNames) => [
  ...arm.map((name) => `lib/arm64-v8a/${name}`),
  ...x86.map((name) => `lib/x86_64/${name}`),
].join('\n');
const nativeToolEnv = {
  STRANDCUE_READELF: 'readelf',
  STRANDCUE_JAR: 'jar',
  STRANDCUE_JAVA: 'java',
};
const nativeReadelf = (machineOverride?: string, dependencyOverride?: string) => (command: string, args: string[]) => {
  if (command !== 'readelf') return '';
  const path = args.at(-1) ?? '';
  const machine = machineOverride ?? (path.includes('arm64-v8a') ? 'AArch64' : 'Advanced Micro Devices X86-64');
  return `  Machine: ${machine}\n 0x00000001 (NEEDED) Shared library: [${dependencyOverride ?? 'libc.so'}]`;
};

describe('verifyAndroidArtifact', () => {
  it('passes metadata matching the expected local alpha identity', () => {
    expect(verifyAndroidArtifact(valid, expected)).toEqual({ status: 'PASS', errors: [] });
    expect(validateAndroidNativeManifest(nativeManifest())).toBe(true);
  });

  it('requires STORED native entries and 16 KiB aligned data offsets when extraction is disabled', () => {
    expect(validateAndroidNativeZipEntries(valid.nativeZipEntries!)).toBe(true);
    expect(verifyAndroidArtifact({ ...valid, nativeZipEntries: valid.nativeZipEntries!.map((entry) => ({ ...entry, compressionMethod: 8 })) }, expected).errors)
      .toContain('NATIVE_ZIP_METHOD_MISMATCH');
    expect(verifyAndroidArtifact({ ...valid, nativeZipEntries: valid.nativeZipEntries!.map((entry, index) => index ? entry : ({ ...entry, dataOffset: entry.dataOffset + 4 })) }, expected).errors)
      .toContain('NATIVE_ZIP_ALIGNMENT_MISMATCH');
    expect(verifyAndroidArtifact({ ...valid, extractNativeLibs: true }, expected).errors)
      .toContain('EXTRACT_NATIVE_LIBS_MISMATCH');
  });

  it('holds when the package identity is wrong', () => {
    expect(verifyAndroidArtifact({ ...valid, packageName: 'za.other.app' }, expected).status).toBe('HOLD');
  });

  it('holds when the APK has no signer', () => {
    expect(verifyAndroidArtifact({ ...valid, signerCount: 0, signerSha256: null }, expected).status).toBe('HOLD');
  });

  it('holds when there is more than one signer', () => {
    expect(verifyAndroidArtifact({ ...valid, signerCount: 2 }, expected).status).toBe('HOLD');
  });

  it('holds when the signer fingerprint differs', () => {
    expect(verifyAndroidArtifact({ ...valid, signerSha256: 'c'.repeat(64) }, expected).status).toBe('HOLD');
  });

  it('holds when arm64-v8a is absent', () => {
    expect(verifyAndroidArtifact({ ...valid, abi: ['x86_64'] }, expected).status).toBe('HOLD');
  });

  it.each([
    ['missing x86_64', ['arm64-v8a']],
    ['missing arm64-v8a', ['x86_64']],
    ['extra ABI', ['arm64-v8a', 'x86_64', 'armeabi-v7a']],
  ])('requires the exact universal ABI set when %s', (_label, abi) => {
    expect(verifyAndroidArtifact({ ...valid, abi }, expected).errors).toContain('ABI_SET_MISMATCH');
  });

  it('rejects a missing x86_64 manifest', () => {
    const manifest = nativeManifest();
    delete manifest.x86_64;
    expect(validateAndroidNativeManifest(manifest)).toBe(false);
  });

  it('rejects a missing arm64 manifest', () => {
    const manifest = nativeManifest();
    delete manifest['arm64-v8a'];
    expect(validateAndroidNativeManifest(manifest)).toBe(false);
  });

  it('rejects an extra ABI', () => {
    expect(validateAndroidNativeManifest({ ...nativeManifest(), 'armeabi-v7a': [] })).toBe(false);
  });

  it('rejects missing per-ABI libreactnative.so and unequal DSO sets', () => {
    const missingReactNative = nativeManifest();
    missingReactNative.x86_64 = missingReactNative.x86_64.filter(({ name }) => name !== 'libreactnative.so');
    expect(validateAndroidNativeManifest(missingReactNative)).toBe(false);

    const unequalSets = nativeManifest();
    unequalSets.x86_64[0] = { ...unequalSets.x86_64[0], name: 'libdifferent.so' };
    expect(validateAndroidNativeManifest(unequalSets)).toBe(false);
  });

  it('rejects the wrong ELF machine and unresolved DT_NEEDED dependencies', () => {
    const wrongMachine = nativeManifest();
    wrongMachine['arm64-v8a'][0] = { ...wrongMachine['arm64-v8a'][0], machine: 'Advanced Micro Devices X86-64' };
    expect(validateAndroidNativeManifest(wrongMachine)).toBe(false);

    const dependencyGap = nativeManifest();
    dependencyGap['arm64-v8a'][0] = { ...dependencyGap['arm64-v8a'][0], needed: ['libmissing.so'] };
    expect(validateAndroidNativeManifest(dependencyGap)).toBe(false);
  });

  it('inspects all 44 libraries and hashes the canonical native manifest', () => {
    const hash = inspectAndroidNativeManifest('artifact.apk', nativeArchiveListing(), nativeToolEnv, nativeReadelf());
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('holds when archive inspection finds missing ABI or library entries', () => {
    expect(() => inspectAndroidNativeManifest('artifact.apk', nativeArchiveListing(nativeNames, []), nativeToolEnv, nativeReadelf()))
      .toThrow('ABI_SET_MISMATCH');
    const missingReactNative = nativeNames.filter((name) => name !== 'libreactnative.so');
    expect(() => inspectAndroidNativeManifest('artifact.apk', nativeArchiveListing(nativeNames, missingReactNative), nativeToolEnv, nativeReadelf()))
      .toThrow('NATIVE_MANIFEST_MISMATCH');
  });

  it('holds when readelf reports the wrong machine or an unresolved dependency', () => {
    expect(() => inspectAndroidNativeManifest('artifact.apk', nativeArchiveListing(), nativeToolEnv, nativeReadelf('AArch64')))
      .toThrow('NATIVE_MANIFEST_MISMATCH');
    expect(() => inspectAndroidNativeManifest('artifact.apk', nativeArchiveListing(), nativeToolEnv, nativeReadelf(undefined, 'libmissing.so')))
      .toThrow('NATIVE_MANIFEST_MISMATCH');
  });

  it('rejects a native manifest hash that differs from the pinned manifest', () => {
    expect(verifyAndroidArtifact({ ...valid, nativeManifestSha256: 'c'.repeat(64) }, expected).errors)
      .toContain('NATIVE_MANIFEST_MISMATCH');
  });

  it('holds when the version is wrong', () => {
    expect(verifyAndroidArtifact({ ...valid, versionName: '0.2.0' }, expected).status).toBe('HOLD');
  });

  it('holds when versionCode is missing or differs from the pinned build', () => {
    expect(verifyAndroidArtifact({ ...valid, versionCode: '2' }, expected).status).toBe('HOLD');
    expect(verifyAndroidArtifact({ ...valid, versionCode: null }, expected).status).toBe('HOLD');
  });

  it('holds for malformed APK or certificate hashes', () => {
    expect(verifyAndroidArtifact({ ...valid, apkSha256: 'not-a-hash' }, expected).status).toBe('HOLD');
    expect(verifyAndroidArtifact({ ...valid, signerSha256: 'not-a-hash' }, expected).status).toBe('HOLD');
  });

  it('holds when a source receipt is missing or does not match the expected source', () => {
    expect(verifyAndroidArtifact({ ...valid, sourceReceiptPresent: false }, expected).status).toBe('HOLD');
    expect(verifyAndroidArtifact({ ...valid, sourceCommit: '0'.repeat(40) }, expected).status).toBe('HOLD');
  });

  it('holds on incomplete or ambiguous tool output without echoing it', () => {
    const secretSentinel = 'do-not-print-this-password';
    const parsed = parseArtifactInspectionOutputs({
      badging: `unrecognized ${secretSentinel}`,
      signer: `failed ${secretSentinel}`,
      archiveListing: 'not an archive listing',
      nativeManifestSha256,
      sourceReceipt: '{ malformed',
      apkSha256: 'b'.repeat(64),
    });

    expect(parsed.parseErrors.length).toBeGreaterThan(0);
    expect(JSON.stringify(parsed)).not.toContain(secretSentinel);
    expect(verifyAndroidArtifact(parsed, expected).status).toBe('HOLD');
  });

  it('holds when apksigner declares more signers than it reports', () => {
    const parsed = parseArtifactInspectionOutputs({
      badging: "package: name='za.co.strandcue.app' versionCode='1' versionName='0.1.0'",
      signer: `Number of signers: 2\nSigner #1 certificate SHA-256 digest: ${fingerprint}`,
      archiveListing: 'lib/arm64-v8a/libreactnative.so\nlib/x86_64/libreactnative.so',
      nativeManifestSha256,
      sourceReceipt: JSON.stringify({ sourceCommit, inputApkSha256, signedApkSha256: 'b'.repeat(64) }),
      apkSha256: 'b'.repeat(64),
    });
    expect(parsed.parseErrors).toContain('SIGNER_PARSE');
    expect(verifyAndroidArtifact(parsed, expected).status).toBe('HOLD');
  });

  it('rejects trailing text on the declared signer count line', () => {
    const parsed = parseArtifactInspectionOutputs({
      badging: "package: name='za.co.strandcue.app' versionCode='1' versionName='0.1.0'",
      signer: `Number of signers: 1 extra\nSigner #1 certificate SHA-256 digest: ${fingerprint}`,
      archiveListing: 'lib/arm64-v8a/libreactnative.so\nlib/x86_64/libreactnative.so',
      nativeManifestSha256,
      sourceReceipt: JSON.stringify({ sourceCommit, inputApkSha256, signedApkSha256: 'b'.repeat(64) }),
      apkSha256: 'b'.repeat(64),
    });
    expect(parsed.parseErrors).toContain('SIGNER_PARSE');
  });

  it('holds on duplicate, gapped, or missing signer digest records', () => {
    const malformedOutputs = [
      `Number of signers: 2\nSigner #1 certificate SHA-256 digest: ${fingerprint}\nSigner #1 certificate SHA-256 digest: ${fingerprint}`,
      `Number of signers: 2\nSigner #1 certificate SHA-256 digest: ${fingerprint}\nSigner #3 certificate SHA-256 digest: ${fingerprint}`,
      'Number of signers: 1',
    ];
    for (const signer of malformedOutputs) {
      const parsed = parseArtifactInspectionOutputs({
        badging: "package: name='za.co.strandcue.app' versionCode='1' versionName='0.1.0'",
        signer,
        archiveListing: 'lib/arm64-v8a/libstrandcue.so',
        nativeManifestSha256,
        sourceReceipt: JSON.stringify({ sourceCommit, inputApkSha256, signedApkSha256: 'b'.repeat(64) }),
        apkSha256: 'b'.repeat(64),
      });
      expect(parsed.parseErrors).toContain('SIGNER_PARSE');
      expect(verifyAndroidArtifact(parsed, expected).status).toBe('HOLD');
    }
  });

  it('parses complete inspection output and ties the signed APK to its source receipt', () => {
    const apkSha256 = 'b'.repeat(64);
    const parsed = parseArtifactInspectionOutputs({
      badging: "package: name='za.co.strandcue.app' versionCode='1' versionName='0.1.0'",
      signer: `Number of signers: 1\nSigner #1 certificate SHA-256 digest: ${fingerprint}`,
      archiveListing: 'lib/arm64-v8a/libreactnative.so\nlib/x86_64/libreactnative.so',
      nativeManifestSha256,
      sourceReceipt: JSON.stringify({ sourceCommit, inputApkSha256, signedApkSha256: apkSha256 }),
      apkSha256,
      manifestTree: 'android:extractNativeLibs=(type 0x12)0x0',
      nativeZipEntries: valid.nativeZipEntries,
    });
    expect(parsed.sourceReceiptPresent).toBe(true);
    expect(verifyAndroidArtifact(parsed, expected)).toEqual({ status: 'PASS', errors: [] });
  });

  it('holds when the source receipt names a different input APK hash', () => {
    expect(verifyAndroidArtifact({ ...valid, inputApkSha256: 'c'.repeat(64) }, expected).status).toBe('HOLD');
  });

  it('holds when the signed APK hash differs from the source receipt', () => {
    const parsed = parseArtifactInspectionOutputs({
      badging: "package: name='za.co.strandcue.app' versionCode='1' versionName='0.1.0'",
      signer: `Number of signers: 1\nSigner #1 certificate SHA-256 digest: ${fingerprint}`,
      archiveListing: 'lib/arm64-v8a/libreactnative.so\nlib/x86_64/libreactnative.so',
      nativeManifestSha256,
      sourceReceipt: JSON.stringify({ sourceCommit, inputApkSha256, signedApkSha256: 'c'.repeat(64) }),
      apkSha256: 'b'.repeat(64),
    });
    expect(parsed.sourceReceiptPresent).toBe(false);
    expect(verifyAndroidArtifact(parsed, expected).errors)
      .toContain('SOURCE_RECEIPT_MISSING');
  });

  it('returns a redacted HOLD when CLI inspection fails', () => {
    const result = verifyAndroidArtifactCli('artifact.apk', {
      STRANDCUE_AAPT: 'aapt', STRANDCUE_APKSIGNER: 'apksigner', STRANDCUE_ZIPALIGN: 'zipalign', STRANDCUE_JAR: 'jar',
    }, {
      runCommand: () => { throw new Error('password-output-should-not-escape'); },
      readText: () => '',
      hashFile: () => 'b'.repeat(64),
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('ANDROID-ARTIFACT-HOLD:INSPECTION_FAILED');
    expect(result.stderr).not.toContain('password-output-should-not-escape');
  });

  it('uses the pinned certificate and ignores environment trust-anchor overrides', () => {
    expect(verifyAndroidArtifactCli(undefined).exitCode).toBe(2);
    const result = verifyAndroidArtifactCli('artifact.apk', {
      LOCALAPPDATA: 'C:/Android',
      STRANDCUE_ANDROID_CERT_SHA256: 'c'.repeat(64),
    }, {
      runCommand: (command, args) => args[0] === '-c'
        ? 'Verification successful.'
        : args.includes('xmltree') ? 'android:extractNativeLibs=(type 0x12)0x0'
        : command.includes('aapt')
        ? "package: name='za.co.strandcue.app' versionCode='1' versionName='0.1.0'"
        : args.join(' ').includes('apksigner')
          ? `Number of signers: 1\nSigner #1 certificate SHA-256 digest: ${fingerprint}`
          : 'lib/arm64-v8a/libreactnative.so\nlib/x86_64/libreactnative.so',
      readText: () => JSON.stringify({ sourceCommit, inputApkSha256, signedApkSha256: 'b'.repeat(64) }),
      hashFile: () => 'b'.repeat(64),
      inspectNativeManifest: () => nativeManifestSha256,
      inspectNativeZipEntries: () => valid.nativeZipEntries!,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(`certSha256=${fingerprint}`);
  });

  it('prints a pass receipt from the CLI when all inspected facts match', () => {
    const result = verifyAndroidArtifactCli('artifact.apk', {
      ANDROID_HOME: 'C:/Android/Sdk',
      STRANDCUE_ANDROID_CERT_SHA256: 'c'.repeat(64),
      STRANDCUE_APKSIGNER: 'apksigner.jar',
    }, {
      runCommand: (command, args) => args[0] === '-c'
        ? 'Verification successful.'
        : args.includes('xmltree') ? 'android:extractNativeLibs=(type 0x12)0x0'
        : command.includes('aapt')
        ? "package: name='za.co.strandcue.app' versionCode='1' versionName='0.1.0'"
        : args.join(' ').includes('apksigner')
          ? `Number of signers: 1\nSigner #1 certificate SHA-256 digest: ${fingerprint}`
          : 'lib/arm64-v8a/libreactnative.so\nlib/x86_64/libreactnative.so',
      readText: () => JSON.stringify({ sourceCommit, inputApkSha256, signedApkSha256: 'b'.repeat(64) }),
      hashFile: () => 'b'.repeat(64),
      inspectNativeManifest: () => nativeManifestSha256,
      inspectNativeZipEntries: () => valid.nativeZipEntries!,
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ANDROID-ARTIFACT-PASS');
  });

  it('does not let caller environment overrides replace pinned source and input expectations', () => {
    const otherSourceCommit = '0'.repeat(40);
    const otherInputHash = 'c'.repeat(64);
    const result = verifyAndroidArtifactCli('artifact.apk', {
      ANDROID_HOME: 'C:/Android/Sdk',
      STRANDCUE_ANDROID_CERT_SHA256: 'c'.repeat(64),
      STRANDCUE_APKSIGNER: 'apksigner.jar',
      STRANDCUE_ANDROID_EXPECTED_SOURCE_COMMIT: otherSourceCommit,
      STRANDCUE_ANDROID_EXPECTED_INPUT_APK_SHA256: otherInputHash,
    }, {
      runCommand: (command, args) => args[0] === '-c'
        ? 'Verification successful.'
        : args.includes('xmltree') ? 'android:extractNativeLibs=(type 0x12)0x0'
        : command.includes('aapt')
        ? "package: name='za.co.strandcue.app' versionCode='1' versionName='0.1.0'"
        : args.join(' ').includes('apksigner')
          ? `Number of signers: 1\nSigner #1 certificate SHA-256 digest: ${fingerprint}`
          : 'lib/arm64-v8a/libreactnative.so\nlib/x86_64/libreactnative.so',
      readText: () => JSON.stringify({ sourceCommit: otherSourceCommit, inputApkSha256: otherInputHash, signedApkSha256: 'b'.repeat(64) }),
      hashFile: () => 'b'.repeat(64),
      inspectNativeManifest: () => nativeManifestSha256,
      inspectNativeZipEntries: () => valid.nativeZipEntries!,
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('SOURCE_MISMATCH');
    expect(result.stderr).toContain('INPUT_APK_HASH_MISMATCH');
  });

  it('runs zipalign check with 16 KiB page alignment and holds when alignment fails', () => {
    const calls: { command: string; args: string[] }[] = [];
    const result = verifyAndroidArtifactCli('artifact.apk', {
      ANDROID_HOME: 'C:/Android/Sdk',
      STRANDCUE_ANDROID_CERT_SHA256: fingerprint,
      STRANDCUE_APKSIGNER: 'apksigner.jar',
    }, {
      runCommand: (command, args) => {
        calls.push({ command, args });
        if (args[0] === '-c') throw new Error('zipalign returned nonzero');
        if (args.includes('xmltree')) return 'android:extractNativeLibs=(type 0x12)0x0';
        if (command.includes('aapt')) return "package: name='za.co.strandcue.app' versionCode='1' versionName='0.1.0'";
        if (args.join(' ').includes('apksigner')) return `Number of signers: 1\nSigner #1 certificate SHA-256 digest: ${fingerprint}`;
        return 'lib/arm64-v8a/libreactnative.so\nlib/x86_64/libreactnative.so';
      },
      readText: () => JSON.stringify({ sourceCommit, inputApkSha256, signedApkSha256: 'b'.repeat(64) }),
      hashFile: () => 'b'.repeat(64),
      inspectNativeManifest: () => nativeManifestSha256,
      inspectNativeZipEntries: () => valid.nativeZipEntries!,
    });
    expect(calls.some(({ args }) => args.slice(0, 5).join(' ') === '-c -P 16 -v 4')).toBe(true);
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('ANDROID-ARTIFACT-HOLD:INSPECTION_FAILED');
  });

  it('holds when zipalign returns no verification marker', () => {
    const result = verifyAndroidArtifactCli('artifact.apk', {
      ANDROID_HOME: 'C:/Android/Sdk',
      STRANDCUE_ANDROID_CERT_SHA256: fingerprint,
      STRANDCUE_APKSIGNER: 'apksigner.jar',
    }, {
      runCommand: (command, args) => {
        if (args[0] === '-c') return '';
        if (command.includes('aapt')) return "package: name='za.co.strandcue.app' versionCode='1' versionName='0.1.0'";
        if (args.join(' ').includes('apksigner')) return `Number of signers: 1\nSigner #1 certificate SHA-256 digest: ${fingerprint}`;
        return 'lib/arm64-v8a/libreactnative.so\nlib/x86_64/libreactnative.so';
      },
      readText: () => JSON.stringify({ sourceCommit, inputApkSha256, signedApkSha256: 'b'.repeat(64) }),
      hashFile: () => 'b'.repeat(64),
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('ZIPALIGN_OUTPUT_MISSING');
  });

  it('holds when zipalign cannot be resolved', () => {
    const result = verifyAndroidArtifactCli('artifact.apk', {
      STRANDCUE_AAPT: 'aapt',
      STRANDCUE_APKSIGNER: 'apksigner.jar',
      STRANDCUE_JAVA: 'java',
      STRANDCUE_JAR: 'jar',
    }, {
      runCommand: () => 'unexpected tool output',
      readText: () => '',
      hashFile: () => 'b'.repeat(64),
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('TOOL_MISSING:ZIPALIGN');
  });

  it('uses the default receipt reader and APK hasher for the given path', () => {
    const directory = mkdtempSync(join(tmpdir(), 'strandcue-artifact-'));
    try {
      const apk = join(directory, 'alpha.apk');
      const receipt = `${apk}.source-receipt.json`;
      const content = Buffer.from('local test apk bytes');
      const apkSha256 = createHash('sha256').update(content).digest('hex');
      writeFileSync(apk, content);
      writeFileSync(receipt, JSON.stringify({ sourceCommit, inputApkSha256, signedApkSha256: apkSha256 }));
      const result = verifyAndroidArtifactCli(apk, {
        ANDROID_HOME: 'C:/Android/Sdk',
        STRANDCUE_ANDROID_CERT_SHA256: fingerprint,
        STRANDCUE_APKSIGNER: 'apksigner.jar',
      }, {
        runCommand: (command, args) => args.includes('xmltree') ? 'android:extractNativeLibs=(type 0x12)0x0' : args[0] === '-c'
          ? 'Verification successful.'
          : command.includes('aapt')
          ? "package: name='za.co.strandcue.app' versionCode='1' versionName='0.1.0'"
          : args.join(' ').includes('apksigner')
            ? `Number of signers: 1\nSigner #1 certificate SHA-256 digest: ${fingerprint}`
            : 'lib/arm64-v8a/libreactnative.so\nlib/x86_64/libreactnative.so',
        inspectNativeManifest: () => nativeManifestSha256,
        inspectNativeZipEntries: () => valid.nativeZipEntries!,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(`apkSha256=${apkSha256}`);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it('runs a local inspection command without exposing stderr', () => {
    expect(runAndroidInspectionCommand(process.execPath, ['-e', "process.stdout.write('tool-output')"]))
      .toBe('tool-output');
  });

  it('emits a stable hold from the executable entry point when no APK path is supplied', () => {
    expect(() => execFileSync(process.execPath, ['scripts/verify-android-artifact.ts'], { stdio: 'pipe' })).toThrow();
  });
});
