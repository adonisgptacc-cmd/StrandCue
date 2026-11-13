# Release and mutation tooling

Two supply-chain-sensitive tools run in CI from their own committed, non-workspace
lockfiles: the EAS CLI used by the manual signed Android build, and the Stryker
mutation runner used by the optional mutation-testing workflow. They are
deliberately outside the npm workspaces so each tool installs from its own
versioned lock rather than the application dependency tree.

## The two isolated runners

| Runner | Path | Exact pins | Lockfile |
| --- | --- | --- | --- |
| EAS CLI runner | `tools/eas-runner` | `eas-cli` `24.10.0` | `tools/eas-runner/package-lock.json` (committed) |
| Mutation runner | `tools/mutation-runner` | `@stryker-mutator/core` `10.0.0`, `@stryker-mutator/vitest-runner` `10.0.0`, `typescript` `6.0.3`, `vitest` `5.0.0` | `tools/mutation-runner/package-lock.json` (committed) |

Each runner keeps its own committed lockfile. The root `package.json`
`workspaces` list is `["apps/*", "packages/*"]`; `tools/*` is deliberately outside
the npm workspaces, so a runner is not a workspace member and CI installs it only
from its committed lock with `npm ci`. This is what keeps the credential-bearing
release step from fetching anything from the registry at run time.

## Install and invoke

`android-build.yml`:

    - run: npm ci --ignore-scripts
    - name: Install the locked EAS CLI runner
      run: npm ci --ignore-scripts --prefix tools/eas-runner
    # inside the credential-bearing build step:
    EAS_CLI="$GITHUB_WORKSPACE/tools/eas-runner/node_modules/.bin/eas"
    test -x "$EAS_CLI"
    "$EAS_CLI" build --platform android --profile "$BUILD_PROFILE" --non-interactive --wait --json > eas-build-result.json

The step fails rather than fetching if the locked binary is absent (`test -x`).
Before the artifact is uploaded it scans `eas-build-result.json` and fails closed
if the release credential appears in the file.

`mutation-testing.yml`:

    - run: npm ci --ignore-scripts
    - run: npm ci --ignore-scripts --prefix tools/mutation-runner
    - run: node tools/mutation-runner/node_modules/@stryker-mutator/core/bin/stryker.js run

## Reviewed advisory gate (Task 24)

**Both isolated runners are now audited** by `npm run audit:dependencies`.
`scripts/audit-dependencies-cli.ts` explicitly audits root, account-deletion,
EAS and mutation lockfiles. The existing workspaceManifestGlobs inventory remains
for application workspaces. The runners use a separate pinned audit policy in
`scripts/runner-dependency-policy.ts`; the application high-exception scope is
unchanged. The Android verify job already requires the combined gate; the mutation
workflow now invokes it before executing Stryker.

The review binds the exact lockfile SHA-256 (with CRLF normalized to LF) and the security-bearing audit
graph (affected nodes, via dependency edges, affected ranges, full advisory
metadata, IDs and severities). npm's nondeterministic derived effects and
fixAvailable recommendations are excluded: they do not change installed paths
and can alternate between equivalent parents across invocations.
New/removed advisories, severity changes, new paths, any lock change, malformed or
missing review, overdue recheck, and every Critical advisory fail closed. Removing
an advisory requires refreshing the review, rather than silently retaining stale
exceptions. A PASS means reviewed residual risk, not fixed vulnerabilities.
Review evidence is in `docs/verification/eas-runner-advisory-review.json` and
`docs/verification/mutation-runner-advisory-review.json`, with exact installed
versions and complete lock-derived caller paths for each remaining advisory.

The evidence was refreshed 2026-10-17; recheck **2026-10-24**, expiry **2026-10-31**.
The runner policy caps every review at 14 days. Compatible targeted patch/minor
overrides preserve all direct tool pins; no force fix or major override was used.
The EAS process has EXPO_TOKEN and credential access, so build-only classification
does not remove the actual CI exposure. Trusted configs, manual jobs, disabled
install scripts and constrained commands mitigate it. No hosted build was run.

| Runner | high | moderate | low | total |
| --- | --- | --- | --- | --- |
| tools/eas-runner, Task 21 baseline | 15 | 16 | 1 | 32 |
| tools/mutation-runner, Task 21 baseline | 0 | 2 | 0 | 2 |
| tools/eas-runner, Task 24 after compatible refresh | 11 | 13 | 1 | 25 |
| tools/mutation-runner, Task 24 after compatible refresh | 0 | 0 | 0 | 0 |

The eleven EAS high package entries derive from just two remaining high advisory
IDs: braces GHSA-vfj7-8cjw-p6xm and node-forge GHSA-86w9-cpqp-85rv. Both latest
published releases remain affected. Their complete CI paths and exposure are
explicitly reviewed; this is not silent acceptance of the earlier 15 highs.

## Application policy boundary and accountable ownership

The original workspace-placement investigation remains relevant: the application
policy's `scripts/dependency-policy.ts:252-262` build-path allowlist and
`scripts/dependency-policy.ts:537-553` EXCEPTION-HIGH-SCOPE requirement exclude
EAS. Putting EAS in the mobile workspace creates ADVISORY-SEVERITY findings that
cannot be excepted honestly. The separate runner policy avoids weakening that
application boundary and also admits actual CI exposure instead of asserting it
is unreachable.

Coverage decision: bring both tools lockfiles into the separate pinned audit gate
above. The Task-21 coverage gap is resolved in source and tests. Human dependency
risk acceptance and release authorization remain outstanding; no identity was
invented and the exceptions are not fixes.

Coverage decision owner: <UNASSIGNED - must be named before CI-001 can be closed>

CI-001 stays open until that field names an accountable person and the residual
risk is reviewed by that owner. The dependency risk owner is likewise explicitly
unassigned in the runner review evidence. This technical review does not imply
human approval to release or execute a credential-bearing build.
