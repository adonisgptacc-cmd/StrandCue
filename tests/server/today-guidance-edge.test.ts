import { describe, expect, it, vi } from 'vitest';

import { handleTodayGuidanceRequest, type TodayEdgeDependencies } from '../../supabase/functions/today-guidance/handler.ts';
import type { TodayGuidanceRequest } from '../../apps/mobile/src/guidance/today-guidance-core.ts';

const edgeMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  ownerRpc: vi.fn(),
  adminRpc: vi.fn(),
  serve: vi.fn(),
}));

vi.mock('@supabase/supabase-js', () => ({ createClient: edgeMocks.createClient }));

const USER = '11111111-1111-4111-8111-111111111111';
const REQUEST = '22222222-2222-4222-8222-222222222222';
const AS_OF = '2026-10-29T08:00:00.000Z';

function readyResult() {
  return {
    status: 'ready' as const,
    requestId: REQUEST,
    asOf: AS_OF,
    engineVersion: '1',
    bundleId: 'synthetic',
    bundleVersion: '2',
    inputFingerprint: 'a'.repeat(64),
    input: { requestId: REQUEST, asOf: AS_OF, goal: 'basic_wash' },
    decision: { status: 'ready', requestId: REQUEST, steps: [{ stepId: 'step-1', position: 1, action: 'wait' }] },
    prepared: { privateFact: 'never returned' },
  };
}

function request(body: Record<string, unknown>, authorization = 'Bearer user-token'): Request {
  return new Request('https://local.invalid/today-guidance', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization },
    body: JSON.stringify(body),
  });
}

function harness(overrides: Partial<TodayEdgeDependencies> = {}) {
  const authenticate = vi.fn(async () => ({ id: USER }));
  const readRevision = vi.fn(async () => 3);
  const reserveRequest = vi.fn(async () => undefined);
  const generate = vi.fn(async (_request: TodayGuidanceRequest, _token: string) => readyResult());
  const persistReady = vi.fn(async () => ({
    id: '33333333-3333-4333-8333-333333333333',
    requestId: REQUEST,
    inputFingerprint: 'a'.repeat(64),
    status: 'ready',
  }));
  const deps: TodayEdgeDependencies = {
    authenticate,
    reserveRequest,
    readRevision,
    generate,
    persistReady,
    now: () => new Date(AS_OF),
    ...overrides,
  };
  return { deps, authenticate, reserveRequest, readRevision, generate, persistReady };
}

describe('server Today guidance boundary', () => {
  it('derives the owner from verified authentication and ignores no caller identity', async () => {
    const h = harness();
    const response = await handleTodayGuidanceRequest(request({ requestId: REQUEST, goalId: 'basic_wash' }), h.deps);
    expect(response.status).toBe(200);
    expect(h.authenticate).toHaveBeenCalledWith('user-token');
    expect(h.reserveRequest).toHaveBeenCalledWith('user-token');
    expect(h.generate).toHaveBeenCalledWith(expect.objectContaining({ ownerId: USER, requestId: REQUEST }), 'user-token');
    expect(h.persistReady).toHaveBeenCalledWith(USER, expect.objectContaining({ status: 'ready' }), 3);
    expect(JSON.stringify(await response.json())).not.toContain('privateFact');
  });

  it('rejects forged owner and decision fields before source reads', async () => {
    const h = harness();
    const response = await handleTodayGuidanceRequest(request({
      requestId: REQUEST, goalId: 'basic_wash', ownerId: USER, decision: readyResult().decision,
    }), h.deps);
    expect(response.status).toBe(400);
    expect(h.readRevision).not.toHaveBeenCalled();
    expect(h.reserveRequest).not.toHaveBeenCalled();
    expect(h.persistReady).not.toHaveBeenCalled();
  });

  it('rejects a missing or invalid user token without evaluating', async () => {
    const h = harness({ authenticate: vi.fn(async () => null) });
    const response = await handleTodayGuidanceRequest(request({ requestId: REQUEST, goalId: 'basic_wash' }), h.deps);
    expect(response.status).toBe(401);
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.reserveRequest).not.toHaveBeenCalled();
    expect(h.persistReady).not.toHaveBeenCalled();
  });

  it('rejects a source correction between evaluation and persistence', async () => {
    const readRevision = vi.fn().mockResolvedValueOnce(3).mockResolvedValueOnce(4);
    const h = harness({ readRevision });
    const response = await handleTodayGuidanceRequest(request({ requestId: REQUEST, goalId: 'basic_wash' }), h.deps);
    expect(response.status).toBe(409);
    expect(h.persistReady).not.toHaveBeenCalled();
  });

  it('returns a stable limit response before source reads', async () => {
    const h = harness({ reserveRequest: vi.fn(async () => { throw new Error('guidance-rate-limited'); }) });
    const response = await handleTodayGuidanceRequest(request({ requestId: REQUEST, goalId: 'basic_wash' }), h.deps);
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: 'rate-limited' });
    expect(h.readRevision).not.toHaveBeenCalled();
    expect(h.persistReady).not.toHaveBeenCalled();
  });

  it('returns a source conflict when the atomic writer detects a later correction', async () => {
    const h = harness({ persistReady: vi.fn(async () => { throw new Error('source-changed'); }) });
    const response = await handleTodayGuidanceRequest(request({ requestId: REQUEST, goalId: 'basic_wash' }), h.deps);
    expect(response.status).toBe(409);
  });

  it('refuses a mismatched trusted write receipt', async () => {
    const h = harness({ persistReady: vi.fn(async () => ({
      id: '33333333-3333-4333-8333-333333333333',
      requestId: USER,
      inputFingerprint: 'a'.repeat(64),
      status: 'ready',
    })) });
    const response = await handleTodayGuidanceRequest(request({ requestId: REQUEST, goalId: 'basic_wash' }), h.deps);
    expect(response.status).toBe(503);
  });

  it('forwards only the temporary check-in to evaluation, never a client verdict', async () => {
    const h = harness();
    const currentCondition = { concerns: ['heat-concern'], availableMinutes: 20 };
    const response = await handleTodayGuidanceRequest(request({
      requestId: REQUEST, goalId: 'basic_wash', currentCondition,
    }), h.deps);
    expect(response.status).toBe(200);
    expect(h.generate.mock.calls[0][0]).toMatchObject({ ownerId: USER, currentCondition });
    expect(h.generate.mock.calls[0][0]).not.toHaveProperty('decision');
  });

  it('returns content_pending without a trusted write when production content is draft', async () => {
    const h = harness({ generate: vi.fn(async () => ({ status: 'content_pending' })) });
    const response = await handleTodayGuidanceRequest(request({ requestId: REQUEST, goalId: 'basic_wash' }), h.deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'content_pending' });
    expect(h.persistReady).not.toHaveBeenCalled();
  });

  it('never returns prepared source records for a nonready decision', async () => {
    const h = harness({ generate: vi.fn(async () => ({
      status: 'needs_input', requestId: REQUEST, missing: [],
      prepared: { privateFact: 'never returned' },
    })) });
    const response = await handleTodayGuidanceRequest(request({ requestId: REQUEST, goalId: 'basic_wash' }), h.deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'needs_input', requestId: REQUEST, missing: [] });
    expect(h.persistReady).not.toHaveBeenCalled();
  });
});

describe('deployed adapter with draft production content', () => {
  it('uses the verified bearer user for every source read and makes no privileged write', async () => {
    const priorDeno = (globalThis as Record<string, unknown>).Deno;
    vi.stubGlobal('Deno', {
      env: { get: (key: string) => ({
        SUPABASE_URL: 'https://local.invalid',
        SUPABASE_PUBLISHABLE_KEY: 'publishable-key',
        SUPABASE_SERVICE_ROLE_KEY: 'service-key',
      } as Record<string, string>)[key] },
      serve: edgeMocks.serve,
    });
    edgeMocks.getUser.mockResolvedValue({ data: { user: { id: USER } }, error: null });
    edgeMocks.ownerRpc.mockImplementation(async (name: string) => ({
      data: name === 'get_guidance_source_revision' ? 2
        : name === 'reserve_today_guidance_request' ? { allowed: true }
        : name === 'get_passport' ? null
          : { items: [], nextCursor: null },
      error: null,
    }));
    edgeMocks.adminRpc.mockResolvedValue({ data: null, error: null });
    edgeMocks.createClient.mockImplementation((_url: string, key: string, options: { global?: { headers?: { Authorization?: string } } }) => {
      if (key === 'service-key') return { rpc: edgeMocks.adminRpc };
      if (options.global?.headers?.Authorization) return { rpc: edgeMocks.ownerRpc };
      return { auth: { getUser: edgeMocks.getUser } };
    });
    try {
      await import('../../supabase/functions/today-guidance/index.ts');
      const handler = edgeMocks.serve.mock.calls[0][0] as (request: Request) => Promise<Response>;
      const response = await handler(request({ requestId: REQUEST, goalId: 'basic_wash' }));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: 'content_pending' });
      expect(edgeMocks.getUser).toHaveBeenCalledWith('user-token');
      expect(edgeMocks.ownerRpc).toHaveBeenCalledWith('get_guidance_source_revision', {});
      expect(edgeMocks.adminRpc).not.toHaveBeenCalled();
      const scopedClients = edgeMocks.createClient.mock.calls.filter(call => call[2]?.global?.headers?.Authorization);
      expect(scopedClients.length).toBeGreaterThan(0);
      expect(scopedClients.every(call => call[2].global.headers.Authorization === 'Bearer user-token')).toBe(true);
    } finally {
      vi.unstubAllGlobals();
      if (priorDeno !== undefined) vi.stubGlobal('Deno', priorDeno);
    }
  });
});
