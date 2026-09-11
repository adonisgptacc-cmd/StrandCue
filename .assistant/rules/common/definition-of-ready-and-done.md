# Ready and done

Ready: accepted objective and spec, scope/non-goals, affected interfaces, uncertainty/edge cases, verification and access requirements, risk tier and authorization. For this task see the foundation design/plan in `docs/superpowers/`.

Each slice: red/green behavioural test evidence, typecheck, targeted integration/build checks, independent review, known limitations, and recorded decisions. `npm run verify` is the local fast gate; it is not full release certification.

Phase 1 release: all P1-AC-01–25 with evidence, domain/service coverage ≥80%, reproducible migrations, real Supabase ownership/API tests, real native recovery and primary journey tests, export/deletion/restore tests, accessibility/device/performance checks and no unresolved critical/high security/data-loss issue. Unrun is not passed. Synthetic fixtures do not establish real email delivery or backup recovery.
