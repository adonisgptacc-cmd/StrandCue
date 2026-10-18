import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface AndroidArtifactMetadata {
  packageName: string | null;
  versionName: string | null;
  versionCode: string | null;
  sourceCommit: string | null;
  inputApkSha256: string | null;
  abi: string[];
  nativeManifestSha256?: string | null;
  signerCount: number | null;
  signerSha256: string | null;
  apkSha256: string | null;
  sourceReceiptPresent: boolean;
  parseErrors: string[];
}

export interface AndroidNativeLibrary {
  name: string;
  machine: string;
  needed: string[];
}

export type AndroidNativeManifest = Record<string, AndroidNativeLibrary[]>;

export interface AndroidArtifactExpectation {
  packageName: string;
  sourceCommit: string;
  inputApkSha256: string;
  abis: string[];
  nativeManifestSha256: string;
  versionName: string;
  expectedVersionCode: string;
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
  nativeManifestSha256: string | null;
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

  const declaredSignerMatches = [...output.signer.matchAll(/^Number of signers:[ \t]*(\d+)[ \t]*\r?$/gim)];
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
  const nativeManifestSha256 = normalizeSha256(output.nativeManifestSha256);
  if (!nativeManifestSha256) errors.push('NATIVE_MANIFEST_PARSE');

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
    nativeManifestSha256,
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
  if (metadata.abi.length !== expected.abis.length
    || [...metadata.abi].sort().join(',') !== [...expected.abis].sort().join(',')) errors.push('ABI_SET_MISMATCH');
  const actualManifestHash = normalizeSha256(metadata.nativeManifestSha256 ?? null);
  const expectedManifestHash = normalizeSha256(expected.nativeManifestSha256);
  if (!actualManifestHash || !expectedManifestHash || actualManifestHash !== expectedManifestHash) {
    errors.push('NATIVE_MANIFEST_MISMATCH');
  }
  if (metadata.versionName !== expected.versionName) errors.push('VERSION_MISMATCH');
  if (metadata.versionCode !== expected.expectedVersionCode) errors.push('VERSION_CODE_MISMATCH');
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

function run(command: string, args: string[], cwd?: string): string {
  return execFileSync(command, args, { encoding: 'utf8', cwd, stdio: ['ignore', 'pipe', 'ignore'] });
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
  runCommand?: (command: string, args: string[], cwd?: string) => string;
  readText?: (path: string) => string;
  hashFile?: (path: string) => string;
  inspectNativeManifest?: (apkPath: string, archiveListing: string) => string;
}

const expectedNativeAbis = ['arm64-v8a', 'x86_64'];
const expectedNativeManifestSha256 = 'c459015a3b52af685ebadf3e529f5fa952d1c89c923493d903eef545c519b6cd';
const expectedInputApkSha256 = 'd582bdf4110ce73cba386cfe16ad6cb16de97560862b35a26a9ea8b96b635b16';
const expectedCertificateSha256 = 'b930b12ee536b12f2b9c562f2baf69aca8449bc21dea95386cc46986dd551fbe';

const readElfMachinePattern = /^\s*Machine:\s*(.+?)\s*$/m;
const neededPattern = /\(NEEDED\).*?Shared library:\s*\[([^\]]+)\]/g;
const platformLibraries = new Set(['libandroid.so', 'libc.so', 'libdl.so', 'libjnigraphics.so', 'liblog.so', 'libm.so', 'libz.so']);
const expectedNativeLibraryNames = [
  'libandroidx.graphics.path.so', 'libappmodules.so', 'libc++_shared.so', 'libexpo-modules-core.so',
  'libfbjni.so', 'libgesturehandler.so', 'libgifimage.so', 'libhermestooling.so', 'libhermesvm.so',
  'libimagepipeline.so', 'libjsi.so', 'libnative-filters.so', 'libnative-imagetranscoder.so',
  'libreact_codegen_rngesturehandler_codegen.so', 'libreact_codegen_rnscreens.so',
  'libreact_codegen_safeareacontext.so', 'libreactnative.so', 'libreanimated.so', 'librnscreens.so',
  'libstatic-webp.so', 'libworklets.so', 'libzstd-kmp.so',
];

export function validateAndroidNativeManifest(manifest: AndroidNativeManifest): boolean {
  const abiNames = Object.keys(manifest).sort();
  if (abiNames.join(',') !== [...expectedNativeAbis].sort().join(',')) return false;
  for (const abi of expectedNativeAbis) {
    const libraries = manifest[abi];
    if (!Array.isArray(libraries) || libraries.length !== expectedNativeLibraryNames.length) return false;
    const names = libraries.map(({ name }) => name);
    if (new Set(names).size !== names.length
      || [...names].sort().join(',') !== [...expectedNativeLibraryNames].sort().join(',')) return false;
    const nameSet = new Set(names);
    const expectedMachine = abi === 'arm64-v8a' ? 'AArch64' : 'Advanced Micro Devices X86-64';
    if (libraries.some(({ machine, needed }) => machine !== expectedMachine
      || !Array.isArray(needed)
      || needed.some((dependency) => !nameSet.has(dependency) && !platformLibraries.has(dependency)))) return false;
  }
  return true;
}

export function inspectAndroidNativeManifest(apkPath: string, archiveListing: string, env: Partial<NodeJS.ProcessEnv>, runCommand: (command: string, args: string[], cwd?: string) => string): string {
  const entries = [...new Set([...archiveListing.matchAll(/^lib\/([^/]+)\/([^/]+\.so)$/gm)].map((match) => match[0]))].sort();
  const listedAbis = [...new Set([...archiveListing.matchAll(/^lib\/([^/]+)\/[^\r\n]+$/gm)].map((match) => match[1]))].sort();
  if (listedAbis.length !== expectedNativeAbis.length || [...listedAbis].sort().join(',') !== [...expectedNativeAbis].sort().join(',')) {
    throw new Error('ABI_SET_MISMATCH');
  }
  if (entries.length !== 44) throw new Error('NATIVE_MANIFEST_MISMATCH');
  const sdkRoot = env.ANDROID_HOME || env.ANDROID_SDK_ROOT
    || (env.LOCALAPPDATA ? join(env.LOCALAPPDATA, 'Android', 'Sdk') : '');
  const ndkRoot = env.ANDROID_NDK_HOME || env.ANDROID_NDK_ROOT
    || (sdkRoot ? join(sdkRoot, 'ndk', '27.1.12297006') : '');
  const readelf = requireTool(env.STRANDCUE_READELF, ndkRoot ? join(ndkRoot, 'toolchains', 'llvm', 'prebuilt', 'windows-x86_64', 'bin', 'llvm-readelf.exe') : '', 'READELF');
  const jar = requireTool(env.STRANDCUE_JAR, env.JAVA_HOME ? join(env.JAVA_HOME, 'bin', 'jar.exe') : 'jar.exe', 'JAR');
  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'strandcue-native-'));
  try {
    const abis: Record<string, { name: string; machine: string; needed: string[] }[]> = {};
    for (const abi of expectedNativeAbis) {
      const names = entries.filter((entry) => entry.startsWith(`lib/${abi}/`)).map((entry) => entry.split('/')[2]).sort();
      const libraries = [];
      for (const name of names) {
        const entry = `lib/${abi}/${name}`;
        runCommand(jar, ['xf', resolve(apkPath), entry], temporaryDirectory);
        const output = runCommand(readelf, ['-h', '-d', join(temporaryDirectory, 'lib', abi, name)]);
        const machine = output.match(readElfMachinePattern)?.[1] ?? '';
        const needed = [...output.matchAll(neededPattern)].map((match) => match[1]);
        if (!machine || !needed.length) throw new Error('NATIVE_MANIFEST_PARSE');
        libraries.push({ name, machine, needed });
      }
      abis[abi] = libraries;
    }
    if (!validateAndroidNativeManifest(abis)) throw new Error('NATIVE_MANIFEST_MISMATCH');
    const manifest = { abis };
    const canonical = `${JSON.stringify(manifest, null, 2).replace(/\n/g, '\r\n')}\r\n`;
    return createHash('sha256').update(canonical).digest('hex');
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
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
    const nativeManifestHash = dependencies.inspectNativeManifest
      ? dependencies.inspectNativeManifest(absoluteApk, archiveListing)
      : inspectAndroidNativeManifest(absoluteApk, archiveListing, env, runCommand);
    const sourceReceipt = readText(receiptPath);
    const apkSha256 = hashFile(absoluteApk);
    const metadata = parseArtifactInspectionOutputs({ badging, signer, archiveListing, nativeManifestSha256: nativeManifestHash, sourceReceipt, apkSha256 });
    const expected: AndroidArtifactExpectation = {
      packageName: 'za.co.strandcue.app',
      sourceCommit: 'd8c2818a7fac0e996910a5a33d6784875800993b',
      inputApkSha256: expectedInputApkSha256,
      abis: expectedNativeAbis,
      nativeManifestSha256: expectedNativeManifestSha256,
      versionName: '0.1.0',
      expectedVersionCode: '1',
      signerCount: 1,
      signerSha256: expectedCertificateSha256,
    };
    const verification = verifyAndroidArtifact({ ...metadata, nativeManifestSha256: nativeManifestHash }, expected);
    if (verification.status !== 'PASS') {
      return {
        exitCode: 1,
        stdout: '',
        stderr: `ANDROID-ARTIFACT-HOLD:${verification.errors.join(',')}\n`,
      };
    }
    return {
      exitCode: 0,
      stdout: `ANDROID-ARTIFACT-PASS package=${metadata.packageName} version=${metadata.versionName} source=${metadata.sourceCommit} abi=${metadata.abi.join(',')} signers=${metadata.signerCount} certSha256=${expectedCertificateSha256} nativeManifestSha256=${nativeManifestHash} apkSha256=${metadata.apkSha256}\n`,
      stderr: '',
    };
  } catch (error) {
    const code = error instanceof Error && (/^TOOL_MISSING:(?:AAPT|APKSIGNER|ZIPALIGN|JAVA|JAR|READELF)$/.test(error.message)
      || ['ZIPALIGN_OUTPUT_MISSING', 'ABI_SET_MISMATCH', 'NATIVE_MANIFEST_MISMATCH', 'NATIVE_MANIFEST_PARSE'].includes(error.message))
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
