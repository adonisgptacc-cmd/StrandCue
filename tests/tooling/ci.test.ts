import { readFile } from 'node:fs/promises';
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
    for (const step of ['npm run typecheck', 'npm test', 'npm run test:coverage', 'npm run audit:control-plane', 'npm run export:web']) {
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
});
