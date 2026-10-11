import type {
  FactValue,
  ProductCandidate,
  RecommendationContext,
  ToolCandidate,
} from '../recommendations/types.ts';
import type {
  GuidanceGap,
  GuidanceGoal,
  GuidanceGoalId,
  GuidancePreparation,
  GuidanceSnapshot,
  GuidanceSourceItem,
  ReviewedCapabilityEntry,
  ReviewedGuidanceBundle,
} from './types.ts';

/**
 * Pure adapter between an owner's records and the deterministic engine.
 *
 * Two rules govern everything below:
 *
 * 1. A product or tool acquires capabilities only from an *exact* registry
 *    match on `(kind, versionId)` in a published bundle. A missing, null,
 *    withdrawn or differently versioned item acquires nothing and is left
 *    out of the candidate lists entirely rather than being emitted with an
 *    invented version.
 *
 * 2. A missing safety fact stops preparation and becomes a setup gap. It is
 *    never converted into a generic fallback protocol.
 */

export interface PrepareGuidanceInput {
  readonly snapshot: GuidanceSnapshot;
  readonly bundle: ReviewedGuidanceBundle;
  readonly goalId: GuidanceGoalId;
  readonly requestId: string;
  readonly asOf: string;
}

const GAP_ORDER: Readonly<Record<GuidanceGap['kind'], number>> = {
  hair_profile: 0,
  service_presence: 1,
  product_version: 2,
  product_capability: 3,
  tool_version: 4,
  tool_capability: 5,
  source_incomplete: 6,
  reviewed_content: 7,
};

/**
 * Gaps are identified by `(kind, subject)`: one missing fact or one service
 * is one gap, however its wording is phrased. That makes the sort total, so
 * the comparator needs no tie-break arm.
 */
function compareGaps(left: GuidanceGap, right: GuidanceGap): number {
  const byKind = GAP_ORDER[left.kind] - GAP_ORDER[right.kind];
  if (byKind !== 0) return byKind;
  const leftSubject = left.subject ?? '';
  const rightSubject = right.subject ?? '';
  return leftSubject < rightSubject ? -1 : 1;
}

function unavailable(reason: 'snapshot_incomplete' | 'no_supported_goal'): GuidancePreparation {
  return { status: 'unavailable', reason };
}

function needsSetup(gaps: readonly GuidanceGap[]): GuidancePreparation {
  // One gap per (kind, subject): repeated findings about the same missing
  // fact collapse instead of stacking near-identical setup actions.
  const unique = new Map<string, GuidanceGap>();
  for (const gap of gaps) {
    const key = `${gap.kind}\u0000${gap.subject ?? ''}`;
    if (!unique.has(key)) unique.set(key, gap);
  }
  return { status: 'needs_setup', missing: [...unique.values()].sort(compareGaps) };
}

function isIncomplete(snapshot: GuidanceSnapshot): boolean {
  const sources = Object.keys(snapshot.completeness) as (keyof typeof snapshot.completeness)[];
  return sources.some(source => snapshot.completeness[source] !== 'complete');
}

function findEntry(
  entries: readonly ReviewedCapabilityEntry[],
  kind: ReviewedCapabilityEntry['kind'],
  versionId: string | null,
): ReviewedCapabilityEntry | undefined {
  if (versionId === null) return undefined;
  return entries.find(entry => entry.kind === kind && entry.versionId === versionId);
}

function isAvailable(item: GuidanceSourceItem): boolean {
  return item.availability === 'available';
}

function buildProducts(
  items: readonly GuidanceSourceItem[],
  bundle: ReviewedGuidanceBundle,
): ProductCandidate[] {
  const products: ProductCandidate[] = [];
  for (const item of items) {
    const entry = findEntry(bundle.capabilities, 'product', item.versionId);
    if (entry === undefined || entry.status !== 'published') continue;
    products.push({
      productId: item.ownerItemId,
      versionId: entry.versionId,
      name: item.name,
      owned: true,
      available: isAvailable(item),
      verifiedCapabilities: [...entry.verifiedCapabilities],
      unknownCapabilities: [],
    });
  }
  return products;
}

function buildTools(
  items: readonly GuidanceSourceItem[],
  bundle: ReviewedGuidanceBundle,
): ToolCandidate[] {
  const tools: ToolCandidate[] = [];
  for (const item of items) {
    const entry = findEntry(bundle.capabilities, 'tool', item.versionId);
    if (entry === undefined || entry.status !== 'published') continue;
    tools.push({
      toolId: item.ownerItemId,
      versionId: entry.versionId,
      name: item.name,
      available: isAvailable(item),
      verifiedCapabilities: [...entry.verifiedCapabilities],
    });
  }
  return tools;
}

function profileFacts(snapshot: GuidanceSnapshot): Record<string, FactValue> {
  return { ...snapshot.passportFacts };
}

function historyFacts(snapshot: GuidanceSnapshot): Record<string, FactValue> {
  const facts: Record<string, FactValue> = {};
  const activities = [...snapshot.activities].sort((left, right) =>
    left.activityId < right.activityId ? -1 : left.activityId > right.activityId ? 1 : 0,
  );
  for (const activity of activities) {
    if (activity.voided) continue;
    for (const key of Object.keys(activity.facts).sort()) {
      facts[key] = activity.facts[key];
    }
  }
  return facts;
}

function serviceFacts(snapshot: GuidanceSnapshot): Record<string, FactValue> {
  const facts: Record<string, FactValue> = {};
  for (const service of snapshot.services) {
    for (const [key, value] of Object.entries(service.facts)) {
      facts[key] = value;
    }
    facts.presence = service.currentPresence;
  }
  return facts;
}

function profileGaps(snapshot: GuidanceSnapshot, goal: GuidanceGoal): GuidanceGap[] {
  const gaps: GuidanceGap[] = [];
  for (const fact of goal.requiredProfileFacts) {
    const value = snapshot.passportFacts[fact];
    if (value === undefined || value === null) {
      gaps.push({
        kind: 'hair_profile',
        detail: `My Hair is missing '${fact}', which this goal needs before reviewed guidance can be produced.`,
        subject: fact,
      });
    }
  }
  return gaps;
}

function serviceGaps(snapshot: GuidanceSnapshot): GuidanceGap[] {
  const gaps: GuidanceGap[] = [];
  for (const service of snapshot.services) {
    if (service.currentPresence === 'unknown') {
      gaps.push({
        kind: 'service_presence',
        detail: `We cannot confirm whether the effect of '${service.serviceId}' is still present. Record that in My Hair → Services.`,
        subject: service.serviceId,
      });
      continue;
    }
    if (service.currentPresence === 'present') {
      gaps.push({
        kind: 'service_presence',
        detail: `A recorded chemical service ('${service.serviceId}') is marked as still present. No reviewed rule currently covers guidance while it is present, so ordinary guidance is stopped.`,
        subject: service.serviceId,
      });
    }
  }
  return gaps;
}

/**
 * Owner item ids are unique within a snapshot, so the two-way comparison is
 * a total order over any real input.
 */
function sortById<T extends { readonly ownerItemId: string }>(items: readonly T[]): T[] {
  return [...items].sort((left, right) =>
    left.ownerItemId < right.ownerItemId ? -1 : 1,
  );
}

function buildContext(
  input: PrepareGuidanceInput,
  snapshot: GuidanceSnapshot,
  bundle: ReviewedGuidanceBundle,
  products: readonly ProductCandidate[],
  tools: readonly ToolCandidate[],
): RecommendationContext {
  return {
    requestId: input.requestId,
    asOf: input.asOf,
    goal: input.goalId,
    profileFacts: profileFacts(snapshot),
    products: [...products],
    tools: [...tools],
    historyFacts: historyFacts(snapshot),
    environmentFacts: serviceFacts(snapshot),
    rules: [...bundle.rules],
  };
}

/**
 * Prepares a safe, deterministic engine context from an owner snapshot and a
 * published reviewed bundle. Never throws for an ordinary unsafe or
 * incomplete situation: it returns `unavailable` or `needs_setup` instead.
 */
export function prepareGuidance(input: PrepareGuidanceInput): GuidancePreparation {
  if (isIncomplete(input.snapshot)) return unavailable('snapshot_incomplete');
  const goal = input.bundle.goals.find(entry => entry.id === input.goalId);
  if (goal === undefined) return unavailable('no_supported_goal');

  const gaps = [...profileGaps(input.snapshot, goal), ...serviceGaps(input.snapshot)];
  if (gaps.length > 0) return needsSetup(gaps);

  const products = buildProducts(sortById(input.snapshot.products), input.bundle);
  const tools = buildTools(sortById(input.snapshot.tools), input.bundle);

  return {
    status: 'ready',
    context: buildContext(input, input.snapshot, input.bundle, products, tools),
    bundleId: input.bundle.bundleId,
    bundleVersion: input.bundle.version,
  };
}
