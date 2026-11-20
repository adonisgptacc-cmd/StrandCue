import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('mobile client env wiring', () => {
  it('reads both EAS-wired Supabase env names in client.ts', async () => {
    const source = await readFile('apps/mobile/src/client.ts', 'utf8');
    expect(source).toContain('EXPO_PUBLIC_SUPABASE_URL');
    expect(source).toContain('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  });
});
