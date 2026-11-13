# Local Android arm64 release compilation receipt

Date: 2026-10-18. **Compilation PASS; release signing and device acceptance HOLD.**

The disposable build used application source commit
`d8c2818a7fac0e996910a5a33d6784875800993b`, not the later evidence
worktree HEAD `be54dee7926256b0fafae59bbb54cadfdd76857c`. A fresh `git archive`
reported that exact embedded commit marker. Its SHA-256 was
`d29c2e259310251c53881b8ff58b2f9e2deb6f437d42ba05894837bc3cde77ab`;
the extracted `apps/mobile/app.json` matched the pinned Git object. The same
archive hash and source check were obtained for both disposable paths.

Preflight passed before either extraction: Node 24.19.0, Java 17.0.20.1,
Android SDK present, scratch path under the normal `C:\scb` directory and
sufficient disk space. Immediately before extraction, each new child path was
rechecked for containment and reparse points. Dependencies were restored with
the committed lockfile using Node 24 and `npm ci --ignore-scripts`; the lockfile
hash stayed unchanged. Expo Android prebuild ran with `CI=1` and `--no-install`
in each fresh tree. `app.json` resolved to `za.co.strandcue.app`. Generated
Android files, dependency trees and full logs stayed outside Git.

Three controlled Gradle attempts used Java 17 and the same clean arm64 command:

```powershell
.\gradlew.bat clean :app:assembleRelease -PreactNativeArchitectures=arm64-v8a --max-workers=2 --stacktrace
```

1. `C:\scb\b3-6f2c18a`: failed during Gradle configuration, before native
   compilation. Gradle could not locate the SDK because `ANDROID_HOME` was
   unset. The SDK itself had passed preflight.
2. Same tree, with only process-local `ANDROID_HOME` set to the existing SDK:
   failed at `:app:buildCMakeRelWithDebInfo[arm64-v8a]`. Ninja reported
   `Filename longer than 260 characters` for a gesture-handler object. Its
   reported relative path measured 266 characters. CMake was 3.22.1, Ninja
   1.10.2 and NDK 27.1.12297006. No offline Gradle mode was forced.
3. Fresh `C:\scb\a` archive, with the SDK variable retained: substituting the
   shorter child name into the failed relative path projected 257 characters.
   The successful `build.ninja` instead used a hashed 169-character relative
   path for that object. Gradle reported `:app:assembleRelease` and
   `BUILD SUCCESSFUL in 13m 36s` (521 actionable tasks: 513 executed, 8
   up-to-date).

The current attempt produced a non-empty APK at
`C:\scb\a\apps\mobile\android\app\build\outputs\apk\release\app-release.apk`.
A byte-identical copy is retained outside Git at
`C:\scb\artifacts\strandcue-d8c2818-arm64-debug-signed.apk`:

| Check | Observed value |
| --- | --- |
| Size | 41,937,725 bytes |
| SHA-256 | `466330d1578e8019cb6e312b2653e750a550338d6c2637d5cda076555236b1ae` |
| Package | `za.co.strandcue.app`, version `0.1.0` |
| Native architecture | `arm64-v8a` only; 22 `.so` entries |
| Signature | APK Signature Scheme v2 verifies; signer is **Android Debug** |

This validates native compilation and the debug-signed APK produced by Expo's
generated release configuration. It does not establish production signing,
certificate/App Links association, installation or any device acceptance case.
No repository source or lockfile was changed to obtain the build, and no
credential, signing operation, deployment, push or hosted service was used.
