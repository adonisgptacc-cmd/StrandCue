# Dependency audit HOLD remediation implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Reduce dependency audit findings with compatible patched releases while preserving the Expo SDK boundary and keeping unresolved advisories visible as release holds.

**Architecture:** Update each audited package tree independently, using the newest verified compatible versions and its committed lockfile. Re-run the audit after every tree; remove or revise policy records only where package evidence changed. Do not alter risk ownership, review dates, or exception scope to make the gate pass.

**Tech Stack:** npm workspaces and standalone npm trees, package-lock v3, Expo SDK 57, Wrangler, EAS CLI, Stryker, repository dependency-policy scripts.

**Spec:** `docs/verification/dependency-advisory-exceptions.json`, `docs/verification/eas-runner-advisory-review.json`, `docs/verification/mutation-runner-advisory-review.json`, `scripts/dependency-policy.ts`, and `scripts/runner-dependency-policy.ts`.

## Global constraints

- Do not run `npm audit fix --force`.
- Keep Expo on SDK 57 in this work order; an Expo SDK major upgrade needs a separate compatibility plan.
- Preserve an exact committed lockfile for each isolated runner.
- Do not extend advisory exceptions by changing review dates or assigning an owner without that person's approval.
- Do not push, deploy, run a credential-bearing EAS build, publish content, or write to hosted Supabase.
- Treat the audit as unresolved when a vulnerable nested package has no compatible fix; report the remaining gate.

## Review focus

- Root Expo CLI's nested Zod 3 copy must remain visible if SDK 57 cannot update it to a patched release safely.
- The `decode-uri-component` advisory added after the previous exception review applies to the old 0.5.0 line as well as older releases.
- The `node-forge` advisories must be checked against the currently published version and the fresh npm audit result, not the October 17 review note.
- Wrangler updates must pass the account-deletion worker's typecheck and local dry-run.
- EAS and Stryker runner lock changes must have a matching complete audit graph and lock hash in their review records; stale records remain HOLD.

---

### Task 1: root workspace and Expo SDK 57 dependencies

**Files:** `package.json`, `apps/mobile/package.json`, `packages/domain/package.json`, `package-lock.json`, `.assistant/tooling/external-claims.json`, and focused dependency-policy tests where expectations change.

**Interfaces:** Keep the app on Expo SDK 57. Current registry versions observed for this plan are Expo `57.0.31`, Expo Router `57.0.29`, Zod `4.6.7`, Vitest and `@vitest/coverage-v8` `5.0.5`, `node-forge` `1.4.2`, and patched `decode-uri-component` `0.5.1`. Expo Router currently resolves decoder `0.2.2` through `query-string@7.1.3` (`^0.2.2`); the out-of-range patch remains uninstalled pending compatibility evidence.

- [x] Update root Zod to `4.6.7` in production and the domain workspace; update compatible SDK 57 packages and Vitest/coverage to reviewed patch releases. Refresh installed-SDK evidence and its live assertion.
- [x] Keep the direct Expo SDK 57 dependency map aligned; `npm run check:expo` reports dependencies up to date.
- [x] Run root `npm audit --include=dev --json`, `npm run audit:dependencies`, focused dependency-policy tests, and package tree inspection.
- [x] Retain HOLD for Expo CLI's nested Zod 3 and the decoder reachable through Expo Router; no out-of-range overrides were retained.

### Task 2: account-deletion worker

**Files:** `workers/account-deletion/package.json`, `workers/account-deletion/package-lock.json`.

**Interfaces:** Update Wrangler within major version 4 to `4.156.0`, which the fresh audit identifies as the available fix for the worker's `undici` and Miniflare findings.

- [x] Update Wrangler to `4.156.0` and regenerate only the worker lockfile.
- [x] Run the worker's typecheck, package-boundary check, `wrangler deploy --dry-run --config wrangler.jsonc`, and worker-local npm audit; the worker audit is clean.

### Task 3: EAS build-tool runner

**Files:** `tools/eas-runner/package.json`, `tools/eas-runner/package-lock.json`, `tools/eas-runner` override map, `docs/verification/eas-runner-advisory-review.json`, runner dependency-policy tests.

**Interfaces:** Keep EAS on major 24 for this pass and evaluate exact `eas-cli` `24.14.0`; verify every proposed override against the package's declared range and the fresh audit graph. Do not run any EAS build or submit command.

- [x] Update EAS CLI to `24.14.0` within major 24 and regenerate its isolated lockfile; update the exact-version assertion.
- [x] Run the local EAS version smoke check and EAS tree audit (29 findings remain: 6 high, 21 moderate, 2 low).
- [x] Leave the review digest, owner, and review dates untouched. The lock digest is stale by design, so the gate reports `RUNNER-REVIEW-LOCK` pending a human review; no review graph was represented as approved.

### Task 4: mutation-test runner

**Files:** `tools/mutation-runner/package.json`, `tools/mutation-runner/package-lock.json`, `docs/verification/mutation-runner-advisory-review.json`, runner dependency-policy tests.

**Interfaces:** Keep Stryker major 10 and Vitest major 5; current compatible targets observed are `@stryker-mutator/core` and `@stryker-mutator/vitest-runner` `10.1.1`, and Vitest `5.0.5`.

- [x] Update Stryker core and Vitest runner to `10.1.1`, Vitest to `5.0.5`, and regenerate the isolated lockfile; update exact-version assertions.
- [x] Update the fixable `fast-uri` path. Mutation runner audit now has three moderate findings, including `minimatch`.
- [x] Leave the review digest, owner, and review dates untouched. The stale digest keeps the policy gate on HOLD pending human review.
- [x] Run focused runner-policy tests, Stryker version check, and mutation-runner tree audit.

### Task 5: repository-wide verification and disposition

**Files:** Plan checkboxes and existing dependency verification records only.

- [x] Run dependency policy, typechecks, lint, full coverage, Expo SDK check, worker dry-run, and runner version smoke checks. Full coverage passed: 4,804 passed, 46 skipped; 95.59% statement coverage.
- [x] Audit all package trees. Current results: root 30 npm findings (6 high, 22 moderate, 2 low); worker 0; EAS runner 29 (6 high, 21 moderate, 2 low); mutation runner 3 moderate.
- [x] Keep the root policy HOLD and both runner lock-review HOLDs visible. No exception dates, owner, or approval evidence were changed.
- [x] Commit the verified local package/lock/evidence changes; do not push or deploy.

### Runtime verification note

The repository requires Node 24. Node `24.22.2` in Docker passed the runtime check and both typechecks, but npm omitted Linux optional native bindings from the Windows-generated lockfile, preventing Vitest and ESLint startup in that container. The final full coverage run and lint run passed on workstation Node `25.1.0`, which is outside the declared engine range; this is a verification limitation. Expo and worker dry-run checks passed on the workstation. Do not treat the dependency policy HOLD as cleared.

## Baseline evidence (2026-10-31)

- Fresh final root audit: 6 high, 22 moderate, 2 low. Direct Zod is 4.6.7; Expo CLI still has nested Zod 3.25.76.
- Account-deletion worker audit after Wrangler 4.156.0: 0 findings.
- EAS runner audit after EAS CLI 24.14.0: 6 high, 21 moderate, 2 low; its review expires 2026-10-31 with no assigned owner.
- Mutation runner audit after Stryker 10.1.1 and Vitest 5.0.5: 3 moderate; its review expires 2026-10-31 with no assigned owner.
- The current root exception review is due, and GitHub has published a new `decode-uri-component` advisory affecting versions through 0.5.0, with 0.5.1 listed as patched.
