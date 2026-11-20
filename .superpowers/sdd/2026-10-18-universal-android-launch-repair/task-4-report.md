# Task 4 universal Android launch report

## Result

**PASS — universal APK first launch on the required fresh x86_64 AVD.** The
process remained alive and Android rendered the StrandCue development
environment setup UI. No source or configuration fix was needed. Protocol
scenarios remain 0/9 BLOCKED because synthetic accounts and fixtures were not
available.

## Artifact and signer binding

- Candidate: `C:\scb\artifacts\strandcue-universal-alpha-task3-fixed.apk`
- SHA-256: `f68053fa3c9b6b78b7298b59a8574e6cceb3174444d16c8a423ec89eb06fd7d9`
- Package/version: `za.co.strandcue.app`, `0.1.0`, version code `1`
- `apksigner` verification: one signer; certificate SHA-256
  `b930b12ee536b12f2b9c562f2baf69aca8449bc21dea95386cc46986dd551fbe`
- Installed `base.apk` SHA-256 exactly matched the candidate. The pulled
  installed base APK independently verified with the same signer certificate.

## Device and installation

- AVD: `strandcue-universal-api34-x86_64`, created from
  `system-images;android-34;google_apis;x86_64`.
- Existing AVDs `native-spike` and `strandcue-alpha-api34` were not wiped or
  modified.
- Boot gate: `sys.boot_completed=1`; Android 14 / API 34; device model
  `sdk_gphone64_x86_64`; ADB serial redacted as `emulator-****`.
- Reported CPU ABIs: `x86_64,arm64-v8a`.
- Before installation, Package Manager was responsive and `pm path
  za.co.strandcue.app` returned no path, confirming the package was absent.
- Install: `adb install` succeeded. Package metadata reports version `0.1.0`,
  version code `1`, target SDK `36`, and `primaryCpuAbi=x86_64`.
- Resolved launcher activity: `za.co.strandcue.app/.MainActivity`.

## Launch observation

- Observation time: `2026-10-18 23:43:24 +02:00` (Africa/Johannesburg).
- Launch command: `am start -W -n za.co.strandcue.app/.MainActivity` returned
  `Status: ok`, `LaunchState: COLD`, and `Complete`.
- Process remained alive with the same PID across a 20-second interval.
  `MainActivity` remained the focused application window.
- First rendered surface: StrandCue “Your hair, as you know it” UI with the
  “Connect your development environment” setup card. The card says no account
  or record has been created and calls for synthetic test data. This is a
  successful UI render, though backend-connected acceptance flows are not
  available from this state.
- No crash or force-stop was observed. The bounded logcat query collected the
  last 600 brief-format entries, then filtered for SoLoader, React Native,
  fatal exception, AndroidRuntime, package process, and displayed-activity
  lines. It produced no matching lines; the crash buffer also had no event.
- Screenshot: `C:\scb\artifacts\strandcue-universal-api34-first-launch.png`.
  Bounded, scrubbed log record:
  `C:\scb\artifacts\strandcue-universal-api34-task4-safe.log`. Both remain
  outside Git.

## Scope and remaining status

No sign-in, account creation, signup, or protocol scenario was attempted. No
hosted account or data was accessed or changed. Since the first launch passed,
Task 4 did not enter the failure-diagnosis or source-repair steps. Acceptance
scenarios 1–9 remain BLOCKED pending dedicated synthetic accounts and protocol
fixtures; this launch result does not claim a scenario PASS.
