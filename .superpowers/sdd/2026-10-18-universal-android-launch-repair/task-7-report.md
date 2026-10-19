# Task 7 — final gates and launch decision

**Run date:** 2026-10-19

**Evidence HEAD at run start:** `3e0c8c18f636445e2819865839f1c231f02ecdad`

**Decision:** Android acceptance **HOLD**; overall launch **HOLD**.

## Repository gates

All requested repository gates passed under Node `v24.19.0`. The first exploratory pass used the host-default Node `v25.1.0`; its runtime check correctly failed and is not counted. The final rerun prepended the bundled Node 24 runtime and used Vitest `--maxWorkers=4` for full coverage.

| Gate | Result |
|---|---|
| `check:runtime` | PASS — Node 24.19.0 |
| `typecheck` | PASS — domain and mobile workspace |
| `lint` | PASS — zero warnings |
| `test:coverage -- --maxWorkers=4` | PASS — 136 files passed / 2 skipped; 2,294 tests passed / 9 skipped / 0 failed; 95.98% statements, 90.96% branches, 98.45% functions, 97.80% lines |
| `audit:control-plane` | PASS — `METADATA-PASS`, no findings; local installed Expo mapping only |
| `export:web` | PASS — Metro web bundle exported |
| `check:expo` | PASS — dependencies up to date |
| `audit:dependencies` | PASS — policy result; root 0 Critical / 19 High / 11 Moderate, EAS runner 0 / 11 / 13, worker and mutation runner 0 / 0 / 0 |
| `git diff --check` | PASS on the final staged documentation diff |

The dependency gate passes under the repository's reviewed policy. It does not mean the advisory count is zero: root and EAS runner advisories remain documented, with four and six reviewed advisories respectively. The task's prior ledger records the named risk owner and required disposition. The control-plane audit explicitly does not verify host integrity, malware safety, or native/device compatibility.

## Android artifact and launch evidence

`check:android-local -- --scratch C:\scb\task7-preflight` returned `ANDROID-LOCAL-PASS` for source commit `d8c2818a7fac0e996910a5a33d6784875800993b`, Node 24, Java 17, present Android SDK, and sufficient disk space. The scratch target was a validation path only; no build or signing operation ran.

The exact signed candidate passed `verify:android-artifact` with `ANDROID-ARTIFACT-PASS`:

- Package/version: `za.co.strandcue.app`, `0.1.0`, code `1`.
- ABI set: `arm64-v8a`, `x86_64`.
- Native inventory: 22 required libraries for each ABI; manifest SHA-256 `c459015a3b52af685ebadf3e529f5fa952d1c89c923493d903eef545c519b6cd`.
- Unsigned input SHA-256: `d582bdf4110ce73cba386cfe16ad6cb16de97560862b35a26a9ea8b96b635b16`.
- Signed APK SHA-256: `f68053fa3c9b6b78b7298b59a8574e6cceb3174444d16c8a423ec89eb06fd7d9`.
- Signers: exactly one; certificate SHA-256 `b930b12ee536b12f2b9c562f2baf69aca8449bc21dea95386cc46986dd551fbe`.
- Native ZIP layout: 44 native entries stored without compression; all 44 data offsets are 16 KiB aligned; `extractNativeLibs=false`.

The independent `zipalign -c -P 16 -v 4` and `apksigner verify --verbose --print-certs` commands passed. `aapt dump badging` confirmed package, version, version code, and both native ABIs. A separate SHA-256 calculation matched the receipt. The receipt binds this artifact to source commit `d8c2818a7fac0e996910a5a33d6784875800993b` and the unsigned input hash above.

Task 4 already installed the same artifact on a clean API 34 emulator, matched the installed APK hash and signer, and observed the app setup screen and stable process for 20 seconds. That is a successful Android startup check for this artifact/device pair. The older first-launch crash belongs to the rejected prior artifact and is historical evidence, not the current candidate's outcome.

## Remaining Android and release blockers

The Task 5 backend classification remains `blocked_production`: the remote backend identity and isolation have not been proved. No test account, credential, shelf, protocol decision, execution, or receipt has been created. Task 6 acceptance is **0/9 run; all nine scenarios BLOCKED**. Signup, confirmation, recovery, export/share, deletion/cancellation, offline launch, TalkBack, and touch-target journeys remain **NOT RUN**. No hosted account or data was accessed or modified.

The release-link check was run read-only with the candidate's public certificate formatted per the script. It returned `ANDROID-LINK-ASSOCIATION-HOLD` because the live endpoint contains no matching package/certificate association. No production association was changed.

The complete plan range received a local evidence and decision consistency review, but no fresh independent reviewer result was available in this subtask. The independent-review requirement remains open. Gitleaks was unavailable, so this report does not claim a fresh secret-scanner pass. The tracked-path review found no APK/AAB, keystore, DPAPI record, token, password, credential, personal test data, or generated Android output. `.env.example` is the blank tracked template. No host-specific private paths or secrets were added to the report.

## Decision

The universal Android startup repair is **PASS** for the candidate and API 34 device evidence described above. Android acceptance is still **HOLD** because backend isolation blocks every account-dependent scenario, and the release-link association and independent review are unresolved. Overall launch is **HOLD** because all 32 canonical audit findings remain OPEN and hosted operations, risk-owner decisions, human authority, and product-content review are outstanding.

No hosted mutation, deployment, content publication, push, merge, account creation, or paid build occurred. The canonical decision and concise continuation point are in [security-audit-launch-decision-2026-10-18.md](../../../../docs/verification/security-audit-launch-decision-2026-10-18.md) and [final-handoff.md](final-handoff.md).
