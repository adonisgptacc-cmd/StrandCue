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

  it('mutates domain implementation rather than its tests', () => {
    const cfg = JSON.parse(readFileSync(resolve(__dirname, '../../stryker.conf.json'), 'utf8'));
    expect(cfg.mutate).toEqual(['packages/domain/src/**/*.ts']);
    expect(cfg.vitest.configFile).toBe('vitest.config.ts');
    expect(cfg.packageManager).toBe('npm');
  });

  it('targets the domain and database test suites with threshold 10', () => {
    const cfg = JSON.parse(readFileSync(resolve(__dirname, '../../stryker.conf.json'), 'utf8'));
    expect(cfg.thresholds).toEqual({ high: 10, low: 10, break: 0 });
    expect(cfg.testRunner).toBe('vitest');
    expect(cfg.coverageAnalysis).toBe('perTest');
  });

  it('CI workflow runs the isolated mutation runner from a committed lockfile', () => {
    const workflow = readFileSync(resolve(__dirname, '../../.github/workflows/mutation-testing.yml'), 'utf8');
    expect(workflow).toContain('name: Mutation Testing');
    expect(workflow).toContain('uses: actions/checkout');
    expect(workflow).toContain('npm ci --ignore-scripts');
    expect(workflow).toContain('npm ci --ignore-scripts --prefix tools/mutation-runner');
    expect(workflow).toContain(
      'node tools/mutation-runner/node_modules/@stryker-mutator/core/bin/stryker.js run',
    );
    expect(workflow).not.toContain('npx --yes');
    expect(workflow).not.toContain('npm install');
    expect(workflow).not.toContain('--no-save');
    expect(workflow).not.toContain('--package-lock=false');
    expect(workflow).not.toContain('.superpowers/mutation-tools');
    expect(workflow).toContain('upload-artifact');
  });

  it('pins the isolated mutation runner to exact versions in a committed lockfile', () => {
    const manifest = JSON.parse(
      readFileSync(resolve(__dirname, '../../tools/mutation-runner/package.json'), 'utf8'),
    ) as { private?: boolean; dependencies?: Record<string, string> };
    expect(manifest.private).toBe(true);
    expect(manifest.dependencies).toEqual({
      '@stryker-mutator/core': '10.1.1',
      '@stryker-mutator/vitest-runner': '10.1.1',
      'typescript': '6.0.3',
      'vitest': '5.0.5',
    });

    const lock = JSON.parse(
      readFileSync(resolve(__dirname, '../../tools/mutation-runner/package-lock.json'), 'utf8'),
    ) as { lockfileVersion?: number; packages?: Record<string, { version?: string }> };
    expect(lock.lockfileVersion).toBe(3);
    for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
      expect(lock.packages?.[`node_modules/${name}`]?.version, name).toBe(version);
    }
  });
});
