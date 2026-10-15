import { describe, expect, it } from 'vitest';

import { scrubValue } from '../../apps/mobile/src/crash-report';

describe('crash scrubber redaction classes (Task 12)', () => {
  it('redacts normalized token key forms regardless of casing or separators', () => {
    const scrubbed = scrubValue({
      accessToken: 'secret-access-value',
      refresh_token: 'secret-refresh-value',
      apiKey: 'secret-api-value',
      'X-API-Key': 'secret-header-value',
      operation: 'passport-save',
    }) as Record<string, unknown>;
    expect(scrubbed.operation).toBe('passport-save');
    const payload = JSON.stringify(scrubbed);
    for (const secret of ['secret-access-value', 'secret-refresh-value', 'secret-api-value', 'secret-header-value']) {
      expect(payload).not.toContain(secret);
    }
    expect(payload).toContain('[redacted]');
  });

  it('redacts every cookie pair to end of line, in any order', () => {
    for (const header of [
      'Cookie: theme=dark; session=PAIR_SECRET_ONE',
      'Cookie: session=PAIR_SECRET_ONE; theme=dark',
      'Set-Cookie: session=PAIR_SECRET_ONE; Path=/; HttpOnly',
      'Set-Cookie: theme=dark; session=PAIR_SECRET_ONE; Secure',
    ]) {
      const text = String(scrubValue(`request failed with ${header} done`));
      expect(text).not.toContain('PAIR_SECRET_ONE');
    }
  });

  it('redacts compound secret key forms without substring false positives', () => {
    const scrubbed = scrubValue({
      client_secret: 'compound-one',
      CLIENTSECRET: 'compound-two',
      private_key: 'compound-three',
      PrivateKey: 'compound-four',
      secretariat: 'not-a-secret-keep-me',
      operation: 'passport-save',
    }) as Record<string, unknown>;
    const payload = JSON.stringify(scrubbed);
    for (const secret of ['compound-one', 'compound-two', 'compound-three', 'compound-four']) {
      expect(payload).not.toContain(secret);
    }
    expect(scrubbed.secretariat).toBe('not-a-secret-keep-me');
    expect(scrubbed.operation).toBe('passport-save');
  });

  it('redacts basic authorization credentials in free text', () => {
    for (const header of [
      'Authorization: Basic dXNlcjpwYXNzd29yZA==',
      'authorization: basic dXNlcjpwYXNzd29yZA==',
    ]) {
      const text = String(scrubValue(`request failed with ${header} done`));
      expect(text).not.toContain('dXNlcjpwYXNzd29yZA==');
    }
  });

  it('redacts cookie headers and bearer tokens in free text', () => {
    expect(String(scrubValue({ cookie: 'session=abc123; theme=dark' }))).not.toContain('abc123');
    const text = String(
      scrubValue('request failed with Cookie: session=abc123 and Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.sig'),
    );
    expect(text).not.toContain('abc123');
    expect(text).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  it('redacts full URLs including tokens in path, query and fragment', () => {
    const text = String(
      scrubValue(
        'fetch failed for https://api.example.test/users/550e8400-e29b-41d4-a716-446655440000/files/eyJhbGciOiJIUzI1NiJ9cGF5bG9hZHNpZ25hdHVyZQ?code=abc123&next=/home#access_token=zzz user@example.test',
      ),
    );
    for (const secret of ['abc123', 'eyJhbGciOiJIUzI1NiJ9cGF5bG9hZHNpZ25hdHVyZQ', '550e8400-e29b-41d4-a716-446655440000', 'user@example.test', 'access_token=zzz']) {
      expect(text).not.toContain(secret);
    }
  });

  it('still catches a token past the truncation limit', () => {
    const token = 'tok_secret_value_that_must_never_leave_the_device_12345';
    const text = String(scrubValue(`${'a'.repeat(250)}?code=${token} tail`));
    expect(text).not.toContain(token);
    expect(text).toHaveLength(200);
  });

  it('scrubs secrets everywhere inside database-payload-shaped objects', () => {
    const scrubbed = scrubValue({
      decision: { id: '550e8400-e29b-41d4-a716-446655440000', contact: 'user@example.test' },
      execution: [{ deviation: 'failed with ?code=topsecret' }],
      replacement: { content: { refresh_token: 'deep-refresh-secret' } },
    });
    const payload = JSON.stringify(scrubbed);
    for (const secret of ['550e8400-e29b-41d4-a716-446655440000', 'user@example.test', 'topsecret', 'deep-refresh-secret']) {
      expect(payload).not.toContain(secret);
    }
  });

  it('bounds deep, wide and circular payloads without throwing', () => {
    let deep: Record<string, unknown> = { leaf: 'ok' };
    for (let level = 0; level < 20; level += 1) deep = { nested: deep };
    expect(() => scrubValue(deep)).not.toThrow();
    expect(JSON.stringify(scrubValue(deep))).not.toContain('"leaf":"ok"');

    const circular: Record<string, unknown> = { name: 'loop' };
    circular.self = circular;
    expect(() => scrubValue(circular)).not.toThrow();
    expect(JSON.stringify(scrubValue(circular))).toContain('[redacted-circular]');

    const wide = { items: Array.from({ length: 200 }, (_, index) => `item-${index}`) };
    expect(() => scrubValue(wide)).not.toThrow();
  });
});
