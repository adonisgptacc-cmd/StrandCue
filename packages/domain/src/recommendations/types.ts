export type Confidence = 'high' | 'moderate' | 'limited';

export type RuleStrength = 'hard' | 'advisory';

export type RuleStatus = 'published' | 'withdrawn';

export type FactValue = string | number | boolean | null;

export interface AllCondition {
  readonly kind: 'all';
  readonly conditions: readonly RecommendationCondition[];
}

export interface AnyCondition {
  readonly kind: 'any';
  readonly conditions: readonly RecommendationCondition[];
}

export interface NotCondition {
  readonly kind: 'not';
  readonly condition: RecommendationCondition;
}

export interface FactEqualsCondition {
  readonly kind: 'fact_equals';
  readonly fact: string;
  readonly value: FactValue;
}

export interface FactInCondition {
  readonly kind: 'fact_in';
  readonly fact: string;
  readonly values: readonly FactValue[];
}

export interface CapabilityAvailableCondition {
  readonly kind: 'capability_available';
  readonly capability: string;
}

export type RecommendationCondition =
  | AllCondition
  | AnyCondition
  | NotCondition
  | FactEqualsCondition
  | FactInCondition
  | CapabilityAvailableCondition;

export interface RequireCapabilityEffect {
  readonly kind: 'require_capability';
  readonly capability: string;
}

export interface ExcludeCapabilityEffect {
  readonly kind: 'exclude_capability';
  readonly capability: string;
}

export interface OrderBeforeEffect {
  readonly kind: 'order_before';
  readonly before: string;
  readonly after: string;
}

export interface OrderAfterEffect {
  readonly kind: 'order_after';
  readonly before: string;
  readonly after: string;
}

export interface WaitEffect {
  readonly kind: 'wait';
  readonly durationSeconds: number;
}

export interface RinseEffect {
  readonly kind: 'rinse';
  readonly value: boolean;
}

export type FrequencyUnit =
  | 'application'
  | 'shampoo_session'
  | 'wash_session'
  | 'calendar_time';

export interface FrequencyEffect {
  readonly kind: 'frequency';
  readonly unit: FrequencyUnit;
  readonly min?: number;
  readonly max?: number;
}

export type HeatExposure =
  | 'direct_contact'
  | 'heated_air'
  | 'hooded_heat'
  | 'steam';

export interface HeatRestrictionEffect {
  readonly kind: 'heat_restriction';
  readonly exposure: HeatExposure;
  readonly prohibited: boolean;
  readonly maxTemperatureCelsius?: number;
}

export interface AssessedHeatActionEffect {
  readonly kind: 'assessed_heat_action';
  readonly publicationId: string;
  readonly publicationDigest: string;
}

export interface PreferCapabilityEffect {
  readonly kind: 'prefer_capability';
  readonly capability: string;
}

export interface ActivationEffect {
  readonly kind: 'activation';
  readonly capability: string;
}

export type RecommendationEffect =
  | RequireCapabilityEffect
  | ExcludeCapabilityEffect
  | OrderBeforeEffect
  | OrderAfterEffect
  | WaitEffect
  | RinseEffect
  | FrequencyEffect
  | HeatRestrictionEffect
  | AssessedHeatActionEffect
  | ActivationEffect
  | PreferCapabilityEffect;

export interface RecommendationRule {
  readonly ruleId: string;
  readonly versionId: string;
  readonly status: RuleStatus;
  readonly strength: RuleStrength;
  readonly condition: RecommendationCondition;
  readonly effects: readonly RecommendationEffect[];
  readonly reason: string;
  readonly evidenceIds: readonly string[];
}

export interface ProductCandidate {
  readonly productId: string;
  readonly versionId: string;
  readonly name: string;
  readonly owned: boolean;
  readonly available: boolean;
  readonly verifiedCapabilities: readonly string[];
  readonly unknownCapabilities: readonly string[];
}

export interface ToolCandidate {
  readonly toolId: string;
  readonly versionId: string;
  readonly name: string;
  readonly available: boolean;
  readonly verifiedCapabilities: readonly string[];
}

export interface RecommendationContext {
  readonly requestId: string;
  readonly asOf: string;
  readonly goal: string;
  readonly profileFacts: Readonly<Record<string, FactValue>>;
  readonly products: readonly ProductCandidate[];
  readonly tools: readonly ToolCandidate[];
  readonly historyFacts: Readonly<Record<string, FactValue>>;
  readonly environmentFacts: Readonly<Record<string, FactValue>>;
  readonly rules: readonly RecommendationRule[];
}

export type RuleOutcome = 'applied' | 'not_applicable' | 'unknown' | 'withdrawn';

export interface RuleEvaluation {
  readonly ruleId: string;
  readonly versionId: string;
  readonly outcome: RuleOutcome;
  readonly missingFacts: readonly string[];
  readonly reason: string;
}

export interface RulesEvaluation {
  readonly applied: readonly RuleEvaluation[];
  readonly notApplicable: readonly RuleEvaluation[];
  readonly unknown: readonly RuleEvaluation[];
  readonly withdrawn: readonly RuleEvaluation[];
}

export type DecisionStatus = 'ready' | 'needs_input' | 'rule_conflict' | 'unsupported';

export interface ProtocolStep {
  readonly stepId: string;
  readonly position: number;
  readonly action: string;
  readonly productId: string | null;
  readonly productVersionId: string | null;
  readonly toolId: string | null;
  readonly toolVersionId: string | null;
  readonly waitSeconds: number | null;
  readonly rinse: boolean | null;
  readonly reasons: readonly string[];
  readonly heatActionRef?: {
    readonly publicationId: string;
    readonly publicationDigest: string;
  };
}

export interface EffectConflict {
  readonly kind: 'capability' | 'heat' | 'order' | 'frequency';
  readonly detail: string;
  readonly ruleRefs: readonly string[];
}

export interface AuditRuleEntry {
  readonly ruleId: string;
  readonly versionId: string;
  readonly outcome: RuleOutcome;
  readonly reason: string;
  readonly evidenceIds: readonly string[];
}

export interface RankedCandidateEntry {
  readonly candidateId: string;
  readonly kind: 'product' | 'tool';
  readonly versionId: string;
  readonly selected: boolean;
  readonly hardPass: boolean;
  readonly verifiedCoverage: number;
  readonly advisoryMatches: number;
  readonly owned: boolean;
  readonly available: boolean;
}

export interface RejectedCandidateEntry {
  readonly candidateId: string;
  readonly kind: 'product' | 'tool';
  readonly versionId: string;
  readonly name: string;
  readonly reasons: readonly string[];
}

export interface AppliedRestriction {
  readonly ruleRef: string;
  readonly description: string;
}

export interface RecommendationAudit {
  readonly requestId: string;
  readonly engineVersion: string;
  readonly evaluatedRules: readonly AuditRuleEntry[];
  readonly conflicts: readonly EffectConflict[];
  readonly rankedCandidates: readonly RankedCandidateEntry[];
  readonly rejectedCandidates: readonly RejectedCandidateEntry[];
  readonly restrictions: readonly AppliedRestriction[];
  readonly missingInputs: readonly string[];
}

/** Immutable identity of the reviewed Heat Coach assessment used for this run. */
export interface HeatAssessmentBinding {
  readonly assessmentId: string;
  readonly sourceFingerprint: string;
  readonly publicationId: string;
  readonly publicationDigest: string;
}

export interface ProtocolDecision {
  readonly status: DecisionStatus;
  readonly requestId: string;
  readonly confidence: Confidence;
  readonly noPurchaseNeeded: boolean | null;
  readonly steps: readonly ProtocolStep[];
  readonly omissions: readonly string[];
  readonly alternatives: readonly string[];
  readonly missingInputs: readonly string[];
  readonly audit: RecommendationAudit;
  readonly heatAssessmentBinding?: HeatAssessmentBinding;
}
