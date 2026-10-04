# Developer setup and verification

Run the [README](../../README.md) setup from the repository root with Node 24.x and `npm ci`. Docker Desktop must run Linux containers. `npx supabase start` can download container images and therefore needs network access on first use. `npx supabase db reset --local` replays every active migration and destroys local data; never use remote reset flags as part of onboarding. No hosted project or Supabase login is needed for local work.

## Browser and Android connectivity

Use `npm run web --workspace @strandcue/mobile -- --host localhost` and open `http://127.0.0.1:8081`, matching `supabase/config.toml`. Web sessions use preview storage and are not proof of native persistence or recovery handling. Supabase's local email inbox is `http://127.0.0.1:54324`; confirm synthetic accounts there.

For an Android emulator, the host API is normally `http://10.0.2.2:54321`. For a USB-connected physical device, `adb reverse tcp:54321 tcp:54321` lets the app use `http://127.0.0.1:54321`. Confirm `adb devices` lists the intended device. For a LAN device, use the development machine's LAN IP and restrict firewall access to the trusted network. Never expose a development database to the internet. Update the public API URL in `.env` for the chosen target and rebuild when using a packaged app: Expo public variables are embedded at build time.

`npm run mobile` starts Metro. Expo Go can provide a limited preview when its installed SDK matches the repository; custom `strandcue://` recovery callbacks and native acceptance require an installed app with package `za.co.strandcue.app`. The EAS preview profile produces an installable APK; its `build:android:preview` script requires EAS CLI, an authenticated Expo account, and a separately authorized cloud build. It is not a prerequisite for local browser setup. The development profile requests a development client; verify its dependencies before relying on that profile. Do not assume Metro alone produces an APK.

Native directories are generated from `apps/mobile/app.json` and Expo plugins rather than checked in. Do not hand-edit generated native files as the lasting source of a change. Local Android building requires a compatible Java/Android SDK toolchain and validation separate from the JavaScript checks.

## Live API verification

Default `npm test` runs embedded database tests and skips live API checks. To enable the local API suite in PowerShell, use keys from `npx supabase status` and a disposable local database:

```powershell
$env:STRANDCUE_SUPABASE_API_TEST = '1'
$env:STRANDCUE_SUPABASE_URL = 'http://127.0.0.1:54321'
$env:STRANDCUE_SUPABASE_PUBLISHABLE_KEY = '<local public key>'
$env:STRANDCUE_SUPABASE_SECRET_KEY = '<local secret/service-role key>'
npm test -- tests/database/supabase-api.test.ts
Remove-Item Env:STRANDCUE_SUPABASE_API_TEST, Env:STRANDCUE_SUPABASE_URL, Env:STRANDCUE_SUPABASE_PUBLISHABLE_KEY, Env:STRANDCUE_SUPABASE_SECRET_KEY
```

The secret is exclusively for this Node test process; never place it in the mobile `.env`, commit it, or paste it into evidence. Inspect test output and skipped counts; a successful default suite does not establish live API isolation.

## Native and release gates

After installing a test build, follow [the Maestro device runbook](maestro-device.md) and [the device acceptance matrix](../milestone7-device-matrix.md). The first two Maestro flows cover launch/validation and recovery navigation without submitting network requests. Signed-in flows need a configured backend and synthetic test account. Record device, build, backend, and outcomes for each run.

Cold/warm email recovery, HTTPS app-link verification, secure session persistence/revocation, export/deletion, cross-user API isolation, accessibility, and backup restoration need their own evidence. See [app links](assetlinks.md) and [backup restoration](backup-restore-rehearsal.md). Local tests and archived historical PASS entries do not certify current hosted settings or signed builds.

## Troubleshooting

- Runtime errors: check `node --version` is 24.x; reinstall using `npm ci`, not a lockfile-rewriting install.
- Port/container failures: inspect `npx supabase status` and Docker Desktop. Multiple worktrees use the same configured Supabase project ID and ports; coordinate rather than resetting another developer's database.
- Missing confirmation emails: inspect the local inbox and email confirmation/rate-limit settings. Local emails are captured, not delivered externally.
- Callback failures: check the exact configured redirect and that the target app can open it. A browser smoke check does not prove Android recovery.
- Missing environment: copy the example only when `.env` is absent, fill both public variables, and restart Metro. Never resolve an authorization error by substituting a service-role key.
