import { describe, expect, it, vi } from 'vitest';

import { createWeatherController, type WeatherControllerApi } from '../../apps/mobile/src/weather/weather-controller.ts';
import { createWeatherStorage, type WeatherStorageBackend } from '../../apps/mobile/src/weather/weather-storage.ts';
import type { WeatherContext } from '../../packages/domain/src/weather/weather-context.ts';

const USER = '11111111-1111-4111-8111-111111111111';
const HOME = { providerLocationId: 'open-meteo:1', displayLabel: 'Durban, KwaZulu-Natal, South Africa', timezone: 'Africa/Johannesburg' };
const TRAVEL = { providerLocationId: 'open-meteo:2', displayLabel: 'Cape Town, Western Cape, South Africa', timezone: 'Africa/Johannesburg' };
const CONTEXT: WeatherContext = {
  source: 'open_meteo', placeLabel: HOME.displayLabel,
  fetchedAt: '2026-11-01T10:00:00.000Z', observationAt: '2026-11-01T09:00:00.000Z',
  forecastFor: '2026-11-01T10:00:00.000Z', freshUntil: '2026-11-01T11:00:00.000Z',
  current: { temperatureC: 24, relativeHumidityPercent: 70, dewPointC: 18, precipitationMm: 0, windKph: 12 },
  hourly: [{ forecastAt: '2026-11-01T11:00:00.000Z', temperatureC: 25, relativeHumidityPercent: 66,
    dewPointC: 18, precipitationProbabilityPercent: 10, windKph: 14 }],
};

function backend(): WeatherStorageBackend {
  const values = new Map<string, string>();
  return {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async key => { values.delete(key); },
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

function harness(options: {
  consent?: boolean;
  now?: () => Date;
  api?: Partial<WeatherControllerApi>;
} = {}) {
  let consent = options.consent ?? false;
  const consentPort = {
    read: vi.fn(async () => consent),
    set: vi.fn(async (granted: boolean) => { consent = granted; }),
  };
  const api: WeatherControllerApi = {
    searchWeatherCities: vi.fn(async () => [{
      providerLocationId: HOME.providerLocationId, displayLabel: HOME.displayLabel, timezone: HOME.timezone,
    }]),
    fetchWeatherContext: vi.fn(async () => CONTEXT),
    ...options.api,
  };
  const storage = createWeatherStorage(backend(), USER);
  const controller = createWeatherController({
    api, storage, ownerKey: USER, consent: consentPort,
    now: options.now ?? (() => new Date('2026-11-01T10:00:00.000Z')),
  });
  return { controller, api, storage, consentPort };
}

describe('weather context controller', () => {
  it('never searches or fetches while consent is off and allows explicit candidate selection after consent', async () => {
    const h = harness();
    await h.controller.load();
    await expect(h.controller.searchCities('Durban')).rejects.toThrow('weather-consent-required');
    expect(h.api.searchWeatherCities).not.toHaveBeenCalled();
    await h.controller.setConsent(true);
    const candidates = await h.controller.searchCities('Durban');
    expect(candidates).toHaveLength(1);
    expect((await h.storage.loadVersioned()).settings.home).toBeNull();
    await h.controller.selectHome(candidates[0]!);
    expect((await h.storage.loadVersioned()).settings.home?.providerLocationId).toBe(HOME.providerLocationId);
  });

  it('publishes committed settings even if a search starts while SecureStore is writing', async () => {
    const values = new Map<string, string>();
    const gate = deferred<void>();
    let started!: () => void;
    const writeStarted = new Promise<void>(resolve => { started = resolve; });
    const storage = createWeatherStorage({
      getItem: async key => values.get(key) ?? null,
      setItem: async (key, value) => { started(); await gate.promise; values.set(key, value); },
      removeItem: async key => { values.delete(key); },
    }, USER);
    let consent = true;
    const controller = createWeatherController({
      api: {
        searchWeatherCities: vi.fn(async () => []),
        fetchWeatherContext: vi.fn(async () => CONTEXT),
      },
      storage, ownerKey: USER, now: () => new Date('2026-11-01T10:00:00.000Z'),
      consent: { read: async () => consent, set: async granted => { consent = granted; } },
    });
    await controller.load();
    const saving = controller.selectHome(HOME);
    await writeStarted;
    await controller.searchCities('Cape Town');
    gate.resolve();
    await saving;
    expect(controller.getState().settings.home?.providerLocationId).toBe(HOME.providerLocationId);
    expect((await storage.loadVersioned()).settings.home?.providerLocationId).toBe(HOME.providerLocationId);
  });

  it('selects travel destination only within inclusive destination-local dates, then resumes home city', async () => {
    let now = new Date('2026-11-04T12:00:00.000Z');
    const h = harness({ consent: true, now: () => now });
    await h.controller.load();
    await h.controller.selectHome(HOME);
    await h.controller.setTravel(TRAVEL, { startDate: '2026-11-03', endDate: '2026-11-06', timezone: 'Africa/Johannesburg' });
    await h.controller.refresh();
    expect(h.api.fetchWeatherContext).toHaveBeenLastCalledWith({ providerLocationId: TRAVEL.providerLocationId });
    now = new Date('2026-11-07T00:00:00.000Z');
    await h.controller.refresh();
    expect(h.api.fetchWeatherContext).toHaveBeenLastCalledWith({ providerLocationId: HOME.providerLocationId });
  });

  it('hides travel weather immediately when the inclusive destination-local travel window expires', async () => {
    let now = new Date('2026-11-04T12:00:00.000Z');
    const h = harness({ consent: true, now: () => now, api: {
      fetchWeatherContext: vi.fn(async ({ providerLocationId }: { providerLocationId: string }) => ({
        ...CONTEXT,
        placeLabel: providerLocationId === TRAVEL.providerLocationId ? TRAVEL.displayLabel : HOME.displayLabel,
      })),
    } });
    await h.controller.load();
    await h.controller.selectHome(HOME);
    await h.controller.setTravel(TRAVEL, { startDate: '2026-11-03', endDate: '2026-11-06', timezone: 'Africa/Johannesburg' });
    await h.controller.refresh();
    expect(h.controller.getState().weather).toMatchObject({ status: 'stale', context: { placeLabel: TRAVEL.displayLabel } });
    now = new Date('2026-11-07T00:00:00.000Z');
    expect(h.controller.getState().weather).toEqual({ status: 'unavailable', reason: 'not_requested' });
  });

  it('notifies an active subscriber at travel expiry without polling or another refresh', async () => {
    vi.useFakeTimers();
    try {
      let now = new Date('2026-11-04T21:59:59.900Z');
      const h = harness({ consent: true, now: () => now, api: {
        fetchWeatherContext: vi.fn(async ({ providerLocationId }: { providerLocationId: string }) => ({
          ...CONTEXT,
          placeLabel: providerLocationId === TRAVEL.providerLocationId ? TRAVEL.displayLabel : HOME.displayLabel,
        })),
      } });
      await h.controller.load();
      await h.controller.selectHome(HOME);
      await h.controller.setTravel(TRAVEL, { startDate: '2026-11-03', endDate: '2026-11-04', timezone: 'Africa/Johannesburg' });
      await h.controller.refresh();
      const seen: ReturnType<typeof h.controller.getState>[] = [];
      const unsubscribe = h.controller.subscribe(state => { seen.push(state); });
      expect(vi.getTimerCount()).toBe(1);
      now = new Date('2026-11-04T22:00:05.000Z');
      await vi.advanceTimersByTimeAsync(2_000);
      expect(seen.at(-1)?.weather).toEqual({ status: 'unavailable', reason: 'not_requested' });
      unsubscribe();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps an inclusive destination-local travel date correct across a daylight-saving fallback', async () => {
    let now = new Date('2026-11-02T04:30:00.000Z');
    const newYork = { providerLocationId: 'open-meteo:3', displayLabel: 'New York, New York, United States', timezone: 'America/New_York' };
    const h = harness({ consent: true, now: () => now });
    await h.controller.load();
    await h.controller.selectHome(HOME);
    await h.controller.setTravel(newYork, { startDate: '2026-11-01', endDate: '2026-11-02', timezone: 'America/New_York' });
    await h.controller.refresh();
    expect(h.api.fetchWeatherContext).toHaveBeenLastCalledWith({ providerLocationId: newYork.providerLocationId });
    now = new Date('2026-11-03T05:30:00.000Z');
    await h.controller.refresh();
    expect(h.api.fetchWeatherContext).toHaveBeenLastCalledWith({ providerLocationId: HOME.providerLocationId });
  });

  it('marks context stale after the provider freshness deadline', async () => {
    let now = new Date('2026-11-01T10:00:00.000Z');
    const h = harness({ consent: true, now: () => now });
    await h.controller.load();
    await h.controller.selectHome(HOME);
    await h.controller.refresh();
    expect(h.controller.getState().weather.status).toBe('current');
    now = new Date('2026-11-01T11:00:00.001Z');
    expect(h.controller.getState().weather.status).toBe('stale');
  });

  it('discards a late forecast when weather consent is revoked during a request', async () => {
    const pending = deferred<WeatherContext>();
    const h = harness({ consent: true, api: { fetchWeatherContext: vi.fn(() => pending.promise) } });
    await h.controller.load();
    await h.controller.selectHome(HOME);
    const refresh = h.controller.refresh();
    await h.controller.setConsent(false);
    pending.resolve(CONTEXT);
    await refresh;
    expect(h.controller.getState().weather).toEqual({ status: 'unavailable', reason: 'consent_required' });
    expect(h.controller.getState().consent).toBe(false);
  });

  it('discards a late response and clears owner data when the controller is cleared on owner switch', async () => {
    const pending = deferred<WeatherContext>();
    const h = harness({ consent: true, api: { fetchWeatherContext: vi.fn(() => pending.promise) } });
    await h.controller.load();
    await h.controller.selectHome(HOME);
    const refresh = h.controller.refresh();
    const clearing = h.controller.clearOwner();
    expect(h.controller.getState().settings).toEqual({ home: null, travel: null });
    expect(h.controller.getState().weather).toEqual({ status: 'unavailable', reason: 'no_location' });
    await clearing;
    pending.resolve(CONTEXT);
    await refresh;
    expect(h.controller.getState().weather).toEqual({ status: 'unavailable', reason: 'no_location' });
    expect((await h.storage.loadVersioned()).settings).toEqual({ home: null, travel: null });
  });
});
