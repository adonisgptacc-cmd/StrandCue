import { describe, expect, it } from 'vitest';

import { createCrashReporter, scrubValue } from '../../apps/mobile/src/crash-report';

// Fix B RED: complete crash-report privacy redaction.
// - Every complete URL -> fixed `[redacted-url]`, preserving NOTHING.
// - Unknown nested strings are private by default (allowlist-gated).
// - DB-payload / user-entered keys redact regardless of shape.
describe('crash report complete redaction (Fix B)', () => {
  it('redacts an HTTPS recovery URL whole, preserving nothing', () => {
    expect(scrubValue('https://recovery.example.test/reset/abc123?code=xyz#frag')).toBe('[redacted-url]');
  });

  it('redacts a strandcue:// callback URL whole', () => {
    expect(scrubValue('strandcue://auth/callback?code=abc123')).toBe('[redacted-url]');
  });

  it('redacts a strandcue: callback without slashes whole', () => {
    expect(scrubValue('strandcue:auth/callback?code=abc123')).toBe('[redacted-url]');
  });

  it('redacts a URL with short sensitive path segments whole (no host preserved)', () => {
    const text = String(scrubValue('https://secret-host.example.test/r/a?code=s'));
    expect(text).toBe('[redacted-url]');
    expect(text).not.toContain('secret-host');
  });

  it('redacts a schemeless host-with-path URL', () => {
    const text = String(scrubValue('open api.example.test/reset?code=abc123 now'));
    expect(text).toContain('[redacted-url]');
    expect(text).not.toContain('api.example.test');
    expect(text).not.toContain('abc123');
  });

  it('redacts a URL embedded in longer top-level text', () => {
    const text = String(
      scrubValue('fetch failed for https://secret-host.example.test/s/ab?code=abc123, retrying soon'),
    );
    expect(text).toContain('[redacted-url]');
    expect(text).not.toContain('secret-host');
    expect(text).not.toContain('abc123');
  });

  it('does not mistake clearly-non-URL prose for URLs', () => {
    for (const prose of ['upgraded to v2.3.1 today', 'running an a/b testing trial', 'opened report.pdf twice']) {
      expect(String(scrubValue(prose))).not.toContain('[redacted-url]');
    }
  });

  it('leaves a bare domain without a path alone (documented under-match)', () => {
    expect(String(scrubValue('see example.com docs'))).not.toContain('[redacted-url]');
  });

  it('redacts facts/decision/execution objects regardless of shape', () => {
    const scrubbed = scrubValue({
      facts: { porosity: 'high', note: 'ok' },
      decision: { id: 'pick-a', contact: 'user@example.test' },
      execution: [{ deviation: 'failed badly' }],
      replacement: { content: 'innocent-looking text here' },
    }) as Record<string, unknown>;
    const payload = JSON.stringify(scrubbed);
    expect(payload).not.toContain('user@example.test');
    expect(payload).not.toContain('pick-a');
    expect(payload).not.toContain('failed badly');
    expect(payload).not.toContain('innocent-looking text here');
    expect(scrubbed.facts).toBe('[redacted]');
    expect(scrubbed.decision).toBe('[redacted]');
    expect(scrubbed.execution).toBe('[redacted]');
    expect(scrubbed.replacement).toBe('[redacted]');
  });

  it('redacts concern and hair free text', () => {
    expect(scrubValue({ concern: 'my shedding is getting worse' })).toMatchObject({ concern: '[redacted]' });
    expect(scrubValue({ notes: 'EVERYTHING fine here' })).toMatchObject({ notes: '[redacted]' });
    expect(scrubValue({ hair: 'my hair journey notes' }) as Record<string, unknown>).toMatchObject({
      hair: '[redacted]',
    });
  });

  it('redacts arbitrary nested unknown strings that are free-text-shaped', () => {
    const scrubbed = scrubValue({ level1: { mystery: 'some unexpected value here' } }) as Record<string, unknown>;
    expect(JSON.stringify(scrubbed)).not.toContain('some unexpected value here');
    expect((scrubbed.level1 as Record<string, unknown>).mystery).toBe('[redacted]');
  });

  it('preserves allowlisted diagnostic fields and bounded scalars', () => {
    const scrubbed = scrubValue({
      code: 'E_TIMEOUT',
      kind: 'passport-save',
      component: 'PassportScreen',
      operation: 'passport-save',
      revision: 3,
      status: 'ok',
      flag: true,
      nothing: null,
    }) as Record<string, unknown>;
    expect(scrubbed).toMatchObject({
      code: 'E_TIMEOUT',
      kind: 'passport-save',
      component: 'PassportScreen',
      operation: 'passport-save',
      revision: 3,
      status: 'ok',
      flag: true,
      nothing: null,
    });
  });

  it('redacts free text even under allowlisted keys, and out-of-bounds numbers', () => {
    const scrubbed = scrubValue({
      code: 'something broke badly here',
      operation: 'did a thing yesterday morning',
      revision: 1700000000000,
    }) as Record<string, unknown>;
    expect(scrubbed.code).toBe('[redacted]');
    expect(scrubbed.operation).toBe('[redacted]');
    expect(scrubbed.revision).toBe('[redacted]');
  });

  it('keeps redacting emails, UUIDs, cookies, Basic/Bearer and token keys', () => {
    expect(String(scrubValue('user@example.test'))).toBe('[redacted-email]');
    expect(String(scrubValue('550e8400-e29b-41d4-a716-446655440000'))).toBe('[redacted-id]');
    const nested = scrubValue({
      accessToken: 'secret-access-value',
      apiKey: 'secret-api-value',
      cookie: 'session=abc123',
    }) as Record<string, unknown>;
    expect(nested.accessToken).toBe('[redacted]');
    expect(nested.apiKey).toBe('[redacted]');
    expect(nested.cookie).toBe('[redacted]');
    expect(String(scrubValue('auth Basic dXNlcjpwYXNzd29yZA== end'))).not.toContain('dXNlcjpwYXNzd29yZA==');
    expect(String(scrubValue('auth Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig end'))).not.toContain(
      'eyJhbGciOiJIUzI1NiJ9',
    );
  });

  it('keeps depth, circular, no-op transport and fail-safe behavior', () => {
    let deep: Record<string, unknown> = { leaf: 'ok' };
    for (let level = 0; level < 20; level += 1) deep = { nested: deep };
    expect(() => scrubValue(deep)).not.toThrow();
    const circular: Record<string, unknown> = { name: 'loop' };
    circular.self = circular;
    expect(JSON.stringify(scrubValue(circular))).toContain('[redacted-circular]');
    const reporter = createCrashReporter();
    expect(() => reporter.report(new Error('boom'), { operation: 'save' })).not.toThrow();
  });
});
