# Task 5 artifact receipt — signed Android alpha APK

## Artifact identity

- Application source commit: `d8c2818a7fac0e996910a5a33d6784875800993b`.
- Successful Gradle completion estimate: `2026-10-18T15:40:30.2006454+02:00` (Africa/Johannesburg, UTC+02:00), derived from the retained successful output log `C:\scb\a\gradle-attempt3.log` `LastWriteTimeUtc` `2026-10-18T13:40:30.2006454Z`. Its final lines report `BUILD SUCCESSFUL in 13m 36s`. This is a filesystem-metadata estimate of when the redirected Gradle output finished; Gradle did not embed a wall-clock completion timestamp.
- Package: `za.co.strandcue.app`.
- Version: `0.1.0` (version code `1`).
- ABI: `arm64-v8a`.
- APK size: `42027000` bytes.
- APK SHA-256: `b16ccedf1591eb1819106aaf91170be83de280f26be9b274ec148493c37d12b3`.
- APK signature verification: v1 false, v2 true, v3 true, v3.1 false, v4 false, SourceStamp false; one signer.
- Public certificate SHA-256: `b930b12ee536b12f2b9c562f2baf69aca8449bc21dea95386cc46986dd551fbe`.

## Build and verification

- Runtime/toolchain: Node `24.19.0`; Java `17.0.20.1`; Gradle `9.3.1`; Android SDK platform `36`; Android build-tools `36.0.0`; NDK `27.1.12297006`; CMake `3.22.1`; Ninja `1.10.2`.
- `npm run verify:android-artifact -- <APK>` with `STRANDCUE_ANDROID_CERT_SHA256` set to the public certificate fingerprint: PASS. The verifier confirmed package, version, source receipt, ABI, signer count, certificate fingerprint and APK hash; zipalign reported `Verification successful`.
- `npm run check:release-links` with `STRANDCUE_ANDROID_CERT_SHA256` set to the public certificate fingerprint in uppercase colon-separated form: HOLD — the live association did not match this package and certificate. No production configuration was changed.
- Device installation and all nine Android acceptance scenarios: NOT RUN.

The APK remains outside Git. This receipt contains no signing secret or private-key location.
