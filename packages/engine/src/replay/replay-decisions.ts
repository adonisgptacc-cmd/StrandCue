import type { CompiledRuleset, EngineDecision } from '../contracts.ts';
import { evaluateDecision } from '../pipeline/index.ts';
import type { ReplayCase } from './replay-case.ts';
import type { ReplayCaseOutcome, ReplayReport } from './replay-report.ts';
import { ReplayReportSchema } from './replay-report.ts';

/** Recursively sorts object keys so two structurally equal values compare equal. */
const sortKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] !== undefined) sorted[key] = sortKeys(source[key]);
    }
    return sorted;
  }
  return value;
};

const canonical = (value: unknown): string => JSON.stringify(sortKeys(value));

/**
 * The decision content that a ruleset change can affect.
 *
 * The pinned ruleset identity is deliberately excluded: it is expected to
 * differ between the historical decision and the candidate run, and it is
 * reported separately as a stable hash reference. Everything else - status,
 * steps, omissions, alternatives, questions, heat assessment, confidence and
 * the stage trace - is compared.
 */
const decisionContent = (decision: EngineDecision): unknown => ({
  status: decision.status,
  steps: decision.steps,
  omissions: decision.omissions,
  alternatives: decision.alternatives,
  questions: decision.questions,
  heatAssessment: decision.heatAssessment,
  confidence: decision.confidence,
  audit: {
    evaluatedAt: decision.audit.evaluatedAt,
    schemaVersion: decision.audit.schemaVersion,
    evaluatorVersion: decision.audit.evaluatorVersion,
    trace: decision.audit.trace,
  },
});

const difference = (left: readonly string[], right: readonly string[]): readonly string[] =>
  left.filter((value) => !right.includes(value));

const replayCaseOutcome = (replayCase: ReplayCase, candidate: CompiledRuleset): ReplayCaseOutcome => {
  const pinnedDecision = evaluateDecision(replayCase.input);
  const candidateDecision = evaluateDecision({ ...replayCase.input, ruleset: candidate });

  const previousStepIds = replayCase.decision.steps.map((step) => step.stepId);
  const candidateStepIds = candidateDecision.steps.map((step) => step.stepId);
  const previousOmissionIds = replayCase.decision.omissions.map((omission) => omission.candidateId);
  const candidateOmissionIds = candidateDecision.omissions.map((omission) => omission.candidateId);

  return {
    caseId: replayCase.caseId,
    changed: canonical(decisionContent(replayCase.decision)) !== canonical(decisionContent(candidateDecision)),
    pinnedReplayReproduced: canonical(pinnedDecision) === canonical(replayCase.decision),
    pinnedRulesetHash: replayCase.input.ruleset.ref.contentHash,
    candidateRulesetHash: candidate.ref.contentHash,
    previousStatus: replayCase.decision.status,
    candidateStatus: candidateDecision.status,
    statusChanged: replayCase.decision.status !== candidateDecision.status,
    addedStepIds: difference(candidateStepIds, previousStepIds),
    removedStepIds: difference(previousStepIds, candidateStepIds),
    addedOmissionCandidateIds: difference(candidateOmissionIds, previousOmissionIds),
    removedOmissionCandidateIds: difference(previousOmissionIds, candidateOmissionIds),
  };
};

/**
 * Replays historical decisions against a candidate ruleset.
 *
 * For every case the historical input is evaluated twice: once against its own
 * pinned ruleset, to prove the historic decision is still exactly reproducible,
 * and once against the candidate ruleset, to report the difference.
 *
 * The function is pure. It reads no clock, no storage, no network and no owner
 * snapshot, and it never mutates the cases it is given.
 */
export function replayDecisions(cases: readonly ReplayCase[], candidate: CompiledRuleset): ReplayReport {
  const outcomes = cases.map((replayCase) => replayCaseOutcome(replayCase, candidate));
  return ReplayReportSchema.parse({
    candidateRulesetId: candidate.ref.rulesetId,
    candidateRulesetHash: candidate.ref.contentHash,
    changedCaseIds: outcomes.filter((outcome) => outcome.changed).map((outcome) => outcome.caseId),
    cases: outcomes,
  });
}
