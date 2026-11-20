import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { WeatherSettings } from '../../apps/mobile/src/weather/WeatherSettings.tsx';
import { createWeatherController, type WeatherControllerApi } from '../../apps/mobile/src/weather/weather-controller.ts';
import { createWeatherStorage, type WeatherStorageBackend } from '../../apps/mobile/src/weather/weather-storage.ts';
import { flush, inputValue, labelsOf, press, renderedText, type } from '../helpers/native-render.ts';

const OWNER = '11111111-1111-4111-8111-111111111111';
const DURBAN = { providerLocationId: 'open-meteo:1', displayLabel: 'Durban, KwaZulu-Natal, South Africa', timezone: 'Africa/Johannesburg' };
const CAPE_TOWN = { providerLocationId: 'open-meteo:2', displayLabel: 'Cape Town, Western Cape, South Africa', timezone: 'Africa/Johannesburg' };

vi.mock('react-native', async () => (await import('./support/rn-mock.ts')).rnMock);

let originalError: typeof console.error;
beforeAll(() => { originalError = console.error; console.error = (...args: unknown[]) => { if (!String(args[0]).includes('react-test-renderer is deprecated')) originalError(...args); }; });
afterAll(() => { console.error = originalError; });

function harness(consentInitially = false) {
  const values = new Map<string, string>();
  const backend: WeatherStorageBackend = {
    getItem: async key => values.get(key) ?? null,
    setItem: async (key, value) => { values.set(key, value); },
    removeItem: async key => { values.delete(key); },
  };
  let consentValue = consentInitially;
  const api: WeatherControllerApi = {
    searchWeatherCities: vi.fn(async () => [DURBAN, CAPE_TOWN]),
    fetchWeatherContext: vi.fn(async () => { throw new Error('unused'); }),
  };
  const controller = createWeatherController({
    api, storage: createWeatherStorage(backend, OWNER), ownerKey: OWNER,
    consent: { read: async () => consentValue, set: async granted => { consentValue = granted; } },
    now: () => new Date('2026-11-02T10:00:00.000Z'),
  });
  return { controller, api };
}

async function mount(controller: ReturnType<typeof harness>['controller']) {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(createElement(WeatherSettings, { controller })); });
  await flush();
  return renderer;
}

describe('weather settings', () => {
  it('does not expose city search or call a provider while separate weather consent is off', async () => {
    const h = harness();
    await h.controller.load();
    const renderer = await mount(h.controller);
    expect(renderedText(renderer)).toContain('Weather sharing is optional and separate from your hair record.');
    expect(labelsOf(renderer)).not.toContain('Search city');
    expect(labelsOf(renderer)).not.toContain('City to search');
    expect(h.api.searchWeatherCities).not.toHaveBeenCalled();
  });

  it('requires explicit search and explicit selection before saving a home city or temporary destination', async () => {
    const h = harness();
    await h.controller.load();
    await act(async () => { await h.controller.setConsent(true); });
    const renderer = await mount(h.controller);
    type(renderer, 'City to search', 'Durban');
    expect(h.api.searchWeatherCities).not.toHaveBeenCalled();
    await act(async () => { press(renderer, 'Search city'); await Promise.resolve(); });
    expect(h.api.searchWeatherCities).toHaveBeenCalledWith({ query: 'Durban' });
    expect(labelsOf(renderer)).toContain('Set Durban, KwaZulu-Natal, South Africa as home city');
    await act(async () => { press(renderer, 'Set Durban, KwaZulu-Natal, South Africa as home city'); await Promise.resolve(); });
    expect(h.controller.getState().settings.home).toEqual(DURBAN);

    type(renderer, 'City to search', 'Cape Town');
    await act(async () => { press(renderer, 'Search city'); await Promise.resolve(); });
    await flush();
    await act(async () => { press(renderer, 'Set Cape Town, Western Cape, South Africa as temporary destination'); await Promise.resolve(); });
    expect(inputValue(renderer, 'Travel starts (YYYY-MM-DD)')).toBe('');
    type(renderer, 'Travel starts (YYYY-MM-DD)', '2026-11-04');
    type(renderer, 'Travel ends (YYYY-MM-DD)', '2026-11-06');
    await act(async () => { press(renderer, 'Save temporary destination'); await Promise.resolve(); });
    expect(h.controller.getState().settings.travel).toEqual({ place: CAPE_TOWN, startDate: '2026-11-04', endDate: '2026-11-06', timezone: CAPE_TOWN.timezone });
    expect(renderedText(renderer)).toContain('Inclusive dates: 2026-11-04 to 2026-11-06 (Africa/Johannesburg)');
  });

  it('limits four-digit postal-code searches to South Africa', async () => {
    const h = harness(true);
    const renderer = await mount(h.controller);
    type(renderer, 'City to search', '8001');
    await act(async () => { press(renderer, 'Search city'); await Promise.resolve(); });
    expect(h.api.searchWeatherCities).toHaveBeenCalledWith({ query: '8001', countryCode: 'ZA' });
  });

  it('can revoke weather consent and clear saved locations', async () => {
    const h = harness(true);
    await h.controller.load();
    await h.controller.selectHome(DURBAN);
    const renderer = await mount(h.controller);
    await act(async () => { press(renderer, 'Turn off weather sharing'); await Promise.resolve(); });
    expect(h.controller.getState().consent).toBe(false);
    expect(labelsOf(renderer)).not.toContain('Search city');
    await act(async () => { press(renderer, 'Clear saved weather locations'); await Promise.resolve(); });
    expect(h.controller.getState().settings).toEqual({ home: null, travel: null });
  });
});
