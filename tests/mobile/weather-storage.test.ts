import { describe, expect, it } from 'vitest';

import { createWeatherStorage, type WeatherStorageBackend } from '../../apps/mobile/src/weather/weather-storage.ts';

const HOME = {
  providerLocationId: 'open-meteo:1', displayLabel: 'Durban, KwaZulu-Natal, South Africa', timezone: 'Africa/Johannesburg',
};
const TRAVEL = {
  place: { providerLocationId: 'open-meteo:2', displayLabel: 'Cape Town, Western Cape, South Africa', timezone: 'Africa/Johannesburg' },
  startDate: '2026-11-03', endDate: '2026-11-06', timezone: 'Africa/Johannesburg',
};

function memoryStorage(): WeatherStorageBackend & { readonly values: Map<string, string> } {
  const values = new Map<string, string>();
  return {
    values,
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async key => { values.delete(key); },
  };
}

describe('owner-keyed weather storage', () => {
  it('isolates saved home and temporary travel places by owner', async () => {
    const backend = memoryStorage();
    const alice = createWeatherStorage(backend, '11111111-1111-4111-8111-111111111111');
    const bob = createWeatherStorage(backend, '22222222-2222-4222-8222-222222222222');
    await alice.save({ home: HOME, travel: TRAVEL }, 0);
    expect((await alice.loadVersioned()).settings).toEqual({ home: HOME, travel: TRAVEL });
    expect((await bob.loadVersioned()).settings).toEqual({ home: null, travel: null });
  });

  it('serializes concurrent writes and rejects stale revisions', async () => {
    const storage = createWeatherStorage(memoryStorage(), '11111111-1111-4111-8111-111111111111');
    const initial = await storage.loadVersioned();
    const writes = await Promise.allSettled([
      storage.save({ home: HOME, travel: null }, initial.revision),
      storage.save({ home: null, travel: TRAVEL }, initial.revision),
    ]);
    expect(writes.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(writes.filter(result => result.status === 'rejected')).toHaveLength(1);
    expect((await storage.loadVersioned()).revision).toBe(1);
  });

  it('keeps weather snapshots out of persisted location settings and clears owner data and cache keys', async () => {
    const backend = memoryStorage();
    const storage = createWeatherStorage(backend, '11111111-1111-4111-8111-111111111111');
    await storage.save({ home: HOME, travel: null }, 0);
    expect(JSON.stringify([...backend.values.values()])).not.toMatch(/temperatureC|latitude|longitude|forecastAt/);
    await storage.clearWeatherCache();
    expect((await storage.loadVersioned()).settings.home).toEqual(HOME);
    await storage.clearOwner();
    expect((await storage.loadVersioned()).settings).toEqual({ home: null, travel: null });
    expect(backend.values.size).toBe(0);
  });

  it('rejects malformed owner keys and invalid saved location or travel values', async () => {
    const backend = memoryStorage();
    expect(() => createWeatherStorage(backend, 'owner/one')).toThrow();
    const storage = createWeatherStorage(backend, '11111111-1111-4111-8111-111111111111');
    await expect(storage.save({ home: { ...HOME, latitude: -29 }, travel: null } as never, 0)).rejects.toThrow();
    await expect(storage.save({ home: null, travel: { ...TRAVEL, endDate: '2026-11-01' } }, 0)).rejects.toThrow();
  });
});
