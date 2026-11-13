# Task I5.3 report — treatment-programme state and due status

## Scope and result

Task I5.3 adds a pure, internal domain evaluator for treatment-programme state and due status. It combines a schema-validated enrolment, canonical I5.1 care events, I5.2 named-unit counting, an exact reviewed-rule publication binding and an explicit `asOf`. The module is intentionally absent from the public domain barrel. Task I5.4 must construct its inputs through an authenticated owner-scoped server join.

No persistence, API, mobile UI, reminder, product content or hosted-service change is included. No catalogue capability, treatment result, efficacy or medical conclusion is inferred.

## Trust and truth boundaries

- Only an execution-confirmed application with a known product and version matching the enrolment can start the programme.
- The enrolment and rule must match the exact reviewed artifact id, version and lowercase SHA-256 content digest. Draft and withdrawn rules fail closed.
- Maintenance is not self-asserted and stores no count. The evaluator derives the named-unit count from canonical events at the exact transition time, requires the reviewed threshold and ignores later events.
- Pause/resume records are lifecycle-consistent, chronologically ordered and bound to the exact reviewed resumption rule. Events inside the pause interval are excluded under `resume_from_pause`.
- Completed snapshots require the exact product, rule, publication, unit and range; unique canonically ordered evidence; full application-reference equality; and valid enrolment/application/completion/as-of chronology. The frozen evidence is returned without consulting later corrections.
- Oversized event arrays are rejected before deep parsing. Inputs are not mutated and all results are deeply frozen and deterministic.
- Task I5.4 must create completion snapshots server-side from the authenticated canonical-event and reviewed-publication join. It must never accept client-supplied authoritative counts, due states, publication bindings or snapshot evidence.

## TDD evidence

The original stalled branch recorded a genuine RED before its first implementation. The review correction rounds then added regressions that failed before the fixes for exact application binding, selected-application enforcement, publication binding, maintenance proof, pause/resume chronology, lifecycle combinations, start-date ordering, completed-snapshot integrity and preflight limits. Final focused result: 102/102 passing.

## Independent review

Fresh code-correctness and security/privacy reviewers each reviewed the unfinished implementation, then re-reviewed every correction round. Final verdicts: approved/verified with zero Critical, High or Medium findings.

Accepted Low conditions for I5.4:

- Apply database and API length limits to enrolment, snapshot and pause-reason identifiers.
- Build completion snapshots only on the server from authenticated owner-scoped facts and the exact reviewed rule publication.
- Add live database tests for the server join and immutable single-write snapshot behavior.
- The range and lifecycle thresholds remain independent reviewed facts; the UI must present both without converting them into an effectiveness claim.

## Verification

All commands use Node 24.19.0 from the pinned project runtime. Focused domain tests pass 102/102; domain typecheck and lint pass. Full coverage passes: 193 files passed / 5 skipped and 4204 tests passed / 22 skipped. Global coverage is 95.92 statements / 90.29 branches / 98.21 functions / 97.70 lines. `treatment-programme.ts` is 92.16 / 86.36 / 100 / 92.30, above the 80% per-file floor. Web export, control-plane metadata audit, research validation, typecheck, lint and diff checks pass. The dependency audit exits with `DEPENDENCY-POLICY-HOLD`: 0 critical, 19 high, 9 moderate, with root advisory findings and EAS/mutation runner review findings. It is recorded as HOLD, not PASS. The changed-file secret scan found no secret material.

## Requirements

TR-05 through TR-08 move from Not started to Partial. The deterministic mechanism is proven, but persistence, server joining, client UI, reviewed production treatment rules, hosted isolation and device evidence remain outstanding.

## External actions

Nothing was pushed, merged, deployed, published or applied to hosted Supabase, Cloudflare or GitHub. Task I5.4 was not started.