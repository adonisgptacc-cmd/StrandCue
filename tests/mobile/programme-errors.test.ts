import { describe, expect, it } from 'vitest';

import {
  PROGRAMME_CLIENT_CODES,
  PROGRAMME_ERROR_CODES,
  PROGRAMME_ERROR_COPY,
  PROGRAMME_SERVER_CODES,
  ProgrammeError,
  mapServerMessage,
  toProgrammeFailure,
  type ProgrammeErrorCode,
  type ProgrammeFailureSource,
} from '../../apps/mobile/src/programme-errors.ts';

// Every stable server code the I5.4 RPC boundary can raise, plus the codes this
// client boundary raises itself. Copy must exist for all of them, and nothing
// outside the closed list may reach the screen.

const EXPECTED_SERVER_CODES = [
  'authentication-required',
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

const EXPECTED_CLIENT_CODES = ['offline', 'malformed-response', 'malformed-request', 'unavailable', 'unknown'] as const;

/** The exact list the task requires stable copy for; none may be missing. */
const REQUIRED_STABLE_CODES = [
  'programme-not-found',
  'inactive-account',
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
  'snapshot-conflict',
  'malformed-request',
  'statement-timeout',
  'unavailable',
  'offline',
  'unknown',
] as const;

describe('the stable programme error vocabulary', () => {
  it('covers exactly the server codes and the client codes', () => {
    expect([...PROGRAMME_SERVER_CODES].sort()).toEqual([...EXPECTED_SERVER_CODES].sort());
    expect([...PROGRAMME_CLIENT_CODES].sort()).toEqual([...EXPECTED_CLIENT_CODES].sort());
    expect([...PROGRAMME_ERROR_CODES].sort()).toEqual(
      [...EXPECTED_SERVER_CODES, ...EXPECTED_CLIENT_CODES].sort(),
    );
  });

  it('gives every code plain, non-empty copy', () => {
    for (const code of REQUIRED_STABLE_CODES) {
      expect(PROGRAMME_ERROR_CODES, code).toContain(code);
      expect(PROGRAMME_ERROR_COPY[code as ProgrammeErrorCode], code).toBeTruthy();
      expect(PROGRAMME_ERROR_COPY[code as ProgrammeErrorCode].length, code).toBeGreaterThan(3);
    }
    // The record type is exhaustive: a code with no copy is a compile error, and
    // the runtime check above keeps it honest.
    expect(Object.keys(PROGRAMME_ERROR_COPY).sort()).toEqual([...PROGRAMME_ERROR_CODES].sort());
  });

  it('maps an unknown code to the neutral fallback and never leaks server text', () => {
    for (const message of [
      undefined,
      null,
      42,
      'something nobody has seen before',
      'SELECT * FROM strandcue_private.treatment_programmes',
      'permission denied for table treatment_programmes',
      'c0000000-0000-4000-8000-000000000002',
      'sha256:' + 'a'.repeat(64),
      'http://localhost:54321/rest/v1/rpc/enrol_programme',
    ]) {
      expect(mapServerMessage(message), String(message)).toBe('unknown');
    }
  });

  it('recognises only exact stable server codes, never a substring', () => {
    expect(mapServerMessage('revision-conflict')).toBe('revision-conflict');
    // A message that merely contains a code, or decorates it, is not that code.
    expect(mapServerMessage('revised: revision-conflict')).toBe('unknown');
    expect(mapServerMessage(' x revision-conflict x ')).toBe('unknown');
    expect(mapServerMessage('REVISION-CONFLICT')).toBe('unknown');
    expect(mapServerMessage('programme-unavailable')).toBe('programme-unavailable');
  });

  it('accepts the account code the database actually raises', () => {
    expect(mapServerMessage('account-not-active')).toBe('inactive-account');
    expect(mapServerMessage('inactive-account')).toBe('inactive-account');
  });

  it('treats transport failures as offline rather than a server code', () => {
    for (const message of [
      'Failed to fetch',
      'Network request failed',
      'NetworkError when attempting to fetch resource.',
      'Load failed',
    ]) {
      expect(mapServerMessage(message), message).toBe('offline');
    }
  });

  it('recognises the timeout and concurrency conditions a retry can survive', () => {
    expect(mapServerMessage('canceling statement due to statement timeout')).toBe('statement-timeout');
    expect(mapServerMessage('could not serialize access due to concurrent update')).toBe('serialization-failure');
    expect(mapServerMessage('deadlock detected')).toBe('deadlock');
  });

  it('keeps raw server text out of the failure a screen can render', () => {
    const failure = toProgrammeFailure(new Error('DETAIL: relation "treatment_programmes" does not exist'), 'detail');
    expect(failure.code).toBe('unknown');
    // A read source restates the copy plainly and carries no server text at all.
    expect(failure.message).toBe('Something went wrong. Please try again.');
    expect(failure.message).not.toMatch(/DETAIL|relation|treatment_programmes|unsent/i);
  });

  it('marks only transport failures as retryable', () => {
    const retryable = (code: ProgrammeErrorCode, source: ProgrammeFailureSource) =>
      toProgrammeFailure(new ProgrammeError(code), source).retryable;
    expect(retryable('offline', 'list')).toBe(true);
    expect(retryable('unknown', 'detail')).toBe(true);
    expect(retryable('statement-timeout', 'pause')).toBe(true);
    expect(retryable('revision-conflict', 'pause')).toBe(false);
    expect(retryable('rule-content-pending', 'enrol')).toBe(false);
    expect(retryable('malformed-response', 'list')).toBe(false);
  });

  it('carries a typed error whose message is always safe copy', () => {
    const error = new ProgrammeError('rule-content-pending');
    expect(error.code).toBe('rule-content-pending');
    expect(error.message).toBe(PROGRAMME_ERROR_COPY['rule-content-pending']);
    const failure = toProgrammeFailure(error, 'enrol');
    expect(failure).toEqual({
      code: 'rule-content-pending',
      message: PROGRAMME_ERROR_COPY['rule-content-pending'],
      retryable: false,
      source: 'enrol',
    });
  });

  it('never exposes SQL, identifiers, rule ids, digests, reviewers or payloads in any copy', () => {
    for (const code of PROGRAMME_ERROR_CODES) {
      const copy = PROGRAMME_ERROR_COPY[code];
      // A SQL statement shape, or any internal object name.
      expect(copy, code).not.toMatch(/\bselect\s+\w+\s+from\b|\binsert\s+into\b|\bupdate\s+\w+\s+set\b|\bdelete\s+from\b/i);
      expect(copy, code).not.toMatch(/treatment_programme|strandcue_private|programme_|public\.[a-z_]+/i);
      expect(copy, code).not.toMatch(/jsonb|timestamptz|sqlstate|constraint|permission denied|errcode/i);
      expect(copy, code).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i);
      expect(copy, code).not.toMatch(/sha256/i);
      expect(copy, code).not.toMatch(/https?:\/\//);
      expect(copy, code).not.toMatch(/rule[-_ ]?id|artifact|digest|event[-_ ]?id|operation[-_ ]?id/i);
      expect(copy, code).not.toMatch(/reviewer|evidence|receipt/i);
    }
  });

  it('has no trailing whitespace and reads as one sentence of plain wording', () => {
    for (const code of PROGRAMME_ERROR_CODES) {
      const copy = PROGRAMME_ERROR_COPY[code];
      expect(copy, code).toBe(copy.trim());
      expect(copy, code).not.toMatch(/\s{2}/);
      expect(copy, code).toMatch(/[.!?]$/);
    }
  });
});
