import { readFile, readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

import { normalizeLineEndings } from '../helpers/normalize-line-endings';

async function workflow(name: string): Promise<string> {
  return normalizeLineEndings(await readFile(`.github/workflows/${name}`, 'utf8'));
}

function jobBlocks(source: string): string[] {
  // Split a workflow body into per-job chunks at two-space job headers.
  const lines = source.split('\n');
  const starts: number[] = [];
  let inJobs = false;
  for (let i = 0; i < lines.length; i++) {
    if (/^jobs:\s*$/.test(lines[i])) { inJobs = true; continue; }
    if (inJobs && /^  [A-Za-z0-9_-]+:\s*$/.test(lines[i])) starts.push(i);
  }
  return starts.map((start, index) => lines.slice(start, starts[index + 1] ?? lines.length).join('\n'));
}

describe('CI workflow contracts', () => {
  it('publishes stable protection check names for every pull request gate', async () => {
    const verify = await workflow('verify.yml');
    for (const [job, name] of [
      ['test', 'quality'],
      ['dependency-audit', 'dependency-audit'],
      ['supabase-api', 'supabase-api'],
      ['secret-scan', 'secret-scan'],
    ]) {
      expect(verify).toMatch(new RegExp(`  ${job}:\\r?\\n    name: ${name}(?:\\r?\\n|$)`));
    }
  });

  it('keeps signed Android release checks stable and manually approved', async () => {
    const android = await workflow('android-build.yml');
    expect(android).toMatch(/  verify:\r?\n    name: release-readiness(?:\r?\n|$)/);
    expect(android).toMatch(/  build-android:\r?\n    name: signed-android-build(?:\r?\n|$)/);
    expect(android).toContain('environment: android-release');
    expect(android).toMatch(/on:\n  workflow_dispatch:/);
    expect(android).not.toMatch(/^\s{2}pull_request:/m);
  });

  it('gates every PR on typecheck, tests with coverage, control-plane audit and web export', async () => {
    const verify = await workflow('verify.yml');
    for (const step of ['npm run typecheck', 'npm run test:coverage', 'npm run audit:control-plane', 'npm run export:web']) {
      expect(verify).toContain(step);
    }
    expect(verify).toMatch(/on:\s*\n\s*pull_request:/);
  });

  it('keeps the network-dependent audit out of the deterministic gate', async () => {
    const verify = await workflow('verify.yml');
    const jobs = jobBlocks(verify);
    const auditJobs = jobs.filter(job => job.includes('audit:dependencies'));
    expect(auditJobs.length).toBeGreaterThan(0);
    for (const job of auditJobs) {
      expect(job).not.toContain('npm test');
      expect(job).not.toContain('npm run typecheck');
    }
  });

  it('scans for leaked secrets on every run', async () => {
    const verify = await workflow('verify.yml');
    const secretJob = jobBlocks(verify).find(job => job.startsWith('  secret-scan:'));
    expect(secretJob).toBeDefined();
    expect(secretJob?.toLowerCase()).toMatch(/gitleaks|trufflehog/);
  });

  it('runs all Node jobs on version 24, never a stale pin', async () => {
    for (const name of ['verify.yml', 'android-build.yml']) {
      const source = await workflow(name);
      expect(source).not.toMatch(/NODE_VERSION:\s*['"]?20['"]?/);
      expect(source).not.toMatch(/node-version:\s*['"]?(20|18|16)['"]?\s*$/m);
    }
    const verify = await workflow('verify.yml');
    expect(verify).toMatch(/node-version-file:\s*\.nvmrc|node-version:\s*['"]?24/);
  });

  it('pins every external action to an immutable commit', async () => {
    for (const name of (await readdir('.github/workflows')).filter(name => name.endsWith('.yml'))) {
      for (const match of (await workflow(name)).matchAll(/uses:\s*([^\s#]+)/g)) {
        expect(match[1], `${name}: ${match[1]}`).toMatch(/^[\w.-]+\/[\w./-]+@[a-f0-9]{40}$/);
      }
    }
  });

  it('replays local migrations and tests real Auth/PostgREST on every PR', async () => {
    const verify = await workflow('verify.yml');
    expect(verify).toContain('supabase start');
    expect(verify).toContain('supabase db reset --local');
    expect(verify).toContain('STRANDCUE_SUPABASE_API_TEST:');
    expect(verify).toContain('tests/database/supabase-api.test.ts');
    expect(verify).toContain('supabase stop --no-backup');
    expect(verify).not.toContain('secrets.STRANDCUE_SUPABASE');
  });

  it('requires a manual protected release build without automatic publishing', async () => {
    const android = await workflow('android-build.yml');
    expect(android).toMatch(/on:\s*\n\s*workflow_dispatch:/);
    expect(android).not.toMatch(/^\s{2}(push|pull_request|schedule):/m);
    expect(android).toContain('environment: android-release');
    expect(android).toContain('npm run verify');
    expect(android).not.toContain('eas submit');
    expect(android).not.toContain('matrix:');
    expect(android).not.toContain('@latest');
    expect(android).not.toMatch(/\$\{\{\s*secrets\.[^}]+\}\}.*\|\s*base64/);
  });

  it('provides full verification without silently dropping the advisory gate', async () => {
    const manifest = JSON.parse(await readFile('package.json', 'utf8'));
    expect(manifest.scripts.verify).toContain('audit:dependencies');
    expect(manifest.scripts['verify:offline']).toContain('test:coverage');
    expect(manifest.scripts['verify:offline']).not.toContain('audit:dependencies');
  });
});

async function workflowNames(): Promise<string[]> {
  return (await readdir('.github/workflows')).filter(name => name.endsWith('.yml')).sort();
}

function permissionScopes(jobBlock: string): string[] {
  return jobBlock
    .split('\n')
    .filter(line => /^ {6}[a-z-]+:/.test(line))
    .map(line => line.trim().split(':')[0]);
}

function workflowPermissionScopes(source: string): string[] {
  const lines = source.split('\n');
  const start = lines.findIndex(line => /^permissions:/.test(line));
  if (start === -1) return ['<missing>'];
  if (/^permissions:\s*\{\}\s*$/.test(lines[start])) return [];

  const scopes: string[] = [];
  for (let index = start + 1; index < lines.length && /^ {2}[a-z-]+:/.test(lines[index]); index++) {
    scopes.push(lines[index].trim().split(':')[0]);
  }
  return scopes;
}

describe('CI tooling supply chain', () => {
  it('never fetches a package at run time inside a workflow', async () => {
    for (const name of await workflowNames()) {
      const source = await workflow(name);
      expect(source, `${name}: npx --yes`).not.toMatch(/npx\s+(--yes|-y)\b/);
      expect(source, `${name}: npm install --no-save`)
        .not.toMatch(/npm\s+install\b[^\n]*--no-save/);
      expect(source, `${name}: npm install --package-lock=false`)
        .not.toMatch(/npm\s+install\b[^\n]*--package-lock=false/);
      expect(source, `${name}: npm install <package>@<version>`)
        .not.toMatch(/npm\s+install\b[^\n]*@\d/);
    }
  });

  it('installs every dependency graph from a committed lockfile without lifecycle scripts', async () => {
    for (const name of await workflowNames()) {
      const source = await workflow(name);
      const installLines = source
        .split('\n')
        .filter(line => /\bnpm\s+(ci|install)\b/.test(line));
      expect(installLines.length, `${name}: no install step found`).toBeGreaterThan(0);
      for (const line of installLines) {
        expect(line.trim(), `${name}: ${line.trim()}`).toMatch(/npm ci --ignore-scripts\b/);
      }
    }
  });

  it('keeps the release credential confined to the single locked EAS step', async () => {
    const android = await workflow('android-build.yml');
    const secretReferences = [...android.matchAll(/secrets\.[A-Za-z0-9_]+/g)]
      .map(match => match[0]);
    expect(secretReferences).toEqual(['secrets.EXPO_TOKEN']);

    const easSteps = android
      .split('\n      - ')
      .filter(step => step.includes('secrets.EXPO_TOKEN'));
    expect(easSteps).toHaveLength(1);
    const [easStep] = easSteps;
    expect(easStep).toContain('EXPO_TOKEN: ${{ secrets.EXPO_TOKEN }}');
    expect(easStep).toContain('test -n "$EXPO_TOKEN"');
    expect(easStep).toContain(
      '"$EAS_CLI" build --platform android --profile "$BUILD_PROFILE"'
      + ' --non-interactive --wait --json > eas-build-result.json',
    );
    expect(easStep).toContain(
      'EAS_CLI="$GITHUB_WORKSPACE/tools/eas-runner/node_modules/.bin/eas"',
    );
    expect(easStep).toContain('test -x "$EAS_CLI"');
    expect(easStep, 'the credential step must not fetch or install anything')
      .not.toContain('npx');
    expect(easStep).not.toContain('npm ci');
    expect(easStep).not.toContain('npm install');
  });

  it('installs the locked EAS runner without ever holding the release credential', async () => {
    const android = await workflow('android-build.yml');
    const runnerSteps = android
      .split('\n      - ')
      .filter(step => step.includes('--prefix tools/eas-runner'));
    expect(runnerSteps).toHaveLength(1);
    const [runnerStep] = runnerSteps;
    expect(runnerStep).toContain('npm ci --ignore-scripts --prefix tools/eas-runner');
    expect(runnerStep).not.toContain('secrets.');
    expect(runnerStep).not.toContain('EXPO_TOKEN');
  });

  it('pins the release EAS CLI in a committed isolated lockfile outside the workspace', async () => {
    const manifest = JSON.parse(await readFile('tools/eas-runner/package.json', 'utf8'));
    expect(manifest.private).toBe(true);
    expect(manifest.dependencies['eas-cli']).toBe('24.10.0');

    const lock = JSON.parse(await readFile('tools/eas-runner/package-lock.json', 'utf8'));
    expect(lock.packages['node_modules/eas-cli'].version).toBe('24.10.0');

    // The release CLI stays out of the audited workspace dependency tree.
    const mobile = JSON.parse(await readFile('apps/mobile/package.json', 'utf8'));
    expect(mobile.devDependencies?.['eas-cli']).toBeUndefined();
    expect(mobile.dependencies?.['eas-cli']).toBeUndefined();
    const rootLock = JSON.parse(await readFile('package-lock.json', 'utf8'));
    expect(rootLock.packages['node_modules/eas-cli']).toBeUndefined();
  });

  it('never grants more than contents: read anywhere in a workflow', async () => {
    for (const name of await workflowNames()) {
      const source = await workflow(name);
      const workflowScopes = workflowPermissionScopes(source);
      expect(
        workflowScopes.filter(scope => scope !== 'contents'),
        `${name} workflow-level permissions`,
      ).toEqual([]);

      const jobs = jobBlocks(source);
      expect(jobs.length, name).toBeGreaterThan(0);
      for (const job of jobs) {
        const jobName = job.split('\n')[0].trim();
        expect(
          permissionScopes(job).filter(scope => scope !== 'contents'),
          `${name}/${jobName} job permissions`,
        ).toEqual([]);
      }
    }
  });

  it('disables the default workflow token and grants each owned job only contents: read', async () => {
    for (const name of ['android-build.yml', 'mutation-testing.yml']) {
      const source = await workflow(name);
      expect(source, name).toMatch(/^permissions: \{\}$/m);
      expect(workflowPermissionScopes(source), name).toEqual([]);

      const jobs = jobBlocks(source);
      expect(jobs.length, name).toBeGreaterThan(0);
      for (const job of jobs) {
        const jobName = job.split('\n')[0].trim();
        expect(job, `${name}/${jobName}`).toMatch(/\n    permissions:\n      contents: read\n/);
        expect(permissionScopes(job), `${name}/${jobName}`).toEqual(['contents']);
      }
    }
  });

  it('keeps the manual Android release path reproducible and unpublishable', async () => {
    const android = await workflow('android-build.yml');
    expect(android).toContain('case "$BUILD_PROFILE" in preview|release|playInternal) ;; *) exit 1 ;; esac');
    expect(android).toContain('--non-interactive --wait --json > eas-build-result.json');
    expect(android).toContain('path: apps/mobile/eas-build-result.json');
    expect(android).toContain('if-no-files-found: error');
    expect(android).toContain('environment: android-release');
    expect(android).not.toContain('eas submit');
    expect(android).not.toContain('@latest');
  });
});
