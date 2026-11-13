import { describe, expect, it } from 'vitest';
import {
  classifyWeatherFreshness,
  WeatherContextSchema,
  WeatherSearchCandidateSchema,
  WeatherContextStateSchema,
  WeatherTravelWindowSchema,
} from '../../packages/domain/src/weather/weather-context';

const context = {
  source: 'open_meteo',
  placeLabel: 'Durban, KwaZulu-Natal, South Africa',
  fetchedAt: '2026-11-01T10:00:00.000Z',
  observationAt: '2026-11-01T09:00:00.000Z',
  forecastFor: '2026-11-01T10:00:00.000Z',
  freshUntil: '2026-11-01T11:00:00.000Z',
  current: {
    temperatureC: 25,
    relativeHumidityPercent: 72,
    dewPointC: 19.4,
    precipitationMm: 0,
    windKph: 14,
  },
  hourly: [{
    forecastAt: '2026-11-01T11:00:00.000Z',
    temperatureC: 25,
    relativeHumidityPercent: 72,
    dewPointC: 19.4,
    precipitationProbabilityPercent: 10,
    windKph: 14,
  }],
} as const;

describe('weather context contract', () => {
  it('accepts normalized current and hourly weather with source timestamps', () => {
    expect(WeatherContextSchema.parse(context)).toEqual(context);
  });

  it('rejects implausible readings and an unordered forecast timestamp', () => {
    expect(() => WeatherContextSchema.parse({
      ...context,
      current: { ...context.current, relativeHumidityPercent: 101 },
    })).toThrow();
    expect(() => WeatherContextSchema.parse({
      ...context,
      hourly: [{ ...context.hourly[0], forecastAt: context.fetchedAt }],
    })).toThrow();
  });

  it('classifies context as fresh through sixty minutes and stale after it', () => {
    const parsed = WeatherContextSchema.parse(context);
    expect(classifyWeatherFreshness(parsed, new Date('2026-11-01T11:00:00.000Z'))).toBe('current');
    expect(classifyWeatherFreshness(parsed, new Date('2026-11-01T11:00:00.001Z'))).toBe('stale');
  });

  it('classifies a missing weather response as unavailable', () => {
    expect(classifyWeatherFreshness(null, new Date('2026-11-01T10:00:00.000Z'))).toBe('unavailable');
    expect(WeatherContextStateSchema.parse({ status: 'unavailable', reason: 'not_requested' }))
      .toEqual({ status: 'unavailable', reason: 'not_requested' });
  });

  it('accepts a coarse selected city without exposing coordinates', () => {
    const candidate = {
      providerLocationId: 'geonames:1007311',
      displayLabel: 'Durban, KwaZulu-Natal, South Africa',
      timezone: 'Africa/Johannesburg',
    };
    expect(WeatherSearchCandidateSchema.parse(candidate)).toEqual(candidate);
    expect(() => WeatherSearchCandidateSchema.parse({ ...candidate, latitude: -29.85 })).toThrow();
  });

  it('rejects travel windows with an end before the start or an invalid timezone', () => {
    expect(() => WeatherTravelWindowSchema.parse({
      startDate: '2026-11-03', endDate: '2026-11-02', timezone: 'Africa/Johannesburg',
    })).toThrow();
    expect(() => WeatherTravelWindowSchema.parse({
      startDate: '2026-11-02', endDate: '2026-11-03', timezone: 'Not/A_Timezone',
    })).toThrow();
  });
});
