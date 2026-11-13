# Heat Coach content publication

This runbook governs Heat Coach rules only. It never authorizes a deployment, database write or hosted-service change. Production remains `content_pending` until every check below passes and the reviewed artifact is deliberately released through the normal application release process.

## Required review packet

For every rule, assemble one immutable packet containing:

- the exact `HeatRulePublication` JSON and its SHA-256 content digest;
- every exact product and tool version referenced by a named setting, capability prerequisite or alternative;
- claim-scoped evidence snapshots copied from the current evidence registry;
- explicit capability decisions for each exact product version;
- every owner-facing copy key and sentence;
- Human A's per-rule adoption decision, real name, timestamp and exact digest;
- Human B's independent approval decision, different real name, timestamp and the same exact digest.

The server stores a separate, immutable `heat_capability_publications` packet. It contains
approved `heat-protection` product and `heat-tool` tool bindings for exact active ZA
catalogue versions, each backed by reviewed claim-scoped evidence and an independent
row reviewer. A rule's `review_envelope` names that registry by id and digest and
contains the same evidence snapshot, reviewed copy, and both human decisions.
The rule content digest covers the executable rule. The reviewed content digest
covers that rule digest, evidence digest, copy digest, and registry id and digest.
Human A and B sign the reviewed content digest; copy rows bind to the rule digest.

`prepareHeatRuleReviewEnvelope` maps a validated TypeScript artifact to the SQL
packet shape. PostgreSQL recomputes every digest from stored JSONB and refuses a
packet whose values differ. The operator must calculate the database's exact
digests before obtaining real Human A/B decisions; synthetic test digests are
never publication evidence. There is no production packet or capability row today.

Evidence must be about the exact version. Product names, categories, ingredients, photographs, marketing claims and general articles cannot establish heat protection, temperature limits or suitable techniques. A tool label such as “Low” or “High” cannot establish a temperature.

## Human A review

Human A reads every cited source and either adopts or rejects each rule, numeric limit, restriction, capability and alternative. Adoption means the exact text and digest were reviewed. Editing any reviewed field changes the digest and invalidates the adoption.

## Human B review

Human B must be a different person. They reopen the original sources, verify the exact product/tool versions and evidence scope, then approve or reject the same digest. They also check that owner-facing copy does not say or imply “safe”, “risk-free”, “damage-free”, “guaranteed”, a diagnosis or medical advice.

## Validation checks

Use the preserved Node 24.19.x runtime and run:

```text
npm run validate:guidance-research
npx vitest run tests/domain/heat-rule-publication.test.ts tests/tooling/guidance-research.test.ts
npm run typecheck
npm run lint -- --max-warnings=0
```

The gate must refuse publication when:

- content is draft or withdrawn;
- either human decision is absent, rejected, placeholder, future-dated or performed by the same person;
- either review names a different digest;
- evidence was changed, withdrawn, is no longer independently reviewed, or does not cover every exact bound version;
- a capability is unknown, rejected, insufficient or lacks exact evidence;
- numeric limits cover only Celsius or only Fahrenheit;
- any used owner-facing copy key lacks its own independent review.
- the capability registry is missing, changed, withdrawn, or names a retired
  catalogue version; the server also rechecks the registry when assessing and
  marks affected historical decisions stale.
- the database packet omits evidence, copy, registry identity, or either
  distinct Human A/B approval, or its aggregate digest changes after review.

No command in this repository publishes Heat Coach content automatically. After the artifact and all gates are reviewed, a maintainer may include the reviewed artifact in a normal signed application release. That release is a separate authorized action.

## Withdrawal and incident rollback

If evidence, a product formulation, a tool version, copy or a rule becomes unreliable:

1. Change the publication set or affected rule to `withdrawn` in a new commit; never edit previously released history in place.
2. Run the validation and regression gates.
3. Release the withdrawal through the normal signed release process.
4. Record the incident, affected digest and release in the security/product ledger.
5. Keep historical decisions readable as historical, but prevent them from being restored as current guidance.

Rollback means releasing the last independently reviewed artifact or an empty draft. It never means bypassing the publication gate, reusing old reviewer timestamps for changed content, or deriving replacement limits from marketing material or general web articles.
