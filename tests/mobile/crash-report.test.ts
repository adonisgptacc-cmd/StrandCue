import { describe, expect, it } from 'vitest';

import { createCrashReporter, scrubValue } from '../../apps/mobile/src/crash-report';

describe('scrubbed crash-report envelope', () => {
  it('redacts emails, identifiers, secrets and long free text', () => {
    expect(scrubValue('sign-in failed for user@example.test')).toBe('sign-in failed for [redacted-email]');
    expect(scrubValue('row 550e8400-e29b-41d4-a716-446655440000 missing')).toBe('row [redacted-id] missing');
    expect(scrubValue('callback strandcue://auth/callback?code=abc123 failed')).not.toContain('abc123');
    expect(scrubValue('short failure')).toBe('short failure');
    expect(scrubValue('a'.repeat(500))).toHaveLength(200);
  });

  it('drops sensitive context keys regardless of value', () => {
    const scrubbed = scrubValue({
      username: 'user_a',
      email: 'user@example.test',
      notes: 'my shedding notes',
      password: 'hunter2',
      token: 'abc',
      operation: 'passport-save',
      revision: 3,
    }) as Record<string, unknown>;
    expect(scrubbed).toMatchObject({ operation: 'passport-save', revision: 3 });
    for (const key of ['username', 'email', 'notes', 'password', 'token']) {
      expect(String(scrubbed[key])).not.toContain('user_a');
      expect(String(scrubbed[key])).not.toContain('hunter2');
    }
  });

  it('accepts no transport: nothing can leave the device (Fix D)', () => {
    const sent: unknown[] = [];
    const reporter = (
      createCrashReporter as unknown as (opts: { transport: (envelope: unknown) => void }) => {
        report: (error: unknown, context?: unknown) => void;
      }
    )({
      transport: event => {
        sent.push(event);
      },
    });
    reporter.report(new Error('boom'), { operation: 'save' });
    expect(sent).toHaveLength(0);
  });

  it('sends nothing without a configured transport', () => {
    const reporter = createCrashReporter();
    expect(() => reporter.report(new Error('boom'), { operation: 'save' })).not.toThrow();
  });

  it('scrubs the error and context a report would carry, and never throws', () => {
    // No-transport observation seam (Fix D): the reporter exposes no envelope
    // and no transport hook, so tests assert on scrubValue — the exact
    // scrubbing report() applies — instead of intercepting a sent envelope.
    const error = new Error('boom for user@example.test');
    const context = { operation: 'save', notes: 'private' };
    const scrubbedError = scrubValue(error) as Record<string, unknown>;
    const scrubbedContext = scrubValue(context) as Record<string, unknown>;
    const payload = JSON.stringify({ error: scrubbedError, context: scrubbedContext });
    expect(payload).not.toContain('user@example.test');
    expect(payload).not.toContain('private');
    expect(payload).toContain('[redacted-email]');
    expect(scrubbedContext.operation).toBe('save');

    const reporter = createCrashReporter();
    expect(() => reporter.report(error, context)).not.toThrow();
    expect(reporter.report(error, context)).toBeUndefined();
  });
});
