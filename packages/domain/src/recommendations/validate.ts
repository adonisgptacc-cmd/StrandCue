import { RecommendationContextSchema } from './schemas.ts';
import type {
  ProductCandidate,
  RecommendationContext,
  RecommendationRule,
  ToolCandidate,
} from './types.ts';

export type RecommendationValidationErrorCode =
  | 'duplicate-rule-version'
  | 'duplicate-product-version'
  | 'duplicate-tool-version'
  | 'published-rule-without-evidence';

export class RecommendationValidationError extends Error {
  readonly code: RecommendationValidationErrorCode;

  constructor(code: RecommendationValidationErrorCode, message: string) {
    super(message);
    this.name = 'RecommendationValidationError';
    this.code = code;
  }
}

function assertUniqueVersions<T>(
  items: readonly T[],
  pick: (item: T) => readonly [string, string],
  code: RecommendationValidationErrorCode,
  label: string,
): void {
  const seen = new Set<string>();
  for (const item of items) {
    const [identity, version] = pick(item);
    const key = `${identity}\u0000${version}`;
    if (seen.has(key)) {
      throw new RecommendationValidationError(
        code,
        `${label} ${identity} repeats version ${version}`,
      );
    }
    seen.add(key);
  }
}

function assertPublishedEvidence(rules: readonly RecommendationRule[]): void {
  for (const rule of rules) {
    if (rule.status === 'published' && rule.evidenceIds.length === 0) {
      throw new RecommendationValidationError(
        'published-rule-without-evidence',
        `Published rule ${rule.ruleId} requires at least one evidence reference`,
      );
    }
  }
}

export function parseRecommendationContext(input: unknown): RecommendationContext {
  const parsed = RecommendationContextSchema.parse(input);
  const products: readonly ProductCandidate[] = parsed.products;
  const tools: readonly ToolCandidate[] = parsed.tools;
  const rules: readonly RecommendationRule[] = parsed.rules;
  assertUniqueVersions(rules, rule => [rule.ruleId, rule.versionId], 'duplicate-rule-version', 'Recommendation rule');
  assertUniqueVersions(products, product => [product.productId, product.versionId], 'duplicate-product-version', 'Product candidate');
  assertUniqueVersions(tools, tool => [tool.toolId, tool.versionId], 'duplicate-tool-version', 'Tool candidate');
  assertPublishedEvidence(rules);
  return { ...parsed, products, tools, rules };
}
