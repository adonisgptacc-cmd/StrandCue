import { z } from 'zod';

import {
  WeatherContextSchema,
  WeatherSearchCandidateSchema,
} from '../../../packages/domain/src/weather/weather-context.ts';

const SEARCH_QUERY_CHARS = /^[\p{L}\p{M}\p{N} .,'’()-]+$/u;
const ADDRESS_SUFFIX_QUERY = /\b[\p{L}.'’-]+\s+(?:street|road|rd|avenue|ave|boulevard|blvd|drive|lane|ln|court|crescent|highway|terrace|suite|apartment|flat|unit|po\s+box)\.?(?:\s*,?\s+[\p{L}.'’-]+)*\s*$/iu;
const ABBREVIATED_STREET_QUERY = /\b[\p{L}.'’-]+\s+st\.?(?:\s*,?\s+[\p{L}.'’-]+)*\s*$/iu;
const ST_NAMED_PLACE_QUERY = /^(?:cape|port|fort)\s+st\.?\s+|^city\s+of\s+st\.?\s+/iu;

export function isWeatherCitySearchQueryAllowed(query: string, countryCode?: string): boolean {
  const value = query.trim();
  if (value.length < 2 || value.length > 80 || !SEARCH_QUERY_CHARS.test(value)) return false;
  if (/^[0-9]{4}$/.test(value)) return countryCode?.toUpperCase() === 'ZA';
  if (/\p{N}/u.test(value)) return false;
  return !ADDRESS_SUFFIX_QUERY.test(value)
    && (!ABBREVIATED_STREET_QUERY.test(value) || ST_NAMED_PLACE_QUERY.test(value));
}

const WeatherCitySearchCommandSchema = z.object({
  kind: z.literal('search'),
  query: z.string().trim().min(2).max(80).regex(SEARCH_QUERY_CHARS, 'Expected a city or town name'),
  countryCode: z.string().regex(/^[A-Za-z]{2}$/).transform(value => value.toUpperCase()).optional(),
}).strict().refine(
  value => isWeatherCitySearchQueryAllowed(value.query, value.countryCode),
  { message: 'Search for a city or South African postal code, not an address', path: ['query'] },
);

export const WeatherCommandSchema = z.union([
  WeatherCitySearchCommandSchema,
  z.object({
    kind: z.literal('forecast'),
    providerLocationId: z.string().min(1).max(64).regex(/^[A-Za-z0-9:_-]+$/),
  }).strict(),
]);

export const WeatherSearchResponseSchema = z.object({
  candidates: z.array(WeatherSearchCandidateSchema).max(5),
}).strict();

export const WeatherForecastResponseSchema = z.object({
  context: WeatherContextSchema,
  attribution: z.object({
    label: z.literal('Weather data by Open-Meteo'),
    url: z.literal('https://open-meteo.com/'),
  }).strict(),
}).strict();

export type WeatherCommand = z.output<typeof WeatherCommandSchema>;
export type WeatherSearchResponse = z.output<typeof WeatherSearchResponseSchema>;
export type WeatherForecastResponse = z.output<typeof WeatherForecastResponseSchema>;
