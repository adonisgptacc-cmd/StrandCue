# Unverified Phase 1 milestone migrations

These SQL files were committed during the 18–19 September milestone drafts but do not form a replayable or security-reviewed migration chain. They must not be applied to development, staging, or production databases.

The first known replay failure is `20260918154920_user_products_revisions.sql`, which contains invalid SQL (`GRANT ... USING`) and references nonexistent revision columns. Later files have not earned execution trust merely because an earlier failure prevented them from running.

promotion requires a capability-specific migration test, fresh replay through the non-superuser migration harness, RLS/API tests, and review against the 23 September product authority. Presence in this directory preserves investigation material and does not constitute completion evidence.

Promotion requires a capability-specific migration test, fresh replay through the non-superuser migration harness, RLS/API tests, and review against the 23 September product authority. Presence in this directory preserves investigation material and does not constitute completion evidence.
