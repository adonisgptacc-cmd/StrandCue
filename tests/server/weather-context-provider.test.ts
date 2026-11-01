import { describe, expect, it, vi } from 'vitest';

import { createOpenMeteoWeatherProvider } from '../../supabase/functions/weather-context/provider.ts';
import { resolveWeatherProviderMode } from '../../supabase/functions/weather-context/runtime.ts';

const NOW = new Date('2026-11-01T10:00:00.000Z');
const selectedId = 'open-meteo:12345';

function geocodingResult() {
  return {
    id: 12345, name: 'Durban', latitude: -29.8587, longitude: 31.0218,
    timezone: 'Africa/Johannesburg', country: 'South Africa', country_code: 'ZA', admin1: 'KwaZulu-Natal',
  };
}

function forecastResult() {
  const times = Array.from({ length: 48 }, (_, index) => {
    const date = new Date(NOW.getTime() + (index + 1) * 60 * 60 * 1000);
    return date.toISOString().slice(0, 16);
  });
  return {
    current: {
      time: '2026-11-01T09:00', temperature_2m: 24, relative_humidity_2m: 70,
      dew_point_2m: 18, precipitation: 0, wind_speed_10m: 12,
    },
    hourly: {
      time: times,
      temperature_2m: times.map(() => 25),
      relative_humidity_2m: times.map(() => 66),
      dew_point_2m: times.map(() => 18),
      precipitation_probability: times.map(() => 10),
      wind_speed_10m: times.map(() => 14),
    },
  };
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('Open-Meteo weather provider', () => {
  it('permits the noncommercial endpoint only with explicit mode and a local Supabase host', () => {
    expect(resolveWeatherProviderMode('local-noncommercial', 'http://kong:8000')).toBe('development');
    expect(resolveWeatherProviderMode('local-noncommercial', 'http://localhost:54321')).toBe('development');
    expect(resolveWeatherProviderMode('local-noncommercial', 'https://project.supabase.co')).toBe('production');
    expect(resolveWeatherProviderMode(undefined, 'http://localhost:54321')).toBe('production');
    expect(resolveWeatherProviderMode('local-noncommercial', 'not a url')).toBe('production');
  });

  it('uses only the fixed geocoding host and sends a bounded city query without owner data', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request) => response({ results: [geocodingResult()] }));
    const provider = createOpenMeteoWeatherProvider({ mode: 'development', fetcher, now: () => NOW });
    const results = await provider.searchCities('Durban', 'ZA');
    expect(results).toEqual([{
      providerLocationId: selectedId,
      displayLabel: 'Durban, KwaZulu-Natal, South Africa',
      timezone: 'Africa/Johannesburg',
    }]);
    const url = new URL(String(fetcher.mock.calls[0][0]));
    expect(url.origin).toBe('https://geocoding-api.open-meteo.com');
    expect(url.pathname).toBe('/v1/search');
    expect(url.searchParams.get('name')).toBe('Durban');
    expect(url.searchParams.get('countryCode')).toBe('ZA');
    expect(url.searchParams.get('count')).toBe('5');
    expect(url.href).not.toContain('11111111-1111-4111-8111-111111111111');
    expect(url.href).not.toMatch(/token|email|authorization|apikey/i);
  });

  it('returns at most five safe normalized city candidates', async () => {
    const fetcher = vi.fn(async (_input: string | URL | Request) => response({ results: Array.from({ length: 12 }, (_, id) => ({
      ...geocodingResult(), id: id + 1, name: `City ${id + 1}`,
    })) }));
    const provider = createOpenMeteoWeatherProvider({ mode: 'development', fetcher, now: () => NOW });
    expect(await provider.searchCities('Durban')).toHaveLength(5);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('uses an explicitly selected id, fixed hosts, required units and only returns the next 24 hourly readings', async () => {
    const fetcher = vi.fn((_input: string | URL | Request) => Promise.resolve(response({})))
      .mockResolvedValueOnce(response({ ...geocodingResult(), id: 12345 }))
      .mockResolvedValueOnce(response(forecastResult()));
    const provider = createOpenMeteoWeatherProvider({ mode: 'development', fetcher, now: () => NOW });
    const result = await provider.getForecast(selectedId);
    expect(result).not.toBeNull();
    expect(result?.current.windKph).toBe(12);
    expect(result?.hourly).toHaveLength(24);
    expect(result?.hourly[0]?.forecastAt).toBe('2026-11-01T11:00:00.000Z');
    expect(Date.parse(result!.hourly.at(-1)!.forecastAt) - NOW.getTime()).toBe(24 * 60 * 60 * 1000);
    const lookup = new URL(String(fetcher.mock.calls[0][0]));
    const forecast = new URL(String(fetcher.mock.calls[1][0]));
    expect(lookup.origin).toBe('https://geocoding-api.open-meteo.com');
    expect(lookup.pathname).toBe('/v1/get');
    expect(lookup.searchParams.get('id')).toBe('12345');
    expect(forecast.origin).toBe('https://api.open-meteo.com');
    expect(forecast.pathname).toBe('/v1/forecast');
    expect(forecast.searchParams.get('temperature_unit')).toBe('celsius');
    expect(forecast.searchParams.get('wind_speed_unit')).toBe('kmh');
    expect(forecast.searchParams.get('precipitation_unit')).toBe('mm');
    expect(forecast.searchParams.get('timezone')).toBe('Africa/Johannesburg');
    expect(forecast.searchParams.get('latitude')).toBe('-29.8587');
    expect(forecast.searchParams.get('longitude')).toBe('31.0218');
    expect(JSON.stringify(result)).not.toMatch(/latitude|longitude|-29\.8587|31\.0218/);
  });

  it('fails closed in production unless commercial endpoint, key, and reviewed license id are configured', () => {
    expect(() => createOpenMeteoWeatherProvider({ mode: 'production', fetcher: vi.fn() as typeof fetch, now: () => NOW }))
      .toThrow('weather-provider-not-configured');
    expect(() => createOpenMeteoWeatherProvider({
      mode: 'production', commercialApiKey: 'secret-key', licenseReviewId: 'review-1',
      fetcher: vi.fn() as typeof fetch, now: () => NOW,
    })).not.toThrow();
  });

  it('uses the commercial fixed host and server-side API key when configured', async () => {
    const fetcher = vi.fn((_input: string | URL | Request) => Promise.resolve(response({})))
      .mockResolvedValueOnce(response({ ...geocodingResult(), id: 12345 }))
      .mockResolvedValueOnce(response(forecastResult()));
    const provider = createOpenMeteoWeatherProvider({
      mode: 'production', commercialApiKey: 'server-secret', licenseReviewId: 'review-1',
      fetcher, now: () => NOW,
    });
    await provider.getForecast(selectedId);
    for (const [input] of fetcher.mock.calls) {
      const url = new URL(String(input));
      expect(url.origin).toBe(url.pathname === '/v1/forecast'
        ? 'https://customer-api.open-meteo.com'
        : 'https://customer-geocoding-api.open-meteo.com');
      expect(url.searchParams.get('apikey')).toBe('server-secret');
    }
  });

  it('returns unavailable for invalid identifiers, malformed payloads and provider failures', async () => {
    const provider = createOpenMeteoWeatherProvider({
      mode: 'development', fetcher: vi.fn(async (_input: string | URL | Request) => response({ results: [{ name: 'partial' }] })), now: () => NOW,
    });
    expect(await provider.searchCities('Durban')).toEqual([]);
    expect(await provider.getForecast('https://evil.invalid')).toBeNull();
    const failed = createOpenMeteoWeatherProvider({
      mode: 'development', fetcher: vi.fn(async (_input: string | URL | Request) => { throw new Error('network failure'); }), now: () => NOW,
    });
    expect(await failed.getForecast(selectedId)).toBeNull();
  });
});
