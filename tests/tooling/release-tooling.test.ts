import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const RUNBOOK = 'docs/runbooks/release-tooling.md';

describe('release tooling runbook contract', () => {
  it('documents the two isolated runners and their exact pins', async () => {
    const doc = await readFile(RUNBOOK, 'utf8');
    expect(doc).toContain('tools/eas-runner');
    expect(doc).toContain('tools/mutation-runner');
    expect(doc).toContain('eas-cli');
    expect(doc).toContain('24.10.0');
    expect(doc).toContain('@stryker-mutator/core');
    expect(doc).toContain('@stryker-mutator/vitest-runner');
    expect(doc).toContain('typescript');
    expect(doc).toContain('6.0.3');
    expect(doc).toContain('vitest');
    expect(doc).toContain('5.0.0');
  });

  it('states that each runner keeps its own committed lockfile outside the npm workspaces', async () => {
    const doc = await readFile(RUNBOOK, 'utf8');
    expect(doc).toContain('tools/eas-runner/package-lock.json');
    expect(doc).toContain('tools/mutation-runner/package-lock.json');
    expect(doc).toMatch(/committed/i);
    expect(doc).toMatch(/deliberately outside the npm workspaces/i);
    expect(doc).toContain('apps/*');
    expect(doc).toContain('packages/*');
  });

  it('records the install and invoke commands the workflows use', async () => {
    const doc = await readFile(RUNBOOK, 'utf8');
    expect(doc).toContain('npm ci --ignore-scripts --prefix tools/eas-runner');
    expect(doc).toContain('npm ci --ignore-scripts --prefix tools/mutation-runner');
    expect(doc).toContain(
      'node tools/mutation-runner/node_modules/@stryker-mutator/core/bin/stryker.js run',
    );
    expect(doc).toContain('$GITHUB_WORKSPACE/tools/eas-runner/node_modules/.bin/eas');
  });

  it('states that both runners are outside the dependency-policy audit surface', async () => {
    const doc = await readFile(RUNBOOK, 'utf8');
    expect(doc).toMatch(/outside the dependency-policy\s+audit surface/i);
    expect(doc).toContain('audit-dependencies-cli.ts');
    expect(doc).toContain('workspaceManifestGlobs');
    expect(doc).toContain('npm run audit:dependencies');
    expect(doc).toMatch(/never sees/i);
  });

  it('records the measured exposure for both runners', async () => {
    const doc = await readFile(RUNBOOK, 'utf8');
    // tools/eas-runner: 15 high / 16 moderate / 1 low, 32 total.
    expect(doc).toContain('| 15 | 16 | 1 | 32 |');
    // tools/mutation-runner: 0 high / 2 moderate / 0 low, 2 total.
    expect(doc).toContain('| 0 | 2 | 0 | 2 |');
  });

  it('explains why the EAS CLI cannot live in the audited workspace', async () => {
    const doc = await readFile(RUNBOOK, 'utf8');
    expect(doc).toContain('scripts/dependency-policy.ts:252-262');
    expect(doc).toContain('scripts/dependency-policy.ts:537-553');
    expect(doc).toMatch(/ADVISORY-SEVERITY/);
    expect(doc).toMatch(/exception/i);
  });

  it('records the open coverage decision and its required owner field', async () => {
    const doc = await readFile(RUNBOOK, 'utf8');
    expect(doc).toContain(
      'Coverage decision owner: <UNASSIGNED - must be named before CI-001 can be closed>',
    );
    expect(doc).toMatch(/CI-001 stays open until that field names an accountable person/i);
    expect(doc).toMatch(/extend the audit surface|separate pinned audit/i);
    expect(doc).toMatch(/accept the risk/i);
  });
});
