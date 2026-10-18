# Device evidence log

Current source rule (Task 25, 2026-10-18, implementation `02fd96a`): Task 20
changed outbound signup/recovery redirects to the approved HTTPS callback;
`strandcue://auth/callback` remains inbound compatibility only. Historical
custom-scheme/build observations below describe their dated binaries. None
certifies current hosted allowlists, App Links or the Android acceptance
checklist, which remains **0/9 BLOCKED**. See the
[final HOLD packet](security-audit-launch-decision-2026-10-18.md).

## Build 1 — preview APK (2026-09-24)

- EAS build ID: 693da61b-e2e0-4ecf-8e51-7051cf8306ff
- Dashboard: https://expo.dev/accounts/bush85/projects/strandcue/builds/693da61b-e2e0-4ecf-8e51-7051cf8306ff
- Artifact: https://expo.dev/artifacts/eas/4b148I6WahuRMyOeS7sFamwy9QkxTzRsLmU-WlQpvr4.apk
- Profile: preview (APK, internal distribution)
- ApplicationId: za.co.strandcue.app
- Artifact SHA-256: ddfbede65f1fb0d077f3f8344e31e978af96393f2a8dd1dae85ac9c386df9453
- Expo SDK: 57 · version: 0.1.0

## Build 3 — preview APK (2026-09-24)

- Build ID: 2a52b54e-bca8-4372-922f-9f707b0b52e3, profile preview, ApplicationId za.co.strandcue.app
- EAS build ID: 2a52b54e-bca8-4372-922f-9f707b0b52e3
- Profile: preview (APK, internal distribution)
- ApplicationId: za.co.strandcue.app
- Artifact SHA-256: 03ec01e795a43709167a9dcd05714c508abe344bb6d5178332baaa2ce4f7740f — user-provided, 64-hex shape-valid; add the note "(user-provided; independently hash-verified for build 2 only)"

## Install 1 (2026-09-24)

- Installed on: Android emulator (model/API unrecorded)
- First launch: signup screen visible ("Begin your hair record"); old "Connect your development environment" warning ABSENT (EAS secrets present)
- Signup screen visible: yes ("Begin your hair record")
- Crashes on launch: none observed
- Screenshot: launch-01.png (local only)
- Finding: signup/signin attempt on device fails with "Your session could not be verified. Check your connection and try again." — backend auth config verified healthy separately (signup enabled, Resend SMTP set); prime suspect is EAS secret VALUES. Record as open finding, do not diagnose further.

## Finding update — signup-blocked RESOLVED / CLOSED (2026-09-24, human-verified)

- Prior open finding ("signup-blocked → EAS secret values suspect") is CLOSED as disproven.
- EAS secret VALUES are EXONERATED: a signup API call from build 3 reached Supabase and produced a real confirmation email.
- Signup never failed on network: the message seen was the client-side validation ("Confirm you are 18 or older and use a password with at least 12 characters") — 18+ box unchecked or short password. App behaved correctly (validation-behaved-correctly).
- Link-placement rule: confirmation/recovery links MUST be opened on the device — they use the custom scheme strandcue://auth/callback, which desktop browsers cannot resolve ("could not connect to the server" on desktop is expected, not a bug). This is the known Plan D motivation.
- Remaining open item: complete one full signup → confirm-on-device → signin loop on the emulator (human).

## Build 4

- EAS build ID: 7f3df1d3-6784-4718-86b8-c1c002a6d3e2, profile preview, ApplicationId za.co.strandcue.app
- Artifact: https://expo.dev/artifacts/eas/Xx5DBVELcZ2xeT1O4QQnohGFg7Y-eytMd9FSzkP81CY.apk
- APK SHA-256: 9503BBB5FE2321D305514F7A7997B849B1AD080FD2C14088C8407BBC4543C3D2 (controller-hashed from downloaded file)

## Install 4 — launch

- Installed on: Android emulator (emulator-5554). Launch OK.
- Observed via screenshots: authenticated Passport screen ("Your Hair Passport"), Activities tab loading production data, Settings screen signed in as @mark.
- Username screen NOT visually verified: a mis-tap signed the test account out of the device; no credentials on hand to re-enter. Both submit flows (normal + duplicate) pending with the account owner. Account data safe in production.

## Build 5 — export-delivery launch candidate (2026-10-10)

- Source commit: `7a08f31084079aca5c17e4ab01c28a26a4e6907a`.
- EAS preview build `44f614e1-0e3b-4859-a578-ee0d0dd46b02` completed successfully, but its remote preview signer is not the local release signer. It is retained as a test artifact and is not the locally distributed launch candidate.
- The accepted local release rebuild completed 544 Gradle tasks with Expo FileSystem and Expo Sharing linked natively.
- Package: `za.co.strandcue.app`; version `0.1.0`/code 1; min SDK 24; target SDK 36; ARM64 only.
- APK signature: v2; signer SHA-256 `F9:C2:31:91:03:C5:9B:DB:31:15:48:F4:F1:B7:DE:AC:F7:77:46:29:36:F2:D7:1A:F0:DA:28:57:39:0C:2D:60`, matching the live App Links association.
- APK: `%LOCALAPPDATA%\StrandCue\releases\StrandCue-0.1.0-launch-candidate-arm64-v8a.apk`; SHA-256 `9D13FCD60535AEB6FAE337A86121F9E5EF9C87198FF0818E048B9483B10F9FA6`; size 41,729,601 bytes.
- AAB: `%LOCALAPPDATA%\StrandCue\releases\StrandCue-0.1.0-launch-candidate-arm64-v8a.aab`; SHA-256 `045290055C33F2CE4C74582161E72203721A3FA10FCC1FB2966FBE3DC72F0E62`; size 30,996,817 bytes; `jarsigner -verify` exit 0.
- `npm run check:release-links` passed against the matching live certificate.
- Physical ARM64 installation and the signup, confirmation, recovery, offline, export share/save, deletion, and accessibility journeys remain pending.
## Build 6 — locally signed alpha artifact (2026-10-18)

- Source commit: `d8c2818a7fac0e996910a5a33d6784875800993b` (application source recorded in the signed artifact receipt).
- Package/version/version code: `za.co.strandcue.app`, `0.1.0`, `1`; ABI: `arm64-v8a`.
- APK: privately distributed alpha artifact; size `42027000` bytes; SHA-256 `b16ccedf1591eb1819106aaf91170be83de280f26be9b274ec148493c37d12b3`.
- Public signer certificate SHA-256: `b930b12ee536b12f2b9c562f2baf69aca8449bc21dea95386cc46986dd551fbe`; one signer. `apksigner` reports v1 false, v2 true, v3 true, v3.1 false, v4 false, and SourceStamp false; `zipalign -c -v 4` passed.
- Toolchain recorded for the native build: Node `24.19.0`, Java `17.0.20.1`, Gradle `9.3.1`, Android SDK platform `36`, build-tools `36.0.0`, NDK `27.1.12297006`, CMake `3.22.1`, Ninja `1.10.2`.
- Successful Gradle completion estimate: `2026-10-18T15:40:30.2006454+02:00` (Africa/Johannesburg, UTC+02:00), based on retained log `C:\scb\a\gradle-attempt3.log` `LastWriteTimeUtc` `2026-10-18T13:40:30.2006454Z`; its final lines report `BUILD SUCCESSFUL in 13m 36s`. This log filesystem timestamp estimates when redirected output finished; Gradle did not embed a wall-clock completion timestamp.
- `npm run verify:android-artifact` with the public certificate fingerprint: PASS.
- `npm run check:release-links` with this fingerprint: HOLD — the live association endpoint did not contain a matching app/certificate association. Production association was not changed.
- Physical-device/emulator installation and all acceptance journeys remain NOT RUN. No acceptance PASS is claimed.
- Tester packet: local distribution folder outside Git, supplied separately by the coordinator.

## Task 6 — signed APK emulator attempt (2026-10-18)

This records the initial attempt on `native-spike`; it was superseded for
installation by the separate fresh-AVD run below.

- Observed: `2026-10-18T20:12:09+02:00` (Africa/Johannesburg); metadata
  inspection completed immediately afterward.
- Device: Android Emulator `sdk_gphone64_x86_64`, Android 14 / API 34;
  ADB serial redacted as `emulator-****`. Reported ABIs are `x86_64,arm64-v8a`,
  so the candidate's ARM64 ABI is supported.
- Candidate: package `za.co.strandcue.app`, version `0.1.0` / code 1,
  SHA-256 `b16ccedf1591eb1819106aaf91170be83de280f26be9b274ec148493c37d12b3`.
  Independent local SHA-256 matched the supplied Task 5 receipt.
- Signer: SHA-256
  `b930b12ee536b12f2b9c562f2baf69aca8449bc21dea95386cc46986dd551fbe`;
  independent `apksigner verify --print-certs` matched the supplied receipt.
- Existing package: same application ID, version `0.1.0` / code 1, installed
  `2026-09-30 18:17:20`; its installed signing certificate differs from the
  candidate (Android rejected the update). No certificate or account identifiers
  were copied into this log.
- Install: **BLOCKED** — `adb install -r` returned
  `INSTALL_FAILED_UPDATE_INCOMPATIBLE: Existing package za.co.strandcue.app
  signatures do not match newer version; ignoring!` No uninstall or data clear
  was attempted because it could remove the existing app's data.
- First launch: **BLOCKED / NOT ATTEMPTED** — the candidate was not installed;
  the already-installed app was not launched as a substitute.
- Acceptance protocol: **0/9 run; all BLOCKED**. The signed candidate could not
  be installed, and dedicated synthetic accounts and scenario state were not
  available. No hosted account or data was created or modified. No screenshot
  or log containing identifiers was retained.
- Detailed per-scenario outcomes and exact missing preconditions:
  `.superpowers/sdd/2026-10-18-local-signed-android-apk-and-device-acceptance/task-6-report.md`.

## Task 6 continuation — fresh API 34 AVD (2026-10-18)

- A separate `strandcue-alpha-api34` AVD was created from the installed
  `system-images;android-34;google_apis;x86_64` image. The `native-spike` AVD
  was not wiped, uninstalled from, or intentionally modified.
- Device: Android Emulator `sdk_gphone64_x86_64`, Android 14 / API 34,
  ADB serial redacted as `emulator-****`. ADB package-path query returned no
  `za.co.strandcue.app` before installation.
- Install: **PASS** on the fresh AVD. An early attempt before first boot
  completed returned a PackageManager/StorageManager `NullPointerException`;
  after `sys.boot_completed=1`, the exact candidate installed successfully.
- Installed package: `za.co.strandcue.app`, version `0.1.0` / code 1.
  Pulled installed `base.apk` SHA-256 matched candidate hash
  `b16ccedf1591eb1819106aaf91170be83de280f26be9b274ec148493c37d12b3`; local
  `apksigner` verification reported signer SHA-256
  `b930b12ee536b12f2b9c562f2baf69aca8449bc21dea95386cc46986dd551fbe`.
- First launch: **FAIL**. `monkey -p za.co.strandcue.app 1` started the launcher
  activity, then the app crashed and Android force-finished it. Safe crash
  excerpt: `SoLoaderDSONotFoundError: couldn't find DSO to load: libreactnative.so`
  from the React Native startup path (`MainApplication.onCreate`, line 37).
  No app process remained; the launcher was foreground. A local screenshot
  shows the system UI not responding dialog after the crash. The fresh emulator
  was shut down cleanly after evidence capture.
- Protocol: **0/9 run; all BLOCKED** because the app crashed on launch and no
  dedicated synthetic accounts or execution state were available. No signup,
  server write, or hosted account/data change was attempted. No crash, owner
  leakage, or execution-integrity test proceeded past first launch.
- Safe local evidence (not committed):
  `C:\scb\artifacts\strandcue-alpha-api34-first-launch.png` and
  `C:\scb\artifacts\task6-launch-crash-safe.log`.
- Summary: `.superpowers/sdd/2026-10-18-local-android-apk/task-6-device-run.md`;
  detailed command record: `.superpowers/sdd/2026-10-18-local-signed-android-apk-and-device-acceptance/task-6-report.md`.

## Task 4 — universal APK first launch on a distinct clean x86_64 AVD (2026-10-18)

- Result: **PASS — first launch**. This supersedes the Task 6 crash observation
  for the earlier ARM64-only APK. The Task 3 universal APK was installed on a
  newly created `strandcue-universal-api34-x86_64` AVD from
  `system-images;android-34;google_apis;x86_64`. Existing `native-spike` and
  `strandcue-alpha-api34` AVDs were not changed or wiped.
- Observed: `2026-10-18 23:43 +02:00` (Africa/Johannesburg). Device model
  `sdk_gphone64_x86_64`, Android 14 / API 34; ADB serial redacted as
  `emulator-****`. Reported ABI list: `x86_64,arm64-v8a`.
- Clean package state: before install, `pm path za.co.strandcue.app` returned
  no package path and Package Manager was available after
  `sys.boot_completed=1`.
- Candidate: `C:\scb\artifacts\strandcue-universal-alpha-task3-fixed.apk`,
  package `za.co.strandcue.app`, version `0.1.0` / code 1, SHA-256
  `f68053fa3c9b6b78b7298b59a8574e6cceb3174444d16c8a423ec89eb06fd7d9`.
  `apksigner` reports exactly one signer; certificate SHA-256
  `b930b12ee536b12f2b9c562f2baf69aca8449bc21dea95386cc46986dd551fbe`.
- Install and installed artifact: **PASS**. `adb install` succeeded. Pulled
  installed `base.apk` SHA-256 exactly matched the candidate; `apksigner`
  verification of the installed file reported the same signer certificate.
  Android resolved `za.co.strandcue.app/.MainActivity`.
- Runtime: Android selected `primaryCpuAbi=x86_64`; native library directory
  reported as `/data/app/.../lib` (the path includes an ephemeral install ID).
  The app process PID remained `5768` across a 20-second observation, and
  `MainActivity` remained focused. Screenshot inspection shows StrandCue UI:
  the “Your hair, as you know it” development-environment setup surface. No
  crash, force-stop, or SoLoader error was observed.
- Bounded logcat: at `23:43 +02:00`, the last 600 brief-format entries were
  filtered for `SoLoader`, React Native startup/error tags, fatal exception,
  AndroidRuntime, package process, and displayed-activity lines. The filtered
  excerpt was empty and no crash-buffer event was observed. The safe external
  record is `C:\scb\artifacts\strandcue-universal-api34-task4-safe.log`.
- Safe screenshot retained outside Git at
  `C:\scb\artifacts\strandcue-universal-api34-first-launch.png`; it contains
  no account information. No account was created, no sign-in was attempted,
  and no hosted data was accessed or changed.
- Acceptance protocol remains **0/9; all scenarios BLOCKED**. First launch is
  proven, but the rendered app is at the development-environment connection
  setup state and no synthetic account or protocol fixture was available.
  This Task 4 run did not proceed into scenario execution.
- Detailed command and evidence record:
  `.superpowers/sdd/2026-10-18-universal-android-launch-repair/task-4-first-launch.md`.

## Task 6 — protocol acceptance disposition (2026-10-18)

- Run disposition recorded at `2026-10-18 23:55:18 +02:00` (Africa/Johannesburg;
  UTC `2026-10-18 21:55:18`). This is the evidence disposition time; no
  protocol scenario execution is claimed.
- Bound artifact: `strandcue-universal-alpha-task3-fixed.apk`, package
  `za.co.strandcue.app`, version `0.1.0` / code 1, SHA-256
  `f68053fa3c9b6b78b7298b59a8574e6cceb3174444d16c8a423ec89eb06fd7d9`;
  signer certificate SHA-256
  `b930b12ee536b12f2b9c562f2baf69aca8449bc21dea95386cc46986dd551fbe`.
- Source: artifact receipt identifies commit
  `d8c2818a7fac0e996910a5a33d6784875800993b`.
- Bound device: `strandcue-universal-api34-x86_64`, model
  `sdk_gphone64_x86_64`, Android 14 / API 34, reported ABIs
  `x86_64,arm64-v8a`; ADB serial redacted as `emulator-****`.
- Task 4 installation and first launch on this device: **PASS**. The installed
  APK hash and signer matched the candidate and the app rendered the
  development-environment setup UI. This is launch evidence only.
- Backend classification: **`blocked_production`**. The artifact receipt has
  no remote Supabase project reference and backend isolation is unproven.
  Reserved labels `SC-ANDROID-T5-OWNER-A` and
  `SC-ANDROID-T5-OWNER-B` do not represent created accounts; no account,
  credentials, shelf, decision, execution, or receipt exists for them. No
  hosted data was accessed or changed, and no hosted writes were authorized.
- Canonical protocol acceptance: **0/9 run; all 9 BLOCKED**. Each exact
  missing synthetic precondition is recorded in
  `.superpowers/sdd/2026-10-18-universal-android-launch-repair/task-6-device-acceptance.md`
  and reflected in `android-acceptance-checklist.md`. No authoritative server
  revision, idempotent retry result, or no-duplicate-effect evidence was
  collected.
- Adjacent journeys, tracked separately from scenarios 1–9: signup, account
  confirmation, recovery, export/share, deletion/cancellation, offline launch,
  TalkBack, and touch-target checks are all **NOT RUN**.
- Triage: no security, privacy, or execution-integrity failure was observed
  because account-dependent flows were not entered. Distribution acceptance
  remains HOLD pending proven isolated backend identity, reviewed synthetic
  fixtures, and a new artifact/device-bound run.
- Detailed report:
  `.superpowers/sdd/2026-10-18-universal-android-launch-repair/task-6-report.md`;
  canonical scenario and adjacent-journey evidence:
  `.superpowers/sdd/2026-10-18-universal-android-launch-repair/task-6-device-acceptance.md`.
