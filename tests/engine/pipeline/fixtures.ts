import { ENGINE_EVALUATOR_VERSION } from '../../../packages/engine/src/index.js';
import { canonicalRulesetContentHash } from '../../../packages/engine/src/canonical-json.js';
import type {
  CompiledRule,
  EngineInput,
  ReviewedCapabilityBinding,
  RuleEffect,
  RuleExpression,
  SnapshotFact,
  EngineStageId,
} from '../../../packages/engine/src/index.js';

// Everything here is visibly synthetic: no real product, tool or brand facts.
export const NOW = '2026-10-31T12:00:00.000Z';
export const PAST = '2026-10-01T00:00:00.000Z';
export const FUTURE = '2026-12-01T00:00:00.000Z';

export const fact = (factId: string, value: string | number | boolean | null, overrides: Partial<SnapshotFact> = {}): SnapshotFact => ({
  factId,
  revision: 1,
  status: 'verified',
  value,
  claimId: `claim-${factId}`,
  evidenceIds: [`ev-${factId}`],
  recordedAt: PAST,
  ...overrides,
});

export const when = (factId: string, value: string | number | boolean = true): RuleExpression => ({ kind: 'fact_equals', factId, value });

export const rule = (
  ruleId: string,
  stageId: EngineStageId,
  effects: readonly RuleEffect[],
  overrides: Partial<CompiledRule> = {},
): CompiledRule => ({
  ruleId,
  version: '1',
  stageId,
  when: when('f-ready'),
  effects,
  severity: 'hard',
  capabilityIds: [],
  claimIds: [`claim-${ruleId}`],
  evidenceIds: [`ev-${ruleId}`],
  ...overrides,
});

export const capability = (
  capabilityId: string,
  overrides: Partial<ReviewedCapabilityBinding> = {},
): ReviewedCapabilityBinding => ({
  capabilityId,
  subjectType: 'product',
  subjectId: 'prod-synthetic',
  subjectVersion: '1',
  capabilityType: 'use_constraint',
  value: true,
  claimId: `claim-${capabilityId}`,
  evidenceIds: [`ev-${capabilityId}`],
  reviewRef: 'review-synthetic',
  reviewedAt: PAST,
  ...overrides,
});

export interface InputOptions {
  readonly facts?: readonly SnapshotFact[];
  readonly rules?: readonly CompiledRule[];
  readonly capabilities?: readonly ReviewedCapabilityBinding[];
  readonly shelf?: readonly string[];
  readonly tools?: readonly string[];
  readonly events?: readonly { eventId: string; eventType: string; happenedAt: string; revision?: number }[];
  readonly revisions?: Partial<EngineInput['snapshot']['revisions']>;
  readonly evaluatorVersion?: string;
}

export const buildInput = (options: InputOptions = {}): EngineInput => ({
  evaluatedAt: NOW,
  snapshot: {
    ownerScopeId: 'owner-synthetic',
    factRegistry: options.facts ?? [fact('f-ready', true)],
    passport: { entryId: 'passport', revision: 1, factIds: [] },
    chemicalServiceHistory: [],
    shelf: (options.shelf ?? ['prod-synthetic']).map((entryId) => ({ entryId, revision: 1, factIds: [] })),
    tools: (options.tools ?? []).map((entryId) => ({ entryId, revision: 1, factIds: [] })),
    eventHistory: (options.events ?? []).map((event) => ({ ...event, revision: event.revision ?? 1, factIds: [] })),
    revisions: { passport: 1, chemicalServiceHistory: 1, shelf: 1, tools: 1, events: 1, ...options.revisions },
  },
  ruleset: {
    ref: {
      rulesetId: 'synthetic-ruleset',
      contentHash: canonicalRulesetContentHash({
        capabilities: options.capabilities ?? [],
        rules: options.rules ?? [],
      }),
      schemaVersion: '1.0.0',
      evaluatorVersion: options.evaluatorVersion ?? ENGINE_EVALUATOR_VERSION,
    },
    capabilities: options.capabilities ?? [],
    rules: options.rules ?? [],
  },
});

export const include = (candidateId: string): RuleEffect => ({ kind: 'include_candidate', candidateId });
