import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  workspaceManifestCandidates,
  validateWorkspaceManifestPaths,
  workspaceManifestGlobs,
} from '../../scripts/workspace-manifests';

const rootManifest = {
  name: 'strandcue',
  workspaces: ['packages/*', 'apps/*'],
};

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

describe('workspace manifest inventory', () => {
  it('does not claim a root uuid override while the reviewed Expo tooling path remains installed', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8'),
    ) as { overrides?: Record<string, unknown> };

    expect(manifest.overrides?.uuid).toBeUndefined();
  });

  it('builds deterministic manifest globs for the supported workspace roots', () => {
    expect(workspaceManifestGlobs(rootManifest)).toEqual([
      'apps/*/package.json',
      'packages/*/package.json',
    ]);
  });

  it.each([
    ['escaping parent', '../*'],
    ['absolute root', '/apps/*'],
    ['recursive wildcard', 'apps/**'],
    ['nested path', 'apps/*/nested'],
    ['unapproved root', 'secrets/*'],
    ['fixed package path', 'apps/mobile'],
  ])('rejects %s before constructing a filesystem glob', (_caseName, pattern) => {
    expect(() => workspaceManifestGlobs({
      name: 'strandcue',
      workspaces: [pattern],
    })).toThrow('WORKSPACE-INVENTORY');
  });

  it('normalizes and sorts discovered workspace manifest paths', () => {
    expect(validateWorkspaceManifestPaths(rootManifest, [
      'packages/domain/package.json',
      'apps/mobile/package.json',
    ])).toEqual([
      'apps/mobile/package.json',
      'packages/domain/package.json',
    ]);
  });

  it('enumerates newly added apps and packages workspace candidates deterministically', () => {
    expect(workspaceManifestCandidates(rootManifest, {
      apps: ['mobile', 'companion'],
      packages: ['runtime', 'domain'],
    })).toEqual([
      'apps/companion/package.json',
      'apps/mobile/package.json',
      'packages/domain/package.json',
      'packages/runtime/package.json',
    ]);
  });

  it.each([
    ['missing declared root', { apps: ['mobile'] }],
    ['unexpected root', { apps: ['mobile'], packages: ['domain'], secrets: ['tokens'] }],
    ['duplicate directory', { apps: ['mobile', 'mobile'], packages: ['domain'] }],
    ['escaping directory', { apps: ['..'], packages: ['domain'] }],
    ['nested directory', { apps: ['nested/mobile'], packages: ['domain'] }],
  ])('rejects %s in directory discovery', (_caseName, directories) => {
    expect(() => workspaceManifestCandidates(rootManifest, directories))
      .toThrow('WORKSPACE-INVENTORY');
  });

  it.each([
    ['duplicate path', ['apps/mobile/package.json', 'apps/mobile/package.json']],
    ['escaping path', ['../.env']],
    ['nested escape', ['apps/mobile/../../.env']],
    ['non-manifest file', ['apps/mobile/secrets.json']],
    ['unapproved root', ['other/hidden/package.json']],
    ['unsafe package segment', ['apps/.hidden/package.json']],
  ])('rejects %s from filesystem discovery', (_caseName, paths) => {
    expect(() => validateWorkspaceManifestPaths(rootManifest, paths))
      .toThrow('WORKSPACE-INVENTORY');
  });
});
