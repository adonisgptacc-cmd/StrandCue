export const WEATHER_CONSENT_EXPLANATION = 'Weather sharing is optional and separate from your hair record. When enabled, a city you choose is sent to the weather provider to look up conditions. StrandCue does not use GPS for this feature.';
export const WEATHER_INFORMATIONAL_DISCLAIMER = 'Informational only. Weather does not change your Today guidance or replace your own judgment.';

export const weatherUnavailableCopy: Readonly<Record<string, string>> = {
  no_location: 'Choose a home city or temporary destination to see local weather.',
  not_requested: 'Weather has not been requested for this place yet.',
  consent_required: 'Turn on weather sharing in Settings to see this optional context.',
  not_configured: 'Weather is not available in this build.',
  network_error: 'Weather is temporarily unavailable.',
  invalid_response: 'Weather is temporarily unavailable.',
  rate_limited: 'Weather is temporarily unavailable. Try again later.',
};
