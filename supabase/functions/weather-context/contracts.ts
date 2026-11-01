import { z } from 'zod';

import {
  WeatherContextSchema,
  WeatherSearchCandidateSchema,
} from '../../../packages/domain/src/weather/weather-context.ts';

export const WeatherCommandSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('search'),
    query: z.string().trim().min(2).max(80)
      .regex(/^[\p{L}\p{M}\p{N} .,'’()-]+$/u, 'Expected a city name or postal code'),
    countryCode: z.string().regex(/^[A-Za-z]{2}$/).transform(value => value.toUpperCase()).optional(),
  }).strict(),
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
