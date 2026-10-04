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
