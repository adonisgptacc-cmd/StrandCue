# Repository recovery integration inventory

Date: 2026-10-04

Integration branch: `codex/repo-recovery-integration`

This record fixes the input boundary for the repository recovery reconciliation. The primary checkout at `C:\Users\ABADO\Desktop\StrandCue` remains untouched; reviewed changes are transferred selectively into the isolated integration worktree.

## Baseline

- Runtime: Node.js `v24.19.0`, npm `11.6.2` (the project rejects the host's Node.js 25 runtime).
- `npm ci`: completed; npm reported 30 dependency findings (10 moderate, 20 high).
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm test`: 337 passed, 3 skipped, 1 failed. The existing failure is `dependency audit CLI > accepts npm exit 1 when valid findings are covered by current exceptions` in `tests/tooling/dependency-policy.test.ts`; the helper returned exit code 1 instead of 0.

## Primary-checkout source candidates

These paths contain the recovery-session, username-selection, or related contract/test work that must be reviewed and transferred by relevant hunk rather than copied wholesale:

- `apps/mobile/app.json`
- `apps/mobile/src/auth.tsx`
- `apps/mobile/src/client.ts`
- `apps/mobile/src/contracts.ts`
- `apps/mobile/src/records.tsx`
- `tests/database/migration.test.ts`
- `tests/database/passport.test.ts`
- `tests/mobile/component-state.test.ts`
- `tests/mobile/contracts.test.ts`
- `tests/mobile/auth-recovery.test.ts`
- `supabase/migrations/20260925182000_username_options.sql`
- `supabase/migrations/20260930172000_username_schema_usage_repair.sql`
- `supabase/migrations/20260930173000_username_profile_lookup_repair.sql`

## Preserved local-only material

The following are deliberately excluded from the integration branch and remain in the primary checkout:

- emulator and Gmail screenshots (`*.png`)
- preview/debug application packages (`*.apk`)
- generated local Android project at `apps/mobile/android/`
- database backup artifacts at `backups/`
- ad-hoc `test-result*.txt` logs

## Merge policy

- `main` is authoritative for stabilization, verification, dependency policy, and CI tooling.
- `codex/repo-recovery` is authoritative for the complete product surface: Passport, Services, Activities, Shelf, Tools, History, and Settings.
- Supabase migrations are retained in chronological order and are never rewritten after application.
- Authentication and username work from the dirty primary checkout is transferred only after tests expose the missing behavior in the integrated tree.
- No push, pull request, remote database change, deployment, or update to `main` is authorized by this inventory.
