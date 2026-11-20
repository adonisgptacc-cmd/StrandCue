import { createElement } from 'react';
import { act, create, type ReactTestRenderer } from 'react-test-renderer';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { WeatherContextCard } from '../../apps/mobile/src/weather/WeatherContextCard.tsx';
import { createWeatherController, type WeatherControllerApi } from '../../apps/mobile/src/weather/weather-controller.ts';
import { createWeatherStorage, type WeatherStorageBackend } from '../../apps/mobile/src/weather/weather-storage.ts';
import { flush, renderedText, walk } from '../helpers/native-render.ts';

vi.mock('react-native', async () => (await import('./support/rn-mock.ts')).rnMock);
let originalError: typeof console.error;
beforeAll(() => { originalError = console.error; console.error = (...args: unknown[]) => { if (!String(args[0]).includes('react-test-renderer is deprecated')) originalError(...args); }; });
afterAll(() => { console.error = originalError; });

function makeController() {
  const values = new Map<string, string>();
  const backend: WeatherStorageBackend = { getItem: async key => values.get(key) ?? null, setItem: async (key, value) => { values.set(key, value); }, removeItem: async key => { values.delete(key); } };
  const api: WeatherControllerApi = { searchWeatherCities: vi.fn(async () => []), fetchWeatherContext: vi.fn(async () => { throw new Error('offline'); }) };
  return createWeatherController({ api, storage: createWeatherStorage(backend, '11111111-1111-4111-8111-111111111111'), ownerKey: '11111111-1111-4111-8111-111111111111', consent: { read: async () => true, set: async () => undefined }, now: () => new Date('2026-11-02T10:00:00.000Z') });
}

describe('weather and Today flow', () => {
  it('keeps Today mounted and usable below the non-blocking weather card', async () => {
    const target = makeController();
    await target.load();
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(createElement('main', null,
      createElement(WeatherContextCard, { controller: target }),
      createElement('section', { accessibilityLabel: 'Today guidance' }, 'Today guidance: continue with your usual plan.'),
    )); });
    await flush();
    const text = renderedText(renderer);
    expect(text).toContain('Choose a home city or temporary destination to see local weather.');
    expect(text).toContain('Today guidance: continue with your usual plan.');
    const order: string[] = [];
    walk(renderer.root, node => { if (typeof node.props?.accessibilityLabel === 'string') order.push(node.props.accessibilityLabel); });
    expect(order.indexOf('Weather context')).toBeLessThan(order.indexOf('Today guidance'));
  });
});
