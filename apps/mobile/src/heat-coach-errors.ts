/** Closed, owner-safe error vocabulary for Heat Coach. Raw database text is never shown. */
export const HEAT_COACH_SERVER_CODES = [
  'account-not-active', 'invalid-heat-intent', 'operation-conflict',
  'heat-content-pending', 'publication-mismatch', 'assessment-quota-exceeded',
  'assessment-not-found', 'invalid-page',
] as const;
export const HEAT_COACH_CLIENT_CODES = ['offline', 'malformed-response', 'unavailable', 'unknown'] as const;
export type HeatCoachErrorCode = typeof HEAT_COACH_SERVER_CODES[number] | typeof HEAT_COACH_CLIENT_CODES[number];

export const HEAT_COACH_ERROR_COPY: Readonly<Record<HeatCoachErrorCode, string>> = {
  'account-not-active': 'Your account is not active right now.',
  'invalid-heat-intent': 'Check your heat choices and try again.',
  'operation-conflict': 'Your choices changed while saving. Review them and try again.',
  'heat-content-pending': 'Heat Coach guidance is not available yet.',
  'publication-mismatch': 'This guidance changed. Please reopen Heat Coach.',
  'assessment-quota-exceeded': 'You have reached the Heat Coach history limit.',
  'assessment-not-found': 'We could not find that assessment.',
  'invalid-page': 'This history page could not be loaded.',
  offline: 'You appear to be offline. Your unsent choices are still here.',
  'malformed-response': 'Heat Coach could not be read safely. Please try again.',
  unavailable: 'Heat Coach is not available right now.',
  unknown: 'Something went wrong. Please try again.',
};

export class HeatCoachError extends Error {
  readonly code: HeatCoachErrorCode;
  constructor(code: HeatCoachErrorCode) {
    super(HEAT_COACH_ERROR_COPY[code]);
    this.name = 'HeatCoachError';
    this.code = code;
  }
}

export function mapHeatCoachServerMessage(message: unknown): HeatCoachErrorCode {
  if (typeof message !== 'string') return 'unknown';
  const code = HEAT_COACH_SERVER_CODES.find(item => message.trim() === item);
  if (code) return code;
  return /failed to fetch|network request failed|networkerror|network error|load failed/i.test(message)
    ? 'offline' : 'unknown';
}
