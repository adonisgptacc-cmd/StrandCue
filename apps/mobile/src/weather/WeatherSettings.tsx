import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import type { WeatherSearchCandidate } from '../../../../packages/domain/src/weather/weather-context.ts';
import type { createWeatherController } from './weather-controller.ts';
import { WEATHER_CONSENT_EXPLANATION } from './weather-copy.ts';
import { Button, Field, styles } from '../ui.tsx';

type WeatherController = ReturnType<typeof createWeatherController>;

export function WeatherSettings({ controller }: { readonly controller: WeatherController }) {
  const [state, setState] = useState(controller.getState());
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [message, setMessage] = useState('');
  const [travelCandidate, setTravelCandidate] = useState<WeatherSearchCandidate | null>(null);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    const unsubscribe = controller.subscribe(setState);
    void controller.load();
    return unsubscribe;
  }, [controller]);

  const search = async () => {
    if (!state.consent || searching) return;
    setSearching(true);
    setMessage('');
    try {
      await controller.searchCities(query);
      if (controller.getState().candidates.length === 0) setMessage('No city matches. Try a nearby city name.');
    } catch {
      setMessage('City search is temporarily unavailable. Please try again.');
    } finally { setSearching(false); }
  };

  const setHome = async (candidate: WeatherSearchCandidate) => {
    setMessage('');
    try { await controller.selectHome(candidate); setMessage(`${candidate.displayLabel} saved as your home city.`); }
    catch { setMessage('Your home city could not be saved. Please try again.'); }
  };

  const saveTravel = async () => {
    if (!travelCandidate) return;
    setMessage('');
    try {
      await controller.setTravel(travelCandidate, { startDate, endDate, timezone: travelCandidate.timezone });
      setTravelCandidate(null);
      setMessage('Temporary destination saved. The start and end dates are included.');
    } catch { setMessage('Check the travel dates and try again. The end date must be on or after the start date.'); }
  };

  const clearLocations = async () => {
    setMessage('');
    try {
      await controller.selectHome(null);
      await controller.clearTravel();
      setTravelCandidate(null);
      setMessage('Saved weather locations cleared.');
    } catch { setMessage('Saved locations could not be cleared. Please try again.'); }
  };

  const toggleSharing = async () => {
    setMessage('');
    try { await controller.setConsent(!state.consent); }
    catch {
      setMessage(controller.getState().consent
        ? 'Your weather sharing choice could not be saved. Please try again.'
        : 'Weather sharing is off, but saved weather data could not be cleared from this device.');
    }
  };

  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.heading}>Weather and travel</Text>
    <Text style={styles.body}>{WEATHER_CONSENT_EXPLANATION}</Text>
    <Text style={styles.body}>Only a manually searched city is sent after you turn this on and choose Search city. Choosing a result saves that place; it does not request your device location.</Text>
    <Button
      title={state.consent ? 'Turn off weather sharing' : 'Turn on weather sharing'}
      secondary={!state.consent}
      onPress={() => void toggleSharing()}
    />
    {state.consent && <>
      <Field label="City to search" value={query} onChangeText={setQuery} autoCapitalize="words" maxLength={80} />
      <Button title={searching ? 'Searching…' : 'Search city'} disabled={searching || query.trim().length < 2} onPress={() => void search()} />
      {state.candidates.map(candidate => <View key={candidate.providerLocationId} style={styles.notice}>
        <Text style={styles.body}>{candidate.displayLabel}</Text>
        <Button title={`Set ${candidate.displayLabel} as home city`} secondary onPress={() => void setHome(candidate)} />
        <Button title={`Set ${candidate.displayLabel} as temporary destination`} secondary onPress={() => { setTravelCandidate(candidate); setMessage(''); }} />
      </View>)}
      <Text style={styles.body}>Home city: {state.settings.home?.displayLabel ?? 'None saved'}</Text>
      {state.settings.travel && <View style={styles.notice}>
        <Text style={styles.body}>Temporary destination: {state.settings.travel.place.displayLabel}</Text>
        <Text style={styles.body}>Inclusive dates: {state.settings.travel.startDate} to {state.settings.travel.endDate} ({state.settings.travel.timezone})</Text>
        <Button title="Remove temporary destination" secondary onPress={() => void controller.clearTravel().catch(() => setMessage('Temporary destination could not be removed.'))} />
      </View>}
      {travelCandidate && <View style={styles.notice}>
        <Text style={styles.body}>Set {travelCandidate.displayLabel} for inclusive destination-local dates.</Text>
        <Field label="Travel starts (YYYY-MM-DD)" value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" maxLength={10} />
        <Field label="Travel ends (YYYY-MM-DD)" value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" maxLength={10} />
        <Text style={styles.body}>Inclusive dates use the destination’s local calendar.</Text>
        <Button title="Save temporary destination" onPress={() => void saveTravel()} />
        <Button title="Cancel destination selection" secondary onPress={() => setTravelCandidate(null)} />
      </View>}
    </>}
    <Button title="Clear saved weather locations" secondary onPress={() => void clearLocations()} />
    {!!message && <Text accessibilityLiveRegion="polite" style={styles.body}>{message}</Text>}
  </View>;
}
