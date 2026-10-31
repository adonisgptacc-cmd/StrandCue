# Activity draft disposition — 23 September 2026

Commit `53a88a5` preserved four Activity UI drafts. They were not routed from `apps/mobile/app/index.tsx` or `apps/mobile/src/records.tsx`, did not compile, imported unsupported React Native controls, and performed direct table writes to `activities` and `activity_revisions`. Those writes bypassed the immutable operation, correction, ownership, and idempotency boundary required by the current Phase 1 design.

The files were removed from the production TypeScript surface during baseline recovery. Their Git history and domain/schema ideas remain available for review. No behavior from those files is treated as implemented or verified. Activity recording, correction, voiding, heat facts, drafts, duplicate review, and history integration will be rebuilt through the separate Activity implementation plan.
