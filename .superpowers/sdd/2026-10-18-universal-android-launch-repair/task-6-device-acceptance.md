# Task 6 — device acceptance evidence

**Disposition: BLOCKED — 0/9 canonical scenarios run.** Task 4 proves that the
bound universal APK installs and launches on the fresh API 34 x86_64 AVD.
That launch result does not satisfy any of the nine protocol scenarios. Task 5
classified the backend as `blocked_production`: its remote project identity
and isolation are unproven. The reserved synthetic owner labels refer to no
accounts or data, and no hosted writes were authorized. No account-dependent
acceptance action was attempted.

## Run binding

- Run recorded: `2026-10-18 23:55:18 +02:00` (Africa/Johannesburg; UTC
  `2026-10-18 21:55:18`). This is the evidence disposition time, not a claim
  that the protocol scenarios were executed.
- Artifact: `strandcue-universal-alpha-task3-fixed.apk`; package
  `za.co.strandcue.app`, version `0.1.0` / code `1`.
- Artifact SHA-256:
  `f68053fa3c9b6b78b7298b59a8574e6cceb3174444d16c8a423ec89eb06fd7d9`.
- Signer certificate SHA-256:
  `b930b12ee536b12f2b9c562f2baf69aca8449bc21dea95386cc46986dd551fbe`
  (one signer).
- Source: signed artifact receipt identifies source commit
  `d8c2818a7fac0e996910a5a33d6784875800993b`.
- Device: AVD `strandcue-universal-api34-x86_64`, model
  `sdk_gphone64_x86_64`, Android 14 / API 34, ABI `x86_64` (reported device
  ABIs `x86_64,arm64-v8a`); ADB serial redacted as `emulator-****`.
- Task 4 install/first-launch evidence: PASS; installed APK hash and signer
  matched the artifact. The app rendered the development-environment setup
  surface and remained alive through the bounded observation.
- Backend classification: `blocked_production`; remote Supabase project
  reference absent from the receipt and backend isolation unproven.
- Reserved synthetic labels: `SC-ANDROID-T5-OWNER-A` and
  `SC-ANDROID-T5-OWNER-B`. Neither is a provisioned identity; no credentials,
  shelf items, decisions, execution, or server receipt exist for either label.
- Safety boundary: no account was created, no hosted data was queried or
  changed, and no account-dependent action was attempted. No hosted writes
  were authorized.

## Canonical protocol scenarios

Each outcome is BLOCKED because its required synthetic server-side fixture
does not exist and cannot be safely provisioned or queried while backend
isolation remains unproven. No scenario was partially run; no PASS is inferred
from the Task 4 launch or unit tests. Therefore no authoritative server
revision, idempotent retry result, or no-duplicate-effect evidence was
collected.

| # | Scenario | Result | Exact missing synthetic precondition |
|---|---|---|---|
| 1 | Start from idle | **BLOCKED** | A disposable Owner A identity on a proven isolated backend, with a reviewed decided recommendation and authoritative `getActiveProtocolExecution` result of `null`; online device session. |
| 2 | Pause active execution | **BLOCKED** | Owner A identity plus a server-backed, pauseable active execution at revision greater than zero and a matching authoritative receipt. |
| 3 | Resume after process death | **BLOCKED** | Owner A identity plus an active execution with at least one confirmed step and a matching server receipt/fingerprint at an authoritative revision. |
| 4 | Confirmed-step persistence | **BLOCKED** | Owner identity plus an active run, pending step with valid actuals, and a server-backed expected revision/receipt for confirmation and idempotent retry. |
| 5 | Skip/modify deviation | **BLOCKED** | Owner identity plus an active run with eligible pending steps and fixture-defined bounded skip/modify reasons and detail. |
| 6 | Owned versus foreign substitution | **BLOCKED** | Two distinct isolated owner identities, separate shelf items, and an eligible active decision step; owner-scoped read/write containment must be reviewed and demonstrated. |
| 7 | Offline/reconnect | **BLOCKED** | Owner identity plus an active server execution/receipt, available online session for setup, and a controllable network transition for offline retry and reconnect. |
| 8 | Account switch without prior-owner paint | **BLOCKED** | Distinct Owner A and Owner B identities with separate known server states (including A's active run), credentials, and owner-scoped fixtures for sequential sign-in. |
| 9 | Terminal behavior | **BLOCKED** | Owner identity plus an active execution one step from completion (or a fixture-approved abandonment state), with authoritative server revision and terminal result. |

The labels and recipes are planning references only. In particular, Owner B's
documented decision/run recipe and its fingerprint placeholder have not been
created as backend data. Provisioning requires proven isolated backend
identity, database/security review, and an assigned cleanup owner/expiry per
the Task 5 runbook.

## Adjacent release journeys

These are separate from protocol scenarios 1–9 and were **NOT RUN** in this
acceptance disposition:

| Journey | Result | Evidence state |
|---|---|---|
| Signup | **NOT RUN** | No account creation attempted; backend target/isolation unproven. |
| Confirmation | **NOT RUN** | No synthetic account or confirmation flow exercised. |
| Recovery | **NOT RUN** | No synthetic account or recovery flow exercised. |
| Export/share | **NOT RUN** | No authenticated export or platform share/save path exercised. |
| Deletion/cancellation | **NOT RUN** | No account or data existed for a deletion/cancellation exercise. |
| Offline launch | **NOT RUN** | No offline launch journey exercised; protocol offline/reconnect scenario 7 is separately BLOCKED. |
| TalkBack | **NOT RUN** | No accessibility traversal or spoken-output check recorded. |
| Touch targets | **NOT RUN** | No target-size or interaction check recorded. |

## Triage

No observed security, privacy, or execution-integrity failure occurred because
the account-dependent flows were not entered. Distribution acceptance remains
on HOLD: launch is verified, while protocol acceptance is 0/9 BLOCKED and all
listed adjacent journeys are NOT RUN. Resume only after an isolated test
backend is proven and reviewed, synthetic fixtures are provisioned under the
documented cleanup controls, and a new evidence run is bound to its artifact
and device.

Related records: [Task 4 first launch](task-4-first-launch.md), [Task 5
synthetic data classification](task-5-report.md),
[`android-acceptance-checklist.md`](../../../docs/verification/android-acceptance-checklist.md),
and [`device-evidence.md`](../../../docs/verification/device-evidence.md).
