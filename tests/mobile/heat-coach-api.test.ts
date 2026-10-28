import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createHeatCoachAssessment, getHeatCoachAssessment, listHeatCoachAssessments, getHeatCoachReviewedCopy, type HeatCoachReceipt } from '../../apps/mobile/src/heat-coach-api';
import { HeatCoachError, mapHeatCoachServerMessage } from '../../apps/mobile/src/heat-coach-errors';

const client = vi.hoisted(() => ({ rpc: vi.fn(), available: true }));
vi.mock('../../apps/mobile/src/client', () => ({
  get supabase() { return client.available ? { rpc: client.rpc } : null; },
}));

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const digest = `sha256:${'a'.repeat(64)}`;
const intent = {
  method: { state: 'unknown' }, temperature: { state: 'unknown' },
  setting: { state: 'unknown' }, passes: { state: 'unknown' },
  durationMinutes: { state: 'unknown' }, zones: [],
};
const command = { operationId: id, publicationId: id, publicationDigest: digest, intent };
const receipt = {
  assessmentId: id, publicationId: id, publicationDigest: digest,
  input: {
    schemaVersion: 1, asOf: '2026-10-27T10:00:00Z',
    preparedInput: {
      schemaVersion: 1, goal: { id: 'basic_wash', label: 'Basic wash' }, availableMinutes: 45,
      passport: { facts: {} }, currentCondition: {
        observedAt: '2026-10-27T09:00:00Z', concerns: ['dryness'], explicitNone: false,
        zones: [{ region: 'whole-head', segment: 'entire-strand' }], zoneConcerns: [],
      },
      effectiveFacts: [], chemicalServices: [], heatHistory: [], activities: [], products: [], tools: [],
      completeness: { activities: 'complete', passport: 'complete', products: 'complete', services: 'complete', tools: 'complete' },
    },
    confirmedCareEvents: [], request: { ...intent, toolOwnerItemId: null, productOwnerItemId: null },
  },
  result: {
    schemaVersion: 1, state: 'needs_input', necessity: 'unknown',
    selected: { method: null, temperature: null, setting: null, passes: null, durationMinutes: null, zones: [] },
    missing: [], reasons: [{ reasonCode: 'input_missing', copyKey: 'heat.input_missing' }],
    alternatives: [], recentConfirmedHeatCount: 0,
  },
  status: 'needs_input',
  sourceRevisions: { passport: null, services: [], products: [], tools: [], activities: [] },
  sourceFingerprint: digest, createdAt: '2026-10-27T10:00:00Z', revision: 1, stale: false,
};

beforeEach(() => { client.rpc.mockReset(); client.available = true; });

describe('Heat Coach API boundary', () => {
  it('accepts only exact digest-bound reviewed copy rows', async () => {
    const copy = { assessmentId: id, publicationId: id, publicationDigest: digest,
      copy: [{ copyKey: 'heat.input_missing', text: 'Synthetic reviewed explanation.' }] };
    client.rpc.mockResolvedValueOnce({ data: copy, error: null })
      .mockResolvedValueOnce({ data: { ...copy, publicationDigest: `sha256:${'b'.repeat(64)}` }, error: null })
      .mockResolvedValueOnce({ data: { ...copy, copy: [{ ...copy.copy[0], reviewer: 'private' }] }, error: null });
    expect(await getHeatCoachReviewedCopy(receipt as HeatCoachReceipt)).toEqual(copy);
    expect(client.rpc).toHaveBeenCalledWith('get_heat_coach_reviewed_copy', { p_assessment_id: id,
      p_publication_id: id, p_publication_digest: digest });
    await expect(getHeatCoachReviewedCopy(receipt as HeatCoachReceipt)).rejects.toMatchObject({ code: 'publication-mismatch' });
    await expect(getHeatCoachReviewedCopy(receipt as HeatCoachReceipt)).rejects.toMatchObject({ code: 'malformed-response' });
  });
  it('rejects client-forged decision fields before the RPC', async () => {
    await expect(createHeatCoachAssessment({ ...command, result: { state: 'appropriate' } }))
      .rejects.toMatchObject({ code: 'invalid-heat-intent' });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('rejects malformed zones before the RPC', async () => {
    await expect(createHeatCoachAssessment({ ...command, intent: { ...intent, zones: [{ region: 'invented', segment: 'roots' }] } }))
      .rejects.toMatchObject({ code: 'invalid-heat-intent' });
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('fails closed on a malformed successful response', async () => {
    client.rpc.mockResolvedValue({ data: { status: 'appropriate' }, error: null });
    await expect(createHeatCoachAssessment(command))
      .rejects.toMatchObject({ code: 'malformed-response' });
    expect(client.rpc).toHaveBeenCalledWith('create_heat_coach_assessment', {
      p_operation_id: id, p_publication_id: id,
      p_publication_digest: digest, p_intent: intent,
    });
  });

  it('fails closed if a transport returns no response object', async () => {
    client.rpc.mockResolvedValue(undefined);
    await expect(createHeatCoachAssessment(command)).rejects.toMatchObject({ code: 'malformed-response' });
  });

  it('rejects malformed get and list responses', async () => {
    client.rpc.mockResolvedValue({ data: { items: [{}], nextCursor: null }, error: null });
    await expect(getHeatCoachAssessment(id)).rejects.toMatchObject({ code: 'malformed-response' });
    await expect(listHeatCoachAssessments({ limit: 25 })).rejects.toMatchObject({ code: 'malformed-response' });
  });

  it('parses an exact server receipt for create, get and list', async () => {
    client.rpc.mockResolvedValueOnce({ data: receipt, error: null })
      .mockResolvedValueOnce({ data: receipt, error: null })
      .mockResolvedValueOnce({ data: { items: [receipt], nextCursor: null }, error: null });
    expect(await createHeatCoachAssessment(command)).toEqual(receipt);
    expect(await getHeatCoachAssessment(id)).toEqual(receipt);
    expect(await listHeatCoachAssessments({ limit: 25 })).toEqual({ items: [receipt], nextCursor: null });
  });

  it('rejects extra server fields and duplicate page rows', async () => {
    client.rpc.mockResolvedValueOnce({ data: { ...receipt, internal: 'hidden' }, error: null })
      .mockResolvedValueOnce({ data: { items: [receipt, receipt], nextCursor: null }, error: null });
    await expect(createHeatCoachAssessment(command)).rejects.toMatchObject({ code: 'malformed-response' });
    await expect(listHeatCoachAssessments({ limit: 25 })).rejects.toMatchObject({ code: 'malformed-response' });
  });

  it('recognises only closed server codes and hides unknown text', () => {
    expect(mapHeatCoachServerMessage('heat-content-pending')).toBe('heat-content-pending');
    expect(mapHeatCoachServerMessage('Failed to fetch')).toBe('offline');
    expect(mapHeatCoachServerMessage('private table secret')).toBe('unknown');
    expect(new HeatCoachError('unknown').message).not.toContain('private');
  });

  it('maps known, offline and unknown RPC failures to safe copy', async () => {
    client.rpc.mockResolvedValueOnce({ data: null, error: { message: 'heat-content-pending' } })
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce({ data: null, error: { message: 'private table secret' } });
    await expect(createHeatCoachAssessment(command)).rejects.toMatchObject({ code: 'heat-content-pending' });
    await expect(createHeatCoachAssessment(command)).rejects.toMatchObject({ code: 'offline' });
    await expect(createHeatCoachAssessment(command)).rejects.toMatchObject({ code: 'unknown' });
  });

  it('rejects contradictory current-condition facts locally', async () => {
    const currentCondition = { observedAt: '2026-10-27T10:00:00Z', concerns: ['none', 'dryness'],
      explicitNone: true, zones: [], zoneConcerns: [] };
    await expect(createHeatCoachAssessment({ ...command, intent: { ...intent, currentCondition } }))
      .rejects.toMatchObject({ code: 'invalid-heat-intent' });
    expect(client.rpc).not.toHaveBeenCalled();
  });
});
