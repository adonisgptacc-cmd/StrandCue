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

export interface PreferCapabilityEffect {
  readonly kind: 'prefer_capability';
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
