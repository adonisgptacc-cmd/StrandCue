import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils';

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    const source = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(source)
        .filter((key) => source[key] !== undefined)
        .sort()
        .map((key) => [key, sortKeys(source[key])]),
    );
  }
  return value;
}

export function canonicalJson(value: unknown): string {
  const serialized = JSON.stringify(sortKeys(value));
  if (serialized === undefined) throw new TypeError('Cannot canonicalize an undefined value');
  return serialized;
}

function contentSuccessorReview(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return value;
  const review = value as Record<string, unknown>;
  if (!Array.isArray(review.authorizations)) return review;
  return {
    ...review,
    authorizations: review.authorizations.map((authorization) => {
      if (authorization === null || typeof authorization !== 'object' || Array.isArray(authorization)) {
        return authorization;
      }
      return Object.fromEntries(Object.entries(authorization)
        .filter(([key]) => key !== 'authorId' && key !== 'reviewerId'));
    }),
  };
}

/**
 * Hash executable ruleset content. Successor A/B identities are omitted because
 * publication anonymizes them; the immutable packet digest and approval rows
 * bind the opaque packet references to the authenticated reviewers.
 */
export function canonicalRulesetContentHash(ruleset: {
  readonly capabilities: unknown;
  readonly rules: unknown;
  readonly successorReview?: unknown;
}): string {
  const content = ruleset.successorReview === undefined
    ? { capabilities: ruleset.capabilities, rules: ruleset.rules }
    : {
        capabilities: ruleset.capabilities,
        rules: ruleset.rules,
        successorReview: contentSuccessorReview(ruleset.successorReview),
      };
  return `sha256:${bytesToHex(
    sha256(utf8ToBytes(canonicalJson(content))),
  )}`;
}
