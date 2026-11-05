import { ENGINE_EVALUATOR_VERSION } from '../../../packages/engine/src/index.js';
import { canonicalRulesetContentHash } from '../../../packages/engine/src/canonical-json.js';
import type {
  CompiledRule,
  EngineInput,
  EngineStageId,
  ReviewedCapabilityBinding,
  RuleEffect,
  RuleExpression,
  SnapshotFact,
} from '../../../packages/engine/src/index.js';

/**
 * Shared builders for visibly synthetic engine inputs.
 *
 * Every identifier here is synthetic. No real person, product, tool, brand or
 * safety claim is represented, and nothing in this file performs I/O.
 */

export const NOW = '2026-10-31T12:00:00.000Z';
export const PAST = '2026-10-01T00:00:00.000Z';
export const FUTURE = '2026-12-01T00:00:00.000Z';
export const OWNER = 'owner-synthetic';

export const fact = (
  factId: string,
  value: string | number | boolean | null,
  overrides: Partial<SnapshotFact> = {},
): SnapshotFact => ({
  factId,
  revision: 1,
  status: 'verified',
  value,
  claimId: `claim-${factId}`,
  evidenceIds: [`ev-${factId}`],
  recordedAt: PAST,
  ...overrides,
});

/** A fact that was recorded but never resolved to a verified value. */
export const unknownFact = (factId: string): SnapshotFact => ({
  factId,
  revision: 1,
  status: 'unknown',
  claimId: `claim-${factId}`,
  evidenceIds: [`ev-${factId}`],
  recordedAt: PAST,
});

export const when = (factId: string, value: string | number | boolean = true): RuleExpression => ({
  kind: 'fact_equals',
  factId,
  value,
});

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
  ...(overrides.capabilityIds?.length && overrides.useScope === undefined ? { useScope: 'synthetic-routine-use' } : {}),
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
  catalogueSubject: { catalogueId: 'catalogue-prod-synthetic', versionId: '1', market: 'ZA' },
  reviewedUseScope: 'synthetic-routine-use',
  capabilityType: 'use_constraint',
  value: true,
  claimId: `claim-${capabilityId}`,
  evidenceIds: [`ev-${capabilityId}`],
  reviewRef: 'review-synthetic',
  reviewedAt: PAST,
  ...overrides,
});

export const include = (candidateId: string): RuleEffect => ({ kind: 'include_candidate', candidateId });
export const exclude = (candidateId: string, reasonCode = 'synthetic_excluded'): RuleEffect => ({
  kind: 'exclude_candidate',
  candidateId,
  reasonCode,
});
export const prerequisite = (prerequisiteId: string): RuleEffect => ({
  kind: 'require_prerequisite',
  prerequisiteId,
});
export const wait = (afterActionId: string, minutes: number): RuleEffect => ({
  kind: 'insert_wait',
  afterActionId,
  minutes,
});
export const block = (reasonCode = 'synthetic_blocked'): RuleEffect => ({ kind: 'block', reasonCode });
export const heat = (state: 'content_pending' | 'restricted' | 'needs_input' | 'unavailable' | 'no_heat' | 'lower_heat' | 'appropriate'): RuleEffect => ({
  kind: 'set_heat_assessment',
  state,
});
export const askQuestion = (questionId: string, reasonCode = 'synthetic_question'): RuleEffect => ({
  kind: 'ask_question',
  questionId,
  reasonCode,
});

export interface SnapshotOptions {
  readonly facts?: readonly SnapshotFact[];
  readonly shelf?: readonly string[];
  readonly tools?: readonly string[];
  readonly events?: readonly { eventId: string; eventType: string; happenedAt: string; revision?: number }[];
  readonly revisions?: Partial<EngineInput['snapshot']['revisions']>;
}

export const buildSnapshot = (options: SnapshotOptions = {}): EngineInput['snapshot'] => ({
  ownerScopeId: OWNER,
  factRegistry: options.facts ?? [fact('f-ready', true)],
  passport: { entryId: 'passport', revision: 1, factIds: [] },
  chemicalServiceHistory: [],
  shelf: (options.shelf ?? []).map((entryId) => ({
    entryId,
    revision: 1,
    factIds: [],
    ...(entryId === 'prod-synthetic' ? { catalogueSubject: { catalogueId: 'catalogue-prod-synthetic', versionId: '1', market: 'ZA' } } : {}),
  })),
  tools: (options.tools ?? []).map((entryId) => ({ entryId, revision: 1, factIds: [] })),
  eventHistory: (options.events ?? []).map((event) => ({
    ...event,
    revision: event.revision ?? 1,
    factIds: [],
  })),
  revisions: { passport: 1, chemicalServiceHistory: 1, shelf: 1, tools: 1, events: 1, ...options.revisions },
});

export interface InputOptions extends SnapshotOptions {
  readonly rules?: readonly CompiledRule[];
  readonly capabilities?: readonly ReviewedCapabilityBinding[];
  readonly rulesetId?: string;
  readonly contentHash?: string;
  readonly evaluatedAt?: string;
}

export const buildInput = (options: InputOptions = {}): EngineInput => ({
  evaluatedAt: options.evaluatedAt ?? NOW,
  snapshot: buildSnapshot(options),
  ruleset: {
    ref: {
      rulesetId: options.rulesetId ?? 'synthetic-ruleset',
      contentHash: options.contentHash ?? canonicalRulesetContentHash({
        capabilities: options.capabilities ?? [],
        rules: options.rules ?? [],
      }),
      schemaVersion: '1.1.0',
      evaluatorVersion: ENGINE_EVALUATOR_VERSION,
    },
    capabilities: options.capabilities ?? [],
    rules: options.rules ?? [],
  },
});

/**
 * Deterministic JSON with sorted object keys, so two structurally equal values
 * always produce the same string regardless of key insertion order.
 */
export const canonicalJson = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, entry]) => entry !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
};

/** Mulberry32: a small, fully deterministic pseudo-random generator. */
export const seededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

/** A seeded Fisher-Yates shuffle; the same seed always yields the same order. */
export const seededShuffle = <T>(items: readonly T[], random: () => number): T[] => {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swap]] = [shuffled[swap], shuffled[index]];
  }
  return shuffled;
};
