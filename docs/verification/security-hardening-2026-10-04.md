# Local security hardening, 2026-10-04

The forward migration `20261004104838_activity_zone_bounds.sql` replaces only the existing private activity-zone validator. It rejects null/non-string fields and unknown keys, and bounds new collections at 36 entries (six regions by six segments) before iteration. The client command and patch schemas use the same bound. Existing activity read models remain unbounded for historical compatibility. No persisted history, existing migrations, grants, owners, credentials or hosted settings were changed.

## Evidence

- Database tests first demonstrated that four invalid payloads were accepted. Domain tests first demonstrated two invalid commands were accepted.
- Focused activity, hardening and migration-inventory replay: 27 tests passed. Domain/mobile activity: 23 tests passed.
- Full suite at this point: 599 passed, 3 skipped, one failure in `assetlinks.test.ts` because its assertion demands a real signing fingerprint while the runbook contains a release placeholder. This security patch does not resolve that separate release-configuration contract.
- Synthetic PGlite replay checks ownership isolation, forced RLS, fixed search paths, anonymous routine denial, no direct consumer table writes and mutator containment. Hosted Postgres/API behavior remains a separate gate.

## Remaining release gates

- `deletion_purge` removes application profiles/dependants; the migration explicitly leaves Auth identity removal to the service-role Admin API operations step. Establish and test a worker/runbook that revokes refresh sessions, removes the Auth identity after dependent data, and records retries. The existing account-status checks deny app data immediately with the same access JWT; they do not prove Auth revocation or identity deletion.
- Recovery parsing accepts `strandcue://auth/callback`, while Android also advertises a verified HTTPS `/auth` link. Prove the signed native app's complete redirect/PKCE flow, verify the actual signing certificate on the live assetlinks endpoint and verify production exact redirect allowlists. A custom scheme alone cannot establish exclusive app ownership.
- Local `secure_password_change` remains false. Test the supported recent-login/nonce and recovery journeys before changing this setting; verify production settings independently.
- The zone bound limits stored collection size but is not a general per-user/IP RPC rate limit. Determine supported traffic, offline-sync bursts and retry semantics before adding quotas to all write paths. Verify service/record link collection bounds in that broader work.
- Verify deployed email confirmation, leaked-password protection, session expiry, abuse protection and API/database advisors. Local config cannot certify hosted settings.

## Recovery and review

Review the additive migration and domain changes independently before promotion. Local source recovery is file-by-file reversion; a fresh disposable replay verifies the unreleased chain. Production rollback/restore is not verified here, and this document authorizes no remote application. Preserve any existing data; inspect staging history for malformed zone records before promotion rather than rewriting old audit history automatically.

Function security follows [Supabase's database-function guidance](https://supabase.com/docs/guides/database/functions): retain the fixed empty search path, invoker validator and existing restricted ACL. `CREATE OR REPLACE` keeps the validator's owner/grants.
