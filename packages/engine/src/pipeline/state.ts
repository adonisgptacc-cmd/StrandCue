import type {
  DecisionAlternative,
  DecisionOmission,
  DecisionStep,
  EngineInput,
  EngineStageId,
  HeatAssessmentState,
  SnapshotFact,
  StageTraceEntry,
} from '../contracts.js';
import { ENGINE_STAGE_IDS } from '../contracts.js';

export const ENGINE_EVALUATOR_VERSION = '1.0.1';
export const ENGINE_SCHEMA_VERSION = '1.0.0';

export type FactResolution = 'verified' | 'unknown' | 'expired' | 'withdrawn' | 'contradictory' | 'missing';
export interface ResolvedFact {
  readonly factId: string;
  readonly resolution: FactResolution;
  readonly fact: SnapshotFact | undefined;
}

export interface Provenance {
  readonly ruleIds: readonly string[];
  readonly claimIds: readonly string[];
  readonly evidenceIds: readonly string[];
}

export interface Blocker extends Provenance {
  readonly reasonCode: string;
}

export type QuestionOrigin = 'rule' | 'fact' | 'heat';
export interface PendingQuestion {
  readonly questionId: string;
  readonly reasonCode: string;
  readonly neededFactIds: readonly string[];
  readonly origin: QuestionOrigin;
  readonly stageIndex: number;
}

export interface CandidateRecord {
  readonly candidateId: string;
  /** Sum of severity weights of the rules that include the candidate. */
  readonly suitability: number;
  readonly provenance: Provenance;
}

export interface TreatmentSummary {
  readonly eventTypes: readonly { readonly eventType: string; readonly count: number; readonly latestHappenedAt: string }[];
}

export interface PrerequisiteRequirement {
  readonly prerequisiteId: string;
  readonly hard: boolean;
  readonly provenance: Provenance;
}

export interface WaitRequirement {
  readonly afterActionId: string;
  readonly minutes: number;
  readonly provenance: Provenance;
}

export interface DependencyEdge {
  readonly from: string;
  readonly to: string;
  readonly provenance: Provenance;
}

export interface DependencyGraph {
  /** Selected candidate ids in rank order. */
  readonly nodes: readonly string[];
  readonly edges: readonly DependencyEdge[];
  readonly waits: ReadonlyMap<string, { readonly minutes: number; readonly provenance: Provenance }>;
}

export interface NoProtocolReason extends Provenance {
  readonly reasonCode: string;
}

export interface PipelineState {
  readonly input: EngineInput;
  readonly evaluatedAtMs: number;
  readonly halted: boolean;
  readonly trace: readonly StageTraceEntry[];
  readonly blockers: readonly Blocker[];
  readonly questions: readonly PendingQuestion[];
  readonly noProtocol: readonly NoProtocolReason[];
  readonly facts: ReadonlyMap<string, ResolvedFact>;
  readonly treatment: TreatmentSummary;
  readonly candidates: ReadonlyMap<string, CandidateRecord>;
  readonly omissions: readonly DecisionOmission[];
  readonly alternatives: readonly DecisionAlternative[];
  readonly heat: HeatAssessmentState | undefined;
  readonly heatRelevant: boolean;
  /** Heat states established by fired rules, kept until the strictest is chosen. */
  readonly heatSignals: readonly { readonly state: HeatAssessmentState; readonly provenance: Provenance }[];
  readonly ranking: readonly string[];
  readonly requirements: readonly PrerequisiteRequirement[];
  readonly waits: readonly WaitRequirement[];
  readonly graph: DependencyGraph | undefined;
  readonly steps: readonly DecisionStep[];
}

export type StageFunction = (state: PipelineState) => PipelineState;

export const stageIndexOf = (stageId: EngineStageId): number => ENGINE_STAGE_IDS.indexOf(stageId);

/** Locale-independent code-point ordering so results never depend on the host. */
export const compareStrings = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0);

export const uniqueSorted = (values: readonly string[]): readonly string[] =>
  [...new Set(values)].sort(compareStrings);

export const EMPTY_PROVENANCE: Provenance = { ruleIds: [], claimIds: [], evidenceIds: [] };

export const mergeProvenance = (...parts: readonly Provenance[]): Provenance => ({
  ruleIds: uniqueSorted(parts.flatMap((part) => part.ruleIds)),
  claimIds: uniqueSorted(parts.flatMap((part) => part.claimIds)),
  evidenceIds: uniqueSorted(parts.flatMap((part) => part.evidenceIds)),
});
