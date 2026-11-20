import * as Crypto from 'expo-crypto';

import { generateProtocol, validatePublishedBundle } from '../../../../packages/domain/src/index';
import { CHECKED_IN_CAPABILITY_REVIEW } from './capability-review';
import { CHECKED_IN_EVIDENCE_REGISTRY } from './evidence-registry';
import { loadGuidanceSnapshot } from './guidance-snapshot';
import { CURRENT_REVIEWED_BUNDLE } from './reviewed-bundle';
import {
  generateTodayGuidanceFromDependencies,
  type TodayGuidanceDependencies,
  type TodayGuidanceRequest,
  type TodayGuidanceResult,
} from './today-guidance-core';

export { isClientPersistableGuidanceResult } from './today-guidance-core';
export type {
  GuidanceProvenance,
  GuidanceSetupGaps,
  TodayGuidanceDependencies,
  TodayGuidanceRequest,
  TodayGuidanceResult,
} from './today-guidance-core';

/** Mobile adapters for the pure Today pipeline. */
export const defaultGuidanceDependencies: TodayGuidanceDependencies = {
  loadSnapshot: loadGuidanceSnapshot,
  generateProtocol,
  currentBundle: () => CURRENT_REVIEWED_BUNDLE,
  evidenceRegistry: () => CHECKED_IN_EVIDENCE_REGISTRY,
  capabilityReview: () => CHECKED_IN_CAPABILITY_REVIEW,
  validateBundle: validatePublishedBundle,
  hashText: text =>
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text, {
      encoding: Crypto.CryptoEncoding.HEX,
    }),
};

export function generateTodayGuidance(
  request: TodayGuidanceRequest,
  dependencies: TodayGuidanceDependencies = defaultGuidanceDependencies,
): Promise<TodayGuidanceResult> {
  return generateTodayGuidanceFromDependencies(request, dependencies);
}
