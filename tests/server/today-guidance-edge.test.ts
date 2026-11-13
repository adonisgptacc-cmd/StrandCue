import { describe, expect, it, vi } from 'vitest';

import { handleTodayGuidanceRequest, type TodayEdgeDependencies } from '../../supabase/functions/today-guidance/handler.ts';
import type { TodayGuidanceRequest } from '../../apps/mobile/src/guidance/today-guidance-core.ts';
import { evaluateHeatCoach } from '../../packages/domain/src/heat-coach.ts';
import { conformance } from '../fixtures/heat-coach-conformance.ts';

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
const ASSESSMENT = {
  assessmentId: USER,
  publicationId: REQUEST,
  publicationDigest: `sha256:${'b'.repeat(64)}`,
  sourceFingerprint: `sha256:${'c'.repeat(64)}`,
  status: 'no_heat',
  stale: false,
  input: { preparedInput: { goal: { id: 'basic_wash' }, availableMinutes: 20, currentCondition: {} } },
} as const;

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
    prepared: { privateFact: 'never returned', goal: { id: 'basic_wash' }, availableMinutes: 20, currentCondition: {} },
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

  it('keeps an unbound heat action pending before any trusted write', async () => {
    const h = harness({ generate: vi.fn(async () => ({ ...readyResult(), decision: {
      ...readyResult().decision,
      steps: [{ stepId: 'heat', position: 1, action: 'heat',
        heatActionRef: { publicationId: USER, publicationDigest: `sha256:${'a'.repeat(64)}` },
        toolId: null, toolVersionId: null }],
    } })) });
    const response = await handleTodayGuidanceRequest(request({ requestId: REQUEST, goalId: 'basic_wash' }), h.deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'content_pending' });
    expect(h.persistReady).not.toHaveBeenCalled();
  });

  it('checks a requested assessment under the owner token and keeps binding pending', async () => {
    const loadAssessment = vi.fn(async () => ({ ...ASSESSMENT, status: 'lower_heat' }));
    const h = harness({ loadAssessment });
    const response = await handleTodayGuidanceRequest(request({
      requestId: REQUEST, goalId: 'basic_wash', assessmentId: USER,
    }), h.deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: 'content_pending' });
    expect(loadAssessment).toHaveBeenCalledWith('user-token', USER);
    expect(h.generate).toHaveBeenCalledOnce();
    expect(h.persistReady).not.toHaveBeenCalled();
  });

  it.each(['lower_heat', 'appropriate'] as const)(
    'does not turn a %s assessment into a generic tool application', async status => {
      const h = harness({
        loadAssessment: vi.fn(async () => ({ ...ASSESSMENT, status })),
        generate: vi.fn(async () => ({ ...readyResult(), decision: {
          ...readyResult().decision,
          steps: [{ stepId: 'tool', position: 1, action: 'apply',
            productId: null, productVersionId: null,
            toolId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
            toolVersionId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' }],
        } })),
      });
      const response = await handleTodayGuidanceRequest(request({
        requestId: REQUEST, goalId: 'basic_wash', assessmentId: USER,
      }), h.deps);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ status: 'content_pending' });
      expect(h.persistReady).not.toHaveBeenCalled();
    },
  );

  it('persists only a complete heat step projected from the exact published assessment', async () => {
    const publicationDigest = `sha256:${'a'.repeat(64)}`;
    const input = conformance.baselineInput;
    const publication = conformance.baselinePublication;
    const assessment = { assessmentId: USER, publicationId: conformance.publicationId,
      publicationDigest, sourceFingerprint: `sha256:${'c'.repeat(64)}`,
      status: 'appropriate', stale: false, input,
      result: evaluateHeatCoach(input, publication) };
    const steps = [
      { stepId: 'protectant', position: 1, action: 'apply',
        productId: conformance.productOwnerItemId, productVersionId: conformance.productVersionId,
        toolId: null, toolVersionId: null, waitSeconds: null, rinse: null, reasons: [] },
      { stepId: 'heat', position: 2, action: 'heat',
        productId: null, productVersionId: null, toolId: null, toolVersionId: null,
        waitSeconds: null, rinse: null, reasons: [],
        heatActionRef: { publicationId: conformance.publicationId, publicationDigest } },
    ];
    const h = harness({
      loadAssessment: vi.fn(async () => assessment),
      loadHeatPublication: vi.fn(async () => ({ publication, publicationDigest })),
      generate: vi.fn(async () => ({ ...readyResult(),
        prepared: input.preparedInput,
        decision: { ...readyResult().decision, steps },
      })),
    });
    const response = await handleTodayGuidanceRequest(request({
      requestId: REQUEST, goalId: 'basic_wash', assessmentId: USER,
    }), h.deps);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.decision.steps[1]).toMatchObject({
      action: 'heat', toolId: conformance.toolOwnerItemId,
      toolVersionId: conformance.toolVersionId,
      heatPrescription: { method: 'heated-air', temperature: { value: 120, unit: 'C' },
        setting: 'Low', passes: 1, durationMinutes: 15 },
    });
    expect(h.persistReady).toHaveBeenCalledOnce();
  });

  it('binds an exact current no-heat assessment to the trusted decision', async () => {
    const h = harness({ loadAssessment: vi.fn(async () => ASSESSMENT) });
    const response = await handleTodayGuidanceRequest(request({
      requestId: REQUEST, goalId: 'basic_wash', assessmentId: USER,
    }), h.deps);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.decision.heatAssessmentBinding).toEqual({
      assessmentId: USER, publicationId: REQUEST,
      publicationDigest: ASSESSMENT.publicationDigest,
      sourceFingerprint: ASSESSMENT.sourceFingerprint,
    });
    expect(h.persistReady).toHaveBeenCalledWith(USER, expect.objectContaining({
      decision: expect.objectContaining({ heatAssessmentBinding: body.decision.heatAssessmentBinding }),
    }), 3);
    expect(JSON.stringify(body)).not.toContain('privateFact');
  });

  it('binds a completed Today check-in with the same condition and time', async () => {
    const currentCondition = { observedAt: AS_OF, concerns: ['heat-concern'],
      explicitNone: false, zones: [], zoneConcerns: [] };
    const saved = { ...ASSESSMENT, input: { preparedInput: {
      ...ASSESSMENT.input.preparedInput, currentCondition, availableMinutes: 20,
    } } };
    const generated = { ...readyResult(), prepared: { ...readyResult().prepared, currentCondition } };
    const h = harness({ loadAssessment: vi.fn(async () => saved), generate: vi.fn(async () => generated) });
    const response = await handleTodayGuidanceRequest(request({ requestId: REQUEST,
      goalId: 'basic_wash', assessmentId: USER,
      currentCondition: { observedAt: AS_OF, concerns: ['heat-concern'], goal: 'basic_wash', availableMinutes: 20 },
    }), h.deps);
    expect(response.status).toBe(200);
    expect((await response.json()).decision.heatAssessmentBinding.assessmentId).toBe(USER);
  });

  it('rejects an assessment with a different saved check-in', async () => {
    const h = harness({ loadAssessment: vi.fn(async () => ({ ...ASSESSMENT,
      input: { preparedInput: { ...ASSESSMENT.input.preparedInput, currentCondition: { concerns: ['dryness'] } } },
    })) });
    const response = await handleTodayGuidanceRequest(request({
      requestId: REQUEST, goalId: 'basic_wash', assessmentId: USER,
    }), h.deps);
    expect(response.status).toBe(409);
    expect(h.persistReady).not.toHaveBeenCalled();
  });

  it('keeps a no-heat assessment pending when the protocol has an unreviewed heat action', async () => {
    const h = harness({ loadAssessment: vi.fn(async () => ASSESSMENT),
      generate: vi.fn(async () => ({ ...readyResult(), decision: {
        ...readyResult().decision, steps: [{ stepId: 'heat', position: 1, action: 'heat', toolId: null, toolVersionId: null }],
      } })),
    });
    const response = await handleTodayGuidanceRequest(request({ requestId: REQUEST, goalId: 'basic_wash', assessmentId: USER }), h.deps);
    expect(await response.json()).toEqual({ status: 'content_pending' });
    expect(h.persistReady).not.toHaveBeenCalled();
  });

  it('rejects a stale assessment before generating or writing a run', async () => {
    const h = harness({ loadAssessment: vi.fn(async () => ({ ...ASSESSMENT, stale: true })) });
    const response = await handleTodayGuidanceRequest(request({
      requestId: REQUEST, goalId: 'basic_wash', assessmentId: USER,
    }), h.deps);
    expect(response.status).toBe(409);
    expect(h.generate).not.toHaveBeenCalled();
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
