import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

describe('mutation testing config is loadable and wired to CI', () => {
  it('stryker.conf.json exists and is valid JSON', () => {
    const path = resolve(__dirname, '../../stryker.conf.json');
    expect(() => JSON.parse(readFileSync(path, 'utf8'))).not.toThrow();
  });

  it('has the expected mutator list for the repo stack', () => {
    const cfg = JSON.parse(readFileSync(resolve(__dirname, '../../stryker.conf.json'), 'utf8'));
    expect(cfg.mutator).toEqual({ '*': ['typescript'] });
    expect(cfg.packageManager).toBe('npm');
  });

  it('targets the domain and database test suites with threshold 10', () => {
    const cfg = JSON.parse(readFileSync(resolve(__dirname, '../../stryker.conf.json'), 'utf8'));
    expect(cfg.thresholds).toEqual({ high: 10, low: 10, break: 0 });
    expect(cfg.testRunner).toBe('vitest');
    expect(cfg.coverageAnalysis).toBe('perTest');
  });

  it('CI workflow has a mutation-testing job that uploads artifacts', () => {
    const workflow = readFileSync(resolve(__dirname, '../../.github/workflows/mutation-testing.yml'), 'utf8');
    expect(workflow).toContain('name: Mutation Testing');
    expect(workflow).toContain('uses: actions/checkout');
    expect(workflow).toContain('npx stryker run');
    expect(workflow).toContain('upload-artifact');
  });
});