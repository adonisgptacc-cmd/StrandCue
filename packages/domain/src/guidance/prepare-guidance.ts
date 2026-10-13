import { z } from 'zod';

import type {
  FactValue,
  ProductCandidate,
  RecommendationContext,
  ToolCandidate,
} from '../recommendations/types.ts';
import {
  normalizeCurrentCondition,
  type CurrentConditionInput,
} from '../current-condition.ts';
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
  /**
   * Raw temporary current-condition check-in for this request only. Absent
   * (`undefined`) keeps the legacy path byte-identical: no `current.*`
   * facts and no new gaps. When present it is normalized inside preparation
   * with an explicit `now` (never the wall-clock default); an unusable
   * payload becomes stable `current_condition` gaps, never stored writes.
   */
  readonly currentCondition?: unknown;
  /**
   * Reference time for check-in validation. Always passed explicitly to
   * `normalizeCurrentCondition`; defaults to `asOf` when omitted so the
   * fallback stays deterministic.
   */
  readonly now?: Date;
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
  current_condition: 8,
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
  const activeActivities = snapshot.activities.filter(activity => !activity.voided);
  const keys = new Set(activeActivities.flatMap(activity => Object.keys(activity.facts)));
  for (const key of [...keys].sort()) {
    const values = activeActivities
      .filter(activity => Object.prototype.hasOwnProperty.call(activity.facts, key))
      .map(activity => activity.facts[key]);
    const [first, ...remaining] = values;
    if (remaining.every(value => value === first)) facts[key] = first;
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

/**
 * Explicit allowlist mapping a normalized check-in onto namespaced facts.
 * Only these names may enter the engine context: `saveToPassport` is a
 * control flag rather than a fact (HP-06: nothing here writes to the
 * Passport), structured `zones` are not flattened into invented scalars
 * (mirroring the snapshot loader's scalar-only rule), and free text or
 * unrecognized keys never survive normalization, so they cannot appear here.
 * Commercial variables (EN-09) have no entry by construction.
 */
function currentConditionFacts(checkIn: CurrentConditionInput): Record<string, FactValue> {
  const facts: Record<string, FactValue> = {
    'current.observedAt': checkIn.observedAt,
    'current.goal': checkIn.goal,
    'current.availableMinutes': checkIn.availableMinutes,
  };
  for (const concern of checkIn.concerns) {
    // `none` is a definitive absence of concerns and `unknown` never reaches
    // here (it becomes a gap below): neither is a matchable concern fact.
    if (concern === 'none' || concern === 'unknown') continue;
    facts[`current.concerns.${concern}`] = true;
  }
  return facts;
}

function currentConditionGap(subject: string, detail: string): GuidanceGap {
  return { kind: 'current_condition', detail, subject };
}

/**
 * Converts a check-in validation failure into stable targeted gaps. One gap
 * per reported issue, subjecting the offending `current.*` field; details are
 * fixed strings so no raw value (and no free text) leaks into the output.
 * Anything this function does not recognize is rethrown: only known
 * validation failures become gaps.
 */
function rejectionGaps(error: unknown): GuidanceGap[] {
  if (error instanceof z.ZodError) {
    const gaps = error.issues.map(issue => {
      const field = typeof issue.path[0] === 'string' ? issue.path[0] : 'checkIn';
      const subject = `current.${field}`;
      return currentConditionGap(
        subject,
        `The temporary check-in answer for '${subject}' was not usable. Review that check-in answer and try again.`,
      );
    });
    if (gaps.length > 0) return gaps;
  }
  if (error instanceof RangeError && /observedAt/.test(error.message)) {
    return [
      currentConditionGap(
        'current.observedAt',
        'The temporary check-in observation time is in the future. Record an observation time that is not later than now.',
      ),
    ];
  }
  throw error;
}

function resolveCurrentCondition(
  raw: unknown,
  now: Date,
): { facts: Record<string, FactValue> } | { gaps: GuidanceGap[] } {
  let normalized: CurrentConditionInput;
  try {
    normalized = normalizeCurrentCondition(raw, now);
  } catch (error) {
    return { gaps: rejectionGaps(error) };
  }
  if (normalized.concerns.length === 1 && normalized.concerns[0] === 'unknown') {
    return {
      gaps: [
        currentConditionGap(
          'current.concerns',
          "No current condition was reported ('unknown'). Describe what is true today, or skip the check-in to use the stored My Hair facts.",
        ),
      ],
    };
  }
  return { facts: currentConditionFacts(normalized) };
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
  currentFacts: Readonly<Record<string, FactValue>>,
): RecommendationContext {
  return {
    requestId: input.requestId,
    asOf: input.asOf,
    goal: input.goalId,
    profileFacts: profileFacts(snapshot),
    products: [...products],
    tools: [...tools],
    historyFacts: historyFacts(snapshot),
    // Temporary check-in facts ride in the transient environment namespace and
    // win on collision (first-write-wins reads environment first), so they
    // govern this request only. The stored snapshot is never rewritten.
    environmentFacts: { ...serviceFacts(snapshot), ...currentFacts },
    rules: [...bundle.rules],
  };
}

/**
 * Prepares a safe, deterministic engine context from an owner snapshot and a
 * published reviewed bundle. Never throws for an ordinary unsafe or
 * incomplete situation: it returns `unavailable` or `needs_setup` instead.
 * A temporary check-in (`currentCondition`) is normalized with an explicit
 * `now` and merged per-request only; the stored Passport snapshot is never
 * modified, and concerns never manufacture product capabilities.
 */
export function prepareGuidance(input: PrepareGuidanceInput): GuidancePreparation {
  if (isIncomplete(input.snapshot)) return unavailable('snapshot_incomplete');
  const goal = input.bundle.goals.find(entry => entry.id === input.goalId);
  if (goal === undefined) return unavailable('no_supported_goal');

  const gaps = [...profileGaps(input.snapshot, goal), ...serviceGaps(input.snapshot)];
  let currentFacts: Record<string, FactValue> = {};
  if (input.currentCondition !== undefined) {
    // `asOf` keeps the fallback deterministic; callers pass `now`
    // explicitly. normalizeCurrentCondition is always invoked with an
    // explicit instant, never its wall-clock default.
    const resolved = resolveCurrentCondition(
      input.currentCondition,
      input.now ?? new Date(input.asOf),
    );
    if ('gaps' in resolved) gaps.push(...resolved.gaps);
    else currentFacts = resolved.facts;
  }
  if (gaps.length > 0) return needsSetup(gaps);

  const products = buildProducts(sortById(input.snapshot.products), input.bundle);
  const tools = buildTools(sortById(input.snapshot.tools), input.bundle);

  return {
    status: 'ready',
    context: buildContext(input, input.snapshot, input.bundle, products, tools, currentFacts),
    bundleId: input.bundle.bundleId,
    bundleVersion: input.bundle.version,
  };
}
