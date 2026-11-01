import {
  classifyWeatherFreshness,
  WeatherContextStateSchema,
  WeatherPlaceSchema,
  WeatherTravelWindowSchema,
  type WeatherContextState,
  type WeatherSearchCandidate,
} from '../../../../packages/domain/src/weather/weather-context.ts';
import type { WeatherApi } from './weather-api.ts';
import {
  WeatherLocationSettingsSchema,
  type WeatherLocationSettings,
  type WeatherStorage,
} from './weather-storage.ts';

export interface WeatherConsentPort {
  read(): Promise<boolean>;
  set(granted: boolean): Promise<void>;
}

export type WeatherControllerApi = WeatherApi;

export interface WeatherControllerDependencies {
  readonly api: WeatherControllerApi;
  readonly storage: WeatherStorage;
  readonly ownerKey: string;
  readonly consent: WeatherConsentPort;
  readonly now: () => Date;
}

export interface WeatherControllerState {
  readonly ownerKey: string;
  readonly revision: number;
  readonly consent: boolean;
  readonly settings: WeatherLocationSettings;
  readonly candidates: readonly WeatherSearchCandidate[];
  readonly weather: WeatherContextState;
}

type Listener = (state: WeatherControllerState) => void;
const emptySettings = (): WeatherLocationSettings => ({ home: null, travel: null });
const initialWeather = (): WeatherContextState => ({ status: 'unavailable', reason: 'no_location' });

function localDate(now: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function millisecondsUntilLocalDate(now: Date, timezone: string, targetDate: string): number {
  const currentDate = localDate(now, timezone);
  const daysAhead = Math.max(0, (Date.parse(`${targetDate}T00:00:00Z`) - Date.parse(`${currentDate}T00:00:00Z`)) / 86_400_000);
  let low = now.getTime();
  let high = low + (daysAhead + 2) * 24 * 60 * 60 * 1000;
  while (localDate(new Date(high), timezone) < targetDate) high += 24 * 60 * 60 * 1000;
  while (high - low > 1000) {
    const middle = Math.floor((low + high) / 2);
    if (localDate(new Date(middle), timezone) >= targetDate) high = middle;
    else low = middle;
  }
  return Math.max(1, high - now.getTime());
}

function activePlace(settings: WeatherLocationSettings, now: Date) {
  const travel = settings.travel;
  if (travel && Number.isFinite(now.getTime())) {
    const date = localDate(now, travel.timezone);
    if (date >= travel.startDate && date <= travel.endDate) return travel.place;
  }
  return settings.home;
}

function placeKey(place: { providerLocationId: string; displayLabel: string; timezone: string } | null): string | null {
  return place ? `${place.providerLocationId}|${place.displayLabel}|${place.timezone}` : null;
}

export function createWeatherController(dependencies: WeatherControllerDependencies) {
  const { api, storage, ownerKey, consent } = dependencies;
  if (storage.ownerKey !== ownerKey) throw new Error('weather-owner-storage-mismatch');
  let state: WeatherControllerState = {
    ownerKey, revision: 0, consent: false, settings: emptySettings(), candidates: [], weather: initialWeather(),
  };
  let epoch = 0;
  let settingsEpoch = 0;
  let contextLocationKey: string | null = null;
  let closed = false;
  let settingsQueue: Promise<void> = Promise.resolve();
  let travelBoundaryTimer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<Listener>();

  const snapshot = (): WeatherControllerState => {
    const selectedKey = placeKey(activePlace(state.settings, dependencies.now()));
    const contextBoundToSelection = contextLocationKey === selectedKey && selectedKey !== null;
    if ((state.weather.status === 'current' || state.weather.status === 'stale') && !contextBoundToSelection) {
      contextLocationKey = null;
    }
    const selectedWeather = (state.weather.status === 'current' || state.weather.status === 'stale')
        && !contextBoundToSelection
      ? { status: 'unavailable' as const, reason: selectedKey === null ? 'no_location' as const : 'not_requested' as const }
      : state.weather;
    const freshness = selectedWeather.status === 'current'
      ? classifyWeatherFreshness(selectedWeather.context, dependencies.now())
      : selectedWeather.status;
    const weather = selectedWeather.status === 'current' && freshness === 'stale'
      ? { status: 'stale' as const, context: selectedWeather.context }
      : selectedWeather;
    return {
      ...state,
      settings: WeatherLocationSettingsSchema.parse(state.settings),
      candidates: state.candidates.map(candidate => ({ ...candidate })),
      weather: WeatherContextStateSchema.parse(weather),
    };
  };
  const emit = () => {
    const value = snapshot();
    for (const listener of listeners) listener(value);
  };
  function scheduleTravelBoundary() {
    if (travelBoundaryTimer !== null) clearTimeout(travelBoundaryTimer);
    travelBoundaryTimer = null;
    const travel = state.settings.travel;
    if (closed || listeners.size === 0 || travel === null) return;
    const now = dependencies.now();
    if (!Number.isFinite(now.getTime())) return;
    const today = localDate(now, travel.timezone);
    if (today > travel.endDate) return;
    let targetDate = travel.startDate;
    if (today >= travel.startDate) {
      const [year, month, day] = today.split('-').map(Number);
      targetDate = new Date(Date.UTC(year!, month! - 1, day! + 1)).toISOString().slice(0, 10);
    }
    travelBoundaryTimer = setTimeout(() => {
      travelBoundaryTimer = null;
      if (closed) return;
      emit();
      scheduleTravelBoundary();
    }, Math.min(millisecondsUntilLocalDate(now, travel.timezone, targetDate), 2_147_000_000));
  }
  const setState = (next: WeatherControllerState) => {
    state = next;
    emit();
    scheduleTravelBoundary();
  };
  const invalidateWeather = (settings: WeatherLocationSettings, hasConsent: boolean): WeatherContextState => {
    const place = activePlace(settings, dependencies.now());
    return { status: 'unavailable', reason: hasConsent ? (place ? 'not_requested' : 'no_location') : 'consent_required' };
  };

  function updateSettings(update: (current: WeatherLocationSettings) => WeatherLocationSettings): Promise<void> {
    if (closed) return Promise.reject(new Error('weather-controller-closed'));
    const currentSettingsEpoch = ++settingsEpoch;
    ++epoch;
    const operation = settingsQueue.then(async () => {
      const versioned = await storage.loadVersioned();
      const settings = WeatherLocationSettingsSchema.parse(update(versioned.settings));
      const revision = await storage.save(settings, versioned.revision);
      if (closed || currentSettingsEpoch !== settingsEpoch) return;
      ++epoch;
      const nextLocationKey = placeKey(activePlace(settings, dependencies.now()));
      if (contextLocationKey !== nextLocationKey) contextLocationKey = null;
      const weather = contextLocationKey === nextLocationKey && state.weather.status !== 'unavailable'
        ? state.weather
        : invalidateWeather(settings, state.consent);
      setState({ ...state, revision, settings, candidates: [], weather });
    });
    settingsQueue = operation.then(() => undefined, () => undefined);
    return operation;
  }

  return {
    getState: snapshot,
    subscribe(listener: Listener) {
      listeners.add(listener);
      listener(snapshot());
      scheduleTravelBoundary();
      return () => {
        listeners.delete(listener);
        scheduleTravelBoundary();
      };
    },

    async load() {
      if (closed) return snapshot();
      const loadEpoch = ++epoch;
      const [versioned, granted] = await Promise.all([
        storage.loadVersioned().catch(() => ({ revision: 0, settings: emptySettings() })),
        consent.read().catch(() => false),
      ]);
      if (closed || loadEpoch !== epoch) return snapshot();
      contextLocationKey = null;
      const settings = WeatherLocationSettingsSchema.parse(versioned.settings);
      const place = activePlace(settings, dependencies.now());
      setState({
        ...state,
        revision: versioned.revision,
        settings,
        consent: granted,
        weather: { status: 'unavailable', reason: granted ? (place ? 'network_error' : 'no_location') : 'consent_required' },
      });
      return snapshot();
    },

    async setConsent(granted: boolean) {
      if (closed) throw new Error('weather-controller-closed');
      if (!granted) {
        ++epoch;
        contextLocationKey = null;
        setState({ ...state, consent: false, candidates: [], weather: { status: 'unavailable', reason: 'consent_required' } });
        await storage.clearWeatherCache();
        if (closed) return;
      }
      await consent.set(granted);
      if (closed) return;
      if (granted) {
        ++epoch;
        contextLocationKey = null;
      setState({ ...state, consent: true, candidates: [], weather: invalidateWeather(state.settings, true) });
      }
    },

    async searchCities(query: string, countryCode?: string): Promise<WeatherSearchCandidate[]> {
      if (closed) throw new Error('weather-controller-closed');
      if (!state.consent) throw new Error('weather-consent-required');
      const searchEpoch = ++epoch;
      setState({ ...state, candidates: [] });
      const candidates = await api.searchWeatherCities({ query, ...(countryCode ? { countryCode } : {}) });
      if (closed || searchEpoch !== epoch || !state.consent) return [];
      setState({ ...state, candidates: candidates.slice(0, 5) });
      return snapshot().candidates as WeatherSearchCandidate[];
    },

    selectHome(candidate: WeatherSearchCandidate | null) {
      const home = candidate === null ? null : WeatherPlaceSchema.parse(candidate);
      return updateSettings(current => ({ ...current, home }));
    },

    setTravel(candidate: WeatherSearchCandidate, window: { startDate: string; endDate: string; timezone: string }) {
      const place = WeatherPlaceSchema.parse(candidate);
      const travelWindow = WeatherTravelWindowSchema.parse(window);
      if (place.timezone !== travelWindow.timezone) throw new Error('weather-travel-timezone-mismatch');
      return updateSettings(current => ({ ...current, travel: { place, ...travelWindow } }));
    },

    clearTravel() {
      return updateSettings(current => ({ ...current, travel: null }));
    },

    async refresh() {
      if (closed) return;
      const refreshEpoch = ++epoch;
      if (!state.consent) {
        setState({ ...state, weather: { status: 'unavailable', reason: 'consent_required' } });
        return;
      }
      const selected = activePlace(state.settings, dependencies.now());
      if (!selected) {
        contextLocationKey = null;
        setState({ ...state, weather: { status: 'unavailable', reason: 'no_location' } });
        return;
      }
      try {
        const context = await api.fetchWeatherContext({ providerLocationId: selected.providerLocationId });
        if (closed || refreshEpoch !== epoch || !state.consent) return;
        const currentSelection = activePlace(state.settings, dependencies.now());
        if (placeKey(currentSelection) !== placeKey(selected)) return;
        if (context.placeLabel !== selected.displayLabel) {
          contextLocationKey = null;
          setState({ ...state, weather: { status: 'unavailable', reason: 'invalid_response' } });
          return;
        }
        const freshness = classifyWeatherFreshness(context, dependencies.now());
        const weather = WeatherContextStateSchema.parse(freshness === 'stale'
          ? { status: 'stale', context }
          : { status: 'current', context });
        contextLocationKey = placeKey(selected);
        setState({ ...state, weather });
      } catch {
        if (closed || refreshEpoch !== epoch || !state.consent) return;
        contextLocationKey = null;
        setState({ ...state, weather: { status: 'unavailable', reason: 'network_error' } });
      }
    },

    async clearOwner() {
      if (closed) return;
      closed = true;
      ++epoch;
      contextLocationKey = null;
      setState({
        ownerKey, revision: 0, consent: false, settings: emptySettings(), candidates: [], weather: initialWeather(),
      });
      await settingsQueue;
      await storage.clearWeatherCache();
      await storage.clearOwner();
    },
  };
}
