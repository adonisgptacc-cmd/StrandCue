# Task 3 universal Android artifact receipt

- Status: verified signed alpha artifact; previous artifact rejected and non-distributable
- Artifact: `C:\scb\artifacts\strandcue-universal-alpha-task3-fixed.apk`
- APK SHA-256: `f68053fa3c9b6b78b7298b59a8574e6cceb3174444d16c8a423ec89eb06fd7d9`
- Size: `63168148` bytes
- Package/version: `za.co.strandcue.app` / `0.1.0` (`versionCode` `1`)
- Source commit: `d8c2818a7fac0e996910a5a33d6784875800993b`
- Unsigned universal input SHA-256: `d582bdf4110ce73cba386cfe16ad6cb16de97560862b35a26a9ea8b96b635b16`
- ABIs: `arm64-v8a`, `x86_64`; 22 validated DSOs per ABI
- Native manifest SHA-256: `c459015a3b52af685ebadf3e529f5fa952d1c89c923493d903eef545c519b6cd`
- Native ZIP: 44 entries STORED (method 0); 44 of 44 data offsets 16 KiB aligned; `extractNativeLibs=false`
- Signers: exactly one; public certificate SHA-256 `b930b12ee536b12f2b9c562f2baf69aca8449bc21dea95386cc46986dd551fbe`
- Alignment: `zipalign -c -P 16 -v 4` passed after signing
- Artifact verifier: `ANDROID-ARTIFACT-PASS`
- External source receipt: contains only `sourceCommit`, `inputApkSha256`, and `signedApkSha256`

The previously issued `strandcue-universal-alpha-task3.apk` is REJECTED and
NON-DISTRIBUTABLE. It had 44 compressed native entries (method 8) and 44
misaligned native data offsets despite passing the earlier verifier. It remains
preserved for audit and must not be distributed. The replacement was signed
directly from the original Gradle APK without extraction or repacking.

The alpha public certificate was checked before signing and matched the tracked
fingerprint pin. The original input APK was left unchanged. Private identity
locations and password values are omitted from this receipt.
