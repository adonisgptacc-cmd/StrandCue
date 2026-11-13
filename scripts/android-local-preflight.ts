import { existsSync, realpathSync, statfsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, win32 } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const REQUIRED_SOURCE_SHA = 'd8c2818a7fac0e996910a5a33d6784875800993b';
export const APPROVED_SCRATCH_ROOT = 'C:\\scb';
export const MAX_SCRATCH_PATH_LENGTH = 40;
export const MIN_AVAILABLE_DISK_BYTES = 30 * 1024 ** 3;

export type AndroidLocalPreflightCode =
  | 'SOURCE_SHA_MISMATCH' | 'SOURCE_COMMIT_MISSING' | 'EVIDENCE_HEAD_MISSING' | 'DIRTY_TREE'
  | 'NODE_VERSION' | 'JAVA_VERSION' | 'SDK_MISSING'
  | 'SCRATCH_ROOT' | 'SCRATCH_REPARSE' | 'SCRATCH_PATH_LENGTH' | 'DISK_SPACE';

export interface AndroidLocalPreflightInput {
  readonly sourceSha: string;
  readonly sourceIsCommit: boolean;
  readonly evidenceHead: string;
  readonly cleanTree: boolean;
  readonly nodeMajor: number;
  readonly javaMajor: number;
  readonly sdkAvailable: boolean;
  readonly scratchPath: string;
  readonly scratchRealPathContained: boolean;
  readonly availableDiskBytes: number;
}

export interface AndroidLocalPreflightResult {
  readonly ok: boolean;
  readonly sourceSha: string;
  readonly evidenceHead: string;
  readonly cleanTree: boolean;
  readonly nodeMajor: number;
  readonly javaMajor: number;
  readonly sdkAvailable: boolean;
  readonly scratchPathLength: number;
  readonly scratchRealPathContained: boolean;
  readonly availableDiskBytes: number;
  readonly errorCodes: readonly AndroidLocalPreflightCode[];
}

const safeSha = (value: string): string => /^[0-9a-f]{40}$/i.test(value) ? value.toLowerCase() : '';

export function checkAndroidLocalPreflight(input: AndroidLocalPreflightInput): AndroidLocalPreflightResult {
  const sourceSha = safeSha(input.sourceSha);
  const evidenceHead = safeSha(input.evidenceHead);
  const normalizedScratch = win32.normalize(input.scratchPath);
  const underScratchRoot = win32.isAbsolute(input.scratchPath)
    && normalizedScratch.toLowerCase().startsWith(`${APPROVED_SCRATCH_ROOT.toLowerCase()}\\`);
  const errorCodes = [
    sourceSha !== REQUIRED_SOURCE_SHA ? 'SOURCE_SHA_MISMATCH' : null,
    !input.sourceIsCommit ? 'SOURCE_COMMIT_MISSING' : null,
    !evidenceHead ? 'EVIDENCE_HEAD_MISSING' : null,
    !input.cleanTree ? 'DIRTY_TREE' : null,
    input.nodeMajor !== 24 ? 'NODE_VERSION' : null,
    input.javaMajor !== 17 ? 'JAVA_VERSION' : null,
    !input.sdkAvailable ? 'SDK_MISSING' : null,
    !underScratchRoot ? 'SCRATCH_ROOT' : null,
    !input.scratchRealPathContained ? 'SCRATCH_REPARSE' : null,
    input.scratchPath.length > MAX_SCRATCH_PATH_LENGTH ? 'SCRATCH_PATH_LENGTH' : null,
    !Number.isFinite(input.availableDiskBytes) || input.availableDiskBytes < MIN_AVAILABLE_DISK_BYTES ? 'DISK_SPACE' : null,
  ].filter((code): code is AndroidLocalPreflightCode => code !== null);
  return Object.freeze({
    ok: errorCodes.length === 0,
    sourceSha,
    evidenceHead,
    cleanTree: input.cleanTree,
    nodeMajor: input.nodeMajor,
    javaMajor: input.javaMajor,
    sdkAvailable: input.sdkAvailable,
    scratchPathLength: input.scratchPath.length,
    scratchRealPathContained: input.scratchRealPathContained,
    availableDiskBytes: input.availableDiskBytes,
    errorCodes: Object.freeze(errorCodes),
  });
}

export function formatAndroidLocalPreflight(result: AndroidLocalPreflightResult): string {
  if (!result.ok) return `ANDROID-LOCAL-HOLD ${result.errorCodes.join(',')}`;
  return `ANDROID-LOCAL-PASS source=${result.sourceSha} evidenceHead=${result.evidenceHead}`
    + ` node=${result.nodeMajor} java=${result.javaMajor} sdk=present`
    + ` scratchChars=${result.scratchPathLength} diskBytes=${result.availableDiskBytes}`;
}

interface PreflightProbes {
  readonly run: (file: string, args: readonly string[]) => {
    readonly status: number | null; readonly stdout: string; readonly stderr: string;
  };
  readonly exists: (path: string) => boolean;
  readonly isFile: (path: string) => boolean;
  readonly realpath: (path: string) => string;
  readonly diskBytes: (root: string) => number;
  readonly env: {
    readonly ANDROID_HOME?: string;
    readonly ANDROID_SDK_ROOT?: string;
    readonly LOCALAPPDATA?: string;
    readonly JAVA_HOME?: string;
  };
  readonly nodeVersion: string;
}

const liveProbes: PreflightProbes = {
  run: (file, args) => {
    const result = spawnSync(file, [...args], { encoding: 'utf8', windowsHide: true, timeout: 10_000 });
    return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  },
  exists: existsSync,
  isFile: path => {
    try { return statSync(path).isFile(); } catch { return false; }
  },
  realpath: realpathSync.native,
  diskBytes: root => {
    const disk = statfsSync(root);
    return disk.bavail * disk.bsize;
  },
  env: {
    ANDROID_HOME: process.env.ANDROID_HOME,
    ANDROID_SDK_ROOT: process.env.ANDROID_SDK_ROOT,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
    JAVA_HOME: process.env.JAVA_HOME,
  },
  nodeVersion: process.version,
};

function command(file: string, args: readonly string[], probes: PreflightProbes): { readonly status: number | null; readonly output: string } {
  const result = probes.run(file, args);
  return { status: result.status, output: `${result.stdout ?? ''}\n${result.stderr ?? ''}` };
}

function sdkIsAvailable(probes: PreflightProbes): boolean {
  const sdkRoot = probes.env.ANDROID_HOME ?? probes.env.ANDROID_SDK_ROOT
    ?? win32.join(probes.env.LOCALAPPDATA ?? win32.join(homedir(), 'AppData', 'Local'), 'Android', 'Sdk');
  const requiredFiles = [
    'platforms/android-36/android.jar',
    'build-tools/36.0.0/apksigner.bat', 'build-tools/36.0.0/aapt.exe',
    'build-tools/36.0.0/zipalign.exe', 'platform-tools/adb.exe',
    'cmake/3.22.1/bin/cmake.exe', 'cmake/3.22.1/bin/ninja.exe',
  ];
  // The SDK layout checked here is Windows-only, so its paths use Windows rules on every host.
  return probes.exists(win32.join(sdkRoot, 'ndk/27.1.12297006'))
    && requiredFiles.every(path => probes.isFile(win32.join(sdkRoot, path)));
}

function scratchRealPathIsContained(scratchPath: string, probes: PreflightProbes): boolean {
  const normalized = win32.normalize(scratchPath);
  if (!win32.isAbsolute(scratchPath)
    || !normalized.toLowerCase().startsWith(`${APPROVED_SCRATCH_ROOT.toLowerCase()}\\`)
    || !probes.exists(APPROVED_SCRATCH_ROOT)) return false;
  const parts = win32.relative(APPROVED_SCRATCH_ROOT, normalized).split('\\');
  const existingPaths = [APPROVED_SCRATCH_ROOT, ...parts.map((_, index) =>
    win32.join(APPROVED_SCRATCH_ROOT, ...parts.slice(0, index + 1)),
  )].filter(path => probes.exists(path));
  return existingPaths.every(path => {
    try { return win32.normalize(probes.realpath(path)).toLowerCase() === win32.normalize(path).toLowerCase(); }
    catch { return false; }
  });
}

export function gatherAndroidLocalPreflight(scratchPath: string, probes: PreflightProbes = liveProbes): AndroidLocalPreflightInput {
  const head = command('git', ['rev-parse', 'HEAD'], probes);
  const tree = command('git', ['status', '--porcelain', '--untracked-files=normal'], probes);
  const source = command('git', ['cat-file', '-t', REQUIRED_SOURCE_SHA], probes);
  const javaFile = probes.env.JAVA_HOME ? join(probes.env.JAVA_HOME, 'bin', 'java.exe') : 'java';
  const java = command(javaFile, ['-version'], probes);
  const javaMajor = java.status === 0 ? Number(/\bversion "(\d+)/.exec(java.output)?.[1] ?? 0) : 0;
  let availableDiskBytes = 0;
  try {
    availableDiskBytes = probes.diskBytes(win32.parse(scratchPath).root);
  } catch { /* An unavailable drive is reported as DISK_SPACE. */ }
  return {
    sourceSha: REQUIRED_SOURCE_SHA,
    sourceIsCommit: source.status === 0 && source.output.trim() === 'commit',
    evidenceHead: head.status === 0 ? head.output.trim() : '',
    cleanTree: tree.status === 0 && tree.output.trim() === '',
    nodeMajor: Number(/^v(\d+)/.exec(probes.nodeVersion)?.[1] ?? 0),
    javaMajor,
    sdkAvailable: sdkIsAvailable(probes),
    scratchPath,
    scratchRealPathContained: scratchRealPathIsContained(scratchPath, probes),
    availableDiskBytes,
  };
}

export function runAndroidLocalPreflightCli(
  args: readonly string[], gather: (scratchPath: string) => AndroidLocalPreflightInput = gatherAndroidLocalPreflight,
): number {
  if (args.length !== 2 || args[0] !== '--scratch' || !args[1]) {
    process.stdout.write('ANDROID-LOCAL-HOLD CLI_ARGUMENT\n');
    return 1;
  }
  try {
    const result = checkAndroidLocalPreflight(gather(args[1]));
    process.stdout.write(`${formatAndroidLocalPreflight(result)}\n`);
    return result.ok ? 0 : 1;
  } catch {
    process.stdout.write('ANDROID-LOCAL-HOLD PROBE_FAILED\n');
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = runAndroidLocalPreflightCli(process.argv.slice(2));
}
