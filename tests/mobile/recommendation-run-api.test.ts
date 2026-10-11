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
    status: 'ready' as const,
    input: { requestId: REQUEST_ID, goal: 'basic_wash' },
    decision: { status: 'ready', steps: [] },
    ...overrides,
  };
}

function receipt(overrides: Record<string, unknown> = {}) {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    requestId: REQUEST_ID,
    inputFingerprint: 'a'.repeat(64),
    status: 'ready',
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
      p_status: 'ready',
      p_input: { requestId: REQUEST_ID, goal: 'basic_wash' },
      p_decision: { status: 'ready', steps: [] },
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

  it('surfaces a generic database failure without pretending it saved', async () => {
    rpcMocks.rpc.mockResolvedValue({
      data: null,
      error: { message: 'connection reset', code: '08006' },
    });
    await expect(recordRecommendationRun(validRun())).rejects.toThrow(/connection reset/i);
  });
});