import { z } from 'zod';
import { DecisionStatusSchema } from '../contracts.ts';

/**
 * The outcome of replaying one historical case against a candidate ruleset.
 *
 * `pinnedRulesetHash` and `candidateRulesetHash` are the stable references
 * that tie the comparison to the exact ruleset versions involved: the hash the
 * historical decision was pinned to, and the hash of the ruleset that was
 * evaluated against it.
 */
export const ReplayCaseOutcomeSchema = z.object({
  caseId: z.string().min(1),
  /** True when the candidate ruleset produced a different decision. */
  changed: z.boolean(),
  /** True when the historical decision is still exactly reproducible from its own pinned ruleset. */
  pinnedReplayReproduced: z.boolean(),
  /** Older history is never silently reinterpreted by a different evaluator or decoder. */
  pinnedReplayStatus: z.enum(['reproduced', 'mismatch', 'unsupported_version']),
  pinnedRulesetHash: z.string().min(1),
  candidateRulesetHash: z.string().min(1),
  previousStatus: DecisionStatusSchema,
  candidateStatus: DecisionStatusSchema,
  statusChanged: z.boolean(),
  addedStepIds: z.array(z.string().min(1)).readonly(),
  removedStepIds: z.array(z.string().min(1)).readonly(),
  addedOmissionCandidateIds: z.array(z.string().min(1)).readonly(),
  removedOmissionCandidateIds: z.array(z.string().min(1)).readonly(),
}).strict().readonly();

export type ReplayCaseOutcome = z.infer<typeof ReplayCaseOutcomeSchema>;

/**
 * The report of one replay run. It carries the candidate ruleset identity and
 * the per-case differences, and nothing else: no owner snapshot, no stored
 * decision and no external reference is written to it.
 */
export const ReplayReportSchema = z.object({
  candidateRulesetId: z.string().min(1),
  candidateRulesetHash: z.string().min(1),
  changedCaseIds: z.array(z.string().min(1)).readonly(),
  cases: z.array(ReplayCaseOutcomeSchema).readonly(),
}).strict().readonly();

export type ReplayReport = z.infer<typeof ReplayReportSchema>;
