import {
  EffectiveDateSchema,
  GuidanceSnapshotSchema,
  type EffectiveDate,
  type GuidanceActivityFact,
  type GuidanceServiceFact,
  type GuidanceSnapshot,
  type GuidanceSourceCompleteness,
  type GuidanceSourceItem,
} from '../../../../packages/domain/src/index';
import { getActivity, listActivities } from '../activity-api';
import { loadPassport } from '../passport-api';
import { loadServices } from '../services-api';
import { getUserProduct, listUserProducts } from '../shelf-api';
import { getUserTool, listUserTools } from '../tool-api';

/**
 * Bounded, owner-scoped snapshot loader for Today.
 *
 * Today may only prepare guidance from a *complete* view of the owner's
 * records. Anything the loader cannot fully read is reported in
 * `completeness`, and preparation refuses to generate from an incomplete
 * source. That is why a failed or truncated read is never downgraded to an
 * empty-but-complete list: an empty list looks like "you own nothing", which
 * would be a lie about the owner's records.
 *
 * The loader reads only through the existing owner-scoped API functions. It
 * adds no query, no RPC and no cross-owner path.
 */

export const SNAPSHOT_PAGE_SIZE = 100;

/** Hard ceiling on items read from one source before the source is truncated. */
export const SNAPSHOT_SOURCE_CEILING = 500;

/** Concurrent detail requests per source. */
export const SNAPSHOT_DETAIL_CONCURRENCY = 4;

const MAX_PAGES = Math.ceil(SNAPSHOT_SOURCE_CEILING / SNAPSHOT_PAGE_SIZE);

type FactRecord = Readonly<Record<string, string | number | boolean | null>>;

interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor: unknown;
}

function isAbort(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const name = (error as { name?: unknown }).name;
  return name === 'AbortError';
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted === true) {
    const error = new Error('Guidance snapshot load was aborted');
    error.name = 'AbortError';
    throw error;
  }
}

/** Runs `worker` over `items` with at most `limit` promises in flight. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

/**
 * Copies a source record's values into a flat fact record, keeping only the
 * primitive values the engine can compare. Structured values (dates, zones,
 * nested objects) are not flattened into invented scalars.
 */
function scalarFacts(values: unknown): FactRecord {
  if (typeof values !== 'object' || values === null) return {};
  const copied: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(values as Record<string, unknown>)) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      copied[key] = value;
    } else if (value === null) {
      copied[key] = null;
    }
  }
  return copied;
}

function activityFacts(values: unknown): FactRecord {
  const facts = scalarFacts(values);
  return Object.fromEntries(
    Object.entries(facts).filter(([key]) =>
      key === 'activityKind' || key === 'precision' || key === 'status'),
  );
}

/**
 * Copies a service's recorded effective date, preserving its precision. A
 * month-precision date stays '2026-06': widening it to a day would invent a
 * fact the owner never recorded.
 */
function effectiveStartOf(value: unknown): EffectiveDate | null {
  const parsed = EffectiveDateSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/**
 * Paginates one list endpoint to exhaustion, or to the source ceiling.
 * Returns the accumulated items and whether the ceiling stopped the read.
 */
async function collectPages<T>(
  signal: AbortSignal | undefined,
  fetchPage: (cursor: unknown) => Promise<Page<T>>,
): Promise<{ items: T[]; truncated: boolean }> {
  const items: T[] = [];
  let cursor: unknown = null;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    throwIfAborted(signal);
    const result = await fetchPage(cursor);
    for (const item of result.items) items.push(item);
    if (items.length >= SNAPSHOT_SOURCE_CEILING) {
      return { items: items.slice(0, SNAPSHOT_SOURCE_CEILING), truncated: true };
    }
    if (result.nextCursor === null || result.nextCursor === undefined) {
      return { items, truncated: false };
    }
    cursor = result.nextCursor;
  }
  return { items, truncated: true };
}

async function loadPassportFacts(
  asOfDate: string,
  signal?: AbortSignal,
): Promise<{ facts: FactRecord; completeness: GuidanceSourceCompleteness }> {
  try {
    throwIfAborted(signal);
    const record = await loadPassport(asOfDate);
    if (record === null) return { facts: {}, completeness: 'missing' };
    return { facts: scalarFacts(record.projection.values), completeness: 'complete' };
  } catch (error) {
    if (isAbort(error)) throw error;
    return { facts: {}, completeness: 'failed' };
  }
}

async function loadServiceFacts(
  asOfDate: string,
  signal?: AbortSignal,
): Promise<{ items: GuidanceServiceFact[]; completeness: GuidanceSourceCompleteness }> {
  try {
    const { items, truncated } = await collectPages(signal, cursor =>
      loadServices(asOfDate, { limit: SNAPSHOT_PAGE_SIZE, cursor: cursor as never }),
    );
    const facts: GuidanceServiceFact[] = items.map(summary => ({
      serviceId: summary.serviceId,
      currentPresence: summary.currentPresence,
      effectiveStart: effectiveStartOf(summary.facts?.occurredOn ?? null),
      facts: scalarFacts(summary.facts),
    }));
    return { items: facts, completeness: truncated ? 'truncated' : 'complete' };
  } catch (error) {
    if (isAbort(error)) throw error;
    return { items: [], completeness: 'failed' };
  }
}

async function loadActivityFacts(
  asOfDate: string,
  signal?: AbortSignal,
): Promise<{ items: GuidanceActivityFact[]; completeness: GuidanceSourceCompleteness }> {
  try {
    const { items, truncated } = await collectPages(signal, cursor =>
      listActivities(asOfDate, { limit: SNAPSHOT_PAGE_SIZE, cursor: cursor as never }),
    );
    const details = await mapWithConcurrency(
      items,
      SNAPSHOT_DETAIL_CONCURRENCY,
      async item => {
        throwIfAborted(signal);
        const detail = await getActivity(item.id);
        if (detail === null) throw new Error(`Activity ${item.id} disappeared while loading`);
        if (detail.revision !== item.revision) {
          throw new Error(`Activity ${item.id} changed while loading`);
        }
        const latest = detail.revisions[detail.revisions.length - 1];
        const patch = latest === undefined ? undefined : (latest as { patch?: unknown }).patch;
        return {
          activityId: detail.id,
          revision: detail.revision,
          voided: detail.voided,
          appliedRevisionIds: [],
          facts: activityFacts(patch),
        } satisfies GuidanceActivityFact;
      },
    );
    return { items: details, completeness: truncated ? 'truncated' : 'complete' };
  } catch (error) {
    if (isAbort(error)) throw error;
    return { items: [], completeness: 'failed' };
  }
}

interface DetailRow {
  readonly id: string;
  readonly revision: number;
  readonly availability: 'available' | 'out_of_stock' | 'archived';
  readonly versionId: string | null;
  readonly label: string | null;
}

interface OwnedItemSummary {
  readonly id: string;
  readonly revision: number;
  readonly availability: 'available' | 'out_of_stock' | 'archived';
  readonly manualName?: string | null;
  readonly manualModel?: string | null;
}

interface OwnedItemDetail extends OwnedItemSummary {
  readonly versionId: string | null;
}

interface OwnedItemCursor {
  readonly updatedAt: string;
  readonly id: string;
}

type OwnedItemLister = (options?: {
  limit?: number;
  cursor?: OwnedItemCursor | null;
}) => Promise<{ items: readonly OwnedItemSummary[]; nextCursor: OwnedItemCursor | null }>;

type OwnedItemDetailLoader = (id: string) => Promise<OwnedItemDetail | null>;

async function loadOwnedItems(
  list: OwnedItemLister,
  detail: OwnedItemDetailLoader,
  labelKey: 'manualName' | 'manualModel',
  signal?: AbortSignal,
): Promise<{ items: GuidanceSourceItem[]; completeness: GuidanceSourceCompleteness }> {
  try {
    const { items, truncated } = await collectPages(signal, cursor =>
      list({ limit: SNAPSHOT_PAGE_SIZE, cursor: cursor as never }),
    );
    const details = await mapWithConcurrency(
      items,
      SNAPSHOT_DETAIL_CONCURRENCY,
      async item => {
        throwIfAborted(signal);
        const loaded = await detail(item.id);
        if (loaded === null) throw new Error(`Owned item ${item.id} disappeared while loading`);
        return {
          id: loaded.id,
          revision: loaded.revision,
          availability: loaded.availability,
          versionId: loaded.versionId,
          label: loaded[labelKey] ?? null,
        } satisfies DetailRow;
      },
    );
    const source: GuidanceSourceItem[] = details.map(row => ({
      ownerItemId: row.id,
      versionId: row.versionId,
      name: row.label === null || row.label === '' ? `Recorded item ${row.id}` : row.label,
      availability: row.availability,
      revision: row.revision,
    }));
    source.sort((left, right) => (left.ownerItemId < right.ownerItemId ? -1 : 1));
    return { items: source, completeness: truncated ? 'truncated' : 'complete' };
  } catch (error) {
    if (isAbort(error)) throw error;
    return { items: [], completeness: 'failed' };
  }
}

/**
 * Loads every existing record source Today depends on, as one owner-scoped
 * snapshot. `asOf` and `loadedAt` are supplied by the caller so the result
 * is reproducible; the loader never reads the clock.
 */
export async function loadGuidanceSnapshot(
  ownerId: string,
  asOf: string,
  loadedAt: string,
  signal?: AbortSignal,
): Promise<GuidanceSnapshot> {
  throwIfAborted(signal);
  const asOfDate = asOf.slice(0, 10);

  const [passport, services, activities, products, tools] = await Promise.all([
    loadPassportFacts(asOfDate, signal),
    loadServiceFacts(asOfDate, signal),
    loadActivityFacts(asOfDate, signal),
    loadOwnedItems(listUserProducts, getUserProduct, 'manualName', signal),
    loadOwnedItems(listUserTools, getUserTool, 'manualModel', signal),
  ]);

  throwIfAborted(signal);

  return GuidanceSnapshotSchema.parse({
    ownerId,
    asOf,
    loadedAt,
    passportFacts: passport.facts,
    services: services.items,
    activities: activities.items,
    products: products.items,
    tools: tools.items,
    completeness: {
      passport: passport.completeness,
      services: services.completeness,
      activities: activities.completeness,
      products: products.completeness,
      tools: tools.completeness,
    },
  });
}
