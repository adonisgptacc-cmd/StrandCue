import { expect, it } from 'vitest';
import { createChunkStorage, type SecureBackend } from '../../apps/mobile/src/chunk-storage';

function fixture() {
  const entries = new Map<string, string>();
  let fail = false;
  const backend: SecureBackend = {
    getItem: async key => entries.get(key) ?? null,
    setItem: async (key, value) => { if (fail && key.endsWith('-1')) throw new Error('storage unavailable'); entries.set(key, value); },
    removeItem: async key => { entries.delete(key); },
  };
  let id = 0;
  return { entries, storage: createChunkStorage(backend, () => String(++id)), fail: () => { fail = true; } };
}
it('round-trips a large session in bounded chunks and removes it completely', async () => {
  const {storage, entries} = fixture();
  await storage.setItem('session', 'x'.repeat(4000));
  expect(await storage.getItem('session')).toBe('x'.repeat(4000));
  expect([...entries.values()].every(value => value.length <= 500)).toBe(true);
  await storage.removeItem('session');
  expect(await storage.getItem('session')).toBeNull();
  expect(entries.size).toBe(0);
});
it('does not replace a good session when storing its replacement fails', async () => {
  const {storage, fail} = fixture();
  await storage.setItem('session', 'old');
  fail();
  await expect(storage.setItem('session', 'x'.repeat(2000))).rejects.toThrow();
  expect(await storage.getItem('session')).toBe('old');
});
it('serializes overlapping writes and rejects incomplete saved chunks', async () => {
  const {storage, entries} = fixture();
  await Promise.all([storage.setItem('session', 'first'), storage.setItem('session', 'last')]);
  expect(await storage.getItem('session')).toBe('last');
  entries.delete([...entries.keys()].find(key => key.endsWith('-0'))!);
  await expect(storage.getItem('session')).rejects.toThrow();
});
