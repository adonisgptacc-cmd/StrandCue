import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import type { WeatherContext, WeatherContextState } from '../../../../packages/domain/src/weather/weather-context.ts';
import type { createWeatherController } from './weather-controller.ts';
import { WEATHER_INFORMATIONAL_DISCLAIMER, weatherUnavailableCopy } from './weather-copy.ts';
import { Button, styles } from '../ui.tsx';

type WeatherController = ReturnType<typeof createWeatherController>;

function localDate(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatTime(value: string | null): string {
  return value === null ? 'Not supplied' : `${new Date(value).toLocaleString()} (device local time)`;
}

function weatherDetails(context: WeatherContext) {
  return <>
    <Text style={styles.body}>Current: {context.current.temperatureC}°C · humidity {context.current.relativeHumidityPercent}% · dew point {context.current.dewPointC}°C · wind {context.current.windKph} km/h · precipitation {context.current.precipitationMm} mm</Text>
    <Text style={styles.body}>Observation time: {formatTime(context.observationAt)}</Text>
    <Text style={styles.body}>Forecast for: {formatTime(context.forecastFor)}</Text>
    <Text style={styles.body}>Updated: {formatTime(context.fetchedAt)}</Text>
    {context.hourly.length > 0 && <View style={styles.notice}>
      <Text style={styles.label}>Next 24 hours</Text>
      {context.hourly.map(hour => <Text key={hour.forecastAt} style={styles.body}>{formatTime(hour.forecastAt)} · {hour.temperatureC}°C · humidity {hour.relativeHumidityPercent}% · dew point {hour.dewPointC}°C · rain chance {hour.precipitationProbabilityPercent}% · wind {hour.windKph} km/h</Text>)}
    </View>}
  </>;
}

function statusMessage(weather: WeatherContextState): string | null {
  if (weather.status === 'current') return null;
  if (weather.status === 'stale') return 'This weather context is stale. Refresh to request an update.';
  return weatherUnavailableCopy[weather.reason] ?? weatherUnavailableCopy.network_error!;
}

export function WeatherContextCard({ controller }: { readonly controller: WeatherController }) {
  const [state, setState] = useState(controller.getState());
  useEffect(() => controller.subscribe(setState), [controller]);
  const travel = state.settings.travel;
  const todayAtDestination = travel ? localDate(new Date(), travel.timezone) : '';
  const activeLocation = travel && todayAtDestination >= travel.startDate && todayAtDestination <= travel.endDate
    ? travel.place.providerLocationId
    : state.settings.home?.providerLocationId ?? '';
  useEffect(() => {
    if (state.consent && activeLocation !== '') void controller.refresh();
  }, [controller, state.consent, state.revision, activeLocation]);
  useEffect(() => {
    if (state.weather.status !== 'current') return undefined;
    const untilStale = Date.parse(state.weather.context.freshUntil) - Date.now() + 1;
    const timer = setTimeout(() => setState(controller.getState()), Math.max(1, Math.min(untilStale, 2_147_000_000)));
    return () => clearTimeout(timer);
  }, [controller, state.weather]);

  const weather = state.weather;
  const context = weather.status === 'current' || weather.status === 'stale' ? weather.context : null;
  const message = statusMessage(weather);
  return <View accessibilityLabel="Weather context" style={styles.card}>
    <Text accessibilityRole="header" style={styles.heading}>Weather context</Text>
    {context && <>
      <Text style={styles.body}>{context.placeLabel}</Text>
      {weather.status === 'stale' && <Text style={styles.error}>Weather is stale. Shown values may have changed.</Text>}
      {weatherDetails(context)}
    </>}
    {message && <Text style={styles.body}>{message}</Text>}
    <Text style={styles.body}>Source: Weather data by Open-Meteo (open-meteo.com)</Text>
    {state.consent && (state.settings.home !== null || state.settings.travel !== null) && <Button title="Refresh weather" secondary onPress={() => void controller.refresh()} />}
    <Text style={styles.subtitle}>Today guidance is available without weather.</Text>
    <Text style={styles.subtitle}>{WEATHER_INFORMATIONAL_DISCLAIMER}</Text>
  </View>;
}
