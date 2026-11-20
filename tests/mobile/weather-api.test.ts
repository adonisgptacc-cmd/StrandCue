import { describe, expect, it, vi } from 'vitest';

import { createWeatherApi } from '../../apps/mobile/src/weather/weather-api.ts';

const context = {
  source: 'open_meteo' as const,
  placeLabel: 'Durban, KwaZulu-Natal, South Africa',
  fetchedAt: '2026-11-01T10:00:00.000Z',
  observationAt: '2026-11-01T09:00:00.000Z',
  forecastFor: '2026-11-01T10:00:00.000Z',
  freshUntil: '2026-11-01T10:30:00.000Z',
  current: { temperatureC: 24, relativeHumidityPercent: 70, dewPointC: 18, precipitationMm: 0, windKph: 12 },
  hourly: [{ forecastAt: '2026-11-01T11:00:00.000Z', temperatureC: 25, relativeHumidityPercent: 66,
    dewPointC: 18, precipitationProbabilityPercent: 10, windKph: 14 }],
};

describe('weather mobile API', () => {
  it('trims a bounded search query and parses only the strict candidate response', async () => {
    const invoke = vi.fn(async () => ({ data: { candidates: [{
      providerLocationId: 'open-meteo:1', displayLabel: 'Durban, KwaZulu-Natal, South Africa', timezone: 'Africa/Johannesburg',
    }] }, error: null }));
    const api = createWeatherApi({ invoke });
    const result = await api.searchWeatherCities({ query: '  Durban  ', countryCode: 'za' });
    expect(invoke).toHaveBeenCalledWith('weather-context', { body: { kind: 'search', query: 'Durban', countryCode: 'ZA' } });
    expect(result[0]?.providerLocationId).toBe('open-meteo:1');
    await expect(api.searchWeatherCities({ query: 'name@example.com' })).rejects.toThrow();
  });

  it('requests only an explicitly selected provider ID and validates the forecast envelope', async () => {
    const invoke = vi.fn(async () => ({ data: {
      context, attribution: { label: 'Weather data by Open-Meteo', url: 'https://open-meteo.com/' },
    }, error: null }));
    const api = createWeatherApi({ invoke });
    expect(await api.fetchWeatherContext({ providerLocationId: 'open-meteo:1' })).toEqual(context);
    expect(invoke).toHaveBeenCalledWith('weather-context', { body: { kind: 'forecast', providerLocationId: 'open-meteo:1' } });
    await expect(api.fetchWeatherContext({ providerLocationId: 'open-meteo:1', latitude: -29 } as never)).rejects.toThrow();
  });

  it('maps server errors to a safe message and rejects malformed provider data', async () => {
    const failed = createWeatherApi({ invoke: vi.fn(async () => ({ data: null, error: new Error('provider secret https://customer-api.open-meteo.com?apikey=secret') })) });
    await expect(failed.searchWeatherCities({ query: 'Durban' })).rejects.toThrow('Weather is unavailable right now. Please try again later.');
    const malformed = createWeatherApi({ invoke: vi.fn(async () => ({ data: {
      context: { ...context, coordinates: [-29.8, 31.0] },
      attribution: { label: 'Weather data by Open-Meteo', url: 'https://open-meteo.com/' },
    }, error: null })) });
    await expect(malformed.fetchWeatherContext({ providerLocationId: 'open-meteo:1' })).rejects.toThrow();
  });
});
