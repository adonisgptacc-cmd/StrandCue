import {
  prepareGuidance,
  RECOMMENDATION_ENGINE_VERSION,
  ReviewedContentError,
  type GuidanceGap,
  type GuidanceGoalId,
  type GuidanceIncompleteSource,
  type GuidanceSnapshot,
  type PreparedGuidanceInput,
  type ProtocolDecision,
  type RecommendationContext,
  type ReviewedGuidanceBundle,
} from '../../../../packages/domain/src/index';

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
  /**
   * Raw temporary current-condition check-in for this request only. Absent
   * (`undefined`) keeps the legacy path byte-identical: no `current.*`
   * facts, no new gaps, and the same normalized input and fingerprint for
   * the same records. When present it is normalized inside preparation with
   * an explicit `now` (never the wall-clock default); an unusable payload
   * becomes stable `current_condition` gaps, never stored writes.
   */
  readonly currentCondition?: unknown;
  /**
   * Reference time for check-in validation as an ISO string. Defaults to
   * `asOf` when omitted so the fallback stays deterministic.
   */
  readonly now?: string;
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
  /** Exact normalized context hashed by inputFingerprint and persisted with the decision. */
  readonly input: RecommendationContext;
  /**
   * The one prepared input this run was built from: Passport baseline, the
   * temporary check-in, chemical and heat history, zones and the available Shelf
   * and Tools. Never hashed or persisted with the run, so the fingerprint above
   * still describes the engine context alone.
   */
  readonly prepared: PreparedGuidanceInput;
}

/**
 * Owner setup that does not block a plan. It never changes a decision and it
 * is never persisted: it is the owner's own next step, offered because they
 * asked for a plan.
 */
export interface GuidanceSetupGaps {
  readonly setup?: readonly GuidanceGap[];
}

export type TodayGuidanceResult =
  | ({ readonly status: 'needs_setup'; readonly missing: readonly GuidanceGap[] } & GuidanceSetupGaps)
  | { readonly status: 'content_pending' }
  | ({ readonly status: 'ready'; readonly decision: ProtocolDecision } & GuidanceProvenance & GuidanceSetupGaps)
  | ({ readonly status: 'needs_input'; readonly decision: ProtocolDecision } & GuidanceProvenance & GuidanceSetupGaps)
  | ({ readonly status: 'rule_conflict'; readonly decision: ProtocolDecision } & GuidanceProvenance & GuidanceSetupGaps)
  | ({ readonly status: 'unsupported'; readonly decision: ProtocolDecision } & GuidanceProvenance & GuidanceSetupGaps)
  | {
      readonly status: 'source_error';
      readonly detail: string;
      /** Which areas could not be read, when known, so the owner can be told where to retry. */
      readonly incompleteSources?: readonly GuidanceIncompleteSource[];
    };

export interface TodayGuidanceDependencies {
  readonly loadSnapshot: (
    ownerId: string,
    asOf: string,
    loadedAt: string,
    signal?: AbortSignal,
  ) => Promise<GuidanceSnapshot>;
  readonly generateProtocol: (context: unknown) => ProtocolDecision;
  readonly currentBundle: () => unknown;
  readonly evidenceRegistry: () => unknown;
  readonly capabilityReview: () => unknown;
  readonly validateBundle: (
    bundle: unknown,
    evidenceRegistry: unknown,
    capabilityReview: unknown,
    now: string,
  ) => ReviewedGuidanceBundle;
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
 * SC-001 client-persistable gate. `ready` is executable and may only be
 * persisted through the dedicated trusted-writer path (mutator only), so a
 * ready result must never be submitted over the authenticated persistence
 * path — the narrowed `recordRecommendationRun` contract rejects it before
 * any RPC call. Every other service outcome is a non-executable,
 * fail-closed status the client may persist. Draft guidance keeps producing
 * `content_pending`, which stays persistable here.
 */
export function isClientPersistableGuidanceResult(result: TodayGuidanceResult): boolean {
  return result.status !== 'ready';
}

/**
 * Runs the full Today pipeline: load a complete snapshot, gate the reviewed
 * content, prepare a safe context, and — only when preparation is `ready` —
 * run the deterministic engine.
 */
export async function generateTodayGuidanceFromDependencies(
  request: TodayGuidanceRequest,
  dependencies: TodayGuidanceDependencies,
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
    bundle = dependencies.validateBundle(
      dependencies.currentBundle(),
      dependencies.evidenceRegistry(),
      dependencies.capabilityReview(),
      request.asOf,
    );
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
    currentCondition: request.currentCondition,
    // Explicit instant, never the wall-clock default: `asOf` keeps the
    // fallback deterministic when the caller passes no reference time.
    now: request.now === undefined ? new Date(request.asOf) : new Date(request.now),
  });

  if (preparation.status === 'unavailable') {
    // A goal the reviewed bundle does not define is a content limitation, not
    // a broken record: the owner read their information, and reviewed
    // guidance for their situation is not published. It is never reported as
    // a failed read, and it never sends the owner to change their records.
    if (preparation.reason === 'no_supported_goal') return { status: 'content_pending' };
    return preparation.incompleteSources === undefined
      ? { status: 'source_error', detail: SOURCE_ERROR }
      : { status: 'source_error', detail: SOURCE_ERROR, incompleteSources: preparation.incompleteSources };
  }
  if (preparation.status === 'needs_setup') {
    return { status: 'needs_setup', missing: preparation.missing, setup: preparation.setup };
  }

  let decision: ProtocolDecision;
  try {
    decision = dependencies.generateProtocol(preparation.context);
  } catch (error) {
    if (isAbort(error)) throw error;
    if (error instanceof ReviewedContentError) return { status: 'content_pending' };
    return { status: 'source_error', detail: SOURCE_ERROR };
  }

  const normalizedInput = preparation.context;
  const provenance: GuidanceProvenance = {
    requestId: request.requestId,
    asOf: request.asOf,
    engineVersion: RECOMMENDATION_ENGINE_VERSION,
    bundleId: preparation.bundleId,
    bundleVersion: preparation.bundleVersion,
    inputFingerprint: await dependencies.hashText(JSON.stringify(normalizedInput)),
    input: normalizedInput,
    prepared: preparation.prepared,
  };

  switch (decision.status) {
    case 'ready':
      return { status: 'ready', decision, ...provenance, setup: preparation.setup };
    case 'needs_input':
      return { status: 'needs_input', decision, ...provenance, setup: preparation.setup };
    case 'rule_conflict':
      return { status: 'rule_conflict', decision, ...provenance, setup: preparation.setup };
    default:
      return { status: 'unsupported', decision, ...provenance, setup: preparation.setup };
  }
}
