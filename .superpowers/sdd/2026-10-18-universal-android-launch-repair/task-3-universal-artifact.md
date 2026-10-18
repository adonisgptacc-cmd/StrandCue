# Task 3 universal Android artifact receipt

- Status: verified signed alpha artifact
- Artifact: `C:\scb\artifacts\strandcue-universal-alpha-task3.apk`
- APK SHA-256: `3461d07d0352189d28ce96b1e9956cc382b0254b773fd8c50fce6d28e956bd9b`
- Size: `31470272` bytes
- Package/version: `za.co.strandcue.app` / `0.1.0` (`versionCode` `1`)
- Source commit: `d8c2818a7fac0e996910a5a33d6784875800993b`
- Unsigned universal input SHA-256: `d582bdf4110ce73cba386cfe16ad6cb16de97560862b35a26a9ea8b96b635b16`
- ABIs: `arm64-v8a`, `x86_64`; 22 validated DSOs per ABI
- Native manifest SHA-256: `c459015a3b52af685ebadf3e529f5fa952d1c89c923493d903eef545c519b6cd`
- Signers: exactly one; public certificate SHA-256 `b930b12ee536b12f2b9c562f2baf69aca8449bc21dea95386cc46986dd551fbe`
- Alignment: `zipalign -c -v 4` passed after signing
- Artifact verifier: `ANDROID-ARTIFACT-PASS`
- External source receipt: contains only `sourceCommit`, `inputApkSha256`, and `signedApkSha256`

The alpha public certificate was checked before signing and matched the tracked
fingerprint pin. The input APK was left unchanged. Keystore and DPAPI record
locations and password values are omitted from this receipt.
