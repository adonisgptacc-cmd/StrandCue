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
import { buildPreparedInput } from './prepared-input.ts';
import type {
  GuidanceGap,
  GuidanceGapReason,
  GuidanceGapState,
  GuidanceGoal,
  GuidanceGoalId,
  GuidanceIncompleteSource,
  GuidancePreparation,
  GuidanceSnapshot,
  PreparedGuidanceInput,
  GuidanceServiceFact,
  GuidanceSourceItem,
  GuidanceSourceName,
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
  // A real comparator: equal subjects compare equal, so the order is total
  // and does not depend on the sort's internals.
  if (leftSubject < rightSubject) return -1;
  if (leftSubject > rightSubject) return 1;
  return 0;
}

function unavailable(reason: 'no_supported_goal'): GuidancePreparation {
  return { status: 'unavailable', reason };
}

/** Names the sources that could not be used, in a fixed order, and says why for each. */
function incompleteSources(snapshot: GuidanceSnapshot): GuidanceIncompleteSource[] {
  const sources = Object.keys(snapshot.completeness) as GuidanceSourceName[];
  const found: GuidanceIncompleteSource[] = [];
  for (const source of sources.sort()) {
    const state = snapshot.completeness[source];
    if (state !== 'complete') found.push({ source, state });
  }
  return found;
}

function needsSetup(
  gaps: readonly GuidanceGap[],
  setup: readonly GuidanceGap[] = [],
): GuidancePreparation {
  // One gap per (kind, subject): repeated findings about the same missing
  // fact collapse instead of stacking near-identical setup actions.
  const unique = new Map<string, GuidanceGap>();
  for (const gap of gaps) {
    const key = `${gap.kind}\u0000${gap.subject ?? ''}`;
    if (!unique.has(key)) unique.set(key, gap);
  }
  return { status: 'needs_setup', missing: [...unique.values()].sort(compareGaps), setup };
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
 * Only these names may enter the engine context: the check-in carries no
 * persistence flag (HP-06: answers are session-only and nothing here writes
 * to the Passport), structured `zones` are not flattened into invented
 * scalars (mirroring the snapshot loader's scalar-only rule), and free text
 * or unrecognized keys never survive normalization, so they cannot appear
 * here. Commercial variables (EN-09) have no entry by construction.
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

function currentConditionGap(
  subject: string,
  detail: string,
  state: GuidanceGapState,
  reason: GuidanceGapReason,
): GuidanceGap {
  return { kind: 'current_condition', detail, subject, state, destination: 'today_check_in', reason };
}

/** Reads the value a validation issue points at, so "left out" can be told from "not usable". */
function valueAt(raw: unknown, path: readonly PropertyKey[]): unknown {
  let value = raw;
  for (const key of path) {
    if (value === null || typeof value !== 'object') return undefined;
    value = (value as Record<PropertyKey, unknown>)[key];
  }
  return value;
}

/**
 * The state of a rejected check-in answer: one that was left out is `missing`,
 * one that disagrees with another answer is `contradictory`, and anything the
 * check-in does not accept is `unsupported`.
 */
function rejectionState(issue: z.core.$ZodIssue, raw: unknown): GuidanceGapState {
  if (issue.code === 'custom') return 'contradictory';
  if (issue.code === 'invalid_type' && valueAt(raw, issue.path) === undefined) return 'missing';
  return 'unsupported';
}

/** The machine-readable reason that goes with a rejected check-in answer. */
function rejectionReason(state: GuidanceGapState): GuidanceGapReason {
  if (state === 'contradictory') return 'check_in_contradictory';
  if (state === 'missing') return 'check_in_missing';
  return 'check_in_unsupported';
}

/** What each check-in answer is called to the owner; the field path itself is never shown. */
const CHECK_IN_ANSWER_NAMES: Readonly<Record<string, string>> = {
  concerns: 'what you notice today',
  availableMinutes: 'the time you have today',
  observedAt: 'when you checked in',
  goal: 'your goal',
  zones: 'where you notice it',
  zoneConcerns: 'where you notice each thing',
};

function rejectionDetail(field: string, state: GuidanceGapState): string {
  const name = Object.hasOwn(CHECK_IN_ANSWER_NAMES, field) ? CHECK_IN_ANSWER_NAMES[field] : 'your check-in';
  if (state === 'missing') return `Add ${name} in today's check-in.`;
  if (state === 'contradictory') return `Your answers about ${name} do not agree. Change them in today's check-in.`;
  return `Today's check-in cannot use your answer about ${name}. Choose from the options shown.`;
}

/**
 * Converts a check-in validation failure into stable targeted gaps. One gap
 * per reported issue, subjecting the offending `current.*` field; details are
 * fixed strings so no raw value (and no free text) leaks into the output.
 * Anything this function does not recognize is rethrown: only known
 * validation failures become gaps.
 */
function rejectionGaps(error: unknown, raw: unknown): GuidanceGap[] {
  if (error instanceof z.ZodError) {
    const gaps = error.issues.map(issue => {
      const field = typeof issue.path[0] === 'string' ? issue.path[0] : 'checkIn';
      const state = rejectionState(issue, raw);
      return currentConditionGap(
        `current.${field}`,
        rejectionDetail(field, state),
        state,
        rejectionReason(state),
      );
    });
    if (gaps.length > 0) return gaps;
  }
  if (error instanceof RangeError && /observedAt/.test(error.message)) {
    return [
      currentConditionGap(
        'current.observedAt',
        "The check-in time is in the future. Set it to now or earlier in today's check-in.",
        'contradictory',
        'check_in_contradictory',
      ),
    ];
  }
  throw error;
}

function resolveCurrentCondition(
  raw: unknown,
  now: Date,
): { normalized: CurrentConditionInput } | { gaps: GuidanceGap[] } {
  let normalized: CurrentConditionInput;
  try {
    normalized = normalizeCurrentCondition(raw, now);
  } catch (error) {
    return { gaps: rejectionGaps(error, raw) };
  }
  if (normalized.concerns.length === 1 && normalized.concerns[0] === 'unknown') {
    return {
      gaps: [
        currentConditionGap(
          'current.concerns',
          'You chose "I am not sure". Pick what you notice today, or skip the check-in and use what is saved in My Hair.',
          'unknown',
          'check_in_unknown',
        ),
      ],
    };
  }
  return { normalized };
}

/** Plain names for the Passport answers a goal can require; any other fact gets a generic phrase. */
const PROFILE_FACT_NAMES: Readonly<Record<string, string>> = {
  naturalPattern: 'your natural hair pattern',
  pattern: 'your natural hair pattern',
  strandDiameter: 'your strand thickness',
  diameter: 'your strand thickness',
  density: 'your hair density',
  lengthCm: 'your recorded hair length',
  lengthMeasurement: 'your recorded hair length',
  damageObservation: 'what you have noticed about damage',
  heatPreference: 'how you like to use heat',
  concerns: 'what concerns you have',
  goals: 'what you want to achieve',
};

function profileGaps(snapshot: GuidanceSnapshot, goal: GuidanceGoal): GuidanceGap[] {
  const gaps: GuidanceGap[] = [];
  for (const fact of goal.requiredProfileFacts) {
    const value = snapshot.passportFacts[fact];
    const name = Object.hasOwn(PROFILE_FACT_NAMES, fact)
      ? PROFILE_FACT_NAMES[fact]
      : 'an answer this goal needs';
    if (value === undefined || value === null) {
      gaps.push({
        kind: 'hair_profile',
        detail: `Add ${name} in My Hair so your plan can use it.`,
        subject: fact,
        state: 'missing',
        destination: 'my_hair',
        reason: 'passport_fact_missing',
        subjectLabel: name,
      });
      continue;
    }
    // An explicit "unknown" is an answer the owner gave, not an absent one.
    // Where a rule genuinely needs a known answer it is still unresolved, so
    // it becomes its own gap instead of being read as a recorded value.
    if (value === 'unknown') {
      gaps.push({
        kind: 'hair_profile',
        detail: `You recorded ${name} as not sure. Add it when you know, or choose a different goal.`,
        subject: fact,
        state: 'unknown',
        destination: 'my_hair',
        reason: 'passport_fact_unknown',
        subjectLabel: name,
      });
    }
  }
  return gaps;
}

/** The recorded chemical-service types, in the owner's own words. */
const SERVICE_TYPE_WORDS: Readonly<Record<string, string>> = {
  'permanent-colour': 'permanent colour',
  'demi-permanent': 'demi-permanent colour',
  'semi-permanent': 'semi-permanent colour',
  highlights: 'highlights',
  balayage: 'balayage',
  'bleach-or-lightener': 'bleach or lightener',
  'colour-remover': 'colour remover',
  keratin: 'keratin',
  'brazilian-smoothing': 'brazilian smoothing',
  nanoplasty: 'nanoplasty',
  relaxer: 'relaxer',
  texturiser: 'texturising',
  perm: 'perm',
  'chemical-straightening': 'chemical straightening',
  other: 'other chemical',
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

const ORDINAL_NAMES = [
  'first', 'second', 'third', 'fourth', 'fifth', 'sixth',
  'seventh', 'eighth', 'ninth', 'tenth',
] as const;

/** The recorded date of a service, in plain words, with its precision kept. */
function serviceDateWords(service: GuidanceServiceFact): string | null {
  const date = service.effectiveStart;
  if (date === null) return null;
  if (date.precision === 'day') {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.value);
    if (match === null) return null;
    const month = MONTH_NAMES[Number(match[2]) - 1];
    if (month === undefined) return null;
    return ` on ${Number(match[3])} ${month} ${match[1]}`;
  }
  if (date.precision === 'month') {
    const match = /^(\d{4})-(\d{2})$/.exec(date.value);
    if (match === null) return null;
    const month = MONTH_NAMES[Number(match[2]) - 1];
    if (month === undefined) return null;
    return ` in ${month} ${match[1]}`;
  }
  if (date.precision === 'year') return ` in ${date.value}`;
  return null;
}

/**
 * The safest owner-facing identity of a recorded service: what it was, and
 * when, and — only when nothing else can tell them apart — which one it was
 * in the order they were recorded. A record id is never part of it.
 */
function serviceLabel(service: GuidanceServiceFact, ordinal: number): string {
  const type = service.facts.serviceType;
  const typeWords = typeof type === 'string' && Object.hasOwn(SERVICE_TYPE_WORDS, type)
    ? SERVICE_TYPE_WORDS[type]
    : null;
  const other = service.facts.otherLabel;
  const otherWords =
    type === 'other' && typeof other === 'string' && other.trim() !== ''
      ? safeOwnerText(other)
      : null;
  const date = serviceDateWords(service);
  if (otherWords !== null) return `the ${otherWords} you recorded${date ?? ''}`;
  if (typeWords !== null) return `the ${typeWords} service you recorded${date ?? ''}`;
  if (date !== null) return `the chemical service you recorded${date}`;
  const word = ORDINAL_NAMES[ordinal] ?? `number ${ordinal + 1}`;
  return `the ${word} chemical service you recorded`;
}

/**
 * A record id in the owner's own words must never survive into a sentence.
 * The snapshot loader falls back to "Recorded item <id>" when the owner never
 * named something, so the id is taken out before the name can be shown.
 */
const ID_LIKE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/** Owner-entered text, trimmed of ids and clipped so it cannot flood a card. */
function safeOwnerText(value: string): string {
  return value.replace(ID_LIKE, '').replace(/\s+/g, ' ').trim().slice(0, 60);
}

/** The owner's own name for a product or tool, with any record id removed. */
function safeItemName(name: string): string {
  const cleaned = safeOwnerText(name);
  if (cleaned === '' || /^recorded item$/i.test(cleaned)) return 'an item you saved';
  return cleaned;
}

/** The owner's own words for how much of an item is left. */
const AVAILABILITY_WORDS: Readonly<Record<string, string>> = {
  available: 'available',
  low: 'running low',
  empty: 'empty',
  out_of_stock: 'out of stock',
  archived: 'archived',
};

function availabilityWords(availability: string): string {
  return Object.hasOwn(AVAILABILITY_WORDS, availability)
    ? AVAILABILITY_WORDS[availability]
    : 'not available';
}

/**
 * Services are ordered by the date they were recorded and then by their id,
 * so "the first recorded service" always means the same service for the same
 * records, whatever order the database returned them in.
 */
function servicesInRecordOrder(snapshot: GuidanceSnapshot): GuidanceServiceFact[] {
  return [...snapshot.services].sort((left, right) => {
    const leftDate = left.effectiveStart?.precision === 'unknown' ? null : left.effectiveStart?.value ?? null;
    const rightDate = right.effectiveStart?.precision === 'unknown' ? null : right.effectiveStart?.value ?? null;
    if (leftDate !== rightDate) {
      if (leftDate === null) return 1;
      if (rightDate === null) return -1;
      return leftDate < rightDate ? -1 : 1;
    }
    return left.serviceId < right.serviceId ? -1 : 1;
  });
}

function serviceGaps(snapshot: GuidanceSnapshot): GuidanceGap[] {
  const gaps: GuidanceGap[] = [];
  const ordered = servicesInRecordOrder(snapshot);
  ordered.forEach((service, index) => {
    const label = serviceLabel(service, index);
    if (service.currentPresence === 'unknown') {
      gaps.push({
        kind: 'service_presence',
        detail: `We cannot tell whether ${label} is still affecting your hair. Update it in My Hair under Services.`,
        subject: service.serviceId,
        state: 'unknown',
        destination: 'my_hair_services',
        reason: 'service_presence_unknown',
        subjectLabel: label,
      });
      return;
    }
    if (service.currentPresence === 'present') {
      gaps.push({
        kind: 'service_presence',
        detail: `We cannot show reviewed guidance while ${label} may still be affecting your hair. Update it in My Hair under Services.`,
        subject: service.serviceId,
        state: 'unsupported',
        destination: 'my_hair_services',
        reason: 'service_effect_unsupported',
        subjectLabel: label,
      });
    }
  });
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

/**
 * The capabilities a published reviewed rule requires. Only published rules
 * count: a withdrawn or draft rule asks for nothing, and nothing here may
 * invent a requirement the reviewed content never stated.
 */
function requiredCapabilities(bundle: ReviewedGuidanceBundle): readonly string[] {
  const names = new Set<string>();
  for (const rule of bundle.rules) {
    if (rule.status !== 'published') continue;
    for (const effect of rule.effects) {
      if (effect.kind === 'require_capability') names.add(effect.capability);
    }
  }
  return [...names].sort();
}

/** Whether a published rule restricts heat, and whether it names a temperature. */
function heatInstruction(bundle: ReviewedGuidanceBundle): { restricts: boolean; exact: boolean } {
  let restricts = false;
  let exact = false;
  for (const rule of bundle.rules) {
    if (rule.status !== 'published') continue;
    for (const effect of rule.effects) {
      if (effect.kind !== 'heat_restriction') continue;
      restricts = true;
      if (effect.maxTemperatureCelsius !== undefined) exact = true;
    }
  }
  return { restricts, exact };
}

/**
 * Owner setup that does not block a plan: recorded products and tools that
 * StrandCue cannot use yet, and the reason it cannot use them. These never
 * change a decision and never stop generation — they are the owner's own
 * next step, offered because they asked for a plan.
 */
function setupGaps(
  snapshot: GuidanceSnapshot,
  bundle: ReviewedGuidanceBundle,
): GuidanceGap[] {
  const gaps: GuidanceGap[] = [];
  const required = requiredCapabilities(bundle);
  const heat = heatInstruction(bundle);

  for (const product of sortById(snapshot.products)) {
    const label = safeItemName(product.name);
    if (product.availability !== 'available') {
      gaps.push({
        kind: 'product_version',
        detail: `Your ${label} is marked as ${availabilityWords(product.availability)}. Choose an available product in My Shelf.`,
        subject: product.ownerItemId,
        state: 'missing',
        destination: 'my_shelf',
        reason: 'product_unavailable',
        subjectLabel: label,
      });
      continue;
    }
    if (product.versionId === null) {
      if (required.length > 0) {
        gaps.push({
          kind: 'product_capability',
          detail: `Your ${label} is saved by hand, so StrandCue cannot check the exact version yet. Match it in My Shelf.`,
          subject: product.ownerItemId,
          state: 'unknown',
          destination: 'my_shelf',
          reason: 'product_manual_unmatched',
          subjectLabel: label,
        });
      }
      continue;
    }
    const entry = bundle.capabilities.find(
      candidate => candidate.kind === 'product' && candidate.versionId === product.versionId,
    );
    if (entry === undefined || entry.status !== 'published') {
      gaps.push({
        kind: 'product_capability',
        detail: `There is no published reviewed guidance for the exact version of your ${label} yet. Match it in My Shelf.`,
        subject: product.ownerItemId,
        state: 'unsupported',
        destination: 'my_shelf',
        reason: 'product_capability_unpublished',
        subjectLabel: label,
      });
    }
  }

  for (const tool of sortById(snapshot.tools)) {
    const label = safeItemName(tool.name);
    if (tool.availability !== 'available') {
      gaps.push({
        kind: 'tool_version',
        detail: `Your ${label} is marked as ${availabilityWords(tool.availability)}. Add an available tool in My Tools.`,
        subject: tool.ownerItemId,
        state: 'missing',
        destination: 'my_tools',
        reason: 'tool_unavailable',
        subjectLabel: label,
      });
      continue;
    }
    if (tool.versionId === null && required.length > 0) {
      gaps.push({
        kind: 'tool_capability',
        detail: `Your ${label} is saved by hand, so StrandCue cannot check the exact version yet. Match it in My Tools.`,
        subject: tool.ownerItemId,
        state: 'unknown',
        destination: 'my_tools',
        reason: 'tool_manual_unmatched',
        subjectLabel: label,
      });
    }
  }

  if (heat.restricts) {
    const available = snapshot.tools.filter(tool => tool.availability === 'available');
    if (available.length === 0) {
      gaps.push({
        kind: 'tool_capability',
        detail: 'No tool is recorded for the heat step this plan needs. Add the tool you use in My Tools.',
        subject: null,
        state: 'missing',
        destination: 'my_tools',
        reason: 'tool_not_recorded',
        subjectLabel: null,
      });
    }
    for (const tool of sortById(available)) {
      const label = safeItemName(tool.name);
      const facts = tool.ownerFacts;
      // An exact temperature is only ever read from what the owner recorded.
      // A wattage is a wattage: it never becomes a temperature, and a model
      // or a name never becomes a heat method.
      if (heat.exact && (facts === undefined || facts.settings === null || facts.settings.state !== 'recorded')) {
        gaps.push({
          kind: 'tool_capability',
          detail: `StrandCue cannot read the exact temperature you use with your ${label}. Add it in My Tools.`,
          subject: tool.ownerItemId,
          state: 'unknown',
          destination: 'my_tools',
          reason: 'tool_temperature_unknown',
          subjectLabel: label,
        });
      }
      if (facts === undefined || facts.heatMethods === null || facts.heatMethods.state !== 'recorded') {
        gaps.push({
          kind: 'tool_capability',
          detail: `StrandCue cannot read how you use heat with your ${label}. Add it in My Tools.`,
          subject: tool.ownerItemId,
          state: 'unknown',
          destination: 'my_tools',
          reason: 'tool_heat_method_unknown',
          subjectLabel: label,
        });
      }
    }
  }

  if (required.length > 0) {
    const provided = new Set<string>();
    for (const candidate of [
      ...buildProducts(sortById(snapshot.products), bundle),
      ...buildTools(sortById(snapshot.tools), bundle),
    ]) {
      if (!candidate.available) continue;
      for (const capability of candidate.verifiedCapabilities) provided.add(capability);
    }
    if (required.some(capability => !provided.has(capability))) {
      gaps.push({
        kind: 'product_capability',
        detail: 'Nothing you own provides what this plan needs. Review My Shelf, or add a product you already own.',
        subject: null,
        state: 'missing',
        destination: 'my_shelf',
        reason: 'product_no_candidate',
        subjectLabel: null,
      });
    }
  }

  return gaps.sort(compareGaps);
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
  const incomplete = incompleteSources(input.snapshot);
  if (incomplete.length > 0) {
    return { status: 'unavailable', reason: 'snapshot_incomplete', incompleteSources: incomplete };
  }
  const goal = input.bundle.goals.find(entry => entry.id === input.goalId);
  if (goal === undefined) return unavailable('no_supported_goal');

  const gaps = [...profileGaps(input.snapshot, goal), ...serviceGaps(input.snapshot)];
  let currentFacts: Record<string, FactValue> = {};
  let condition: CurrentConditionInput | null = null;
  if (input.currentCondition !== undefined) {
    // `asOf` keeps the fallback deterministic; callers pass `now`
    // explicitly. normalizeCurrentCondition is always invoked with an
    // explicit instant, never its wall-clock default.
    const resolved = resolveCurrentCondition(
      input.currentCondition,
      input.now ?? new Date(input.asOf),
    );
    if ('gaps' in resolved) gaps.push(...resolved.gaps);
    else {
      condition = resolved.normalized;
      currentFacts = currentConditionFacts(condition);
    }
  }
  const setup = setupGaps(input.snapshot, input.bundle);
  if (gaps.length > 0) return needsSetup(gaps, setup);

  const products = buildProducts(sortById(input.snapshot.products), input.bundle);
  const tools = buildTools(sortById(input.snapshot.tools), input.bundle);

  let prepared: PreparedGuidanceInput;
  try {
    prepared = buildPreparedInput({ snapshot: input.snapshot, bundle: input.bundle, goal, condition });
  } catch (error) {
    // A snapshot the prepared contract refuses (built outside the loader, which
    // validates it) is unusable: fail closed rather than throw at the caller.
    if (error instanceof z.ZodError) return { status: 'unavailable', reason: 'snapshot_incomplete' };
    throw error;
  }

  return {
    status: 'ready',
    context: buildContext(input, input.snapshot, input.bundle, products, tools, currentFacts),
    prepared,
    bundleId: input.bundle.bundleId,
    bundleVersion: input.bundle.version,
    setup,
  };
}
