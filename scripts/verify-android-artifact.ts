import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface AndroidArtifactMetadata {
  packageName: string | null;
  versionName: string | null;
  versionCode: string | null;
  sourceCommit: string | null;
  inputApkSha256: string | null;
  abi: string[];
  signerCount: number | null;
  signerSha256: string | null;
  apkSha256: string | null;
  sourceReceiptPresent: boolean;
  parseErrors: string[];
}

export interface AndroidArtifactExpectation {
  packageName: string;
  sourceCommit: string;
  inputApkSha256: string;
  abi: string;
  versionName: string;
  signerCount: number;
  signerSha256: string;
}

export interface AndroidArtifactVerification {
  status: 'PASS' | 'HOLD';
  errors: string[];
}

export interface AndroidArtifactInspectionOutputs {
  badging: string;
  signer: string;
  archiveListing: string;
  sourceReceipt: string;
  apkSha256: string;
}

const sha256Pattern = /^[a-f\d]{64}$/i;
const commitPattern = /^[a-f\d]{40}$/i;

function normalizeSha256(value: string | null): string | null {
  if (!value) return null;
  const normalized = value.replace(/[:\s]/g, '');
  return sha256Pattern.test(normalized) ? normalized.toLowerCase() : null;
}

export function parseArtifactInspectionOutputs(
  output: AndroidArtifactInspectionOutputs,
): AndroidArtifactMetadata {
  const errors: string[] = [];
  const packageMatches = [...output.badging.matchAll(/package:\s+name='([^']+)'\s+versionCode='([^']+)'\s+versionName='([^']+)'/g)];
  const packageInfo = packageMatches.length === 1 ? packageMatches[0] : null;
  if (!packageInfo) errors.push('BADGING_PARSE');

  const declaredSignerMatches = [...output.signer.matchAll(/Number of signers:[ \t]*(\d+)/gi)];
  const declaredSignerCount = declaredSignerMatches.length === 1 ? Number(declaredSignerMatches[0][1]) : null;
  const signerMatches = [...output.signer.matchAll(/Signer[ \t]+#(\d+)[ \t]+certificate SHA-256 digest:[ \t]*([^\r\n]*)/gi)];
  const signerNumbers = signerMatches.map((match) => Number(match[1]));
  const signerCount = declaredSignerCount !== null && Number.isSafeInteger(declaredSignerCount)
    ? declaredSignerCount
    : null;
  const signerRecordsAreComplete = signerCount !== null
    && signerCount > 0
    && signerMatches.length === signerCount
    && new Set(signerNumbers).size === signerCount
    && signerNumbers.every((number, index) => number === index + 1);
  if (!signerRecordsAreComplete) errors.push('SIGNER_PARSE');
  const signerSha256 = signerRecordsAreComplete && signerCount === 1
    ? normalizeSha256(signerMatches[0][2])
    : null;
  if (signerRecordsAreComplete && signerCount === 1 && !signerSha256) errors.push('SIGNER_HASH_PARSE');

  const abi = [...new Set([...output.archiveListing.matchAll(/(?:^|\s)lib\/([^/\s]+)\/[^\s]+/gm)].map((match) => match[1]))];
  if (!abi.length) errors.push('ABI_PARSE');

  const apkSha256 = normalizeSha256(output.apkSha256);
  if (!apkSha256) errors.push('APK_HASH_PARSE');

  let sourceCommit: string | null = null;
  let inputApkSha256: string | null = null;
  let sourceReceiptPresent = false;
  try {
    const receipt: unknown = JSON.parse(output.sourceReceipt);
    if (receipt && typeof receipt === 'object' && !Array.isArray(receipt)) {
      const data = receipt as Record<string, unknown>;
      const commit = typeof data.sourceCommit === 'string' ? data.sourceCommit : '';
      const inputHash = normalizeSha256(typeof data.inputApkSha256 === 'string' ? data.inputApkSha256 : null);
      const signedHash = normalizeSha256(typeof data.signedApkSha256 === 'string' ? data.signedApkSha256 : null);
      if (commitPattern.test(commit) && inputHash && signedHash && signedHash === apkSha256) {
        sourceCommit = commit.toLowerCase();
        inputApkSha256 = inputHash;
        sourceReceiptPresent = true;
      }
    }
  } catch {
    // Malformed receipts are deliberately reduced to a stable HOLD code.
  }
  if (!sourceReceiptPresent) errors.push('SOURCE_RECEIPT_PARSE');

  return {
    packageName: packageInfo?.[1] ?? null,
    versionCode: packageInfo?.[2] ?? null,
    versionName: packageInfo?.[3] ?? null,
    sourceCommit,
    inputApkSha256,
    abi,
    signerCount,
    signerSha256,
    apkSha256,
    sourceReceiptPresent,
    parseErrors: errors,
  };
}

export function verifyAndroidArtifact(
  metadata: AndroidArtifactMetadata,
  expected: AndroidArtifactExpectation,
): AndroidArtifactVerification {
  const errors = [...metadata.parseErrors];
  if (metadata.packageName !== expected.packageName) errors.push('PACKAGE_MISMATCH');
  if (!commitPattern.test(metadata.sourceCommit ?? '') || metadata.sourceCommit !== expected.sourceCommit.toLowerCase()) {
    errors.push('SOURCE_MISMATCH');
  }
  const actualInputHash = normalizeSha256(metadata.inputApkSha256);
  const expectedInputHash = normalizeSha256(expected.inputApkSha256);
  if (!actualInputHash || !expectedInputHash || actualInputHash !== expectedInputHash) {
    errors.push('INPUT_APK_HASH_MISMATCH');
  }
  if (!metadata.abi.includes(expected.abi)) errors.push('ABI_MISMATCH');
  if (metadata.versionName !== expected.versionName) errors.push('VERSION_MISMATCH');
  if (metadata.signerCount !== expected.signerCount) errors.push('SIGNER_COUNT_MISMATCH');

  const actualFingerprint = normalizeSha256(metadata.signerSha256);
  const expectedFingerprint = normalizeSha256(expected.signerSha256);
  if (!actualFingerprint || !expectedFingerprint || actualFingerprint !== expectedFingerprint) {
    errors.push('SIGNER_FINGERPRINT_MISMATCH');
  }
  if (!normalizeSha256(metadata.apkSha256)) errors.push('APK_HASH_INVALID');
  if (!metadata.sourceReceiptPresent) errors.push('SOURCE_RECEIPT_MISSING');

  const distinctErrors = [...new Set(errors)];
  return { status: distinctErrors.length === 0 ? 'PASS' : 'HOLD', errors: distinctErrors };
}

function run(command: string, args: string[]): string {
  return execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}

export function runAndroidInspectionCommand(command: string, args: string[]): string {
  return run(command, args);
}

function requireTool(pathValue: string | undefined, fallback: string, label: string): string {
  const candidate = pathValue || fallback;
  if (!candidate) throw new Error(`TOOL_MISSING:${label}`);
  return candidate;
}

export interface AndroidArtifactCliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface AndroidArtifactCliDependencies {
  runCommand?: (command: string, args: string[]) => string;
  readText?: (path: string) => string;
  hashFile?: (path: string) => string;
}

export function verifyAndroidArtifactCli(
  apkPath: string | undefined,
  env: Partial<NodeJS.ProcessEnv> = process.env,
  dependencies: AndroidArtifactCliDependencies = {},
): AndroidArtifactCliResult {
  if (!apkPath) {
    return { exitCode: 2, stdout: '', stderr: 'ANDROID-ARTIFACT-HOLD:APK_PATH_REQUIRED\n' };
  }

  try {
    const absoluteApk = resolve(apkPath);
    const sdkRoot = env.ANDROID_HOME || env.ANDROID_SDK_ROOT
      || (env.LOCALAPPDATA ? join(env.LOCALAPPDATA, 'Android', 'Sdk') : '');
    const buildTools = env.ANDROID_BUILD_TOOLS || (sdkRoot ? join(sdkRoot, 'build-tools', '36.0.0') : '');
    const aapt = requireTool(env.STRANDCUE_AAPT, buildTools ? join(buildTools, 'aapt.exe') : '', 'AAPT');
    const apksigner = requireTool(env.STRANDCUE_APKSIGNER, buildTools ? join(buildTools, 'lib', 'apksigner.jar') : '', 'APKSIGNER');
    const zipalign = requireTool(env.STRANDCUE_ZIPALIGN, buildTools ? join(buildTools, 'zipalign.exe') : '', 'ZIPALIGN');
    const java = requireTool(env.STRANDCUE_JAVA, env.JAVA_HOME ? join(env.JAVA_HOME, 'bin', 'java.exe') : 'java.exe', 'JAVA');
    const jar = requireTool(env.STRANDCUE_JAR, env.JAVA_HOME ? join(env.JAVA_HOME, 'bin', 'jar.exe') : 'jar.exe', 'JAR');
    const receiptPath = env.STRANDCUE_ANDROID_SOURCE_RECEIPT || `${absoluteApk}.source-receipt.json`;
    const runCommand = dependencies.runCommand ?? run;
    const readText = dependencies.readText ?? ((path: string) => readFileSync(path, 'utf8'));
    const hashFile = dependencies.hashFile ?? ((path: string) => createHash('sha256').update(readFileSync(path)).digest('hex'));

    const zipalignOutput = runCommand(zipalign, ['-c', '-v', '4', absoluteApk]);
    if (!/\bVerification successful\b/i.test(zipalignOutput)) throw new Error('ZIPALIGN_OUTPUT_MISSING');
    const badging = runCommand(aapt, ['dump', 'badging', absoluteApk]);
    const signerArgs = apksigner.toLowerCase().endsWith('.jar')
      ? ['-jar', apksigner, 'verify', '--verbose', '--print-certs', absoluteApk]
      : ['verify', '--verbose', '--print-certs', absoluteApk];
    const signer = runCommand(apksigner.toLowerCase().endsWith('.jar') ? java : apksigner, signerArgs);
    const archiveListing = runCommand(jar, ['tf', absoluteApk]);
    const sourceReceipt = readText(receiptPath);
    const apkSha256 = hashFile(absoluteApk);
    const metadata = parseArtifactInspectionOutputs({ badging, signer, archiveListing, sourceReceipt, apkSha256 });
    const certificate = env.STRANDCUE_ANDROID_CERT_SHA256 || '';
    const expected: AndroidArtifactExpectation = {
      packageName: 'za.co.strandcue.app',
      sourceCommit: env.STRANDCUE_ANDROID_EXPECTED_SOURCE_COMMIT || 'd8c2818a7fac0e996910a5a33d6784875800993b',
      inputApkSha256: env.STRANDCUE_ANDROID_EXPECTED_INPUT_APK_SHA256 || '466330d1578e8019cb6e312b2653e750a550338d6c2637d5cda076555236b1ae',
      abi: 'arm64-v8a',
      versionName: '0.1.0',
      signerCount: 1,
      signerSha256: certificate,
    };
    const verification = verifyAndroidArtifact(metadata, expected);
    if (verification.status !== 'PASS') {
      return {
        exitCode: 1,
        stdout: '',
        stderr: `ANDROID-ARTIFACT-HOLD:${[...verification.errors, ...(certificate ? [] : ['EXPECTED_CERTIFICATE_MISSING'])].join(',')}\n`,
      };
    }
    return {
      exitCode: 0,
      stdout: `ANDROID-ARTIFACT-PASS package=${metadata.packageName} version=${metadata.versionName} source=${metadata.sourceCommit} abi=${metadata.abi.join(',')} signers=${metadata.signerCount} certSha256=${normalizeSha256(certificate)} apkSha256=${metadata.apkSha256}\n`,
      stderr: '',
    };
  } catch (error) {
    const code = error instanceof Error && (/^TOOL_MISSING:(?:AAPT|APKSIGNER|ZIPALIGN|JAVA|JAR)$/.test(error.message)
      || error.message === 'ZIPALIGN_OUTPUT_MISSING')
      ? error.message
      : 'INSPECTION_FAILED';
    return { exitCode: 1, stdout: '', stderr: `ANDROID-ARTIFACT-HOLD:${code}\n` };
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
const currentPath = resolve(fileURLToPath(import.meta.url));
if (invokedPath && invokedPath === currentPath) {
  const result = verifyAndroidArtifactCli(process.argv[2]);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exitCode = result.exitCode;
}
