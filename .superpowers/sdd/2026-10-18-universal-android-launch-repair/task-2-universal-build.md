# Universal Android build receipt

- Result: **PASS** — universal release APK built from exact source commit `d8c2818a7fac0e996910a5a33d6784875800993b`.
- Fresh source archive SHA-256: `d29c2e259310251c53881b8ff58b2f9e2deb6f437d42ba05894837bc3cde77ab`; embedded Git commit marker matched the required source commit.
- Toolchain: Node `24.19.0`, Java `17.0.20.1`, Android SDK `36`, build-tools `36.0.0`, NDK `27.1.12297006`, CMake `3.22.1`, Ninja present. Local preflight passed with 487 GiB available; the final 8-character extraction root was separately real-path checked immediately before extraction.
- Locked dependency install: `npm ci --ignore-scripts` passed. Expo Android prebuild passed with `CI=1`.
- Gradle result: attempt 3 passed in `22m 56s` with `-PreactNativeArchitectures=arm64-v8a,x86_64`; the resolved Gradle property was exactly `arm64-v8a,x86_64`.
- Application identity: `za.co.strandcue.app`, version `0.1.0`, version code `1`.

| ABI | Native libraries | ELF machine | Exact reviewed 22-library set | Dependency closure |
| --- | ---: | --- | --- | --- |
| `arm64-v8a` | 22 | AArch64 | PASS | PASS |
| `x86_64` | 22 | Advanced Micro Devices X86-64 | PASS | PASS |

Task 1 native manifest validator returned **PASS** with no errors. The APK contains exactly those two ABIs and 44 native library entries total. ZIP alignment and APK signature verification passed. The build output is debug-signed by the generated Gradle debug signing configuration; no separate signing operation was performed.

- APK SHA-256: `d582bdf4110ce73cba386cfe16ad6cb16de97560862b35a26a9ea8b96b635b16`
- APK size: `63,077,461` bytes
- APK location: outside the repository under the local `C:\scb` scratch area.

Attempt 1 stopped at SDK discovery because `ANDROID_HOME` was unset. Attempt 2 found the SDK but failed when Ninja exceeded Windows’ 260-character filename limit. Attempt 3 used a fresh archive and a shorter scratch path and completed successfully.

Review concerns: npm reported 30 dependency advisories (11 moderate, 19 high). Gradle emitted upstream deprecation warnings; Metro emitted a `NODE_ENV`-unset warning while selecting `.env.local` and `.env`. These did not prevent the release build or native validation.

Detailed local paths, build logs, and native dependency data are in the ignored `task-2-report.md` and external receipts under `C:\scb`.
