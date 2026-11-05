import { z } from 'zod';
import { canonicalRulesetContentHash } from './canonical-json.ts';

export const DECISION_STATUSES = ['decided', 'needs_input', 'blocked', 'no_protocol'] as const;
export const DecisionStatusSchema = z.enum(DECISION_STATUSES);
export type DecisionStatus = z.infer<typeof DecisionStatusSchema>;

export const ENGINE_STAGE_IDS = [
  'validate_snapshot',
  'apply_safety_restrictions',
  'load_verified_facts',
  'derive_treatment_state',
  'filter_candidates',
  'evaluate_heat',
  'select_and_rank',
  'build_dependency_graph',
  'order_and_validate',
  'assemble_decision',
] as const;
export const EngineStageIdSchema = z.enum(ENGINE_STAGE_IDS);
export type EngineStageId = z.infer<typeof EngineStageIdSchema>;

export const HEAT_ASSESSMENT_STATES = [
  'content_pending',
  'needs_input',
  'restricted',
  'lower_heat',
  'no_heat',
  'appropriate',
  'unavailable',
] as const;
export const HeatAssessmentStateSchema = z.enum(HEAT_ASSESSMENT_STATES);
export type HeatAssessmentState = z.infer<typeof HeatAssessmentStateSchema>;

export const RulesetRefSchema = z.object({
  rulesetId: z.string().min(1),
  contentHash: z.string().min(1),
  schemaVersion: z.string().min(1),
  evaluatorVersion: z.string().min(1),
}).strict().readonly();
export type RulesetRef = z.infer<typeof RulesetRefSchema>;

export const RuleReferenceSchema = z.object({
  ruleId: z.string().min(1),
  version: z.string().min(1),
}).strict().readonly();
export type RuleReference = z.infer<typeof RuleReferenceSchema>;

export const ReasonSeveritySchema = z.enum(['blocker', 'caution', 'info']);
export type ReasonSeverity = z.infer<typeof ReasonSeveritySchema>;

const SnapshotValueSchema = z.union([
  z.string(), z.number().finite(), z.boolean(), z.null(),
  z.array(z.union([z.string(), z.number().finite(), z.boolean(), z.null()])).readonly(),
]);

export const SnapshotFactSchema = z.object({
  factId: z.string().min(1),
  revision: z.number().int().nonnegative(),
  status: z.enum(['verified', 'unknown', 'expired', 'withdrawn', 'contradictory']),
  value: SnapshotValueSchema.optional(),
  claimId: z.string().min(1).optional(),
  evidenceIds: z.array(z.string().min(1)).readonly(),
  recordedAt: z.string().datetime({ offset: true }),
  effectiveAt: z.string().datetime({ offset: true }).optional(),
  expiresAt: z.string().datetime({ offset: true }).optional(),
}).strict().readonly();
export type SnapshotFact = z.infer<typeof SnapshotFactSchema>;

export const SnapshotEntrySchema = z.object({
  entryId: z.string().min(1),
  revision: z.number().int().nonnegative(),
  factIds: z.array(z.string().min(1)).readonly(),
  catalogueSubject: z.object({
    catalogueId: z.string().min(1),
    versionId: z.string().min(1),
    market: z.string().regex(/^[A-Z]{2}$/),
  }).strict().readonly().optional(),
}).strict().readonly();
export type SnapshotEntry = z.infer<typeof SnapshotEntrySchema>;

export const SnapshotEventSchema = z.object({
  eventId: z.string().min(1),
  revision: z.number().int().nonnegative(),
  eventType: z.string().min(1),
  happenedAt: z.string().datetime({ offset: true }),
  factIds: z.array(z.string().min(1)).readonly(),
}).strict().readonly();
export type SnapshotEvent = z.infer<typeof SnapshotEventSchema>;

export const TreatmentProgrammeProjectionSchema = z.object({
  programmeId: z.string().min(1),
  state: z.enum(['not_started', 'initial', 'reassessment', 'maintenance', 'paused', 'completed']),
  dueStatus: z.enum(['due', 'not_due', 'unknown']),
  ruleId: z.string().min(1),
  ruleVersion: z.string().min(1),
  evaluatedAt: z.string().datetime({ offset: true }),
  sourceEventIds: z.array(z.string().min(1)).readonly(),
  prospective: z.boolean(),
}).strict().readonly();
export type TreatmentProgrammeProjection = z.infer<typeof TreatmentProgrammeProjectionSchema>;

export const RevisionSetSchema = z.object({
  passport: z.number().int().nonnegative(),
  chemicalServiceHistory: z.number().int().nonnegative(),
  shelf: z.number().int().nonnegative(),
  tools: z.number().int().nonnegative(),
  events: z.number().int().nonnegative(),
}).strict().readonly();
export type RevisionSet = z.infer<typeof RevisionSetSchema>;

export const CanonicalSnapshotSchema = z.object({
  ownerScopeId: z.string().min(1),
  factRegistry: z.array(SnapshotFactSchema).readonly(),
  passport: SnapshotEntrySchema,
  chemicalServiceHistory: z.array(SnapshotEntrySchema).readonly(),
  shelf: z.array(SnapshotEntrySchema).readonly(),
  tools: z.array(SnapshotEntrySchema).readonly(),
  eventHistory: z.array(SnapshotEventSchema).readonly(),
  treatmentPrograms: z.array(TreatmentProgrammeProjectionSchema).readonly().optional(),
  revisions: RevisionSetSchema,
}).strict().readonly().superRefine((snapshot, context) => {
  const factIds = new Set<string>();
  snapshot.factRegistry.forEach((fact, index) => {
    if (factIds.has(fact.factId)) {
      context.addIssue({ code: 'custom', path: ['factRegistry', index, 'factId'], message: 'Fact registry identifiers must be unique.' });
    }
    factIds.add(fact.factId);
  });

  const references = [
    ...snapshot.passport.factIds.map((factId) => ({ path: ['passport', 'factIds'], factId })),
    ...snapshot.chemicalServiceHistory.flatMap((entry, index) => entry.factIds.map((factId) => ({ path: ['chemicalServiceHistory', index, 'factIds'], factId }))),
    ...snapshot.shelf.flatMap((entry, index) => entry.factIds.map((factId) => ({ path: ['shelf', index, 'factIds'], factId }))),
    ...snapshot.tools.flatMap((entry, index) => entry.factIds.map((factId) => ({ path: ['tools', index, 'factIds'], factId }))),
    ...snapshot.eventHistory.flatMap((event, index) => event.factIds.map((factId) => ({ path: ['eventHistory', index, 'factIds'], factId }))),
  ];
  references.forEach(({ path, factId }) => {
    if (!factIds.has(factId)) {
      context.addIssue({ code: 'custom', path, message: `Snapshot references an unknown fact: ${factId}` });
    }
  });

  const eventIds = new Set(snapshot.eventHistory.map((event) => event.eventId));
  const programmeIds = new Set<string>();
  (snapshot.treatmentPrograms ?? []).forEach((programme, index) => {
    if (programmeIds.has(programme.programmeId)) {
      context.addIssue({ code: 'custom', path: ['treatmentPrograms', index, 'programmeId'], message: 'Treatment programme projection identifiers must be unique.' });
    }
    programmeIds.add(programme.programmeId);
    programme.sourceEventIds.forEach((eventId, eventIndex) => {
      if (!eventIds.has(eventId)) {
        context.addIssue({ code: 'custom', path: ['treatmentPrograms', index, 'sourceEventIds', eventIndex], message: `Treatment projection references an unknown event: ${eventId}` });
      }
    });
  });
});
export type CanonicalSnapshot = z.infer<typeof CanonicalSnapshotSchema>;

const RuleValueSchema = z.union([z.string(), z.number().finite(), z.boolean()]);
export const RuleExpressionSchema: z.ZodType<RuleExpression> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fact_equals'), factId: z.string().min(1), value: RuleValueSchema }).strict().readonly(),
  z.object({ kind: z.literal('fact_in'), factId: z.string().min(1), values: z.array(RuleValueSchema).min(1).readonly() }).strict().readonly(),
  z.object({ kind: z.literal('fact_exists'), factId: z.string().min(1) }).strict().readonly(),
  z.object({ kind: z.literal('all'), expressions: z.array(z.lazy(() => RuleExpressionSchema)).min(1).readonly() }).strict().readonly(),
  z.object({ kind: z.literal('any'), expressions: z.array(z.lazy(() => RuleExpressionSchema)).min(1).readonly() }).strict().readonly(),
  z.object({ kind: z.literal('not'), expression: z.lazy(() => RuleExpressionSchema) }).strict().readonly(),
]);
export type RuleExpression =
  | { readonly kind: 'fact_equals'; readonly factId: string; readonly value: string | number | boolean }
  | { readonly kind: 'fact_in'; readonly factId: string; readonly values: readonly (string | number | boolean)[] }
  | { readonly kind: 'fact_exists'; readonly factId: string }
  | { readonly kind: 'all' | 'any'; readonly expressions: readonly RuleExpression[] }
  | { readonly kind: 'not'; readonly expression: RuleExpression };

export const RuleEffectSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('include_candidate'),
    candidateId: z.string().min(1),
    /** Explicit suitability, independent of rule authority/severity. */
    goalSuitability: z.number().finite().min(0).max(100).optional(),
  }).strict().readonly(),
  z.object({ kind: z.literal('exclude_candidate'), candidateId: z.string().min(1), reasonCode: z.string().min(1), reasonSeverity: ReasonSeveritySchema.optional() }).strict().readonly(),
  z.object({ kind: z.literal('require_prerequisite'), prerequisiteId: z.string().min(1) }).strict().readonly(),
  z.object({ kind: z.literal('insert_wait'), afterActionId: z.string().min(1), minutes: z.number().int().positive() }).strict().readonly(),
  z.object({ kind: z.literal('set_heat_assessment'), state: HeatAssessmentStateSchema }).strict().readonly(),
  z.object({ kind: z.literal('ask_question'), questionId: z.string().min(1), reasonCode: z.string().min(1), reasonSeverity: ReasonSeveritySchema.optional() }).strict().readonly(),
  z.object({ kind: z.literal('block'), reasonCode: z.string().min(1), reasonSeverity: ReasonSeveritySchema.optional() }).strict().readonly(),
]);
export type RuleEffect = z.infer<typeof RuleEffectSchema>;

export const RuleFixtureRequirementSchema = z.object({
  ruleId: z.string().min(1),
  positiveFixtureIds: z.array(z.string().min(1)).min(1).readonly(),
  negativeFixtureIds: z.array(z.string().min(1)).min(1).readonly(),
}).strict().readonly();
export type RuleFixtureRequirement = z.infer<typeof RuleFixtureRequirementSchema>;

export const SuccessorOfSchema = z.object({
  parentRulesetHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  withdrawnRuleId: z.string().min(1),
  withdrawnRuleVersion: z.string().min(1),
}).strict().readonly();
export type SuccessorOf = z.infer<typeof SuccessorOfSchema>;

export const SuccessorReviewSchema = z.object({
  parentRulesetHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  withdrawals: z.array(z.object({
    ruleId: z.string().min(1),
    version: z.string().min(1),
    affectedActionId: z.string().min(1),
  }).strict().readonly()).min(1).readonly(),
  authorizations: z.array(z.object({
    withdrawnRuleId: z.string().min(1),
    withdrawnRuleVersion: z.string().min(1),
    affectedActionId: z.string().min(1),
    successorRuleId: z.string().min(1),
    successorRuleVersion: z.string().min(1),
    authorId: z.string().uuid(),
    reviewerId: z.string().uuid(),
    reviewedAt: z.string().datetime({ offset: true }),
    reviewRef: z.string().uuid(),
  }).strict().readonly()).readonly().superRefine((authorizations, context) => {
    authorizations.forEach((authorization, index) => {
      if (authorization.authorId === authorization.reviewerId) {
        context.addIssue({
          code: 'custom',
          path: [index, 'reviewerId'],
          message: 'Successor authorization requires a distinct independent reviewer.',
        });
      }
    });
  }),
}).strict().readonly();
export type SuccessorReview = z.infer<typeof SuccessorReviewSchema>;

export const DecisionTableRowSchema = z.object({
  rowId: z.string().min(1),
  when: RuleExpressionSchema,
  effects: z.array(RuleEffectSchema).min(1).readonly(),
  useScope: z.string().min(1).optional(),
  successorOf: SuccessorOfSchema.optional(),
  severity: z.enum(['hard', 'caution', 'info']),
  capabilityIds: z.array(z.string().min(1)).readonly(),
  claimIds: z.array(z.string().min(1)).min(1).readonly(),
  evidenceIds: z.array(z.string().min(1)).min(1).readonly(),
}).strict().readonly();
export type DecisionTableRow = z.infer<typeof DecisionTableRowSchema>;

export const DecisionTableSchema = z.object({
  tableId: z.string().min(1),
  hitPolicy: z.enum(['first', 'collect', 'unique']),
  rows: z.array(DecisionTableRowSchema).min(1).readonly(),
}).strict().readonly();
export type DecisionTable = z.infer<typeof DecisionTableSchema>;

export const ConstraintRuleSchema = z.object({
  ruleId: z.string().min(1),
  version: z.string().min(1),
  when: RuleExpressionSchema,
  effects: z.array(RuleEffectSchema).min(1).readonly(),
  useScope: z.string().min(1).optional(),
  successorOf: SuccessorOfSchema.optional(),
  severity: z.enum(['hard', 'caution', 'info']),
  capabilityIds: z.array(z.string().min(1)).readonly(),
  claimIds: z.array(z.string().min(1)).min(1).readonly(),
  evidenceIds: z.array(z.string().min(1)).min(1).readonly(),
}).strict().readonly();
export type ConstraintRule = z.infer<typeof ConstraintRuleSchema>;

export const ReviewedCapabilityBindingSchema = z.object({
  capabilityId: z.string().min(1),
  subjectType: z.enum(['product', 'tool']),
  /** Owner-scoped shelf/tool row, deliberately separate from catalogue identity. */
  subjectId: z.string().min(1),
  catalogueSubject: z.object({
    catalogueId: z.string().min(1),
    versionId: z.string().min(1),
    market: z.string().regex(/^[A-Z]{2}$/),
  }).strict().readonly(),
  reviewedUseScope: z.string().min(1),
  capabilityType: z.enum(['compatibility', 'application_method', 'use_constraint', 'heat_constraint', 'tool_capability']),
  value: SnapshotValueSchema,
  claimId: z.string().min(1),
  evidenceIds: z.array(z.string().min(1)).min(1).readonly(),
  reviewRef: z.string().min(1),
  reviewedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }).optional(),
}).strict().readonly();
export type ReviewedCapabilityBinding = z.infer<typeof ReviewedCapabilityBindingSchema>;

export const RuleAuthoringBundleSchema = z.object({
  bundleId: z.string().min(1),
  version: z.string().min(1),
  capabilities: z.array(ReviewedCapabilityBindingSchema).readonly(),
  tables: z.array(DecisionTableSchema).readonly(),
  constraints: z.array(ConstraintRuleSchema).readonly(),
  requiredFixtures: z.array(RuleFixtureRequirementSchema).readonly(),
  successorReview: SuccessorReviewSchema.optional(),
}).strict().readonly().superRefine((bundle, context) => {
  const capabilityIds = new Set<string>();
  bundle.capabilities.forEach((capability, index) => {
    if (capabilityIds.has(capability.capabilityId)) {
      context.addIssue({ code: 'custom', path: ['capabilities', index, 'capabilityId'], message: 'Capability identifiers must be unique within an authoring bundle.' });
    }
    capabilityIds.add(capability.capabilityId);
  });
  const capabilityScopes = new Map(bundle.capabilities.map((capability) => [capability.capabilityId, capability.reviewedUseScope]));
  const validateScope = (ids: readonly string[], useScope: string | undefined, path: (string | number)[]): void => {
    if (ids.length === 0) return;
    const reviewedScopes = ids.flatMap((capabilityId) => {
      const scope = capabilityScopes.get(capabilityId);
      return scope === undefined ? [] : [scope];
    });
    if (reviewedScopes.length > 0 && (useScope === undefined || reviewedScopes.some((scope) => scope !== useScope))) {
      context.addIssue({
        code: 'custom',
        path,
        message: 'Capability-bound rules must declare a use scope that exactly matches every reviewed capability binding.',
      });
    }
  };
  bundle.tables.forEach((table, tableIndex) => table.rows.forEach((row, rowIndex) => {
    validateScope(row.capabilityIds, row.useScope, ['tables', tableIndex, 'rows', rowIndex, 'useScope']);
  }));
  bundle.constraints.forEach((rule, index) => {
    validateScope(rule.capabilityIds, rule.useScope, ['constraints', index, 'useScope']);
  });
});
export type RuleAuthoringBundle = z.infer<typeof RuleAuthoringBundleSchema>;

export const CompiledRuleSchema = z.object({
  ruleId: z.string().min(1),
  version: z.string().min(1),
  stageId: EngineStageIdSchema,
  when: RuleExpressionSchema,
  effects: z.array(RuleEffectSchema).min(1).readonly(),
  useScope: z.string().min(1).optional(),
  successorOf: SuccessorOfSchema.optional(),
  table: z.object({
    tableId: z.string().min(1),
    hitPolicy: z.enum(['first', 'collect', 'unique']),
    rowOrder: z.number().int().nonnegative(),
  }).strict().readonly().optional(),
  severity: z.enum(['hard', 'caution', 'info']),
  capabilityIds: z.array(z.string().min(1)).readonly(),
  claimIds: z.array(z.string().min(1)).min(1).readonly(),
  evidenceIds: z.array(z.string().min(1)).min(1).readonly(),
}).strict().readonly();
export type CompiledRule = z.infer<typeof CompiledRuleSchema>;

export const CompiledRulesetSchema = z.object({
  ref: RulesetRefSchema,
  capabilities: z.array(ReviewedCapabilityBindingSchema).readonly(),
  rules: z.array(CompiledRuleSchema).readonly(),
  successorReview: SuccessorReviewSchema.optional(),
}).strict().readonly().superRefine((ruleset, context) => {
  const capabilitiesById = new Map(ruleset.capabilities.map((capability) => [capability.capabilityId, capability]));
  const seenCapabilityIds = new Set<string>();
  ruleset.capabilities.forEach((capability, index) => {
    if (seenCapabilityIds.has(capability.capabilityId)) {
      context.addIssue({ code: 'custom', path: ['capabilities', index, 'capabilityId'], message: 'Capability identifiers must be unique within a ruleset.' });
    }
    seenCapabilityIds.add(capability.capabilityId);
  });
  const seenRuleIds = new Set<string>();
  const rulesByVersion = new Map(ruleset.rules.map((rule) => [`${rule.ruleId}\u0000${rule.version}`, rule]));
  const tableMetadata = new Map<string, { hitPolicy: 'first' | 'collect' | 'unique'; rowOrders: Set<number> }>();
  ruleset.rules.forEach((rule, index) => {
    if (seenRuleIds.has(rule.ruleId)) {
      context.addIssue({ code: 'custom', path: ['rules', index, 'ruleId'], message: 'Compiled rule identifiers must be unique within a ruleset.' });
    }
    seenRuleIds.add(rule.ruleId);
    if (rule.table) {
      const table = tableMetadata.get(rule.table.tableId) ?? { hitPolicy: rule.table.hitPolicy, rowOrders: new Set<number>() };
      if (table.hitPolicy !== rule.table.hitPolicy) {
        context.addIssue({ code: 'custom', path: ['rules', index, 'table', 'hitPolicy'], message: 'Rows in one decision table must share one hit policy.' });
      }
      if (table.rowOrders.has(rule.table.rowOrder)) {
        context.addIssue({ code: 'custom', path: ['rules', index, 'table', 'rowOrder'], message: 'Decision-table row order values must be unique.' });
      }
      table.rowOrders.add(rule.table.rowOrder);
      tableMetadata.set(rule.table.tableId, table);
    }
    rule.capabilityIds.forEach((capabilityId) => {
      const capability = capabilitiesById.get(capabilityId);
      if (!capability) {
        context.addIssue({
          code: 'custom',
          path: ['rules', index, 'capabilityIds'],
          message: `Compiled rule references an unbound capability: ${capabilityId}`,
        });
        return;
      }
      if (!rule.claimIds.includes(capability.claimId)) {
        context.addIssue({
          code: 'custom',
          path: ['rules', index, 'claimIds'],
          message: `Compiled rule is missing its capability claim reference: ${capability.claimId}`,
        });
      }
      capability.evidenceIds.forEach((evidenceId) => {
        if (!rule.evidenceIds.includes(evidenceId)) {
          context.addIssue({
            code: 'custom',
            path: ['rules', index, 'evidenceIds'],
            message: `Compiled rule is missing its capability evidence reference: ${evidenceId}`,
          });
        }
      });
    });
  });
  const review = ruleset.successorReview;
  if (review !== undefined) {
    const withdrawalKeys = new Set<string>();
    review.withdrawals.forEach((withdrawal, index) => {
      const key = `${withdrawal.ruleId}\u0000${withdrawal.version}\u0000${withdrawal.affectedActionId}`;
      if (withdrawalKeys.has(key)) context.addIssue({ code: 'custom', path: ['successorReview', 'withdrawals', index], message: 'Successor withdrawal entries must be unique.' });
      withdrawalKeys.add(key);
      if (rulesByVersion.has(`${withdrawal.ruleId}\u0000${withdrawal.version}`)) {
        context.addIssue({ code: 'custom', path: ['successorReview', 'withdrawals', index], message: 'A withdrawn rule version cannot remain active in the successor ruleset.' });
      }
    });
    const authorizationKeys = new Set<string>();
    review.authorizations.forEach((authorization, index) => {
      const withdrawalKey = `${authorization.withdrawnRuleId}\u0000${authorization.withdrawnRuleVersion}\u0000${authorization.affectedActionId}`;
      const authorizationKey = `${withdrawalKey}\u0000${authorization.successorRuleId}\u0000${authorization.successorRuleVersion}`;
      if (!withdrawalKeys.has(withdrawalKey)) context.addIssue({ code: 'custom', path: ['successorReview', 'authorizations', index], message: 'Successor authorization must identify a withdrawn rule and affected action.' });
      if (authorizationKeys.has(authorizationKey)) context.addIssue({ code: 'custom', path: ['successorReview', 'authorizations', index], message: 'Successor authorizations must be unique.' });
      authorizationKeys.add(authorizationKey);
      if (authorization.authorId === authorization.reviewerId) context.addIssue({ code: 'custom', path: ['successorReview', 'authorizations', index, 'reviewerId'], message: 'Successor authorization requires an independent reviewer.' });
      const successor = rulesByVersion.get(`${authorization.successorRuleId}\u0000${authorization.successorRuleVersion}`);
      if (!successor
        || !successor.effects.some((effect) => effect.kind === 'include_candidate' && effect.candidateId === authorization.affectedActionId)
        || successor.successorOf?.parentRulesetHash !== review.parentRulesetHash
        || successor.successorOf?.withdrawnRuleId !== authorization.withdrawnRuleId
        || successor.successorOf?.withdrawnRuleVersion !== authorization.withdrawnRuleVersion) {
        context.addIssue({ code: 'custom', path: ['successorReview', 'authorizations', index, 'successorRuleId'], message: 'Successor authorization must bind the exact permitting successor rule and version.' });
      }
    });
    ruleset.rules.forEach((rule, index) => {
      if (rule.successorOf !== undefined && rule.successorOf.parentRulesetHash !== review.parentRulesetHash) {
        context.addIssue({ code: 'custom', path: ['rules', index, 'successorOf'], message: 'Successor rule must bind the review parent ruleset hash.' });
      }
    });
  } else {
    ruleset.rules.forEach((rule, index) => {
      if (rule.successorOf !== undefined) {
        context.addIssue({ code: 'custom', path: ['rules', index, 'successorOf'], message: 'Successor lineage requires an authenticated successor review packet.' });
      }
    });
  }
});
export type CompiledRuleset = z.infer<typeof CompiledRulesetSchema>;

export const RuleDiagnosticSchema = z.object({
  code: z.string().min(1),
  severity: z.enum(['error', 'warning', 'info']),
  ruleId: z.string().min(1).optional(),
  rowId: z.string().min(1).optional(),
  messageKey: z.string().min(1),
}).strict();
export type RuleDiagnostic = z.infer<typeof RuleDiagnosticSchema>;

export const EngineInputSchema = z.object({
  snapshot: CanonicalSnapshotSchema,
  evaluatedAt: z.string().datetime({ offset: true }),
  ruleset: CompiledRulesetSchema,
  priorRuleset: CompiledRulesetSchema.optional(),
  priorRulesetRef: RulesetRefSchema.optional(),
}).strict().readonly().superRefine((input, context) => {
  const review = input.ruleset.successorReview;
  if (review === undefined) return;

  const priorRuleset = input.priorRuleset;
  if (priorRuleset === undefined) {
    context.addIssue({ code: 'custom', path: ['priorRuleset'], message: 'Successor review requires the complete parent ruleset.' });
    return;
  }
  if (input.priorRulesetRef?.contentHash !== review.parentRulesetHash
    || priorRuleset.ref.contentHash !== review.parentRulesetHash) {
    context.addIssue({ code: 'custom', path: ['priorRulesetRef', 'contentHash'], message: 'Successor review parent ruleset hash does not match the prior ruleset reference.' });
  }
  try {
    if (canonicalRulesetContentHash(priorRuleset) !== priorRuleset.ref.contentHash) {
      context.addIssue({ code: 'custom', path: ['priorRuleset', 'ref', 'contentHash'], message: 'Parent ruleset content hash does not match its content.' });
    }
  } catch {
    context.addIssue({ code: 'custom', path: ['priorRuleset', 'ref', 'contentHash'], message: 'Parent ruleset content hash does not match its content.' });
  }
  review.withdrawals.forEach((withdrawal, index) => {
    const existsInParent = priorRuleset.rules.some((rule) => rule.ruleId === withdrawal.ruleId
      && rule.version === withdrawal.version
      && rule.effects.some((effect) => 'candidateId' in effect && effect.candidateId === withdrawal.affectedActionId));
    if (!existsInParent) {
      context.addIssue({
        code: 'custom',
        path: ['ruleset', 'successorReview', 'withdrawals', index],
        message: 'Successor withdrawal must identify a rule, version, and affected action present in the parent ruleset.',
      });
    }
  });
});
export type EngineInput = z.infer<typeof EngineInputSchema>;

export const StageTraceEntrySchema = z.object({
  stageId: EngineStageIdSchema,
  outcome: z.enum(['completed', 'needs_input', 'blocked', 'not_applicable']),
  reasonSeverity: ReasonSeveritySchema,
  ruleIds: z.array(z.string().min(1)),
  ruleRefs: z.array(RuleReferenceSchema),
  claimIds: z.array(z.string().min(1)),
  evidenceIds: z.array(z.string().min(1)),
}).strict();
export type StageTraceEntry = z.infer<typeof StageTraceEntrySchema>;

export const DecisionStepSchema = z.object({
  stepId: z.string().min(1),
  actionId: z.string().min(1),
  labelKey: z.string().min(1),
  reasonCode: z.string().min(1),
  reasonSeverity: ReasonSeveritySchema,
  ruleIds: z.array(z.string().min(1)),
  ruleRefs: z.array(RuleReferenceSchema),
  claimIds: z.array(z.string().min(1)),
  evidenceIds: z.array(z.string().min(1)),
  prerequisiteIds: z.array(z.string().min(1)),
  waitMinutes: z.number().int().positive().optional(),
}).strict();
export type DecisionStep = z.infer<typeof DecisionStepSchema>;

export const DecisionOmissionSchema = z.object({
  candidateId: z.string().min(1),
  reasonCode: z.string().min(1),
  reasonSeverity: ReasonSeveritySchema,
  ruleIds: z.array(z.string().min(1)),
  ruleRefs: z.array(RuleReferenceSchema),
  claimIds: z.array(z.string().min(1)),
  evidenceIds: z.array(z.string().min(1)),
}).strict();
export type DecisionOmission = z.infer<typeof DecisionOmissionSchema>;

export const DecisionAlternativeSchema = z.object({
  alternativeId: z.string().min(1),
  labelKey: z.string().min(1),
  reasonCode: z.string().min(1),
  reasonSeverity: ReasonSeveritySchema,
  ruleIds: z.array(z.string().min(1)),
  ruleRefs: z.array(RuleReferenceSchema),
  claimIds: z.array(z.string().min(1)),
  evidenceIds: z.array(z.string().min(1)),
}).strict();
export type DecisionAlternative = z.infer<typeof DecisionAlternativeSchema>;

export const DecisionQuestionSchema = z.object({
  questionId: z.string().min(1),
  rank: z.number().int().positive(),
  reasonCode: z.string().min(1),
  reasonSeverity: ReasonSeveritySchema,
  ruleRefs: z.array(RuleReferenceSchema),
  neededFactIds: z.array(z.string().min(1)),
}).strict();
export type DecisionQuestion = z.infer<typeof DecisionQuestionSchema>;

export const DecisionConfidenceSchema = z.object({
  instructionCompleteness: z.enum(['low', 'moderate', 'high']),
  suitability: z.enum(['limited', 'moderate', 'high']),
}).strict();
export type DecisionConfidence = z.infer<typeof DecisionConfidenceSchema>;

export const DecisionAuditSchema = z.object({
  ruleset: RulesetRefSchema,
  evaluatedAt: z.string().datetime({ offset: true }),
  schemaVersion: z.string().min(1),
  evaluatorVersion: z.string().min(1),
  trace: z.array(StageTraceEntrySchema).length(ENGINE_STAGE_IDS.length),
}).strict().superRefine((audit, context) => {
  audit.trace.forEach((entry, index) => {
    if (entry.stageId !== ENGINE_STAGE_IDS[index]) {
      context.addIssue({ code: 'custom', path: ['trace', index, 'stageId'], message: 'Trace stages must follow the public engine stage order.' });
    }
  });
});
export type DecisionAudit = z.infer<typeof DecisionAuditSchema>;

const ALLOWED_HEAT_STATES: Readonly<Record<DecisionStatus, readonly HeatAssessmentState[]>> = {
  decided: ['lower_heat', 'no_heat', 'appropriate'],
  needs_input: ['needs_input'],
  blocked: ['content_pending', 'restricted'],
  no_protocol: ['unavailable'],
};

export const EngineDecisionSchema = z.object({
  status: DecisionStatusSchema,
  steps: z.array(DecisionStepSchema),
  omissions: z.array(DecisionOmissionSchema),
  alternatives: z.array(DecisionAlternativeSchema),
  questions: z.array(DecisionQuestionSchema),
  heatAssessment: HeatAssessmentStateSchema.optional(),
  confidence: DecisionConfidenceSchema,
  audit: DecisionAuditSchema,
}).strict().superRefine((decision, context) => {
  if (decision.heatAssessment !== undefined && !ALLOWED_HEAT_STATES[decision.status].includes(decision.heatAssessment)) {
    context.addIssue({ code: 'custom', path: ['heatAssessment'], message: 'Heat assessment must match the engine decision status.' });
  }
  if (decision.status === 'decided' && decision.steps.length === 0) {
    context.addIssue({ code: 'custom', path: ['steps'], message: 'A decided outcome must contain at least one executable step.' });
  }
  if (decision.status === 'needs_input' && decision.questions.length === 0) {
    context.addIssue({ code: 'custom', path: ['questions'], message: 'A needs_input outcome must contain at least one ranked question.' });
  }
});
export type EngineDecision = z.infer<typeof EngineDecisionSchema>;

export type EvaluateDecision = (input: EngineInput) => EngineDecision;
