import * as Crypto from 'expo-crypto';

import {
  generateProtocol,
  prepareGuidance,
  RECOMMENDATION_ENGINE_VERSION,
  ReviewedContentError,
  validatePublishedBundle,
  type GuidanceGap,
  type GuidanceGoalId,
  type GuidanceSnapshot,
  type ProtocolDecision,
  type ReviewedGuidanceBundle,
} from '../../../../packages/domain/src/index';
import { loadGuidanceSnapshot } from './guidance-snapshot';
import { CURRENT_REVIEWED_BUNDLE } from './reviewed-bundle';

/**
 * Today orchestration.
 *
 * This service is the only place that joins records, reviewed content and the
 * deterministic engine. It never invents a capability, never runs the engine
 * on anything other than a `ready` preparation, and never substitutes cached
 * or generic advice when a source fails.
 *
 * The clock is never read here: `asOf`, `loadedAt` and `requestId` come from
 * the request, so the same request always yields the same result.
 */

export interface TodayGuidanceRequest {
  readonly ownerId: string;
  readonly goalId: GuidanceGoalId;
  readonly requestId: string;
  readonly asOf: string;
  readonly loadedAt: string;
  readonly signal?: AbortSignal;
}

/**
 * Identity carried by every generated decision, so a stored run can be
 * reproduced exactly.
 */
export interface GuidanceProvenance {
  readonly requestId: string;
  readonly asOf: string;
  readonly engineVersion: string;
  readonly bundleId: string;
  readonly bundleVersion: string;
  readonly inputFingerprint: string;
}

export type TodayGuidanceResult =
  | { readonly status: 'needs_setup'; readonly missing: readonly GuidanceGap[] }
  | { readonly status: 'content_pending' }
  | ({ readonly status: 'ready'; readonly decision: ProtocolDecision } & GuidanceProvenance)
  | ({ readonly status: 'needs_input'; readonly decision: ProtocolDecision } & GuidanceProvenance)
  | ({ readonly status: 'rule_conflict'; readonly decision: ProtocolDecision } & GuidanceProvenance)
  | ({ readonly status: 'unsupported'; readonly decision: ProtocolDecision } & GuidanceProvenance)
  | { readonly status: 'source_error'; readonly detail: string };

export interface TodayGuidanceDependencies {
  readonly loadSnapshot: (
    ownerId: string,
    asOf: string,
    loadedAt: string,
    signal?: AbortSignal,
  ) => Promise<GuidanceSnapshot>;
  readonly generateProtocol: (context: unknown) => ProtocolDecision;
  readonly currentBundle: () => unknown;
  readonly validateBundle: (bundle: unknown, now: string) => ReviewedGuidanceBundle;
  readonly hashText: (text: string) => string | Promise<string>;
}

function isAbort(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { name?: unknown }).name === 'AbortError'
  );
}

const SOURCE_ERROR =
  'Your records could not be read completely. Nothing was generated and no earlier plan was reused.';

/**
 * Production dependencies. `hashText` uses the platform SHA-256 so the
 * fingerprint stored with a run is reproducible on device.
 */
export const defaultGuidanceDependencies: TodayGuidanceDependencies = {
  loadSnapshot: loadGuidanceSnapshot,
  generateProtocol,
  currentBundle: () => CURRENT_REVIEWED_BUNDLE,
  validateBundle: validatePublishedBundle,
  hashText: text =>
    Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, text, {
      encoding: Crypto.CryptoEncoding.HEX,
    }),
};

/**
 * Runs the full Today pipeline: load a complete snapshot, gate the reviewed
 * content, prepare a safe context, and — only when preparation is `ready` —
 * run the deterministic engine.
 */
export async function generateTodayGuidance(
  request: TodayGuidanceRequest,
  dependencies: TodayGuidanceDependencies = defaultGuidanceDependencies,
): Promise<TodayGuidanceResult> {
  let snapshot: GuidanceSnapshot;
  try {
    snapshot = await dependencies.loadSnapshot(
      request.ownerId,
      request.asOf,
      request.loadedAt,
      request.signal,
    );
  } catch (error) {
    if (isAbort(error)) throw error;
    return { status: 'source_error', detail: SOURCE_ERROR };
  }

  let bundle: ReviewedGuidanceBundle;
  try {
    bundle = dependencies.validateBundle(dependencies.currentBundle(), request.asOf);
  } catch (error) {
    if (isAbort(error)) throw error;
    // The registry is draft, withdrawn or malformed: no guidance is possible.
    return { status: 'content_pending' };
  }

  const preparation = prepareGuidance({
    snapshot,
    bundle,
    goalId: request.goalId,
    requestId: request.requestId,
    asOf: request.asOf,
  });

  if (preparation.status === 'unavailable') {
    return { status: 'source_error', detail: SOURCE_ERROR };
  }
  if (preparation.status === 'needs_setup') {
    return { status: 'needs_setup', missing: preparation.missing };
  }

  let decision: ProtocolDecision;
  try {
    decision = dependencies.generateProtocol(preparation.context);
  } catch (error) {
    if (isAbort(error)) throw error;
    if (error instanceof ReviewedContentError) return { status: 'content_pending' };
    return { status: 'source_error', detail: SOURCE_ERROR };
  }

  const provenance: GuidanceProvenance = {
    requestId: request.requestId,
    asOf: request.asOf,
    engineVersion: RECOMMENDATION_ENGINE_VERSION,
    bundleId: preparation.bundleId,
    bundleVersion: preparation.bundleVersion,
    inputFingerprint: await dependencies.hashText(JSON.stringify(preparation.context)),
  };

  switch (decision.status) {
    case 'ready':
      return { status: 'ready', decision, ...provenance };
    case 'needs_input':
      return { status: 'needs_input', decision, ...provenance };
    case 'rule_conflict':
      return { status: 'rule_conflict', decision, ...provenance };
    default:
      return { status: 'unsupported', decision, ...provenance };
  }
}