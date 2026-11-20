import { createHash } from 'node:crypto';

/**
 * Independent expected-content hash for a compiled ruleset.
 *
 * It exists so a golden fixture can pin - and later re-derive - the SHA-256
 * digest of its own compiled ruleset without depending on the authoring bundle
 * that produced it.
 */
const sortKeys = (value: unknown): unknown => {
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
};

export const rulesetContentHash = (ruleset: { readonly capabilities: unknown; readonly rules: unknown }): string =>
  `sha256:${createHash('sha256')
    .update(JSON.stringify(sortKeys({ capabilities: ruleset.capabilities, rules: ruleset.rules })))
    .digest('hex')}`;
