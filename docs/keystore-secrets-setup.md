# Keystore Generation & Secrets Setup Guide

## Overview
For Expo EAS Build to create signed AABs for Google Play, you need a **release keystore** and configured secrets in GitHub/Expo.

---

## 1. Generate Release Keystore

### Option A: Generate New Keystore (Recommended for Production)
```bash
# Generate a new keystore
keytool -genkey -v \
  -keystore strandcue-release.keystore \
  -alias strandcue-release \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -storepass <keystore-password> \
  -keypass <key-password> \
  -dname "CN=StrandCue, OU=Engineering, O=StrandCue, L=Cape Town, ST=Western Cape, C=ZA"
```

### Option B: Use Existing Keystore
If you already have a keystore, skip generation and use the existing file.

---

## 2. Configure EAS Credentials

### Option A: Automated (Recommended)
```bash
cd apps/mobile

# Login to Expo
eas login

# Configure Android credentials (interactive)
eas credentials:android:keystore
```

This will:
1. Upload keystore to Expo's secure credential storage
2. Configure build profiles to use remote credentials
3. Store credentials securely in Expo's infrastructure

### Option B: Manual (via eas.json)
The `eas.json` already has `"credentialsSource": "remote"` which tells EAS Build to use credentials stored in Expo's cloud.

---

## 3. GitHub Secrets Configuration

Add these secrets in GitHub Repository Settings → Secrets and variables → Actions:

### Required Secrets

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `EXPO_TOKEN` | `expo_xxxxxxxx` | Personal access token from `expo login` → `expo whoami` |
| `ANDROID_KEYSTORE_BASE64` | `base64 encoded keystore` | `base64 -i strandcue-release.keystore \| tr -d '\n'` |
| `ANDROID_KEYSTORE_PASSWORD` | `your_keystore_password` | Keystore store password |
| `ANDROID_KEY_ALIAS` | `strandcue-release` | Key alias from keystore generation |
| `ANDROID_KEY_PASSWORD` | `your_key_password` | Key password (often same as keystore) |
| `PLAY_SERVICE_ACCOUNT_JSON` | Service account JSON | Google Play Console service account for `eas submit` |
| `PLAY_SERVICE_ACCOUNT_JSON` | Service account JSON | Google Play Console service account for `eas submit` |

### How to Generate Base64 Keystore
```bash
# macOS/Linux
base64 -i strandcue-release.keystore | tr -d '\n'

# Windows PowerShell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("strandcue-release.keystore"))
```

---

## 4. Google Play Console Setup

### Create Service Account for `eas submit`
1. Go to [Google Play Console](https://play.google.com/console)
2. Go to **Setup → API access**
3. Create service account with **Release Manager** role
4. Download JSON key file
5. Add JSON content as `PLAY_SERVICE_ACCOUNT_JSON` secret

### Configure Play Console
1. Create app in Play Console (if not exists)
2. Go to **Release → Testing → Internal testing**
3. Enable **Internal testing** track
3. Add testers (emails)
4. Configure **App Signing** → **Play App Signing** (recommended)

---

## 5. Local Development Commands

```bash
cd apps/mobile

# Login to Expo
eas login

# Configure credentials (interactive)
eas credentials:android:keystore

# Build commands
npm run build:android:debug      # Development APK
npm run build:android:preview    # Preview APK
npm run build:android:release    # Release AAB
npm run build:android:play-internal  # Play Internal AAB

# Submit to Play Internal
npm run submit:android:internal
```

---

## 6. GitHub Secrets Setup Checklist

- [ ] `EXPO_TOKEN` - From `expo whoami` after `eas login`
- [ ] `ANDROID_KEYSTORE_BASE64` - Base64 encoded keystore
- [ ] `ANDROID_KEYSTORE_PASSWORD` - Keystore password
- [ ] `ANDROID_KEY_ALIAS` - Key alias (e.g., `strandcue-release`)
- [ ] `ANDROID_KEY_PASSWORD` - Key password
- [ ] `PLAY_SERVICE_ACCOUNT_JSON` - Service account JSON for Play Console

---

## 6. Verification Steps

1. **Test local build:**
   ```bash
   cd apps/mobile
   eas build --platform android --profile preview
   ```

2. **Test internal build:**
   ```bash
   eas build --platform android --profile playInternal
   ```

3. **Submit to Play Internal:**
   ```bash
   eas submit --platform android --profile production
   ```

4. **Verify in Play Console:**
   - Go to Play Console → Internal Testing
   - Verify build appears
   - Add testers and verify install

---

## 7. Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| `EXPO_TOKEN` invalid | Run `eas login` again, get new token |
| Keystore password wrong | Verify passwords match keystore generation |
| Build fails with signing error | Verify keystore uploaded to Expo credentials |
| `eas submit` fails | Verify Play service account has Release Manager role |
| Build times out | Increase `timeout-minutes` in workflow |

### Useful Commands
```bash
# Check EAS build status
eas build:list --platform android

# View build logs
eas build:view <build-id>

# Check credentials
eas credentials:android:keystore

# Clear credentials cache
eas credentials:clear
```

---

## Security Notes

- ✅ Keystore stored in Expo's encrypted credential storage (not in repo)
- ✅ GitHub secrets encrypted at rest
- ✅ Keystore base64 only in secrets, not in code
- ⚠️ Never commit keystore files to git
- ⚠️ Rotate EXPO_TOKEN periodically
- ⚠️ Use different keystores for dev/staging/prod if needed