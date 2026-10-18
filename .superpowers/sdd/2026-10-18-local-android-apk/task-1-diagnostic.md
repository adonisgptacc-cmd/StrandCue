# Android native build diagnostic baseline

Date: 2026-10-18. Scope: evidence capture only; no build or configuration fix attempted.

## Source and preflight

- Required source object `d8c2818a7fac0e996910a5a33d6784875800993b` exists and is a commit (`docs: record final increment four approval`).
- Documentation/evidence HEAD at the clean preflight: `9d25b867d63e303770055cce8654c3d98f267334`. `git status --short` was empty.
- Initial shell-selected Node was `v25.1.0`, which failed the brief's 24.x preflight expectation. The diagnostic paused there. On resumption, a process-local PATH prefix selected `C:\Users\ABADO\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe`, version `v24.19.0`; source and clean-tree checks still passed. No system Node installation was changed.
- Task 25's prior Android attempt used implementation commit `02fd96a`.

## Local toolchain and host

| Component | Observed value |
| --- | --- |
| Java | Microsoft OpenJDK `17.0.20.1` (`17.0.20.1+1-LTS`); `C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot\bin\java.exe` |
| `JAVA_HOME` | `C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot\` |
| Android SDK | `C:\Users\ABADO\AppData\Local\Android\Sdk` (exists; discovered at the standard local path; `ANDROID_HOME` and `ANDROID_SDK_ROOT` were unset) |
| Android platforms | `android-34`, `android-36`, `android-37.0` |
| Android build-tools | Installed: `35.0.0`, `36.0.0`; the retained failure evidence does not identify which Gradle selected |
| Android NDK | `27.1.12297006`; selected path confirmed by the prior generated app's `CMakeCache.txt` |
| Android CMake | `3.22.1`; selected executable confirmed by `CMakeCache.txt`; SDK executable reports `3.22.1-g37088a8-dirty` |
| Ninja | Selected SDK CMake `ninja.exe` confirmed by `CMakeCache.txt`; reports `1.10.2` |
| Android Debug Bridge | SDK `platform-tools\adb.exe` reports `1.0.41`, package `37.0.1-15733141`; `adb` was not on the default PATH |
| Node | `v24.19.0` at the resolved path above after the process-local PATH prefix |
| Windows long-path policy | `HKLM\SYSTEM\CurrentControlSet\Control\FileSystem\LongPathsEnabled = 0` |
| C: free space | 532,409,626,624 bytes (495.85 GiB) during inventory |

Only named toolchain paths and versions, disk space, and long-path policy were queried; no environment dump or credentials were read. The selected Android build-tools version is an unresolved inventory item, rather than an assumed choice between the two installed versions.

## Prior failure signature

Task 25 archived implementation `02fd96a` at `%TEMP%\strandcue-task25-02fd96a`, generated native files under `apps\mobile\android`, and supplied `node_modules` through a junction to this remediation worktree. Its offline `:app:assembleRelease` attempt lasted **6m 12s** and exited 1. In the retained Gradle log, the first task marked failed is `:expo-modules-core:buildCMakeRelWithDebInfo[arm64-v8a]` (line 866); `:react-native-reanimated:buildCMakeRelWithDebInfo[arm64-v8a][reanimated]` follows (line 1055). The reported native error is `ninja: error: manifest 'build.ninja' still dirty after 100 tries`. Task 25 also reported CMake long-object-path warnings. This record quotes only those checked signature lines and the Task 25 report, not the complete build logs.

Measured absolute path prefixes on this host:

| Path | Characters |
| --- | ---: |
| Remediation worktree root `C:\Users\ABADO\Desktop\StrandCue\.worktrees\security-audit-remediation` | 70 |
| Worktree `node_modules` (prior junction target) | 83 |
| Prior scratch root `C:\Users\ABADO\AppData\Local\Temp\strandcue-task25-02fd96a` | 58 |
| Prior scratch `apps\mobile\android` | 78 |
| Prior scratch `apps\mobile\android\app` | 82 |

The 71-character scratch `node_modules` path was a junction to the 83-character worktree `node_modules` path. These are measured prefixes, not a measured maximum object-file path.

## Bounded hypothesis

Primary hypothesis: long generated/native dependency paths on Windows caused CMake/Ninja manifest churn. The CMake path warnings, nested generated build, and junction to the longer dependency path make this plausible, but the baseline does not prove causation.

Competing hypotheses for a later controlled test: incompatible CMake/Ninja/NDK versions; stale native cache from a prior generated build; insufficient disk space or permissions. The observed 495.85 GiB of free space weakens a simple disk-exhaustion explanation, but permission state and the actual failure mechanism remain untested. Change one variable per reproduction and compare the first failing task and Ninja signature before claiming a root cause.
