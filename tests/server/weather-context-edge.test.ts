import { describe, expect, it, vi } from 'vitest';

import {
  handleWeatherContextRequest,
  type WeatherEdgeDependencies,
  type WeatherProvider,
} from '../../supabase/functions/weather-context/handler.ts';
import type { WeatherContext } from '../../packages/domain/src/weather/weather-context.ts';
import { WeatherCommandSchema } from '../../supabase/functions/weather-context/contracts.ts';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const AS_OF = '2026-11-01T10:00:00.000Z';
const context: WeatherContext = {
  source: 'open_meteo', placeLabel: 'Durban, KwaZulu-Natal, South Africa',
  fetchedAt: AS_OF, observationAt: '2026-11-01T09:00:00.000Z',
  forecastFor: AS_OF, freshUntil: '2026-11-01T10:30:00.000Z',
  current: { temperatureC: 24, relativeHumidityPercent: 70, dewPointC: 18,
    precipitationMm: 0, windKph: 12 },
  hourly: [{ forecastAt: '2026-11-01T11:00:00.000Z', temperatureC: 25,
    relativeHumidityPercent: 66, dewPointC: 18, precipitationProbabilityPercent: 10, windKph: 14 }],
};
const candidate = {
  providerLocationId: 'za-kzn-durban',
  displayLabel: 'Durban, KwaZulu-Natal, South Africa',
  timezone: 'Africa/Johannesburg',
};

function request(body: unknown, authorization = 'Bearer user-token', contentType = 'application/json') {
  return new Request('https://local.invalid/weather-context', {
    method: 'POST', headers: { authorization, 'content-type': contentType }, body: JSON.stringify(body),
  });
}

function harness(overrides: Partial<WeatherEdgeDependencies> = {}) {
  const authenticate = vi.fn(async () => ({ id: USER_ID }));
  const listConsents = vi.fn(async () => ({ weather_context: true }));
  const reserveRequest = vi.fn(async () => undefined);
  const provider: WeatherProvider = {
    searchCities: vi.fn(async () => [candidate]),
    getForecast: vi.fn(async () => context),
  };
  const deps: WeatherEdgeDependencies = {
    authenticate, listConsents, reserveRequest, provider,
    now: () => new Date(AS_OF), ...overrides,
  };
  return { deps, authenticate, listConsents, reserveRequest, provider };
}

describe('weather context Edge boundary', () => {
  it('rejects unauthenticated requests before consent, quota, or provider access', async () => {
    const h = harness({ authenticate: vi.fn(async () => null) });
    const response = await handleWeatherContextRequest(request({ kind: 'search', query: 'Durban' }), h.deps);
    expect(response.status).toBe(401);
    expect(h.listConsents).not.toHaveBeenCalled();
    expect(h.reserveRequest).not.toHaveBeenCalled();
    expect(h.provider.searchCities).not.toHaveBeenCalled();
  });

  it('requires the current owner weather consent before reserving quota or calling the provider', async () => {
    const h = harness({ listConsents: vi.fn(async () => ({ weather_context: false })) });
    const response = await handleWeatherContextRequest(request({ kind: 'search', query: 'Durban' }), h.deps);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'consent-required' });
    expect(h.reserveRequest).not.toHaveBeenCalled();
    expect(h.provider.searchCities).not.toHaveBeenCalled();
  });

  it('checks quota before contacting the provider and maps limits to a stable response', async () => {
    const h = harness({ reserveRequest: vi.fn(async () => { throw new Error('weather-rate-limited'); }) });
    const response = await handleWeatherContextRequest(request({ kind: 'search', query: 'Durban' }), h.deps);
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'rate-limited' });
    expect(h.provider.searchCities).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON, non-JSON, oversized bodies, and unknown fields', async () => {
    const h = harness();
    const malformed = new Request('https://local.invalid/weather-context', {
      method: 'POST', headers: { authorization: 'Bearer user-token', 'content-type': 'application/json' }, body: '{',
    });
    const oversized = new Request('https://local.invalid/weather-context', {
      method: 'POST', headers: { authorization: 'Bearer user-token', 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'search', query: 'x'.repeat(3000) }),
    });
    expect((await handleWeatherContextRequest(request({ kind: 'search' }, 'Bearer user-token', 'text/plain'), h.deps)).status).toBe(400);
    expect((await handleWeatherContextRequest(malformed, h.deps)).status).toBe(400);
    expect((await handleWeatherContextRequest(oversized, h.deps)).status).toBe(400);
    expect((await handleWeatherContextRequest(request({ kind: 'search', query: 'Durban', ownerId: USER_ID }), h.deps)).status).toBe(400);
    expect((await handleWeatherContextRequest(request({ kind: 'search', query: 'person@example.com' }), h.deps)).status).toBe(400);
    expect(h.provider.searchCities).not.toHaveBeenCalled();
  });

  it('bounds city search and forwards only the manually entered city and optional country', async () => {
    const h = harness();
    const response = await handleWeatherContextRequest(request({ kind: 'search', query: '  Durban  ', countryCode: 'ZA' }), h.deps);
    expect(response.status).toBe(200);
    expect(h.provider.searchCities).toHaveBeenCalledWith('Durban', 'ZA');
    expect(await response.json()).toEqual({ candidates: [candidate] });
    expect(h.reserveRequest).toHaveBeenCalledWith('user-token');
  });

  it('rejects street-address and phone-like searches before calling the provider', async () => {
    const h = harness();
    for (const query of ['12 Main Street, Durban', 'Main Street, Durban', 'Main St, Durban', 'Main St. Durban', 'Main Rd., Durban', 'Main Ave., Cape Town', 'Main Ln., Cape Town', '082 123 4567']) {
      const response = await handleWeatherContextRequest(request({ kind: 'search', query }), h.deps);
      expect(response.status, query).toBe(400);
    }
    expect(h.provider.searchCities).not.toHaveBeenCalled();
  });

  it('keeps valid place names and South African postal-code searches available', async () => {
    for (const [query, countryCode] of [['Road Town', undefined], ['Crescent City', undefined], ['Cape St Francis', 'ZA'], ['Port St Johns', 'ZA'], ['8001', 'ZA']] as const) {
      const h = harness();
      const response = await handleWeatherContextRequest(request({ kind: 'search', query, countryCode }), h.deps);
      expect(response.status, query).toBe(200);
      expect(h.provider.searchCities).toHaveBeenCalledWith(query, countryCode);
    }
  });

  it('uses the command schema as the same city-search privacy boundary', () => {
    const accepted = ['Road Town', 'Crescent City', 'Cape St Francis', 'Port St Johns']
      .map(query => ({ kind: 'search', query, countryCode: query.includes('St ') ? 'ZA' : undefined }));
    for (const command of accepted) expect(WeatherCommandSchema.safeParse(command).success).toBe(true);
    expect(WeatherCommandSchema.safeParse({ kind: 'search', query: '8001', countryCode: 'ZA' }).success).toBe(true);
    for (const query of ['12 Main Street, Durban', '082 123 4567', '8001']) {
      expect(WeatherCommandSchema.safeParse({ kind: 'search', query }).success).toBe(false);
    }
  });

  it('fetches only after explicit provider location id selection and returns attribution', async () => {
    const h = harness();
    const response = await handleWeatherContextRequest(request({ kind: 'forecast', providerLocationId: candidate.providerLocationId }), h.deps);
    expect(response.status).toBe(200);
    expect(h.provider.getForecast).toHaveBeenCalledWith(candidate.providerLocationId, expect.any(Date));
    expect(await response.json()).toEqual({
      context, attribution: { label: 'Weather data by Open-Meteo', url: 'https://open-meteo.com/' },
    });
  });

  it('does not expose internal provider failures or request details', async () => {
    const h = harness({ provider: {
      searchCities: vi.fn(async () => { throw new Error('provider failed for city at https://api.open-meteo.com/?apikey=secret'); }),
      getForecast: vi.fn(async () => { throw new Error('private provider payload'); }),
    } });
    const response = await handleWeatherContextRequest(request({ kind: 'search', query: 'Durban' }), h.deps);
    const payload = await response.json();
    expect(response.status).toBe(503);
    expect(payload).toEqual({ error: 'weather-unavailable' });
    expect(JSON.stringify(payload)).not.toMatch(/open-meteo\.com|apikey|secret|private provider/i);
  });
});
