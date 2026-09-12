import { describe, expect, it, vi } from 'vitest';
import { createElement, type ReactElement, type ReactNode } from 'react';

function renderControlContract(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(renderControlContract).join('');
  const element = node as ReactElement<any>;
  if (typeof element.type === 'function') return renderControlContract((element.type as Function)(element.props));
  return `${element.props['aria-label'] ? `aria-label="${element.props['aria-label']}"` : ''}${element.props.disabled ? 'disabled' : ''}${renderControlContract(element.props.children)}`;
}

vi.mock('react-native', () => {
  const host = (tag: string) => ({ children, accessibilityLabel, accessibilityRole, accessibilityState, onPress, onChangeText, ...props }: any) => createElement(tag, {
    'aria-label': accessibilityLabel, role: accessibilityRole,
    disabled: accessibilityState?.disabled || props.disabled || props.editable === false,
    value: props.value, onChange: () => undefined,
  }, children);
  return { Text: host('span'), View: host('div'), Pressable: host('button'), TextInput: host('input'), ScrollView: host('div'), StyleSheet: { create: (value: unknown) => value } };
});
vi.mock('expo-crypto', () => ({ randomUUID: () => '30000000-0000-4000-8000-000000000001' }));

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
  serviceDraftKey, serviceDraftIndexKey, serviceEditorCopy, serviceView,
  appendServicePage, serviceDateLabel, servicePresenceLabel,
  saveServiceDraft, readServiceDrafts, clearServiceDrafts, removeServiceDraft,
  submitServiceDraft, retainCorrectionFacts,
  serviceDraftOwnerKey, transitionServiceDraftOwner,
  type ServiceDraft,
  loadServiceScreenData,
} from '../../apps/mobile/src/service-form';
import { ServiceFactsView, ServiceOccurrenceFields, ServiceObservationFields } from '../../apps/mobile/src/service-editor';
import * as serviceEditorModule from '../../apps/mobile/src/service-editor';
import { Button } from '../../apps/mobile/src/ui';

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

const ownerA = '20000000-0000-4000-8000-000000000001';
const ownerB = '20000000-0000-4000-8000-000000000002';
function memoryStorage() {
  let values: Record<string, string> = {};
  return {
    getItem: async (key: string) => values[key] ?? null,
    setItem: async (key: string, value: string) => { values = { ...values, [key]: value }; },
    removeItem: async (key: string) => { values = Object.fromEntries(Object.entries(values).filter(([name]) => name !== key)); },
  };
}
const createDraft = () => ({ mode: 'add' as const, command: buildCreateServiceCommand(operationId, serviceId, nanoplastyFacts, observation) });

describe('service experience contracts', () => {
  it('clears departing-owner drafts at the persisted auth boundary, not on view unmount', async () => {
    const storage = memoryStorage();
    await transitionServiceDraftOwner(storage, ownerA);
    await saveServiceDraft(storage, ownerA, createDraft());

    await transitionServiceDraftOwner(storage, ownerA);
    expect(await readServiceDrafts(storage, ownerA)).toEqual([createDraft()]);

    await transitionServiceDraftOwner(storage, ownerB);
    expect(await readServiceDrafts(storage, ownerA)).toEqual([]);
    expect(await storage.getItem(serviceDraftOwnerKey)).toBe(ownerB);

    await saveServiceDraft(storage, ownerB, { ...createDraft(), command: { ...createDraft().command, serviceId: revisionId } });
    await transitionServiceDraftOwner(storage, null);
    expect(await readServiceDrafts(storage, ownerB)).toEqual([]);
    expect(await storage.getItem(serviceDraftOwnerKey)).toBeNull();
  });
  it('loads the current service automatically after a revision conflict', async () => {
    const recover = (serviceEditorModule as unknown as {
      loadServiceConflict?: <T>(serviceId: string, loader: (id: string) => Promise<T | null>) => Promise<{ latest: T | null; message: string }>;
    }).loadServiceConflict;
    let requestedService = '';
    const latest = { ...serviceSummary, userId: ownerA, revisions: [], observations: [] };

    expect(recover).toBeTypeOf('function');
    const result = await recover!(serviceId, async id => {
      requestedService = id;
      return latest;
    });

    expect(requestedService).toBe(serviceId);
    expect(result.latest).toEqual(latest);
    expect(result.message).toBe('');
  });
  it('keeps conflict review safe when the automatic current-service load fails', async () => {
    const recover = (serviceEditorModule as unknown as {
      loadServiceConflict?: <T>(serviceId: string, loader: (id: string) => Promise<T | null>) => Promise<{ latest: T | null; message: string }>;
    }).loadServiceConflict;

    expect(recover).toBeTypeOf('function');
    await expect(recover!(serviceId, async () => { throw new Error('Offline'); })).resolves.toEqual({
      latest: null,
      message: 'The latest entry could not be loaded. Your submitted facts are still here.',
    });
  });
  it('keeps device recovery available when the service list is offline', async () => {
    const storage = memoryStorage();
    await saveServiceDraft(storage, ownerA, createDraft());
    const result = await loadServiceScreenData(async () => { throw new Error('Offline'); }, () => readServiceDrafts(storage, ownerA));
    expect(result.page).toBeNull();
    expect(result.drafts).toEqual([createDraft()]);
    expect(result.error).toBe('Services could not be loaded. Your device drafts are still available.');
  });
  it('provides an explicit accessible action label', () => {
    expect(renderControlContract(createElement(Button, { title: 'Load more services', onPress: () => undefined }))).toContain('aria-label="Load more services"');
  });
  it('labels occurrence controls explicitly and never puts effect presence in occurrence fields', () => {
    const html = renderControlContract(createElement(ServiceOccurrenceFields, { facts: { ...nanoplastyFacts, zones: [...nanoplastyFacts.zones] }, disabled: false, onChange: () => undefined }));
    expect(html).toContain('aria-label="Service type: nanoplasty"');
    expect(html).toContain('aria-label="Product or system (optional)"');
    expect(html).toContain('aria-label="Occurrence date precision: month"');
    expect(html).toContain('front');
    expect(html).not.toContain('Effect presence');
  });
  it('labels observation controls separately and exposes disabled state on locked controls', () => {
    const html = renderControlContract(createElement(ServiceObservationFields, { observation, disabled: true, onChange: () => undefined }));
    expect(html).toContain('aria-label="Effect presence: unknown"');
    expect(html).toContain('aria-label="Observation date (YYYY-MM-DD)"');
    expect(html).toContain('disabled');
    expect(html).not.toContain('Service type');
  });
  it('shows recorded facts as readable labels including unknown heat and chemistry', () => {
    const html = renderControlContract(createElement(ServiceFactsView, { facts: { ...nanoplastyFacts, zones: [...nanoplastyFacts.zones] } }));
    expect(html).toContain('Approximately February 2026');
    expect(html).toContain('Heat details unknown');
    expect(html).toContain('Chemistry unknown');
    expect(html).not.toContain('"serviceType"');
  });
  it('selects loading, empty, list, and detail states without losing loaded rows', () => {
    expect(serviceView(true, [], null)).toBe('loading');
    expect(serviceView(false, [], null)).toBe('empty');
    expect(serviceView(true, [serviceSummary], null)).toBe('list');
    expect(serviceView(false, [serviceSummary], serviceSummary)).toBe('detail');
    expect(appendServicePage([serviceSummary], [{ ...serviceSummary, serviceId: observationId }]).map(item => item.serviceId)).toEqual([serviceId, observationId]);
  });
  it('separates correction and observation actions and renders uncertainty plainly', () => {
    expect(serviceEditorCopy('add').title).toBe('Add a service');
    expect(serviceEditorCopy('correction')).toMatchObject({ title: 'Correct this service entry', submit: 'Save correction' });
    expect(serviceEditorCopy('observation').title).toBe('Record whether the effect is still present');
    expect(serviceDateLabel({ precision: 'month', value: '2026-02' })).toBe('Approximately February 2026');
    expect(serviceDateLabel({ precision: 'unknown', value: null })).toBe('Date unknown');
    expect(servicePresenceLabel('unknown')).toBe('Effect presence unknown');
    expect(createDraft().command.facts).not.toHaveProperty('effectStatus');
  });
  it('retains all submitted facts after conflict without merging latest fields into them', () => {
    const submitted = buildCorrectionCommand(operationId, serviceId, 1, revisionId, 'Correct date', { ...nanoplastyFacts, notes: null });
    expect(retainCorrectionFacts(submitted)).toEqual({ ...nanoplastyFacts, notes: null });
    expect(retainCorrectionFacts(submitted)).not.toBe(submitted.facts);
  });
  it('indexes drafts by owner and service and only clears that owner', async () => {
    const storage = memoryStorage();
    expect(serviceDraftKey(ownerA, serviceId)).toBe(`strandcue-service-draft-${ownerA}-${serviceId}`);
    expect(serviceDraftIndexKey(ownerA)).toBe(`strandcue-service-drafts-${ownerA}`);
    await saveServiceDraft(storage, ownerA, createDraft());
    await saveServiceDraft(storage, ownerB, createDraft());
    await clearServiceDrafts(storage, ownerA);
    expect(await readServiceDrafts(storage, ownerA)).toEqual([]);
    expect(await readServiceDrafts(storage, ownerB)).toEqual([createDraft()]);
    expect(await storage.getItem(`strandcue-service-draft-${ownerA}-${serviceId}`)).toBeNull();
    expect(await storage.getItem(`strandcue-service-drafts-${ownerA}`)).toBeNull();
  });
  it('persists before sending and retries the identical locked command after uncertain failure', async () => {
    const storage = memoryStorage();
    const received: unknown[] = [];
    let attempt = 0;
    const dispatch = async (draft: ServiceDraft) => {
      expect(await readServiceDrafts(storage, ownerA)).toEqual([createDraft()]);
      received.push(draft);
      if (++attempt === 1) throw new Error('Network unavailable');
    };
    await expect(submitServiceDraft(storage, ownerA, createDraft(), dispatch, () => true)).rejects.toThrow('Network unavailable');
    const [restored] = await readServiceDrafts(storage, ownerA);
    await submitServiceDraft(storage, ownerA, restored, dispatch, () => true);
    expect(received).toEqual([createDraft(), createDraft()]);
    expect(await readServiceDrafts(storage, ownerA)).toEqual([]);
  });
  it('never sends when persistence fails or the editor becomes stale', async () => {
    const storage = memoryStorage();
    let sends = 0;
    const dispatch = async () => { sends++; };
    await expect(submitServiceDraft({ ...storage, setItem: async () => { throw new Error('Disk failed'); } }, ownerA, createDraft(), dispatch, () => true)).rejects.toThrow();
    await expect(submitServiceDraft(storage, ownerA, createDraft(), dispatch, () => false)).rejects.toThrow();
    expect(sends).toBe(0);
  });
  it('rejects foreign index keys and malformed draft commands before loading or sending', async () => {
    const storage = memoryStorage();
    await storage.setItem(serviceDraftIndexKey(ownerA), JSON.stringify([`strandcue-service-draft-${ownerB}-${serviceId}`]));
    await expect(clearServiceDrafts(storage, ownerA)).rejects.toThrow();
    await expect(saveServiceDraft(storage, ownerA, { mode: 'add', command: { ...createDraft().command, owner: ownerB } })).rejects.toThrow();
  });
  it('tolerates missing draft values and retains other indexed drafts on explicit discard', async () => {
    const storage = memoryStorage();
    const second = { mode: 'add' as const, command: buildCreateServiceCommand(operationId, observationId, nanoplastyFacts) };
    await saveServiceDraft(storage, ownerA, createDraft());
    await saveServiceDraft(storage, ownerA, second);
    await removeServiceDraft(storage, ownerA, serviceId);
    expect(await readServiceDrafts(storage, ownerA)).toEqual([second]);
    await storage.removeItem(serviceDraftKey(ownerA, observationId));
    expect(await readServiceDrafts(storage, ownerA)).toEqual([]);
  });
});
