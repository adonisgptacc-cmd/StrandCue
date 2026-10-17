import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  auditDependencyPolicy as auditDependencyPolicyImplementation,
  scopeExceptionRegistryToReport,
} from '../../scripts/dependency-policy';

const TODAY = '2026-10-17';
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
  surfaces: ('android' | 'web' | 'development' | 'ios-build-tooling' | 'production')[],
) {
  return { path, surfaces };
}

function auditDependencyPolicy(
  report: unknown,
  exceptions: unknown,
  today: string,
  surfaceContext: unknown = manifestContext({
    mobileDependencies: ['decode-uri-component'],
    mobilePlatforms: ['android'],
  }),
) {
  return auditDependencyPolicyImplementation(report, exceptions, today, surfaceContext);
}

function manifestContext(options: {
  rootDependencies?: string[];
  rootDevDependencies?: string[];
  mobileDependencies?: string[];
  mobilePlatforms?: ('android' | 'web')[];
  additionalWorkspaces?: {
    path: `apps/${string}/package.json` | `packages/${string}/package.json`;
    name: string;
    dependencies?: string[];
    devDependencies?: string[];
    runtimePlatforms?: readonly ('android' | 'web')[];
  }[];
} = {}) {
  const versions = (packages: string[]) => Object.fromEntries(
    packages.map(packageName => [packageName, '1.0.0']),
  );

  const workspaces = [{
    path: 'apps/mobile/package.json',
    manifest: {
      name: '@fixture/mobile',
      dependencies: versions(options.mobileDependencies ?? []),
      devDependencies: {},
    },
    runtimePlatforms: options.mobilePlatforms ?? ['android', 'web'],
  }, ...(options.additionalWorkspaces ?? []).map(workspace => ({
    path: workspace.path,
    manifest: {
      name: workspace.name,
      dependencies: versions(workspace.dependencies ?? []),
      devDependencies: versions(workspace.devDependencies ?? []),
    },
    ...(workspace.path.startsWith('apps/')
      ? { runtimePlatforms: workspace.runtimePlatforms ?? ['android', 'web'] }
      : {}),
  }))];

  return {
    root: {
      name: 'fixture-root',
      workspaces: ['apps/*', 'packages/*'],
      dependencies: versions(options.rootDependencies ?? []),
      devDependencies: versions(options.rootDevDependencies ?? []),
    },
    workspaceManifestPaths: workspaces.map(({ path }) => path),
    workspaces,
  };
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
        effects: [],
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
        ['android', 'production'],
      ),
    ],
    severity: 'moderate',
    reachable: 'uncertain',
    assessment: 'Route parsing can process attacker-controlled callback input.',
    mitigation: 'Strict callback and route allowlists reduce, but do not eliminate, exposure.',
    owner: 'StrandCue maintainer',
    approvedOn: '2026-10-06',
    reviewOn: '2026-11-05',
    expiresOn: '2026-12-05',
    upgradePath: 'Upgrade query-string or expo-router when a compatible fix is available.',
    ...overrides,
  };
}

function highBuildToolException(overrides: Record<string, unknown> = {}) {
  return currentException({
    severity: 'high',
    reachable: 'no',
    scope: 'expo-build-tooling',
    packages: [approvedBranch(['expo', '@expo/cli', 'braces'], ['development'])],
    assessment: 'The affected parser is confined to the reviewed Expo CLI build path.',
    mitigation: 'Release artifacts do not contain the package; keep build inputs trusted.',
    expiresOn: '2026-12-05',
    upgradePath: 'Upgrade Expo CLI when it removes the affected braces version.',
    ...overrides,
  });
}

type HighBuildToolVulnerability = {
  name: string;
  severity: 'high';
  via: (string | { name: string; severity: 'high'; url: string })[];
  effects: string[];
};

function highBuildToolAuditReport(): {
  auditReportVersion: 2;
  vulnerabilities: Record<string, HighBuildToolVulnerability>;
} {
  return {
    auditReportVersion: 2 as const,
    vulnerabilities: {
      braces: {
        name: 'braces', severity: 'high' as const,
        via: [{ name: 'braces', severity: 'high' as const, url: ADVISORY_URL }],
        effects: ['@expo/cli'],
      },
      '@expo/cli': {
        name: '@expo/cli', severity: 'high' as const,
        via: ['braces'], effects: ['expo'],
      },
      expo: {
        name: 'expo', severity: 'high' as const,
        via: ['@expo/cli'], effects: [],
      },
    },
  };
}

function uuidException(overrides: Record<string, unknown> = {}) {
  return currentException({
    advisoryId: UUID_ADVISORY_ID,
    packages: [
      approvedBranch(['uuid'], ['ios-build-tooling']),
      approvedBranch(['xcode', 'uuid'], ['ios-build-tooling']),
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
    effects: string[];
  }> = {
    uuid: {
      name: 'uuid',
      severity: 'moderate',
      via: [{
        name: 'uuid',
        severity: 'moderate',
        url: UUID_ADVISORY_URL,
      }],
      effects: [],
    },
  };

  if (options.includeXcode) {
    vulnerabilities.xcode = {
      name: 'xcode',
      severity: 'moderate',
      via: ['uuid'],
      effects: [],
    };
  }
  if (options.includeAndroid) {
    vulnerabilities['android-runtime'] = {
      name: 'android-runtime',
      severity: 'moderate',
      via: ['uuid'],
      effects: [],
    };
  }

  vulnerabilities.uuid.effects = [
    ...(options.includeXcode ? ['xcode'] : []),
    ...(options.includeAndroid ? ['android-runtime'] : []),
  ];

  return { auditReportVersion: 2, vulnerabilities };
}

function xcodeChainAuditReport(higherRoots: string[]) {
  const leafToRoot = ['uuid', 'xcode', ...higherRoots];
  const vulnerabilities = Object.fromEntries(leafToRoot.map((packageName, index) => [
    packageName,
    {
      name: packageName,
      severity: 'moderate' as const,
      via: index === 0
        ? [{ name: 'uuid', severity: 'moderate' as const, url: UUID_ADVISORY_URL }]
        : [leafToRoot[index - 1]],
      effects: index === leafToRoot.length - 1 ? [] : [leafToRoot[index + 1]],
    },
  ]));
  const approvedPaths = leafToRoot.map((_, index) => (
    approvedBranch([...leafToRoot.slice(0, index + 1)].reverse(), ['ios-build-tooling'])
  ));
  return {
    report: { auditReportVersion: 2, vulnerabilities },
    exception: uuidException({ packages: approvedPaths }),
    branchRoot: leafToRoot.at(-1)!,
  };
}

describe('dependency advisory policy', () => {
  it('fails every critical advisory even when an exception exists', () => {
    const findings = auditDependencyPolicy(
      auditReport('critical'),
      [currentException()],
      TODAY,
    );

    expect(findings.map(({ code }) => code)).toContain('ADVISORY-SEVERITY');
  });

  it('accepts a high Expo build-tool advisory only when unreachable on development surfaces', () => {
    expect(auditDependencyPolicy(
      highBuildToolAuditReport(),
      [highBuildToolException()],
      TODAY,
      manifestContext({ rootDevDependencies: ['expo'] }),
    )).toEqual([]);
  });

  it.each([
    ['reachable', { reachable: 'yes' }, manifestContext({ rootDevDependencies: ['expo'] })],
    ['android', { packages: [approvedBranch(['expo', '@expo/cli', 'braces'], ['android'])] }, manifestContext({ rootDevDependencies: ['expo'] })],
    ['web', { packages: [approvedBranch(['expo', '@expo/cli', 'braces'], ['web'])] }, manifestContext({ rootDevDependencies: ['expo'] })],
    ['mixed', { packages: [approvedBranch(['expo', '@expo/cli', 'braces'], ['development', 'production'])] }, manifestContext({ rootDevDependencies: ['expo'] })],
  ])('rejects a high Expo build-tool exception with %s exposure', (_caseName, overrides, context) => {
    const findings = auditDependencyPolicy(
      highBuildToolAuditReport(),
      [highBuildToolException(overrides)],
      TODAY,
      context,
    );

    expect(findings.length).toBeGreaterThan(0);
  });

  it('rejects a new high advisory path absent from the exception', () => {
    const report = highBuildToolAuditReport();
    report.vulnerabilities['alternate-expo-tool'] = {
      name: 'alternate-expo-tool', severity: 'high', via: ['braces'], effects: [],
    };
    report.vulnerabilities.braces.effects.push('alternate-expo-tool');

    expect(auditDependencyPolicy(
      report,
      [highBuildToolException()],
      TODAY,
      manifestContext({ rootDevDependencies: ['expo', 'alternate-expo-tool'] }),
    )).toContainEqual(expect.objectContaining({ code: 'ADVISORY-PATH-UNREVIEWED' }));
  });

  it('rejects a same-advisory non-Expo development path even when an Expo path is approved', () => {
    const report = highBuildToolAuditReport();
    report.vulnerabilities['generic-dev-tool'] = {
      name: 'generic-dev-tool', severity: 'high', via: ['braces'], effects: [],
    };
    report.vulnerabilities.braces.effects.push('generic-dev-tool');

    expect(auditDependencyPolicy(
      report,
      [highBuildToolException()],
      TODAY,
      manifestContext({ rootDevDependencies: ['expo', 'generic-dev-tool'] }),
    )).toContainEqual(expect.objectContaining({ code: 'ADVISORY-PATH-UNREVIEWED' }));
  });

  it('rejects high exceptions lasting more than 60 days', () => {
    expect(auditDependencyPolicy(
      highBuildToolAuditReport(),
      [highBuildToolException({ expiresOn: '2026-12-06' })],
      TODAY,
      manifestContext({ rootDevDependencies: ['expo'] }),
    )).toContainEqual(expect.objectContaining({ code: 'EXCEPTION-DURATION' }));
  });

  it('fails a moderate advisory without a matching GHSA exception', () => {
    const findings = auditDependencyPolicy(auditReport(), [], TODAY);

    expect(findings).toContainEqual(expect.objectContaining({
      code: 'ADVISORY-UNEXCEPTED',
      message: expect.stringContaining(ADVISORY_ID),
    }));
  });

  it.each([
    ['malformed', { advisoryId: 'not-a-ghsa' }, 'EXCEPTION-SCHEMA'],
    ['future-approved', { approvedOn: '2026-10-18' }, 'EXCEPTION-DATE'],
    ['expired', { expiresOn: '2026-10-05' }, 'EXCEPTION-DATE'],
    ['review-before-approval', { reviewOn: '2026-10-05' }, 'EXCEPTION-DATE'],
    ['review-after-expiry', { reviewOn: '2026-12-06' }, 'EXCEPTION-DATE'],
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
      '2026-11-05',
    )).toEqual([]);
  });

  it('requires deliberate renewal on the day after reviewOn', () => {
    expect(auditDependencyPolicy(
      auditReport(),
      [currentException()],
      '2026-11-06',
    )).toContainEqual({
      code: 'EXCEPTION-REVIEW-DUE',
      message: `Exception review is due: ${ADVISORY_ID}.`,
    });
  });

  it('retains the separate expiry gate after expiresOn', () => {
    expect(auditDependencyPolicy(
      auditReport(),
      [currentException()],
      '2026-12-06',
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
          effects: [],
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
          effects: [],
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
          effects: [],
        },
        'cycle-a': {
          name: 'cycle-a',
          severity: 'moderate',
          via: ['cycle-b'],
          effects: ['cycle-b'],
        },
        'cycle-b': {
          name: 'cycle-b',
          severity: 'moderate',
          via: ['cycle-a'],
          effects: ['cycle-a'],
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
      manifestContext({ mobileDependencies: ['android-runtime'] }),
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
      manifestContext({
        rootDevDependencies: ['xcode'],
        mobileDependencies: ['android-runtime'],
      }),
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
      manifestContext({ rootDevDependencies: ['xcode'] }),
    )).toEqual([]);
  });

  it('rejects the same GHSA path when it gains an Android production surface', () => {
    const report = uuidAuditReport({ includeAndroid: false, includeXcode: false });
    const exception = uuidException({
      packages: [approvedBranch(['uuid'], ['development'])],
    });

    expect(auditDependencyPolicy(
      report,
      [exception],
      TODAY,
      manifestContext({ rootDevDependencies: ['uuid'] }),
    )).toEqual([]);

    expect(auditDependencyPolicy(
      report,
      [exception],
      TODAY,
      manifestContext({ mobileDependencies: ['uuid'] }),
    )).toContainEqual({
      code: 'ADVISORY-SURFACE-UNREVIEWED',
      message: 'Observed advisory dependency surfaces have not been reviewed.',
    });
  });

  it('rejects the same GHSA path when approved runtime exposure gains a development surface', () => {
    const report = uuidAuditReport({ includeAndroid: false, includeXcode: false });
    const exception = uuidException({
      packages: [approvedBranch(['uuid'], ['android', 'production', 'web'])],
    });

    expect(auditDependencyPolicy(
      report,
      [exception],
      TODAY,
      manifestContext({
        rootDevDependencies: ['uuid'],
        mobileDependencies: ['uuid'],
      }),
    )).toContainEqual({
      code: 'ADVISORY-SURFACE-UNREVIEWED',
      message: 'Observed advisory dependency surfaces have not been reviewed.',
    });
  });

  it('rejects an approved Xcode path when that same root gains Android production exposure', () => {
    const report = uuidAuditReport({ includeAndroid: false, includeXcode: true });

    expect(auditDependencyPolicy(
      report,
      [uuidException()],
      TODAY,
      manifestContext({ rootDevDependencies: ['xcode'] }),
    )).toEqual([]);

    expect(auditDependencyPolicy(
      report,
      [uuidException()],
      TODAY,
      manifestContext({ mobileDependencies: ['xcode'] }),
    )).toContainEqual({
      code: 'ADVISORY-SURFACE-UNREVIEWED',
      message: 'Observed advisory dependency surfaces have not been reviewed.',
    });
  });

  it('rejects an approved Xcode path with mixed development and runtime exposure', () => {
    expect(auditDependencyPolicy(
      uuidAuditReport({ includeAndroid: false, includeXcode: true }),
      [uuidException()],
      TODAY,
      manifestContext({
        rootDevDependencies: ['xcode'],
        mobileDependencies: ['xcode'],
      }),
    )).toContainEqual({
      code: 'ADVISORY-SURFACE-UNREVIEWED',
      message: 'Observed advisory dependency surfaces have not been reviewed.',
    });
  });

  it.each([
    ['@expo/config-plugins', ['@expo/config-plugins'], false],
    ['@expo/config-plugins mixed', ['@expo/config-plugins'], true],
    ['@expo/config', ['@expo/config-plugins', '@expo/config'], false],
    ['@expo/config mixed', ['@expo/config-plugins', '@expo/config'], true],
  ] as const)(
    'rejects higher Xcode root %s when the exact approved path gains runtime exposure',
    (_caseName, higherRoots, includeDevelopment) => {
      const { report, exception, branchRoot } = xcodeChainAuditReport([...higherRoots]);

      expect(auditDependencyPolicy(
        report,
        [exception],
        TODAY,
        manifestContext({
          rootDevDependencies: includeDevelopment ? [branchRoot] : [],
          mobileDependencies: [branchRoot],
        }),
      )).toContainEqual({
        code: 'ADVISORY-SURFACE-UNREVIEWED',
        message: 'Observed advisory dependency surfaces have not been reviewed.',
      });
    },
  );

  it('fails closed when an observed GHSA path has no manifest surface classification', () => {
    const report = uuidAuditReport({ includeAndroid: false, includeXcode: false });

    expect(auditDependencyPolicy(
      report,
      [uuidException({ packages: [approvedBranch(['uuid'], ['development'])] })],
      TODAY,
      manifestContext(),
    )).toContainEqual({
      code: 'ADVISORY-SURFACE-UNIDENTIFIED',
      message: 'Advisory dependency surfaces could not be classified.',
    });
  });

  it('fails closed when audit effects contradict dependency relationships', () => {
    const report = uuidAuditReport({ includeAndroid: false, includeXcode: false });
    report.vulnerabilities.uuid.effects = ['declared-parent'];
    const inconsistentReport = {
      ...report,
      vulnerabilities: {
        ...report.vulnerabilities,
        'declared-parent': {
          name: 'declared-parent',
          severity: 'low' as const,
          via: [],
          effects: [],
        },
      },
    };

    expect(auditDependencyPolicy(
      inconsistentReport,
      [uuidException({ packages: [approvedBranch(['uuid'], ['development'])] })],
      TODAY,
      manifestContext({ rootDevDependencies: ['declared-parent'] }),
    )).toContainEqual({
      code: 'ADVISORY-SURFACE-UNIDENTIFIED',
      message: 'Advisory dependency surfaces could not be classified.',
    });
  });

  it('fails closed when dependency manifest surface context is missing', () => {
    const report = uuidAuditReport({ includeAndroid: false, includeXcode: false });

    expect(auditDependencyPolicyImplementation(
      report,
      [uuidException({ packages: [approvedBranch(['uuid'], ['development'])] })],
      TODAY,
      undefined,
    )).toContainEqual({
      code: 'SURFACE-CONTEXT-SCHEMA',
      message: 'Dependency manifest surface context is malformed or incomplete.',
    });
  });

  it('fails closed when a discovered workspace manifest is omitted from surface evidence', () => {
    const report = uuidAuditReport({ includeAndroid: false, includeXcode: false });
    const completeContext = manifestContext({ rootDevDependencies: ['uuid'] });

    expect(auditDependencyPolicyImplementation(
      report,
      [uuidException({ packages: [approvedBranch(['uuid'], ['development'])] })],
      TODAY,
      completeContext,
    )).toEqual([]);

    expect(auditDependencyPolicyImplementation(
      report,
      [uuidException({ packages: [approvedBranch(['uuid'], ['development'])] })],
      TODAY,
      { ...completeContext, workspaces: [] },
    )).toContainEqual({
      code: 'SURFACE-CONTEXT-SCHEMA',
      message: 'Dependency manifest surface context is malformed or incomplete.',
    });
  });

  it('fails closed when app platform evidence contains duplicates', () => {
    const report = uuidAuditReport({ includeAndroid: false, includeXcode: false });
    const context = manifestContext({ rootDevDependencies: ['uuid'] });
    const mobile = context.workspaces[0];

    expect(auditDependencyPolicyImplementation(
      report,
      [uuidException({ packages: [approvedBranch(['uuid'], ['development'])] })],
      TODAY,
      {
        ...context,
        workspaces: [{ ...mobile, runtimePlatforms: ['android', 'android'] }],
      },
    )).toContainEqual({
      code: 'SURFACE-CONTEXT-SCHEMA',
      message: 'Dependency manifest surface context is malformed or incomplete.',
    });
  });

  it.each([
    {
      label: 'a new apps workspace',
      workspace: {
        path: 'apps/companion/package.json' as const,
        name: '@fixture/companion',
        dependencies: ['uuid'],
        runtimePlatforms: ['android', 'web'] as const,
      },
    },
    {
      label: 'a new packages workspace',
      workspace: {
        path: 'packages/runtime/package.json' as const,
        name: '@fixture/runtime',
        dependencies: ['uuid'],
      },
    },
  ])('includes $label when deriving dependency exposure', ({ workspace }) => {
    const report = uuidAuditReport({ includeAndroid: false, includeXcode: false });
    const exception = uuidException({
      packages: [approvedBranch(['uuid'], ['development'])],
    });

    expect(auditDependencyPolicy(
      report,
      [exception],
      TODAY,
      manifestContext({ rootDevDependencies: ['uuid'] }),
    )).toEqual([]);

    expect(auditDependencyPolicy(
      report,
      [exception],
      TODAY,
      manifestContext({
        rootDevDependencies: ['uuid'],
        additionalWorkspaces: [workspace],
      }),
    )).toContainEqual({
      code: 'ADVISORY-SURFACE-UNREVIEWED',
      message: 'Observed advisory dependency surfaces have not been reviewed.',
    });
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

  it('flags stale package paths within an otherwise observed advisory exception', () => {
    const exception = currentException({
      packages: [
        approvedBranch(['decode-uri-component'], ['android', 'production']),
        approvedBranch(['removed-parent', 'decode-uri-component'], ['android', 'production']),
      ],
    });

    expect(auditDependencyPolicy(auditReport(), [exception], TODAY)).toContainEqual({
      code: 'EXCEPTION-PATH-STALE',
      message: `Exception path no longer matches an observed advisory path: ${ADVISORY_ID}:removed-parent > decode-uri-component.`,
    });
  });

  it('flags stale surfaces on a package path that is still observed', () => {
    const exception = currentException({
      packages: [
        approvedBranch(['decode-uri-component'], ['android', 'production']),
        approvedBranch(['decode-uri-component'], ['development']),
      ],
    });

    expect(auditDependencyPolicy(auditReport(), [exception], TODAY)).toContainEqual({
      code: 'EXCEPTION-TUPLE-STALE',
      message: `Exception tuple no longer matches an observed advisory path and surfaces: ${ADVISORY_ID}:decode-uri-component:development.`,
    });
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
const CLEAN_AUDIT_REPORT = JSON.stringify({ auditReportVersion: 2, vulnerabilities: {} });
let fakeNpmDirectory = '';
let fakeNpmPath = '';
let fixedClockPath = '';

function cliAuditReport() {
  type RegistryEntry = {
    advisoryId: string;
    severity: 'moderate' | 'high';
    packages: { path: string[] }[];
  };
  type Vulnerability = {
    name: string;
    severity: 'moderate' | 'high';
    via: (string | { name: string; severity: 'moderate' | 'high'; url: string })[];
    effects: string[];
  };
  const registry = JSON.parse(readFileSync(
    resolve(repositoryRoot, 'docs/verification/dependency-advisory-exceptions.json'),
    'utf8',
  )) as RegistryEntry[];
  const vulnerabilities: Record<string, Vulnerability> = {};
  const ensureVulnerability = (name: string, severity: 'moderate' | 'high') => {
    vulnerabilities[name] ??= { name, severity, via: [], effects: [] };
    if (severity === 'high') vulnerabilities[name].severity = 'high';
    return vulnerabilities[name];
  };

  for (const exception of registry) {
    for (const rootToLeafPath of exception.packages.map(({ path }) => path)) {
      const leafToRootPath = [...rootToLeafPath].reverse();
      leafToRootPath.forEach((packageName, index) => {
        const vulnerability = ensureVulnerability(packageName, exception.severity);
        if (index === 0) {
          if (!vulnerability.via.some(via => typeof via !== 'string')) {
            vulnerability.via.push({
              name: packageName,
              severity: exception.severity,
              url: `https://github.com/advisories/${exception.advisoryId}`,
            });
          }
          return;
        }

        const dependency = leafToRootPath[index - 1];
        if (!vulnerability.via.includes(dependency)) vulnerability.via.push(dependency);
        const dependent = ensureVulnerability(dependency, exception.severity);
        if (!dependent.effects.includes(packageName)) dependent.effects.push(packageName);
      });
    }
  }

  return { auditReportVersion: 2, vulnerabilities };
}

function runAuditCli(options: {
  stdout?: string;
  auditExitCode?: number;
  workerStdout?: string;
  workerAuditExitCode?: number;
  npmExecPath?: string;
  credentialCanary?: string;
  auditLog?: string;
}) {
  const inheritedEnvironment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => name.toLowerCase() !== 'npm_execpath'),
  );

  return new Promise<{ exitCode: number; stdout: string; stderr: string }>(resolveResult => {
    execFile(
      process.execPath,
      ['--import', pathToFileURL(fixedClockPath).href, 'scripts/audit-dependencies-cli.ts'],
      {
        cwd: repositoryRoot,
        encoding: 'utf8',
        env: {
          ...inheritedEnvironment,
          NODE_ENV: process.env.NODE_ENV ?? 'test',
          npm_execpath: options.npmExecPath ?? fakeNpmPath,
          FAKE_AUDIT_STDOUT: options.stdout ?? '',
          FAKE_AUDIT_EXIT_CODE: String(options.auditExitCode ?? 0),
          FAKE_AUDIT_WORKER_STDOUT: options.workerStdout ?? CLEAN_AUDIT_REPORT,
          FAKE_AUDIT_WORKER_EXIT_CODE: String(options.workerAuditExitCode ?? 0),
          FAKE_AUDIT_LOG: options.auditLog,
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

function auditedDirectories(auditLog: string): string[] {
  return readFileSync(auditLog, 'utf8')
    .split('\n')
    .map(line => line.trim().replace(/\\/g, '/'))
    .filter(line => line.length > 0);
}

describe('dependency audit CLI', () => {
  beforeAll(async () => {
    fakeNpmDirectory = await mkdtemp(join(tmpdir(), 'strandcue-audit-cli-'));
    fakeNpmPath = join(fakeNpmDirectory, 'fake-npm.mjs');
    fixedClockPath = join(fakeNpmDirectory, 'fixed-clock.mjs');
    // Freeze only the fixture subprocess. The real CLI must keep its live expiry gate.
    await writeFile(
      fixedClockPath,
      [
        'const RealDate = Date;',
        'globalThis.Date = class extends RealDate {',
        `  constructor(...args) { super(...(args.length ? args : ['${TODAY}T12:00:00Z'])); }`,
        `  static now() { return new RealDate('${TODAY}T12:00:00Z').getTime(); }`,
        '};',
        '',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      fakeNpmPath,
      [
        "import { appendFileSync } from 'node:fs';",
        `const runnerReviews = ${JSON.stringify(['eas', 'mutation'].map(name => JSON.parse(readFileSync(resolve(repositoryRoot, `docs/verification/${name}-runner-advisory-review.json`), 'utf8'))))};`,
        'const runner = runnerReviews.find(review => process.cwd().replaceAll(String.fromCharCode(92), "/").endsWith(review.tree.replace("/package.json", "")));',
        'if (runner) { if (process.env.FAKE_AUDIT_LOG) appendFileSync(process.env.FAKE_AUDIT_LOG, `${process.cwd()}\\n`); process.stdout.write(JSON.stringify(runner.audit)); process.exit(0); }',
        "if (!process.argv.includes('--include=dev') || process.argv.includes('--omit=dev')) { process.stderr.write('Development dependencies must be audited'); process.exit(2); }",
        'const cwd = process.cwd();',
        'if (process.env.FAKE_AUDIT_LOG) appendFileSync(process.env.FAKE_AUDIT_LOG, `${cwd}\\n`);',
        "const isWorkerTree = /[\\\\/]workers[\\\\/][^\\\\/]+$/.test(cwd);",
        'const stdoutName = isWorkerTree ? "FAKE_AUDIT_WORKER_STDOUT" : "FAKE_AUDIT_STDOUT";',
        'const exitName = isWorkerTree ? "FAKE_AUDIT_WORKER_EXIT_CODE" : "FAKE_AUDIT_EXIT_CODE";',
        'process.stdout.write(process.env[stdoutName] ?? "");',
        'process.exitCode = Number(process.env[exitName] ?? "0");',
        '',
      ].join('\n'),
      'utf8',
    );
  });

  afterAll(async () => {
    await rm(fakeNpmDirectory, { recursive: true, force: true });
  });

  it('rejects npm exit 1 when the registry retains a path absent from the audit report', async () => {
    const report = cliAuditReport();
    delete report.vulnerabilities['expo-router'];
    report.vulnerabilities['query-string'].effects = [];
    const result = await runAuditCli({
      stdout: JSON.stringify(report),
      auditExitCode: 1,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('DEPENDENCY-POLICY-HOLD');
    expect(result.stdout).toContain('EXCEPTION-PATH-STALE');
  }, 10_000);

  it('rejects npm exit 1 when a validated audit report contains no vulnerabilities', async () => {
    const cleanReport = { auditReportVersion: 2, vulnerabilities: {} };
    const result = await runAuditCli({
      stdout: JSON.stringify(cleanReport),
      auditExitCode: 1,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).not.toContain('DEPENDENCY-POLICY-HOLD');
    expect(result.stderr).toContain('DEPENDENCY-POLICY-ERROR');
  }, 10_000);

  it.each([
    ['empty output', '', 1],
    ['invalid JSON', 'not-json', 1],
    ['unsupported audit shape', JSON.stringify({ auditReportVersion: 1 }), 1],
    ['non-audit process failure', JSON.stringify(cliAuditReport()), 2],
  ])('fails closed on %s', async (_caseName, stdout, auditExitCode) => {
    const result = await runAuditCli({ stdout, auditExitCode });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).not.toContain('DEPENDENCY-POLICY-PASS');
  }, 10_000);

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
          effects: [],
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
          effects: [],
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
  }, 10_000);

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
          effects: [],
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
  }, 10_000);

  it('audits the deletion worker tree as a second npm audit invocation', async () => {
    const auditLog = join(fakeNpmDirectory, 'audit-log-worker-tree.txt');
    const result = await runAuditCli({
      stdout: JSON.stringify(cliAuditReport()),
      auditLog,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('DEPENDENCY-POLICY-PASS');

    const audited = auditedDirectories(auditLog);
    expect(audited).toHaveLength(4);
    const workerDirectories = audited.filter(dir => dir.endsWith('/workers/account-deletion'));
    expect(workerDirectories).toHaveLength(1);
    expect(existsSync(join(workerDirectories[0], 'package-lock.json'))).toBe(true);
    const workspaceDirectories = audited.filter(dir => !dir.endsWith('/workers/account-deletion'));
    expect(existsSync(join(workspaceDirectories[0], 'package-lock.json'))).toBe(true);
  }, 10_000);

  it('holds on a worker-only advisory and names the worker tree that produced it', async () => {
    const result = await runAuditCli({
      stdout: JSON.stringify(cliAuditReport()),
      workerStdout: JSON.stringify(workerAdvisoryReport()),
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('DEPENDENCY-POLICY-HOLD');
    expect(result.stdout).toContain('workers/account-deletion/package.json');
    expect(result.stdout).toContain('ADVISORY-UNEXCEPTED');

    const hold = JSON.parse(result.stdout.trim()) as {
      status: string;
      summary: Record<string, number>;
      trees: { id: string; status: string; findingCount: number; findingCodes: string[] }[];
    };
    const rootTree = hold.trees.find(tree => tree.id === 'root');
    const workerTree = hold.trees.find(tree => tree.id === 'workers/account-deletion/package.json');
    expect(rootTree).toMatchObject({ status: 'PASS', findingCount: 0 });
    expect(workerTree?.status).toBe('HOLD');
    expect(workerTree?.findingCodes).toContain('ADVISORY-UNEXCEPTED');
    expect(workerTree?.findingCount).toBeGreaterThanOrEqual(2);
  }, 10_000);

  it('fails closed when the worker tree cannot be audited', async () => {
    const result = await runAuditCli({
      stdout: JSON.stringify(cliAuditReport()),
      workerAuditExitCode: 2,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).not.toContain('DEPENDENCY-POLICY-PASS');
    expect(result.stderr).toContain('DEPENDENCY-POLICY-ERROR');
  }, 10_000);

  async function runGateInProcess(options: {
    stdout: string;
    workerStdout?: string;
    workerAuditExitCode?: number;
  }): Promise<{ exitCode: number; stdout: string; stderr: string; audited: string[] }> {
    const auditLog = join(
      fakeNpmDirectory,
      `audit-log-in-process-${Math.random().toString(36).slice(2)}.txt`,
    );
    const previousEnvironment = {
      npmExecPath: process.env.npm_execpath,
      auditStdout: process.env.FAKE_AUDIT_STDOUT,
      workerStdout: process.env.FAKE_AUDIT_WORKER_STDOUT,
      workerExitCode: process.env.FAKE_AUDIT_WORKER_EXIT_CODE,
      auditLog: process.env.FAKE_AUDIT_LOG,
    };
    const previousExitCode = process.exitCode ?? undefined;
    const stdoutWrites: string[] = [];
    const stderrWrites: string[] = [];
    const originalStdoutWrite = process.stdout.write.bind(process.stdout);
    const originalStderrWrite = process.stderr.write.bind(process.stderr);
    const setEnvironment = (name: string, value: string | undefined) => {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    };

    setEnvironment('npm_execpath', fakeNpmPath);
    setEnvironment('FAKE_AUDIT_STDOUT', options.stdout);
    setEnvironment('FAKE_AUDIT_WORKER_STDOUT', options.workerStdout ?? CLEAN_AUDIT_REPORT);
    setEnvironment('FAKE_AUDIT_WORKER_EXIT_CODE', String(options.workerAuditExitCode ?? 0));
    setEnvironment('FAKE_AUDIT_LOG', auditLog);
    process.stdout.write = ((chunk: string | Uint8Array) => {
      stdoutWrites.push(String(chunk));
      return true;
    }) as unknown as typeof process.stdout.write;
    process.stderr.write = ((chunk: string | Uint8Array) => {
      stderrWrites.push(String(chunk));
      return true;
    }) as unknown as typeof process.stderr.write;

    let exitCodeDuringRun: number | string | undefined;
    try {
      vi.resetModules();
      await import('../../scripts/audit-dependencies-cli.ts');
      exitCodeDuringRun = process.exitCode ?? undefined;
    } finally {
      process.stdout.write = originalStdoutWrite;
      process.stderr.write = originalStderrWrite;
      process.exitCode = previousExitCode;
      setEnvironment('npm_execpath', previousEnvironment.npmExecPath);
      setEnvironment('FAKE_AUDIT_STDOUT', previousEnvironment.auditStdout);
      setEnvironment('FAKE_AUDIT_WORKER_STDOUT', previousEnvironment.workerStdout);
      setEnvironment('FAKE_AUDIT_WORKER_EXIT_CODE', previousEnvironment.workerExitCode);
      setEnvironment('FAKE_AUDIT_LOG', previousEnvironment.auditLog);
    }

    return {
      exitCode: Number(exitCodeDuringRun ?? 0),
      stdout: stdoutWrites.join(''),
      stderr: stderrWrites.join(''),
      audited: auditedDirectories(auditLog),
    };
  }

  it('runs the gate in-process and audits both trees', async () => {
    const result = await runGateInProcess({ stdout: JSON.stringify(cliAuditReport()) });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('DEPENDENCY-POLICY-PASS');
    expect(result.audited).toHaveLength(4);
    expect(result.audited.some(dir => dir.endsWith('/workers/account-deletion'))).toBe(true);
  }, 10_000);

  it('runs the in-process gate to HOLD and name the worker tree that failed', async () => {
    const result = await runGateInProcess({
      stdout: JSON.stringify(cliAuditReport()),
      workerStdout: JSON.stringify(workerAdvisoryReport()),
      workerAuditExitCode: 1,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('DEPENDENCY-POLICY-HOLD');
    expect(result.stdout).toContain('workers/account-deletion/package.json');
  }, 10_000);

  it('runs the in-process gate to ERROR when a tree cannot be audited', async () => {
    const result = await runGateInProcess({
      stdout: JSON.stringify(cliAuditReport()),
      workerAuditExitCode: 2,
    });

    expect(result.exitCode).toBe(1);
    expect(result.stdout).not.toContain('DEPENDENCY-POLICY-PASS');
    expect(result.stderr).toContain('DEPENDENCY-POLICY-ERROR');
  }, 10_000);
});

const workerManifestPath = 'workers/account-deletion/package.json';

function workerSurfaceContext() {
  return {
    manifestPath: workerManifestPath,
    manifest: JSON.parse(readFileSync(resolve(repositoryRoot, workerManifestPath), 'utf8')) as unknown,
  };
}

function workerDependencyReport(
  packageName: string,
  severity: 'moderate' | 'high',
  advisoryId: string,
) {
  return {
    auditReportVersion: 2 as const,
    vulnerabilities: {
      [packageName]: {
        name: packageName,
        severity,
        via: [{ name: packageName, severity, url: `https://github.com/advisories/${advisoryId}` }],
        effects: [],
      },
    },
  };
}

function workerAdvisoryReport() {
  return {
    auditReportVersion: 2 as const,
    vulnerabilities: {
      '@supabase/supabase-js': {
        name: '@supabase/supabase-js',
        severity: 'high' as const,
        via: [{
          name: '@supabase/supabase-js',
          severity: 'high' as const,
          url: 'https://github.com/advisories/GHSA-2345-2345-2345',
        }],
        effects: [],
      },
      'worker-moderate-transitive': {
        name: 'worker-moderate-transitive',
        severity: 'moderate' as const,
        via: [{
          name: 'worker-moderate-transitive',
          severity: 'moderate' as const,
          url: 'https://github.com/advisories/GHSA-3456-3456-3456',
        }],
        effects: [],
      },
    },
  };
}

describe('standalone worker dependency tree', () => {
  it('classifies the worker runtime dependency as production, never as development', () => {
    const report = workerDependencyReport('@supabase/supabase-js', 'moderate', 'GHSA-2345-2345-2345');

    expect(auditDependencyPolicyImplementation(
      report,
      [currentException({
        advisoryId: 'GHSA-2345-2345-2345',
        packages: [approvedBranch(['@supabase/supabase-js'], ['production'])],
      })],
      TODAY,
      workerSurfaceContext(),
    )).toEqual([]);

    expect(auditDependencyPolicyImplementation(
      report,
      [currentException({
        advisoryId: 'GHSA-2345-2345-2345',
        packages: [approvedBranch(['@supabase/supabase-js'], ['development'])],
      })],
      TODAY,
      workerSurfaceContext(),
    )).toContainEqual({
      code: 'ADVISORY-SURFACE-UNREVIEWED',
      message: 'Observed advisory dependency surfaces have not been reviewed.',
    });
  });

  it('classifies a worker devDependency as development, never as production', () => {
    const report = workerDependencyReport('wrangler', 'moderate', 'GHSA-3456-3456-3456');

    expect(auditDependencyPolicyImplementation(
      report,
      [currentException({
        advisoryId: 'GHSA-3456-3456-3456',
        packages: [approvedBranch(['wrangler'], ['development'])],
      })],
      TODAY,
      workerSurfaceContext(),
    )).toEqual([]);

    expect(auditDependencyPolicyImplementation(
      report,
      [currentException({
        advisoryId: 'GHSA-3456-3456-3456',
        packages: [approvedBranch(['wrangler'], ['production'])],
      })],
      TODAY,
      workerSurfaceContext(),
    )).toContainEqual({
      code: 'ADVISORY-SURFACE-UNREVIEWED',
      message: 'Observed advisory dependency surfaces have not been reviewed.',
    });
  });

  it('refuses to classify a package that the worker manifest does not declare', () => {
    const undeclaredFindings = auditDependencyPolicyImplementation(
      {
        auditReportVersion: 2,
        vulnerabilities: {
          'undeclared-worker-package': {
            name: 'undeclared-worker-package',
            severity: 'high',
            via: ['missing-transitive-source'],
            effects: [],
          },
        },
      },
      [],
      TODAY,
      workerSurfaceContext(),
    );

    expect(undeclaredFindings).toContainEqual({
      code: 'ADVISORY-SEVERITY',
      message: 'High vulnerability has no classified dependency surface: undeclared-worker-package.',
    });

    const declaredFindings = auditDependencyPolicyImplementation(
      {
        auditReportVersion: 2,
        vulnerabilities: {
          '@supabase/supabase-js': {
            name: '@supabase/supabase-js',
            severity: 'high',
            via: ['missing-transitive-source'],
            effects: [],
          },
        },
      },
      [],
      TODAY,
      workerSurfaceContext(),
    );

    expect(declaredFindings.map(({ message }) => message)).not.toContain(
      'High vulnerability has no classified dependency surface: @supabase/supabase-js.',
    );
  });

  it.each([
    ['a workspace app manifest', 'apps/mobile/package.json'],
    ['a workspace package manifest', 'packages/domain/package.json'],
    ['a repository root manifest', 'package.json'],
    ['a traversing path', 'workers/account-deletion/../../package.json'],
    ['a manifest outside the declared roots', 'tools/eas-runner/package.json'],
  ])('rejects %s as a standalone dependency tree', (_case, manifestPath) => {
    expect(auditDependencyPolicyImplementation(
      { auditReportVersion: 2, vulnerabilities: {} },
      [],
      TODAY,
      { manifestPath, manifest: { name: 'fixture', dependencies: {}, devDependencies: {} } },
    )).toContainEqual({
      code: 'SURFACE-CONTEXT-SCHEMA',
      message: 'Dependency manifest surface context is malformed or incomplete.',
    });
  });

  it('scopes a shared exception registry to the advisories one tree observes', () => {
    const cleanReport = { auditReportVersion: 2, vulnerabilities: {} };

    expect(scopeExceptionRegistryToReport([currentException()], cleanReport)).toEqual([]);
    expect(auditDependencyPolicyImplementation(
      cleanReport,
      scopeExceptionRegistryToReport([currentException()], cleanReport),
      TODAY,
      workerSurfaceContext(),
    )).toEqual([]);

    const report = workerDependencyReport('@supabase/supabase-js', 'moderate', 'GHSA-2345-2345-2345');
    const observed = currentException({ advisoryId: 'GHSA-2345-2345-2345' });
    expect(scopeExceptionRegistryToReport(
      [observed, currentException({ advisoryId: 'GHSA-6789-6789-6789' })],
      report,
    )).toEqual([observed]);
  });

  it('fails closed when the registry or the report cannot be scoped', () => {
    const report = workerDependencyReport('@supabase/supabase-js', 'moderate', 'GHSA-2345-2345-2345');

    expect(scopeExceptionRegistryToReport('not-a-registry', report)).toEqual([]);
    expect(scopeExceptionRegistryToReport([currentException()], { auditReportVersion: 1 })).toEqual([]);
  });
});
