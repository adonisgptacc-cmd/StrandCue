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
});
