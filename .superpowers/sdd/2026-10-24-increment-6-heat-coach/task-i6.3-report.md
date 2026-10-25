# Task I6.3 report — trusted Heat Coach assessments

## outcome

Task I6.3 is complete in the local branch. It adds an owner-only, append-only assessment boundary whose caller supplies only a bounded heat intent, operation id, and exact reviewed-publication identity. The server constructs and stores the input, evaluates the decision, binds both to source revisions and a digest, and never publishes content.

## implementation

- `20261026120000_heat_coach_assessments.sql` creates an empty reviewed-rule registry, immutable owner assessments, private 30-day operation receipts, and create/get/list RPCs.
- Reads require an active authenticated owner. Foreign and random ids fail identically. Clients cannot read the rule registry or receipts and cannot write assessment rows directly.
- Request values, nested current-condition facts, zones, UUIDs, numeric ranges, and cursor shapes are validated at the database boundary.
- Repeated operations converge, changed replays conflict, same-intent creates converge under an advisory lock, and each owner is limited to 1,000 assessments. A refused 1,001st create leaves no receipt.
- Restore returns the stored decision verbatim and sets `stale` when source revisions or the exact published rule binding changed. It does not recompute history.
- JSON and CSV export advance to schema version 7 and include the exact input, result, publication binding, source revisions, fingerprint, timestamp, and revision. Account deletion cascades assessments and receipts. Assessment history remains for the life of the account; private receipts are eligible after 30 days.
- List pagination returns a deterministic `(createdAt, assessmentId)` continuation cursor and never repeats a row.

## test-first evidence

- Initial RED: 8/8 assessment tests failed because the tables and RPCs did not exist.
- Review REDs: malformed nested current-condition values were admitted; quota had no proof; explicit unheated input incorrectly required product/tool facts; and list returned no continuation cursor. Each regression test failed before its implementation change.
- Focused GREEN: 8 files passed and the opt-in concurrency file skipped; 146 tests passed and 1 skipped.
- Full coverage: 208 files passed, 7 skipped, and only `dependency-policy.test.ts` failed; 4521 tests passed and 30 skipped. The failure exactly reflects the separately reproduced dependency-policy HOLD.

## verification

- Node runtime: 24.19.0 PASS.
- Typecheck: PASS.
- ESLint with zero warnings: PASS.
- Web export: PASS.
- Control-plane audit: METADATA-PASS.
- Guidance research validation: PASS (`rows=2 catalogue=2 evidence=6`).
- `git diff --check`: clean.
- Scoped secret scan: clean.
- Dependency audit: HOLD, not PASS — 17 findings, 0 critical, 5 high, 9 moderate, 4 reviewed advisories; manifests and lockfiles are unchanged.

## security and privacy review

The final diff was reviewed for caller-controlled decisions, owner isolation, active-account enforcement, RLS/grants, SQL injection, search paths, idempotency, concurrent duplicate creation, quota residue, immutable history, export leakage, deletion, retention, and secret exposure. No open Critical, High, or Medium implementation finding remains in this task.

## honest limits and holds

- The real two-session PostgreSQL suite is opt-in, rejects non-loopback targets, and was not run because no approved disposable numeric-loopback DSN was supplied. Its skip is BLOCKED evidence, never a pass.
- The server currently marks catalogue products and tools `not_reviewed` with no verified capabilities. Therefore a heated route fails closed as `unavailable` until a later reviewed mapping connects exact published catalogue facts; no caller can manufacture an eligible item.
- `confirmedCareEvents` and the prepared activity/heat-history projection remain empty at this boundary because no trusted database projection yet emits the full domain `CareEvent` contract. This keeps the recent confirmed-heat count at zero and must be resolved before enabling an owner-facing “use this heat plan” action.
- Receipt cleanup exists but must be wired into the reviewed retention worker and alerting before public launch.
- No hosted migration, deployment, publication, reviewer identity, capability mapping, or production content was added.
