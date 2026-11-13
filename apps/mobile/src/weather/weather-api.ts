import { z } from 'zod';

import {
  WeatherContextSchema,
  WeatherSearchCandidateSchema,
  type WeatherContext,
  type WeatherSearchCandidate,
} from '../../../../packages/domain/src/weather/weather-context.ts';

const CitySearchCommandSchema = z.object({
  query: z.string().trim().min(2).max(80).regex(/^[\p{L}\p{M}\p{N} .,'’()-]+$/u),
  countryCode: z.string().regex(/^[A-Za-z]{2}$/).transform(value => value.toUpperCase()).optional(),
}).strict();
const ForecastCommandSchema = z.object({
  providerLocationId: z.string().min(1).max(64).regex(/^[A-Za-z0-9:_-]+$/),
}).strict();
const SearchResponseSchema = z.object({
  candidates: z.array(WeatherSearchCandidateSchema).max(5),
}).strict();
const ForecastResponseSchema = z.object({
  context: WeatherContextSchema,
  attribution: z.object({
    label: z.literal('Weather data by Open-Meteo'),
    url: z.literal('https://open-meteo.com/'),
  }).strict(),
}).strict();

export interface WeatherFunctionsInvoker {
  invoke(name: 'weather-context', options: { readonly body: unknown }): Promise<{
    readonly data: unknown;
    readonly error: unknown | null;
  }>;
}

export interface WeatherCitySearchCommand {
  readonly query: string;
  readonly countryCode?: string;
}

export interface WeatherForecastCommand {
  readonly providerLocationId: string;
}

export interface WeatherApi {
  searchWeatherCities(command: WeatherCitySearchCommand): Promise<WeatherSearchCandidate[]>;
  fetchWeatherContext(command: WeatherForecastCommand): Promise<WeatherContext>;
}

const unavailable = () => new Error('Weather is unavailable right now. Please try again later.');

export function createWeatherApi(functions: WeatherFunctionsInvoker): WeatherApi {
  return {
    async searchWeatherCities(command) {
      const parsed = CitySearchCommandSchema.parse(command);
      let response: { data: unknown; error: unknown | null };
      try {
        response = await functions.invoke('weather-context', {
          body: { kind: 'search', query: parsed.query, ...(parsed.countryCode ? { countryCode: parsed.countryCode } : {}) },
        });
      } catch { throw unavailable(); }
      if (response.error !== null) throw unavailable();
      const result = SearchResponseSchema.safeParse(response.data);
      if (!result.success) throw unavailable();
      return result.data.candidates;
    },

    async fetchWeatherContext(command) {
      const parsed = ForecastCommandSchema.parse(command);
      let response: { data: unknown; error: unknown | null };
      try {
        response = await functions.invoke('weather-context', { body: { kind: 'forecast', providerLocationId: parsed.providerLocationId } });
      } catch { throw unavailable(); }
      if (response.error !== null) throw unavailable();
      const result = ForecastResponseSchema.safeParse(response.data);
      if (!result.success) throw unavailable();
      return result.data.context;
    },
  };
}
