import type {
  EffectConflict,
  RecommendationEffect,
  RecommendationRule,
  RulesEvaluation,
} from './types.ts';

export interface AttributedRequire {
  readonly ruleRef: string;
  readonly capability: string;
}

export interface AttributedExclude {
  readonly ruleRef: string;
  readonly capability: string;
}

export interface AttributedOrder {
  readonly ruleRef: string;
  readonly before: string;
  readonly after: string;
}

export interface AttributedWait {
  readonly ruleRef: string;
  readonly durationSeconds: number;
}

export interface AttributedRinse {
  readonly ruleRef: string;
  readonly value: boolean;
}

export interface AttributedFrequency {
  readonly ruleRef: string;
  readonly unit: string;
  readonly min?: number;
  readonly max?: number;
}

export interface AttributedHeat {
  readonly ruleRef: string;
  readonly exposure: string;
  readonly prohibited: boolean;
  readonly maxTemperatureCelsius?: number;
}

export interface AttributedActivation {
  readonly ruleRef: string;
  readonly capability: string;
}

export interface HardEffectSet {
  readonly required: readonly AttributedRequire[];
  readonly excluded: readonly AttributedExclude[];
  readonly order: readonly AttributedOrder[];
  readonly waits: readonly AttributedWait[];
  readonly rinses: readonly AttributedRinse[];
  readonly frequencies: readonly AttributedFrequency[];
  readonly heat: readonly AttributedHeat[];
  readonly activations: readonly AttributedActivation[];
}

export interface AdvisoryPreference {
  readonly ruleRef: string;
  readonly capability: string;
  readonly polarity: 'prefer' | 'require' | 'exclude';
}

export interface AdvisoryNote {
  readonly ruleRef: string;
  readonly kind: string;
}

export interface CollectedEffects {
  readonly hard: HardEffectSet;
  readonly advisory: readonly AdvisoryPreference[];
  readonly advisoryNotes: readonly AdvisoryNote[];
  readonly conflicts: readonly EffectConflict[];
}

export function ruleRefOf(ruleId: string, versionId: string): string {
  return `${ruleId}@${versionId}`;
}

function distributeHardEffect(
  effect: RecommendationEffect,
  ruleRef: string,
  hard: {
    required: AttributedRequire[];
    excluded: AttributedExclude[];
    order: AttributedOrder[];
    waits: AttributedWait[];
    rinses: AttributedRinse[];
    frequencies: AttributedFrequency[];
    heat: AttributedHeat[];
    activations: AttributedActivation[];
  },
  advisory: AdvisoryPreference[],
): void {
  switch (effect.kind) {
    case 'require_capability':
      hard.required.push({ ruleRef, capability: effect.capability });
      break;
    case 'exclude_capability':
      hard.excluded.push({ ruleRef, capability: effect.capability });
      break;
    case 'order_before':
    case 'order_after':
      hard.order.push({ ruleRef, before: effect.before, after: effect.after });
      break;
    case 'wait':
      hard.waits.push({ ruleRef, durationSeconds: effect.durationSeconds });
      break;
    case 'rinse':
      hard.rinses.push({ ruleRef, value: effect.value });
      break;
    case 'frequency': {
      hard.frequencies.push({ ruleRef, unit: effect.unit, min: effect.min, max: effect.max });
      break;
    }
    case 'heat_restriction': {
      hard.heat.push({
        ruleRef,
        exposure: effect.exposure,
        prohibited: effect.prohibited,
        maxTemperatureCelsius: effect.maxTemperatureCelsius,
      });
      break;
    }
    case 'activation':
      hard.activations.push({ ruleRef, capability: effect.capability });
      break;
    case 'prefer_capability':
      advisory.push({ ruleRef, capability: effect.capability, polarity: 'prefer' });
      break;
  }
}

function distributeAdvisoryEffect(
  effect: RecommendationEffect,
  ruleRef: string,
  advisory: AdvisoryPreference[],
  notes: AdvisoryNote[],
): void {
  if (effect.kind === 'require_capability') {
    advisory.push({ ruleRef, capability: effect.capability, polarity: 'require' });
  } else if (effect.kind === 'exclude_capability') {
    advisory.push({ ruleRef, capability: effect.capability, polarity: 'exclude' });
  } else if (effect.kind === 'prefer_capability') {
    advisory.push({ ruleRef, capability: effect.capability, polarity: 'prefer' });
  } else {
    notes.push({ ruleRef, kind: effect.kind });
  }
}

function detectCapabilityConflicts(hard: HardEffectSet): EffectConflict[] {
  const excludedBy = new Map<string, string[]>();
  for (const entry of hard.excluded) {
    excludedBy.set(entry.capability, [...(excludedBy.get(entry.capability) ?? []), entry.ruleRef]);
  }
  const conflicts: EffectConflict[] = [];
  const seen = new Set<string>();
  for (const entry of hard.required) {
    if (excludedBy.has(entry.capability) && !seen.has(entry.capability)) {
      seen.add(entry.capability);
      const refs = [...new Set([entry.ruleRef, ...(excludedBy.get(entry.capability) ?? [])])].sort();
      conflicts.push({
        kind: 'capability',
        detail: `Capability '${entry.capability}' is both required and excluded`,
        ruleRefs: refs,
      });
    }
  }
  return conflicts;
}

function detectHeatConflicts(hard: HardEffectSet): EffectConflict[] {
  const byExposure = new Map<string, AttributedHeat[]>();
  for (const entry of hard.heat) {
    byExposure.set(entry.exposure, [...(byExposure.get(entry.exposure) ?? []), entry]);
  }
  const conflicts: EffectConflict[] = [];
  for (const [exposure, entries] of [...byExposure.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const allows = entries.some(entry => !entry.prohibited);
    const denies = entries.some(entry => entry.prohibited);
    if (allows && denies) {
      conflicts.push({
        kind: 'heat',
        detail: `Heat exposure '${exposure}' is both allowed and prohibited`,
        ruleRefs: [...new Set(entries.map(entry => entry.ruleRef))].sort(),
      });
    }
  }
  return conflicts;
}

function detectOrderConflicts(hard: HardEffectSet): EffectConflict[] {
  const edges = new Map<string, Set<string>>();
  const edgeRefs = new Map<string, string[]>();
  for (const entry of hard.order) {
    if (!edges.has(entry.before)) {
      edges.set(entry.before, new Set());
    }
    edges.get(entry.before)?.add(entry.after);
    const key = `${entry.before}\u0000${entry.after}`;
    edgeRefs.set(key, [...(edgeRefs.get(key) ?? []), entry.ruleRef]);
  }
  const conflicts: EffectConflict[] = [];
  const visited = new Set<string>();
  const stack: string[] = [];
  const visit = (node: string): void => {
    if (stack.includes(node)) {
      const cycle = [...stack.slice(stack.indexOf(node)), node];
      const refs = new Set<string>();
      for (let index = 0; index < cycle.length - 1; index += 1) {
        for (const ref of edgeRefs.get(`${cycle[index]}\u0000${cycle[index + 1]}`) ?? []) {
          refs.add(ref);
        }
      }
      conflicts.push({
        kind: 'order',
        detail: `Ordering cycle: ${cycle.join(' -> ')}`,
        ruleRefs: [...refs].sort(),
      });
      return;
    }
    if (visited.has(node)) {
      return;
    }
    visited.add(node);
    stack.push(node);
    for (const next of [...(edges.get(node) ?? [])].sort()) {
      visit(next);
    }
    stack.pop();
  };
  for (const node of [...edges.keys()].sort()) {
    visit(node);
  }
  return conflicts;
}

function detectFrequencyConflicts(hard: HardEffectSet): EffectConflict[] {
  const byUnit = new Map<string, AttributedFrequency[]>();
  for (const entry of hard.frequencies) {
    byUnit.set(entry.unit, [...(byUnit.get(entry.unit) ?? []), entry]);
  }
  const conflicts: EffectConflict[] = [];
  for (const [unit, entries] of [...byUnit.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const lower = Math.max(...entries.map(entry => entry.min ?? Number.NEGATIVE_INFINITY));
    const upper = Math.min(...entries.map(entry => entry.max ?? Number.POSITIVE_INFINITY));
    if (lower > upper) {
      conflicts.push({
        kind: 'frequency',
        detail: `Impossible frequency bounds for '${unit}': at least ${lower} but at most ${upper}`,
        ruleRefs: [...new Set(entries.map(entry => entry.ruleRef))].sort(),
      });
    }
  }
  return conflicts;
}

function rankConflict(kind: EffectConflict['kind']): number {
  return kind === 'capability' ? 0 : kind === 'heat' ? 1 : kind === 'order' ? 2 : 3;
}

export function detectConflicts(hard: HardEffectSet): EffectConflict[] {
  return [
    ...detectCapabilityConflicts(hard),
    ...detectHeatConflicts(hard),
    ...detectOrderConflicts(hard),
    ...detectFrequencyConflicts(hard),
  ].sort((left, right) =>
    rankConflict(left.kind) !== rankConflict(right.kind)
      ? rankConflict(left.kind) - rankConflict(right.kind)
      : left.detail < right.detail ? -1 : 1,
  );
}

export function collectEffects(
  evaluation: RulesEvaluation,
  rules: readonly RecommendationRule[],
): CollectedEffects {
  const byRef = new Map(rules.map(rule => [ruleRefOf(rule.ruleId, rule.versionId), rule]));
  const hard = {
    required: [] as AttributedRequire[],
    excluded: [] as AttributedExclude[],
    order: [] as AttributedOrder[],
    waits: [] as AttributedWait[],
    rinses: [] as AttributedRinse[],
    frequencies: [] as AttributedFrequency[],
    heat: [] as AttributedHeat[],
    activations: [] as AttributedActivation[],
  };
  const advisory: AdvisoryPreference[] = [];
  const advisoryNotes: AdvisoryNote[] = [];
  const appliedRefs = evaluation.applied.map(entry => ruleRefOf(entry.ruleId, entry.versionId));
  for (const ref of appliedRefs) {
    const rule = byRef.get(ref);
    if (rule === undefined) {
      continue;
    }
    for (const effect of rule.effects) {
      if (rule.strength === 'hard') {
        distributeHardEffect(effect, ref, hard, advisory);
      } else {
        distributeAdvisoryEffect(effect, ref, advisory, advisoryNotes);
      }
    }
  }
  return { hard, advisory, advisoryNotes, conflicts: detectConflicts(hard) };
}
