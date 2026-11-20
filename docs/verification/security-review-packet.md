# Security review packet (2026-09-24)

Reviewer: Alain Ado (D4 security reviewer) — 0844450009.
Target: production project `bomudijjqmoommndhxib` (`eu-central-1`), 22 trusted migrations.
Method: live read-only probes from 2026-09-24 (psql via pooler, REST via publishable key)
plus repo checks. Probe outputs below are verbatim.

## Live posture (verbatim probe results)

- Tables without force row level security: **(none — zero rows returned)**.
- No RLS policy serves `anon` or `public` on any table: **(none — zero rows returned)**.
- Functions without an empty `search_path`: **(none — zero rows returned)**.
- Anon REST `POST /rpc/consent_list`: **HTTP 401**, `permission denied for schema strandcue_private`.
- Anon REST `GET /profiles?select=user_id`: **HTTP 200, 0 rows** (RLS filters; DB also currently empty).
- Repo secret-pattern grep (PAT, secret keys, live API keys, private keys): **no committed secrets**.
  The publishable key exists only in gitignored `apps/mobile/.env` (public by design)
  and gitignored `.expo` logs. DB password and PATs were session-only, never stored.

## Findings

### F1 — anon holds broad grants via Supabase default privileges (Low)

Every public table ACL includes `anon=arwdDxtm` and every public RPC includes
`anon=X`, although the trusted migrations contain `revoke all ... from anon`.
Cause: Supabase platform default privileges re-apply anon/authenticated grants
after DDL (consistent with the `pgrst_ddl_watch` event trigger present on the project).

Exploitability: none demonstrated. All three enforcement layers hold on live:
force-RLS with no anon-serving policy (rows), schema-USAGE + auth checks in every
RPC wrapper (calls, proven 401), empty `search_path` (function hijack).

Recommendation: accept the drift and monitor it — add a quarterly live
grant-drift query (the two ACL probes above) to the Beta operating runbook
rather than fighting platform defaults per migration. Re-audit after any
future migration push.

### F2 — RPO ≤1h not met without PITR or scheduled dumps (Medium, accepted)

Recorded in D1: PITR declined on cost; no hourly `backup` schedule exists yet.
Restore correctness + RTO 4s proven 2026-09-24. Operational data-loss window is
"since last manual dump". Owner decision required: accept, schedule hourly dumps,
or enable PITR.

### Reviewer-side items this packet does NOT cover

- Penetration test (external; gate checklist requires it before SOFT LAUNCH).
- POPIA legal opinion (external counsel; Information Officer Marion Ado).
- Supabase Auth dashboard config (email confirmation, redirect allowlists,
  rate limits) — verify by sight in the dashboard, not from SQL.
- Device-side storage audit (secure store, screenshots, backups) — Plan B/C device work.

## Verdict requested

- [ ] F1 accepted with quarterly drift query (sign below), or rework requested: ___
- [ ] F2 accepted / hourly dumps scheduled / PITR enabled (circle one)
- [ ] No Critical or High findings open: confirmed / not confirmed

Reviewer sign-off: ________________________  date: __________
