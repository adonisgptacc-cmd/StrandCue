import { z } from 'zod';

const instant = z.iso.datetime({ offset: true });
const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}, 'Expected a real calendar date');
const timezone = z.string().min(1).max(80).refine(value => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}, 'Expected a valid IANA timezone');

const providerLocationId = z.string().min(1).max(64).regex(/^[A-Za-z0-9:_-]+$/);
const displayLabel = z.string().trim().min(1).max(160);
const temperatureC = z.number().finite().min(-90).max(70);
const humidityPercent = z.number().finite().min(0).max(100);
const windKph = z.number().finite().min(0).max(500);
const dewPointC = z.number().finite().min(-100).max(70);
const precipitationMm = z.number().finite().min(0).max(1000);

export const WeatherSearchCandidateSchema = z.object({
  providerLocationId,
  displayLabel,
  timezone,
}).strict();
export type WeatherSearchCandidate = z.output<typeof WeatherSearchCandidateSchema>;

export const WeatherPlaceSchema = WeatherSearchCandidateSchema;
export type WeatherPlace = WeatherSearchCandidate;

const CurrentWeatherReadingsSchema = z.object({
  temperatureC,
  relativeHumidityPercent: humidityPercent,
  dewPointC,
  precipitationMm,
  windKph,
}).strict();

const HourlyWeatherReadingsSchema = z.object({
  forecastAt: instant,
  temperatureC,
  relativeHumidityPercent: humidityPercent,
  dewPointC,
  precipitationProbabilityPercent: humidityPercent,
  windKph,
}).strict();

export const WeatherContextSchema = z.object({
  source: z.literal('open_meteo'),
  placeLabel: displayLabel,
  fetchedAt: instant,
  observationAt: instant.nullable(),
  forecastFor: instant,
  freshUntil: instant,
  current: CurrentWeatherReadingsSchema,
  hourly: z.array(HourlyWeatherReadingsSchema).max(24),
}).strict().superRefine((context, issue) => {
  const fetchedAt = Date.parse(context.fetchedAt);
  const freshUntil = Date.parse(context.freshUntil);
  const forecastFor = Date.parse(context.forecastFor);
  const observationAt = context.observationAt === null ? null : Date.parse(context.observationAt);
  if (freshUntil < fetchedAt || freshUntil > fetchedAt + 60 * 60 * 1000) {
    issue.addIssue({ code: 'custom', path: ['freshUntil'], message: 'Weather freshness may not exceed sixty minutes' });
  }
  if (forecastFor < fetchedAt) {
    issue.addIssue({ code: 'custom', path: ['forecastFor'], message: 'Forecast time cannot precede fetch time' });
  }
  if (observationAt !== null && observationAt > fetchedAt) {
    issue.addIssue({ code: 'custom', path: ['observationAt'], message: 'Observation time cannot follow fetch time' });
  }
  let previousForecastAt = forecastFor;
  for (const [index, hour] of context.hourly.entries()) {
    const nextForecastAt = Date.parse(hour.forecastAt);
    if (nextForecastAt <= previousForecastAt) {
      issue.addIssue({ code: 'custom', path: ['hourly', index, 'forecastAt'], message: 'Hourly forecast times must be strictly increasing' });
    }
    previousForecastAt = nextForecastAt;
  }
});
export type WeatherContext = z.output<typeof WeatherContextSchema>;

export const WeatherUnavailableReasonSchema = z.enum([
  'no_location',
  'consent_required',
  'not_configured',
  'network_error',
  'invalid_response',
  'rate_limited',
]);

export const WeatherContextStateSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('current'), context: WeatherContextSchema }).strict(),
  z.object({ status: z.literal('stale'), context: WeatherContextSchema }).strict(),
  z.object({ status: z.literal('unavailable'), reason: WeatherUnavailableReasonSchema }).strict(),
]);
export type WeatherContextState = z.output<typeof WeatherContextStateSchema>;

export const WeatherTravelWindowSchema = z.object({
  startDate: localDate,
  endDate: localDate,
  timezone,
}).strict().refine(window => window.startDate <= window.endDate, {
  path: ['endDate'],
  message: 'Travel end date must not precede its start date',
});
export type WeatherTravelWindow = z.output<typeof WeatherTravelWindowSchema>;

export function classifyWeatherFreshness(context: WeatherContext | null, now: Date): 'current' | 'stale' | 'unavailable' {
  if (context === null || !Number.isFinite(now.getTime())) return 'unavailable';
  return now.getTime() <= Date.parse(context.freshUntil) ? 'current' : 'stale';
}
