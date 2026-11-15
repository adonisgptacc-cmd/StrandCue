import { describe, expect, it, vi } from 'vitest';
import config from '../../vitest.config';
import {
  checkAndroidLocalPreflight,
  formatAndroidLocalPreflight,
  gatherAndroidLocalPreflight,
  REQUIRED_SOURCE_SHA,
  runAndroidLocalPreflightCli,
} from '../../scripts/android-local-preflight';

const ready = () => ({
  sourceSha: REQUIRED_SOURCE_SHA,
  sourceIsCommit: true,
  evidenceHead: '7396719c5cdabdcdd238f226275650015a56b59d',
  cleanTree: true,
  nodeMajor: 24,
  javaMajor: 17,
  sdkAvailable: true,
  scratchPath: 'C:\\scb\\build-d8c2818',
  scratchRealPathContained: true,
  availableDiskBytes: 80 * 1024 ** 3,
} as const);

describe('Android local build preflight', () => {
  it('is included in the standard per-file 80% coverage gate', () => {
    const path = 'scripts/android-local-preflight.ts';
    const coverage = config.test?.coverage;
    expect(coverage?.include).toContain(path);
    const thresholds = coverage?.thresholds as Record<string, unknown>;
    expect(thresholds[path]).toMatchObject({ statements: 80, branches: 80, functions: 80, lines: 80, perFile: true });
  });

  it('accepts the exact pinned source independently of the evidence HEAD', () => {
    const result = checkAndroidLocalPreflight(ready());
    expect(result.ok).toBe(true);
    expect(result.errorCodes).toEqual([]);
    expect(result.sourceSha).toBe(REQUIRED_SOURCE_SHA);
    expect(result.evidenceHead).toBe(ready().evidenceHead);
    expect(result.scratchPathLength).toBe(ready().scratchPath.length);
    expect(formatAndroidLocalPreflight(result)).toContain('ANDROID-LOCAL-PASS');
  });

  it.each([
    [{ sourceSha: '0'.repeat(40) }, 'SOURCE_SHA_MISMATCH'],
    [{ sourceIsCommit: false }, 'SOURCE_COMMIT_MISSING'],
    [{ evidenceHead: '' }, 'EVIDENCE_HEAD_MISSING'],
    [{ cleanTree: false }, 'DIRTY_TREE'],
    [{ nodeMajor: 25 }, 'NODE_VERSION'],
    [{ javaMajor: 21 }, 'JAVA_VERSION'],
    [{ sdkAvailable: false }, 'SDK_MISSING'],
    [{ scratchPath: 'C:\\elsewhere\\build' }, 'SCRATCH_ROOT'],
    [{ scratchPath: 'C:\\scb\\..\\outside' }, 'SCRATCH_ROOT'],
    [{ scratchPath: `C:\\scb\\${'a'.repeat(35)}` }, 'SCRATCH_PATH_LENGTH'],
    [{ availableDiskBytes: 10 * 1024 ** 3 }, 'DISK_SPACE'],
  ] as const)('reports %s with stable code %s', (change, code) => {
    const result = checkAndroidLocalPreflight({ ...ready(), ...change });
    expect(result.ok).toBe(false);
    expect(result.errorCodes).toContain(code);
    expect(formatAndroidLocalPreflight(result)).toContain(code);
  });

  it('reports only codes and safe facts when supplied fields contain secrets', () => {
    const sentinel = 'TEST_SECRET_SENTINEL_DO_NOT_PRINT';
    const result = checkAndroidLocalPreflight({
      ...ready(), sourceSha: sentinel, evidenceHead: sentinel, scratchPath: `C:\\scb\\${sentinel}${'x'.repeat(20)}`,
    });
    const output = formatAndroidLocalPreflight(result);
    expect(output).toMatch(/^ANDROID-LOCAL-HOLD /);
    expect(output).not.toContain(sentinel);
    expect(output).toContain('SOURCE_SHA_MISMATCH');
    expect(output).toContain('SCRATCH_PATH_LENGTH');
  });

  it('does not mutate the input and returns immutable result data', () => {
    const input = Object.freeze({ ...ready() });
    const result = checkAndroidLocalPreflight(input);
    expect(input).toEqual(ready());
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.errorCodes)).toBe(true);
  });

  it('gathers only the required safe facts from named probes', () => {
    const calls: string[] = [];
    const facts = gatherAndroidLocalPreflight(ready().scratchPath, {
      run: (file, args) => {
        calls.push(`${file} ${args.join(' ')}`);
        if (args[0] === 'rev-parse') return { status: 0, stdout: ready().evidenceHead, stderr: '' };
        if (args[0] === 'status') return { status: 0, stdout: '', stderr: '' };
        if (args[0] === 'cat-file') return { status: 0, stdout: 'commit', stderr: '' };
        return { status: 0, stdout: '', stderr: 'openjdk version "17.0.20"' };
      },
      exists: () => true,
      isFile: () => true,
      realpath: path => path,
      diskBytes: () => ready().availableDiskBytes,
      env: { ANDROID_HOME: 'C:\\AndroidSdk', JAVA_HOME: 'C:\\Java17' },
      nodeVersion: 'v24.19.0',
    });
    expect(facts).toEqual(ready());
    expect(calls).toHaveLength(4);
    expect(calls[2]).toContain(REQUIRED_SOURCE_SHA);
    expect(calls[3]).toContain('java.exe');
  });

  it('fails closed when command, SDK or disk probes fail', () => {
    const facts = gatherAndroidLocalPreflight(ready().scratchPath, {
      run: () => ({ status: 1, stdout: '', stderr: 'TEST_SECRET_SENTINEL_DO_NOT_PRINT' }),
      exists: () => false,
      isFile: () => false,
      realpath: path => path,
      diskBytes: () => { throw new Error('unavailable'); },
      env: { ANDROID_SDK_ROOT: 'C:\\AndroidSdk', LOCALAPPDATA: 'C:\\Local' },
      nodeVersion: 'unknown',
    });
    const output = formatAndroidLocalPreflight(checkAndroidLocalPreflight(facts));
    expect(output).toContain('ANDROID-LOCAL-HOLD');
    expect(output).toContain('SOURCE_COMMIT_MISSING');
    expect(output).toContain('DIRTY_TREE');
    expect(output).toContain('DISK_SPACE');
    expect(output).not.toContain('TEST_SECRET_SENTINEL_DO_NOT_PRINT');
  });

  it('rejects Java when the process exits unsuccessfully despite printing version 17', () => {
    const facts = gatherAndroidLocalPreflight(ready().scratchPath, {
      run: (_file, args) => {
        if (args[0] === '-version') return { status: 1, stdout: '', stderr: 'openjdk version "17.0.20"' };
        if (args[0] === 'rev-parse') return { status: 0, stdout: ready().evidenceHead, stderr: '' };
        if (args[0] === 'cat-file') return { status: 0, stdout: 'commit', stderr: '' };
        return { status: 0, stdout: '', stderr: '' };
      },
      exists: () => true,
      isFile: () => true,
      realpath: path => path,
      diskBytes: () => ready().availableDiskBytes,
      env: { ANDROID_HOME: 'C:\\AndroidSdk' },
      nodeVersion: 'v24.19.0',
    });
    expect(checkAndroidLocalPreflight(facts).errorCodes).toContain('JAVA_VERSION');
  });

  it.each(['platforms\\android-36\\android.jar', 'build-tools\\36.0.0\\aapt.exe', 'build-tools\\36.0.0\\zipalign.exe'])(
    'rejects an SDK missing %s', missing => {
      const facts = gatherAndroidLocalPreflight(ready().scratchPath, {
        run: (_file, args) => {
          if (args[0] === '-version') return { status: 0, stdout: '', stderr: 'openjdk version "17.0.20"' };
          if (args[0] === 'rev-parse') return { status: 0, stdout: ready().evidenceHead, stderr: '' };
          if (args[0] === 'cat-file') return { status: 0, stdout: 'commit', stderr: '' };
          return { status: 0, stdout: '', stderr: '' };
        },
        exists: () => true,
        isFile: path => !path.endsWith(missing),
        realpath: path => path,
        diskBytes: () => ready().availableDiskBytes,
        env: { ANDROID_HOME: 'C:\\AndroidSdk' },
        nodeVersion: 'v24.19.0',
      });
      expect(checkAndroidLocalPreflight(facts).errorCodes).toContain('SDK_MISSING');
    },
  );

  it('rejects an in-root scratch path resolved through a reparse point', () => {
    expect(checkAndroidLocalPreflight({ ...ready(), scratchRealPathContained: false }).errorCodes).toContain('SCRATCH_REPARSE');
  });

  it('marks a scratch path unsafe when its existing root resolves elsewhere', () => {
    const facts = gatherAndroidLocalPreflight(ready().scratchPath, {
      run: (_file, args) => {
        if (args[0] === '-version') return { status: 0, stdout: '', stderr: 'openjdk version "17.0.20"' };
        if (args[0] === 'rev-parse') return { status: 0, stdout: ready().evidenceHead, stderr: '' };
        if (args[0] === 'cat-file') return { status: 0, stdout: 'commit', stderr: '' };
        return { status: 0, stdout: '', stderr: '' };
      },
      exists: () => true,
      isFile: () => true,
      realpath: path => path === 'C:\\scb' ? 'D:\\elsewhere' : path,
      diskBytes: () => ready().availableDiskBytes,
      env: { ANDROID_HOME: 'C:\\AndroidSdk' },
      nodeVersion: 'v24.19.0',
    });
    expect(checkAndroidLocalPreflight(facts).errorCodes).toContain('SCRATCH_REPARSE');
  });

  it('CLI prints one safe line and returns nonzero for bad arguments or HOLD', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      expect(runAndroidLocalPreflightCli([])).toBe(1);
      expect(write).toHaveBeenLastCalledWith('ANDROID-LOCAL-HOLD CLI_ARGUMENT\n');
      expect(runAndroidLocalPreflightCli(['--scratch', ready().scratchPath], () => ({ ...ready(), cleanTree: false }))).toBe(1);
      expect(write).toHaveBeenLastCalledWith('ANDROID-LOCAL-HOLD DIRTY_TREE\n');
      expect(runAndroidLocalPreflightCli(['--scratch', ready().scratchPath], ready)).toBe(0);
      expect(write).toHaveBeenLastCalledWith(expect.stringContaining('ANDROID-LOCAL-PASS'));
      expect(runAndroidLocalPreflightCli(['--scratch', ready().scratchPath], () => { throw new Error('TEST_SECRET_SENTINEL_DO_NOT_PRINT'); })).toBe(1);
      expect(write).toHaveBeenLastCalledWith('ANDROID-LOCAL-HOLD PROBE_FAILED\n');
    } finally {
      write.mockRestore();
    }
  });

  it('uses the real local probes without exposing command output', () => {
    const facts = gatherAndroidLocalPreflight(ready().scratchPath);
    expect(facts.sourceSha).toBe(REQUIRED_SOURCE_SHA);
    expect(facts.evidenceHead).toMatch(/^[0-9a-f]{40}$/);
    // The approved scratch drive exists only on a Windows host; elsewhere the probe reports no space.
    if (process.platform === 'win32') expect(facts.availableDiskBytes).toBeGreaterThan(0);
    else expect(facts.availableDiskBytes).toBe(0);
    expect(formatAndroidLocalPreflight(checkAndroidLocalPreflight(facts))).toMatch(/^ANDROID-LOCAL-(PASS|HOLD) /);
  });
});
