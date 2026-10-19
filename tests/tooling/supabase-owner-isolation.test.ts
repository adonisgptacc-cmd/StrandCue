import { describe, expect, it, vi } from 'vitest';
import config from '../../vitest.config';
import {
  DEFAULT_OWNER_ISOLATION_TABLES,
  evaluateOwnerIsolationResponse,
  formatOwnerIsolationReport,
  runOwnerIsolationCli,
  runOwnerIsolationHarness,
} from '../../scripts/supabase-owner-isolation';

const profileSpec = DEFAULT_OWNER_ISOLATION_TABLES[0];
const deferredSpec = DEFAULT_OWNER_ISOLATION_TABLES[1];

describe('Supabase two-owner isolation harness', () => {
  it('is included in the per-file security coverage gate', () => {
    const path = 'scripts/supabase-owner-isolation.ts';
    const coverage = config.test?.coverage;
    expect(coverage?.include).toContain(path);
    const thresholds = coverage?.thresholds as Record<string, unknown>;
    expect(thresholds[path]).toMatchObject({ statements: 80, branches: 80, functions: 80, lines: 80, perFile: true });
  });

  it('passes only when the authenticated owner sees the exact profile and no foreign row', () => {
    const result = evaluateOwnerIsolationResponse({
      spec: profileSpec,
      ownerId: '11111111-1111-4111-8111-111111111111',
      ownBody: '[{"user_id":"11111111-1111-4111-8111-111111111111"}]',
      foreignBody: '[]',
    });
    expect(result).toEqual({ table: 'profiles', status: 'PASS', code: 'ISOLATED', ownRows: 1 });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([
    ['', 'MALFORMED_RESPONSE'],
    ['null', 'MALFORMED_RESPONSE'],
    ['{}', 'MALFORMED_RESPONSE'],
    ['{"user_id":"11111111-1111-4111-8111-111111111111"}', 'MALFORMED_RESPONSE'],
    ['[null]', 'MALFORMED_RESPONSE'],
    ['[{"other":"value"}]', 'OWNER_FIELD_MISSING'],
    ['[{"user_id":"22222222-2222-4222-8222-222222222222"}]', 'OWNER_MISMATCH'],
    ['[{"user_id":"11111111-1111-4111-8111-111111111111"},{"user_id":"11111111-1111-4111-8111-111111111111"}]', 'AMBIGUOUS_PROFILE'],
  ])('fails closed for an invalid own response %j', (ownBody, code) => {
    expect(evaluateOwnerIsolationResponse({
      spec: profileSpec,
      ownerId: '11111111-1111-4111-8111-111111111111',
      ownBody,
      foreignBody: '[]',
    })).toMatchObject({ status: 'HOLD', code });
  });

  it.each(['', 'null', '{}', '[null]'])('fails closed for malformed foreign response %j', foreignBody => {
    expect(evaluateOwnerIsolationResponse({
      spec: profileSpec,
      ownerId: '11111111-1111-4111-8111-111111111111',
      ownBody: '[{"user_id":"11111111-1111-4111-8111-111111111111"}]',
      foreignBody,
    })).toMatchObject({ status: 'HOLD', code: 'MALFORMED_RESPONSE' });
  });

  it('holds when any foreign row is visible', () => {
    expect(evaluateOwnerIsolationResponse({
      spec: profileSpec,
      ownerId: '11111111-1111-4111-8111-111111111111',
      ownBody: '[{"user_id":"11111111-1111-4111-8111-111111111111"}]',
      foreignBody: '[{"user_id":"22222222-2222-4222-8222-222222222222"}]',
    })).toEqual({ table: 'profiles', status: 'HOLD', code: 'FOREIGN_ROW_VISIBLE', ownRows: 1 });
  });

  it('blocks fixture-dependent tables without claiming their isolation passed', () => {
    expect(evaluateOwnerIsolationResponse({
      spec: deferredSpec,
      ownerId: '11111111-1111-4111-8111-111111111111',
      ownBody: '[]',
      foreignBody: '[]',
    })).toEqual({ table: 'user_products', status: 'BLOCKED', code: 'OWN_FIXTURE_MISSING', ownRows: 0 });
  });

  it('authenticates both owners and checks every table in both directions', async () => {
    const ownerA = '11111111-1111-4111-8111-111111111111';
    const ownerB = '22222222-2222-4222-8222-222222222222';
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/auth/v1/token')) {
        const email = JSON.parse(String(init?.body)).email as string;
        return new Response(JSON.stringify({ access_token: email === 'a@example.invalid' ? 'token-a' : 'token-b', user: { id: email === 'a@example.invalid' ? ownerA : ownerB } }), { status: 200 });
      }
      const token = String((init?.headers as Record<string, string>).Authorization);
      const caller = token.endsWith('token-a') ? ownerA : ownerB;
      const query = new URL(url).searchParams;
      const requested = query.get(DEFAULT_OWNER_ISOLATION_TABLES.find(spec => url.includes(`/rest/v1/${spec.table}`))?.ownerColumn ?? '');
      const requestedOwner = requested?.replace('eq.', '');
      const table = DEFAULT_OWNER_ISOLATION_TABLES.find(spec => url.includes(`/rest/v1/${spec.table}`))!;
      const body = table.table === 'profiles' && requestedOwner === caller
        ? JSON.stringify([{ [table.ownerColumn]: caller }])
        : '[]';
      return new Response(body, { status: 200 });
    });

    const report = await runOwnerIsolationHarness({
      url: 'https://example.supabase.co', publishableKey: 'publishable-test-key',
      ownerA: { email: 'a@example.invalid', password: 'secret-a' },
      ownerB: { email: 'b@example.invalid', password: 'secret-b' },
    }, fetcher);

    expect(report.status).toBe('BLOCKED');
    expect(report.results.filter(result => result.table === 'profiles')).toHaveLength(2);
    expect(report.results.filter(result => result.status === 'PASS')).toHaveLength(2);
    expect(report.results.filter(result => result.status === 'BLOCKED')).toHaveLength(8);
    expect(fetcher).toHaveBeenCalledTimes(22);
    expect(formatOwnerIsolationReport(report)).toBe('OWNER-ISOLATION-BLOCKED pass=2 blocked=8 hold=0');
  });

  it('holds on authentication, HTTP, identity and response failures without exposing secrets', async () => {
    const sentinel = 'TEST_SECRET_SENTINEL_DO_NOT_PRINT';
    const base = {
      url: 'https://example.supabase.co', publishableKey: sentinel,
      ownerA: { email: 'a@example.invalid', password: sentinel },
      ownerB: { email: 'b@example.invalid', password: sentinel },
    } as const;
    for (const fetcher of [
      vi.fn(async () => new Response(sentinel, { status: 500 })),
      vi.fn(async () => new Response(JSON.stringify({ access_token: sentinel, user: { id: 'not-a-uuid' } }), { status: 200 })),
    ]) {
      const report = await runOwnerIsolationHarness(base, fetcher);
      const output = formatOwnerIsolationReport(report);
      expect(report.status).toBe('HOLD');
      expect(output).toMatch(/^OWNER-ISOLATION-HOLD /);
      expect(output).not.toContain(sentinel);
    }
  });

  it.each([
    [{ url: 'http://example.supabase.co' }, 'CONFIG_INVALID'],
    [{ publishableKey: '' }, 'CONFIG_INVALID'],
    [{ ownerA: { email: '', password: '' } }, 'CONFIG_INVALID'],
  ])('rejects invalid configuration without making a request', async (change, code) => {
    const fetcher = vi.fn();
    const report = await runOwnerIsolationHarness({
      url: 'https://example.supabase.co', publishableKey: 'test-key',
      ownerA: { email: 'a@example.invalid', password: 'a' },
      ownerB: { email: 'b@example.invalid', password: 'b' },
      ...change,
    }, fetcher);
    expect(report).toMatchObject({ status: 'HOLD', code });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each([
    ['not-json'],
    ['null'],
    ['{}'],
    [JSON.stringify({ access_token: '', user: { id: '11111111-1111-4111-8111-111111111111' } })],
    [JSON.stringify({ access_token: 'token', user: {} })],
  ])('holds when authentication returns an incomplete payload', async authBody => {
    const fetcher = vi.fn(async () => new Response(authBody, { status: 200 }));
    const report = await runOwnerIsolationHarness({
      url: 'https://example.supabase.co', publishableKey: 'test-key',
      ownerA: { email: 'a@example.invalid', password: 'a' },
      ownerB: { email: 'b@example.invalid', password: 'b' },
    }, fetcher);
    expect(report.status).toBe('HOLD');
    expect(['AUTH_FAILED', 'IDENTITY_INVALID']).toContain(report.code);
  });

  it('holds when both credentials resolve to the same owner', async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      access_token: 'token', user: { id: '11111111-1111-4111-8111-111111111111' },
    }), { status: 200 }));
    const report = await runOwnerIsolationHarness({
      url: 'https://example.supabase.co', publishableKey: 'test-key',
      ownerA: { email: 'a@example.invalid', password: 'a' },
      ownerB: { email: 'b@example.invalid', password: 'b' },
    }, fetcher);
    expect(report).toMatchObject({ status: 'HOLD', code: 'IDENTITY_INVALID' });
  });

  it('holds when a PostgREST request fails', async () => {
    let authCount = 0;
    const fetcher = vi.fn(async (url: string) => {
      if (url.includes('/auth/v1/token')) {
        authCount += 1;
        return new Response(JSON.stringify({
          access_token: `token-${authCount}`,
          user: { id: authCount === 1 ? '11111111-1111-4111-8111-111111111111' : '22222222-2222-4222-8222-222222222222' },
        }), { status: 200 });
      }
      return new Response('unavailable', { status: 503 });
    });
    const report = await runOwnerIsolationHarness({
      url: 'https://example.supabase.co/', publishableKey: 'test-key',
      ownerA: { email: 'a@example.invalid', password: 'a' },
      ownerB: { email: 'b@example.invalid', password: 'b' },
    }, fetcher);
    expect(report).toMatchObject({ status: 'HOLD', code: 'HTTP_FAILED' });
  });

  it('reports PASS when every table has an owned fixture and hides all foreign rows', async () => {
    let authCount = 0;
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.includes('/auth/v1/token')) {
        authCount += 1;
        return new Response(JSON.stringify({
          access_token: `token-${authCount}`,
          user: { id: authCount === 1 ? '11111111-1111-4111-8111-111111111111' : '22222222-2222-4222-8222-222222222222' },
        }), { status: 200 });
      }
      const spec = DEFAULT_OWNER_ISOLATION_TABLES.find(item => url.includes(`/rest/v1/${item.table}`))!;
      const caller = String((init?.headers as Record<string, string>).Authorization).endsWith('token-1')
        ? '11111111-1111-4111-8111-111111111111' : '22222222-2222-4222-8222-222222222222';
      const requested = new URL(url).searchParams.get(spec.ownerColumn);
      return new Response(requested === `eq.${caller}` ? JSON.stringify([{ [spec.ownerColumn]: caller }]) : '[]');
    });
    const report = await runOwnerIsolationHarness({
      url: 'https://example.supabase.co', publishableKey: 'test-key',
      ownerA: { email: 'a@example.invalid', password: 'a' },
      ownerB: { email: 'b@example.invalid', password: 'b' },
    }, fetcher);
    expect(report.status).toBe('PASS');
    expect(formatOwnerIsolationReport(report)).toBe('OWNER-ISOLATION-PASS pass=10 blocked=0 hold=0');
  });

  it('CLI prints only a stable safe summary and exits nonzero for missing configuration', async () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      expect(await runOwnerIsolationCli({}, vi.fn())).toBe(1);
      expect(write).toHaveBeenLastCalledWith('OWNER-ISOLATION-HOLD code=CONFIG_INVALID\n');
    } finally {
      write.mockRestore();
    }
  });
});
