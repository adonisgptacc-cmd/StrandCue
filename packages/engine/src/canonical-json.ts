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

/** Hash the exact executable ruleset payload used by both compiler and evaluator. */
export function canonicalRulesetContentHash(ruleset: {
  readonly capabilities: unknown;
  readonly rules: unknown;
  readonly successorReview?: unknown;
}): string {
  const content = ruleset.successorReview === undefined
    ? { capabilities: ruleset.capabilities, rules: ruleset.rules }
    : { capabilities: ruleset.capabilities, rules: ruleset.rules, successorReview: ruleset.successorReview };
  return `sha256:${bytesToHex(
    sha256(utf8ToBytes(canonicalJson(content))),
  )}`;
}
