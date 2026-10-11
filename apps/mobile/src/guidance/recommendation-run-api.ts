import { z } from 'zod';

import { supabase } from '../client';

/**
 * Owner-scoped persistence boundary for private decision runs.
 *
 * The caller never supplies an owner id: the database takes the owner from
 * `auth.uid()`. This module only validates and forwards, so a bug here can
 * never write another owner's row.
 */

const RunStatusSchema = z.enum([
  'needs_setup',
  'content_pending',
  'ready',
  'needs_input',
  'rule_conflict',
  'unsupported',
  'source_error',
]);

const RecommendationRunCommandSchema = z
  .object({
    requestId: z.string().uuid(),
    inputFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    asOf: z.iso.datetime({ offset: true }),
    engineVersion: z.string().trim().min(1).max(40),
    bundleId: z.string().trim().min(1).max(120),
    bundleVersion: z.string().trim().min(1).max(40),
    status: RunStatusSchema,
    input: z.record(z.string(), z.unknown()),
    decision: z.record(z.string(), z.unknown()),
  })
  .strict();

const RecommendationRunReceiptSchema = z
  .object({
    id: z.string().uuid(),
    requestId: z.string().uuid(),
    inputFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
    status: RunStatusSchema,
    engineVersion: z.string().trim().min(1).max(40),
    bundleId: z.string().trim().min(1).max(120),
    bundleVersion: z.string().trim().min(1).max(40),
    createdAt: z.string(),
  })
  .strict();

export type RecommendationRunCommand = z.output<typeof RecommendationRunCommandSchema>;
export type RecommendationRunReceipt = z.output<typeof RecommendationRunReceiptSchema>;

/**
 * Stable messages for the database errors this boundary can raise. The caller
 * (Today) shows "Plan created, audit save failed" for any of them rather than
 * pretending the plan was saved.
 */
const STABLE_ERRORS: Readonly<Record<string, string>> = {
  'run-conflict': 'run-conflict',
  'payload-too-large': 'payload-too-large',
  'unknown-status': 'unknown-status',
  'account-not-active': 'account-not-active',
  'authentication-required': 'authentication-required',
};

export async function recordRecommendationRun(
  run: unknown,
): Promise<RecommendationRunReceipt> {
  const command = RecommendationRunCommandSchema.parse(run);
  if (!supabase) throw new Error('Recommendation runs are unavailable until the client is configured');
  const { data, error } = await supabase.rpc('record_recommendation_run', {
    p_request_id: command.requestId,
    p_input_fingerprint: command.inputFingerprint,
    p_as_of: command.asOf,
    p_engine_version: command.engineVersion,
    p_bundle_id: command.bundleId,
    p_bundle_version: command.bundleVersion,
    p_status: command.status,
    p_input: command.input,
    p_decision: command.decision,
  });
  if (error) {
    const stable = STABLE_ERRORS[error.message];
    throw new Error(stable === undefined ? error.message : stable);
  }
  return RecommendationRunReceiptSchema.parse(data);
}