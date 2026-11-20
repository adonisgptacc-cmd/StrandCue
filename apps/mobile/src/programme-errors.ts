/**
 * Stable, user-safe failure vocabulary for the treatment-programme client
 * boundary (Task I5.5).
 *
 * The I5.4 RPC boundary raises short stable codes (for example
 * `revision-conflict`). Only an exact match against this closed list is
 * trusted; anything else fails closed to neutral copy. Visible copy is plain
 * and non-technical: it never carries SQLSTATE values, function or table names,
 * rule identities, publication artifacts, digests, event or operation
 * identifiers, reviewer names, raw payloads or exception text, and never
 * suggests a product caused an outcome or that an owner is at fault.
 */

/** Codes the treatment-programme RPCs raise and this boundary recognises exactly. */
export const PROGRAMME_SERVER_CODES = [
  'authentication-required',
  // The database raises `account-not-active`; both spellings map to one code.
  'inactive-account',
  'programme-not-found',
  'revision-conflict',
  'operation-conflict',
  'quota-exceeded',
  'rule-content-pending',
  'rule-withdrawn',
  'rule-publication-mismatch',
  'product-mismatch',
  'application-missing',
  'application-ambiguous',
  'maintenance-not-proven',
  'pause-resumption-required',
  'resumption-rule-mismatch',
  'invalid-chronology',
  'already-completed',
  'already-abandoned',
  'duplicate-active',
  'invalid-programme',
  'invalid-command',
  'invalid-lifecycle',
  'invalid-page',
  'invalid-cursor',
  'snapshot-conflict',
  'count-not-proven',
  'statement-timeout',
  'serialization-failure',
  'deadlock',
  'programme-unavailable',
] as const;

/** States raised by this boundary rather than by a server code. */
export const PROGRAMME_CLIENT_CODES = [
  'offline',
  'malformed-response',
  'malformed-request',
  'unavailable',
  'unknown',
] as const;

export const PROGRAMME_ERROR_CODES = [...PROGRAMME_SERVER_CODES, ...PROGRAMME_CLIENT_CODES] as const;

export type ProgrammeServerCode = (typeof PROGRAMME_SERVER_CODES)[number];
export type ProgrammeErrorCode = (typeof PROGRAMME_ERROR_CODES)[number];

/** Where in the programme flow a failure happened. */
export type ProgrammeFailureSource =
  | 'list'
  | 'page'
  | 'detail'
  | 'enrol'
  | 'pause'
  | 'abandon'
  | 'complete';

/** Every code has explicit copy; the record type makes a missing one a compile error. */
export const PROGRAMME_ERROR_COPY: Readonly<Record<ProgrammeErrorCode, string>> = {
  'authentication-required': 'Please sign in again to continue.',
  'inactive-account': 'Your account is not active, so treatment programmes cannot be opened right now.',
  'programme-not-found': 'We could not find that treatment programme.',
  'revision-conflict': 'This programme changed on another session. Show the latest programme before trying again.',
  'operation-conflict': 'This programme changed while saving. Reload it and try again.',
  'quota-exceeded': 'You have reached the limit of treatment programmes you can keep.',
  'rule-content-pending': 'Treatment programme guidance is not available yet. It needs reviewed product instructions before StrandCue can use it.',
  'rule-withdrawn': 'The guidance this programme was reviewed under has been withdrawn, so it can no longer be used.',
  'rule-publication-mismatch': 'This programme no longer matches the reviewed guidance it started from.',
  'product-mismatch': 'This programme does not match the product it was started for.',
  'application-missing': 'A confirmed treatment application is needed before this can continue.',
  'application-ambiguous': 'More than one confirmed treatment application was recorded. Choose one to continue.',
  'maintenance-not-proven': 'Moving into the maintenance phase needs more recorded washes first.',
  'pause-resumption-required': 'This programme is paused. Resuming it needs an approved resumption, which your reviewed programme has not provided.',
  'resumption-rule-mismatch': 'The approved resumption for this programme does not match the reviewed guidance.',
  'invalid-chronology': 'Those dates could not be placed in order. Check them and try again.',
  'already-completed': 'This programme has already been completed.',
  'already-abandoned': 'This programme has already been stopped.',
  'duplicate-active': 'You already have this programme running. Open it to continue.',
  'invalid-programme': 'That request could not be sent. Please check it and try again.',
  'invalid-command': 'That request could not be sent. Please try again.',
  'invalid-lifecycle': 'This programme cannot take that step right now.',
  'invalid-page': 'That page of programmes could not be loaded. Reload the list.',
  'invalid-cursor': 'That page of programmes could not be loaded. Reload the list.',
  'snapshot-conflict': 'The completed record for this programme could not be confirmed. Reload it and try again.',
  'count-not-proven': 'There is not enough recorded information to answer yet.',
  'statement-timeout': 'That took too long. Please try again.',
  'serialization-failure': 'This programme changed at the same moment. Please try again.',
  'deadlock': 'This programme changed at the same moment. Please try again.',
  'programme-unavailable': 'Treatment programmes are not available right now. Please try again later.',
  offline: 'You appear to be offline. Your unsent change is still here.',
  'malformed-response': 'This programme could not be read safely.',
  'malformed-request': 'That request could not be sent. Please check it and try again.',
  unavailable: 'Treatment programmes are not available right now. Please try again later.',
  unknown: 'Something went wrong. Your unsent change is still here.',
};

/**
 * Reads hold nothing the owner typed, and a write that was committed but whose
 * response was lost may already be stored, so those sources restate the copy
 * plainly instead of promising an unsent draft is still present.
 */
const READ_COPY: Readonly<Partial<Record<ProgrammeErrorCode, string>>> = {
  offline: 'You appear to be offline. Check your connection and try again.',
  unknown: 'Something went wrong. Please try again.',
  'malformed-response': 'Your treatment programmes could not be shown safely. Please reload.',
  'programme-unavailable': 'Treatment programmes are not available right now. Please try again later.',
};

const WRITE_COPY: Readonly<Partial<Record<ProgrammeErrorCode, string>>> = {
  'malformed-response': 'We could not confirm this change was saved. Go back to your list and reload to see where it stands.',
  offline: 'You appear to be offline. This change may not have been saved yet. Your choice is still here.',
  unknown: 'Something went wrong. This change may not have been saved yet.',
  'revision-conflict': 'This programme changed on another session. Show the latest programme before trying again.',
};

/** Failures worth retrying as-is: the request itself may be fine. */
const RETRYABLE: ReadonlySet<ProgrammeErrorCode> = new Set<ProgrammeErrorCode>([
  'offline',
  'unknown',
  'statement-timeout',
  'serialization-failure',
  'deadlock',
]);

const SERVER_CODE_SET: ReadonlySet<string> = new Set<string>(PROGRAMME_SERVER_CODES);

/** Codes whose refusal means a reviewed rule or product cannot be trusted. */
export const PROGRAMME_CONTENT_CODES: ReadonlySet<ProgrammeErrorCode> = new Set<ProgrammeErrorCode>([
  'rule-content-pending',
  'rule-withdrawn',
  'rule-publication-mismatch',
  'product-mismatch',
]);

/**
 * A typed, user-safe error. Its message is always the mapped copy, so it is
 * safe to show; no cause, payload or server text is ever attached.
 */
export class ProgrammeError extends Error {
  readonly code: ProgrammeErrorCode;

  constructor(code: ProgrammeErrorCode) {
    super(PROGRAMME_ERROR_COPY[code]);
    this.name = 'ProgrammeError';
    this.code = code;
  }
}

/** What state holds about a failure: safe fields only. */
export interface ProgrammeFailure {
  readonly code: ProgrammeErrorCode;
  readonly message: string;
  readonly retryable: boolean;
  readonly source: ProgrammeFailureSource;
}

/** Type guard for callers that combine a successful read with a caught failure. */
export function isProgrammeFailure(value: unknown): value is ProgrammeFailure {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as Partial<ProgrammeFailure>;
  return typeof candidate.code === 'string'
    && typeof candidate.message === 'string'
    && typeof candidate.retryable === 'boolean'
    && typeof candidate.source === 'string';
}

/**
 * Map a database or transport error message to a code. Only an exact stable
 * code is trusted; transport-looking messages become `offline`; the timeout and
 * concurrency conditions are recognised so a retry can be offered; everything
 * else is `unknown`, so server text can never reach the screen.
 */
export function mapServerMessage(message: unknown): ProgrammeErrorCode {
  if (typeof message !== 'string') return 'unknown';
  const trimmed = message.trim();
  if (trimmed === 'account-not-active') return 'inactive-account';
  if (SERVER_CODE_SET.has(trimmed)) return trimmed as ProgrammeServerCode;
  if (/failed to fetch|network request failed|networkerror|network error|load failed/i.test(trimmed)) {
    return 'offline';
  }
  if (trimmed === 'inactive-account') return 'inactive-account';
  if (/statement timeout|canceling statement|canceled statement/i.test(trimmed)) return 'statement-timeout';
  if (/could not serialize|serialization failure|concurrent update/i.test(trimmed)) return 'serialization-failure';
  if (/deadlock detected/i.test(trimmed)) return 'deadlock';
  return 'unknown';
}

/** Convert anything thrown at this boundary into safe failure state. */
export function toProgrammeFailure(error: unknown, source: ProgrammeFailureSource): ProgrammeFailure {
  const code = error instanceof ProgrammeError ? error.code : 'unknown';
  const reading = source === 'list' || source === 'page' || source === 'detail';
  const table = reading ? READ_COPY : WRITE_COPY;
  const message = table[code] ?? PROGRAMME_ERROR_COPY[code];
  return { code, message, retryable: RETRYABLE.has(code), source };
}
