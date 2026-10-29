import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestTodayGuidance } from '../../apps/mobile/src/guidance/today-guidance-server-api';

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('../../apps/mobile/src/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));

const command = {
  requestId: '00000000-0000-4000-8000-000000000001',
  goalId: 'basic_wash' as const,
  currentCondition: {
    observedAt: '2026-10-29T09:00:00.000Z',
    concerns: ['dryness'],
    goal: 'basic_wash',
    availableMinutes: 20,
  },
} satisfies Parameters<typeof requestTodayGuidance>[0];

const binding = {
  assessmentId: '00000000-0000-4000-8000-000000000002',
  sourceFingerprint: `sha256:${'a'.repeat(64)}`,
  publicationId: '00000000-0000-4000-8000-000000000003',
  publicationDigest: `sha256:${'b'.repeat(64)}`,
};

function readyResponse(heatAssessmentBinding: unknown) {
  return {
    status: 'ready', requestId: command.requestId, asOf: command.currentCondition.observedAt,
    engineVersion: '1', bundleId: 'fixture', bundleVersion: '1', inputFingerprint: 'c'.repeat(64),
    input: { requestId: command.requestId, asOf: command.currentCondition.observedAt, goal: 'basic_wash',
      profileFacts: {}, products: [], tools: [], historyFacts: {}, environmentFacts: {}, rules: [] },
    decision: { status: 'ready', requestId: command.requestId, confidence: 'high', noPurchaseNeeded: true,
      steps: [{ stepId: 'step-1', position: 1, action: 'wait', productId: null, productVersionId: null,
        toolId: null, toolVersionId: null, waitSeconds: 30, rinse: null, reasons: ['fixture'] }],
      omissions: [], alternatives: [], missingInputs: [],
      audit: { requestId: command.requestId, engineVersion: '1', evaluatedRules: [], conflicts: [],
        rankedCandidates: [], rejectedCandidates: [], restrictions: [], missingInputs: [] },
      heatAssessmentBinding },
    receipt: { id: '00000000-0000-4000-8000-000000000004', requestId: command.requestId,
      inputFingerprint: 'c'.repeat(64), status: 'ready' },
  };
}

beforeEach(() => mocks.invoke.mockReset());

describe('authenticated Today guidance request', () => {
  it('sends only the request id, goal and current check-in', async () => {
    mocks.invoke.mockResolvedValue({ data: { status: 'content_pending' }, error: null });
    expect(await requestTodayGuidance(command)).toEqual({ status: 'content_pending' });
    expect(mocks.invoke).toHaveBeenCalledWith('today-guidance', { body: command });
    expect(mocks.invoke.mock.calls[0][1].body).not.toHaveProperty('ownerId');
    expect(mocks.invoke.mock.calls[0][1].body).not.toHaveProperty('decision');
  });

  it('fails closed on transport or malformed responses', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: null, error: new Error('offline') });
    await expect(requestTodayGuidance(command)).rejects.toThrow('could not be loaded');
    mocks.invoke.mockResolvedValueOnce({ data: { status: 'ready' }, error: null });
    await expect(requestTodayGuidance(command)).rejects.toThrow();
  });

  it('sends only an optional assessment ID with the intent and rejects invalid IDs', async () => {
    mocks.invoke.mockResolvedValue({ data: { status: 'content_pending' }, error: null });
    const withAssessment = { ...command, assessmentId: binding.assessmentId };
    await requestTodayGuidance(withAssessment);
    expect(mocks.invoke).toHaveBeenCalledWith('today-guidance', { body: withAssessment });
    await expect(requestTodayGuidance({ ...command, assessmentId: 'not-an-id' })).rejects.toThrow();
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });

  it('preserves only a valid immutable assessment binding on a ready decision', async () => {
    mocks.invoke.mockResolvedValue({ data: readyResponse(binding), error: null });
    const result = await requestTodayGuidance({ ...command, assessmentId: binding.assessmentId });
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') throw new Error('Expected ready result');
    expect(result.decision.heatAssessmentBinding).toEqual(binding);
  });

  it('rejects malformed or verdict-carrying assessment bindings', async () => {
    for (const malformed of [
      { ...binding, assessmentId: 'other-owner' },
      { ...binding, sourceFingerprint: 'a'.repeat(64) },
      { ...binding, state: 'appropriate' },
    ]) {
      mocks.invoke.mockResolvedValueOnce({ data: readyResponse(malformed), error: null });
      await expect(requestTodayGuidance(command)).rejects.toThrow();
    }
  });

  it('requires a ready binding to name exactly the requested assessment', async () => {
    mocks.invoke.mockResolvedValueOnce({ data: readyResponse(binding), error: null });
    await expect(requestTodayGuidance(command)).rejects.toThrow();
    mocks.invoke.mockResolvedValueOnce({ data: readyResponse({ ...binding, assessmentId: '00000000-0000-4000-8000-000000000005' }), error: null });
    await expect(requestTodayGuidance({ ...command, assessmentId: binding.assessmentId })).rejects.toThrow();
    mocks.invoke.mockResolvedValueOnce({ data: readyResponse(undefined), error: null });
    await expect(requestTodayGuidance({ ...command, assessmentId: binding.assessmentId })).rejects.toThrow();
  });
});
