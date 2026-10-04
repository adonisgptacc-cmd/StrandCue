import { readFile, readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function workflow(name: string): Promise<string> {
  return readFile(`.github/workflows/${name}`, 'utf8');
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
    expect(verify.toLowerCase()).toMatch(/gitleaks|trufflehog|secret.*scan|scan.*secret/);
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
