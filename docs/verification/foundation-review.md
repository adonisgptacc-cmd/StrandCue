# Foundation review — 11 September 2026

Scope: the first account / Hair Passport / history slice, reviewed against `docs/PHASE_1.md` and `docs/superpowers/specs/2026-09-09-foundation-design.md`. This is an initial review of the files on disk; findings below describe the reviewed state before coordinator fixes. No application, domain, migration or test files were changed by this reviewer.

## Findings

### P1 — SQL accepts numbers that make the entire mobile history unreadable

Location: `supabase/migrations/20260909172924_passport_foundation.sql:148` (numeric validation), `apps/mobile/src/passport-api.ts:10` (strict parsing of every revision).

The server requires numeric JSON and a nonnegative value but does not enforce JavaScript finite-number representability. An authenticated owner can append raw JSON `{"lengthCm":1e400}` or the equivalent budget. PostgreSQL accepts it; the JSON client decodes it as `Infinity`, and `PassportRevisionSchema` rejects the response. `loadPassport` consequently cannot open the account's Passport or history. A later correction still leaves the invalid original in the audit array, so it does not repair mobile loading.

Verified evidence: ran an isolated PGlite instance using `tests/database/harness.ts`, completed account A, saved the normal baseline, and called `public.mutate_passport` with a raw JSON parameter containing `1e400`. Output: `{"sqlAccepted":true,"numericValue":"Infinity","mobileRevisionParse":false}`. This used the authenticated role and public RPC, not privileged insertion.

Suggested fix: impose the same explicit finite numeric bound in SQL and shared schemas, and test raw JSON numeric overflow through the mutation entry point. If the migration has already held user data, account for pre-existing invalid immutable revisions when rolling out the fix.

### P1 — Routine auth refresh unmounts the editor and loses unsaved work

Location: `apps/mobile/src/auth.tsx:19`–29, `apps/mobile/app/index.tsx:10`–11; storage begins only in `apps/mobile/src/passport-editor.tsx:46`.

Every auth event except `SIGNED_OUT`, including `TOKEN_REFRESHED`, calls `refresh`, which sets global `loading=true`. `Home` then replaces `Records` with its loading page. This unmounts the editor and clears the form. The replacement `Records` also resets its editing state, even if the resulting user UUID is unchanged. Input that has not reached Submit has never been written to secure storage. A normal token refresh can therefore discard an active form without user action. Transient network failures during `getUser` similarly clear the user and remove the form.

Verified evidence: source-level control-flow trace across the auth callback, conditional Home return, editor-local state, and save-only persistence. No device or component-render test was run; this finding follows directly from React's conditional unmount path.

Suggested fix: reserve the blocking bootstrap state for initial account resolution. Keep same-owner records mounted across refreshes; distinguish explicit session invalidation from transient verification failure. Add a behavioural test that dispatches a token refresh while editing and verifies field values survive, while a genuine owner change clears them.

### P1 — Revision conflict leaves a permanently stale command with no review/rebase path

Location: `apps/mobile/src/passport-editor.tsx:29`–30, 39–50, 53–66; `apps/mobile/src/records.tsx:74` (editor callbacks in reviewed file).

A rejected stale save leaves `command.current` non-null and the editor locked. Retry sends the same outdated `p_expected_revision`, so it cannot succeed. The UI instructs Cancel and reopen, but reopening builds `form` from the current projection/target rather than the stored submitted command. Its only stored-draft actions are Retry and Discard; neither restores the user's fields for comparison with the latest revision. The parent Cancel callback does not reload the record, so reopening can still use the stale base. Recovering from the advertised two-device conflict requires throwing away/retyping the attempted changes, contrary to P1-AC-16.

Verified evidence: source-level state and callback trace. The existing database test verifies stale revisions are rejected, but the mobile tests exercise only the error string, not recovery from that rejection.

Suggested fix: distinguish a definitive revision conflict from an uncertain network outcome. Preserve the submitted editable fields and date/reason, fetch the latest revision, show explicit review, and construct a fresh operation only after review. Keep the original operation unchanged for ambiguous timeout retries. Add a two-device conflict test that completes a reviewed resubmission without retyping or losing the draft.

### P2 — Mobile error mapping does not match actual RPC errors

Location: `apps/mobile/src/contracts.ts:33`–36; actual server codes at migration lines 273, 283 and 300.

The client matches `username-taken`, `idempotency-mismatch` and `validation`, while the server emits `username-unavailable`, `operation-conflict`, and `invalid-*`/other specific validation codes. A taken or reserved username is displayed as a connectivity failure, with no instruction to choose a different handle. The same impossible request is encouraged as a retry. This is especially visible during account setup and violates the clear username conflict requirement.

Verified evidence: invoked the actual `saveErrorMessage` function for `username-unavailable`, `operation-conflict`, `invalid-username`, and `invalid-effective-date`; all four produced the generic “Check your connection and try again” response.

Suggested fix: centralize the actual RPC error vocabulary, map known validation and conflict responses to actionable copy, preserve the generic redacted fallback, and test the actual server codes.

## Positive checks and limitations

- The reviewed migration revokes direct consumer writes, uses owner-scoped RLS, composite owner foreign keys, and a non-login, non-bypass, non-table-owning mutator role. Private security-definer cores independently check identity/account state, and helper execution is revoked from authenticated users. No actionable cross-owner read/write or history-rewrite bypass was found in this review.
- Public RPC argument and response names generally match the mobile API adapter. Database/current-history projection and correction-chain logic were inspected alongside their existing tests. Broad test/build execution belongs to the coordinator and was not duplicated here.
- Prior domain fixes are present: top-level explicit own `undefined` values are rejected; each revision must use `baseRevision=sequence-1`; the calendar day helper uses Africa/Johannesburg rather than UTC. This is source confirmation, not a new claim that the entire suite passed.
- The knowledge graph had no StrandCue index, so file discovery fell back to direct source reads.
- Recovery routing has two route files mounting `Home`/`useAccount`. A warm callback may leave multiple hook instances consuming the same link; validate single-consumer behaviour in the required native tests or move auth/link handling to one root provider. This is a follow-up risk, not a reproduced finding.
- A fresh local Supabase Postgres 17 rebuild and disposable-user Auth/PostgREST test now cover verified onboarding, owner-scoped reads, direct-write denial, idempotent retry, and changed-payload conflict. The run exposed and fixed migration-role ownership transfer and managed `auth`-schema access assumptions that PGlite did not model.
- Native cold/warm recovery and secure-storage behaviour, accessibility/performance, production email/redirect configuration, hosted-environment validation, and backup restore remain release gates. Export/deletion and the remaining Phase 1 capabilities are explicitly outside this first slice. Passing local tests or fixing these findings is not beta readiness or complete Phase 1 acceptance.
