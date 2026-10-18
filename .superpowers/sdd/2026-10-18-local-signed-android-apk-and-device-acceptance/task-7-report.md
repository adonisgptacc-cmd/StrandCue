# Task 7 — final local gates and Android readiness decision

Run date: 2026-10-18, Africa/Johannesburg. Evidence worktree HEAD before this
report: `f1344564022d4141ff316949de0a7cfb9e46d1bc`.

**Task status: final evidence recorded; Android HOLD and acceptance completion
criteria unmet. Overall launch remains HOLD.** This run does not authorize
hosted changes, publication, deployment, merge, or push.

## Full repository gates

Node 24.19.0 was prepended to `PATH`; `VITEST_MAX_WORKERS=4` was set.

| Gate | Result |
|---|---|
| `npm run verify:offline` | Completed through web export, exit 0. Runtime check passed (`NODE-RUNTIME-PASS v24.19.0`); domain and mobile typechecks passed; lint completed with zero warnings; coverage passed; control-plane audit returned `METADATA-PASS`, zero findings; web export bundled 1,032 modules. |
| Full tests / coverage | **135 files passed / 2 skipped; 2,260 tests passed / 9 skipped; 0 failed.** Statements 96.69% (4,335/4,483), branches 91.48% (2,751/3,007), functions 98.52% (871/884), lines 98.41% (3,840/3,902). |
| `npm run check:expo` | Exit 0; dependencies up to date. |
| `npm run audit:dependencies` | Exit 0; `DEPENDENCY-POLICY-PASS`. Root: 0 Critical / 19 High / 11 Moderate; worker: 0 / 0 / 0; EAS: 0 / 11 / 13; mutation runner: 0 / 0 / 0. These are reviewed-policy counts, not cleared vulnerabilities. |
| `git diff --check` before Task 7 edits | Exit 0. |
| `git status --short` before Task 7 edits | Clean. |

## Android artifact and association gates

`npm run check:android-local -- --scratch C:\scb\task7-final` exited 0 and
reported `ANDROID-LOCAL-PASS` for pinned source commit
`d8c2818a7fac0e996910a5a33d6784875800993b`. The scratch child did not exist and
was not created by this preflight.

`npm run verify:android-artifact -- <external signed APK>` exited 0 with
`ANDROID-ARTIFACT-PASS`. The external receipt binds source commit
`d8c2818a7fac0e996910a5a33d6784875800993b`, input APK hash
`466330d1578e8019cb6e312b2653e750a550338d6c2637d5cda076555236b1ae`, and
signed APK SHA-256
`b16ccedf1591eb1819106aaf91170be83de280f26be9b274ec148493c37d12b3`.
Inspection verified package `za.co.strandcue.app`, version `0.1.0` (code 1),
one signer, and ABI `arm64-v8a`. The public certificate SHA-256 is
`b930b12ee536b12f2b9c562f2baf69aca8449bc21dea95386cc46986dd551fbe`.

Independent Android tool checks also passed: `zipalign -c -v 4` reported
`Verification successful`; `apksigner verify --verbose --print-certs` verified
v2 and v3 signatures and one signer with the expected certificate; `aapt dump
badging` reported the expected package/version; archive inspection found 22
native libraries, all under `lib/arm64-v8a/`, including `libreactnative.so`.
The APK and source receipt are outside Git.

`npm run check:release-links` was run with the public certificate fingerprint
in uppercase colon-separated form. It exited 1 with
`ANDROID-LINK-ASSOCIATION-HOLD: No association matches the app and reviewed
signing certificate.` No hosted configuration was changed.

## Device result and decision

Task 6 installed the same signed artifact on a clean Android 14 / API 34 AVD;
the installed APK hash and signer matched. On first launch, Android reported
`SoLoaderDSONotFoundError: couldn't find DSO to load: libreactnative.so` and
force-finished `MainActivity`. The APK archive contains an arm64-v8a copy of
that library, but the startup failure's root cause is **unresolved**. No cause
is inferred from the archive or emulator ABI. Testing stopped at the crash.

Protocol acceptance is **0/9 run; all nine scenarios BLOCKED**. Signup,
confirmation, password recovery, export/share, deletion/cancellation, offline
launch, TalkBack, and touch-target journeys remain NOT RUN. There were no
synthetic scenario accounts available and no hosted accounts or data were
created or changed. Device evidence is recorded in the Task 6 report and
`docs/verification/device-evidence.md`.

**Android readiness: HOLD. Overall launch: HOLD.** The artifact identity and
signature are verified, but app startup fails, protocol/device scenarios have
no evidence, App Links association does not match, and the canonical 32-row
security matrix remains OPEN / HOLD pending hosted proof and named human
dispositions.

## Provenance, secret review, and independent review

Before these Task 7 edits, the worktree and staging area were clean. The
current HEAD contained only the Task 6 evidence changes: a new device summary
and updates to the device log and acceptance checklist. Tracked-file inspection
found no APK/AAB, keystore, private-key, or service-account artifact; the only
filename matching the broad `secret`/`credential` search was the existing
documentation file `docs/keystore-secrets-setup.md`. The receipt names the exact
source commit and only public hashes. Credential-like text review found no
signing password, token, key material, or private-key path in the Task 6/7
evidence. The Task 6 command excerpt's user-profile SDK path was replaced by
`<Android SDK root>`.

Gitleaks is not installed on this host, so no fresh automated secret-scan PASS
is claimed. The prior recorded full-history gitleaks run remains a raw
non-PASS with ten previously triaged catalogue `rowKey` detections; the prior
working-directory scan had passed before Task 6 added evidence. This Task 7 run
did not repeat the history scan or claim its detections were clean.

The current Task 6 documentation diff and artifact receipt were reviewed as
part of this final evidence pass. A **fresh independent code/security review of
the full plan range was not obtained**, and no fresh independent reviewer
verdict is claimed. The previously recorded scoped Increment-4 re-review and
Android tooling reviews remain historical evidence only. This missing review
is an outstanding completion item.

## Completion status and follow-up

The final-gate run and decision packet are recorded, but the work order's
completion definition is **not met**: all nine Android scenarios have not been
observed on a launchable candidate and a fresh independent review is missing.
The next acceptance attempt must first resolve and verify the native startup
failure, bind any replacement artifact to its exact source receipt, and obtain
a fresh independent review. Then run all nine scenarios on that same artifact
with approved synthetic state, resolve the live App Links association, and
collect outstanding hosted and named-human evidence before changing either
HOLD decision.
