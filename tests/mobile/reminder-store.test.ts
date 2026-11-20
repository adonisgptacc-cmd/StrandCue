import { describe, expect, it } from 'vitest';

type KeyValueStorage = {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
};

function memoryStorage(): KeyValueStorage & { keys(): string[] } {
  const values = new Map<string, string>();
  return {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async key => { values.delete(key); },
    keys: () => [...values.keys()],
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

describe('device-local reminder store', () => {
  it('defaults disabled, isolates each owner, validates persisted state, and clears only that owner', async () => {
    const module = await import('../../apps/mobile/src/reminder-store.ts').catch(() => null);
    const createStore = Reflect.get(module ?? {}, 'createReminderStore') as
      | ((storage: KeyValueStorage) => {
          load(ownerKey: string): Promise<unknown>;
          save(ownerKey: string, state: unknown): Promise<void>;
          clear(ownerKey: string): Promise<void>;
        })
      | undefined;
    expect(createStore).toBeTypeOf('function');
    if (!createStore) return;

    const storage = memoryStorage();
    const store = createStore(storage);
    const initial = await store.load('owner-a');
    expect(initial).toMatchObject({
      version: 1,
      ownerKey: 'owner-a',
      plans: [],
      preferences: {
        ownerKey: 'owner-a',
        enabled: {
          planned_routine: false,
          delayed_cue_check: false,
          product_review: false,
        },
        quietHours: null,
      },
    });

    await store.save('owner-a', {
      ...initial as object,
      plans: [{
        id: 'local-plan-a',
        ownerKey: 'owner-a',
        category: 'planned_routine',
        localDate: '2026-11-02',
        localTime: '09:00',
        dismissed: false,
      }],
    });
    expect(storage.keys()).toEqual(['strandcue-reminders-v1-owner-a']);
    expect(storage.keys().every(key => /^[A-Za-z0-9._-]+$/.test(key))).toBe(true);
    expect((await store.load('owner-a'))).toMatchObject({ plans: [{ id: 'local-plan-a' }] });
    expect(await store.load('owner-b')).toMatchObject({ ownerKey: 'owner-b', plans: [] });

    await store.clear('owner-a');
    expect(await store.load('owner-a')).toMatchObject({ plans: [] });
    expect(await store.load('owner-b')).toMatchObject({ ownerKey: 'owner-b', plans: [] });
  });

  it('rejects malformed persisted data instead of silently treating it as a fresh owner', async () => {
    const module = await import('../../apps/mobile/src/reminder-store.ts').catch(() => null);
    const createStore = Reflect.get(module ?? {}, 'createReminderStore') as
      | ((storage: KeyValueStorage) => { load(ownerKey: string): Promise<unknown> })
      | undefined;
    expect(createStore).toBeTypeOf('function');
    if (!createStore) return;

    const storage = memoryStorage();
    await storage.setItem('strandcue-reminders-v1-owner-a', '{invalid json');
    await expect(createStore(storage).load('owner-a')).rejects.toThrow('Reminder settings could not be read');
  });

  it('serializes owner cleanup after an in-flight settings write', async () => {
    const module = await import('../../apps/mobile/src/reminder-store.ts');
    const started = deferred<void>();
    const finishWrite = deferred<void>();
    const values = new Map<string, string>();
    const storage: KeyValueStorage = {
      getItem: async key => values.get(key) ?? null,
      setItem: async (key, value) => {
        started.resolve();
        await finishWrite.promise;
        values.set(key, value);
      },
      removeItem: async key => { values.delete(key); },
    };
    const store = module.createReminderStore(storage);
    const initial = await store.load('owner-write-race');
    const save = store.save('owner-write-race', initial);
    await started.promise;
    const clear = store.clear('owner-write-race');
    finishWrite.resolve();
    await Promise.all([save, clear]);

    await expect(store.load('owner-write-race')).resolves.toMatchObject({ plans: [] });
    expect(values.has('strandcue-reminders-v1-owner-write-race')).toBe(false);
  });

  it('invalidates a foreground snapshot as soon as a newer owner mutation starts', async () => {
    const module = await import('../../apps/mobile/src/reminder-store.ts');
    const storage = memoryStorage();
    const store = module.createReminderStore(storage);
    const snapshot = await store.loadVersioned('owner-snapshot-race');
    expect(store.isCurrent('owner-snapshot-race', snapshot.revision)).toBe(true);

    await store.save('owner-snapshot-race', snapshot.state);

    expect(store.isCurrent('owner-snapshot-race', snapshot.revision)).toBe(false);
  });

  it('reads through a pending owner write before returning its current revision', async () => {
    const module = await import('../../apps/mobile/src/reminder-store.ts');
    const started = deferred<void>();
    const finishWrite = deferred<void>();
    const values = new Map<string, string>();
    const storage: KeyValueStorage = {
      getItem: async key => values.get(key) ?? null,
      setItem: async (key, value) => {
        started.resolve();
        await finishWrite.promise;
        values.set(key, value);
      },
      removeItem: async key => { values.delete(key); },
    };
    const store = module.createReminderStore(storage);
    const initial = await store.load('owner-pending-read');
    const changed = { ...initial, plans: [{
      id: 'new-plan', ownerKey: 'owner-pending-read', category: 'planned_routine' as const,
      localDate: '2030-01-01', localTime: '09:00', dismissed: false,
    }] };
    const save = store.save('owner-pending-read', changed);
    await started.promise;
    const load = store.loadVersioned('owner-pending-read');
    finishWrite.resolve();
    await save;
    const snapshot = await load;

    expect(snapshot.state.plans).toEqual(changed.plans);
    expect(store.isCurrent('owner-pending-read', snapshot.revision)).toBe(true);
  });
});
