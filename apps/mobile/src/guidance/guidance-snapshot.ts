import type { GuidanceSnapshot } from '../../../../packages/domain/src/index';

import { loadPassport } from '../passport-api';
import { loadServices } from '../services-api';
import { getUserProduct, listUserProducts } from '../shelf-api';
import { getUserTool, listUserTools } from '../tool-api';
import { listGuidanceActivityHistories } from './guidance-activity-api';
import {
  loadGuidanceSnapshotFromSources,
  SNAPSHOT_DETAIL_CONCURRENCY,
  SNAPSHOT_PAGE_SIZE,
  SNAPSHOT_SOURCE_CEILING,
} from './guidance-snapshot-core';

export { SNAPSHOT_DETAIL_CONCURRENCY, SNAPSHOT_PAGE_SIZE, SNAPSHOT_SOURCE_CEILING };

/** Mobile adapter for the pure, injectable snapshot loader. */
export function loadGuidanceSnapshot(
  ownerId: string,
  asOf: string,
  loadedAt: string,
  signal?: AbortSignal,
): Promise<GuidanceSnapshot> {
  return loadGuidanceSnapshotFromSources(ownerId, asOf, loadedAt, {
    loadPassport,
    loadServices,
    listGuidanceActivityHistories,
    listUserProducts,
    getUserProduct,
    listUserTools,
    getUserTool,
  }, signal);
}
