# Account deletion continuation

Deploy the reviewed forward migrations before enabling this worker. Consumers have no execute permission on claim, finish, purge, reapply or export cleanup. Keep `STRANDCUE_SUPABASE_URL` and `STRANDCUE_SUPABASE_SERVICE_KEY` in the scheduler's secret store; never use a public Expo variable or commit them.

Recent authentication uses verified Supabase JWT `amr` password entries with numeric Unix-second timestamps, as documented in [JWT claims](https://supabase.com/docs/guides/auth/jwt-fields). The gate accepts a password authentication within the last fifteen minutes, rejects future timestamps, and excludes refresh, recovery and unknown methods. The forward parser repair also applies to export requests. Synthetic fixtures must use the provider's numeric timestamp shape.

Run `node scripts/account-deletion-cli.ts` using the repository's supported Node runtime. One invocation handles at most one account. Schedule each minute with a bounded number of concurrent invocations appropriate to queue volume. Deployment, scheduling and hosted settings require the release operator's authorization.

The claim transaction locks a request, deletes its profile and dependent application data, and records an irreversible purge plus a five-minute lease. Cancellation remains available until this transaction wins the profile lock; after application purge it cannot restore access. A claimed account stays inaccessible to old JWTs, including attempted account completion, through its retained tombstone.

The worker calls the server-only Auth Admin hard-delete API. This removes the Auth identity, cascades Auth sessions and invalidates refresh tokens. Existing access JWTs can remain cryptographically valid until expiry, so application access stays blocked by the retained tombstone/profile checks. No user JWT is stored. See [Supabase's Auth management source](https://github.com/supabase/supabase/blob/master/apps/docs/content/guides/auth/managing-user-data.mdx) and [Admin deleteUser](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser).

Success records `auth_deleted_at`; Auth failure records only `auth-delete-failed` and defers retry five minutes. A crash before a receipt leaves the lease; after expiry another invocation retries. An already-absent Auth user is success. A stale worker cannot overwrite a newer lease receipt. Retries continue until success; alert on repeated failures and queue age. Inspect authorized provider logs without copying tokens or personal data into tickets.

Storage objects owned by the user can prevent Auth deletion. The current application stores exports in database jobs, not Storage; if Storage is enabled later, remove owned objects through the Storage API before hard deletion. Do not delete Storage metadata directly or mark success on a provider failure.

Verify a disposable local Supabase account first: capture its old access JWT and refresh token only in memory, request deletion with recent authentication, run the worker, prove Auth identity/session absence, refresh failure, stale-JWT app data denial and completion denial. Verify retry after deleting Auth but before receipt. Synthetic PGlite replay verifies SQL lifecycle and grants but cannot certify the deployed Auth service. Keep release HOLD until local real Auth and hosted deployment checks are recorded.

After restore, run `deletion_reapply()` before reopening service, preserve tombstones from after the restored backup, and resume the worker for unfinished identities. Reconcile any restored Auth identities even when a retained tombstone already records Auth completion; a restored Auth database must not be reopened on receipts from a later state without that reconciliation.
