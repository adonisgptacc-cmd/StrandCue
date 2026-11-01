import {
  WeatherContextSchema,
  WeatherSearchCandidateSchema,
  type WeatherContext,
  type WeatherSearchCandidate,
} from '../../../packages/domain/src/weather/weather-context.ts';

const ATTRIBUTION = 'Weather data by Open-Meteo';
const LOCATION_ID = /^open-meteo:(\d{1,12})$/;
const GEOCODING_FREE = 'https://geocoding-api.open-meteo.com';
const FORECAST_FREE = 'https://api.open-meteo.com';
const GEOCODING_CUSTOMER = 'https://customer-geocoding-api.open-meteo.com';
const FORECAST_CUSTOMER = 'https://customer-api.open-meteo.com';

type Fetcher = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export interface OpenMeteoWeatherProviderOptions {
  readonly mode: 'development' | 'production';
  readonly commercialApiKey?: string;
  readonly licenseReviewId?: string;
  readonly fetcher?: Fetcher;
  readonly now?: () => Date;
}

export interface OpenMeteoWeatherProvider {
  searchCities(query: string, countryCode?: string): Promise<WeatherSearchCandidate[]>;
  getForecast(providerLocationId: string, requestNow?: Date): Promise<WeatherContext | null>;
}

interface GeocodingLocation {
  readonly id: number;
  readonly name: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly timezone: string;
  readonly country?: string;
  readonly admin1?: string;
}

function locationSchema(value: unknown): GeocodingLocation | null {
  if (typeof value !== 'object' || value === null) return null;
  const source = value as Record<string, unknown>;
  if (!Number.isSafeInteger(source.id) || Number(source.id) < 0
      || typeof source.name !== 'string' || source.name.trim().length === 0
      || typeof source.latitude !== 'number' || !Number.isFinite(source.latitude)
      || typeof source.longitude !== 'number' || !Number.isFinite(source.longitude)
      || typeof source.timezone !== 'string') return null;
  try { new Intl.DateTimeFormat('en', { timeZone: source.timezone }); } catch { return null; }
  return {
    id: Number(source.id), name: source.name.trim(), latitude: source.latitude,
    longitude: source.longitude, timezone: source.timezone,
    ...(typeof source.country === 'string' ? { country: source.country.trim() } : {}),
    ...(typeof source.admin1 === 'string' ? { admin1: source.admin1.trim() } : {}),
  };
}

function displayLabel(location: GeocodingLocation): string {
  return [location.name, location.admin1, location.country]
    .filter((part): part is string => Boolean(part))
    .filter((part, index, list) => list.findIndex(value => value.toLowerCase() === part.toLowerCase()) === index)
    .join(', ');
}

function timestamp(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = new Date(value * 1000);
    return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
  }
  if (typeof value !== 'string' || value.length > 40) return null;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function numbers(value: unknown): value is number[] {
  return Array.isArray(value) && value.every(entry => typeof entry === 'number' && Number.isFinite(entry));
}

function configuredUrl(host: string, pathname: string, key?: string): URL {
  const url = new URL(pathname, host);
  if (key) url.searchParams.set('apikey', key);
  return url;
}

export function createOpenMeteoWeatherProvider(options: OpenMeteoWeatherProviderOptions): OpenMeteoWeatherProvider {
  const production = options.mode === 'production';
  if (production && (!options.commercialApiKey?.trim() || !options.licenseReviewId?.trim())) {
    throw new Error('weather-provider-not-configured');
  }
  const geocodingHost = production ? GEOCODING_CUSTOMER : GEOCODING_FREE;
  const forecastHost = production ? FORECAST_CUSTOMER : FORECAST_FREE;
  const key = production ? options.commercialApiKey!.trim() : undefined;
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? (() => new Date());

  async function fetchJson(url: URL): Promise<unknown> {
    try {
      const response = await fetcher(url, {
        method: 'GET', headers: { accept: 'application/json' },
        redirect: 'error', signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) return null;
      const declaredLength = Number(response.headers.get('content-length'));
      if (Number.isFinite(declaredLength) && declaredLength > 512 * 1024) return null;
      const reader = response.body?.getReader();
      if (!reader) return null;
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > 512 * 1024) {
          await reader.cancel();
          return null;
        }
        chunks.push(value);
      }
      const bytes = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
      return null;
    }
  }

  async function getLocation(providerLocationId: string): Promise<GeocodingLocation | null> {
    const match = LOCATION_ID.exec(providerLocationId);
    if (!match) return null;
    const url = configuredUrl(geocodingHost, '/v1/get', key);
    url.searchParams.set('id', match[1]!);
    url.searchParams.set('language', 'en');
    const location = locationSchema(await fetchJson(url));
    return location && String(location.id) === match[1] ? location : null;
  }

  return {
    async searchCities(query, countryCode) {
      if (typeof query !== 'string' || query.trim().length < 2 || query.trim().length > 80
          || !/^[\p{L}\p{M}\p{N} .,'’()-]+$/u.test(query.trim())) return [];
      const url = configuredUrl(geocodingHost, '/v1/search', key);
      url.searchParams.set('name', query.trim());
      url.searchParams.set('count', '5');
      url.searchParams.set('language', 'en');
      if (countryCode) url.searchParams.set('countryCode', countryCode.toUpperCase());
      const payload = await fetchJson(url);
      if (typeof payload !== 'object' || payload === null || !Array.isArray((payload as Record<string, unknown>).results)) return [];
      return ((payload as { results: unknown[] }).results)
        .slice(0, 5)
        .map(locationSchema)
        .filter((location): location is GeocodingLocation => location !== null)
        .map(location => WeatherSearchCandidateSchema.safeParse({
          providerLocationId: `open-meteo:${location.id}`,
          displayLabel: displayLabel(location),
          timezone: location.timezone,
        }))
        .filter(result => result.success)
        .map(result => result.data);
    },

    async getForecast(providerLocationId, requestNow) {
      try {
        const location = await getLocation(providerLocationId);
        if (!location) return null;
        const url = configuredUrl(forecastHost, '/v1/forecast', key);
        url.searchParams.set('latitude', String(location.latitude));
        url.searchParams.set('longitude', String(location.longitude));
        url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,dew_point_2m,precipitation,wind_speed_10m');
        url.searchParams.set('hourly', 'temperature_2m,relative_humidity_2m,dew_point_2m,precipitation_probability,wind_speed_10m');
        url.searchParams.set('temperature_unit', 'celsius');
        url.searchParams.set('wind_speed_unit', 'kmh');
        url.searchParams.set('precipitation_unit', 'mm');
        url.searchParams.set('timezone', location.timezone);
        url.searchParams.set('forecast_days', '2');
        const payload = await fetchJson(url);
        if (typeof payload !== 'object' || payload === null) return null;
        const value = payload as Record<string, unknown>;
        const current = value.current as Record<string, unknown> | null;
        const hourly = value.hourly as Record<string, unknown> | null;
        if (!current || !hourly || !Array.isArray(hourly.time)
            || !numbers(hourly.temperature_2m) || !numbers(hourly.relative_humidity_2m)
            || !numbers(hourly.dew_point_2m) || !numbers(hourly.precipitation_probability)
            || !numbers(hourly.wind_speed_10m)) return null;
        const fields = [hourly.time.length, hourly.temperature_2m.length,
          hourly.relative_humidity_2m.length, hourly.dew_point_2m.length,
          hourly.precipitation_probability.length, hourly.wind_speed_10m.length];
        if (fields.some(length => length !== fields[0]) || !fields[0] || fields[0]! > 400) return null;
        const times = hourly.time;
        const temperatures = hourly.temperature_2m;
        const humidities = hourly.relative_humidity_2m;
        const dewPoints = hourly.dew_point_2m;
        const precipitationProbabilities = hourly.precipitation_probability;
        const windSpeeds = hourly.wind_speed_10m;
        const fetchedAt = requestNow ?? now();
        if (!Number.isFinite(fetchedAt.getTime())) return null;
        const fetchedAtIso = fetchedAt.toISOString();
        const currentTime = timestamp(current.time);
        if (currentTime === null || !numbers([current.temperature_2m, current.relative_humidity_2m,
          current.dew_point_2m, current.precipitation, current.wind_speed_10m])) return null;
        const hourlyRows = times.map((time, index) => ({
          forecastAt: timestamp(time), temperatureC: temperatures[index],
          relativeHumidityPercent: humidities[index], dewPointC: dewPoints[index],
          precipitationProbabilityPercent: precipitationProbabilities[index], windKph: windSpeeds[index],
        }));
        if (hourlyRows.some(row => row.forecastAt === null)) return null;
        const until = fetchedAt.getTime() + 24 * 60 * 60 * 1000;
        const next24Hours = hourlyRows.filter(row => Date.parse(row.forecastAt!) > fetchedAt.getTime()
          && Date.parse(row.forecastAt!) <= until).slice(0, 24);
        const parsed = WeatherContextSchema.safeParse({
          source: 'open_meteo', placeLabel: displayLabel(location), fetchedAt: fetchedAtIso,
          observationAt: currentTime, forecastFor: fetchedAtIso,
          freshUntil: new Date(fetchedAt.getTime() + 30 * 60 * 1000).toISOString(),
          current: {
            temperatureC: current.temperature_2m, relativeHumidityPercent: current.relative_humidity_2m,
            dewPointC: current.dew_point_2m, precipitationMm: current.precipitation, windKph: current.wind_speed_10m,
          },
          hourly: next24Hours,
        });
        return parsed.success ? parsed.data : null;
      } catch {
        return null;
      }
    },
  };
}

export { ATTRIBUTION };
