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

  it('sends nothing without a configured transport', () => {
    const reporter = createCrashReporter();
    expect(() => reporter.report(new Error('boom'), { operation: 'save' })).not.toThrow();
  });

  it('scrubs the envelope before transport and never throws on transport failure', () => {
    const sent: unknown[] = [];
    const failing = createCrashReporter({
      transport: () => { throw new Error('network down'); },
    });
    expect(() => failing.report(new Error('boom for user@example.test'), { userId: '550e8400-e29b-41d4-a716-446655440000' })).not.toThrow();

    const reporter = createCrashReporter({ transport: event => { sent.push(event); } });
    reporter.report(new Error('boom for user@example.test'), { operation: 'save', notes: 'private' });
    expect(sent).toHaveLength(1);
    const payload = JSON.stringify(sent[0]);
    expect(payload).not.toContain('user@example.test');
    expect(payload).not.toContain('private');
    expect(payload).toContain('[redacted-email]');
  });
});
