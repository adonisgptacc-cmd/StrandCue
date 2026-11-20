import { access, readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

const removedDrafts = [
  'apps/mobile/src/screens/ActivityScreen.tsx',
  'apps/mobile/src/screens/ActivityCorrectScreen.tsx',
  'apps/mobile/src/screens/ActivityVoidScreen.tsx',
  'apps/mobile/src/screens/HeatEventForm.tsx',
];

describe('rebaselined production surface', () => {
  it.each(removedDrafts)('does not compile the unsafe draft %s', async (path) => {
    await expect(access(path)).rejects.toThrow();
  });

  it('records why the drafts were removed and where their history remains', async () => {
    const disposition = await readFile('docs/verification/activity-draft-disposition.md', 'utf8');
    expect(disposition).toContain('53a88a5');
    expect(disposition).toContain('direct table writes');
    expect(disposition).toContain('not routed');
    expect(disposition).toContain('separate Activity implementation plan');
  });

  it('defines each mobile workspace script once in source text', async () => {
    const source = await readFile('apps/mobile/package.json', 'utf8');
    for (const script of ['start', 'web', 'typecheck', 'export:web']) {
      expect(source.match(new RegExp(`"${script}"\\s*:`, 'g'))).toHaveLength(1);
    }
  });

  it('provides repeatable local checks while keeping advisories in full verification', async () => {
    const root = JSON.parse(await readFile('package.json', 'utf8')) as {
      scripts: Record<string, string>;
    };
    for (const stage of ['check:runtime', 'typecheck', 'lint', 'test:coverage', 'audit:control-plane', 'export:web']) {
      expect(root.scripts['verify:offline']).toContain(stage);
    }
    expect(root.scripts.verify).toContain('verify:offline');
    expect(root.scripts.verify).toContain('check:expo');
    expect(root.scripts['audit:dependencies']).toBe('node scripts/audit-dependencies-cli.ts');
    expect(root.scripts['verify:offline']).not.toContain('audit:dependencies');
    expect(root.scripts.verify).toContain('audit:dependencies');
  });
});
