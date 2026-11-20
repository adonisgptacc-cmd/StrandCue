import { z } from 'zod';

import {
  WeatherForecastResponseSchema,
  WeatherCommandSchema,
  WeatherSearchResponseSchema,
} from './contracts.ts';
import type { WeatherContext, WeatherSearchCandidate } from '../../../packages/domain/src/weather/weather-context.ts';

const ConsentSchema = z.object({ weather_context: z.boolean().optional() }).passthrough();

export interface WeatherProvider {
  searchCities(query: string, countryCode?: string): Promise<WeatherSearchCandidate[]>;
  getForecast(providerLocationId: string, now?: Date): Promise<WeatherContext | null>;
}

export interface WeatherEdgeDependencies {
  /** Must verify the bearer token against Supabase Auth, not decode it locally. */
  readonly authenticate: (token: string) => Promise<{ id: string } | null>;
  /** Reads the current weather consent under the same user's JWT. */
  readonly listConsents: (token: string) => Promise<unknown>;
  /** Owner-scoped quota reservation; ownership derives from the JWT. */
  readonly reserveRequest: (token: string) => Promise<void>;
  readonly provider: WeatherProvider;
  readonly now: () => Date;
}

function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}

function bearer(request: Request): string | null {
  const match = /^Bearer ([^\s]{1,8192})$/.exec(request.headers.get('authorization') ?? '');
  return match?.[1] ?? null;
}

async function readBoundedJson(request: Request, maximumBytes: number): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error('invalid-command');
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        throw new Error('invalid-command');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
}

export async function handleWeatherContextRequest(
  request: Request,
  dependencies: WeatherEdgeDependencies,
): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'method-not-allowed' }, 405);
  const token = bearer(request);
  if (token === null) return json({ error: 'authentication-required' }, 401);

  try {
    const user = await dependencies.authenticate(token);
    if (!user || !z.string().uuid().safeParse(user.id).success) return json({ error: 'authentication-required' }, 401);
  } catch {
    return json({ error: 'authentication-required' }, 401);
  }

  let raw: unknown;
  try {
    if (request.headers.get('content-type')?.split(';')[0]?.trim() !== 'application/json') {
      return json({ error: 'invalid-command' }, 400);
    }
    raw = await readBoundedJson(request, 2048);
  } catch {
    return json({ error: 'invalid-command' }, 400);
  }
  const parsed = WeatherCommandSchema.safeParse(raw);
  if (!parsed.success) return json({ error: 'invalid-command' }, 400);

  let consents: unknown;
  try {
    consents = await dependencies.listConsents(token);
  } catch {
    return json({ error: 'weather-unavailable' }, 503);
  }
  if (ConsentSchema.safeParse(consents).data?.weather_context !== true) {
    return json({ error: 'consent-required' }, 403);
  }

  try {
    await dependencies.reserveRequest(token);
  } catch (error) {
    if (error instanceof Error && error.message === 'weather-rate-limited') {
      return json({ error: 'rate-limited' }, 429);
    }
    return json({ error: 'weather-unavailable' }, 503);
  }

  try {
    if (parsed.data.kind === 'search') {
      const candidates = await dependencies.provider.searchCities(parsed.data.query, parsed.data.countryCode);
      const result = WeatherSearchResponseSchema.safeParse({ candidates: candidates.slice(0, 5) });
      return result.success ? json(result.data) : json({ error: 'weather-unavailable' }, 503);
    }
    const context = await dependencies.provider.getForecast(parsed.data.providerLocationId, dependencies.now());
    if (context === null) return json({ error: 'weather-unavailable' }, 503);
    const result = WeatherForecastResponseSchema.safeParse({
      context,
      attribution: { label: 'Weather data by Open-Meteo', url: 'https://open-meteo.com/' },
    });
    return result.success ? json(result.data) : json({ error: 'weather-unavailable' }, 503);
  } catch {
    return json({ error: 'weather-unavailable' }, 503);
  }
}
