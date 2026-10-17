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

type DependabotEntry = { ecosystem: string; body: string };

async function dependabotSource(): Promise<string> {
  return normalizeLineEndings(await readFile('.github/dependabot.yml', 'utf8'));
}

function dependabotEntries(source: string): DependabotEntry[] {
  const lines = source.split('\n');
  const starts: number[] = [];
  for (let index = 0; index < lines.length; index++) {
    if (/^ {2}- package-ecosystem: \S+$/.test(lines[index])) starts.push(index);
  }
  return starts.map((start, index) => ({
    ecosystem: lines[start].trim().replace('- package-ecosystem: ', ''),
    body: lines.slice(start, starts[index + 1] ?? lines.length).join('\n'),
  }));
}

function dependabotEntry(source: string, ecosystem: string, directory: string): string {
  const directoryLine = new RegExp(`^ {4}directory: ${directory.replace(/[/\\]/g, '\\$&')}$`, 'm');
  const matches = dependabotEntries(source)
    .filter(entry => entry.ecosystem === ecosystem)
    .filter(entry => directoryLine.test(entry.body));
  expect(matches.length, `${ecosystem} at ${directory}`).toBe(1);
  return matches[0].body;
}

function dependabotGroup(entryBody: string, group: string): string {
  const lines = entryBody.split('\n');
  const start = lines.findIndex(line => line === `      ${group}:`);
  expect(start, `group ${group}`).toBeGreaterThanOrEqual(0);
  const end = lines.findIndex((line, index) => index > start && /^ {6}\S/.test(line));
  return lines.slice(start, end === -1 ? lines.length : end).join('\n');
}

describe('Dependabot dependency automation', () => {
  it('keeps the reviewed root npm and github-actions entries unchanged', async () => {
    const source = await dependabotSource();
    expect(source).toMatch(/^version: 2$/m);

    const rootNpm = dependabotEntry(source, 'npm', '/');
    expect(rootNpm).toMatch(/^ {4}schedule:\n {6}interval: weekly$/m);
    expect(rootNpm).toMatch(/^ {4}open-pull-requests-limit: 5$/m);
    const expoGroup = dependabotGroup(rootNpm, 'expo-compatible');
    expect(expoGroup).toMatch(/^ {8}patterns: \['expo', 'expo-\*', '@expo\/\*'\]$/m);
    expect(expoGroup).toMatch(/^ {8}update-types: \[minor, patch\]$/m);

    const actions = dependabotEntry(source, 'github-actions', '/');
    expect(actions).toMatch(/^ {4}schedule:\n {6}interval: weekly$/m);
    expect(actions).not.toMatch(/open-pull-requests-limit/);
  });

  it('monitors the deletion worker with a bounded weekly grouped cadence', async () => {
    const source = await dependabotSource();
    const worker = dependabotEntry(source, 'npm', '/workers/account-deletion');

    expect(worker).toMatch(/^ {4}schedule:\n {6}interval: weekly$/m);
    expect(worker).toMatch(/^ {4}open-pull-requests-limit: \d+$/m);

    const group = dependabotGroup(worker, 'worker-minor-and-patch');
    expect(group).toMatch(/^ {8}update-types: \[minor, patch\]$/m);
    expect(group).not.toMatch(/\bmajor\b/);
  });
});

async function workflowNames(): Promise<string[]> {
  return (await readdir('.github/workflows'))
    .filter(name => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort();
}

function permissionScopes(jobBlock: string): string[] {
  return jobBlock
    .split('\n')
    .filter(line => /^ {6}[a-z-]+:/.test(line))
    .map(line => line.trim().split(':')[0]);
}

type PermissionEntry = { scope: string; value: string };

function permissionEntries(block: readonly string[], pattern: RegExp): PermissionEntry[] {
  return block
    .filter(line => pattern.test(line))
    .map(line => {
      const [scope, ...rest] = line.trim().split(':');
      return { scope, value: rest.join(':').trim() };
    });
}

function jobPermissionEntries(jobBlock: string): PermissionEntry[] {
  return permissionEntries(jobBlock.split('\n'), /^ {6}[a-z-]+:\s*\S/);
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

function workflowPermissionEntries(source: string): PermissionEntry[] {
  const lines = source.split('\n');
  const start = lines.findIndex(line => /^permissions:/.test(line));
  if (start === -1) return [{ scope: '<missing>', value: '' }];
  if (/^permissions:\s*\{\}\s*$/.test(lines[start])) return [];

  const block: string[] = [];
  for (let index = start + 1; index < lines.length && /^ {2}[a-z-]+:/.test(lines[index]); index++) {
    block.push(lines[index]);
  }
  return permissionEntries(block, /^ {2}[a-z-]+:\s*\S/);
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
      // An outright ban: these helpers can fetch and execute a package at run time.
      expect(source, `${name}: npx`).not.toMatch(/\bnpx\b/);
      expect(source, `${name}: npm exec`).not.toMatch(/\bnpm\s+exec\b/);
      expect(source, `${name}: yarn`).not.toMatch(/\byarn\b/);
      expect(source, `${name}: pnpm`).not.toMatch(/\bpnpm\b/);
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

  it('refuses to retain a build result that could contain the release credential', async () => {
    const android = await workflow('android-build.yml');
    const easSteps = android
      .split('\n      - ')
      .filter(step => step.includes('secrets.EXPO_TOKEN'));
    expect(easSteps).toHaveLength(1);
    const [easStep] = easSteps;
    // Scan the artifact before it can be uploaded; fail closed if the token appears.
    expect(easStep).toContain('grep -qF -- "$EXPO_TOKEN" eas-build-result.json');
    expect(easStep).toMatch(/refusing to upload it/i);
    expect(easStep).toContain('exit 1');
    expect(easStep).toContain('set -euo pipefail');
    // The guard must not echo the token value.
    expect(easStep).not.toMatch(/echo[^\n]*\$\{?EXPO_TOKEN/);
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
      // Assert the value, not just the scope name: `contents: write` must fail.
      for (const entry of workflowPermissionEntries(source)) {
        expect(entry, `${name} workflow-level ${entry.scope}`)
          .toEqual({ scope: 'contents', value: 'read' });
      }

      const jobs = jobBlocks(source);
      expect(jobs.length, name).toBeGreaterThan(0);
      for (const job of jobs) {
        const jobName = job.split('\n')[0].trim();
        expect(
          permissionScopes(job).filter(scope => scope !== 'contents'),
          `${name}/${jobName} job permissions`,
        ).toEqual([]);
        for (const entry of jobPermissionEntries(job)) {
          expect(entry, `${name}/${jobName} job ${entry.scope}`)
            .toEqual({ scope: 'contents', value: 'read' });
        }
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
