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
`STRANDCUE_ANDROID_STORE_PASSWORD`, and `STRANDCUE_ANDROID_KEY_PASSWORD`.
The certificate fingerprint is pinned in tracked verifier code and cannot be
replaced through the environment. No signing value is needed by this preflight.
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
The fingerprint read from the alpha keystore must match the tracked pin before
signing.
Use `keytool -genkeypair` with `-storepass:env STRANDCUE_ANDROID_STORE_PASSWORD`
and `-keypass:env STRANDCUE_ANDROID_KEY_PASSWORD`; this keeps password values out
of command history. The alias is `strandcue-local-alpha`.

Do not extract and rebuild an APK with `jar`, `zip`, or another archiver. That
changes native ZIP entry methods and can break launch when
`extractNativeLibs=false`. Keep the original APK unchanged. If needed, run
`zipalign -f -P 16 4 <input.apk> <aligned.apk>` to create a separate aligned
copy, then sign directly to a new output with `apksigner sign --out <signed.apk>`.
This replaces the old signer while preserving native entry methods. Supply
passwords with `--ks-pass env:STRANDCUE_ANDROID_STORE_PASSWORD` and
`--key-pass env:STRANDCUE_ANDROID_KEY_PASSWORD`.

Capture the public SHA-256 certificate fingerprint from `keytool -list -v` and
compare it with the tracked pin before signing. Alongside the signed APK,
write a local `*.source-receipt.json` containing only `sourceCommit`,
`inputApkSha256`, and `signedApkSha256`. The signed hash must be the SHA-256 of
the exact APK being verified. The verifier checks both the recorded input APK
hash and signed APK hash against the approved input and inspected artifact.
The receipt, APK, keystore, and password record remain outside Git.

Run the verifier with Node 24.x and Android build-tools 36.0.0:

```powershell
npm run verify:android-artifact -- C:\scb\artifacts\strandcue-alpha.apk
```

The verifier runs `zipalign -c -P 16 -v 4`, `aapt dump badging` and
`aapt dump xmltree`,
`apksigner verify --verbose --print-certs`, `jar tf`, and NDK
`llvm-readelf -h -d` over each native library. It requires package
`za.co.strandcue.app`, source commit `d8c2818a7fac0e996910a5a33d6784875800993b`,
universal unsigned input SHA-256
`d582bdf4110ce73cba386cfe16ad6cb16de97560862b35a26a9ea8b96b635b16`, exactly
the ABIs `arm64-v8a` and `x86_64`, the pinned 22-library manifest in each ABI,
the expected ELF machine for each ABI, closed `DT_NEEDED` dependencies, version
`0.1.0` / version code `1`, exactly one signer, and pinned public certificate
SHA-256 `b930b12ee536b12f2b9c562f2baf69aca8449bc21dea95386cc46986dd551fbe`.
The canonical native manifest SHA-256 is pinned as
`c459015a3b52af685ebadf3e529f5fa952d1c89c923493d903eef545c519b6cd`.
It also requires `extractNativeLibs=false`, all 44 native libraries ZIP STORED,
and each native data offset aligned to a 16 KiB page boundary.
Source, input, native-manifest, and certificate trust anchors live in tracked
verifier code; caller environment values cannot replace them. Tool paths may be
configured through the documented `STRANDCUE_*` process variables.

Before signing, check the existing alpha key's **public certificate** against
the pinned fingerprint above. Stop if it differs. Keep the original Gradle APK
unchanged. Preserve native ZIP entries by aligning a separate copy with
`zipalign -f -P 16 4 <input.apk> <aligned.apk>` only when needed, then sign
directly to a new output using `apksigner sign --out <signed.apk>`. Do not
repack the APK or remove signature records manually. Supply passwords through
process environment variables populated from the DPAPI-protected password
record; do not place password values on command lines or print the keystore path.

Write the signed APK and its `.source-receipt.json` outside the checkout. The
receipt contains only `sourceCommit`, `inputApkSha256`, and `signedApkSha256`.
Run `zipalign -c -P 16 -v 4`, `apksigner verify --verbose --print-certs`,
`npm run verify:android-artifact -- <signed-apk>`, and SHA-256 hashing on the
exact signed file. A missing tool, missing field, malformed output, unsigned or
multiply signed APK, wrong ABI/native inventory, unresolved dependency, or
receipt mismatch returns `ANDROID-ARTIFACT-HOLD` with stable codes; raw tool
output is not included. The verifier prints `ANDROID-ARTIFACT-PASS` only when
all pinned checks pass.
