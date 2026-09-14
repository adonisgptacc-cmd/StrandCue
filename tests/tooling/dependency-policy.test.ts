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

function auditReport(severity: 'moderate' | 'high' | 'critical' = 'moderate') {
  return {
    auditReportVersion: 2,
    vulnerabilities: {
      'decode-uri-component': {
        name: 'decode-uri-component',
        severity,
        via: [{
          source: 1,
          name: 'decode-uri-component',
          dependency: 'decode-uri-component',
          title: 'Improper input validation',
          url: ADVISORY_URL,
          severity,
          cwe: ['CWE-20'],
          cvss: { score: 5.3, vectorString: 'CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:L' },
          range: '<0.2.2',
        }],
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
    packages: ['decode-uri-component', 'query-string', 'expo-router'],
    severity: 'moderate',
    surfaces: ['production', 'android'],
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
});
