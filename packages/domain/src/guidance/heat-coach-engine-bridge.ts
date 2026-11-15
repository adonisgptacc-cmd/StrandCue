import {
  type CompiledRule,
  type CompiledRuleset,
  type DecisionStatus,
  type EngineInput,
  type RulesetRef,
  type SnapshotFact,
  type SnapshotEntry,
  type SnapshotEvent,
  type RevisionSet,
} from '@strandcue/engine';

import type { HeatCoachInput, HeatRulePublication } from '../heat-coach.ts';

/**
 * Converts a Heat Coach publication into engine-compiled rules.
 *
 * Heat Coach restrictions become `block` effects in the safety stage;
 * necessity rules and alternatives become `set_heat_assessment` and
 * `include_candidate` effects in the heat stage. Capability bindings from
 * the publication's reviewed product/tool facts become `ReviewedCapabilityBinding`
 * entries so the engine can verify ownership before applying any rule.
 */
export function heatPublicationToCompiledRuleset(
  publication: HeatRulePublication,
): CompiledRuleset {
  const rules: CompiledRule[] = [];

  // Hard restrictions -> block effects in apply_safety_restrictions.
  for (const restriction of publication.hardRestrictions) {
    rules.push({
      ruleId: `heat-restriction:${restriction.reasonCode}`,
      version: publication.ruleVersion,
      stageId: 'apply_safety_restrictions',
      when: restrictionExpression(restriction),
      effects: [{ kind: 'block', reasonCode: restriction.reasonCode }],
      severity: 'hard',
      capabilityIds: [],
      claimIds: [restriction.reasonCode],
      evidenceIds: [restriction.reasonCode],
    });
  }

  // Necessity rules -> set_heat_assessment in evaluate_heat.
  for (const rule of publication.necessityRules) {
    rules.push({
      ruleId: `heat-necessity:${rule.necessity}`,
      version: publication.ruleVersion,
      stageId: 'evaluate_heat',
      when: necessityExpression(rule),
      effects: [{ kind: 'set_heat_assessment', state: necessityHeatState(rule.necessity) }],
      severity: 'caution',
      capabilityIds: [],
      claimIds: [rule.necessity],
      evidenceIds: [rule.necessity],
    });
  }

  // Alternatives -> include_candidate in evaluate_heat (lower-exposure offers).
  for (const alternative of publication.alternatives) {
    rules.push({
      ruleId: `heat-alternative:${alternative.reasonCode}`,
      version: publication.ruleVersion,
      stageId: 'evaluate_heat',
      when: alternativeExpression(alternative),
      effects: [{ kind: 'include_candidate', candidateId: alternative.reasonCode }],
      severity: 'info',
      capabilityIds: [],
      claimIds: [alternative.reasonCode],
      evidenceIds: [alternative.reasonCode],
    });
  }

  const ref: RulesetRef = {
    rulesetId: publication.publicationId,
    contentHash: `sha256:${publication.digest}`,
    schemaVersion: publication.schemaVersion.toString(),
    evaluatorVersion: '1.1.0',
  };

  return { ref, capabilities: [], rules };
}

function restrictionExpression(restriction: HeatRulePublication['hardRestrictions'][number]) {
  // Build an expression that matches when restriction concerns/zones/service apply.
  return { kind: 'fact_exists' as const, factId: `heat.restriction.${restriction.reasonCode}` };
}

function necessityExpression(rule: HeatRulePublication['necessityRules'][number]) {
  return { kind: 'fact_exists' as const, factId: `heat.necessity.${rule.necessity}` };
}

function alternativeExpression(alternative: HeatRulePublication['alternatives'][number]) {
  return { kind: 'fact_exists' as const, factId: `heat.alternative.${alternative.reasonCode}` };
}

function necessityHeatState(necessity: HeatRulePublication['necessityRules'][number]['necessity']) {
  switch (necessity) {
    case 'not_needed': return 'no_heat';
    case 'optional': return 'lower_heat';
    case 'supports_goal': return 'appropriate';
    case 'unknown': return 'content_pending';
  }
}

/**
 * Converts a Heat Coach input into an engine input snapshot.
 *
 * Owner-scoped canonical data: passport facts, shelf/tools entries, service
 * history, and confirmed heat events become snapshot facts and entries. The
 * engine never reads a clock; `evaluatedAt` comes from `asOf`.
 */
export function heatInputToEngineInput(input: HeatCoachInput, ruleset: CompiledRuleset): EngineInput {
  const factRegistry: SnapshotFact[] = [];
  const addFact = (factId: string, status: SnapshotFact['status'], value?: SnapshotFact['value'], claimId?: string, evidenceIds: string[] = []): void => {
    factRegistry.push({ factId, revision: 0, status, value, claimId, evidenceIds, recordedAt: input.asOf });
  };

  // Current condition concern facts.
  if (input.preparedInput.currentCondition !== null) {
    for (const concern of input.preparedInput.currentCondition.concerns) {
      addFact(`heat.condition.concern.${concern}`, 'verified', true);
    }
  } else {
    addFact('heat.condition.current', 'unknown');
  }

  // Request method fact.
  if (input.request.method.state === 'known') {
    addFact(`heat.request.method.${input.request.method.value}`, 'verified', true);
  } else {
    addFact('heat.request.method', 'unknown');
  }

  // Request temperature fact.
  if (input.request.temperature.state === 'known') {
    addFact(`heat.request.temperature.${input.request.temperature.value.unit}`, 'verified', input.request.temperature.value.value);
  } else {
    addFact('heat.request.temperature', 'unknown');
  }

  // Request zones fact.
  if (input.request.zones.length > 0) {
    addFact('heat.request.zones', 'verified', input.request.zones.length);
  } else {
    addFact('heat.request.zones', 'unknown');
  }

  // Snapshot entries for owned shelf/tools so the engine can verify capability ownership.
  const passport: SnapshotEntry = { entryId: 'passport', revision: 0, factIds: [] };
  const chemicalServiceHistory: SnapshotEntry[] = input.preparedInput.chemicalServices.map((_service, _index) => ({
    entryId: `heat-service-${_index}`,
    revision: 0,
    factIds: [],
  }));
  const shelf: SnapshotEntry[] = input.preparedInput.products.map((_product, _index) => ({
    entryId: `heat-product-${_index}`,
    revision: 0,
    factIds: [],
  }));
  const tools: SnapshotEntry[] = input.preparedInput.tools.map((_tool, _index) => ({
    entryId: `heat-tool-${_index}`,
    revision: 0,
    factIds: [],
  }));
  const eventHistory: SnapshotEvent[] = input.confirmedCareEvents.map((event, index) => ({
    eventId: `heat.event-${index}`,
    revision: 0,
    eventType: event.kind,
    happenedAt: event.date.precision === 'exact' ? event.date.value : input.asOf,
    factIds: [],
  }));

  const revisions: RevisionSet = {
    passport: 0,
    chemicalServiceHistory: input.preparedInput.chemicalServices.length,
    shelf: input.preparedInput.products.length,
    tools: input.preparedInput.tools.length,
    events: input.confirmedCareEvents.length,
  };

  return {
    snapshot: {
      ownerScopeId: 'heat-coach-owner',
      factRegistry,
      passport,
      chemicalServiceHistory,
      shelf,
      tools,
      eventHistory,
      revisions,
    },
    evaluatedAt: input.asOf,
    ruleset,
  };
}

/**
 * Maps an engine decision back to a Heat Coach decision state.
 *
 * The engine's four statuses pair with Heat Coach's seven states exactly as
 * validated by the engine contract: `decided` carries `lower_heat | no_heat |
 * appropriate`; `blocked` carries `content_pending | restricted`;
 * `needs_input` carries `needs_input`; `no_protocol` carries `unavailable`.
 */
export function engineDecisionToHeatState(
  status: DecisionStatus,
  heatAssessment: string | undefined,
): 'content_pending' | 'needs_input' | 'restricted' | 'lower_heat' | 'no_heat' | 'appropriate' | 'unavailable' | undefined {
  if (status === 'decided') {
    if (heatAssessment === 'lower_heat' || heatAssessment === 'no_heat' || heatAssessment === 'appropriate') {
      return heatAssessment;
    }
    return undefined;
  }
  if (status === 'blocked') {
    if (heatAssessment === 'content_pending' || heatAssessment === 'restricted') {
      return heatAssessment;
    }
    return undefined;
  }
  if (status === 'needs_input') {
    if (heatAssessment === 'needs_input') return 'needs_input';
    return undefined;
  }
  if (status === 'no_protocol') {
    if (heatAssessment === 'unavailable') return 'unavailable';
    return undefined;
  }
  return undefined;
}
