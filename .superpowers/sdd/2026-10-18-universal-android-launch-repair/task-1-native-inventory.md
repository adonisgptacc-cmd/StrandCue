# Task 1 native inventory receipt

Inspection of `C:\scb\artifacts\strandcue-d8c2818-arm64-alpha-signed.apk` on 2026-10-18 used the Android NDK 27.1.12297006 `llvm-readelf.exe` with `-h -d` against each DSO in the ZIP entry prefix `lib/arm64-v8a/`. The APK was opened read-only; extracted inspection copies were placed in a temporary directory.

The archive contains 22 ARM64 shared libraries. Every inspected ELF header reports `Machine: AArch64`. The expected `libreactnative.so` is present, alongside `libc++_shared.so`.

| ARM64 DSO | Direct `DT_NEEDED` entries |
| --- | --- |
| `libandroidx.graphics.path.so` | `libm.so`, `libdl.so`, `libc.so` |
| `libappmodules.so` | `libreact_codegen_rngesturehandler_codegen.so`, `libreact_codegen_safeareacontext.so`, `libreact_codegen_rnscreens.so`, `libfbjni.so`, `libjsi.so`, `libreactnative.so`, `libm.so`, `libc++_shared.so`, `libdl.so`, `libc.so` |
| `libc++_shared.so` | `libc.so`, `libm.so`, `libdl.so` |
| `libexpo-modules-core.so` | `liblog.so`, `libandroid.so`, `libworklets.so`, `libjsi.so`, `libfbjni.so`, `libreactnative.so`, `libm.so`, `libc++_shared.so`, `libdl.so`, `libc.so` |
| `libfbjni.so` | `libandroid.so`, `liblog.so`, `libm.so`, `libc++_shared.so`, `libdl.so`, `libc.so` |
| `libgesturehandler.so` | `libreactnative.so`, `libjsi.so`, `libfbjni.so`, `libworklets.so`, `libm.so`, `libc++_shared.so`, `libdl.so`, `libc.so` |
| `libgifimage.so` | `libjnigraphics.so`, `liblog.so`, `libdl.so`, `libandroid.so`, `libc.so`, `libm.so` |
| `libhermestooling.so` | `libreactnative.so`, `libjsi.so`, `libhermesvm.so`, `libandroid.so`, `libfbjni.so`, `liblog.so`, `libm.so`, `libc++_shared.so`, `libdl.so`, `libc.so` |
| `libhermesvm.so` | `liblog.so`, `libjsi.so`, `libfbjni.so`, `libm.so`, `libc++_shared.so`, `libdl.so`, `libc.so` |
| `libimagepipeline.so` | `liblog.so`, `libjnigraphics.so`, `libc.so`, `libm.so`, `libdl.so` |
| `libjsi.so` | `libm.so`, `libc++_shared.so`, `libdl.so`, `libc.so` |
| `libnative-filters.so` | `liblog.so`, `libjnigraphics.so`, `libc.so`, `libm.so`, `libdl.so` |
| `libnative-imagetranscoder.so` | `liblog.so`, `libc.so`, `libm.so`, `libdl.so` |
| `libreact_codegen_rngesturehandler_codegen.so` | `libfbjni.so`, `libjsi.so`, `libreactnative.so`, `libm.so`, `libc++_shared.so`, `libdl.so`, `libc.so` |
| `libreact_codegen_rnscreens.so` | `libreactnative.so`, `libjsi.so`, `libfbjni.so`, `libm.so`, `libc++_shared.so`, `libdl.so`, `libc.so` |
| `libreact_codegen_safeareacontext.so` | `libfbjni.so`, `libjsi.so`, `libreactnative.so`, `libm.so`, `libc++_shared.so`, `libdl.so`, `libc.so` |
| `libreactnative.so` | `libandroid.so`, `libfbjni.so`, `libjsi.so`, `liblog.so`, `libm.so`, `libc++_shared.so`, `libdl.so`, `libc.so` |
| `libreanimated.so` | `liblog.so`, `libreactnative.so`, `libjsi.so`, `libfbjni.so`, `libandroid.so`, `libworklets.so`, `libm.so`, `libc++_shared.so`, `libdl.so`, `libc.so` |
| `librnscreens.so` | `libreactnative.so`, `libjsi.so`, `libfbjni.so`, `libandroid.so`, `libm.so`, `libc++_shared.so`, `libdl.so`, `libc.so` |
| `libstatic-webp.so` | `liblog.so`, `libjnigraphics.so`, `libz.so`, `libdl.so`, `libc.so`, `libm.so` |
| `libworklets.so` | `libandroid.so`, `liblog.so`, `libreactnative.so`, `libjsi.so`, `libfbjni.so`, `libhermesvm.so`, `libm.so`, `libc++_shared.so`, `libdl.so`, `libc.so` |
| `libzstd-kmp.so` | `libm.so`, `libdl.so`, `libc.so` |

Every non-platform `DT_NEEDED` name resolves to another DSO in this 22-library ARM64 inventory. The platform dependency set is `libandroid.so`, `libc.so`, `libdl.so`, `libjnigraphics.so`, `liblog.so`, `libm.so`, and `libz.so`; no unresolved shared-library dependency was observed. This confirms the inspected ARM64 APK contains `libreactnative.so`, so the earlier emulator error does not show that this ARM64 artifact universally lacks it.
