/**
 * The closed capability vocabulary of the first reviewed slice.
 *
 * A product or tool version only ever carries one of these names, and only
 * through a published reviewed registry entry backed by reviewed evidence for
 * the exact version. Nothing here is derived from a name, a category, an
 * ingredient list or a model output: the vocabulary states what may be claimed,
 * never that it is claimed.
 *
 * The generic recommendation engine keeps its own reusable string capability
 * types. This vocabulary is applied at the reviewed-guidance boundary only, so
 * that a new slice can widen the vocabulary without touching the engine.
 */

export const BASIC_WASH_CAPABILITIES = ['cleanse', 'condition'] as const;

export type GuidanceCapability = (typeof BASIC_WASH_CAPABILITIES)[number];

export function isGuidanceCapability(value: string): value is GuidanceCapability {
  return (BASIC_WASH_CAPABILITIES as readonly string[]).includes(value);
}
