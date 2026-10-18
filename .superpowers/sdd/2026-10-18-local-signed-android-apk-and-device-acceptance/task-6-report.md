# Task 6 — Android device acceptance report

Run date: 2026-10-18, Africa/Johannesburg. Device inspection began at
`2026-10-18T20:12:09+02:00`.

## Artifact and device

- Artifact SHA-256: `b16ccedf1591eb1819106aaf91170be83de280f26be9b274ec148493c37d12b3`
- Package/version: `za.co.strandcue.app`, `0.1.0` (version code 1)
- Candidate signer SHA-256:
  `b930b12ee536b12f2b9c562f2baf69aca8449bc21dea95386cc46986dd551fbe`
- Independent local file hash and `apksigner verify --print-certs` results
  matched the supplied Task 5 receipt.
- Device: Android Emulator `sdk_gphone64_x86_64`, Android 14 / API 34,
  ADB serial `emulator-****` (redacted). ABI list: `x86_64,arm64-v8a`; the
  candidate's `arm64-v8a` ABI is supported.
- Existing package metadata: same application ID and version code; installed
  2026-09-30. Its signing certificate differs from the candidate.

## Install and launch

Install was attempted with `adb install -r`. Android returned
`INSTALL_FAILED_UPDATE_INCOMPATIBLE` because the existing package signature
does not match the candidate. **Install: BLOCKED.** No uninstall or data clear
was attempted because it could remove the existing app's data. The existing
app was not opened as a substitute.

**First launch: BLOCKED / NOT ATTEMPTED.** The candidate was not installed, so
there is no candidate launch result, crash observation, or UI observation.

No dedicated synthetic credentials or scenario data were available. No hosted
accounts or data were created or changed. No safe screenshot or log artifact
was produced. No owner-data leakage or execution-integrity failure was
observed; those properties could not be exercised.

## Nine-scenario results

All scenarios are **BLOCKED**, not PASS. Shared blocker: the signed candidate
could not be installed over the existing package due to a signing-certificate
mismatch. Dedicated synthetic account credentials and per-scenario server
state were also unavailable. No protocol scenario was executed.

| # | Scenario | Result | Additional missing precondition |
|---|---|---|---|
| 1 | Start from idle | BLOCKED | Fresh synthetic account with no active execution; online signed-in session |
| 2 | Pause in-progress execution | BLOCKED | Synthetic owner with active execution at revision greater than zero |
| 3 | Resume after process death | BLOCKED | Synthetic owner with matching server receipt and confirmed steps |
| 4 | Confirmed-step persistence | BLOCKED | Synthetic owner with active execution and required step actuals |
| 5 | Bounded deviation input | BLOCKED | Synthetic owner with active execution; no reason/detail submission performed |
| 6 | Owned versus foreign substitution | BLOCKED | Two dedicated synthetic owners, shelf data, eligible step; no foreign-item probe performed |
| 7 | Offline/reconnect idempotency | BLOCKED | Synthetic owner and active execution; network was not toggled |
| 8 | Account switch without prior-owner paint | BLOCKED | Two dedicated synthetic accounts with known distinct execution states |
| 9 | Terminal behavior | BLOCKED | Synthetic owner with execution one step from completion |

## Release-adjacent journeys

Signup, email confirmation, password recovery, export/share, account
deletion/cancellation, offline launch, and TalkBack/touch-target observations
are **BLOCKED / NOT RUN** because the candidate was not installed. No account
flow or server-side operation was attempted.

Checklist: `docs/verification/android-acceptance-checklist.md`.
Device evidence log: `docs/verification/device-evidence.md`.
