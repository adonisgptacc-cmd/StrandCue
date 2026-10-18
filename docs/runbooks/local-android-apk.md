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

## Local alpha signing and artifact verification

Keep the local alpha PKCS12 keystore and its DPAPI-protected password record in a
user-only directory outside the checkout. The key is for local acceptance only;
never use it as a release identity. If no StrandCue alpha key exists, create one
once and preserve it for later device acceptance. Generate its password in a
PowerShell `SecureString`, persist only the output of `ConvertFrom-SecureString`,
and set the four `STRANDCUE_ANDROID_*` process variables from that secure record
for each signing session. Do not print those variables or the keystore path.
Use `keytool -genkeypair` with `-storepass:env STRANDCUE_ANDROID_STORE_PASSWORD`
and `-keypass:env STRANDCUE_ANDROID_KEY_PASSWORD`; this keeps password values out
of command history. The alias is `strandcue-local-alpha`.

Before signing, remove prior APK signature records (`META-INF/MANIFEST.MF` and
`.SF`, `.RSA`, `.DSA`, or `.EC` signature blocks) from a disposable extraction of
the source APK. Rebuild the APK outside the checkout, run `zipalign -f 4` to a
new file, then sign that aligned file with `apksigner sign`. Supply passwords
with `--ks-pass env:STRANDCUE_ANDROID_STORE_PASSWORD` and
`--key-pass env:STRANDCUE_ANDROID_KEY_PASSWORD`. Do not reuse or overwrite the
input artifact.

Capture the public SHA-256 certificate fingerprint from `keytool -list -v` and
set `STRANDCUE_ANDROID_CERT_SHA256` for verification. Alongside the signed APK,
write a local `*.source-receipt.json` containing only `sourceCommit`,
`inputApkSha256`, and `signedApkSha256`. The signed hash must be the SHA-256 of
the exact APK being verified. The verifier checks both the recorded input APK
hash and signed APK hash against the approved input and inspected artifact.
The receipt, APK, keystore, and password record remain outside Git.

Run the verifier with Node 24.x and Android build-tools 36.0.0:

```powershell
npm run verify:android-artifact -- C:\scb\artifacts\strandcue-alpha.apk
```

The verifier runs `zipalign -c -v 4`, `aapt dump badging`,
`apksigner verify --verbose --print-certs`, and `jar tf`, then checks package
`za.co.strandcue.app`, the pinned source commit and input APK hash, the
`arm64-v8a` ABI, version `0.1.0` / version code `1`, a single signer with the
configured public fingerprint, a valid APK SHA-256, and a matching source
receipt. Source commit and input APK hash expectations are pinned in tracked
verifier code; caller environment values cannot replace them. It parses apksigner's declared signer count and
requires one digest record for every contiguous signer number. A missing,
duplicate, gapped, or inconsistent signer record returns HOLD. The zipalign
check runs on the exact APK being inspected; a missing tool or nonzero result
returns HOLD. It prints
`ANDROID-ARTIFACT-PASS` only when every required field is present and unambiguous.
Missing tools, missing fields, malformed output, unsigned or multiply signed
APKs, and receipt mismatches return `ANDROID-ARTIFACT-HOLD` with stable codes;
raw tool output is not included.
