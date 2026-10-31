# Milestone 7 — Android Device Matrix & Test Configuration

**Date:** 2026-09-19
**Status:** Draft
**Owner:** DevOps / QA

---

## 1. Target Device Matrix

### Primary Target (South African Mid-Range)
| Spec | Requirement |
|------|-------------|
| **Model** | Samsung Galaxy A34 / A54 or equivalent |
| **OS** | Android 13 (API 33) / Android 14 (API 34) |
| **RAM** | 6 GB / 8 GB |
| **Storage** | 128 GB |
| **Screen** | 6.4" - 6.6", 1080x2340, 48dp min touch target |
| **Network** | 4G/LTE, 3G fallback, poor-signal simulation |
| **Locale** | en-ZA, Africa/Johannesburg timezone |

### Secondary / Emulator Targets
| Target | Purpose |
|--------|---------|
| **Pixel 7 (API 34)** | Latest Android, reference device |
| **Pixel 6a (API 33)** | Previous gen, API 33 baseline |
| **Samsung Galaxy A14 (API 33)** | Low-end (4GB RAM, entry storage) |
| **Emulator: Medium Phone (API 34)** | CI/CD automated testing |
| **Emulator: Foldable (API 34)** | Layout edge cases |

### Excluded
- iOS (out of scope Phase 1)
- Android < 13 (API < 33)
- Devices without Google Play Services

---

## 2. Build Variants & Signing

### Build Types
| Variant | Purpose | Signing |
|---------|---------|---------|
| `debug` | Development, USB debugging | Debug keystore |
| `release` | Internal QA, internal testing | Release keystore (keystore.jks) |
| `playInternal` | Google Play Internal Testing | Play App Signing (upload key) |

### Signing Configuration (Gradle)
```gradle
// android/app/build.gradle
signingConfigs {
    release {
        storeFile file(System.getenv('KEYSTORE_PATH'))
        storePassword System.getenv('KEYSTORE_PASSWORD')
        keyAlias System.getenv('KEY_ALIAS')
        keyPassword System.getenv('KEY_PASSWORD')
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled true
        proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
    }
    playInternal {
        initWith release
        matchingFallbacks = ['release']
    }
}
```

### Secrets Management
| Secret | GitHub Secret Name | Source |
|--------|-------------------|--------|
| Keystore file (base64) | `ANDROID_KEYSTORE_BASE64` | 1Password / Vault |
| Keystore password | `ANDROID_KEYSTORE_PASSWORD` | 1Password / Vault |
| Key alias | `ANDROID_KEY_ALIAS` | 1Password / Vault |
| Key password | `ANDROID_KEY_PASSWORD` | 1Password / Vault |
| Play Console service account JSON | `PLAY_SERVICE_ACCOUNT_JSON` | 1Password / Vault |

---

## 3. CI/CD Pipeline (GitHub Actions)

### Workflow Triggers
```yaml
# .github/workflows/android-build.yml
on:
  push:
    branches: [main, develop]
    tags: ['v*']
  pull_request:
    branches: [main]
  workflow_dispatch:
    inputs:
      build_type:
        description: 'Build variant'
        required: true
        default: 'release'
        type: choice
        options:
          - debug
          - release
          - playInternal
```

### Jobs
| Job | Runs On | Steps |
|-----|---------|-------|
| `lint-typecheck` | `ubuntu-latest` | `npm run typecheck`, `npm run lint` |
| `test` | `ubuntu-latest` | `npm test`, `npm run test:android` |
| `build-android` | `ubuntu-latest` | Setup JDK 17, Setup Android SDK, Decode keystore, `./gradlew assemble${BUILD_TYPE}` |
| `upload-artifacts` | `ubuntu-latest` | Upload AAB/APK to GitHub Artifacts |
| `deploy-play-internal` | `ubuntu-latest` | `fastlane supply` (if `playInternal`) |

### Fastlane Configuration
```ruby
# fastlane/Fastfile
lane :internal do
  upload_to_play_store(
    track: 'internal',
    aab: '../build/app/outputs/bundle/playInternal/release/app-playInternal-release.aab',
    json_key_data: ENV['PLAY_SERVICE_ACCOUNT_JSON'],
    skip_upload_metadata: true,
    skip_upload_images: true,
    skip_upload_screenshots: true,
  )
end
```

---

## 4. Test Matrix Coverage

| P1-AC Case | Test Scenario | Device | Automation |
|------------|---------------|--------|------------|
| P1-AC-01 | Signup, confirmation, resume | Primary + Emulator | Manual + Espresso |
| P1-AC-02 | Username change (30-day) | Primary | Manual |
| P1-AC-03 | Email/password change | Primary | Manual + Espresso |
| P1-AC-05 | Shelf CRUD | Primary + Emulator | Espresso |
| P1-AC-08 | Smoothing services distinct | Primary | Espresso |
| P1-AC-09 | Corrections/observations | Primary | Espresso |
| P1-AC-10 | Shelf provenance | Primary | Espresso |
| P1-AC-11 | Matching workflow | Primary | Manual |
| P1-AC-12 | Reformulation no rewrite | Primary | Espresso |
| P1-AC-13 | Manual records private | Primary + Secondary | Espresso |
| P1-AC-14 | Activity logging | Primary + Emulator | Espresso |
| P1-AC-15 | Heat events | Primary | Espresso |
| P1-AC-16 | Corrections/voids | Primary | Espresso |
| P1-AC-17 | Idempotency / drafts | Primary + Secondary | Espresso |
| P1-AC-18 | Settings journeys | Primary | Manual |
| P1-AC-19 | Export download | Primary | Manual |
| P1-AC-20 | Account deletion | Primary | Manual |
| P1-AC-21 | Analytics consent | Primary | Manual |
| P1-AC-23 | Activity correction/void | Primary | Espresso |
| P1-AC-25 | Backup/restore | Emulator | Script |

---

## 5. Accessibility & Performance Targets

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Cold start** | < 2.5s | Android Vitals / `adb shell am start -W` |
| **Warm start** | < 1s | Same |
| **Scroll performance** | 60fps | `adb shell dumpsys gfxinfo` |
| **Touch target** | ≥ 48dp | Manual + Accessibility Scanner |
| **Contrast ratio** | ≥ 4.5:1 | Accessibility Scanner |
| **TalkBack** | All screens navigable | TalkBack enabled |
| **Large text** | Scales to 200% | System font size max |
| **Network timeout** | < 10s retry | Charles Proxy / Network Link Conditioner |

---

## 6. Google Play Internal Testing Setup

### Play Console Configuration
1. Create app in Play Console (if not exists)
2. Configure **Internal Testing** track
2. Add testers (emails from team + QA)
3. Configure **App Signing** → **Play App Signing**
4. Upload initial AAB via Fastlane

### Release Checklist
- [ ] `versionCode` incremented
- [ ] `versionName` updated (semver)
- [ ] Changelog updated (`CHANGELOG.md`)
- [ ] Signed AAB uploaded to Internal Testing
- [ ] Testers notified via Play Console email
- [ ] Screenshots/logs collected (no secrets)

---

## 7. Device Lab Setup (Local)

### Physical Devices
| Device | Serial | Location | Owner |
|--------|--------|----------|-------|
| Samsung Galaxy A54 | `R5CR30XXXX` | Desk 1 | QA Lead |
| Samsung Galaxy A34 | `R5CR40XXXX` | Desk 2 | Dev 1 |
| Pixel 7 | `G2ZP3XXXX` | Desk 3 | Dev 2 |

### ADB Commands for Testing
```bash
# Install debug build
adb install -r app-debug.apk

# Install release build (requires signature match)
adb install -r app-release.apk

# Clear app data
adb shell pm clear com.strandcue

# Logcat filter
adb logcat -s StrandCue:* *:S

# Performance trace
adb shell perfetto -c - -o trace.perfetto-trace << 'EOF'
duration_ms: 10000
buffers: { size_kb: 65536 }
data_sources: { config { name: "android.systrace" } }
EOF
```

---

## 8. Status Tracker

| Component | Status | Owner | Notes |
|-----------|--------|-------|-------|
| Device matrix doc | ✅ Done | DevOps | This file |
| Keystore configured | ⬜ Pending | DevOps | Need base64 keystore in secrets |
| GitHub Actions workflow | ⬜ Pending | DevOps | `.github/workflows/android-build.yml` |
| Fastlane configured | ⬜ Pending | DevOps | `fastlane/` directory |
| Play Console internal track | ⬜ Pending | DevOps | Need Play Console access |
| Physical devices procured | ✅ Done | QA | A54, A34, Pixel 7 |
| Emulator configs | ✅ Done | DevOps | API 33, 34 |
| Test scripts written | ⬜ Pending | QA | Espresso + Manual |
| Accessibility audit | ⬜ Pending | QA | TalkBack, large text |
| Performance baseline | ⬜ Pending | Dev | Need signed build |

---

## 9. Next Actions

| Priority | Action | Owner | Due |
|----------|--------|-------|-----|
| P0 | Add keystore secrets to GitHub | DevOps | Day 1 |
| P0 | Create GitHub Actions workflow | DevOps | Day 1 |
| P1 | Configure Fastlane + Play Console | DevOps | Day 2 |
| P1 | Write Espresso test scaffolding | QA | Day 2 |
| P2 | Profile performance on A54 | Dev | Day 3 |
| P2 | Run first internal test build | DevOps | Day 3 |
| P3 | Accessibility audit | QA | Day 4 |
| P3 | Submit first internal test | DevOps | Day 5 |
