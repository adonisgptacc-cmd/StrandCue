import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseArtifactInspectionOutputs,
  runAndroidInspectionCommand,
  verifyAndroidArtifactCli,
  verifyAndroidArtifact,
  type AndroidArtifactMetadata,
  type AndroidArtifactExpectation,
} from '../../scripts/verify-android-artifact.ts';

const fingerprint = 'A'.repeat(64);
const sourceCommit = 'd8c2818a7fac0e996910a5a33d6784875800993b';
const inputApkSha256 = '466330d1578e8019cb6e312b2653e750a550338d6c2637d5cda076555236b1ae';

const expected: AndroidArtifactExpectation = {
  packageName: 'za.co.strandcue.app',
  sourceCommit,
  inputApkSha256,
  abi: 'arm64-v8a',
  versionName: '0.1.0',
  signerCount: 1,
  signerSha256: fingerprint,
};

const valid: AndroidArtifactMetadata = {
  packageName: 'za.co.strandcue.app',
  versionName: '0.1.0',
  versionCode: '1',
  sourceCommit,
  inputApkSha256,
  abi: ['arm64-v8a'],
  signerCount: 1,
  signerSha256: fingerprint,
  apkSha256: 'b'.repeat(64),
  sourceReceiptPresent: true,
  parseErrors: [],
};

describe('verifyAndroidArtifact', () => {
  it('passes metadata matching the expected local alpha identity', () => {
    expect(verifyAndroidArtifact(valid, expected)).toEqual({ status: 'PASS', errors: [] });
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

  it('holds when the version is wrong', () => {
    expect(verifyAndroidArtifact({ ...valid, versionName: '0.2.0' }, expected).status).toBe('HOLD');
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
      archiveListing: 'lib/arm64-v8a/libstrandcue.so',
      sourceReceipt: JSON.stringify({ sourceCommit, inputApkSha256, signedApkSha256: 'b'.repeat(64) }),
      apkSha256: 'b'.repeat(64),
    });
    expect(parsed.parseErrors).toContain('SIGNER_PARSE');
    expect(verifyAndroidArtifact(parsed, expected).status).toBe('HOLD');
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
      archiveListing: 'lib/arm64-v8a/libstrandcue.so',
      sourceReceipt: JSON.stringify({ sourceCommit, inputApkSha256, signedApkSha256: apkSha256 }),
      apkSha256,
    });
    expect(parsed.sourceReceiptPresent).toBe(true);
    expect(verifyAndroidArtifact(parsed, expected)).toEqual({ status: 'PASS', errors: [] });
  });

  it('holds when the source receipt names a different input APK hash', () => {
    expect(verifyAndroidArtifact({ ...valid, inputApkSha256: 'c'.repeat(64) }, expected).status).toBe('HOLD');
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

  it('requires an APK path and a configured public certificate fingerprint', () => {
    expect(verifyAndroidArtifactCli(undefined).exitCode).toBe(2);
    const result = verifyAndroidArtifactCli('artifact.apk', { LOCALAPPDATA: 'C:/Android' }, {
      runCommand: (command, args) => args[0] === '-c'
        ? 'Verification successful.'
        : command.includes('aapt')
        ? "package: name='za.co.strandcue.app' versionCode='1' versionName='0.1.0'"
        : args.join(' ').includes('apksigner')
          ? `Number of signers: 1\nSigner #1 certificate SHA-256 digest: ${fingerprint}`
          : 'lib/arm64-v8a/libstrandcue.so',
      readText: () => JSON.stringify({ sourceCommit, inputApkSha256, signedApkSha256: 'b'.repeat(64) }),
      hashFile: () => 'b'.repeat(64),
    });
    expect(result.exitCode).toBe(1);
    expect(result.stderr).toContain('EXPECTED_CERTIFICATE_MISSING');
  });

  it('prints a pass receipt from the CLI when all inspected facts match', () => {
    const result = verifyAndroidArtifactCli('artifact.apk', {
      ANDROID_HOME: 'C:/Android/Sdk',
      STRANDCUE_ANDROID_CERT_SHA256: fingerprint,
      STRANDCUE_APKSIGNER: 'apksigner.jar',
    }, {
      runCommand: (command, args) => args[0] === '-c'
        ? 'Verification successful.'
        : command.includes('aapt')
        ? "package: name='za.co.strandcue.app' versionCode='1' versionName='0.1.0'"
        : args.join(' ').includes('apksigner')
          ? `Number of signers: 1\nSigner #1 certificate SHA-256 digest: ${fingerprint}`
          : 'lib/arm64-v8a/libstrandcue.so',
      readText: () => JSON.stringify({ sourceCommit, inputApkSha256, signedApkSha256: 'b'.repeat(64) }),
      hashFile: () => 'b'.repeat(64),
    });
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('ANDROID-ARTIFACT-PASS');
  });

  it('runs zipalign check with -c -v 4 and holds when alignment fails', () => {
    const calls: { command: string; args: string[] }[] = [];
    const result = verifyAndroidArtifactCli('artifact.apk', {
      ANDROID_HOME: 'C:/Android/Sdk',
      STRANDCUE_ANDROID_CERT_SHA256: fingerprint,
      STRANDCUE_APKSIGNER: 'apksigner.jar',
    }, {
      runCommand: (command, args) => {
        calls.push({ command, args });
        if (args[0] === '-c') throw new Error('zipalign returned nonzero');
        if (command.includes('aapt')) return "package: name='za.co.strandcue.app' versionCode='1' versionName='0.1.0'";
        if (args.join(' ').includes('apksigner')) return `Number of signers: 1\nSigner #1 certificate SHA-256 digest: ${fingerprint}`;
        return 'lib/arm64-v8a/libstrandcue.so';
      },
      readText: () => JSON.stringify({ sourceCommit, inputApkSha256, signedApkSha256: 'b'.repeat(64) }),
      hashFile: () => 'b'.repeat(64),
    });
    expect(calls.some(({ args }) => args.slice(0, 3).join(' ') === '-c -v 4')).toBe(true);
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
        return 'lib/arm64-v8a/libstrandcue.so';
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
        runCommand: (command, args) => args[0] === '-c'
          ? 'Verification successful.'
          : command.includes('aapt')
          ? "package: name='za.co.strandcue.app' versionCode='1' versionName='0.1.0'"
          : args.join(' ').includes('apksigner')
            ? `Number of signers: 1\nSigner #1 certificate SHA-256 digest: ${fingerprint}`
            : 'lib/arm64-v8a/libstrandcue.so',
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
});
