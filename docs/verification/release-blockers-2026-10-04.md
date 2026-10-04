# Release blocker continuation — 4 October 2026

Work continues on `codex/repo-recovery-integration` from `6ad49e4`. The original checkout remains preserved. This is an evidence ledger, not release certification.

## Scope and decisions

The user requested dependency remediation, complete Auth deletion/session controls, Android link verification, signed-device acceptance, and eventual reviewed push/merge. The user selected a locally signed APK because there is no Play Console application yet. Play App Signing can be added later: retain the local certificate association for existing installations and add the actual Play app-signing certificate when it exists.

Ruling: continue the approved recovery and journey-integration plans in the existing integration worktree. Complete the missing deletion continuation with a service-only resumable worker and forward migrations; retain release HOLD until native and external gates pass.

## Dependencies

Fresh audit: 19 high, 10 moderate, zero critical. The high package entries propagate from two root advisories: [braces stack exhaustion](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm) and [node-forge signature validation](https://github.com/advisories/GHSA-86w9-cpqp-85rv). Both report no patched version. Registry latest versions `braces@3.0.3` and `node-forge@1.4.0` remain affected. Same-SDK Expo patch upgrades retain the roots. Automated force remediation proposes incompatible framework downgrades. No dependency exceptions were renewed, advisories suppressed, or manifests changed.

The dependency-policy gate fails with 40 findings, including severity, overdue exception review, and stale exception paths. Its 62 regression tests pass. Remediation requires a compatible upstream fix or separately reviewed substitution/security fork, with exploit and integration regressions. Release remains HOLD.

## Hosted read-only checks

The connected `strandcue` Supabase project is active. Initial advisor warnings and direct `has_function_privilege` checks confirmed `public.deletion_purge()`, `public.deletion_reapply()`, and `public.export_retention_cleanup()` were executable by both `anon` and `authenticated`; all are SECURITY DEFINER. Leaked-password protection is disabled. After explicit user approval, three reviewed migrations were applied as hosted versions `20261004132013`, `20261004132021`, and `20261004132028`. Local filenames and inventory now match those versions. Post-deployment checks confirmed consumer execution is denied on all five maintenance/worker functions and service-role execution is allowed. Both tombstone guards, the numeric/future-rejecting AMR parser, and six durable worker columns are deployed. The worker has not been scheduled or invoked against hosted accounts; Auth settings remain unchanged.

GitHub repository privacy is preserved. Branch protection and ruleset APIs return HTTP 403 with a plan-upgrade requirement. The release-environment inventory is empty. YAML environment names alone do not provide deployed approval protection. No billing change or repository visibility change has been made.

## Android

The existing emulator APK matches the old username/recovery debug artifact, installed on 30 September. It cannot establish current-candidate acceptance. An isolated native candidate was generated from the current committed mobile tree; backend continuation changes do not change that mobile snapshot. A separate application ID preserves the installed app during acceptance.

A local release key was created outside Git under the user's local application data, with its password protected using Windows DPAPI. Its public certificate and exact association JSON are under `%LOCALAPPDATA%/StrandCue/private-signing/`, retaining the cutover plan's out-of-Git certificate policy.

The configured association endpoint initially returned HTTP 404. A later live check found HTTP 200 with `text/plain` and `Hello world` at every checked route. The authenticated dashboard confirmed the five-line sample Worker, active version `2fee10a1`, no runtime variables or bindings, and no custom domain/route. The Git-connected build failed during `npm ci` because remote main's lockfile lacks `@emnapi/core` and `@emnapi/runtime`; it did not deploy. The account has `strandcue.co.za` but it is not attached to this Worker. The user explicitly approved publishing the tested association handler and public signing variable on 4 October; deployment verification is still pending below.

An automatic tool-policy block rejected an HTTPS recovery launch during inspection; that action was not retried or bypassed.

## Verified candidate evidence

Cloudflare production version `6a8cda08` is active at 100%. The tested `scripts/cloudflare-worker.ts` handler was published through the authenticated dashboard, with `ANDROID_CERT_SHA256` configured as a public runtime variable. The live `npm run check:release-links` returned `ANDROID-LINK-ASSOCIATION-PASS`, validating the package, local certificate, JSON content type, and absence of redirects. Recovery remains on the existing custom scheme. The Git-connected build failure remains separate from this successful manual deployment.

Final Node 24 typecheck and lint passed. Coverage ran with two workers: 654 passed, four opt-in API tests skipped; reported domain coverage was 93.24% statements and 84.83% branches. Control-plane audit returned `METADATA-PASS`, Expo's dependency check passed, and web export completed. A separate isolated local Supabase stack ran all four real API tests successfully, including Auth identity deletion, refresh-token rejection, stale-token completion denial, concurrent worker exclusivity, and other-owner isolation. It was stopped without touching the original local stack. After matching migration filenames to hosted versions, the 16 deletion/inventory tests passed again.

The first native build failed because Windows CMake/Ninja paths were too long under the integration worktree. A clean isolated retry at `C:\sc` completed all 535 Android release tasks. A separately identified acceptance package was signed with the local release key, installed beside the prior debug app on `emulator-5554`, launched successfully, and rendered the signup screen. The final local artifact uses the real package `za.co.strandcue.app`, version `0.1.0`/code 1, min SDK 24, target SDK 36, and APK Signature Scheme v2. Its signer matches the live association fingerprint stored outside Git. The copied x86_64 artifact is `%LOCALAPPDATA%\StrandCue\releases\StrandCue-0.1.0-local-x86_64.apk`, SHA-256 `4C168EAC6870CD924BBCF6480B57B41CE0DFE159AA933D743058649C24CE3885`, size 42,108,199 bytes.

The real-package APK was not installed because the emulator already has the older `za.co.strandcue.app` debug build signed by a different certificate; replacing it would require uninstalling that app and its local data. The acceptance-package launch proves signed native startup and rendering, while actual-package device App Links, signup, confirmation, recovery, offline, export/deletion and accessibility flows remain separate acceptance gates.

## Verification still in progress

Independent security review found no actionable issues in the three deletion migrations, worker, and mobile retry screen; review did not certify hosted settings or native acceptance. A signed build and startup smoke test passed; full device journey acceptance remains before promotion. Dependency policy and hosted protection gates continue to hold release.
