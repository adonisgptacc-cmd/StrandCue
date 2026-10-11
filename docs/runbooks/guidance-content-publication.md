# Guidance content publication

How a product or tool version, and the rule that uses it, becomes executable
guidance in StrandCue. This runbook governs the boundary between "a person
checked this" and "the app is allowed to say it".

The production registry lives in `apps/mobile/src/guidance/reviewed-bundle.ts`.
It is currently a **draft** bundle with no capability mappings and no rules,
because the repository contains no approved content artifact. Until reviewed
content is added and approved under this runbook, Today shows an honest
"content is still being prepared" state and generates nothing.

## The one rule

A capability comes into the app only through an **exact** `(kind, versionId)`
match in a published reviewed bundle. No capability may be inferred from a
brand, product name, category, ingredient list, free text, an image, a model
name, or anything a language model produced. An unmatched item stays unknown,
and unknown never satisfies a required capability.

## Before you start

You need, for each product or tool version:

- The exact catalogue `versionId`, brand, product name, variant, market and
  formulation where known. "The shampoo" is not an identity.
- The source for every fact you intend to assert, with the specific claim it
  supports.
- A named reviewer and the date of that review.

## Lifecycle

Every change moves through these states. Only `published` content can execute.

1. **draft** — being written. Not executable. This is the current state of the
   production registry.
2. **review** — a second reviewer has independently checked each capability
   and each rule against its evidence, and recorded their name and date.
3. **published** — approved and executable. Published content is immutable: a
   published entry is never edited in place.
4. **withdrawn / superseded** — no longer executable.

An independent content review (a second reviewer who did not write the entry)
is required before changing `CURRENT_REVIEWED_BUNDLE` to `published`, and
before any release stage past Technical Alpha. A single author cannot publish
their own capability mappings.

## Adding a capability entry

Add to `capabilities` in `reviewed-bundle.ts`:

```ts
{
  kind: 'product',            // 'product' | 'tool'
  versionId: '<exact catalogue version id>',
  displayName: 'Manufacturer product name',
  verifiedCapabilities: ['mild-cleanse'],
  evidenceIds: ['<evidence id>'],
  status: 'published',        // requires evidenceIds to be non-empty
  reviewedAt: '<ISO timestamp of review>',
}
```

The schema enforces: a unique `(kind, versionId)` per bundle, non-empty
evidence for every published entry, and no duplicate capability names. The
publication gate in `packages/domain/src/guidance/reviewed-content.ts` refuses
anything draft, withdrawn, malformed, unevidenced, or reviewed after `now`.

## Adding a rule

Rules use the typed condition/effect DSL in
`packages/domain/src/recommendations/`. No arbitrary database JavaScript and
no prompt-authored executable rule may be added. Every published rule needs
`evidenceIds`, a plain-language `reason`, and a status.

**Every published rule requires a regression fixture.** Add a case to
`tests/domain/recommendations/` that exercises the rule and asserts the
decision it produces. A rule without a fixture is not publishable.

## Prohibited content

Guidance is cosmetic hair care. The following are never publishable:

- Any diagnosis, medical treatment, medication advice, or claim about a
  condition, and any promise or guarantee of an outcome.
- Ingredient-based claims of efficacy, "toxicity", overload, or harm.
- Commercial variables of any kind — price, discount, affiliate link,
  sponsorship, retailer, brand size, or popularity — as ranking or selection
  inputs.
- Capabilities inferred from a name, brand, category, image or free text.
- Silently replace a published rule or capability entry in place. Never
  replace published content: to change behaviour, publish a new version,
  withdraw the old one, and keep the history.

## Withdrawal

To withdraw a capability or rule, set its `status` to `withdrawn`. A withdrawn
entry cannot supply capabilities and its rule stops executing. Published
history is preserved: never rewrite or delete a published entry, because stored
decision runs reference the exact versions that produced them.

A withdrawal triggers a regression run over affected owners' open plans and
flags them stale with an explanation. Completed plans are never rewritten.

## Definition of done for a publication

- Exact identity recorded for every product and tool version.
- Evidence recorded for every published capability entry and rule, with
  reviewer and date.
- A regression fixture for every published rule.
- `npm test` green, including the governance tests in
  `tests/tooling/guidance-governance.test.ts`.
- Independent content review recorded before the bundle is set to `published`.