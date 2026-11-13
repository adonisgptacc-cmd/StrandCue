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

## Initial native-spike attempt (superseded by continuation below)

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

## Initial scenario results (no execution)

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

## Initial release-adjacent status

Signup, email confirmation, password recovery, export/share, account
deletion/cancellation, offline launch, and TalkBack/touch-target observations
are **BLOCKED / NOT RUN** because the candidate was not installed. No account
flow or server-side operation was attempted.

Checklist: `docs/verification/android-acceptance-checklist.md`.
Device evidence log: `docs/verification/device-evidence.md`.

## Fresh AVD continuation — first launch result

Continuation run: 2026-10-18, Africa/Johannesburg. The prior `native-spike`
install attempt and its signature mismatch are recorded above. For this run a
separate `strandcue-alpha-api34` AVD was created from the already-installed
Google APIs x86_64 API 34 image. No wipe, uninstall, or direct package/data
operation was performed on `native-spike`.

### Commands and observed results

Commands were run from PowerShell with these paths:

```powershell
$sdk = '<Android SDK root>'
$avdmanager = "$sdk\cmdline-tools\latest\bin\avdmanager.bat"
$emulator = "$sdk\emulator\emulator.exe"
$adb = "$sdk\platform-tools\adb.exe"
$apk = 'C:\scb\artifacts\strandcue-d8c2818-arm64-alpha-signed.apk'
```

1. `& $avdmanager create avd --name strandcue-alpha-api34 --package 'system-images;android-34;google_apis;x86_64' --device pixel_6` — completed; AVD manager selected x86_64.
2. `Start-Process -FilePath $emulator -ArgumentList @('-avd','strandcue-alpha-api34','-no-snapshot','-no-boot-anim','-port','5556') -PassThru -WindowStyle Hidden` — launched separately from `native-spike`.
3. `& $adb devices -l`, then `& $adb -s emulator-5556 shell getprop sys.boot_completed` and `getprop ro.product.model`, `getprop ro.build.version.release`, `getprop ro.build.version.sdk` — device `sdk_gphone64_x86_64`, Android 14/API 34. After boot: `sys.boot_completed=1`; boot animation stopped.
4. `adb -s emulator-5556 shell pm path za.co.strandcue.app` before install — no package path returned (clean target package state).
5. Candidate hash check (`Get-FileHash -Algorithm SHA256`) — `b16ccedf1591eb1819106aaf91170be83de280f26be9b274ec148493c37d12b3`.
6. `& $adb -s emulator-5556 install $apk` before first boot completed failed with a PackageManager/StorageManager `NullPointerException` in `allocateBytes`. No app package was installed by that attempt.
7. After `& $adb -s emulator-5556 shell getprop sys.boot_completed` returned `1`, the same install command — **Success**.
8. `& $adb -s emulator-5556 shell pm path za.co.strandcue.app` and `& $adb -s emulator-5556 shell dumpsys package za.co.strandcue.app` — installed package `za.co.strandcue.app`, version `0.1.0` / code 1.
9. `& $adb -s emulator-5556 pull '/data/app/~~PliXGPMK5z1h45rSAAtdRA==/za.co.strandcue.app-ekhk6reWr5tboXcu-3r5xg==/base.apk' C:\scb\artifacts\task6-installed-base.apk`; local SHA-256 was identical to the candidate. `& "$sdk\build-tools\36.0.0\apksigner.bat" verify --print-certs C:\scb\artifacts\task6-installed-base.apk` reported signer SHA-256 `b930b12ee536b12f2b9c562f2baf69aca8449bc21dea95386cc46986dd551fbe`, matching the Task 5 receipt.
10. `& $adb -s emulator-5556 shell cmd package resolve-activity --brief -c android.intent.category.LAUNCHER za.co.strandcue.app` — resolved to `za.co.strandcue.app/.MainActivity`.
11. `& $adb -s emulator-5556 logcat -c`, followed by `& $adb -s emulator-5556 shell monkey -p za.co.strandcue.app 1`, injected one launch event. The app process exited; the foreground returned to the system launcher. Logcat at `2026-10-18 20:20:05.545` recorded `SoLoaderDSONotFoundError: couldn't find DSO to load: libreactnative.so`, followed by `ActivityTaskManager` force-finishing `.MainActivity`. **First launch: FAIL (crash).**
12. `& $adb -s emulator-5556 shell screencap -p /sdcard/task6-first-launch.png`, then `& $adb -s emulator-5556 pull /sdcard/task6-first-launch.png C:\scb\artifacts\strandcue-alpha-api34-first-launch.png`, saved a local screenshot showing the system UI not responding dialog. Safe, redacted crash excerpt was saved locally. The fresh AVD was shut down with `& $adb -s emulator-5556 emu kill` after evidence capture.

The launch crash is a stop condition. No retry, signup, protocol scenario,
account switch, server operation, or accessibility flow was attempted after it.
The exact failing library is evidence from the crash log; no root cause is
asserted here. The existing `native-spike` AVD/data was not wiped or uninstalled
from. No dedicated synthetic credentials or scenario state were available.

### Results

- Fresh AVD setup and clean package check: **PASS**.
- Candidate install: **PASS** after boot completion.
- Installed bytes and signer match: **PASS**.
- First launch: **FAIL** due to `libreactnative.so` load failure.
- Scenarios 1–9: **BLOCKED**, 0 run. Shared blocker: candidate crashes at
  startup; dedicated synthetic accounts and scenario execution state are also
  unavailable.
- Signup, confirmation, recovery, export/share, deletion/cancellation, offline
  launch, TalkBack, and touch-target checks: **BLOCKED / NOT RUN**.
- Local-only evidence: `C:\scb\artifacts\strandcue-alpha-api34-first-launch.png`
  and `C:\scb\artifacts\task6-launch-crash-safe.log`; neither is committed.

Summary record:
`.superpowers/sdd/2026-10-18-local-android-apk/task-6-device-run.md`.
