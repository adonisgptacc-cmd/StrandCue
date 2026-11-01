/**
 * The engine's content hash for a compiled ruleset.
 *
 * This mirrors `stableHash` in `packages/engine/src/rules/compile-rules.ts`:
 * FNV-1a over the canonical JSON of `{ capabilities, rules }`. It exists so a
 * golden fixture can pin - and later re-derive - the hash of its own compiled
 * ruleset without depending on the authoring bundle that produced it.
 *
 * The arithmetic is intentionally identical to the engine's, including the
 * non-`Math.imul` multiplication, so both produce the same value.
 */
export const rulesetContentHash = (ruleset: { readonly capabilities: unknown; readonly rules: unknown }): string => {
  const canonical = JSON.stringify({ capabilities: ruleset.capabilities, rules: ruleset.rules });
  let hash = 2166136261;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = (hash * 16777619) >>> 0;
  }
  return `sha256:${hash.toString(16).padStart(8, '0')}`;
};
