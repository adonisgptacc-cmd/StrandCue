import { z } from 'zod';

import {
  WeatherPlaceSchema,
  WeatherTravelWindowSchema,
} from '../../../../packages/domain/src/weather/weather-context.ts';
import type { SecureBackend } from '../chunk-storage.ts';

export type WeatherStorageBackend = SecureBackend;

const TravelLocationSchema = z.object({
  place: WeatherPlaceSchema,
  startDate: z.string(),
  endDate: z.string(),
  timezone: z.string(),
}).strict().superRefine((travel, issue) => {
  const result = WeatherTravelWindowSchema.safeParse({
    startDate: travel.startDate, endDate: travel.endDate, timezone: travel.timezone,
  });
  if (!result.success) issue.addIssue({ code: 'custom', path: ['endDate'], message: 'Invalid travel window' });
  if (travel.timezone !== travel.place.timezone) {
    issue.addIssue({ code: 'custom', path: ['timezone'], message: 'Travel timezone must match the selected place' });
  }
});

export const WeatherLocationSettingsSchema = z.object({
  home: WeatherPlaceSchema.nullable(),
  travel: TravelLocationSchema.nullable(),
}).strict();
export type WeatherLocationSettings = z.output<typeof WeatherLocationSettingsSchema>;

export interface VersionedWeatherSettings {
  readonly revision: number;
  readonly settings: WeatherLocationSettings;
}

export interface WeatherStorage {
  readonly ownerKey: string;
  loadVersioned(): Promise<VersionedWeatherSettings>;
  save(settings: WeatherLocationSettings, expectedRevision: number): Promise<number>;
  clearWeatherCache(): Promise<void>;
  clearOwner(): Promise<void>;
}

const emptySettings = (): WeatherLocationSettings => ({ home: null, travel: null });
const queues = new WeakMap<object, Map<string, Promise<void>>>();

function serialize<T>(backend: object, ownerKey: string, operation: () => Promise<T>): Promise<T> {
  let byOwner = queues.get(backend);
  if (!byOwner) {
    byOwner = new Map();
    queues.set(backend, byOwner);
  }
  const previous = byOwner.get(ownerKey) ?? Promise.resolve();
  const result = previous.then(operation);
  byOwner.set(ownerKey, result.then(() => undefined, () => undefined));
  return result;
}

function ownerKeyPart(ownerKey: string): string {
  if (!z.string().uuid().safeParse(ownerKey).success) throw new Error('weather-owner-key-invalid');
  return ownerKey;
}

export function createWeatherStorage(backend: WeatherStorageBackend, ownerKey: string): WeatherStorage {
  const key = ownerKeyPart(ownerKey);
  const settingsKey = `strandcue.weather.settings.v1.${key}`;
  const cacheKey = `strandcue.weather.cache.v1.${key}`;

  const read = async (): Promise<VersionedWeatherSettings> => {
    const raw = await backend.getItem(settingsKey);
    if (raw === null) return { revision: 0, settings: emptySettings() };
    let value: unknown;
    try { value = JSON.parse(raw); } catch { throw new Error('weather-settings-unavailable'); }
    const parsed = z.object({
      version: z.literal(1), revision: z.number().int().nonnegative(),
      settings: WeatherLocationSettingsSchema,
    }).strict().safeParse(value);
    if (!parsed.success) throw new Error('weather-settings-unavailable');
    return { revision: parsed.data.revision, settings: parsed.data.settings };
  };

  return {
    ownerKey: key,
    loadVersioned: () => serialize(backend, key, read),
    save: (settings, expectedRevision) => serialize(backend, key, async () => {
      const parsed = WeatherLocationSettingsSchema.parse(settings);
      const current = await read();
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== current.revision) {
        throw new Error('weather-settings-conflict');
      }
      const revision = current.revision + 1;
      await backend.setItem(settingsKey, JSON.stringify({ version: 1, revision, settings: parsed }));
      return revision;
    }),
    clearWeatherCache: () => serialize(backend, key, async () => { await backend.removeItem(cacheKey); }),
    clearOwner: () => serialize(backend, key, async () => {
      await backend.removeItem(cacheKey);
      await backend.removeItem(settingsKey);
    }),
  };
}
