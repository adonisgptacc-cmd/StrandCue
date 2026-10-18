# Local Android APK build preflight

The application source for this build is exactly
`d8c2818a7fac0e996910a5a33d6784875800993b`. Later documentation and
evidence commits may advance the worktree HEAD. Keep the evidence worktree clean;
the preflight checks that condition separately from the pinned source object.

Use Node 24.x, Java 17, the Android SDK with platform `android-36`, build-tools
`36.0.0`, NDK `27.1.12297006`, CMake `3.22.1` and its Ninja binary, and Android
platform-tools. The preflight requires `android-36/android.jar`, build-tools
`apksigner.bat`, `aapt.exe`, and `zipalign.exe`, and platform-tools `adb.exe`.
On this Windows host, select the existing Node 24 runtime in
the current process before invoking npm. The CLI reads Java from `JAVA_HOME` when
set, otherwise from `PATH`. It reads the SDK from `ANDROID_HOME`, then
`ANDROID_SDK_ROOT`, then the standard path beneath `LOCALAPPDATA`.

Create the approved scratch root `C:\scb` as a normal local directory before
preflight. The CLI rejects a missing root and existing scratch-path components
that resolve through a junction or symlink. The full scratch directory path must be
at most **40 characters**, and the target drive must have at least **30 GiB**
available. Choose a fresh child directory for each attempt and pass that exact
path to the preflight:

```powershell
npm run check:android-local -- --scratch C:\scb\build-d8c2818
```

`ANDROID-LOCAL-PASS` prints the pinned source SHA, current evidence HEAD, Node
and Java majors, SDK availability, scratch length, and free bytes. A one-line
`ANDROID-LOCAL-HOLD` prints stable codes only and exits nonzero. Resolve every
HOLD before prebuild. The command verifies that the pinned source object is a
Git commit; the later archive/extraction step must also verify that the archive
was made from that exact object. A PASS does not attest an APK or device result.

Run **one native build at a time**. Do not share a generated `android/`, `.cxx/`,
Gradle cache, or `node_modules` junction between attempts. Keep generated files,
APKs, logs, and screenshots in the disposable scratch area or another approved
local folder outside the Git worktree. After preserving redacted failure facts or
the verified artifact receipt, stop Gradle/ADB users of the scratch directory,
confirm the absolute target is a child of `C:\scb`, then remove that attempt's
directory. Never remove `C:\scb` wholesale or clean another active attempt.
Recheck the resolved path immediately before extraction and cleanup because a
path can change after preflight.

Signing inputs remain external. Planned process-local names are
`STRANDCUE_ANDROID_KEYSTORE`, `STRANDCUE_ANDROID_KEY_ALIAS`,
`STRANDCUE_ANDROID_STORE_PASSWORD`, and `STRANDCUE_ANDROID_KEY_PASSWORD`;
`STRANDCUE_ANDROID_CERT_SHA256` is the public certificate fingerprint used by
the later association check. No signing value is needed by this preflight.
Never store a keystore, passwords, Expo token, Supabase secret, or service-account
JSON in Git, build logs, shell history, or tester messages. Do not print an
environment dump.
