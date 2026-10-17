import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadGuidanceSnapshot } from '../../apps/mobile/src/guidance/guidance-snapshot';

const apiMocks = vi.hoisted(() => ({
  loadPassport: vi.fn(),
  loadServices: vi.fn(),
  listGuidanceActivityHistories: vi.fn(),
  listUserProducts: vi.fn(),
  getUserProduct: vi.fn(),
  listUserTools: vi.fn(),
  getUserTool: vi.fn(),
}));

vi.mock('../../apps/mobile/src/passport-api', () => ({ loadPassport: apiMocks.loadPassport }));
vi.mock('../../apps/mobile/src/services-api', () => ({ loadServices: apiMocks.loadServices }));
vi.mock('../../apps/mobile/src/guidance/guidance-activity-api', () => ({
  listGuidanceActivityHistories: apiMocks.listGuidanceActivityHistories,
}));
vi.mock('../../apps/mobile/src/shelf-api', () => ({
  listUserProducts: apiMocks.listUserProducts,
  getUserProduct: apiMocks.getUserProduct,
}));
vi.mock('../../apps/mobile/src/tool-api', () => ({
  listUserTools: apiMocks.listUserTools,
  getUserTool: apiMocks.getUserTool,
}));

const OWNER = 'owner-1';
const AS_OF = '2026-10-11T09:00:00.000Z';
const LOADED_AT = '2026-10-11T09:00:05.000Z';
const AS_OF_DATE = '2026-10-11';

const PRODUCT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const PRODUCT_VERSION = 'bbbbbbbb-0000-4000-8000-000000000001';
const TOOL_ID = 'aaaaaaaa-0000-4000-8000-000000000002';
const TOOL_VERSION = 'bbbbbbbb-0000-4000-8000-000000000002';
const ACTIVITY_ID = 'cccccccc-0000-4000-8000-000000000001';
const BASELINE_ID = 'cccccccc-0000-4000-8000-000000000099';
const CORRECTION_ID = 'cccccccc-0000-4000-8000-000000000098';
const VOID_ID = 'cccccccc-0000-4000-8000-000000000097';
const CHANGE_ID = 'cccccccc-0000-4000-8000-000000000096';
const SERVICE_ID = 'dddddddd-0000-4000-8000-000000000001';

function page<T>(items: readonly T[], nextCursor: unknown = null) {
  return { items, nextCursor };
}

function productSummary(overrides: Record<string, unknown> = {}) {
  return {
    id: PRODUCT_ID,
    revision: 4,
    availability: 'available',
    manualName: 'Owned shampoo',
    ...overrides,
  };
}

function toolSummary(overrides: Record<string, unknown> = {}) {
  return {
    id: TOOL_ID,
    revision: 2,
    availability: 'available',
    manualModel: 'Owned dryer',
    ...overrides,
  };
}

function serviceSummary(overrides: Record<string, unknown> = {}) {
  return {
    serviceId: SERVICE_ID,
    revision: 1,
    revisionId: 'dddddddd-0000-4000-8000-000000000099',
    facts: {
      serviceType: 'bleach-or-lightener',
      occurredOn: { precision: 'day', value: '2026-06-01' },
      zones: [],
    },
    currentObservation: null,
    currentPresence: 'present',
    ...overrides,
  };
}

function activityBaseline(overrides: Record<string, unknown> = {}) {
  return {
    id: BASELINE_ID,
    activityId: ACTIVITY_ID,
    sequence: 1,
    baseRevision: 0,
    kind: 'baseline',
    effectiveDate: { precision: 'day', value: '2026-06-01' },
    recordedAt: '2026-06-01T10:00:00.000Z',
    source: 'user-reported',
    patch: {
      activityKind: 'wash',
      precision: 'exact_day',
      zones: [{ region: 'whole_head', segment: 'entire_strand' }],
      notes: 'Sensitive wash notes',
      status: 'active',
    },
    ...overrides,
  };
}

function activityCorrection(overrides: Record<string, unknown> = {}) {
  return {
    id: CORRECTION_ID,
    activityId: ACTIVITY_ID,
    sequence: 3,
    baseRevision: 2,
    kind: 'correction',
    correctsId: CHANGE_ID,
    correctionReason: 'fix activity kind',
    effectiveDate: { precision: 'day', value: '2026-07-01' },
    recordedAt: '2026-10-11T09:00:04.000Z',
    source: 'user-reported',
    patch: { activityKind: 'other', precision: 'exact_day', status: 'active', notes: 'private correction note' },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  apiMocks.loadPassport.mockResolvedValue({
    passportId: 'passport-1',
    revision: 3,
    projection: {
      asOf: AS_OF_DATE,
      values: { naturalPattern: 'curly', concerns: ['dryness'] },
      ambiguousFields: {},
      appliedRevisionIds: [],
      supersededRevisionIds: [],
    },
    revisions: [],
  });
  apiMocks.loadServices.mockResolvedValue(page([serviceSummary()]));
  apiMocks.listGuidanceActivityHistories.mockResolvedValue(page([{
    activityId: ACTIVITY_ID,
    revisions: [activityBaseline()],
  }]));
  apiMocks.listUserProducts.mockResolvedValue(page([productSummary()]));
  apiMocks.getUserProduct.mockResolvedValue({
    id: PRODUCT_ID,
    revision: 4,
    availability: 'available',
    matched: true,
    matchConfirmed: true,
    manualName: 'Owned shampoo',
    versionId: PRODUCT_VERSION,
    revisions: [],
  });
  apiMocks.listUserTools.mockResolvedValue(page([toolSummary()]));
  apiMocks.getUserTool.mockResolvedValue({
    id: TOOL_ID,
    revision: 2,
    availability: 'available',
    matched: true,
    matchConfirmed: true,
    manualModel: 'Owned dryer',
    versionId: TOOL_VERSION,
    revisions: [],
  });
});

function load(): Promise<unknown> {
  return loadGuidanceSnapshot(OWNER, AS_OF, LOADED_AT);
}

describe('guidance snapshot completeness', () => {
  it('assembles a complete snapshot with exact owner and timestamps', async () => {
    const snapshot = (await load()) as Record<string, any>;
    expect(snapshot.ownerId).toBe(OWNER);
    expect(snapshot.asOf).toBe(AS_OF);
    expect(snapshot.loadedAt).toBe(LOADED_AT);
    expect(snapshot.completeness).toEqual({
      passport: 'complete',
      services: 'complete',
      activities: 'complete',
      products: 'complete',
      tools: 'complete',
    });
  });

  it('copies passport projection values without mutating the source', async () => {
    const source = {
      passportId: 'passport-1',
      revision: 3,
      projection: {
        asOf: AS_OF_DATE,
        values: { naturalPattern: 'curly' },
        ambiguousFields: {},
        appliedRevisionIds: [],
        supersededRevisionIds: [],
      },
      revisions: [],
    };
    apiMocks.loadPassport.mockResolvedValue(source);
    const snapshot = (await load()) as Record<string, any>;
    expect(snapshot.passportFacts).toEqual({ naturalPattern: 'curly' });
    expect(snapshot.passportFacts).not.toBe(source.projection.values);
    expect(source.projection.values).toEqual({ naturalPattern: 'curly' });
  });

  it('reports the passport as missing when no passport record exists', async () => {
    apiMocks.loadPassport.mockResolvedValue(null);
    const snapshot = (await load()) as Record<string, any>;
    expect(snapshot.completeness.passport).toBe('missing');
    expect(snapshot.passportFacts).toEqual({});
  });
});

describe('guidance snapshot item fidelity', () => {
  it('preserves the matched version id and availability exactly', async () => {
    const snapshot = (await load()) as Record<string, any>;
    expect(snapshot.products).toEqual([
      {
        ownerItemId: PRODUCT_ID,
        versionId: PRODUCT_VERSION,
        name: 'Owned shampoo',
        availability: 'available',
        revision: 4,
      },
    ]);
    expect(snapshot.tools[0].versionId).toBe(TOOL_VERSION);
  });

  it('keeps archived and out-of-stock items with their exact availability', async () => {
    const archived = 'aaaaaaaa-0000-4000-8000-000000000003';
    apiMocks.listUserProducts.mockResolvedValue(
      page([
        productSummary(),
        productSummary({ id: archived, availability: 'archived', manualName: 'Old bottle' }),
        productSummary({
          id: 'aaaaaaaa-0000-4000-8000-000000000004',
          availability: 'out_of_stock',
          manualName: 'Empty bottle',
        }),
      ]),
    );
    apiMocks.getUserProduct.mockImplementation((id: string) =>
      Promise.resolve({
        id,
        revision: 4,
        availability: id === archived ? 'archived' : id.endsWith('004') ? 'out_of_stock' : 'available',
        matched: true,
        matchConfirmed: true,
        manualName: 'x',
        versionId: PRODUCT_VERSION,
        revisions: [],
      }),
    );
    const snapshot = (await load()) as Record<string, any>;
    expect(snapshot.products.map((item: any) => item.availability).sort()).toEqual([
      'archived',
      'available',
      'out_of_stock',
    ]);
  });

  it('keeps a manual item with a null version id', async () => {
    apiMocks.getUserProduct.mockResolvedValue({
      id: PRODUCT_ID,
      revision: 4,
      availability: 'available',
      matched: false,
      matchConfirmed: false,
      manualName: 'Unmatched bottle',
      versionId: null,
      revisions: [],
    });
    const snapshot = (await load()) as Record<string, any>;
    expect(snapshot.products[0].versionId).toBeNull();
  });

  it('sorts products and tools by owner item id', async () => {
    const first = 'aaaaaaaa-0000-4000-8000-000000000009';
    apiMocks.listUserProducts.mockResolvedValue(
      page([productSummary(), productSummary({ id: first })]),
    );
    apiMocks.getUserProduct.mockImplementation((id: string) =>
      Promise.resolve({
        id,
        revision: 1,
        availability: 'available',
        matched: true,
        matchConfirmed: true,
        manualName: 'x',
        versionId: PRODUCT_VERSION,
        revisions: [],
      }),
    );
    const snapshot = (await load()) as Record<string, any>;
    expect(snapshot.products.map((item: any) => item.ownerItemId)).toEqual([
      PRODUCT_ID,
      first,
    ]);
  });
});

describe('guidance snapshot pagination and bounds', () => {
  it('follows every next cursor until a page is complete', async () => {
    const second = 'aaaaaaaa-0000-4000-8000-00000000000a';
    apiMocks.listUserProducts
      .mockResolvedValueOnce(page([productSummary()], { updatedAt: AS_OF, id: PRODUCT_ID }))
      .mockResolvedValueOnce(page([productSummary({ id: second })], null));
    apiMocks.getUserProduct.mockImplementation((id: string) =>
      Promise.resolve({
        id,
        revision: 1,
        availability: 'available',
        matched: true,
        matchConfirmed: true,
        manualName: 'x',
        versionId: PRODUCT_VERSION,
        revisions: [],
      }),
    );
    const snapshot = (await load()) as Record<string, any>;
    expect(apiMocks.listUserProducts).toHaveBeenCalledTimes(2);
    expect(apiMocks.listUserProducts.mock.calls[1][0]).toMatchObject({
      limit: 100,
      cursor: { updatedAt: AS_OF, id: PRODUCT_ID },
    });
    expect(snapshot.products).toHaveLength(2);
    expect(snapshot.completeness.products).toBe('complete');
  });

  it('paginates activities and services too', async () => {
    const serviceCursor = {
      asOf: AS_OF_DATE,
      effectiveStart: '2026-06-01',
      recordedAt: AS_OF,
      serviceId: SERVICE_ID,
    };
    apiMocks.loadServices
      .mockResolvedValueOnce(page([serviceSummary()], serviceCursor))
      .mockResolvedValueOnce(page([]));
    apiMocks.listGuidanceActivityHistories
      .mockResolvedValueOnce(
        page([{ activityId: ACTIVITY_ID, revisions: [activityBaseline()] }], { baselineRecordedAt: AS_OF, activityId: ACTIVITY_ID }),
      )
      .mockResolvedValueOnce(page([]));
    await load();
    expect(apiMocks.loadServices).toHaveBeenCalledTimes(2);
    expect(apiMocks.listGuidanceActivityHistories).toHaveBeenCalledTimes(2);
    expect(apiMocks.listGuidanceActivityHistories.mock.calls[0][0]).toBe(AS_OF_DATE);
    expect(apiMocks.listGuidanceActivityHistories.mock.calls[0][1]).toBe(LOADED_AT);
    expect(apiMocks.listGuidanceActivityHistories.mock.calls[1][2]).toMatchObject({
      limit: 100,
      cursor: { baselineRecordedAt: AS_OF, activityId: ACTIVITY_ID },
    });
  });

  it('marks a source truncated when it exceeds the 500 item ceiling', async () => {
    let served = 0;
    apiMocks.listUserTools.mockImplementation(() => {
      served += 1;
      const page$ = served;
      const items = Array.from(
        { length: 100 },
        (_, index) => toolSummary({ id: `aaaaaaaa-0000-4000-8000-${String(page$).padStart(8, '0')}${String(index).padStart(4, '0')}` }),
      );
      return Promise.resolve(page(items, { updatedAt: AS_OF, id: items[99].id }));
    });
    apiMocks.getUserTool.mockImplementation((id: string) =>
      Promise.resolve({
        id,
        revision: 1,
        availability: 'available',
        matched: true,
        matchConfirmed: true,
        manualModel: 'x',
        versionId: TOOL_VERSION,
        revisions: [],
      }),
    );
    const snapshot = (await load()) as Record<string, any>;
    expect(snapshot.completeness.tools).toBe('truncated');
    expect(snapshot.tools.length).toBe(500);
    expect(served).toBe(5);
  });

  it('marks activities truncated at the 500 history ceiling', async () => {
    let served = 0;
    apiMocks.listGuidanceActivityHistories.mockImplementation(() => {
      served += 1;
      const pageNumber = served;
      const items = Array.from({ length: 100 }, (_, index) => {
        const suffix = String((pageNumber - 1) * 100 + index + 1).padStart(12, '0');
        const activityId = `cccccccc-0000-4000-8000-${suffix}`;
        const revisionId = `dddddddd-0000-4000-8000-${suffix}`;
        return {
          activityId,
          revisions: [activityBaseline({ activityId, id: revisionId })],
        };
      });
      return Promise.resolve(page(items, { baselineRecordedAt: AS_OF, activityId: items[99].activityId }));
    });
    const snapshot = (await load()) as Record<string, any>;
    expect(snapshot.completeness.activities).toBe('truncated');
    expect(snapshot.activities).toHaveLength(500);
    expect(served).toBe(5);
  });

  it('limits concurrent detail loads to four', async () => {
    const ids = Array.from(
      { length: 12 },
      (_, index) => `aaaaaaaa-0000-4000-8000-0000000001${String(index).padStart(2, '0')}`,
    );
    apiMocks.listUserProducts.mockResolvedValue(page(ids.map(id => productSummary({ id })), null));
    let inFlight = 0;
    let peak = 0;
    apiMocks.getUserProduct.mockImplementation((id: string) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      return new Promise(resolve => {
        setTimeout(() => {
          inFlight -= 1;
          resolve({
            id,
            revision: 1,
            availability: 'available',
            matched: true,
            matchConfirmed: true,
            manualName: 'x',
            versionId: PRODUCT_VERSION,
            revisions: [],
          });
        }, 1);
      });
    });
    await load();
    expect(peak).toBeLessThanOrEqual(4);
  });
});

describe('guidance snapshot failure handling', () => {
  it('marks a source failed when its detail load fails', async () => {
    apiMocks.getUserProduct.mockRejectedValue(new Error('network down'));
    const snapshot = (await load()) as Record<string, any>;
    expect(snapshot.completeness.products).toBe('failed');
    expect(snapshot.completeness.tools).toBe('complete');
  });

  it('never reports a failed activity history read as complete', async () => {
    apiMocks.listGuidanceActivityHistories.mockRejectedValue(new Error('boom'));
    const snapshot = (await load()) as Record<string, any>;
    expect(snapshot.completeness.activities).toBe('failed');
    expect(snapshot.completeness.activities).not.toBe('complete');
  });

  it('fails closed on a malformed history and returns no partial activity list', async () => {
    apiMocks.listGuidanceActivityHistories.mockResolvedValue(page([{
      activityId: ACTIVITY_ID,
      revisions: [],
    }]));
    const snapshot = (await load()) as Record<string, any>;
    expect(snapshot.completeness.activities).toBe('failed');
    expect(snapshot.activities).toEqual([]);
  });

  it('passes the effective and recorded cutoffs to the history API', async () => {
    await load();
    expect(apiMocks.listGuidanceActivityHistories).toHaveBeenCalledWith(AS_OF_DATE, LOADED_AT, {
      limit: 100,
      cursor: null,
    });
  });

  it('marks a source failed when its list call fails', async () => {
    apiMocks.listUserTools.mockRejectedValue(new Error('offline'));
    const snapshot = (await load()) as Record<string, any>;
    expect(snapshot.completeness.tools).toBe('failed');
    expect(snapshot.tools).toEqual([]);
  });

  it('preserves a month-precision service date instead of failing the load', async () => {
    // The service editor accepts day/month/year/unknown precision, and month
    // precision is stored as '2026-06'. Today must not reject the whole load
    // because of it, and must not invent a day that was never recorded.
    apiMocks.loadServices.mockResolvedValue(
      page([
        serviceSummary({
          facts: {
            serviceType: 'bleach-or-lightener',
            occurredOn: { precision: 'month', value: '2026-06' },
            zones: [],
          },
        }),
      ]),
    );
    const snapshot = (await load()) as Record<string, any>;
    expect(snapshot.completeness.services).toBe('complete');
    expect(snapshot.services[0].effectiveStart).toEqual({ precision: 'month', value: '2026-06' });
  });

it('preserves a year-precision and unknown-precision service date', async () => {
    apiMocks.loadServices.mockResolvedValue(
      page([
        serviceSummary({
          serviceId: 'dddddddd-0000-4000-8000-000000000002',
          facts: {
            serviceType: 'keratin',
            occurredOn: { precision: 'year', value: '2025' },
            zones: [],
          },
        }),
        serviceSummary({
          serviceId: 'dddddddd-0000-4000-8000-000000000003',
          facts: {
            serviceType: 'relaxer',
            occurredOn: { precision: 'unknown', value: null },
            zones: [],
          },
        }),
      ]),
    );
    const snapshot = (await load()) as Record<string, any>;
    const byId = new Map<string, any>(snapshot.services.map((entry: any) => [entry.serviceId, entry]));
    expect(byId.get('dddddddd-0000-4000-8000-000000000002').effectiveStart).toEqual({
      precision: 'year',
      value: '2025',
    });
    expect(byId.get('dddddddd-0000-4000-8000-000000000003').effectiveStart).toEqual({
      precision: 'unknown',
      value: null,
    });
  });

it('still copies a day-precision service date exactly', async () => {
    const snapshot = (await load()) as Record<string, any>;
    expect(snapshot.services[0].effectiveStart).toEqual({ precision: 'day', value: '2026-06-01' });
  });

it('preserves service presence and effective dates without inference', async () => {
    apiMocks.loadServices.mockResolvedValue(
      page([
        serviceSummary({ currentPresence: 'unknown' }),
        serviceSummary({ serviceId: 'dddddddd-0000-4000-8000-000000000002', currentPresence: 'not-present' }),
      ]),
    );
    const snapshot = (await load()) as Record<string, any>;
    const byId = new Map<string, any>(snapshot.services.map((entry: any) => [entry.serviceId, entry]));
    expect(byId.get(SERVICE_ID)).toMatchObject({
      currentPresence: 'unknown',
    });
    expect(byId.get(SERVICE_ID).effectiveStart).toEqual({ precision: 'day', value: '2026-06-01' });
    expect(byId.get('dddddddd-0000-4000-8000-000000000002')).toMatchObject({
      currentPresence: 'not-present',
    });
  });

  it('projects baseline activity facts with revision provenance', async () => {
    const snapshot = (await load()) as Record<string, any>;
    expect(snapshot.activities[0]).toMatchObject({
      activityId: ACTIVITY_ID,
      revision: 1,
      voided: false,
      appliedRevisionIds: [BASELINE_ID],
    });
    expect(snapshot.activities[0].facts).toEqual({
      activityKind: 'wash',
      precision: 'exact_day',
      status: 'active',
    });
  });

  it('projects a correction known by the recorded cutoff and keeps its provenance', async () => {
    apiMocks.listGuidanceActivityHistories.mockResolvedValue(page([{
      activityId: ACTIVITY_ID,
      revisions: [
        activityBaseline(),
        {
          id: CHANGE_ID,
          activityId: ACTIVITY_ID,
          sequence: 2,
          baseRevision: 1,
          kind: 'change',
          effectiveDate: { precision: 'day', value: '2026-07-01' },
          recordedAt: '2026-06-02T10:00:00.000Z',
          source: 'user-reported',
          patch: { activityKind: 'styling' },
        },
        activityCorrection(),
      ],
    }]));
    const snapshot = (await load()) as Record<string, any>;
    expect(snapshot.completeness.activities).toBe('complete');
    expect(snapshot.activities[0]).toMatchObject({ revision: 3, appliedRevisionIds: [CORRECTION_ID, BASELINE_ID] });
    expect(snapshot.activities[0].facts.activityKind).toBe('other');
  });

  it('cannot project a correction recorded after the cutoff', async () => {
    const lateCorrection = activityCorrection({ recordedAt: '2026-10-11T09:00:06.000Z' });
    apiMocks.listGuidanceActivityHistories.mockImplementation((effectiveAsOf: string, recordedAsOf: string) => {
      const revisions = [activityBaseline(), lateCorrection].filter(
        revision => Date.parse(revision.recordedAt) <= Date.parse(recordedAsOf),
      );
      return Promise.resolve(page([{ activityId: ACTIVITY_ID, revisions }]));
    });
    const snapshot = (await load()) as Record<string, any>;
    expect(apiMocks.listGuidanceActivityHistories).toHaveBeenCalledWith(AS_OF_DATE, LOADED_AT, {
      limit: 100,
      cursor: null,
    });
    expect(snapshot.activities[0]).toMatchObject({ revision: 1, appliedRevisionIds: [BASELINE_ID] });
    expect(snapshot.activities[0].facts.activityKind).toBe('wash');
  });

  it('projects a void to empty facts and keeps the void revision provenance', async () => {
    apiMocks.listGuidanceActivityHistories.mockResolvedValue(page([{
      activityId: ACTIVITY_ID,
      revisions: [
        activityBaseline(),
        {
          id: VOID_ID,
          activityId: ACTIVITY_ID,
          sequence: 2,
          baseRevision: 1,
          kind: 'void',
          effectiveDate: { precision: 'day', value: '2026-06-01' },
          recordedAt: '2026-10-11T09:00:04.000Z',
          source: 'user-reported',
          patch: {},
          voidReason: 'duplicate entry',
        },
      ],
    }]));
    const snapshot = (await load()) as Record<string, any>;
    expect(snapshot.activities[0]).toMatchObject({
      revision: 2,
      voided: true,
      facts: {},
      appliedRevisionIds: [VOID_ID],
    });
  });

  it('fails closed on ambiguous projection without returning partial activities', async () => {
    apiMocks.listGuidanceActivityHistories.mockResolvedValue(page([{
      activityId: ACTIVITY_ID,
      revisions: [
        activityBaseline({ effectiveDate: { precision: 'month', value: '2026-06' } }),
        {
          id: CORRECTION_ID,
          activityId: ACTIVITY_ID,
          sequence: 2,
          baseRevision: 1,
          kind: 'change',
          effectiveDate: { precision: 'month', value: '2026-06' },
          recordedAt: '2026-06-15T10:00:00.000Z',
          source: 'user-estimated',
          patch: { notes: 'possible conflicting value' },
        },
      ],
    }]));
    const snapshot = (await load()) as Record<string, any>;
    expect(snapshot.completeness.activities).toBe('failed');
    expect(snapshot.activities).toEqual([]);
  });
});

describe('guidance snapshot cancellation', () => {
  it.each(['loadPassport', 'loadServices', 'listGuidanceActivityHistories', 'getUserTool'] as const)
    ('propagates a source AbortError from %s instead of generating from partial records', async source => {
      apiMocks[source].mockRejectedValue(Object.assign(new Error('source cancelled'), { name: 'AbortError' }));
      await expect(load()).rejects.toMatchObject({ name: 'AbortError' });
    });
  it('propagates an abort and applies no later result', async () => {
    const controller = new AbortController();
    apiMocks.listUserProducts.mockImplementation(
      () =>
        new Promise(resolve => {
          controller.abort();
          setTimeout(() => resolve(page([productSummary()])), 1);
        }),
    );
    await expect(loadGuidanceSnapshot(OWNER, AS_OF, LOADED_AT, controller.signal)).rejects.toThrow();
  });

  it('propagates cancellation during activity history loading', async () => {
    const controller = new AbortController();
    apiMocks.listGuidanceActivityHistories.mockImplementation(() => {
      controller.abort();
      return Promise.resolve(page([{ activityId: ACTIVITY_ID, revisions: [activityBaseline()] }]));
    });
    await expect(loadGuidanceSnapshot(OWNER, AS_OF, LOADED_AT, controller.signal)).rejects.toThrow();
  });

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      loadGuidanceSnapshot(OWNER, AS_OF, LOADED_AT, controller.signal),
    ).rejects.toThrow();
    expect(apiMocks.listUserProducts).not.toHaveBeenCalled();
  });
});

describe('guidance snapshot incomplete-source boundaries', () => {
  it.each([null, 'network unavailable'])('marks primitive passport failures incomplete: %s', async error => {
    apiMocks.loadPassport.mockRejectedValue(error);
    const snapshot = await loadGuidanceSnapshot(OWNER, AS_OF, LOADED_AT);
    expect(snapshot.completeness.passport).toBe('failed');
    expect(snapshot.passportFacts).toEqual({});
  });
  it('keeps scalar facts and drops structured passport values', async () => {
    apiMocks.loadPassport.mockResolvedValue({ projection: { values: { text: 'known', count: 2, confirmed: false, missing: null, nested: { x: 1 } } } });
    const snapshot = await loadGuidanceSnapshot(OWNER, AS_OF, LOADED_AT);
    expect(snapshot.passportFacts).toEqual({ text: 'known', count: 2, confirmed: false, missing: null });
  });
  it('keeps missing service facts unknown rather than inventing an effective date', async () => {
    apiMocks.loadServices.mockResolvedValue(page([serviceSummary({ facts: null })]));
    const snapshot = await loadGuidanceSnapshot(OWNER, AS_OF, LOADED_AT);
    expect(snapshot.services[0]).toMatchObject({ facts: {}, effectiveStart: null });
    expect(snapshot.completeness.services).toBe('complete');
  });
  it('marks a failed service read incomplete without losing other sources', async () => {
    apiMocks.loadServices.mockRejectedValue(new Error('service unavailable'));
    const snapshot = await loadGuidanceSnapshot(OWNER, AS_OF, LOADED_AT);
    expect(snapshot.completeness.services).toBe('failed');
    expect(snapshot.services).toEqual([]);
    expect(snapshot.completeness.products).toBe('complete');
  });
  it('marks disappearing details incomplete instead of treating them as an empty shelf', async () => {
    apiMocks.getUserProduct.mockResolvedValue(null);
    const snapshot = await loadGuidanceSnapshot(OWNER, AS_OF, LOADED_AT);
    expect(snapshot.completeness.products).toBe('failed');
    expect(snapshot.products).toEqual([]);
  });
  it('uses record identity for missing and empty item labels', async () => {
    apiMocks.getUserProduct.mockResolvedValue({ ...productSummary(), versionId: null, manualName: '' });
    apiMocks.getUserTool.mockResolvedValue({ ...toolSummary(), versionId: null, manualModel: undefined });
    const snapshot = await loadGuidanceSnapshot(OWNER, AS_OF, LOADED_AT);
    expect(snapshot.products[0].name).toBe(`Recorded item ${PRODUCT_ID}`);
    expect(snapshot.tools[0].name).toBe(`Recorded item ${TOOL_ID}`);
  });
  it('marks repeated small pages truncated when the page ceiling is exhausted', async () => {
    apiMocks.loadServices.mockResolvedValue(page([], { cursor: 'never ends' }));
    const snapshot = await loadGuidanceSnapshot(OWNER, AS_OF, LOADED_AT);
    expect(snapshot.completeness.services).toBe('truncated');
    expect(snapshot.services).toEqual([]);
    expect(apiMocks.loadServices).toHaveBeenCalledTimes(5);
  });
});
