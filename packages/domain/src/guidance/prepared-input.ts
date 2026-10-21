import type { CurrentConditionInput } from '../current-condition.ts';
import type { FactValue } from '../recommendations/types.ts';
import type { ServiceZone } from '../services.ts';
import { knownSettingTemperatures } from '../tools.ts';
import { PreparedGuidanceInputSchema } from './schemas.ts';
import type {
  GuidanceGoal,
  GuidanceSnapshot,
  GuidanceSourceItem,
  GuidanceToolItem,
  GuidanceToolOwnerFacts,
  PreparedActivity,
  PreparedBaseline,
  PreparedConcernAnswer,
  PreparedEffectiveFact,
  PreparedGuidanceInput,
  PreparedHeatEvent,
  PreparedOwnerItem,
  PreparedOwnerTool,
  PreparedService,
  PreparedToolFacts,
  ReviewedGuidanceBundle,
} from './types.ts';

/**
 * Builds the one prepared guidance input from what was recorded. Pure: no
 * clock, no environment, no randomness. It copies and orders recorded values
 * and derives nothing: a wattage never becomes a temperature, a tool name never
 * becomes a heat method, a product name or category never becomes a capability,
 * and a partial name never becomes an identity. A value nobody recorded stays
 * recorded as missing.
 *
 * The result is parsed through its own strict schema, which fixes the key order
 * and freezes it, so the same inputs always serialise to the same bytes.
 */

const compareText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

const zoneKey = (zone: ServiceZone): string => `${zone.region}:${zone.segment}`;

function sortedZones(zones: readonly ServiceZone[] | undefined): ServiceZone[] {
  return [...(zones ?? [])]
    .map(({ region, segment }) => ({ region, segment }))
    .sort((left, right) => compareText(zoneKey(left), zoneKey(right)));
}

function sortedRecord(facts: Readonly<Record<string, FactValue>>): Record<string, FactValue> {
  const sorted: Record<string, FactValue> = {};
  for (const key of Object.keys(facts).sort()) sorted[key] = facts[key];
  return sorted;
}

function baselineOf(value: FactValue | undefined): PreparedBaseline {
  if (value === undefined || value === null) return { state: 'not_recorded', value: null };
  if (value === 'unknown') return { state: 'unknown', value };
  return { state: 'recorded', value };
}

function concernAnswer(condition: CurrentConditionInput | null, concern: 'reported-damage' | 'heat-concern'): PreparedConcernAnswer {
  if (condition === null) return 'not_answered';
  if (condition.concerns.includes(concern)) return 'reported';
  if (condition.concerns.length === 1 && condition.concerns[0] === 'none') return 'none';
  return 'not_answered';
}

/**
 * One fact where the durable Passport baseline and the temporary check-in meet.
 * A check-in answer governs this one request; a question it did not answer
 * leaves the recorded baseline governing. Nothing here is written back.
 */
function effectiveFact(
  dimension: PreparedEffectiveFact['dimension'],
  baseline: PreparedBaseline,
  current: PreparedConcernAnswer,
): PreparedEffectiveFact {
  const effective = current !== 'not_answered' ? 'current' : baseline.state === 'not_recorded' ? 'not_recorded' : 'baseline';
  return { dimension, baseline, current, effective, overridden: current !== 'not_answered' && baseline.state === 'recorded' };
}

function toolFacts(owner: GuidanceToolOwnerFacts | undefined): PreparedToolFacts {
  const facts = owner ?? { wattageWatts: null, adjustableTemp: null, settings: null, heatMethods: null };
  return {
    wattageWatts: facts.wattageWatts,
    adjustableTemp: facts.adjustableTemp ?? 'not_answered',
    settings: {
      state: facts.settings === null ? 'not_answered' : facts.settings.state,
      // Saved order is the owner's; the prepared input's order is canonical.
      recordedTemperatures: knownSettingTemperatures(facts).sort(
        (left, right) => compareText(left.label, right.label) || compareText(left.unit, right.unit) || left.value - right.value,
      ),
    },
    heatMethods: {
      state: facts.heatMethods === null ? 'not_answered' : facts.heatMethods.state,
      methods: facts.heatMethods?.state === 'recorded' ? [...facts.heatMethods.methods] : [],
    },
  };
}

function ownerItem(item: GuidanceSourceItem, bundle: ReviewedGuidanceBundle, kind: 'product' | 'tool'): PreparedOwnerItem {
  const base = { ownerItemId: item.ownerItemId, name: item.name };
  if (item.versionId === null) {
    return { ...base, identity: 'manual', versionId: null, review: 'not_applicable', verifiedCapabilities: [], satisfiesExactCapability: false };
  }
  const entry = bundle.capabilities.find(candidate => candidate.kind === kind && candidate.versionId === item.versionId);
  if (entry === undefined) {
    return { ...base, identity: 'exact', versionId: item.versionId, review: 'not_reviewed', verifiedCapabilities: [], satisfiesExactCapability: false };
  }
  if (entry.status !== 'published') {
    return { ...base, identity: 'exact', versionId: item.versionId, review: 'withdrawn', verifiedCapabilities: [], satisfiesExactCapability: false };
  }
  const verifiedCapabilities = [...entry.verifiedCapabilities].sort(compareText);
  return {
    ...base,
    identity: 'exact',
    versionId: item.versionId,
    review: 'reviewed',
    verifiedCapabilities,
    satisfiesExactCapability: verifiedCapabilities.length > 0,
  };
}

const byOwnerItemId = (left: { readonly ownerItemId: string }, right: { readonly ownerItemId: string }): number =>
  compareText(left.ownerItemId, right.ownerItemId);

function availableOnly<T extends GuidanceSourceItem>(items: readonly T[]): T[] {
  return items.filter(item => item.availability === 'available').sort(byOwnerItemId);
}

const ACTIVITY_KINDS = ['wash', 'styling', 'other'] as const;
const ACTIVITY_PRECISIONS = ['exact_day', 'exact_month', 'exact_year', 'unknown'] as const;

function enumFact<T extends string>(value: FactValue | undefined, allowed: readonly T[]): T | null {
  return allowed.find(entry => entry === value) ?? null;
}

function activities(snapshot: GuidanceSnapshot): PreparedActivity[] {
  return snapshot.activities
    .filter(activity => !activity.voided)
    .map(activity => ({
      activityId: activity.activityId,
      kind: enumFact(activity.facts.activityKind, ACTIVITY_KINDS),
      precision: enumFact(activity.facts.precision, ACTIVITY_PRECISIONS),
    }))
    .sort((left, right) => compareText(left.activityId, right.activityId));
}

function chemicalServices(snapshot: GuidanceSnapshot): PreparedService[] {
  return snapshot.services
    .map(service => ({
      serviceId: service.serviceId,
      presence: service.currentPresence,
      effectiveStart: service.effectiveStart,
      zones: sortedZones(service.zones),
    }))
    .sort((left, right) => compareText(left.serviceId, right.serviceId));
}

function heatHistory(snapshot: GuidanceSnapshot): PreparedHeatEvent[] {
  const events: PreparedHeatEvent[] = [];
  for (const service of snapshot.services) {
    const heat = service.heat;
    if (heat === undefined || heat === null) continue;
    events.push({
      serviceId: service.serviceId,
      method: heat.method,
      temperatureC: heat.temperatureC ?? null,
      passes: heat.passes ?? null,
      durationMinutes: heat.durationMinutes ?? null,
      source: heat.source,
      zones: sortedZones(service.zones),
    });
  }
  return events.sort((left, right) => compareText(left.serviceId, right.serviceId));
}

export interface BuildPreparedInput {
  readonly snapshot: GuidanceSnapshot;
  readonly bundle: ReviewedGuidanceBundle;
  readonly goal: GuidanceGoal;
  /** The normalized check-in for this request only, or `null` when none was given. */
  readonly condition: CurrentConditionInput | null;
}

export function buildPreparedInput(input: BuildPreparedInput): PreparedGuidanceInput {
  const { snapshot, bundle, goal, condition } = input;
  const completeness = Object.fromEntries(
    (Object.keys(snapshot.completeness) as (keyof typeof snapshot.completeness)[])
      .sort(compareText)
      .map(source => [source, snapshot.completeness[source]]),
  );
  const tools: PreparedOwnerTool[] = availableOnly<GuidanceToolItem>(snapshot.tools).map(item => ({
    ...ownerItem(item, bundle, 'tool'),
    ownerFacts: toolFacts(item.ownerFacts),
  }));
  return PreparedGuidanceInputSchema.parse({
    schemaVersion: 1,
    goal: { id: goal.id, label: goal.label },
    availableMinutes: condition === null ? null : condition.availableMinutes,
    passport: { facts: sortedRecord(snapshot.passportFacts) },
    currentCondition:
      condition === null
        ? null
        : {
            observedAt: condition.observedAt,
            concerns: [...condition.concerns],
            explicitNone: condition.concerns.length === 1 && condition.concerns[0] === 'none',
            zones: sortedZones(condition.zones),
            zoneConcerns: (condition.zoneConcerns ?? [])
              .map(entry => ({ zone: { ...entry.zone }, concerns: [...entry.concerns].sort(compareText) }))
              .sort((left, right) => compareText(zoneKey(left.zone), zoneKey(right.zone))),
          },
    effectiveFacts: [
      effectiveFact('damage', baselineOf(snapshot.passportFacts.damageObservation), concernAnswer(condition, 'reported-damage')),
      effectiveFact('heat', baselineOf(snapshot.passportFacts.heatPreference), concernAnswer(condition, 'heat-concern')),
    ],
    chemicalServices: chemicalServices(snapshot),
    heatHistory: heatHistory(snapshot),
    activities: activities(snapshot),
    products: availableOnly(snapshot.products).map(item => ownerItem(item, bundle, 'product')),
    tools,
    completeness,
  });
}
