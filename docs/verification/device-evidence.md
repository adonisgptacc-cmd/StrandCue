# Device evidence log

## Build 1 — preview APK (2026-09-24)

- EAS build ID: 693da61b-e2e0-4ecf-8e51-7051cf8306ff
- Dashboard: https://expo.dev/accounts/bush85/projects/strandcue/builds/693da61b-e2e0-4ecf-8e51-7051cf8306ff
- Artifact: https://expo.dev/artifacts/eas/4b148I6WahuRMyOeS7sFamwy9QkxTzRsLmU-WlQpvr4.apk
- Profile: preview (APK, internal distribution)
- ApplicationId: za.co.strandcue.app
- Artifact SHA-256: ddfbede65f1fb0d077f3f8344e31e978af96393f2a8dd1dae85ac9c386df9453
- Expo SDK: 57 · version: 0.1.0

## Build 3 — preview APK (2026-09-24)

- Build ID: 2a52b54e-bca8-4372-922f-9f707b0b52e3, profile preview, ApplicationId za.co.strandcue.app
- EAS build ID: 2a52b54e-bca8-4372-922f-9f707b0b52e3
- Profile: preview (APK, internal distribution)
- ApplicationId: za.co.strandcue.app
- Artifact SHA-256: 03ec01e795a43709167a9dcd05714c508abe344bb6d5178332baaa2ce4f7740f — user-provided, 64-hex shape-valid; add the note "(user-provided; independently hash-verified for build 2 only)"

## Install 1 (2026-09-24)

- Installed on: Android emulator (model/API unrecorded)
- First launch: signup screen visible ("Begin your hair record"); old "Connect your development environment" warning ABSENT (EAS secrets present)
- Signup screen visible: yes ("Begin your hair record")
- Crashes on launch: none observed
- Screenshot: launch-01.png (local only)
- Finding: signup/signin attempt on device fails with "Your session could not be verified. Check your connection and try again." — backend auth config verified healthy separately (signup enabled, Resend SMTP set); prime suspect is EAS secret VALUES. Record as open finding, do not diagnose further.

## Finding update — signup-blocked RESOLVED / CLOSED (2026-09-24, human-verified)

- Prior open finding ("signup-blocked → EAS secret values suspect") is CLOSED as disproven.
- EAS secret VALUES are EXONERATED: a signup API call from build 3 reached Supabase and produced a real confirmation email.
- Signup never failed on network: the message seen was the client-side validation ("Confirm you are 18 or older and use a password with at least 12 characters") — 18+ box unchecked or short password. App behaved correctly (validation-behaved-correctly).
- Link-placement rule: confirmation/recovery links MUST be opened on the device — they use the custom scheme strandcue://auth/callback, which desktop browsers cannot resolve ("could not connect to the server" on desktop is expected, not a bug). This is the known Plan D motivation.
- Remaining open item: complete one full signup → confirm-on-device → signin loop on the emulator (human).

## Build 4

- EAS build ID: 7f3df1d3-6784-4718-86b8-c1c002a6d3e2, profile preview, ApplicationId za.co.strandcue.app
- Artifact: https://expo.dev/artifacts/eas/Xx5DBVELcZ2xeT1O4QQnohGFg7Y-eytMd9FSzkP81CY.apk
- APK SHA-256: 9503BBB5FE2321D305514F7A7997B849B1AD080FD2C14088C8407BBC4543C3D2 (controller-hashed from downloaded file)

## Install 4 — launch

- Installed on: Android emulator (emulator-5554). Launch OK.
- Observed via screenshots: authenticated Passport screen ("Your Hair Passport"), Activities tab loading production data, Settings screen signed in as @mark.
- Username screen NOT visually verified: a mis-tap signed the test account out of the device; no credentials on hand to re-enter. Both submit flows (normal + duplicate) pending with the account owner. Account data safe in production.

## Build 5 — export-delivery launch candidate (2026-10-10)

- Source commit: `7a08f31084079aca5c17e4ab01c28a26a4e6907a`.
- EAS preview build `44f614e1-0e3b-4859-a578-ee0d0dd46b02` completed successfully, but its remote preview signer is not the local release signer. It is retained as a test artifact and is not the locally distributed launch candidate.
- The accepted local release rebuild completed 544 Gradle tasks with Expo FileSystem and Expo Sharing linked natively.
- Package: `za.co.strandcue.app`; version `0.1.0`/code 1; min SDK 24; target SDK 36; ARM64 only.
- APK signature: v2; signer SHA-256 `F9:C2:31:91:03:C5:9B:DB:31:15:48:F4:F1:B7:DE:AC:F7:77:46:29:36:F2:D7:1A:F0:DA:28:57:39:0C:2D:60`, matching the live App Links association.
- APK: `%LOCALAPPDATA%\StrandCue\releases\StrandCue-0.1.0-launch-candidate-arm64-v8a.apk`; SHA-256 `9D13FCD60535AEB6FAE337A86121F9E5EF9C87198FF0818E048B9483B10F9FA6`; size 41,729,601 bytes.
- AAB: `%LOCALAPPDATA%\StrandCue\releases\StrandCue-0.1.0-launch-candidate-arm64-v8a.aab`; SHA-256 `045290055C33F2CE4C74582161E72203721A3FA10FCC1FB2966FBE3DC72F0E62`; size 30,996,817 bytes; `jarsigner -verify` exit 0.
- `npm run check:release-links` passed against the matching live certificate.
- Physical ARM64 installation and the signup, confirmation, recovery, offline, export share/save, deletion, and accessibility journeys remain pending.
