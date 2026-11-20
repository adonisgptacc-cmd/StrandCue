# Repository health repairs design

## Intent

Bring the merged StrandCue repository, live website, and verification process into agreement. A green repository check should reflect the deployed site's transport security, current dependency risk, and important database and mobile behavior. The maintainer needs a sequence of small, reviewable repairs rather than another large reconciliation branch.

## Current evidence

- PR #13 was squash-merged on 2026-11-20. Its file tree is identical to the former local recovery branch. Main's four `verify` jobs passed after the merge.
- `https://strandcue.co.za/` returns 200 without `Strict-Transport-Security`; `http://strandcue.co.za/` returns 200 without redirecting. `npm run check:website-transport` fails those three assertions. The Cloudflare `strandcue` Worker visible in the dashboard has only its `workers.dev` address and no custom domain or route. The active serving path remains unidentified.
- Thirteen Dependabot PRs, #14–26, were opened after the merge. At the latest check, #18 failed `supabase-api`; #23 failed `dependency-audit`; #21 and #23–26 failed `quality`. Passing PRs are still subject to the last-push review rule. These results can change and must be rechecked at execution time.
- `npm run audit:dependencies` passes with no high or critical findings. The root minimatch exception requests review on 2026-11-21 and expires on 2026-11-24; runner exceptions need their own recorded review dates. The policy pass does not mean the moderate vulnerabilities are fixed.
- GitHub still lists 20 open Dependabot alerts from before the squash merge. At least the old node-forge high alert describes versions `<=1.4.0`, while the merged lockfile installs 1.4.3. An alert is not to be dismissed until its manifest and installed version are checked.
- Website content checks are not in the `verify` merge gate; live transport checks fail today. Real PostgreSQL concurrency tests skip without `STRANDCUE_PG_DSN`. The mobile coverage gate enumerates source files, so a new module can escape the 80% target.

## Goals and acceptance

1. **Live transport:** Identify the active Cloudflare zone, route, Worker/Pages service, and deployment source for `strandcue.co.za`. Correct the HTTP to HTTPS redirect and send an HSTS header on HTTPS with `max-age` at least 86400. Confirm the canonical host and path, certificate validity, site content, and `npm run check:website-transport` pass from the public internet. Preserve the current CSP and other security headers.
2. **Dependabot queue:** Triage #14–26 by change type and dependency compatibility. For each PR, record the exact failing job and cause; fix or supersede failing branches without weakening gates. Merge only independently verified, current, reviewed changes through protected main. Close duplicates only after their changes are present on main. Do not treat a transient Supabase startup failure as proof that an action upgrade is broken.
3. **Advisory deadline:** Re-run audits against all four lockfile trees and compare advisory IDs, installed paths, severity, reachability, and available patched versions with the exception registry. Upgrade dependencies when feasible. Renew an exception only after a fresh risk review with an owner, reason, mitigation, review date, and short expiry; never make a high-severity exception merely to turn CI green. Ensure policy tests exercise expiry and path drift.
4. **Dependabot alerts:** Reconcile every open GitHub alert with the merged main manifest and lockfile. Give GitHub time to rescan after the squash merge, then investigate alerts that persist. Close or dismiss alerts only with verified fix evidence and an appropriate reason; keep unresolved vulnerabilities visible.
5. **Verification coverage:** Add the website content check to CI. Make the live transport check a deployment/release verification step once the live endpoint passes, so ordinary PRs are not blocked by an unrelated external outage. Run real PostgreSQL concurrency suites in an explicit, reproducible CI job or document the required test environment and block releases until it passes. Replace the mobile source allowlist with an inclusion rule that catches new modules, while preserving meaningful per-file coverage thresholds. Split oversized files only when related behavior is being changed and tests protect the move.

## Constraints and anti-goals

- Keep the four required checks, linear history, secret scanning, strict branch checks, and dependency severity policy. Do not bypass branch protection to clear the queue.
- Do not publish Cloudflare configuration or deploy a site until the active serving path and rollback mechanism are identified. Avoid changing the unrelated `workers.dev` Worker as a guess.
- Do not modify Supabase production data or credentials as part of CI repair. Use disposable local/CI database services for concurrency verification.
- Do not bulk-merge all Dependabot PRs, auto-dismiss alerts, or extend advisory exceptions without review.
- Do not claim unused code from file size alone. Remove code only when reference and behavior analysis proves it obsolete.
- GitHub and Cloudflare mutations follow the repository's explicit external-action approval requirement. The design approval authorizes planning, not deployment or merges.

## Approaches considered

### Selected: staged repairs

Handle transport, advisory review, PR queue, alert reconciliation, and verification coverage as small, independently testable changes. This lets the time-sensitive review happen promptly, keeps live deployment separate from code changes, and makes failures attributable to one repair.

### Alternative: one combined update

Put repository changes into one broad PR while changing Cloudflare in parallel. This reduces PR count but couples unrelated checks, repeats the merge-recovery pattern, and delays a working transport fix if a dependency update fails.

## Sequence and decision gates

1. **Discover live routing and prepare transport correction.** Record current zone/route/deployment settings and rollback. Implement the smallest change on the active serving path, then verify externally. If the Cloudflare account lacks the active zone, stop deployment and identify the actual owner/service.
2. **Review exceptions before expiry.** This runs alongside routing discovery because the 2026-11-21 review date is nearer than the site deployment work. Record a reviewed exception update only if a safe upgrade is unavailable.
3. **Triage and repair dependency PRs.** Start with security fixes and the known failed PRs. Re-run each affected job and the full required set on the final head. Obtain an authorized review after the final push before merging.
4. **Reconcile alerts after main updates.** Use current manifests and advisory ranges; record which alerts resolved automatically, which remain actionable, and which are stale platform data.
5. **Strengthen CI and release gates.** Introduce the checks in the goal above after each prerequisite environment is stable. Ensure the new gates fail on deliberately broken fixtures and pass on current main.

## Implementation boundaries

- Cloudflare zone/routing and deployed website are one deliverable with an external rollback.
- Dependency exception review and PR-specific updates are separate deliverables; each PR keeps its own test evidence.
- GitHub alert reconciliation is a security inventory, with no blanket dismissal.
- CI coverage improvements are repository changes with their own tests and required-check review.

## Open builder choices

- Choose the Cloudflare mechanism (zone redirect rule, Worker route, Pages setting, or another active service) after locating the serving path. The acceptance criteria do not depend on that mechanism.
- Choose a reliable CI PostgreSQL service based on existing test harness setup; keep it disposable and least privileged.
- Decide whether each Dependabot PR should be refreshed, amended, superseded, or left open after inspecting its final diff and checks.
