import { z } from 'zod';

import { RecommendationContextSchema, GuidanceGapSchema, type CurrentConditionInput, type ProtocolDecision, type RecommendationContext, type GuidanceGap, type GuidanceIncompleteSource } from '../../../../packages/domain/src/index';
import { supabase } from '../client';

const uuid = z.string().uuid();
const fingerprint = z.string().regex(/^[0-9a-f]{64}$/);
const receipt = z.object({ id: uuid, requestId: uuid, inputFingerprint: fingerprint, status: z.literal('ready') }).passthrough();
const decision = z.object({
  status: z.enum(['ready', 'needs_input', 'rule_conflict', 'unsupported']),
  requestId: uuid,
  confidence: z.enum(['high', 'moderate', 'limited']),
  noPurchaseNeeded: z.boolean().nullable(),
  steps: z.array(z.object({
    stepId: z.string(), position: z.number().int(), action: z.string(),
    productId: z.string().nullable(), productVersionId: z.string().nullable(),
    toolId: z.string().nullable(), toolVersionId: z.string().nullable(),
    waitSeconds: z.number().nullable(), rinse: z.boolean().nullable(),
    reasons: z.array(z.string()),
  })),
  omissions: z.array(z.string()), alternatives: z.array(z.string()), missingInputs: z.array(z.string()),
  audit: z.object({
    requestId: uuid, engineVersion: z.string(),
    evaluatedRules: z.array(z.object({
      ruleId: z.string(), versionId: z.string(), outcome: z.enum(['applied', 'not_applicable', 'unknown', 'withdrawn']),
      reason: z.string(), evidenceIds: z.array(z.string()),
    })),
    conflicts: z.array(z.object({ kind: z.enum(['capability', 'heat', 'order', 'frequency']), detail: z.string(), ruleRefs: z.array(z.string()) })),
    rankedCandidates: z.array(z.object({
      candidateId: z.string(), kind: z.enum(['product', 'tool']), versionId: z.string(),
      selected: z.boolean(), hardPass: z.boolean(), verifiedCoverage: z.number(),
      advisoryMatches: z.number(), owned: z.boolean(), available: z.boolean(),
    })),
    rejectedCandidates: z.array(z.object({ candidateId: z.string(), kind: z.enum(['product', 'tool']), versionId: z.string(), name: z.string(), reasons: z.array(z.string()) })),
    restrictions: z.array(z.object({ ruleRef: z.string(), description: z.string() })),
    missingInputs: z.array(z.string()),
  }),
});
const provenance = z.object({
  requestId: uuid,
  asOf: z.iso.datetime({ offset: true }),
  engineVersion: z.string().min(1).max(40),
  bundleId: z.string().min(1).max(120),
  bundleVersion: z.string().min(1).max(40),
  inputFingerprint: fingerprint,
  input: RecommendationContextSchema,
  decision,
  setup: z.array(GuidanceGapSchema).optional(),
});

export type ServerDecisionResult = {
  readonly status: 'ready' | 'needs_input' | 'rule_conflict' | 'unsupported';
  readonly decision: ProtocolDecision;
  readonly requestId: string;
  readonly asOf: string;
  readonly engineVersion: string;
  readonly bundleId: string;
  readonly bundleVersion: string;
  readonly inputFingerprint: string;
  readonly input: RecommendationContext;
  readonly setup?: readonly GuidanceGap[];
  readonly receipt?: z.output<typeof receipt>;
};
export type TodayServerResult = ServerDecisionResult
  | { readonly status: 'needs_setup'; readonly missing: readonly GuidanceGap[]; readonly setup?: readonly GuidanceGap[] }
  | { readonly status: 'content_pending' }
  | { readonly status: 'source_error'; readonly detail: string; readonly incompleteSources?: readonly GuidanceIncompleteSource[] };

export function hasMatchingTrustedReceipt(result: TodayServerResult): result is ServerDecisionResult & { readonly status: 'ready'; readonly receipt: z.output<typeof receipt> } {
  return result.status === 'ready' && result.receipt !== undefined
    && result.receipt.status === 'ready'
    && result.receipt.requestId === result.requestId
    && result.receipt.inputFingerprint === result.inputFingerprint
    && result.decision.requestId === result.requestId;
}

export async function requestTodayGuidance(command: { readonly requestId: string; readonly goalId: 'basic_wash'; readonly currentCondition: CurrentConditionInput }): Promise<TodayServerResult> {
  const parsed = z.object({ requestId: uuid, goalId: z.literal('basic_wash'), currentCondition: z.unknown() }).strict().parse(command);
  if (!supabase) throw new Error('Today guidance is unavailable until the client is configured');
  const { data, error } = await supabase.functions.invoke('today-guidance', { body: parsed });
  if (error) throw new Error('Today guidance could not be loaded. Please try again.');
  const status = z.object({ status: z.string() }).passthrough().parse(data).status;
  if (status === 'content_pending') return { status };
  if (status === 'needs_setup') {
    return z.object({ status: z.literal('needs_setup'), missing: z.array(GuidanceGapSchema), setup: z.array(GuidanceGapSchema).optional() }).parse(data);
  }
  const value = provenance.parse(data);
  if (value.requestId !== parsed.requestId || value.decision.requestId !== parsed.requestId || value.decision.status !== status) throw new Error('Today guidance response did not match this request');
  if (status === 'ready') {
    const proof = receipt.parse((data as Record<string, unknown>).receipt);
    if (proof.requestId !== parsed.requestId || proof.inputFingerprint !== value.inputFingerprint) throw new Error('Today guidance receipt did not match this request');
    return { ...value, status, receipt: proof };
  }
  if (status === 'needs_input' || status === 'rule_conflict' || status === 'unsupported') return { ...value, status };
  throw new Error('Unknown Today guidance response');
}
