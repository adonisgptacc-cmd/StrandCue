import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { auditDependencyPolicy } from '../../scripts/dependency-policy';

const TODAY = '2026-09-13';
const ADVISORY_ID = 'GHSA-vcc3-ghjq-m6fr';
const ADVISORY_URL = `https://github.com/advisories/${ADVISORY_ID}`;
const UUID_ADVISORY_ID = 'GHSA-w5hq-g745-h8pq';
const UUID_ADVISORY_URL = `https://github.com/advisories/${UUID_ADVISORY_ID}`;
type AuditSeverity = 'info' | 'low' | 'moderate' | 'high' | 'critical';

type AdvisoryFixture = {
  source: number;
  name: string;
  dependency: string;
  title: string;
  url: string;
  severity: AuditSeverity;
  cwe: string[];
  cvss: { score: number; vectorString: string };
  range: string;
};

function approvedBranch(
  path: string[],
  surfaces: ('android' | 'web' | 'development' | 'production')[],
) {
  return { path, surfaces };
}

function auditReport(severity: 'moderate' | 'high' | 'critical' = 'moderate') {
  const advisory: AdvisoryFixture = {
    source: 1,
    name: 'decode-uri-component',
    dependency: 'decode-uri-component',
    title: 'Improper input validation',
    url: ADVISORY_URL,
    severity,
    cwe: ['CWE-20'],
    cvss: { score: 5.3, vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L' },
    range: '<0.2.2',
  };
  return {
    auditReportVersion: 2,
    vulnerabilities: {
      'decode-uri-component': {
        name: 'decode-uri-component',
        severity,
        via: [advisory],
        effects: ['query-string'],
        range: '<0.2.2',
        nodes: ['node_modules/decode-uri-component'],
        fixAvailable: false,
      },
    },
  };
}

function currentException(overrides: Record<string, unknown> = {}) {
  return {
    advisoryId: ADVISORY_ID,
    packages: [
      approvedBranch(
        ['decode-uri-component'],
        ['production', 'android'],
      ),
    ],
    severity: 'moderate',
    reachable: 'uncertain',
    assessment: 'Route parsing can process attacker-controlled callback input.',
    mitigation: 'Strict callback and route allowlists reduce, but do not eliminate, exposure.',
    owner: 'StrandCue maintainer',
    approvedOn: '2026-09-13',
    reviewOn: '2026-09-27',
    expiresOn: '2026-10-13',
    upgradePath: 'Upgrade query-string or expo-router when a compatible fix is available.',
    ...overrides,
  };
}

function uuidException(overrides: Record<string, unknown> = {}) {
  return currentException({
    advisoryId: UUID_ADVISORY_ID,
    packages: [
      approvedBranch(['uuid'], ['development']),
      approvedBranch(['xcode', 'uuid'], ['development']),
    ],
    reachable: 'no',
    assessment: 'The affected UUID use is limited to reviewed Xcode tooling branches.',
    mitigation: 'The iOS tooling branch is outside the Android-only release runtime.',
    upgradePath: 'Upgrade Expo Xcode tooling to a compatible fixed UUID release.',
    ...overrides,
  });
}

function uuidAuditReport(options: { includeAndroid: boolean; includeXcode: boolean }) {
  const vulnerabilities: Record<string, {
    name: string;
    severity: 'moderate';
    via: (string | {
      name: string;
      severity: 'moderate';
      url: string;
    })[];
  }> = {
    uuid: {
      name: 'uuid',
      severity: 'moderate',
      via: [{
        name: 'uuid',
        severity: 'moderate',
        url: UUID_ADVISORY_URL,
      }],
    },
  };

  if (options.includeXcode) {
    vulnerabilities.xcode = {
      name: 'xcode',
      severity: 'moderate',
      via: ['uuid'],
    };
  }
  if (options.includeAndroid) {
    vulnerabilities['android-runtime'] = {
      name: 'android-runtime',
      severity: 'moderate',
      via: ['uuid'],
    };
  }

  return { auditReportVersion: 2, vulnerabilities };
}

describe('dependency advisory policy', () => {
  it.each(['high', 'critical'] as const)(
    'fails every %s advisory even when an exception exists',
    severity => {
      const findings = auditDependencyPolicy(
        auditReport(severity),
        [currentException()],
        TODAY,
      );

      expect(findings.map(({ code }) => code)).toContain('ADVISORY-SEVERITY');
    },
  );

  it('fails a moderate advisory without a matching GHSA exception', () => {
    const findings = auditDependencyPolicy(auditReport(), [], TODAY);

    expect(findings).toContainEqual(expect.objectContaining({
      code: 'ADVISORY-UNEXCEPTED',
      message: expect.stringContaining(ADVISORY_ID),
    }));
  });

  it.each([
    ['malformed', { advisoryId: 'not-a-ghsa' }, 'EXCEPTION-SCHEMA'],
    ['future-approved', { approvedOn: '2026-09-14' }, 'EXCEPTION-DATE'],
    ['expired', { expiresOn: '2026-09-12' }, 'EXCEPTION-DATE'],
    ['review-before-approval', { reviewOn: '2026-09-12' }, 'EXCEPTION-DATE'],
    ['review-after-expiry', { reviewOn: '2026-10-14' }, 'EXCEPTION-DATE'],
    ['incomplete', { mitigation: '' }, 'EXCEPTION-SCHEMA'],
    ['missing branch path', { packages: [{ path: [], surfaces: ['development'] }] }, 'EXCEPTION-SCHEMA'],
    ['missing branch surface', { packages: [{ path: ['uuid'], surfaces: [] }] }, 'EXCEPTION-SCHEMA'],
  ])('fails %s exceptions', (_caseName, override, expectedCode) => {
    const findings = auditDependencyPolicy(
      auditReport(),
      [currentException(override)],
      TODAY,
    );

    expect(findings.map(({ code }) => code)).toContain(expectedCode);
  });

  it('passes a current complete exception for an observed moderate advisory', () => {
    expect(auditDependencyPolicy(
      auditReport(),
      [currentException()],
      TODAY,
    )).toEqual([]);
  });

  it('allows an exception on its review date', () => {
    expect(auditDependencyPolicy(
      auditReport(),
      [currentException()],
      '2026-09-27',
    )).toEqual([]);
  });

  it('requires deliberate renewal on the day after reviewOn', () => {
    expect(auditDependencyPolicy(
      auditReport(),
      [currentException()],
      '2026-09-28',
    )).toContainEqual({
      code: 'EXCEPTION-REVIEW-DUE',
      message: `Exception review is due: ${ADVISORY_ID}.`,
    });
  });

  it('retains the separate expiry gate after expiresOn', () => {
    expect(auditDependencyPolicy(
      auditReport(),
      [currentException()],
      '2026-10-14',
    )).toContainEqual({
      code: 'EXCEPTION-DATE',
      message: `Exception dates are invalid or not current: ${ADVISORY_ID}.`,
    });
  });

  it('rejects a moderate vulnerability graph with no concrete GHSA advisory', () => {
    const report = {
      auditReportVersion: 2,
      vulnerabilities: {
        'decode-uri-component': {
          name: 'decode-uri-component',
          severity: 'moderate',
          via: ['query-string'],
        },
      },
    };

    expect(auditDependencyPolicy(report, [], TODAY)).toContainEqual(
      expect.objectContaining({ code: 'ADVISORY-UNIDENTIFIED' }),
    );
  });

  it('rejects a moderate node with one covered advisory branch and one dangling branch', () => {
    const coveredAdvisory = auditReport().vulnerabilities['decode-uri-component'].via[0];
    const report = {
      auditReportVersion: 2,
      vulnerabilities: {
        'mixed-root': {
          name: 'mixed-root',
          severity: 'moderate',
          via: [coveredAdvisory, 'missing-source'],
        },
      },
    };

    expect(auditDependencyPolicy(report, [currentException()], TODAY)).toContainEqual(
      expect.objectContaining({
        code: 'ADVISORY-UNIDENTIFIED',
        message: expect.stringContaining('mixed-root'),
      }),
    );
  });

  it('rejects a moderate node with one covered advisory branch and one cyclic branch', () => {
    const coveredAdvisory = auditReport().vulnerabilities['decode-uri-component'].via[0];
    const report = {
      auditReportVersion: 2,
      vulnerabilities: {
        'mixed-root': {
          name: 'mixed-root',
          severity: 'moderate',
          via: [coveredAdvisory, 'cycle-a'],
        },
        'cycle-a': {
          name: 'cycle-a',
          severity: 'moderate',
          via: ['cycle-b'],
        },
        'cycle-b': {
          name: 'cycle-b',
          severity: 'moderate',
          via: ['cycle-a'],
        },
      },
    };

    expect(auditDependencyPolicy(report, [currentException()], TODAY)).toContainEqual(
      expect.objectContaining({
        code: 'ADVISORY-UNIDENTIFIED',
        message: expect.stringContaining('mixed-root'),
      }),
    );
  });

  it('rejects duplicate exception identities instead of silently choosing one', () => {
    expect(auditDependencyPolicy(
      auditReport(),
      [currentException(), currentException({ owner: 'Another owner' })],
      TODAY,
    )).toContainEqual(expect.objectContaining({ code: 'EXCEPTION-DUPLICATE' }));
  });

  it('fails a high vulnerability node even when its advisory severity is contradictory', () => {
    const report = auditReport('high');
    report.vulnerabilities['decode-uri-component'].via[0] = {
      ...report.vulnerabilities['decode-uri-component'].via[0],
      severity: 'moderate',
    };

    expect(auditDependencyPolicy(report, [currentException()], TODAY)).toContainEqual(
      expect.objectContaining({ code: 'ADVISORY-SEVERITY' }),
    );
  });

  it('rejects a moderate vulnerability node that resolves only to a low advisory', () => {
    const report = auditReport();
    report.vulnerabilities['decode-uri-component'].via[0] = {
      ...report.vulnerabilities['decode-uri-component'].via[0],
      severity: 'low',
    };

    expect(auditDependencyPolicy(report, [], TODAY)).toContainEqual({
      code: 'ADVISORY-RESOLUTION-SEVERITY',
      message: 'Moderate vulnerability must resolve to a moderate-or-higher concrete GHSA advisory.',
    });
  });

  it('accepts a moderate node when at least one moderate advisory is excepted alongside a low advisory', () => {
    const report = auditReport();
    report.vulnerabilities['decode-uri-component'].via.push({
      ...report.vulnerabilities['decode-uri-component'].via[0],
      name: 'lower-severity-leaf',
      url: 'https://github.com/advisories/GHSA-2345-2345-2345',
      severity: 'low',
    });

    expect(auditDependencyPolicy(report, [currentException()], TODAY)).toEqual([]);
  });

  it('rejects an excepted GHSA when it moves from Xcode tooling to an Android production path', () => {
    const findings = auditDependencyPolicy(
      uuidAuditReport({ includeAndroid: true, includeXcode: false }),
      [uuidException()],
      TODAY,
    );

    expect(findings).toContainEqual({
      code: 'ADVISORY-PATH-UNREVIEWED',
      message: 'Observed advisory dependency path has not been reviewed.',
    });
  });

  it('rejects a mixed graph containing both approved and new paths for an excepted GHSA', () => {
    const findings = auditDependencyPolicy(
      uuidAuditReport({ includeAndroid: true, includeXcode: true }),
      [uuidException()],
      TODAY,
    );

    expect(findings.filter(({ code }) => code === 'ADVISORY-PATH-UNREVIEWED')).toEqual([{
      code: 'ADVISORY-PATH-UNREVIEWED',
      message: 'Observed advisory dependency path has not been reviewed.',
    }]);
  });

  it('accepts every observed branch when its path and surface are explicitly approved', () => {
    expect(auditDependencyPolicy(
      uuidAuditReport({ includeAndroid: false, includeXcode: true }),
      [uuidException()],
      TODAY,
    )).toEqual([]);
  });

  it('does not mutate the audit report or exception registry', () => {
    const report = auditReport();
    const exceptions = [currentException()];
    const reportBefore = structuredClone(report);
    const exceptionsBefore = structuredClone(exceptions);

    auditDependencyPolicy(report, exceptions, TODAY);

    expect(report).toEqual(reportBefore);
    expect(exceptions).toEqual(exceptionsBefore);
  });

  it('flags stale exceptions whose advisory no longer exists', () => {
    const cleanReport = { auditReportVersion: 2, vulnerabilities: {} };

    expect(auditDependencyPolicy(cleanReport, [currentException()], TODAY)).toContainEqual(
      expect.objectContaining({
        code: 'EXCEPTION-STALE',
        message: expect.stringContaining(ADVISORY_ID),
      }),
    );
  });

  it.each([
    null,
    {},
    { auditReportVersion: 1, vulnerabilities: {} },
    { auditReportVersion: 2 },
    { auditReportVersion: 2, vulnerabilities: [] },
    { auditReportVersion: 2, vulnerabilities: { package: { severity: 'moderate', via: [] } } },
  ])('rejects malformed audit JSON instead of treating it as clean', malformedReport => {
    expect(auditDependencyPolicy(malformedReport, [], TODAY)).toContainEqual(
      expect.objectContaining({ code: 'AUDIT-SCHEMA' }),
    );
  });
});

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
let fakeNpmDirectory = '';
let fakeNpmPath = '';

function cliAuditReport() {
  return {
    auditReportVersion: 2,
    vulnerabilities: {
      'decode-uri-component': {
        name: 'decode-uri-component',
        severity: 'moderate',
        via: [{
          name: 'decode-uri-component',
          severity: 'moderate',
          url: 'https://github.com/advisories/GHSA-vcc3-ghjq-m6fr',
        }],
      },
      uuid: {
        name: 'uuid',
        severity: 'moderate',
        via: [{
          name: 'uuid',
          severity: 'moderate',
          url: 'https://github.com/advisories/GHSA-w5hq-g745-h8pq',
        }],
      },
    },
  };
}

function runAuditCli(options: {
  stdout?: string;
  auditExitCode?: number;
  npmExecPath?: string;
  credentialCanary?: string;
}) {
  const inheritedEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => name.toLowerCase() !== 'npm_execpath'),
  );

  return new Promise<{ exitCode: number; stdout: string; stderr: string }>(resolveResult => {
    execFile(
      process.execPath,
      ['scripts/audit-dependencies-cli.ts'],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: {
          ...inheritedEnvironment,
          NODE_ENV: process.env.NODE_ENV ?? 'test',
          npm_execpath: options.npmExecPath ?? fakeNpmPath,
          FAKE_AUDIT_STDOUT: options.stdout ?? '',
          FAKE_AUDIT_EXIT_CODE: String(options.auditExitCode ?? 0),
          NPM_TOKEN: options.credentialCanary,
        },
      },
      (error, stdout, stderr) => resolveResult({
        exitCode: typeof error?.code === 'number' ? error.code : 0,
        stdout,
        stderr,
      }),
    );
  });
}

describe('dependency audit CLI', () => {
  beforeAll(async () => {
    fakeNpmDirectory = await mkdtemp(join(tmpdir(), 'strandcue-audit-cli-'));
    fakeNpmPath = join(fakeNpmDirectory, 'fake-npm.mjs');
    await writeFile(
      fakeNpmPath,
      "process.stdout.write(process.env.FAKE_AUDIT_STDOUT ?? '');\nprocess.exitCode = Number(process.env.FAKE_AUDIT_EXIT_CODE ?? '0');\n",
      'utf8',
    );
  });

  afterAll(async () => {
    await rm(fakeNpmDirectory, { recursive: true, force: true });
  });

  it('accepts npm exit 1 when valid findings are covered by current exceptions', async () => {
    const result = await runAuditCli({
      stdout: JSON.stringify(cliAuditReport()),
      auditExitCode: 1,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('"critical":0');
    expect(result.stdout).toContain('"high":0');
    expect(result.stdout).toContain('"moderate":2');
    expect(result.stdout).toContain('"reviewedAdvisories":2');
    expect(result.stdout).toContain('DEPENDENCY-POLICY-PASS');
    expect(result.stderr).toBe('');
  });

  it('rejects npm exit 1 when a validated audit report contains no vulnerabilities', async () => {
    const cleanReport = { auditReportVersion: 2, vulnerabilities: {} };
    const result = await runAuditCli({
      stdout: JSON.stringify(cleanReport),
      auditExitCode: 1,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).not.toContain('DEPENDENCY-POLICY-HOLD');
    expect(result.stderr).toContain('DEPENDENCY-POLICY-ERROR');
  });

  it.each([
    ['empty output', '', 1],
    ['invalid JSON', 'not-json', 1],
    ['unsupported audit shape', JSON.stringify({ auditReportVersion: 1 }), 1],
    ['non-audit process failure', JSON.stringify(cliAuditReport()), 2],
  ])('fails closed on %s', async (_caseName, stdout, auditExitCode) => {
    const result = await runAuditCli({ stdout, auditExitCode });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).not.toContain('DEPENDENCY-POLICY-PASS');
  });

  it('fails closed when npm execution is not configured', async () => {
    const result = await runAuditCli({
      stdout: JSON.stringify(cliAuditReport()),
      npmExecPath: '',
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).not.toContain('DEPENDENCY-POLICY-PASS');
  });

  it('never prints registry credentials when parsing fails', async () => {
    const redactionCanary = 'sensitive-value-redaction-canary';
    const result = await runAuditCli({
      stdout: 'not-json',
      auditExitCode: 1,
      credentialCanary: redactionCanary,
    });

    expect(`${result.stdout}${result.stderr}`).not.toContain(redactionCanary);
  });

  it('redacts untrusted audit details from policy failure output', async () => {
    const untrustedPackageName = 'attacker-controlled-terminal-text';
    const report = {
      auditReportVersion: 2,
      vulnerabilities: {
        hostile: {
          name: untrustedPackageName,
          severity: 'high',
          via: ['missing-source'],
        },
      },
    };

    const result = await runAuditCli({
      stdout: JSON.stringify(report),
      auditExitCode: 1,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('ADVISORY-SEVERITY');
    expect(result.stdout).not.toContain(untrustedPackageName);
  });

  it('reports a severity contradiction with a fixed code and no untrusted details', async () => {
    const untrustedPackageName = 'attacker-controlled-moderate-package';
    const report = {
      auditReportVersion: 2,
      vulnerabilities: {
        hostile: {
          name: untrustedPackageName,
          severity: 'moderate',
          via: [{
            name: untrustedPackageName,
            severity: 'low',
            url: 'https://github.com/advisories/GHSA-2345-2345-2345',
          }],
        },
      },
    };

    const result = await runAuditCli({
      stdout: JSON.stringify(report),
      auditExitCode: 1,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('ADVISORY-RESOLUTION-SEVERITY');
    expect(result.stdout).not.toContain(untrustedPackageName);
  });

  it('reports an unreviewed branch with a fixed code and no untrusted path details', async () => {
    const untrustedPackageName = 'attacker-controlled-android-runtime';
    const baseline = cliAuditReport();
    const report = {
      ...baseline,
      vulnerabilities: {
        ...baseline.vulnerabilities,
        hostile: {
          name: untrustedPackageName,
          severity: 'moderate',
          via: ['uuid'],
        },
      },
    };

    const result = await runAuditCli({
      stdout: JSON.stringify(report),
      auditExitCode: 1,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('ADVISORY-PATH-UNREVIEWED');
    expect(result.stdout).not.toContain(untrustedPackageName);
  });
});
