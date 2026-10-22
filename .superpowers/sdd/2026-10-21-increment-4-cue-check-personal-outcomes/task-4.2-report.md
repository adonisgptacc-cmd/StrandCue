# Task 4.2 report — owner-only append-only Cue Check persistence

## Result

Task 4.2 is implemented locally. Cue Checks bind to one owner's terminal stored execution and trusted
recommendation run. Only confirmed execution steps become recorded actual use. Corrections and voids
append history; owners cannot rewrite it directly. The records and revisions are included in export v5
and are removed by the existing account-deletion cascade.

## Security and integrity boundary

- Forced RLS on both owner tables and the private operation ledger.
- Authenticated owners receive read-only table access; all mutations use invoker wrappers and pinned
  definer cores. Anonymous execution and direct writes are revoked.
- Missing, foreign and random execution or record identifiers have indistinguishable results.
- Operation IDs are owner-scoped and converge only for an identical payload.
- One active observation per execution and timing, ten lifetime records per execution and timing, and
  fifty content revisions per record are enforced. A final void audit event remains available.
- Published product/tool authority, reviewed guidance and recommendation/execution rows remain unchanged.

## Verification

- Genuine RED: 49 failed / 2 passed before the migration existed.
- Focused persistence: 51/51 pass.
- Cue Check, export, deletion and migration inventory: 102/102 pass.
- Full database suite: 28 files passed / 4 skipped; 709 passed / 18 skipped.
- Migration compatibility, hardening, two owner-isolation runners, Shelf and tool publication: 154/154.
- Full coverage: 177 files passed / 4 skipped; 3637 passed / 18 skipped; 95.88% statements,
  89.97% branches, 98.1% functions and 97.78% lines.
- Runtime, typecheck, lint, web export, control-plane audit and diff check pass. The dependency audit
  remains HOLD with 0 critical, 19 high and 9 moderate findings; no dependency file changed here.

## Remaining boundary

Task 4.3 must add the mobile API and state machine. Task 4.4 must add accessible capture, correction,
void, Journey history and honest summary surfaces. No hosted migration, content publication or device
claim is part of Task 4.2.
