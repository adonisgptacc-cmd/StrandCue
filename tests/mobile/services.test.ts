import { describe, expect, it, vi } from 'vitest';

const rpc = vi.hoisted(() => vi.fn());

vi.mock('../../apps/mobile/src/client.ts', () => ({
  supabase: { rpc },
}));

import {
  correctService,
  loadService,
  loadServices,
  observeService,
  recordService,
} from '../../apps/mobile/src/services-api';
import {
  addZone,
  buildCorrectionCommand,
  buildCreateServiceCommand,
  removeZone,
  replaceZone,
} from '../../apps/mobile/src/service-form';

const operationId = '10000000-0000-4000-8000-000000000001';
const serviceId = '10000000-0000-4000-8000-000000000002';
const revisionId = '10000000-0000-4000-8000-000000000003';
const observationId = '10000000-0000-4000-8000-000000000004';

const nanoplastyFacts = {
  serviceType: 'nanoplasty',
  occurredOn: { precision: 'month', value: '2026-02' },
  zones: [{ region: 'front', segment: 'roots' }],
} as const;

const observation = {
  observedOn: { precision: 'day', value: '2026-02-05' },
  effectStatus: 'unknown',
} as const;

const serviceSummary = {
  serviceId,
  revision: 1,
  revisionId,
  facts: nanoplastyFacts,
  currentObservation: {
    id: observationId,
    serviceId,
    ...observation,
    source: 'user-reported',
    recordedAt: '2026-02-05T10:00:00.000000Z',
  },
  currentPresence: 'unknown',
} as const;

describe('chemical services mobile boundary', () => {
  it('parses a complete service page and sends the documented cursor request', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        items: [serviceSummary],
        nextCursor: {
          asOf: '2026-09-01',
          effectiveStart: '2026-02-01',
          recordedAt: '2026-02-01T10:00:00.000000Z',
          serviceId,
        },
      },
      error: null,
    });

    await expect(loadServices('2026-09-01', { limit: 25 })).resolves.toEqual({
      items: [serviceSummary],
      nextCursor: {
        asOf: '2026-09-01',
        effectiveStart: '2026-02-01',
        recordedAt: '2026-02-01T10:00:00.000000Z',
        serviceId,
      },
    });
    expect(rpc).toHaveBeenLastCalledWith('list_services', {
      p_as_of: '2026-09-01',
      p_limit: 25,
      p_cursor: null,
    });
  });

  it('rejects a list response that leaks an owner field', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        items: [{ ...serviceSummary, userId: '10000000-0000-4000-8000-000000000099' }],
        nextCursor: null,
      },
      error: null,
    });
    await expect(loadServices('2026-09-01')).rejects.toThrow();
  });

  it('parses an audited detail while preserving explicit unknown values', async () => {
    rpc.mockResolvedValueOnce({
      data: {
        ...serviceSummary,
        revisions: [{
          id: revisionId, serviceId, sequence: 1, baseRevision: 0, kind: 'baseline',
          facts: nanoplastyFacts, correctsId: null, reason: null,
          recordedAt: '2026-02-01T10:00:00.000000Z',
        }],
        observations: [serviceSummary.currentObservation],
      },
      error: null,
    });

    await expect(loadService(serviceId)).resolves.toMatchObject({
      facts: { serviceType: 'nanoplasty', zones: [{ region: 'front', segment: 'roots' }] },
      currentPresence: 'unknown', revisions: [{ facts: { serviceType: 'nanoplasty' } }],
    });
    expect(rpc).toHaveBeenLastCalledWith('get_service', { p_service_id: serviceId, p_include_audit: true });
  });

  it('rejects malformed details instead of accepting foreign data', async () => {
    rpc.mockResolvedValueOnce({
      data: { ...serviceSummary, revisions: [], observations: [], userId: '10000000-0000-4000-8000-000000000099' },
      error: null,
    });
    await expect(loadService(serviceId)).rejects.toThrow();
  });

  it.each([
    ['a non-UTC timestamp offset', {
      ...serviceSummary,
      currentObservation: { ...serviceSummary.currentObservation, recordedAt: '2026-02-05T10:00:00.000000+02:00' },
    }],
    ['a timestamp without microseconds', {
      ...serviceSummary,
      currentObservation: { ...serviceSummary.currentObservation, recordedAt: '2026-02-05T10:00:00Z' },
    }],
  ])('rejects a detail with %s', async (_description, malformedSummary) => {
    rpc.mockResolvedValueOnce({
      data: { ...malformedSummary, revisions: [], observations: [] },
      error: null,
    });

    await expect(loadService(serviceId)).rejects.toThrow();
  });

  it.each([
    ['baseline correction metadata', {
      id: revisionId, serviceId, sequence: 1, baseRevision: 0, kind: 'baseline',
      facts: nanoplastyFacts, correctsId: revisionId, reason: 'Unexpected correction metadata',
      recordedAt: '2026-02-01T10:00:00.000000Z',
    }],
    ['correction without correction metadata', {
      id: revisionId, serviceId, sequence: 2, baseRevision: 1, kind: 'correction',
      facts: nanoplastyFacts, correctsId: null, reason: null,
      recordedAt: '2026-02-01T10:00:00.000000Z',
    }],
  ])('rejects a detail revision with %s', async (_description, malformedRevision) => {
    rpc.mockResolvedValueOnce({
      data: { ...serviceSummary, revisions: [malformedRevision], observations: [] },
      error: null,
    });

    await expect(loadService(serviceId)).rejects.toThrow();
  });

  it('rejects a page containing more than 100 service items', async () => {
    rpc.mockResolvedValueOnce({
      data: { items: Array.from({ length: 101 }, () => serviceSummary), nextCursor: null },
      error: null,
    });

    await expect(loadServices('2026-09-01')).rejects.toThrow();
  });

  it('submits a validated Nanoplasty command without inferred or owner fields', async () => {
    const command = buildCreateServiceCommand(operationId, serviceId, nanoplastyFacts, observation);
    rpc.mockResolvedValueOnce({ data: { serviceId, revision: 1, revisionId }, error: null });

    await expect(recordService(command)).resolves.toEqual({ serviceId, revision: 1, revisionId });
    expect(rpc).toHaveBeenLastCalledWith('record_service', {
      p_operation_id: operationId, p_service_id: serviceId, p_facts: nanoplastyFacts, p_initial_observation: observation,
    });
    const parameters = rpc.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(parameters).not.toHaveProperty('user_id');
    expect(parameters.p_facts).not.toHaveProperty('chemicalSystem');
    expect(parameters.p_facts).not.toHaveProperty('heat');
  });

  it('rejects a mutation receipt with an unexpected owner field', async () => {
    rpc.mockResolvedValueOnce({
      data: { serviceId, revision: 1, revisionId, userId: '10000000-0000-4000-8000-000000000099' }, error: null,
    });
    await expect(recordService(buildCreateServiceCommand(operationId, serviceId, nanoplastyFacts))).rejects.toThrow();
  });

  it('sends complete correction facts and no observation source', async () => {
    const correction = buildCorrectionCommand(operationId, serviceId, 1, revisionId, 'Correct date', { ...nanoplastyFacts, notes: null });
    rpc.mockResolvedValueOnce({ data: { serviceId, revision: 2, revisionId }, error: null });
    await correctService(correction);
    expect(rpc).toHaveBeenLastCalledWith('correct_service', {
      p_operation_id: operationId, p_service_id: serviceId, p_expected_revision: 1,
      p_corrects_id: revisionId, p_reason: 'Correct date', p_facts: { ...nanoplastyFacts, notes: null },
    });

    rpc.mockResolvedValueOnce({ data: { serviceId, revision: 2, revisionId, observationId }, error: null });
    await observeService({ operationId, serviceId, observation });
    expect(rpc).toHaveBeenLastCalledWith('observe_service', {
      p_operation_id: operationId, p_service_id: serviceId,
      p_observed_on: observation.observedOn, p_effect_status: observation.effectStatus,
    });
    expect(rpc.mock.calls.at(-1)?.[1]).not.toHaveProperty('source');
  });

  it('adds, removes, and replaces zones deterministically without mutation', () => {
    const original = [{ region: 'front', segment: 'roots' }] as const;
    const updated = addZone(original, { region: 'crown', segment: 'ends' });
    expect(updated).toEqual([{ region: 'crown', segment: 'ends' }, { region: 'front', segment: 'roots' }]);
    expect(original).toEqual([{ region: 'front', segment: 'roots' }]);
    expect(() => addZone(updated, { region: 'front', segment: 'roots' })).toThrow(/already added/i);

    const replaced = replaceZone(updated, { region: 'front', segment: 'roots' }, { region: 'nape', segment: 'ends' });
    expect(replaced).toEqual([{ region: 'crown', segment: 'ends' }, { region: 'nape', segment: 'ends' }]);
    expect(updated).toEqual([{ region: 'crown', segment: 'ends' }, { region: 'front', segment: 'roots' }]);
    expect(removeZone(replaced, { region: 'crown', segment: 'ends' })).toEqual([{ region: 'nape', segment: 'ends' }]);
  });

  it('adds the first valid zone to an empty editor without mutating the empty array', () => {
    const original: readonly [] = [];
    const added = addZone(original, { region: 'front', segment: 'roots' });

    expect(added).toEqual([{ region: 'front', segment: 'roots' }]);
    expect(original).toEqual([]);
  });

  it('keeps injected retry IDs stable and requires complete correction facts', () => {
    const first = buildCreateServiceCommand(operationId, serviceId, nanoplastyFacts);
    const retry = buildCreateServiceCommand(operationId, serviceId, nanoplastyFacts);
    expect(retry).toEqual(first);
    expect(first).toMatchObject({ operationId, serviceId, facts: nanoplastyFacts });
    expect(() => buildCorrectionCommand(operationId, serviceId, 1, revisionId, 'Fix', { serviceType: 'nanoplasty' })).toThrow();
  });
});
