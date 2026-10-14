import { beforeEach, describe, expect, it, vi } from 'vitest';

import { recordRecommendationRun } from '../../apps/mobile/src/guidance/recommendation-run-api';

const rpcMocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock('../../apps/mobile/src/client', () => ({
  supabase: { rpc: rpcMocks.rpc },
}));

const REQUEST_ID = '11111111-1111-4111-8111-111111111111';

function validRun(overrides: Record<string, unknown> = {}) {
  return {
    requestId: REQUEST_ID,
    inputFingerprint: 'a'.repeat(64),
    asOf: '2026-10-11T09:00:00.000Z',
    engineVersion: '1',
    bundleId: 'bundle-synthetic',
    bundleVersion: '1',
    status: 'content_pending' as const,
    input: { requestId: REQUEST_ID, goal: 'basic_wash' },
    decision: { status: 'content_pending', steps: [] },
    ...overrides,
  };
}

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    requestId: REQUEST_ID,
    inputFingerprint: 'a'.repeat(64),
    status: 'content_pending',
    engineVersion: '1',
    bundleId: 'bundle-synthetic',
    bundleVersion: '1',
    createdAt: '2026-10-11T09:00:06.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('recommendation run persistence boundary', () => {
  it('sends exactly the RPC parameters the database expects', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: receipt(), error: null });
    const result = await recordRecommendationRun(validRun());
    expect(rpcMocks.rpc).toHaveBeenCalledTimes(1);
    expect(rpcMocks.rpc).toHaveBeenCalledWith('record_recommendation_run', {
      p_request_id: REQUEST_ID,
      p_input_fingerprint: 'a'.repeat(64),
      p_as_of: '2026-10-11T09:00:00.000Z',
      p_engine_version: '1',
      p_bundle_id: 'bundle-synthetic',
      p_bundle_version: '1',
      p_status: 'content_pending',
      p_input: { requestId: REQUEST_ID, goal: 'basic_wash' },
      p_decision: { status: 'content_pending', steps: [] },
    });
    expect(result.requestId).toBe(REQUEST_ID);
    expect(result.inputFingerprint).toBe('a'.repeat(64));
  });

  it('refuses an owner id from the caller rather than forwarding it', async () => {
    rpcMocks.rpc.mockClear();
    await expect(
      recordRecommendationRun(validRun({ ownerId: 'somebody' })),
    ).rejects.toThrow();
    expect(rpcMocks.rpc).not.toHaveBeenCalled();

    rpcMocks.rpc.mockResolvedValue({ data: receipt(), error: null });
    await recordRecommendationRun(validRun());
    const parameters = rpcMocks.rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(Object.keys(parameters).some(key => /owner|user_id/i.test(key))).toBe(false);
    expect(parameters).not.toHaveProperty('p_owner_id');
  });

  it('rejects an unknown status before calling the database', async () => {
    rpcMocks.rpc.mockClear();
    await expect(
      recordRecommendationRun(validRun({ status: 'totally_made_up' })),
    ).rejects.toThrow();
    expect(rpcMocks.rpc).not.toHaveBeenCalled();
  });

  it('refuses a ready status before calling the database', async () => {
    rpcMocks.rpc.mockClear();
    await expect(recordRecommendationRun(validRun({ status: 'ready' }))).rejects.toThrow();
    expect(rpcMocks.rpc).not.toHaveBeenCalled();
  });

  it('refuses every executable status and still accepts each fail-closed status', async () => {
    for (const status of [
      'needs_setup',
      'content_pending',
      'needs_input',
      'rule_conflict',
      'unsupported',
      'source_error',
    ] as const) {
      rpcMocks.rpc.mockClear();
      rpcMocks.rpc.mockResolvedValue({ data: receipt({ status }), error: null });
      await expect(
        recordRecommendationRun(validRun({ status, decision: { status, steps: [] } })),
      ).resolves.toMatchObject({ status });
      expect(rpcMocks.rpc).toHaveBeenCalledTimes(1);
    }
    rpcMocks.rpc.mockClear();
    await expect(recordRecommendationRun(validRun({ status: 'ready' }))).rejects.toThrow();
    expect(rpcMocks.rpc).not.toHaveBeenCalled();
  });

  it('still parses a ready receipt from server output without sending one', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: receipt({ status: 'ready' }), error: null });
    const result = await recordRecommendationRun(validRun());
    expect(result.status).toBe('ready');
  });

  it('rejects a missing or malformed fingerprint', async () => {
    rpcMocks.rpc.mockClear();
    await expect(recordRecommendationRun(validRun({ inputFingerprint: 'short' }))).rejects.toThrow();
    await expect(
      recordRecommendationRun(validRun({ requestId: undefined })),
    ).rejects.toThrow();
    expect(rpcMocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects an unknown key on the run', async () => {
    rpcMocks.rpc.mockClear();
    await expect(
      recordRecommendationRun(validRun({ surprise: true })),
    ).rejects.toThrow();
    expect(rpcMocks.rpc).not.toHaveBeenCalled();
  });

  it('rejects a malformed receipt from the database', async () => {
    rpcMocks.rpc.mockResolvedValue({ data: { requestId: REQUEST_ID }, error: null });
    await expect(recordRecommendationRun(validRun())).rejects.toThrow();
  });

  it('maps a run-conflict error to a stable conflict message', async () => {
    rpcMocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'run-conflict', code: '23505' },
    });
    await expect(recordRecommendationRun(validRun())).rejects.toThrow(/run-conflict/i);
  });

  it('maps a payload-too-large error to a stable message', async () => {
    rpcMocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'payload-too-large', code: '22023' },
    });
    await expect(recordRecommendationRun(validRun())).rejects.toThrow(/payload-too-large/i);
  });

  it('maps trust-boundary rejections to stable codes, never raw database text', async () => {
    for (const code of ['executable-status-forbidden', 'malformed-protocol'] as const) {
      rpcMocks.rpc.mockResolvedValue({ data: null, error: { message: code, code: '42501' } });
      await expect(recordRecommendationRun(validRun())).rejects.toThrow(new RegExp(code, 'i'));
    }
  });

  it('surfaces a generic database failure without pretending it saved', async () => {
    rpcMocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'connection reset', code: '08006' },
    });
    await expect(recordRecommendationRun(validRun())).rejects.toThrow(/connection reset/i);
  });
});