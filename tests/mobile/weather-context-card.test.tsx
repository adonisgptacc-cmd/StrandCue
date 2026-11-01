import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { WeatherContextCard } from '../../apps/mobile/src/weather/WeatherContextCard.tsx';
import { createWeatherController, type WeatherControllerApi } from '../../apps/mobile/src/weather/weather-controller.ts';
import { createWeatherStorage, type WeatherStorageBackend } from '../../apps/mobile/src/weather/weather-storage.ts';
import { flush, renderedText } from '../helpers/native-render.ts';

const OWNER = '11111111-1111-4111-8111-111111111111';
const PLACE = { providerLocationId: 'open-meteo:1', displayLabel: 'Durban, KwaZulu-Natal, South Africa', timezone: 'Africa/Johannesburg' };
const CONTEXT = {
  source: 'open_meteo' as const, placeLabel: PLACE.displayLabel, fetchedAt: '2026-11-02T10:00:00.000Z',
  observationAt: '2026-11-02T09:00:00.000Z', forecastFor: '2026-11-02T10:00:00.000Z', freshUntil: '2026-11-02T11:00:00.000Z',
  current: { temperatureC: 24, relativeHumidityPercent: 70, dewPointC: 18, precipitationMm: 0, windKph: 12 },
  hourly: [{ forecastAt: '2026-11-02T11:00:00.000Z', temperatureC: 25, relativeHumidityPercent: 66, dewPointC: 18, precipitationProbabilityPercent: 10, windKph: 14 }],
};
vi.mock('react-native', async () => (await import('./support/rn-mock.ts')).rnMock);

let originalError: typeof console.error;
beforeAll(() => { originalError = console.error; console.error = (...args: unknown[]) => { if (!String(args[0]).includes('react-test-renderer is deprecated')) originalError(...args); }; });
afterAll(() => { console.error = originalError; });

function controller(api: Partial<WeatherControllerApi> = {}) {
  const values = new Map<string, string>();
  const backend: WeatherStorageBackend = { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); } };
  let consent = true;
  const fullApi: WeatherControllerApi = {
    searchWeatherCities: vi.fn(async () => []), fetchWeatherContext: vi.fn(async () => CONTEXT), ...api,
  };
  return createWeatherController({ api: fullApi, storage: createWeatherStorage(backend, OWNER), ownerKey: OWNER,
    consent: { read: async () => consent, set: async value => { consent = value; } }, now: () => new Date('2026-11-02T10:05:00.000Z') });
}

async function render(target: ReturnType<typeof controller>) {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(createElement(WeatherContextCard, { controller: target })); });
  await flush();
  return renderer;
}

describe('weather context card', () => {
  it('shows current context, source, timestamps, freshness, and an informational-only disclaimer', async () => {
    const target = controller();
    await target.load();
    await target.selectHome(PLACE);
    const renderer = await render(target);
    expect(renderedText(renderer)).toContain('24°C');
    expect(renderedText(renderer)).toContain('Durban, KwaZulu-Natal, South Africa');
    expect(renderedText(renderer)).toContain('Weather data by Open-Meteo');
    expect(renderedText(renderer)).toContain('Observation time');
    expect(renderedText(renderer)).toContain('Forecast for');
    expect(renderedText(renderer)).toContain('Updated');
    expect(renderedText(renderer)).toContain('Informational only. Weather does not change your Today guidance or replace your own judgment.');
  });

  it('shows a safe unavailable message when the provider fails and keeps a manual retry', async () => {
    const target = controller({ fetchWeatherContext: vi.fn(async () => { throw new Error('provider-secret-detail'); }) });
    await target.load();
    await target.selectHome(PLACE);
    const renderer = await render(target);
    expect(renderedText(renderer)).toContain('Weather is temporarily unavailable.');
    expect(renderedText(renderer)).not.toContain('provider-secret-detail');
    expect(renderedText(renderer)).toContain('Today guidance is available without weather.');
  });
});
