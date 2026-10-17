import { afterEach, describe, expect, it, vi } from 'vitest';

const cleanReport = JSON.stringify({ auditReportVersion: 2, vulnerabilities: {} });

type Scenario = {
  config?: unknown;
  metadata?: 'directory' | 'symlink' | 'missing' | 'denied';
  target?: string;
  symlinkEntry?: boolean;
  missingCandidate?: boolean;
  npmPath?: string;
  auditOutput?: unknown;
  auditError?: number;
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.doUnmock('node:fs/promises');
  vi.doUnmock('node:child_process');
  vi.resetModules();
});

// Only I/O boundaries are replaced. Manifest inventory, surface classification,
// exception scoping and policy evaluation all execute their real implementations.
async function runGate(scenario: Scenario = {}) {
  const fs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');
  vi.doMock('node:fs/promises', () => ({
    ...fs,
    lstat: async (path: URL) => {
      if (path.pathname.endsWith(scenario.target ?? '/apps/mobile/app.json')) {
        if (scenario.metadata === 'missing' || scenario.metadata === 'denied') {
          throw Object.assign(new Error('fixture I/O failure'), {
            code: scenario.metadata === 'missing' ? 'ENOENT' : 'EACCES',
          });
        }
        if (scenario.metadata) return {
          isFile: () => scenario.metadata !== 'directory',
          isSymbolicLink: () => scenario.metadata === 'symlink',
        };
      }
      if (scenario.missingCandidate && path.pathname.endsWith('/packages/no-manifest/package.json')) {
        throw Object.assign(new Error('absent optional manifest'), { code: 'ENOENT' });
      }
      return fs.lstat(path);
    },
    readFile: async (path: URL, encoding: 'utf8') => {
      if ('config' in scenario && path.pathname.endsWith('/apps/mobile/app.json')) {
        return JSON.stringify(scenario.config);
      }
      return fs.readFile(path, encoding);
    },
    readdir: async (path: URL, options: { withFileTypes: true }) => {
      const entries = await fs.readdir(path, options);
      if (!path.pathname.endsWith('/packages/')) return entries;
      return [...entries, {
        name: 'no-manifest',
        isDirectory: () => Boolean(scenario.missingCandidate),
        isSymbolicLink: () => Boolean(scenario.symlinkEntry),
      }];
    },
  }));
  vi.doMock('node:child_process', () => ({
    execFile: (
      _executable: string,
      _args: string[],
      _options: unknown,
      callback: (error: { code: number } | null, stdout: unknown) => void,
    ) => callback(
      scenario.auditError ? { code: scenario.auditError } : null,
      'auditOutput' in scenario ? scenario.auditOutput : cleanReport,
    ),
  }));
  vi.stubEnv('npm_execpath', scenario.npmPath ?? 'fixture-npm');
  const stdout: string[] = [];
  const stderr: string[] = [];
  vi.spyOn(process.stdout, 'write').mockImplementation(chunk => { stdout.push(String(chunk)); return true; });
  vi.spyOn(process.stderr, 'write').mockImplementation(chunk => { stderr.push(String(chunk)); return true; });
  const previousExitCode = process.exitCode;
  try {
    vi.resetModules();
    await import('../../scripts/audit-dependencies-cli.ts');
    return { exitCode: process.exitCode, stdout: stdout.join(''), stderr: stderr.join('') };
  } finally {
    process.exitCode = previousExitCode;
  }
}

describe('dependency audit CLI boundary handling', () => {
  it('reports zero reviewed worker advisories when only the root has stale exceptions', async () => {
    const result = await runGate({ missingCandidate: true });
    expect(result.exitCode).toBe(1);
    const hold = JSON.parse(result.stdout);
    expect(hold.status).toBe('DEPENDENCY-POLICY-HOLD');
    expect(hold.trees[0].findingCodes).toContain('EXCEPTION-STALE');
    expect(hold.trees[0].summary.reviewedAdvisories).toBeGreaterThan(0);
    expect(hold.trees[1]).toMatchObject({
      id: 'workers/account-deletion/package.json',
      status: 'PASS',
      findingCount: 0,
      summary: { critical: 0, high: 0, moderate: 0, reviewedAdvisories: 0 },
    });
    expect(result.stderr).toBe('');
  });

  it.each([
    null, {}, { expo: null }, { expo: {} },
    { expo: { platforms: 'android' } }, { expo: { platforms: [] } },
    { expo: { platforms: ['ios'] } }, { expo: { platforms: ['android', 'android'] } },
  ])('fails closed for malformed runtime configuration %j', async config => {
    const result = await runGate({ config });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('DEPENDENCY-POLICY-ERROR');
  });

  it.each<Scenario>([
    { metadata: 'directory' }, { metadata: 'symlink' }, { metadata: 'missing' },
    { metadata: 'denied', target: '/packages/domain/package.json' },
    { metadata: 'missing', target: '/workers/account-deletion/package.json' },
    { symlinkEntry: true }, { npmPath: '   ' },
    { auditOutput: '' }, { auditOutput: undefined }, { auditOutput: 'invalid json' },
    { auditOutput: '{}' }, { auditError: 1 }, { auditError: 2 },
  ])('fails closed at an unsafe or unavailable I/O boundary %j', async scenario => {
    const result = await runGate(scenario);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('DEPENDENCY-POLICY-ERROR Dependency audit could not be executed or parsed.\n');
  });
});
