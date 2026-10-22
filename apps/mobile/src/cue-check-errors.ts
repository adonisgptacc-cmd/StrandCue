/**
 * Stable, user-safe failure vocabulary for the Cue Check client boundary.
 *
 * The server raises short stable codes (for example `revision-conflict`).
 * Only an exact match against this closed list is trusted; anything else
 * fails closed to neutral copy. Visible copy is plain and non-technical: it
 * never carries SQLSTATE values, function or table names, identifiers, raw
 * payloads or exception text, and never suggests a product caused an outcome.
 */

/** Codes the database raises and this boundary recognises exactly. */
export const CUE_CHECK_SERVER_CODES = [
  'authentication-required',
  'account-not-active',
  'invalid-operation',
  'invalid-observation',
  'execution-not-found',
  'execution-not-terminal',
  'execution-not-usable',
  'run-not-consistent',
  'duplicate-active',
  'record-not-found',
  'revision-conflict',
  'record-voided',
  'no-op-correction',
  'timing-mismatch',
  'operation-conflict',
  'invalid-reason',
  'quota-exceeded',
  'invalid-page',
  'invalid-cursor',
  'invalid-receipt-order',
] as const;

/** States raised by the client itself rather than by a server code. */
export const CUE_CHECK_CLIENT_CODES = ['offline', 'malformed-response', 'unavailable', 'unknown'] as const;

export const CUE_CHECK_ERROR_CODES = [...CUE_CHECK_SERVER_CODES, ...CUE_CHECK_CLIENT_CODES] as const;

export type CueCheckServerCode = (typeof CUE_CHECK_SERVER_CODES)[number];
export type CueCheckErrorCode = (typeof CUE_CHECK_ERROR_CODES)[number];

/** Where in the Cue Check flow a failure happened. */
export type CueCheckFailureSource = 'list' | 'page' | 'detail' | 'create' | 'correct' | 'void';

/** Every code has explicit copy; the record type makes a missing one a compile error. */
export const CUE_CHECK_ERROR_COPY: Readonly<Record<CueCheckErrorCode, string>> = {
  'authentication-required': 'Sign in to record how your hair felt.',
  'account-not-active': 'Your account is not active, so check-ins cannot be saved right now.',
  'invalid-operation': 'That request could not be sent. Please try again.',
  'invalid-observation': 'Some answers could not be saved. Check them and try again.',
  'execution-not-found': 'We could not find that routine record.',
  'execution-not-terminal': 'Finish or stop this routine before recording how it went.',
  'execution-not-usable': 'This routine record cannot be used for a check-in.',
  'run-not-consistent': 'This routine record cannot be used for a check-in.',
  'duplicate-active': 'You already recorded this check-in. Open it to review or correct it.',
  'record-not-found': 'We could not find that check-in.',
  'revision-conflict': 'This check-in changed on another session. Reload it before trying again.',
  'record-voided': 'This check-in was removed from your active history.',
  'no-op-correction': 'Nothing changed yet. Change an answer before saving a correction.',
  'timing-mismatch': 'A correction must keep the same timing as the original check-in.',
  'operation-conflict': 'This save no longer matches what was sent before. Review your answers and save again.',
  'invalid-reason': 'Add a short reason of up to 500 characters.',
  'quota-exceeded': 'No more entries can be added to this routine record.',
  'invalid-page': 'That page of check-ins could not be loaded. Reload the list.',
  'invalid-cursor': 'That page of check-ins could not be loaded. Reload the list.',
  'invalid-receipt-order': 'This check-in cannot be changed right now. Reload it and try again.',
  offline: 'You appear to be offline. Your unsent answers are still here.',
  'malformed-response': 'This check-in could not be read safely.',
  unavailable: 'Check-ins are not available until the app is set up.',
  unknown: 'Something went wrong. Your unsent answers are still here.',
};

/**
 * Reads hold no unsent answers, so the two codes whose copy promises them are
 * restated plainly when a list or detail load fails.
 */
const READ_COPY: Readonly<Partial<Record<CueCheckErrorCode, string>>> = {
  offline: 'You appear to be offline. Check your connection and try again.',
  unknown: 'Something went wrong. Please try again.',
};

/** Failures worth retrying as-is: the request itself may be fine. */
const RETRYABLE: ReadonlySet<CueCheckErrorCode> = new Set<CueCheckErrorCode>(['offline', 'unknown']);

const SERVER_CODE_SET: ReadonlySet<string> = new Set<string>(CUE_CHECK_SERVER_CODES);

/**
 * A typed, user-safe error. Its message is always the mapped copy, so it is
 * safe to show; no cause, payload or server text is ever attached.
 */
export class CueCheckError extends Error {
  readonly code: CueCheckErrorCode;

  constructor(code: CueCheckErrorCode) {
    super(CUE_CHECK_ERROR_COPY[code]);
    this.name = 'CueCheckError';
    this.code = code;
  }
}

/** What state holds about a failure: safe fields only. */
export interface CueCheckFailure {
  readonly code: CueCheckErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly source: CueCheckFailureSource;
}

/**
 * Map a database error message to a code. Only an exact stable code is
 * trusted; transport-looking messages become `offline`; everything else is
 * `unknown`, so server text can never reach the screen.
 */
export function mapServerMessage(message: unknown): CueCheckErrorCode {
  if (typeof message !== 'string') return 'unknown';
  const trimmed = message.trim();
  if (SERVER_CODE_SET.has(trimmed)) return trimmed as CueCheckServerCode;
  if (/failed to fetch|network request failed|networkerror|network error|load failed/i.test(trimmed)) {
    return 'offline';
  }
  return 'unknown';
}

/** Convert anything thrown at this boundary into safe failure state. */
export function toCueCheckFailure(error: unknown, source: CueCheckFailureSource): CueCheckFailure {
  const code = error instanceof CueCheckError ? error.code : 'unknown';
  const reading = source === 'list' || source === 'page' || source === 'detail';
  const message = (reading ? READ_COPY[code] : undefined) ?? CUE_CHECK_ERROR_COPY[code];
  return { code, message, retryable: RETRYABLE.has(code), source };
}
