import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  auditLockAgreement,
  satisfiesVersionSpec,
  type LockAgreementFinding,
} from '../../scripts/lock-agreement';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

type Manifest = {
  name: string;
  version?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

type LockedPackage = { version?: string; link?: boolean; resolved?: string };

function lockEntry(
  manifest: Manifest,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    name: manifest.name,
    ...(manifest.version === undefined ? {} : { version: manifest.version }),
    ...(manifest.dependencies === undefined ? {} : { dependencies: manifest.dependencies }),
    ...(manifest.devDependencies === undefined
      ? {}
      : { devDependencies: manifest.devDependencies }),
    ...overrides,
  };
}

function lockfile(
  entry: Record<string, unknown>,
  packages: Record<string, LockedPackage>,
): Record<string, unknown> {
  return {
    name: 'strandcue',
    version: '0.1.0',
    lockfileVersion: 3,
    requires: true,
    packages: { '': entry, ...packages },
  };
}

const rootManifest: Manifest = {
  name: 'strandcue',
  version: '0.1.0',
  dependencies: { zod: '4.5.4' },
  devDependencies: { typescript: '~6.0.3' },
};

function auditRoot(
  packages: Record<string, LockedPackage>,
  entryOverrides: Record<string, unknown> = {},
): LockAgreementFinding[] {
  return auditLockAgreement([{
    manifestPath: 'package.json',
    manifest: rootManifest,
    lockPath: 'package-lock.json',
    lock: lockfile(lockEntry(rootManifest, entryOverrides), packages),
  }]);
}

const agreedPackages: Record<string, LockedPackage> = {
  'node_modules/zod': { version: '4.5.4' },
  'node_modules/typescript': { version: '6.0.3' },
};

describe('lock agreement gate', () => {
  it('accepts a manifest whose direct and development specs match the lock', () => {
    expect(auditRoot(agreedPackages)).toEqual([]);
  });

  it('accepts a tilde range resolved to a later compatible patch', () => {
    expect(auditRoot({
      'node_modules/zod': { version: '4.5.4' },
      'node_modules/typescript': { version: '6.0.9' },
    })).toEqual([]);
  });

  it('fails when an exact spec and its locked resolution disagree', () => {
    const findings = auditRoot({
      'node_modules/zod': { version: '4.5.5' },
      'node_modules/typescript': { version: '6.0.3' },
    });

    expect(findings.map(finding => finding.code)).toEqual(['LOCK-DRIFT']);
    expect(findings[0].manifestPath).toBe('package.json');
    expect(findings[0].detail).toContain('zod');
    expect(findings[0].detail).toContain('4.5.5');
    expect(findings[0].detail).toContain('4.5.4');
  });

  it('fails when a range spec and its locked resolution disagree', () => {
    const findings = auditRoot({
      'node_modules/zod': { version: '4.5.4' },
      'node_modules/typescript': { version: '6.1.0' },
    });

    expect(findings.map(finding => finding.code)).toEqual(['LOCK-DRIFT']);
    expect(findings[0].detail).toContain('typescript');
  });

  it('fails when a declared dependency has no locked resolution', () => {
    const findings = auditRoot({ 'node_modules/zod': { version: '4.5.4' } });

    expect(findings.map(finding => finding.code)).toEqual(['LOCK-UNRESOLVED']);
    expect(findings[0].detail).toContain('typescript');
  });

  it('fails when the lock root entry disagrees with the manifest', () => {
    const changed = auditLockAgreement([{
      manifestPath: 'package.json',
      manifest: rootManifest,
      lockPath: 'package-lock.json',
      lock: lockfile(lockEntry(rootManifest, { dependencies: { zod: '4.5.3' } }), agreedPackages),
    }]);
    expect(changed.map(finding => finding.code)).toEqual(['LOCK-MANIFEST-MISMATCH']);

    const dropped = auditLockAgreement([{
      manifestPath: 'package.json',
      manifest: rootManifest,
      lockPath: 'package-lock.json',
      lock: lockfile(lockEntry(rootManifest, { dependencies: {} }), agreedPackages),
    }]);
    expect(dropped.map(finding => finding.code)).toEqual(['LOCK-MANIFEST-MISMATCH']);

    const renamed = auditLockAgreement([{
      manifestPath: 'package.json',
      manifest: rootManifest,
      lockPath: 'package-lock.json',
      lock: lockfile(lockEntry(rootManifest, { name: 'other' }), agreedPackages),
    }]);
    expect(renamed.map(finding => finding.code)).toEqual(['LOCK-MANIFEST-MISMATCH']);
  });

  it('fails when the lock entry records a different version than the manifest', () => {
    const findings = auditRoot(agreedPackages, { version: '9.9.9' });

    expect(findings.map(finding => finding.code)).toEqual(['LOCK-MANIFEST-MISMATCH']);
    expect(findings[0].detail).toContain('9.9.9');
    expect(findings[0].detail).toContain('0.1.0');
  });

  it('fails when a locked resolution records no version', () => {
    const findings = auditRoot({
      'node_modules/zod': { version: '4.5.4' },
      'node_modules/typescript': {},
    });

    expect(findings.map(finding => finding.code)).toEqual(['LOCK-UNRESOLVED']);
    expect(findings[0].detail).toContain('records no version');
  });

  it('accepts a workspace link as the resolution for a workspace dependency', () => {
    const manifest: Manifest = {
      name: '@strandcue/mobile',
      version: '0.1.0',
      dependencies: { '@strandcue/domain': '0.1.0' },
    };
    expect(auditLockAgreement([{
      manifestPath: 'package.json',
      manifest,
      lockPath: 'package-lock.json',
      lock: lockfile(lockEntry(manifest), {
        'node_modules/@strandcue/domain': { resolved: 'packages/domain', link: true },
      }),
    }])).toEqual([]);
  });

  it('resolves a workspace manifest dependency from the lock root or its own node_modules', () => {
    const root: Manifest = { name: 'strandcue', version: '0.1.0' };
    const mobile: Manifest = {
      name: '@strandcue/mobile',
      version: '0.1.0',
      dependencies: { expo: '57.0.22', react: '19.2.3' },
    };

    const hoisted = lockfile(lockEntry(root), {
      'apps/mobile': lockEntry(mobile),
      'node_modules/expo': { version: '57.0.22' },
      'node_modules/react': { version: '19.2.3' },
    });
    expect(auditLockAgreement([{
      manifestPath: 'apps/mobile/package.json',
      manifest: mobile,
      lockPath: 'package-lock.json',
      lock: hoisted,
    }])).toEqual([]);

    const nested = lockfile(lockEntry(root), {
      'apps/mobile': lockEntry(mobile),
      'apps/mobile/node_modules/expo': { version: '57.0.22' },
      'node_modules/react': { version: '19.2.3' },
    });
    expect(auditLockAgreement([{
      manifestPath: 'apps/mobile/package.json',
      manifest: mobile,
      lockPath: 'package-lock.json',
      lock: nested,
    }])).toEqual([]);
  });

  it('fails when a workspace manifest dependency only exists elsewhere in the tree', () => {
    const root: Manifest = { name: 'strandcue', version: '0.1.0' };
    const mobile: Manifest = {
      name: '@strandcue/mobile',
      version: '0.1.0',
      dependencies: { expo: '57.0.22' },
    };

    const findings = auditLockAgreement([{
      manifestPath: 'apps/mobile/package.json',
      manifest: mobile,
      lockPath: 'package-lock.json',
      lock: lockfile(lockEntry(root), {
        'apps/mobile': lockEntry(mobile),
        'packages/domain/node_modules/expo': { version: '57.0.22' },
      }),
    }]);

    expect(findings.map(finding => finding.code)).toEqual(['LOCK-UNRESOLVED']);
  });

  it.each([
    ['unsupported lockfile version', { lockfileVersion: 2, packages: {} }],
    ['missing packages map', { lockfileVersion: 3 }],
    ['missing root entry', { lockfileVersion: 3, packages: {} }],
    ['non-object lock', 'not-a-lock'],
  ])('rejects %s as a malformed lock', (_case, lock) => {
    expect(() => auditLockAgreement([{
      manifestPath: 'package.json',
      manifest: rootManifest,
      lockPath: 'package-lock.json',
      lock,
    }])).toThrow('LOCK-AGREEMENT');
  });

  it('rejects a manifest that escapes its lockfile directory or repeats', () => {
    expect(() => auditLockAgreement([{
      manifestPath: '../outside/package.json',
      manifest: rootManifest,
      lockPath: 'package-lock.json',
      lock: lockfile(lockEntry(rootManifest), agreedPackages),
    }])).toThrow('LOCK-AGREEMENT');

    expect(() => auditLockAgreement([
      {
        manifestPath: 'package.json',
        manifest: rootManifest,
        lockPath: 'package-lock.json',
        lock: lockfile(lockEntry(rootManifest), agreedPackages),
      },
      {
        manifestPath: 'package.json',
        manifest: rootManifest,
        lockPath: 'package-lock.json',
        lock: lockfile(lockEntry(rootManifest), agreedPackages),
      },
    ])).toThrow('LOCK-AGREEMENT');

    expect(() => auditLockAgreement([])).toThrow('LOCK-AGREEMENT');
  });

  it('rejects a manifest without a resolvable name and dependency maps', () => {
    expect(() => auditLockAgreement([{
      manifestPath: 'package.json',
      manifest: { dependencies: { zod: 4 } },
      lockPath: 'package-lock.json',
      lock: lockfile(lockEntry(rootManifest), agreedPackages),
    }])).toThrow('LOCK-AGREEMENT');
  });
});

describe('declared version specs', () => {
  it.each([
    ['exact match', '4.5.4', '4.5.4', true],
    ['exact mismatch', '4.5.5', '4.5.4', false],
    ['tilde patch', '6.0.9', '~6.0.3', true],
    ['tilde minor ceiling', '6.1.0', '~6.0.3', false],
    ['tilde floor', '6.0.2', '~6.0.3', false],
    ['caret minor ceiling', '2.0.0', '^1.2.3', false],
    ['caret below floor', '1.2.2', '^1.2.3', false],
    ['caret within range', '1.9.9', '^1.2.3', true],
    ['caret zero-minor ceiling', '0.3.0', '^0.2.3', false],
    ['caret zero-minor range', '0.2.9', '^0.2.3', true],
    ['wildcard', '5.0.0', '*', true],
    ['wildcard x', '5.0.0', 'x', true],
    ['comparator set inside', '1.5.0', '>=1.2.3 <2.0.0', true],
    ['comparator set outside', '2.5.0', '>=1.2.3 <2.0.0', false],
    ['alternation first branch', '3.0.0', '1.x || 3.x', true],
    ['alternation no branch', '4.0.0', '1.x || 3.x', false],
    ['prerelease is not the release', '1.2.3-rc.1', '1.2.3', false],
    ['exact comparator equal', '1.2.3', '=1.2.3', true],
    ['exact comparator different', '1.2.4', '=1.2.3', false],
    ['exact partial defers to tilde', '1.2.5', '=1.2', true],
    ['exact partial tilde ceiling', '1.3.0', '=1.2', false],
    ['zero-major caret range', '0.0.9', '^0.0', true],
    ['zero-major caret ceiling', '0.1.0', '^0.0', false],
    ['zero-major patch caret inside', '0.0.3', '^0.0.3', true],
    ['zero-major patch caret ceiling', '0.0.4', '^0.0.3', false],
    ['prerelease exact equal', '1.2.3-rc.1', '=1.2.3-rc.1', true],
    ['prerelease build ordering', '1.2.3-rc.2', '=1.2.3-rc.1', false],
    ['prerelease numeric before alpha', '1.2.3-1', '=1.2.3-rc', false],
    ['prerelease alpha alphabetically later', '1.2.3-alpha', '=1.2.3-beta', false],
    ['prerelease shorter ranks lower', '1.2.3-rc', '=1.2.3-rc.1', false],
    ['prerelease longer ranks higher', '1.2.3-rc.1.2', '=1.2.3-rc.1', false],
    ['prerelease range spec fails closed', '1.2.3-rc.2', '>=1.2.3-rc.1', false],
    ['unpinned latest spec fails closed', '5.0.0', 'latest', false],
    ['unparseable spec fails closed', '5.0.0', 'not a range', false],
    ['unparseable version fails closed', 'not a version', '5.0.0', false],
  ])('%s: %s satisfies %s === %s', (_case, version, spec, expected) => {
    expect(satisfiesVersionSpec(version, spec)).toBe(expected);
  });
});

function manifestPaths(): string[] {
  const paths = ['package.json'];
  for (const workspaceRoot of ['apps', 'packages']) {
    for (const name of readdirSync(resolve(repositoryRoot, workspaceRoot))) {
      if (existsSync(resolve(repositoryRoot, workspaceRoot, name, 'package.json'))) {
        paths.push(`${workspaceRoot}/${name}/package.json`);
      }
    }
  }
  paths.push(
    'tools/eas-runner/package.json',
    'tools/mutation-runner/package.json',
    'workers/account-deletion/package.json',
  );
  return paths.sort();
}

function lockPathFor(manifestPath: string): string {
  return manifestPath.startsWith('apps/') || manifestPath.startsWith('packages/')
    ? 'package-lock.json'
    : manifestPath.replace(/package\.json$/, 'package-lock.json');
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(resolve(repositoryRoot, path), 'utf8'));
}

describe('repository lock agreement', () => {
  it('pairs every tracked manifest with a committed lockfile', () => {
    const paths = manifestPaths();
    for (const expected of [
      'package.json',
      'apps/mobile/package.json',
      'packages/domain/package.json',
      'tools/eas-runner/package.json',
      'tools/mutation-runner/package.json',
      'workers/account-deletion/package.json',
    ]) {
      expect(paths).toContain(expected);
    }
    for (const path of paths) {
      expect(existsSync(resolve(repositoryRoot, lockPathFor(path))), path).toBe(true);
    }
  });

  it('finds no disagreement between a manifest and the lockfile CI installs', () => {
    const findings = auditLockAgreement(manifestPaths().map(manifestPath => ({
      manifestPath,
      manifest: readJson(manifestPath),
      lockPath: lockPathFor(manifestPath),
      lock: readJson(lockPathFor(manifestPath)),
    })));

    expect(findings).toEqual([]);
  });
});
