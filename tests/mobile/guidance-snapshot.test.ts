import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadGuidanceSnapshot } from '../../apps/mobile/src/guidance/guidance-snapshot';

const apiMocks = vi.hoisted(() => ({
  loadPassport: vi.fn(),
  loadServices: vi.fn(),
  listActivities: vi.fn(),
  getActivity: vi.fn(),
  listUserProducts: vi.fn(),
  getUserProduct: vi.fn(),
  listUserTools: vi.fn(),
  getUserTool: vi.fn(),
}));

vi.mock('../../apps/mobile/src/passport-api', () => ({ loadPassport: apiMocks.loadPassport }));
vi.mock('../../apps/mobile/src/services-api', () => ({ loadServices: apiMocks.loadServices }));
vi.mock('../../apps/mobile/src/activity-api', () => ({
  listActivities: apiMocks.listActivities,
  getActivity: apiMocks.getActivity,
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
  apiMocks.listActivities.mockResolvedValue(page([{ id: ACTIVITY_ID, revision: 1 }]));
  apiMocks.getActivity.mockResolvedValue({
    id: ACTIVITY_ID,
    revision: 1,
    voided: false,
    revisions: [
      {
        id: 'cccccccc-0000-4000-8000-000000000099',
        kind: 'baseline',
        precision: 'exact_day',
        correctsId: null,
        voidReason: null,
        patch: { activityKind: 'wash', status: 'active' },
      },
    ],
  });
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
    apiMocks.listActivities
      .mockResolvedValueOnce(
        page([{ id: ACTIVITY_ID, revision: 1 }], { updatedAt: AS_OF, id: ACTIVITY_ID }),
      )
      .mockResolvedValueOnce(page([]));
    await load();
    expect(apiMocks.loadServices).toHaveBeenCalledTimes(2);
    expect(apiMocks.listActivities).toHaveBeenCalledTimes(2);
    expect(apiMocks.listActivities.mock.calls[0][0]).toBe(AS_OF_DATE);
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

  it('never reports a failed detail as complete', async () => {
    apiMocks.getActivity.mockRejectedValue(new Error('boom'));
    const snapshot = (await load()) as Record<string, any>;
    expect(snapshot.completeness.activities).toBe('failed');
    expect(snapshot.completeness.activities).not.toBe('complete');
  });

  it('rejects an activity detail changed after its list snapshot', async () => {
    apiMocks.getActivity.mockResolvedValue({
      id: ACTIVITY_ID,
      revision: 2,
      voided: false,
      revisions: [],
    });
    const snapshot = (await load()) as Record<string, any>;
    expect(snapshot.activities).toEqual([]);
    expect(snapshot.completeness.activities).toBe('failed');
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

  it('records activity facts and the void flag', async () => {
    const snapshot = (await load()) as Record<string, any>;
    expect(snapshot.activities[0]).toMatchObject({
      activityId: ACTIVITY_ID,
      revision: 1,
      voided: false,
    });
    expect(snapshot.activities[0].facts.activityKind).toBe('wash');
  });

  it('loads a notes-bearing activity with only allowed guidance facts', async () => {
    apiMocks.getActivity.mockResolvedValue({
      id: ACTIVITY_ID,
      revision: 1,
      voided: false,
      revisions: [{
        id: 'cccccccc-0000-4000-8000-000000000099',
        kind: 'baseline',
        precision: 'exact_day',
        correctsId: null,
        voidReason: null,
        patch: {
          activityKind: 'wash',
          precision: 'exact_day',
          status: 'active',
          notes: 'Sensitive wash notes',
          zones: [{ region: 'crown', segment: 'roots' }],
        },
      }],
    });

    const snapshot = (await load()) as Record<string, any>;
    expect(snapshot.completeness.activities).toBe('complete');
    expect(snapshot.activities[0].facts).toEqual({
      activityKind: 'wash',
      precision: 'exact_day',
      status: 'active',
    });
  });
});

describe('guidance snapshot cancellation', () => {
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

  it('rejects immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      loadGuidanceSnapshot(OWNER, AS_OF, LOADED_AT, controller.signal),
    ).rejects.toThrow();
    expect(apiMocks.listUserProducts).not.toHaveBeenCalled();
  });
});
