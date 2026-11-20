# Task 6 device run summary

Run date: 2026-10-18 (Africa/Johannesburg). Detailed report:
`.superpowers/sdd/2026-10-18-local-signed-android-apk-and-device-acceptance/task-6-report.md`.

- A fresh `strandcue-alpha-api34` AVD was created from the installed Android
  14/API 34 Google APIs x86_64 image. The target package was absent before
  install. The existing `native-spike` AVD was not wiped or uninstalled from.
- Candidate package: `za.co.strandcue.app`, version `0.1.0` / code 1.
  Candidate SHA-256:
  `b16ccedf1591eb1819106aaf91170be83de280f26be9b274ec148493c37d12b3`.
  **Install: PASS** after emulator boot completed.
- Installed `base.apk` hash and signer matched the candidate and Task 5 receipt.
- **First launch: FAIL.** App crashed with
  `SoLoaderDSONotFoundError: couldn't find DSO to load: libreactnative.so`;
  Android force-finished `MainActivity`. Acceptance stopped at this crash.
- Scenarios 1–9: **BLOCKED, 0 run**. No dedicated synthetic accounts or
  execution states were available. Release-adjacent journeys are also
  **BLOCKED / NOT RUN**. No hosted accounts/data were created or changed.
- Safe screenshot and redacted crash excerpt remain local under
  `C:\scb\artifacts\`; they are not committed.

Checklist and device log: `docs/verification/android-acceptance-checklist.md`
and `docs/verification/device-evidence.md`.
