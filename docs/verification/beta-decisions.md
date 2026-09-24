# Beta decisions log

Every decision below gates provider setup, builds or reviews. Status starts
UNDECIDED; a decision is recorded only with a value, a decider and a date.
Guessed providers, people, domains or credentials must never be hardcoded
anywhere — implementations keep reading them from configuration.

## D1. Production Supabase project and region

- **Context:** Drives data residency, backup capability, cross-border assessment and the rehearsal target.
- **Needed:** Project ref, cloud region, paid-backup (PITR) confirmation.
- **Status:** DECIDED (PITR NOT ENABLED; REHEARSAL BLOCKED)
- **Decision:** Project ref `bomudijjqmoommndhxib`, region `eu-central-1` (Frankfurt). PITR not enabled (cost blocker). RPO ≤1h SLA cannot be met; rehearsal will flag RPO breach.
- **Rehearsal blockers found 2026-09-24:** (1) Direct DB host is IPv6-only, unreachable from an IPv4-only network — pg tools must use the Supavisor pooler. (2) Pooler auth rejects the provided values (4 attempts, length-verified, propagation-waited). Local pg client installed via scoop (PostgreSQL 18.6); `supabase db url` absent from installed CLI so the rehearsal script needs a `DATABASE_URL` fallback. Rehearsal parked until a dashboard-reset password is pasted.
- **Full rehearsal PASSED 2026-09-24 09:11 UTC (production `bomudijjqmoommndhxib`, empty schema):** pg_dump via Supavisor pooler (session mode, IPv4) — 632KB custom dump in **61s**, gzip + SHA-256 `069A7AE27399712532AE4D3FD8C20E1E15C30F51904A7FC56CC72A24A3D468D0`. Verify: checksum re-match + TOC 315 TABLE/FUNCTION entries incl. all target tables, DATA sections, `consent_set`/`deletion_reapply`/`export_request`. Restore to same project in **4s** (only errors: Supabase platform event triggers `pgrst_*`/`issue_pg_*` not droppable by non-superuser — expected noise). Post-restore: 14/14 tables, `deletion_reapply()` → `{"reapplied": 0}` (empty DB; function executed = restore-survival proof), RLS validation **0 unprotected**. RTO 4s ≤ 4h SLA ✅; backup 61s. Script fixes committed: `DATABASE_URL` fallback (installed CLI lacks `db url`), token-guard bypass with DATABASE_URL, `.dump.gz` naming fix, Git-Bash pg PATH probe.
- **RPO caveat (gate stays partially evidenced):** without PITR or a scheduled hourly dump, the operational data-loss window is "since last manual dump", not ≤1h. Rehearsal proves restore correctness + RTO; RPO ≤1h needs PITR (declined on cost) or an hourly `backup` schedule (not yet set up).
- **Decided by / date:** Owner / 2026-09-23

## D2. Owned HTTPS domain and Android application identifier

- **Context:** Needed for Universal/App Links (recovery + email confirmation), the sender domain and the Play listing. The `.maestro` placeholder appId and deep-link hosts take these values.
- **Needed:** Domain, Android applicationId.
- **Status:** DECIDED
- **Domain:** `https://strandcue.adonisgptacc.workers.dev/`
- **Android applicationId:** `za.co.strandcue.app`
- **Decided by / date:** Owner / 2026-09-23

## D3. Transactional email provider and sender domain

- **Context:** Verification and recovery delivery plus SPF/DKIM/DMARC. The provider must offer a data-processing agreement acceptable under POPIA.
- **Needed:** Provider, sender domain, authentication records confirmed.
- **Status:** DECIDED
- **Provider:** Resend (EU region)
- **Sender domain:** `strandcue.co.za`
- **DNS verified 2026-09-24 (authoritative lookup):** DKIM TXT at `resend._domainkey.strandcue.co.za` present and matching; SPF CNAMEs `send` → `send.forge.rmta.net` and `rsend` → `rsend-euw1.forge.rmta.net` present; DMARC `v=DMARC1; p=quarantine; sp=quarantine; fo=1; adkim=r; aspf=r` present. No MX (sender-only domain — expected). Resend dashboard "failed" badges are stale; click Verify in Resend to refresh.
- **Delivery proven 2026-09-24:** Test email from `StrandCue <noreply@strandcue.co.za>` accepted by Resend (id `01a0d27e-bdbd-7024-8ee0-f8d9de66b0c2`, EU backend) and `last_event: delivered` to Gmail. API key session-only, never stored.
- **Decided by / date:** Owner / 2026-09-23

## D4. Named operating humans

- **Context:** Information Officer (POPIA §21 duties), support owner, security reviewer, verification operator. Reviews and incidents route to names, not roles.
- **Needed:** Four names with contact paths; segregation respected (reviewer differs from code author).
- **Status:** DECIDED
- **Information Officer:** Marion Ado — 0844450009
- **Support owner:** Alain Ado — 0844450009
- **Security reviewer:** Alain Ado — 0844450009
- **Verification operator:** Alain Ado — 0844450009
- **Decided by / date:** Owner / 2026-09-23

## D5. PostHog and Sentry hosting regions and subprocessors

- **Context:** Analytics and crash pipelines exist but disabled with no provider. Cross-border transfer rules (§21.8) apply before either is enabled.
- **Needed:** Hosting regions, subprocessor list, adequacy assessment.
- **Status:** DEFERRED
- **PostHog:** Not using yet — will decide before enable
- **Sentry:** Not using yet — will decide before enable
- **Decided by / date:** Owner / 2026-09-23
